# Codex design review — `PLAN-A2BP-INBOX`

**Verdict:** CHANGES-REQUESTED
**Reviewer:** Jesko (QA-2, Codex)
**Date:** 2026-07-29
**Scope:** design only; no implementation reviewed or authorized

## Conclusion

The direction is right: the default `a2bp` path should create an independently
reviewable proposal and must not write a managed target. The present plan does
not yet establish that property strongly enough, and its deferred wake path
conflicts with the A2BP playbook's same-session invariant unless wake is made a
fallback rather than the normal continuation.

Consensus is withheld until the plan addresses F1–F5. The founder's
`--apply-now` decision remains open; F6 records my recommendation without
treating it as settled.

## Findings

### F1 — HIGH: “additive” needs filesystem invariants, not only a destination convention

The design says proposing creates a folder, but it does not specify no-clobber
creation or defend the inbox path. A timestamp/slug ID can collide; an existing
proposal directory or a symlink within the inbox can turn ordinary redirection
or `mv` into overwrite of existing state or a path outside the inbox. A partial
proposal can also become visible if one file write fails.

Required design:

- resolve and validate the blueprint root and target as the existing CLI does;
- require the inbox root to be a real directory beneath the blueprint, with no
  symlink traversal for the proposal directory or its files;
- allocate an unpredictable or collision-resistant ID and create it with an
  exclusive operation that fails if it exists; never reuse or merge a folder;
- assemble in a private temporary directory beneath the same filesystem, then
  atomically publish the complete directory;
- on failure, leave no visible proposal and no managed-file change;
- define “additive” narrowly as the **propose command**: it creates exactly one
  new proposal directory and changes neither a managed file, an existing
  proposal, the git index, nor repository metadata.

This also exposes an inconsistency in test 10. A newly created proposal is
untracked; calling it “tracked, not scratch” implies an index/commit mutation,
which contradicts the property above. It can survive an ordinary pull as an
untracked file, but Git may reject a pull whose incoming path collides. The plan
should promise durable local inbox state, not “tracked,” unless it explicitly
chooses and designs a separate commit workflow.

### F2 — HIGH: repository HEAD is neither sufficient nor correctly scoped staleness

“Blueprint SHA at propose time” has both false negatives and false positives:

- HEAD can remain unchanged while the target working-tree file is edited, so a
  stale proposal would apply.
- An unrelated commit changes HEAD while the target bytes remain identical, so
  a valid proposal would be refused.

The compare must bind to the exact input used to render the proposal: record a
cryptographic digest of the target file's bytes (and whether it existed), the
normalized target path, and the proposal content digest. At apply, require the
target still to be managed, re-read it, and compare its digest immediately
before replacement. HEAD may remain provenance, but it is not the concurrency
token.

The check and write also have a TOCTOU window. Apply needs serialization (for
example, an inbox/apply lock), a re-check while holding that lock, and atomic
same-filesystem replacement. Otherwise two applies or a concurrent editor can
both pass the check and the later writer still wins.

Do not make every stale proposal be re-made. Preserve it for review and offer
an explicit rebase/regenerate operation that computes a fresh diff against the
current target and requires a new decision; never silently update its base.

### F3 — MEDIUM: re-running the contamination guard is necessary but does not authenticate reviewed content

The guard answers “does this content violate the contamination rules?” It does
not answer “are these the bytes whose diff and provenance the human reviewed?”
A hand edit can be benign, pass the guard, and make the stored `diff` false.

A digest inside the same freely editable `PROPOSAL.md` is only an accidental
edit detector: an editor can update both. That is still useful for consistency,
but it is not tamper evidence. Cryptographic tamper evidence requires a trust
anchor outside the editable proposal (a signed record, committed object, or
separate protected store), which is disproportionate for a local same-user
workflow unless the threat model includes a malicious local writer.

Required design for the stated threat model:

- store content and base digests;
- on `show` and `apply`, recompute them and fail if metadata/content disagree;
- regenerate the diff from the current proposal content and recorded base
  bytes (or verify the stored diff byte-for-byte) rather than trusting `diff`;
- apply only after displaying that computed diff and obtaining an explicit
  decision; non-interactive use needs an explicit proposal ID plus confirmation
  flag;
- if hand editing proposals is supported, provide a command that refreshes
  metadata and marks the proposal “modified after creation,” invalidating any
  prior approval. Otherwise declare proposal files immutable and require a new
  proposal after any edit.

Thus: consistency checking is sufficient against mistakes; signing is needed
only if malicious local tampering is in scope. The plan must state which threat
model it claims.

