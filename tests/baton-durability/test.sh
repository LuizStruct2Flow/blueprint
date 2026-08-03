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
_real_signal="$(cd "$(dirname "$0")/../.." && pwd)/AGENT_SIGNAL.md"
_real_before=""
[ -f "$_real_signal" ] && _real_before="$(cat "$_real_signal")"

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

CODEX_BIN="$W/stub-codex" AGENT_SIGNAL_SETTLE=6 \
  timeout 40 bash "$W/scripts/start-codex-signal-watch.sh" --poll 1 --once \
  > "$W/watch.out" 2>&1 &
watch_pid=$!

# Land the branch operation INSIDE the settle window.
sleep 2
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
# 0. FIXTURE ISOLATION — the suite must not have touched the REAL baton.
#    Checked last so it covers every case above, and named #0 because it is a
#    precondition of the others meaning anything.
# ===========================================================================
if [ -n "$_real_before" ]; then
  if [ "$_real_before" = "$(cat "$_real_signal")" ]; then
    pass "#0 the real baton is byte-identical — no fixture reached live state"
  else
    fail "#0 THIS SUITE MODIFIED THE REAL BATON at $_real_signal — a fixture reached live state"
  fi
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-019 — a branch operation cannot destroy a live dispatch."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
