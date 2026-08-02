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
# author is busy. Same lesson as BUG-004 — the guard belongs in code on the path
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

# ---------------------------------------------------------------------------
# TEST CLOCK (BUG-005 / Codex F2).
#
# This suite cost 125.4 s and was excluded from the pre-push gate for it. That
# cost was scaffolding, not signal: `run_watch` started an infinite watcher
# under `timeout N` and threw the timeout status away, so every case burned its
# whole bound no matter when its assertion became decidable. The six bounds
# summed to exactly 125 (22+18+26+13+26+20).
#
# Two changes remove it without weakening a single assertion:
#
#   1. Everything is expressed in SETTLE UNITS instead of wall-clock seconds.
#      The watcher's settle window is the only real timescale here — every sleep
#      existed to be "shorter than settle" or "longer than settle". Shrinking
#      the unit shrinks the suite proportionally.
#   2. A case stops its watcher as soon as the assertion is DECIDABLE, rather
#      than waiting out a fixed bound.
#
# SETTLE stays an INTEGER second, deliberately. The watcher compares
# `date +%s` (scripts/codex-signal-watch.sh:178), so sub-second settle would
# mean changing the dispatch timing of production code for test convenience —
# in the file whose timing bugs are the reason this suite exists. The poll
# interval has no such constraint and goes sub-second freely.
#
# Override for debugging: SIGNAL_TEST_SETTLE=3 reproduces the original pacing.
# ---------------------------------------------------------------------------
# SETTLE=2 is a FLOOR, not a preference. The watcher compares `date +%s`, which
# truncates to whole seconds, and the wrong-order cases depend on a pause the
# watcher must read as SHORTER than settle. A sub-second pause can straddle a
# second boundary, so two observations 0.4 s apart can read as 1 s elapsed. At
# SETTLE=1 that makes `elapsed < settle` false and the stale Task dispatches —
# an alignment race, roughly 40% of runs, independent of machine load.
#
# I shipped SETTLE=1 and measured 37.5 s from it. The gate caught it on the very
# next push: passed three times standalone, failed inside the gate, and stayed
# green under artificial CPU load — which is what ruled load out and pointed at
# clock granularity. Any sub-settle pause needs to survive ONE boundary
# crossing, so the smallest sound integer settle is 2.
SETTLE="${SIGNAL_TEST_SETTLE:-2}"     # watcher settle window, whole seconds (min 2)
POLL="${SIGNAL_TEST_POLL:-0.2}"       # watcher poll interval, may be fractional
WATCH_MAX="${SIGNAL_TEST_WATCH_MAX:-60}"   # safety net only; never the pacing

# u N — N whole settle units, as a sleep argument.
u(){ echo $(( $1 * SETTLE )); }

# fu X — a FRACTION of a settle unit. The wrong-order cases depend on a pause
# strictly SHORTER than settle (that is what makes the two edits coalesce into
# one publication), so they cannot be expressed in whole units once the unit IS
# the settle window. Only SETTLE itself must stay an integer; sleep takes
# fractions happily.
fu(){ awk -v s="$SETTLE" -v f="$1" 'BEGIN{ printf "%.2f", s*f }'; }

# Flags are `--file` and a command after `--` (not `--signal`/`--command`) —
# an earlier draft guessed and the watcher just printed its usage, which made
# every case fail for a reason that had nothing to do with the guard.
start_watch(){
  : > "$HITS"
  HITS_FILE="$HITS" AGENT_SIGNAL_SETTLE="$SETTLE" timeout "$WATCH_MAX" bash "$WATCHER" \
    --file "$SIG" --poll "$POLL" --log "$WORK/signal.log" -- "$CMD" >"$WORK/wlog" 2>&1 &
  WATCH_PID=$!
}

stop_watch(){
  [ -n "${WATCH_PID:-}" ] || return 0
  kill "$WATCH_PID" 2>/dev/null
  wait "$WATCH_PID" 2>/dev/null
  WATCH_PID=""
}

hits(){ [ -s "$HITS" ] && grep -c . "$HITS" || echo 0; }

# await_hits N [max_units] — return as soon as N dispatches have landed.
# This is the positive half, and it is pollable: a dispatch is an event that
# appears. Bounded so a broken watcher fails the case instead of hanging it.
await_hits(){
  local want="$1" max_u="${2:-8}" deadline
  deadline=$(( $(date +%s) + max_u * SETTLE + 2 ))
  while [ "$(hits)" -lt "$want" ]; do
    [ "$(date +%s)" -lt "$deadline" ] || return 1
    sleep "$POLL"
  done
  return 0
}

# quiet [units] — the NEGATIVE half, which is not pollable. "No further
# dispatch happened" can only be established by waiting, so this is the one
# place real time is spent on purpose. Two settle windows: long enough that a
# pending dispatch would have fired.
quiet(){ sleep "$(u "${1:-2}")"; }

