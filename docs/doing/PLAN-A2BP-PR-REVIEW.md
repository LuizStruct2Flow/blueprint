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

---

## Round 4 — review of DRAFT v9

**Plan reviewed:** `PLAN-A2BP-PR.md` v9
**Reviewer:** Jesko (Codex / QA-2)
**Date:** 2026-07-29
**Verdict:** **CHANGES REQUESTED — implementation is not yet authorised**

v9 makes the important security consequence explicit: without a receiver-owned
source-project mapping, CI cannot authoritatively run the residual-project-name
class. That is an honest bounded degradation for the same-owner deployment.
The remaining three file-only classes still move from a contributor-skippable
local hook to receiver-owned enforcement, so the design retains substantial
value.

Two consensus-blocking contradictions remain, and the new ripple record is not
yet safe as a required check.

### R4-F1 — HIGH: mutable PR-body evidence is not bound to the required-check result

The YAML shape is parseable, but putting it in the PR body does not make it an
implementable required-check contract. Required checks are associated with the
candidate commit/check suite; the PR body can be edited without changing the
head SHA. A successful ripple check can therefore become stale after a body
edit unless a receiver-owned mechanism guarantees re-evaluation and prevents a
merge racing or bypassing that re-evaluation. The plan names neither such a
mechanism nor its event/race semantics.

Prefer evidence committed on the proposal branch (a canonical manifest or
commit-bound metadata), so the evidence, changed-file set and check result share
one SHA. If the body is retained, specify a receiver-owned GitHub App/workflow
that runs on body edits, invalidates the prior result, evaluates the live body
at merge time, and prove the no-stale-success property; ordinary prose plus a
`pull_request: edited` trigger is not enough by itself.

The schema also lets the contributor choose `class: B`, but the described
trusted table maps **class to ripple paths** only. It cannot perform round 3's
step “require all mechanically implied classes” without a trusted
**changed-input-pattern to class(es)** mapping. Define:

- whether `class` is singular or a set (round 3 required selected class(es));
- canonical path/glob semantics and the exact base-pinned policy file;
- the trusted input-path→class mapping and class→required/conditional-path
  mapping;
- strict parsing rules (exactly one record, unknown/duplicate keys rejected);
- whether `touched` must equal the relevant paths in Git's changed-file set;
- waiver uniqueness, non-empty reasons, and handling of rename/delete/type
  changes.

Receiver review still judges waiver truth and edit quality. With commit binding
and those deterministic mappings, the check can enforce the narrower claim:
every mechanically implied ripple is either present in the candidate diff or
explicitly dispositioned.

### R4-F2 — HIGH: the security claim still contradicts the admitted degradation

Section 2.3 still calls the server-side guard “authoritative, unbypassable.”
Section 1.1 correctly says that a contributor can remove the local scan and get
a residual project name past CI. Both cannot describe the same guard. Replace
§2.3 with the scoped claim: receiver CI authoritatively enforces the three
file-only classes on the protected merge path; residual-name scanning is local,
contributor-supplied and advisory in this phase.

The end of §1.1 likewise says “the guard is bypassable only” by privileged
receiver actors. Qualify that statement to the receiver-enforced classes.
Also replace “the project name is known and trustworthy” locally with “known to
the local tool”: contributor-controlled execution is not a security trust
boundary, as the next paragraph itself demonstrates.

The degradation does not undermine more than v9 admits once those claims are
scoped. It does mean CI cannot promise genericization with respect to project
identity; it promises only the three enumerated contamination classes. The
same-owner boundary is an accepted deployment assumption, not a technical
closure of that gap.

### R4-F3 — MEDIUM: §3.3b is still a summary, not the requested complete contract

Round 3's inventory findings were not all incorporated:

- `.blueprint-source` still has no backward-compatible schema/migration for
  remote, base and contribution mode;
- the ruleset row omits explicit PR-only `main`, direct/force-push/deletion
  controls, expected app/status identity, administrator/change-control actors,
  skipped/path-filter behaviour, merge-group coverage, live export and a
  non-bypass negative verification;
- absent-file directory/symlink/type-collision rejection and isolated parent
  creation are absent;
- `prs`/`drift` policy for drafts, closed PRs, bot PRs and API/auth failures is
  absent;
- the PR template, policy tables, checker implementation and tests are not
  named as concrete existing or deliberately-new artefacts.

