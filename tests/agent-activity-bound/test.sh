#!/bin/bash
# tests/agent-activity-bound/test.sh
#
# BUG-001: agent-activity.sh holds one instance with a bounded process set
#
# Regression fixture for the fork-bomb-class leak (docs/doing/PLAN-BUG-001.md
# §4, cases #1-#19 — the consensus test contract). On a founder host the old
# design reached ~17,400 script instances and ~8,700 `tail` processes, exhausted
# fs.inotify.max_user_instances (128), and pegged ~24 of 32 threads for 2.7 days
# at zero application load.
#
# These are BEHAVIORAL assertions: the feed is actually started, actually
# written to, and its log actually inspected. Static source greps live at the
# end as a cheap backstop against the specific idioms that caused the defects,
# but they are not the coverage — they cannot be.
#
# Run from the blueprint repo root:
#   bash tests/agent-activity-bound/test.sh
#
# Exit codes: 0 = pass; non-zero = fail.
#
# Hygiene: everything runs against a throwaway HOME + repo root under a temp
# dir, and every kill targets a PID this script started. It must NEVER
# `pkill -f agent-activity` — that would kill a founder's live feed.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/agent-activity.sh"
WORK="$(mktemp -d)"
FAILED=0

cleanup(){
  [ -n "${REPO:-}" ] && stop_feed >/dev/null 2>&1
  # Only ever kill supervisors rooted at OUR fixture path.
  local p
  for p in $(ps -eo pid,args 2>/dev/null | grep "[a]gent-activity" | grep "$WORK" | awk '{print $1}'); do
    kill -9 "$p" 2>/dev/null
  done
  rm -rf "$WORK"
}
trap cleanup EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$SCRIPT" ] || { echo "FAIL: missing $SCRIPT"; exit 1; }

# --- fixture ----------------------------------------------------------------
REPO="$WORK/repo"; HOMEDIR="$WORK/home"; STATE="$WORK/state"
mkdir -p "$REPO/scripts" "$REPO/logs" "$HOMEDIR" "$STATE"
cp "$SCRIPT" "$REPO/scripts/agent-activity.sh"
cp "$ROOT/AGENT_ROSTER.example.md" "$REPO/" 2>/dev/null
SIG="$REPO/AGENT_SIGNAL.md"
LOG="$REPO/logs/agent-activity.log"
CODEXLOG="$STATE/codex-runs.log"
: >"$CODEXLOG"
# Content written BEFORE the feed ever starts — #16 asserts it is not replayed.
printf 'PRE-EXISTING-must-not-replay\n' >>"$CODEXLOG"

write_signal(){ # $1 = task text
  cat >"$SIG" <<EOF
# Agent Signal

| Field | Value |
|---|---|
| Holder | Sylvia |
| State | ACTIVE |
| Task | $1 |
| Last update | 2026-07-23 |
EOF
}
write_signal "fixture"

feed(){ ( cd "$REPO" && HOME="$HOMEDIR" AGENT_STATE_HOME="$STATE" AGENT_FEED_TICK="${TICKVAL:-0.25}" \
          AGENT_FEED_MAX_FRAGMENT="${MAXFRAG:-1048576}" bash scripts/agent-activity.sh "$@" ); }
start_feed(){ feed --daemon; }
stop_feed(){ feed --stop; }
status_feed(){ feed --status; }

# Resident supervisors belonging to THIS fixture only.
# The daemon re-execs as `bash scripts/agent-activity.sh --supervise` with a
# RELATIVE path, so its argv does not contain the fixture path — match on the
# internal mode and confirm ownership via the process cwd instead.
supervisors(){
  local n=0 p cwd
  for p in $(ps -eo pid,args 2>/dev/null | grep '[a]gent-activity.sh --supervise' | awk '{print $1}'); do
    cwd="$(readlink -f "/proc/$p/cwd" 2>/dev/null)"
    case "$cwd" in "$WORK"*) n=$((n+1)) ;; esac
  done
  echo "$n"
}
sup_pid(){ sed -n 's/^pid=//p' "$REPO/logs/.agent-activity.state" 2>/dev/null | head -1; }

# Wait until $1 appears in the log, up to $2 seconds. Returns 1 on timeout.
wait_for(){ local pat="$1" lim="${2:-8}" i=0
  while [ "$i" -lt $((lim*4)) ]; do grep -qF -- "$pat" "$LOG" 2>/dev/null && return 0; sleep 0.25; i=$((i+1)); done
  return 1; }