### F4 — HIGH: wake-only continuation breaks the playbook's same-session control

The playbook exists because deferring ripple work to another session caused
four §6.4 violations. “Propose now; wake later for a decision” recreates that
failure mode if it is the normal path. Count and age improve discovery but do
not preserve the originating agent's context or guarantee ripple completion.

The inbox can coexist with the playbook if its primary flow remains synchronous:

1. originating session runs `a2bp`, creating the proposal;
2. the CLI prints the proposal ID, computed diff, classification reminder, and
   the exact next command, then exits with a distinct “decision pending” state;
3. the same originating session asks the founder to apply/reject;
4. after apply, that same session completes playbook ripples, four-eyes,
   commit/push, and drift closure.

Wake-time reporting is a recovery/escalation path for abandoned proposals, not
the normal handoff. The proposal should record an owner/session or source
project, lifecycle state, and an escalation age so wake can route it back.
Applying should not imply completion: the inbox item remains in an
`APPLIED_PENDING_RIPPLES` state until the playbook closes, or the apply command
must print and persist that obligation. Deleting the proposal immediately on
apply loses the provenance and makes incomplete ripples invisible.

This is the most important product trade in the plan: a founder decision gate
adds a pause, but it need not add a context switch.

### F5 — MEDIUM: rejection and lifecycle semantics are underspecified

`reject` currently removes the only complete provenance record and appends to
`docs/config/findings.md`, itself a managed file. That is surprising and couples
an inbox decision to an unrelated stable findings catalog. It also makes the
record vulnerable to another `a2bp`.

Use explicit states and retain/move immutable decision records (pending,
applied-pending-ripples, completed, rejected), including actor, time, reason,
and content digest. Define retention/grooming. If physical deletion is desired,
make it a later explicit purge, not rejection. Reconcile this special inbox
with the normal backlog rule: pending proposals are actionable queue entries,
not `KEEP`/`DEFER` parked product work.

### F6 — OPEN FOUNDER DECISION: `--apply-now` bypasses the new gate

Yes: as specified, `--apply-now` makes the safety control optional, in the same
class as `--force` or an unarmed hook. A loud banner is observability, not a
decision gate. The fast typo case can still be one session and two commands:
create, show/approve, apply.

My recommendation is to omit `--apply-now` in the first release. If the founder
keeps it, it should not reproduce today's silent path: require interactive
confirmation (fail closed without a TTY unless a separately named emergency
override is supplied), create and retain the same provenance/decision record,
run the same base/content checks and guard, and measure/report its use. Even
then it is an explicit policy exception, not part of the additive default.

## Test review

The listed cases cover useful happy paths but several can pass after removing
the claimed behavior or assert the wrong property.

- Test 1 must snapshot target bytes, the complete pre-existing inbox tree, git
  index, and relevant repo metadata; after propose, assert the target/index are
  identical and the only filesystem delta is one complete, non-symlink
  proposal directory. Add collision, symlink, and injected mid-write failure
  cases.
- Test 2 needs both blocked content and a forced/waived-content case, with zero
  partial proposal on failure.
- Test 3 (“result matches content”) passes if apply is an unsafe `cp`. Also
  assert managed membership, exact base digest check, guard invocation, atomic
  replacement, retained decision record, and no unrelated file changes.
- Test 4 must mutate only the target working-tree bytes while keeping HEAD
  fixed, then separately change only an unrelated commit while keeping target
  bytes fixed. The first must refuse; the second must not be stale.
- Test 5 catches only a hand edit that the contamination guard dislikes. Add a
  benign content edit that still passes the guard but invalidates the stored
  digest/diff, and metadata/diff edits independently.
- Test 6 should assert retained rejection provenance and no mutation of a
  managed findings file unless that coupling is deliberately retained.
- Test 7 needs forced identical IDs/concurrent creators, not only ordinary
  timestamp-separated calls.
- Test 8's “zero prints nothing” passes when inbox reporting is deleted. Seed
  known ages and assert exact count/oldest identity and boundary behavior;
  remove/disable the scan in a mutation run and require failure.
- Test 9 merely preserves the bypass and therefore does not validate the new
  safety property. Its shape depends on the founder's decision in F6.
- Test 10 should be replaced with explicit durability semantics. Test ordinary
  pull preservation and incoming-path collision behavior; do not assert
  “tracked” unless proposal creation intentionally stages/commits.

