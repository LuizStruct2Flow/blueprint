#!/bin/sh
# scripts/lib/state-dir.sh — shared agent state-dir derivation. Sourced, not executed.
#
# A-09: the activity feed and the Codex/Gemini dispatchers rendezvous through a
# per-project state dir — the dispatchers APPEND run logs there, the feed READS
# them and streams `[CODEX]` / `[GEMINI]` lines. For that to be a rendezvous and
# not a collision, both sides must compute the SAME directory from the SAME rule.
#
# They did not. The feed derived `~/.<repo-basename>` at runtime; the dispatchers
# hardcoded the literal `~/.{{PROJECT_NAME}}/` — a bootstrap placeholder that was
# never substituted (this repo is the template AND a working copy, so it stayed
# literal). Result: EVERY blueprint-derived checkout's dispatcher wrote into the
# one shared `~/.{{PROJECT_NAME}}/` directory, and any feed pointed there saw
# every other project's Codex output interleaved. A redcare acceptance verdict
# surfaced live in this project's feed — that is the whole defect in one line.
#
# The fix is one mechanism, sourced by every caller — never two implementations
# that agree only when a substitution happens to line up (cf. scripts/lib/gate.sh).
#
# agent_state_dir [repo_root]
#   Honors $AGENT_STATE_HOME if set (feed precedence), else `~/.<repo-basename>`.
#   repo_root defaults to the enclosing git work tree, then $PWD.
agent_state_dir() {
  _asd_root="${1:-}"
  if [ -z "$_asd_root" ]; then
    _asd_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  fi
  printf '%s\n' "${AGENT_STATE_HOME:-$HOME/.$(basename "$_asd_root")}"
}
