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

# ===========================================================================
# 8. AN EXPANSION THAT YIELDS NOTHING IS A HARD FAILURE, NOT AN EMPTY LIST.
#
#    Andreas, R2-S1. The first fix warned and carried on, which reproduced
#    BUG-029 INSIDE ITS OWN FIX: `tests/` expands to nothing, drift compares
#    zero suites, prints "✓ All blueprint-managed files match the blueprint
#    HEAD" and exits 0. A mechanism that is present, reports nothing, and whose
#    silence is indistinguishable from success — A-22, BUG-004, BUG-018,
#    BUG-028, and now the door built to close them.
#
#    Both halves are asserted, because either alone can pass while the defect
#    stands: a non-zero exit with no message leaves the operator nothing to act
#    on, and a message with exit 0 is what every caller and CI job reads as
#    success.
#
#    8 is the pipeline-ERROR path (`git archive` fails), 8b the EMPTY-RESULT
#    path. They are separate cases because the first one's status is the one
#    that disappears inside `$( a | b | c )` — c succeeds, so the failure is
#    invisible unless the stages are checked apart from each other.
# ===========================================================================
assert_expand_fails(){
  local label="$1" bpdir="$2" projdir="$3" why="$4"
  local o rc bad=0
  o="$( cd "$projdir" && bash "$bpdir/scripts/blueprint" drift 2>&1 )"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    fail "$label drift EXITED 0 with $why — a caller cannot tell that from a clean project (this is BUG-029 inside its own fix)"
    bad=1
  fi
  if printf '%s\n' "$o" | grep -q 'blueprint-managed files match'; then
    fail "$label drift reported the project CLEAN while syncing zero suites"
    bad=1
  fi
  if ! printf '%s\n' "$o" | grep -q "tests/"; then
    fail "$label the failure never names the managed entry, so nobody can act on it:
$(printf '%s\n' "$o" | tail -4 | sed 's/^/      /')"
    bad=1
  fi
  [ "$bad" -eq 0 ] && pass "$label refuses loudly (rc=$rc) and names the entry — $why"
}

# A blueprint whose HEAD has no `tests` path at all.
BP8="$WORK/bp8"
mkdir -p "$BP8/docs" "$BP8/scripts"
printf '# CLAUDE for {{PROJECT_NAME}}\n' > "$BP8/CLAUDE.md"
printf '# DoD\n'                         > "$BP8/docs/DoD.md"
cp "$ROOT/scripts/blueprint" "$BP8/scripts/blueprint"
cp -r "$ROOT/scripts/lib" "$BP8/scripts/lib"
git_c "$BP8" init -q
git_c "$BP8" add -A
git_c "$BP8" commit -qm "a blueprint with no tests/ at HEAD"

P8="$WORK/proj8"
mkdir -p "$P8/docs"
printf '# CLAUDE for proj8\n' > "$P8/CLAUDE.md"
printf '# DoD\n'              > "$P8/docs/DoD.md"
{
  printf 'config_version   = 2\n'
  printf 'blueprint_source = %s\n' "$BP8"
  printf 'bootstrap_sha    = %s\n' "$(git -C "$BP8" rev-parse HEAD)"
  printf 'bootstrap_date   = 2026-01-01\n'
} > "$P8/.blueprint-source"
git_c "$P8" init -q
git_c "$P8" add -A
git_c "$P8" commit -qm init
assert_expand_fails "#8" "$BP8" "$P8" "the managed directory is absent from HEAD ('git archive' fails)"

# 8b. The directory EXISTS and every file under it is export-ignore'd, so the
#     pipeline SUCCEEDS and returns nothing. This is the case a status check
#     alone would miss, which is why it is separate from #8.
mkdir -p "$BP8/tests/ghost"
printf 'echo ghost\n'            > "$BP8/tests/ghost/test.sh"
printf 'tests/   export-ignore\n' > "$BP8/.gitattributes"
git_c "$BP8" add -A
git_c "$BP8" commit -qm "tests/ present but entirely export-ignore'd"
if [ -n "$(archive_tests "$BP8")" ]; then
  fail "#8b fixture is wrong — the archive still ships files under tests/, so the empty-result path is not exercised"
else
  assert_expand_fails "#8b" "$BP8" "$P8" "every file under it is export-ignore'd (the pipeline succeeds and yields nothing)"
fi

