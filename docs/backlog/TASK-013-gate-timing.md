# TASK-013 — why the pre-push gate takes 360 s

Measured 2026-08-19 on `chore/accept-027`, one full `.githooks/pre-push` run
captured stage by stage. Raised because the SLO has warned on every push since
BUG-028 landed, and a warning nobody has costed is a warning that gets ignored.

**Status: open, not started.** This is the measurement, not the fix.

## The numbers

Total **357.8 s** across **48 stages**.

| Stage | Time | Share | Cumulative |
|---|---:|---:|---:|
| `bootstrap-gate` · BUG-028 | **177.9 s** | **50.6%** | 50.6% |
| `signal-dispatch` | 32.0 s | 9.1% | 59.7% |
| `agent-activity-bound` · BUG-001 | 29.4 s | 8.4% | 68.0% |
| `baton-durability` · BUG-019 | 28.0 s | 8.0% | 76.0% |
| `watcher-liveness` · BUG-022 | 14.4 s | 4.1% | 80.1% |
| `wait-mic` · FEATURE-005 | 11.2 s | 3.2% | 83.3% |
| `env-namespace` · BUG-006 | 7.7 s | 2.2% | 85.4% |
| `pre-push-secrets` · A-03 | 6.3 s | 1.8% | 87.2% |
| `a2bp-contamination` · A-07 | 5.4 s | 1.5% | 88.8% |
| remaining 39 stages | ~40 s | 11.2% | 100% |

**The bottom 28 stages together cost 8.5 s.** There is nothing to win there, and
anyone optimising the gate should be told that before they start.

## The single fact that explains it

**`bootstrap-gate` runs a complete second gate inside the first.** Confirmed by
process inspection during the run — a live `.githooks/pre-push` against
`git@example.com:acme/derived-proj.git` while the outer gate was still going.

That is what the suite is *for*. BUG-028 existed precisely because no suite had
ever run what a new project runs, and the only way to check that is to run it.
So the cost is not a slow test; it is that the gate now contains a gate.

## The second gate re-runs the same expensive suites

`signal-dispatch`, `agent-activity-bound`, `baton-durability` and
`watcher-liveness` are all classified `both` in `tests/SUITES.md`, and
`git check-attr` confirms none is `export-ignore`d — so they **ship to derived
projects and run again inside the nested gate**. That is ~104 s of the outer run
being paid twice, which accounts for most of `bootstrap-gate`'s 178 s.

## Why the slow ones are slow

Every expensive suite outside `bootstrap-gate` is an **orchestration** suite,
and each is slow for the same structural reason: it must let real wall-clock
pass to prove something about wall-clock — a dispatch firing, a feed staying
bounded, a baton surviving a branch operation, a dead watcher being noticed, a
poll interval elapsing. You cannot assert "the feed did not fork-bomb for 2.7
days" without spending time.

These have already been optimised once. `signal-dispatch` went **125.4 s →
37.5 s** when someone asked *why* it was slow instead of *where to put it*.

## The proposal

**Make the nested gate run a declared subset.** The derived project's gate
re-proves orchestration suites that the outer gate has just proved against the
same code. What `bootstrap-gate` uniquely tests is that a bootstrapped project's
gate *works at all* — its wiring, its substitution, its stage list — not that
`baton-durability` still holds. An `AGENT_GATE_PROFILE=bootstrap` that skips
suites already run in the parent should roughly halve the total.

### The trap, stated up front

That change is one edit away from becoming a silent coverage cut — the BUG-005
doctrine, and exactly what `tests/manifest` exists to catch. **Any subset must be
declared and asserted, not achieved by omitting a `pipe_stage`.** A suite simply
left out of the gate never reaches `pipe_skip` at all, and the pipeline still
prints PASSED.

So the subset needs its own manifest assertion: *this* profile runs *these*
suites, and a suite missing from the profile is a failure rather than a silence.

### What is NOT the answer

- Touching the 28 cheap stages. They cost 8.5 s in total.
- Demoting any suite to CI-only. That is the response the old 30 s ceiling
  produced, and it is why the ceiling was removed (BUG-005): coverage decided on
  budget rather than risk, invisibly, while the gate still said "all checks
  passed".
- Raising `AGENT_GATE_SLO_TOTAL_MS` to silence the warning without changing
  anything. The warning is correct.

## Caveat on the measurement

One run, one machine, with other work in flight. The ranking is unambiguous —
50.6% against 9.1% is not measurement noise — but treat absolute seconds as
±10%. Re-measure before and after any change rather than trusting these numbers
as a baseline.
