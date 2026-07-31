# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

## Two namespaces, and only one of them is a work item

**`BUG-XXX` / `FEATURE-XXX` are the only lifecycle IDs.** They are what the
commit convention, the regression-test naming rule and these lifecycle folders
key off (CLAUDE.md §"Bug Management", §"Team Workflow").

**`A-NN` is not a work item.** Those are findings from one audit — the
2026-07-23 contamination sweep in
[BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md) — in the same
category as a Codex finding ID. A finding is a *claim that something is wrong*;
it becomes work when it gets a `BUG-`/`FEATURE-` number and a row here.

They were being used as though they were work items — folder names, rows in this
table, gate comments — and then extended with new numbers (A-38, A-39) for
findings that had nothing to do with that audit. Live items were renumbered on
2026-07-30. The audit document and everything in `done/` keep their `A-NN` IDs as
historical provenance, because the Codex review documents argue about findings by
those names and renaming them would break the trail they exist to be.

**Rule going forward:** an `A-NN` reference is a citation of history. If you are
about to work on something, give it a `BUG-`/`FEATURE-` number first.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| **BUG-004** | A fresh clone is ungated: `core.hooksPath` is repo-local, so cloning and pushing never invokes the gate | S1 | **HALF A DONE 2026-07-30. HALF B still needs a founder decision** | Reopened 2026-07-29 after QA-2 rejected it with a live reproduction: a fresh clone, a real high-entropy token committed, `origin` redirected to a throwaway bare repo, and a real push executed without ever running the feed or drift — `real_ungated_push_rc=0`, `secret_commit_reached_destination=yes`. `arm_gate` works; the acceptance boundary was never "the arming paths work" but "a human cannot clone and push without invoking them". **Not closable by another local hook** — a pre-push hook is repo-local, absent on a clone, and defeated by `--no-verify`. **SPLIT IN TWO on 2026-07-30 after a founder correction** (I had written this as one all-or-nothing trade against trunk-based development, which was wrong). **Half A — DONE 2026-07-30:** branch protection on `main` with `enforce_admins: false`, four required checks, and a PR required (0 approvals) for non-admins. Verified by probe: admin direct-push to `main` still works, so trunk-based is untouched. **Its real value is narrower than I first said, and the narrower claim is the honest one** — the repo is public and user-owned, so outsiders already could not push (no write access; GitHub forces fork+PR). What this actually buys: (1) a PR **cannot merge red**, which is what puts FEATURE-001's contamination scan server-side on a2bp request PRs where a requester cannot skip it, and (2) any future write grant — collaborator, derived-project token — is constrained. **Half B — the owner's own fresh clone** is BUG-004 as reproduced, and Half A deliberately does not close it; levers are accept-explicitly, detect-via-CI (already runs on push to `main`; adequate for tests, **weak for secrets: the repo is PUBLIC, so a pushed secret is world-readable before gitleaks starts — CI's answer is "rotate", never "that did not happen"**), or drop the bypass (the only option that actually costs trunk-based). Folder: [BUG-004-gate-arming/](BUG-004-gate-arming/). Was `A-22`; the server-side option was `A-37`. |
| **BUG-005** | The pre-push gate is at its 30 s ceiling, and coverage is now being decided by the clock | S2 | **NEEDS A FOUNDER DECISION** — the obvious fix does not work | Measured 2026-07-30: the gate runs **~29 s against a hard 30 s ceiling**, and **`tests/agent-activity-bound/test.sh --fast` alone is 18.1 s of it** — more than every other suite combined (11 s). Consequences are already visible: `tests/staleness/test.sh` is CI-only, `drift-integration.sh --fast` is cut to 2 of 5 cases, and `tests/a2bp-contamination/` (41 assertions, the guard protecting the door BUG-002 and A-09 came through) went **entirely CI-only** when it grew from 2.3 s to 6.0 s driving real transport. The gate keeps `tests/a2bp-e2e/`, which covers the leak-critical wiring but not the detection matrix. That is a real reduction in what blocks a push, made for budget rather than risk, and it reverses when this is fixed. **Why it is not an afternoon's refactor:** those 18 s are not lazy polling. They are NEGATIVE assertions ("an incomplete record was NOT emitted", "an unchanged signal file emitted nothing further"), and you cannot poll for the absence of an event; they are already small multiples of `AGENT_FEED_TICK`, which the suite already sets to 0.25 s. The levers are shortening the multiples (weakens the assertions) or moving whole cases to CI — both coverage judgements. Not started; no code touched, because that suite protects BUG-001 (load 175 for 2.7 days). Was `A-38`, with `A-39` as its symptom. |
| **BUG-006** | `LWA_FEED_*` env-var namespace in `scripts/log-activity.sh` — BUG-002's contamination in env-var form | S3 | NEXT UP, not started | Same class as BUG-002: a name specific to one project baked into a generic script. Detail in [BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md). Was `A-08`. |

BUG-002 moved to `waiting-acceptance/` on 2026-07-27; its blocker (audit finding
A-09) is fixed and pushed.

**BUG-004 and BUG-005 both need a decision before they need code.** For BUG-004,
do not attempt another local mechanism — that is exactly what the rejection ruled
out.

## Waiting acceptance

**FEATURE-001** — back-propagation becomes a request, not a write — was pushed on
2026-07-30 and sits in
[`../waiting-acceptance/FEATURE-001-a2bp-pr/`](../waiting-acceptance/FEATURE-001-a2bp-pr/)
with its plan and review trail. BUG-005 came out of building it.

Everything else delivered on 2026-07-29 is ACCEPTED and in
[`../done/`](../done/) — eight items, verdicts and evidence in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
