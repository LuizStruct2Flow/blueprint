#!/usr/bin/env bash
set -euo pipefail

# Launcher for the AGENT_SIGNAL.md ↔ Codex CLI orchestrator.
#
# Watches AGENT_SIGNAL.md (via scripts/codex-signal-watch.sh) and, every
# time the mic flips to `OVER_TO_CODEX`, invokes the real Codex CLI in
# non-interactive `exec` mode with the current `Task` field as the
# prompt. Codex's response (file edits, signal flip) lands directly in
# the repo via `--sandbox workspace-write`; the human-readable summary
# is appended to the project's state dir (see scripts/lib/state-dir.sh —
# `<repo>/logs/state/codex-runs.log` by default) for review.
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

# Anchored to this script's own location — NOT to `git rev-parse` (which answers
# about the caller's exported GIT_DIR, per BUG-014) and NOT to `pwd`. Either can
# name a different checkout, and this script then sources THAT tree's
# lib/state-dir.sh, so a stale copy of the derivation wins and the feed and the
# dispatcher stop sharing a state dir. See scripts/codex-signal-watch.sh
# repo_root() for the full reasoning and the reproduction.
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

# The state dir is derived INSIDE the wake command (below), not here. Deriving
# it at launcher start and exporting the result froze the paths for the life of
# the watcher — days — so a change to the derivation kept writing the old ones
# with nothing failing. Two derivations, one of them stale, is the A-09 shape
# again; there is deliberately only one, and it runs per dispatch.

# The wake command runs every time `State = OVER_TO_CODEX` fires.
# `AGENT_SIGNAL_TASK` is the current `Task` field, exported by
# codex-signal-watch.sh. We pass it to `codex exec` along with explicit
# coordination instructions so Codex knows it's in the radio-over
# protocol.
export CODEX_BIN
export ROOT
export CODEX_WAKE_COMMAND='
set -u
# Resolved HERE, on every dispatch — not baked in when the watcher started.
# A watcher lives for days; the derivation can change under it, and a frozen
# path fails silently (BUG-020, Codex review round 2 finding 3).
. "$ROOT/scripts/lib/state-dir.sh"
STATE_DIR="$(agent_state_dir "$ROOT")"
mkdir -p "$STATE_DIR"
RUN_LOG="$STATE_DIR/codex-runs.log"
OUTPUT_LAST="$STATE_DIR/codex-last-message.md"
now="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$now] dispatching codex exec ..." | tee -a "$RUN_LOG"
echo "  Task: $AGENT_SIGNAL_TASK" | tee -a "$RUN_LOG"
# --json + codex-feed-filter.sh keeps the activity feed at one concise line per
# action (codex prose, commands, file changes) instead of echoing every file
# codex reads. stderr → RUN_LOG raw; stdout JSON → filter → RUN_LOG concise.
# --output-last-message still captures the final message for verdict reading.
"$CODEX_BIN" exec --json \
  --cd "$ROOT" \
  --sandbox workspace-write \
  --skip-git-repo-check \
  --output-last-message "$OUTPUT_LAST" \
  "You are running in the {{PROJECT_NAME}} radio-over coordination protocol with Claude Code. The shared signal lives at AGENT_SIGNAL.md. Claude has just flipped the mic to you. Current Task field: $AGENT_SIGNAL_TASK. Read AGENT_SIGNAL.md and any docs/doing/*.md it references, do the work, then flip AGENT_SIGNAL.md back to Holder=Claude Code / State=OVER_TO_CLAUDE (or ACTIVE if you finished the whole thread) and update the Task field with what you did. Commit your changes if appropriate." \
  2>>"$RUN_LOG" | bash "$ROOT/scripts/codex-feed-filter.sh" >>"$RUN_LOG"
end="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$end] codex exec finished — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
'

exec "${ROOT}/scripts/codex-signal-watch.sh" "$@"
