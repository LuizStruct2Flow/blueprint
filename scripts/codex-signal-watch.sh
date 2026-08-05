#!/usr/bin/env bash
set -euo pipefail

# Watch AGENT_SIGNAL.md and run a wake command when the mic flips to Codex.
#
# Example:
#   scripts/codex-signal-watch.sh --once -- printf 'wake\n'
#
# Or configure a real Codex client command:
#   CODEX_WAKE_COMMAND='codex --cwd /path/to/repo wake' \
#     scripts/codex-signal-watch.sh
#
# The command receives AGENT_SIGNAL_HOLDER, AGENT_SIGNAL_STATE, and
# AGENT_SIGNAL_TASK in its environment. Every trigger is also appended to
# the project's state dir (<repo>/logs/state/signal.log; see scripts/lib/state-dir.sh).

usage() {
  cat <<'USAGE'
Usage: scripts/codex-signal-watch.sh [options] [-- command ...]

Options:
  --file PATH       Signal file to watch (default: ./AGENT_SIGNAL.md)
  --state STATE     State that triggers the command (default: OVER_TO_CODEX)
  --poll SECONDS    Poll interval in seconds (default: 2)
  --log PATH        Trigger log path (default: <repo>/logs/state/signal.log)
  --once            Exit after the first trigger
  -h, --help        Show this help

If no command is passed after --, CODEX_WAKE_COMMAND is executed with sh -c.
If neither is provided, the watcher only writes the trigger log line.
USAGE
}

