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
| **BUG-145** | **After a port lands, every later push is refused: the shell inventory calls the port's own shim `NEW`.** | S1 | OPEN | **Observed in CI on `3cfa5e1`, 2026-09-22**, the first push after BUG-144's port: `❌ NEW: scripts/signal-watch.sh is a shell file … but BASE's scripts/shell-inventory.json covers it in neither list`. `scripts/shell-inventory-check.mts` accepts a valid shim only while the push REMOVES its legacy row. Once that push is the base, the shim is still a shell file (`sh_lint_files` lists it), in neither list, so it reads as new shell. The port push itself passed because its base still carried the row. The local gate skipped `3cfa5e1` as text-only, so CI caught it. The next code push fails locally too, and `released` cannot move while `main` is red. `tests/shell-inventory` covers "row removed with a valid shim" but never "the push after that". **Fix:** a file that is a valid shim with a TRACKED `.mts` target is accepted whether or not any list names it, because a shim is by definition migrated, not new shell. **Re-open if** any push after a port is refused for the port's own shim. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
