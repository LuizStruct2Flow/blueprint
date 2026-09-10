# findings.md — cross-provider review findings tracked over time

Findings raised by a review (Codex, Gemini, a scanner, a human) that do **not**
get a row in `BUGS.md` — either because they were investigated and did not hold,
or because they are accepted risk with a documented re-open trigger.

**A finding that is silently dropped looks identical to one that got missed**,
and the next review raises it again. Every finding leaves a row here — most of
all the ones that turned out to be wrong.

---

## F-001 — `run-ts-suites.sh`'s failure report aborts the gate

**Raised by** Codex, 2026-09-10, against `scripts/run-ts-suites.sh:165,173`.
Two mechanisms: a zero-match `grep` returns 1, and >40 matching lines may
SIGPIPE `grep` to 141. Under the hook's `set -e` plus `pipefail`, either kills
the function before the per-suite reports and `pipe_batch_end`, truncating the
outer gate and its summary.

**Verdict: DOES NOT HOLD.** The abort requires `pipefail`, which is set nowhere
on the path. Investigated by Vitali (QA-1) on `task-018-ts-test-harness`.

**Evidence.** Every shell option on the whole sourced chain:

    $ grep -n '^[[:space:]]*set -\|pipefail' \
        scripts/lib/suites.sh scripts/lib/pipeline.sh \
        .githooks/pre-push .githooks/pre-push-project scripts/run-ts-suites.sh
    .githooks/pre-push:26:set -e
    scripts/lib/pipeline.sh:446:  set -f      # restored at :449
    scripts/lib/pipeline.sh:448:  set --      # positional args, not an option

`/bin/sh` is dash. `.githooks/pre-push` sources `pre-push-project` into the same
shell and calls `ts_suites_stage` at `:886`, which sits inside the
`BLUEPRINT:BEGIN`/`:END` region (lines 2-890) — so a derived project's own
`set -o pipefail`, which can only go *below* the end marker, runs after the
bridge has already finished. Without `pipefail` the pipeline reports `head`'s
status, which is 0.

**Measured through the real bridge**, stubbed `npx` exiting 1:

| npx output | gate output | per-suite stage | summary |
|---|---|---|---|
| 0 matching lines | 23 lines | rendered | rendered |
| 500 matching lines | 63 lines | rendered | rendered |

**Counterfactual, same fixture with `pipefail` added:** 0 matches collapses to a
single line with no stages and no summary — mechanism #1 is real *given* the
precondition. 500 matches still renders, because they fit the 64 KB pipe buffer.
Reaching 141 needed ~1.6 MB of matching output, so mechanism #2 needs `pipefail`
*and* a very large match volume.

Repro: `.scratch/bug-grep/real.sh`, run with and without `PIPEFAIL=1`.

**Hardened anyway** (TASK-018, deliberately not a bug row): a `|| true` on that
pipeline. The argument is ownership, not defect — `run-ts-suites.sh` is a
sourced library and does not own its caller's shell options, and this file has
twice been burned by reasoning about what its caller does rather than what it
could do. No regression test: a case asserting the absence of `pipefail` in a
managed file that nobody proposes to change can never go red, which is the shape
TASK-018-RULES R7 forbids.

**Re-open if** a caller of `ts_suites_stage` is added outside the managed region
of `.githooks/pre-push-project`, or if any gate file on that chain adopts
`pipefail`.