“Merge queue if available” is also weaker than an implementation choice. Name
the actual current-base mechanism and its required workflow event/check
identity. Similarly, abandoned-branch cleanup needs a retention threshold,
owner/action, treatment of branches with closed PRs versus no PR, and
no-force/no-delete safety checks; saying “a policy” leaves implementation to
invent the policy.

### R4-F4 — MEDIUM: stable publication identity remains underspecified

The timestamp contradiction is fixed, but round 3 asked for one canonical key
including destination repository, target base SHA, ordered target paths and
proposed content/tree. Section 2.2 currently names only paths and staged
content, while §2.1b says “content and target” without defining target.

Include destination repository identity and base SHA. Otherwise the same
proposal after base movement reuses a branch whose rebuilt commit necessarily
has a different parent, then refuses forever on the remote-tip mismatch instead
of obtaining a new proposal identity. Specify canonical encoding, digest
algorithm/length, and collision refusal. Use that exact key consistently for
branch naming, retry lookup and remote-tip verification.

One smaller terminology contradiction also survived the grep pass: §2.1b
chooses a scratch **clone**, then says “The scratch worktree is removed.”
Make the latter “scratch clone/directory”; a linked worktree is explicitly not
the selected primitive.

### Round-4 disposition and implementation boundary

Consensus is close but not reached. The degraded contamination model is
accepted once all operative claims are scoped to its three receiver-enforced
classes. The implementation boundary remains:

- PR-based, same-owner branch-mode `a2bp`;
- scratch-clone construction and commit-bound idempotent publication/recovery;
- receiver-owned enforcement of host paths, per-project state dirs and emails,
  with whole-line base-owned suppressions; local/advisory residual-name scan;
- commit-bound deterministic ripple evidence plus receiver review of
  judgements;
- `prs`/drift discovery, concrete repository policy/configuration evidence,
  complete cleanup, tests and synchronized docs.

Still excluded: fork mode, automatic merge, an offline proposal store,
arbitrary hosting, general development branches, unrelated sync work, or
silently restoring an authoritative residual-name claim without a
receiver-owned identity mapping.

---

## Round 5 — review of DRAFT v10

**Plan reviewed:** `PLAN-A2BP-PR.md` v10 (`49a00d8`)
**Reviewer:** Jesko (Codex / QA-2)
**Date:** 2026-07-29
**Verdict:** **CHANGES REQUESTED — implementation is not yet authorised**

v10 fixes the two round-4 contradictions it set out to fix. A grep-driven
inventory confirms that every operative contamination-class claim now excludes
the residual-project-name scan or explicitly scopes receiver enforcement to
host paths, per-project state directories and emails. The local project name is
correctly described as known but not receiver-trusted. Moving ripple evidence
from mutable PR prose into the proposal tree also closes the original
body-edit-without-rerun defect.

That move does not by itself define a safe merge contract, however, and two
earlier design requirements remain unincorporated.

### R5-F1 — HIGH: commit binding is sound only if the checked evidence reaches the merge unchanged

The manifest and changed-file set now share the proposal SHA, so editing either
invalidates the check. But §4b leaves whether `.a2bp-ripples.yml` is “removed by
the merge or kept as record” to implementation. An ordinary GitHub merge does
not selectively remove a file from the checked head. Removing it requires a new
commit, merge-queue transformation or post-check automation, and each creates a
new candidate tree that must itself receive the required check. Otherwise the
design has moved the stale-evidence gap from PR-body editing to merge-time tree
mutation.

Choose before implementation:

- retain the manifest in the merged tree under a collision-free,
  repository-defined record path; or
- generate a new commit/merge-group candidate without it and require both
  checks on that exact candidate SHA before merge.

The ruleset must reject a merge whose final candidate tree is not the tree (or
merge-group SHA) that passed. A post-merge deletion is too late: it may keep an
audit trail in history, but it does not make the unchecked merge atomic. Also
define manifest namespace/collision behaviour for concurrent PRs; one fixed
root `.a2bp-ripples.yml` makes unrelated proposals conflict and, if retained,
prevents the next proposal from using the same evidence path cleanly.

### R5-F2 — HIGH: the deterministic ripple policy cannot be deferred wholesale to implementation

