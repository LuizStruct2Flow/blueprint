#!/bin/bash
# The DENOMINATOR, taken from the runner rather than from a grep.
#
# `grep "it("` cannot see an `it.each` table: tests/git-isolation has one over
# three anchors and tests/commit-msg-gate several, so a grep-derived inventory
# undercounts exactly the cases most likely to be missed. This asks vitest what
# it actually ran.
set -eu
# LC_ALL=C IS LOAD-BEARING. Under a UTF-8 locale, glibc collation ignores `#`
# at the primary level, so `sort -u` treated `… BUG: no number` and
# `… BUG#: no number` as ONE string and silently dropped a case from the
# inventory — 23 tests counted as 22, with `uniq -d` finding nothing because
# it compares bytes. Same class as BUG-043, and it would have hidden a case
# from the very audit that exists to find hidden cases.
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
for s in git-isolation env-namespace state-dir proc-cwd \
         commit-msg-gate commit-subjects doc-links lifecycle-docs; do
  echo "########## $s ##########"
  ( cd "$SRC/tests" && unset AGENT_PERSONA && npx vitest run "$s" --reporter=verbose ) 2>&1 \
    | sed -n 's/^[[:space:]]*[✓×][[:space:]]*//p' \
    | sed 's/[[:space:]]*[0-9]*ms$//' \
    | sed 's/.*> //' \
    | LC_ALL=C sort -u
done
