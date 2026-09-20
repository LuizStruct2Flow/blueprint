#!/usr/bin/env bash
set -euo pipefail

# Launcher for the AGENT_SIGNAL.md ↔ Kimi CLI orchestrator.
#
# Mirror of start-gemini-signal-watch.sh, but for Kimi. Watches AGENT_SIGNAL.md
# (via the shared scripts/codex-signal-watch.sh polling engine) and, every time
# the mic flips to `OVER_TO_KIMI`, invokes the real Kimi CLI in non-interactive
# (-p) mode with the current `Task` field as the prompt — `-p` alone runs
# unattended (kimi 2.0.2 refuses to combine `-p` with `--auto`/`--yolo`, and
# doesn't need either: there is nobody to ask in prompt mode). Kimi's file
# edits + signal flip land directly in the repo; its final message + run log are
# captured to the project's state dir (see scripts/lib/state-dir.sh —
# `<repo>/logs/state/kimi-last-message.md` and `<repo>/logs/state/kimi-runs.log`
# by default).
#
# Usage:
#   scripts/start-kimi-signal-watch.sh
#
# The Kimi CLI is `~/.kimi-code/bin/kimi` or whatever `KIMI_BIN` points at.
# Auth reuses ~/.kimi-code/ (device-code login).
#
# NOTE: the shared poller (codex-signal-watch.sh) executes the wake script via
# its CODEX_WAKE_COMMAND env hook — we reuse that hook here (the name is
# incidental; the poller is provider-agnostic). The trigger STATE is passed as
# --state OVER_TO_KIMI so this never collides with the Codex/Gemini watchers.

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
if [ -L "$_bp_self" ]; then
  echo "FATAL: symlink chain for $_bp_self exceeds 40 hops — cycle?" >&2
  exit 1
fi
_bp_root="$(cd -P "$(dirname "$_bp_self")/.." && pwd)"
ROOT="$_bp_root"

# Discover the Kimi binary.
if [[ -n "${KIMI_BIN:-}" ]]; then
  :
elif command -v kimi >/dev/null 2>&1; then
  KIMI_BIN="$(command -v kimi)"
elif [[ -x "$HOME/.kimi-code/bin/kimi" ]]; then
  KIMI_BIN="$HOME/.kimi-code/bin/kimi"
fi

if [[ -z "${KIMI_BIN:-}" || ! -x "$KIMI_BIN" ]]; then
  cat >&2 <<EOF
Kimi CLI not found.

Tried:
  1. \$KIMI_BIN ($KIMI_BIN)
  2. \`kimi\` on PATH
  3. ~/.kimi-code/bin/kimi

Install per https://moonshotai.github.io/kimi-code/ (then authenticate once
with \`kimi login\`), or point KIMI_BIN at a kimi binary you trust, then
re-run.
EOF
  exit 1
fi

# State dir derived the SAME way the activity feed derives it (A-09) — so the
# feed reads exactly the run log THIS project writes, never another project's.
# The state dir is derived INSIDE the wake command (below), not here — see
# start-codex-signal-watch.sh for why exporting a resolved path freezes it for
# the watcher's whole life.

export KIMI_BIN
export ROOT
# Runs every time State = OVER_TO_KIMI fires. AGENT_SIGNAL_TASK is the current
# Task field, exported by the poller. We hand Kimi the radio-over preamble +
# Task and let it edit files / flip the signal in never-ask mode.
export CODEX_WAKE_COMMAND='
set -u
# Resolved HERE, on every dispatch — not baked in when the watcher started.
# A watcher lives for days; the derivation can change under it, and a frozen
# path fails silently (BUG-020, Codex review round 2 finding 3).
BP_CODE_ROOT="$ROOT"
. "$ROOT/scripts/lib/state-dir.sh"
BP_STATE_ROOT="$(bp_state_root)" || exit 9
STATE_DIR="$(agent_state_dir)"
mkdir -p "$STATE_DIR"
RUN_LOG="$STATE_DIR/kimi-runs.log"
OUTPUT_LAST="$STATE_DIR/kimi-last-message.md"
now="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$now] dispatching kimi -p ..." | tee -a "$RUN_LOG"
echo "  Task: $AGENT_SIGNAL_TASK" | tee -a "$RUN_LOG"
cd "$ROOT"
# --prompt mode has nobody to ask, so it already never interrupts — measured:
# `kimi --auto --prompt ...` and `kimi --yolo --prompt ...` both refuse to start
# ("Cannot combine --prompt with --auto/--yolo", kimi 2.0.2), and `-p` alone
# writes files with no approval step. Passing --auto/--yolo here would not
# soften that, it would make the dispatch fail outright.
"$KIMI_BIN" --prompt "You are running in the {{PROJECT_NAME}} radio-over coordination protocol with Claude Code. The protocol is documented in AGENT_SIGNAL.md; the LIVE baton is at logs/state/signal.md and is written ONLY via scripts/signal-set.sh. Claude has just flipped the mic to you. Current Task field: $AGENT_SIGNAL_TASK. Read AGENT_SIGNAL.md and any docs it references, do the work, then hand the mic back by RUNNING scripts/signal-set.sh with --holder set to Claude Code, --state set to OVER_TO_CLAUDE, and --task set to a one-line summary of what you produced. Do NOT hand-edit any baton file. Do NOT run git commit or git add." \
  2>&1 | tee "$OUTPUT_LAST" >> "$RUN_LOG"
end="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$end] kimi finished — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
'

exec "${ROOT}/scripts/codex-signal-watch.sh" --state OVER_TO_KIMI "$@"
