# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-008** | **The pre-push gate is slow and getting slower** — 197 s against its own 180 s SLO warning, which has fired on every recent run. `signal-dispatch` alone is ~75 s. A warning that is always on is one nobody reads, so this is not cosmetic: it retires the only signal we have that the gate is degrading. Find where the time goes and cut it. **Explicitly NOT by demoting a suite to CI** — that is the coverage-decided-on-the-clock failure BUG-005 exists to prevent, and `tests/SUITES.md` rejects a cost-based rationale outright. `signal-dispatch` has form: **125.4 s → 37.5 s** with every assertion intact, once someone asked *why* it was slow rather than *where to put it* — and it has since crept back. | S3 | KEEP | **Delegated to Codex 2026-08-05** at the founder's direction. Closes when the gate is under its SLO with no suite moved or weakened. |
| **FEATURE-003** | **Reader only — the writer stays parked.** Build `scripts/session-resume.sh`, which DERIVES where a woken session is from `git status`, branch/ahead-behind, the four lifecycle folder counts, the live baton and the durable journal. It holds no state, so it cannot go stale — which is the whole reason the authored snapshot is not being built. The one authored part that survives is a MARKER APPEND at handoff: paired `<id>`/`</id>` into `logs/state/signal-history.log`, which records an event nothing can reconstruct later. Full plan: [`PLAN-FEATURE-003-session-snapshot.md`](PLAN-FEATURE-003-session-snapshot.md) §4. | — | KEEP | Founder promoted 2026-08-05 ("3. ok"), on Klaus's and Alexis's converging recommendation. The plan's §6 questions on cadence and scope remain open. |

## Promoted 2026-08-05, and what to hold them to

The load-bearing requirement on FEATURE-003 is **not** that the resume report is
useful — it is that an INCOMPLETE replay is loud. The activity feed is truncated
on every daemon start, so a marker can legitimately be missing; when it is, the
tool must say so rather than print a short replay that reads like a quiet one.
That single behaviour is what the whole feature stands or falls on, and it is
the lesson of BUG-004, BUG-018 and every guard repaired this week.
