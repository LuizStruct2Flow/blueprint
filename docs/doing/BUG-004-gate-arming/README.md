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

**This was previously written as one all-or-nothing choice — "protected `main`,
and trunk-based development does not survive it". That framing was wrong, and
the founder corrected it on 2026-07-30:**

> *"I don't agree with your statement that it kills trunk based development, it
> should avoid that systems outside do any changes without PR, but inside the
> blueprint we should keep trunk based development."*

That is correct, and it splits the problem in two. The two halves have very
different costs, and only one of them trades against trunk-based development.

### Half A — outside systems must not write without a PR

**Closable now, at zero cost to trunk-based development.** GitHub rulesets take
**bypass actors**: require a PR + passing checks on `main`, and list the repo
owner as a bypass actor. Everyone else must open a PR; the owner keeps pushing
straight to `main`, so trunk-based development inside the blueprint is untouched.

Measured 2026-07-30: **no ruleset and no branch protection exist on this repo
today** (`gh api repos/…/rulesets` → empty, `…/branches/main/protection` → 404).
So nothing server-side is stopping an outside push right now.

This half is worth more than it first looks, because it also repairs a hole in
FEATURE-001's trust boundary. a2bp runs the contamination guard on the
**requester's** machine, so an external requester can simply not run it — stated
as a known limitation in `project_config_paths.md`. Required checks on the
request PR would run that scan **server-side, on the request**, where the
requester cannot skip it. Half A therefore turns a documented weakness into an
enforced one.

CI is already wired for this: `.github/workflows/security.yml` runs on both
`push: [main]` and `pull_request: [main]`, so the checks a ruleset would require
already exist and already run on PRs.

### Half B — the owner's own fresh clone still pushes ungated

**This is BUG-004 as actually reproduced**, and Half A does *not* close it —
by construction, since the bypass actor is what preserves trunk-based
development. A human who clones and pushes without ever triggering a wake path
is still ungated.

The levers here are genuinely small:

1. **Accept it explicitly.** `arm_gate` covers the wake paths, work here happens
   through agent sessions, and the residual is "the owner clones fresh and pushes
   by hand before any wake". Written down rather than implied.
2. **Detect rather than prevent.** CI already runs on push to `main`, so an
   ungated push is *caught* even when it cannot be *blocked*. That is adequate
   for lint and tests. It is weak for secrets specifically — CLAUDE.md §Security
   says a leaked credential is compromised the moment it lands on `origin`, so
   detection means "rotate", not "prevented".
3. **Drop the bypass**, which closes Half B and ends trunk-based for the owner.
   This is the option that carries the cost my earlier framing wrongly attached
   to the whole decision.

**The useful consequence of splitting it:** Half A can be done now without
touching how you work, and what remains is a much smaller question about your own
clone rather than a referendum on trunk-based development.

Costing for the server-side option is in the review documents here (raised as
**A-37** §4c).
