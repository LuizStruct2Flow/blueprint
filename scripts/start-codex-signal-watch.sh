#!/usr/bin/env bash
set -euo pipefail

# Launcher for the AGENT_SIGNAL.md ↔ Codex CLI orchestrator.
#
# Watches AGENT_SIGNAL.md (via scripts/signal-watch.sh) and, every
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
# dispatcher stop sharing a state dir. See scripts/signal-watch.sh
# repo_root() for the full reasoning and the reproduction.
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
# signal-watch.sh. We pass it to `codex exec` along with explicit
# coordination instructions so Codex knows it's in the radio-over
# protocol.
export CODEX_BIN
export ROOT
# TASK-063: the poller's hook is AGENT_WAKE_COMMAND now (the poller is
# provider-agnostic — Gemini and Kimi export it too). Kept the name
# CODEX_WAKE_COMMAND only as read-side back-compat in signal-watch.sh; every
# producer, including this one, exports the generic name.
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
RUN_LOG="$STATE_DIR/codex-runs.log"
OUTPUT_LAST="$STATE_DIR/codex-last-message.md"

# BUG-142: THE DISPATCHED CLI IS THE HOLDER PERSONA, not the Orchestrator.
# agent-activity.sh --whoami resolves the Orchestrator row unless AGENT_PERSONA
# overrides it, and nothing set that override here — so a dispatched agent
# asking who it is got the Orchestrator name (seen live twice: baton
# Holder=Florian, a dispatched Kimi --whoami answered Eto). The poller exports
# the dispatch persona as AGENT_SIGNAL_HOLDER; bridge it to the override
# resolve_identity already honours, at the only point where both are in scope.
# Deliberately NOT a second identity path inside --whoami — that is the
# BUG-010/BUG-021 two-copies-of-one-rule shape. Guarded so a wake run with no
# holder in scope leaves any ambient AGENT_PERSONA untouched.
[ -n "${AGENT_SIGNAL_HOLDER:-}" ] && export AGENT_PERSONA="$AGENT_SIGNAL_HOLDER"

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
  __label="$(bp_roster_label "$BP_STATE_ROOT" "${AGENT_SIGNAL_HOLDER:-Codex}" 2>/dev/null)"
  [ -n "$__label" ] && FEED_LABEL="$__label"
fi
if [ -r "$ROOT/scripts/lib/feed.sh" ]; then
  . "$ROOT/scripts/lib/feed.sh"
else
  feed_append(){ :; }
fi

# WHO TO HAND BACK TO (TASK-061). The preamble used to tell Codex to flip back
# to a hardcoded `Holder=Claude Code`, but Holder is a PERSONA NAME, and the
# Orchestrator name varies by roster (project to project, engineer to
# engineer). Resolved here, at dispatch time, from the same roster lookup
# `agent-activity.sh --whoami` uses — never a second resolver (BUG-010 class).
# A roster with no Orchestrator row falls back visibly: logged to RUN_LOG, not
# silently hardcoded, because a silent fallback here is exactly the defect this
# fixes.
ORCHESTRATOR_NAME=""
if command -v bp_roster_name_for_role >/dev/null 2>&1; then
  ORCHESTRATOR_NAME="$(bp_roster_name_for_role "$BP_STATE_ROOT" Orchestrator 2>/dev/null)"
fi
if [ -z "$ORCHESTRATOR_NAME" ]; then
  ORCHESTRATOR_NAME="Orchestrator"
  printf "[roster] no Orchestrator row resolved — hand-back preamble falls back to the literal 'Orchestrator'\n" | tee -a "$RUN_LOG" >&2
fi

