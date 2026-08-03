# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

## Two namespaces, and only one of them is a work item

**`BUG-XXX` / `FEATURE-XXX` are the only lifecycle IDs.** They are what the
commit convention, the regression-test naming rule and these lifecycle folders
key off (CLAUDE.md §"Bug Management", §"Team Workflow").

**`A-NN` is not a work item.** Those are findings from one audit — the
2026-07-23 contamination sweep in
[BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md) — in the same
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
| **BUG-019** | The coordination baton is a TRACKED file, so any branch operation silently reverts a live dispatch | S2 | Found 2026-08-03, reproduced live, not fixed | `AGENT_SIGNAL.md` is committed, so `git switch`, `git checkout <file>`, `git stash` and `git rebase` all rewrite it — including while another agent holds the mic. **Reproduced against a running agent:** I dispatched Codex, then ran `git checkout AGENT_SIGNAL.md` on another branch; the baton reverted to `Holder=Eto State=OVER_TO_USER`, and Codex correctly refused to proceed — *"I stopped because the baton changed before I could claim it… Under the radio-over protocol, I cannot overwrite that."* The dispatch was lost silently: nothing failed, the watcher simply had nothing to claim. **This was rare before today and is now routine**, because PR #3 made branch operations constant — every fix is a branch, and the baton lives in the working tree those branches rewrite. Fix directions, none chosen: (a) make the baton untracked per-checkout state like `AGENT_ROSTER.md`, which loses the `git log -p` history the protocol relies on; (b) keep it tracked but have the dispatcher record the dispatch identity separately, so a reverted file cannot orphan a live run; (c) a lock the dispatcher checks before and after. **Do not fix it with a rule telling agents to remember** — that is the shape this repo has rejected three times (BUG-004's "flip the mic last", BUG-014's fixture isolation, and the no-chaining rule that needed a hook). |


BUG-002 moved to `waiting-acceptance/` on 2026-07-27; its blocker (audit finding
A-09) is fixed and pushed.

**BUG-004 still needs a decision before it needs code.** Do not attempt another
local mechanism — that is exactly what the rejection ruled out. (BUG-005 was
decided on 2026-08-02 and is in `waiting-acceptance/`.)

## Waiting acceptance

**FEATURE-001** — back-propagation becomes a request, not a write — was pushed on
2026-07-30 and sits in
[`../waiting-acceptance/FEATURE-001-a2bp-pr/`](../waiting-acceptance/FEATURE-001-a2bp-pr/)
with its plan and review trail. BUG-005 came out of building it.

Everything else delivered on 2026-07-29 is ACCEPTED and in
[`../done/`](../done/) — eight items, verdicts and evidence in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
