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
| Task | **`lcm` pass complete (2026-07-24) — mic with founder.** Every lifecycle folder now matches reality. **Moved `doing/` → `waiting-acceptance/`** (pushed, awaiting your acceptance): **BUG-001, BUG-002, BUG-003**, `PLAN-BUG-001.md`, and 16 Codex review records — plans travel with the work per CLAUDE.md. **Correction found by the pass:** BUG-002's row still said "fix pending" — it was actually fixed and pushed inside the BUG-001 rewrite (`state_dir` is now `${AGENT_STATE_HOME:-$HOME/.$(basename "$repo_root")}`). Row corrected and moved. **Stayed in `doing/`:** the audit register (`BLUEPRINT-AUDIT-2026-07-23.md`, open findings) and `HANDOVER.md`, which was still the raw template with 16 unfilled placeholders and is now current. **`done/` untouched** — promotion needs your explicit acceptance; nothing auto-promoted. **`backlog/` empty**, so no re-open triggers are owed. **Next action is A-22:** `core.hooksPath` was unset, so the pre-push gate never ran — the first push of 12 commits went out **ungated**. Wired locally; a fresh clone still has the gap because the claimed `postinstall` auto-wire does not exist (no root `package.json`). Then A-07 (the `a2bp` contamination vector), A-03 (gitleaks scans an empty index), A-08, A-09. |
| Last update | 2026-07-24 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
