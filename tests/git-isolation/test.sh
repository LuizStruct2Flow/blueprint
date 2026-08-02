#!/bin/bash
# tests/git-isolation/test.sh
#
# BUG-014 — a test suite must never write into the repository it is run from.
#
# Git EXPORTS `GIT_DIR` (and can export `GIT_WORK_TREE` / `GIT_INDEX_FILE`) to
# every hook it runs. The pre-push gate runs these suites, so every suite
# inherits it. Twelve of them build fixtures with `git init && git add . &&
# git commit` inside a `( cd "$WORK" && … )` subshell — and **`cd` does not
# protect you**: with `GIT_DIR` set, git ignores the working directory and
# operates on the directory that variable names. The fixture's commit lands in
# the REAL repository.
#
# This is not theoretical and it is not small. On 2026-08-02 the blueprint's own
# `.git/config` was rewritten at 12:40:15 — `core.bare = true`, `core.hooksPath`
# wiped — and BUG-004 recorded it as done by "an unrelated process it could not
# identify". It was this. The suite that exists to prove the gate arms is what
# disarmed it, and the ungated push of `fdae0e2` follows directly.
#
# Reproduced in seconds, before the fix:
#
#   GIT_DIR=/tmp/victim/.git bash tests/marker-merge/test.sh
#   # victim HEAD: bdac8b5 -> ef24387   ← the fixture's commit, in the wrong repo
#
# The fix has two layers on purpose:
#   1. `.githooks/pre-push` unsets the variables once, at the source — that is
#      where they come from, and it protects every current and future suite.
#   2. Each fixture-building suite unsets them too, so a suite invoked from any
#      other hook context (or a future runner) is safe on its own.
#
# Belt and braces is justified here because the failure is silent, corrupts the
# developer's real repository, and disables the very gate meant to catch it.
#
# Run from the blueprint repo root:  bash tests/git-isolation/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# This suite deliberately SETS GIT_DIR for the subprocesses it drives, but it
# must not inherit one itself — its own `git -C` calls would then target the
# hook's repository rather than the victim fixtures.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# A victim repository standing in for the developer's real checkout.
new_victim(){
  local v="$TMP/victim.$1"
  rm -rf "$v"; mkdir -p "$v"
  git init -q "$v"
  ( cd "$v" && git -c user.email=t@l -c user.name=t commit -q --allow-empty -m base )
  printf '%s' "$v"
}

# ===========================================================================
# 1. THE REPRODUCER — a suite run with GIT_DIR set must not touch that repo.
#
#    marker-merge and gate-arming are the two proven offenders: the first
#    landed a commit, the second writes `core.hooksPath` with
#    `git config --local`. Both ran on every gated push.
# ===========================================================================
for suite in marker-merge gate-arming; do
  s="$ROOT/tests/$suite/test.sh"
  if [ ! -f "$s" ]; then fail "#1 tests/$suite/test.sh not found"; continue; fi

  v="$(new_victim "$suite")"
  head_before="$(git -C "$v" rev-parse HEAD)"
  cfg_before="$(git -C "$v" config --list --local | sort)"

  # GIT_DIR ALONE — which is what git actually hands a pre-push hook, and what
  # reproduced the incident. Setting GIT_WORK_TREE as well changes the
  # behaviour and the fixture stops landing in the victim, so a test that sets
  # both would pass against the unfixed code and prove nothing.
  ( cd "$ROOT" && GIT_DIR="$v/.git" bash "$s" ) >/dev/null 2>&1

  head_after="$(git -C "$v" rev-parse HEAD 2>/dev/null || echo MISSING)"
  cfg_after="$(git -C "$v" config --list --local 2>/dev/null | sort)"

  if [ "$head_before" != "$head_after" ]; then
    fail "#1 $suite wrote a commit into the repo GIT_DIR pointed at ($head_before -> $head_after)"
  elif [ "$cfg_before" != "$cfg_after" ]; then
    fail "#1 $suite rewrote the local git config of the repo GIT_DIR pointed at:"
    diff <(printf '%s\n' "$cfg_before") <(printf '%s\n' "$cfg_after") | sed 's/^/        /'
  else
    pass "#1 $suite leaves the GIT_DIR repo untouched (HEAD and config both stable)"
  fi
done

# ===========================================================================
# 2. THE GATE STRIPS THE VARIABLES AT THE SOURCE.
#    The hook is where they enter, so unsetting once there covers every suite
#    the gate will ever run — including ones written after this test.
# ===========================================================================
hook="$ROOT/.githooks/pre-push"
if [ ! -f "$hook" ]; then
  fail "#2 .githooks/pre-push not found"
elif sed 's/#.*//' "$hook" | grep -qE 'unset +[A-Z_ ]*GIT_DIR'; then
  pass "#2 the pre-push hook unsets GIT_DIR before running anything"
else
  fail "#2 the pre-push hook does not unset GIT_DIR — every suite it runs inherits it"
fi

# ===========================================================================
# 3. EVERY FIXTURE-BUILDING SUITE DEFENDS ITSELF.
#    A suite is runnable from anywhere, not only from this gate. Relying solely
#    on the caller is the assumption that produced the bug.
#    Non-vacuity: the discovery must actually find suites.
# ===========================================================================
found=0; naked=""
for f in "$ROOT"/tests/*/*.sh; do
  grep -q 'git init' "$f" 2>/dev/null || continue
  found=$((found+1))
  sed 's/#.*//' "$f" | grep -qE 'unset +[A-Z_ ]*GIT_DIR' || naked="$naked ${f#"$ROOT"/}"
done
if [ "$found" -lt 5 ]; then
  fail "#3 only $found fixture-building suites found — discovery is broken, so this proved nothing"
elif [ -n "$naked" ]; then
  fail "#3 suites build git fixtures without unsetting GIT_DIR:$naked"
else
  pass "#3 all $found fixture-building suites unset GIT_DIR themselves"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-014 — test fixtures cannot write into the repository under test."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
