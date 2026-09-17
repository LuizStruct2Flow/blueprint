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
| **BUG-135** | **A running feed daemon keeps the roster code it started with, so a fixed label never reaches the feed.** On 2026-09-17 the TASK-059 label fix passed its tests, yet the live feed still wrote `[matthias - Claude Code]`. The `--supervise` daemon had sourced `scripts/lib/roster.sh` at start, and `scripts/session-start.sh` leaves a running daemon alone. Every derived project hits this after a `blueprint pull` that changes the feed or roster code. | S2 | **OPEN**, founder asked for the fix 2026-09-17 | **Fix:** session start restarts a running daemon whose code has changed since it started. **Regression test:** named BUG-135. **Re-open if** the feed shows labels from code older than the checkout. |
| **BUG-136** | **The pre-push SCA stage throws away osv-scanner's stderr, so a failed scan cannot say why.** CI run 35220731328 on `9ba218f`: bootstrap-gate failed on `osv-scanner could not complete (exit 127)`, and a re-run passed unchanged. `.githooks/pre-push` redirects the scanner's stderr to `/dev/null`, so the log could not tell a network failure from anything else. That breaks the observability rule that every captured error is diagnosable. | S3 | **OPEN**, founder asked for the fix 2026-09-17 | **Fix:** a tool failure prints the scanner's own stderr, while a clean or findings run stays quiet. **Regression test:** named BUG-136. **Re-open if** a failed scan's gate output omits the scanner's error. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
