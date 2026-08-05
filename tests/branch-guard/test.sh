#!/bin/bash
# tests/branch-guard/test.sh
#
# TASK-003 — no commit and no push on the BLUEPRINT's main.
#
# CLAUDE.md §"Never push to the blueprint's `main`" says every blueprint change
# reaches main through a pull request, and — the half that is easy to miss —
# "Commit on a branch, or do not commit yet." Neither door was guarded. On
# 2026-08-03 an agent committed to main here; it surfaced only because the next
# `git push -u origin <branch>` named a branch that did not exist. Luck.
#
# THE CASE THAT MATTERS MOST IS #3. This guard ships to every derived project,
# and those are TRUNK-BASED: committing to main is what they are supposed to do.
# A guard that fired everywhere would break every project that pulled it — which
# is the BUG-002/009/010 contamination class, arriving as an over-eager rule
# rather than a hardcoded string.
#
# Run from the blueprint repo root:  bash tests/branch-guard/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers; this suite runs `git init`.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

for f in .githooks/pre-commit scripts/lib/branch-guard.sh; do
  [ -f "$ROOT/$f" ] || { fail "#0 $f missing"; echo FAILED; exit 1; }
done
[ -x "$ROOT/.githooks/pre-commit" ] || fail "#0 .githooks/pre-commit is not executable (git skips it silently — BUG-008)"
pass "#0 the hook and its guard lib are present and executable"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Build a repo that looks like the blueprint (or not, per $2).
make_repo() { # $1 = path, $2 = "blueprint" | "derived"
  rm -rf "$1"; mkdir -p "$1/.githooks" "$1/scripts/lib"
  cp "$ROOT/.githooks/pre-commit" "$1/.githooks/"
  cp "$ROOT/.githooks/commit-msg" "$1/.githooks/" 2>/dev/null || true
  cp "$ROOT/scripts/lib/branch-guard.sh" "$1/scripts/lib/"
  # commit-msg reads its rule from here and fails closed without it. Copying the
  # hook and not the rule builds a repository that cannot exist — bootstrap ships
  # the whole tracked tree — and every blocked commit would then be misread by
  # this suite as the BRANCH guard firing.
  cp "$ROOT/scripts/lib/commit-subject.sh" "$1/scripts/lib/" 2>/dev/null || true
  chmod +x "$1/.githooks/pre-commit" "$1/.githooks/commit-msg" 2>/dev/null || true
  [ "$2" = blueprint ] && touch "$1/.blueprint-root"
  git -C "$1" init -q -b main
  git -C "$1" config core.hooksPath .githooks
  git -C "$1" config user.email t@example.com
  git -C "$1" config user.name t
  echo seed > "$1/f.txt"
  git -C "$1" add -A
}

# ===========================================================================
# 1. BLUEPRINT + main → the commit is REFUSED.
# ===========================================================================
B="$TMP/bp"; make_repo "$B" blueprint
if git -C "$B" commit -q -m 'TASK#3: should be refused on main' >/dev/null 2>&1; then
  fail "#1 a commit on the blueprint's main was ACCEPTED"
else
  pass "#1 a commit on the blueprint's main is refused"
fi

# Non-vacuity: prove NOTHING landed. A hook that prints and exits 0 would look
# identical in the check above if the commit had failed for another reason.
if [ "$(git -C "$B" rev-list --count HEAD 2>/dev/null || echo 0)" = "0" ]; then
  pass "#1 nothing was committed — the refusal blocked rather than warned"
else
  fail "#1 a commit landed despite the refusal"
fi

# ===========================================================================
# 2. BLUEPRINT + topic branch → ACCEPTED.
#    Without this, "refuse everything" would pass #1.
# ===========================================================================
git -C "$B" checkout -q -b topic
if git -C "$B" commit -q -m 'TASK#3: allowed on a topic branch' >/dev/null 2>&1; then
  pass "#2 a commit on a topic branch is allowed"
