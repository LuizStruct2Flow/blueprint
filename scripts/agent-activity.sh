#!/usr/bin/env bash
# Unified agent activity feed — ONE tail-able stream, one [AGENT NAME] prefix per
# line. The FIRST agent to wake runs this; it is idempotent (a pidfile makes
# later agents no-op), and on that first start it:
#   1. CLEANS old entries (truncates logs/agent-activity.log) so it can't explode,
#   2. OPENS a Terminal window tailing the log so the founder sees it live,
#   3. STREAMS the merged feed into the log, merging:
#        - AGENT_SIGNAL.md mic changes  → [<Holder>] <State> — <Task>  (every agent)
#        - ~/.linkedin-watcher-agent/codex-runs.log  → [CODEX] <line>              (dispatch detail)
#        - ~/.linkedin-watcher-agent/gemini-runs.log → [GEMINI] <line>             (dispatch detail)
#
# Usage:
#   bash scripts/agent-activity.sh            # first agent: clean + open terminal + feed
#   tail -f logs/agent-activity.log           # follow the one file from anywhere
#
# Env:
#   AGENT_FEED_NO_TERM=1   don't auto-open a Terminal (headless / CI)
#   LINKEDIN_WATCHER_AGENT_HOME=...    override ~/.linkedin-watcher-agent
#
# Pull-based: only READS existing sources, so no agent changes how it writes.
# Ctrl-C stops it. (logs/ is gitignored.)
set -uo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
signal_file="$repo_root/AGENT_SIGNAL.md"
log_dir="$repo_root/logs"; mkdir -p "$log_dir"
out="$log_dir/agent-activity.log"
pidfile="$log_dir/.agent-activity.pid"
state_dir="${LINKEDIN_WATCHER_AGENT_HOME:-$HOME/.linkedin-watcher-agent}"; mkdir -p "$state_dir"

# First-agent-wins: if a live feed is already running, no-op (don't re-clean or
# re-open the terminal). This is what makes "only the first waking agent acts" true.
if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile" 2>/dev/null)" 2>/dev/null; then
  echo "[agent-activity] already running (pid $(cat "$pidfile")) — leaving it."
  exit 0
fi

: > "$out"                       # clean old entries — fresh per session
echo "$$" > "$pidfile"
trap 'rm -f "$pidfile"' EXIT

# Open a Terminal tailing the log (macOS). Skip with AGENT_FEED_NO_TERM=1 or off-mac.
if [ "${AGENT_FEED_NO_TERM:-0}" != "1" ] && command -v osascript >/dev/null 2>&1; then
  osascript -e "tell application \"Terminal\" to do script \"tail -F '$out'\"" >/dev/null 2>&1 \
    && echo "[agent-activity] opened a Terminal tailing $out"
fi

ts(){ date +%H:%M:%S; }
field(){ grep "^| $1 " "$signal_file" | head -1 | sed "s/^| $1 *| //; s/ *|\$//"; }

# This session's persona — it IS Sylvia, the Orchestrator (see AGENT_ROSTER.md).
persona="${AGENT_PERSONA:-Sylvia}"; backing="${AGENT_BACKING:-Claude Code}"
# Resolve a persona name to "Name - Backing agent" via the roster table; falls
# back to the bare name (or "User") if it isn't a roster persona.
persona_label(){
  local name="$1" b
  b=$(grep -E "\| $name \|" "$repo_root/AGENT_ROSTER.md" 2>/dev/null | head -1 | awk -F'|' '{gsub(/^ +| +$/,"",$4); print $4}')
  [ -n "$b" ] && printf '%s - %s' "$name" "$b" || printf '%s' "$name"
}

# One line per AGENT_SIGNAL.md change: who holds the mic, the state, first 100
# chars of the Task — prefixed by the agent's name.
signal_feed(){
  local last="" cur holder state task
  while true; do
    cur=$(stat -f %m "$signal_file" 2>/dev/null || stat -c %Y "$signal_file" 2>/dev/null)
    if [ -n "$cur" ] && [ "$cur" != "$last" ]; then
      last="$cur"
      holder=$(field Holder); state=$(field State); task=$(field Task)
      task=$(printf '%s' "$task" | tr -d '*' | cut -c1-100)
      printf '%s [%s] %s — %s\n' "$(ts)" "$(persona_label "${holder:-?}")" "${state:-?}" "$task"
    fi
    sleep 2
  done
}

# Tail a dispatched-agent run log, prefixing each new line. tail -F tolerates a
# file that doesn't exist yet (waits for the dispatcher to create it). Codex and
# Gemini write their FULL working output to these run logs, so this shows what
# they actually print, not just dispatch markers.
tail_prefixed(){
  local label="$1" file="$2"
  tail -n0 -F "$file" 2>/dev/null | while IFS= read -r line; do
    [ -n "$line" ] && printf '%s [%s] %s\n' "$(ts)" "$label" "$line"
  done
}

