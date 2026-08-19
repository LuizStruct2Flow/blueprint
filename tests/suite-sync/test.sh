#!/bin/bash
# tests/suite-sync/test.sh
#
# BUG-029 — a derived project's test suites never update.
#
# `tests/` was absent from MANAGED_FILES. Bootstrap seeds the suites via
# `git archive`, and `blueprint pull` then walks MANAGED_FILES file by file and
# never touches them again. So every derived project's suites are frozen at the
# commit it was bootstrapped from while the machinery they test — `blueprint`
# itself, `signal-set.sh`, the feed, the hooks, the gate renderer — keeps being
# pulled forward. A stale suite still passes, so the gate goes green over
# assertions about code the project no longer runs. Same shape as BUG-004 and
# A-22 once more: the gate looks armed and is measuring the wrong thing, and the
# failure is invisible because it is an ABSENCE of updates rather than an error.
#
# What this suite pins, and why each one is here rather than assumed:
#
#   1. The expansion is `git archive HEAD <dir>`, and NOT `git check-attr`.
#      A trailing-slash directory pattern in `.gitattributes` does not propagate
#      to the files underneath it, so `check-attr` reports `unspecified` for a
#      suite `git archive` genuinely drops. tests/manifest:139-141 rejected
#      check-attr for the same reason; this pins the trap so nobody re-walks it.
#   2. A suite the blueprint adds actually ARRIVES, and drift is quiet after.
#   3. A suite carrying a literal `{{PROJECT_NAME}}` arrives byte-identical.
#      Three real suites (state-dir, pull-behaviour, a2bp-contamination) carry
#      the token as DATA — they drive the substitution itself. They were safe
#      only while `tests/` was unmanaged. This is the BUG-028 self-corruption
#      class, one directory over.
#   4/5. There is deliberately NO delete path (see the block at #5).
#   6. `.githooks/pre-push-project` travels with the suites, or the derived gate
#      cannot invoke what it just received.
#   7. `a2bp` accepts a file under a managed DIRECTORY, and only under it.
#
# Run from the blueprint repo root:  bash tests/suite-sync/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers. The pre-push gate runs this
# suite, git exports GIT_DIR to every hook, and everything below does `git init`
# and `git commit` inside fixtures. With GIT_DIR set, `cd` protects nothing.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

export GIT_AUTHOR_NAME=T GIT_AUTHOR_EMAIL=t@t.io
export GIT_COMMITTER_NAME=T GIT_COMMITTER_EMAIL=t@t.io

git_c(){ git -C "$1" -c user.email=t@t.io -c user.name=T "${@:2}"; }

# ===========================================================================
# FIXTURE — a minimal blueprint with a tests/ tree, one export-ignore'd suite,
# and a marker-bearing .githooks/pre-push-project.
#
# Minimal rather than a copy of HEAD: the property under test is how the sync
# CLI treats a managed DIRECTORY, and a fixture small enough to read in full is
# the one where a surprising result means what it says. `bootstrap-gate` covers
# the real tree end to end.
# ===========================================================================
BP="$WORK/bp"
mkdir -p "$BP/docs" "$BP/scripts" "$BP/.githooks" \
         "$BP/tests/alpha" "$BP/tests/beta" "$BP/tests/bponly" "$BP/tests/manifest"

printf '# CLAUDE for {{PROJECT_NAME}}\n' > "$BP/CLAUDE.md"
printf '# DoD\n'                         > "$BP/docs/DoD.md"
cp "$ROOT/scripts/blueprint" "$BP/scripts/blueprint"
cp -r "$ROOT/scripts/lib" "$BP/scripts/lib"
cp "$ROOT/tests/manifest/test.sh" "$BP/tests/manifest/test.sh"
touch "$BP/.blueprint-root"

printf 'echo alpha v1\n'                     > "$BP/tests/alpha/test.sh"
# The BUG-028 class: a suite whose FIXTURE DATA is the placeholder itself.
printf 'echo "literal {{PROJECT_NAME}} token"\n' > "$BP/tests/beta/test.sh"
printf 'echo bponly\n'                        > "$BP/tests/bponly/test.sh"

# A directory pattern with a trailing slash — the exact shape whose
# non-propagation to contained files makes `git check-attr` the wrong oracle.
printf 'tests/bponly/   export-ignore\n' > "$BP/.gitattributes"

bp_suites(){
  {
    printf '| Suite | Tier | Risk if absent | Rationale for the tier |\n'
    printf '|---|---|---|---|\n'
    for s in "$@"; do
      printf '| `%s` | both | fixture | fixture risk rationale |\n' "$s"
    done
  } > "$BP/tests/SUITES.md"
}
bp_suites alpha beta manifest

