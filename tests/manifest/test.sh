#!/bin/bash
# tests/manifest/test.sh
#
# BUG-005 / Codex F1 — make the tier policy a CONTROL instead of a slogan.
#
# The 30 s pre-push ceiling was removed because it had become a coverage policy:
# a suite that outgrew the budget got demoted to CI-only, and the gate carried on
# printing "all checks passed" over less. I replaced it with the rule "coverage
# is decided on risk, never on the clock" and claimed `pipe_skip` enforced it,
# because a skip must carry a reason.
#
# **That was false.** A suite simply OMITTED from .githooks/pre-push-project
# never reaches `pipe_skip` at all — deleting a `pipe_stage` block is a one-line
# silent skip and the pipeline still renders PASSED. `signal-dispatch` was the
# live proof: the gate could not report an exclusion it did not know about.
#
# So the membership claim is asserted against the FILESYSTEM here, not against a
# reviewer's memory:
#
#   - every suite that exists is classified,
#   - every classified suite exists,
#   - every `pre-push` suite is actually invoked by the gate,
#   - every rationale is present, and none of them argues from the clock.
#
# That last one is the point. A slow suite that matters is a suite to make
# faster: signal-dispatch went 125.4 s → 75.0 s with every assertion intact once
# someone looked at WHY it was slow instead of where to put it.
#
# Run from the blueprint repo root:  bash tests/manifest/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$ROOT/tests/SUITES.md"
GATE="$ROOT/.githooks/pre-push-project"
HOOK="$ROOT/.githooks/pre-push"
CI="$ROOT/.github/workflows/security.yml"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$MANIFEST" ] || { echo "FAIL: tests/SUITES.md is missing — the tier policy has no control"; exit 1; }

