#!/bin/bash
# tests/drift-in-blueprint/test.sh
#
# BUG-007: `blueprint drift` must complete inside the blueprint repository itself.
#
# CLAUDE.md §"Wake-time drift check" makes `blueprint drift` MANDATORY on every
# fresh session. In the blueprint's own repo there is no `.blueprint-source` —
# correctly, it is the source — so the command died with "not a struct2flow
# project", which is both wrong and the most confusing possible thing to tell
# someone standing in struct2flow. The wake ritual could not complete.
#
# The fix must not be "stop dying" in general: a directory that genuinely is not
# a struct2flow project MUST still fail loudly, or the check becomes decoration.
# So detection has to be positive — you are in the blueprint when the CLI you are
# running belongs to the repo you are standing in.
#
# Run from the blueprint repo root:  bash tests/drift-in-blueprint/test.sh
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

# ===========================================================================
# 1. THE REPRODUCER. Run from the real blueprint checkout — the exact thing the
#    founder hit at wake.
# ===========================================================================
out=$(cd "$ROOT" && "$CLI" drift 2>&1 </dev/null)
rc=$?
if [ "$rc" -ne 0 ]; then
  fail "#1 'blueprint drift' exited $rc in the blueprint's own repo — the wake ritual cannot complete. Output:
$out"
elif printf '%s' "$out" | grep -q 'not a struct2flow project'; then
  fail "#1 drift told the blueprint it is 'not a struct2flow project'"
else
  pass "#1 'blueprint drift' completes inside the blueprint itself"
fi

# It must SAY which case it is, not just exit quietly. A silent success is
# indistinguishable from a check that did nothing.
if ! printf '%s' "$out" | grep -qi 'blueprint itself\|is the blueprint\|source of truth'; then
  fail "#1b drift exited 0 but never said it is standing in the blueprint — a quiet exit reads as a no-op"
else
  pass "#1b it names the case rather than exiting quietly"
fi

