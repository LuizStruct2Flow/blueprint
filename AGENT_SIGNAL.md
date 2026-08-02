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
| Task | Codex round 2 done: timing audit CLEAN (SETTLE=2 verified sound for the quantisation race, case #5 fine, early-stop did NOT weaken #1/#5/#6, ~75s reproduced 3x independently), plus two new findings, both fixed and both verified by reproducing his bypasses first. R2-F1 MEDIUM: the manifest proved STRINGS existed, not that suites execute — a commented-out invocation still satisfied the unanchored grep, and discovery saw only tests/*/test.sh so a renamed runner was invisible. Fixed: comments stripped, anchored bash tests/<suite>/<file>.sh required, and every shell file under tests/ must belong to a declared suite. Both bypasses now fail closed. R2-F2 LOW: the SLO warned on EVERY successful run (120s/45s against a 142.3s/75s baseline), so it could not distinguish regression from normal and would be trained out; raised to 180s/95s with ~26% headroom, documented ratchet, and a test asserting a healthy gate is silent. Gate 140.1s, SLO now correctly quiet. NOTE: Codex flipped the mic to OVER_TO_CLAUDE, not OVER_TO_ETO — the roster rename has not reached its dispatch preamble. Minor, but it is the BUG-010 class again. BUG-005 in waiting-acceptance; BUG-010 accepted in done/. |
| _prior_ | **CHANGES-REQUESTED — review recorded in `docs/doing/CODEX-REVIEW-A03.md` (uncommitted: Codex sandbox cannot write `.git/index.lock`).** F1 HIGH: pushed A-03 `1c4dd4c` uses `<local> --not --remotes` for a new branch, so a commit already on any other/private remote is excluded when first disclosed to the target/public remote; reproduced (`all=1`, current selector=0). Fix against the destination remote or scan all reachable history, and add a multi-remote regression. F2 HIGH: unpushed dispatch guard permanently blocks an intentional byte-identical rerun for the watcher lifetime; the claimed one-poll delay is false, and restart also loses guard state. Use an explicit round/generation or atomic Task+State publication; test identical tasks in two legitimate rounds. F3 MEDIUM: pushed-state docs still say A-03 is next/nothing in flight. README process judgement: review the named commit snapshot + require clean/explicit claimed scope; an unstaged-tracked pre-push warning is only a backstop. Current suites and syntax/diff checks pass but miss F1/F2. **Do not push.** |
| Last update | 2026-08-02 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
