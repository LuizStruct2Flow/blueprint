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
| **BUG-138** | **The "artefacts travel with their item" check only sees BUG folders, so a stranded TASK or SPIKE artefact passes.** `docs/DoD.md` §1b rule 8 cites `tests/lifecycle-docs` #3 for plans, reviews, mockups and spike code alike, but the scan matches `BUG-*` folders and `PLAN-BUG-*.md` only. Found 2026-09-17 by the founder: TASK-022's plan and six refreshed audit files sat loose in `waiting-acceptance/`, where a later move would have taken the row and left them behind, and nothing failed. Fixed by hand in `b1b70f0`. | S2 | **OPEN**, founder asked for the fix 2026-09-17 | **Fix:** the scan covers every item prefix the lifecycle uses (`BUG`, `TASK`, `FEATURE`, `SPIKE`) for both folders and `PLAN-*.md`, and a multi-file item with loose files beside its row is reported. **Regression test:** named BUG-138. **Re-open if** an artefact of any item type can sit in a state folder its row has left. |
| **BUG-139** | **The bug-regression-test check is satisfied by a comment, so a fix can land with no test.** `scripts/lib/dod-gate.sh:425` greps the declared test roots for `BUG-0*<n>\b` in any file. `// BUG-9999` in any spec passes it, and no test title is ever required. DoD §2 calls this the guarantee that every bug ships with a reproducer. Found 2026-09-17 in the TASK-022 audit (rules D027/D099) and confirmed in the source. | S2 | **OPEN**, founder asked for the fix 2026-09-17 | **Fix:** the bug number must appear in a test TITLE (`it(...)`/`describe(...)`), not anywhere in a file. Check first which already-landed bugs would fail the stricter rule and report before changing it. **Regression test:** named BUG-139. **Re-open if** a push naming a bug passes with no test whose title carries that number. |
| **BUG-140** | **The baton check passes an empty or unknown Holder, and never runs in CI.** `dod_stage_signal` (`scripts/lib/dod-gate.sh:460-491`) only checks that the `Holder`, `State` and `Task` rows exist. A hand-edited baton with an empty Holder, or a persona no roster names, is reported well-formed, and `scripts/signal-set.sh --holder NoSuchPersona` publishes it. `AGENT_SIGNAL.md` says `Holder` is a persona name from the roster. Found 2026-09-17 in the TASK-022 audit (rules C004/C005/D119). | S3 | **OPEN**, founder asked for the fix 2026-09-17 | **Fix:** `signal-set.sh` refuses a Holder that is not a roster persona (and not the founder's own `USER` convention, if one exists — check), and the gate stage checks the same. **Regression test:** named BUG-140. **Re-open if** a baton naming nobody on the roster is published or passes the gate. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
