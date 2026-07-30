#!/bin/bash
# tests/staleness/drift-integration.sh
#
# The staleness probe as `blueprint drift` actually runs it.
#
# tests/staleness/test.sh proves the probe's verdicts. This proves the thing
# that would actually hurt: drift runs at EVERY agent wake, usually with no TTY,
# and it just gained a network call and a prompt. If either can block, every
# wake blocks — and a hung wake is worse than the stale checkout the feature was
# added to report.
#
# Run from the blueprint repo root:  bash tests/staleness/drift-integration.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# --fast runs ONLY #1 and #4 — the two that fire automatically, on every agent
# wake, with no human in the loop: does drift block without a TTY, and does
# staleness change its exit status. A regression in either breaks every wake in
# every project silently.
#
# Everything else runs in CI. The offer bounds (#2, #3, #5) protect something
# more severe — a fast-forward into a dirty or diverged checkout — but they only
# fire after a human answers a prompt, so CI catches them before they can reach
# anyone. That asymmetry, not the runtime, is what decides the split.
#
# The gate is at ~29s of a hard 30s ceiling before this suite exists, so there
# is no room to be generous here. See docs/doing/BUGS.md — the watcher suite
# alone is 18s of it, and that is the thing to fix, not this ceiling.
FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/scripts/blueprint"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*"; FAILED=1; }
pass() { echo "  ok — $*"; }

# --- a blueprint upstream, a local checkout of it, and a project ------------
UP="$WORK/bp-remote"
mkdir -p "$UP"
(
  cd "$UP"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  printf '# CLAUDE\n' > CLAUDE.md
  git add -A && git -c commit.gpgsign=false commit -q -m base
) 2>/dev/null

BP="$WORK/bp-local"
git clone -q "$UP" "$BP" 2>/dev/null
git -C "$BP" config user.email t@local
git -C "$BP" config user.name t

# Move the remote forward so the local checkout is genuinely behind.
printf 'more\n' >> "$UP/CLAUDE.md"
git -C "$UP" add -A
git -C "$UP" -c commit.gpgsign=false commit -q -m ahead

PROJ="$WORK/proj"
mkdir -p "$PROJ"
(
  cd "$PROJ"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  printf '# CLAUDE\n' > CLAUDE.md
  {
    printf 'blueprint_source = %s\n' "$BP"
    printf 'bootstrap_sha    = %s\n' "$(git -C "$BP" rev-parse HEAD)"
    printf 'bootstrap_date   = 2026-01-01\n'
  } > .blueprint-source
  git add -A && git -c commit.gpgsign=false commit -q -m init
) 2>/dev/null

# ===========================================================================
# 1. With NO TTY, drift warns, does not prompt, and terminates.
#    stdin is closed rather than redirected from /dev/null: a `read` on a
#    closed descriptor returns immediately, so a hang here means the code
#    prompted somewhere it should not have.
# ===========================================================================
start=$(date +%s%N)
out=$(cd "$PROJ" && "$CLI" drift 2>&1 <&-)
rc=$?
elapsed=$(( ($(date +%s%N) - start) / 1000000 ))

if [ "$elapsed" -gt 20000 ]; then
  fail "#1 drift took ${elapsed}ms without a TTY — this runs at every wake"
elif ! printf '%s' "$out" | grep -q "behind"; then
  fail "#1 drift did not report the stale checkout. Output:
$out"
elif printf '%s' "$out" | grep -q "fast-forward it now?"; then
  fail "#1 drift PROMPTED with no TTY — every agent wake would block here"
else
  pass "#1 no TTY: warns, offers a copy-pasteable command, never prompts (${elapsed}ms)"
fi

# ===========================================================================
# 2. It reports staleness WITHOUT changing the other repository. drift is a
#    report; a report with a side effect on someone else's checkout is not one.
# ===========================================================================
if [ "$FAST" -eq 1 ]; then
  echo "  -- #2 skipped (--fast): CI runs it"
else
bp_head_before=$(git -C "$BP" rev-parse HEAD)
( cd "$PROJ" && "$CLI" drift >/dev/null 2>&1 <&- )
if [ "$(git -C "$BP" rev-parse HEAD)" != "$bp_head_before" ]; then
  fail "#2 drift MOVED the blueprint checkout's HEAD without being asked"
else
  pass "#2 reporting leaves the blueprint checkout untouched"
fi
fi

# ===========================================================================
# 3. BP_NO_PROMPT is honoured even with a TTY available — the flag exists so a
#    scripted caller can opt out regardless of how it was invoked.
# ===========================================================================
if [ "$FAST" -eq 1 ]; then
  echo "  -- #3 skipped (--fast): CI runs it"
else
out=$(cd "$PROJ" && BP_NO_PROMPT=1 "$CLI" drift 2>&1 <&-)
if printf '%s' "$out" | grep -q "fast-forward it now?"; then
  fail "#3 BP_NO_PROMPT=1 still prompted"
else
  pass "#3 BP_NO_PROMPT=1 suppresses the offer"
fi
fi

# ===========================================================================
# 4. Still exits 0 when the project's files match. A staleness WARNING must not
#    turn into a drift FAILURE — they are different questions, and conflating
#    them would break every caller that checks drift's exit status.
# ===========================================================================
( cd "$PROJ" && "$CLI" drift >/dev/null 2>&1 <&- )
rc=$?
if [ "$rc" -ne 0 ]; then
  fail "#4 drift exited $rc because the checkout was stale — staleness is advisory"
else
  pass "#4 a stale checkout does not change drift's exit status"
fi

# ===========================================================================
# 5. An unreachable remote must not stall the wake, and must not claim current.
# ===========================================================================
if [ "$FAST" -eq 1 ]; then
  echo "  -- #5 skipped (--fast): costs a real timeout; CI runs it"
else
git -C "$BP" remote set-url origin "ssh://git@127.0.0.1/nope.git"
start=$(date +%s%N)
out=$(cd "$PROJ" && BP_STALENESS_TIMEOUT=2 GIT_SSH_COMMAND='sleep 60 #' \
      GIT_TERMINAL_PROMPT=0 "$CLI" drift 2>&1 <&-)
elapsed=$(( ($(date +%s%N) - start) / 1000000 ))
if [ "$elapsed" -gt 15000 ]; then
  fail "#5 a black-holed remote stalled drift for ${elapsed}ms"
elif ! printf '%s' "$out" | grep -q "unknown"; then
  fail "#5 an unreachable remote was not reported as unknown. Output:
$out"
else
  pass "#5 a black-holed remote is bounded (${elapsed}ms) and reported as unknown"
fi
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: drift reports staleness without blocking or mutating anything."
  exit 0
fi
echo "FAILED: drift staleness integration."
exit 1
