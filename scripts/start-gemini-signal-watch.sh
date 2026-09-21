#!/usr/bin/env bash
set -euo pipefail

# Launcher for the AGENT_SIGNAL.md ↔ Gemini CLI orchestrator.
#
# Mirror of start-codex-signal-watch.sh, but for Gemini. Watches
# AGENT_SIGNAL.md (via the shared scripts/signal-watch.sh polling
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
# NOTE: the shared poller (signal-watch.sh) executes the wake script via its
# AGENT_WAKE_COMMAND env hook (TASK-063; the poller is provider-agnostic, was
# renamed from codex-signal-watch.sh/CODEX_WAKE_COMMAND). The trigger STATE is
# passed as --state OVER_TO_GEMINI so this never collides with the Codex/Kimi
# watchers.

# Anchored to this script's own location — see scripts/signal-watch.sh
# repo_root() for why `git rev-parse` and `pwd` are both wrong here (exported
# GIT_DIR, and a different checkout's lib/state-dir.sh silently winning).
# --- physical script root (A-09 / BUG-020) -----------------------------------
# Resolved from THIS FILE, through symlinks. See scripts/signal-watch.sh
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
export AGENT_WAKE_COMMAND='
set -u
# Resolved HERE, on every dispatch — not baked in when the watcher started.
# A watcher lives for days; the derivation can change under it, and a frozen
# path fails silently (BUG-020, Codex review round 2 finding 3).
BP_CODE_ROOT="$ROOT"
. "$ROOT/scripts/lib/state-dir.sh"
BP_STATE_ROOT="$(bp_state_root)" || exit 9
STATE_DIR="$(agent_state_dir)"
mkdir -p "$STATE_DIR"
RUN_LOG="$STATE_DIR/gemini-runs.log"
OUTPUT_LAST="$STATE_DIR/gemini-last-message.md"
# The roster has to be available before either the feed label or hand-back
# target is resolved. A Holder is a persona, never the backing-agent name.
if [ -r "$ROOT/scripts/lib/roster.sh" ]; then
  . "$ROOT/scripts/lib/roster.sh"
fi

# Label Gemini output at the point of dispatch. The activity supervisor cannot
# recover this attribution later: it outlives several mic holders. Keeping the
# raw run log out of its pump also prevents a growing unterminated CLI line from
# being emitted again on every polling tick.
FEED_LABEL="Gemini"
if command -v bp_roster_label >/dev/null 2>&1; then
  __label="$(bp_roster_label "$BP_STATE_ROOT" "${AGENT_SIGNAL_HOLDER:-Gemini}" 2>/dev/null)"
  [ -n "$__label" ] && FEED_LABEL="$__label"
fi
if [ -r "$ROOT/scripts/lib/feed.sh" ]; then
  . "$ROOT/scripts/lib/feed.sh"
else
  feed_append(){ :; }
fi

# Resolve the receiving persona from the roster. `signal-set.sh` rejects the
# former literal backing-agent value (Claude Code) because it is not a Holder.
ORCHESTRATOR_NAME=""
if command -v bp_roster_name_for_role >/dev/null 2>&1; then
  ORCHESTRATOR_NAME="$(bp_roster_name_for_role "$BP_STATE_ROOT" Orchestrator 2>/dev/null)"
fi
if [ -z "$ORCHESTRATOR_NAME" ]; then
  ORCHESTRATOR_NAME="Orchestrator"
  printf "[roster] no Orchestrator row resolved — hand-back preamble falls back to the literal Orchestrator\\n" | tee -a "$RUN_LOG" >&2
fi

now="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$now] dispatching gemini -p (yolo) ..." | tee -a "$RUN_LOG"
echo "  Task: $AGENT_SIGNAL_TASK" | tee -a "$RUN_LOG"
feed_append "[$FEED_LABEL] dispatched — $AGENT_SIGNAL_TASK"
cd "$ROOT"
# GOOGLE_GENAI_USE_GCA=true selects the Gemini Code Assist OAuth creds
# (~/.gemini/oauth_creds.json from the extension login); --skip-trust trusts
# this workspace for the run so --yolo can auto-approve file writes.
GEMINI_STATUS_FILE="$(mktemp "$STATE_DIR/.gemini-exit-status.XXXXXX" 2>/dev/null)" || GEMINI_STATUS_FILE="$STATE_DIR/.gemini-exit-status.$$"
{
  GOOGLE_GENAI_USE_GCA=true "$GEMINI_BIN" --skip-trust --yolo --prompt "You are running in the {{PROJECT_NAME}} radio-over coordination protocol with Claude Code. The protocol is documented in AGENT_SIGNAL.md; the LIVE baton is at logs/state/signal.md and is written ONLY via scripts/signal-set.sh. Claude has just flipped the mic to you. Current Task field: $AGENT_SIGNAL_TASK. Read AGENT_SIGNAL.md and any docs it references, do the work, then hand the mic back by RUNNING scripts/signal-set.sh with --holder set to $ORCHESTRATOR_NAME, --state set to OVER_TO_CLAUDE, and --task set to a one-line summary of what you produced. Do NOT hand-edit any baton file. You may run git add and git commit for your work if appropriate. Do NOT run git push; only Claude pushes." \
    2>&1
  printf "%s" "$?" >"$GEMINI_STATUS_FILE"
} \
  | tee "$OUTPUT_LAST" \
  | while IFS= read -r __line || [ -n "$__line" ]; do
      printf "%s\\n" "$__line" >>"$RUN_LOG"
      [ -n "$__line" ] && feed_append "[$FEED_LABEL] $__line"
    done
GEMINI_STATUS="$(cat "$GEMINI_STATUS_FILE" 2>/dev/null)"
rm -f "$GEMINI_STATUS_FILE"
end="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
if [ "${GEMINI_STATUS:-1}" = "0" ]; then
  echo "[$end] gemini finished — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
  feed_append "[$FEED_LABEL] finished — last message in $OUTPUT_LAST"
else
  echo "[$end] gemini FAILED (exit ${GEMINI_STATUS:-unknown}) — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
  feed_append "[$FEED_LABEL] FAILED (exit ${GEMINI_STATUS:-unknown}) — see $OUTPUT_LAST"
fi
'

exec "${ROOT}/scripts/signal-watch.sh" --state OVER_TO_GEMINI "$@"
