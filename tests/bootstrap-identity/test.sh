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

# BUG-047 — never inherit git's repo pointers. Git exports GIT_DIR to every hook
# and the pre-push gate runs this suite, so with GIT_DIR set the bootstrap below
# does not build a repo in its fixture at all: `git init` returns 0, creates no
# .git there, and the initial commit lands in whatever GIT_DIR names. Reproduced
# against a victim repo — this suite left `chore(bootstrap): initialize
# test-ident …` in it and added `core.hooksPath=.githooks`, which is the A-22 /
# BUG-004 failure produced BY A TEST. It was covered only by .githooks/pre-push,
# so a direct run — how an agent debugging this suite actually runs it — hit the
# real repository. tests/git-isolation #1 now proves this line by execution.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

# BUG-046 — and never inherit the caller's baton pointers. This suite drives
# scripts/new-project.sh, which seeds the new project's live mic;
# `signal-set.sh` honours $AGENT_SIGNAL_FILE / $AGENT_STATE_HOME, and
# scripts/codex-signal-watch.sh EXPORTS AGENT_SIGNAL_FILE into every dispatched
# wake. Running this suite from inside one republished `Holder=Nobody /
# State=IDLE / Task="Bootstrapped from the blueprint…"` over a real hand-off.
unset AGENT_SIGNAL_FILE AGENT_STATE_HOME AGENT_FEED_LOG

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

# --- 6. BUG-046 — bootstrap seeds the NEW project's baton, never the caller's --
#
# The same shape as everything above: this suite exists because bootstrap must
# not write things that belong to the operator. A-14 was a git identity; this is
# the operator's LIVE MIC.
#
# THE MECHANISM. `new-project.sh` seeds a baton so a fresh project can run the
# ceremony without a manual first step (BUG-019). It called `signal-set.sh`
# without naming a file, and `signal-set.sh` honours $AGENT_SIGNAL_FILE
# (scripts/lib/state-dir.sh:87) and $AGENT_STATE_HOME (:56). Those are not exotic
# variables — scripts/codex-signal-watch.sh EXPORTS AGENT_SIGNAL_FILE into every
# dispatched wake command — so bootstrapping from a dispatched agent published
#
#     Holder=Nobody / State=IDLE / Task="Bootstrapped from the blueprint…"
#
# over a live hand-off, appended a row to that project's journal, and reported
# success. That is BUG-030, mis-attributed for weeks to path derivation inside
# one suite; all four suites that drive this script reproduced it.
#
# Both halves are asserted, and each is vacuous without the other: "the decoy
# survived" would also pass if the seed were simply deleted, and "the project got
# a baton" was already true while the real mic was being trampled.
#
# The decoy must be a WELL-FORMED baton. signal-set.sh refuses to publish over a
# file whose table rows it cannot find, so a decoy of arbitrary text survives for
# a reason that has nothing to do with the fix — a vacuous pass, and one this
# case hit while it was being written.
DECOY_DIR="$WORK/decoy-state"
mkdir -p "$DECOY_DIR"
cat >"$DECOY_DIR/signal.md" <<'DECOY'
<!-- A DECOY live baton, standing in for the caller's real mic. -->

| Field | Value |
|---|---|
| Holder | DecoyHolder |
| State | OVER_TO_CODEX |
| Task | a real hand-off that bootstrap must not overwrite |
| Last update | 2026-01-01 |
DECOY
decoy_before="$(cat "$DECOY_DIR/signal.md")"

TARGET_C="$WORK/with-baton-env"
out_c="$(GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
         GIT_AUTHOR_NAME="$NAME"    GIT_AUTHOR_EMAIL="$EMAIL" \
         GIT_COMMITTER_NAME="$NAME" GIT_COMMITTER_EMAIL="$EMAIL" \
         AGENT_SIGNAL_FILE="$DECOY_DIR/signal.md" \
         AGENT_STATE_HOME="$DECOY_DIR" \
         bash "$SCRIPT" test-baton "$TARGET_C" 2>&1)" || fail "BUG-046: bootstrap failed with the baton env set:
$out_c"

[ "$(cat "$DECOY_DIR/signal.md")" = "$decoy_before" ] || fail "BUG-046: bootstrap REPUBLISHED the caller's live baton.
      A dispatched agent exports AGENT_SIGNAL_FILE, so this resets a real
      hand-off to IDLE while reporting success. The decoy now reads:
$(sed 's/^/        /' "$DECOY_DIR/signal.md")"

[ ! -e "$DECOY_DIR/signal-history.log" ] || fail "BUG-046: bootstrap appended to the caller's baton JOURNAL:
$(sed 's/^/        /' "$DECOY_DIR/signal-history.log")"

[ -f "$TARGET_C/logs/state/signal.md" ] || fail "BUG-046: the new project got NO baton.
      The seed was scrubbed away rather than redirected, so a fresh project
      cannot run the ceremony (BUG-019) — half a fix is not a fix."

grep -q '^| Holder | Nobody |' "$TARGET_C/logs/state/signal.md" \
  || fail "BUG-046: the new project's baton is not the seeded IDLE one:
$(sed 's/^/        /' "$TARGET_C/logs/state/signal.md")"

pass "BUG-046: the baton is seeded into the NEW project, and the caller's is untouched"

echo "PASS: bootstrap inherits git identity and fails safely without one."
exit 0
