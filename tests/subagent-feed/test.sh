#!/bin/bash
# tests/subagent-feed/test.sh — BUG-027.
#
# The feed goes dark for the whole duration of any Claude-persona run. Measured
# 2026-08-18: 28 tool calls over 4 minutes produced two lines, while 165 KB and
# 190 KB subagent transcripts sat on disk being written. The founder watched
# work happen in the UI with the feed blank.
#
# It punishes the rule it serves — delegating to a persona buys a blackout, so
# working solo keeps the feed live.
#
# TWO INDEPENDENT CAUSES, and either one alone still produces a useless feed, so
# both are asserted end-to-end against a REAL supervisor reading a REAL fixture
# transcript. Static greps are a backstop at the end, never the coverage: the
# whole defect was two functions that each looked correct in isolation.
#
#   1. project_jsonl filtered `.isSidechain != true` for every file it read.
#      EVERY assistant record in a subagent's own transcript is sidechain, so
#      the projection dropped 100% of them. The same filter is CORRECT on the
#      session transcript, which also carries those records and would otherwise
#      show each subagent line twice. One function, two files, opposite
#      requirements — so the fixture below asserts BOTH directions, or a fix
#      that simply deletes the filter passes.
#
#   2. The label came from `.subagent_type`, which is the agent TYPE
#      (`general-purpose`), never the roster persona — fourteen identical rows
#      in .subagent-map. The persona is only in the dispatch description, in the
#      transcript's sibling agent-<id>.meta.json.
#
# Run from the blueprint repo root:  bash tests/subagent-feed/test.sh
# Exit codes: 0 = pass; non-zero = fail.
#
# Hygiene: throwaway HOME + repo root under a temp dir; every kill targets a
# supervisor rooted at OUR fixture path. It must NEVER `pkill -f agent-activity`
# — that would kill the founder's live feed.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/agent-activity.sh"
HOOK="$ROOT/scripts/log-activity.sh"
WORK="$(mktemp -d)"
FAILED=0

cleanup(){
  [ -n "${REPO:-}" ] && feed --stop >/dev/null 2>&1
  local p
  for p in $(ps -eo pid,args 2>/dev/null | grep '[a]gent-activity.sh --supervise' | awk '{print $1}'); do
    case "$(readlink -f "/proc/$p/cwd" 2>/dev/null)" in "$WORK"*) kill -9 "$p" 2>/dev/null ;; esac
  done
  rm -rf "$WORK"
}
trap cleanup EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$SCRIPT" ] || { echo "FAIL: missing $SCRIPT"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "FAIL: jq is a hard dependency of this path"; exit 1; }

# --- fixture ----------------------------------------------------------------
REPO="$WORK/repo"; HOMEDIR="$WORK/home"; STATE="$WORK/state"
mkdir -p "$REPO/scripts/lib" "$REPO/logs" "$HOMEDIR" "$STATE"
cp "$SCRIPT" "$REPO/scripts/agent-activity.sh"
cp "$HOOK" "$REPO/scripts/log-activity.sh" 2>/dev/null
# The whole lib dir, not a named file: the next lib the feed sources must not
# silently break this fixture (the fragility that already bit agent-activity-bound
# when state-dir.sh was added).
cp -R "$ROOT/scripts/lib/." "$REPO/scripts/lib/" 2>/dev/null
[ -f "$REPO/scripts/lib/roster.sh" ] || { echo "FAIL: fixture has no scripts/lib/roster.sh"; exit 1; }

# A roster of our OWN, never the repo's: a persona literal from someone's real
# fleet in a test is the BUG-010 contamination class in fixture form, and the
# assertions must not depend on which names this engineer happens to run.
cat > "$REPO/AGENT_ROSTER.md" <<'EOF'
# Roster

## Members

| Role | Name | Backing agent |
|---|---|---|
| Orchestrator | Wren | Claude Code |
| Senior Architect | Pike | Claude Code |
| Back-End-1 | Nadia | Claude Code |
| Front-End-2 | Bo | Codex |
| Front-End-1 | Bonnie | Claude Code |
| Data-1 | Mary Jane | Claude Code |
| Data-2 | Mary | Codex |
| QA-1 | O'Neil | Codex |
EOF

