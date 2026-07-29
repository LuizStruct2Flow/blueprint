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
