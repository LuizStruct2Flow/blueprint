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
| **A-03 follow-up** — secret-gate multi-remote hole | The first A-03 fix was **pushed as `1c4dd4c` BEFORE four-eyes**, and the review then found a real hole in it (F1: `--not --remotes` subtracts *every* remote, so a commit already on a private mirror is skipped when first disclosed to a public one). Fix + regressions committed, **unpushed**, awaiting the next review round. Record: [`../waiting-acceptance/A-03-secret-gate/`](../waiting-acceptance/A-03-secret-gate/). |
| **Dispatch settle window** | Watcher waits for the signal to stop changing before dispatching. First cut (refuse identical Task) was rejected by four-eyes and replaced. Committed, unpushed. |

Next after those: **A-08** (`LWA_FEED_*` env vars — BUG-002's contamination in
namespace form), in [BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md).

**A-07** was pushed on 2026-07-29 after seven four-eyes rounds and moved to
[`waiting-acceptance/A-07-a2bp-guard/`](../waiting-acceptance/A-07-a2bp-guard/).
