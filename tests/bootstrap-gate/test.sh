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
# BUG-029 R3 — the FOURTH instance of the swallow, found by sweeping for it, and
# it is in the control rather than the code: this list used to be consumed as
# `done < <(bash … files | sed …)`, so a failing `blueprint files` produced an
# empty stream, the loop body never ran, `leftover` stayed empty and #5 PASSED.
# A check that cannot fail is worth less than no check, because it is counted.
# Resolved and asserted non-empty first, then fed in.
_managed_list="$(bash "$BP/scripts/blueprint" files 2>/dev/null)"
_managed_rc=$?
# R4 — the status, THEN the shape. Checking only for emptiness covers a command
# that fails silently and misses the one that fails after printing part of its
# output: the list looks healthy, the loop runs over a prefix of it, and every
# file the CLI never named goes unchecked while the case still says "ok".
if [ "$_managed_rc" -ne 0 ]; then
  fail "#5 'blueprint files' exited $_managed_rc — a partial list would let this case pass over the files it never saw"
elif [ -z "$_managed_list" ]; then
  fail "#5 'blueprint files' produced nothing — the placeholder check below would have passed over an empty list"
fi
leftover=""
_seen=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  _seen=$((_seen + 1))
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
done <<EOF
$(printf '%s\n' "$_managed_list" | sed -n 's/^  \([^ ].*\)$/\1/p')
EOF
if [ -n "$leftover" ]; then
  fail "#5 blueprint-managed files reached the project with the placeholder intact:$leftover"
elif [ "$_seen" -lt 20 ]; then
  fail "#5 examined only $_seen managed paths — the list is broken, so this proved nothing"
else
  pass "#5 every managed/template file was substituted at bootstrap ($_seen paths examined)"
fi

# ===========================================================================
# 6. THE SECOND SYNC — `blueprint pull --yes`, then the project's own manifest.
#
#    BUG-029. `tests/` is now a managed DIRECTORY, so pull writes into the one
#    tree the gate reads its own membership from. Two things have to hold at
#    once and neither is visible from either side alone:
#
#      - Pull over a zero-second-old bootstrap must be a NO-OP. Bootstrap seeds
#        the suites from `git archive` and pull re-derives that same set from
#        HEAD; if the two disagree by so much as a substitution, every project
#        gets a spurious diff on its suites at the first wake. Three suites
#        carry a literal {{PROJECT_NAME}} as fixture data, so this is exactly
#        where the BUG-028 self-corruption class would land next.
#      - `tests/manifest` must still pass afterwards. It is the control that
#        asserts every suite on disk is classified and every blocking suite is
#        invoked by the gate — i.e. the control that fails if the suites and
#        `.githooks/pre-push-project` ever arrive out of step with each other.
# ===========================================================================
pull="$( cd "$TARGET" && bash scripts/blueprint pull --yes </dev/null 2>&1 )"
pull_rc=$?
if [ "$pull_rc" -ne 0 ]; then
  fail "#6 'blueprint pull --yes' failed on a zero-second-old bootstrap (exit $pull_rc)"
  printf '%s\n' "$pull" | tail -12 | sed 's/^/      /'
elif ! printf '%s\n' "$pull" | grep -q 'Nothing to pull'; then
  fail "#6 pull found work to do on a zero-second-old bootstrap — bootstrap and pull disagree about what the project should contain"
  printf '%s\n' "$pull" | grep -E '^(── |  (pulled|new file))' | head -20 | sed 's/^/      /'
else
  man="$( cd "$TARGET" && bash tests/manifest/test.sh 2>&1 )"
  if [ $? -ne 0 ]; then
    fail "#6 the derived project's own tests/manifest fails after a full pull — its suites and its gate are out of step"
    printf '%s\n' "$man" | grep '^FAIL' | sed 's/^/      /'
  else
    pass "#6 a full pull is a no-op on a fresh bootstrap, and the project's manifest still passes"
  fi
fi

