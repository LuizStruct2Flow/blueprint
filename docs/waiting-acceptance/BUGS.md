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
| **BUG-164** | **Reproducer: required.** **`tests/agent-activity-bound` #4 failed once in CI counting two feed supervisors where there was one** (run 38155512454 on `2d2ea6e`, a docs-only push). | S2 | FIXED `2fb5673` (reproducer `6e23405`), CI green and released at `2fb5673`; fixed by Vitali (Claude), reviewed by the Orchestrator (Claude) | `npm --prefix tests test -- agent-activity-bound`: the BUG-164 case counts a supervisor holding a subshell as one, and two separate process trees as two. Acceptance is CI staying free of `expected 2 to be 1` in that suite. | **Cause, measured:** the test helper `ownedProcesses` counted a just-forked subshell of the one supervisor as a second supervisor (a `ps` sampler caught a same-named child whose parent was the supervisor). **Fix:** the helper skips a candidate whose parent is also a candidate; no product code changed. **Not reproduced:** the CI failure itself never recurred locally, so that this is what CI hit is inferred from the mechanism. **Re-open if** the suite again counts more supervisors than exist. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
