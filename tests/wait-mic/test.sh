#!/bin/bash
# tests/wait-mic/test.sh
#
# FEATURE-005 — the mic watcher EXITS on the first change, so that stopping is an
# event rather than silence.
#
# WHAT IS ACTUALLY BEING GUARDED. An always-on `Monitor` fails invisibly: a dead
# one and a quiet one look identical, and A-40 records that `ps` cannot see them,
# so there is no liveness check either. Two died in one session and the founder
# noticed before the agent did. A waiter that exits converts three things into
# visible events — the baton moved, the waiter crashed, the harness stopped it —
# because the harness notifies on task exit whatever the code.
#
# WHAT IS NOT GUARDED, and must not be claimed: this does not close the blindness.
# It must be RE-ARMED after every event, and forgetting is silent. Alexey ruled
# that only harness supervision would close that, and this repo has none. The gap
# is narrowed, not closed.
#
# Case #2 is the one that earns its seconds: a waiter that exits when NOTHING has
# changed is worse than the Monitor it replaces, because a spurious exit reads as
# a handoff that never happened.
#
# Run from the blueprint repo root:  bash tests/wait-mic/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WAIT="$ROOT/scripts/wait-mic.sh"
SETTER="$ROOT/scripts/signal-set.sh"
FAILED=0

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$WAIT" ] || { echo "FAIL: missing $WAIT"; exit 1; }

# BUG-014 — git exports these to every hook, and a fixture that inherits them
# does its work in the REAL repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY
# The dispatcher exports these into everything it launches, so a fixture can
# silently read and write the LIVE baton (that is how a fixture dispatched the
# real Codex on 2026-08-03).
unset AGENT_SIGNAL_FILE AGENT_STATE_HOME AGENT_FEED_LOG

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SIG="$WORK/signal.md"
seed(){
  printf '| Field | Value |\n|---|---|\n| Holder | OLD |\n| State | IDLE |\n| Task | seed |\n| Last update | 1970-01-01 |\n' >"$SIG"
}

# ===========================================================================
# 1. IT FIRES ON A REAL PUBLISH AND EXITS. Published through signal-set.sh, not
#    by editing the file — publication is an atomic rename, and a waiter that
#    only notices ordinary writes would pass a hand-rolled test and fail in
#    production on every real handoff.
# ===========================================================================
seed
out="$WORK/out1"
( sh "$WAIT" "$SIG" >"$out" 2>&1 ) &
waiter=$!
sleep 1
bash "$SETTER" --file "$SIG" --holder Jesko --state OVER_TO_CODEX --task 'go' >/dev/null 2>&1
wait_rc=0
( sleep 8; kill "$waiter" 2>/dev/null ) &
killer=$!
wait "$waiter" 2>/dev/null || wait_rc=$?
kill "$killer" 2>/dev/null

if [ "$wait_rc" -ne 0 ]; then
  fail "#1 the waiter did not exit cleanly after a real publish (rc=$wait_rc)"
elif ! grep -q 'Jesko' "$out"; then
  fail "#1 the new Holder was not reported: [$(cat "$out")]"
elif ! grep -q 'OVER_TO_CODEX' "$out"; then
  fail "#1 the new State was not reported: [$(cat "$out")]"
else
  pass "#1 a real atomic publish makes the waiter report and EXIT"
fi

# ===========================================================================
# 2. IT DOES NOT EXIT WHEN NOTHING CHANGED. The load-bearing case: a spurious
#    exit is read as a handoff, and re-arming on a phantom is how a watcher
#    starts lying instead of merely going quiet.
# ===========================================================================
#    EVERY negative case below asserts exit 124 — the timeout killing a waiter
#    that was still waiting — and NOT merely "non-zero". Jesko's S2: the first
#    version accepted any failure, so a waiter that crashed on startup passed
#    three cases while doing nothing at all. A guard that is satisfied by the
#    thing being broken is the defect this repo keeps finding.
#    THREE poll intervals, not five. The assertion is "it did not exit while the
#    mic was unchanged", and three loop iterations prove that as well as five —
#    the extra two were how long I guessed, which is the question TASK-008 asked
#    of every sleep in the gate. Load cannot flake this: a stalled machine makes
#    the waiter do FEWER iterations, and the only way to get a non-124 status is
#    the waiter exiting, which is the defect itself.
still_waiting(){   # still_waiting <case> <label>; uses $SIG, writes $WORK/out<case>
  timeout 3 sh "$WAIT" "$SIG" >"$WORK/out$1" 2>&1
  _rc=$?
  if [ "$_rc" -eq 0 ]; then
    fail "#$1 the waiter EXITED — phantom handoff: [$(cat "$WORK/out$1")]"
  elif [ "$_rc" -ne 124 ]; then
    fail "#$1 the waiter died (rc=$_rc) instead of waiting: [$(cat "$WORK/out$1")]"
  else
    pass "#$1 $2"
  fi
}

