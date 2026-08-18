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
# A `blueprint`-tier suite drives machinery that exists ONLY here —
# new-project.sh, templates/, .blueprint-root. It is export-ignore'd, so in a
# DERIVED project it is legitimately absent and this manifest still ships and
# still runs. `.blueprint-root` is the same positive marker `drift` uses.
IN_BLUEPRINT=0
[ -f "$ROOT/.blueprint-root" ] && IN_BLUEPRINT=1

ghosts=""
while IFS="$(printf '\t')" read -r s t _ _; do
  [ -n "$s" ] || continue
  [ -f "$ROOT/tests/$s/test.sh" ] && continue
  if [ "$t" = "blueprint" ] && [ "$IN_BLUEPRINT" -eq 0 ]; then continue; fi
  ghosts="$ghosts $s"
done <<EOF
$(rows)
EOF
if [ -n "$ghosts" ]; then
  fail "#2 tests/SUITES.md classifies suites that do not exist:$ghosts"
else
  pass "#2 every classified suite exists on disk"
fi

# ===========================================================================
# 2b. THE EXPORT BOUNDARY, BOTH DIRECTIONS (BUG-028).
#
#     A tier is a claim about WHERE a suite runs, and "blueprint only" is such
#     a claim — but it was enforced by nothing at all. `tests/bootstrap-*`,
#     `tests/template-source`, `tests/drift-in-blueprint` and
#     `tests/pull-exec-bit` all shipped to every derived project, wired into its
#     gate by `.githooks/pre-push-project`, testing machinery that cannot exist
#     there. Five of the six day-one failures. Nobody saw it because the
#     failure happens on someone else's machine, after the blueprint's own gate
#     has gone green over the same suites passing at home.
#
#     Asserted against a REAL `git archive`, the way template-source is: the
#     export BEHAVIOUR is what matters, and a rule that is present but not
#     taking effect is exactly the failure mode being guarded. `git check-attr`
#     was tried first and is unusable here — it reports `unspecified` for a
#     directory pattern like `templates/` even though `git archive` genuinely
#     drops it, so it would have called a correct boundary broken.
#
#     The archive is taken of the WORKING TREE, not of HEAD, through a throwaway
#     index. HEAD cannot answer for a boundary the author has written and not
#     yet committed, which is the one moment this assertion is useful.
#
#     The reverse direction matters as much: a suite that is NOT blueprint-tier
#     must actually reach derived projects. Export-ignoring one is a silent
#     coverage cut for every project but this one — the BUG-005 defect, hidden
#     one level further down.
#
#     `tests/bootstrap-gate` asserts the consequence end-to-end (the archive
#     really does produce a project whose gate passes). This one names the file.
# ===========================================================================
if [ "$IN_BLUEPRINT" -eq 1 ]; then
  # BUG-014 — the gate runs this suite with GIT_DIR exported, and `git add`
  # below would then write into whatever that names rather than this repo.
  unset GIT_DIR GIT_WORK_TREE GIT_OBJECT_DIRECTORY
  _tmpidx="$(mktemp)"
  _listing="$(mktemp)"
  # git refuses a zero-length index file, so hand it a PATH, not an empty file.
  rm -f "$_tmpidx"
  (
    cd "$ROOT" || exit 1
    # `git add -A` honours .gitignore, so this tree omits the handful of files
    # that are tracked AND ignored. Only `tests/` is read from the listing, and
    # nothing under it is ignored, so that does not affect the assertion.
    GIT_INDEX_FILE="$_tmpidx" git add -A 2>/dev/null || exit 1
    _tree="$(GIT_INDEX_FILE="$_tmpidx" git write-tree 2>/dev/null)" || exit 1
    [ -n "$_tree" ] || exit 1
    git archive --format=tar "$_tree" 2>/dev/null | tar -t 2>/dev/null
  ) >"$_listing"

  if [ ! -s "$_listing" ]; then
    fail "#2b could not archive the working tree — the export boundary is unverified, not verified"
  else
    shipped_bp=""
    withheld=""
    while IFS="$(printf '\t')" read -r s t _ _; do
      [ -n "$s" ] || continue
      [ -d "$ROOT/tests/$s" ] || continue
      if grep -q "^tests/$s/" "$_listing"; then ships=1; else ships=0; fi
      if [ "$t" = "blueprint" ] && [ "$ships" -eq 1 ]; then
        shipped_bp="$shipped_bp $s"
      elif [ "$t" != "blueprint" ] && [ "$ships" -eq 0 ]; then
        withheld="$withheld $s"
      fi
    done <<EOF
$(rows)
EOF
    if [ -n "$shipped_bp" ]; then
      fail "#2b blueprint-only suites DO ship, so they run in every derived project's gate against machinery that cannot be there:$shipped_bp"
    elif [ -n "$withheld" ]; then
      fail "#2b suites classified as shipping are export-ignore'd, so every derived project silently loses them:$withheld"
    else
      pass "#2b the export boundary matches the manifest in both directions"
    fi
  fi
  rm -f "$_tmpidx" "$_listing"
fi

# ===========================================================================
# 3. TIER IS ONE OF THE THREE LEGAL VALUES.
# ===========================================================================
badtier=""
while IFS="$(printf '\t')" read -r s t _ _; do
  [ -n "$s" ] || continue
  case "$t" in pre-push|CI|both|blueprint) ;; *) badtier="$badtier $s($t)" ;; esac
done <<EOF
$(rows)
EOF
[ -n "$badtier" ] && fail "#3 illegal tier values:$badtier" \
                  || pass "#3 every tier is pre-push, CI, both or blueprint"

# ===========================================================================
# 4. EVERY BLOCKING SUITE IS ACTUALLY INVOKED BY THE GATE.
#    A manifest claiming "pre-push" while the gate never runs it would be a
#    more convincing version of the same silence.
# ===========================================================================
notrun=""
while IFS="$(printf '\t')" read -r s t _ _; do
  [ -n "$s" ] || continue
  # `blueprint` is `both` plus "does not ship" (see #2b) — it still blocks the
  # push HERE, so it is still required to be invoked by the gate.
  case "$t" in pre-push|both|blueprint) ;; *) continue ;; esac
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
    case "$t" in CI|both|blueprint) ;; *) continue ;; esac
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
