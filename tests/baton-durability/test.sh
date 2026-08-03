#!/bin/bash
# tests/baton-durability/test.sh
#
# BUG-019: a branch operation must not destroy a live dispatch.
#
# THE DEFECT. `AGENT_SIGNAL.md` is a TRACKED file that holds LIVE runtime state.
# Both properties are fine alone and a bug together: git owns the content of
# tracked files in the working tree, so `git switch`, `git checkout <file>`,
# `git stash` and `git rebase` all rewrite it — correctly, by their own contract
# — including while an agent is mid-dispatch.
#
# Reproduced live against a running Codex, not inferred: a `git checkout
# AGENT_SIGNAL.md` from another branch reverted the baton, and Codex refused to
# proceed — "I stopped because the baton changed before I could claim it".
# Nothing failed. The watcher simply had nothing left to claim, which is what
# makes this expensive: a dispatch that dies loudly costs minutes, one that dies
# silently costs the session.
#
# It was rare until PR #3 made every fix a branch. The mechanism did not change;
# the frequency changed by an order of magnitude.
#
# THE MECHANISM, precisely. codex-signal-watch.sh builds a trigger key from
# Holder|State|Task and dispatches once it settles. A branch operation rewrites
# all three at once, which produces a new key (resetting the settle window) and
# usually restores a State that is not the target (clearing the pending state
# outright). The reverted content does not merely go stale — it CANCELS the
# in-flight dispatch.
#
# Run from the blueprint repo root:  bash tests/baton-durability/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers. This suite runs `git init` and
# `git checkout` against a fixture; with GIT_DIR inherited from a pre-push hook
# those would operate on the REAL repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

# AND never inherit the DISPATCHER's baton pointers. codex-signal-watch.sh does
# `export AGENT_SIGNAL_FILE="$SIGNAL_FILE"` before running the wake command, so
# every process inside a dispatch — including an agent that runs this suite as
# part of a review — inherits a pointer to the REAL baton. `agent_signal_file()`
# honours it, so the fixture's own copy of signal-set.sh wrote live state no
# matter what its cwd or script root said.
#
# That is what happened: Codex ran this suite while reviewing the PR that
# introduced it, and four fixture rows landed in the real baton and journal,
# leaving it at OVER_TO_CODEX — a self-dispatching loop, which on a metered
# agent is a cost incident, not just an annoyance.
#
# It is BUG-014's exact shape (git exports GIT_DIR to hooks, so fixtures wrote
# the real repo) and the header above already draws that comparison — I wrote
# the analogy and then unset only the variables from the first instance.
# AGENT_STATE_HOME is unset for the same reason: it would relocate the journal.
unset AGENT_SIGNAL_FILE AGENT_STATE_HOME

# AND never reach the REAL baton. `signal-set.sh` defaults to a RELATIVE
# `AGENT_SIGNAL.md`, so a call made from the repo root publishes into the live
# signal of the repository under test. The first draft of this suite did exactly
# that: it set the real baton to OVER_TO_CODEX, the real watcher dispatched the
# real Codex against a task reading "baton durability fixture", in the real
# working tree, with --sandbox workspace-write. Nothing was damaged because it
# was caught inside a minute, but nothing except luck bounded it.
#
# Same shape as BUG-014 (fixtures writing into the repo under test) and the same
# shape as the bug this suite exists to prove: a path resolved from the CALLER's
# position rather than from the thing that owns it. Every signal-set call below
# runs with cwd inside the fixture, and this guard fails the suite rather than
# letting a future edit reintroduce it silently.
# Snapshot the RESOLVED live baton and its journal — not the tracked file.
#
# The first version of this guard snapshotted AGENT_SIGNAL.md, which after this
# very change is protocol prose that nothing writes. So it compared a file that
# could not differ, reported "no fixture reached live state", and passed while
# the suite was overwriting the real baton. Codex found it by reproducing the
# corruption the guard existed to detect.
#
# That is the day's recurring failure in its purest form: a guard that watches
# the wrong thing cannot fail, and a green that cannot fail is worse than no
# test, because it is believed. Resolve through the same helper the production
# code uses, so the guard follows the baton wherever it moves.
_bd_root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/lib/state-dir.sh
. "$_bd_root/scripts/lib/state-dir.sh"
_real_signal="$(agent_signal_file "$_bd_root")"
_real_journal="$(agent_signal_journal "$_bd_root")"
_real_before=""; _real_jbefore=""
[ -f "$_real_signal" ]  && _real_before="$(cat "$_real_signal")"
[ -f "$_real_journal" ] && _real_jbefore="$(cat "$_real_journal")"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

