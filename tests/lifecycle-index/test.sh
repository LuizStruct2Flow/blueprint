#!/bin/bash
# tests/lifecycle-index/test.sh
#
# The acceptance INDEX must list every item that is actually waiting.
#
# WHY THIS EXISTS. `docs/waiting-acceptance/INDEX.md` is what the founder reads
# to decide what to test. On 2026-08-03 an `lcm` pass found it listing 5 items
# while `BUGS.md` held 14 — nine fixes, including both of that day's S2s, were
# invisible to the only person who can accept them.
#
# Nothing failed to make that happen. Rows were appended to BUGS.md by the
# lifecycle moves, and the index was a separate file nobody re-derived. It is
# the same shape as every drift defect this repo has fixed: TWO records of one
# fact, kept in step by memory.
#
# The honest fix would be to generate the index from the rows. That is a bigger
# change than a bug-fix session should make unreviewed, and it would throw away
# the per-item "what to test" prose, which is the index's actual value and is
# NOT derivable from a bug row. So the two stay separate and this asserts they
# agree on MEMBERSHIP — the part that can drift silently — while leaving the
# prose to a human.
#
# Run from the blueprint repo root:  bash tests/lifecycle-index/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

ROWS="$ROOT/docs/waiting-acceptance/BUGS.md"
INDEX="$ROOT/docs/waiting-acceptance/INDEX.md"

for f in "$ROWS" "$INDEX"; do
  [ -f "$f" ] || { fail "missing $f"; echo "FAILED"; exit 1; }
done

# IDs are matched, not counts. A count check passes when one item is dropped and
# an unrelated one added — which is exactly the kind of edit that happens during
# a busy lifecycle move.
ids_rows="$(grep -oE '^\| \*\*(BUG|FEATURE)-[0-9]+\*\*' "$ROWS" \
            | grep -oE '(BUG|FEATURE)-[0-9]+' | sort -u)"
# Only the TABLE ROWS of the index, not its prose. The first version matched any
# bold ID anywhere in the file and so flagged the paragraph that says "earlier
# work accepted the same day — BUG-005, BUG-010, FEATURE-001, FEATURE-002 — is
# in ../done/". That sentence is CORRECT and states the opposite of what the
# check accused it of.
#
# A row is a line starting with `| ` whose first cell names the item; prose
# never does. Matching the mechanism (a table row) instead of the symptom (an ID
# appears somewhere) is the same repair this repo has made all week.
ids_index="$(grep -oE '^\| \[?\*\*(BUG|FEATURE)-[0-9]+\*\*' "$INDEX" \
             | grep -oE '(BUG|FEATURE)-[0-9]+' | sort -u)"

# Non-vacuity: if the greps stop matching, everything below compares empty sets
# and passes. Assert there is something to compare BEFORE comparing.
n_rows="$(printf '%s\n' "$ids_rows" | grep -c . || true)"
if [ "${n_rows:-0}" -lt 1 ]; then
  # ZERO rows has two very different causes and the first version of this guard
  # treated them as one — it failed the moment `waiting-acceptance/` legitimately
  # emptied, which is a GOOD state, not a broken pattern. Distinguish them by
  # the table header: if the file still has one, the table is intact and simply
  # has no rows; if it does not, the format changed under the pattern.
  #
  # Recording it because it is this repo's recurring mistake in miniature: an
  # assertion that two different causes both produce cannot tell you which
  # happened.
  if grep -q '^|---' "$ROWS"; then
    pass "#0 nothing is waiting — the table is intact and empty, which is a valid state"
    # SKIP the membership checks, not the whole suite. The first version
    # `exit 0`-ed here, which made #3 below unreachable in exactly the state the
    # repo was in when #3 was written — a check that cannot run is not a check,
    # and this is the fourth time that shape has appeared today.
    #
    # #1 and #2 compare two lists and are genuinely vacuous when both are empty.
    # #3 walks the filesystem and is MOST useful right after a promotion empties
    # this folder, because that is when artefacts get left behind.
    skip_membership=1
  else
    fail "#0 no item rows AND no table header in BUGS.md — the format changed, so every check below would be vacuous"
    echo "FAILED: see the FAIL lines above."
    exit 1
  fi
else
  skip_membership=0
  pass "#0 parsed $n_rows waiting item(s) — the comparison is not vacuous"
fi

if [ "${skip_membership:-0}" -eq 0 ]; then
missing="$(comm -23 <(printf '%s\n' "$ids_rows") <(printf '%s\n' "$ids_index") | tr '\n' ' ')"
missing="$(printf '%s' "$missing" | sed 's/[[:space:]]*$//')"
if [ -n "$missing" ]; then
  fail "#1 waiting items absent from INDEX.md, so the founder cannot see them to test them: $missing"
else
  pass "#1 every waiting item appears in the acceptance index"
fi

