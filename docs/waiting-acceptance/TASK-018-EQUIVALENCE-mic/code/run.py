#!/usr/bin/env python3
"""Prove each port faithful by RUNNING both implementations over the same inputs.

For every (suite, mutant) pair: materialise a mutant root holding both the
retiring `tests/<suite>/test.sh` and the new `<suite>.spec.ts`, inject one
defect, run both, and compare which CHECKS went red.

Four verdicts per pair, and each means something different:

  agree            both implementations reached the same red set — faithful.
  shell-only-red   the port is LOOSER than the shell suite. A regression.
  port-only-red    the port is STRICTER. Justified by naming the defect it
                   catches, or it is a false positive.
  both-green       neither covers the injected defect. A real finding, and the
                   class mutation testing structurally cannot find by itself —
                   it only shows up when the defect is injected deliberately.

Usage: python3 docs/waiting-acceptance/TASK-018-EQUIVALENCE-mic/code/run.py [--out NAME] [target ...]

A target is a whole suite (`wait-mic`) or one tree of it (`wait-mic:w8-…`), so a
later pass can re-run the mutants it added without paying for the ones already
recorded. `--out NAME` writes `outputs/NAME.json` instead of overwriting
`results-last-run.json` — which is what that file's name says it is, and why the
five suites' records live in the per-suite `outputs/*.log` rather than in it.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]

CONTROLS = ["c0-healthy", "c1-defect-in-a-comment", "c2-benign-lookalike"]

MUTANTS: dict[str, list[str]] = {
    "signal-set": [
        "m1-refuse-pipes",
        "m2-escape-processing-over-the-value",
        "m3-normalise-only-one-input-path",
        "m3c-collapse-repeated-spaces",
        "m3e-no-boundary-trim",
        "m3d-mangle-tabs",
        "m3h-exceed-the-documented-contract",
        "m4-rewrite-the-whole-file",
        "m5-publish-without-a-task",
        "m6-swallow-the-failed-journal-append",
    ],
    "wait-mic": [
        "w1-compare-rendered-rows",
        "w2-an-empty-reading-is-a-handoff",
        "w3-wake-on-the-task-too",
        "w4-accept-a-partial-reading",
        "w5-reject-a-rejoinable-pipe",
        "w6-whitelist-the-state",
        "w7-never-exit",
        "w8-fire-without-a-change",
        "w9-key-on-the-directory",
        "w10-task-is-part-of-the-mic",
    ],
    "session-resume": [
        "s1-cry-wolf-on-a-healthy-resume",
        "s2-warn-and-exit-zero",
        "s3-take-the-first-marker",
        "s4-order-by-timestamp",
        "s5-a-missing-marker-is-silent",
        "s6-rollback-discards",
        "s7-report-nothing",
        "s9-mark-does-not-stamp-the-handover",
        "s12-stamp-before-the-read-back",
        "s13-roll-the-window-in-two-appends",
        "s14-snapshot-the-lifecycle-at-mark",
        "s15-leave-a-breadcrumb",
    ],
    "signal-dispatch": [
        "d1-no-settle-window",
        "d2-task-text-is-a-round-identity",
        "d3-the-settle-window-never-expires",
    ],
    "baton-durability": [
        "b1-watch-the-tracked-file",
        "b2-journal-derived-from-the-root",
        "b3-seed-written-to-the-canonical-path",
        "b4-resolve-the-baton-once-at-startup",
        "b5-re-resolve-past-an-explicit-pin",
        "b6-clear-the-trigger-key-on-a-move",
        "b7-live-rows-in-the-tracked-file",
        "b8-match-the-rendered-field-name",
    ],
}

# A TS test whose title does not start with the shell suite's `#N` token. Three of
# them, each named for the review finding it came from rather than a number —
# mapped here rather than renamed, because the title is the test's only
# description of itself (R1) and a number would say less.
ALIASES: dict[str, dict[str, str]] = {
    "signal-set": {"BUG-023": "#6"},
    "session-resume": {"Codex R6-1": "#12", "Codex R8": "#13"},
}

# Environment the CHILD must not inherit: the shell suites resolve the baton from
# it, and this driver would otherwise point every mutant at the real one.
SCRUB = [
    "AGENT_SIGNAL_FILE", "AGENT_STATE_HOME", "AGENT_FEED_LOG", "AGENT_PERSONA",
    "AGENT_SIGNAL_SETTLE", "AGENT_WAIT_MIC_POLL", "AGENT_FEED_TAG",
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
]


def child_env() -> dict[str, str]:
    env = dict(os.environ)
    for k in SCRUB:
        env.pop(k, None)
    return env


def shell_red(root: Path, suite: str) -> tuple[set[str], int]:
    """Run tests/<suite>/test.sh and collect the ids it reported FAIL for."""
    proc = subprocess.run(
        ["bash", str(root / "tests" / suite / "test.sh")],
        cwd=root, capture_output=True, text=True, env=child_env(), timeout=900,
    )
    out = proc.stdout + proc.stderr
    red = set()
    for line in out.splitlines():
        m = re.match(r"\s*FAIL: (#[0-9a-z]+)", line)
        if m:
            red.add(m.group(1))
        elif line.strip().startswith("FAIL:"):
            # A precondition failure with no case id (a missing script, a
            # non-executable subject). Distinct, because it is not a case verdict.
            red.add("#precondition")
    return red, proc.returncode


def port_red(root: Path, suite: str) -> tuple[set[str], int, str]:
    """Run <suite>.spec.ts and collect the ids of the cases that failed."""
    report = root / "vitest.json"
    # The PINNED vitest, invoked directly, with --root naming the mutant's tests/
    # explicitly. `npx vitest` resolved the same binary here only because cwd
    # happened to be tests/ — and when that resolution misses, npx FETCHES an
    # unpinned vitest, which runs no files and exits 0. A silent no-op that reads
    # as a green port is the one failure this whole exercise cannot survive.
    proc = subprocess.run(
        [str(root / "tests/node_modules/.bin/vitest"), "run", suite,
         "--root", str(root / "tests"), "--reporter=json",
         f"--outputFile={report}"],
        cwd=root / "tests", capture_output=True, text=True,
        env=child_env(), timeout=1800,
    )
    red: set[str] = set()
    if not report.exists():
        return {"#no-report"}, proc.returncode, proc.stdout + proc.stderr

    data = json.loads(report.read_text())
    # A run that executed NOTHING is green, and green is the verdict that ends
    # this exercise. Say so instead.
    if not data.get("testResults"):
        return {"#no-tests-ran"}, proc.returncode, proc.stdout + proc.stderr
    for suite_result in data.get("testResults", []):
        for case in suite_result.get("assertionResults", []):
            if case.get("status") != "failed":
                continue
            title = case.get("title", "")
            m = re.match(r"(#[0-9a-z]+)", title)
            if m:
                red.add(m.group(1))
                continue
            for prefix, ident in ALIASES.get(suite, {}).items():
                if title.startswith(prefix):
                    red.add(ident)
                    break
            else:
                red.add(f"#unmapped({title[:40]})")
    return red, proc.returncode, proc.stdout + proc.stderr


def run_pair(suite: str, mutant: str) -> dict:
    root = Path(tempfile.mkdtemp(prefix=f"equiv-{suite}-"))
    try:
        subprocess.run(["bash", str(HERE / "build.sh"), str(root), suite], check=True)
        if mutant != "c0-healthy":
            applied = subprocess.run(
                ["bash", str(HERE / "mut.sh"), str(root), suite, mutant],
                capture_output=True, text=True,
            )
            if applied.returncode != 0:
                return {"suite": suite, "mutant": mutant, "error": applied.stderr.strip()}

        t0 = time.time()
        sh_red, sh_rc = shell_red(root, suite)
        t_sh = time.time() - t0
        t0 = time.time()
        ts_red, ts_rc, ts_out = port_red(root, suite)
        t_ts = time.time() - t0

        is_control = mutant.startswith("c")
        if sh_red == ts_red:
            # A control is EXPECTED green: it is what proves the comparison is not
            # red for an unrelated reason. Only an injected defect that reddens
            # NOTHING is a finding.
            verdict = "agree" if (sh_red or is_control) else "BOTH-GREEN"
            if is_control and sh_red:
                verdict = "CONTROL-RED"
        elif ts_red < sh_red:
            verdict = "SHELL-ONLY-RED"
        elif sh_red < ts_red:
            verdict = "PORT-ONLY-RED"
        else:
            verdict = "DISJOINT"

        return {
            "suite": suite, "mutant": mutant, "verdict": verdict,
            "shell": sorted(sh_red), "port": sorted(ts_red),
            "shell_rc": sh_rc, "port_rc": ts_rc,
            "t_shell": round(t_sh, 1), "t_port": round(t_ts, 1),
            "port_out": ts_out if verdict != "agree" else "",
        }
    finally:
        shutil.rmtree(root, ignore_errors=True)


def targets(argv: list[str]) -> tuple[str, list[tuple[str, str]]]:
    """`--out NAME`, then `suite` or `suite:mutant` targets -> (name, pairs)."""
    out, args = "results-last-run", list(argv)
    if args[:1] == ["--out"]:
        out, args = args[1], args[2:]
    pairs = []
    for arg in args or list(MUTANTS):
        suite, _, one = arg.partition(":")
        pairs += [(suite, one)] if one else [(suite, m) for m in CONTROLS + MUTANTS[suite]]
    return out, pairs


def main() -> int:
    out_name, pairs = targets(sys.argv[1:])
    rows = []
    for suite, mutant in pairs:
        row = run_pair(suite, mutant)
        rows.append(row)
        if "error" in row:
            print(f"  !! {suite:18} {mutant:42} MUTANT FAILED TO APPLY: {row['error']}", flush=True)
            continue
        print(
            f"  {row['verdict']:15} {suite:18} {mutant:42} "
            f"shell={','.join(row['shell']) or '-':28} port={','.join(row['port']) or '-':28} "
            f"({row['t_shell']}s / {row['t_port']}s)",
            flush=True,
        )
    out = HERE.parent / "outputs"
    out.mkdir(exist_ok=True)
    (out / f"{out_name}.json").write_text(json.dumps(rows, indent=2))

    bad = [r for r in rows if r.get("verdict") not in ("agree",) or "error" in r]
    print(f"\n{len(rows)} tree(s); {len(rows) - len(bad)} agree, {len(bad)} to explain")
    return 0


if __name__ == "__main__":
    sys.exit(main())
