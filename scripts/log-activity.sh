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
set -uo pipefail

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
. "$repo_root/scripts/lib/feed.sh"

# BUG-027 — the persona is resolved through the ONE roster parser, shared with
# scripts/agent-activity.sh. Sourced only if readable: a hook must never fail the
# tool call it observes, so a tree without the lib loses the persona name and
# keeps the line.
# NOT SOURCED HERE. Sourcing runs the lib in THIS shell, so an `exit` anywhere in
# it — today, or after some future edit — takes the hook down with it, and a hook
# that dies fails the tool call it was only supposed to observe. Elias caught
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

# Label by the roster persona named in the DISPATCH TEXT, else the agent type,
# else env, else generic.
#
# BUG-027: this used to read `.subagent_type`, with a comment claiming it was
# the roster persona. It is the agent TYPE — `general-purpose` for every persona
# on this fleet — so every bookend line and every .subagent-map row carried the
# same string, and the map is what the live feed labels streamed subagent output
# from. The persona is in the description; bp_roster_name_in_text is the same
# lookup agent-activity.sh uses on the transcript's meta file, so the bookends
# and the streamed lines cannot disagree.
plabel="$(extract '.subagent_type // .agent_type // .agent_name')"
if [ -r "$ROSTER_LIB" ]; then
  # The subshell is the guard, not a style choice — see ROSTER_LIB above.
  persona="$(
    . "$ROSTER_LIB" 2>/dev/null || exit 0
    bp_roster_name_in_text "$repo_root" "$summary" 2>/dev/null || exit 0
  )"
  [ -n "${persona:-}" ] && plabel="$persona"
fi
label="${plabel:-${AGENT_FEED_LABEL:-subagent}}"
ts="$(date +%H:%M:%S)"

# Map this subagent's id → persona so the live feed (agent-activity.sh's
# subagent_feed) can label the STREAMED internal lines from
# <session>/subagents/agent-<agent_id>.jsonl with the persona name, not just
# bracket them with the dispatch/finish markers below. agent_id matches the
# transcript filename. The value written is the persona resolved above, NOT the
# agent type this comment used to claim it was (BUG-027). It is the fallback
# path now: the feed reads the transcript's own meta file first, so the map only
# matters for a transcript that has none. Best-effort, never fatal.
aid="$(extract '.agent_id')"
if [ -n "$aid" ] && [ -n "$plabel" ]; then
  printf '%s %s\n' "$aid" "$plabel" >> "$repo_root/logs/.subagent-map" 2>/dev/null || true
fi
case "$event" in
  SubagentStart) marker="→ dispatched" ;;
  SubagentStop)  marker="← finished" ;;
  *)             marker="$event" ;;
esac

# feed_append supplies the timestamp and owns the rotation, so this line no
# longer computes either. A hook must NEVER fail the tool call it observes, and
# feed_append returns 0 on every path by design.
feed_append "[$label - Claude Code] $marker${summary:+: $summary}"
exit 0
