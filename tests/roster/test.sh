#!/bin/bash
# tests/roster/test.sh
#
# BUG-010: renaming a persona in AGENT_ROSTER.md changes nothing.
#
# The defect had two independent halves.
#
#   HALF 1 — nothing read the roster to decide who this session IS.
#   `scripts/agent-activity.sh` was `persona="${AGENT_PERSONA:-Sylvia}"`: a
#   hardcoded literal, so renaming the Orchestrator row was invisible and the
#   only working override was exporting AGENT_PERSONA by hand.
#   `scripts/team-kickoff.sh` carried all 15 personas as a literal array — the
#   one script whose documented job is "confirm the roster after editing it"
#   could not see the roster at all, and wrote the SHIPPED EXAMPLE's names into
#   the live baton. Both scripts are in MANAGED_FILES, so the literal shipped to
#   every derived project. Same class as BUG-002 and BUG-009.
#
#   HALF 2 — the one roster read that DID exist was whitespace-brittle.
#   `persona_label()` grepped "\| $name \|" with single spaces, so a
#   column-padded table never matched. Padding is what every markdown formatter
#   produces, so a cosmetic reformat silently disabled roster lookup — and a
#   lookup miss was indistinguishable from "no roster at all", so it disabled it
#   QUIETLY.
#
# Fix shape: one shared parser in scripts/lib/roster.sh, sourced by every reader
# — the same "one mechanism, never two that agree by coincidence" rule that
# scripts/lib/state-dir.sh enforces for A-09. Role is the key, name is data,
# padding is tolerated, and a miss WARNS instead of degrading in silence.
#
# Run from the blueprint repo root:  bash tests/roster/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/roster.sh"
FEED="$ROOT/scripts/agent-activity.sh"
KICKOFF="$ROOT/scripts/team-kickoff.sh"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# A roster that is (a) RENAMED away from every shipped example name and
# (b) COLUMN-PADDED, which is what a markdown formatter produces. Both halves of
# the bug are in this one fixture: a reader that hardcodes a name fails on (a),
# a reader that greps single-spaced pipes fails on (b).
write_roster(){
  mkdir -p "$1"
  cat >"$1/AGENT_ROSTER.md" <<'EOF'
# Agent Roster

## Members

| Role             | Name      | Backing agent |
|---|---|---|
| Orchestrator     | Alisa     | Claude Code   |
| PO               | Bo        | Codex         |
| QA-1             | Cheng     | Gemini        |

## How identity works on the signal

| Not | A | Member |
|---|---|---|
| this table must not be parsed as roster rows | x | y |
EOF
}

# ===========================================================================
# 1. THE SHARED PARSER EXISTS.
#    Without it every reader keeps its own copy of the rule, which is exactly
#    how the two halves above drifted apart. (Red on the parent commit: the
#    file does not exist.)
# ===========================================================================
if [ ! -f "$LIB" ]; then
  fail "#1 scripts/lib/roster.sh is missing — there is no shared roster parser"
else
  pass "#1 scripts/lib/roster.sh exists"
fi

# ===========================================================================
# 2. ROLE -> NAME, on a PADDED table.
#    This is the whole bug in one assertion: the roster says the Orchestrator is
#    Alisa, so every reader must say Alisa.
# ===========================================================================
if [ -f "$LIB" ]; then
  write_roster "$TMP/p1"
  got="$( . "$LIB"; bp_roster_name_for_role "$TMP/p1" Orchestrator )"
  [ "$got" = "Alisa" ] \
    && pass "#2 role Orchestrator resolves to the roster's name on a padded table" \
    || fail "#2 Orchestrator resolved to '$got', expected 'Alisa' (padding or hardcoded name)"

  got="$( . "$LIB"; bp_roster_name_for_role "$TMP/p1" QA-1 )"
  [ "$got" = "Cheng" ] \
    && pass "#2 a non-Orchestrator role resolves too" \
    || fail "#2 QA-1 resolved to '$got', expected 'Cheng'"
fi

# ===========================================================================
# 3. NAME -> BACKING AGENT, on a PADDED table (the persona_label() half).
#    Also asserts the backing column is free text: 'Gemini' must survive, since
#    the roster documents that column as open-ended.
# ===========================================================================
if [ -f "$LIB" ]; then
  got="$( . "$LIB"; bp_roster_backing_for_name "$TMP/p1" Cheng )"
  [ "$got" = "Gemini" ] \
    && pass "#3 name -> backing agent resolves on a padded table, free text preserved" \
    || fail "#3 backing for Cheng resolved to '$got', expected 'Gemini'"
fi