bp_hook(){
  {
    printf '#!/bin/sh\n'
    printf '# BLUEPRINT:BEGIN\n'
    printf 'blueprint_region_version=%s\n' "$1"
    printf '# BLUEPRINT:END\n'
  } > "$BP/.githooks/pre-push-project"
}
bp_hook 1

git_c "$BP" init -q
git_c "$BP" add -A
git_c "$BP" commit -qm "fixture blueprint"
BP_SHA="$(git -C "$BP" rev-parse HEAD)"

new_project(){
  local P="$1"
  rm -rf "$P"; mkdir -p "$P/docs"
  printf '# CLAUDE for proj\n' > "$P/CLAUDE.md"
  printf '# DoD\n'             > "$P/docs/DoD.md"
  {
    printf 'config_version   = 2\n'
    printf 'blueprint_source = %s\n' "$BP"
    printf 'blueprint_remote = git@github.com:owner/bp.git\n'
    printf 'blueprint_branch = main\n'
    printf 'bootstrap_sha    = %s\n' "$BP_SHA"
    printf 'bootstrap_date   = 2026-01-01\n'
  } > "$P/.blueprint-source"
  git_c "$P" init -q
  git_c "$P" add -A
  git_c "$P" commit -qm init
}

# `blueprint drift` renders "+ path" for new and "~ path" for drifted. Colour is
# off with no tty, so the prefixes are literal.
drift_new(){ printf '%s\n' "$1" | sed -n 's/^  + //p'; }
drift_mod(){ printf '%s\n' "$1" | sed -n 's/^  ~ //p'; }

archive_tests(){ git -C "$1" archive --format=tar HEAD tests 2>/dev/null | tar -t 2>/dev/null | grep -v '/$'; }

# ===========================================================================
# 1. THE EXPANSION IS THE ARCHIVE LISTING — and `git check-attr` is not it.
# ===========================================================================
P="$WORK/proj"
new_project "$P"
out="$( cd "$P" && bash "$BP/scripts/blueprint" drift 2>&1 )"

got="$(drift_new "$out" | grep '^tests/' | LC_ALL=C sort)"
want="$(archive_tests "$BP" | LC_ALL=C sort)"

if [ -z "$got" ]; then
  fail "#1 drift reported NO new tests/ files — the managed directory is not expanded at all (this is BUG-029)"
elif [ "$got" != "$want" ]; then
  fail "#1 the expanded set is not the archive listing.
      only in expansion: $(comm -23 <(printf '%s\n' "$got") <(printf '%s\n' "$want") | tr '\n' ' ')
      only in archive:   $(comm -13 <(printf '%s\n' "$got") <(printf '%s\n' "$want") | tr '\n' ' ')"
else
  pass "#1 the expansion equals 'git archive HEAD tests' exactly ($(printf '%s\n' "$got" | grep -c .) files)"
fi

if printf '%s\n' "$got" | grep -q '^tests/bponly/'; then
  fail "#1b an export-ignore'd suite was offered to the project — it cannot run there"
else
  pass "#1b an export-ignore'd suite is absent from the expansion"
fi

# --- 1c. THE TRAP, pinned. --------------------------------------------------
# `git check-attr export-ignore tests/bponly/test.sh` reports `unspecified`,
# because a trailing-slash directory pattern does not propagate to the files
# under it. A future reader WILL reach for check-attr as the obvious query; this
# case proves it gives the wrong answer while `git archive` gives the right one.
attr="$( cd "$BP" && git check-attr export-ignore -- tests/bponly/test.sh 2>&1 )"
if ! printf '%s' "$attr" | grep -q 'unspecified'; then
  pass "#1c (check-attr now reports '$attr' — the trap is gone; the archive oracle is still correct)"
elif archive_tests "$BP" | grep -q '^tests/bponly/'; then
  fail "#1c the archive shipped an export-ignore'd suite — the oracle itself is broken"
else
  pass "#1c check-attr says 'unspecified' for a file git archive genuinely drops — archive is the only usable oracle"
fi

# --- 1d. And the real repo's blueprint-tier suites stay out of the set. ------
if [ -f "$ROOT/.blueprint-root" ]; then
  real="$(archive_tests "$ROOT")"
  leaked=""
  for s in bootstrap-contents bootstrap-identity drift-in-blueprint pull-exec-bit template-source bootstrap-gate; do
    printf '%s\n' "$real" | grep -q "^tests/$s/" && leaked="$leaked $s"
  done
  if [ -n "$leaked" ]; then
    fail "#1d blueprint-only suites are in the set 'blueprint pull' would push to every project:$leaked"
  else
    pass "#1d every blueprint-tier suite is absent from what pull would sync"
  fi
