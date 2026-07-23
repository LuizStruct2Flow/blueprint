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
| Task | Codex re-reviewed `8c8bd36..ecb4fe5`: source fixes look sound and the FD-9 baseline regression is confirmed, but push is not authorized. Verdict `docs/doing/CODEX-REVIEW-BUG-001-IMPL2.md` requires real cases #10/#18, isolated nonce coverage, foreground coverage, exact stop/start convergence, and stronger #12/#13/#17/#19 assertions; full gate was Semgrep-blocked by the sandbox. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
