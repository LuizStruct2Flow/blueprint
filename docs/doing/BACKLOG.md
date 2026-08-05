# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-010** | **`HANDOVER.md` carries take-over data only.** Founder, 2026-08-05: *"the file should only contain the data needed for the next agents that will take something over that is open / wip, all other things should be documented in the tasks/bugs \|\| commits \|\| md files."* Three categories earn a place — WIP with the constraints a reader would otherwise get wrong, EPHEMERAL state no command can reconstruct, and live hazards that are still armed. Everything derivable from `ls` or `git log` is forbidden. **DoD §10 required the opposite** and had to change with it, or the file regrows and §G gates on the old rule. Host quirks and standing founder decisions moved to `project_config_overview.md`. **530 lines → 79.** | S3 | KEEP | Founder instruction 2026-08-05. Re-opens if the file passes ~120 lines or starts restating folder/git state. |
| **FEATURE-003** | **Reader only — the writer stays parked.** Build `scripts/session-resume.sh`, which DERIVES where a woken session is from `git status`, branch/ahead-behind, the four lifecycle folder counts, the live baton and the durable journal. It holds no state, so it cannot go stale — which is the whole reason the authored snapshot is not being built. The one authored part that survives is a MARKER APPEND at handoff: paired `<id>`/`</id>` into `logs/state/signal-history.log`, which records an event nothing can reconstruct later. Full plan: [`PLAN-FEATURE-003-session-snapshot.md`](PLAN-FEATURE-003-session-snapshot.md) §4. | — | KEEP | Founder promoted 2026-08-05 ("3. ok"), on Klaus's and Alexis's converging recommendation. The plan's §6 questions on cadence and scope remain open. |

## Promoted 2026-08-05, and what to hold them to

The load-bearing requirement on FEATURE-003 is **not** that the resume report is
useful — it is that an INCOMPLETE replay is loud. The activity feed is truncated
on every daemon start, so a marker can legitimately be missing; when it is, the
tool must say so rather than print a short replay that reads like a quiet one.
That single behaviour is what the whole feature stands or falls on, and it is
the lesson of BUG-004, BUG-018 and every guard repaired this week.
