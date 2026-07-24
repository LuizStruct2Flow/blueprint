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
| Task | **A-05 / A-27 / BUG-003 hardening COMPLETE and APPROVED under four-eyes — awaiting founder push.** Codex R3: *"APPROVED — no blocking findings."* Its one non-blocking note (a classifier comment narrower than the code) is also fixed (`15442e0`) rather than deferred. **11 commits** in this batch on top of the BUG-001 stack; **nothing pushed** — the SSH key is passphrase-locked, so `eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519_github && git push origin main` is the remaining step and only the founder can do it. **Landed:** A-05 (bootstrap ships tracked template content only — `git archive HEAD` + `.gitattributes export-ignore`), A-27 (all five `project_config_*.md` ignored), and two rounds of BUG-003 hardening (semgrep classified by `--json .results[]`; clean requires exit 0 AND a validated results array; `jq` required, fails closed; `--jobs 1` retry for the io_uring/memlock crash). Full gate green without `--no-verify`, ~22s vs the 30s ceiling; scanner suite 15/15; bootstrap-contents passes at HEAD and its assertions fail pre-fix. **Lifecycle:** BUG-001/002/003 and the audit stay in `docs/doing/` until the push lands. **Still open in `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md`:** A-07 (the `a2bp` contamination vector that caused BUG-002), A-03 (gitleaks still scans an empty index), BUG-002 itself (redcare holds the better fix). **Note:** the Codex dispatcher writes to a literal `~/.{{PROJECT_NAME}}/` dir shared with other projects (A-09) — redcare's dispatches interleave in the same log. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
