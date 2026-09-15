#!/usr/bin/env bash
# Hook → activity-feed appender. Wired in .claude/settings.json on the
# SubagentStart / SubagentStop events so Claude Code SUBAGENTS show up in the
# unified feed (logs/agent-activity.log) the same way Codex does — closing the
# "38-min black hole" where an Agent-tool subagent ran invisibly (a subagent has
# no separate transcript for scripts/agent-activity.sh's claude_feed() to tail).
#
# Reads the hook payload JSON on stdin. Emits ONE line:
#   HH:MM:SS [<label> - Claude Code] <event>: <summary>
# matching the feed's existing "[Persona - Backing Agent] …" format.
#
# Self-rotating (the founder's "delete older entries" requirement): after each
# append, if the log exceeds MAX_FEED_LINES it is trimmed IN PLACE to the last
# KEEP_FEED_LINES (truncate-and-rewrite preserves the inode so a concurrent
# `tee -a` from agent-activity.sh keeps writing to the same file). Tunable via
# env: AGENT_FEED_MAX_LINES / AGENT_FEED_KEEP_LINES (see scripts/lib/feed.sh).
#
# Defensive by design: a hook must NEVER fail the tool call. Every branch falls
# back to a best-effort line and exits 0. No jq → degrades to the raw event name.
set -u
# `pipefail` is a bash-ism, NOT POSIX, and it is requested here rather than set
# outright because this file is the one script in scripts/ that is deliberately
# also run by a plain `sh` (see the roster-lookup note below, and tests #5/#6).
# A `sh` without pipefail does not ignore the option — it errors and EXITS 2,
# taking the hook down on line 20, before a single defensive branch can run. The
# most defensive script in the repo was killed by its own first statement.
#
# It survived every developer machine and failed on every CI runner, which is
# the whole lesson: this machine's dash 0.5.12 accepts `pipefail`, the runner's
# does not, and the local shell being *called* dash is not evidence that it
# behaves like the runner's. BUG-031.
#
# The subshell is what makes the probe safe: an unsupported option kills the
# subshell, not this script.
# shellcheck disable=SC3040
if ( set -o pipefail ) 2>/dev/null; then set -o pipefail; fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

# BUG-006 — this file had its own copy of "append, then rotate", keyed on an
# `LWA_FEED_*` env namespace. Both were defects:
#
#   * `LWA_` is one project's initials baked into a MANAGED file that ships to
#     every project — BUG-002's contamination in env-var form. A derived project
#     inherited knobs named after somebody else's repo.
#   * The rotation was a second implementation of what scripts/lib/feed.sh now
#     owns, and the inode-preserving trim is exactly the kind of detail two
#     copies drift on. A `mv`-based rotate here would orphan the feed
#     supervisor's open handle while the other copy stayed correct.
#
# One appender, generic names. AGENT_FEED_MAX_LINES / AGENT_FEED_KEEP_LINES are
# honoured by feed.sh. No back-compat alias for the old names: keeping one would
# preserve the exact string this bug is about in a file that ships everywhere,
# and these were undocumented knobs whose defaults are unchanged — a project
# that never set them sees no difference.
# shellcheck source=scripts/lib/feed.sh
BP_CODE_ROOT="$repo_root"
. "$repo_root/scripts/lib/state-dir.sh"
BP_STATE_ROOT="$(bp_state_root)" || exit 0
. "$repo_root/scripts/lib/feed.sh"

# BUG-027 — the persona is resolved through the ONE roster parser, shared with
# scripts/agent-activity.sh. Sourced only if readable: a hook must never fail the
# tool call it observes, so a tree without the lib loses the persona name and
# keeps the line.
# NOT SOURCED HERE. Sourcing runs the lib in THIS shell, so an `exit` anywhere in
# it — today, or after some future edit — takes the hook down with it, and a hook
# that dies fails the tool call it was only supposed to observe. the cross-provider review caught
# that: absent, unreadable and non-zero-return all degraded safely, and a bare
# `exit` did not.
#
# The lookup is done in a SUBSHELL at the point of use instead (see below), so
# the lib cannot reach this process at all. Costs one fork per dispatch bookend,
# twice per subagent, which is nothing against the risk of breaking dispatch to
# improve logging.
ROSTER_LIB="$repo_root/scripts/lib/roster.sh"

: "${AGENT_FEED_MAX_LINES:=4000}"
: "${AGENT_FEED_KEEP_LINES:=2000}"
export AGENT_FEED_MAX_LINES AGENT_FEED_KEEP_LINES

payload="$(cat 2>/dev/null || true)"

extract() { # extract <jq-filter> — empty string if jq missing / no match
  command -v jq >/dev/null 2>&1 || { printf ''; return; }
  printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null | head -1
}

event="$(extract '.hook_event_name')"; [ -n "$event" ] || event="Subagent"
# Best-effort summary across the fields different events expose. The Agent
# tool's description is the most useful; fall back through plausible keys.
summary="$(extract '.agent_description // .description // .prompt // .last_message // .reason')"
summary="$(printf '%s' "$summary" | tr -d '\n' | cut -c1-110)"

