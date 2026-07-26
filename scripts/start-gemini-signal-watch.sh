#!/usr/bin/env bash
set -euo pipefail

# Launcher for the AGENT_SIGNAL.md ↔ Gemini CLI orchestrator.
#
# Mirror of start-codex-signal-watch.sh, but for Gemini. Watches
# AGENT_SIGNAL.md (via the shared scripts/codex-signal-watch.sh polling
# engine) and, every time the mic flips to `OVER_TO_GEMINI`, invokes the
# real Gemini CLI in non-interactive (-p) YOLO mode with the current `Task`
# field as the prompt. Gemini's file edits + signal flip land directly in
# the repo; its final message + run log are captured to the project's state dir
# (see scripts/lib/state-dir.sh — `~/.<repo-name>/gemini-last-message.md` and
# `~/.<repo-name>/gemini-runs.log` by default).
#
# Usage:
#   scripts/start-gemini-signal-watch.sh
#
# The Gemini CLI is `@google/gemini-cli` (npm global) or whatever
# `GEMINI_BIN` points at. Auth reuses ~/.gemini/oauth_creds.json (the
# Gemini Code Assist extension login).
#
# NOTE: the shared poller (codex-signal-watch.sh) executes the wake script
# via its CODEX_WAKE_COMMAND env hook — we reuse that hook here (the name is
# incidental; the poller is provider-agnostic). The trigger STATE is passed
# as --state OVER_TO_GEMINI so this never collides with the Codex watcher.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Discover the Gemini binary.
if [[ -n "${GEMINI_BIN:-}" ]]; then
  :
elif command -v gemini >/dev/null 2>&1; then
  GEMINI_BIN="$(command -v gemini)"
else
  GEMINI_BIN="$(find "$HOME/.nvm/versions/node" -type f -name gemini -path '*/bin/*' 2>/dev/null | sort -V | tail -1)"
fi

if [[ -z "${GEMINI_BIN:-}" || ! -x "$GEMINI_BIN" ]]; then
  cat >&2 <<EOF
Gemini CLI not found.

Tried:
  1. \$GEMINI_BIN ($GEMINI_BIN)
  2. \`gemini\` on PATH
  3. ~/.nvm/versions/node/*/bin/gemini

Install with: npm install -g @google/gemini-cli  (then authenticate once),
or point GEMINI_BIN at a gemini binary you trust, then re-run.
EOF
  exit 1
fi

# State dir derived the SAME way the activity feed derives it (A-09) — so the
# feed reads exactly the run log THIS project writes, never another project's.
. "$ROOT/scripts/lib/state-dir.sh"
STATE_DIR="$(agent_state_dir "$ROOT")"
mkdir -p "$STATE_DIR"
RUN_LOG="$STATE_DIR/gemini-runs.log"
OUTPUT_LAST="$STATE_DIR/gemini-last-message.md"

export GEMINI_BIN
export RUN_LOG
export OUTPUT_LAST
export ROOT
# Runs every time State = OVER_TO_GEMINI fires. AGENT_SIGNAL_TASK is the
# current Task field, exported by the poller. We hand Gemini the radio-over
# preamble + Task and let it edit files / flip the signal in YOLO mode.
export CODEX_WAKE_COMMAND='
set -u
now="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$now] dispatching gemini -p (yolo) ..." | tee -a "$RUN_LOG"
echo "  Task: $AGENT_SIGNAL_TASK" | tee -a "$RUN_LOG"
cd "$ROOT"
# GOOGLE_GENAI_USE_GCA=true selects the Gemini Code Assist OAuth creds
# (~/.gemini/oauth_creds.json from the extension login); --skip-trust trusts
# this workspace for the run so --yolo can auto-approve file writes.
GOOGLE_GENAI_USE_GCA=true "$GEMINI_BIN" --skip-trust --yolo --prompt "You are running in the {{PROJECT_NAME}} radio-over coordination protocol with Claude Code. The shared signal lives at AGENT_SIGNAL.md and Claude has just flipped the mic to you. Current Task field: $AGENT_SIGNAL_TASK. Read AGENT_SIGNAL.md and any docs it references, do the work, then EDIT ONLY the Holder/State/Task rows of AGENT_SIGNAL.md to set Holder=Claude Code and State=OVER_TO_CLAUDE with a one-line summary of what you produced, preserving the rest of the file verbatim. Do NOT run git commit or git add." \
  2>&1 | tee "$OUTPUT_LAST" >> "$RUN_LOG"
end="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$end] gemini finished — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
'

exec "${ROOT}/scripts/codex-signal-watch.sh" --state OVER_TO_GEMINI --log "$STATE_DIR/signal.log" "$@"
