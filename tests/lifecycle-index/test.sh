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
    echo "PASS: nothing waiting; index and rows trivially agree."
    exit 0
  fi
  fail "#0 no item rows AND no table header in BUGS.md — the format changed, so every check below would be vacuous"
  echo "FAILED: see the FAIL lines above."
  exit 1
fi
pass "#0 parsed $n_rows waiting item(s) — the comparison is not vacuous"

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

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the acceptance index and the waiting rows agree on membership."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