# THE MODEL AND EFFORT, from the Model cell of the holder persona (TASK-059).
# A Codex persona passes `-m <slug> -c model_reasoning_effort=<effort>`. A cell
# that does not resolve REFUSES the dispatch, visibly: running the wrong model
# quietly is the failure this exists to stop. A holder that is not a Codex
# persona with a Model cell dispatches on the codex default model, and says so.
set --
REQUESTED_MODEL="" REQUESTED_EFFORT=""
if command -v bp_roster_model_for_name >/dev/null 2>&1; then
  __m="$(bp_roster_model_for_name "$BP_STATE_ROOT" "${AGENT_SIGNAL_HOLDER:-}" 2>&1)"
  case $? in
    0) case "$__m" in
         Codex*) REQUESTED_MODEL="$(printf "%s" "$__m" | cut -f2)"
                 REQUESTED_EFFORT="$(printf "%s" "$__m" | cut -f3)"
                 set -- -m "$REQUESTED_MODEL" -c "model_reasoning_effort=$REQUESTED_EFFORT" ;;
         *) __m="[roster] ${AGENT_SIGNAL_HOLDER:-}: not a Codex persona" ;;
       esac ;;
    1) printf "%s — dispatch refused\n" "$__m" | tee -a "$RUN_LOG" >&2
       feed_append "[$FEED_LABEL] dispatch refused: $__m"
       exit 8 ;;
  esac
  [ "$#" -eq 0 ] && printf "%s — codex runs its configured default model\n" "$__m" | tee -a "$RUN_LOG"
fi

# WHAT WAS ACTUALLY RUN (TASK-060). `-m`/`-c model_reasoning_effort=` above is
# the REQUEST; Codex is free to fall back, and an operator config.toml can
# override it at runtime, so the roster cell is not proof of what ran. The
# Codex session file is the actual record, found by the THREAD ID the dispatch
# itself announces on its own `--json` stream (`thread.started`), never by
# guessing at a file — see scripts/lib/codex-session.sh for what is confirmed
# and what is still pending a live dispatch. Logged once at dispatch time
# (what was requested) and once more once the actual run is known (below,
# after the dispatch finishes); the feed keeps the roster-resolved label
# until then, exactly as before TASK-060.
if [ -n "$REQUESTED_MODEL" ]; then
  printf "[roster] requested model=%s effort=%s\n" "$REQUESTED_MODEL" "$REQUESTED_EFFORT" | tee -a "$RUN_LOG"
else
  printf "[roster] requested model=<codex default>\n" | tee -a "$RUN_LOG"
fi
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
if [ -r "$ROOT/scripts/lib/codex-session.sh" ]; then
  . "$ROOT/scripts/lib/codex-session.sh"
fi
# A copy of codex exec raw --json stream, so the thread id can be read back
# after the fact without disturbing the feed-filter pipe below. /dev/null on a
# failed mktemp: the tee then just discards, and thread-id resolution degrades
# to "unknown" exactly like a missing lib — never costs the dispatch.
RAW_JSON="$(mktemp "${TMPDIR:-/tmp}/bp-codex-raw.XXXXXX" 2>/dev/null)" || RAW_JSON="/dev/null"

now="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
echo "[$now] dispatching codex exec ..." | tee -a "$RUN_LOG"
echo "  Task: $AGENT_SIGNAL_TASK" | tee -a "$RUN_LOG"
feed_append "[$FEED_LABEL] dispatched — $AGENT_SIGNAL_TASK"

# BUG-143, causes 2 and 3: `--output-last-message` is written by codex ONLY
# when the process exits, so (2) a run that dies never touches it and a
# PREVIOUS run'\''s report survives looking current, and (3) an agent that
# hands the mic back mid-run (before codex exits) leaves the Orchestrator
# reading that same stale file seconds before the real report lands — seen
# live twice in a row. Stamping an honest in-progress marker HERE, before
# codex runs, makes both readings true instead of misleading: if codex dies,
# the marker is what survives; if the mic flips early, the marker is what a
# premature read sees, and it says plainly that this run has not reported
# yet. A successful run overwrites the marker with its real last message via
# --output-last-message, same as before.
printf "[in-progress] codex exec dispatched %s — no report written yet\n" "$now" >"$OUTPUT_LAST"