# ===========================================================================
# 2. THE GATE MUST STILL ARM. This is BUG-004's lesson and it is the reason the
#    arming call sits BEFORE the config read. A fix that reorders or short-
#    circuits the function must not silently drop it — that would re-open a bug
#    the founder already rejected once.
# ===========================================================================
C="$WORK/clone"
git init -q "$C"
(
  cd "$C"
  git config user.email t@local
  git config user.name t
  mkdir -p .githooks scripts/lib
  printf '#!/bin/sh\nexit 0\n' > .githooks/pre-push
  chmod +x .githooks/pre-push
  cp "$ROOT/scripts/blueprint" scripts/blueprint
  cp "$ROOT"/scripts/lib/*.sh scripts/lib/ 2>/dev/null
  printf 'x\n' > f.txt
  git add -A
  git -c commit.gpgsign=false commit -q -m init
) 2>/dev/null
git -C "$C" config --unset core.hooksPath 2>/dev/null

( cd "$C" && ./scripts/blueprint drift >/dev/null 2>&1 </dev/null )
armed=$(git -C "$C" config --get core.hooksPath 2>/dev/null)
if [ "$armed" != ".githooks" ]; then
  fail "#2 drift did not arm the gate in an unarmed clone (core.hooksPath='$armed') — BUG-004 regression"
else
  pass "#2 the gate is still armed even on the blueprint-itself path (BUG-004 holds)"
fi

# ===========================================================================
# 3. A DIRECTORY THAT IS NOT A STRUCT2FLOW PROJECT MUST STILL FAIL.
#    The bug is "drift is confused about the blueprint", not "drift should stop
#    complaining". Widening the fix into 'never fail' would turn the mandatory
#    wake check into decoration.
# ===========================================================================
N="$WORK/notaproject"
mkdir -p "$N"
git init -q "$N" 2>/dev/null
out=$(cd "$N" && "$CLI" drift 2>&1 </dev/null)
rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#3 drift SUCCEEDED in a directory that is not a struct2flow project — the check is now decoration"
elif ! printf '%s' "$out" | grep -q 'no .blueprint-source'; then
  fail "#3 it failed, but not with the actionable message: $out"
else
  pass "#3 a genuine non-project still fails loudly, naming the missing file"
fi

# ===========================================================================
# 4. A REAL DERIVED PROJECT STILL DRIFTS NORMALLY. The blueprint-detection must
#    not hijack the ordinary path — that is the only path that actually compares
#    files, and breaking it would be a far worse bug than the one being fixed.
# ===========================================================================
BP="$WORK/bp"
mkdir -p "$BP/docs"
printf '# CLAUDE\nshared\n' > "$BP/CLAUDE.md"
printf '# DoD\nshared\n'    > "$BP/docs/DoD.md"
(
  cd "$BP"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  git add -A && git -c commit.gpgsign=false commit -q -m base
) 2>/dev/null

P="$WORK/derived"
mkdir -p "$P/docs"
printf '# CLAUDE\nshared\n'    > "$P/CLAUDE.md"
printf '# DoD\nDRIFTED HERE\n' > "$P/docs/DoD.md"
(
  cd "$P"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  {
    printf 'blueprint_source = %s\n' "$BP"
    printf 'bootstrap_sha    = %s\n' "$(git -C "$BP" rev-parse HEAD)"
    printf 'bootstrap_date   = 2026-01-01\n'
  } > .blueprint-source
  git add -A && git -c commit.gpgsign=false commit -q -m init
) 2>/dev/null

out=$(cd "$P" && "$CLI" drift 2>&1 </dev/null)
if ! printf '%s' "$out" | grep -q 'docs/DoD.md'; then
  fail "#4 a derived project's real drift was not reported — the blueprint-detection hijacked the normal path. Output:
$out"
elif printf '%s' "$out" | grep -qi 'is the blueprint'; then
  fail "#4 a derived project was misidentified AS the blueprint"
else
  pass "#4 a derived project still gets its normal file-by-file drift report"
fi

# ===========================================================================
# 5. DETECTION IS POSITIVE, NOT "no .blueprint-source means blueprint".
#    A project without the file is not the blueprint, and must not be treated
#    as one. This is the case that separates a real fix from "swallow the error".
# ===========================================================================
rm -f "$P/.blueprint-source"
out=$(cd "$P" && "$CLI" drift 2>&1 </dev/null)
rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#5 a project with a MISSING .blueprint-source was treated as the blueprint and passed"
else
  pass "#5 a project missing its config is not mistaken for the blueprint"
fi

# ===========================================================================
# 6. THE CASE THE FOUNDER ACTUALLY HIT, and the reason this bug is worth more
#    than a nicer error string.
#
#    `linkedin-watcher-agent` has AGENT_SIGNAL.md, .githooks/pre-push,
#    scripts/blueprint, STACK_DEFAULTS.md, Brewfile — it is unmistakably a
#    struct2flow project — and NO .blueprint-source. Measured 2026-07-30: three
#    of the four derived projects are in this state, so `drift` and `pull` have
#    never worked in any of them, and the sync model was silently doing nothing.
#
#    Telling that directory "not a struct2flow project (run from project root)"
#    is both false and useless: the founder IS in the project root. The message
#    must name what is missing and how to fix it, or the operator's next move is
#    to go looking for a bug in their own cwd.
# ===========================================================================
U="$WORK/unregistered"
mkdir -p "$U/.githooks" "$U/scripts" "$U/docs"
git init -q "$U" 2>/dev/null
printf 'sig\n'   > "$U/AGENT_SIGNAL.md"
printf 'stack\n' > "$U/STACK_DEFAULTS.md"
printf 'brew\n'  > "$U/Brewfile"
printf '#!/bin/sh\nexit 0\n' > "$U/.githooks/pre-push"
cp "$ROOT/scripts/blueprint" "$U/scripts/blueprint"

out=$(cd "$U" && "$CLI" drift 2>&1 </dev/null)
rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#6 an unregistered project passed drift — it has nothing to compare against, so a green result is a lie"
elif printf '%s' "$out" | grep -q 'not a struct2flow project'; then
  fail "#6 told an obvious struct2flow project that it is 'not a struct2flow project'. Output:
$out"
elif ! printf '%s' "$out" | grep -qi 'never registered\|not registered\|adopt'; then
  fail "#6 the refusal does not say the project is unregistered. Output:
$out"
elif ! printf '%s' "$out" | grep -q 'blueprint_source'; then
  fail "#6 the refusal does not show the config lines to add. Output:
$out"
else
  pass "#6 an unregistered-but-obvious struct2flow project is told so, with the lines to add"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-007 — drift completes in the blueprint and still refuses non-projects."
  exit 0
fi
echo "FAILED: BUG-007."
exit 1
