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
#    marker-merge and gate-arming are the original proven offenders: the first
#    landed a commit, the second writes `core.hooksPath` with
#    `git config --local`. Both ran on every gated push.
#
#    BUG-047 added commit-subjects and bootstrap-identity, both reproduced the
#    same way and both previously invisible to #3 below:
#      * commit-subjects rewrote the victim's local config — `core.hooksPath`
#        added, `user.email` / `user.name` overwritten — and still exited 0.
#        Setting core.hooksPath on a real repo IS the A-22 / BUG-004 failure,
#        produced by a test.
#      * bootstrap-identity left `chore(bootstrap): initialize test-ident …` as
#        a commit in the victim, because with GIT_DIR set `git init` inside the
#        fixture returns 0, creates no .git there, and the bootstrap's initial
#        commit lands in whatever GIT_DIR names.
#
#    They are EXECUTED here, not merely grepped for their unset line, because a
#    static check cannot tell a line that is present from a line that works —
#    which is the whole lesson of #3 (and of BUG-035). ~7 s for the pair; the
#    cost is paid on risk, not on the clock (CLAUDE.md §"Pre-push tolerance").
# ===========================================================================
# BUG-053 — `bootstrap-identity` is blueprint-tier and does not ship, so
# downstream it is NOT APPLICABLE rather than missing. Keyed on
# `.blueprint-root`, the same positive marker `drift` and tests/manifest use,
# and NEVER on the file being absent: keying on absence would let a derived
# project silently drop an anchor it should have by deleting a directory, which
# is BUG-005 with an extra step.
#
# `bootstrap-gate` found this by running a bootstrapped project's own gate —
# #1 reported "tests/bootstrap-identity/test.sh not found" and #3 reported the
# predicate had MISSED it. Both were correct about the file and wrong about
# what that meant.
GI_ANCHORS="marker-merge gate-arming commit-subjects"
[ -f "$ROOT/.blueprint-root" ] && GI_ANCHORS="$GI_ANCHORS bootstrap-identity"

# The skip must not be able to empty the anchor set. If it ever did, #1 would
# execute nothing and #3 would find nothing MISSING — both passing over an
# empty list, which is precisely the vacuous-pass shape this suite exists to
# refuse. Three is the floor because three anchors ship.
_gi_n=0
for _a in $GI_ANCHORS; do _gi_n=$((_gi_n + 1)); done
[ "$_gi_n" -ge 3 ] || fail "#1 anchor set collapsed to $_gi_n — this suite would prove nothing"

for suite in $GI_ANCHORS; do
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
# 3. EVERY SUITE THAT DRIVES GIT DEFENDS ITSELF.
#    A suite is runnable from anywhere, not only from this gate. Relying solely
#    on the caller is the assumption that produced the bug.
#
#    BUG-047 — THE DISCOVERY PREDICATE IS THE CONTROL, and it was wrong in both
#    directions at once. It used to be `grep -q 'git init' "$f"`, which:
#
#      * MISSED code. `commit-subjects:195` is `git -C "$T6" init -q` — no
#        `git init` substring anywhere in it — while that suite was provably
#        rewriting a victim repo's config. `bootstrap-identity` never types
#        `git init` at all, because scripts/new-project.sh does it for them.
#      * MATCHED PROSE. The suites it did find included ones whose only hit was
#        a COMMENT: branch-guard's header says "this suite runs `git init`"
#        while its code at :52 is `git -C "$1" init -q -b main`. The membership
#        of a safety control was therefore decided by what comments SAY rather
#        than by what code DOES — the BUG-035 shape.
#
#    Two changes. Strip comments FIRST (the unset check below already did; the
#    discovery did not, which is the whole asymmetry). And ask the broader,
#    honest question — does this file drive git at all, directly or through
#    new-project.sh — rather than guessing at one spelling of one subcommand.
#    Over-inclusion is the safe direction here: asking a suite that only runs
#    `git --version` for one `unset` line costs nothing and can never be wrong,
#    whereas every under-inclusion is a suite free to corrupt a real repository.
# ===========================================================================
found=0; naked=""; members=""
for f in "$ROOT"/tests/*/*.sh; do
  sed 's/#.*//' "$f" 2>/dev/null \
    | grep -qE '(^|[^[:alnum:]_./-])(git|new-project\.sh)([[:space:]]|$)' || continue
  found=$((found+1))
  members="$members ${f#"$ROOT"/tests/}"
  sed 's/#.*//' "$f" | grep -qE 'unset +[A-Z_ ]*GIT_DIR' || naked="$naked ${f#"$ROOT"/}"
done

# Non-vacuity has TWO halves, because a count can only detect an empty control,
# never an under-inclusive one. The old floor (`found -lt 5`) sat comfortably at
# 20 members for as long as the predicate was blind — it was passing at four
# times its own threshold on the day both offenders were outside the set. The
# named anchors are the half that would have failed: each is a suite proven by
# execution in #1 above to write into a victim repo, so a predicate that stops
# finding one of them has stopped being this control.
missing_anchor=""
for a in $GI_ANCHORS; do
  case " $members " in
    *" $a/test.sh "*) ;;
    *) missing_anchor="$missing_anchor $a" ;;
  esac
done

if [ -n "$missing_anchor" ]; then
  fail "#3 discovery MISSED suites #1 proves drive git:$missing_anchor
      The predicate has narrowed and this check is no longer the control it claims to be (BUG-047)."
elif [ "$found" -lt 15 ]; then
  fail "#3 only $found git-driving suites found — discovery is broken, so this proved nothing"
elif [ -n "$naked" ]; then
  fail "#3 suites drive git without unsetting GIT_DIR:$naked"
else
  pass "#3 all $found git-driving suites unset GIT_DIR themselves"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-014 — test fixtures cannot write into the repository under test."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
