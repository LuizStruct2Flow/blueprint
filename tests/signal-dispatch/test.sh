#!/bin/bash
# tests/signal-dispatch/test.sh
#
# The signal is TWO fields written by TWO edits. Flipping `State` to the target
# before writing `Task` gives the watcher a brand-new trigger key while `Task`
# still holds the previous round's text — so the agent is dispatched, in
# earnest, against work that is already finished.
#
# This happened twice in one session. "Flip the mic last" was already written
# in AGENTS.md and in HANDOVER before the second occurrence, which is exactly
# what makes a rule the wrong fix: it has to be remembered at the moment the
# author is busy. Same lesson as A-22 — the guard belongs in code on the path
# that already runs.
#
# Run from the blueprint repo root:  bash tests/signal-dispatch/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WATCHER="$ROOT/scripts/codex-signal-watch.sh"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$WATCHER" ] || { echo "FAIL: missing $WATCHER"; exit 1; }

SIG="$WORK/AGENT_SIGNAL.md"
HITS="$WORK/hits"

write_signal(){ # $1=state  $2=task
  printf '# Agent Signal\n\n| Field | Value |\n|---|---|\n| Holder | Jesko |\n| State | %s |\n| Task | %s |\n| Last update | test |\n' \
    "$1" "$2" >"$SIG"
}

# A dispatch command that just records the Task it was handed.
CMD="$WORK/record.sh"
cat >"$CMD" <<'EOF'
#!/bin/sh
echo "$AGENT_SIGNAL_TASK" >> "$HITS_FILE"
EOF
chmod +x "$CMD"

# Drive the watcher for a bounded number of polls, then stop it.
# Flags are `--file` and a command after `--` (not `--signal`/`--command`) —
# an earlier draft guessed and the watcher just printed its usage, which made
# every case fail for a reason that had nothing to do with the guard.
run_watch(){ # seconds
  : > "$HITS"
  HITS_FILE="$HITS" timeout "$1" bash "$WATCHER" \
    --file "$SIG" --poll 1 --log "$WORK/signal.log" -- "$CMD" >"$WORK/wlog" 2>&1
  return 0
}
hits(){ [ -s "$HITS" ] && grep -c . "$HITS" || echo 0; }

# ===========================================================================
# 1. THE REPRODUCER — mic flipped BEFORE the Task is written.
#    Round 1 dispatches "task-one". Then State is flipped back to the target
#    while Task still says "task-one". The watcher must NOT dispatch it again.
# ===========================================================================
write_signal ACTIVE "task-one"
(
  sleep 2
  write_signal OVER_TO_CODEX "task-one"      # round 1 — legitimate
  sleep 3
  write_signal ACTIVE "task-one"             # agent hands back
  sleep 2
  write_signal OVER_TO_CODEX "task-one"      # mic flipped, Task NOT yet updated
  sleep 3
) &
run_watch 12
wait 2>/dev/null

n=$(hits)
if [ "$n" -gt 1 ]; then
  fail "#1 dispatched $n times for one Task — the second fired on a stale Task (mic flipped before the Task was written)"
elif [ "$n" -eq 0 ]; then
  fail "#1 never dispatched at all — the guard is blocking legitimate work; watcher log: $(tail -3 "$WORK/wlog")"
else
  pass "#1 a mic flip with an unchanged Task does not re-dispatch"
fi

if grep -qi 'SKIPPED' "$WORK/wlog"; then
  pass "#1b the refusal is logged and says why, rather than failing silently"
else
  fail "#1b nothing in the log explains the skip — a silent refusal is indistinguishable from a dead watcher: $(tail -5 "$WORK/wlog")"
fi

# ===========================================================================
# 2. The guard must not block a REAL next round. A new Task after a hand-back
#    is the normal case and must dispatch.
# ===========================================================================
write_signal ACTIVE "task-one"
(
  sleep 2
  write_signal OVER_TO_CODEX "task-one"
  sleep 3
  write_signal ACTIVE "task-one"
  sleep 2
  write_signal OVER_TO_CODEX "task-TWO"      # a genuinely new instruction
  sleep 3
) &
run_watch 12
wait 2>/dev/null

if ! grep -q 'task-one' "$HITS" 2>/dev/null; then
  fail "#2 the first round never dispatched"
elif ! grep -q 'task-TWO' "$HITS" 2>/dev/null; then
  fail "#2 a genuinely new Task was refused — the guard is too strict and would stall every round"
else
  pass "#2 a new Task after a hand-back still dispatches"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the dispatcher will not fire on a Task nobody has updated."
  exit 0
fi
echo "FAILED: stale-dispatch guard is not holding."
exit 1
