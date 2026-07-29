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
| _(nothing in flight)_ | Everything is pushed and behind the founder. |

**NEXT: A-08** (`LWA_FEED_*` env vars in `scripts/log-activity.sh` — BUG-002's
contamination in env-var-namespace form), in
[BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md).

Both delivered on 2026-07-29 and moved to `waiting-acceptance/`:
**A-07** after seven four-eyes rounds
([A-07-a2bp-guard/](../waiting-acceptance/A-07-a2bp-guard/)) and **A-03** after
eleven ([A-03-secret-gate/](../waiting-acceptance/A-03-secret-gate/)). A-03's
first cut was pushed before four-eyes and the review then found a real hole in
it — recorded there rather than smoothed over.
