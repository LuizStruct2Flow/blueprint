# Bugs — pushed to main, awaiting founder acceptance

Fixed and pushed; awaiting the founder's explicit acceptance signal before they
move to `docs/done/BUGS.md`. Claude does NOT auto-promote to `done/`. If a
regression is found, the row moves back to `docs/doing/BUGS.md`.

See [README.md](README.md) for the lifecycle.

**"What to test" is a column here, not a separate index.** There used to be an
`INDEX.md` holding the same membership plus per-item test instructions. It
drifted — 5 rows listed against 14 real ones, so nine fixes were invisible to
the only person who can accept them — and the first repair was a test to hold
the two files in step. That is the wrong repair: two records of one fact drift
by construction, and a guard only tells you afterwards. One record cannot
disagree with itself.

**Put the acceptance command in the CHAT, not only in this column.** BUG-022
shipped with `scripts/accept-bug-022.sh` and a pointer in its row, and the
founder still had no idea how to accept it — because this column lives in a file
he would have to open first. Klaus and Alexis both said acceptance instructions
belong where the decision happens.

| # | Bug | Severity | Status | What to test | Detail |
|---|---|---|---|---|---|
| **BUG-134** | **`tests/lifecycle-docs` refuses a bug cancelled the way the DoD prescribes, so the cancellation cannot be pushed.** Observed 2026-09-16 while applying the founder-approved `doing/` triage (TASK-058): BUG-101 and BUG-108 were cancelled by deleting their rows and recording them in `docs/config/findings.md` F-005, and "THE REAL TREE" failed with "bugs with commits on HEAD and no row". It reads only `BUGS.md` rows, while `scripts/lib/dod-gate.sh` learned in BUG-130 that a findings pointer is a record. Same defect, second reader. | S3 | **FIXED — landed 3bf6351 (reproducer), cd0b827 (fix), pushed 2026-09-16, CI green on `cd0b827` (run 35151645886)** | Cancel a bug the DoD way (delete its row, name it in `docs/config/findings.md`) and push: `lifecycle-docs` and the DoD gate both accept it. A bug with commits and no record anywhere still fails. | Found 2026-09-16 by Eto. **Fix:** `rowedBugIds` also counts bug ids named in `docs/config/findings.md`, matching the DoD gate. **Regression test:** `lifecycle-docs` #6 BUG-134. **Re-open if** a findings-recorded cancellation fails either check. |
| **BUG-133** | **A signalled deferred bookend child leaves its `sleep 0.1` running for up to 0.1 s after it exits, and CI's harness caught it as a leftover process.** CI run 35141833622 on `b26c0db`, the first run with suites in parallel: `subagent-feed` #17 failed with "Scenario left 1 process(es) running". The child in `scripts/log-activity.sh` waited with a foreground `sleep 0.1`, so a TERM ran the handler only after the sleep returned, and the sleep outlived its parent. Harmless in production (a sleep living 100 ms), but it turned CI red on a loaded 4-core runner, where this 32-core machine never saw it. | S3 | **FIXED — landed `0752a4e`, pushed 2026-09-16, CI green** | Look at CI on any push: `subagent-feed` #17 (release tier) must pass. It failed on `b26c0db` with "Scenario left 1 process(es) running" and passes since the fix. | Found 2026-09-16 by Eto from the CI log. **Fix:** the sleep runs in the background and is waited on, so the signal interrupts the wait at once and the handler kills the sleep. **Regression test:** the existing `subagent-feed` #17, now titled with BUG-133; it is the test that went red in CI. **Re-open if** #17 reports a leftover process again. **That trigger fired on 2026-09-17** (CI runs 35212210548 and 35212650644). Diagnosis by Vitali: not the product. The trap killed its sleep in 300 of 300 targeted TERMs under synthetic 4-core load. #17 waited only for the child's pid, so teardown sampled the still-dying sleep. `9a8a6fd` makes #17 wait for the child's whole process group, which is what its title claims. Under load, #17 failed 14 of 100 runs before and 1 of 260 after, and the sleep was never left behind. **Known limit:** the one remaining failure was the harness's generic leftover message, on a process not yet identified. CI green on `9a8a6fd`. |


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
