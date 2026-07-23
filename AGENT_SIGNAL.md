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
| Task | **BUG-001 + BUG-003 complete and CLEAN under four-eyes review — awaiting founder push.** 16 commits local, nothing pushed: the SSH key is passphrase-locked, so `eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519_github && git push origin main` is the remaining step and only the founder can do it. Codex authorized the push after 8 review rounds (`docs/doing/CODEX-REVIEW-BUG-001-IMPL7.md`); BUG-001 itself took 5 consensus rounds before implementation was authorized. Full gate green without `--no-verify` (~21 s vs the 30 s ceiling). **Lifecycle note:** BUG-001/002/003 stay in `docs/doing/` until the push lands — pushing is what moves them to `waiting-acceptance/`. **Still open and untouched** in `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md`: A-05 (bootstrap ships `.env`/`SONAR_TOKEN` into every derived project), A-07 (the `a2bp` vector that caused BUG-002), A-27 (threat model + infra account IDs would go public), A-03 (gitleaks still scans an empty index), and BUG-002 itself. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