else
  pass "#1d (skipped — not the blueprint checkout, so there are no blueprint-tier suites here)"
fi

# ===========================================================================
# 2. A SUITE THE BLUEPRINT ADDS ACTUALLY ARRIVES, and drift is quiet after.
# ===========================================================================
( cd "$P" && bash "$BP/scripts/blueprint" pull --yes ) </dev/null >/dev/null 2>&1
if [ ! -f "$P/tests/alpha/test.sh" ]; then
  fail "#2 pull did not create tests/alpha/test.sh — a derived project never receives a new suite"
elif [ -f "$P/tests/bponly/test.sh" ]; then
  fail "#2 pull delivered an export-ignore'd suite"
else
  pass "#2 pull creates the suite directories the blueprint ships"
fi

out2="$( cd "$P" && bash "$BP/scripts/blueprint" drift 2>&1 )"
noisy="$( { drift_new "$out2"; drift_mod "$out2"; } | grep '^tests/' || true )"
if [ -n "$noisy" ]; then
  fail "#2b drift still reports tests/ after a full pull: $(printf '%s' "$noisy" | tr '\n' ' ')"
else
  pass "#2b drift is clean on tests/ after the pull"
fi

# ===========================================================================
# 3. A LITERAL {{PROJECT_NAME}} SURVIVES BYTE-FOR-BYTE (BUG-028 class).
#
#    Substituting it would rewrite the fixture data a suite asserts about, and
#    then drift would compare a substituted blueprint copy against a substituted
#    project copy of a file that no longer contains the token — reporting drift
#    forever on a file pull cannot make match.
# ===========================================================================
if ! cmp -s "$BP/tests/beta/test.sh" "$P/tests/beta/test.sh"; then
  fail "#3 a suite carrying a literal {{PROJECT_NAME}} was rewritten on the way in:
      blueprint: $(cat "$BP/tests/beta/test.sh")
      project:   $(cat "$P/tests/beta/test.sh")"
elif printf '%s\n' "$noisy" | grep -q 'tests/beta'; then
  fail "#3 drift reports tests/beta/test.sh as drifted after pulling it — pull cannot make it match"
else
  pass "#3 a suite carrying the literal placeholder arrives byte-identical and drift stays quiet"
fi

# ===========================================================================
# 4. A PROJECT-AUTHORED SUITE IS NEITHER REPORTED NOR REMOVED.
#
#    The blueprint has no way to know a project wrote it, so sync must be
#    additive-only in this direction. If pull ever grows a delete path this is
#    the case that fails.
# ===========================================================================
mkdir -p "$P/tests/project-thing"
printf 'echo mine\n' > "$P/tests/project-thing/test.sh"
out4="$( cd "$P" && bash "$BP/scripts/blueprint" drift 2>&1 )"
( cd "$P" && bash "$BP/scripts/blueprint" pull --yes ) </dev/null >/dev/null 2>&1
if printf '%s\n' "$out4" | grep -q 'project-thing'; then
  fail "#4 drift reported a project-authored suite — it is not the blueprint's to have an opinion about"
elif [ ! -f "$P/tests/project-thing/test.sh" ]; then
  fail "#4 pull REMOVED a project-authored suite — the one failure mode worse than the bug"
elif [ "$(cat "$P/tests/project-thing/test.sh")" != "echo mine" ]; then
  fail "#4 pull rewrote a project-authored suite"
else
  pass "#4 a project-authored suite is neither reported by drift nor touched by pull"
fi

# ===========================================================================
# 5. A SUITE THE BLUEPRINT DROPS IS LEFT IN PLACE — and tests/manifest is what
#    announces it.
#
#    There is deliberately NO delete path. The information that distinguishes
#    "the blueprint deleted this" from "the project wrote this" does not exist
#    in the project, and a prefix-based delete would take out #4's file. So the
#    orphan stays, and the control that already exists names it: tests/manifest
#    #1 fails the derived push on a suite directory with no row in SUITES.md.
#    Fail-closed, by name, with nothing new to build.
# ===========================================================================
git_c "$BP" rm -q -r tests/alpha
bp_suites beta manifest
git_c "$BP" add -A
git_c "$BP" commit -qm "drop alpha"
( cd "$P" && bash "$BP/scripts/blueprint" pull --yes ) </dev/null >/dev/null 2>&1