Add tests for path traversal/absolute targets, target removed or no longer
managed, two concurrent applies to one target, apply racing a target edit,
partial-write cleanup, computed-diff confirmation, and the
`APPLIED_PENDING_RIPPLES` wake signal. For each mutation claim, name the
production branch or command disabled and demonstrate the test goes red; the
sentence “mutation-check each” is not itself an oracle.

## Consensus conditions

Revise the plan to:

1. define exclusive atomic proposal publication and its path/symlink boundary;
2. replace HEAD-as-staleness with exact target-byte identity plus serialized,
   atomic apply;
3. define proposal consistency checks and the local-writer threat model;
4. preserve the same-session playbook as the primary flow, with wake as
   recovery and applied-but-incomplete work remaining visible;
5. retain explicit apply/reject decision provenance and define inbox lifecycle;
6. record the founder's separate `--apply-now` decision and align its tests.

With those changes, I expect the core “propose, do not write” direction to be
sound.

---

## Round 2 — review of DRAFT v2

**Verdict:** CHANGES-REQUESTED
**Reviewer:** Jesko (QA-2, Codex)
**Date:** 2026-07-29
**Scope:** design only; no implementation reviewed or authorized

F2 and F4 are materially corrected. Exact target-byte identity is the right
staleness token, and same-session decision/apply/ripples with
`APPLIED_PENDING_RIPPLES` is the right primary flow. Omitting `--apply-now` is
also the sound default. Consensus is still withheld because F1/F3/F5 remain
open and the cleanup inventory exposes two additional contradictions.

### R2-F1 — HIGH: the digest + lock scheme still overclaims editor safety

The scheme is sufficient against two **cooperating** `inbox apply` processes:
both take the same lock, the second re-checks the target after the first, and
same-filesystem rename prevents a partial target. It is not sufficient against
the editor race named in §2.1. An editor and today's other managed-file writers
do not take the inbox lock. They can write after apply's digest check but before
its rename, and apply then atomically overwrites their bytes. Atomicity removes
partial writes; it does not provide compare-and-swap.

Revise F3's threat model explicitly. Either:

- make this a **blueprint managed-target lock** and require every tool-owned
  writer (`pull`, `inbox apply`, and any other scripted replacement) to honor
  it, while stating that arbitrary editors remain outside the guarantee; or
- provide a real compare-and-swap mechanism that detects a non-cooperating
  change at commit/replacement time.

Do not claim the design serializes an ordinary editor unless it actually can.
The race test must include an uncooperative writer, not only two applies.

The earlier F1 is unchanged and interacts with replacement: normalised lexical
membership is not a filesystem boundary. The plan still needs canonical
blueprint/inbox roots, rejection of absolute and `..` targets, no-follow
handling for proposal components, and a rule for symlinked target parents.
Creating the replacement temp beside a target whose parent escapes through a
symlink makes “same filesystem” true in the wrong tree.

### R2-F2 — HIGH: removing propose-side `--force` contradicts “findings travel”

Removing the derived project's authority to waive findings is correct.
Refusing to create any proposal on a BLOCK finding is not. Under the current
v2 text, the blueprint-side founder never receives the content or finding and
`inbox apply --force` has nothing to apply. “Findings travel with the proposal”
and test 2 (“no proposal is created”) cannot both hold.

Create an immutable proposal in a non-applicable `BLOCKED_FINDINGS` state,
including the complete findings. Only the blueprint-side decision can reject
it or explicitly waive and apply it. The derived side may not promote that
state. This preserves the new authority boundary without turning a heuristic
false positive into an inability even to ask for review.

This also means §3b must not delete all blocked accounting. It should delete
the old **managed-file partial-write** accounting, but multi-file `FILE...`
still needs specified proposal semantics: all-or-nothing publication, or clean
and blocked proposals plus a non-success aggregate status. At present the CLI
accepts multiple files and v2 never chooses.

### R2-F3 — MEDIUM: the cleanup inventory undercounts surfaces

The five named docs are not the complete live documentation surface.
`docs/DOCUMENTATION.md` §“Back-propagation” also says the file has already
landed, calls the checklist post-`a2bp`, and says `a2bp` emits hints “per file
copied.” It is managed and must be in §3/§3b.

Also inventory the behavior-bearing descriptions, even where the file remains:

- `scripts/blueprint` header/help, stale-drift message, comments, usage and
  `a2bp|push` alias;
- `scripts/lib/contamination.sh` contract/comments that say findings block a
  copy and that `--force` copies them;
- `.githooks/pre-push-project` A-07 gate text (“ONLY write path”, “refuse to
  copy”) and the CI/gate suite wiring/name if the suite is renamed or split;