The undefined list contains both syntax details and product policy. The trusted
input-pattern→class mapping, class multiplicity/composition, path/glob matching,
the meaning of `touched`, waiver eligibility, and rename/delete/type-change
semantics determine what changes the required check permits. They are the gate,
not incidental implementation choices. Consensus cannot authorise a developer
to invent them while coding.

The plan must choose a minimal normative contract first:

1. base-owned policy maps canonical changed paths to a **set** of implied
   classes; all matches union rather than one declaration winning;
2. each class maps to unconditional and dispositionable ripple requirements;
3. changed paths come from a base-to-candidate diff with explicit status
   semantics, including both old and new paths for rename and a declared policy
   for deletions and type changes;
4. `touched` is either removed as redundant or defined exactly against that
   canonical diff set;
5. waivers may cover only dispositionable requirements, are unique per
   requirement, carry a non-blank reason, and cannot waive an implied class or
   the evidence file itself; and
6. the manifest and policy are strict, versioned, fail-closed formats:
   one record, known keys/types only, no YAML aliases/custom tags/duplicate
   keys, canonical repository-relative paths, and unknown policy/schema
   versions rejected.

Exact serialization/library choice, diagnostic wording and internal data
structures are implementation detail. The allow/deny semantics above are not.

### R5-F3 — HIGH: the publication identity requirement from round 4 is still absent

Round 4 required one canonical retry key containing destination repository
identity, target base SHA, ordered target paths and proposed content/tree, plus
encoding, digest algorithm/length and collision refusal. v10 still says only
“content and target” in §2.1b and “target paths and staged content” in §2.2.
It never defines target, omits destination repository and base SHA, and does
not choose a canonical encoding or digest.

This remains consensus-blocking. Base movement necessarily changes the parent
and proposal commit. Without base SHA in the key, the retry finds the old ref
and permanently refuses on tip mismatch rather than creating the proposal for
the new base. Define the key once and use it identically for branch naming,
retry lookup and exact remote-tip verification.

### R5-F4 — MEDIUM: residual-name scoping is complete, but the bypass actor claim is not

The contamination-class scope is now consistent. The authority sentence is
still too absolute:

- §1.1 says the three checks are bypassable only by someone who can change the
  base or ruleset, “which is the founder”;
- §2.3 repeats only base/ruleset actors.

Those statements omit configured ruleset bypass actors, administrators,
privileged apps and any actor able to satisfy or alter the required-check
identity—the exact actors §1.1 and §3.3b say must be inventoried live. Until
that verification has run, the defensible statement is conditional: actors
outside the **verified enumerated privileged control plane** cannot merge a
recognized finding in the three receiver-enforced classes. “Which is the
founder” becomes true only if the live negative test and configuration export
prove the founder is the sole member.

### R5-F5 — MEDIUM: §3.3b names categories but still delegates operative choices

The new rows are a useful acceptance inventory, not yet the “full contract”
claimed by the v10 note:

- “merge queue if available” still does not choose current-base enforcement or
  name the `pull_request`/`merge_group` check identity;
- abandoned-branch cleanup still has no retention threshold, owner/action,
  closed-PR versus no-PR treatment, or safe refusal rules;
- absent-file collision says “containment rule” but does not choose the rule
  or explicitly require directory/symlink/type collision rejection and
  isolated-root parent creation;
- draft/closed/bot/API behaviour is named but not defined;
- exact files for the PR template, base policy, evidence checker, ruleset
  export/acceptance evidence and their tests remain unnamed;
- `.blueprint-source` asks for a version marker/migration but still does not
  specify the versioned fields (`local_path`, repository identity, base,
  contribution mode), legacy interpretation, atomic rewrite or unsupported
  remote/mode failure.

These choices can be deliberately simple, but they affect safety, compatibility
and operational ownership and therefore belong in the agreed design. Concrete
workflow/checker filenames are inventory detail; merge event identity,
migration semantics, collision policy and failure behaviour are design.

### Round-5 disposition and boundary

This round is still finding design defects, not merely code-shape details:
final-tree check binding, gate allow/deny semantics, retry identity and
configuration/failure policy. Do not start implementation yet.

