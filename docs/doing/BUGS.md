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
| **BUG-031** | CI has been red all day and five PRs were merged over it | S1 | Fixing | **CI has been red on every run since BUG-027 landed, and five PRs were merged over it with `--admin`.** The failing job is `shell regression suites (full)`, the failing assertions are `tests/subagent-feed` #5 and #6 — the suite BUG-027 itself added this morning. **That suite has never once passed in CI**: it was written, added to the workflow, and verified only on a developer machine. Both cases report `rc=2` from the hook and nothing else. **The real defect is that the assertion could not say why.** It ran the hook with `2>&1` discarded, so a full day of CI failures produced a single number that names the symptom, and the only remaining route in was local reproduction — which does not reproduce. Ruled out by measurement, not reasoning: the gitignored `AGENT_ROSTER.md` being absent (clean clone passes), suite-ordering contamination (CI's full sequence in order passes), the environment (`env -i` passes), `jq` absent (passes, on a synthetic PATH — the first probe of this was invalid because `/usr/bin` was still on PATH), and dash rejecting `set -o pipefail` (the runner is Ubuntu 24.04 with the same dash 0.5.12 that accepts it). `rc=2` is what dash returns for an unbound variable under `set -u` or an illegal `set -o`, and neither reproduces here. **The process failure is the bigger half**: `gh pr checks` was consulted once, reported "no checks reported" because the workflow had not registered yet, and was never re-checked — then `--admin` merged past the branch policy five times. A green local gate was treated as evidence about CI, which it is not. |


**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
