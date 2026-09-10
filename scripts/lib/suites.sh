#!/bin/sh
# scripts/lib/suites.sh — the ONE parse of tests/SUITES.md.
#
# WHY THIS FILE EXISTS, and it is a correction rather than a design.
#
# scripts/run-ts-suites.sh grew its own copy of the manifest table parse, under
# a comment reading "two parsers of one table drift, and this file exists to be
# the thing that cannot". Vitali (QA-1) pointed out the obvious: the awk was a
# verbatim copy of tests/manifest's, so the file WAS the second parser, and the
# comment asserting otherwise was the overclaim this repo keeps catching in its
# own controls.
#
# It was already drifting. tests/manifest's copy emits six fields and gates the
# parallelism class on the last two; the bridge's took field 2 only and would
# happily accept a legacy four-column row that the manifest rejects. Nothing
# broke today, which is precisely how these last long enough to matter.
#
# The shape the repo already chose for this is scripts/lib/commit-subject.sh and
# scripts/lib/roster.sh: one definition, every caller sources it. A-09 is the
# same lesson at runtime — the feed and the dispatchers agreeing "only by
# coincidence" is what produced cross-project contamination.
#
# POSIX sh, no Node, no jq. tests/manifest asserts it invokes no toolchain (#9),
# and a shared parser that pulled one in would break that property for every
# caller at once rather than one.
#
# ---------------------------------------------------------------------------
# MARKER-BOUNDED, NEVER SHAPE-BOUNDED.
#
# The first version of this file decided what a row was by counting its fields:
# six or more meant a suite, and the retirement table fell out only because it
# happens to have three. That is shape-based parsing, and the manifest had
# already named the hazard in the abstract — "a way to exempt a suite from #4 by
# writing a row that happens to look right" — before this file did it concretely.
# It is not hypothetical: add a fourth column to the retirement table (a
# "verified by", say) and every row in it silently becomes a SUITE, with an
# empty tier and an empty parallelism class.
#
# So each table is delimited, and a row outside every marked region belongs to
# nothing:
#
#     SUITES:BEGIN … SUITES:END                    the classified suites
#     RETIRED-SHELL-RUNNERS:BEGIN … :END           the retirement declarations
#
# Both appear twice in the file — once inside the blueprint-managed region, once
# in the project's own section after it — and both are parsed identically, so a
# project row is enforced exactly as hard as a blueprint one.
#
# TWO TRAPS, both of which this repo has already walked into once:
#
#   - The marker names must stay distinct AS SUBSTRINGS. `RUNNERS:BEGIN` is not
#     `SUITES:BEGIN`, and that is load-bearing rather than lucky. Renaming
#     either one to overlap would silently merge the two tables.
#   - PROSE MUST NEVER CONTAIN A MARKER TOKEN. A sentence explaining "put your
#     rows after BLUEPRINT:END" is counted by `marker_aware_merge` in
#     scripts/blueprint, which requires the BEGIN and END counts to match and
#     falls back to a whole-file copy when they do not. tests/SUITES.md had a
#     BEGIN/END count of 1/3 for exactly that reason, so its marker merge had
#     NEVER run and every derived project's own suite table was being replaced
#     on every pull — the thing the markers exist to prevent, defeated by a
#     sentence describing them. tests/manifest #7b now asserts the balance.

