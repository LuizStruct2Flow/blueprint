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
| **BUG-029** | A derived project's test suites never update, while the scripts they test do | S1 | Fixing | **`tests/` is not in `MANAGED_FILES`, so a derived project's test suites are frozen at the day it was bootstrapped while `blueprint pull` keeps updating the scripts they test.** Bootstrap seeds the whole tree, so the suites arrive; `pull` then walks `MANAGED_FILES` file by file and `tests/` appears nowhere in it. Every project that exists is already carrying suites that are older than the code under them, and the gap widens on every pull. **The failure is silent in the worst direction**: a stale suite still passes, so the project's gate goes green over assertions written against a version of the machinery it no longer runs — the recurring shape this repo has hit four times (A-22, BUG-004, BUG-018, BUG-028), a mechanism present and reporting nothing, whose silence is indistinguishable from success. BUG-028 is the proof it is not theoretical: a bootstrapped project failed six of its own suites and nothing downstream could ever have told anyone. **What ships is already computed** — BUG-028 made `export-ignore` the predicate for the five blueprint-only suites, so the managed set is the complement of that and does not need a second hand-maintained list. The consumers (`files`, `drift`, `pull`, `a2bp`) all treat entries as plain paths, so the shape of the fix is expanding a directory entry once after `BLUEPRINT_ROOT` resolves, not four new loops. **A hand-listed set of 33 suite paths is the wrong answer**: it drifts the moment someone adds the 34th, which is this bug again one level up. |


**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
