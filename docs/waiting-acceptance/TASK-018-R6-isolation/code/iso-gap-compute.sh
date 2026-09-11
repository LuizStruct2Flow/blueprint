#!/bin/bash
# THE GAP, COMPUTED — (every case the runner ran) minus (every case a recorded
# mutant was OBSERVED to turn red). Neither side is transcribed: the denominator
# comes from `vitest --reporter=verbose` on the healthy tree (so an `it.each`
# table is expanded rather than counted as one), and the numerator from the RED
# lines of the matrix.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TITLES="${1:-$HERE/../outputs/iso-titles.txt}"
MATRIX="${2:-$HERE/../outputs/iso-matrix.txt}"

python3 - "$TITLES" "$MATRIX" <<'PY'
import sys, re
titles_path, matrix_path = sys.argv[1], sys.argv[2]

suites, cur = {}, None
for line in open(titles_path):
    line = line.rstrip('\n')
    m = re.match(r'^#+ (\S+) #+$', line)
    if m:
        cur = m.group(1); suites[cur] = []
    elif line.strip() and cur:
        suites[cur].append(line.strip())

# Which mutants were observed to turn each case red, and which suite each ran on.
red = {}
mutant_suite = {}
cur_m = None
for line in open(matrix_path):
    m = re.match(r'^(\w+)\s+(\S+)\s+(PASS|FAIL)', line)
    if m:
        cur_m, s = m.group(1), m.group(2)
        mutant_suite[cur_m] = s
        continue
    m = re.match(r'^\s+RED:\s(.*)$', line.rstrip('\n'))
    if m and cur_m:
        red.setdefault((mutant_suite[cur_m], m.group(1)), []).append(cur_m)

total = covered = 0
for suite, cases in suites.items():
    gap = [c for c in cases if (suite, c) not in red]
    total += len(cases); covered += len(cases) - len(gap)
    print(f'=== {suite}: {len(cases)-len(gap)}/{len(cases)} with observed negative proof')
    for c in cases:
        marks = red.get((suite, c))
        print(f'    {"OK " if marks else "GAP"}  {",".join(marks) if marks else "-":<22} {c}')
print(f'\nTOTAL {covered}/{total} cases have an OBSERVED red')
PY
