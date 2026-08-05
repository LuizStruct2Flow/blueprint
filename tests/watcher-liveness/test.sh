#!/bin/sh
# tests/watcher-liveness/test.sh — BUG-022.
#
# A dispatch to a dead watcher fails SILENTLY. The baton reads OVER_TO_CODEX,
# the feed is quiet exactly as it looks when an agent is thinking, and the run
# log — the only honest surface — is the one nobody reads. On 2026-08-05 a BA
# dispatch sat unheard until the founder asked; redcare's identical incident
# (their BUG-033) cost ~40 minutes.
#
# The mic state and the dispatcher's liveness are two facts that are
# unremarkable alone and conclusive together. Nothing compared them.
#
# WHY flock AND NOT pgrep. Every process-table check written during redcare's
# incident matched the checking shell's OWN command line — a `pgrep -f` for a
# pattern present in its own arguments — and was wrong three different ways. A
# lock is repo-scoped, cannot self-match, and is released by the KERNEL on death
# including SIGKILL, so "can I take it?" answers "is a holder alive?" with no
# stale-pid ambiguity. scripts/agent-activity.sh already says exactly this about
# its own supervisor lock; this reuses that oracle rather than inventing one.

set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
FAILED=0
pass() { echo "  ok — $1"; }
fail() { echo "FAIL: $1"; FAILED=$((FAILED + 1)); }

LIB="$ROOT/scripts/lib/watcher-lock.sh"
WATCH="$ROOT/scripts/codex-signal-watch.sh"
FEED="$ROOT/scripts/agent-activity.sh"

# ===========================================================================
# 1. A shared lib owns both halves — taking the lock and testing it.
#    Two implementations of "is a watcher alive" would disagree exactly when it
#    matters, and each would keep passing its own tests.
# ===========================================================================
if [ -f "$LIB" ]; then
  pass "#1 scripts/lib/watcher-lock.sh exists"
else
  fail "#1 no shared lock lib — the watcher and the feed would each invent one"
fi

if [ -f "$LIB" ]; then
  # shellcheck disable=SC1090
  . "$LIB"
fi

for fn in bp_watch_lock_path bp_watch_liveness; do
  if command -v "$fn" >/dev/null 2>&1; then
    pass "#1 $fn is exposed"
  else
    fail "#1 $fn is not defined"
  fi
done

# ===========================================================================
# 2. The three states, behaviourally. This is the whole contract.
# ===========================================================================
if command -v bp_watch_liveness >/dev/null 2>&1; then
  T="$(mktemp -d)"
  mkdir -p "$T/logs/state"

  # (a) NO lock file at all → "none". A project with no watchers must never be
  #     warned about a watcher it never had. This is what makes the check safe
  #     to run unconditionally on every poll.
  got="$(bp_watch_liveness "$T" OVER_TO_CODEX 2>/dev/null)"
  if [ "$got" = none ]; then
    pass "#2 no lock file → 'none' (a project without watchers is never warned)"
  else
    fail "#2 expected 'none' with no lock file, got '$got'"
  fi

  lock="$(bp_watch_lock_path "$T" OVER_TO_CODEX)"
  mkdir -p "$(dirname "$lock")"

  # (b) A lock file that exists but is UNHELD → "dead". A watcher claimed this
  #     mic at some point and is gone. This is the incident.
  : >"$lock"
  got="$(bp_watch_liveness "$T" OVER_TO_CODEX 2>/dev/null)"
  if [ "$got" = dead ]; then
    pass "#2 an unheld lock file → 'dead' (a watcher was expected and is gone)"
  else
    fail "#2 expected 'dead' for an unheld lock, got '$got'"
  fi

  # (c) HELD → "alive". Held by a real process in the background, released by
  #     the kernel when it exits, so this exercises the actual oracle rather
  #     than a flag.
  if command -v flock >/dev/null 2>&1; then
    flock "$lock" sleep 5 &
    holder=$!
    sleep 0.4
    got="$(bp_watch_liveness "$T" OVER_TO_CODEX 2>/dev/null)"
    if [ "$got" = alive ]; then
      pass "#2 a held lock → 'alive'"
    else
      fail "#2 expected 'alive' while the lock was held, got '$got'"
    fi

    # Kill the CHILD too. `flock file cmd` forks rather than execs, so `sleep`
    # inherits the open fd and keeps the lock held after its parent dies. That
    # is not a quirk to route around — it is exactly how a real watcher's
    # children behave, and a test that killed only the parent would assert
    # something the production case never does.
    pkill -9 -P "$holder" 2>/dev/null
    kill -9 "$holder" 2>/dev/null
    wait "$holder" 2>/dev/null
    sleep 0.5
    # SIGKILL leaves no chance to clean up. The kernel releases the lock anyway,
    # which is the entire reason this is a lock and not a pid file.
    got="$(bp_watch_liveness "$T" OVER_TO_CODEX 2>/dev/null)"
    if [ "$got" = dead ]; then
      pass "#2 after SIGKILL → 'dead' (the kernel released it; no stale-pid ambiguity)"
    else
      fail "#2 a SIGKILLed holder still reads '$got' — the oracle is not the lock"
    fi
  else
    fail "#2 flock is unavailable — cannot exercise the liveness oracle"
  fi
  rm -rf "$T"