# ===========================================================================
# 4. ONLY the Members table is parsed.
#    A roster has other tables. Parsing every pipe-row would let an unrelated
#    table shadow a real member — a silent wrong answer, the failure mode this
#    bug is made of.
# ===========================================================================
if [ -f "$LIB" ]; then
  rows="$( . "$LIB"; bp_roster_rows "$TMP/p1" | wc -l | tr -d ' ' )"
  [ "$rows" = "3" ] \
    && pass "#4 exactly the 3 member rows are parsed; other tables are ignored" \
    || fail "#4 parsed $rows rows, expected 3 — a non-member table leaked in"
fi

# ===========================================================================
# 5. A MISS WARNS. It must not degrade in silence.
#    This is what made HALF 2 survive: a failed lookup and "no roster" produced
#    the same output, so nothing ever looked wrong.
# ===========================================================================
if [ -f "$LIB" ]; then
  err="$( . "$LIB"; bp_roster_name_for_role "$TMP/p1" Nonexistent-Role 2>&1 >/dev/null )"
  [ -n "$err" ] \
    && pass "#5 a roster miss writes a warning to stderr" \
    || fail "#5 a roster miss produced NO warning — indistinguishable from success"
fi

# ===========================================================================
# 6. END-TO-END: the feed's own identity follows the roster.
#    Assertions #2/#3 could pass while the feed still ignored the parser, which
#    is precisely the state the parent commit is in. This runs the real script,
#    in a temp project whose roster names nobody from the example.
# ===========================================================================
if [ -f "$FEED" ]; then
  mkdir -p "$TMP/p2/scripts"
  cp "$FEED" "$TMP/p2/scripts/" 2>/dev/null
  cp -r "$ROOT/scripts/lib" "$TMP/p2/scripts/" 2>/dev/null
  write_roster "$TMP/p2"
  got="$( cd "$TMP/p2" && env -u AGENT_PERSONA -u AGENT_BACKING \
          bash scripts/agent-activity.sh --whoami 2>/dev/null )"
  case "$got" in
    "Alisa - Claude Code")
      pass "#6 the feed reports the ROSTER's Orchestrator, with its backing agent" ;;
    *Sylvia*)
      fail "#6 the feed still reports the hardcoded example name ('$got') — BUG-010 verbatim" ;;
    "")
      fail "#6 the feed has no --whoami: its identity cannot be observed or tested" ;;
    *)
      fail "#6 the feed reported '$got', expected 'Alisa - Claude Code'" ;;
  esac
fi

# ===========================================================================
# 7. AGENT_PERSONA still overrides the roster.
#    The demotion is from DEFAULT to OVERRIDE — a spawned persona must still be
#    able to declare itself without editing the founder's gitignored roster.
# ===========================================================================
if [ -f "$FEED" ] && [ -d "$TMP/p2" ]; then
  got="$( cd "$TMP/p2" && AGENT_PERSONA=Cheng bash scripts/agent-activity.sh --whoami 2>/dev/null )"
  [ "$got" = "Cheng - Gemini" ] \
    && pass "#7 AGENT_PERSONA overrides the roster's Orchestrator, backing still resolved" \
    || fail "#7 AGENT_PERSONA=Cheng gave '$got', expected 'Cheng - Gemini'"
fi

# ===========================================================================
# 8. NO HARDCODED PERSONA NAME in either managed script.
#    Both ship to every derived project, so a name baked into them is BUG-002's
#    contamination in persona form. The example roster is the ONLY place a
#    default name may appear.
#    Non-vacuity guard: prove the files were actually read.
# ===========================================================================
for f in scripts/agent-activity.sh scripts/team-kickoff.sh; do
  if [ ! -f "$ROOT/$f" ]; then fail "#8 $f not found — cannot assert on it"; continue; fi
  [ -s "$ROOT/$f" ] || { fail "#8 $f is empty (vacuous)"; continue; }
  # Strip comments before matching: an incident narrative may legitimately quote
  # the old literal, the way state-dir.sh quotes ~/.linkedin-watcher-agent.
  hits="$(sed 's/#.*//' "$ROOT/$f" | grep -nE 'Sylvia|Kathrin|Slava|Yannik|Jesko' )"
  if [ -n "$hits" ]; then
    fail "#8 $f hardcodes a persona name in executable code:"
    printf '        %s\n' "$hits"
  else
    pass "#8 $f carries no hardcoded persona name outside comments"
  fi
done

