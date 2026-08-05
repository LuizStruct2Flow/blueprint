#!/bin/bash
# tests/dod-gate/test.sh
#
# TASK-007 — the DoD handoff checklist as pipeline stages.
#
# The stages exist so their ABSENCE is visible in the feed (the FEATURE-002
# argument applied to §7). That only holds if they actually FAIL when the thing
# they check is wrong — a stage that always passes is worse than none, because
# it adds a green to the count.
#
# So every case here drives a REAL failure and asserts the stage catches it.
#
# Run from the blueprint repo root:  bash tests/dod-gate/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers; this suite builds git fixtures.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY
# BUG-019 — never inherit the dispatcher's baton pointers.
unset AGENT_SIGNAL_FILE AGENT_STATE_HOME

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/dod-gate.sh"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$LIB" ] || { fail "#0 scripts/lib/dod-gate.sh missing"; echo FAILED; exit 1; }
pass "#0 the DoD gate lib is present"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# A fixture repo with a lifecycle tree, so the lib's relative paths resolve.
build() {
  W="$TMP/r$1"; rm -rf "$W"
  mkdir -p "$W/docs/backlog" "$W/docs/doing" "$W/docs/waiting-acceptance" \
           "$W/docs/done" "$W/tests/x" "$W/scripts/lib" "$W/logs/state"
  cp "$LIB" "$W/scripts/lib/"
  cp "$ROOT/scripts/lib/state-dir.sh" "$W/scripts/lib/"
  for f in backlog doing waiting-acceptance done; do
    printf '| # | Bug | Sev | Status | Detail |\n|---|---|---|---|---|\n' > "$W/docs/$f/BUGS.md"
    printf '| # | Item | Sev | Category | Trigger |\n|---|---|---|---|---|\n' > "$W/docs/$f/BACKLOG.md"
  done
  printf '| Field | Value |\n|---|---|\n| Holder | X |\n| State | ACTIVE |\n| Task | t |\n' \
    > "$W/logs/state/signal.md"
  git -C "$W" init -q -b main
  git -C "$W" config user.email t@e.com
  git -C "$W" config user.name t
  echo seed > "$W/f.txt"; git -C "$W" add -A
  git -C "$W" commit -q -m 'root'
  BASE="$(git -C "$W" rev-parse HEAD)"
}

# Run one stage inside the fixture. pipe_note is stubbed: the lib calls it, and
# the real one lives in the pipeline renderer which is not under test here.
run_stage() { # $1 = fn, $2 = range
  ( cd "$W" || exit 1
    pipe_note(){ :; }
    # shellcheck disable=SC1091
    . ./scripts/lib/dod-gate.sh
    "$1" "$2" ) >"$TMP/out" 2>&1
}

# ===========================================================================
# 1. §1b·1 — a commit naming an item with NO row anywhere must FAIL.
# ===========================================================================
build 1
echo a > "$W/a.txt"; git -C "$W" add -A
git -C "$W" commit -q -m 'BUG#99: fix a thing that has no backlog row'
if run_stage dod_stage_rows "$BASE..HEAD"; then
  fail "#1 a commit for an item with no row PASSED — the rule is unenforced"
else
  grep -q 'BUG-99' "$TMP/out" \
    && pass "#1 an item with no backlog row fails, and the message names it" \
    || fail "#1 it failed but did not say which item: $(cat "$TMP/out")"
fi

# ===========================================================================
# 2. The same commit PASSES once the row exists — and the zero-padding in the
#    row (BUG-099) must still match the commit's BUG#99.
#
#    This is the case that would silently make every run vacuous: a textual
#    compare finds nothing, so nothing is ever missing, so the stage always
#    passes.
# ===========================================================================
printf '| **BUG-099** | a thing | S3 | open | detail |\n' >> "$W/docs/doing/BUGS.md"
if run_stage dod_stage_rows "$BASE..HEAD"; then
  pass "#2 a zero-padded row (BUG-099) matches the commit's BUG#99"
else
  fail "#2 zero-padding defeated the match — every run would pass vacuously: $(cat "$TMP/out")"
fi

# ===========================================================================
# 3. Commits with no item (merge / revert / root) are not treated as failures.
# ===========================================================================
build 3
echo b > "$W/b.txt"; git -C "$W" add -A
git -C "$W" commit -q -m 'Merge branch side'
if run_stage dod_stage_rows "$BASE..HEAD"; then
  pass "#3 a push of only merge/revert commits does not fail the rows stage"
