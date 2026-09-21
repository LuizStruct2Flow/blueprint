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
| **BUG-144** | **A dispatch that fails leaves the mic at `OVER_TO_<X>`, and nothing tells the Orchestrator.** | S2 | OPEN | **Observed live 2026-09-21 13:05Z:** Thomas (Kimi) was dispatched TASK-067, and `kimi -p` failed 3 s later with `403 You've reached your 5-hour usage limit`. The launcher logged `kimi FAILED (exit 1)` correctly (BUG-141's status file works), but the baton stayed `Holder=Thomas State=OVER_TO_KIMI` for 30 minutes. The Orchestrator's mic Monitor watches `Holder`/`State` and saw no change, so the failure surfaced only when the Monitor expired and someone read `kimi-runs.log` by hand. Every watcher-backed launcher (Codex, Kimi, Gemini) has the same shape: on a non-zero exit, nothing flips the mic. **Fix direction:** on `FAILED`, the launcher hands the mic back to the Orchestrator itself through `scripts/signal-set.sh` (`OVER_TO_CLAUDE`, Task naming the failure and exit code), so the Monitor fires. Leave the provider's refusal text in the Task, not a guess: that is the input TASK-065(c) needs for quota detection. **Re-open if** a failed dispatch can leave the mic with a provider that is no longer running. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
