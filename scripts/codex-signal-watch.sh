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
# the project's state dir (~/.<repo-name>/signal.log; see scripts/lib/state-dir.sh).

usage() {
  cat <<'USAGE'
Usage: scripts/codex-signal-watch.sh [options] [-- command ...]

Options:
  --file PATH       Signal file to watch (default: ./AGENT_SIGNAL.md)
  --state STATE     State that triggers the command (default: OVER_TO_CODEX)
  --poll SECONDS    Poll interval in seconds (default: 2)
  --log PATH        Trigger log path (default: ~/.<repo-name>/signal.log)
  --once            Exit after the first trigger
  -h, --help        Show this help

If no command is passed after --, CODEX_WAKE_COMMAND is executed with sh -c.
If neither is provided, the watcher only writes the trigger log line.
USAGE
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

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
SIGNAL_FILE="$ROOT/AGENT_SIGNAL.md"
TARGET_STATE="OVER_TO_CODEX"
POLL_SECONDS=2
# Same state-dir derivation as the feed and the launchers (A-09) — one mechanism.
. "$ROOT/scripts/lib/state-dir.sh"
LOG_FILE="$(agent_state_dir "$ROOT")/signal.log"
ONCE=0
COMMAND=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      SIGNAL_FILE="$2"
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
last_mtime="$(file_mtime "$SIGNAL_FILE")"

trigger_if_needed() {
  local holder state task key now
  holder="$(read_field "Holder")"
  state="$(read_field "State")"
  task="$(read_field "Task")"
  key="${holder}|${state}|${task}"

  if [[ "$state" != "$TARGET_STATE" ]]; then
    last_trigger_key=""
    return 1
  fi

  if [[ "$key" == "$last_trigger_key" ]]; then
    return 1
  fi

  last_trigger_key="$key"
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

while true; do
  if trigger_if_needed && [[ "$ONCE" -eq 1 ]]; then
    exit 0
  fi

  sleep "$POLL_SECONDS"
  current_mtime="$(file_mtime "$SIGNAL_FILE")"
  if [[ "$current_mtime" != "$last_mtime" ]]; then
    last_mtime="$current_mtime"
  fi
done
