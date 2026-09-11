#!/usr/bin/env python3
"""Which assertions has NO mutant ever turned red?

`run.py` proves the two implementations AGREE on a defect. It says nothing about
whether every assertion has a defect at all, and three independent Codex reviews
of the other TASK-018 groups refused certification for exactly that: the recorded
mutant set was assertion-GROUP coverage, not assertion coverage. A case with no
mutant is a case whose ability to fail is asserted by construction — which is the
claim `tests/a2bp-contamination` made for months while its headline assertion was
dead.

So: every `it()` id in the five specs, minus every id ever OBSERVED red in a
recorded run. What is left has no negative proof, and is either a missing mutant
or a finding about the fixture.

    python3 docs/waiting-acceptance/TASK-018-EQUIVALENCE-mic/code/gap.py

Exit 0 when the gap is empty, 1 otherwise, so it can be a gate rather than a
report if the group ever needs one.

THE RECORDS ARE IN TWO SHAPES, and that is not tidy but it is the truth: run.py
overwrites one JSON per invocation, so `results-last-run.json` holds only the
suite that ran last. The other four survive as the per-suite `outputs/*.log` the
driver's own stdout was teed into. Both are parsed. (`--out NAME` now exists so a
later pass does not have this problem again.)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAT = HERE.parent
REPO = HERE.parents[3]
OUTPUTS = CAT / "outputs"

SUITES = ["signal-set", "wait-mic", "session-resume", "signal-dispatch", "baton-durability"]

# Same map run.py uses: a title that names the review finding rather than a number.
ALIASES: dict[str, dict[str, str]] = {
    "signal-set": {"BUG-023": "#6"},
    "session-resume": {"Codex R6-1": "#12", "Codex R8": "#13"},
}

LOG_ROW = re.compile(r"^\s*(\S+)\s+(\S+)\s+(\S+)\s+shell=(\S+)\s+port=(\S+)")


def observed() -> dict[str, set[str]]:
    """Every assertion id any recorded run saw go red, in either implementation."""
    seen: dict[str, set[str]] = {s: set() for s in SUITES}

    for path in sorted(OUTPUTS.glob("*.json")):
        for row in json.loads(path.read_text()):
            if row.get("suite") in seen:
                seen[row["suite"]] |= set(row.get("shell", [])) | set(row.get("port", []))

    for path in sorted(OUTPUTS.glob("*.log")):
        for line in path.read_text().splitlines():
            m = LOG_ROW.match(line)
            if not m or m.group(2) not in seen:
                continue
            for field in (m.group(4), m.group(5)):
                if field != "-":
                    seen[m.group(2)] |= set(field.split(","))

    return seen


def assertions(suite: str) -> list[tuple[str, str]]:
    """(id, title) for every `it()` in the suite's spec, in file order."""
    spec = (REPO / "tests" / suite / f"{suite}.spec.ts").read_text()
    out = []
    for m in re.finditer(r"^\s*it\(\s*(['\"])(.*?)\1", spec, re.M | re.S):
        title = m.group(2)
        numbered = re.match(r"(#[0-9a-z]+)", title)
        if numbered:
            ident = numbered.group(1)
        else:
            ident = next(
                (v for k, v in ALIASES.get(suite, {}).items() if title.startswith(k)),
                f"#UNMAPPED({title[:40]})",
            )
        out.append((ident, title))
    return out


def main() -> int:
    seen = observed()
    total = 0
    for suite in SUITES:
        cases = assertions(suite)
        gap = [(i, t) for i, t in cases if i not in seen[suite]]
        total += len(gap)
        print(f"{suite:18} {len(cases) - len(gap):2}/{len(cases):2} with negative proof", end="")
        print("" if not gap else f"   GAP: {', '.join(i for i, _ in gap)}")
        for ident, title in gap:
            print(f"    {ident:6} {title[:104]}")
    print(f"\n{total} assertion(s) with no mutant that turns them red")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