command -v git >/dev/null 2>&1 || { echo "SKIP: git not available"; exit 0; }

# --- fixture ---------------------------------------------------------------
build_fixture() {
  W="$(mktemp -d)"
  mkdir -p "$W/scripts/lib"
  cp "$ROOT/scripts/codex-signal-watch.sh" \
     "$ROOT/scripts/start-codex-signal-watch.sh" \
     "$ROOT/scripts/codex-feed-filter.sh" \
     "$ROOT/scripts/signal-set.sh" "$W/scripts/" 2>/dev/null
  cp "$ROOT/scripts/lib/state-dir.sh" "$W/scripts/lib/" 2>/dev/null

  cat > "$W/AGENT_SIGNAL.md" <<'SIG'
# Agent Signal

| Field | Value |
|---|---|
| Holder | Nobody |
| State | IDLE |
| Task | committed baseline |
SIG

  git -C "$W" init -q
  git -C "$W" config user.email t@example.com
  git -C "$W" config user.name t
  git -C "$W" add -A >/dev/null 2>&1
  git -C "$W" commit -qm baseline >/dev/null 2>&1

  cat > "$W/stub-codex" <<'STUB'
#!/usr/bin/env bash
: > "$STUB_MARKER"
STUB
  chmod +x "$W/stub-codex"
}

# ===========================================================================
# 1. THE REPRODUCER — a `git checkout` of the TRACKED signal, fired inside the
#    settle window, must not cancel a live dispatch.
#
#    On the parent commit the live baton IS the tracked file, so the checkout
#    restores `State = IDLE`, the watcher clears its pending state, and the stub
#    never runs. After the fix the live baton is untracked, so the checkout
#    touches a file the watcher is not reading.
# ===========================================================================
build_fixture
export STUB_MARKER="$W/stub-ran"

# Publish the live baton the sanctioned way, so this test exercises whatever
# `signal-set.sh` considers the live file rather than hardcoding a path — the
# whole point of the fix is that the path moves.
( cd "$W" && CODEX_BIN="$W/stub-codex" bash "$W/scripts/signal-set.sh" \
  --holder Tester --state OVER_TO_CODEX --task 'baton durability fixture' ) >/dev/null 2>&1

CODEX_BIN="$W/stub-codex" AGENT_SIGNAL_SETTLE="${BD_SETTLE:-8}" \
  timeout 60 bash "$W/scripts/start-codex-signal-watch.sh" --poll 1 --once \
  > "$W/watch.out" 2>&1 &
watch_pid=$!

# Land the branch operation INSIDE the settle window.
#
# This is a race, and a race that can pass for the wrong reason is worse than no
# test. Codex's F5: on a loaded runner the sleep can overshoot the settle window,
# the watcher dispatches BEFORE the checkout lands, the marker appears, and the
# suite reports green having tested nothing.
#
# The window is widened (settle 8s, sleep 2s) so overshoot needs a ~6s
# scheduling stall rather than a ~4s one — but widening only makes it rarer, and
# rare-and-silent is the combination this repo keeps getting burned by. So the
# overshoot is DETECTED: if the stub already ran when the checkout lands, the
# window was missed and the case fails as inconclusive instead of passing.
#
# A green from this case therefore means "the checkout demonstrably preceded the
# dispatch", not "a marker exists".
sleep 2
if [ -f "$STUB_MARKER" ]; then
  fail "#1 INCONCLUSIVE: the watcher dispatched before the checkout landed — the settle window was missed, so this run proves nothing (loaded machine? raise AGENT_SIGNAL_SETTLE)"
fi
git -C "$W" checkout -- AGENT_SIGNAL.md >/dev/null 2>&1
checkout_rc=$?

wait "$watch_pid" 2>/dev/null
[ "$checkout_rc" -eq 0 ] || fail "#1 the fixture checkout itself failed (rc=$checkout_rc) — the test proves nothing"

if [ -f "$STUB_MARKER" ]; then
  pass "#1 a git checkout of the tracked signal did not cancel the live dispatch"
else
  fail "#1 the dispatch was LOST by a git checkout — BUG-019 (watcher output: $(tr '\n' ' ' < "$W/watch.out" | tail -c 300))"
fi
saved_W="$W"

