#!/usr/bin/env bash
set -euo pipefail

# new-project.sh — bootstrap a new struct2flow project from the blueprint.
#
# Usage:
#   scripts/new-project.sh <PROJECT_NAME> [TARGET_DIR]
#
# Creates ~/sources/struct2flow/<PROJECT_NAME>/ (or TARGET_DIR), copies the
# blueprint, substitutes {{PROJECT_NAME}} placeholders, initializes git,
# wires the .githooks path, and runs `npm init -y` if Node is detected.
#
# After bootstrap, open in VS Code, fill out project_config_*.md, and
# start adding code. The agent-protocol files (CLAUDE.md, DoD.md,
# AGENT_SIGNAL.md, scripts/, .githooks/) are blueprint-managed — see
# blueprint/README.md for the sync model.

usage() {
  cat <<'USAGE'
Usage: scripts/new-project.sh <PROJECT_NAME> [TARGET_DIR]

Examples:
  scripts/new-project.sh acme-flow
  scripts/new-project.sh acme-flow ~/work/acme-flow
USAGE
}

if [[ $# -lt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit "$([[ $# -lt 1 ]] && echo 2 || echo 0)"
fi

PROJECT_NAME="$1"
TARGET_DIR="${2:-$HOME/sources/struct2flow/$PROJECT_NAME}"

# --- Validate name (kebab-case, no spaces, no leading dot) ---
if [[ ! "$PROJECT_NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "❌ PROJECT_NAME must be kebab-case (lowercase letters, digits, hyphens)." >&2
  echo "   Got: $PROJECT_NAME" >&2
  exit 2
fi

# --- Resolve blueprint root (this script's parent) ---
BLUEPRINT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$BLUEPRINT_ROOT/CLAUDE.md" || ! -f "$BLUEPRINT_ROOT/AGENT_SIGNAL.md" ]]; then
  echo "❌ Cannot locate blueprint root (looked at: $BLUEPRINT_ROOT)" >&2
  exit 1
fi

# --- Require a git author identity BEFORE creating anything ---
# Checked here, not at commit time: a late check leaves a half-bootstrapped
# target directory behind, and the "fix it and re-run" advice is then a lie —
# the re-run dies on the "Target already exists" guard below. Failing before
# any filesystem change keeps re-running the honest recovery path.
# Identity is INHERITED, never written: baking one person into every derived
# repo makes other operators commit silently under someone else's name (A-14).
# `git var GIT_AUTHOR_IDENT` is the right primitive: it resolves exactly what
# git would use at commit time, honouring GIT_AUTHOR_* env vars as well as
# config, and failing when it would have to guess. `git config --get user.email`
# does NOT see the env vars, and would reject the documented one-shot override
# in STACK_DEFAULTS.md §"Git author identity". Probed in a scratch dir outside
# any repo so the blueprint's own local config can't mask a missing global one —
# the new project will see global/env only.
_ident_probe="$(mktemp -d)"
if ! git -C "$_ident_probe" var GIT_AUTHOR_IDENT >/dev/null 2>&1; then
  rmdir "$_ident_probe" 2>/dev/null || true
  echo "❌ No git author identity configured — nothing has been created." >&2
  echo "   Bootstrap inherits your identity rather than assuming one. Set it:" >&2
  echo "     git config --global user.name  \"Your Name\"" >&2
  echo "     git config --global user.email \"you@example.com\"" >&2
  echo "   or override for this run only:" >&2
  echo "     GIT_AUTHOR_NAME=\"…\" GIT_AUTHOR_EMAIL=\"…\" \\" >&2
  echo "     GIT_COMMITTER_NAME=\"…\" GIT_COMMITTER_EMAIL=\"…\" $0 $PROJECT_NAME" >&2
  echo "   then re-run this command unchanged." >&2
  exit 2
fi
rmdir "$_ident_probe" 2>/dev/null || true

# --- Refuse to overwrite an existing dir ---
if [[ -e "$TARGET_DIR" ]]; then
  echo "❌ Target already exists: $TARGET_DIR" >&2
  echo "   Pick a different PROJECT_NAME / TARGET_DIR, or remove the existing dir first." >&2
  exit 1
fi

echo "📦 Bootstrapping struct2flow project '$PROJECT_NAME' at $TARGET_DIR"

mkdir -p "$TARGET_DIR"

# --- Copy blueprint contents: TRACKED FILES ONLY (A-05) ---
# `git archive HEAD` ships exactly what is committed. The previous
# `find | cp -R` copied the whole WORKING TREE, so every untracked and
# gitignored file went into the new project and was then `git add -A`ed into its
# first commit. That included:
#   - a `.env` holding SONAR_TOKEN — a real secret-leak path, since .gitignore
#     stops the commit in the SOURCE repo but nothing stops the copy;
#   - logs/ runtime state, node_modules/, coverage/;
#   - the blueprint's own in-flight docs/doing/ work items, which then read as
#     the new project's active bugs.
# Verified empirically: a bootstrap run took this repo's personal
# AGENT_ROSTER.md, an in-progress audit, a BUG plan and logs/ into the target.
#
# HEAD, not the index or worktree, so a dirty blueprint checkout cannot leak
# half-finished work into a new project either.
if ! git -C "$BLUEPRINT_ROOT" rev-parse HEAD >/dev/null 2>&1; then
  echo "❌ Blueprint at $BLUEPRINT_ROOT has no commits to archive." >&2
  echo "   Bootstrap ships tracked content only, so the blueprint must be committed." >&2
  exit 1
fi
git -C "$BLUEPRINT_ROOT" archive --format=tar HEAD | tar -x -C "$TARGET_DIR"

# --- BUG-009: seed project_config_* from templates/, not from this repo's own --
# The archive deliberately EXCLUDES the blueprint's own project_config_*.md
# (.gitattributes export-ignore), because those describe THIS repo. The seed
# source is templates/, copied straight from the blueprint working tree.
#
# Before the split those were the same files, so anything the blueprint wrote
# about itself shipped to every new project — a monitor row describing an
# incident in the blueprint's own stream was seeded verbatim into a derived
# project. Same class as BUG-002, BUG-006 and BUG-010: a specific thing baked
# into a file that travels.
#
# Fails LOUDLY if a template is missing: a project bootstrapped without its
# config files looks fine until someone needs one, and the fix then is a manual
# archaeology exercise.
#
# HANDOVER.md joined the same split under BUG-028. It is described as "the
# canonical resume template a new project fills in", but what actually shipped
# was the BLUEPRINT'S LIVE handover — its current WIP branch, its unfixed review
# findings, and a relative link into `docs/done/`, which is export-ignore'd. So
# every new project opened with another repo's in-flight notes as its own resume
# doc, and its first `doc-links` run failed on the dangling link. Same defect as
# the configs above, found the same way: the template and the live file were one
# file.
#
# Entries are `templates/<src>=<dest relative to the project root>`.
for _seed in project_config_overview.md=project_config_overview.md \
             project_config_paths.md=project_config_paths.md \
             project_config_dod.md=project_config_dod.md \
             project_config_security.md=project_config_security.md \
             project_config_infra.md=project_config_infra.md \
             HANDOVER.md=docs/doing/HANDOVER.md \
             BACKLOG.md=docs/backlog/BACKLOG.md \
             BACKLOG-BUGS.md=docs/backlog/BUGS.md; do
  _src="${_seed%%=*}"
  _dst="${_seed#*=}"
  if [[ ! -f "$BLUEPRINT_ROOT/templates/$_src" ]]; then
    echo "ERROR: $BLUEPRINT_ROOT/templates/$_src is missing — cannot seed the project." >&2
    echo "       The blueprint checkout is incomplete or predates the BUG-009 split." >&2
    exit 1
  fi
  mkdir -p "$(dirname "$TARGET_DIR/$_dst")"
  cp "$BLUEPRINT_ROOT/templates/$_src" "$TARGET_DIR/$_dst"
done

# Files the blueprint deliberately does NOT track but a project still needs.
# AGENT_ROSTER.md is gitignored per-engineer state (A-12), so it is seeded from
# the tracked example further down rather than copied.

# --- Substitute placeholders ---
#
# BUG-028. This used to be a hand-maintained TARGETS array rewritten with a raw
# `sed`, and both halves were wrong:
#
#   - The LIST went stale. `docs/way-of-working.md` and `scripts/lib/state-dir.sh`
#     carry the placeholder and were never added, so `blueprint drift` — the
#     command CLAUDE.md mandates at every wake — reported 5 drifted files on a
#     zero-second-old bootstrap. The first thing a new project heard from its
#     own tooling was a false report.
#   - The `sed` was a FOURTH copy of the substitution. It knew nothing of
#     `{{PROJECT_NAME_UPPER}}` (hence `docs/A2BP_PLAYBOOK.md` drifting), and it
#     mangles a project name containing `&` or `\` — the exact defect
#     scripts/lib/placeholders.sh exists to have fixed once (A-07 R5-F1).
#
# So: the same primitive pull and drift use, over the set drift compares. The
# list comes from `blueprint files` rather than being copied here, because a
# copied list is what went stale. Drift-clean by construction, not by upkeep.
# shellcheck source=scripts/lib/placeholders.sh
. "$BLUEPRINT_ROOT/scripts/lib/placeholders.sh"

_synced_files() {
  bash "$BLUEPRINT_ROOT/scripts/blueprint" files | sed -n 's/^  \([^ ].*\)$/\1/p'
}

_subst_count=0
while IFS= read -r f; do
  [[ -n "$f" && -f "$TARGET_DIR/$f" ]] || continue
  bp_should_substitute "$f" || continue
  grep -q '{{PROJECT_NAME' "$TARGET_DIR/$f" 2>/dev/null || continue
  if ! bp_substitute_in_place "$TARGET_DIR/$f" "$PROJECT_NAME"; then
    echo "❌ Could not substitute placeholders in $f — bootstrap would ship a" >&2
    echo "   half-templated project, and 'blueprint drift' would report it forever." >&2
    exit 1
  fi
  _subst_count=$((_subst_count + 1))
done < <(_synced_files)
echo "🔤 Substituted placeholders in $_subst_count file(s)."

# --- Seed the LIVE baton (BUG-019) ---
# AGENT_SIGNAL.md is the protocol; the baton itself is untracked per-checkout
# state under logs/state/, so a freshly bootstrapped project has none. Seed it
# here for the same reason the roster is copied from its .example: a new project
# should be able to run the ceremony without a manual first step.
if [[ -f "$TARGET_DIR/scripts/signal-set.sh" ]]; then
  ( cd "$TARGET_DIR" && bash scripts/signal-set.sh \
      --holder Nobody --state IDLE \
      --task "Bootstrapped from the blueprint. Claim the mic to begin." ) >/dev/null 2>&1 || true
fi

# --- Today's date in HANDOVER + AGENT_SIGNAL stamps ---
TODAY="$(date '+%Y-%m-%d')"
for f in "$TARGET_DIR/AGENT_SIGNAL.md" "$TARGET_DIR/docs/doing/HANDOVER.md"; do
  if [[ -f "$f" ]]; then
    sed -i.bak "s/{{YYYY-MM-DD}}/$TODAY/g" "$f"
    rm "$f.bak"
  fi
done

# --- Seed the per-engineer agent roster (the .env model) ---
# AGENT_ROSTER.example.md is tracked and blueprint-managed; AGENT_ROSTER.md is
# gitignored and personal, because each engineer runs a different fleet. Seed a
# copy so the project works out of the box, but never overwrite an existing one
# (a re-run must not clobber a roster someone has customised).
if [[ -f "$TARGET_DIR/AGENT_ROSTER.example.md" && ! -f "$TARGET_DIR/AGENT_ROSTER.md" ]]; then
  cp "$TARGET_DIR/AGENT_ROSTER.example.md" "$TARGET_DIR/AGENT_ROSTER.md"
  echo "👥 Seeded AGENT_ROSTER.md from the example (gitignored — edit it to match your fleet)."
fi

# --- Record blueprint provenance ---
#
# `blueprint_remote` is written as a PLACEHOLDER the operator must fill in, not
# guessed from the local checkout's `origin`. Bootstrap is exactly where guessing
# is most tempting — the origin is right there — and exactly where it is worst:
# the value silently becomes the destination every future a2bp request is pushed
# to, and it would be wrong for anyone whose checkout tracks a fork. Pushing a
# request to the wrong repository is not a recoverable mistake.
#
# a2bp refuses until it is filled in, and the refusal prints these same lines.
BLUEPRINT_SHA="$(cd "$BLUEPRINT_ROOT" && git rev-parse HEAD 2>/dev/null || echo 'no-sha')"

# BUG-012: `blueprint_source` is recorded RELATIVE to the project root.
#
# An absolute host path is the one field here that cannot be correct on two
# machines at once — storm2flow carried a `/Users/…` path onto a Linux box and
# every blueprint command died on it. A relative path pins the LAYOUT (blueprint
# beside project), which is the only thing bootstrap actually knows, and it
# survives the commoner case too: moving or re-cloning the tree.
#
# Resolving from the project root costs nothing — `read_blueprint_source`
# already requires cwd to be the project root, since it greps
# `./.blueprint-source`.
#
# Pure bash rather than `realpath --relative-to`: that flag is GNU-only, and
# macOS — where the storm2flow path came from — ships BSD realpath without it.
# Falling back to an absolute path there would leave the originating platform
# unfixed.
_relative_path() {
  local from="$1" to="$2" i=0 j rel=""
  local -a f_parts t_parts
  local IFS='/'
  read -r -a f_parts <<<"${from#/}"
  read -r -a t_parts <<<"${to#/}"
  while [ "$i" -lt "${#f_parts[@]}" ] && [ "$i" -lt "${#t_parts[@]}" ] \
        && [ "${f_parts[$i]}" = "${t_parts[$i]}" ]; do
    i=$((i + 1))
  done
  for (( j = i; j < ${#f_parts[@]}; j++ )); do rel="../$rel"; done
  for (( j = i; j < ${#t_parts[@]}; j++ )); do rel="${rel}${t_parts[$j]}/"; done
  rel="${rel%/}"
  printf '%s' "${rel:-.}"
}

# Both ends resolved physically first: a relative path computed from a value
# containing `..` or a symlink would be wrong in a way that only shows up later.
BLUEPRINT_SOURCE_REL="$(
  _relative_path "$(cd "$TARGET_DIR" && pwd -P)" "$(cd "$BLUEPRINT_ROOT" && pwd -P)"
)"
cat > "$TARGET_DIR/.blueprint-source" <<EOF
# Records the blueprint commit this project was bootstrapped from,
# and where back-propagation requests are filed.
# Used by the blueprint-sync workflow (see blueprint/README.md).
config_version   = 2

# LOCAL checkout — read by 'blueprint drift' and 'blueprint pull'.
# RELATIVE to this file's directory (BUG-012): an absolute path cannot be right
# on two machines at once, and breaks as soon as either checkout moves.
blueprint_source = $BLUEPRINT_SOURCE_REL
bootstrap_sha    = $BLUEPRINT_SHA
bootstrap_date   = $TODAY

# REMOTE — where 'blueprint a2bp' files requests. FILL THIS IN; it is not
# inferred from the local checkout on purpose (see above). a2bp refuses until
# it names a real repository.
blueprint_remote = FILL-ME-IN
blueprint_branch = main
EOF

# --- git init + hook wire ---
(
  cd "$TARGET_DIR"
  git init -q
  git config --local core.hooksPath .githooks
  # Identity was already validated before the target was created (see the
  # pre-flight check above); nothing is written to local config here.
  # Show it: if your global identity is a work address and this is a personal
  # project, this is the moment to notice — see STACK_DEFAULTS.md
  # §"Git author identity".
  # `git var` (not `git config --get`) so a GIT_AUTHOR_* env override is shown
  # accurately; strip the trailing "<unix-ts> <tz>" that git var appends.
  echo "🖋  Committing as: $(git var GIT_AUTHOR_IDENT | sed 's/ [0-9][0-9]* [+-][0-9][0-9]*$//')"
  git add -A
  git commit -q -m "chore(bootstrap): initialize $PROJECT_NAME from struct2flow blueprint ($BLUEPRINT_SHA)"
)

# --- Optional: npm init if Node is present ---
if command -v npm >/dev/null 2>&1; then
  echo "📦 Running 'npm init -y' for backend/ and frontend/ if they exist (skipping if absent)..."
  # The blueprint doesn't ship src dirs — the founder creates these when ready.
  # Bootstrap leaves it intentionally light: just the agent infra is in place.
else
  echo "(npm not found; skipping npm init — bootstrap leaves the project agent-only.)"
fi

cat <<EOF

✅ Bootstrap complete.

Next steps:
  1. cd $TARGET_DIR
  2. Open in VS Code: code .
  3. brew bundle    (installs gitleaks + semgrep + osv-scanner for the pre-push gate)
  4. Fill out project_config_overview.md, project_config_paths.md, project_config_dod.md, project_config_security.md, project_config_infra.md
  5. Create your backend/frontend src tree as needed
  6. Optional: APPEND your project guards to .githooks/pre-push-project.
     It already ships populated — it wires the regression suites that guard the
     blueprint-managed machinery this project runs. Copying the .example OVER it
     would take those suites off your push path. The .example is a menu of guard
     shapes to copy from.

Blueprint sync:
  - Add the blueprint CLI to PATH (once per machine):
      export PATH="\$HOME/sources/struct2flow/blueprint/scripts:\$PATH"
    (or symlink: ln -s ~/sources/struct2flow/blueprint/scripts/blueprint /usr/local/bin/blueprint)
  - From this project root:
      blueprint drift        # see what's changed in the blueprint since bootstrap
      blueprint pull         # pull blueprint changes forward (interactive)
      blueprint a2bp <file>  # back-propagate a generic improvement to the blueprint
      blueprint files        # show which files are blueprint-managed
  - The blueprint commit you bootstrapped from is recorded in .blueprint-source

Happy struct2flowing.
EOF
