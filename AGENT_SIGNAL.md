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
| Task | Codex CHANGES-REQUESTED on BUG-005 both addressed. F2: signal-dispatch re-clocked 125.4s -> 37.5s, all six assertions intact, verified again at original pacing in CI; suite now IN the gate; stale CI rationale fixed. F1: the rule now has controls — tests/SUITES.md classifies every suite and tests/manifest fails the push on an unclassified suite, a pre-push suite the gate never invokes, or a rationale arguing from cost; plus a NON-BLOCKING SLO (120s/45s) that warns and cannot demote. The manifest paid for itself on its first run: found a2bp-e2e with no CI backstop and drift-in-blueprint running NOWHERE (A-15 exactly). Gate 22 -> 25 stages, 63.8s -> 104.3s, green. BUG-005 in waiting-acceptance; BUG-010 accepted and in done/. Open question for you: re-run Codex for a second round on this, or accept? |
| _prior_ | **CHANGES-REQUESTED — review recorded in `docs/doing/CODEX-REVIEW-A03.md` (uncommitted: Codex sandbox cannot write `.git/index.lock`).** F1 HIGH: pushed A-03 `1c4dd4c` uses `<local> --not --remotes` for a new branch, so a commit already on any other/private remote is excluded when first disclosed to the target/public remote; reproduced (`all=1`, current selector=0). Fix against the destination remote or scan all reachable history, and add a multi-remote regression. F2 HIGH: unpushed dispatch guard permanently blocks an intentional byte-identical rerun for the watcher lifetime; the claimed one-poll delay is false, and restart also loses guard state. Use an explicit round/generation or atomic Task+State publication; test identical tasks in two legitimate rounds. F3 MEDIUM: pushed-state docs still say A-03 is next/nothing in flight. README process judgement: review the named commit snapshot + require clean/explicit claimed scope; an unstaged-tracked pre-push warning is only a backstop. Current suites and syntax/diff checks pass but miss F1/F2. **Do not push.** |
| Last update | 2026-08-02 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
