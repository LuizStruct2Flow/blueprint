#!/bin/bash
# tests/lifecycle-docs/test.sh
#
# The lifecycle documents must say something true.
#
# WHY THIS EXISTS, and why it is SMALLER than it was. This suite began as a
# check that `waiting-acceptance/INDEX.md` and `BUGS.md` agreed on which items
# were waiting — INDEX had drifted to 5 rows against 14 real ones, so nine fixes
# were invisible to the only person who can accept them.
#
# That guard was the wrong repair. Two records of one fact drift BY
# CONSTRUCTION, and a test only reports it afterwards. The founder asked the
# question the guard had talked me out of — "why is there an INDEX.md at all?" —
# and the answer was that there should not be. The lifecycle has exactly two
# record files, `BACKLOG.md` and `BUGS.md`, travelling `backlog/` → `doing/` →
# `waiting-acceptance/` → `done/`. "What to test" is now a column in the row.
#
# One record cannot disagree with itself, so those cases are gone. What remains
# guards things a single record still cannot enforce about itself:
#
#   #3  an item's ARTEFACTS sit in the same folder as its row
#   #4  no table carries an all-empty placeholder row
#
# Run from the blueprint repo root:  bash tests/lifecycle-docs/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

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


# ===========================================================================
# 5. AN EMPTY TABLE MUST NOT SAY WHERE THE ITEMS WENT.
#
#    "*(Empty — BUG-023 landed in #32 and is in ../waiting-acceptance/)*" is a
#    forwarding note, and a forwarding note is the duplicate record TASK-005
#    removed, one size smaller. It goes stale the moment the item moves again —
#    both `doing/` notes were pointing at `waiting-acceptance/` while the items
#    sat in `done/`, and one of them was three lines above the sentence "Do not
#    narrate status here".
#
#    Where an item is, is answered by which folder holds its row. Say `*(Empty.)*`
#    and stop. Found by the founder reading the files, which is the check this
#    replaces.
# ===========================================================================
forwarding=""
for f in $(find "$DOCS" -name 'BUGS.md' -o -name 'BACKLOG.md' -o -name 'CHANGES.md' | sort); do
  if grep -E '^\*\(Empty' "$f" | grep -qE '(BUG|FEATURE|TASK|SPIKE|SLICE)-[0-9]+'; then
    forwarding="$forwarding ${f#"$ROOT/"}"
  fi
done
if [ -n "$forwarding" ]; then
  fail "#5 an empty table names where its items went — a forwarding note that drifts:$forwarding"
else
  pass "#5 no empty table forwards to where its items went"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the lifecycle documents agree with the folders."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
