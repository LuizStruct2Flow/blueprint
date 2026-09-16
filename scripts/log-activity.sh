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
# append, if the log exceeds AGENT_FEED_MAX_LINES it is RENAMED to `<feed>.1` and
# a new one started, so no concurrent append is lost and the history moves rather
# than being deleted (BUG-129). Tunable via env: AGENT_FEED_MAX_LINES (see
# scripts/lib/feed.sh, which owns the rotation and explains why it is a rename).
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
#     owns, and the rotation mechanism is exactly the kind of detail two copies
#     drift on — as BUG-129 showed when the surviving copy's own trim turned out
#     to drop concurrent appends and delete the history it trimmed.
#
# One appender, generic names. AGENT_FEED_MAX_LINES is honoured by feed.sh. No back-compat alias for the old names: keeping one would
# preserve the exact string this bug is about in a file that ships everywhere,
# and these were undocumented knobs whose defaults are unchanged — a project
# that never set them sees no difference.
# shellcheck source=scripts/lib/feed.sh
BP_CODE_ROOT="$repo_root"
. "$repo_root/scripts/lib/state-dir.sh"
BP_STATE_ROOT="$(bp_state_root)" || exit 0
. "$repo_root/scripts/lib/feed.sh"
# The flock provider is resolved by the ONE resolver, shared with the watcher
# liveness oracle that already reasons about flock — never a second
# `command -v flock` here that disagrees with it on macOS, where the tool exists
# but is not on PATH.
# shellcheck source=scripts/lib/watcher-lock.sh
. "$repo_root/scripts/lib/watcher-lock.sh"

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
export AGENT_FEED_MAX_LINES

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

# THE DEFERRED CHILD IS THIS SAME SCRIPT, re-executed under bash (see the block
# at the end). It carries no payload on stdin, so what the bookend needs arrives
# in the environment — and it must arrive HERE, above the roster lookup, which
# resolves a persona only when $meta is already known. Restored below that, the
# child looked up nothing and every deferred bookend fell back to the agent
# type: the BUG-124 defect itself, reintroduced by the fix for it.
if [ "${BP_SUBAGENT_DEFER_CHILD:-}" = 1 ]; then
  event="${BP_DEFER_EVENT:-$event}"
  meta="${BP_DEFER_META:-}"
  summary="${BP_DEFER_SUMMARY:-}"
  atype="${BP_DEFER_ATYPE:-}"
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
# THE WAIT AND THE CAP ARE DECIMAL INTEGERS, NORMALISED BEFORE ANY ARITHMETIC.
# A digit string is not an integer to the shell: `08` and `0009` are bad octal,
# and a 26-digit value makes `[ … -gt … ]` print "integer expected" and skip the
# clamp entirely. Each killed the child before it emitted anything, which is the
# silent-loss class this validation exists to close (Alexey's review,
# 2026-09-16, finding 3). Out of range is clamped rather than refused: this is a
# logging bound, and a hook must never cost the call it observes.
bp_clamp_int() {
  _ci_v="$1"; _ci_def="$2"; _ci_max="$3"
  case "$_ci_v" in '' | *[!0-9]*) printf '%s\n' "$_ci_def"; return ;; esac
  while :; do
    case "$_ci_v" in 0?*) _ci_v="${_ci_v#0}" ;; *) break ;; esac
  done
  # LENGTH BEFORE VALUE: a number with more digits than the ceiling cannot be
  # below it, and comparing it numerically is the thing that overflowed.
  if [ "${#_ci_v}" -gt "${#_ci_max}" ]; then printf '%s\n' "$_ci_max"; return; fi
  if [ "$_ci_v" -gt "$_ci_max" ]; then printf '%s\n' "$_ci_max"; return; fi
  printf '%s\n' "$_ci_v"
}

# The wait is the child's whole-life bound: this, plus the roster lookup that
# bp_staleness_timeout_cmd already bounds, is all it ever does.
BP_SUBAGENT_META_WAIT="$(bp_clamp_int "${BP_SUBAGENT_META_WAIT:-}" 5 15)"
# AT MOST THIS MANY children may wait at once, and the knob cannot raise it: the
# ceiling is the promise, so a larger value is clamped down to it.
BP_SUBAGENT_DEFER_MAX="$(bp_clamp_int "${BP_SUBAGENT_DEFER_MAX:-}" 8 8)"

defer_dir="$BP_STATE_ROOT/subagent-defer"