count_in_log(){ grep -cF -- "$1" "$LOG" 2>/dev/null | head -1; }
# Poll until the supervisor count equals $1 (up to ~4s). Fixed sleeps were the
# bulk of this suite's wall-clock and the pre-push gate has a 30s ceiling.
wait_sup(){ local want="$1" i=0
  while [ "$i" -lt 40 ]; do [ "$(supervisors)" -eq "$want" ] && return 0; sleep 0.1; i=$((i+1)); done
  return 1; }

# ===========================================================================
# #1 Concurrency — EXACTLY one supervisor (not "at most": zero would mean the
#    daemon never started, and the plan requires one survivor).
# ===========================================================================
i=0; while [ $i -lt 20 ]; do start_feed >/dev/null 2>&1 & i=$((i+1)); done
wait 2>/dev/null; wait_sup 1
n="$(supervisors)"
if [ "$n" -eq 1 ]; then pass "20 concurrent starts → exactly 1 supervisor"
else fail "#1 20 concurrent starts produced $n supervisors, expected exactly 1 (RC-1)"; fi

# ===========================================================================
# #15 Resident bound is ONE — no `tee`, no per-file followers.
# ===========================================================================
if [ "$(supervisors)" -eq 1 ] && [ "$(ps -eo args 2>/dev/null | grep -c "[t]ail -n0 -F")" -eq 0 ]; then
  pass "#15 one resident process; no follow-by-name tails"
else fail "#15 resident set is not exactly one supervisor with zero tail -F"; fi

# ===========================================================================
# #5 --status is accurate while running.
# ===========================================================================
if status_feed >/dev/null 2>&1; then pass "#5 --status reports running"; else fail "#5 --status did not report a running feed"; fi

# ===========================================================================
# #16 First discovery does NOT replay pre-existing content.
# ===========================================================================
if [ "$(count_in_log "PRE-EXISTING-must-not-replay")" -eq 0 ]; then pass "#16 pre-existing content not replayed"
else fail "#16 pre-existing transcript content was replayed"; fi

# ===========================================================================
# #17 A single complete record on a quiet file emits on the next tick,
#     without a following record and without the force-flush.
#     (This is the assertion that fails against the $() formulation.)
# ===========================================================================
printf 'SOLO-RECORD\n' >>"$CODEXLOG"
if wait_for "SOLO-RECORD" 8; then pass "#17 lone complete record emitted promptly"
else fail "#17 a single complete newline-terminated record was never emitted (R3: \$() strips the delimiter)"; fi

# ===========================================================================
# #11/#19 Split record — including multibyte UTF-8 — is withheld until its
#     newline arrives, then emitted exactly once, intact.
# ===========================================================================
printf 'SPLIT-héllo-→' >>"$CODEXLOG"
sleep 1
if [ "$(count_in_log "SPLIT-héllo")" -eq 0 ]; then pass "#11/#19 incomplete multibyte record withheld"
else fail "#11/#19 an incomplete record was emitted before its newline (R4: byte/char mismatch)"; fi
printf -- '-TAIL\n' >>"$CODEXLOG"
if wait_for "SPLIT-héllo-→-TAIL" 8; then
  [ "$(count_in_log "SPLIT-héllo-→-TAIL")" -eq 1 ] \
    && pass "#11/#19 completed multibyte record emitted exactly once, intact" \
    || fail "#11/#19 completed record emitted more than once"
else fail "#11/#19 completed multibyte record never emitted"; fi

# ===========================================================================
# #3 Quiet-but-active file: idle for a while, then written again — still emits.
#     The rev-1 pool design would have evicted this file.
# ===========================================================================
sleep 1.5
printf 'AFTER-IDLE\n' >>"$CODEXLOG"
if wait_for "AFTER-IDLE" 8; then pass "#3 quiet-then-active file still emits (never evicted)"
else fail "#3 a file that went quiet stopped being followed"; fi

# ===========================================================================
# #12 MAX_FRAGMENT force-flush — a newline-less writer must not loop forever.
# ===========================================================================
stop_feed >/dev/null 2>&1; wait_sup 0
MAXFRAG=64 start_feed >/dev/null 2>&1; wait_sup 1
printf 'X%.0s' $(seq 1 200) >>"$CODEXLOG"
if wait_for "force-flushed" 8; then pass "#12 oversized newline-less line force-flushed once"
else fail "#12 MAX_FRAGMENT force-flush never fired; a newline-less writer would re-read forever"; fi
printf '\n' >>"$CODEXLOG"; stop_feed >/dev/null 2>&1; wait_sup 0
unset MAXFRAG; start_feed >/dev/null 2>&1; wait_sup 1

