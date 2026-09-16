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
| **BUG-125** | **doc-links accepts a link that leaves the repository whenever its target happens to exist on the local disk.** Reported 2026-09-15 by storm2flow's orchestrator (Sylvia), under her founder's rule that "checks read only from the repository". `tests/doc-links/doc-links.ts:111` checks a target with `stat(resolve(dirname(file), target))`. A link like `../../../../blueprint/docs/DoD.md` in storm2flow's docs therefore passes on any machine with a sibling blueprint checkout. The same link is dead in a fresh clone, in CI, and for every other reader. storm2flow's founder caught one such link the same day. | S3 | **FIXED — landed `f4fe83d`, revised in `3a07a46`, containment hardened in `02e1f31`, pushed 2026-09-15** | In a project's docs, link a file OUTSIDE the repository (`../../outside.md`) while that file exists on disk — the doc-links check must report it, because a clone would not have it. Same for a symlink pointing out, a symlinked web root, and a symlink escaping the served directory into another repo folder. A symlink that stays inside the repository must still resolve, and so must a file the project gitignores but has locally (`CLAUDE.md`) — accepting those is deliberate: requiring tracked files broke every fresh bootstrap, since managed docs link the methodology files. **Cross-provider review:** Alexey — push as is; the resolve-then-stat window is gone because the patch removes `stat`. **Known limit:** a doc linking a gitignored file passes here and is dead in a clone; TASK-046 is the fix for that. | Filed 2026-09-15 by Eto (Orchestrator) from storm2flow's report. It sits in the suite Christian is changing for TASK-045, so he takes it next. **Fix shape:** normalise each target against the repo root, fail any that climbs out, and check whether resolving against tracked files (`git ls-files`) is needed so an untracked local file cannot satisfy a link. Reproducer first: a doc linking `../../outside.md` must be reported even when that file exists outside the repo. |


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