if [ ! -f "$P/tests/alpha/test.sh" ]; then
  fail "#5 pull deleted a suite the blueprint dropped — it cannot tell that from deleting a project's own"
else
  man="$( cd "$P" && bash tests/manifest/test.sh 2>&1 )"
  if printf '%s\n' "$man" | grep '#1 ' | grep -q 'alpha'; then
    pass "#5 the dropped suite stays, and tests/manifest #1 fails the derived push naming it"
  else
    fail "#5 the dropped suite stays but nothing announces it — tests/manifest #1 did not name 'alpha':
$(printf '%s\n' "$man" | grep '#1 ' | sed 's/^/      /')"
  fi
fi

# ===========================================================================
# 6. .githooks/pre-push-project TRAVELS, AND PROJECT GUARDS SURVIVE IT.
#
#    A suite is coherent only as three things: the files, its SUITES.md row, and
#    its invocation in the gate. Managing tests/ alone delivers the first two —
#    SUITES.md lives under tests/ — and not the third, at which point
#    tests/manifest #4 fails every derived push on a suite the gate cannot
#    invoke. So the hook is managed too, and the markers are what let it be
#    managed without eating the project's own guards.
# ===========================================================================
P6="$WORK/proj6"
new_project "$P6"
mkdir -p "$P6/.githooks"
{
  printf '#!/bin/sh\n'
  printf '# BLUEPRINT:BEGIN\n'
  printf 'blueprint_region_version=1\n'
  printf '# BLUEPRINT:END\n'
  printf 'echo "my project guard"\n'
} > "$P6/.githooks/pre-push-project"

bp_hook 2
git_c "$BP" add -A
git_c "$BP" commit -qm "hook v2"
( cd "$P6" && bash "$BP/scripts/blueprint" pull --yes ) </dev/null >/dev/null 2>&1

merged="$(cat "$P6/.githooks/pre-push-project" 2>/dev/null || true)"
if ! printf '%s\n' "$merged" | grep -q 'blueprint_region_version=2'; then
  fail "#6 the blueprint region did not update — the hook does not travel, so a new suite arrives with nothing to invoke it"
elif ! printf '%s\n' "$merged" | grep -q 'my project guard'; then
  fail "#6 the project's own guards after BLUEPRINT:END were destroyed by the pull"
else
  pass "#6 the blueprint region updates and the project's guards after BLUEPRINT:END survive"
fi

# ===========================================================================
# 7. a2bp ACCEPTS A FILE UNDER A MANAGED DIRECTORY — and only under it.
#
#    cmd_a2bp deliberately never calls read_blueprint_source: it works against
#    the fetched REMOTE base, not a local checkout, so it has no HEAD to expand
#    `tests/` from and validates against the raw MANAGED_FILES list. An exact
#    `grep -qxF` therefore refuses every suite. The prefix rule is what closes
#    that, and the prefix must not over-match a sibling like `testsuite/`.
# ===========================================================================
. "$ROOT/scripts/lib/request-inputs.sh"

A="$WORK/a2bp"
mkdir -p "$A/tests/pipeline" "$A/testsuite"
printf 'x\n' > "$A/tests/pipeline/test.sh"
printf 'x\n' > "$A/testsuite/test.sh"
printf 'x\n' > "$A/CLAUDE.md"
MAN="$WORK/managed"
printf '%s\n' "CLAUDE.md" "tests/" > "$MAN"

b7=0
bp_inputs_validate "$A" "$MAN" tests/pipeline/test.sh >/dev/null 2>&1 || {
  fail "#7 a file under the managed directory 'tests/' was refused — a2bp cannot back-propagate any suite"
  b7=1
}
if bp_inputs_validate "$A" "$MAN" tests/bootstrap-contents/test.sh >/dev/null 2>&1; then
  fail "#7 a suite absent from this project was accepted — a2bp would file bytes that are not there"
  b7=1
fi
if bp_inputs_validate "$A" "$MAN" testsuite/test.sh >/dev/null 2>&1; then
  fail "#7 the 'tests/' prefix matched 'testsuite/' — a prefix rule must respect the separator"
  b7=1
fi
if bp_inputs_validate "$A" "$MAN" tests >/dev/null 2>&1; then
  fail "#7 the bare directory 'tests' was accepted as an input"
  b7=1
fi
[ "$b7" -eq 0 ] && pass "#7 a2bp accepts files under a managed directory, and refuses absent ones, siblings and the directory itself"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-029 — a managed directory syncs, additively, without eating project-owned files."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
