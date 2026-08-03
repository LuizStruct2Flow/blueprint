#!/bin/bash
# tests/a2bp-e2e/test.sh
#
# `blueprint a2bp` end to end, against a real local remote. No network, no gh.
#
# The layered suites prove each part; this proves the assembly, and the single
# most important assertion in the whole feature lives here: THE BLUEPRINT'S
# WORKING TREE IS NEVER TOUCHED. That is the entire point of the change — a2bp
# used to `cp` straight into it, which is how BUG-002 and A-09 fanned out to
# every project. Every other property here is a detail by comparison.
#
# Run from the blueprint repo root:  bash tests/a2bp-e2e/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers. Git exports GIT_DIR to every hook,
# the pre-push gate runs this suite, and the fixtures below use `git init` inside
# a `cd`ed subshell. With GIT_DIR set, `cd` protects nothing: the fixture's
# commits and config writes land in the REAL repository. This suite must be safe
# run from anywhere, so it strips them itself rather than trusting its caller.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY


ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/scripts/blueprint"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*"; FAILED=1; }
pass() { echo "  ok — $*"; }

# Exit statuses under test (must match request-file.sh).
RC_OK=0; RC_PENDING=3; RC_BLOCKED=4; RC_FAILED=5; RC_NOTHING=6

# --- Codex F1: make "no gh" true rather than assumed -------------------------
# `command -v gh` must FAIL, so a shim is useless here — a shim is found. The
# only honest way is a PATH with no gh on it at all. Built by removing every
# directory that currently contains one.
NO_GH_PATH="$(
  printf '%s' "$PATH" | tr ':' '\n' | while IFS= read -r d; do
    [ -n "$d" ] || continue
    [ -x "$d/gh" ] && continue
    printf '%s:' "$d"
  done
)"
if PATH="$NO_GH_PATH" command -v gh >/dev/null 2>&1; then
  echo "FAIL: could not construct a gh-free PATH; the no-gh cases would be vacuous"
  exit 1
fi


# --- the blueprint remote (bare) and a working checkout of it ---------------
BPWORK="$WORK/bp-work"
mkdir -p "$BPWORK"
(
  cd "$BPWORK"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  mkdir -p docs
  printf '# CLAUDE\noriginal line\n'      > CLAUDE.md
  printf '# DoD\noriginal dod\n'          > docs/DoD.md
  printf '# Security\noriginal sec\n'     > docs/SECURITY.md
  git add -A && git -c commit.gpgsign=false commit -q -m base
) 2>/dev/null

REMOTE="$WORK/bp-remote.git"
git init -q --bare -b main "$REMOTE"
git -C "$BPWORK" remote add origin "$REMOTE"
git -C "$BPWORK" push -q origin main

# --- a derived project ------------------------------------------------------
PROJ="$WORK/acme-flow"
mkdir -p "$PROJ/docs"
(
  cd "$PROJ"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  printf '# CLAUDE\noriginal line\n'  > CLAUDE.md
  printf '# DoD\nIMPROVED dod\n'      > docs/DoD.md
  printf '# Security\noriginal sec\n' > docs/SECURITY.md
  {
    printf 'config_version   = 2\n'
    printf 'blueprint_source = %s\n' "$BPWORK"
    printf 'blueprint_remote = %s\n' "$REMOTE"
    printf 'blueprint_branch = main\n'
    printf 'bootstrap_sha    = %s\n' "$(git -C "$BPWORK" rev-parse HEAD)"
  } > .blueprint-source
  git add -A && git -c commit.gpgsign=false commit -q -m init
) 2>/dev/null

run() { ( cd "$PROJ" && "$CLI" "$@" 2>&1 ); }

# ===========================================================================
# 1. A request is FILED: the branch lands on the remote, carrying the change.
#    gh is HIDDEN for real here (NO_GH_PATH below), not merely assumed absent.
#    This comment used to claim "gh is absent in this fixture" while doing
#    nothing to make it so; on a host with gh installed the case passed because
#    real gh failed against the local bare remote and reached a DIFFERENT
#    branch. It therefore never exercised the no-gh path it named (Codex F1).
#
#    The branch is pushed and NO PR is opened.
#    That is RC_FAILED (5), not decision-pending (3) — changed with BUG-011.
#
#    This comment used to say 3 was "itself the contract for branch is up, PR is
#    not". That reading is the bug. CLAUDE.md defines 3 as "filed and awaiting a
#    decision", and with no PR there is nothing for anyone to decide on — a
#    script reading 3 concludes a reviewer has the request when nobody does.
#    5 with an explicit "open one by hand from <ref>" is the truthful answer.
# ===========================================================================
out=$(PATH="$NO_GH_PATH" run a2bp docs/DoD.md); rc=$?
if [ "$rc" -ne "$RC_FAILED" ]; then
  fail "#1 expected operational-failure ($RC_FAILED) with no gh present, got $rc. Output:
$out"
elif ! printf '%s' "$out" | grep -q 'gh is not installed'; then
  fail "#1 exit was right but via the WRONG branch — this case must exercise the missing-gh path, not a failed pr-create (Codex F1). Output:
