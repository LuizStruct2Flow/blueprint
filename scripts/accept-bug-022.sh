#!/bin/sh
# scripts/accept-bug-022.sh — acceptance demo for BUG-022, for a human to read.
#
# BUG-022: a dispatch to a dead watcher failed SILENTLY. The baton read
# OVER_TO_CODEX, the feed was quiet exactly as it looks when an agent is
# thinking, and the run log — the only honest surface — is the one nobody reads.
# That is how a BA dispatch sat unheard on 2026-08-05 until the founder asked.
#
# This stages that incident in a THROWAWAY repo under $TMPDIR and shows what the
# feed now says. It touches no live state, dispatches nothing, and costs nothing.
#
# WHY A SCRIPT AND NOT A CHECKLIST. The failure being accepted is an ABSENCE —
# "nothing was printed when something should have been". Asking a human to
# confirm an absence is asking them to trust that they waited long enough and
# looked in the right file. The three checks below make the absence and its
# repair both visible in one run.
#
# tests/watcher-liveness/test.sh is the real regression test and runs in the
# gate. This is the human-facing view of the same behaviour.
#
# ── TO SEE IT ON THE REAL REPO INSTEAD ───────────────────────────────────────
# Only do this when the mic is NOT handed to an agent, or you will dispatch one.
#
#   1. bash scripts/agent-activity.sh --daemon
#      tail -f logs/agent-activity.log          # in another terminal
#   2. bash scripts/start-codex-signal-watch.sh &   # a listener exists
#   3. kill -9 %1                                # it dies without cleaning up
#   4. bash scripts/signal-set.sh --holder <a Codex persona> \
#        --state OVER_TO_CODEX --task "acceptance probe"
#   5. within a few seconds the feed prints:
#        ⚠ OVER_TO_CODEX is held but NO watcher is listening — ...
#      ONCE, not once per poll.
#   6. bash scripts/signal-set.sh --holder "Claude Code" \
#        --state OVER_TO_USER --task "done"

set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT INT TERM

ok=0
bad=0
say()  { printf '%s\n' "$1"; }
good() { printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok + 1)); }
nope() { printf '  \033[31m✗\033[0m %s\n' "$1"; bad=$((bad + 1)); }

stage() { # $1 = name → echoes repo path
  _r="$W/$1"
  mkdir -p "$_r/scripts/lib" "$_r/logs" "$_r/state" "$W/home"
  cp "$ROOT/scripts/agent-activity.sh" "$_r/scripts/"
  cp -R "$ROOT/scripts/lib/." "$_r/scripts/lib/" 2>/dev/null
  cp "$ROOT/AGENT_ROSTER.example.md" "$_r/" 2>/dev/null
  printf '| Field | Value |\n|---|---|\n| Holder | Somebody |\n| State | OVER_TO_CODEX |\n| Task | acceptance probe |\n| Last update | today |\n' \
    > "$_r/state/signal.md"
  printf '%s' "$_r"
}

run_feed() { # $1 = repo, $2 = seconds
  ( cd "$1" && HOME="$W/home" AGENT_STATE_HOME="$1/state" AGENT_FEED_TICK=0.25 \
      timeout "$2" bash scripts/agent-activity.sh >/dev/null 2>&1 ) &
}

say ""
say "BUG-022 acceptance — does a dispatch into silence become visible?"
say "Staging in $W (throwaway; your repo is untouched)."
say ""

# ── 1. The incident: mic handed out, watcher dead ───────────────────────────
say "1. The mic is handed to Codex and the watcher has died."
R1="$(stage dead)"
: >"$R1/state/.watch-over_to_codex.lock"   # claimed once, nothing holds it now
run_feed "$R1" 5
sleep 3.5
LOG1="$R1/logs/agent-activity.log"
if grep -q 'NO watcher is listening' "$LOG1" 2>/dev/null; then
  good "the feed says so:"
  printf '      %s\n' "$(grep -m1 'NO watcher is listening' "$LOG1" | cut -c1-100)"
else
  nope "the feed said NOTHING — this is the bug, unfixed"
fi

n="$(grep -c 'NO watcher is listening' "$LOG1" 2>/dev/null | head -1)"
if [ "${n:-0}" -eq 1 ]; then
  good "it said it ONCE across ~14 polls (a per-tick warning gets skimmed past)"
else
  nope "it said it ${n:-0} times — noise, which is the failure it should prevent"
fi
wait 2>/dev/null

# ── 2. A live watcher must stay silent ──────────────────────────────────────
say ""
say "2. Same mic state, but a watcher IS alive."
R2="$(stage alive)"
L2="$R2/state/.watch-over_to_codex.lock"
: >"$L2"
if command -v flock >/dev/null 2>&1; then
  flock "$L2" sleep 9 &
  holder=$!
  sleep 0.4
  run_feed "$R2" 5
  sleep 3.5
  LOG2="$R2/logs/agent-activity.log"
  if grep -q 'NO watcher is listening' "$LOG2" 2>/dev/null; then
    nope "it warned anyway — the check is unconditional and therefore worthless"
  elif [ -s "$LOG2" ]; then
    good "silent, and the feed was demonstrably running (it wrote other lines)"
  else
    nope "the feed wrote nothing at all, so its silence proves nothing"
  fi
  pkill -9 -P "$holder" 2>/dev/null
  kill -9 "$holder" 2>/dev/null
  wait "$holder" 2>/dev/null
else
  nope "flock is unavailable on this machine — cannot demonstrate the live case"
fi

# ── 3. A project with no watchers must never be warned ──────────────────────
say ""
say "3. A repo that has NEVER run a watcher (no lock file at all)."
R3="$(stage none)"
run_feed "$R3" 4
sleep 3
LOG3="$R3/logs/agent-activity.log"
if grep -q 'NO watcher is listening' "$LOG3" 2>/dev/null; then
  nope "it warned about a watcher this project never had — false alarm"
else
  good "silent — which is what makes the check safe to run on every tick"
fi
wait 2>/dev/null

say ""
if [ "$bad" -eq 0 ]; then
  say "All $ok checks behaved as BUG-022 requires."
  say ""
  say "What this does NOT prove: that a watcher is HEALTHY. One that is alive but"
  say "wedged still reads alive. Closing that needs a heartbeat in every"
  say "dispatcher and is deliberately out of scope — see the row's Detail column."
  exit 0
fi
say "$bad check(s) did NOT behave as required. BUG-022 is not fixed."
exit 1
