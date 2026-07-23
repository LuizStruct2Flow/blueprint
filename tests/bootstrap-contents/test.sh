#!/bin/bash
# tests/bootstrap-contents/test.sh
#
# A-05: `scripts/new-project.sh` must ship TRACKED TEMPLATE CONTENT ONLY.
#
# The defect: bootstrap copied the whole WORKING TREE (`find | cp -R` over
# everything but .git) and then `git add -A`ed it into the new project's first
# commit. Consequences, all verified on this repo before the fix:
#   - a `.env` holding SONAR_TOKEN was copied into the new project — .gitignore
#     stops the COMMIT in the source repo, but nothing stopped the COPY;
#   - logs/ runtime state came along;
#   - the blueprint's own in-flight docs/doing/ work items shipped, so a fresh
#     project opened with the BLUEPRINT's active bugs, which its agents then
#     read as their own.
#
# Two mechanisms fix it and this suite pins both:
#   1. `git archive HEAD` — untracked/gitignored files cannot ship at all.
#   2. `.gitattributes export-ignore` — TRACKED work items in the lifecycle
#      folders are excluded while the folder structure and genuine templates
#      (README.md, HANDOVER.md, the empty backlog tables) still ship.
#
# The fixture is a self-contained mini-blueprint built from `git archive HEAD`,
# so the test never plants a fake secret in the real repo — a crashed run must
# not leave a .env lying around here.
#
# Run from the blueprint repo root:
#   bash tests/bootstrap-contents/test.sh
#
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

BP="$WORK/blueprint"
mkdir -p "$BP"
git -C "$ROOT" archive HEAD | tar -x -C "$BP" || { echo "FAIL: could not archive the blueprint"; exit 1; }
[ -f "$BP/scripts/new-project.sh" ] || { echo "FAIL: fixture blueprint has no new-project.sh"; exit 1; }

# Make the fixture a real repo so `git archive HEAD` works inside it. Include a
# tracked work item in docs/doing/ so the export boundary has something to
# exclude even when the real repo's own items were filtered out building this.
mkdir -p "$BP/docs/doing"
printf '# PLAN-BUG-999 — fixture work item\n\nMust NOT reach a derived project.\n' \
  >"$BP/docs/doing/PLAN-BUG-999.md"
(
  cd "$BP"
  git init -q .
  git add -A
  git -c user.name=T -c user.email=t@t.io commit -qm "fixture blueprint"
) || { echo "FAIL: could not init the fixture blueprint"; exit 1; }

# Untracked + gitignored state a real blueprint checkout accumulates.
printf 'SONAR_TOKEN=squ_FIXTURE_SECRET\n' >"$BP/.env"
mkdir -p "$BP/logs" && printf 'stale feed line\n' >"$BP/logs/agent-activity.log"
printf 'personal roster\n' >"$BP/AGENT_ROSTER.md"

TARGET="$WORK/derived"
out="$( cd "$BP" && GIT_AUTHOR_NAME=T GIT_AUTHOR_EMAIL=t@t.io \
        GIT_COMMITTER_NAME=T GIT_COMMITTER_EMAIL=t@t.io \
        bash scripts/new-project.sh test-proj "$TARGET" 2>&1 )" || {
  echo "FAIL: bootstrap exited non-zero"; printf '%s\n' "$out" | tail -10; exit 1; }

# --- 1. Secrets and runtime state must not ship -------------------------------
if [ -e "$TARGET/.env" ]; then
  fail "A-05: .env shipped into the derived project — this is the SONAR_TOKEN leak path"
else pass "untracked .env did not ship"; fi

if [ -e "$TARGET/logs/agent-activity.log" ]; then
  fail "A-05: gitignored logs/ shipped into the derived project"
else pass "gitignored logs/ did not ship"; fi

# --- 2. The blueprint's own work items must not ship ---------------------------
if [ -e "$TARGET/docs/doing/PLAN-BUG-999.md" ]; then
  fail "A-05: a TRACKED blueprint work item shipped — a new project would open
      with the blueprint's active bugs in its docs/doing/ and read them as its own"
else pass "tracked blueprint work items excluded (export-ignore)"; fi

# --- 3. ...but the templates and structure must ------------------------------
for f in docs/doing/README.md docs/doing/HANDOVER.md docs/backlog/BACKLOG.md \
         docs/backlog/BUGS.md docs/waiting-acceptance/README.md; do
  [ -e "$TARGET/$f" ] || fail "template missing from the derived project: $f"
done
[ "$FAILED" -eq 0 ] && pass "lifecycle structure + templates still ship"

for f in CLAUDE.md AGENTS.md scripts/agent-activity.sh .githooks/pre-push \
         tests/marker-merge/test.sh; do
  [ -e "$TARGET/$f" ] || fail "blueprint content missing from the derived project: $f"
done

# --- 4. The roster follows the .env model ------------------------------------
# The example is tracked and ships; the personal copy is seeded FROM it, never
# inherited from whoever ran bootstrap.
if [ ! -e "$TARGET/AGENT_ROSTER.example.md" ]; then
  fail "AGENT_ROSTER.example.md did not ship — nothing to seed from"
elif [ ! -e "$TARGET/AGENT_ROSTER.md" ]; then
  fail "AGENT_ROSTER.md was not seeded — the project has no live roster"
elif ! diff -q "$TARGET/AGENT_ROSTER.md" "$TARGET/AGENT_ROSTER.example.md" >/dev/null; then
  fail "AGENT_ROSTER.md is NOT a copy of the example — the operator's personal
      roster was inherited instead of seeded"
else
  pass "roster seeded from the example, not inherited"
fi

# --- 5. Nothing untracked was committed into the new project ------------------
if git -C "$TARGET" ls-files 2>/dev/null | grep -qx '.env'; then
  fail "A-05: .env was COMMITTED into the derived project's history"
else pass "no .env in the derived project's git history"; fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-05 — bootstrap ships tracked template content only."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