# bp_suite_rows ROOT — every classified row inside a SUITES region, as:
#     suite<TAB>tier<TAB>risk<TAB>rationale<TAB>parallelism<TAB>why
#
# Padding-tolerant: a markdown formatter's spaces must not change what a control
# sees (BUG-010's lesson). Only rows whose suite cell is in backticks count, so
# header separators are ignored.
#
# The two trailing fields are emitted even when a row does not carry them, so a
# row still in the old four-column shape arrives with an EMPTY class rather than
# being skipped. A parser that silently ignores rows it does not recognise is
# how a schema change becomes an exemption nobody voted for.
bp_suite_rows() {
  awk -F'|' '
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    /SUITES:BEGIN/ { inblock=1; next }
    /SUITES:END/   { inblock=0; next }
    !inblock { next }
    /^[[:space:]]*\|/ {
      n=split($0,f,"|"); if (n<6) next
      s=trim(f[2]); t=trim(f[3]); r=trim(f[4]); w=trim(f[5])
      p=(n>=7 ? trim(f[6]) : ""); q=(n>=8 ? trim(f[7]) : "")
      if (s !~ /^`.*`$/) next
      gsub(/`/,"",s)
      print s "\t" t "\t" r "\t" w "\t" p "\t" q
    }
  ' "${1:-.}/tests/SUITES.md" 2>/dev/null
}

# bp_suite_names ROOT — just the suite names, one per line.
bp_suite_names() {
  bp_suite_rows "${1:-.}" | cut -f1
}

# bp_retired_rows ROOT — the retirement declarations, as:
#     suite<TAB>the mutant<TAB>the case it turned red
#
# A migrated suite keeps its *.sh on disk until the migration is finished, but
# the gate stops RUNNING it once the spec is equivalence-proven. That decision
# has to be declared, because "we deliberately stopped invoking this" and "this
# fell out of the gate and nobody noticed" are otherwise the same observation —
# which is BUG-005. tests/manifest #4 accepts a non-invoked shell runner only
# for a suite named here, and #4b judges whether the declaration holds up.
bp_retired_rows() {
  awk -F'|' '
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    /RETIRED-SHELL-RUNNERS:BEGIN/ { inblock=1; next }
    /RETIRED-SHELL-RUNNERS:END/   { inblock=0; next }
    !inblock { next }
    /^[[:space:]]*\|/ {
      n=split($0,f,"|"); if (n<4) next
      s=trim(f[2]); m=trim(f[3]); c=trim(f[4])
      if (s !~ /^`.*`$/) next
      gsub(/`/,"",s)
      print s "\t" m "\t" c
    }
  ' "${1:-.}/tests/SUITES.md" 2>/dev/null
}

# bp_marker_balance FILE PREFIX — prints "<begins> <ends>" for one marker
# vocabulary. The precondition marker_aware_merge (scripts/blueprint) requires
# before it will merge rather than clobber: unequal counts make it return 1, and
# pull falls back to a whole-file copy that destroys the project's own content
# outside the markers. Exposed here because the counting rule belongs beside the
# markers it counts, and because a prose mention of a marker is invisible until
# something counts it.
bp_marker_balance() {
  _bmb_b=$(grep -c "${2}:BEGIN" "$1" 2>/dev/null || true)
  _bmb_e=$(grep -c "${2}:END" "$1" 2>/dev/null || true)
  printf '%s %s\n' "${_bmb_b:-0}" "${_bmb_e:-0}"
}

# bp_suites_with_spec ROOT — the classified suites that own a *.spec.ts.
#
# This is what the vitest bridge declares to the pipeline, and it is read from
# the MANIFEST rather than from vitest's own output on purpose. If the expected
# set came from the runner, every guard built on it would reduce to trusting the
# runner, and a suite dropped from the include glob would vanish with the gate
# still green — BUG-005, through the door tests/manifest just closed.
bp_suites_with_spec() {
  _bps_root="${1:-.}"
  bp_suite_names "$_bps_root" | while IFS= read -r _s; do
    [ -n "$_s" ] || continue
    [ -n "$(find "$_bps_root/tests/$_s" -maxdepth 1 -type f -name '*.spec.ts' -print -quit 2>/dev/null)" ] \
      && printf '%s\n' "$_s"
  done
  # The loop's status is the last `[ -n … ]`, so a final suite without a spec
  # made this return 1 with a perfectly good list on stdout. Harmless to the one
  # caller that reads it through `$( )` — and exactly the trap BUG-048 is about,
  # where a status nobody looked at turned out to be the whole assertion.
  return 0
}
