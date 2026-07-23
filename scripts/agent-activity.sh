#!/usr/bin/env bash
# Unified agent activity feed — ONE tail-able stream, one [Persona - Backing]
# prefix per line, merging:
#   - AGENT_SIGNAL.md mic changes           → [<Holder>] <State> — <Task>
#   - $AGENT_STATE_HOME/codex-runs.log      → [CODEX]  <line>
#   - $AGENT_STATE_HOME/gemini-runs.log     → [GEMINI] <line>
#   - this repo's newest Claude transcript  → [<persona> - <backing>] <line>
#   - each Agent-tool subagent's transcript → [<persona> - Claude Code] <line>
#
# Usage:
#   bash scripts/agent-activity.sh            # foreground; Ctrl-C stops
#   bash scripts/agent-activity.sh --daemon   # detach; idempotent; returns at once
#   bash scripts/agent-activity.sh --stop     # stop the running feed
#   bash scripts/agent-activity.sh --status   # is it running?
#   tail -f logs/agent-activity.log           # follow from anywhere
#
# Env:
#   AGENT_STATE_HOME=...  state dir for dispatcher run logs
#                         (default ~/.<repo-name>)
#   AGENT_PERSONA=...     this session's persona   (default Sylvia)
#   AGENT_BACKING=...     this session's agent     (default Claude Code)
#
# ---------------------------------------------------------------------------
# BUG-001 — why this is written the way it is.
#
# The previous design spawned one `tail -F` per watched file, per instance, and
# never reaped them. `tail -F` follows by NAME and retries forever, so a
# finished subagent's transcript kept its follower alive indefinitely. Combined
# with a TOCTOU pidfile guard that let N concurrent wakes all win, this reached
# ~17,400 script instances and ~8,700 tails on one host, exhausted
# fs.inotify.max_user_instances (128) — at which point GNU tail silently
# degrades to 1-second stat polling — and pegged ~24 of 32 threads for 2.7 days
# at zero application load.
#
# This version is ONE resident process that tracks a byte offset per file and
# reads only the delta. No follow-by-name, no process per transcript, no
# inotify instances, and attribution is free because the reader already knows
# which path it read. Design + 5 rounds of cross-provider review:
# docs/doing/PLAN-BUG-001.md.
# ---------------------------------------------------------------------------

set -uo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
signal_file="$repo_root/AGENT_SIGNAL.md"
log_dir="$repo_root/logs"; mkdir -p "$log_dir"
out="$log_dir/agent-activity.log"
lock_file="$log_dir/.agent-activity.lock"
state_file="$log_dir/.agent-activity.state"

# Generic, project-neutral state dir. Derived from the repo name so a derived
# project reads the dispatcher logs IT writes — never another project's
# (BUG-002: this used to hardcode ~/.linkedin-watcher-agent).
state_dir="${AGENT_STATE_HOME:-$HOME/.$(basename "$repo_root")}"; mkdir -p "$state_dir"

persona="${AGENT_PERSONA:-Sylvia}"; backing="${AGENT_BACKING:-Claude Code}"

TICK="${AGENT_FEED_TICK:-2}"
MAX_FRAGMENT="${AGENT_FEED_MAX_FRAGMENT:-1048576}"   # 1 MiB force-flush bound
SUBAGENT_MAX_AGE_MIN="${AGENT_FEED_SUBAGENT_AGE:-180}"

# --- portable stat (RC-6 / A-06) -------------------------------------------
# `stat -f %m f || stat -c %Y f` is NOT a portable fallback: on GNU coreutils
# `stat -f` means "filesystem status", so `%m` is invalid — it prints a
# multi-line block to STDOUT and exits 1. `$(a || b)` captures BOTH outputs, so
# the "mtime" became a blob containing live free-block counters that change on
# every write. The change detector then fired on nearly every poll. Probe once,
# then call only the correct form.
if stat -c %Y . >/dev/null 2>&1; then
  f_size(){  stat -c %s "$1" 2>/dev/null; }
  f_inode(){ stat -c %i "$1" 2>/dev/null; }
else
  f_size(){  stat -f %z "$1" 2>/dev/null; }
  f_inode(){ stat -f %i "$1" 2>/dev/null; }
fi

ts(){ date +%H:%M:%S; }

