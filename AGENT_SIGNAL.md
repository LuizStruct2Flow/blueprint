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
| Task | HANDOVER for a VSCode/session restart — **read `docs/doing/HANDOVER.md` §1 + §3 first.** `origin/main` at `32adcf3`. **A-09 FULLY CLOSED** (both halves) + A-22 R11, pushed, four-eyes CLEAN, awaiting founder acceptance. **NEXT: A-07** (a2bp contamination guard). **Loose ends:** (1) `205f6f7` R12a bound-test hardening — committed, UNPUSHED, unreviewed; (2) agent-exchange timestamp UTC→Berlin-local switch is 15/16 headers done but UNCOMMITTED (1 header + README remain), blocked by a permissions issue; (3) a settings.local.json vscode read rule was made relative and likely broke — see HANDOVER §3b. |
| Last update | 2026-07-26 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