# RESERVE ATOMICALLY, AND RECLAIM UNDER THE SAME LOCK.
#
# `mkdir` of a FIXED name succeeds for exactly one caller, so the slot set IS
# the ceiling: twelve simultaneous dispatches each saw fewer than eight and each
# claimed one, with no two sharing a name (finding 1).
#
# THAT ALONE IS NOT A CAP. Reclaiming a slot left by a dead child used to be a
# separate, non-atomic step — `find` selected the stale directories, then `rm`
# removed them. Between those two instants another hook can replace a selected
# directory with a FRESH reservation, which the first caller then deletes and
# takes for itself: both return 0 with the identical path, and the cap is undone
# by the very sweep meant to keep it honest (Codex's S2, test #16).
#
# So reclamation, reservation and the spawn that owns the slot happen under ONE
# lock. `flock` is released by the KERNEL on death, including SIGKILL, so the
# mutex has no stale state of its own to sweep — the oracle
# scripts/lib/watcher-lock.sh already reasons with, reused rather than a second
# one invented here.
#
# AGE IS NOT A LIVENESS TEST, and is no longer used as one. `-mmin +1` rounds to
# whole minutes, so reclamation was after roughly two rather than one; and more
# importantly a delayed or blocked child outlives any threshold, so age could
# retire a slot whose owner was still running. The slot records its OWNER's pid
# instead, written before the lock is dropped, so a slot is free exactly when
# nobody is alive to hold it. The residual is pid reuse, the standard ceiling of
# every pid-based check, and it is bounded by the capped life of the child.
#
# NO FLOCK, NO DEFERRAL, AND THE FEED SAYS SO. A cap that cannot be enforced is
# not a cap, so the deferral is off without it — but silence there costs the
# whole feature on the machine most likely to lack it. macOS ships no flock(1),
# and a type-labelled bookend IS the BUG-124 symptom, so `defer_notice` below
# explains it once rather than leaving a mystery. scripts/install-toolchain.sh
# installs util-linux on macOS so this path is not reached on a set-up machine.
#
# WHY NOT A `mkdir` MUTEX, which would need no flock on any platform: `mkdir`
# gives mutual exclusion but no release-on-death. A holder killed mid-section
# leaves the mutex held forever and deferral wedged permanently — strictly worse
# than the bug being fixed — and breaking a stale one means deciding its owner
# is dead and deleting it, which is THIS defect one level up: the breaker can
# delete a mutex a live caller has just taken. flock's kernel release is the
# property that makes the fix correct, so it is a dependency rather than a
# preference.
defer_spawn() {
  _ds_flock="$(bp_flock_cmd)" || return 1
  mkdir -p "$defer_dir" 2>/dev/null || return 1
  : >>"$defer_dir/.lock" 2>/dev/null || return 1

  (
    # BOUNDED, never a bare `flock 9`. A hook must never stall the tool call it
    # only observes, so a mutex this hook cannot take in time means "do not
    # defer" — the same trade the roster lookup's timeout makes.
    "$_ds_flock" -w 5 9 || exit 1
    _ds_n=0
    while [ "$_ds_n" -lt "$BP_SUBAGENT_DEFER_MAX" ]; do
      _ds_slot="$defer_dir/slot-$_ds_n"
      if [ -d "$_ds_slot" ]; then
        _ds_pid="$(cat "$_ds_slot/pid" 2>/dev/null)" || _ds_pid=""
        if [ -n "$_ds_pid" ] && kill -0 "$_ds_pid" 2>/dev/null; then
          _ds_n=$((_ds_n + 1))
          continue
        fi
        # SAFE ONLY UNDER THE LOCK. No other caller can create or delete a slot
        # while we hold it, so this cannot remove a replacement generation.
        rm -rf "$_ds_slot" 2>/dev/null
      fi
      mkdir "$_ds_slot" 2>/dev/null || { _ds_n=$((_ds_n + 1)); continue; }
      # `9>&-` so the child does not inherit the mutex: it would hold it for its
      # whole wait, and every later dispatch would block out its own timeout.
      BP_SUBAGENT_DEFER_CHILD=1 \
      BP_DEFER_SLOT="$_ds_slot" \
      BP_DEFER_META="$meta" \
      BP_DEFER_EVENT="$event" \
      BP_DEFER_SUMMARY="$summary" \
      BP_DEFER_ATYPE="$atype" \
      BP_DEFER_WAIT="$BP_SUBAGENT_META_WAIT" \
        "$bashcmd" "$0" </dev/null >/dev/null 2>&1 9>&- &
      # THE OWNER, recorded before the lock is dropped. A slot whose pid is not
      # yet written reads as reclaimable to the next caller, which is the same
      # double-ownership one level down.
      printf '%s\n' "$!" >"$_ds_slot/pid" 2>/dev/null
      exit 0
    done
    exit 1
  ) 9>>"$defer_dir/.lock"
}