# ===========================================================================
# #9 Unchanged signal file emits ONCE, not once per tick (RC-6).
# ===========================================================================
base="$(count_in_log "ACTIVE —")"; sleep 1.5
if [ "$(count_in_log "ACTIVE —")" -eq "$base" ]; then pass "#9 unchanged signal file emits nothing further (RC-6)"
else fail "#9 unchanged signal file re-emitted every tick (RC-6: stat blob read as mtime)"; fi

# ===========================================================================
# #9b Same-SIZE in-place signal edit IS detected (I-3).
#     size+inode is a stream identity, not a change token.
# ===========================================================================
write_signal "AAAA"; sleep 1
write_signal "BBBB"          # identical byte length, rewritten in place
if wait_for "BBBB" 8; then pass "#9b same-size in-place signal edit detected (I-3)"
else fail "#9b a same-size in-place signal edit was invisible (size+inode used as a change token)"; fi

# ===========================================================================
# #8 Truncation resets the offset; subsequent writes still emit.
# ===========================================================================
: >"$CODEXLOG"; sleep 0.5
printf 'AFTER-TRUNCATE\n' >>"$CODEXLOG"
if wait_for "AFTER-TRUNCATE" 8; then pass "#8 truncation handled; stream resumes"
else fail "#8 after truncation the file stopped emitting"; fi

# ===========================================================================
# #8b Rotation (new inode, same path) resets the offset.
# ===========================================================================
mv "$CODEXLOG" "$CODEXLOG.old"; printf 'AFTER-ROTATE\n' >"$CODEXLOG"
if wait_for "AFTER-ROTATE" 8; then pass "#8b rotation handled (inode change resets offset)"
else fail "#8b after rotation the new file was not picked up"; fi

# ===========================================================================
# #5b --stop leaves nothing; #6 concurrent stop/start does not wedge.
# ===========================================================================
stop_feed >/dev/null 2>&1; wait_sup 0
if [ "$(supervisors)" -eq 0 ]; then pass "#5b --stop leaves zero residue"
else fail "#5b --stop left $(supervisors) supervisor(s) running"; fi
if ! status_feed >/dev/null 2>&1; then pass "#5c --status reports not running after stop"
else fail "#5c --status still reports running after --stop"; fi

stop_feed >/dev/null 2>&1 & start_feed >/dev/null 2>&1 & wait 2>/dev/null; sleep 1
n="$(supervisors)"
if [ "$n" -le 1 ]; then pass "#6 concurrent stop/start does not wedge or double-start (n=$n)"
else fail "#6 concurrent stop/start produced $n supervisors"; fi

# ===========================================================================
# #13 Stale state after SIGKILL: --status says NOT running, --stop signals
#     nothing. #4 the lock is released so a restart succeeds.
# ===========================================================================
stop_feed >/dev/null 2>&1; wait_sup 0
start_feed >/dev/null 2>&1
if wait_sup 1; then
  pid="$(sup_pid)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null; wait_sup 0
    if ! status_feed >/dev/null 2>&1; then pass "#13 stale state after SIGKILL reports not running"
    else fail "#13 --status trusted a stale state file after SIGKILL"; fi
    dbg="$(start_feed 2>&1)"
    if wait_sup 1; then
      pass "#4 lock released by SIGKILL; restart yields exactly one supervisor"
    else
      fail "#4 restart after SIGKILL did not yield one supervisor (saw $(supervisors); daemon said: $dbg).
      A surviving child that inherited the lock FD keeps the lock alive, so
      recovery-by-SIGKILL never converges."
    fi
  else fail "#13 supervisor pid from the state file was not alive"; fi
else fail "#13 could not start a supervisor for the SIGKILL case"; fi

# ===========================================================================
# #14 PID reuse / foreign pid: --stop must FAIL CLOSED and not kill it.
#     Precondition: a feed MUST be running, otherwise --stop short-circuits on
#     "nothing to stop" and never reaches identity validation.
# ===========================================================================
stop_feed >/dev/null 2>&1; wait_sup 0
start_feed >/dev/null 2>&1
if wait_sup 1; then
  sleep 60 >/dev/null 2>&1 & victim=$!
  STATEF="$REPO/logs/.agent-activity.state"
  cp "$STATEF" "$STATEF.bak" 2>/dev/null
  { echo "pid=$victim"; echo "nonce=bogus"; echo "token=NOT-THE-REAL-TOKEN"; } >"$STATEF"
  stop_feed >/dev/null 2>&1; rc=$?
  if kill -0 "$victim" 2>/dev/null && [ "$rc" -ne 0 ]; then
    pass "#14 mismatched start-token → refused to signal an unrelated process"
  else fail "#14 --stop signalled a process whose identity did not match (rc=$rc)"; fi
  kill -9 "$victim" 2>/dev/null; wait "$victim" 2>/dev/null

  { echo "pid=$$"; echo "token=whatever"; } >"$STATEF"
  if ! stop_feed >/dev/null 2>&1; then pass "#14b missing nonce fails closed (I-2)"
  else fail "#14b a state file with no nonce was accepted"; fi
  mv -f "$STATEF.bak" "$STATEF" 2>/dev/null
  stop_feed >/dev/null 2>&1; wait_sup 0
