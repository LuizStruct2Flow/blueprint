#!/bin/bash
# tests/bootstrap-gate/test.sh
#
# BUG-028 — a freshly bootstrapped project must be able to pass its own gate.
#
# This is the check that never existed, and its absence IS the bug. Every other
# bootstrap suite asserts something about what the archive CONTAINS
# (`bootstrap-contents`, `template-source`, `bootstrap-identity`); none of them
# ever ran the thing the new project runs first. So a derived project shipped
# for months with `.githooks/pre-push-project` wiring the BLUEPRINT'S OWN
# self-test suite — four suites that drive `new-project.sh`, `templates/` and
# `.blueprint-root`, none of which exist downstream, plus `pull-exec-bit`, which
# needs an unsubstituted placeholder a bootstrapped project cannot have. Six of
# 39 suites failed on day one, at EXIT=1, on the first push of every project
# ever bootstrapped.
#
# Same shape as BUG-004 and A-22: the gate looked armed and was measuring the
# wrong thing, and nobody noticed because the failure arrives on someone ELSE'S
# machine. The only assertion that could have caught it is the end-to-end one —
# bootstrap a project, run its gate, require zero.
#
# THE FIXTURE IS BUILT FROM HEAD — the tree that is about to be pushed.
# `.gitattributes` is the surface this bug lives on, and git resolves
# export-ignore from the tree being archived, so which tree the fixture is built
# from decides what this suite is even asserting. It used to be the WORKING
# TREE, so that a boundary the author had written but not committed was visible.
# That trade is backwards for a gate: at pre-push time the change is ALREADY
# committed, so the working-tree view guarded a case that cannot arise here and
# opened one that can — the gate goes green over an uncommitted fix, the author
# pushes the commit without it, and the boundary ships broken with a green gate
# behind it. Reading HEAD fails closed instead: an uncommitted fix leaves the
# suite red until it is committed, which is what pre-push means.
#
# HEAD is materialised with `read-tree` + `checkout-index` rather than
# `git archive HEAD`, because archive applies export-ignore and this fixture
# must BE a blueprint — templates/ and all — before it can bootstrap anything.
#
# Run from the blueprint repo root:  bash tests/bootstrap-gate/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers. The pre-push gate runs this
# suite, git exports GIT_DIR to every hook, and everything below does `git init`
# and `git commit` inside fixtures. With GIT_DIR set, `cd` protects nothing and
# the fixture's commits land in the REAL repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

# Hermetic identity: bootstrap REFUSES without one (A-14), and a suite that
# depends on the developer's global config passes or fails for the wrong reason.
export GIT_AUTHOR_NAME=T GIT_AUTHOR_EMAIL=t@t.io
export GIT_COMMITTER_NAME=T GIT_COMMITTER_EMAIL=t@t.io
# The derived gate must not background the CI watcher out of a test fixture.
export AGENT_CI_WATCH=0

# ===========================================================================
# FIXTURE — a blueprint whose HEAD is this repo's HEAD.
# ===========================================================================
BP="$WORK/blueprint"
mkdir -p "$BP"
# checkout-index needs an index, and the real one must not be touched — so read
# HEAD into a throwaway. It preserves file MODES, which `git show` would not:
# a hook that arrives non-executable is silently never run (BUG-008).
(
  export GIT_INDEX_FILE="$WORK/fixture-index"
  git -C "$ROOT" read-tree HEAD || exit 1
  git -C "$ROOT" checkout-index -a -f --prefix="$BP/" || exit 1
) || { echo "FAIL: could not materialise HEAD into the fixture"; exit 1; }

n_copied=$(find "$BP" -type f | wc -l)
if [ "$n_copied" -lt 50 ]; then
  echo "FAIL: materialised only $n_copied tracked files — the fixture is not a blueprint, so nothing below proves anything"
  exit 1
fi

# The blueprint tracks several files that are ALSO in its .gitignore (the
# public-publishing privacy block). `git add -A` respects .gitignore, so the
# fixture would silently drop them and stop mirroring what really ships.
(
  cd "$BP"
  git init -q .
  git add -A
  git ls-files --others --ignored --exclude-standard -z | xargs -0 -r git add -f
  git commit -qm "fixture blueprint from HEAD"
) >/dev/null 2>&1
if [ ! -d "$BP/.git" ]; then
  echo "FAIL: could not init the fixture blueprint"
  exit 1
fi

if [ ! -f "$BP/scripts/new-project.sh" ]; then
  echo "FAIL: fixture has no new-project.sh"
  exit 1
fi
if [ ! -d "$BP/templates" ]; then
  echo "FAIL: fixture has no templates/ — it is not a blueprint"
  exit 1
fi

