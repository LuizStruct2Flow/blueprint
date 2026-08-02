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
| Holder | Anna |
| State | OVER_TO_USER |
| Task | BUG-010 FIXED + PUSHED (726d299): the roster is now the single source of persona identity — one parser (scripts/lib/roster.sh) read by the feed and team-kickoff, keyed by ROLE, padding-tolerant, warns instead of failing silently. New: agent-activity.sh --whoami. NOTE: your roster says the Orchestrator is Anna, so that is who I am now — it read Sylvia everywhere until this fix. Row moved to waiting-acceptance/BUGS.md; acceptance test is in that row (QA-2 may accept: agent-protocol, not user-surface). Separately diagnosed the evo-x2 connection drops: dual default routes across two subnets (eno1 192.168.0.x + wlp195s0 192.168.178.x) churn Tailscale endpoints 63x/day and hold macbook-air-2 on the Frankfurt DERP relay; fix is to drop the second default route. Still blocked on founder: BUG-004 Half B, BUG-005, FEATURE-001 acceptance, ai-server-blueprint decision. |
| _prior_ | **CHANGES-REQUESTED — review recorded in `docs/doing/CODEX-REVIEW-A03.md` (uncommitted: Codex sandbox cannot write `.git/index.lock`).** F1 HIGH: pushed A-03 `1c4dd4c` uses `<local> --not --remotes` for a new branch, so a commit already on any other/private remote is excluded when first disclosed to the target/public remote; reproduced (`all=1`, current selector=0). Fix against the destination remote or scan all reachable history, and add a multi-remote regression. F2 HIGH: unpushed dispatch guard permanently blocks an intentional byte-identical rerun for the watcher lifetime; the claimed one-poll delay is false, and restart also loses guard state. Use an explicit round/generation or atomic Task+State publication; test identical tasks in two legitimate rounds. F3 MEDIUM: pushed-state docs still say A-03 is next/nothing in flight. README process judgement: review the named commit snapshot + require clean/explicit claimed scope; an unstaged-tracked pre-push warning is only a backstop. Current suites and syntax/diff checks pass but miss F1/F2. **Do not push.** |
| Last update | 2026-08-02 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
