#!/bin/bash
# tests/commit-msg-gate/test.sh
#
# TASK-002 — every commit names the backlog item it serves.
#
# DoD §1b rule 1 says all work refers to a backlog item. This suite guards the
# hook that ENFORCES it, because a rule you must remember while busy is the
# shape this repo has rejected five times over.
#
# The hook is invoked by git with the message file as $1, so it is testable
# directly — no fixture repo needed for the decision logic. Case #4 does drive a
# real `git commit` end to end, because "the hook has the right logic" and "git
# actually runs it" are different claims and only the second one matters.
#
# Run from the blueprint repo root:  bash tests/commit-msg-gate/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers. Case #4 runs `git init`.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.githooks/commit-msg"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -x "$HOOK" ] || { fail "#0 $HOOK is missing or not executable"; echo FAILED; exit 1; }
pass "#0 the hook exists and is executable"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

check() { # $1 = subject/body, returns hook's exit code
  printf '%s\n' "$1" > "$TMP/msg"
  sh "$HOOK" "$TMP/msg" >/dev/null 2>&1
}

# ===========================================================================
# 1. ACCEPTED — the three lifecycle namespaces, in the founder's format.
# ===========================================================================
ok_cases='BUG#20: a refused pull exits non-zero
FEATURE#3: the gate renders as a pipeline
TASK#1: move the lcm checklist into the DoD
BUG#1: single digit
FEATURE#1234: many digits'
bad=0
while IFS= read -r c; do
  check "$c" || { fail "#1 rejected a VALID subject: $c"; bad=1; }
done <<EOF
$ok_cases
EOF
[ "$bad" -eq 0 ] && pass "#1 BUG/FEATURE/TASK subjects in the required format are accepted"

# ===========================================================================
# 2. REJECTED — anything that does not name its item.
#
#    The conventional-commits form is REJECTED deliberately: `fix(BUG-020):`
#    does not START with the item, and the founder's rule is that it must. This
#    case exists so that is a decision on the record rather than an accident.
# ===========================================================================
no_cases='fix(BUG-020): the old conventional-commits form
docs: no item at all
BUG-20: hyphen instead of hash
BUG#: no number
BUG#20 no colon
#20: no type
wip
BUG#20:'
bad=0
while IFS= read -r c; do
  if check "$c"; then fail "#2 ACCEPTED an invalid subject: $c"; bad=1; fi
done <<EOF
$no_cases
EOF
[ "$bad" -eq 0 ] && pass "#2 subjects that do not name an item are rejected"

# ===========================================================================
# 3. Exemptions, and the fail-closed cases.
# ===========================================================================
check 'Merge branch '"'"'main'"'"' into topic' \
  && pass "#3 merge commits are exempt (git writes them; there is no single item)" \
  || fail "#3 a merge commit was rejected"

check 'Revert "BUG#20: a refused pull exits non-zero"' \
  && pass "#3 revert commits are exempt (the original named its item)" \
  || fail "#3 a revert commit was rejected"

check 'fixup! BUG#20: a refused pull' \
  && pass "#3 fixup! is exempt (a rebase instruction, not a final message)" \
  || fail "#3 fixup! was rejected"

# The subject is the first NON-COMMENT line: git appends a comment template.
printf '# Please enter the commit message\n#\nBUG#7: after the comment block\n' > "$TMP/msg"
sh "$HOOK" "$TMP/msg" >/dev/null 2>&1 \
  && pass "#3 git's comment template is skipped when finding the subject" \
  || fail "#3 the comment template defeated subject detection"

# FAIL CLOSED. "Could not check" must never render as "passed" — BUG-018 twice.
sh "$HOOK" "$TMP/does-not-exist" >/dev/null 2>&1 \
  && fail "#3 an UNREADABLE message file was accepted — the gate fails open" \
  || pass "#3 an unreadable message file is rejected (fails closed)"

sh "$HOOK" >/dev/null 2>&1 \
  && fail "#3 a MISSING argument was accepted — the gate fails open" \
  || pass "#3 a missing argument is rejected (fails closed)"

printf '\n\n#only comments\n' > "$TMP/msg"
sh "$HOOK" "$TMP/msg" >/dev/null 2>&1 \
  && fail "#3 an EMPTY message was accepted" \
  || pass "#3 an empty message is rejected"

# ===========================================================================
# 4. END TO END — git actually runs it.
#
#    #1–#3 prove the hook's logic. They do NOT prove git invokes it, which is
#    the only property that stops a bad commit. BUG-008 is exactly this gap: a
#    hook that existed, was correct, and never ran because it lost its exec bit.
# ===========================================================================
W="$TMP/repo"
mkdir -p "$W/.githooks" "$W/scripts/lib"
cp "$HOOK" "$W/.githooks/commit-msg"
chmod +x "$W/.githooks/commit-msg"
# The hook reads the RULE from scripts/lib/commit-subject.sh, shared with the CI
# checker so the two cannot drift. A real project has both files — bootstrap
# ships the whole tracked tree — so a fixture with only the hook models a
# repository that does not exist, and the hook correctly fails closed in it.
cp "$ROOT/scripts/lib/commit-subject.sh" "$W/scripts/lib/"
git -C "$W" init -q
git -C "$W" config core.hooksPath .githooks
git -C "$W" config user.email t@example.com
git -C "$W" config user.name t
echo hello > "$W/f.txt"
git -C "$W" add -A

# The ROOT commit is exempt — a repo's first commit creates the repo and cannot
# name an item, because no backlog exists yet. This is not hypothetical: the
# hook ships into every bootstrapped project and `new-project.sh` commits the
# initial tree, so the first version of this gate broke bootstrap outright. The
# gate caught it (tests/template-source #4) before it reached a push.
if git -C "$W" commit -q -m 'chore(bootstrap): initialize from the blueprint' >/dev/null 2>&1; then
  pass "#4 the ROOT commit is exempt — bootstrap is not blocked"
else
  fail "#4 the root commit was rejected — every new project would fail on its first commit"
fi

echo second > "$W/g.txt"
git -C "$W" add -A
if git -C "$W" commit -q -m 'docs: no item named' >/dev/null 2>&1; then
  fail "#4 git ACCEPTED a non-root commit with no backlog item — the hook is not wired"
else
  pass "#4 git rejects a non-root commit whose subject names no item"
fi

if git -C "$W" commit -q -m 'TASK#2: wire the commit-msg gate' >/dev/null 2>&1; then
  pass "#4 git accepts a commit that names its item"
else
  fail "#4 git REJECTED a valid commit — the hook is too strict end to end"
fi

# Non-vacuity: exactly one commit must exist — the rejected one must not be in.
n="$(git -C "$W" rev-list --count HEAD 2>/dev/null || echo 0)"
if [ "$n" = "2" ]; then
  pass "#4 exactly two commits landed (root + valid) — the rejection blocked, it did not just warn"
else
  fail "#4 expected 2 commits after root + one rejection + one acceptance, found $n"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: TASK-002 — every commit names the backlog item it serves."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
