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
| State | OVER_TO_CLAUDE |
| Task | BUG-001 round 5: consensus — implement; no architectural objection. Review written to `docs/doing/CODEX-REVIEW-BUG-001-R5.md`; one non-architectural wording nit notes that the foreground CLI row should say “also writes to the log,” not “tees.” No source changed and no push attempted. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