# ===========================================================================
# 7. BOOTSTRAP FAILS LOUDLY, AND CREATES NOTHING, WHEN IT CANNOT RESOLVE THE
#    MANAGED-FILE LIST.
#
#    BUG-029 R3 (Andreas). `new-project.sh` consumed `blueprint files` through
#    `done < <(_synced_files)` — a process substitution, whose exit status is
#    discarded — and `_synced_files` was itself `blueprint files | sed`, whose
#    status is `sed`'s. Two nested swallows. The result is not a WRONG
#    substitution but NO substitution: an empty list means the loop body never
#    executes, so no guard placed inside it could ever fire.
#
#    Measured on the parent commit by breaking scripts/blueprint: bootstrap
#    printed "Substituted placeholders in 0 file(s)", then "Happy
#    struct2flowing", and exited 0 — delivering a project whose CLAUDE.md still
#    said {{PROJECT_NAME}} in five places. Worse than the drift case S1 closed:
#    a stale project is recoverable by pulling, a project that never had its
#    identity written is broken from its first minute, and BUG-028 established
#    that nothing downstream reports it.
#
#    ON THE TRIGGER, stated because the review's proposed one is not reachable:
#    `cmd_files` never calls read_blueprint_source, so `blueprint files` does
#    not expand `tests/` and CANNOT fail from the expansion. The defect is the
#    swallow itself, so this injects the failure directly rather than staging a
#    cause that does not exist. Writing the test around the unreachable trigger
#    would have produced a case that passes for the wrong reason.
#
#    Deliberately LAST: it breaks the shared fixture blueprint's CLI in place.
# ===========================================================================
TARGET2="$WORK/derived-broken"
printf 'exit 9\n' > "$BP/scripts/blueprint"
boot2="$( cd "$BP" && bash scripts/new-project.sh derived-broken "$TARGET2" 2>&1 )"
boot2_rc=$?
b7=0
if [ "$boot2_rc" -eq 0 ]; then
  fail "#7 bootstrap EXITED 0 with an unusable 'blueprint files' — a caller cannot tell that from a good project"
  b7=1
fi
if ! printf '%s\n' "$boot2" | grep -qi "blueprint files"; then
  fail "#7 the failure never names 'blueprint files', so the operator cannot act on it:
$(printf '%s\n' "$boot2" | tail -4 | sed 's/^/      /')"
  b7=1
fi
if [ -e "$TARGET2" ]; then
  fail "#7 a half-built project was left at $TARGET2 — the 'fix it and re-run' path is then blocked by the 'Target already exists' guard"
  b7=1
fi
if printf '%s\n' "$boot2" | grep -q 'Happy struct2flowing'; then
  fail "#7 bootstrap reported success while substituting nothing"
  b7=1
fi
[ "$b7" -eq 0 ] && pass "#7 bootstrap refuses loudly (rc=$boot2_rc), names the cause, and creates nothing"

# 7b. THE OTHER HALF: a `blueprint files` that SUCCEEDS and lists nothing.
#
#     #7 drives the non-zero path. This one drives the path where the status is
#     0 and there is simply nothing to iterate — which is the case a status
#     check alone cannot catch, and the mirror image of the partial-output case
#     that a content check alone cannot catch. Both refusals in new-project.sh
#     need a case or one of them is only asserted by reading the source.
TARGET3="$WORK/derived-empty"
printf 'exit 0\n' > "$BP/scripts/blueprint"
boot3="$( cd "$BP" && bash scripts/new-project.sh derived-empty "$TARGET3" 2>&1 )"
boot3_rc=$?
b7b=0
if [ "$boot3_rc" -eq 0 ]; then
  fail "#7b bootstrap EXITED 0 on an empty file list — it would deliver a project with every placeholder still in it"
  b7b=1
fi
if [ -e "$TARGET3" ]; then
  fail "#7b a project was left at $TARGET3 despite there being no files to substitute"
  b7b=1
fi
if ! printf '%s\n' "$boot3" | grep -qi "no files\|listed no"; then
  fail "#7b the refusal does not distinguish an EMPTY list from a failed command:
$(printf '%s\n' "$boot3" | tail -4 | sed 's/^/      /')"
  b7b=1
fi
[ "$b7b" -eq 0 ] && pass "#7b a successful-but-empty file list is refused too (rc=$boot3_rc), and creates nothing"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-028 — a fresh bootstrap passes its own gate, and is drift-clean."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
