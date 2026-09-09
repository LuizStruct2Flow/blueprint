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
| **BUG-036** | **The pre-push gate cannot pass on macOS: three test helpers identify a process's cwd through `/proc`, which does not exist there, so the supervisor count is always 0 and `agent-activity-bound` fails closed.** `tests/agent-activity-bound/test.sh:159` and `tests/subagent-feed/test.sh:49,125` run `readlink -f /proc/$p/cwd`; on macOS that is always empty, the `case` never matches, and cases #1/#6/#7/#13/#14/#15 fail with "0 supervisors" while the feed is in fact running. Verified pre-existing at `c4dc95b` (tip of `main`) in a clean worktree, with the live feed stopped — **`main` is red on any Mac, and no push can be made from one.** The product itself is portable: `scripts/agent-activity.sh:226` branches on `/proc/<pid>/stat` vs BSD `ps -o lstart=`. Only the tests assume Linux, so this is the Brewfile's defect (TASK-017) recurring one layer down — the thing that decides whether work can ship is Linux-only while the thing it tests is not. Second defect in the same file: `test.sh:420` interpolates `$n1→$n2`, and under the `LC_ALL=C` the suite sets, bash absorbs the multibyte arrow into the identifier (`n1\xe2: unbound variable`) — needs `${n1}`. Third: the suite reports "no UTF-8 locale available" and SKIPs #19 on a host where `locale` is `en_US.UTF-8` and `locale -a` lists it, so its own detection is wrong. **Not the fix:** skipping the suite on Darwin — that is a suite silently covering nothing (BUG-005). Port the cwd lookup to a shared helper that uses procfs where present and `lsof -a -p <pid> -d cwd -Fn` on BSD. | S1 | OPEN | Found 2026-09-09 while landing TASK-017, by the gate refusing that push. Blocks every push from macOS. |


**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
