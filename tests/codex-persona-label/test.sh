#!/bin/sh
# tests/codex-persona-label/test.sh — BUG-021.
#
# Codex output reaches the feed as a bare `[CODEX]`, never `[Persona - Codex]`.
# Measured 2026-08-05: 11 bare vs 2 labelled here, 103 vs 5 in
# linkedin-watcher-agent, and 0 vs 237 in the redcare blueprint, which fixed it.
#
# THE ROOT CAUSE IS STRUCTURAL, which is why the obvious patch is wrong.
# scripts/agent-activity.sh pumps codex-runs.log under a label bound ONCE at
# daemon start, while the persona is a PER-DISPATCH fact. No string chosen
# inside the feed can be right, because the feed does not know — and cannot know
# — who holds the mic for a given line. Only the launcher does, at the moment it
# dispatches.
#
# So the label has to be built where the knowledge is, from the SAME roster
# lookup the feed uses. `persona_label` lived inside agent-activity.sh as a local
# function, so the launcher could not reuse it and would have had to copy it —
# two copies of a rule are two rules (the lesson TASK-002 and TASK-005 both land
# on). This suite pins the shared function AND the two callers.

set -u

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
FAILED=0
pass() { echo "  ok — $1"; }
fail() { echo "FAIL: $1"; FAILED=$((FAILED + 1)); }

LAUNCHER="$ROOT/scripts/start-codex-signal-watch.sh"
FEED="$ROOT/scripts/agent-activity.sh"
ROSTER_LIB="$ROOT/scripts/lib/roster.sh"

# ===========================================================================
# 1. ONE shared label function, usable outside the feed.
# ===========================================================================
# shellcheck disable=SC1090
. "$ROSTER_LIB"

if command -v bp_roster_label >/dev/null 2>&1; then
  pass "#1 bp_roster_label is exposed by the roster lib"
else
  fail "#1 no shared label function — the launcher must copy the feed's version"
fi

# ===========================================================================
# 2. It resolves a persona to "<Name> - <Backing>" from a real roster file.
# ===========================================================================
T="$(mktemp -d)"
# The heading matters: bp_roster_rows reads ONLY a `## Members` table, so that an
# unrelated table elsewhere in the roster cannot shadow a real member. A fixture
# with any other heading resolves nothing — which is what this suite's first
# draft did, and it looked exactly like the bug it was written to catch.
cat > "$T/AGENT_ROSTER.md" <<'EOF'
# Roster

## Members

| Role | Name | Backing agent |
|---|---|---|
| Orchestrator | Jesko | Claude Code |
| QA-2 | Slava | Codex |
EOF

if command -v bp_roster_label >/dev/null 2>&1; then
  got="$(bp_roster_label "$T" "Slava" 2>/dev/null)"
  if [ "$got" = "Slava - Codex" ]; then
    pass "#2 a Codex persona resolves to 'Slava - Codex'"
  else
    fail "#2 expected 'Slava - Codex', got '$got'"
  fi

  # An unknown name must still produce the NAME, not a blank or an error. A feed
  # line with no label at all is worse than an unqualified one.
  got="$(bp_roster_label "$T" "Nobody" 2>/dev/null)"
  if [ "$got" = "Nobody" ]; then
    pass "#2 an unrostered name degrades to the bare name"
  else
    fail "#2 an unrostered name gave '$got' rather than 'Nobody'"
  fi
fi
rm -rf "$T"

# ===========================================================================
# 3. The LAUNCHER labels its own output — it is the only place that can.
# ===========================================================================
if grep -q 'bp_roster_label' "$LAUNCHER" 2>/dev/null; then
  pass "#3 the launcher builds its label from the shared roster lookup"
else
  fail "#3 the launcher does not label its output — the feed cannot do it for it"
fi

if grep -q 'AGENT_SIGNAL_HOLDER' "$LAUNCHER" 2>/dev/null; then
  pass "#3 it labels with the holder of the mic AT DISPATCH TIME"
else
  fail "#3 the launcher never reads AGENT_SIGNAL_HOLDER — the label cannot be per-dispatch"
fi

# ===========================================================================
# 4. The FEED no longer stamps a static label on the Codex run log.
#    This is the assertion that makes the fix a fix rather than an addition:
#    leaving the pump in place would double every line, one labelled and one
#    not, which reads as a bug in the new code rather than the old.
# ===========================================================================
if grep -qE 'pump .*codex-runs\.log.*"CODEX"' "$FEED" 2>/dev/null; then
  fail "#4 the feed still pumps codex-runs.log under a static [CODEX] label"
else
  pass "#4 the feed no longer stamps a static [CODEX] label"
fi

# The feed's own mic-flip line must keep using the shared function, or the two
# label formats drift apart while both look correct in isolation.
if grep -q 'bp_roster_label' "$FEED" 2>/dev/null; then
  pass "#4 the feed uses the same shared label function"
else
  fail "#4 the feed kept a private label builder — the two formats will drift"
fi

# ===========================================================================
# 5. Gemini is untouched. It routes through its own run log and has no launcher
#    doing per-dispatch labelling, so removing ITS pump would silently drop the
#    lines entirely. Scope discipline: fix the one that has a fix.
# ===========================================================================
if grep -q 'gemini-runs\.log' "$FEED" 2>/dev/null; then
  pass "#5 the Gemini run log is still merged — its lines are not dropped"
else
  fail "#5 the Gemini pump was removed too, silently losing its output"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-021 — Codex output carries the persona that produced it."
  exit 0
fi
echo "FAILED: $FAILED assertion(s)."
exit 1