else fail "#14 could not start a supervisor for the identity cases"; fi

# ===========================================================================
# #7 Paths containing spaces.
# ===========================================================================
SPACEY="$WORK/state dir with spaces"; mkdir -p "$SPACEY"; : >"$SPACEY/codex-runs.log"
( cd "$REPO" && HOME="$HOMEDIR" AGENT_STATE_HOME="$SPACEY" AGENT_FEED_TICK="${TICKVAL:-0.25}" \
  bash scripts/agent-activity.sh --daemon ) >/dev/null 2>&1
wait_sup 1
printf 'SPACED-PATH-OK\n' >>"$SPACEY/codex-runs.log"
if wait_for "SPACED-PATH-OK" 8; then pass "#7 state dir containing spaces handled"
else fail "#7 a path with spaces broke the reader (word splitting)"; fi
( cd "$REPO" && HOME="$HOMEDIR" AGENT_STATE_HOME="$SPACEY" bash scripts/agent-activity.sh --stop ) >/dev/null 2>&1

# ===========================================================================
# #2 Process bound is independent of transcript count: 40 then 80 files.
# ===========================================================================
PROJ="$HOMEDIR/.claude/projects/$(printf '%s' "$REPO" | sed 's#/#-#g')/sess/subagents"
mkdir -p "$PROJ"
i=0; while [ $i -lt 30 ]; do printf '{"type":"assistant","message":{"content":[{"type":"text","text":"a%s"}]}}\n' "$i" >"$PROJ/agent-$i.jsonl"; i=$((i+1)); done
start_feed >/dev/null 2>&1; wait_sup 1; sleep 1
n1="$(supervisors)"; t1="$(ps -eo args 2>/dev/null | grep -c "[t]ail -n0 -F")"
i=30; while [ $i -lt 90 ]; do printf '{"type":"assistant","message":{"content":[{"type":"text","text":"b%s"}]}}\n' "$i" >"$PROJ/agent-$i.jsonl"; i=$((i+1)); done
sleep 1
n2="$(supervisors)"; t2="$(ps -eo args 2>/dev/null | grep -c "[t]ail -n0 -F")"
if [ "$n1" -eq 1 ] && [ "$n2" -eq 1 ] && [ "$t1" -eq 0 ] && [ "$t2" -eq 0 ]; then
  pass "#2 process count independent of transcript count (30→90 files: 1 supervisor, 0 tails)"
else fail "#2 process count grew with transcripts (sup $n1→$n2, tails $t1→$t2) — the RC-2 leak"; fi
stop_feed >/dev/null 2>&1

# ===========================================================================
# Static backstops — cheap guards against the exact idioms that caused the
# defects. Not coverage; a supplement to the behavioral cases above.
# Comments are stripped first: this script's header names the anti-patterns it
# forbids, so grepping the raw file would match its own prose.
# ===========================================================================
CODE="$WORK/code.sh"
sed 's/[[:space:]]#.*$//; s/^[[:space:]]*#.*$//' "$SCRIPT" >"$CODE"
grep -qE 'tail[[:space:]]+(-n0[[:space:]]+)?-F' "$CODE" && fail "static: 'tail -F' reintroduced (RC-2)"
grep -q 'flock' "$CODE" || fail "static: flock guard removed (RC-1)"
grep -qE '\$\((stat -f %m[^)]*\|\| *stat -c %Y|stat -c %Y[^)]*\|\| *stat -f %m)' "$CODE" && fail "static: broken stat fallback reintroduced (RC-6)"
grep -q "awk 'END{print length" "$CODE" && ! grep -q "LC_ALL=C awk 'END{print length" "$CODE" && fail "static: fragment length not byte-based (R4)"
grep -qE '^[[:space:]]*(local[[:space:]]+)?delta=\$\(' "$CODE" && fail "static: delta captured via \$() (R3)"
[ "$FAILED" -eq 0 ] && pass "static backstops clean"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-001 — one instance, bounded process set, byte-correct reads."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
