#!/bin/sh
# scripts/lib/branch-guard.sh — refuse to commit or push on the blueprint's main.
# Sourced, not executed.
#
# CLAUDE.md §"Never push to the blueprint's `main`": every blueprint change
# reaches main through a pull request, and — the half that is easy to miss —
# **"Commit on a branch, or do not commit yet."** A local commit on a shared
# branch is not isolation: whoever pushes next carries it out with theirs. That
# is recorded as having happened, three commits across two pushes.
#
# Neither door was guarded. On 2026-08-03 an agent committed to main here and it
# surfaced only because the following `git push -u origin <branch>` named a
# branch that did not exist yet — caught by luck, not by anything.
#
# THE DERIVED-PROJECT HALF IS THE IMPORTANT ONE. Product projects are
# TRUNK-BASED: committing straight to main is exactly what they are supposed to
# do (CLAUDE.md §"Team Workflow"). This file ships to all of them, so a guard
# that fired everywhere would break every project that pulled it. It keys off
# `.blueprint-root`, the marker BUG-013 introduced precisely to tell the
# blueprint from its descendants — the same signal, already load-bearing and
# already tested.
#
# bp_branch_guard <verb>
#   Returns 0 to proceed, 1 to refuse. <verb> is "commit" or "push", used only
#   in the message.
bp_branch_guard() {
  _bg_verb="${1:-commit}"
  _bg_root="$(git rev-parse --show-toplevel 2>/dev/null)" || return 0

  # Not the blueprint → not our business. A derived project commits to main by
  # design and must never be blocked here.
  [ -f "$_bg_root/.blueprint-root" ] || return 0

  _bg_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || return 0
  case "$_bg_branch" in
    main|master) ;;
    *) return 0 ;;
  esac

  # A merge or rebase in progress writes commits as part of an operation the
  # operator already started deliberately (`git pull` on main, conflict
  # resolution). Blocking mid-operation leaves the tree in a half-finished state
  # and teaches people to reach for --no-verify, which disables every other hook
  # too. The commits it produces are not new work.
  _bg_git="$(git rev-parse --git-dir 2>/dev/null || echo .git)"
  if [ -e "$_bg_git/MERGE_HEAD" ] || [ -d "$_bg_git/rebase-merge" ] || [ -d "$_bg_git/rebase-apply" ]; then
    return 0
  fi

  cat >&2 <<EOF
REFUSED: this is the blueprint, and you are on '$_bg_branch'.

Every blueprint change reaches main through a pull request — and that includes
not COMMITTING here first. A local commit on a shared branch is not isolation:
whoever pushes next carries it out with theirs. That has happened.

  git switch -c <topic>          # then $_bg_verb again

or, alongside a concurrent session in this checkout:

  git worktree add <tmp>/bp-<topic> -b <topic> origin/main

Derived projects are trunk-based and are NOT affected by this guard — it keys
off .blueprint-root, which only the blueprint has.

See CLAUDE.md §"Never push to the blueprint's \`main\`".
EOF
  return 1
}