$out"
else
  pass "#1 with no gh: the branch is pushed, no PR is claimed, and the exit code says operational failure (BUG-011)"
fi

# `**`, not `*`. for-each-ref matches patterns with WM_PATHNAME, so a single
# `*` does not cross '/' and 'refs/heads/a2bp/*' silently matches NOTHING
# against a2bp/<project>/<digest>. ls-remote uses different (tail-matching)
# semantics and does match — which is why cmd_prs's glob is correct and this
# one was not.
REQ_REF=$(git -C "$REMOTE" for-each-ref --format='%(refname:short)' 'refs/heads/a2bp/**' | head -1)
if [ -z "$REQ_REF" ]; then
  fail "#1b no a2bp/* branch reached the remote"
elif [ "$(git -C "$REMOTE" show "$REQ_REF:docs/DoD.md")" != "$(cat "$PROJ/docs/DoD.md")" ]; then
  fail "#1b the pushed branch does not carry the project's content"
else
  pass "#1b the request branch carries the project's version of the file"
fi

# ===========================================================================
# 2. THE ONE THAT MATTERS. The blueprint's working tree and its main branch are
#    untouched. a2bp cannot land anything, by construction.
# ===========================================================================
if [ "$(cat "$BPWORK/docs/DoD.md")" != "$(printf '# DoD\noriginal dod\n')" ]; then
  fail "#2 THE BLUEPRINT WORKING TREE WAS MODIFIED — a2bp still writes directly"
elif [ -n "$(git -C "$BPWORK" status --porcelain)" ]; then
  fail "#2 the blueprint checkout has uncommitted changes — something wrote into it"
elif [ "$(git -C "$REMOTE" rev-parse main)" != "$(git -C "$BPWORK" rev-parse main)" ]; then
  fail "#2 the remote's main branch moved — a request must not land on main"
else
  pass "#2 the blueprint's working tree AND main are untouched — nothing landed"
fi

# The request branch must be based on main and change exactly one path.
changed=$(git -C "$REMOTE" diff --name-only main "$REQ_REF" | tr '\n' ' ')
if [ "$changed" != "docs/DoD.md " ]; then
  fail "#2b the request changes '$changed', expected only docs/DoD.md"
else
  pass "#2b the request's diff against main touches exactly the requested file"
fi

# ===========================================================================
# 3. RE-RUNNING the identical request adopts its own branch rather than failing
#    or force-pushing. This is the ordinary retry after a network error, and it
#    only works because the build is byte-reproducible.
# ===========================================================================
tip_before=$(git -C "$REMOTE" rev-parse "$REQ_REF")
out=$(run a2bp docs/DoD.md); rc=$?
tip_after=$(git -C "$REMOTE" rev-parse "$REQ_REF")
if [ "$tip_before" != "$tip_after" ]; then
  fail "#3 re-running moved the branch tip — a request already under review would be rewritten"
elif [ "$rc" -ne "$RC_FAILED" ]; then
  fail "#3 re-running gave $rc, expected $RC_FAILED (still no gh, so still no PR). Output:
$out"
elif ! printf '%s' "$out" | grep -qi "adopting"; then
  fail "#3 re-running did not report adopting the existing branch. Output:
$out"
else
  pass "#3 an identical re-run adopts its own branch; the tip does not move"
fi

# ===========================================================================
# 4. A DIFFERENT tip under the same branch is refused, never force-pushed.
#    Simulated by rewriting the remote branch behind the CLI's back.
# ===========================================================================
# Tampered with plumbing directly on the bare remote — no checkout involved.
# Pointing the request branch at main is enough: what the CLI must detect is
# simply "the tip is not the commit I built", and going through a working tree
# to produce that only adds ways for the fixture itself to fail.
git -C "$REMOTE" update-ref "refs/heads/$REQ_REF" "$(git -C "$REMOTE" rev-parse main)"
tampered=$(git -C "$REMOTE" rev-parse "$REQ_REF")

out=$(run a2bp docs/DoD.md); rc=$?
if [ "$(git -C "$REMOTE" rev-parse "$REQ_REF")" != "$tampered" ]; then
  fail "#4 THE CLI FORCE-PUSHED over a differing tip — a request under review would be destroyed"
elif [ "$rc" -eq 0 ]; then
  fail "#4 a differing remote tip was reported as success"
elif ! printf '%s' "$out" | grep -qi "different tip\|Refusing to force-push"; then
  fail "#4 refused, but without naming the reason. Output:
$out"
else
  pass "#4 a differing remote tip is refused and never force-pushed"
fi
git -C "$REMOTE" update-ref "refs/heads/$REQ_REF" "$tip_before"

# ===========================================================================
# 5. NOTHING TO REQUEST gets its own status. An empty PR costs a reviewer the
#    same attention as a real one.
# ===========================================================================
out=$(run a2bp docs/SECURITY.md); rc=$?
if [ "$rc" -ne "$RC_NOTHING" ]; then
  fail "#5 an unchanged file gave $rc, expected $RC_NOTHING. Output:
