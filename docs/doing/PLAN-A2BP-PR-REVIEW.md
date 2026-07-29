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

---

## Round 2 — review of DRAFT v7

**Plan reviewed:** `PLAN-A2BP-PR.md` v7 (`4574eb1`)
**Reviewer:** Jesko (Codex / QA-2)
**Date:** 2026-07-29
**Verdict:** **CHANGES REQUESTED — no implementation authorised**

v7 concedes the three central findings from round 1 and moves the design in the
right direction. Base-owned enforcement is the correct boundary, an isolated
checkout rooted at the fetched blueprint base fixes the unrelated-history
error, and the PR-specific obligation section is necessary. The remaining
issues are bounded, but two are still properties that implementation must not
invent.

### R2-F1 — HIGH: base-only suppression must bind the whole approved line, not the marker token

The proposed rule closes new-file suppression and a marker added to a newly
contaminated line, but “an `a2bp-allow` marker introduced or modified by the PR
does not suppress” still admits this variant:

1. base contains `safe historical text  # a2bp-allow: known incident`;
2. the PR changes only the text before the unchanged marker, introducing a
   recognized contaminant;
3. a token-level comparison says the marker was neither introduced nor
   modified and suppresses the changed line.

Make the receiver-owned oracle:

> A finding is suppressed only when the **entire candidate line bytes** equal a
> line at the corresponding base path that already carried a syntactically
> valid, justified `a2bp-allow` marker.

Exact same-path line identity is sufficient; matching the base line by line
number is the simplest conservative rule. A moved unchanged line may false-block
and be re-reviewed upstream, which is safer than fuzzy matching. An unchanged
marker on an adjacent line has no effect because suppression remains exact-line.
A wholly added file has no base line and therefore has no suppressions. Deletion
of a base file has no candidate bytes to scan.

