# Codex plan review — `a2bp` pull-request design

**Plan reviewed:** `PLAN-A2BP-PR.md` v6 (`2019827`)  
**Reviewer:** Jesko (Codex / QA-2)  
**Date:** 2026-07-29  
**Verdict:** **CHANGES REQUESTED — no implementation authorised**

The founder's reframe is right. A pull request is a better primitive than the
filesystem inbox, and the inbox plan is correctly superseded. The replacement
plan is not yet executable, however: its central authority claim is broader
than the mechanism specified, and it omits the Git topology needed to create a
PR from an unrelated derived repository.

## F1 — HIGH: “unbypassable” is not established by “runs in required CI”

The useful, supportable claim is narrower:

> An ordinary contributor cannot skip the receiver-owned required check and
> merge through the protected path; a permitted merge actor owns any waiver.

The current plan has not specified the controls that make even that true:

1. the check must run trusted receiver code (the base branch's guard), not a
   guard/helper/workflow modified by the proposal under test;
2. the repository ruleset/branch protection must require that exact check for
   every merge path, including merge queue if enabled;
3. direct pushes and force pushes to `main` must be blocked for contributors,
   and bypass actors/apps/administrators must be explicitly enumerated;
4. the required-check identity must not be satisfiable by an untrusted app with
   the same status context;
5. changing the workflow, guard, ruleset, or bypass list needs a receiving-side
   privileged decision.

More importantly, the existing guard deliberately has contributor-authored
escape syntax: a justified `a2bp-allow` line suppresses every check. The plan
also puts source project, files, local findings and absolute path in the PR
body, all contributor-controlled. A contributor can lie about that provenance,
and a direct branch push has no trustworthy derived-project identity from which
the receiver can reconstruct it. “CI rejects contaminated content even when
the local guard was bypassed” therefore needs a precise receiver-only oracle.

Keep `a2bp-allow` if the intended contract is “loud waiver visible to the
receiver”; then CI may pass it, but the plan must not call the content
uncontaminated or the guard unbypassable. Alternatively make suppressions fail
the authoritative check until a receiver-owned label/environment/ruleset
approval records the waiver. In either design, do not trust the PR body or
branch contents as evidence that the local guard ran.

This is not an argument for rebuilding an inbox. It is the receiving policy
that must be pinned before GitHub can enforce it.

## F2 — HIGH: the branch cannot be based on the derived repository's history

`a2bp` runs in a derived project. Its current `HEAD` is not descended from the
blueprint repository's `main`, so “commit to a branch, push, open a PR” is not a
complete algorithm. Pushing the derived project's commit graph to a branch does
not produce an ordinary mergeable PR against blueprint `main`.

Specify that `a2bp`:

1. resolves a configured blueprint GitHub repository identity and fetches its
   current target base;
2. creates an isolated temporary checkout/worktree rooted at that exact remote
   base (not the blueprint's possibly dirty local checkout);
3. stages the guarded multi-file result into that checkout;
4. commits there, pushes with a unique branch ref and no-force semantics, then
   opens a PR whose base is the configured blueprint branch;
5. records the base SHA and resulting head SHA and cleans up locally on every
   exit without deleting a successfully published remote branch.

Define failure/retry semantics for: remote branch collision, base moving before
PR creation, push succeeding but `gh pr create` failing, and retry after that
partial success. A unique branch plus normal server-side ref rules supplies
no-clobber publication; it does not by itself make this multi-step operation
atomic.

Also remove the absolute local source path from the PR body. It is private host
data and contributes no trustworthy provenance. Repository URL/slug, source
commit SHA when available, project name, target base SHA, proposal head SHA and
file list are useful; PR-body claims remain descriptive, not authoritative.

## F3 — MEDIUM: load-bearing inbox requirements need explicit PR equivalents

Most of the inbox mechanism is genuinely superseded. These requirements are
not, and the PR plan must retain them explicitly:

- **same-session completion and ripple closure:** the old plan made abandoned
  proposals a recovery path and required evidence before `CLOSED`. A PR
  template alone does not ensure the originating agent completes classification,
  docs, tests, four-eyes review and lifecycle updates. Define who owns those
  ripples, when the PR is ready to merge, and what required checklist/check
  proves completion;
- **rejection reason:** closing a PR without a reason remains possible. State
  whether this is a policy/template expectation or an enforced receiver action;
- **partial publication and retry:** `FILE...` is now one multi-file PR, which
  is a good transaction boundary, but the command must name all accepted and
  rejected inputs and leave no ambiguous pushed-branch/no-PR state;
- **staleness/base movement:** GitHub supplies mergeability and required
  up-to-date checks only if configured. Require up-to-date branch/merge queue or
  state the rebase/re-run rule;
- **discovery SLA:** count plus oldest age survives; define whether closed,
  draft and bot PRs count and how API/auth failures are reported.

GitHub supplies identities, SHAs, events, concurrent proposals and retention.
It does not automatically supply the blueprint-specific “ripples complete”
state or rejection discipline.

## F4 — MEDIUM: network/auth is acceptable, but the offline mitigation is false

For an operation whose new result is a GitHub PR, requiring network access,
Git, `gh`, authentication and suitable repository permission is an acceptable
product trade, not a disqualifier. It is also a substantial compatibility and
hosting commitment and must fail early with actionable diagnostics.

`--dry-run` does not currently “prepare and push later”: the plan says it
creates no branch and persists nothing. It lets the operator preview and rerun
later. Say that accurately, or add a deliberately persisted patch/bundle
workflow. The latter is not required for consensus; honest offline degradation
is enough.

`.blueprint-source` should not overload a local path with an implicit remote.
Define a backward-compatible configuration/migration contract for repository,
base branch and contribution mode, and say what happens for a non-GitHub
blueprint remote.

## F5 — MEDIUM: branch-based is acceptable only for a trusted-owner deployment

Branch-based now is a reasonable derived-not-designed choice if all current
derived projects and credentials are controlled by the same owner. Record that
as an explicit trust boundary, not as the general external-contribution model:
the token used by every derived project receives branch-write capability in the
blueprint repository.

Use a restricted `a2bp/*` namespace and least-privilege credentials/rules where
GitHub permits it; prohibit force updates; clean remote branches after merge or
close. Fork-based becomes mandatory when the proposer is outside that trusted
owner boundary or must not receive write access. The configuration should leave
room for fork mode without implementing it now.

## F6 — LOW: the trunk carve-out is coherent if stated as an integration rule

This does not erode trunk-based development if the rule is precise:

> A project's own development commits directly to its trunk. A cross-repository
> contribution is staged on a short-lived integration ref in the receiving
> repository solely for receiver-side review and checks; it is not a development
> branch for either project's own work.

That is a defensible boundary, and it removes A-22's recorded *no pre-main ref
for this flow* blocker. The weaker A-22 claim is sound: PR back-propagation
creates a ref on which authoritative checks can run before these contribution
SHAs reach `main`. It does not close A-22, protect human direct-push workflows,
or establish enforcement until the receiver rules in F1 actually exist.

## Required revision and authorisation boundary

Revise the plan to close F1–F5, add the missing affected surfaces
(`.github` receiver policy/check configuration and the configuration migration
for remote/base/mode), and replace the two overclaims:

- “unbypassable guard” with the exact protected-path and waiver contract;
- “server-side ref CAS, atomic” with the narrower per-ref no-clobber guarantee
  plus recovery for the push/PR multi-step operation.

No implementation is authorised by this review. After a revised plan reaches
cross-provider consensus, the implementation authorised should be exactly:

- rewrite `blueprint a2bp FILE...` to guard locally, construct one multi-file
  commit from the fetched blueprint base in isolation, push a short-lived
  `a2bp/*` branch without force, open/recover one PR, and print its URL;
- retain a non-persisting offline `--dry-run`; remove project-side `--force`
  and the `push` alias;
- add receiver-owned PR CI plus repository-rule documentation/configuration
  that implements the agreed required-check and waiver boundary;
- add `blueprint prs` and drift count/oldest-age reporting;
- migrate the 27 CLI-driven contamination assertions and add topology,
  trusted-CI, bypass, partial-failure/retry, hostile-name, multi-file,
  concurrency and no-working-tree-write tests;
- update the exact managed docs, guard comments, gate/CI wiring, audit register
  and HANDOVER surfaces named by the revised affected-file inventory.

It does not authorise fork mode, general branch-based development, automatic
merge, an offline proposal store, arbitrary remote hosting support, unrelated
sync changes, or weakening the existing contamination scan.
