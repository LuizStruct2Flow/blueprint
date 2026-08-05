#!/bin/sh
# tests/commit-subjects/test.sh — TASK-002 (reopened).
#
# The commit-msg hook works. It is also the ONLY thing that checks the rule, and
# it is client-side, so it fires on `git commit` and nowhere else. Two doors are
# open:
#
#   * CI ran tests/commit-msg-gate/test.sh — which exercises the HOOK against
#     FIXTURES, and never reads this repository's actual commits. A gate whose
#     subject is a fixture cannot notice a real violation.
#   * GitHub composes the squash-merge commit from the PULL REQUEST TITLE, on
#     its own servers, where no client-side hook can exist.
#
# That second door is the one every blueprint change goes through, and 5fe89e0
# went through it: it landed on main AFTER the gate shipped, with a subject the
# hook rejects.
#
# The reproducer is therefore not synthesised — it is a real commit in this
# repository's history, which is the whole point. A fixture that agrees with the
# implementation is what got us here.

set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
FAILED=0
pass() { echo "  ok — $1"; }
fail() { echo "FAIL: $1"; FAILED=$((FAILED + 1)); }

LIB="$ROOT/scripts/lib/commit-subject.sh"
CHECKER="$ROOT/scripts/check-commit-subjects.sh"

# The exact subject of 5fe89e0, and of a commit that satisfies the rule. Written
# as literals so this suite states what it is protecting rather than deriving it
# from the very history it is checking.
BAD="TASK-001/002/003/005/006/007: the lifecycle rules become gates, and two defects come home from redcare (#21)"
GOOD="TASK#1: the six landed rows move to waiting-acceptance — and cost a PR to do it (#22)"

# ===========================================================================
# 1. There is ONE definition of the rule, and it is loadable on its own.
#    The hook's regex living only inside the hook is what forces every other
#    checker to copy it — and two copies of a rule are two rules.
# ===========================================================================
if [ -f "$LIB" ]; then
  pass "#1 the shared rule exists at scripts/lib/commit-subject.sh"
else
  fail "#1 no shared rule — a CI checker would have to copy the hook's regex"
fi

if [ -f "$LIB" ]; then
  # shellcheck disable=SC1090
  . "$LIB"
fi

if command -v commit_subject_ok >/dev/null 2>&1; then
  pass "#1 it exposes commit_subject_ok"
else
  fail "#1 commit_subject_ok is not defined — nothing can reuse the rule"
fi

# ===========================================================================
# 2. The rule itself, against the REAL subjects.
# ===========================================================================
if command -v commit_subject_ok >/dev/null 2>&1; then
  if commit_subject_ok "$GOOD"; then
    pass "#2 a conforming subject is accepted"
  else
    fail "#2 a conforming subject was rejected: $GOOD"
  fi

  if commit_subject_ok "$BAD"; then
    fail "#2 5fe89e0's ACTUAL subject was accepted — this is the defect"
  else
    pass "#2 5fe89e0's actual subject is rejected"
  fi

  for exempt in "Merge branch 'x'" "Revert \"BUG#1: y\"" "fixup! BUG#1: y"; do
    if commit_subject_ok "$exempt"; then
      pass "#2 exempt: $exempt"
    else
      fail "#2 an exempt subject was rejected: $exempt"
    fi
  done

  # A number is required. "BUG#: x" and "BUG: x" name no item.
  for bogus in "BUG: no number" "BUG#: no number" "TASK#1 no colon" "BUG#1:"; do
    if commit_subject_ok "$bogus"; then
      fail "#2 a subject naming no item was accepted: $bogus"
    else
      pass "#2 rejected: $bogus"
    fi
  done
fi

# ===========================================================================
# 3. The CHECKER exists and reads real subjects, not fixtures.
# ===========================================================================
if [ -x "$CHECKER" ]; then
  pass "#3 scripts/check-commit-subjects.sh is present and executable"
else
  fail "#3 no checker — CI has nothing to run against real commits"
fi

if [ -x "$CHECKER" ]; then
  if printf '%s\n' "$GOOD" | sh "$CHECKER" --stdin >/dev/null 2>&1; then
    pass "#3 the checker passes a conforming subject"
  else
    fail "#3 the checker rejected a conforming subject"
  fi

  if printf '%s\n' "$BAD" | sh "$CHECKER" --stdin >/dev/null 2>&1; then
    fail "#3 the checker PASSED 5fe89e0's subject"
  else
    pass "#3 the checker rejects 5fe89e0's subject"
  fi

  # The message must name the offender. A checker that fails without saying
  # which subject was wrong sends the reader back to the log to guess.
  out="$(printf '%s\n' "$BAD" | sh "$CHECKER" --stdin 2>&1 || true)"
  case "$out" in
    *"TASK-001/002"*) pass "#3 the failure names the offending subject" ;;
    *) fail "#3 the failure does not name the offending subject: $out" ;;
  esac
fi

# ===========================================================================
# 4. The hook uses the SHARED rule rather than its own copy.
#    Without this the two drift, and the drift is invisible: both would keep
#    passing their own tests while disagreeing about a real commit.
# ===========================================================================
HOOK="$ROOT/.githooks/commit-msg"
if grep -q 'commit-subject.sh' "$HOOK" 2>/dev/null; then
  pass "#4 the hook sources the shared rule"
else
  fail "#4 the hook does not source the shared rule — two copies will drift"
fi

if [ "$(grep -c 'BUG|FEATURE|TASK)#\[0-9\]' "$HOOK" 2>/dev/null || echo 0)" -eq 0 ]; then
  pass "#4 the hook no longer carries its own copy of the pattern"
else
  fail "#4 the hook still carries a second copy of the pattern"
fi

# ===========================================================================
# 5. CI is WIRED to it — and to the PULL REQUEST TITLE specifically.
#    This is the assertion that matters. The squash-merge subject IS the PR
#    title, so checking only the branch's commits leaves the actual defect
#    completely unguarded. BUG-008's lesson: a perfect check that nothing
#    invokes is not a check.
# ===========================================================================
WF="$ROOT/.github/workflows/security.yml"
if grep -q 'check-commit-subjects.sh' "$WF" 2>/dev/null; then
  pass "#5 CI invokes the checker"
else
  fail "#5 CI never invokes the checker — the rule stays local-only"
fi

if grep -q 'pull_request.title' "$WF" 2>/dev/null; then
  pass "#5 CI checks the PR TITLE, which becomes the squash subject"
else
  fail "#5 CI does not check the PR title — the squash-merge door stays open"
fi

# A title edited AFTER the checks pass would otherwise merge unchecked, since
# `edited` is not in the default pull_request activity types.
if grep -q 'edited' "$WF" 2>/dev/null; then
  pass "#5 the workflow re-runs when the PR title is EDITED"
else
  fail "#5 editing the title after a green run would bypass the check"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: TASK-002 — the item rule is checked where the commit is actually made."
  exit 0
fi
echo "FAILED: $FAILED assertion(s)."
exit 1
