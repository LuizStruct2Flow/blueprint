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
if [ -L "$_bp_self" ]; then
  echo "FATAL: symlink chain for $_bp_self exceeds 40 hops — cycle?" >&2
  exit 1
fi
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

# THE FEED LABEL, built here and nowhere else (BUG-021).
#
# The persona is a per-dispatch fact: AGENT_SIGNAL_HOLDER is exported fresh for
# each trigger, and this is the only point in the system where it is known
# alongside the output it produced. The feed reads a long-lived log and binds
# its labels once at daemon start, so it stamped every Codex line `[CODEX]`
# regardless of who held the mic — 103 such lines against 5 labelled ones in
# linkedin-watcher-agent before this changed.
#
# bp_roster_label is the SAME function the feed uses for its mic-flip lines, so
# the two cannot drift into different formats.
#
# FAILS OPEN, unlike .githooks/commit-msg which fails closed — and the asymmetry
# is the point. There the check IS the work, so being unable to check must stop
# the commit. Here the label is decoration on top of the work: a missing lib must
# cost a nice label, never the dispatch. Sourcing these unguarded aborted the
# whole wake command in any tree without them, which tests/state-dir caught as a
# dispatch that never happened at all. feed.sh states the same rule for itself —
# "a feed line is worth having; it is never worth failing a push over".
FEED_LABEL="Codex"
if [ -r "$ROOT/scripts/lib/roster.sh" ]; then
  . "$ROOT/scripts/lib/roster.sh"
  __label="$(bp_roster_label "$ROOT" "${AGENT_SIGNAL_HOLDER:-Codex}" 2>/dev/null)"
  [ -n "$__label" ] && FEED_LABEL="$__label"
fi
if [ -r "$ROOT/scripts/lib/feed.sh" ]; then
  . "$ROOT/scripts/lib/feed.sh"
else
  feed_append(){ :; }
fi

now="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$now] dispatching codex exec ..." | tee -a "$RUN_LOG"
echo "  Task: $AGENT_SIGNAL_TASK" | tee -a "$RUN_LOG"
feed_append "[$FEED_LABEL] dispatched — $AGENT_SIGNAL_TASK"
# --json + codex-feed-filter.sh keeps the activity feed at one concise line per
# action (codex prose, commands, file changes) instead of echoing every file
# codex reads. stderr → RUN_LOG raw; stdout JSON → filter → RUN_LOG concise.
# --output-last-message still captures the final message for verdict reading.
"$CODEX_BIN" exec --json \
  --cd "$ROOT" \
  --sandbox workspace-write \
  --skip-git-repo-check \
  --output-last-message "$OUTPUT_LAST" \
  "You are running in the {{PROJECT_NAME}} radio-over coordination protocol with Claude Code. The protocol is documented in AGENT_SIGNAL.md; the LIVE baton is at logs/state/signal.md and is written ONLY via scripts/signal-set.sh. Claude has just flipped the mic to you. Current Task field: $AGENT_SIGNAL_TASK. Read AGENT_SIGNAL.md and any docs/doing/*.md it references, do the work, then hand the mic back by RUNNING scripts/signal-set.sh with --holder set to Claude Code, --state set to OVER_TO_CLAUDE, and --task set to a one-line summary of what you did (use --state ACTIVE instead if you finished the whole thread). Do NOT hand-edit any baton file: one writer publishes it atomically, and a half-written baton has caused real mis-dispatches. Commit your changes if appropriate." \
  2>>"$RUN_LOG" \
  | bash "$ROOT/scripts/codex-feed-filter.sh" \
  | while IFS= read -r __line; do
      printf "%s\n" "$__line" >>"$RUN_LOG"
      [ -n "$__line" ] && feed_append "[$FEED_LABEL] $__line"
    done
end="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$end] codex exec finished — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
feed_append "[$FEED_LABEL] finished — last message in $OUTPUT_LAST"
'

exec "${ROOT}/scripts/codex-signal-watch.sh" "$@"
