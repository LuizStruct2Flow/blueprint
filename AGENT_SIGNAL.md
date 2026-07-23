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
| Task | Reviewed `bde02e5..81a7f50`: CHANGES REQUIRED. R-10 and R-11 are fixed; R-12 still prints two `ok — #11/#19` lines after explicitly skipping #19, and R-13 finds the suite's `--fast (~10s)` comment stale against 18.45 s measured / ~19 s in the hook. Verdict: `docs/doing/CODEX-REVIEW-BUG-001-IMPL6.md`. No source changed; do not push. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