SESS="$HOMEDIR/.claude/projects/$(printf '%s' "$REPO" | sed 's#/#-#g')/sess"
mkdir -p "$SESS/subagents"
MAIN="$HOMEDIR/.claude/projects/$(printf '%s' "$REPO" | sed 's#/#-#g')/sess.jsonl"
SUB="$SESS/subagents/agent-abc123def456.jsonl"
LOG="$REPO/logs/agent-activity.log"

: >"$MAIN"
: >"$SUB"
# The dispatch description is the ONLY carrier of the persona. It deliberately
# names two — "Nadia implements Pike's prescription" is the real shape — so a
# resolver that returns the first roster ROW (Pike, higher in the table) rather
# than the earliest MENTION is caught.
cat > "${SUB%.jsonl}.meta.json" <<'EOF'
{"agentType":"general-purpose","description":"Nadia implements Pike's prescription","toolUseId":"toolu_x","spawnDepth":1}
EOF

# The baton, so the feed has something to open with.
cat > "$STATE/signal.md" <<'EOF'
# Agent Signal

| Field | Value |
|---|---|
| Holder | Wren |
| State | ACTIVE |
| Task | fixture |
| Last update | 2026-08-18 |
EOF

feed(){ ( cd "$REPO" && HOME="$HOMEDIR" AGENT_STATE_HOME="$STATE" AGENT_FEED_TICK=0.25 \
          bash scripts/agent-activity.sh "$@" ); }
supervisors(){
  local n=0 p
  for p in $(ps -eo pid,args 2>/dev/null | grep '[a]gent-activity.sh --supervise' | awk '{print $1}'); do
    case "$(readlink -f "/proc/$p/cwd" 2>/dev/null)" in "$WORK"*) n=$((n+1)) ;; esac
  done
  echo "$n"
}
wait_sup(){ local want="$1" i=0
  while [ "$i" -lt 40 ]; do [ "$(supervisors)" -eq "$want" ] && return 0; sleep 0.1; i=$((i+1)); done
  return 1; }
wait_for(){ local pat="$1" lim="${2:-6}" i=0
  while [ "$i" -lt $((lim*4)) ]; do grep -qF -- "$pat" "$LOG" 2>/dev/null && return 0; sleep 0.25; i=$((i+1)); done
  return 1; }
count_in_log(){ grep -cF -- "$1" "$LOG" 2>/dev/null | head -1; }

# One assistant record as Claude Code writes it. $1 = text, $2 = isSidechain.
rec(){ printf '{"type":"assistant","isSidechain":%s,"message":{"content":[{"type":"text","text":"%s"}]}}\n' "$2" "$1"; }

