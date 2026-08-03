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

  # A-09's property is DISTINCTNESS, not a particular path. This used to assert
  # the literal `/h/.proj-A`, which pinned the implementation rather than the
  # guarantee — and so failed when BUG-020 moved the dir INSIDE the project even
  # though the anti-collision property was untouched. Assert what A-09 actually
  # promises, plus BUG-020's location.
  [ "$a" = "/tmp/x/proj-A/logs/state" ] || fail "#1 proj-A derived '$a', expected it under the project (BUG-020)"
  [ "$b" = "/tmp/x/proj-B/logs/state" ] || fail "#1 proj-B derived '$b', expected it under the project (BUG-020)"
  case "$a" in
    /h/*) fail "#1 the state dir is still under \$HOME — deleting the project would not delete its state (BUG-020)" ;;
  esac
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

# ===========================================================================
# 5. BUG-020 — the state dir is INSIDE the project, and nothing reaches $HOME
#    to find it.
#
#    A-09 made the feed and the dispatchers AGREE on a path; it never asked
#    whether that path belonged outside the project. Two consequences this pins:
#    deleting the project must delete its state (it did not — a project
#    bootstrapped at the same path later inherited the old records), and no
#    out-of-project directory grant should be needed for ordinary operation.
#
#    Asserted on the DERIVATION and on every consumer, because a single script
#    quietly rebuilding a $HOME path would restore the split without failing
#    anything else.
# ===========================================================================
if [ -f "$HELPER" ]; then
  d="$( HOME=/h AGENT_STATE_HOME= ; . "$HELPER"; agent_state_dir /tmp/x/proj-C )"
  case "$d" in
    /tmp/x/proj-C/*) pass "#5 the state dir resolves inside the project" ;;
    *) fail "#5 the state dir resolved OUTSIDE the project: $d" ;;
  esac

  # The override must still work — an operator pointing several checkouts at one
  # dir is a deliberate choice A-09 supports and this must not remove.
  o="$( HOME=/h AGENT_STATE_HOME=/explicit ; . "$HELPER"; agent_state_dir /tmp/x/proj-C )"
  [ "$o" = "/explicit" ] \
    && pass "#5 AGENT_STATE_HOME still overrides (the deliberate shared-dir case)" \
    || fail "#5 AGENT_STATE_HOME no longer overrides — got '$o'"
fi

# No consumer may rebuild a $HOME-based STATE path of its own. Comments are
# stripped so the incident record above is not a finding.
#
# Narrowed deliberately. A bare `$HOME/.` match reported three legitimate uses:
# $HOME/.claude/projects (reading Claude's own transcripts), $HOME/.nvm and
# $HOME/.vscode (locating an installed binary). None of those is agent state,
# and a guard that reports them is one someone widens until it means nothing.
# What BUG-020 forbids is a $HOME path carrying a STATE ARTEFACT, or a
# hand-rolled ~/.<repo-name> derivation that bypasses the shared helper.
# ONE definition of the pattern, used by both #5b (scan the tree) and #5c (prove
# the pattern still bites). Two copies would drift, which is the same defect
# A-09 fixed for the state dir itself.
PAT='\$HOME[^ ]*(runs\.log|signal\.log|last-message)|\$HOME/\.\$\(basename|\$HOME/\.\$\{'

homey=""
for f in scripts/agent-activity.sh $DISPATCHERS; do
  [ -f "$ROOT/$f" ] || continue
  if sed 's/#.*//' "$ROOT/$f" | grep -qE "$PAT"; then
    homey="$homey $f"
  fi
done
if [ -n "$homey" ]; then
  fail "#5b a consumer still builds a \$HOME state path — the split would return:$homey"
else
  pass "#5b no consumer builds its own \$HOME state path"
fi

# --- #5c: prove #5b's pattern is not merely narrow enough to always pass ------
#
# #5b was narrowed AFTER it fired on three legitimate $HOME uses. Narrowing a
# guard until it goes green is how a guard stops guarding, so the pattern is
# pinned here against the two shapes this bug actually had — taken verbatim from
# the pre-fix files (c284cc1^) — plus the benign line that caused the narrowing.
# If someone widens or guts #5b's regex, this fails.
BAD_A='RUN_LOG="$HOME/.{{PROJECT_NAME}}/codex-runs.log"'
BAD_B='state_dir="${AGENT_STATE_HOME:-$HOME/.$(basename "$repo_root")}"'
OK_A='  proj="$HOME/.claude/projects/$(printf "%s" "$repo_root")"'

vac=0
for sample in "$BAD_A" "$BAD_B"; do
  if ! printf '%s\n' "$sample" | grep -qE "$PAT"; then
    fail "#5c the guard does NOT catch a known-defective line: $sample"
    vac=1
  fi
done
if printf '%s\n' "$OK_A" | grep -qE "$PAT"; then
  fail "#5c the guard flags \$HOME/.claude/projects, which is transcript reading, not state"
  vac=1
fi
[ "$vac" -eq 0 ] \
  && pass "#5c the guard fires on both historical defect shapes and spares the benign one"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-09 — feed and dispatchers rendezvous on one per-project state dir."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
