# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-003** | Refuse a commit (and a push) on `main` in a BLUEPRINT checkout. CLAUDE.md §"Never push to the blueprint's `main`" says "commit on a branch, or do not commit yet" and neither door was guarded. Must NOT fire in derived projects — they are trunk-based and commit to `main` by design. | — | KEEP | Founder asked for it 2026-08-03; promoted the same day. |
| **TASK-002** | A `commit-msg` hook that REJECTS a commit whose subject does not start with its backlog item (`BUG#20:`, `FEATURE#3:`, `TASK#1:`). Makes §1b rule 1 enforced rather than remembered — the same move as the no-chain guard and the fixture-isolation check. | — | KEEP | Founder asked for it 2026-08-03; promoted the same day. |
| **TASK-001** | Write the concrete work-intake rules into `docs/DoD.md` (§1b) and move the `lcm` checklist there from CLAUDE.md, adding the fifth point today's passes showed was missing — that the lifecycle DOCUMENTS say something true, not just that folder membership is right. Establishes `TASK-XXX` as a third lifecycle ID alongside `BUG-`/`FEATURE-`. | — | KEEP | Founder asked for it 2026-08-03; promoted the same day. |
