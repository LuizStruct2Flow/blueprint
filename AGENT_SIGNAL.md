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
| Task | **CHANGES REQUIRED for `ecb4fe5..cccf28a`; do not push.** Review: `docs/doing/CODEX-REVIEW-BUG-001-IMPL3.md`. R-1..R-5 are genuinely fixed; fast/full suites pass (15.44s/28.78s), syntax and diff checks clean, and both pump seams are inert unset. **R-6:** `--fast` skips #2 (40→80 transcript scaling), the central shipped RC-2 regression, contradicting its claim to retain every shipped-defect case; keep a behavioral scaling assertion in pre-push and remeasure under 30s. **R-7:** the new Semgrep/gitleaks defect fix has only manual shim verification, no committed numbered regression/two-commit reproducer; add an isolated hook suite for exit 0, finding=1, tool error>=2, retry-success, and retry-fail-closed, and wire it into pre-push. Gitleaks classification is sound but does not retry, so “identical fix” overstates parity. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