# TASK-066: workspace-write deliberately excludes repository metadata, but a
# dispatched agent must be able to create its own commit. Grant only the git
# common directory, never the whole filesystem. `--git-common-dir` is vital
# for linked worktrees: their `$ROOT/.git` is a file, while objects and refs
# live in the common directory. Clear inherited git-location overrides first;
# BUG-014 prohibits letting the watcher operate on an exported GIT_DIR.
CODEX_GIT_DIR="$(
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
  git -C "$ROOT" rev-parse --git-common-dir
)" || {
  printf "[git] could not resolve the repository common directory — dispatch refused\n" | tee -a "$RUN_LOG" >&2
  exit 7
}
case "$CODEX_GIT_DIR" in
  /*) ;;
  *) CODEX_GIT_DIR="$ROOT/$CODEX_GIT_DIR" ;;
esac
CODEX_GIT_DIR="$(cd -P "$CODEX_GIT_DIR" && pwd)" || {
  printf "[git] repository common directory is not accessible — dispatch refused\n" | tee -a "$RUN_LOG" >&2
  exit 7
}

# BUG-143, cause 1: `codex exec` sits in a pipeline that was written for dash
# (`sh -c`, no PIPESTATUS, no `set -o pipefail`), so its exit status was
# lost — a run that died still logged "codex exec finished". BUG-144 F1 moved
# the poller wake spawn to `bash -c` (see the comment on that spawn in
# signal-watch.mts), so PIPESTATUS and `set -o pipefail` are available now;
# the original premise behind this workaround no longer holds, but it stays —
# proven, cheap, and not worth swapping for PIPESTATUS. Same fix as the Kimi
# launcher (TASK-063 cross-provider review): the command group writes `$?` to
# a status file right after codex exits, before its stdout (feeding tee)
# reaches EOF, so the file is always complete by the time the downstream
# stages finish.
#
# CAUTION when editing anything below this line, all the way down to the
# closing single quote hundreds of lines further on: this entire block is the
# CONTENT of a single-quoted shell string, executed later, not outer-script
# comment text read now. An apostrophe here closes that string early and
# turns everything after it into outer-shell syntax, which is how a single
# unescaped one produced BUG-144 F1 own syntax error. Write around
# apostrophes in this region rather than using the classic escape trick,
# which is easy to get wrong under review pressure.
CODEX_STATUS_FILE="$(mktemp "$STATE_DIR/.codex-exit-status.XXXXXX" 2>/dev/null)" || CODEX_STATUS_FILE="$STATE_DIR/.codex-exit-status.$$"
# --json + codex-feed-filter.sh keeps the activity feed at one concise line per
# action (codex prose, commands, file changes) instead of echoing every file
# codex reads. stderr → RUN_LOG raw; stdout JSON → filter → RUN_LOG concise.
# --output-last-message still captures the final message for verdict reading.
{
  "$CODEX_BIN" exec --json "$@" \
    --cd "$ROOT" \
    --sandbox workspace-write \
    --add-dir "$CODEX_GIT_DIR" \
    --skip-git-repo-check \
    --output-last-message "$OUTPUT_LAST" \
    "You are running in the {{PROJECT_NAME}} radio-over coordination protocol with Claude Code. The protocol is documented in AGENT_SIGNAL.md; the LIVE baton is at logs/state/signal.md and is written ONLY via scripts/signal-set.sh. Claude has just flipped the mic to you. Current Task field: $AGENT_SIGNAL_TASK. Read AGENT_SIGNAL.md and any docs/doing/*.md it references, do the work, then hand the mic back by RUNNING scripts/signal-set.sh with --holder set to $ORCHESTRATOR_NAME, --state set to OVER_TO_CLAUDE, and --task set to a one-line summary of what you did (use --state ACTIVE instead if you finished the whole thread). Do NOT hand-edit any baton file: one writer publishes it atomically, and a half-written baton has caused real mis-dispatches. You may run git add and git commit for your work if appropriate. Do NOT run git push; only Claude pushes." \
    2>>"$RUN_LOG"
  printf "%s" "$?" >"$CODEX_STATUS_FILE"
} \
  | tee -a "$RAW_JSON" \
  | bash "$ROOT/scripts/codex-feed-filter.sh" \
  | while IFS= read -r __line || [ -n "$__line" ]; do
      printf "%s\n" "$__line" >>"$RUN_LOG"
      [ -n "$__line" ] && feed_append "[$FEED_LABEL] $__line"
    done
CODEX_STATUS="$(cat "$CODEX_STATUS_FILE" 2>/dev/null)"
rm -f "$CODEX_STATUS_FILE"

# RESOLVE THE ACTUAL MODEL/EFFORT (TASK-060), from the thread id codex itself
# announced on its own --json stream (RAW_JSON, captured above via tee) — an IDENTITY
# lookup, never a guess. Any step that comes up empty (no thread.started seen,
# no jq, no rollout matching that exact id, no turn_context inside it) reports
# "unknown" with why, and the roster label already in FEED_LABEL is kept —
# this never invents a model.
ACTUAL_MODEL="" ACTUAL_EFFORT="" __rollout="" __thread_id="" __reason="no thread.started event observed"
if command -v bp_codex_thread_id_from_stream >/dev/null 2>&1; then
  __thread_id="$(bp_codex_thread_id_from_stream "$RAW_JSON" 2>/dev/null)"
fi
if [ -n "$__thread_id" ] && command -v bp_codex_rollout_for_thread >/dev/null 2>&1; then
  __rollout="$(bp_codex_rollout_for_thread "$CODEX_HOME_DIR" "$__thread_id" 2>/dev/null)"
  [ -n "$__rollout" ] || __reason="no rollout file matched thread $__thread_id"
fi
if [ -n "$__rollout" ] && command -v bp_codex_model_effort >/dev/null 2>&1; then
  __me="$(bp_codex_model_effort "$__rollout" 2>/dev/null)"
  if [ -n "$__me" ]; then
    ACTUAL_MODEL="$(printf "%s" "$__me" | cut -f1)"
    ACTUAL_EFFORT="$(printf "%s" "$__me" | cut -f2)"
  else
    __reason="rollout $__rollout has no turn_context"
  fi
fi
[ "$RAW_JSON" = "/dev/null" ] || rm -f "$RAW_JSON" 2>/dev/null
if [ -n "$ACTUAL_MODEL" ]; then
  printf "[roster] actual model=%s effort=%s (session %s)\n" "$ACTUAL_MODEL" "$ACTUAL_EFFORT" "$__rollout" | tee -a "$RUN_LOG"
  if command -v bp_roster_label >/dev/null 2>&1; then
    __actual_label="$(bp_roster_label "$BP_STATE_ROOT" "${AGENT_SIGNAL_HOLDER:-Codex}" "$ACTUAL_MODEL" "$ACTUAL_EFFORT" 2>/dev/null)"
    [ -n "$__actual_label" ] && FEED_LABEL="$__actual_label"
  fi
else
  printf "[roster] actual model: unknown (%s) — feed keeps the roster label\n" "$__reason" | tee -a "$RUN_LOG" >&2
fi

end="$(date -u "+%Y-%m-%dT%H:%M:%SZ")"
if [ "${CODEX_STATUS:-1}" = "0" ]; then
  echo "[$end] codex exec finished — see $OUTPUT_LAST for the last message" | tee -a "$RUN_LOG"
  feed_append "[$FEED_LABEL] finished — last message in $OUTPUT_LAST"
else
  # BUG-143: report distinctly rather than "finished" — and point at RUN_LOG,
  # not OUTPUT_LAST, because a dead run left only the in-progress marker there.
  echo "[$end] codex exec FAILED (exit ${CODEX_STATUS:-unknown}) — see $RUN_LOG" | tee -a "$RUN_LOG"
  feed_append "[$FEED_LABEL] FAILED (exit ${CODEX_STATUS:-unknown}) — see $RUN_LOG"
fi
'

exec "${ROOT}/scripts/signal-watch.sh" "$@"
