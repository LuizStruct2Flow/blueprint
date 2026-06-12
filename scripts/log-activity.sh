#!/usr/bin/env bash
# Hook → activity-feed appender. Wired in .claude/settings.json on the
# SubagentStart / SubagentStop events so Claude Code SUBAGENTS show up in the
# unified feed (logs/agent-activity.log) the same way Codex does — closing the
# "38-min black hole" where an Agent-tool subagent ran invisibly (a subagent has
# no separate transcript for scripts/agent-activity.sh's claude_feed() to tail).
#
# Reads the hook payload JSON on stdin. Emits ONE line:
#   HH:MM:SS [<label> - Claude Code] <event>: <summary>
# matching the feed's existing "[Persona - Backing Agent] …" format.
#
# Self-rotating (the founder's "delete older entries" requirement): after each
# append, if the log exceeds MAX_FEED_LINES it is trimmed IN PLACE to the last
# KEEP_FEED_LINES (truncate-and-rewrite preserves the inode so a concurrent
# `tee -a` from agent-activity.sh keeps writing to the same file). Tunable via
# env: LWA_FEED_MAX_LINES / LWA_FEED_KEEP_LINES.
#
# Defensive by design: a hook must NEVER fail the tool call. Every branch falls
# back to a best-effort line and exits 0. No jq → degrades to the raw event name.
set -uo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
log="$repo_root/logs/agent-activity.log"
mkdir -p "$repo_root/logs"

MAX_LINES="${LWA_FEED_MAX_LINES:-4000}"
KEEP_LINES="${LWA_FEED_KEEP_LINES:-2000}"

payload="$(cat 2>/dev/null || true)"

extract() { # extract <jq-filter> — empty string if jq missing / no match
  command -v jq >/dev/null 2>&1 || { printf ''; return; }
  printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null | head -1
}

event="$(extract '.hook_event_name')"; [ -n "$event" ] || event="Subagent"
# Best-effort summary across the fields different events expose. The Agent
# tool's description is the most useful; fall back through plausible keys.
summary="$(extract '.agent_description // .description // .prompt // .last_message // .reason')"
summary="$(printf '%s' "$summary" | tr -d '\n' | cut -c1-110)"

# Label by the roster persona when the payload names the agent (so the feed
# shows "[matthias - Claude Code]", matching AGENT_ROSTER.md), else env, else
# generic. This is what makes .claude/agents/<persona>.md real in the feed.
plabel="$(extract '.subagent_type // .agent_type // .agent_name')"
label="${plabel:-${LWA_FEED_LABEL:-subagent}}"
ts="$(date +%H:%M:%S)"

# Map this subagent's id → persona so the live feed (agent-activity.sh's
# subagent_feed) can label the STREAMED internal lines from
# <session>/subagents/agent-<agent_id>.jsonl with the persona name, not just
# bracket them with the dispatch/finish markers below. agent_id matches the
# transcript filename; agent_type is the roster persona. Best-effort, never fatal.
aid="$(extract '.agent_id')"
if [ -n "$aid" ] && [ -n "$plabel" ]; then
  printf '%s %s\n' "$aid" "$plabel" >> "$repo_root/logs/.subagent-map" 2>/dev/null || true
fi
case "$event" in
  SubagentStart) marker="→ dispatched" ;;
  SubagentStop)  marker="← finished" ;;
  *)             marker="$event" ;;
esac

printf '%s [%s - Claude Code] %s%s\n' \
  "$ts" "$label" "$marker" "${summary:+: $summary}" >> "$log" 2>/dev/null || true

# Rotation — only when we cross the ceiling, and only by the appender that
# just wrote (cheap: one wc). tail→tmp→cat keeps the inode for tee -a.
lines="$(wc -l < "$log" 2>/dev/null || echo 0)"
if [ "$lines" -gt "$MAX_LINES" ] 2>/dev/null; then
  tmp="$log.rot.$$"
  if tail -n "$KEEP_LINES" "$log" > "$tmp" 2>/dev/null; then
    cat "$tmp" > "$log" 2>/dev/null || true
    rm -f "$tmp" 2>/dev/null || true
  fi
fi
exit 0
