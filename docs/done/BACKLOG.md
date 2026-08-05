# Founder-accepted rows

Rows the founder has explicitly accepted. This is the source of truth for
*what has been delivered* — not what has been merged. See
[README.md](README.md) for the lifecycle.

**This file appears with the first acceptance** — absence means none yet, not a
missing file.

| # | Item | Accepted | Sev | Category |
|---|---|---|---|---|
| **TASK-007** | Render the DoD as PIPELINE STAGES, so the handoff checklist prints like every other gate step and its ABSENCE is visible — the FEATURE-002 argument applied to §7. Unlocked by TASK-002: every commit subject now starts with its item, so the gate can derive which items a push serves and check the DoD against them. Judgement-only steps print rather than pretend to verify. | 2026-08-05 | — | KEEP |
| **TASK-006** | Reconcile the documentation with what the gates now ENFORCE. Six drifts: CLAUDE.md and DoD still documented `fix(BUG-XXX):`, which the commit-msg hook rejects; `doing/BUGS.md` said BUG/FEATURE were the "only" lifecycle IDs though TASK now exists; the deck was missing the eight intake rules, both new gates, and the fifth lcm point; README and A2BP_PLAYBOOK still prescribed Conventional Commits. | 2026-08-05 | — | KEEP |
| **TASK-005** | Delete `waiting-acceptance/INDEX.md`. The lifecycle has TWO record files — `BACKLOG.md` and `BUGS.md` — that travel through the four folders; INDEX was a third, holding a copy of the same membership plus history and process that belong elsewhere. When it drifted (5 rows listed vs 14 real) the first response was a test to hold the two in step instead of asking why there were two. | 2026-08-05 | — | KEEP |
| **TASK-003** | Refuse a commit (and a push) on `main` in a BLUEPRINT checkout. CLAUDE.md §"Never push to the blueprint's `main`" says "commit on a branch, or do not commit yet" and neither door was guarded. Does NOT fire in derived projects — they are trunk-based and commit to `main` by design. | 2026-08-05 | — | KEEP |
| **TASK-001** | Write the concrete work-intake rules into `docs/DoD.md` (§1b) and move the `lcm` checklist there from CLAUDE.md, adding the fifth point the passes showed was missing — that the lifecycle DOCUMENTS say something true, not just that folder membership is right. Establishes `TASK-XXX` as a third lifecycle ID alongside `BUG-`/`FEATURE-`. | 2026-08-05 | — | KEEP |

**TASK-002 was rejected in the same pass** and returned to `doing/` — the
commit-msg gate it delivered does not cover the squash-merge path, which is the
one path every blueprint change takes. Accepting the five above is not a
judgement that the intake rules are fully enforced.