# SAY WHICH MECHANISM IS MISSING. The single notice used to blame the cap for
# everything — "no deferred slot free (cap 8)" — which names the one thing that
# demonstrably did not go wrong and hides the one that did. That is the
# BUG-041/042 misdirection class, and it cost a diagnosis there too.
defer_notice() {
  if bp_flock_cmd >/dev/null 2>&1; then
    # Past the cap the line is kept but the persona is not, and a degraded label
    # with no notice reads exactly like a subagent that never had one (Alexey's
    # informational 8). stderr, because Claude Code surfaces hook stderr under
    # --debug and discards it otherwise — one line per overflow, never one per
    # dispatch.
    printf '[log-activity] no deferred slot free (cap %s) — labelling this dispatch by agent type\n' \
      "$BP_SUBAGENT_DEFER_MAX" >&2
    return 0
  fi

  printf '[log-activity] no flock(1) — subagent bookends are labelled by agent type, not by persona. Install it: bash scripts/install-toolchain.sh\n' >&2

  # ONCE, IN THE FEED. stderr is discarded outside --debug, and the feed is
  # where the founder is actually looking when they ask why a persona's name is
  # missing — which is the question BUG-124 exists to answer. A line per
  # dispatch would be noise, and noise gets muted, which leaves them exactly as
  # blind as saying nothing. The marker makes it one line per state dir.
  _dn_marker="$defer_dir/.no-flock-notice"
  mkdir -p "$defer_dir" 2>/dev/null || return 0
  [ -e "$_dn_marker" ] && return 0
  : >"$_dn_marker" 2>/dev/null || return 0
  feed_append "[log-activity - Claude Code] subagent bookends are labelled by agent type, not by persona: no flock(1) on this machine, so the persona lookup cannot be deferred. Install it with scripts/install-toolchain.sh"
}

# CLOSE EVERYTHING ABOVE 2 IN THE CHILD. Redirecting 0, 1 and 2 says nothing
# about a caller's fd 9, so a flock held by whoever invoked the hook rode into
# the child and stayed held for the whole wait — a dispatch or session lock kept
# long after the hook returned. POSIX has no "close all", so the open ones are
# read from the process's own descriptor directory where there is one.
#
# THIS RUNS UNDER BASH, always: dash accepts only single-digit descriptors in a
# redirection, so `exec 19>&-` there is an attempted exec of a command named 19,
# exits 127, and takes the child with it — the dispatch vanished while the hook
# returned 0 (finding 2). The deferral below re-executes this script under bash
# for exactly that reason.
close_inherited() {
  fdd=/proc/self/fd
  [ -d "$fdd" ] || fdd=/dev/fd
  [ -d "$fdd" ] || return 0
  for fd in "$fdd"/*; do
    fd=${fd##*/}
    case "$fd" in 0 | 1 | 2 | *[!0-9]*) continue ;; esac
    eval "exec $fd>&-" 2>/dev/null || true
  done
}

# THE CHILD ITSELF. It is this script again, so the bookend is written by the
# one function that writes bookends.
if [ "${BP_SUBAGENT_DEFER_CHILD:-}" = 1 ]; then
  trap 'rm -rf "${BP_DEFER_SLOT:-}" 2>/dev/null' EXIT
  # AN EXPLICIT EXIT ON EVERY SIGNAL PATH, so releasing the slot and ending its
  # owner are one act. A shell RESUMES after a handler that does not exit, so
  # the single combined trap released the slot and let the child run on for the
  # rest of its wait — the slot was reusable while its owner was alive, and
  # cleanup was therefore never a bound on the child's lifetime (Codex's S2,
  # test #17). 143 is the conventional 128+SIGTERM; the EXIT trap above does the
  # one removal, on this path as on every other.
  trap 'exit 143' HUP INT TERM
  close_inherited
  _w="$(bp_clamp_int "${BP_DEFER_WAIT:-}" 5 15)"
  i=0
  while [ ! -e "$meta" ] && [ "$i" -lt $((_w * 10)) ]; do
    sleep 0.1
    i=$((i + 1))
  done
  emit_bookend
  exit 0
fi

# THE SPAWN IS PART OF THE RESERVATION, not a step after it. Reserving here and
# forking below would put the fork outside the lock, leaving a window in which
# the slot names no living owner and the next caller may reclaim it.
deferred=0
bashcmd=""
if [ "$event" = SubagentStart ] && [ -n "$tcmd" ] && [ ! -e "$meta" ]; then
  # No bash, no deferral: the line is written NOW, labelled by agent type. A
  # wrong label beats a lost one, and beats holding a caller's descriptor.
  bashcmd="$(command -v bash 2>/dev/null)" || bashcmd=""
  if [ -n "$bashcmd" ] && defer_spawn; then deferred=1; fi
  if [ "$deferred" = 0 ]; then defer_notice; fi
fi

if [ "$deferred" = 0 ]; then emit_bookend; fi
exit 0
