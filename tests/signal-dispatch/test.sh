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
  HITS_FILE="$HITS" AGENT_SIGNAL_SETTLE=3 timeout "$1" bash "$WATCHER" \
    --file "$SIG" --poll 1 --log "$WORK/signal.log" -- "$CMD" >"$WORK/wlog" 2>&1
  return 0
}
hits(){ [ -s "$HITS" ] && grep -c . "$HITS" || echo 0; }

# ===========================================================================
# 1. THE REPRODUCER — the mic is flipped BEFORE the Task is written.
#    This is the incident, exactly: State goes to the target while Task still
#    holds the previous round's text, and the real Task lands a few seconds
#    later. The watcher must dispatch ONCE, carrying the NEW text — never the
#    stale text it briefly saw mid-write.
# ===========================================================================
write_signal ACTIVE "task-one"
(
  sleep 2
  write_signal OVER_TO_CODEX "task-one"      # round 1 — legitimate
  sleep 6
  write_signal ACTIVE "task-one"             # agent hands back
  sleep 2
  write_signal OVER_TO_CODEX "task-one"      # WRONG ORDER: mic flipped first…
  sleep 2
  write_signal OVER_TO_CODEX "task-two"      # …real Task lands 2s later
  sleep 6
) &
run_watch 22
wait 2>/dev/null

if grep -qx 'task-one' "$HITS" 2>/dev/null && [ "$(grep -cx 'task-one' "$HITS")" -gt 1 ]; then
  fail "#1 dispatched the stale 'task-one' twice — the mid-write state was taken as a real instruction"
elif ! grep -qx 'task-two' "$HITS" 2>/dev/null; then
  fail "#1 the real Task was never dispatched; hits: $(tr '\n' '|' <"$HITS")"
elif [ "$(hits)" -ne 2 ]; then
  fail "#1 expected exactly 2 dispatches (one per round), got $(hits): $(tr '\n' '|' <"$HITS")"
else
  pass "#1 a wrong-order edit dispatches once, on the settled Task (not the stale one)"
fi

# ===========================================================================
# 2. A genuinely new Task after a hand-back is the normal case and must fire.
# ===========================================================================
write_signal ACTIVE "task-one"
(
  sleep 2
  write_signal OVER_TO_CODEX "task-one"
  sleep 6
  write_signal ACTIVE "task-one"
  sleep 2
  write_signal OVER_TO_CODEX "task-TWO"      # a genuinely new instruction
  sleep 6
) &
run_watch 18
wait 2>/dev/null

if ! grep -q 'task-one' "$HITS" 2>/dev/null; then
  fail "#2 the first round never dispatched"
elif ! grep -q 'task-TWO' "$HITS" 2>/dev/null; then
  fail "#2 a genuinely new Task was refused — the guard would stall every round"
else
  pass "#2 a new Task after a hand-back still dispatches"
fi

# ===========================================================================
# 3. F2 (Codex) — an INTENTIONAL identical rerun must still dispatch.
#    The first version of this guard refused any Task byte-identical to the
#    last dispatched one. Codex's objection: task text is not a round identity,
#    identical instructions can legitimately recur, and the block lasted the
#    whole life of the watcher rather than the "one poll interval" I claimed.
#    Case #2 could not catch that — it changes the Task text, so it never
#    exercised the identical case at all.
# ===========================================================================
write_signal ACTIVE "same-task"
(
  sleep 2
  write_signal OVER_TO_CODEX "same-task"     # round 1
  sleep 9
  write_signal ACTIVE "same-task"            # hand back
  sleep 3
  write_signal OVER_TO_CODEX "same-task"     # round 2 — deliberately identical
  sleep 9
) &
run_watch 26
wait 2>/dev/null

n=$(hits)
if [ "$n" -lt 2 ]; then
  fail "#3 an intentional identical rerun was blocked (dispatched $n time(s)) — task text is being treated as a round identity (Codex F2)"
else
  pass "#3 two rounds with identical Task text both dispatch (Codex F2)"
fi

# ===========================================================================
# 4. The settle window must not turn into a permanent stall: after everything
#    quiesces, the watcher is still able to dispatch a later round.
# ===========================================================================
write_signal ACTIVE "later-task"
(
  sleep 2
  write_signal OVER_TO_CODEX "later-task"
  sleep 9
) &
run_watch 13
wait 2>/dev/null

if [ "$(hits)" -lt 1 ]; then
  fail "#4 nothing dispatched after a settle — the watcher has wedged"
else
  pass "#4 the watcher still dispatches after settling (no permanent stall)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the dispatcher will not fire on a Task nobody has updated."
  exit 0
fi
echo "FAILED: stale-dispatch guard is not holding."
exit 1
