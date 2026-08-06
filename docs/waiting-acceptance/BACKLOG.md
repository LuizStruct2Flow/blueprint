# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-010** | **`HANDOVER.md` carries take-over data only — 530 lines → 79.** Three categories earn a place: WIP with the constraints a reader would otherwise get wrong, EPHEMERAL state no command can reconstruct, and live hazards still armed. Everything derivable from `ls` or `git log` is forbidden. **DoD §10 required the opposite** and changed in the same commit, or the file regrows on the next handoff and §G gates on the old rule. Host quirks and standing founder decisions moved to `project_config_overview.md` rather than being deleted. | S3 | KEEP | Landed 2026-08-05 (#30). |
| **TASK-008** | **The pre-push gate came in under its SLO without testing less** — 198.6 s → **159.1 s**, `signal-dispatch` 74.9 s → 32.5 s, all six assertions intact and no suite moved a tier. Implemented by Jesko (Codex) on the founder's instruction to delegate; reviewed and landed here because the Codex sandbox could not branch or commit. One idea applied three times: every sleep was asked whether it was *required by an assertion* or merely *how long someone guessed*. Readiness now waits on the watcher's liveness lock (BUG-022) instead of a settle window; the negative-case wait is `settle + 2·poll`, which is the real bound; and a wait about poll cadence stopped being expressed in settle units. | S3 | KEEP | Landed 2026-08-05 (#29). |

## What to test — TASK-010

Open [`../doing/HANDOVER.md`](../doing/HANDOVER.md). It should tell you, and
**only** tell you: what is open and what a person picking it up would get wrong,
what died with the session and how to re-arm it, and what trap is still live.
If it tells you how many items are in a folder or what shipped today, it has
regrown and the item failed.

## What to test — TASK-008

Run the gate — `git push` on any branch, or read the tail of the last push:

- **The SLO line no longer prints.** A healthy gate is silent; that is asserted
  by `tests/pipeline`. Anything under 180 s total and 95 s per stage passes.
- **`tests/manifest/test.sh` passes** — no suite changed tiers, and no rationale
  argues from cost. This is the check that would catch the wrong kind of speedup.
- **`bash tests/signal-dispatch/test.sh` still reports all six assertions**, in
  roughly 32 s rather than 75 s.
- Optionally, re-run it at the original pacing with `SIGNAL_TEST_SETTLE=3` to
  confirm no assertion depends on the faster clock.
