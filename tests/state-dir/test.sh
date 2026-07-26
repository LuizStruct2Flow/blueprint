#!/bin/bash
# tests/state-dir/test.sh
#
# A-09: the activity feed and the dispatchers must rendezvous on ONE state dir.
#
# The defect: the feed derived `~/.<repo-basename>` at runtime, but the
# Codex/Gemini dispatchers hardcoded the literal `~/.{{PROJECT_NAME}}/` — an
# unsubstituted bootstrap placeholder. So every blueprint-derived checkout's
# dispatcher wrote into the SAME shared directory, and a feed pointed there saw
# other projects' Codex output interleaved. This is not hypothetical: a redcare
# BUG-013 acceptance verdict surfaced live in this project's feed.
#
# Fix shape: a single derivation in scripts/lib/state-dir.sh, sourced by the feed
# AND every dispatcher — one mechanism, never two that agree only by coincidence.
#
# Run from the blueprint repo root:  bash tests/state-dir/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HELPER="$ROOT/scripts/lib/state-dir.sh"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

DISPATCHERS="scripts/start-codex-signal-watch.sh scripts/codex-signal-watch.sh scripts/start-gemini-signal-watch.sh"

# ===========================================================================
# 1. THE REPRODUCER — two different projects must get two different state dirs.
#    Under the literal placeholder both collapse to ~/.{{PROJECT_NAME}}/, which
#    IS the contamination. The helper must derive from the repo name so they
#    diverge. (On the parent commit the helper does not exist and this is red.)
# ===========================================================================
if [ ! -f "$HELPER" ]; then
  fail "#1 scripts/lib/state-dir.sh is missing — the shared derivation does not exist"
else
  # Source in a subshell so nothing leaks; HOME is pinned so the assertion is
  # exact rather than host-dependent.
  a="$( HOME=/h AGENT_STATE_HOME= ; . "$HELPER"; agent_state_dir /tmp/x/proj-A )"
  b="$( HOME=/h AGENT_STATE_HOME= ; . "$HELPER"; agent_state_dir /tmp/x/proj-B )"
  [ "$a" = "/h/.proj-A" ] || fail "#1 proj-A derived '$a', expected /h/.proj-A"
  [ "$b" = "/h/.proj-B" ] || fail "#1 proj-B derived '$b', expected /h/.proj-B"
  if [ "$a" != "$b" ]; then
    pass "#1 two projects derive two distinct state dirs (no shared-dir collision)"
  else
    fail "#1 two projects collapsed to the SAME state dir ('$a') — the A-09 contamination"
  fi
fi

# ===========================================================================
# 2. $AGENT_STATE_HOME override is honored (feed precedence preserved).
# ===========================================================================
if [ -f "$HELPER" ]; then
  o="$( HOME=/h AGENT_STATE_HOME=/explicit/dir ; . "$HELPER"; agent_state_dir /tmp/x/proj-A )"
  [ "$o" = "/explicit/dir" ] \
    && pass "#2 AGENT_STATE_HOME overrides the derived dir (matches the feed)" \
    || fail "#2 AGENT_STATE_HOME ignored — derived '$o', expected /explicit/dir"
fi

# ===========================================================================
# 3. No dispatcher hardcodes the literal placeholder in a state/log PATH.
#    Non-vacuity guard: first prove the grep target exists at all, so a renamed
#    file cannot make "zero literal hits" pass by finding nothing to scan.
# ===========================================================================
saw_any_logpath=0
literal_found=0
for d in $DISPATCHERS; do
  [ -f "$ROOT/$d" ] || { fail "#3 dispatcher $d not found — cannot assert on it"; continue; }
  grep -Eq 'runs\.log|signal\.log|last-message' "$ROOT/$d" && saw_any_logpath=1
  # A literal {{PROJECT_NAME}} on any line that builds a state/log path.
  if grep -En '\{\{PROJECT_NAME\}\}' "$ROOT/$d" \
       | grep -Eq 'runs\.log|signal\.log|last-message|mkdir'; then
    fail "#3 $d still builds a state/log path from the literal {{PROJECT_NAME}}"
    literal_found=1
  fi
done
if [ "$saw_any_logpath" -ne 1 ]; then
  fail "#3 found no run/signal/last-message path in any dispatcher — grep target vanished (vacuous)"
elif [ "$literal_found" -eq 0 ]; then
  pass "#3 dispatchers build their state/log paths without the literal placeholder"
fi

# ===========================================================================
# 4. Both the feed AND the dispatchers actually SOURCE the shared helper —
#    the guarantee is 'one mechanism', so prove every side is wired to it.
# ===========================================================================
for f in scripts/agent-activity.sh $DISPATCHERS; do
  [ -f "$ROOT/$f" ] || { fail "#4 $f not found"; continue; }
  grep -q 'lib/state-dir.sh' "$ROOT/$f" \
    && pass "#4 $f sources the shared state-dir helper" \
    || fail "#4 $f does not source scripts/lib/state-dir.sh — it has its own copy of the rule"
done

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-09 — feed and dispatchers rendezvous on one per-project state dir."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
