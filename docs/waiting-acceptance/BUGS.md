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

| # | Bug | Severity | Status | What to test | Detail |
|---|---|---|---|---|---|
| **BUG-021** | Codex output was labelled `[CODEX]`, never `[Persona - Codex]` | S3 | fixed, on `main` (#25) | Dispatch a Codex persona and watch `logs/agent-activity.log` — its lines must read `[<Persona> - Codex]`, not `[CODEX]`. Check the label follows a roster **rename** without restarting anything. Then delete `scripts/lib/roster.sh` in a scratch copy and confirm the dispatch STILL happens, unlabelled: the label fails open. | The persona is a per-dispatch fact, so the feed could never know it — a label there is bound once at daemon start. The launcher now builds it from `bp_roster_label`, the same lookup the feed uses for mic flips, and writes through the shared appender. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