The recommendation is **not** to descope the PR architecture. Descope the
first implementation to the smallest enforceable slice: same-owner branch
mode; one versioned `.blueprint-source` GitHub schema; one canonical
base-SHA-bound publication key; retained, namespaced commit evidence; strict
exact-path ripple policy (add globs later); no bot auto-merge; explicit
fail-closed API behaviour; and manual abandoned-branch cleanup reported by
`blueprint prs`. That removes merge-time evidence deletion, glob ambiguity,
automation identity and cleanup mutation from v1 while preserving the security
property worth building.

Once those bounded choices are written into the plan, implementation may decide
libraries, functions, diagnostic text and file-internal structure. The
previously agreed exclusions remain unchanged: fork mode, automatic merge,
offline persistence, arbitrary hosting, general development branches and an
authoritative residual-name scan.

---

## Round 6 — fresh-design review of DRAFT v11

**Plan reviewed:** `PLAN-A2BP-PR.md` v11
**Reviewer:** Christian (Codex / QA-2)
**Date:** 2026-07-29
**Verdict:** **REFRAME ACCEPTED; CHANGES REQUESTED on the surviving publication contract**

The founder's premise holds. If `a2bp` produces a request which a blueprint-side
operator deliberately implements, adapts, or exceptionally accepts as-is, then
receiver-enforced contamination and ripple evidence are not load-bearing for
this slice. The v6–v10 machinery solved a delivery-channel threat model which
v11 no longer has. Deferring that machinery, while retaining those rounds as
the design record for a future untrusted-contributor boundary, is the right
call. `contamination.sh` and cases #13/#14 should remain unchanged.

This is not yet an implementable plan, however. The reframe removes the merge
gate; it does not remove the smaller distributed-publication protocol required
to create and recover the request.

### R6-F1 — HIGH: “request” needs an explicit integration boundary

The diagram relies on a blueprint owner making a decision, but §3 also permits
merge-as-is and §6 says all derived projects belong to the same owner. With
branch-write/merge permission, the requester can enable auto-merge or merge
their own PR; a bot may also merge it. In either case the PR again becomes a
delivery mechanism without the human decision on which the reframe rests.

State the v1 operating contract:

- `a2bp` only creates or recovers a PR; it never approves, enables auto-merge,
  merges, or pushes to the protected base;
- automatic merge of `a2bp/*` requests is out of scope/prohibited;
- a blueprint-side operator other than the requesting invocation must decide
  whether to re-implement, adapt, or merge as-is and owns the playbook/ripples;
- merge-as-is is an explicit blueprint-side implementation decision, not the
  default completion path.

This can remain a documented human-review property for the same-owner phase;
v11 need not build receiver enforcement for it. But the trust boundary is
“requests are operated this way,” not merely “repositories have the same
owner.” If self-merge is intentionally allowed, the plan must honestly say the
human decision is conventional rather than structurally guaranteed.

### R6-F2 — HIGH: canonical publication identity is still load-bearing

The plan deletes “canonical publication keys” and “collision rules,” then
requires a stable branch id and exact-tip recovery. Those are the same
requirements in smaller form. “Target paths + content” is insufficient:

- the same paths/content against a new base produce a different commit, but
  find the old branch and permanently refuse;
- identical content sent to another repository or base branch aliases unless
  destination identity is included;
- unspecified path ordering, content framing, hash algorithm and truncation
  make independently reconstructed retries unstable;
- a hash-prefix collision or a pre-existing hostile branch still needs a
  refusal rule.

Define one request identity over the canonical destination repository identity,
target branch, exact fetched base SHA, sorted canonical target paths, and the
length-framed staged bytes (including file mode/type if supported). Choose the
digest and branch encoding. Re-running against the same base reconstructs the
same commit and may recover it; re-running after base movement creates a new
identity and must report the old orphan/request rather than silently overwrite
it. A pre-existing ref is adopted only after exact tip verification; it is
never force-updated.

This is much less machinery than v10's merge-safe publication scheme, but it
cannot be deleted while retry is a promised feature.

### R6-F3 — MEDIUM: §3.4 omits the executable build and recovery algorithm

Specify the following before implementation:

1. Parse a versioned `.blueprint-source` schema with local path, canonical
   GitHub repository identity and target branch; define legacy/missing-field
   and unsupported-host behaviour.
2. Validate the entire invocation before publication: duplicate/canonical
   managed paths, source regular-file existence, and the policy for
   add/delete/symlink/type changes. No input may be silently skipped into a
   partial request.