# ===========================================================================
# 1b. NON-VACUITY — the same fixture with NO checkout must dispatch.
#
#     Without this, a watcher that never dispatches for an unrelated reason
#     (missing stub, bad fixture, changed CLI) would make #1 fail for the wrong
#     reason — or, if the assertion were inverted, pass while proving nothing.
# ===========================================================================
build_fixture
export STUB_MARKER="$W/stub-ran"
( cd "$W" && CODEX_BIN="$W/stub-codex" bash "$W/scripts/signal-set.sh" \
  --holder Tester --state OVER_TO_CODEX --task 'control, no checkout' ) >/dev/null 2>&1
CODEX_BIN="$W/stub-codex" AGENT_SIGNAL_SETTLE=2 \
  timeout 40 bash "$W/scripts/start-codex-signal-watch.sh" --poll 1 --once \
  > "$W/watch.out" 2>&1

if [ -f "$STUB_MARKER" ]; then
  pass "#1b control: the fixture dispatches when nothing interferes"
else
  fail "#1b control FAILED to dispatch — #1 cannot distinguish the bug from a broken fixture (output: $(tr '\n' ' ' < "$W/watch.out" | tail -c 300))"
fi
rm -rf "$W"

# ===========================================================================
# 2. Branch operations leave live mic state byte-identical.
#
#    `checkout <file>` is only the instance that bit us. `switch` and `stash`
#    rewrite the working tree the same way, so assert on the class.
# ===========================================================================
build_fixture
( cd "$W" && bash "$W/scripts/signal-set.sh" --holder Tester --state ACTIVE --task 'durability across branch ops' ) >/dev/null 2>&1

live="$( . "$W/scripts/lib/state-dir.sh"; printf '%s' "$(agent_state_dir "$W")/signal.md" )"
if [ ! -f "$live" ]; then
  fail "#2 no live signal at $live — the split has not happened yet"
else
  before="$(cat "$live")"
  git -C "$W" checkout -q -b other 2>/dev/null
  git -C "$W" checkout -q - 2>/dev/null
  git -C "$W" stash -q 2>/dev/null
  git -C "$W" stash pop -q 2>/dev/null
  after="$(cat "$live")"
  if [ "$before" = "$after" ]; then
    pass "#2 switch/stash leave the live mic state byte-identical"
  else
    fail "#2 a branch operation rewrote live mic state"
  fi
fi
rm -rf "$W" "$saved_W"

# ===========================================================================
# 3. The tracked file must not carry live state any more.
#
#    Structural, and deliberately modest: it stops the split being half-done
#    (prose updated, table left behind). #1 is the load-bearing assertion —
#    same division of labour the state-dir suite settled on.
# ===========================================================================
if grep -qE '^\|[[:space:]]*(Holder|State)[[:space:]]*\|[[:space:]]*[A-Za-z_]' "$ROOT/AGENT_SIGNAL.md"; then
  fail "#3 AGENT_SIGNAL.md still holds a live Holder/State row — it is tracked, so branch ops still rewrite it"
else
  pass "#3 the tracked signal file carries no live mic state"
fi

# ===========================================================================
# 4. The journal follows the baton, and an overridden baton takes it along.
#
#    The journal is meant to replace `git log -p AGENT_SIGNAL.md` as the
#    hand-off history. Its first version derived its own path from the repo root
#    instead of from the baton, so a suite that points AGENT_SIGNAL_FILE at a
#    fixture still appended to the REAL journal — tests/signal-set/ wrote eleven
#    fixture rows into it on the first run.
#
#    Two independent derivations of one location is the A-09 defect, reintroduced
#    in the very change that documents it. Asserted here because "the record went
#    somewhere else" is invisible until someone reads the record.
# ===========================================================================
#    BOTH override paths are checked. The first fix honoured $AGENT_SIGNAL_FILE
#    and still leaked, because tests/signal-set/ uses `--file`, which is parsed
#    AFTER the journal was derived. One input path validated and the other not
#    is the same hole this script's --task/--task-file normalisation once had,
#    so testing only the path I happened to think of would have re-shipped it.
for _mode in env flag; do
  jt="$(mktemp -d)"
  mkdir -p "$jt/elsewhere"
  if [ "$_mode" = env ]; then
    AGENT_SIGNAL_FILE="$jt/elsewhere/signal.md" bash "$ROOT/scripts/signal-set.sh" \
      --holder JTest --state ACTIVE --task 'journal follows the baton' >/dev/null 2>&1
  else
    bash "$ROOT/scripts/signal-set.sh" --file "$jt/elsewhere/signal.md" \
      --holder JTest --state ACTIVE --task 'journal follows the baton' >/dev/null 2>&1
  fi
  if [ -f "$jt/elsewhere/signal-history.log" ]; then
    pass "#4 the journal follows a baton overridden by --$_mode"
  else
    fail "#4 no journal beside the baton overridden by --$_mode — it went elsewhere, probably the real one"
  fi
  rm -rf "$jt"