fi

# ===========================================================================
# 3. NEVER the process table.
# ===========================================================================
# Guarded on the lib EXISTING, or it passes vacuously: `grep` over a missing file
# finds no pgrep and reports clean, which is a green earned by the ABSENCE of the
# thing under test. That is the failure this suite exists to prevent one level
# up, and it was in this file's first draft.
if [ ! -f "$LIB" ]; then
  fail "#3 cannot check for process-table use — the lib does not exist"
elif sed 's/#.*//' "$LIB" | grep -qE 'pgrep|pidof|ps -ef|ps -eo'; then
  # Comments stripped first: the lib NAMES pgrep in the comment explaining why it
  # must never be used, and a check that cannot tell an explanation from a call
  # would force that explanation to be deleted to stay green — removing the one
  # place a future reader learns why.
  fail "#3 the lib consults the process table — it will match its own command line"
else
  pass "#3 the lib never greps the process table"
fi

# ===========================================================================
# 4. The WATCHER takes the lock. Without this the feed's check is decorative:
#    every state would read 'none' forever and the warning could never fire.
# ===========================================================================
if grep -q 'watcher-lock.sh' "$WATCH" 2>/dev/null; then
  pass "#4 the watcher sources the shared lock lib"
else
  fail "#4 the watcher never takes a lock — the feed has nothing to test"
fi

if grep -q 'bp_watch_hold' "$WATCH" 2>/dev/null; then
  pass "#4 the watcher holds the lock for its lifetime"
else
  fail "#4 the watcher does not hold a lock"
fi

# ===========================================================================
# 5. The FEED runs the comparison, and only on the EDGE.
#    A line on every poll trains the operator to ignore the feed, which is the
#    failure this is meant to prevent rather than cause.
# ===========================================================================
if grep -q 'bp_watch_liveness' "$FEED" 2>/dev/null; then
  pass "#5 the feed compares the mic against the dispatcher's liveness"
else
  fail "#5 the feed never runs the comparison — nothing surfaces a dead watcher"
fi

if grep -q 'dead_last' "$FEED" 2>/dev/null; then
  pass "#5 the warning is edge-triggered, not repeated every poll"
else
  fail "#5 no edge tracking — a per-poll warning trains the operator to ignore it"
fi

# ===========================================================================
# 6. END TO END, in a real feed. #4 and #5 are greps: they prove the code says
#    the right thing, not that a running supervisor emits the warning. That
#    distinction is the entire subject of this bug — a check nothing invokes
#    looks exactly like a check that passed.
#
#    Also pins the path derivation. The lock lives under agent_state_dir, so
#    AGENT_STATE_HOME must move it for BOTH sides; a hardcoded logs/state in
#    either would have the watcher and the feed disagree about whether a watcher
#    exists, each working perfectly alone (A-09's defect).
# ===========================================================================
E2E="$(mktemp -d)"

