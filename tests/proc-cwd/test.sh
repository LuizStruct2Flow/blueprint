#!/bin/sh
# tests/proc-cwd/test.sh — BUG-036 regression.
#
# The bug: test helpers resolved a process's cwd with `readlink -f
# /proc/<pid>/cwd`, which does not exist on macOS. Every count of "my running
# processes" returned 0 on a Mac, six cases in tests/agent-activity-bound failed
# closed, and the pre-push gate could not pass — so nothing could be pushed from
# a Mac at all, while the same suites were green on Linux.
#
# This suite pins the HELPER rather than the callers, because the defect is one
# mechanism assumption reached from three call sites (agent-activity-bound:159,
# subagent-feed:49 and :125). Pinning it once is what stops the fourth.
#
# On the parent commit this file's subject does not exist, which is the point:
# the reproducer must fail before the fix, or "I added a regression test" is a
# claim about intent rather than about coverage.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT/tests/helpers/proc-cwd.sh"

FAILED=0
pass(){ echo "  ok — $1"; }
fail(){ echo "FAIL: $1"; FAILED=1; }

WORK="$(mktemp -d)"
cleanup(){
  [ -n "${SLEEP_PID:-}" ] && kill "$SLEEP_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# #1 A mechanism exists at all. If this fails the rest is vacuous, so it is
#    asserted rather than assumed — the BUG-005 lesson.
# ---------------------------------------------------------------------------
if bp_proc_cwd_available; then
  pass "#1 a cwd mechanism is available on this host (procfs or lsof)"
else
  fail "#1 no cwd mechanism on this host — every process count would be 0 and every 'expected 0' would pass for the wrong reason"
  echo "PARTIAL: tests/proc-cwd could not run non-vacuously."
  exit 1
fi

# ---------------------------------------------------------------------------
# #2 The real case: a live process in a known directory resolves to it.
#    THIS is what returned empty on macOS and produced BUG-036.
# ---------------------------------------------------------------------------
mkdir -p "$WORK/plain"
( cd "$WORK/plain" && exec sleep 30 ) &
SLEEP_PID=$!
sleep 1

got="$(bp_proc_cwd "$SLEEP_PID")"
# macOS resolves /var and /tmp through /private symlinks, so compare after
# normalising both sides rather than asserting a literal match.
want="$(cd "$WORK/plain" && pwd -P)"
got_norm="$(cd "$got" 2>/dev/null && pwd -P)"
if [ -n "$got" ] && [ "$got_norm" = "$want" ]; then
  pass "#2 a live process's cwd resolves to the directory it was started in"
else
  fail "#2 cwd lookup returned '$got' (normalised '$got_norm'), expected '$want' — this is BUG-036: on a host with no /proc the lookup was empty and every caller counted 0"
fi
kill "$SLEEP_PID" 2>/dev/null
SLEEP_PID=""

# ---------------------------------------------------------------------------
# #3 A path containing spaces. agent-activity-bound #7 asserts exactly this
#    ("a path with spaces broke the reader"), and column-parsing lsof output
#    reintroduces the break — which is why the helper uses -Fn.
# ---------------------------------------------------------------------------
mkdir -p "$WORK/with space/inner"
( cd "$WORK/with space/inner" && exec sleep 30 ) &
SLEEP_PID=$!
sleep 1

got="$(bp_proc_cwd "$SLEEP_PID")"
want="$(cd "$WORK/with space/inner" && pwd -P)"
got_norm="$(cd "$got" 2>/dev/null && pwd -P)"
if [ -n "$got" ] && [ "$got_norm" = "$want" ]; then
  pass "#3 a cwd containing spaces survives the lookup intact"
else
  fail "#3 cwd with spaces returned '$got' (normalised '$got_norm'), expected '$want'"
fi
kill "$SLEEP_PID" 2>/dev/null
SLEEP_PID=""

# ---------------------------------------------------------------------------
# #4 A dead pid yields empty rather than a stale or wrong path. Callers use the
#    result to decide "is this MY process", so a confident wrong answer is worse
#    than none.
# ---------------------------------------------------------------------------
( exec sleep 0.1 ) &
dead=$!
wait "$dead" 2>/dev/null
sleep 0.3
got="$(bp_proc_cwd "$dead")"
if [ -z "$got" ]; then
  pass "#4 a dead pid resolves to empty, not to a stale path"
else
  fail "#4 a dead pid resolved to '$got' — callers would count a process that no longer exists"
fi

# ---------------------------------------------------------------------------
# #5 No-argument call is a no-op rather than an error under `set -u`.
# ---------------------------------------------------------------------------
if got="$(bp_proc_cwd "" 2>&1)" && [ -z "$got" ]; then
  pass "#5 an empty pid is a no-op, not an error"
else
  fail "#5 empty pid produced '$got'"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-036 — process cwd resolves on this OS, so process counts are real."
  exit 0
fi
echo "FAIL: BUG-036 — the cwd lookup is not portable on this host."
exit 1