# ===========================================================================
# 9. THE SUBSTITUTION PREDICATE IS ABOUT THE FILE, NOT ABOUT WHERE THE
#    BLUEPRINT LIVES.
#
#    Andreas, R2-S2. `substituted_blueprint_copy` was the one call site of five
#    passing an ABSOLUTE path to bp_should_substitute, so a rule with a leading
#    component matched against the checkout's own location. A blueprint under
#    any directory named `tests/` exempted EVERY managed file.
#
#    THE SYMPTOM IS ON THE COMPARISON PATH, NOT IN THE PULLED BYTES, and that
#    is worth being precise about because it is where I first aimed and missed.
#    `pull_file` substitutes via `substitute_placeholders "$f"`, which already
#    gets the relative path — so the file that LANDS is correct either way. What
#    breaks is the comparison: drift and pull both diff the project against
#    `substituted_blueprint_copy`, and with the exemption wrongly applied that
#    copy still holds `{{PROJECT_NAME}}` while the project holds the real name.
#    So every templated managed file reports DRIFTED forever, and every pull
#    re-pulls it and changes nothing. Sync becomes permanently, quietly wrong
#    for every project sourcing from that checkout — and the first version of
#    this case asserted the pulled bytes, which are fine, and passed against the
#    defect.
#
#    The fixture blueprint below lives at $WORK/tests/bp on purpose.
# ===========================================================================
BP9="$WORK/tests/bp"
mkdir -p "$BP9/docs" "$BP9/scripts" "$BP9/tests/alpha"
printf '# CLAUDE for {{PROJECT_NAME}}\n' > "$BP9/CLAUDE.md"
printf '# DoD\n'                         > "$BP9/docs/DoD.md"
printf 'echo alpha\n'                    > "$BP9/tests/alpha/test.sh"
cp "$ROOT/scripts/blueprint" "$BP9/scripts/blueprint"
cp -r "$ROOT/scripts/lib" "$BP9/scripts/lib"
git_c "$BP9" init -q
git_c "$BP9" add -A
git_c "$BP9" commit -qm "a blueprint that lives under a directory named tests"

P9="$WORK/proj9"
mkdir -p "$P9/docs"
printf '# DoD\n' > "$P9/docs/DoD.md"
{
  printf 'config_version   = 2\n'
  printf 'blueprint_source = %s\n' "$BP9"
  printf 'bootstrap_sha    = %s\n' "$(git -C "$BP9" rev-parse HEAD)"
  printf 'bootstrap_date   = 2026-01-01\n'
} > "$P9/.blueprint-source"
git_c "$P9" init -q
git_c "$P9" add -A
git_c "$P9" commit -qm init
( cd "$P9" && bash "$BP9/scripts/blueprint" pull --yes ) </dev/null >/dev/null 2>&1

b9=0
drift9="$( cd "$P9" && bash "$BP9/scripts/blueprint" drift 2>&1 )"

if [ ! -f "$P9/CLAUDE.md" ]; then
  fail "#9 the managed file was never pulled, so nothing about substitution was proved"
  b9=1
else
  # The bytes: correct on both code paths, asserted so a "fix" that stops
  # substituting altogether cannot pass the comparison assertion by making both
  # sides equally wrong.
  if grep -q '{{PROJECT_NAME' "$P9/CLAUDE.md"; then
    fail "#9 the pulled file still holds the raw placeholder: $(cat "$P9/CLAUDE.md")"
    b9=1
  fi
  if ! grep -q 'proj9' "$P9/CLAUDE.md"; then
    fail "#9 the project name is not in the pulled file: $(cat "$P9/CLAUDE.md")"
    b9=1
  fi
  # The comparison: THIS is the one the defect fails. With the predicate reading
  # the checkout's location, the blueprint side is compared unsubstituted and
  # CLAUDE.md reports drifted after every pull, forever.
  if drift_mod "$drift9" | grep -qx 'CLAUDE.md'; then
    fail "#9 a templated managed file reports DRIFTED immediately after being pulled — the exemption is matching the blueprint's own location ($BP9), so drift compares an unsubstituted copy"
    b9=1
  fi
fi

# And the suite under that same blueprint still must NOT be substituted — the
# narrower rule has to keep doing its job, not merely stop over-reaching.
if [ ! -f "$P9/tests/alpha/test.sh" ]; then
  fail "#9b the suite was never pulled from a blueprint under a tests/ path"
  b9=1
elif printf '%s\n' "$drift9" | grep -q 'tests/alpha'; then
  fail "#9b the suite reports drifted after being pulled — the tests/ exemption stopped applying"
  b9=1
fi
[ "$b9" -eq 0 ] && pass "#9 the predicate reads the file's repo-relative path, not the blueprint's location"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-029 — a managed directory syncs, additively, without eating project-owned files."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
