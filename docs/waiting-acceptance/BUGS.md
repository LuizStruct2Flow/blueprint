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
| **BUG-144** | **A failed dispatch left the mic with a provider that was no longer running, and nothing told the Orchestrator.** Fixed once (`45b0f87`), reopened twice: the first fix only matched `OVER_TO_<X>`, so an agent that claimed `ACTIVE` and died stayed stranded; the second never worked in production at all. | S2 | **LANDED**, CI green on `1d45861` (2026-09-23) | **Watch it work:** dispatch a persona whose provider is out of quota or otherwise fails (Kimi and Codex both did this on 2026-09-22). Within a poll or two the baton returns to `Holder=Eto State=OVER_TO_CLAUDE`, with a Task naming who failed. A dispatch that DOES hand back is left alone. **Check the watchers carry it:** `pgrep -af signal-watch.mts` shows three, each with a `cat` lifeline child holding its lock. | **Fix:** `recoverStrandedMic()` in `scripts/signal-watch.mts` recovers when the baton still names the dispatched Holder in `OVER_TO_<X>` OR `ACTIVE`, resolves the Orchestrator from `BP_STATE_ROOT` (the roster is at the repo root, not beside the baton), sources `roster.sh` with bash, re-checks Holder+State+Task immediately before publishing (a race that clobbered a legitimate new dispatch), and spawns every wake command with bash so a roster miss inside one cannot abort under dash. **Four rounds, two of them live failures after a green suite.** The root cause of the misses: `tests/mic-recovery` wrote a roster beside the fixture baton, a layout production never has, so it proved the fixture rather than the mechanism — recorded as a new row in [`../config/findings.md`](../config/findings.md)'s F-002 table. Authored by Philipp (Claude); reviewed by Thomas (Kimi), who found the wake-command half (F1) and proved the corrected fixture goes red when the old lookup returns. **Known stale comments, not fixed:** `scripts/lib/roster.sh:418` and the BUG-143 notes in two launchers still describe the old shell; all three are legacy shell files, so correcting a comment would force a whole-file port (TASK-067). The gate refused exactly that, correctly, mid-round. **Regression tests:** `tests/mic-recovery`, 5 cases named BUG-144. **Re-open if** a failed dispatch can leave the mic with a provider that is no longer running. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