else
  fail "#3 a merge-only push was failed: $(cat "$TMP/out")"
fi

# ===========================================================================
# 4. §2 — a BUG with no test naming it FAILS; adding the test makes it pass.
# ===========================================================================
build 4
printf '| **BUG-042** | untested | S3 | open | d |\n' >> "$W/docs/doing/BUGS.md"
echo c > "$W/c.txt"; git -C "$W" add -A
git -C "$W" commit -q -m 'BUG#42: a fix with no regression test'
if run_stage dod_stage_bugtests "$BASE..HEAD"; then
  fail "#4 a BUG with no test naming it PASSED"
else
  pass "#4 a BUG with no regression test fails the stage"
fi

printf 'echo "BUG-042: regression"\n' > "$W/tests/x/test.sh"
if run_stage dod_stage_bugtests "$BASE..HEAD"; then
  pass "#4 adding a test that names BUG-042 satisfies it"
else
  fail "#4 a test naming the bug did not satisfy the stage: $(cat "$TMP/out")"
fi

# A TASK is not required to carry a regression test — asserting a rule that
# does not exist trains people to ignore the stage.
build 4b
printf '| **TASK-007** | a task | — | KEEP | t |\n' >> "$W/docs/doing/BACKLOG.md"
echo d > "$W/d.txt"; git -C "$W" add -A
git -C "$W" commit -q -m 'TASK#7: no regression test expected'
if run_stage dod_stage_bugtests "$BASE..HEAD"; then
  pass "#4b a TASK is not required to have a regression test"
else
  fail "#4b a TASK was required to have a regression test: $(cat "$TMP/out")"
fi

# ===========================================================================
# 5. §7G — a malformed or missing baton FAILS.
# ===========================================================================
build 5
if run_stage dod_stage_signal ""; then
  pass "#5 a well-formed baton passes"
else
  fail "#5 a well-formed baton was rejected: $(cat "$TMP/out")"
fi

printf '| Field | Value |\n|---|---|\n| Holder | X |\n' > "$W/logs/state/signal.md"
if run_stage dod_stage_signal ""; then
  fail "#5 a baton missing its State/Task rows PASSED"
else
  pass "#5 a baton missing rows fails"
fi

rm -f "$W/logs/state/signal.md"
if run_stage dod_stage_signal ""; then
  fail "#5 an ABSENT baton PASSED"
else
  pass "#5 an absent baton fails"
fi

# ===========================================================================
# 6. The judgement stage always passes — and says it is not verifying.
#    It exists to be VISIBLE, so the one thing that must be true is that it
#    never silently claims to have checked D/F/H.
# ===========================================================================
build 6
if run_stage dod_stage_judgement ""; then
  grep -qi 'not claimed to be\|judgement' "$TMP/out" \
    && pass "#6 the judgement stage prints that it does NOT verify" \
    || fail "#6 the judgement stage passed without saying it verifies nothing"
else
  fail "#6 the judgement stage failed — it is a reminder, not a check"
fi

# ===========================================================================
# 7. The stages are WIRED, and tagged [DoD-Gate].
#    Without this the lib could be perfect and never run — the exact gap
#    BUG-008 is about.
# ===========================================================================
H="$ROOT/.githooks/pre-push-project"
if grep -q 'AGENT_FEED_TAG="DoD-Gate"' "$H"; then
  pass "#7 the DoD stages are tagged [DoD-Gate] in the feed"
else
  fail "#7 the DoD stages are not tagged — they would be indistinguishable from suite stages"
fi
n="$(grep -c 'pipe_stage "§' "$H" 2>/dev/null || echo 0)"
if [ "$n" -ge 4 ]; then
  pass "#7 $n DoD stages are wired into the gate"
else
  fail "#7 only $n DoD stage(s) wired — expected at least 4"
fi
if grep -q 'AGENT_FEED_TAG="GATE"' "$H"; then
  pass "#7 the tag is restored afterwards, so later stages are not mislabelled"
else
  fail "#7 the feed tag is never restored — every stage after the DoD block would read [DoD-Gate]"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: TASK-007 — the DoD prints as stages, and each one fails when it should."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