$out"
elif git -C "$REMOTE" for-each-ref --format='%(refname:short)' 'refs/heads/a2bp/**' | grep -q "$(printf '%s' "$out" | grep -o 'a2bp/[^ ]*' | head -1)x"; then
  fail "#5 a branch was pushed for a no-op request"
else
  pass "#5 a file identical to the blueprint refuses with its own status"
fi

# ===========================================================================
# 6. --dry-run reads the remote and writes NOTHING.
# ===========================================================================
printf '# Security\nIMPROVED sec\n' > "$PROJ/docs/SECURITY.md"
refs_before=$(git -C "$REMOTE" for-each-ref --format='%(refname)' | sort)
out=$(run a2bp --dry-run docs/SECURITY.md); rc=$?
refs_after=$(git -C "$REMOTE" for-each-ref --format='%(refname)' | sort)
if [ "$refs_before" != "$refs_after" ]; then
  fail "#6 --dry-run pushed something"
elif [ "$rc" -ne "$RC_OK" ]; then
  fail "#6 --dry-run gave $rc, expected $RC_OK"
elif ! printf '%s' "$out" | grep -q "docs/SECURITY.md"; then
  fail "#6 --dry-run did not show the diff. Output:
$out"
else
  pass "#6 --dry-run shows the request and pushes nothing"
fi

# ===========================================================================
# 7. An UNMANAGED file is refused before any remote contact.
# ===========================================================================
printf 'private\n' > "$PROJ/project_config_dod.md"
refs_before=$(git -C "$REMOTE" for-each-ref --format='%(refname)' | sort)
out=$(run a2bp project_config_dod.md); rc=$?
refs_after=$(git -C "$REMOTE" for-each-ref --format='%(refname)' | sort)
if [ "$rc" -ne "$RC_BLOCKED" ]; then
  fail "#7 an unmanaged file gave $rc, expected $RC_BLOCKED"
elif [ "$refs_before" != "$refs_after" ]; then
  fail "#7 an unmanaged file still reached the remote"
else
  pass "#7 an unmanaged file is blocked before anything is pushed"
fi

# ===========================================================================
# 8. CONTAMINATION still blocks, and blocks the WHOLE request — a partial
#    request is not a smaller request, it is a different one filed under a
#    branch name that claims to describe what was asked for.
# ===========================================================================
printf '# CLAUDE\nsee /home/someone/dev/acme-flow/secret for details\n' > "$PROJ/CLAUDE.md"
refs_before=$(git -C "$REMOTE" for-each-ref --format='%(refname)' | sort)
out=$(run a2bp CLAUDE.md docs/SECURITY.md); rc=$?
refs_after=$(git -C "$REMOTE" for-each-ref --format='%(refname)' | sort)
if [ "$rc" -ne "$RC_BLOCKED" ]; then
  fail "#8 contamination gave $rc, expected $RC_BLOCKED. Output:
$out"
elif [ "$refs_before" != "$refs_after" ]; then
  fail "#8 A CONTAMINATED REQUEST WAS PUSHED"
elif ! printf '%s' "$out" | grep -qi "BLOCK"; then
  fail "#8 blocked without reporting a finding. Output:
$out"
else
  pass "#8 contamination blocks the whole request; nothing is pushed"
fi

# ===========================================================================
# 9. `blueprint push` is gone, and says what replaced it.
# ===========================================================================
out=$(run push CLAUDE.md); rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#9 'blueprint push' still succeeds"
elif ! printf '%s' "$out" | grep -q "blueprint a2bp"; then
  fail "#9 the removal does not name the replacement. Output:
$out"
else
  pass "#9 'blueprint push' is refused, naming what replaced it"
fi

# ===========================================================================
# 10. NO SCRATCH DIRECTORIES LEAK. The build clones into the system temp dir on
#     every run, including every failure path exercised above.
# ===========================================================================
leaked=$(find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'a2bp.*' -newer "$PROJ/.blueprint-source" 2>/dev/null | wc -l | tr -d ' ')
if [ "$leaked" -ne 0 ]; then
  fail "#10 $leaked scratch directory(ies) left behind in ${TMPDIR:-/tmp}"
else
  pass "#10 no scratch directories leaked across $(printf '%s' '9') runs"
fi

# ===========================================================================
# 11. A version 1 config refuses — the state every existing project is in.
# ===========================================================================
printf 'blueprint_source = %s\nbootstrap_sha = x\n' "$BPWORK" > "$PROJ/.blueprint-source"
out=$(run a2bp docs/SECURITY.md); rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#11 a version 1 config was accepted"
elif ! printf '%s' "$out" | grep -q "config_version   = 2"; then
  fail "#11 refused without printing the lines to add. Output:
$out"
else
  pass "#11 a version 1 config refuses with the exact lines to add"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: a2bp files requests and cannot write into the blueprint."
  exit 0
fi
echo "FAILED: a2bp end-to-end."
exit 1
