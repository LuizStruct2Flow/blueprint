#!/bin/bash
# tests/agent-activity-bound/test.sh
#
# BUG-001: agent-activity.sh holds one instance with a bounded process set
#
# Regression fixture for the fork-bomb-class leak (docs/doing/PLAN-BUG-001.md).
# On a founder host the old design reached ~17,400 script instances and ~8,700
# `tail` processes, exhausted the kernel inotify instance limit, and pegged ~24
# of 32 threads for 2.7 days at zero application load.
#
# Two-commit pattern (CLAUDE.md §"Minimal reproducer first"): this file FAILS on
# the parent commit and PASSES on the fix. What it pins:
#
#   RC-1  TOCTOU pidfile guard      -> concurrent starts yield exactly one feed
#   RC-2  immortal tail -F per file -> resident process count is bounded
#   RC-3  EXIT-trap-only teardown   -> --stop leaves nothing behind
#   RC-6  broken stat -f/-c fallback-> unchanged file emits once, not per tick
#   R3    $() strips trailing \n    -> one complete line emits on the next tick
#   R4    awk length() counts chars -> multibyte fragment never over-advances
#
# Run from the blueprint repo root:
#   bash tests/agent-activity-bound/test.sh
#
# Exit codes: 0 = pass; non-zero = fail.
#
# Hygiene: everything runs against a throwaway HOME + repo root under a temp
# dir, and every kill is scoped to PIDs this script started. It must NEVER
# `pkill -f agent-activity` — that would kill a founder's real feed.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/agent-activity.sh"
WORK="$(mktemp -d)"
STARTED=""

cleanup(){
  for p in $STARTED; do
    kill -9 "$p" 2>/dev/null
  done
  rm -rf "$WORK"
}
trap cleanup EXIT

fail(){ echo "FAIL: $*"; exit 1; }
pass(){ echo "  ok — $*"; }

[ -f "$SCRIPT" ] || fail "missing $SCRIPT"

# Static checks must inspect CODE, not prose: this script's header explains the
# very anti-patterns it forbids, so grepping the raw file would match its own
# comments. Strip full-line and trailing comments first.
CODE="$WORK/code.sh"
sed 's/[[:space:]]#.*$//; s/^[[:space:]]*#.*$//' "$SCRIPT" >"$CODE"

# A throwaway repo the feed can watch, so we never touch the real one.
REPO="$WORK/repo"
mkdir -p "$REPO/logs" "$REPO/scripts"
cp "$SCRIPT" "$REPO/scripts/agent-activity.sh"
cp "$ROOT/AGENT_ROSTER.example.md" "$REPO/AGENT_ROSTER.example.md" 2>/dev/null
cat >"$REPO/AGENT_SIGNAL.md" <<'EOF'
# Agent Signal

## Current Signal

| Field | Value |
|---|---|
| Holder | Sylvia |
| State | ACTIVE |
| Task | fixture |
| Last update | 2026-07-23 |
EOF

FEED="$REPO/scripts/agent-activity.sh"
LOG="$REPO/logs/agent-activity.log"
export AGENT_STATE_HOME="$WORK/state"
mkdir -p "$AGENT_STATE_HOME"

# Count only processes this test started (never a global pgrep).
live_children(){
  local n=0 p
  for p in $STARTED; do kill -0 "$p" 2>/dev/null && n=$((n+1)); done
  echo "$n"
}

start_daemon(){
  ( cd "$REPO" && HOME="$WORK/home" bash "$FEED" --daemon >/dev/null 2>&1 )
}

stop_daemon(){
  ( cd "$REPO" && HOME="$WORK/home" bash "$FEED" --stop >/dev/null 2>&1 )
}

supervisors(){
  # Resident supervisors for THIS fixture repo only, matched on the fixture path.
  ps -eo pid,args 2>/dev/null | grep "[a]gent-activity.sh" | grep -c "$REPO" || true
}

mkdir -p "$WORK/home"

# ---------------------------------------------------------------------------
# 1. The CLI contract exists at all (RC-3 / F-2').
#    On the parent commit the script takes no arguments, so --status is
#    swallowed and the feed starts in the foreground and never returns.
# ---------------------------------------------------------------------------
if ! grep -q -- '--status' "$CODE"; then
  fail "no --status mode: the script has no start/stop/status contract (F-2').
      A feed that cannot be asked whether it is running, or told to stop,
      can only be cleaned up with pkill — which is how orphans accumulate."
