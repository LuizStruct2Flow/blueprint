# BUG-004 — a fresh clone is ungated

**Status: NEEDS A FOUNDER DECISION. Do not write more local code for this.**

Row and current statement of the problem: [`../BUGS.md`](../BUGS.md).

## Why the files in here say "A22"

This work item was tracked as audit finding **A-22** until 2026-07-30, when live
items were renumbered onto the real lifecycle namespace (`BUG-`/`FEATURE-`). The
eight Codex review documents keep their original filenames and their internal
`A-22` references **on purpose**: they are an argument trail, and they cite
findings by name across rounds ("the A-22 update says…", "not the A-09/A-22
blocker"). Renaming them would leave the argument referring to IDs that exist
nowhere.

So: **`BUG-004` is the work item. `A-22` is the finding it came from.** Same
thing, two namespaces, and only the first one is a lifecycle ID. Full rule in
[`../BLUEPRINT-AUDIT-2026-07-23.md`](../BLUEPRINT-AUDIT-2026-07-23.md).

## The short version

`core.hooksPath` is repo-**local** config. `new-project.sh` sets it at bootstrap,
but a `git clone` never runs bootstrap — so a fresh clone pushes completely
ungated. `arm_gate` (`scripts/lib/gate.sh`) now arms it from the two paths that
already run at every agent wake (the activity feed and `blueprint drift`), and
`tests/gate-arming/` pins that with 11 cases.

That was delivered, and **rejected at acceptance**, correctly. QA-2 did not
restate the caveat — they reproduced the gap: fresh clone, real high-entropy token
committed, `origin` redirected to a throwaway bare repo, real push executed
without ever running the feed or drift.

```text
fresh_clone_hooksPath=UNSET
real_ungated_push_rc=0
secret_commit_reached_destination=yes
```

The acceptance boundary was never "the arming paths work" — it was **"a human
cannot clone and push without invoking them."**

## Why no amount of local code closes it

A pre-push hook is advisory by construction: repo-local, absent on a clone, and
defeated by `--no-verify`. Git has no clone hook. Every local mechanism is fast
feedback, not enforcement.

## The decision that is actually open

Server-side enforcement is available at a policy cost. Required checks do block
direct pushes to a protected branch — but a SHA has to exist on some ref for
checks to run, and this repo is trunk-based with no branches (CLAUDE.md
§"Team Workflow"). So the options are roughly:

1. **Accept branch-based flow for the blueprint** — protected `main`, changes
   arrive by PR, required checks run the gate server-side. Enforcement becomes
   real; trunk-based development for this repo does not survive it.
2. **Accept the residual risk explicitly** — local arming is fast feedback, and a
   human who clones and pushes without a wake is trusted. Written down rather
   than implied.
3. Something else you have in mind that neither of the above captures.

Costing for option 1 is in the review documents here (raised as **A-37** §4c).
