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

# ===========================================================================
# 6. NO BUG NUMBER IS CARRIED BY MORE THAN ONE ROW. (BUG-071)
#
#    A number is allocated by reading "the highest in use" out of a BUGS.md.
#    That is racy until committed, and with concurrent agents it collides —
#    three times in two days. BUG-057 went to two defects in parallel; BUG-066
#    and BUG-067 were re-issued by a second session working from a copy of the
#    table that predated the first session's push; and BUG-052 and BUG-053 each
#    carried TWO rows on `main`, unnoticed, for a day.
#
#    It is not cosmetic. The commit convention and DoD §2's regression-test
#    check both key off the number, so a duplicate makes §2 satisfiable by the
#    WRONG test: a bug with no test passes because its twin has one.
#
#    BUG-062's row already documents the mechanism in its own text — "the next
#    number is not a per-file maximum, it is the maximum across
#    docs/{doing,backlog,waiting-acceptance,done}/BUGS.md, and it is racy until
#    it is committed". It had been written down for a day and had stopped
#    nothing, which is the point: a rule that must be remembered at the moment
#    the author is busy is the wrong shape of fix (BUG-004, BUG-014, the
#    no-chain hook).
#
#    THERE IS NO LEGITIMATE MID-PROMOTION DUPLICATE. Promotion is a MOVE of the
#    row — `doing/` → `waiting-acceptance/` → `done/` — so a number in two
#    lifecycle states is a half-completed move or a collision, and both want
#    fixing. Nor is this only a CROSS-file check: both BUG-052 rows and both
#    BUG-053 rows sat in `doing/BUGS.md` together, so a same-file duplicate is
#    the case that actually happened and is caught here too.
# ===========================================================================

# A ROW, not a mention. These files quote other numbers constantly in prose —
# BUG-062's row alone names half a dozen — so only a line that OPENS a table
# row for that number counts. Anything looser is unusable noise.
row_ids_in() { # $1 = file, $2 = label  ->  "BUG-XXX label:line" per row
  grep -nE '^\|[[:space:]]*\*\*BUG-[0-9]+\*\*' "$1" \
    | sed -E "s#^([0-9]+):\|[[:space:]]*\*\*(BUG-[0-9]+)\*\*.*#\2 $2:\1#"
}

# THE DETECTOR PROVES IT CAN FIRE BEFORE ITS SILENCE IS BELIEVED.
# A row extractor is a parser, and a parser whose subject changes form goes
# quiet rather than red — BUG-063's class, and the sixth instance of "a check
# inferring a property from a proxy satisfiable without it" that F-002 counted.
# This fixture asserts BOTH halves of the contract on every run: the duplicate
# IS seen, and the two prose mentions on a non-row line are NOT.
_sc="$(mktemp)"
printf '| **BUG-900** | first |\n| **BUG-901** | other |\nprose naming BUG-900 and BUG-900 again\n| **BUG-900** | second |\n' > "$_sc"
_sc_got="$(row_ids_in "$_sc" self | awk '{print $1}' | sort | uniq -d | tr '\n' ' ')"
rm -f "$_sc"

if [ "$_sc_got" != "BUG-900 " ]; then
  fail "#6 the duplicate detector cannot see its own fixture (got '$_sc_got', want 'BUG-900 ') — its silence over the real files proves nothing"
else
  # ABSENT is legitimate; UNREADABLE is not. A freshly bootstrapped project is
  # seeded with `backlog/BUGS.md` alone (new-project.sh), so demanding all four
  # would fail every derived project on its first push — BUG-028's class. But a
  # file that EXISTS and cannot be read is this check failing, and it fails
  # closed rather than scanning what it could reach and printing ok.
  _rows=""
  _unreadable=""
  _scanned=0
  for state in backlog doing waiting-acceptance done; do
    f="$DOCS/$state/BUGS.md"
    [ -e "$f" ] || continue
    if [ ! -r "$f" ]; then
      _unreadable="$_unreadable docs/$state/BUGS.md"
      continue
    fi
    _scanned=$((_scanned + 1))
    _rows="$_rows
$(row_ids_in "$f" "docs/$state/BUGS.md")"
  done

  if [ -n "$_unreadable" ]; then
    fail "#6 could not read a lifecycle bug table, so a duplicate there would be invisible:$_unreadable"
  fi

  _dups="$(printf '%s\n' "$_rows" | grep -E '^BUG-' | awk '{print $1}' | sort | uniq -d)"
  if [ -n "$_dups" ]; then
    for id in $_dups; do
      # Name BOTH locations — file and line — so the reader can act without
      # grepping four files for a number that is by definition ambiguous.
      where="$(printf '%s\n' "$_rows" | awk -v i="$id" '$1 == i { printf " %s", $2 }')"
      fail "#6 $id is the number of $(printf '%s\n' "$_rows" | grep -c "^$id ") different rows —$where"
    done
  elif [ -z "$_unreadable" ]; then
    _n="$(printf '%s\n' "$_rows" | grep -cE '^BUG-')"
    pass "#6 all $_n bug row(s) across $_scanned lifecycle table(s) carry distinct numbers"
  fi
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the lifecycle documents agree with the folders."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