done

# ===========================================================================
# 6. A RUNNING watcher follows the baton when the path moves under it.
#
#    This PR caused the failure it fixes. Moving the live baton left every
#    already-running dispatcher polling the OLD path — a file that no longer
#    changes — and it never fired again, silently. I hit it live: a dispatch of
#    this very review went nowhere, and I noticed only because the verdict never
#    arrived and the run log was 26 minutes stale.
#
#    Codex's call, and the right one: fix it HERE rather than defer it, because
#    it is a migration failure of this change and not an independent bug.
#
#    A POSITIVE-emission test, deliberately. The property is "a dispatch still
#    happens", and only a test that demands the dispatch can tell a watcher that
#    followed the move from one that is quietly polling nothing — the same
#    lesson `agent-activity-bound` taught earlier today, where only its one
#    positive case noticed a fixture writing a file nobody read.
#
#    The fixture shims `agent_signal_file()` to read a pointer file, so the path
#    can move WHILE the watcher runs. That shims the derivation, not the watcher
#    — what is under test is whether the watcher asks again, and it either does
#    or it does not.
# ===========================================================================
build_fixture
export STUB_MARKER="$W/stub-ran"

cat > "$W/scripts/lib/state-dir.sh" <<'SHIM'
#!/bin/sh
# Fixture shim: resolve the baton through a pointer file so the path can move
# under a running watcher. Same contract as the real helper.
agent_state_dir()   { printf '%s\n' "$(cat "$BD_POINTER")"; }
agent_signal_file() { printf '%s\n' "${AGENT_SIGNAL_FILE:-$(cat "$BD_POINTER")/signal.md}"; }
agent_signal_journal() { printf '%s\n' "$(dirname "$(agent_signal_file "${1:-}")")/signal-history.log"; }
SHIM

export BD_POINTER="$W/pointer"
mkdir -p "$W/a" "$W/b"
printf '%s\n' "$W/a" > "$BD_POINTER"

cat > "$W/a/signal.md" <<'IDLE'
| Field | Value |
|---|---|
| Holder | Nobody |
| State | IDLE |
| Task | nothing yet |
IDLE

CODEX_BIN="$W/stub-codex" AGENT_SIGNAL_SETTLE=2 \
  timeout 60 bash "$W/scripts/start-codex-signal-watch.sh" --poll 1 --once \
  > "$W/watch6.out" 2>&1 &
w6=$!

sleep 3
# Move the baton out from under the running watcher.
cat > "$W/b/signal.md" <<'GO'
| Field | Value |
|---|---|
| Holder | Tester |
| State | OVER_TO_CODEX |
| Task | the path moved under a running watcher |
GO
printf '%s\n' "$W/b" > "$BD_POINTER"

wait "$w6" 2>/dev/null
if [ -f "$STUB_MARKER" ]; then
  pass "#6 a running watcher followed the baton to its new path and still dispatched"
else
  fail "#6 the watcher kept polling the old path and never fired — the migration hazard (output: $(tr '\n' ' ' < "$W/watch6.out" | tail -c 300))"
fi
rm -rf "$W"

# --- #6b: an EXPLICIT path is a PIN and is never re-resolved ------------------
#
# Two jobs in one case. It is the non-vacuity proof for #6 — the identical
# scenario with re-resolution disabled must NOT dispatch, so #6's green comes
# from the refresh and not from the fixture dispatching anyway. And it is the
# assertion that the refresh did not quietly override an operator: `--file`
# (like AGENT_SIGNAL_FILE set before startup) means "watch exactly this", and a
# watcher that wandered off it would be a worse bug than the one being fixed.
build_fixture
export STUB_MARKER="$W/stub-ran"
cat > "$W/scripts/lib/state-dir.sh" <<'SHIM'
#!/bin/sh
agent_state_dir()   { printf '%s\n' "$(cat "$BD_POINTER")"; }
agent_signal_file() { printf '%s\n' "${AGENT_SIGNAL_FILE:-$(cat "$BD_POINTER")/signal.md}"; }
agent_signal_journal() { printf '%s\n' "$(dirname "$(agent_signal_file "${1:-}")")/signal-history.log"; }
SHIM
export BD_POINTER="$W/pointer"
mkdir -p "$W/a" "$W/b"
printf '%s\n' "$W/a" > "$BD_POINTER"
cat > "$W/a/signal.md" <<'IDLE'
| Field | Value |
|---|---|
| Holder | Nobody |
| State | IDLE |
| Task | nothing yet |
IDLE

