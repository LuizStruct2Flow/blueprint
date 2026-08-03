#!/usr/bin/env bash
# scripts/no-chain-guard.sh — PreToolUse hook: refuse chained Bash commands.
#
# Enforces CLAUDE.md §"Running commands — one per call, chains only when
# dependent". Blocks `&&`, `||` and `;`. **Pipes are permitted** — a pipeline is
# one operation whose filter cannot run without its producer, which is the
# dependency test that section states.
#
# WHY A HOOK AND NOT THE RULE ALONE
#
# The rule has been in CLAUDE.md for weeks. Across one long session on
# 2026-08-02 the agent broke it repeatedly while believing it was complying,
# and the founder had to correct it three separate times. A rule that must be
# remembered at the moment the author is busy is the wrong shape of fix — the
# same conclusion BUG-004 reached about "flip the mic last", and BUG-014 about
# fixture isolation. Prose describes; a hook enforces.
#
# Ported from the peer stream (`rdc-agenticcoding-blueprint`
# `scripts/no-chain-guard.sh`, landed 2026-07-30, founder-accepted), where it
# reports blocking a dozen-plus calls per session. Not re-derived — room Rule 1.
#
# THE REASON THE RULE EXISTS is permission granularity, not style. The allowlist
# matches one command *pattern* at a time. A compound string is matched as a
# single unit, so a permissive early pattern silently carries everything joined
# to it: `cd x && rm -rf y` is reviewed as a `cd`. That collapses one decision
# per command into one decision per blob, and it defeats the `deny` list by the
# same mechanism.
#
# TWO KNOWN LIMITS, both from the peer stream's live use — stated because a
# guard whose failure modes are undocumented gets worked around instead of used:
#
#   1. It matches operators inside QUOTED CONTENT. A commit message whose prose
#      contains `;` or `||` trips it. The workaround is better practice anyway:
#      write the body with the Write tool into `.scratch/`, then
#      `git commit -F .scratch/<file>` — reviewable, and immune to the matcher.
#      This repo already has the same class of false positive in its deny list:
#      `Bash(* --no-verify*)` blocked a task string that merely *discussed*
#      `--no-verify`.
#   2. It is INERT until workspace trust is accepted, because it lives in
#      `.claude/settings.json` — as does the allowlist. An untrusted project has
#      no guard AND prompts on everything, and those two compound.
#
# Contract: read the tool payload on stdin, exit 0 to allow, exit 2 to block
# with the reason on stderr. Never fail open on a parse problem — but never
# block a tool that is not Bash either.

set -uo pipefail

payload="$(cat 2>/dev/null || true)"

# Only Bash is in scope. Without jq, fail OPEN: a missing dependency must not
# make every tool call unusable, and the rule it enforces is a hygiene rule, not
# a security boundary.
command -v jq >/dev/null 2>&1 || exit 0

tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$tool" = "Bash" ] || exit 0

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$cmd" ] || exit 0

# `&&`, `||`, or `;` anywhere in the command string. Deliberately naive: the
# peer stream's experience is that a cleverer parser is not worth it, because
# the false positives have a workaround that is an improvement in its own right.
case "$cmd" in
  *'&&'*|*'||'*|*';'*) ;;
  *) exit 0 ;;
esac

cat >&2 <<'MSG'
BLOCKED: chained command (&& || ;). Run one command per tool call.

  - Independent commands  → separate tool calls. They dispatch in parallel in
    one turn, so nothing is lost by splitting them.
  - Another repo/dir      → use the tool's own flag: `git -C <dir> …`.
    Do NOT `cd <dir> && git …`.
  - A pipe (a | b)        → allowed. Re-send it unchanged.
  - A fixed recipe        → put it behind a script with its own allowlist entry
    (scripts/sonar-api.sh is the worked example), rather than chaining ad hoc.
  - Commit message prose  → this guard also matches ; and || inside quoted text
    and heredocs. Write the body to .scratch/ with the Write tool, then
    `git commit -F .scratch/<file>`.

Why: the permission allowlist matches one command PATTERN at a time. A compound
string is matched as one unit, so an early permissive pattern silently carries
everything joined to it — and that also defeats the deny list.
CLAUDE.md §"Running commands — one per call, chains only when dependent".
MSG
exit 2