seed
still_waiting 2 "an unchanged baton keeps the waiter waiting (no phantom handoff)"

# ===========================================================================
# 3. AN UNRELATED WRITE IN THE SAME DIRECTORY IS NOT A HANDOFF. The journal sits
#    beside the baton and is appended on every flip, so a waiter keyed on the
#    directory rather than the baton's CONTENT would fire on its own bookkeeping.
# ===========================================================================
seed
( sleep 1; printf '[x] noise\n' >>"$WORK/signal-history.log" ) &
noise=$!
still_waiting 3 "a neighbouring file changing is not a handoff"
wait "$noise" 2>/dev/null

# ===========================================================================
# 4. A TASK-ONLY EDIT IS NOT A HANDOFF EITHER. Holder and State are the mic;
#    Task is payload. Waking on payload would re-arm the agent for nothing.
# ===========================================================================
seed
( sleep 1; bash "$SETTER" --file "$SIG" --holder OLD --state IDLE --task 'different text' >/dev/null 2>&1 ) &
edit=$!
still_waiting 4 "only Holder/State move the mic — a Task edit does not"
wait "$edit" 2>/dev/null

# ===========================================================================
# 5. A DELETED BATON IS NOT A HANDOFF. Found by Jesko (S1): the waiter exited 0
#    and printed an empty `MIC:`. That is the worst available outcome — worse
#    than the blindness being replaced, because silence is merely uninformed
#    while a false handoff makes the agent act on one that never happened.
# ===========================================================================
seed
( sleep 1; rm -f "$SIG" ) &
del=$!
still_waiting 5 "a deleted baton is 'cannot see the mic', not 'the mic moved'"
wait "$del" 2>/dev/null

# ===========================================================================
# 6. REFORMATTING IS NOT A HANDOFF. Found by Jesko (S1): the waiter compared
#    rendered rows, so re-aligning the table fired it while Holder and State were
#    byte-identical.
#
#    This is BUG-010 exactly — a roster parser matching literal single spaces
#    broke on a padded table, and the miss was indistinguishable from "no
#    roster". The lesson was to compare VALUES, and I reintroduced the same
#    defect in a file whose whole job is reading that table.
# ===========================================================================
seed
( sleep 1; printf '| Field | Value |\n|---|---|\n|   Holder   |   OLD   |\n|  State  |  IDLE  |\n| Task | seed |\n| Last update | 1970-01-01 |\n' >"$SIG" ) &
pad=$!
still_waiting 6 "column padding is not a mic change (values, not rendered rows)"
wait "$pad" 2>/dev/null

# ===========================================================================
# 7. NON-VACUITY — the negatives above all pass against a waiter that never
#    exits at all. Seeding a baton that did not exist IS the mic moving, and it
#    must still fire.
# ===========================================================================
rm -f "$SIG"
out7="$WORK/out7"
( sh "$WAIT" "$SIG" >"$out7" 2>&1 ) &
w7=$!
sleep 1
seed
( sleep 8; kill "$w7" 2>/dev/null ) &
k7=$!
rc7=0
wait "$w7" 2>/dev/null || rc7=$?
kill "$k7" 2>/dev/null
if [ "$rc7" -ne 0 ]; then
  fail "#7 seeding an absent baton did not fire (rc=$rc7) — the negatives above prove nothing"
elif ! grep -q 'OLD' "$out7"; then
  fail "#7 fired but did not report the seeded value: [$(cat "$out7")]"
else
  pass "#7 seeding an absent baton DOES fire (so #2-#6 are not vacuous)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: FEATURE-005 — the waiter fires once on a real handoff and exits."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
