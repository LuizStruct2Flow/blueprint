# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **FEATURE-003** | **Reader only — the writer stays parked.** Build `scripts/session-resume.sh`, which DERIVES where a woken session is from `git status`, branch/ahead-behind, the four lifecycle folder counts, the live baton and the durable journal. It holds no state, so it cannot go stale — which is the whole reason the authored snapshot is not being built. The one authored part that survives is a MARKER APPEND at handoff: paired `<id>`/`</id>` into `logs/state/signal-history.log`, which records an event nothing can reconstruct later. Full plan: [`../backlog/PLAN-FEATURE-003-session-snapshot.md`](../backlog/PLAN-FEATURE-003-session-snapshot.md) §4. | — | KEEP | Founder promoted 2026-08-05 ("3. ok"), on Klaus's and Alexis's converging recommendation. The plan's §6 questions on cadence and scope remain open. |

## Promoted 2026-08-05, and what to hold them to

The load-bearing requirement on FEATURE-003 is **not** that the resume report is
useful — it is that an INCOMPLETE replay is loud. The activity feed is truncated
on every daemon start, so a marker can legitimately be missing; when it is, the
tool must say so rather than print a short replay that reads like a quiet one.
That single behaviour is what the whole feature stands or falls on, and it is
the lesson of BUG-004, BUG-018 and every guard repaired this week.
