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
| **BUG-141** | **A Gemini dispatch logs as `[GEMINI]`, not as the persona holding the mic** — the same defect TASK-063 fixed for Kimi, in the launcher Kimi was mirrored from. | S3 | OPEN | `scripts/start-gemini-signal-watch.sh` builds no `FEED_LABEL` and `scripts/agent-activity.sh` still carries `pump "$state_dir/gemini-runs.log" raw "GEMINI"`. BUG-021 removed the Codex pump precisely so `bp_roster_label` would be the only labeller; Gemini never got that treatment. The same raw pump also re-emits a growing unterminated line, which is how the duplicate-line defect showed up on Kimi. **Reproduce:** dispatch any Gemini persona and read the feed. **Fix:** the TASK-063 change to the Kimi launcher, applied verbatim. Scoped out of TASK-063 deliberately — the founder asked about Kimi, and a silent ride-along would have gone unreviewed. |
| **BUG-142** | **`agent-activity.sh --whoami` answers with the Orchestrator inside a dispatch, so a dispatched persona asking who it is gets the wrong name.** | S3 | OPEN | Observed twice live on 2026-09-20: with the baton reading `Holder=Florian`, a dispatched Kimi ran `--whoami` and got `Eto - Claude Code`. It resolves the `Orchestrator` row from the roster and has no notion of dispatch context, which is correct for the primary session and wrong for every dispatched one. Both runs recovered by reading the baton instead — that is the hazard, not the mitigation. **Fix direction:** `--whoami` should prefer the dispatch's own persona when one is in scope (`AGENT_SIGNAL_HOLDER` is already exported to the wake command) and fall back to the Orchestrator row otherwise. **Re-open if** any identity resolver answers for the session it is not running in. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
