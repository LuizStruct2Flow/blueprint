# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|

_No active bugs._ BUG-002 moved to `waiting-acceptance/` on 2026-07-27: its
blocker (A-09) is fixed and pushed, so it is no longer being implemented.

## Active non-bug work

Audit findings live in
[BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md), not here.
What is genuinely in flight right now:

| Item | State |
|---|---|
| **A-38 — the pre-push gate is at its ceiling** | Measured 2026-07-30: the gate runs **~29s against a hard 30s ceiling**, and **`tests/agent-activity-bound/test.sh --fast` alone is 18.1s of it** — more than every other suite combined (11s). It is 18s of *fixed sleeps* driving a real watcher, not work. The immediate consequence is already visible: `tests/staleness/test.sh` had to be pushed to CI-only, and `drift-integration.sh --fast` cut to 2 of 5 cases, purely for budget — coverage decided by the clock instead of by risk. CLAUDE.md §"Pre-push tolerance" says move work OUT rather than weaken the ceiling, and the next suite to be added has nowhere to go. **The obvious fix does not work, and that is the finding.** Those sleeps are not lazy polling — they are NEGATIVE assertions ("an incomplete record was NOT emitted", "an unchanged signal file emitted nothing further"), and you cannot poll for the absence of an event. They are already sized as small multiples of `AGENT_FEED_TICK`, which the suite already sets to 0.25s. So the levers are: shorten the multiples (weakens the negative assertions), or move whole cases to CI. Both are judgement calls about coverage, not refactors, which is why this needs a founder decision rather than an afternoon. Not started; no code touched — the suite protects BUG-001 (load 175 for 2.7 days). |
| **A-39 — A-07's guard suite was pushed out of the gate by A-38** | The a2bp contamination suite went 2.3s → 6.0s when it started driving real transport (27 CLI runs against a local remote instead of two files in place). With A-38 eating 18s of the 30s ceiling there was no room, so the full 41-assertion suite moved to CI and the gate keeps `tests/a2bp-e2e` instead — which covers the leak-critical WIRING (contamination blocks the whole request, nothing is pushed) but not the detection matrix. This is a real reduction in what blocks a push, made for budget rather than risk. It reverses the moment A-38 is resolved. |
| **A-22 — REOPENED 2026-07-29** | QA-2 rejected it with a live reproduction: a fresh clone, a real high-entropy token committed, `origin` redirected to a throwaway bare repo, and a real push executed without ever running the feed or drift — `real_ungated_push_rc=0`, `secret_commit_reached_destination=yes`. `arm_gate` works; the acceptance boundary was never "the arming paths work" but "a human cannot clone and push without invoking them". **Not closable by another local hook** — a pre-push hook is repo-local, absent on a clone, and defeated by `--no-verify`. Needs a founder trade on server-side enforcement (**A-37**): required checks do block direct pushes to a protected branch, but a SHA must exist on some ref for checks to run, and this repo is trunk-based with no branches. Folder: [A-22-gate-arming/](A-22-gate-arming/). |

**A-22 needs a decision before it needs code.** Do not attempt another local
mechanism — that is what the rejection rules out. The open question is whether
the founder accepts branch-based or protected-branch enforcement, or accepts
the residual risk explicitly.

**NEXT after that: A-08** (`LWA_FEED_*` env vars in `scripts/log-activity.sh` —
BUG-002's contamination in env-var-namespace form), in
[BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md).

Everything else delivered on 2026-07-29 is ACCEPTED and in
[`../done/`](../done/) — eight items, verdicts and evidence in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
