#!/bin/bash
# tests/bootstrap-identity/test.sh
#
# A-14 regression fixture — `scripts/new-project.sh` must INHERIT the operator's
# git author identity, never write one of its own.
#
# Why this exists: the blueprint used to run
#   git config --local user.email "luiz@struct2flow.com"
#   git config --local user.name  "Luiz Scheidegger"
# in every bootstrapped repo, so any other operator silently committed under the
# founder's name. Removing that introduced a second defect caught in Codex
# review round 2: the identity check ran AFTER the target directory was created
# and populated, so a missing identity left a half-bootstrapped directory and
# the "fix it and re-run" advice was a lie (the re-run dies on the
# "Target already exists" guard). Both behaviours are pinned below.
#
# Run from the blueprint repo root:
#   bash tests/bootstrap-identity/test.sh
#
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/new-project.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; exit 1; }
pass(){ echo "  ok — $*"; }

[ -f "$SCRIPT" ] || fail "missing $SCRIPT"

# --- 1. No founder identity is written anywhere in the script ------------------
if grep -qE 'git config .*user\.(email|name)[[:space:]]+"' "$SCRIPT"; then
  fail "new-project.sh writes a hardcoded git identity (A-14 regression)"
fi
pass "script never writes a git author identity"

# --- 2. Missing identity fails BEFORE creating the target ---------------------
# GIT_CONFIG_GLOBAL/SYSTEM=/dev/null hides any real identity (git >= 2.32).
TARGET_A="$WORK/no-identity"
out_a="$(GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
         bash "$SCRIPT" test-noident "$TARGET_A" 2>&1)"
if [ -e "$TARGET_A" ]; then
  fail "target directory was created despite missing identity: $TARGET_A
      A half-bootstrapped dir makes the documented 're-run' recovery impossible."
fi
case "$out_a" in
  *"No git author identity configured"*) : ;;
  *) fail "expected a missing-identity error, got:
$out_a" ;;
esac
pass "missing identity fails before any filesystem change"

# --- 3. Inherited identity is used verbatim as the initial commit author -------
TARGET_B="$WORK/with-identity"
NAME="Test Operator"
EMAIL="operator@example.test"
out_b="$(GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
         GIT_AUTHOR_NAME="$NAME"    GIT_AUTHOR_EMAIL="$EMAIL" \
         GIT_COMMITTER_NAME="$NAME" GIT_COMMITTER_EMAIL="$EMAIL" \
         bash "$SCRIPT" test-ident "$TARGET_B" 2>&1)" || fail "bootstrap failed:
$out_b"

[ -d "$TARGET_B/.git" ] || fail "bootstrap did not create a git repo at $TARGET_B"

author="$(git -C "$TARGET_B" log -1 --format='%an <%ae>' 2>/dev/null)"
[ "$author" = "$NAME <$EMAIL>" ] \
  || fail "initial commit author was '$author', expected '$NAME <$EMAIL>'"
pass "inherited identity is the initial commit author"

# --- 4. Nothing is written to the new repo's LOCAL config ---------------------
if git -C "$TARGET_B" config --local --get-regexp '^user\.' >/dev/null 2>&1; then
  fail "bootstrap wrote a repo-local user.* setting; identity must be inherited"
fi
pass "no repo-local identity written"

# --- 5. The identity actually used is echoed, so a wrong one is visible --------
case "$out_b" in
  *"Committing as:"*"$EMAIL"*) : ;;
  *) fail "bootstrap did not echo the identity it committed as" ;;
esac
pass "bootstrap echoes the identity it commits as"

echo "PASS: bootstrap inherits git identity and fails safely without one."
exit 0
