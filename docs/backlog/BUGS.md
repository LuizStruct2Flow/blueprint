# Parked Bugs

Bugs that keep a `BUG-XXX` identity but aren't active work. Each row
carries the reproduction / trigger that re-opens it. See
[README.md](README.md) for the lifecycle.

| # | Bug | Last seen | Re-open trigger |
|---|---|---|---|
| **BUG-024** | **`codex-last-message.md` is not guaranteed written per run, and the wrapper asserts it is.** `start-codex-signal-watch.sh:144` passes `--output-last-message` to `codex exec`, and line 153 then prints *"see …/codex-last-message.md for the last message"* unconditionally. When a run does not write it, **the previous run's content stays in place** and that line vouches for it. Observed 2026-08-17: Alexey's dispatch finished at 17:40:46 and the file still held **2026-08-06**'s message — ten days old, a different item, a plausible format — and I read it as his verdict. The next dispatch (Alexis) *did* write it, so the file is overwritten on some runs and not others; **the cause is unresolved and the fix must not assume it.** The defect is that a stale file and a fresh one are indistinguishable to the reader, which is this repo's recurring shape (BUG-004 a hook that never ran, BUG-018 a refusal returning 0). Fix: stamp or truncate BEFORE the run, so a missing write leaves an empty or marked file rather than someone else's answer, and only vouch for it in the finished line if it changed. | 2026-08-17 | Fix when the dispatcher is next touched, or immediately — it is small and it misleads silently. Workaround, already in use: read the tail of `codex-runs.log` instead. |

**A promoted row leaves nothing behind.** The whole row moves; no stub, no
forwarding note. A row left behind after a promotion is the duplicate record
TASK-005 removed once already, and a forwarding note is the same thing one size
smaller — it goes stale the moment the item moves again.
