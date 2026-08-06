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

# BUG-019 — the LIVE coordination baton.
#
# `AGENT_SIGNAL.md` was a TRACKED file holding LIVE runtime state. Each property
# is fine alone and a defect together: git owns tracked files in the working
# tree, so `git switch`, `git checkout <file>`, `git stash` and `git rebase`
# rewrite the baton — correctly, by their own contract — INCLUDING while an
# agent is mid-dispatch. Reproduced live: a checkout reverted the baton and the
# dispatched agent refused to proceed, silently. Nothing failed; the watcher
# simply had nothing left to claim.
#
# It was rare until every fix became a branch. The mechanism never changed; the
# frequency changed by an order of magnitude.
#
# The split: live mic state lives here, untracked (logs/ is gitignored), while
# AGENT_SIGNAL.md keeps the protocol prose. That is exactly the shape already
# used for AGENT_ROSTER.md / AGENT_ROSTER.example.md, which is per-engineer live
# state with a tracked template — the precedent, not a new idea.
#
# What it costs, stated because it was the crux of the decision: `git log -p
# AGENT_SIGNAL.md` stops being the hand-off history. Agreed with Codex that mic
# flips are LOCAL OPERATIONAL EVENTS while durable decisions belong in tracked
# plan and review documents — and that the append-only journal beside this file
# is in one way MORE accurate, because it records flips that were never
# committed, which git could never show.
#
# agent_signal_file [repo_root]
#   Honors $AGENT_SIGNAL_FILE if set, else `<state dir>/signal.md`.
agent_signal_file() {
  printf '%s\n' "${AGENT_SIGNAL_FILE:-$(agent_state_dir "${1:-}")/signal.md}"
}

# agent_signal_journal [repo_root]
#   Append-only record of every flip.
#
#   THIS IS NO LONGER A BACKSTOP (FEATURE-003). It used to say "only
#   signal-set.sh appends, and nothing reads it to decide anything", and all
#   three clauses are now false: `session-resume.sh` READS it to decide what to
#   replay since the last handoff, and its `--mark` APPENDS the window markers.
#
#   Two consequences, both of which were bugs before they were documented:
#     * a failed append is no longer swallowed — signal-set.sh exits 8 rather
#       than losing an event the next replay would silently omit (BUG-023);
#     * `--mark` rolls the window in ONE append, because two appends leave a gap
#       a concurrent flip can land in, belonging to no replay window. That is
#       A-09's "two writers agreeing by coincidence" one level up, and this file
#       is where the warning about it lived while it came true next door.
#
#   NOTHING TRUNCATES OR ROTATES IT, and the whole replay design rests on that.
#   If you are about to add rotation here, the marker positions in
#   session-resume.sh stop meaning anything — fix that first.
#
#   Derived from the BATON's directory, not independently from the repo root, so
#   it follows $AGENT_SIGNAL_FILE wherever that points. The first version
#   resolved it from the root alone, and tests/signal-set/ — which overrides the
#   baton to a fixture — appended eleven fixture rows to the REAL journal on its
#   first run. A record that follows its subject cannot drift from it; two
#   independent derivations of one location is the A-09 defect, and I had just
#   reintroduced it in the file that documents it.
agent_signal_journal() {
  printf '%s\n' "$(dirname "$(agent_signal_file "${1:-}")")/signal-history.log"
}
