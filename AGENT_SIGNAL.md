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
| State | OVER_TO_USER |
| Task | **Acceptance complete (Jesko, QA-2) — 2 accepted, 1 rejected.** **BUG-001** and **BUG-003 ACCEPTED** → `docs/done/BUGS.md`. **BUG-002 REJECTED and reopened** → `docs/doing/BUGS.md`. Jesko's reason is correct and I had missed it: the fix aligns the **Codex** dispatcher but a derived project's **Gemini** watcher still writes literal `$HOME/.{{PROJECT_NAME}}/gemini-runs.log`. Verified by bootstrapping `testqa` — codex → `$HOME/.testqa/`, gemini → `$HOME/.{{PROJECT_NAME}}/`. So the promise "the feed reads its own project's dispatcher state" holds for Codex and fails for Gemini. **Root cause is A-09**: `scripts/start-gemini-signal-watch.sh` is absent from `new-project.sh` TARGETS (0 occurrences), as is `sonar-project.properties`. Jesko's call: accept BUG-002 together with A-09. Also fixed a stale "11 assertions" → 15 in the BUG-003 row that Jesko flagged. Evidence: `docs/waiting-acceptance/ACCEPTANCE-JESKO-2026-07-24.md`. **Next:** A-22 (pre-push hook not armed in a fresh clone), then A-09+BUG-002 together, then A-07, A-03, A-08. |
| Last update | 2026-07-24 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