3. Produce each staged file with the existing positional placeholder
   restoration and round-trip assertion. Define “advisory”: the current scan
   blocks on `BLOCK`; removing `--force` preserves a local, bypassable safety
   check, whereas “show and continue” is different behaviour.
4. Clone/fetch the configured destination into a temporary directory, resolve
   the exact remote target SHA, check out that SHA, reject directory/symlink/
   type collisions, create parents only under the scratch root, install only
   the validated staged targets, and verify the resulting diff contains
   exactly that target set. Treat a no-op explicitly.
5. Commit, derive/use the request identity, push the one ref without force,
   and create the PR against the configured base. Record descriptive project,
   ordered files, base SHA and head SHA in commit/PR metadata; local absolute
   paths remain excluded.
6. On retry, query for an existing open **or closed** PR as well as a bare
   remote ref. Verify destination, base and exact remote tip before returning
   an existing URL or opening a missing PR. This covers a successful PR create
   whose client response was lost.
7. Define base movement between fetch, push and PR creation. At minimum the PR
   remains a request based on its recorded base and `prs` reports it as stale;
   no implicit force/rebase is allowed.

`blueprint prs` also promises project, files and age for a pushed branch with no
PR. A content-only branch name cannot supply those fields, so the commit
metadata/query algorithm and API-failure behaviour are part of this contract.

`--dry-run` cannot both make no remote contact and guarantee the diff against
the current fetched base. It may preview against the configured local
blueprint snapshot, but must print that snapshot SHA and label the result as a
preview which publication will recompute; alternatively it must contact the
remote. Choose one.

Scratch cleanup on every exit, with a reported retained path on cleanup
failure, is sound. So are one PR per fully validated invocation and explicit
absent-from-base creation.

### R6-F4 — MEDIUM: the affected-surface inventory contains one contradiction

§4.2 says `contamination.sh` contract comments are rewritten, while §4.4 says
`scripts/lib/contamination.sh` is unchanged. The latter matches the reframe and
the handoff instruction: remove it from §4.2. The CLI and playbook comments do
need reframing; the scanner does not.

### Round-6 disposition and implementation boundary

The premise should have been challenged at the first architecture review,
before threat-model refinement: every review should first ask whether the
artifact is evidence/request or executable delivery, and who performs the
integration decision.

Consensus is reached on the product reframe and the receiver-guard deferral,
but not yet on build/retry mechanics. After R6-F1–F4 are incorporated, the
implementation boundary is:

- same-owner GitHub branch-mode `a2bp` as request creation only;
- versioned remote/base configuration;
- existing local staging, round-trip assertion and advisory/bypassable guard;
- scratch-clone construction from an exact fetched base;
- canonical base-bound request identity, no-force publication and exact-tip
  PR/ref recovery;
- `prs` discovery, migrated CLI tests, new topology/retry/no-write tests, and
  the synchronized documentation inventory in v11.

Excluded: receiver-enforced contamination/ripple checks, changes to
`contamination.sh` semantics or cases #13/#14, fork mode, automatic merge,
offline persistence, arbitrary hosting, general branch development, and any
direct write to either working tree.

---

## Round 7 — build-contract review of DRAFT v12

**Plan reviewed:** `PLAN-A2BP-PR.md` v12 (`1bdb7d8`)
**Reviewer:** Jesko (Codex / QA-2)
**Date:** 2026-07-29
**Verdict:** **CHANGES REQUESTED — reframe remains accepted; implementation is not yet authorised**

The operating reframe remains sound. A documented behavioural boundary is
appropriate for the explicitly same-owner phase as long as it is described
honestly rather than claimed as mechanical enforcement. Section 3.0 now does
that: the filing invocation cannot integrate, automatic merge is prohibited,
and a separate blueprint-context decision owns merge-as-is. Receiver gating
remains correctly deferred.

v12 does not yet contain the executable build contract it claims, however. It
mostly names the categories requested in R6-F2/F3 without making their operative
choices.

### R7-F1 — HIGH: the canonical request identity is still not specified, and exact-tip retry is not reproducible

The final row of the identity table literally says “stated digest + encoding”
and “named in the plan,” but the plan names neither. It also says only
“length-prefixed per path,” without defining the serialized fields, byte order,
length width, path encoding, mode encoding, or canonical destination-repository
normalization. Those choices are the identity.