else
  fail "#2 a commit on a topic branch was refused — the guard is too broad"
fi

# ===========================================================================
# 3. DERIVED PROJECT + main → ACCEPTED. The one that must not regress.
#    Derived projects are trunk-based; this guard ships to them and must be
#    inert there. It keys off .blueprint-root, which only the blueprint has.
# ===========================================================================
D="$TMP/derived"; make_repo "$D" derived
if git -C "$D" commit -q -m 'TASK#3: trunk-based commit in a derived project' >/dev/null 2>&1; then
  pass "#3 a derived project commits to main freely — the guard is inert there"
else
  fail "#3 THE GUARD FIRED IN A DERIVED PROJECT — it would break every trunk-based project that pulls it"
fi

# ===========================================================================
# 4. A merge in progress is allowed through.
#    Blocking mid-merge leaves a half-finished tree and teaches people to reach
#    for --no-verify, which disables every other hook too.
# ===========================================================================
M="$TMP/merge"; make_repo "$M" blueprint
# The base commits are made with hooks DISABLED, because the guard would refuse
# them on main — which is the point of the guard. The first draft omitted this,
# so main was never born, `checkout main` failed, and the "merge" merged a
# branch into ITSELF and reported "Already up to date" — exit 0, test green,
# nothing tested. It leaked one stderr line and would otherwise have shipped.
NH='-c core.hooksPath=/dev/null'
# shellcheck disable=SC2086
git -C "$M" $NH commit -q -m 'base' >/dev/null 2>&1
git -C "$M" checkout -q -b side
echo side > "$M/g.txt"; git -C "$M" add -A
# shellcheck disable=SC2086
git -C "$M" $NH commit -q -m 'side commit' >/dev/null 2>&1
git -C "$M" checkout -q main
echo mainline > "$M/h.txt"; git -C "$M" add -A
# shellcheck disable=SC2086
git -C "$M" $NH commit -q -m 'mainline' >/dev/null 2>&1

# Non-vacuity FIRST: the fixture must really be a diverged main with a
# mergeable side branch, or the merge below proves nothing.
if [ "$(git -C "$M" rev-parse --abbrev-ref HEAD)" != "main" ]; then
  fail "#4 fixture is not on main — the merge case would be vacuous"
elif ! git -C "$M" rev-parse --verify -q side >/dev/null; then
  fail "#4 fixture has no side branch — the merge case would be vacuous"
elif git -C "$M" merge-base --is-ancestor side main 2>/dev/null; then
  fail "#4 side is already an ancestor of main — the merge would be a no-op"
else
  if git -C "$M" merge --no-ff -m 'Merge branch side' side >/dev/null 2>&1; then
    pass "#4 a real merge commit on main completes (not blocked mid-operation)"
  else
    fail "#4 a merge on main was blocked — this strands the tree and invites --no-verify"
  fi
fi

# ===========================================================================
# 5. Fails CLOSED when the guard lib is missing from a BLUEPRINT checkout,
#    and stays quiet when it is missing from a derived one.
# ===========================================================================
X="$TMP/nolib"; make_repo "$X" blueprint
rm -f "$X/scripts/lib/branch-guard.sh"
if git -C "$X" commit -q -m 'TASK#3: lib is gone' >/dev/null 2>&1; then
  fail "#5 a blueprint checkout with NO guard lib accepted the commit — the gate fails open"
else
  pass "#5 a blueprint checkout with no guard lib refuses (fails closed)"
fi

Y="$TMP/nolib-derived"; make_repo "$Y" derived
rm -f "$Y/scripts/lib/branch-guard.sh"
if git -C "$Y" commit -q -m 'TASK#3: derived, no lib' >/dev/null 2>&1; then
  pass "#5 a derived project with no guard lib is unaffected"
else
  fail "#5 a derived project was blocked by a missing lib it has no use for"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: TASK-003 — the blueprint's main is closed to commits; derived projects are untouched."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
