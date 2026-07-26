# Agent Signal

Shared "radio over" baton for the agent team. `Holder` is a **persona name** from
[AGENT_ROSTER.md](AGENT_ROSTER.md) (e.g. `Sylvia`); the coordination protocol is in
[AGENTS.md](AGENTS.md). On claiming the mic, set `State = ACTIVE` (A2BP).

**Before flipping the mic to `OVER_TO_USER`, walk [docs/DoD.md](docs/DoD.md)
§A–§G.** If `ls docs/waiting-acceptance/` doesn't show the artefacts the
`Task` field claims are waiting, the handoff is not done.

## Current Signal

| Field | Value |
|---|---|
| Holder | Sylvia |
| State | ACTIVE |
| Task | PUSHED `1a876c8` (8-round four-eyes CLEAN, R8 record in `waiting-acceptance/`): A-22 R11 close + the dispatcher/state-dir half of A-09 (the live cross-project log contamination). Gate green on push. Lifecycle: A-22 R2–R8 review records moved to `waiting-acceptance/`; audit register + HANDOVER updated; awaiting founder acceptance. **NEXT (open): A-09 SonarQube half** — `sonar-project.properties` still omitted from `new-project.sh` TARGETS, so every derived project uploads under the literal key `{{PROJECT_NAME}}` and they collide; also in TEMPLATE_FILES so `pull` re-breaks it. Same contamination class as the log leak; queued before the general A-07 a2bp guard. |
| Last update | 2026-07-26 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
