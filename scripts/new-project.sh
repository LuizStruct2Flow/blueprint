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

# --- Refuse to overwrite an existing dir ---
if [[ -e "$TARGET_DIR" ]]; then
  echo "❌ Target already exists: $TARGET_DIR" >&2
  echo "   Pick a different PROJECT_NAME / TARGET_DIR, or remove the existing dir first." >&2
  exit 1
fi

echo "📦 Bootstrapping struct2flow project '$PROJECT_NAME' at $TARGET_DIR"

mkdir -p "$TARGET_DIR"

# --- Copy blueprint contents (everything except .git) ---
# Use a literal find + cp loop so we don't accidentally clone the blueprint's git history.
(
  cd "$BLUEPRINT_ROOT"
  find . -maxdepth 1 -mindepth 1 ! -name '.git' -print0 \
    | xargs -0 -I{} cp -R '{}' "$TARGET_DIR/"
)

# --- Substitute placeholders in known files ---
# We only substitute in files that the blueprint ships; project source code
# will not exist yet, so no need for a broad sweep.
TARGETS=(
  "CLAUDE.md"
  "AGENTS.md"
  "AGENT_SIGNAL.md"
  "STACK_DEFAULTS.md"
  "docs/DoD.md"
  "docs/OBSERVABILITY.md"
  "docs/SECURITY.md"
  "docs/INFRASTRUCTURE.md"
  "docs/PUBLISHING.md"
  "docs/doing/HANDOVER.md"
  "scripts/codex-signal-watch.sh"
  "scripts/start-codex-signal-watch.sh"
  ".githooks/pre-push"
  "config/README.md"
  "project_config_overview.md"
  "project_config_paths.md"
  "project_config_dod.md"
  "project_config_security.md"
  "project_config_infra.md"
)

for f in "${TARGETS[@]}"; do
  if [[ -f "$TARGET_DIR/$f" ]]; then
    sed -i.bak "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "$TARGET_DIR/$f"
    rm "$TARGET_DIR/$f.bak"
  fi
done

# --- Today's date in HANDOVER + AGENT_SIGNAL stamps ---
TODAY="$(date '+%Y-%m-%d')"
for f in "$TARGET_DIR/AGENT_SIGNAL.md" "$TARGET_DIR/docs/doing/HANDOVER.md"; do
  if [[ -f "$f" ]]; then
    sed -i.bak "s/{{YYYY-MM-DD}}/$TODAY/g" "$f"
    rm "$f.bak"
  fi
done

# --- Record blueprint provenance ---
BLUEPRINT_SHA="$(cd "$BLUEPRINT_ROOT" && git rev-parse HEAD 2>/dev/null || echo 'no-sha')"
cat > "$TARGET_DIR/.blueprint-source" <<EOF
# Records the blueprint commit this project was bootstrapped from.
# Used by the blueprint-sync workflow (see blueprint/README.md).
blueprint_source = $BLUEPRINT_ROOT
bootstrap_sha    = $BLUEPRINT_SHA
bootstrap_date   = $TODAY
EOF

# --- git init + hook wire ---
(
  cd "$TARGET_DIR"
  git init -q
  git config --local core.hooksPath .githooks
  # Repo-local personal identity — see STACK_DEFAULTS.md §Git author identity.
  # Override per-project for genuinely-work projects in project_config_overview.md.
  git config --local user.email "luiz@struct2flow.com"
  git config --local user.name  "Luiz Scheidegger"
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
  6. Optional: copy .githooks/pre-push-project.example to .githooks/pre-push-project and edit

Blueprint sync:
  - On any new conversation, ask the agent to check 'blueprint drift'
  - The blueprint commit you bootstrapped from is recorded in .blueprint-source

Happy struct2flowing.
EOF