# Do NOT let the timeout decide this case.
#
# Trimming it to 8s left only ~2s of scheduling margin, and Codex was right that
# this can false-pass: "no dispatch" would then be indistinguishable from "the
# watcher had not got round to it yet". Waiting longer is not the answer either
# — the timeout is this case's entire runtime, since `--once` exits only on
# dispatch.
#
# Assert the MECHANISM instead. A watcher that is STILL RUNNING after the move
# has demonstrably not dispatched — `--once` would have exited it. So move the
# pointer early, wait comfortably past the point a wandering watcher would fire
# (move at 1.5s + settle 2s ≈ 3.5s), then check liveness at 5s. That
# distinguishes "the pin held" from "the watcher died or ran out of clock",
# which a bare marker-absence check cannot. The timeout is now only a backstop.
CODEX_BIN="$W/stub-codex" AGENT_SIGNAL_SETTLE=2 \
  timeout 20 bash "$W/scripts/start-codex-signal-watch.sh" \
  --poll 1 --once --file "$W/a/signal.md" > "$W/watch6b.out" 2>&1 &
w6b=$!
sleep 1.5
cat > "$W/b/signal.md" <<'GO'
| Field | Value |
|---|---|
| Holder | Tester |
| State | OVER_TO_CODEX |
| Task | pinned watcher must ignore this |
GO
printf '%s\n' "$W/b" > "$BD_POINTER"
sleep 5
# Liveness BEFORE the marker check: `--once` exits on dispatch, so a process
# still running is positive evidence that none happened.
still_running=0
kill -0 "$w6b" 2>/dev/null && still_running=1
kill "$w6b" 2>/dev/null
wait "$w6b" 2>/dev/null

if [ -f "$STUB_MARKER" ]; then
  fail "#6b a --file pin was overridden by re-resolution — the watcher wandered off the path the operator named"
elif [ "$still_running" -ne 1 ]; then
  fail "#6b INCONCLUSIVE: the watcher was gone before the check, so 'no dispatch' proves nothing (output: $(tr '\n' ' ' < "$W/watch6b.out" | tail -c 200))"
else
  pass "#6b an explicit --file pin is never re-resolved — watcher still polling, no dispatch (and #6 is therefore not vacuous)"
fi
rm -rf "$W"

# --- #6c: a path move must not REPLAY an already-dispatched baton -------------
#
# Codex round-3 HIGH. My first version of the move handler cleared
# `last_trigger_key` along with the settle state, reasoning that pending state
# belonged to the old file. But a migration that COPIES the baton to its new
# home produces identical Holder|State|Task — and a cleared key makes that look
# like a brand-new instruction, so finished work is dispatched a second time.
#
# On a metered agent that is a duplicate bill, not a duplicate log line, which
# is why it ranks HIGH rather than as a tidiness point. It is also the same
# defect the settle window exists to prevent, arriving through a different door.
#
# The fixture dispatches once at path A, then moves an IDENTICAL baton to B.
# Exactly one dispatch must ever happen. Counted by appending to the marker
# rather than truncating it, so a second run cannot hide inside the first.
build_fixture
export STUB_MARKER="$W/stub-count"
cat > "$W/stub-codex" <<'STUB2'
#!/usr/bin/env bash
echo ran >> "$STUB_MARKER"
STUB2
chmod +x "$W/stub-codex"

cat > "$W/scripts/lib/state-dir.sh" <<'SHIM2'
#!/bin/sh
agent_state_dir()   { printf '%s\n' "$(cat "$BD_POINTER")"; }
agent_signal_file() { printf '%s\n' "${AGENT_SIGNAL_FILE:-$(cat "$BD_POINTER")/signal.md}"; }
agent_signal_journal() { printf '%s\n' "$(dirname "$(agent_signal_file "${1:-}")")/signal-history.log"; }
SHIM2

