# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

## Two namespaces, and only one of them is a work item

**`BUG-XXX` / `FEATURE-XXX` / `TASK-XXX` are the lifecycle IDs.** They are what the
commit convention, the regression-test naming rule and these lifecycle folders
key off (CLAUDE.md §"Bug Management", §"Team Workflow").

**`A-NN` is not a work item.** Those are findings from one audit — the
2026-07-23 contamination sweep in
[BLUEPRINT-AUDIT-2026-07-23.md](../config/BLUEPRINT-AUDIT-2026-07-23.md) — in the same
category as a Codex finding ID. A finding is a *claim that something is wrong*;
it becomes work when it gets a `BUG-`/`FEATURE-` number and a row here.

They were being used as though they were work items — folder names, rows in this
table, gate comments — and then extended with new numbers (A-38, A-39) for
findings that had nothing to do with that audit. Live items were renumbered on
2026-07-30. The audit document and everything in `done/` keep their `A-NN` IDs as
historical provenance, because the Codex review documents argue about findings by
those names and renaming them would break the trail they exist to be.

**Rule going forward:** an `A-NN` reference is a citation of history. If you are
about to work on something, give it a `BUG-`/`FEATURE-` number first.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| **BUG-147** | **The DoD gate counts only `*.spec.ts`/`*.spec.tsx` as a bug's regression test, on every searched root, so a JavaScript project can never satisfy it.** | S2 | OPEN | **From storm2flow, 2026-09-22:** its BUG-216 fix landed with a real, running regression test, `frontend/src/configLoader.bug216.spec.js`, whose `it()` title names the bug. `dod_stage_bugtests` (`scripts/lib/dod-gate.sh`) still refused the push with "No test under the searched roots names: BUG-216", because its extension filter applies to a project's own declared `BP_TEST_ROOTS` too. Those roots are run by the project's own runner, never by the blueprint's `tests/vitest.config.ts`. **A reproducer and a fix already exist,** written by storm2flow's Matthias directly in this checkout, and are kept on local branch `storm2flow/bug147` (`58ff781` reproducer, `35d902d` fix). They were taken off `main` because they collided with the Orchestrator's unpushed work, and because the fix edits `scripts/lib/dod-gate.sh` in place, which TASK-067's gate refuses. **Blocked on the founder:** port `dod-gate.sh` whole first (a sourced library, the hardest port shape), or grant an explicit exception. **No regression test:** not on `main` yet. Its reproducer exists, `tests/dod-gate` #11c on branch `storm2flow/bug147`, and lands with the fix once the founder rules. **Re-open if** a declared project root's JavaScript spec whose title names a bug is refused. |
| **BUG-144** | **A failed dispatch leaves the mic with a provider that is no longer running, and nothing tells the Orchestrator. REOPENED 2026-09-22: the fix misses a dispatch that already claimed ACTIVE.** | S2 | OPEN (reopened) | **First fixed** in `45b0f87` (accepted 2026-09-22): after the wake command returns, `recoverStrandedMic()` in `scripts/signal-watch.mts` hands the mic back when the baton still names exactly the Holder and the `OVER_TO_<X>` State it dispatched. **Why it reopens, observed live 2026-09-22 16:40Z:** Andreas (Codex) claimed the mic (`State=ACTIVE`), and his `codex exec` died 16 s later on `Selected model is at capacity`. The launcher logged `FAILED (exit 1)`, but the baton read `Holder=Andreas State=ACTIVE`, not `OVER_TO_CODEX`, so the recovery never fired and the mic was stranded until the Orchestrator took it back by hand. Every well-behaved agent claims ACTIVE first, so this is the common failure path, not an edge. It matches this row's own re-open trigger. **Fix direction:** after the wake command returns, recover when the baton still names the dispatched persona as Holder in either `OVER_TO_<X>` or `ACTIVE`. The dispatch is over, so a Holder still naming it is stranded either way. A new reproducer case in `tests/mic-recovery` covers the ACTIVE path. **Re-open if** a failed dispatch can leave the mic with a provider that is no longer running. |
| **BUG-146** | **`tests/sync-by-address` #20d (BUG-120) intermittently hangs about 320 s in CI, turning `main` red on pushes that changed nothing it tests.** | S2 | OPEN | **Observed twice:** CI run 35596083384 on `61cfe01` (2026-09-21, a docs-only push, unnoticed then because the Orchestrator did not wait for its CI) and run 35733083948 on `374a8d9` (2026-09-22, also docs-only). Both times "#20d BUG-120: a TERM that reaches the held refresh child with its release is not lost — no fetch, no wait for the budget" ran 320019-320024 ms and failed. That takes `bootstrap-gate` #2/#3 down with it, because a fresh bootstrap runs the same suite in its own gate. A rerun of the failed job passed with no change. The test exists to prove a TERM is NEVER lost, and a hang is exactly what a lost TERM looks like. So either the test's synchronisation races on a slow runner, or BUG-120's fix loses the signal in a window the test sometimes hits. **The first job is to decide which, from evidence:** reproduce under CI-like load (`taskset -c 0-3`, see HANDOVER §0 item 3) in a loop until it hangs, then read what the held refresh child and its parent were doing. A flaky gate test is a defect whichever side it is on: it trains everyone to rerun until green, which is the BUG-031 failure. **Diagnosis attempted 2026-09-22 (Philipp), inconclusive:** 162 of 162 local runs were clean, 150 of #20d alone under `taskset -c 0-3` plus pinned busy-loops and 12 of the full suite (which nests bootstrap-gate). The hang happened at both levels in CI (outer on `61cfe01`, nested on `374a8d9`) and at neither here. A local full suite takes about 157 s, where CI takes over 340 s for the same work, so `taskset` does not reproduce this runner. No defect was found in BUG-120's token gate (`scripts/blueprint:672-704`) or in the test, and nothing was changed. **Next step:** capture evidence ON the next CI occurrence. When a scenario's wait times out, the harness dumps the process tree and wait channels as a CI artefact. **No regression test:** the test that catches this bug already exists, `tests/sync-by-address` #20d itself, and it does not reproduce locally. A BUG-146-titled copy would prove nothing more. **Re-open if** #20d hangs again on any run. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
