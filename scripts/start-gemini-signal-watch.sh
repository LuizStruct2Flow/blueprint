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
# (see scripts/lib/state-dir.sh — `<repo>/logs/state/gemini-last-message.md`
# and `<repo>/logs/state/gemini-runs.log` by default).
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

# Anchored to this script's own location — see scripts/codex-signal-watch.sh
# repo_root() for why `git rev-parse` and `pwd` are both wrong here (exported
# GIT_DIR, and a different checkout's lib/state-dir.sh silently winning).
# --- physical script root (A-09 / BUG-020) -----------------------------------
# Resolved from THIS FILE, through symlinks. See scripts/codex-signal-watch.sh
# for why $0, cwd and `git rev-parse` are each wrong here. The block below is
# byte-identical in every consumer and tests/state-dir/ #7 enforces that: it
# cannot be shared as a lib, because finding the lib is the very problem it
# solves.
_bp_self="${BASH_SOURCE[0]}"
_bp_hops=0
while [ -L "$_bp_self" ] && [ "$_bp_hops" -lt 40 ]; do
  _bp_dir="$(cd -P "$(dirname "$_bp_self")" && pwd)"
  _bp_self="$(readlink "$_bp_self")"
  case "$_bp_self" in /*) ;; *) _bp_self="$_bp_dir/$_bp_self" ;; esac
  _bp_hops=$((_bp_hops + 1))
done
_bp_root="$(cd -P "$(dirname "$_bp_self")/.." && pwd)"
ROOT="$_bp_root"

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
# The state dir is derived INSIDE the wake command (below), not here — see
# start-codex-signal-watch.sh for why exporting a resolved path freezes it for
# the watcher's whole life. The `--log` argument that used to be built from a
# copy here is gone too: the poller derives signal.log from its own script root,
# which is this same tree, so passing it was a second derivation that could only
# ever disagree by being stale.

export GEMINI_BIN
export ROOT
# Runs every time State = OVER_TO_GEMINI fires. AGENT_SIGNAL_TASK is the
# current Task field, exported by the poller. We hand Gemini the radio-over
# preamble + Task and let it edit files / flip the signal in YOLO mode.
export CODEX_WAKE_COMMAND='
set -u
# Resolved HERE, on every dispatch — not baked in when the watcher started.
# A watcher lives for days; the derivation can change under it, and a frozen
# path fails silently (BUG-020, Codex review round 2 finding 3).
. "$ROOT/scripts/lib/state-dir.sh"
STATE_DIR="$(agent_state_dir "$ROOT")"
mkdir -p "$STATE_DIR"
RUN_LOG="$STATE_DIR/gemini-runs.log"
OUTPUT_LAST="$STATE_DIR/gemini-last-message.md"
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

exec "${ROOT}/scripts/codex-signal-watch.sh" --state OVER_TO_GEMINI "$@"
