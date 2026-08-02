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

# BUG-014 — never inherit git's repo pointers. Git exports GIT_DIR to every hook,
# the pre-push gate runs this suite, and the fixtures below use `git init` inside
# a `cd`ed subshell. With GIT_DIR set, `cd` protects nothing: the fixture's
# commits and config writes land in the REAL repository. This suite must be safe
# run from anywhere, so it strips them itself rather than trusting its caller.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY


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
# The blueprint tracks several files that are ALSO in its .gitignore — CLAUDE.md,
# AGENTS.md, docs/DoD.md, HANDOVER.md, the project_config_*.md set (the
# public-publishing privacy block). git ignores .gitignore for already-tracked
# paths, so `git archive HEAD` in the real repo ships them. A plain `git add -A`
# here would respect .gitignore and drop them, so the fixture would not mirror
# the real repo. Force-add them so the fixture's HEAD matches what actually
# ships.
(
  cd "$BP"
  git init -q .
  git add -A
  git ls-files --others --ignored --exclude-standard -z | xargs -0 -r git add -f
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

# --- 5. The real history regression (Codex R-1) ------------------------------
# The `.env` was copied to the working TREE but was never COMMITTED even before
# the fix — the copied .gitignore travels with it, so `git add -A` skips it in
# the derived repo too. Asserting "no .env in history" therefore passed both
# before and after the fix: a tautology, not regression coverage. The genuine
# history leak is the TRACKED work item, which IS committed pre-fix (it is not
# gitignored) and is excluded post-fix by export-ignore. Pin THAT.
if git -C "$TARGET" ls-files 2>/dev/null | grep -q 'PLAN-BUG-999'; then
  fail "A-05: a tracked blueprint work item is in the derived project's COMMITTED
      history — the real leak (git archive alone would still ship it; export-ignore
      is what excludes it)"
else pass "tracked work items absent from the derived project's git history"; fi
# The .env leak is confidentiality, not history: it must not reach the working
# tree at all. (Case 1 above already pins worktree absence; this records the
# distinction so the claim is not overstated again.)
if [ -e "$TARGET/.env" ]; then
  fail "A-05: .env reached the derived WORKING TREE (confidentiality leak)"
else pass ".env absent from the derived working tree (copied, never committed pre-fix)"; fi

# --- 6. Bootstrap must substitute the placeholder in EVERY file that carries it
# (A-09 / Codex R12(d)). The Gemini launcher was omitted from new-project.sh
# TARGETS while both Codex scripts were listed, so a derived Gemini launcher kept
# a literal {{PROJECT_NAME}} in its prompt. No test caught it because none
# asserted substitution. Pin it for all three dispatchers. Non-vacuous: the
# blueprint sources DO contain the token, so an omitted file fails here.
for f in scripts/start-codex-signal-watch.sh scripts/start-gemini-signal-watch.sh \
         scripts/codex-signal-watch.sh; do
  if [ ! -e "$TARGET/$f" ]; then
    fail "R12(d): $f did not ship into the derived project"
  elif grep -q '{{PROJECT_NAME}}' "$TARGET/$f"; then
    fail "R12(d): $f still holds a literal {{PROJECT_NAME}} after bootstrap — omitted from new-project.sh TARGETS"
  else
    pass "$f: placeholder substituted at bootstrap"
  fi
done

# --- 7. The SonarQube key must be substituted too (A-09 sonar half).
# sonar-project.properties carries sonar.projectKey={{PROJECT_NAME}}. If bootstrap
# leaves it literal, EVERY derived project uploads under the one key
# "{{PROJECT_NAME}}" and they collide on a single SonarQube project, trampling
# each other's issues and coverage — the same cross-project contamination class
# as the shared log dir, on the Sonar key instead. It is a TEMPLATE_FILE
# (bootstrapped, project-owned, not pull-synced), so bootstrap substitution is
# the ONLY place this can be made right. Non-vacuous: the source carries the
# token, so an omission from TARGETS fails here.
if [ ! -e "$TARGET/sonar-project.properties" ]; then
  fail "A-09(sonar): sonar-project.properties did not ship into the derived project"
elif grep -q '{{PROJECT_NAME}}' "$TARGET/sonar-project.properties"; then
  fail "A-09(sonar): derived sonar-project.properties still holds a literal {{PROJECT_NAME}} — omitted from new-project.sh TARGETS, so every project collides on one Sonar key"
else
  pass "sonar-project.properties: SonarQube projectKey substituted at bootstrap"
fi

# --- 8. `blueprint_source` must be RELATIVE to the project root (BUG-012) -----
# Bootstrap wrote `blueprint_source = $BLUEPRINT_ROOT`, an absolute host path.
# It is the one field in .blueprint-source that cannot be correct on two
# machines at once, and storm2flow proved it: it carried a `/Users/…` path onto
# a Linux box and every blueprint command died on it (docs/doing/HANDOVER.md).
#
# A relative path survives that, and it survives the commoner case too — moving
# or re-cloning the tree — because what it pins is the LAYOUT (blueprint beside
# project), which is what bootstrap actually knows. It is resolved from the
# project root, which costs nothing: read_blueprint_source already requires cwd
# to be the project root, since it greps ./.blueprint-source.
#
# Non-vacuous: pre-fix the value starts with `/`, so case 1 below fires.
src_val="$(grep '^blueprint_source' "$TARGET/.blueprint-source" 2>/dev/null | cut -d= -f2- | xargs)"
if [ -z "$src_val" ]; then
  fail "BUG-012: derived .blueprint-source has no blueprint_source field"
elif [ "${src_val#/}" != "$src_val" ]; then
  fail "BUG-012: bootstrap wrote an ABSOLUTE blueprint_source ($src_val) — it
      cannot be right on two machines at once, and moving either checkout breaks
      every blueprint command in the derived project"
elif [ ! -f "$TARGET/$src_val/scripts/blueprint" ]; then
  fail "BUG-012: blueprint_source ($src_val) does not resolve to a blueprint
      checkout from the project root — relative, but pointing nowhere"
else
  pass "blueprint_source is relative and resolves from the project root"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-05 — bootstrap ships tracked template content only."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