# --- roster lookup ----------------------------------------------------------
# Live roster is per-engineer and gitignored; the example is the tracked
# template. Prefer the personal copy so a fresh clone still labels personas.
roster_file="$repo_root/AGENT_ROSTER.md"
[ -f "$roster_file" ] || roster_file="$repo_root/AGENT_ROSTER.example.md"
persona_label(){
  local name="$1" b
  b=$(grep -E "\| $name \|" "$roster_file" 2>/dev/null | head -1 \
      | awk -F'|' '{gsub(/^ +| +$/,"",$4); print $4}')
  if [ -n "$b" ]; then printf '%s - %s' "$name" "$b"; else printf '%s' "$name"; fi
}
field(){ grep "^| $1 " "$signal_file" 2>/dev/null | head -1 | sed "s/^| $1 *| //; s/ *|\$//"; }

# ===========================================================================
# CLI modes
# ===========================================================================

# The lock is the liveness oracle, NOT the state file. flock is released by the
# kernel on death — including SIGKILL — so "can I take the lock?" answers
# "is a supervisor alive?" with no stale-pid ambiguity.
feed_is_running(){
  exec 8>"$lock_file"
  if flock -n 8; then
    flock -u 8; exec 8>&-
    return 1          # acquired => nothing running
  fi
  exec 8>&-
  return 0            # held => a supervisor is alive
}

# Identity token: pid alone is not unique across reuse, so pair it with the
# process start time (Linux: /proc/<pid>/stat field 22; BSD: ps -o lstart=).
start_token(){
  local pid="$1"
  if [ -r "/proc/$pid/stat" ]; then
    awk '{ n=split($0,a,") "); print a[n] }' "/proc/$pid/stat" 2>/dev/null \
      | awk '{print $20}'
  else
    ps -o lstart= -p "$pid" 2>/dev/null | tr -s ' '
  fi
}

write_state(){
  # Atomic publish: temp + mv on the same filesystem.
  local tmp="$state_file.$$"
  { echo "pid=$1"; echo "nonce=$2"; echo "token=$3"; } >"$tmp" && mv -f "$tmp" "$state_file"
}

read_state(){
  [ -f "$state_file" ] || return 1
  s_pid=$(sed -n 's/^pid=//p'   "$state_file" | head -1)
  s_nonce=$(sed -n 's/^nonce=//p' "$state_file" | head -1)
  s_token=$(sed -n 's/^token=//p' "$state_file" | head -1)
  [ -n "${s_pid:-}" ] && [ -n "${s_token:-}" ]
}

# Fail-closed: signal ONLY a process whose recorded identity still matches.
# Any mismatch, missing field, or unreadable process => refuse and exit non-zero.
# There is deliberately no fallback to command-line matching.
resolve_supervisor(){
  read_state || { echo "[agent-activity] running, but no readable state file" >&2; return 2; }
  local live; live="$(start_token "$s_pid")"
  [ -n "$live" ] || { echo "[agent-activity] cannot read identity of pid $s_pid — refusing to signal" >&2; return 2; }
  [ "$live" = "$s_token" ] || { echo "[agent-activity] pid $s_pid start-token mismatch (pid reuse?) — refusing to signal" >&2; return 2; }
  echo "$s_pid"
}

cmd_status(){
  if feed_is_running; then
    if pid=$(resolve_supervisor); then
      echo "[agent-activity] running (pid $pid)"; return 0
    fi
    return 2
  fi
  # Not running => any state file is stale by definition.
  rm -f "$state_file"
  echo "[agent-activity] not running"
  return 1
}

cmd_stop(){
  if ! feed_is_running; then
    rm -f "$state_file"
    echo "[agent-activity] not running — nothing to stop."
    return 0
  fi
  local pid; pid=$(resolve_supervisor) || return 2
  kill -TERM "$pid" 2>/dev/null
  # Wait on the LOCK becoming free — the authoritative "it is gone" signal.
  local i=0
  while [ $i -lt 50 ]; do
    feed_is_running || { rm -f "$state_file"; echo "[agent-activity] stopped."; return 0; }
    sleep 0.1; i=$((i+1))
  done
  kill -KILL "$pid" 2>/dev/null
  sleep 0.3
  rm -f "$state_file"
  echo "[agent-activity] stopped (SIGKILL)."
}