# ===========================================================================
# 9. team-kickoff reads the roster — by ROLE — instead of its literal array.
#    The behavioural assertion: with a 3-member roster it must present exactly
#    those 3 people, not the shipped 15. --dry-run keeps this cheap; the real
#    ceremony sleeps 5s per persona and cannot live in a 30s gate (BUG-005).
# ===========================================================================
if [ -f "$KICKOFF" ]; then
  mkdir -p "$TMP/p3/scripts"
  cp "$KICKOFF" "$TMP/p3/scripts/" 2>/dev/null
  cp -r "$ROOT/scripts/lib" "$TMP/p3/scripts/" 2>/dev/null
  write_roster "$TMP/p3"
  out="$( cd "$TMP/p3" && bash scripts/team-kickoff.sh --dry-run 2>/dev/null )"
  if [ -z "$out" ]; then
    fail "#9 team-kickoff has no --dry-run: the ceremony cannot be tested without sleeping through it"
  else
    ok=1
    for who in Alisa Bo Cheng; do
      printf '%s' "$out" | grep -q "$who" || { fail "#9 kickoff never presents roster member '$who'"; ok=0; }
    done
    for ghost in Sylvia Kathrin Slava; do
      if printf '%s' "$out" | grep -q "$ghost"; then
        fail "#9 kickoff presents '$ghost', who is NOT on this roster — it is still reading its literal array"
        ok=0
      fi
    done
    [ "$ok" = "1" ] && pass "#9 kickoff presents exactly the roster's members, keyed by role"
  fi
fi

# ===========================================================================
# 10. ONE MECHANISM — every reader sources the shared parser.
#     Two readers that agree only by coincidence is how HALF 1 and HALF 2 came
#     to disagree in the first place.
# ===========================================================================
for f in scripts/agent-activity.sh scripts/team-kickoff.sh; do
  [ -f "$ROOT/$f" ] || continue
  grep -q 'lib/roster.sh' "$ROOT/$f" \
    && pass "#10 $f sources the shared roster parser" \
    || fail "#10 $f does not source scripts/lib/roster.sh — it has its own copy of the rule"
done

# ===========================================================================
# 12. A RUNNING feed follows a roster edit — it must not cache identity for its
#     whole lifetime.
#
#     The first fix resolved persona once at startup. `--whoami` (a one-shot)
#     reported the new name immediately, so the fix looked complete — while the
#     long-lived supervisor carried on labelling every line with the name the
#     roster had held when it started. That is BUG-010's own failure shape
#     wearing a different hat: the displayed name and the roster disagree, and
#     nothing says so. Reported by the founder: "you are still logging as anna".
#
#     Costs ~2s of wall clock (it drives a real supervisor), so it is skipped
#     under --fast and runs in CI — the 30s pre-push ceiling (BUG-005) has no
#     room for it.
# ===========================================================================
if [ "${1:-}" = "--fast" ]; then
  echo "  -- #12 skipped (--fast): CI runs it"
elif [ -f "$FEED" ]; then
  mkdir -p "$TMP/p4/scripts"
  cp "$FEED" "$TMP/p4/scripts/" 2>/dev/null
  cp -r "$ROOT/scripts/lib" "$TMP/p4/scripts/" 2>/dev/null
  write_roster "$TMP/p4"
  (
    cd "$TMP/p4" || exit 1
    env -u AGENT_PERSONA -u AGENT_BACKING AGENT_FEED_TICK=0.25 \
      bash scripts/agent-activity.sh >/dev/null 2>&1 &
    echo $! >feed.pid
  )
  sleep 1
  # The rename, exactly as a founder would make it: one cell in the roster.
  sed -i 's/| Orchestrator     | Alisa     |/| Orchestrator     | Dara      |/' \
      "$TMP/p4/AGENT_ROSTER.md" 2>/dev/null
  sleep 2
  kill "$(cat "$TMP/p4/feed.pid" 2>/dev/null)" 2>/dev/null
  wait 2>/dev/null
  feedlog="$TMP/p4/logs/agent-activity.log"
  if [ ! -f "$feedlog" ]; then
    fail "#12 the feed produced no log — cannot tell whether it followed the rename"
  elif grep -q "Dara" "$feedlog"; then
    pass "#12 a running feed picks up a roster rename without being restarted"
  else
    fail "#12 the running feed never mentioned 'Dara' — it cached its identity at startup"
  fi
fi

# ===========================================================================
# 11. CLAUDE.md points at the ROLE, not at a shipped name.
#     The fourth site: §"On wake" named the default Orchestrator as if it were
#     the answer, so an agent that read the docs correctly still got it wrong.
# ===========================================================================
if [ -f "$ROOT/CLAUDE.md" ]; then
  wake="$(sed -n '/^### On wake/,/^## /p' "$ROOT/CLAUDE.md")"
  if [ -z "$wake" ]; then
    fail "#11 could not locate CLAUDE.md §'On wake' — assertion would be vacuous"
  elif printf '%s' "$wake" | grep -q 'default persona \*\*Sylvia\*\*'; then
    fail "#11 CLAUDE.md §'On wake' still names a default persona instead of the roster's Orchestrator row"
  else
    printf '%s' "$wake" | grep -qi 'Orchestrator' \
      && pass "#11 CLAUDE.md §'On wake' resolves identity from the roster's Orchestrator role" \
      || fail "#11 CLAUDE.md §'On wake' no longer explains how identity is resolved"
  fi
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-010 — the roster is the single source of persona identity."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
