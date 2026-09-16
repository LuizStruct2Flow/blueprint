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
| **BUG-122** | **A full `blueprint pull` that refused a file still advances `bootstrap_sha`, so a project with a refused file reads as synced.** From storm2flow, `FR-storm2flow-refused-pull-sha`. `scripts/blueprint` sets `refused_guard=1` when a file is refused (`:1611`, `:1634`, `:1712`), but that only changes the exit status to 4 (`:1765`). The update at `:1727-1748` advances `bootstrap_sha` whenever at least one file was pulled and no paths were named, yet its own comment defines the value as "synced UP TO this commit". A partial pull already leaves it unchanged. | S2 | **FIXED — landed `f4b1c25`, reproducer `da4f7b2`, pushed 2026-09-15** | In a derived project, run `blueprint pull` and skip one file at the prompt (or let a guard refuse one, or stop the run with `q`). `.blueprint-source`'s `bootstrap_sha` must be UNCHANGED, and the output must name the files that held it back: `bootstrap_sha left unchanged — these files were not synced: …`. A clean full pull that lands everything must still advance it. **Cross-provider review:** Alexey (Codex) — push as is; he confirmed all four unsynced paths hold the SHA and that a clean pull is not suppressed. Known limit he noted: `q` records only the file it stopped at, and a no-op full pull after completing everything piecemeal still leaves the SHA stale — neither is new. | Filed 2026-09-15 by storm2flow; **promoted the same day on founder decision** ("Start all now"). **Fix shape:** leave `bootstrap_sha` unchanged when any file was refused, and name the files that held it back. Reproducer first: a full pull with one refused file must leave `bootstrap_sha` unchanged. |


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