# Label from the subagent's META FILE, through bp_roster_subagent_label — the
# function agent-activity.sh labels the streamed lines with — else the agent
# type, else env, else generic.
#
# BUG-124. No hook payload names the persona. SubagentStart and SubagentStop
# carry agent_id, agent_type and the SESSION's transcript_path, plus
# agent_transcript_path on stop (recorded from a live dispatch, 2026-09-15). The
# dispatch description is only in agent-<id>.meta.json beside the transcript.
# BUG-027 read `.description` from the payload instead, which no real payload
# has, so every bookend fell back to the agent type while the lines between the
# bookends read the persona.
aid="$(extract '.agent_id')"
atype="$(extract '.agent_type // .subagent_type')"
meta="$(extract '.agent_transcript_path')"
if [ -n "$meta" ]; then
  meta="${meta%.jsonl}.meta.json"
else
  tp="$(extract '.transcript_path')"
  if [ -n "$tp" ] && [ -n "$aid" ]; then meta="${tp%.jsonl}/subagents/agent-$aid.meta.json"; fi
fi

tcmd=""
if [ -r "$ROSTER_LIB" ] && [ -n "$meta" ]; then
  # The subshell is one guard and the timeout is the other; neither is style.
  #
  # The subshell keeps an `exit` inside the lib out of THIS process. It does not
  # keep a HANG out: the reviewer replaced the lib with an infinite loop and the hook
  # returned rc=124 under an external 2s bound, having logged nothing and written
  # no map row. Every other broken-library mode already degraded correctly —
  # absent, unreadable, non-zero return, empty output, `exit`, `set -e` plus a
  # failure, and a syntax error. Only hanging escaped, and a hook that hangs is
  # worse than one that dies, because it stalls the tool call it was only there
  # to observe.
  #
  # `timeout` is NOT guaranteed present — macOS ships none in the base system,
  # which is why scripts/install-toolchain.sh pulls coreutils in for its
  # `gtimeout`. That question is
  # already answered once, by bp_staleness_timeout_cmd, so it is answered there
  # rather than a second time here. staleness.sh is itself read in a subshell,
  # for exactly the reason roster.sh is.
  #
  # NO PROVIDER → NO LOOKUP. Deliberate, and it is the trade the whole guard is
  # about: the label falls back to the agent type, which is legible and merely
  # unspecific, whereas an unbounded lookup can stall a dispatch indefinitely. A
  # wrong label is survivable; a hung tool call is not. It says so on stderr, not
  # in the feed — Claude Code surfaces hook stderr under --debug and discards it
  # otherwise, so the choice is discoverable without a line of noise per dispatch.
  #
  # `bash -c` rather than a bare subshell because `timeout` needs a process to
  # signal, and it is what the lib is written in: this hook is also invoked as
  # `sh`, and under dash the lib's parameter expansions are a syntax error, so
  # the lookup could never have resolved anything there.
  : "${BP_ROSTER_LOOKUP_TIMEOUT:=2}"
  tcmd="$(
    . "$repo_root/scripts/lib/staleness.sh" >/dev/null 2>&1 || exit 0
    bp_staleness_timeout_cmd 2>/dev/null || exit 0
  )"
  if [ -z "$tcmd" ]; then
    printf '[log-activity] no timeout(1)/gtimeout(1) available — skipping the roster lookup; labelling by agent type\n' >&2
  fi
fi

case "$event" in
  SubagentStart) marker="→ dispatched" ;;
  SubagentStop)  marker="← finished" ;;
  *)             marker="$event" ;;
esac

# feed_append supplies the timestamp and owns the rotation, so this line no
# longer computes either. A hook must NEVER fail the tool call it observes, and
# feed_append returns 0 on every path by design.
#
# No .subagent-map row any more (BUG-124). Its value would be derived from the
# same meta file the feed reads for the streamed lines, so it could only repeat
# that file, and for a name with a space it did not even do that.
emit_bookend(){
  label=""
  if [ -n "$tcmd" ]; then
    label="$("$tcmd" "$BP_ROSTER_LOOKUP_TIMEOUT" bash -c '
        . "$1" 2>/dev/null || exit 0
        bp_roster_subagent_label "$2" "$3" 2>/dev/null || exit 0
      ' bp-roster-lookup "$ROSTER_LIB" "$BP_STATE_ROOT" "$meta" 2>/dev/null)"
  fi
  feed_append "[${label:-${atype:-${AGENT_FEED_LABEL:-subagent}} - Claude Code}] $marker${summary:+: $summary}"
}

# THE START BOOKEND IS WRITTEN AFTER THIS HOOK RETURNS. Claude Code writes the
# meta file only once the SubagentStart hook has exited: measured absent across
# a 2 s poll from inside the hook, and present about 100 ms after it returned.
# Waiting in the hook therefore can never see it. So a detached child waits
# instead, bounded by BP_SUBAGENT_META_WAIT seconds, and labels by agent type if
# the meta never comes. All its descriptors are closed so the client is not held
# waiting on it. On stop the meta is already there, so the line is written
# directly.
: "${BP_SUBAGENT_META_WAIT:=5}"
if [ "$event" = SubagentStart ] && [ -n "$tcmd" ] && [ ! -e "$meta" ]; then
  (
    i=0
    while [ ! -e "$meta" ] && [ "$i" -lt $((BP_SUBAGENT_META_WAIT * 10)) ]; do
      sleep 0.1
      i=$((i + 1))
    done
    emit_bookend
  ) </dev/null >/dev/null 2>&1 &
else
  emit_bookend
fi
exit 0
