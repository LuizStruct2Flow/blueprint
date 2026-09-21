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
| **BUG-143** | **A truncated Codex dispatch reports `finished` and points at the PREVIOUS run's last message, so a run that died looks exactly like one that completed.** | S2 | OPEN | **Observed live 2026-09-20 20:15:34**, not reasoned about: Elias was dispatched on BUG-141, made his edits, and the run ended mid-verification. `logs/state/codex-runs.log` closed with *"codex exec finished — see …/codex-last-message.md for the last message"*, and that file was two hours stale — it still held Alexey's earlier review, which the Orchestrator read and nearly mistook for Elias's report. Two independent causes: (1) `scripts/start-codex-signal-watch.sh:260-261` prints `finished` and `feed_append`s it unconditionally, and the CLI runs in a pipeline (`\| tee \| codex-feed-filter.sh`) so its exit status is lost exactly as the Kimi launcher lost it before `4e977da`; (2) `$OUTPUT_LAST` is written by `codex --output-last-message`, so a run that dies never writes it and the previous run's file survives as a confidently wrong artefact — worse than an empty one, because staleness is invisible. **A second mechanism, observed 2026-09-21 08:21, and it bites a run that SUCCEEDED:** the agent hands the mic back *during* its run, by calling `signal-set.sh`, but `codex exec` writes `--output-last-message` only when the process exits, seconds later. So the mic monitor fires, the Orchestrator reads `codex-last-message.md`, and it is the previous run's — even though this run completed cleanly and its own report lands moments afterwards. Two consecutive Elias dispatches produced a stale read by this route, the second caught only by comparing mtimes. Any fix to (2) must therefore not assume "the mic is back" means "the report is written". **Fix:** port the status-file pattern from `start-kimi-signal-watch.sh` (a command group writing `$?` before `tee` sees EOF, since the wake command runs under dash with no `PIPESTATUS`), report `FAILED (exit N)` distinctly, and make a dispatch truncate or timestamp `$OUTPUT_LAST` at its start so a stale file cannot be read as this run's. **Re-open if** any dispatcher reports an outcome it did not verify. |
| **BUG-141** | **A Gemini dispatch logs as `[GEMINI]`, not as the persona holding the mic** — the same defect TASK-063 fixed for Kimi, in the launcher Kimi was mirrored from. | S3 | OPEN | `scripts/start-gemini-signal-watch.sh` builds no `FEED_LABEL` and `scripts/agent-activity.sh` still carries `pump "$state_dir/gemini-runs.log" raw "GEMINI"`. BUG-021 removed the Codex pump precisely so `bp_roster_label` would be the only labeller; Gemini never got that treatment. The same raw pump also re-emits a growing unterminated line, which is how the duplicate-line defect showed up on Kimi. **Reproduce:** dispatch any Gemini persona and read the feed. **Fix:** the TASK-063 change to the Kimi launcher, applied verbatim. Scoped out of TASK-063 deliberately — the founder asked about Kimi, and a silent ride-along would have gone unreviewed. |
| **BUG-142** | **`agent-activity.sh --whoami` answers with the Orchestrator inside a dispatch, so a dispatched persona asking who it is gets the wrong name.** | S3 | OPEN | Observed twice live on 2026-09-20: with the baton reading `Holder=Florian`, a dispatched Kimi ran `--whoami` and got `Eto - Claude Code`. It resolves the `Orchestrator` row from the roster and has no notion of dispatch context, which is correct for the primary session and wrong for every dispatched one. Both runs recovered by reading the baton instead — that is the hazard, not the mitigation. **Fix direction:** `--whoami` should prefer the dispatch's own persona when one is in scope (`AGENT_SIGNAL_HOLDER` is already exported to the wake command) and fall back to the Orchestrator row otherwise. **Re-open if** any identity resolver answers for the session it is not running in. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
