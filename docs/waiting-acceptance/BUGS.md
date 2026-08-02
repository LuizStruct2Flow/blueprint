# Bugs — pushed to main, awaiting founder acceptance

Fixed and pushed; awaiting the founder's explicit acceptance signal before they
move to `docs/done/BUGS.md`. Claude does NOT auto-promote to `done/`. If a
regression is found, the row moves back to `docs/doing/BUGS.md`.

See [README.md](README.md) for the lifecycle.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| **BUG-005** | The pre-push gate was at its 30 s ceiling, and coverage was being decided by the clock | S2 | **DECIDED + IMPLEMENTED 2026-08-02** — awaiting acceptance | Founder decision: *"I don't need this 30 seconds ceiling, as long as I see that the gates are working and doing what they need to do."* The ceiling is removed and replaced with a rule — **coverage is decided on risk, never on the clock** (CLAUDE.md §"Pre-push tolerance", DoD §3.7). The diagnosis held up exactly as written: the budget had started deciding what was tested, silently, while the gate still reported "all checks passed". **Restored to the gate:** `a2bp-contamination` (41 assertions guarding the door BUG-002 and A-09 came through — exiled for growing 2.3s→6.0s), `staleness/test.sh` (offer bounds + unknown-never-current, called "a forced choice, not a preference" at the time), `signal-set` (0.2s — excluded by a rule that only existed because the gate sat at 27.6s of 30s), and the four `--fast` downgrades now run in full: `agent-activity-bound` (+10.4s — restores the race / fault-injection cases guarding BUG-001), `pre-push-secrets` (+5.1s — the budget cases proving the scan fails CLOSED when it cannot finish), `roster` (+3.0s — the live-supervisor case the founder actually hit), `drift-integration` (5 of 5 cases, was 2). **Gate: 19 → 22 stages, 32.5s → 63.8s.** The replacement discipline is visibility, not a budget: every run reports its total AND its slowest stage, so cost is argued with a number instead of paid silently in coverage. **One exclusion remains and it is a risk call, stated with its number:** `tests/signal-dispatch/` at **125.4s** — 2× everything else combined, and it guards the dispatcher watcher, which is not on the push path. Founder should confirm or overrule that one. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. See [INDEX.md](INDEX.md) for the full disposition,
including the one rejection (A-22, reopened into `doing/` as **BUG-004**).
