# Founder-accepted rows

Rows the founder has explicitly accepted. This is the source of truth for
*what has been delivered* — not what has been merged. See
[README.md](README.md) for the lifecycle.

**This file appears with the first acceptance** — absence means none yet, not a
missing file.

| # | Item | Accepted | Sev | Category |
|---|---|---|---|---|
| **TASK-010** | **`HANDOVER.md` carries take-over data only — 530 lines → 79.** Three categories earn a place: WIP with the constraints a reader would otherwise get wrong, EPHEMERAL state no command can reconstruct, and live hazards still armed. Everything derivable from `ls` or `git log` is forbidden. **DoD §10 required the opposite** and changed in the same commit, or the file regrows on the next handoff and §G gates on the old rule. Host quirks and standing founder decisions moved to `project_config_overview.md` rather than being deleted. **Accepted on a reading test**, deliberately: the failure mode is prose that restates what a command already answers, and no command can check that. | 2026-08-06 | S3 | KEEP |
| **TASK-008** | **The pre-push gate came in under its SLO without testing less** — 198.6 s → **159.1 s**, `signal-dispatch` 74.9 s → 32.5 s, all six assertions intact and no suite moved a tier. Implemented by Jesko (Codex) on the founder's instruction to delegate; reviewed and landed here because the Codex sandbox could not branch or commit. One idea applied three times: every sleep was asked whether it was *required by an assertion* or merely *how long someone guessed*. Readiness now waits on the watcher's liveness lock (BUG-022) instead of a settle window; the negative-case wait is `settle + 2·poll`, which is the real bound; and a wait about poll cadence stopped being expressed in settle units. **Accepted on:** a healthy gate printing no SLO line, `tests/manifest` holding every tier, and `tests/signal-dispatch` still reporting all six assertions — additionally at the original pacing (`SIGNAL_TEST_SETTLE=3`), so no assertion depends on the faster clock. | 2026-08-06 | S3 | KEEP |
| **TASK-007** | Render the DoD as PIPELINE STAGES, so the handoff checklist prints like every other gate step and its ABSENCE is visible — the FEATURE-002 argument applied to §7. Unlocked by TASK-002: every commit subject now starts with its item, so the gate can derive which items a push serves and check the DoD against them. Judgement-only steps print rather than pretend to verify. | 2026-08-05 | — | KEEP |
| **TASK-006** | Reconcile the documentation with what the gates now ENFORCE. Six drifts: CLAUDE.md and DoD still documented `fix(BUG-XXX):`, which the commit-msg hook rejects; `doing/BUGS.md` said BUG/FEATURE were the "only" lifecycle IDs though TASK now exists; the deck was missing the eight intake rules, both new gates, and the fifth lcm point; README and A2BP_PLAYBOOK still prescribed Conventional Commits. | 2026-08-05 | — | KEEP |
| **TASK-005** | Delete `waiting-acceptance/INDEX.md`. The lifecycle has TWO record files — `BACKLOG.md` and `BUGS.md` — that travel through the four folders; INDEX was a third, holding a copy of the same membership plus history and process that belong elsewhere. When it drifted (5 rows listed vs 14 real) the first response was a test to hold the two in step instead of asking why there were two. | 2026-08-05 | — | KEEP |
| **TASK-003** | Refuse a commit (and a push) on `main` in a BLUEPRINT checkout. CLAUDE.md §"Never push to the blueprint's `main`" says "commit on a branch, or do not commit yet" and neither door was guarded. Does NOT fire in derived projects — they are trunk-based and commit to `main` by design. | 2026-08-05 | — | KEEP |
| **TASK-002** | Every commit names the backlog item it serves. **Rejected on first delivery and re-fixed**: the `commit-msg` hook is client-side, so it could never reach the path every blueprint change takes — GitHub composes the squash-merge subject from the PR title, on its own servers. Now one shared rule (`scripts/lib/commit-subject.sh`) backs both the hook and `scripts/check-commit-subjects.sh`, and CI checks the PR title, the branch's commits, and what lands on `main`. | 2026-08-05 | — | KEEP |
| **TASK-001** | Write the concrete work-intake rules into `docs/DoD.md` (§1b) and move the `lcm` checklist there from CLAUDE.md, adding the fifth point the passes showed was missing — that the lifecycle DOCUMENTS say something true, not just that folder membership is right. Establishes `TASK-XXX` as a third lifecycle ID alongside `BUG-`/`FEATURE-`. | 2026-08-05 | — | KEEP |

**TASK-002 was rejected on its first pass and accepted on its second, the same
day.** Worth keeping visible: the rejection was correct and cheap, and it found a
defect no amount of reviewing the hook would have — the hook was never wrong. It
was in the wrong place. The evidence was a real commit (`5fe89e0`) that had
already landed on `main` in violation while every gate reported green.