- README's command-tree/playbook labels in addition to its main Push section.

The `push` alias deserves an explicit product decision. Keeping `push` for a
command that only proposes is misleading; removing it requires docs/help/tests
and may be a compatibility break. It is currently absent from §3b.

One claimed removal is load-bearing: the `blocked`/partial-run accounting does
not simply become dead while `a2bp FILE...` remains multi-file and contaminated
input can be refused or quarantined. Define the transaction first, then remove
only the branches made unreachable by that definition.

### R2-F4 — MEDIUM: the test estimate undercounts and uses a stale denominator

The suite currently emits **38**, not 41, passing assertions. I executed it and
counted the emitted `ok` records. Of those, **27 are driven through the real
`a2bp` CLI**: emitted assertions 1–25 (through case `#22`) plus the two `#24`
pull→a2bp assertions. All 27 need at least harness/oracle migration because
success may no longer be observed by reading the managed target, blocked
findings become proposal states, project-side `--force` disappears, and the
decision-pending exit is intentionally non-zero.

The remaining 11 are direct `placeholders.sh` primitive assertions (`#23`,
`#25`–`#28`) and can remain substantively unchanged, though suite comments and
grouping may move. Therefore the plan should say **27 of 38 current
assertions**, not “~25 of 41.” The new inbox/concurrency/lifecycle tests are
additional to that migration.

### R2-F5 — F1/F3/F5 requirements remain

- **F1:** unchanged; v2 adds no exclusive atomic publication or symlink/path
  boundary. Use a private temp directory under the canonical inbox, publish
  with a no-clobber operation, fsync as appropriate to the durability claim,
  and clean partials.
- **F3:** unchanged; define the local-writer threat model and validate the
  content digest against the bytes actually guarded and applied. Also define
  whether `diff` and metadata are authoritative, recomputed, or merely display.
  Apply must not trust mutable `PROPOSAL.md` fields to locate a target.
- **F5:** unchanged; v2 still says reject “removes” a proposal while requiring
  durable rejection provenance, and §7 says proposals are deleted on
  apply/reject while §2.4 retains applied work through ripples. Define the
  state machine and terminal archive/removal policy. Writing a line to
  `docs/config/findings.md` is not a substitute for retaining the decision
  record and also mutates an unrelated managed file.

The apply guard also needs a precise input contract: re-run it against the
stored content and current target, verify that the resulting staged bytes equal
the proposal content digest, then replace exactly those verified bytes. A guard
that transforms to different bytes at apply time is a rebase and requires a new
decision.

## Round-2 consensus conditions

1. Complete F1's atomic/no-clobber publication and canonical path/symlink rules.
2. Narrow the lock guarantee to cooperating writers or provide real CAS;
   specify all tool-owned writers that share the lock.
3. Replace “contamination means no proposal” with an inspectable,
   non-applicable blocked proposal and blueprint-side waiver/rejection.
4. Define multi-file transaction/status semantics before deleting partial-run
   accounting.
5. Add the missed docs/code/help/gate surfaces and decide the misleading
   `push` alias.
6. Correct the migration count to 27/38 and retain the 11 primitive tests.
7. Close F3/F5 with an authoritative proposal schema, exact guard/apply bytes,
   and a durable lifecycle/state machine.

F2's target-byte token and F4's synchronous flow are accepted. The overall
verdict remains **CHANGES-REQUESTED**.

---

## Round 3 — review of DRAFT v3

**Verdict:** CHANGES-REQUESTED
**Reviewer:** Jesko (QA-2, Codex)
**Date:** 2026-07-29
**Scope:** design only; no implementation reviewed or authorized

R2-F2 and R2-F4 are corrected. `BLOCKED_FINDINGS` is the right authority
boundary, and one independently published proposal per file with an aggregate
non-success result is the right batch model. Neither should be reversed.

### R3-F1 — HIGH: the plan knowingly leaves three safety/lifecycle contracts open

F1, F3, and F5 are not implementation details. They decide whether the claimed
additive boundary is real, which bytes were approved, and whether decisions
remain auditable. The plan header itself says publication exclusivity and the
symlink boundary, proposal consistency/tamper handling, and the state
machine/schema remain unspecified. Consensus cannot authorize implementation
while those are open.

Revise once more, but narrowly: close the existing round-2 conditions rather
than adding product surface.

- Define canonical roots, rejection of absolute/`..` paths, no-follow handling,
  symlinked-target policy, private partial creation, cleanup, and atomic
  no-clobber publication. State the durability claim and whether it requires
  file/directory `fsync`.