# The reverse direction matters too: an index row for something already accepted
# sends someone to re-test work that has moved on.
stale="$(comm -13 <(printf '%s\n' "$ids_rows") <(printf '%s\n' "$ids_index") | tr '\n' ' ')"
stale="$(printf '%s' "$stale" | sed 's/[[:space:]]*$//')"
if [ -n "$stale" ]; then
  fail "#2 INDEX.md lists items that are no longer waiting (accepted or reopened): $stale"
else
  pass "#2 the index lists nothing that has already left waiting-acceptance"
fi
fi

# ===========================================================================
# 3. An item's ARTEFACTS live in the same lifecycle folder as its ROW.
#
#    CLAUDE.md: "Whole folder travels together through doing/ ->
#    waiting-acceptance/ -> done/." Rows are easy to move (one line, and the
#    index guard above notices); folders and PLAN files are not, so they get
#    left behind.
#
#    That is what happened on 2026-08-03: all 14 rows were promoted to done/
#    and BUG-004-gate-arming/, PLAN-BUG-019.md and two review documents stayed
#    in waiting-acceptance/. The founder spotted it by eye — "I see for instance
#    the bug-004 in waiting-acceptance" — which is precisely the check that
#    should not depend on someone reading a directory listing.
#
#    A link in INDEX.md had also been pointing at ../doing/BUG-004-gate-arming/
#    since BEFORE that move, so it was wrong across two relocations without
#    anything noticing.
# ===========================================================================
DOCS="$ROOT/docs"

# The property is "this item's DISPOSITION is recorded in the folder its
# artefacts sit in" — and there are two legitimate records, so requiring only
# the first was too narrow.
#
# Found immediately: done/BUG-001-fork-bomb has no row in done/BUGS.md because
# it was accepted on 2026-07-29 and written up in ACCEPTANCE-JESKO-2026-07-29.md
# instead. The folder is in exactly the right place. Failing on it would have
# pushed me to either fabricate a historical row or weaken the check to nothing,
# and both are worse than widening it to the truth.
recorded_here() { # $1 = ID, $2 = lifecycle state
  grep -qE "^\| \*\*$1\*\*" "$DOCS/$2/BUGS.md" 2>/dev/null && return 0
  grep -rqE "\b$1\b" "$DOCS/$2"/ACCEPTANCE-*.md 2>/dev/null && return 0
  return 1
}

orphans=""
checked=0
for state in doing waiting-acceptance done; do
  rows_file="$DOCS/$state/BUGS.md"
  [ -f "$rows_file" ] || continue
  for art in "$DOCS/$state"/BUG-*; do
    [ -e "$art" ] || continue
    base="$(basename "$art")"
    case "$base" in BUGS.md) continue ;; esac
    id="$(printf '%s' "$base" | grep -oE '^BUG-[0-9]+')"
    [ -n "$id" ] || continue
    checked=$((checked + 1))
    recorded_here "$id" "$state" || orphans="$orphans $state/$base"
  done
  # PLAN-BUG-XXX.md travels with its work too (CLAUDE.md, Major Bug Process).
  for plan in "$DOCS/$state"/PLAN-BUG-*.md; do
    [ -e "$plan" ] || continue
    id="$(basename "$plan" | grep -oE 'BUG-[0-9]+')"
    [ -n "$id" ] || continue
    checked=$((checked + 1))
    recorded_here "$id" "$state" || orphans="$orphans $state/$(basename "$plan")"
  done
done

if [ "$checked" -lt 1 ]; then
  pass "#3 no per-item artefacts to check (vacuously satisfied)"
elif [ -n "$orphans" ]; then
  fail "#3 artefacts are stranded away from their row — the folder did not travel with the work:$orphans"
else
  pass "#3 all $checked per-item artefact(s) sit with their row"
fi

# ===========================================================================
# 4. No lifecycle table carries an all-empty placeholder row.
#
#    `| | | | |` was shipped as a "stub" in backlog/BACKLOG.md and
#    backlog/BUGS.md. It renders as a REAL row, so each file claimed one parked
#    item that did not exist. A header with nothing under it already says
#    "none"; a placeholder row says something false.
#
#    Small, but it is the session's whole theme: a record that states something
#    untrue costs more than an absent one, because it is believed.
# ===========================================================================
phantom=""
for f in $(find "$DOCS" -name 'BUGS.md' -o -name 'BACKLOG.md' -o -name 'CHANGES.md' | sort); do
  # A row of nothing but pipes and whitespace — but NOT the |---|---| separator.
  if grep -qE '^\|([[:space:]]*\|)+[[:space:]]*$' "$f"; then
    phantom="$phantom ${f#"$ROOT/"}"
  fi
done
if [ -n "$phantom" ]; then
  fail "#4 empty placeholder row(s) — the table claims an item that does not exist:$phantom"
else
  pass "#4 no lifecycle table carries a phantom placeholder row"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the acceptance index and the waiting rows agree on membership."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
