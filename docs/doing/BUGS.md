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
| **BUG-083** | **The pre-push gate's colour codes lost their escape byte, so every push from a terminal prints `[2m`, `[32m` and `[K` as literal text — and `tests/pipeline` #9/#17 cannot see it.** `scripts/lib/pipeline.sh:91-92` sets `_C_DIM='[2m'`, `_C_OK='[32m'`, `_C_BAD='[31m'`, `_C_WARN='[33m'`, `_C_OFF='[0m'` and `_PIPE_CLR='[K'` with the `ESC` (0x1b) byte ABSENT: `grep -c $'\033' scripts/lib/pipeline.sh` is **0**. Verified on a real pty (`script -qec`): the TTY branch emits zero ANSI bytes and renders `[2m╭─ gate [0m`, `[32m✓[0m`, `a…\r[K[2m…` as visible garbage. Two consequences. (1) Cosmetic, but on the founder's screen on every push. (2) **`#9` ("non-TTY output is free of ANSI escapes") and `#17` ("feed lines are plain text") are VACUOUS with respect to the colour path** — there is no escape anywhere to leak, so a mutant forcing `[ -t 1 ]` true survives BOTH the retiring shell suite and the port. Only a mutant that restores real escape bytes AND forces the TTY branch turns `#9` red, which is how this was found. `tests/pipeline/pipeline.spec.ts` `#9b` PINS the defect and goes RED when it is fixed, at which point `#9`/`#17` become live for the first time and `#9b` should be replaced by a pty-driven assertion. `scripts/lib/pipeline.sh` is the Pipeline agent's file under TASK-018-CONVENTIONS, so this row reports it and does not fix it. | S3 | OPEN | Found 2026-09-11 by Vitali (QA-1) porting the gate/hooks suites for TASK-018, by mutation sweep rather than by reading. Re-open if the escapes are restored without making `#9`/`#17` pty-driven. |
| **BUG-134** | **`tests/lifecycle-docs` refuses a bug cancelled the way the DoD prescribes, so the cancellation cannot be pushed.** Observed 2026-09-16 while applying the founder-approved `doing/` triage (TASK-058): BUG-101 and BUG-108 were cancelled by deleting their rows and recording them in `docs/config/findings.md` F-005, and "THE REAL TREE" failed with "bugs with commits on HEAD and no row". It reads only `BUGS.md` rows, while `scripts/lib/dod-gate.sh` learned in BUG-130 that a findings pointer is a record. Same defect, second reader. | S3 | OPEN | Found 2026-09-16 by Eto. **Fix:** `rowedBugIds` also counts bug ids named in `docs/config/findings.md`, matching the DoD gate. **Regression test:** `lifecycle-docs` #6 BUG-134. **Re-open if** a findings-recorded cancellation fails either check. |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