The authoritative workflow must also obtain every executable component from
the trusted base SHA, not merely the top-level workflow. Checking out the PR
merge result and then sourcing `scripts/lib/contamination.sh` from that checkout
reopens the same bypass. Use a separate trusted-tool checkout (workflow, guard,
placeholder helper and transitive scripts pinned to the event's base SHA) and
pass the base tree plus candidate merge tree as data. Add regressions for:
unchanged marker plus changed prefix/suffix, adjacent marker, moved marker,
added file containing a marker, modified justification, and a PR that weakens
the guard/helper/workflow.

One more input remains unresolved: the residual-project-name check requires the
source project name. Git commit author, branch and tree do not establish that
name, and v7 correctly says the PR body is display-only. Either derive the name
from receiver-owned configuration keyed by an authenticated repository identity,
or classify that check as advisory when no trusted mapping exists. Do not feed
an untrusted branch-name/body value into the authoritative claim as provenance.

With those qualifications, the defensible property is:

> On the protected merge path, an actor outside the enumerated privileged
> control plane cannot merge a recognized BLOCK finding unless the complete
> finding line was already approved in the base.

“Only the founder can bypass” is true only if the founder is literally the sole
ruleset bypass actor, administrator/owner, privileged app controller and actor
able to change the protected base. State those premises rather than treating
“founder” as a GitHub permission primitive.

### R2-F2 — HIGH: §4b states that choices are required but does not make them

A PR template plus a check that parses ticked boxes proves acknowledgement, not
ripple completion. The contributor authors both the changes and the PR body and
can tick every box. Define, per ripple class, the evidence the check derives
from the candidate tree or trusted GitHub state, and require the receiver-side
reviewer to verify any judgement that cannot be automated. The check should
fail on a missing classification/evidence record; it must not claim that a
checked assertion is independently verified when it is not.

Likewise, GitHub branch protection controls merge, not ordinary closure. A
required status check cannot prevent a contributor with close permission from
closing without a reason. “Closing requires a reason” must be either:

- an explicitly non-enforced receiver policy, with drift/reporting surfacing
  reasonless closes; or
- an installed receiver-owned app/workflow that records and enforces the
  close-reason contract, with its permissions and failure/recovery semantics.

Finally, §4b still says the up-to-date policy “must be stated” without choosing
one. Pick the actual rule: require a branch current with the latest protected
base at merge time (or use a merge queue that tests the queued merge group),
and require the authoritative check on that exact candidate. If merge queue is
enabled, the workflow and required context must support `merge_group`, not only
`pull_request`.

One PR per invocation is a sound transaction boundary provided all named inputs
are validated and staged before the push. The command must fail without
publication if any input is invalid/blocked; it must not silently omit that file
and open a partial PR.

### R2-F3 — MEDIUM: choose one isolation primitive and complete retry identity

Creating a file absent from the base is mechanically sound: create it at its
validated managed relative path in the isolated checkout, stage that path, and
commit it with the rest of the proposal. It receives no base suppression under
R2-F1. The plan should explicitly require that its target is in the managed
allowlist, reject a base directory/symlink/type collision, create parents only
within the isolated root, and include add/delete/type changes in the proposed
file-set validation.

“Isolated worktree or scratch clone” is still an implementation-significant
choice. A linked worktree and a fetch through the operator's blueprint
repository mutate shared Git metadata/refs even when its working-tree bytes
stay untouched. A scratch clone/fetch in a temporary directory avoids that and
best matches the promised boundary. Choose it, or narrow “untouched” to
working-tree/index bytes and specify concurrent ref/worktree ownership.

The pushed-branch/no-PR recovery direction is correct but “re-running finds the
branch” is not yet an idempotency key. A fresh UTC timestamp creates a new name.
Define a stable invocation/proposal id, where it persists or how it is recovered
from receiver-owned remote state, and the exact match check (destination
repository, base SHA, head SHA/tree and ordered target set) before attaching a
PR. A same-looking branch must never be adopted by name alone. Also specify
remote branch collision, base movement between fetch/push/PR creation, no-force
push, and cleanup after merge/close.

### R2-F4 — MEDIUM: required-check/ruleset wording still needs the complete protected-path contract

The named check, ruleset and explicit bypass list are necessary, not sufficient
as currently phrased. Carry forward round 1's receiver controls:

- require pull requests for `main`; block contributor direct pushes, force
  pushes and deletion;
- require the exact receiver-owned check on every merge mode and require it
  against the current base/merge-group candidate;
- bind the status context to the expected GitHub App/workflow so an untrusted
  producer cannot satisfy the same name;
- enumerate ruleset bypass actors/apps and repository administrators, and state
  who may change the workflow, guard, ruleset and bypass set;
- require receiver-owned review for those policy surfaces and do not let path
  filters or skipped jobs report the required context as successful.

Repository-host settings are not established by committed workflow YAML. The
implementation/delivery evidence must include the live ruleset export/API
inspection and a negative test using a non-bypass actor. If settings cannot be
managed as code, document the exact manual configuration and verification
command as an acceptance artefact.

### Round-2 disposition and implementation boundary

Consensus is not yet reached. The base-only-marker concept is accepted after
strengthening it to whole-line base identity; the isolated-base construction is
accepted after choosing/narrowing the isolation primitive and defining retry
identity; and the PR transaction boundary is accepted. R2-F1's trusted oracle
and R2-F2's actual obligation/up-to-date/close-reason contracts remain
consensus-blocking.

Once those bounded contracts are incorporated, the implementation boundary from
round 1 still applies. Add only the precision already implicit there:
trusted-base helper loading and base-line suppression comparison; receiver
ruleset/live-configuration evidence; PR template/check or reporting needed by
the chosen ripple and close-reason policy; and scratch-checkout/idempotency
tests for absent files and partial push/PR recovery. There is still no
authorisation for fork mode, automatic merge, an offline proposal store,
general branch development, arbitrary hosting support, unrelated sync work, or
weakening the contamination classes.

---

## Round 3 — review of DRAFT v8

**Plan reviewed:** `PLAN-A2BP-PR.md` v8 (`48e0016`)
**Reviewer:** Jesko (Codex / QA-2)
**Date:** 2026-07-29
**Verdict:** **CHANGES REQUESTED — close, but implementation is not yet authorised**

The central marker rule now holds. A candidate suppression is accepted only
when the complete candidate line bytes exist as a validly-marked line at the
same base path. A wholly new file has no base path content and therefore zero
eligible suppressions: every marker in it is new and every recognized finding
is evaluated. The trusted-tool requirement also correctly includes
`placeholders.sh` and any other transitive executable helper.

Four bounded issues remain. Three are internal contradictions or incomplete
contracts that an implementer would otherwise have to resolve silently.

### R3-F1 — HIGH: the publication and security contracts contradict themselves

Section 2.1b correctly chooses a stable retry identity derived from content and
target, but §2.2 still specifies `a2bp/<project>-<utc-timestamp>`. These cannot
both be true. Specify one canonical branch-key input and encoding, including
destination repository, target base SHA, ordered target paths and proposed
tree/content; then use that same identity for retry and remote-tip verification.

The earlier overclaims also survive in operative text:

- §2.3 still calls the authoritative guard “unbypassable”;
- §1.1 concludes that only the founder can bypass before the live ruleset,
  administrator, app identity and bypass actors have been verified;
- §2.2 again puts the source project's absolute local path in the PR body,
  despite round 1 requiring that private, unauthenticated host datum be removed.

Use the already-agreed protected-path claim instead. The PR body may carry
descriptive repository identity, source commit, target base/head SHAs, ordered
file list and local findings, but not an absolute host path and not trusted
provenance.

### R3-F2 — HIGH: trusted source-project identity is acceptable only with an explicit degradation

Naming the unresolved identity is honest, and it does **not** block branch mode
inside the recorded same-owner boundary. It does block treating the
project-name-dependent contamination class as authoritative. The residual-name
check needs the actual derived-project name; neither commit author, branch name
nor PR body proves it.

Therefore v8 must choose one of the round-2 outcomes:

1. add a receiver-owned mapping from authenticated source repository identity
   to project name; or
2. state that the residual-project-name check is local/advisory in this phase,
   while the receiver check authoritatively enforces only the classes whose
   inputs come from the base and candidate trees.

Option 2 is sufficient for consensus in the trusted-owner deployment. Merely
saying the issue “does not bite” is not, because it leaves the CI interface and
the scope of “recognized BLOCK finding” undefined.

### R3-F3 — MEDIUM: the ripple-evidence check is implementable, but not yet specified

The current prose describes a feasible check, not an implementable contract.
The playbook has a useful class-to-“where to look” table, but entries contain
judgement words such as “possibly”, “if implied”, “if framing changed” and
“none usually”. A check cannot deterministically infer required paths from
those phrases, and a contributor-authored checkbox cannot supply the missing
judgement.

Define a machine-readable evidence record in the PR (or a checked-in policy
file): selected class(es), each deterministic required path, and an explicit
`not-applicable` disposition with a reason for conditional paths. The
receiver-owned check can then:

1. derive the changed input paths from the Git diff;
2. require all mechanically implied classes;
3. require every unconditional ripple path to appear in the diff;
4. reject missing dispositions for conditional paths; and
5. leave the truth of a reasoned `not-applicable` judgement to receiver review.

This verifies diff evidence without pretending to verify human judgement.
Without that mapping and disposition schema, §3.1's “moves to the PR template +
a check” and §4b remain design intent.

### R3-F4 — MEDIUM: §3 is much better, but one final inventory pass is required

The restored removals/non-removals, `security.yml`, marker logic, managed docs,
audit register, HANDOVER and test-count correction are all right. The remaining
implementation surfaces from rounds 1–2 must be explicit line items:

- `.blueprint-source` needs a backward-compatible schema/migration for remote,
  base and contribution mode, not only “a remote identity”;
- repository ruleset/manual configuration and its acceptance artefact must
  cover PR-only `main`, direct/force-push/deletion controls, current-base or
  `merge_group`, expected app/status identity, bypass/admin actors, path-filter
  behaviour, and live negative verification;
- absent-file handling must reject directory/symlink/type collisions and
  constrain parent creation to the isolated root;
- remote `a2bp/*` branch cleanup after merge/close, and `prs`/`drift` handling
  for drafts, closed PRs, bot PRs and API/auth failure, need an owner;
- the PR template/check implementation and its tests should be named as files
  or deliberately named new artefacts, rather than left as an abstract
  “template”.

Also rename “scratch worktree” to “scratch clone” in §2.1b. These are not a
request to restore the inbox machinery; they complete the PR design's actual
configuration, failure and cleanup boundary.

### Round-3 disposition and implementation boundary

No code implementation is authorised yet. Consensus is one revision away if
v9 resolves R3-F1–F4 without expanding scope. The eventual implementation
boundary remains the round-1/round-2 boundary: PR-based `a2bp`, trusted
receiver-side contamination enforcement with base-owned suppressions,
scratch-clone construction and idempotent publication/recovery, `prs`/drift
visibility, repository-policy evidence, ripple evidence, the complete cleanup
inventory and their tests/docs.

Still excluded: fork mode, automatic merge, an offline proposal store, general
development branches, arbitrary hosting, unrelated sync changes, and weakening
any contamination class beyond the explicitly documented source-identity
degradation above.
