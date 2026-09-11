#!/usr/bin/env python3
"""Compute the R6 negative-proof gap for the six a2bp suites.

  (1) every assertion id in each *.spec.ts
  (2) every assertion id an equivalence run OBSERVED to go red
  gap = (1) - (2)

Ids are read from the harness's own run output, not transcribed: a matrix a
reader has to count by hand is how the last review found a non-verdict sitting
inside a headline total.
"""
import re, sys, pathlib

R = pathlib.Path(__file__).resolve().parents[4] / 'tests'
SUITES = ['a2bp-build', 'a2bp-contamination', 'a2bp-e2e', 'a2bp-inputs',
          'a2bp-pr-filing', 'a2bp-request']
IT = re.compile(r"\bit(?:\.\w+)?\(\s*(['\"`])(.*?)\1", re.S)


def norm(tok: str) -> str:
    """`#22[a&b]` and `#22[${meta}]` are one templated assertion."""
    return re.sub(r'\[.*\]$', '[]', tok)


declared = {}
for s in SUITES:
    ids = []
    for m in IT.finditer((R / s / f'{s}.spec.ts').read_text()):
        ids.append(norm(m.group(2).strip().split()[0]))
    declared[s] = sorted(set(ids))

# --- observed reds, from the run logs --------------------------------------
red_by_mut = {}          # mutant -> set of "suite:id"
cur = None
for path in sys.argv[1:]:
    for line in pathlib.Path(path).read_text().splitlines():
        m = re.match(r'^(\S+)\s+shell=(PASS|FAIL) \[(.*)\]$', line)
        if m:
            cur = m.group(1)
            red_by_mut.setdefault(cur, {})['shell'] = {
                norm(t) for t in m.group(3).split() if t}
            continue
        m = re.match(r'^\s+ts=(PASS|FAIL) \[(.*)\]$', line)
        if m and cur:
            red_by_mut[cur]['ts'] = {norm(t) for t in m.group(2).split() if t}

observed_ts = set()
for mut, d in red_by_mut.items():
    observed_ts |= d.get('ts', set())

print(f'mutants with a verdict: {len(red_by_mut)}')
print()
total_declared = total_covered = 0
for s in SUITES:
    covered = [i for i in declared[s] if f'{s}:{i}' in observed_ts]
    gap = [i for i in declared[s] if f'{s}:{i}' not in observed_ts]
    total_declared += len(declared[s])
    total_covered += len(covered)
    print(f'=== {s}: {len(declared[s])} assertions, {len(covered)} with negative proof, {len(gap)} in the GAP')
    if gap:
        print('    GAP: ' + ' '.join(gap))
print()
print(f'TOTAL {total_covered}/{total_declared} assertions have an observed red mutant')
print()

# Disagreements are the other half of the run's value.
print('--- shell/ts disagreements (port-stricter or port-weaker) ---')
any_dis = False
for mut in sorted(red_by_mut):
    sh = red_by_mut[mut].get('shell', set())
    ts = red_by_mut[mut].get('ts', set())
    if sh != ts:
        any_dis = True
        print(f'  {mut}: shell-only={sorted(sh - ts)} ts-only={sorted(ts - sh)}')
if not any_dis:
    print('  none')

print()
print('--- per-mutant observed TS red sets ---')
for mut in sorted(red_by_mut, key=lambda m: (m[0], int(re.sub(r'\D', '', m) or 0))):
    ts = sorted(red_by_mut[mut].get('ts', set()))
    print(f'  {mut}: {" ".join(ts) if ts else "(none)"}')
