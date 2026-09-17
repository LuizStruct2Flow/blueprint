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


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