cmd_daemon(){
  if feed_is_running; then
    echo "[agent-activity] already running — leaving it."
    return 0
  fi
  # setsid ONLY here, so the foreground contract stays unambiguous.
  setsid "$0" --supervise >/dev/null 2>&1 &
  sleep 0.4
  if feed_is_running; then echo "[agent-activity] started (daemon) → $out"; return 0; fi
  echo "[agent-activity] failed to start" >&2; return 1
}

# ===========================================================================
# The supervisor
# ===========================================================================

declare -A OFFSET INODE LABEL

emit(){
  # The supervisor writes BOTH sinks itself — no `tee` process, so the
  # "exactly one resident process" contract holds in foreground too.
  if [ "${FOREGROUND:-0}" = "1" ]; then printf '%s\n' "$1"; fi
  printf '%s\n' "$1" >>"$out"
}

# Project one Claude/subagent transcript record to its visible text.
project_jsonl(){
  local line="$1" who="$2"
  printf '%s' "$line" | jq -rc '
    select(.type=="assistant" and (.isSidechain != true)) | .message.content[]? |
    if .type=="text" then .text
    elif .type=="tool_use" then "> " + .name + ": " + ((.input.description // .input.command // .input.file_path // "")|tostring|.[0:90])
    else empty end' 2>/dev/null |
  while IFS= read -r o; do
    [ -n "$o" ] && emit "$(ts) [$who] $o"
  done
}

emit_delta(){
  # $1 = file, $2 = prefix-bytes file, $3 = kind, $4 = label
  local kind="$3" who="$4"
  case "$kind" in
    jsonl) while IFS= read -r line; do [ -n "$line" ] && project_jsonl "$line" "$who"; done <"$2" ;;
    *)     while IFS= read -r line; do [ -n "$line" ] && emit "$(ts) [$who] $line"; done <"$2" ;;
  esac
}

# Read the appended bytes of one file and emit the complete records in them.
#
# Three invariants, each earned in review (PLAN-BUG-001 §3):
#  1. Read EXACTLY the snapshot range. `tail` alone reads to whatever EOF it
#     sees while running, which may exceed the size we stat'd; advancing to the
#     old size duplicates, advancing to a re-stat skips.
#  2. Keep the payload OUT of $(). Command substitution strips ALL trailing
#     newlines, so a snapshot ending in a complete record loses the delimiter
#     and k becomes 0 — the feed would stall on a quiet file.
#  3. Fragment length in BYTES (LC_ALL=C). awk's length() counts characters in
#     a multibyte locale; a two-byte 'é' reported as 1 advances one byte past
#     the real newline and corrupts the record.
pump(){
  local f="$1" kind="$2" who="$3"
  [ -f "$f" ] || return 0

  local size inode off tmp got k frag last
  size="$(f_size "$f")"; inode="$(f_inode "$f")"
  [ -n "$size" ] || return 0

  if [ "${INODE[$f]:-}" != "$inode" ]; then     # rotated / replaced
    INODE["$f"]="$inode"; OFFSET["$f"]=0
  fi
  off="${OFFSET[$f]:-0}"
  [ "$size" -lt "$off" ] && off=0               # truncated
  [ "$size" -eq "$off" ] && { OFFSET["$f"]=$off; return 0; }

  tmp="$log_dir/.delta.$$"
  tail -c +$((off+1)) "$f" 2>/dev/null 9>&- | head -c $((size - off)) 9>&- >"$tmp"
  got=$(wc -c <"$tmp" 2>/dev/null | tr -d ' ')
  # Success is "the bounded sink captured the whole range", NOT the pipeline's
  # exit status: head -c closing early can SIGPIPE tail during a concurrent
  # append, which is benign.
  if [ "${got:-0}" -ne $((size - off)) ]; then rm -f "$tmp"; return 0; fi

  if [ "$(tail -c 1 "$tmp" | od -An -tx1 | tr -d ' \n')" = "0a" ]; then
    k=$got
  else
    frag=$(LC_ALL=C awk 'END{print length($0)}' "$tmp")
    k=$(( got - frag ))
    if [ "$frag" -ge "$MAX_FRAGMENT" ]; then
      emit "$(ts) [agent-activity] force-flushed a ${frag}-byte line with no newline in $f"
      k=$got
    fi
  fi

  if [ "$k" -gt 0 ]; then
    head -c "$k" "$tmp" >"$tmp.p" && emit_delta "$f" "$tmp.p" "$kind" "$who"
    rm -f "$tmp.p"
    OFFSET["$f"]=$(( off + k ))
  else
    OFFSET["$f"]=$off
  fi
  rm -f "$tmp"
}

