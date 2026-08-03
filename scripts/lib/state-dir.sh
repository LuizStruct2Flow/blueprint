#!/bin/sh
# scripts/lib/state-dir.sh — shared agent state-dir derivation. Sourced, not executed.
#
# A-09: the activity feed and the Codex/Gemini dispatchers rendezvous through a
# per-project state dir — the dispatchers APPEND run logs there, the feed READS
# them and streams `[CODEX]` / `[GEMINI]` lines. For that to be a rendezvous and
# not a collision, both sides must compute the SAME directory from the SAME rule.
#
# They did not. The feed derived `~/.<repo-basename>` at runtime; the dispatchers
# hardcoded a literal, never-substituted bootstrap placeholder as their state dir
# (this repo is the template AND a working copy, so it stayed literal). The path
# they baked in was `~/.{{PROJECT_NAME}}/`.  a2bp-allow: the defective path is
# quoted here deliberately as the incident record; it is prose, not a code path.
# Result: EVERY blueprint-derived checkout's dispatcher wrote into that one
# shared directory, and any feed pointed there saw every other project's Codex
# output interleaved. A redcare acceptance verdict surfaced live in this
# project's feed — that is the whole defect in one line.
#
# The fix is one mechanism, sourced by every caller — never two implementations
# that agree only when a substitution happens to line up (cf. scripts/lib/gate.sh).
#
# BUG-020 — the state dir lives INSIDE the project now.
#
# A-09 made the feed and the dispatchers agree on a path. It did not ask whether
# that path should be outside the project, and `~/.<repo-basename>` left this
# repo with two kinds of agent log in opposite places: logs/agent-activity.log
# inside, codex-runs.log outside.
#
# The test adopted 2026-08-03 is "would being inside a git tree break this?" —
# not "is it temporary?". For append-only run logs the answer is no: logs/ is
# already gitignored and the feed writes there happily. (Contrast a2bp's scratch
# CLONE, which genuinely must be outside any git tree and is created with
# mktemp -d by the code that owns it.)
#
# Two things this fixes beyond tidiness:
#   * Deleting the project now deletes its state. It did not before, and a
#     project bootstrapped at the same path later INHERITED the old records —
#     the same "stale record survives deletion" trap the peer stream hit with
#     workspace trust.
#   * Nothing needs to reach $HOME to find agent state, so out-of-project
#     directory grants stop being required for ordinary operation.
#
# AGENT_STATE_HOME still overrides, unchanged: an operator who deliberately
# points several checkouts at one state dir keeps that. A-09's guarantee is
# untouched, because this is still the SINGLE derivation every side sources —
# moving it moves all of them together, which is the whole point of the file.
#
# agent_state_dir [repo_root]
#   Honors $AGENT_STATE_HOME if set (feed precedence), else `<repo>/logs/state`.
#   repo_root defaults to the enclosing git work tree, then $PWD.
agent_state_dir() {
  _asd_root="${1:-}"
  if [ -z "$_asd_root" ]; then
    _asd_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  fi
  printf '%s\n' "${AGENT_STATE_HOME:-$_asd_root/logs/state}"
}