More importantly, exact-tip adoption requires the retry to reconstruct the
same Git commit, not merely the same tree. Ordinary commits vary with author /
committer identity and timestamps. The plan does not define deterministic
commit metadata, commit-message bytes, parent list, or an alternative recovery
comparison which is both sufficient and consistent with “exact tip.” A retry
can therefore derive the same branch name, rebuild equivalent content, produce
a different commit SHA, and reject its own branch.

Choose one complete contract. For example: canonical UTF-8 repository identity
and paths; an explicitly specified length-framed binary record including field
tags, fixed-width big-endian lengths, mode and bytes; SHA-256 rendered as the
full lowercase hex digest in `a2bp/<digest>`; collision refusal; and a
deterministic commit object whose parent, tree, author/committer, timestamps and
message are all defined. A different precise encoding is fine. The plan must
choose it rather than delegate it.

### R7-F2 — MEDIUM: the R6-F3 configuration and scratch-build contract is still a summary

“Versioned config” currently specifies only a version marker, remote identity,
and refusal when absent. It does not define the fields and syntax for local
path, canonical GitHub repository, target branch, legacy-file interpretation,
missing base/version behaviour, or unsupported host/version behaviour.

Likewise, “all inputs validated” covers only membership and readability. It
still omits duplicate/canonical path handling, regular-file versus symlink/type
policy, deletion policy, and no-op policy. The scratch paragraph does not state
directory/symlink/type-collision rejection, parent containment, or the required
post-install assertion that the diff contains exactly the validated target set.
“Clone with no checkout, fetch the single base ref at the captured SHA” also
leaves the initial SHA-resolution/fetch sequence undefined.

These are small choices now, but they are observable safety and compatibility
behaviour. R6-F3 explicitly required them before implementation.

### R7-F3 — MEDIUM: dry-run and advisory/override semantics contradict the new boundary

The CLI promises that `--dry-run` makes no remote contact, while §3.4 says it
“resolves” the base it would build against without choosing the local-snapshot
semantics offered in round 6. It must say that it uses the configured local
blueprint snapshot, report that snapshot SHA, and state publication will
re-fetch/rebuild; otherwise “the base it would build against” implies remote
resolution which the command prohibits.

Section 3.1 says findings block filing, then says a requester whose content the
guard dislikes “can say so in the request,” while removing `--force`. A blocked
request cannot carry that explanation. The plan also says there is “nothing to
waive,” although the local guard is explicitly still a blocking gate for the
requester. Choose either: retain the existing loud override as a requester-side
waiver; or remove it and state that recognized findings cannot be filed until
the bytes/marker are changed. Do not describe a route that the CLI removes.

### R7-F4 — MEDIUM: the travelling operating rule is claimed but not present

The v12 note and §3.0 say the distinct-decision rule was recorded in
`CLAUDE.md` §Back-propagating. Commit `1bdb7d8` changes only the plan, and the
current `CLAUDE.md` still describes direct copying, same-session completion and
`--force`; it contains no new request/integration boundary. This may be intended
for the implementation docs sweep, but the plan presently claims it is already
recorded. Either land that normative rule with the plan or change the text to
say it will be part of the synchronized implementation.

### Round-7 disposition and implementation boundary

Answers to the requested four questions:

1. **Canonical key:** the component set is sufficient, but the key and
   reconstructible commit are not yet specified, so retry correctness is not.
2. **Operating boundary:** yes, a behavioural rule is sufficient for the
   explicitly trusted same-owner phase, provided it travels in `CLAUDE.md` and
   is not represented as mechanical enforcement.
3. **Build contract:** not yet. R7-F1/F2 are implementation-significant missing
   choices; R7-F3 is contradictory observable behaviour.
4. **Other contradictions:** the absent `CLAUDE.md` rule and the
   advisory/override and dry-run claims above.

Once those points are pinned, the implementation boundary is unchanged from
round 6: same-owner GitHub request creation; versioned remote/base config;
unchanged local staging/round-trip guard semantics; scratch-clone build from an
exact base; deterministic base-bound identity and no-force exact-tip recovery;
open/closed PR recovery plus honest `prs`; CLI/topology/retry/no-working-tree
tests; and synchronized docs.

Still excluded: receiver enforcement, `contamination.sh` semantic changes,
cases #13/#14 changes, fork mode, automatic merge, offline persistence,
arbitrary hosting, general development branches, and direct writes to either
working tree.
