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
| **BUG-083** | **The pre-push gate's colour codes lost their escape byte, so every push from a terminal prints `[2m`, `[32m` and `[K` as literal text — and `tests/pipeline` #9/#17 cannot see it.** `scripts/lib/pipeline.sh:91-92` sets `_C_DIM='[2m'`, `_C_OK='[32m'`, `_C_BAD='[31m'`, `_C_WARN='[33m'`, `_C_OFF='[0m'` and `_PIPE_CLR='[K'` with the `ESC` (0x1b) byte ABSENT: `grep -c $'\033' scripts/lib/pipeline.sh` is **0**. Verified on a real pty (`script -qec`): the TTY branch emits zero ANSI bytes and renders `[2m╭─ gate [0m`, `[32m✓[0m`, `a…\r[K[2m…` as visible garbage. Two consequences. (1) Cosmetic, but on the founder's screen on every push. (2) **`#9` ("non-TTY output is free of ANSI escapes") and `#17` ("feed lines are plain text") are VACUOUS with respect to the colour path** — there is no escape anywhere to leak, so a mutant forcing `[ -t 1 ]` true survives BOTH the retiring shell suite and the port. Only a mutant that restores real escape bytes AND forces the TTY branch turns `#9` red, which is how this was found. `tests/pipeline/pipeline.spec.ts` `#9b` PINS the defect and goes RED when it is fixed, at which point `#9`/`#17` become live for the first time and `#9b` should be replaced by a pty-driven assertion. `scripts/lib/pipeline.sh` is the Pipeline agent's file under TASK-018-CONVENTIONS, so this row reports it and does not fix it. | S3 | **FIXED — landed f0660f0 (reproducer), e56c031 (fix), pushed 2026-09-16, CI green on `cd0b827` (run 35151645886)** | Run `git push` from a terminal: the gate's dim and green text shows as colour, not as literal `[2m` / `[32m`. Piped output (e.g. `git push 2>&1 | cat`) carries no escape codes. | Found 2026-09-11 by Vitali (QA-1) porting the gate/hooks suites for TASK-018, by mutation sweep rather than by reading. Re-open if the escapes are restored without making `#9`/`#17` pty-driven. |
| **BUG-133** | **A signalled deferred bookend child leaves its `sleep 0.1` running for up to 0.1 s after it exits, and CI's harness caught it as a leftover process.** CI run 35141833622 on `b26c0db`, the first run with suites in parallel: `subagent-feed` #17 failed with "Scenario left 1 process(es) running". The child in `scripts/log-activity.sh` waited with a foreground `sleep 0.1`, so a TERM ran the handler only after the sleep returned, and the sleep outlived its parent. Harmless in production (a sleep living 100 ms), but it turned CI red on a loaded 4-core runner, where this 32-core machine never saw it. | S3 | **FIXED — landed `0752a4e`, pushed 2026-09-16, CI green** | Look at CI on any push: `subagent-feed` #17 (release tier) must pass. It failed on `b26c0db` with "Scenario left 1 process(es) running" and passes since the fix. | Found 2026-09-16 by Eto from the CI log. **Fix:** the sleep runs in the background and is waited on, so the signal interrupts the wait at once and the handler kills the sleep. **Regression test:** the existing `subagent-feed` #17, now titled with BUG-133; it is the test that went red in CI. **Re-open if** #17 reports a leftover process again. |


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
