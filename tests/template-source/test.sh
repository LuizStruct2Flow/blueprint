#!/bin/bash
# tests/template-source/test.sh
#
# BUG-009 — the seed template and this repo's own config were the same files.
#
# `project_config_*.md` at the root was simultaneously the template every new
# project is seeded with AND the blueprint's live configuration. Bootstrap ships
# `git archive HEAD`, so whatever the blueprint wrote about itself went out to
# every new project.
#
# Not hypothetical: a wake-time `Monitor` row — with a rationale describing an
# incident in *this* stream — was seeded verbatim into linkedin-watcher-agent.
# The 2026-08-02 mitigation emptied the table and added a warning, leaving the
# STRUCTURE intact, so the next concrete thing written there would do it again.
# Fourth instance of one defect, with BUG-002 (a hardcoded state dir), BUG-006
# (one project's env namespace) and BUG-010 (a fleet's persona names).
#
# The split this pins:
#   templates/project_config_*.md  → the seed source, placeholders only
#   project_config_*.md (root)     → this repo's own, export-ignore'd
#
# Run from the blueprint repo root:  bash tests/template-source/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

CONFIGS="project_config_overview.md project_config_paths.md project_config_dod.md project_config_security.md project_config_infra.md"

# ===========================================================================
# 1. THE SEED SOURCE EXISTS, and carries every config a project needs.
# ===========================================================================
missing=""
for c in $CONFIGS; do
  [ -f "$ROOT/templates/$c" ] || missing="$missing $c"
done
if [ -n "$missing" ]; then
  fail "#1 templates/ is missing config templates:$missing"
else
  pass "#1 templates/ carries all 5 project_config templates"
fi

# ===========================================================================
# 2. THE ARCHIVE — what bootstrap actually ships — must contain NEITHER the
#    blueprint's own root configs NOR templates/ itself.
#
#    Asserted against `git archive`, not against .gitattributes: the export
#    behaviour is what matters, and a rule that is present but not taking
#    effect is precisely the failure mode being guarded.
# ===========================================================================
listing="$TMP/archive.txt"
git -C "$ROOT" archive --format=tar HEAD 2>/dev/null | tar -t > "$listing" 2>/dev/null

if [ ! -s "$listing" ]; then
  fail "#2 could not list the bootstrap archive — assertions would be vacuous"
else
  shipped=""
  for c in $CONFIGS; do
    grep -qx "$c" "$listing" && shipped="$shipped $c"
  done
  if [ -n "$shipped" ]; then
    fail "#2 the blueprint's OWN config ships to every new project:$shipped"
  else
    pass "#2 the root project_config_*.md do not ship (this repo's own config stays here)"
  fi

  if grep -q '^templates/' "$listing"; then
    fail "#2b templates/ itself ships — a derived project would carry a seed source it cannot use"
  else
    pass "#2b templates/ does not ship either"
  fi

  # Non-vacuity: the archive must contain SOMETHING recognisable, or the two
  # assertions above pass against an empty listing.
  if ! grep -qx 'CLAUDE.md' "$listing"; then
    fail "#2c the archive has no CLAUDE.md — the listing is wrong, so #2/#2b proved nothing"
  else
    pass "#2c the archive is non-empty and recognisable"
  fi
fi

# ===========================================================================
# 3. TEMPLATES CARRY NO PROJECT-SPECIFIC CONTENT.
#    The whole point of the split. A template that names a host, a path or an
#    incident is the bug reappearing on the other side of the fence.
# ===========================================================================
dirty=""
for c in $CONFIGS; do
  f="$ROOT/templates/$c"
  [ -f "$f" ] || continue
  # Host homes, absolute user paths, and this repo's own state dir.
  if grep -qE '/(Users|home)/[A-Za-z0-9_.-]+/|~/\.blueprint\b' "$f"; then
    dirty="$dirty $c"
  fi
done
if [ -n "$dirty" ]; then
  fail "#3 a template contains host-specific paths — it would seed into every project:$dirty"
else
  pass "#3 templates contain no host paths"
fi

# ===========================================================================
# 4. BOOTSTRAP STILL PRODUCES A COMPLETE PROJECT.
#    The split must not silently drop the configs: a project bootstrapped
#    without them looks fine until somebody needs one.
# ===========================================================================
if [ ! -x "$ROOT/scripts/new-project.sh" ]; then
  fail "#4 scripts/new-project.sh is not executable"
else
  out="$TMP/proj"
  # new-project.sh REFUSES to run without a git author identity (A-14: it
  # inherits one rather than baking a person into every derived repo). CI has
  # none configured, so the identity is supplied for this run only — via the
  # documented env-var override, which is exactly the path that contract
  # exists to support. Without this the case fails in CI for a reason that has
  # nothing to do with the template split.
  if ( cd "$TMP" \
       && GIT_AUTHOR_NAME="tmpl test" GIT_AUTHOR_EMAIL="tmpl@local" \
          GIT_COMMITTER_NAME="tmpl test" GIT_COMMITTER_EMAIL="tmpl@local" \
          bash "$ROOT/scripts/new-project.sh" tmpl-check "$out" ) >"$TMP/boot.log" 2>&1; then
    absent=""
    for c in $CONFIGS; do
      [ -f "$out/$c" ] || absent="$absent $c"
    done
    if [ -n "$absent" ]; then
      fail "#4 bootstrap produced a project MISSING its config:$absent"
    else
      pass "#4 bootstrap seeds all 5 configs into the new project"
    fi
    if grep -q '{{PROJECT_NAME}}' "$out/project_config_paths.md" 2>/dev/null; then
      fail "#4b the seeded config was not placeholder-substituted"
    else
      pass "#4b the seeded config is substituted for the new project"
    fi
    [ -d "$out/templates" ] \
      && fail "#4c the new project carries a templates/ directory it cannot use" \
      || pass "#4c the new project has no templates/ of its own"
  else
    fail "#4 bootstrap failed: $(tail -3 "$TMP/boot.log")"
  fi
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-009 — the seed template and this repo's own config are separate."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
