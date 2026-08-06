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
| **BUG-023** | `signal-set.sh` swallowed a failed journal append, so a mic flip could publish while its event vanished | S2 | Fixed, landed 2026-08-06 (#32) | Make the journal unwritable and flip the mic: `chmod 444 logs/state/signal-history.log`, then `bash scripts/signal-set.sh --holder X --state ACTIVE --task t`. It must **publish the baton**, print *do NOT retry*, and **exit 8** — not 0, and not a plain failure a caller would retry into a double publish. `chmod 644` after. Covered by `tests/signal-set/test.sh` #6. | The journal was a BACKSTOP "read by nothing that makes a decision", and `\|\| true` was correct under that contract. **FEATURE-003 made it the replay's SOURCE and did not update the writer.** Found by Jesko (Codex) in review round 7, after I claimed a durable append-only journal reduced "incomplete replay" to two states and asked him to find a third: a flip published, its append failed, a later flip succeeded, and `session-resume` reported one event with no warning and exit 0. **Durable is not complete** — a file nothing truncates still has holes if its writer drops records. Exit **8** = "published, but not journalled", distinct because the baton is already published by then. The same stale-contract comment then had to be corrected in `lib/state-dir.sh` and in two more places (R8, R9): a contract change that is not propagated is a defect per site, not per file. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