# An ISOLATED repo, never $ROOT. The feed writes to "$repo_root/logs" and ignores
# any env override, so running it here would append to the real feed and, worse,
# read the real baton — a suite mutating the repository under test is BUG-014,
# and one that dispatches off the live baton nearly cost a live Codex run once.
# The whole lib dir is copied rather than named files, so the next lib the feed
# sources cannot silently break this fixture (the same reasoning as
# tests/agent-activity-bound).
e2e_repo(){ # $1 = name → echoes the repo path
  _r="$E2E/$1"
  mkdir -p "$_r/scripts/lib" "$_r/logs" "$E2E/home" "$_r/state"
  cp "$ROOT/scripts/agent-activity.sh" "$_r/scripts/"
  cp -R "$ROOT/scripts/lib/." "$_r/scripts/lib/" 2>/dev/null
  cp "$ROOT/AGENT_ROSTER.example.md" "$_r/" 2>/dev/null
  printf '| Field | Value |\n|---|---|\n| Holder | Codexy |\n| State | OVER_TO_CODEX |\n| Task | t |\n| Last update | 2026-08-05 |\n' \
    > "$_r/state/signal.md"
  printf '%s' "$_r"
}

run_feed(){ # $1 = repo, $2 = seconds
  ( cd "$1" \
    && HOME="$E2E/home" AGENT_STATE_HOME="$1/state" AGENT_FEED_TICK=0.25 \
       timeout "$2" bash scripts/agent-activity.sh >/dev/null 2>&1 ) &
  _feedjob=$!
}

R1="$(e2e_repo dead)"
# An unheld lock: a watcher claimed this state and is gone. Exactly the incident.
: >"$R1/state/.watch-over_to_codex.lock"
run_feed "$R1" 5
sleep 3.5

if grep -q 'NO watcher is listening' "$R1/logs/agent-activity.log" 2>/dev/null; then
  pass "#6 a running feed warns that the mic is held with nobody listening"
else
  fail "#6 the feed emitted no warning: $(tail -2 "$R1/logs/agent-activity.log" 2>/dev/null)"
fi

n="$(grep -c 'NO watcher is listening' "$R1/logs/agent-activity.log" 2>/dev/null | head -1)"
if [ "${n:-0}" -eq 1 ]; then
  pass "#6 it fires exactly once across many polls, not per tick"
else
  fail "#6 the warning appeared ${n:-0} times — a per-poll warning gets ignored"
fi
wait "$_feedjob" 2>/dev/null

# NON-VACUITY, and it is load-bearing: an implementation that warned
# unconditionally would satisfy both assertions above. It must also prove the
# feed was AWAKE, or "no warning" cannot be told from "never ran".
R2="$(e2e_repo alive)"
lock2="$R2/state/.watch-over_to_codex.lock"
: >"$lock2"
if command -v flock >/dev/null 2>&1; then
  flock "$lock2" sleep 9 &
  h2=$!
  sleep 0.4
  run_feed "$R2" 5
  sleep 3.5
  if grep -q 'NO watcher is listening' "$R2/logs/agent-activity.log" 2>/dev/null; then
    fail "#6 the feed warned while the lock was HELD — it warns unconditionally"
  elif [ -s "$R2/logs/agent-activity.log" ]; then
    pass "#6 a live watcher produces no warning, and the feed WAS running"
  else
    fail "#6 the feed produced nothing at all — silence here proves nothing"
  fi
  wait "$_feedjob" 2>/dev/null
  pkill -9 -P "$h2" 2>/dev/null
  kill -9 "$h2" 2>/dev/null
  wait "$h2" 2>/dev/null
fi
rm -rf "$E2E"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-022 — a dispatch into silence is visible."
  exit 0
fi
echo "FAILED: $FAILED assertion(s)."
exit 1
