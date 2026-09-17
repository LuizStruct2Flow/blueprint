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
| **BUG-137** | **The feed drops a subagent's first lines when its transcript appears after the feed started.** Observed 2026-09-17 19:52 on a live probe: Klaus's nested general-purpose helper ran `wc -l CLAUDE.md` then `wc -l README.md` (both in its transcript, `agent-a3b9e55dba265076c.jsonl`), and `logs/agent-activity.log` shows only the README line. `seed_offset` (`scripts/agent-activity.sh:524`) starts every newly discovered file at its current size. That is correct for files that already existed when the supervisor started (a restart must not replay history), but a transcript born while the feed runs loses whatever was written before the next scan. | S2 | **FIXED — `48282c8` reproducer, `9b2f088` fix, pushed 2026-09-17**, CI green on `9b2f088` (run 35256472298) | Dispatch a persona that spawns its own helper, then compare the helper's transcript with the feed: every tool call in `~/.claude/projects/…/subagents/agent-<id>.jsonl` has a line in `logs/agent-activity.log`, including its first. Restart the feed while agents have run before (`agent-activity.sh --daemon`): their old lines are not replayed. | **Fix:** only files present at the supervisor's first scan start at end of file; a file first seen later is read from its start. **Regression test:** named BUG-137. **Re-open if** a subagent's first tool call is in its transcript but not in the feed. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
