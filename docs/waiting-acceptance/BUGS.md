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
| **BUG-146** | **Reproducer: required.** **`tests/sync-by-address` failed intermittently in CI only: `#20d` hung for 320 s (nine times, 2026-09-21 to 2026-09-25), and later `#20f` left a scratch directory behind (2026-10-03 and 2026-10-06).** | S2 | FIXED `5990709a` (reproducer `a5349c46`), CI green and released at `c2a1ba83`; fixed by Philipp (Claude), reviewed CLEAN by Elias (Codex) | `npm --prefix tests test -- sync-by-address`: the `#20g` case signals the CLI while its `mktemp` is still running and nothing is left behind. Beyond that, acceptance is CI staying free of `#20d` hangs and of `scratch left under TMPDIR` in `#20f`. | **The leftover directory, cause established:** a signal that arrived while a child was running was handled before the CLI had stored that child's result, so cleanup did not yet know the scratch directory `mktemp` had just made. The TypeScript port ran the handler one assignment earlier than the shell trap did. **Fix:** the deferred handler runs at the next command boundary. `#20g` is red before the fix with CI's exact message and red again against the mutant that restores the inline handler. **The 320 s hang, NOT explained:** no mechanism was found, and the dumps from the old occurrences expired. What is measured: it has not occurred in any of the 76 push runs since 2026-09-25, having hit nine times in the five days before, and that is when the CLI was ported from shell to TypeScript (2026-09-26 to 2026-09-28). Inference, not proof: the hang lived in the shell CLI and left with it. The capture that names a surviving process (`tests/harness/dump.ts`) stays in place. The full investigation history is in this row's earlier versions (`git log -p -- docs/doing/BUGS.md`). **Re-open if** `#20d` hangs again on any run, or `#20f` or `#20g` leaves a scratch directory behind. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