# ===========================================================================
# 1. THE REPRODUCER — the mic is flipped BEFORE the Task is written.
#    This is the incident, exactly: State goes to the target while Task still
#    holds the previous round's text, and the real Task lands a few seconds
#    later. The watcher must dispatch ONCE, carrying the NEW text — never the
#    stale text it briefly saw mid-write.
# ===========================================================================
write_signal ACTIVE "task-one"
start_watch
(
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "task-one"      # round 1 — legitimate
  sleep "$(u 2)"
  write_signal ACTIVE "task-one"             # agent hands back
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "task-one"      # WRONG ORDER: mic flipped first…
  sleep "$(fu 0.4)"                          # SHORTER than settle, so the two
  write_signal OVER_TO_CODEX "task-two"      # …edits coalesce into one publication
) &
WRITER_PID=$!
wait "$WRITER_PID" 2>/dev/null
await_hits 2 || true
quiet 2                                       # nothing further may arrive
stop_watch

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
start_watch
(
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "task-one"
  sleep "$(u 2)"
  write_signal ACTIVE "task-one"
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "task-TWO"      # a genuinely new instruction
) &
WRITER_PID=$!
wait "$WRITER_PID" 2>/dev/null
await_hits 2 || true
stop_watch

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
start_watch
(
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "same-task"     # round 1
  sleep "$(u 3)"
  write_signal ACTIVE "same-task"            # hand back
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "same-task"     # round 2 — deliberately identical
) &
WRITER_PID=$!
wait "$WRITER_PID" 2>/dev/null
await_hits 2 || true
stop_watch

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
start_watch
(
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "later-task"
) &
WRITER_PID=$!
wait "$WRITER_PID" 2>/dev/null
await_hits 1 || true
stop_watch

if [ "$(hits)" -lt 1 ]; then
  fail "#4 nothing dispatched after a settle — the watcher has wedged"
else
  pass "#4 the watcher still dispatches after settling (no permanent stall)"
fi

# ===========================================================================
# 5. R2-F2 (Codex) — the honest limit of a timeout, and the fix for it.
#
#    First half: a State-first write with a pause LONGER than the settle value
#    still publishes a torn state, and the watcher dispatches the stale Task.
#    No timeout is a publication boundary; this case exists so that limit is
#    demonstrated rather than described.
# ===========================================================================
write_signal ACTIVE "old-task"
start_watch
(
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "old-task"      # round 1
  sleep "$(u 2)"
  write_signal ACTIVE "old-task"
  sleep "$(u 1)"
  write_signal OVER_TO_CODEX "old-task"      # State first…
  sleep "$(u 3)"                             # …a pause LONGER than settle
  write_signal OVER_TO_CODEX "new-task"
) &
WRITER_PID=$!
wait "$WRITER_PID" 2>/dev/null
await_hits 3 || true
quiet 2                                       # the trace must be exactly three
stop_watch

# CHARACTERIZATION, asserted exactly. An earlier version of this case passed
# for almost every outcome — no dispatches, extra dispatches, a missing final
# task — and so demonstrated nothing. The precise trace is: round 1's task,
# then the STALE task (the torn state), then the real one.
#
# If the hand-edit path is ever given a real publication boundary, this case
# SHOULD fail; updating it alongside that fix is normal maintenance. An exact
# characterization does not lock a defect in — a vague one hides it.
expected="$(printf 'old-task\nold-task\nnew-task')"
actual="$(cat "$HITS" 2>/dev/null)"
if [ "$actual" = "$expected" ]; then
  pass "#5 a pause longer than settle publishes a torn state — exact trace old/old/new (Codex R2-F2, documented limit)"
else
  fail "#5 expected the exact characterization trace [old-task, old-task, new-task], got [$(printf '%s' "$actual" | tr '\n' ',')]"
fi

# ===========================================================================
# 6. R2-F2, the actual fix — scripts/signal-set.sh publishes the whole baton in
#    ONE atomic move, so there is no torn state to sample at any pause length.
# ===========================================================================
SETTER="$ROOT/scripts/signal-set.sh"
if [ ! -x "$SETTER" ]; then
  fail "#6 scripts/signal-set.sh is missing — the atomic publication path does not exist"
else
  write_signal ACTIVE "old-task"
  start_watch
  (
    sleep "$(u 1)"
    bash "$SETTER" --file "$SIG" --holder Jesko --state OVER_TO_CODEX --task "round-one" >/dev/null
    sleep "$(u 2)"
    bash "$SETTER" --file "$SIG" --holder Eto --state ACTIVE --task "round-one" >/dev/null
    sleep "$(u 1)"
    # One indivisible publication: State and Task change together. There is no
    # window in which the new State sits beside the old Task, at ANY pause.
    bash "$SETTER" --file "$SIG" --holder Jesko --state OVER_TO_CODEX --task "round-two" >/dev/null
  ) &
  WRITER_PID=$!
  wait "$WRITER_PID" 2>/dev/null
  await_hits 2 || true
  quiet 2                                     # exactly two, no torn extra
  stop_watch

  if grep -qx 'old-task' "$HITS" 2>/dev/null; then
    fail "#6 a stale Task was dispatched despite atomic publication: $(tr '\n' '|' <"$HITS")"
  elif ! grep -qx 'round-two' "$HITS" 2>/dev/null; then
    fail "#6 the second round never dispatched: $(tr '\n' '|' <"$HITS")"
  elif [ "$(hits)" -ne 2 ]; then
    fail "#6 expected exactly 2 dispatches, got $(hits): $(tr '\n' '|' <"$HITS")"
  else
    pass "#6 atomic publication never exposes a torn state, at any pause length (Codex R2-F2)"
  fi
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the dispatcher will not fire on a Task nobody has updated."
  exit 0
fi
echo "FAILED: stale-dispatch guard is not holding."
exit 1
