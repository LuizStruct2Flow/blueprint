#!/usr/bin/env bash
# scripts/sonar.sh — run SonarQube scanner with secrets sourced from .env.
#
# Usage: npm run sonar
#
# Reads SONAR_TOKEN + SONAR_HOST_URL from .env (gitignored) and exports
# them as env vars; sonar-scanner picks them up natively
# (sonar.token / sonar.host.url). Project config lives in
# sonar-project.properties.
#
# Requires sonar-scanner on PATH. It is deliberately NOT in
# scripts/install-toolchain.sh: that file installs what the pre-push GATE
# probes for, and Sonar is a post-commit audit a project opts into. Install via:
#   macOS   brew install sonar-scanner
#   Linux   unpack the CLI from sonarqube.org into ~/.local/bin
#   or add it to scripts/install-toolchain-project.sh if your project wants it
#   installed with the rest of the toolchain.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env ]]; then
  # Export only SONAR_* keys from .env so we don't leak other secrets
  # (ANTHROPIC_API_KEY, LINKEDIN_LI_AT, etc.) into a child process that
  # doesn't need them.
  #
  # NOTE: we use `eval "$(grep ...)"` instead of `source <(grep ...)`
  # because macOS still ships bash 3.2, and process-substitution into
  # `source` has a scope bug there — the variables get set but never
  # propagate back to the parent shell. eval is bash-3.2-safe and
  # the grep filter still constrains what gets evaluated to SONAR_* lines.
  set -a
  eval "$(grep -E '^SONAR_[A-Z_]+=' .env || true)"
  set +a
fi

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "❌ SONAR_TOKEN is not set. Add it to .env (see .env.example)." >&2
  exit 1
fi
if [[ -z "${SONAR_HOST_URL:-}" ]]; then
  echo "❌ SONAR_HOST_URL is not set. Add it to .env (see .env.example)." >&2
  exit 1
fi

if ! command -v sonar-scanner >/dev/null 2>&1; then
  echo "❌ sonar-scanner not found on PATH. macOS: brew install sonar-scanner." >&2
  echo "   Linux: unpack the CLI from sonarqube.org into ~/.local/bin." >&2
  exit 1
fi

# Regenerate coverage/lcov.info from a fresh vitest run before scanning,
# so SonarQube always reads the latest numbers. Skip with --no-coverage
# if you already ran the gate locally and just want to re-upload.
if [[ "${1:-}" == "--no-coverage" ]]; then
  shift
else
  echo "→ regenerating coverage (npm run test:coverage)..."
  npm run test:coverage --silent
fi

exec sonar-scanner "$@"