# Parse the manifest table: | suite | tier | risk | rationale |
# Padding-tolerant (BUG-010's lesson: a formatter's spaces must not break a
# parser), and only rows whose suite is in backticks are treated as entries.
rows(){
  awk -F'|' '
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    /^[[:space:]]*\|/ {
      n=split($0,f,"|"); if (n<6) next
      s=trim(f[2]); t=trim(f[3]); r=trim(f[4]); w=trim(f[5])
      if (s !~ /^`.*`$/) next
      gsub(/`/,"",s)
      print s "\t" t "\t" r "\t" w
    }
  ' "$MANIFEST"
}

# live_cmds FILE... — the files with COMMENT LINES REMOVED.
#
# Codex R2-F1b: membership was checked with an unanchored `grep` for the path,
# so commenting out an invocation kept the control green while the suite stopped
# running. Reproduced: `sed -i '/tests\/pipeline/s/^/#/' .githooks/pre-push*`
# left the manifest passing "every pre-push/both suite is invoked by the gate".
# Strip comments first, then require an anchored `bash tests/<suite>/<file>.sh`
# command rather than arbitrary text containing the path.
live_cmds(){ sed 's/#.*//' "$@" 2>/dev/null; }

# ===========================================================================
# 1. EVERY SUITE ON DISK IS CLASSIFIED.
#    This is the assertion that closes F1: an omission is now a failure rather
#    than an absence nobody can see.
# ===========================================================================
# Codex R2-F1a: discovery used to recognise only `tests/*/test.sh`, so renaming
# a runner — or adding `tests/unclassified/check.sh` — made a suite INVISIBLE to
# the control while it still passed. Ordinary refactoring was enough; no lying
# in the manifest required. Classify by DIRECTORY and consider every shell file
# under tests/, so the convention itself is enforced rather than assumed.
missing=""
for f in $(find "$ROOT/tests" -type f -name '*.sh' 2>/dev/null | sort); do
  rel="${f#"$ROOT"/tests/}"
  dir="${rel%%/*}"
  if [ "$dir" = "$rel" ]; then
    # A shell file sitting directly in tests/ belongs to no suite at all.
    missing="$missing $rel(top-level)"
    continue
  fi
  rows | cut -f1 | grep -qx "$dir" || \
    case " $missing " in *" $dir "*) ;; *) missing="$missing $dir" ;; esac
done
if [ -n "$missing" ]; then
  fail "#1 shell files exist under tests/ whose suite is not classified:$missing"
else
  pass "#1 every suite directory containing shell files is classified"
fi

# ===========================================================================
# 2. EVERY CLASSIFIED SUITE EXISTS — a manifest that names ghosts would let a
#    deleted suite look covered.
# ===========================================================================
ghosts=""
while IFS="$(printf '\t')" read -r s _ _ _; do
  [ -n "$s" ] || continue
  [ -f "$ROOT/tests/$s/test.sh" ] || ghosts="$ghosts $s"
done <<EOF
$(rows)
EOF
if [ -n "$ghosts" ]; then
  fail "#2 tests/SUITES.md classifies suites that do not exist:$ghosts"
else
  pass "#2 every classified suite exists on disk"
fi

# ===========================================================================
# 3. TIER IS ONE OF THE THREE LEGAL VALUES.
# ===========================================================================
badtier=""
while IFS="$(printf '\t')" read -r s t _ _; do
  [ -n "$s" ] || continue
  case "$t" in pre-push|CI|both) ;; *) badtier="$badtier $s($t)" ;; esac
done <<EOF
$(rows)
EOF
[ -n "$badtier" ] && fail "#3 illegal tier values:$badtier" \
                  || pass "#3 every tier is pre-push, CI or both"

# ===========================================================================
# 4. EVERY BLOCKING SUITE IS ACTUALLY INVOKED BY THE GATE.
#    A manifest claiming "pre-push" while the gate never runs it would be a
#    more convincing version of the same silence.
# ===========================================================================
notrun=""
while IFS="$(printf '\t')" read -r s t _ _; do
  [ -n "$s" ] || continue
  case "$t" in pre-push|both) ;; *) continue ;; esac
  if ! live_cmds "$GATE" "$HOOK" | grep -qE "(^|[^#[:alnum:]_/])bash +tests/$s/[a-z0-9._-]+\\.sh"; then
    notrun="$notrun $s"
  fi
done <<EOF
$(rows)
EOF
if [ -n "$notrun" ]; then
  fail "#4 declared blocking but the gate never invokes them:$notrun"
else
  pass "#4 every pre-push/both suite is invoked by the gate"
fi

# ===========================================================================
# 5. EVERY CI-TIER SUITE IS ACTUALLY IN THE WORKFLOW.
# ===========================================================================
if [ -f "$CI" ]; then
  ci_missing=""
  while IFS="$(printf '\t')" read -r s t _ _; do
    [ -n "$s" ] || continue
    case "$t" in CI|both) ;; *) continue ;; esac
    live_cmds "$CI" | grep -qE "bash +tests/$s/[a-z0-9._-]+\\.sh" \
      || ci_missing="$ci_missing $s"
  done <<EOF
$(rows)
EOF
  [ -n "$ci_missing" ] && fail "#5 declared CI but absent from the workflow:$ci_missing" \
                       || pass "#5 every CI/both suite runs in the workflow"
fi

# ===========================================================================
# 6. NO RATIONALE ARGUES FROM THE CLOCK.
#
#    THE point of this file. Every exclusion that produced BUG-005 was phrased
#    exactly this way — "does not fit the 30s ceiling", "costs ~6s", "too slow
#    for pre-push". Each was written down honestly and none was ever challenged,
#    because nothing checked them.
# ===========================================================================
clocky=""
while IFS="$(printf '\t')" read -r s t _ w; do
  [ -n "$s" ] || continue
  low="$(printf '%s' "$w" | tr '[:upper:]' '[:lower:]')"
  if [ -z "$w" ]; then
    clocky="$clocky $s(empty)"
  elif printf '%s' "$low" | grep -qE 'too slow|does not fit|doesn.t fit|ceiling|time budget|budget|fits in|no room|too expensive|costs? (only )?[0-9]|[0-9]+ ?s(ec|econds)? (to|for) run'; then
    clocky="$clocky $s"
  fi
done <<EOF
$(rows)
EOF
if [ -n "$clocky" ]; then
  fail "#6 rationale argues from cost, not risk (or is empty):$clocky"
  echo "        A slow suite that matters is a suite to make faster —"
  echo "        signal-dispatch went 125.4s -> 75.0s once someone asked why."
else
  pass "#6 no rationale argues from the clock"
fi

# ===========================================================================
# 7. NON-VACUITY — the parser must actually be finding rows. Every assertion
#    above passes trivially against an empty parse, which is precisely the
#    failure mode this file exists to prevent.
# ===========================================================================
n="$(rows | grep -c .)"
if [ "${n:-0}" -lt 10 ]; then
  fail "#7 parsed only ${n:-0} manifest rows — the parser is broken, so #1-#6 proved nothing"
else
  pass "#7 parsed $n manifest rows (assertions above are non-vacuous)"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-005 — every suite is classified, and no tier is justified by the clock."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