export BD_POINTER="$W/pointer"
mkdir -p "$W/a" "$W/b"
printf '%s\n' "$W/a" > "$BD_POINTER"
cat > "$W/a/signal.md" <<'GO2'
| Field | Value |
|---|---|
| Holder | Tester |
| State | OVER_TO_CODEX |
| Task | identical baton, must dispatch exactly once |
GO2
cp "$W/a/signal.md" "$W/b/signal.md"

# No --once: the watcher must stay alive so a SECOND dispatch is possible.
CODEX_BIN="$W/stub-codex" AGENT_SIGNAL_SETTLE=1 \
  timeout 10 bash "$W/scripts/start-codex-signal-watch.sh" --poll 1 \
  > "$W/watch6c.out" 2>&1 &
w6c=$!
sleep 4
printf '%s\n' "$W/b" > "$BD_POINTER"   # identical content, new path
sleep 4
kill "$w6c" 2>/dev/null
wait "$w6c" 2>/dev/null

runs=0
[ -f "$STUB_MARKER" ] && runs="$(wc -l < "$STUB_MARKER" | tr -d ' ')"
if [ "$runs" -eq 1 ]; then
  pass "#6c a path move with identical content dispatched exactly once (no replay)"
elif [ "$runs" -eq 0 ]; then
  fail "#6c INCONCLUSIVE: nothing dispatched at all, so the no-replay claim is untested (output: $(tr '\n' ' ' < "$W/watch6c.out" | tail -c 200))"
else
  fail "#6c the path move REPLAYED an already-dispatched baton ($runs dispatches) — finished work re-run"
fi
rm -rf "$W"

# ===========================================================================
# 5. First creation is atomic — the canonical path never shows a default baton.
#
#    Codex F4. The seed used to be written straight to $SIGNAL and replaced a
#    moment later, so a poller could read an empty, partial or IDLE baton at the
#    canonical path. The IDLE default made an accidental dispatch unlikely, but
#    "unlikely" is not the guarantee this script exists to provide.
#
#    Asserted by watching the path while a first publication happens: every
#    sample that sees a file at all must see the REQUESTED baton, never the
#    seed's Holder=Nobody / State=IDLE.
# ===========================================================================
at="$(mktemp -d)"
abaton="$at/first/signal.md"
mkdir -p "$at/first"
(
  for _ in $(seq 1 400); do
    if [ -f "$abaton" ]; then
      grep -q 'Holder | Nobody' "$abaton" 2>/dev/null && echo SAW_SEED >> "$at/samples"
      grep -q 'Holder | Atomic' "$abaton" 2>/dev/null && echo SAW_FINAL >> "$at/samples"
    fi
  done
) &
sampler=$!
AGENT_SIGNAL_FILE="$abaton" bash "$ROOT/scripts/signal-set.sh" \
  --holder Atomic --state ACTIVE --task 'first creation is atomic' >/dev/null 2>&1
wait "$sampler" 2>/dev/null

if grep -q SAW_SEED "$at/samples" 2>/dev/null; then
  fail "#5 the default seed baton was visible at the canonical path — first creation is not atomic"
elif [ -f "$abaton" ] && grep -q 'Holder | Atomic' "$abaton"; then
  pass "#5 first creation publishes only the requested baton (no seed ever visible)"
else
  fail "#5 no baton produced at $abaton"
fi
rm -rf "$at"

# ===========================================================================
# 0. FIXTURE ISOLATION — the suite must not have touched the REAL baton.
#    Checked last so it covers every case above, and named #0 because it is a
#    precondition of the others meaning anything.
# ===========================================================================
_bd_leaked=""
if [ -n "$_real_before" ] && [ "$_real_before" != "$(cat "$_real_signal" 2>/dev/null)" ]; then
  _bd_leaked="$_bd_leaked baton($_real_signal)"
fi
# The journal is checked too, because it is append-only: a fixture that wrote it
# leaves a row even if the baton was restored. Endpoint comparison of the baton
# alone can be defeated by modify-then-restore; the journal cannot be un-appended
# without noticing. Neither is airtight on its own — the real boundary is the
# unset above plus fixture-local paths — but a growing journal is the cheapest
# evidence that something reached live state.
if [ "$_real_jbefore" != "$(cat "$_real_journal" 2>/dev/null)" ]; then
  _bd_leaked="$_bd_leaked journal($_real_journal)"
fi
if [ -n "$_bd_leaked" ]; then
  fail "#0 THIS SUITE REACHED LIVE STATE:$_bd_leaked"
else
  pass "#0 the real baton and journal are byte-identical — no fixture reached live state"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-019 — a branch operation cannot destroy a live dispatch."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