# Project a single transcript line (one JSONL record) to the feed's visible
# text. Kept as its own helper so the supervising loop and the inner tail share
# exactly one jq projection (assistant text + tool_use → "[<persona> - <backing>] …").
claude_project_line(){
  printf '%s' "$1" | jq -rc '
    select(.type=="assistant" and (.isSidechain != true)) | .message.content[]? |
    if .type=="text" then .text
    elif .type=="tool_use" then "> " + .name + ": " + ((.input.description // .input.command // .input.file_path // "")|tostring|.[0:90])
    else empty end' 2>/dev/null | while IFS= read -r out; do
      [ -n "$out" ] && printf '%s [%s - %s] %s\n' "$(ts)" "$persona" "$backing" "$out"
    done
}

# Reap a backgrounded "( tail | while )" subshell AND its child tail. Killing
# the subshell pid alone strands the `tail` binary (a child of the subshell) —
# it keeps running on the now-stale transcript and keeps emitting, which both
# leaks a process and lets dead-session lines bleed into the feed. So kill the
# subshell's descendants first (pkill -P), then the subshell itself.
reap_subtree(){
  [ -n "$1" ] || return 0
  pkill -P "$1" 2>/dev/null
  kill "$1" 2>/dev/null
}

# Tail THIS repo's most-recent Claude Code session transcript and emit the
# assistant's visible output (text + tool calls, not private thinking) as
# [<persona> - <backing>] lines — so Claude's actual work shows in the feed too,
# without switching to its prompt. Needs jq; no-op without it.
#
# Self-healing across session restarts: a Claude Code restart starts a NEW
# .jsonl transcript. Rather than binding to one file for the process lifetime
# (which leaves the feed tailing a DEAD transcript after a restart — subagents
# still log via the SubagentStop hook, but the orchestrator's lines vanish),
# this supervises an inner `tail` and rotates it onto the newest transcript
# whenever a newer one appears.
claude_feed(){
  command -v jq >/dev/null 2>&1 || return
  local proj newest cur="" tail_pid=""
  proj="$HOME/.claude/projects/$(printf '%s' "$repo_root" | sed 's#/#-#g')"

  # When this background subshell ends (feed stopped / Ctrl-C tears down the
  # process group), reap the inner tail subtree so it doesn't leak past the feed.
  trap 'reap_subtree "$tail_pid"' EXIT

  while true; do
    newest=$(ls -t "$proj"/*.jsonl 2>/dev/null | head -1)
    if [ -n "$newest" ] && [ "$newest" != "$cur" ]; then
      # A newer transcript appeared (or the first one). Switch the inner tail to
      # it. -n0 so we start from "now" and never replay a fresh session's history.
      reap_subtree "$tail_pid"
      cur="$newest"
      ( tail -n0 -F "$cur" 2>/dev/null | while IFS= read -r line; do
          claude_project_line "$line"
        done ) &
      tail_pid=$!
    fi
    sleep 3
  done
}

# Stream each Agent-tool SUBAGENT's INTERNAL activity (its own tool calls), not
# just the dispatch/finish brackets the SubagentStop hook emits. Each subagent
# writes <session>/subagents/agent-<agent_id>.jsonl; the SubagentStart hook
# (log-activity.sh) records "<agent_id> <persona>" into logs/.subagent-map, so a
# newly-appearing transcript is labeled with the roster persona. Closes the
# "subagent black hole" — a 17-min build no longer shows 17 min of silence.
subagent_feed(){
  command -v jq >/dev/null 2>&1 || return
  local proj map seen f aid persona
  proj="$HOME/.claude/projects/$(printf '%s' "$repo_root" | sed 's#/#-#g')"
  map="$log_dir/.subagent-map"
  # Seed seen with all PRE-EXISTING subagent transcripts so we stream only
  # subagents dispatched AFTER the feed starts — never replay-tail the
  # (idle, finished) ones from earlier in the session.
  seen="$log_dir/.subagent-seen"
  ls "$proj"/*/subagents/agent-*.jsonl 2>/dev/null > "$seen" || : > "$seen"
  # reap inner tails on teardown so none leak past the feed
  trap 'while IFS= read -r p; do reap_subtree "$p"; done < "$log_dir/.subagent-tails" 2>/dev/null' EXIT
  : > "$log_dir/.subagent-tails"
  while true; do
    for f in "$proj"/*/subagents/agent-*.jsonl; do
      [ -e "$f" ] || continue
      # only recent transcripts (skip prior sessions' subagents)
      find "$f" -mmin -180 >/dev/null 2>&1 || continue
      grep -qxF "$f" "$seen" 2>/dev/null && continue
      printf '%s\n' "$f" >> "$seen"
      aid="$(basename "$f" .jsonl | sed 's/^agent-//')"
      persona="$(grep -m1 "^$aid " "$map" 2>/dev/null | awk '{print $2}')"
      [ -n "$persona" ] || persona="sub:${aid:0:6}"
      ( tail -n0 -F "$f" 2>/dev/null | while IFS= read -r line; do
          printf '%s' "$line" | jq -rc '
            select(.type=="assistant") | .message.content[]? |
            if .type=="text" then .text
            elif .type=="tool_use" then "> " + .name + ": " + ((.input.description // .input.command // .input.file_path // "")|tostring|.[0:90])
            else empty end' 2>/dev/null | while IFS= read -r o; do
              [ -n "$o" ] && printf '%s [%s - Claude Code] %s\n' "$(ts)" "$persona" "$o"
            done
        done ) &
      printf '%s\n' "$!" >> "$log_dir/.subagent-tails"
    done
    sleep 3
  done
}

echo "[agent-activity] feed → $out  (Ctrl-C to stop)"
{
  signal_feed &
  claude_feed &
  subagent_feed &
  tail_prefixed CODEX  "$state_dir/codex-runs.log" &
  tail_prefixed GEMINI "$state_dir/gemini-runs.log" &
  wait
} | tee -a "$out"
