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
# caller at once.

# bp_suite_rows ROOT — every classified row as:
#     suite<TAB>tier<TAB>risk<TAB>rationale<TAB>parallelism<TAB>why
#
# Padding-tolerant: a markdown formatter's spaces must not change what a control
# sees (BUG-010's lesson). Only rows whose suite cell is in backticks count, so
# prose and header separators are ignored.
#
# The two trailing fields are emitted even when a row does not carry them, so a
# row still in the old four-column shape arrives with an EMPTY class rather than
# being skipped. A parser that silently ignores rows it does not recognise is
# how a schema change becomes an exemption nobody voted for.
bp_suite_rows() {
  awk -F'|' '
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
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
}
