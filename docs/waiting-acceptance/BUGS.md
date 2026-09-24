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
| **BUG-149** | **The founder cannot run the test suite: the obvious commands fail with 969 errors in an ordinary terminal.** | S2 | FIXED `97c7cb4`, CI green | In a VS Code terminal (which exports `GIT_ASKPASS`), run `npm --prefix tests test`. Expect the whole suite green. A bare `vitest run` still fails closed, by design. The regression test is `tests/ts-bridge` "BUG-149 — the documented entry point scrubs a normal terminal for itself". | `tests/package.json`'s `test` script now runs vitest through `run-ts-suites.sh`'s existing `ts_scrubbed`, and `tests/harness/env.ts` declares `GIT_ASKPASS` as a known override. The harness guard still protects specs that spawn directly. **Re-open if** the documented command fails in a normal terminal. |
| **BUG-148** | **`tests/mic-recovery` reads the operator's gitignored `AGENT_ROSTER.md`, so the suite cannot run in CI or in a fresh clone.** | S1 | FIXED `f15e18a`, CI green | CI has had no roster since that commit and has stayed green. To see it locally, move your `AGENT_ROSTER.md` out of the repo, run `npm --prefix tests test -- mic-recovery`, expect green, then move the roster back. | Each scenario now builds its own repo-shaped tree (a root marker, a fixture roster at that root, the baton under its own `logs/state`) and depends on no file outside the fixture. **No regression test:** the suite itself is the reproducer, and CI running it with no roster is the proof. **Re-open if** any suite depends on a gitignored, per-machine file. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
