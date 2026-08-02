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
| Holder | Eto |
| State | OVER_TO_USER |
| Task | a2bp trust boundary documented honestly (founder decision 2026-08-02). Verified on the remote: enforce_admins=false, restrictions=null, effective permission admin — so branch protection PR requirement does NOT apply to the identity every agent presents, and a derived project running plain git push reaches main directly. "a2bp cannot write into the blueprint" was an overclaim; corrected in CLAUDE.md, README.md, docs/A2BP_PLAYBOOK.md, project_config_paths.md, way-of-working.md, INDEX.md and the FEATURE-001 README. Folded into BUG-011 rather than a new number, per founder. Not fixable by repo settings — no ruleset distinguishes a derived agent from the owner on one credential; needs a separate narrower credential or a fork, independent of enforce_admins so it would NOT cost trunk-based. INCIDENT: something set core.bare=true on this repo at 12:40 (not me — after my last git command); git refused all operations until unset. Working tree and history intact. Worth finding what did it. Blocked on founder: BUG-004 Half B, BUG-005, FEATURE-001 acceptance, ai-server-blueprint decision. |
| _prior_ | **CHANGES-REQUESTED — review recorded in `docs/doing/CODEX-REVIEW-A03.md` (uncommitted: Codex sandbox cannot write `.git/index.lock`).** F1 HIGH: pushed A-03 `1c4dd4c` uses `<local> --not --remotes` for a new branch, so a commit already on any other/private remote is excluded when first disclosed to the target/public remote; reproduced (`all=1`, current selector=0). Fix against the destination remote or scan all reachable history, and add a multi-remote regression. F2 HIGH: unpushed dispatch guard permanently blocks an intentional byte-identical rerun for the watcher lifetime; the claimed one-poll delay is false, and restart also loses guard state. Use an explicit round/generation or atomic Task+State publication; test identical tasks in two legitimate rounds. F3 MEDIUM: pushed-state docs still say A-03 is next/nothing in flight. README process judgement: review the named commit snapshot + require clean/explicit claimed scope; an unstaged-tracked pre-push warning is only a backstop. Current suites and syntax/diff checks pass but miss F1/F2. **Do not push.** |
| Last update | 2026-08-02 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