# Anchored to THIS SCRIPT's location, never to cwd or to git's idea of the
# repository. Both alternatives are wrong in ways that reopen A-09:
#
#   * `git rev-parse --show-toplevel` answers about the CALLER's environment.
#     Git exports GIT_DIR to every hook (BUG-014), and the gate runs from a
#     pre-push hook, so a dispatcher launched under one resolves whatever that
#     variable names — Codex reproduced the feed landing on <repo>/logs/state
#     while the launcher landed on <repo>/scripts/logs/state.
#   * `pwd` answers about wherever the operator happened to be standing.
#
# Either can resolve a DIFFERENT CHECKOUT, and the launcher then sources that
# tree's lib/state-dir.sh — so an old copy of the derivation silently wins and
# the feed and dispatcher stop rendezvousing.
#
# The script's own path cannot drift from the tree it belongs to, which is the
# property we actually need. This matches scripts/agent-activity.sh:49.
#
# A SEPARATE HAZARD that used to live here, now fixed rather than documented.
# The launcher resolved the state dir once and baked RUN_LOG/OUTPUT_LAST into
# the exported wake-command string, so a watcher started before a derivation
# change kept writing the OLD paths for its entire life — indistinguishable from
# a resolution bug from outside, which is what made it expensive to attribute.
# The first response was a note telling operators to restart their watchers.
# Codex was right to reject that: a rule you must remember is not a fix (the
# same conclusion BUG-004, BUG-014 and the no-chaining hook each reached). The
# wake command now derives the state dir on every dispatch, so a running watcher
# follows the change with no restart and no instruction to forget.
# --- physical script root (A-09 / BUG-020) -----------------------------------
# THIRD wrong answer, found by Codex in review round 2: `dirname "$0"`. It fixes
# the two above but breaks under a symlink — he installed an out-of-tree link and
# the watcher tried to source `/tmp/scripts/lib/state-dir.sh`. `$0` is the
# invocation path, not the file; sourcing gets the caller's `$0` instead.
# So resolve THIS FILE physically, through links.
#
# The block below is byte-identical in every consumer and tests/state-dir/ #7
# enforces that. It cannot be shared as a lib: finding the lib is the very
# problem it solves.
_bp_self="${BASH_SOURCE[0]}"
_bp_hops=0
while [ -L "$_bp_self" ] && [ "$_bp_hops" -lt 40 ]; do
  _bp_dir="$(cd -P "$(dirname "$_bp_self")" && pwd)"
  _bp_self="$(readlink "$_bp_self")"
  case "$_bp_self" in /*) ;; *) _bp_self="$_bp_dir/$_bp_self" ;; esac
  _bp_hops=$((_bp_hops + 1))
done
if [ -L "$_bp_self" ]; then
  echo "FATAL: symlink chain for $_bp_self exceeds 40 hops — cycle?" >&2
  exit 1
fi
_bp_root="$(cd -P "$(dirname "$_bp_self")/.." && pwd)"
repo_root() { printf '%s\n' "$_bp_root"; }

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

read_field() {
  local field="$1"
  awk -F'|' -v field="$field" '
    function trim(s) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
      return s
    }
    trim($2) == field { print trim($3); exit }
  ' "$SIGNAL_FILE"
}

# BUG-001 / RC-6: `stat -f %m f || stat -c %Y f` is NOT a portable fallback. On
# GNU coreutils `-f` means "filesystem status", so `%m` is invalid — it prints a
# multi-line block to STDOUT and exits 1, and `$(a || b)` captures BOTH outputs.
# The result is a blob holding live free-block counters, not an mtime, so every
# comparison against it reports "changed". Probe once, call only the right form.
if stat -c %Y . >/dev/null 2>&1; then
  file_mtime() { stat -c %Y "$1" 2>/dev/null; }
else
  file_mtime() { stat -f %m "$1" 2>/dev/null; }
fi

ROOT="$(repo_root)"
# Same state-dir derivation as the feed and the launchers (A-09) — one mechanism.
# Sourced BEFORE anything calls into it: agent_signal_file() lives here too now,
# and a use-before-source silently yielded an empty path rather than failing.
. "$ROOT/scripts/lib/state-dir.sh"
# BUG-019: the LIVE baton is untracked state, resolved through the one shared
# helper. Reading the tracked AGENT_SIGNAL.md here would read protocol prose,
# and — worse, before the split — a file git rewrites under a live dispatch.
SIGNAL_FILE="$(agent_signal_file "$ROOT")"
# Was the path PINNED by an operator, or merely derived? Captured before any of
# our own exports, because trigger_if_needed exports AGENT_SIGNAL_FILE for the
# wake command and that would otherwise look like an operator override on the
# next read — the watcher would pin itself to its own value.
SIGNAL_FILE_EXPLICIT=0
[[ -n "${AGENT_SIGNAL_FILE:-}" ]] && SIGNAL_FILE_EXPLICIT=1
TARGET_STATE="OVER_TO_CODEX"
POLL_SECONDS=2
LOG_FILE="$(agent_state_dir "$ROOT")/signal.log"
ONCE=0
COMMAND=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      SIGNAL_FILE="$2"
      SIGNAL_FILE_EXPLICIT=1
      shift 2
      ;;
    --state)
      TARGET_STATE="$2"
      shift 2
      ;;
    --poll)
      POLL_SECONDS="$2"
      shift 2
      ;;
    --log)
      LOG_FILE="$2"
      shift 2
      ;;
    --once)
      ONCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      COMMAND=("$@")
      break
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$SIGNAL_FILE" ]]; then
  echo "Signal file not found: $SIGNAL_FILE" >&2
  exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")"

last_trigger_key=""
last_dispatched_task=""
# Settle state: a candidate trigger key and when it was first seen. The signal
# must hold still for SETTLE_SECONDS before it is dispatched, so a two-edit
# write (Task then State, or State then Task) fires ONCE on its final content
# rather than mid-write. See trigger_if_needed.
pending_key=""
pending_since=0
SETTLE_SECONDS="${AGENT_SIGNAL_SETTLE:-6}"
last_mtime="$(file_mtime "$SIGNAL_FILE")"

trigger_if_needed() {
  local holder state task key now
  holder="$(read_field "Holder")"
  state="$(read_field "State")"
  task="$(read_field "Task")"
  key="${holder}|${state}|${task}"

  if [[ "$state" != "$TARGET_STATE" ]]; then
    last_trigger_key=""
    pending_key=""
    pending_since=0
    return 1
  fi

  if [[ "$key" == "$last_trigger_key" ]]; then
    return 1
  fi

  # --- Settle window --------------------------------------------------------
  # The signal is TWO fields written by two separate edits. Flipping `State` to
  # the target before writing `Task` produces a brand-new trigger key while
  # `Task` still holds the PREVIOUS round's text — so the agent is dispatched,
  # authentically, against work that is already done. That happened twice in one
  # session here, the second time hours after the "flip the mic last" rule was
  # written into AGENTS.md and HANDOVER by the same author who then broke it.
  # A rule you must remember while busy is the wrong kind of fix (the A-22
  # lesson): put it in code on the path that already runs.
  #
  # WHY NOT "refuse a Task identical to the last dispatched one" — that was the
  # first attempt and Codex was right to reject it. Task text is not a round
  # identity: identical instructions can legitimately recur, and the guard
  # blocked them for the entire life of the watcher rather than the "one poll
  # interval" its author claimed. It also died on restart, so it never covered
  # a wrong-order flip across one.
  #
  # Waiting for the signal to STOP CHANGING settles it instead of guessing. A
  # multi-edit write is dispatched once, on its final content, whatever order
  # the fields were written in; an intentional identical re-dispatch still
  # fires; nothing is remembered across a restart because nothing needs to be.
  if [[ "$key" != "$pending_key" ]]; then
    pending_key="$key"
    pending_since="$(date +%s)"
    return 1
  fi
  if [[ $(( $(date +%s) - pending_since )) -lt "$SETTLE_SECONDS" ]]; then
    return 1
  fi

  last_trigger_key="$key"
  last_dispatched_task="$task"
  now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '[%s] Holder=%s State=%s Task=%s\n' "$now" "$holder" "$state" "$task" | tee -a "$LOG_FILE"

  export AGENT_SIGNAL_HOLDER="$holder"
  export AGENT_SIGNAL_STATE="$state"
  export AGENT_SIGNAL_TASK="$task"
  export AGENT_SIGNAL_FILE="$SIGNAL_FILE"

  if [[ ${#COMMAND[@]} -gt 0 ]]; then
    "${COMMAND[@]}"
  elif [[ -n "${CODEX_WAKE_COMMAND:-}" ]]; then
    sh -c "$CODEX_WAKE_COMMAND"
  fi

  return 0
}

# BUG-019 migration hazard — re-resolve the baton path EVERY TICK.
#
# `SIGNAL_FILE` used to be resolved once at startup. When BUG-019 moved the live
# baton, every already-running watcher kept polling the OLD path — a file that
# no longer changes — and never fired again. It failed SILENTLY: no error, no
# log line, just a watcher patiently polling a file nobody writes. Found live,
# by a dispatch that went nowhere and a verdict that never arrived.
#
# The answer is not "restart your watchers after upgrading". That is the shape
# this repo has now rejected five times (BUG-004's "flip the mic last",
# BUG-014's fixture isolation, the no-chaining rule that needed a hook,
# BUG-020's baked RUN_LOG, this), and the excuse that it is a one-time migration
# does not hold — the failure is silent either way, and "only during an upgrade"
# describes exactly the moment nobody is watching for it.
#
# An EXPLICIT path is never re-resolved: `--file`, or AGENT_SIGNAL_FILE set by
# the operator before startup, is a pin and stays pinned. The distinction is
# captured at startup rather than inferred later, because this process exports
# AGENT_SIGNAL_FILE itself when dispatching, and would otherwise mistake its own
# export for an operator's intent.
refresh_signal_file() {
  [[ "$SIGNAL_FILE_EXPLICIT" -eq 1 ]] && return 0
  local now_file
  # Computed with our own export cleared, for the same reason.
  now_file="$( AGENT_SIGNAL_FILE=; agent_signal_file "$ROOT" )"
  [[ -n "$now_file" && "$now_file" != "$SIGNAL_FILE" ]] || return 0
  printf '[%s] signal path moved: %s -> %s\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$SIGNAL_FILE" "$now_file" | tee -a "$LOG_FILE"
  SIGNAL_FILE="$now_file"
  # Clear the SETTLE state — a half-observed candidate belongs to the old file.
  pending_key=""
  pending_since=0
  last_mtime=""
  # But KEEP last_trigger_key. Clearing it was a HIGH in review: if the baton at
  # the new path carries the same Holder|State|Task as one already dispatched —
  # which is exactly what a migration that copies the file produces — a cleared
  # key re-dispatches finished work. That is the defect the settle window exists
  # to prevent, arriving through a different door, and on a metered agent it is
  # a duplicate bill rather than a duplicate log line.
  #
  # Keeping it is also the CONSISTENT choice: last_trigger_key already persists
  # across every ordinary tick, so carrying it across a move changes nothing
  # about what "already dispatched" means. Clearing it was the special case, and
  # special cases in dispatch identity are what Codex rejected once before.
}

# --- claim the mic state, so its absence is detectable (BUG-022) -------------
#
# The lock is held on fd 7 for this process's lifetime and never closed: the
# kernel releases it on exit, including SIGKILL, so there is no cleanup path to
# get wrong and no stale pid to disambiguate.
#
# Its PURPOSE is not mutual exclusion, though it provides that too. It is the
# record that a watcher was EXPECTED on this state, which is the fact
# scripts/agent-activity.sh needs to tell "nobody is listening" apart from "an
# agent is thinking". Without a lock file the feed reports `none` and says
# nothing — correct for a project that runs no watchers.
#
# --once is exempt. A one-shot probe is not a listener, and a lock it drops
# milliseconds later would leave a file that reads as a dead watcher forever.
if [[ "$ONCE" -ne 1 ]] && [[ -r "$ROOT/scripts/lib/watcher-lock.sh" ]]; then
  # shellcheck source=scripts/lib/watcher-lock.sh
  . "$ROOT/scripts/lib/watcher-lock.sh"
  if ! bp_watch_hold "$ROOT" "$TARGET_STATE" 7; then
    echo "codex-signal-watch: another watcher already holds $TARGET_STATE — refusing." >&2
    echo "  Two watchers on one state race the same baton and dispatch twice." >&2
    exit 1
  fi
fi

while true; do
  refresh_signal_file
  if [[ -f "$SIGNAL_FILE" ]] && trigger_if_needed && [[ "$ONCE" -eq 1 ]]; then
    exit 0
  fi

  sleep "$POLL_SECONDS"
  current_mtime="$(file_mtime "$SIGNAL_FILE")"
  if [[ "$current_mtime" != "$last_mtime" ]]; then
    last_mtime="$current_mtime"
  fi
done