# ===========================================================================
# 1. BOOTSTRAP — the operator's very first command.
# ===========================================================================
# The directory BASENAME must equal the project name. `drift` and `pull` derive
# the name from ${PWD##*/}, not from .blueprint-source, so a mismatch produces
# false drift on every substituted file — and would have made #4 fail for a
# reason that has nothing to do with the bug. Real bootstraps agree by default
# (`new-project.sh acme-flow` → …/acme-flow); the fixture must too.
TARGET="$WORK/derived-proj"
boot="$( cd "$BP" && bash scripts/new-project.sh derived-proj "$TARGET" 2>&1 )"
boot_rc=$?
if [ "$boot_rc" -ne 0 ]; then
  fail "#1 bootstrap exited non-zero — nothing below can run"
  printf '%s\n' "$boot" | tail -15 | sed 's/^/      /'
  echo "FAILED: see the FAIL lines above."
  exit 1
fi
pass "#1 bootstrap completed"

# ===========================================================================
# 2. THE GATE — the operator's SECOND command is `git push`, and this is what
#    happens then. The whole suite exists for this line.
# ===========================================================================
gate="$( cd "$TARGET" && sh .githooks/pre-push origin \
           git@example.com:acme/derived-proj.git </dev/null 2>&1 )"
gate_rc=$?

if [ "$gate_rc" -ne 0 ]; then
  fail "#2 a freshly bootstrapped project CANNOT pass its own pre-push gate (exit $gate_rc)"
  printf '%s\n' "$gate" | sed 's/^/      /'
else
  pass "#2 a freshly bootstrapped project passes its own pre-push gate"
fi

# ===========================================================================
# 3. NON-VACUITY — green must mean "the gate ran and passed", never "the gate
#    ran nothing".
#
#    This is the assertion that makes #2 worth having. The cheapest way to make
#    a bootstrapped gate green is to stop shipping `.githooks/pre-push-project`
#    altogether, at which point every suite silently leaves the push path and
#    the pipeline still renders PASSED over `project guards · skipped`. That is
#    BUG-004 and A-22 restored through the bootstrap door, and #2 alone would
#    applaud it. So require that the derived gate actually EXECUTED a
#    substantial number of stages.
# ===========================================================================
stages="$(printf '%s\n' "$gate" | sed -n 's/.*PASSED[^0-9]*\([0-9][0-9]*\) stages.*/\1/p' | tail -1)"
if [ "$gate_rc" -ne 0 ]; then
  echo "  (#3 not evaluated — the gate did not pass)"
elif [ -z "$stages" ]; then
  fail "#3 could not read a stage count from the derived gate's summary — 'passed' is unverified"
elif [ "$stages" -lt 25 ]; then
  fail "#3 the derived gate passed only $stages stages — it is green because it runs almost nothing, which is the A-22 defect"
else
  pass "#3 the derived gate passed $stages real stages (green because it ran, not because it is empty)"
fi

# ===========================================================================
# 4. DRIFT — the OTHER command CLAUDE.md mandates on every wake, run against a
#    zero-second-old project. It reported 5 drifted files: the hand-maintained
#    substitution list in new-project.sh had gone stale, and its raw `sed` knew
#    nothing of {{PROJECT_NAME_UPPER}}. Both of the first two commands a new
#    project runs were lying to it.
# ===========================================================================
drift="$( cd "$TARGET" && bash scripts/blueprint drift 2>&1 )"
if printf '%s\n' "$drift" | grep -q 'Drifted (project'; then
  fail "#4 a zero-second-old bootstrap already reports drift against its own source"
  printf '%s\n' "$drift" | sed -n '/Drifted/,/^$/p' | sed 's/^/      /'
elif ! printf '%s\n' "$drift" | grep -q 'blueprint-managed files match'; then
  fail "#4 drift did not report a clean checkout, and did not report drift either — its verdict is unreadable"
  printf '%s\n' "$drift" | tail -12 | sed 's/^/      /'
else
  pass "#4 a fresh bootstrap is drift-clean against its own source"
fi

# ===========================================================================
# 5. NO PLACEHOLDER SURVIVES in a file the sync CLI manages. Drift compares
#    only MANAGED_FILES against a SUBSTITUTED blueprint copy, so it is silent
#    about a template file bootstrap forgot — and an unsubstituted
#    {{PROJECT_NAME}} in a shipped config reads as a broken install.
# ===========================================================================
leftover=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$TARGET/$f" ] || continue
  # These carry the token as CODE and are exempt by design — the same list
  # bp_should_substitute holds. Named literally rather than sourced, so a
  # mistake that widens the exemption cannot also silence this check.
  case "$f" in
    *scripts/blueprint|*scripts/new-project.sh) continue ;;
    *scripts/lib/placeholders.sh|*scripts/lib/contamination.sh) continue ;;
  esac
  if grep -q '{{PROJECT_NAME' "$TARGET/$f" 2>/dev/null; then
    leftover="$leftover $f"
  fi
done < <(bash "$BP/scripts/blueprint" files 2>/dev/null | sed -n 's/^  \([^ ].*\)$/\1/p')
if [ -n "$leftover" ]; then
  fail "#5 blueprint-managed files reached the project with the placeholder intact:$leftover"
else
  pass "#5 every managed/template file was substituted at bootstrap"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-028 — a fresh bootstrap passes its own gate, and is drift-clean."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