# ===========================================================================
# 0. The roster resolver — the ONE derivation both readers share.
# ===========================================================================
# shellcheck disable=SC1090
. "$ROOT/scripts/lib/roster.sh"
if command -v bp_roster_name_in_text >/dev/null 2>&1; then
  pass "#0 bp_roster_name_in_text is exposed by the roster lib"

  got="$(bp_roster_name_in_text "$REPO" "Nadia implements Pike's prescription" 2>/dev/null)"
  [ "$got" = "Nadia" ] \
    && pass "#0 the EARLIEST persona named wins, not the highest roster row" \
    || fail "#0 expected 'Nadia' from a description naming two personas, got '$got'"

  # Whole words only. The default roster ships Alex AND Alexis; substring
  # matching resolves the longer name to the shorter one, stably and wrongly.
  got="$(bp_roster_name_in_text "$REPO" "Bonnie reviews the diff" 2>/dev/null)"
  [ "$got" = "Bonnie" ] \
    && pass "#0 matches whole words — 'Bonnie' is not read as 'Bo'" \
    || fail "#0 substring match: 'Bonnie reviews…' resolved to '$got'"

  bp_roster_name_in_text "$REPO" "nobody by name here" >/dev/null 2>&1 \
    && fail "#0 a description naming no persona still resolved one" \
    || pass "#0 a description naming no persona resolves nothing (rc!=0)"

  # --- free-form names (Elias, R2-S2) --------------------------------------
  # The Name column is free text an engineer types into a markdown cell, and
  # roster.sh ships to every derived project. The first implementation tokenised
  # the DESCRIPTION and compared each token to the WHOLE name, so a name holding
  # a space or an apostrophe could never equal one token: `Mary Jane reviews`
  # and `O'Neil reviews` both resolved to nothing, silently, and every such fleet
  # got the agent type on every line. The fixture rows exist for this.
  got="$(bp_roster_name_in_text "$REPO" "Mary Jane reviews" 2>/dev/null)"
  [ "$got" = "Mary Jane" ] \
    && pass "#0 a name containing a SPACE resolves" \
    || fail "#0 'Mary Jane reviews' resolved to '$got', not 'Mary Jane'"

  got="$(bp_roster_name_in_text "$REPO" "O'Neil reviews" 2>/dev/null)"
  [ "$got" = "O'Neil" ] \
    && pass "#0 a name containing PUNCTUATION resolves" \
    || fail "#0 \"O'Neil reviews\" resolved to '$got', not \"O'Neil\""

  # Earliest mention still wins once names can span words — and the roster is
  # ordered so that resolving by row would answer 'Mary Jane'.
  got="$(bp_roster_name_in_text "$REPO" "O'Neil reviews Mary Jane's plan" 2>/dev/null)"
  [ "$got" = "O'Neil" ] \
    && pass "#0 earliest mention still wins with multi-word names" \
    || fail "#0 earliest-mention broke for free-form names: got '$got', wanted \"O'Neil\""

  # And no-substring still holds where the boundary check alone cannot decide it:
  # 'Mary' and 'Mary Jane' both start at position 1 with clean boundaries, so the
  # specific name has to win the tie. Bo/Bonnie above covers the other direction.
  got="$(bp_roster_name_in_text "$REPO" "Mary Jane's plan lands" 2>/dev/null)"
  [ "$got" = "Mary Jane" ] \
    && pass "#0 a name that is a PREFIX of a longer one still resolves to the longer" \
    || fail "#0 'Mary Jane…' resolved to '$got' — the shorter roster name won the tie"
else
  fail "#0 no shared text→persona lookup — the feed and the hook must each grow one, and drift"
fi

# ===========================================================================
# THE REPRODUCER. Start the feed, then append to the subagent transcript the way
# a live subagent does — every record isSidechain:true.
# ===========================================================================
feed --daemon >/dev/null 2>&1
wait_sup 1 || { echo "FAIL: no supervisor started"; exit 1; }

rec "SUBAGENT-VISIBLE-LINE" true >>"$SUB"

# ===========================================================================
# #1 A subagent's output REACHES THE FEED. This is the blackout itself.
# ===========================================================================
if wait_for "SUBAGENT-VISIBLE-LINE" 6; then
  pass "#1 a sidechain record in a subagent transcript reaches the feed"
else
  fail "#1 THE BLACKOUT: every record in a subagent transcript is isSidechain:true,
      and project_jsonl drops them — the feed stays silent for the whole run."
fi

# ===========================================================================
# #2 It is labelled with the PERSONA, from the roster, via the meta file.
#    Asserting the persona alone would pass against a label built by any means;
#    the backing agent proves it went through bp_roster_label.
# ===========================================================================
if grep -qF "[Nadia - Claude Code] SUBAGENT-VISIBLE-LINE" "$LOG" 2>/dev/null; then
  pass "#2 labelled '[Nadia - Claude Code]' — persona + backing, from the roster"
else
  got="$(grep -F "SUBAGENT-VISIBLE-LINE" "$LOG" 2>/dev/null | head -1)"
  fail "#2 wrong label. Expected '[Nadia - Claude Code]', line was: ${got:-<nothing emitted>}
      .subagent_type is the agent TYPE (general-purpose) for every persona; the
      persona is only in the meta file's description."
fi

# ===========================================================================
# #3 The MAIN transcript still drops sidechain records. Without this, deleting
#    the filter outright passes #1 — and every subagent line then appears twice,
#    once under the orchestrator's label.
# ===========================================================================
rec "MAIN-OWN-LINE" false >>"$MAIN"
rec "MAIN-SIDECHAIN-COPY" true >>"$MAIN"
if wait_for "MAIN-OWN-LINE" 6; then
  pass "#3 the session transcript's own records still stream"
