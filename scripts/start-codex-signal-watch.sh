#!/usr/bin/env bash
set -euo pipefail

# Launcher for the AGENT_SIGNAL.md ↔ Codex CLI orchestrator.
#
# Watches AGENT_SIGNAL.md (via scripts/codex-signal-watch.sh) and, every
# time the mic flips to `OVER_TO_CODEX`, invokes the real Codex CLI in
# non-interactive `exec` mode with the current `Task` field as the
# prompt. Codex's response (file edits, signal flip) lands directly in
# the repo via `--sandbox workspace-write`; the human-readable summary
# is appended to `~/.{{PROJECT_NAME}}/codex-runs.log` for review.
#
# Usage:
#   scripts/start-codex-signal-watch.sh
#
# Run this in a dedicated terminal tab (or `tmux` window) and leave it
# running. The watcher polls every 2s by default; change with
# `--poll N` if you prefer slower polling.
#
# The Codex CLI is the one bundled with the OpenAI / ChatGPT VS Code
# extension. If you install Codex via npm globally instead, point
# `CODEX_BIN` at that binary.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Discover the Codex binary. Prefer an explicit override, otherwise
# walk the VS Code extension dirs for the latest bundled `codex`.
if [[ -n "${CODEX_BIN:-}" ]]; then
  :
elif command -v codex >/dev/null 2>&1; then
  CODEX_BIN="$(command -v codex)"
else
  CODEX_BIN="$(find "$HOME/.vscode/extensions" -type f -name codex -path '*/bin/*' 2>/dev/null | sort -V | tail -1)"
fi

if [[ -z "${CODEX_BIN:-}" || ! -x "$CODEX_BIN" ]]; then
  cat >&2 <<EOF
Codex CLI not found.

Tried:
  1. \$CODEX_BIN ($CODEX_BIN)
  2. \`codex\` on PATH
  3. ~/.vscode/extensions/*/bin/*/codex

Install the OpenAI / ChatGPT VS Code extension OR point CODEX_BIN at a
codex binary you trust, then re-run.
EOF
  exit 1
fi

mkdir -p "$HOME/.{{PROJECT_NAME}}"
RUN_LOG="$HOME/.{{PROJECT_NAME}}/codex-runs.log"
OUTPUT_LAST="$HOME/.{{PROJECT_NAME}}/codex-last-message.md"

# The wake command runs every time `State = OVER_TO_CODEX` fires.
# `AGENT_SIGNAL_TASK` is the current `Task` field, exported by
# codex-signal-watch.sh. We pass it to `codex exec` along with explicit
# coordination instructions so Codex knows it's in the radio-over
# protocol.
export CODEX_BIN
export RUN_LOG
export OUTPUT_LAST
export ROOT
export CODEX_WAKE_COMMAND='
set -u
now="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$now] dispatching codex exec ..." | tee -a "$RUN_LOG"
echo "  Task: $AGENT_SIGNAL_TASK" | tee -a "$RUN_LOG"
"$CODEX_BIN" exec \
  --cd "$ROOT" \
  --sandbox workspace-write \
  --skip-git-repo-check \
  --output-last-message "$OUTPUT_LAST" \
  "You are running in the {{PROJECT_NAME}} radio-over coordination protocol with Claude Code. The shared signal lives at AGENT_SIGNAL.md. Claude has just flipped the mic to you. Current Task field: $AGENT_SIGNAL_TASK. Read AGENT_SIGNAL.md and any docs/doing/*.md it references, do the work, then flip AGENT_SIGNAL.md back to Holder=Claude Code / State=OVER_TO_CLAUDE (or ACTIVE if you finished the whole thread) and update the Task field with what you did. Commit your changes if appropriate." \
  >>"$RUN_LOG" 2>&1
end="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$end] codex exec finished — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
'

exec "${ROOT}/scripts/codex-signal-watch.sh" "$@"
