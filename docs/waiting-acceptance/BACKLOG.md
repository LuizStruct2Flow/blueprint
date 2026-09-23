# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-070** | **TASK-062-03: every backlog row carries a KEEP, DEFER or OBSOLETE marker, and every row that is not OBSOLETE carries a re-open trigger.** Audit rows C037, C041, D005 and D021 (C038 stays open: it is about deletion and cancellation traceability, a different rule). `tests/lifecycle-docs` gains `backlogMarkerViolations`, which parses `docs/backlog/BACKLOG.md` (escaped `\|` handled; `doing/` rows are active work and out of scope) and refuses a missing or invalid marker, or an empty trigger on a KEEP or DEFER row. A-40 became OBSOLETE and TASK-032 became DEFER, both from their rows' own text. The five duplicate prose citations collapsed into one DoD line with its `enforced by` pointer. Authored and committed by Andreas (Codex). The Orchestrator's review found round 1 deleted prose covering KEEP rows that the check did not enforce; round 2 (`d74da3d`) closed it. **LANDED**, CI green on `d74da3d` (2026-09-22). | S2 | **What to test:** empty the Category cell of any `docs/backlog/BACKLOG.md` row, or the trigger cell of a KEEP row, then run `tests/node_modules/.bin/vitest run --root tests lifecycle-docs`. It fails, naming the line. | **Re-open if** an unmarked or triggerless non-OBSOLETE row lands. |
| **TASK-068** | **TASK-062-01: a bare `ctx.skip(` in a test can never land.** Audit row N025, the first TASK-062 sub-task. `tests/manifest` gains `bareSkips`, which walks the parsed TypeScript tree (a mention in a comment or a string does not trip it), and a `#live` case that derives every runner through `scripts/lib/suites.sh`, as the gate does, and refuses any zero-argument `.skip(`. The one live violation (`dod-gate.spec.ts:1291`) now skips with a stated reason via `skipVisibly`. DoD §3 rule 7 carries its `enforced by` pointer, and audit row N025 moved MECHANISE to ALREADY-OK in the same commit. Authored and committed by Vijay (Kimi). Reviewed by the Orchestrator (Claude), who put the bare skip back and saw the check fail on exactly that line. Two notes not taken (no practical trigger): an empty reason `ctx.skip('')` passes, and helper files are not scanned. **LANDED**, CI green on `abf6d9c` (2026-09-22). | S3 | **What to test:** put `ctx.skip()` (no argument) in any `tests/**/*.spec.ts` and run `tests/node_modules/.bin/vitest run --root tests manifest -t 'bare skip'`. It fails, naming the file and line. `ctx.skip('why')` and `skipVisibly(ctx, 'why')` pass. | **Re-open if** a bare `ctx.skip(` lands. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.