else
  fail "#3 the session transcript stopped streaming — the filter change broke the main path"
fi
sleep 0.75
if [ "$(count_in_log "MAIN-SIDECHAIN-COPY")" -eq 0 ]; then
  pass "#3 sidechain records in the SESSION transcript are still dropped (no duplicates)"
else
  fail "#3 the sidechain filter was removed rather than made per-file — every
      subagent line will now appear twice, the second time mislabelled."
fi

# ===========================================================================
# #4 The hook labels its bookends with the same persona, from the same lookup.
#    Two labels that agree only by coincidence is the BUG-010/BUG-021 shape.
# ===========================================================================
if [ -f "$REPO/scripts/log-activity.sh" ]; then
  printf '%s' '{"hook_event_name":"SubagentStart","agent_id":"abc123def456","subagent_type":"general-purpose","description":"Nadia implements Pikes prescription"}' \
    | ( cd "$REPO" && bash scripts/log-activity.sh >/dev/null 2>&1 )
  if grep -qF "[Nadia - Claude Code] → dispatched" "$LOG" 2>/dev/null; then
    pass "#4 the dispatch bookend carries the persona, not the agent type"
  else
    got="$(grep -F "dispatched" "$LOG" 2>/dev/null | tail -1)"
    fail "#4 the hook still labels by agent type. Line was: ${got:-<none>}"
  fi
  if grep -qE '^abc123def456 Nadia$' "$REPO/logs/.subagent-map" 2>/dev/null; then
    pass "#4 .subagent-map records the persona, so the fallback path is right too"
  else
    fail "#4 .subagent-map row is '$(grep -m1 '^abc123def456 ' "$REPO/logs/.subagent-map" 2>/dev/null)' — not the persona"
  fi
else
  fail "#4 scripts/log-activity.sh missing from the fixture"
fi

feed --stop >/dev/null 2>&1; wait_sup 0

# ===========================================================================
# Static backstops. Cheap guards against the exact idioms, not the coverage.
# Comments are stripped first — this file's own header names them.
# ===========================================================================
CODE="$WORK/code.sh"
sed 's/[[:space:]]#.*$//; s/^[[:space:]]*#.*$//' "$SCRIPT" >"$CODE"
grep -qE 'pump .*subagent|pump "\$f" jsonl-sub' "$CODE" \
  || fail "static: subagent transcripts are no longer pumped under their own kind"
grep -q 'bp_roster_name_in_text' "$CODE" \
  || fail "static: the feed stopped resolving the persona through the roster lib"

HCODE="$WORK/hook.sh"
sed 's/[[:space:]]#.*$//; s/^[[:space:]]*#.*$//' "$HOOK" >"$HCODE"
grep -q 'bp_roster_name_in_text' "$HCODE" \
  || fail "static: the hook grew its own persona derivation again (BUG-010 shape)"
# ===========================================================================
# 5. A POISONED ROSTER LIB MUST NOT KILL THE HOOK.
#
#    Found by Elias (Infrastructure-2, Codex): absent, unreadable and
#    non-zero-return all degraded safely, and a bare `exit` inside the lib did
#    not — it took the hook down with it, and a hook that dies fails the tool
#    call it was only there to observe.
#
#    This replaces a STATIC check that asserted the guard's shape. The shape was
#    the wrong thing to assert: my first attempt at it passed a correct
#    implementation and my second failed one, both for reasons of formatting
#    rather than behaviour. Poison the lib and see what happens — that cannot be
#    fooled by where a line break falls.
# ===========================================================================
POISON="$WORK/poison"; mkdir -p "$POISON/scripts/lib" "$POISON/logs"
cp "$HOOK" "$POISON/scripts/log-activity.sh"
cp -R "$ROOT/scripts/lib/." "$POISON/scripts/lib/"
cp "$REPO/AGENT_ROSTER.md" "$POISON/AGENT_ROSTER.md"
printf 'exit 3\n' > "$POISON/scripts/lib/roster.sh"

