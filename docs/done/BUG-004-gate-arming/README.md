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
[`../BLUEPRINT-AUDIT-2026-07-23.md`](../../config/BLUEPRINT-AUDIT-2026-07-23.md).

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

### Half A — DONE 2026-07-30

Branch protection on `main`, applied with founder approval:

```
required_status_checks  secret-scan (gitleaks) · SAST (semgrep p/owasp-top-ten)
                        SCA (osv-scanner) · shell regression suites (full)
enforce_admins          false      ← this is what preserves trunk-based
required_pull_request_reviews  0 approvals (a PR is required; an approval is not)
allow_force_pushes      false
allow_deletions         false
```

**Verified rather than assumed:** a probe commit was pushed directly to `main`
after applying it, and succeeded. Trunk-based development for the owner is
untouched.

Check names were taken from what actually reports on `main`
(`gh api repos/…/commits/main/check-runs`), not from the workflow file. A required
check whose name never reports leaves every PR waiting forever, and the two are
easy to get out of step.

**Its value is narrower than first claimed, and the narrower claim is the honest
one.** This repo is **public and user-owned**, so an outsider already could not
push — they have no write access and GitHub forces fork + PR. The earlier wording
here ("nothing server-side is stopping an outside push") was true of rulesets and
misleading about the permission model. What Half A actually buys:

1. **A PR cannot merge red.** This is the one that matters. It puts FEATURE-001's
   contamination scan **server-side, on the request PR**, where a requester cannot
   skip it — repairing a hole documented as unavoidable in
   `project_config_paths.md` §"Back-propagation trust boundary" (the guard runs on
   the *requester's* machine, so an external requester can simply not run it).
2. **Any future write grant is constrained** — a collaborator, or a derived
   project's token, cannot push straight to `main` later.

CI was already wired for this: `.github/workflows/security.yml` runs on both
`push: [main]` and `pull_request: [main]`.

**To undo:** `gh api -X DELETE repos/LuizStruct2Flow/blueprint/branches/main/protection`.

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
   ungated push is *caught* even when it cannot be *blocked*. Adequate for lint
   and tests.

   **Weak for secrets, and it is worth being precise about why, because the
   obvious objection is "but we run gitleaks in CI".** We do, and it finds the
   secret. The problem is timing, not coverage. The pre-push hook blocks, so the
   secret never leaves the machine. CI runs *after the push succeeded* — and
   **this repository is public**, so the commit is world-readable before gitleaks
   starts, and bots scrape the public events firehose for exactly this. Force-
   pushing it away does not help: the commit stays reachable through the events
   API, forks and cached views. So CI's answer is always "rotate that credential
   now", never "that did not happen". CLAUDE.md §Security says the same thing from
   the other direction — rotate *before* investigating.
3. **Drop the bypass**, which closes Half B and ends trunk-based for the owner.
   This is the option that carries the cost my earlier framing wrongly attached
   to the whole decision.

**The useful consequence of splitting it:** Half A can be done now without
touching how you work, and what remains is a much smaller question about your own
clone rather than a referendum on trunk-based development.

Costing for the server-side option is in the review documents here (raised as
**A-37** §4c).