# New files start at EOF so a feed started now never replays a finished agent's
# history (matches the old `tail -n0`). AGENT_SIGNAL.md is the exception: it
# emits its current state once at startup so the feed opens showing the baton.
seed_offset(){
  local f="$1"
  [ -f "$f" ] || return 0
  if [ -z "${OFFSET[$f]+set}" ]; then
    OFFSET["$f"]="$(f_size "$f")"
    INODE["$f"]="$(f_inode "$f")"
  fi
}

signal_line(){
  local holder state task
  holder=$(field Holder); state=$(field State); task=$(field Task)
  task=$(printf '%s' "$task" | tr -d '*' | cut -c1-100)
  emit "$(ts) [$(persona_label "${holder:-?}")] ${state:-?} — $task"
}

supervise(){
  exec 9>"$lock_file"
  if ! flock -n 9; then
    echo "[agent-activity] already running — leaving it."
    return 0
  fi

  local nonce; nonce="$$-$(od -An -tu4 -N4 /dev/urandom 2>/dev/null | tr -d ' ' || echo 0)"
  write_state "$$" "$nonce" "$(start_token "$$")"

  local stop=0
  # Ordinary single-process teardown: no `kill 0` (it signals the shell running
  # the trap, re-entering traps and making exit status nondeterministic), and
  # no orphan sweep — there are no long-lived children to orphan.
  trap 'stop=1' INT TERM

  : >"$out"
  emit "$(ts) [agent-activity] feed started → $out"

  local sig_last="" sig_now proj newest
  proj="$HOME/.claude/projects/$(printf '%s' "$repo_root" | sed 's#/#-#g')"

  signal_line   # current baton, once
  sig_last="$(f_size "$signal_file")-$(f_inode "$signal_file")"

  seed_offset "$state_dir/codex-runs.log"
  seed_offset "$state_dir/gemini-runs.log"

  while [ "$stop" -eq 0 ]; do
    # Signal file: size+inode identity, so an unchanged file emits nothing.
    if [ -f "$signal_file" ]; then
      sig_now="$(f_size "$signal_file")-$(f_inode "$signal_file")"
      if [ "$sig_now" != "$sig_last" ]; then sig_last="$sig_now"; signal_line; fi
    fi

    pump "$state_dir/codex-runs.log"  raw   "CODEX"
    pump "$state_dir/gemini-runs.log" raw   "GEMINI"

    if command -v jq >/dev/null 2>&1; then
      newest=$(ls -t "$proj"/*.jsonl 2>/dev/null | head -1)
      if [ -n "$newest" ]; then
        seed_offset "$newest"
        pump "$newest" jsonl "$persona - $backing"
      fi
      for f in "$proj"/*/subagents/agent-*.jsonl; do
        [ -e "$f" ] || continue
        [ -n "$(find "$f" -mmin "-$SUBAGENT_MAX_AGE_MIN" 2>/dev/null)" ] || continue
        if [ -z "${LABEL[$f]+set}" ]; then
          aid="$(basename "$f" .jsonl | sed 's/^agent-//')"
          p="$(grep -m1 "^$aid " "$log_dir/.subagent-map" 2>/dev/null | awk '{print $2}')"
          LABEL["$f"]="${p:-sub:${aid:0:6}} - Claude Code"
          seed_offset "$f"
        fi
        pump "$f" jsonl "${LABEL[$f]}"
      done
    fi

    sleep "$TICK"
  done

  trap - INT TERM EXIT          # disable traps before cleanup
  rm -f "$state_file"
  emit "$(ts) [agent-activity] feed stopped"
  return 0
}

case "${1:-}" in
  --stop)      cmd_stop ;;
  --status)    cmd_status ;;
  --daemon)    cmd_daemon ;;
  --supervise) FOREGROUND=0 supervise ;;          # internal: daemon child
  "")          FOREGROUND=1 supervise ;;          # foreground
  *)           echo "usage: $0 [--daemon|--stop|--status]" >&2; exit 2 ;;
esac