poison_rc=0
printf '%s' '{"hook_event_name":"SubagentStart","agent_id":"deadbeef","subagent_type":"general-purpose","description":"Nadia does a thing"}' \
  | AGENT_FEED_LOG="$POISON/logs/feed.log" sh "$POISON/scripts/log-activity.sh" >/dev/null 2>&1 || poison_rc=$?

if [ "$poison_rc" -ne 0 ]; then
  fail "#5 a roster lib that calls exit killed the hook (rc=$poison_rc) — it would fail the tool call"
elif [ ! -s "$POISON/logs/feed.log" ]; then
  fail "#5 the hook survived but logged nothing — the bookend is what makes a dispatch visible at all"
else
  pass "#5 a roster lib that exits cannot take the hook down (Elias)"
fi

# ===========================================================================
# 6. A ROSTER LIB THAT HANGS MUST NOT HANG THE HOOK.
#
#    The sibling of #5, and the one mode the subshell does not cover: a subshell
#    contains an `exit`, it does not contain an infinite loop. Elias measured it
#    — rc=124 under an external 2s bound, no feed line, no map row — while every
#    other broken-library mode degraded correctly. A hook that HANGS is worse
#    than one that dies: it stalls the tool call it was only there to observe.
#
#    The outer bound here is the suite's own safety net, deliberately several
#    times the hook's, so a regression shows up as a FAIL and never as a suite
#    that never returns. The hook's own bound is turned down to 1s so the case
#    costs about a second rather than the default two.
# ===========================================================================
# The same question the hook asks, asked the same way — read in a subshell so a
# broken lib cannot take the suite down either.
TCMD="$( . "$ROOT/scripts/lib/staleness.sh" >/dev/null 2>&1 || exit 0
         bp_staleness_timeout_cmd 2>/dev/null || exit 0 )"

if [ -z "${TCMD:-}" ]; then
  echo "  -- skipped — no timeout(1)/gtimeout(1) here, so a hang cannot be bounded safely"
else
  HANG="$WORK/hang"; mkdir -p "$HANG/scripts/lib" "$HANG/logs"
  cp "$HOOK" "$HANG/scripts/log-activity.sh"
  cp -R "$ROOT/scripts/lib/." "$HANG/scripts/lib/"
  cp "$REPO/AGENT_ROSTER.md" "$HANG/AGENT_ROSTER.md"
  printf 'while :; do :; done\n' > "$HANG/scripts/lib/roster.sh"

  hang_rc=0
  printf '%s' '{"hook_event_name":"SubagentStart","agent_id":"hang01","subagent_type":"general-purpose","description":"Nadia does a thing"}' \
    | AGENT_FEED_LOG="$HANG/logs/feed.log" BP_ROSTER_LOOKUP_TIMEOUT=1 \
      "$TCMD" 15 sh "$HANG/scripts/log-activity.sh" >/dev/null 2>&1 || hang_rc=$?

  if [ "$hang_rc" -eq 124 ]; then
    fail "#6 a roster lib that never returns hangs the hook — it stalls the tool call it observes (Elias)"
  elif [ "$hang_rc" -ne 0 ]; then
    fail "#6 the hook exited $hang_rc on a hanging roster lib; a hook must always exit 0"
  elif [ ! -s "$HANG/logs/feed.log" ]; then
    fail "#6 the hook survived the hang but logged nothing — the bookend is what makes a dispatch visible"
  elif ! grep -q '^hang01 ' "$HANG/logs/.subagent-map" 2>/dev/null; then
    fail "#6 no .subagent-map row after a bounded lookup — the streamed-line fallback goes dark"
  else
    pass "#6 a roster lib that never returns is bounded; the line still lands, labelled by agent type"
  fi
fi

grep -q 'ROSTER_LIB' "$HCODE" \
  || fail "static: the hook no longer references the roster lib at all"
grep -q 'bp_staleness_timeout_cmd' "$HCODE" \
  || fail "static: the hook resolves a timeout provider some other way — that question has one answer (scripts/lib/staleness.sh)"

[ "$FAILED" -eq 0 ] && pass "static backstops clean"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-027 — delegated work is visible in the feed, under its persona."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