- State the threat model as accidental same-user modification, not a malicious
  local writer, unless a real external trust anchor is added. Make proposal
  **content/base identity immutable**; recompute/verify the displayed diff and
  guard output from those authoritative bytes. Mutable lifecycle data must be a
  CLI-owned decision record, not trusted target/path fields edited in
  `PROPOSAL.md`.
- Specify the states and allowed actors/transitions at minimum:
  `PENDING` / `BLOCKED_FINDINGS` → `APPLIED_PENDING_RIPPLES` or `REJECTED` →
  `COMPLETED`, plus `STALE` and explicit rebase creating a newly reviewable
  revision. Retain actor, timestamp, reason/waiver, and digests. Rejection must
  not delete the only record or mutate `docs/config/findings.md` as a proxy.
  Define archive and later explicit purge.
- Specify the exact apply contract from R2-F5: guard stored content against the
  current target, require the resulting staged bytes to equal the approved
  content digest, and replace exactly those bytes. A transformation at apply is
  a new revision requiring a new decision.

On the lock: v3's narrowed claim is now honest. A shared managed-target lock for
all cooperating CLI writers is preferable, but an editor remains explicitly
outside the guarantee; do not spend another design round pretending shell
rename can provide compare-and-swap against arbitrary writers.

### R3-F2 — HIGH: v3's operative sections still specify the rejected v1/v2 behavior

The corrective prose in §3b does not update the normative command and test
sections:

- §2.2 still exposes `a2bp --apply-now`.
- Test 2 still says a blocked file creates **no proposal**.
- Test 9 still requires `--apply-now`.
- Test 10 still calls an untracked proposal “tracked.”
- §5 still says rollback is additive because `--apply-now` reproduces the old
  path, and says proposals are deleted on apply/reject.
- §2.2 still says `reject` removes the proposal and appends to
  `docs/config/findings.md`.

These are direct contradictions, not harmless stale commentary. Remove
`--apply-now` from the initial design, align blocked tests with
`BLOCKED_FINDINGS`, replace “tracked” with explicit pull/collision durability
semantics, and make rollback preserve the retained lifecycle records. Also
update the title/status from “DRAFT v2.”

### R3-F3 — MEDIUM: per-file publication is right, but batch outcomes need precise statuses

Keep one proposal per file. All-or-nothing would let one heuristic finding hide
clean, independently reviewable requests and would create a larger staging
transaction without a user benefit.

Define distinct aggregate results so automation can distinguish:

- all clean proposals published: decision pending;
- clean plus `BLOCKED_FINDINGS` proposals published: blocked decision pending;
- operational publication failure: error, naming every successfully published
  ID and every unpublished file.

A blocked finding is not an operational publication failure. Once published it
is resolvable by reject or explicit blueprint-side waive-and-apply, so it does
not create an intrinsically unresolvable inbox item. Age/escalation plus a
retained rejection path handles abandonment. “Immutable” must mean its proposed
bytes/findings cannot be silently edited; it must not mean lifecycle transitions
are impossible.

### R3-F4 — MEDIUM: the cleanup inventory is close, but the executable inventory is still incomplete

The new prose inventory catches the important user-facing descriptions. A
repository-wide live-surface search found two executable migration entries that
must be explicit:

- `tests/a2bp-contamination/test.sh` itself, not only the new
  `tests/a2bp-inbox/test.sh`;
- `.github/workflows/security.yml`, which directly invokes the old suite, not
  only the shorthand “CI” cell.

The §3 affected-files table must also absorb the surfaces already discovered in
§3b: it currently still says `contamination.sh` needs no change and omits
`docs/DOCUMENTATION.md`. Keep `.githooks/pre-push-project` explicit. Current
state/resume records (`docs/doing/BLUEPRINT-AUDIT-2026-07-23.md` and
`docs/doing/HANDOVER.md`) need normal doc-sync when implementation changes the
authoritative A-07/current-work account; historical `docs/done/` review and
acceptance evidence should not be rewritten.

The remaining search hits in `placeholders.sh`, `state-dir.sh`,
`agent-activity.sh`, marker/gate fixtures, and `.githooks/pre-push` are either
still-true technical context or unrelated copy behavior; they are not additional
behavior migrations. Dropping the misleading `push` alias is the correct
product decision.

## Direct recommendation

Revise for F1/F3/F5 before consensus. This is not polishing: those items define
the security boundary, approval identity, and durable decision model. One
focused v4 should be enough. After it closes the contradictions and schema/state
machine above, implementation can determine function-level mechanics without
another prose expansion.