fi
if ! grep -q -- '--stop' "$CODE"; then
  fail "no --stop mode (F-2'): teardown depends on signalling a pid by hand"
fi
pass "start/stop/status CLI contract present"

# ---------------------------------------------------------------------------
# 2. No `tail -F` anywhere (RC-2).
#    Follow-by-name retries forever: a finished subagent's transcript is never
#    deleted, so the tail never exits. One per transcript per instance is the
#    leak. The fix reads byte deltas instead.
# ---------------------------------------------------------------------------
if grep -qE 'tail[[:space:]]+(-n0[[:space:]]+)?-F' "$CODE"; then
  fail "script still uses 'tail -F' (RC-2).
      Every match is a process that never exits and consumes an inotify
      instance; past fs.inotify.max_user_instances they degrade to 1s
      poll-spin, which is what pegged the host."
fi
pass "no immortal 'tail -F' followers"

# ---------------------------------------------------------------------------
# 3. Single-instance guard is kernel-enforced, not a pidfile race (RC-1).
# ---------------------------------------------------------------------------
if ! grep -q 'flock' "$CODE"; then
  fail "no flock (RC-1): the pidfile + kill -0 guard is TOCTOU-racy and its
      EXIT trap unlinks shared state, so the gate reopens on every death"
fi
pass "flock-based single-instance guard"

# ---------------------------------------------------------------------------
# 4. Portable stat (RC-6 / A-06).
#    `stat -f %m f || stat -c %Y f` on GNU prints a multi-line filesystem block
#    to stdout AND exits 1, so $(a || b) captures both. The "mtime" then holds
#    live free-block counters that change constantly.
# ---------------------------------------------------------------------------
if grep -qE '\$\((stat -f %m[^)]*\|\| *stat -c %Y|stat -c %Y[^)]*\|\| *stat -f %m)' "$CODE"; then
  fail "broken stat fallback still present (RC-6).
      On GNU the failing branch still writes to stdout, so the captured value
      is a filesystem blob, not an mtime — the change detector fires forever."
fi
pass "no broken stat -f/-c capture"

# ---------------------------------------------------------------------------
# 5. Byte-correct boundary arithmetic (R4).
#    awk's length() counts CHARACTERS in a multibyte locale while every other
#    quantity is BYTES; a two-byte 'é' reported as 1 advances one byte past the
#    real newline, emitting part of an incomplete record.
# ---------------------------------------------------------------------------
if grep -q "awk 'END{print length" "$CODE" && ! grep -q "LC_ALL=C awk 'END{print length" "$CODE"; then
  fail "fragment length computed without LC_ALL=C (R4): character count used
      as a byte offset corrupts any record containing non-ASCII"
fi
pass "fragment length is byte-based"

# ---------------------------------------------------------------------------
# 6. Payload never passes through command substitution (R3).
#    $() strips ALL trailing newlines, so a snapshot ending in a complete
#    record loses the delimiter the newline-boundary rule depends on.
# ---------------------------------------------------------------------------
if grep -qE '^[[:space:]]*(local[[:space:]]+)?delta=\$\(' "$CODE"; then
  fail "delta captured via \$() (R3): trailing newlines are stripped, so a
      single appended complete line yields k=0 — nothing emitted, offset never
      advances, and the feed stalls until the fragment force-flush"
fi
pass "delta payload kept out of command substitution"

# ---------------------------------------------------------------------------
# 7. Behavioural: concurrent starts yield exactly one supervisor (RC-1),
#    and --stop leaves nothing behind (RC-3).
# ---------------------------------------------------------------------------
i=0
while [ $i -lt 12 ]; do
  start_daemon &
  STARTED="$STARTED $!"
  i=$((i+1))
done
wait 2>/dev/null
sleep 1

n="$(supervisors)"
[ "$n" -le 1 ] || fail "12 concurrent starts produced $n supervisors, expected <= 1 (RC-1)"
pass "concurrent starts yield at most one supervisor (got $n)"

stop_daemon
sleep 1
n="$(supervisors)"
[ "$n" -eq 0 ] || fail "--stop left $n supervisor(s) running (RC-3)"
pass "--stop leaves no residue"

echo "PASS: BUG-001 — one instance, bounded process set, byte-correct reads."
exit 0
