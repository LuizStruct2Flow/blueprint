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
| **BUG-111** | **`tests/harness/process.ts` reports a process it killed ITSELF as a leftover, so a push goes red on load rather than on a defect.** Observed 2026-09-14: the push gate failed `harness` › *reaps a background process the scenario forgot* at **1019 ms** with *"Scenario left 1 process(es) running"*; the same case passed alone at 1008 ms, 41/41, with nothing changed in the tree. Vitali saw the same case go red once on 2026-09-11 and read it as an unrelated timing flake. **Mechanism, read from the code rather than inferred:** on timeout, `run()` calls `killGroup(child)` (`process.ts:177-180`), which sends SIGKILL to the group and returns immediately; the run's promise settles on the direct child's `close`, so the call throws *Timed out* while a grandchild in that group (`sleep 30`) may still be dying. Teardown then runs `disposeAll()`, whose FIRST act is `if (!groupAlive(pgid)) continue` (`:251`) — and a killed-but-unreaped member is still signalable, so it lands in `survivors`. The grace period that would absorb this (`waitGroupGone(pgid, TERM_GRACE_MS)`, `:267`) runs only AFTER the group is already recorded as a survivor. On an idle machine reaping wins the race; under gate load it does not. **Not a test being flaky — the harness asserting on a proxy (signalable now) for the property (still running independently of us).** Fix direction: after the timeout path's SIGKILL, await the group being gone within `KILL_GRACE_MS` before the run settles, so teardown only ever sees groups nobody has already killed. Reproducer: hold the grandchild's reap (e.g. a subreaper that delays `wait`) and assert teardown does not report it. | S2 | **REOPENED 2026-09-17**, its re-open trigger fired twice: CI teardown reported "Scenario left 1 process(es) running" for subagent-feed #17 (runs 35212210548, 35212650644) and #4 (run 35225569171). The 2026-09-15 fix covered only the timeout path in `run()`; `disposeAll()`'s own first `groupAlive` sample was the same proxy. Measured under `taskset -c 0-3` plus 18 busy loops: every group caught alive was gone within 10-15 ms. **Fix:** `disposeAll` gives a group found alive `PROCESS_SNAPSHOT_GRACE_MS` (250 ms) to finish before recording it; one still alive after that fails as before. **Regression tests:** `tests/harness` "BUG-111 reopened", one test for each side of the grace. Previously: **ACCEPTED by the founder 2026-09-15** — accepted with every other bug waiting for acceptance ("also the bugs in waiting-acceptance you can move to done, I cannot test most of them, but in worst case we re-open them"). Most were not tested by hand, so a regression re-opens the row rather than counting as a new bug. | Found 2026-09-14 by Eto (Orchestrator) on a red push that a re-run of the same commit would clear. **Re-open trigger: the next occurrence, or immediately if anyone retries a red gate on this case without citing this row.** **Promoted 2026-09-15 under TASK-028**, porting PR #68 (linkedin-watcher-agent). Reproducer: `tests/harness` BUG-111 makes the window certain rather than likely. A helper forks `sleep` into the run's group, leaves the group, and reaps its child 500 ms after it dies. The case requires the group to be gone (`ESRCH`) when the timed-out `run()` returns. **Fixed under TASK-028:** after the timeout's SIGKILL, `run()` now awaits `waitGroupGone(pid, KILL_GRACE_MS)` before throwing, which is the fix direction this row stated. **What was to be tested:** Run `env -u GIT_EDITOR -u GIT_PAGER -u AGENT_PERSONA TMPDIR=/home/luiz/.cache/bp-harness-tmp tests/node_modules/.bin/vitest run --root "$PWD/tests" harness` — the slow-reaper case must pass, and a push whose gate is under load must no longer go red on `harness` › reaps a background process the scenario forgot. **Status when accepted:** **FIXED — landed `e8a99b7`, pushed 2026-09-14** |

**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
