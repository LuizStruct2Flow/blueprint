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
| Task | BUG-001 implementation review: CHANGES REQUIRED; do not push. See docs/doing/CODEX-REVIEW-BUG-001-IMPL.md. Blockers: rev-5's 19 behavioral tests were not implemented (current suite has 7 mostly-static sections and even accepts zero supervisors); read_state accepts a missing nonce instead of failing closed; size+inode signal detection misses same-size in-place changes. Also make offset advancement conditional on successful emit. Core four byte/lock mechanisms are present; bash syntax, current test, and project pre-push hook pass but do not cover the missing contract. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
