# PLAN — `a2bp` proposes, it does not write

**Status:** DRAFT v2 — revised after Codex CHANGES-REQUESTED
([PLAN-A2BP-INBOX-REVIEW.md](PLAN-A2BP-INBOX-REVIEW.md)) and after the founder
asked what the change *removes*. No code written yet.

**v2:** §3b added (the cleanup inventory the founder asked for and the first
draft omitted); `--apply-now` recommendation reversed to omit; staleness token
and session flow rewritten per F2/F4.

**v3, after review round 2:** §3b.6 corrects a contradiction v2 itself
introduced — a blocked file must still produce an inspectable, non-applicable
proposal, or `apply --force` has nothing to waive. §3b.7 defines multi-file
transaction semantics, which v2 left undefined. §3b.2 adds the surfaces v2
missed, including `docs/DOCUMENTATION.md` and the `a2bp|push` alias. §3b.3's
test count is corrected from an invented "~25 of 41" to a measured **27 of 38**.
The lock's guarantee in §2.1 is narrowed to what it actually provides.

**v4, after review round 3 — the focused close.** F1/F3/F5 are closed in §2.1b,
§2.1c and §2.1d rather than deferred to implementation, per the reviewer's
direct answer that they are not deferrable. Exit statuses are distinguished
(decision-pending ≠ blocked ≠ operational failure). The executable inventory is
completed — the test suite, the CI workflow, the audit register and HANDOVER
were all missing from §3.

**And the residual contradictions are removed.** v3 reversed the `--apply-now`
recommendation in §6 while leaving the command operative in the §2.2 table, and
replaced the no-proposal-on-BLOCK rule in §3b.6 while leaving the old §4 test
asserting it. That is the fix-the-instance-not-the-class habit, inside the
document whose §3b exists precisely because I did the same thing to the audit
register four rounds running. Swept this time: seven live references found by
grep, all resolved.
**Raised by:** founder, 2026-07-29 — *"can we not change the a2bp, to instead of
doing directly the change it adds the change to the blueprint backlog. And the
blueprint waking protocol sees the change? And ask the user to decide?"*
**Author:** Sylvia (Orchestrator)

---

## 1. The defect this fixes

`blueprint a2bp FILE` copies a derived project's version of a managed file
**directly into the blueprint's working tree**. It does not commit and does not
push — but it does mutate the file, silently, from another repository.

A-07 made that write *guarded*: placeholders restored where provable, every
staged line scanned, staging round-trip verified, findings block the copy. What
A-07 did **not** change is that the write still happens without anyone deciding
it should. Review is optional and after the fact — it depends on the operator
noticing a dirty working tree and reading `git diff` before committing.

That is the same shape as **A-22**, which QA-2 rejected two hours ago: a control
that only works if a human remembers to invoke it is not a control. A-22's
lesson was to move enforcement onto a path that already runs. This plan applies
the same lesson to the other direction of the sync.

Three concrete consequences of the current design:

1. **Silent mutation.** A managed file — `CLAUDE.md`, `docs/DoD.md`, the hook —
   changes in your tree because a command was run in a different directory.
2. **Last-writer-wins.** Two projects that `a2bp` the same file: the second
   `cp` overwrites the first with no warning and no record that it happened.
3. **No provenance.** Once written, nothing records which project the bytes
   came from, when, or why. `git diff` shows content, not origin.

## 2. The change

`a2bp` writes a **proposal** into the blueprint's backlog. Applying it is a
separate, explicit decision surfaced by the wake protocol.

```
derived project ──a2bp──▶  blueprint  docs/backlog/a2bp-inbox/<id>/   (ADDITIVE)
                                              │
                          wake: `blueprint drift` reports count + age
                                              │
                                  founder decides per proposal
                                              │
                    `blueprint inbox apply <id>` ──▶ managed file written
                                                     (guard re-runs)
```

**The safety property is that the inbox write is ADDITIVE.** It creates new
files under a dedicated directory and can never modify a managed file. Today's
write mutates `CLAUDE.md` in place; the proposed one cannot touch it. That
distinction is the whole point and every design decision below serves it.

### 2.1 The proposal artefact

One folder per proposal, per the work-item folder rule:

```
docs/backlog/a2bp-inbox/2026-07-29T14-22-31Z-acme-flow-docs-DoD/
├── PROPOSAL.md      provenance + rationale + scan findings
├── content          the guard-staged bytes, exactly as they would be written
└── diff             rendered against the blueprint file at propose time
```

`PROPOSAL.md` records: source project name and absolute path, target managed
path (normalised), the contamination scan output including anything waived, the
operator's rationale, lifecycle state, and the **concurrency token** below.

#### The staleness token — corrected per review F2

The first draft used "the blueprint SHA at propose time". That is wrong in both
directions, and the review was right that it is the same class of error as the
A-03 ref selectors:

- **False negative:** HEAD is unchanged while the target file is edited in the
  working tree → a stale proposal applies.
- **False positive:** an unrelated commit moves HEAD while the target bytes are
  identical → a valid proposal is refused.

The token must bind to **the exact input the proposal was rendered against**:

- a cryptographic digest of the target file's bytes at propose time, plus
  whether it existed at all;
- the normalised target path;
- a digest of the proposal's own `content`.

HEAD is still recorded, as **provenance** — useful for a human reading the
record — but it is not the concurrency token.

At apply: re-read the target, re-check it is still managed, and compare digests
**immediately before replacement, while holding a lock**, then replace
atomically on the same filesystem.

**Stated limit, because v2 implied more than it delivers:** the lock serialises
*cooperating* writers — other invocations of this CLI. It does **not** exclude
an editor, a script, or a `git checkout` operating on the blueprint outside the
CLI. Against those, the digest re-check inside the lock narrows the window to
the interval between check and rename but does not eliminate it. The honest
claim is "no lost update between two applies, and a very small window against
an uncooperative writer", not mutual exclusion.

A stale proposal is **not** discarded. It is preserved and marked stale, with an
explicit `inbox rebase <id>` that recomputes the diff against the current target
and requires a **new** decision. Silently re-basing a proposal onto moved
content would re-create exactly the unreviewed write this plan exists to remove.

### 2.1b Publication is a filesystem invariant, not a convention — closes F1

"Additive" is only a safety property if the filesystem enforces it. A directory
name does not. Publication therefore:

- **Resolves and validates the path before any write.** The proposal directory
  must resolve, after full symlink resolution, to a path **inside** the
  blueprint's inbox root. Anything else — a symlinked inbox, `..` in a derived
  id, a target outside the root — is refused. The derived project supplies the
  *source project name*, which is attacker-influenced input in the same sense
  the project name was in A-07: it must never be concatenated into a path
  without validation.
- **Creates exclusively and never clobbers.** The proposal directory is created
  with `mkdir` (which fails if it exists) into a **unique** id; files inside are
  written with an `O_EXCL`-equivalent (`set -o noclobber`). No proposal may
  overwrite another, ever — that is the collision property this whole design
  claims.
- **Publishes atomically.** Content is written to a private staging path and
  made visible by a single rename within the same filesystem, so a reader never
  sees a half-written proposal. (The redcare stream hit exactly this on their
  instance guard: a directory visible before its contents are complete is a
  window, and a post-hoc consistency check is the third-fallback-layer shape.)
- **Never writes outside the inbox root.** Asserted by test, not by inspection:
  snapshot the managed tree before and after every `a2bp` variant and require
  byte-identity.

### 2.1c What was approved, exactly — closes F3

Re-running the contamination guard at apply time checks the content. It does
**not** authenticate it. Between publication and apply, the `content` blob is an
ordinary file in the repo that a person or a script can edit.

So the proposal records a **digest of its own content at publication**, and
`inbox apply`:

1. recomputes the content digest and compares — a mismatch means the proposal
   was modified after publication and apply **refuses**, naming the id;
2. re-runs the guard on the content actually about to be written;
3. writes exactly those bytes.

The digest makes tampering **evident**, not impossible — anyone who can edit
`content` can edit `PROPOSAL.md`. That is an honest limit, and it is acceptable
because both live in the blueprint repo under git: the defence against a
malicious local editor is `git diff` and review, not the CLI. What the digest
*does* buy is catching the realistic case — an accidental edit, a half-finished
manual fix, a merge artifact — which is the failure that would otherwise apply
silently.

**What "approved" means is therefore pinned:** the bytes whose digest is
recorded in `PROPOSAL.md`, re-verified immediately before the write.

### 2.1d Lifecycle and schema — closes F5

States are a machine, not prose:

```
                 ┌──────────────────────┐
   a2bp ────────▶│ PENDING_DECISION     │
                 └──────┬───────────┬───┘
   a2bp (BLOCK) ─┐      │ apply     │ reject
                 ▼      ▼           ▼
      ┌────────────────────┐   ┌──────────┐
      │ BLOCKED_FINDINGS   │   │ REJECTED │  (retained, with reason)
      └─────────┬──────────┘   └──────────┘
                │ apply --force (blueprint side only)
                ▼
   ┌───────────────────────────┐
   │ APPLIED_PENDING_RIPPLES   │──── playbook complete ───▶ CLOSED
   └───────────────────────────┘
```

Transitions the **derived side may perform: none.** It creates
`PENDING_DECISION` or `BLOCKED_FINDINGS` and has no verb that changes either.

`STALE` is a *computed* property, not a stored state — it is derived by
comparing the recorded target digest against the current file, so it cannot go
out of date on disk. `inbox rebase` produces a new proposal and leaves the
original for the record.

`PROPOSAL.md` carries a **versioned schema** (`schema: 1`) so a future change
can be detected rather than misparsed, with required keys: source project, its
absolute path, normalised target path, target-existed flag, target digest,
content digest, blueprint HEAD (provenance only), scan findings, state, created
timestamp, and rationale. Apply refuses on an unknown schema version rather than
guessing.

### 2.2 CLI surface

| Command | Behaviour |
|---|---|
| `blueprint a2bp FILE...` | Guard, then publish proposals. **No managed file is touched, on any path.** |
| `blueprint inbox` | List proposals: id, project, target, state, age. |
| `blueprint inbox show <id>` | Print `PROPOSAL.md` + `diff` + findings. |
| `blueprint inbox apply <id>` | Re-verify, check staleness under lock, write the managed file. |
| `blueprint inbox apply <id> --force` | Apply despite `BLOCKED_FINDINGS`. **Blueprint-side only.** |
| `blueprint inbox rebase <id>` | Recompute against the current target; requires a NEW decision. |
| `blueprint inbox reject <id> --why "<reason>"` | Move to `REJECTED`, retain provenance, record the reason. |

There is **no `--apply-now`** and no `push` alias. Both are removed, not
demoted — see §6 and §3b.2. A derived project has exactly one verb against the
blueprint: propose.

**Exit statuses are distinct, because they mean different things** (review R3):

| Status | Meaning |
|---|---|
| `0` | All proposals published clean. |
| decision-pending | Published, awaiting a decision. The normal outcome, and deliberately non-zero so a script cannot mistake it for "landed". |
| blocked | At least one proposal is `BLOCKED_FINDINGS`. |
| operational failure | The CLI could not do its job — unwritable inbox, missing helper, bad path. |

Collapsing these into one non-zero was v3's implicit design and is wrong: "your
change awaits review" and "the tool broke" are not the same event.

**Rejection requires a reason.** A silently deleted proposal is
indistinguishable from one that was never made, and the next person from the
proposing project deserves to know why their improvement did not land.

### 2.3 Where the guard runs

**Both ends, deliberately.**

- **At propose time** — so the operator who has the context gets the finding
  immediately, while they still remember what they changed and why. This is the
  A-07 guard unchanged.
- **At apply time** — because the blueprint may have moved, and because the
  person applying is often not the person who proposed. A proposal is untrusted
  input; it arrived from another repository.

### 2.4 The primary flow is SYNCHRONOUS — corrected per review F4

The first draft made wake the handoff: propose now, decide at some later wake.
The review is right that this re-creates the deferred-ripple failure the
playbook exists to prevent — four §6.4 violations in one week came from exactly
"a later session will finish this". Count and age improve discovery; they do
not preserve the originating agent's context.

**So the normal path never leaves the session:**

1. the originating session runs `a2bp` → proposal created;
2. the CLI prints the id, the diff, the ripple classification and the exact
   next command, and exits with a distinct **decision-pending** status;
3. **that same session** puts the decision to the founder;
4. on apply, **that same session** completes the playbook ripples, four-eyes,
   commit, push, and drift closure.

The gate adds a pause. It must not add a context switch. That is the whole
product trade and it is the most important sentence in this plan.

**Apply does not mean done.** The proposal moves to `APPLIED_PENDING_RIPPLES`
and is only closed when the playbook completes. Deleting it on apply would lose
the provenance and make an incomplete ripple invisible — which is the failure
the playbook was written for.

Wake reporting is therefore a **recovery path for abandoned proposals**, not the
handoff. `cmd_drift` already runs at every wake and already reports gate state,
so it is the path that exists rather than a new one to remember (A-22's lesson):

```
Blueprint drift check
  project:    /home/luiz/dev/acme-flow
  blueprint:  /home/luiz/sources/struct2flow/blueprint
  ✓ gate: armed (core.hooksPath=.githooks)
  ⚠ a2bp inbox: 3 proposals pending, oldest 9 days
      blueprint inbox            # list them
```

**Count AND age.** CLAUDE.md warns that `backlog/` must not become a graveyard;
an inbox reporting only existence is one that gets ignored at 2 proposals and
still ignored at 40. Age is what makes neglect visible.

## 3. Affected files

| File | Change | Managed? |
|---|---|---|
| `scripts/blueprint` | `cmd_a2bp` rewritten to propose; new `cmd_inbox`; `cmd_drift` reports | **yes** |
| `scripts/lib/contamination.sh` | none expected — reused as-is at both ends | yes |
| `docs/A2BP_PLAYBOOK.md` | the playbook currently assumes the file is already written | yes |
| `CLAUDE.md` §"Back-propagating" | describes direct copy | yes |
| `README.md` §"2. Push" | same | yes |
| `docs/way-of-working.md` | sync slide says "apply-to-blueprint" | yes |
| `docs/backlog/README.md` | document the inbox subdirectory | yes |
| `tests/a2bp-contamination/test.sh` | **27 of 38 assertions migrated** (§3b.3) | — |
| `tests/a2bp-inbox/test.sh` | new — publication, lifecycle, concurrency | — |
| `.githooks/pre-push-project` | A-07 gate text is wrong once a2bp cannot write; re-wire suites | — |
| `.github/workflows/security.yml` | suite names change; new suite added | yes |
| `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md` | the A-07 row describes a guard that gates a **copy** | — |
| `docs/doing/HANDOVER.md` | same — its A-07 entry describes the copy path | — |

Every managed file touched here ships to every derived project, which is
precisely why this needs consensus before code.

## 3b. What this REMOVES

> Founder, 2026-07-29: *"have you also put in the plan, everything we need to
> cleanup, that is not more needed when the derived projects are not allowed to
> perform any changes anymore?"* — I had not. The first draft only added. This
> section is the answer, and it changes the shape of the work: a good part of
> this is deletion, and deletion is the part that actually reduces the surface.

The premise **"derived projects are not allowed to perform any changes"** is
load-bearing. Everything below follows from taking it literally.

### 3b.1 Dead once the project side cannot write

| What | Why it goes |
|---|---|
| `cp "$staged" "$bp"` in `cmd_a2bp` | The direct write. This is the whole point. |
| `--force` **on the project side** | Today a derived project can waive the guard and push contaminated bytes upstream. Under the premise it must not be able to. The waiver decision belongs to whoever applies it, as `inbox apply --force`. A genuine reduction in what a derived project can do, not a relocation of a flag. **But see §3b.6 — v2 also said a blocked file creates no proposal, which contradicts this and leaves `apply --force` nothing to waive.** |
| ~~The `blocked` / partial-run exit accounting~~ **NOT removable** | v2 claimed this dies with the direct write. It does not. `a2bp` still takes `FILE...`, and contaminated input is now *quarantined* rather than dropped, so multi-file outcomes still need accounting. Only the **managed-file partial-WRITE** accounting is dead. The transaction has to be defined first (§3b.6), and only the branches that definition makes unreachable can then be deleted. |
| `cmd_a2bp`'s Step A–E ripple checklist (~110 lines, `scripts/blueprint:773-885`) | It instructs the operator to commit and push **from the blueprint**. That audience no longer exists on the project side. Per F4 the checklist moves to `inbox apply`, where the person doing the committing actually is. It is not deleted; it is delivered to the right party. |
| `docs/A2BP_PLAYBOOK.md` §"Step A0 — the contamination guard" framing | A0 currently tells the operator what the guard did to the file it just wrote. It becomes what the guard recorded in the proposal. |
| The playbook's "do NOT open a new prompt in the blueprint repo" warning | Still true in spirit, but the mechanism changes: the anti-pattern is no longer "context-switch to the blueprint", it is "abandon the proposal". Reworded, not removed — F4 keeps same-session as the primary flow. |
| Blueprint write access from a derived project, beyond the inbox | Becomes enforceable rather than merely conventional: the only path a project has into the blueprint is creating a directory under the inbox. |

### 3b.2 Docs that describe a flow that will no longer exist

Each of these currently says a2bp copies the file into the blueprint. All are
blueprint-managed, so a stale one ships to every derived project:

- `CLAUDE.md` §"Back-propagating (apply-to-blueprint)" — including the A-07
  paragraph, which describes the guard as gating a copy.
- `README.md` §"2. Push (project → blueprint)" and the contamination-guard
  paragraph under it.
- `docs/way-of-working.md` — the sync slide's "Push" bullet and the
  `blueprint a2bp FILE [...]` line in the CLI block.
- `docs/A2BP_PLAYBOOK.md` — the largest rewrite; its entire premise is
  post-write.
- `docs/backlog/README.md` — must document the inbox subdirectory and that it
  is **not** ordinary parked work (it awaits a decision, not prioritisation).
- `docs/DOCUMENTATION.md` §"Back-propagation" — **missed in v2.** It also says
  the file has already landed, calls the checklist post-`a2bp`, and describes
  hints emitted "per file copied". Managed, so it ships everywhere.

**Behaviour-bearing text inside files that survive** — also missed in v2, and
each one is a description that will be false rather than a file to delete:

- `scripts/blueprint` — the header comment, `usage()`, the stale-drift message,
  inline comments, and **the `a2bp|push` alias**.
- `scripts/lib/contamination.sh` — its own contract comments say findings
  "block the copy" and that `--force` copies them.
- `.githooks/pre-push-project` — the A-07 gate text ("the ONLY write path",
  "refuse to copy"), plus the CI/gate wiring if the suite is renamed or split.
- `README.md` — the command-tree and playbook labels, not only §2.

**Decision needed on the `push` alias.** Keeping `push` for a command that only
*proposes* is actively misleading — it is the one word that most implies the
behaviour being removed. Removing it touches docs, help and tests and is a
compatibility break for anyone with muscle memory. v2 omitted it entirely.
Recommendation: **drop the alias**, since the whole change is about not calling
this a push. Flagged rather than assumed.

### 3b.3 Tests that pin the OLD behaviour and must be migrated, not merely joined

**Counted by running the suite, not by reading it.** `tests/a2bp-contamination/`
emits **38** assertions. v2 of this plan said "~25 of 41"; both numbers were
wrong, from memory of the file rather than execution — the same over-claim habit
this plan's own §3b was written to correct.

Of the 38:

- **27 are driven through the real `a2bp` CLI** (emitted assertions 1–25 through
  case `#22`, plus the two `#24` pull→a2bp assertions). **All 27 need harness
  and oracle migration**, because success is no longer observed by reading the
  managed target, blocked findings become a proposal *state* rather than a
  refusal, project-side `--force` disappears, and the decision-pending exit is
  deliberately non-zero.
- **11 are direct `placeholders.sh` primitive assertions** (`#23`, `#25`–`#28`)
  and stay substantively unchanged; only grouping and comments move.

So: **27 of 38**. The new inbox / concurrency / lifecycle tests are *additional*
to that migration, not a substitute for it. Any case left asserting a direct
write would pass only because the old path still existed — which is exactly how
a migration quietly leaves the old behaviour alive.

### 3b.6 Blocked findings still produce a proposal — correcting a contradiction in v2

v2 asserted both of these, and they cannot both be true:

- "findings travel WITH the proposal, the waiver belongs to whoever applies";
- test 2: "contaminated content is refused at propose time — **no proposal is
  created**".

If no proposal exists, the blueprint side never sees the content or the
findings, and `inbox apply --force` has nothing to waive. Removing the derived
project's authority to waive was right. Refusing to let it even *ask* for review
was not — that turns a heuristic false positive into an inability to raise the
question at all, which is how people end up hand-editing the blueprint.

**Corrected:** a BLOCK creates an **immutable proposal in a `BLOCKED_FINDINGS`
state**, carrying the full findings and the content. It is **non-applicable**,
and the derived side cannot promote it out of that state. Only a blueprint-side
decision can reject it, or explicitly waive and apply it. The authority boundary
holds; the ability to ask survives.

### 3b.7 Multi-file transaction semantics — undefined in v2, decided here

`a2bp FILE...` accepts several files and v2 never said what happens when some
are clean and some blocked. Proposed: **one proposal per file** (they cannot
collide, which is the point), each independently clean or `BLOCKED_FINDINGS`,
with a **non-success aggregate exit** if any file blocked. All-or-nothing
publication was the alternative and is worse: it makes one false positive
suppress a batch of good proposals.

**Flagged for the reviewer** — this is a decision, not a derivation, and it is
the kind I have got wrong before by picking the tidier-sounding option.

### 3b.4 What deliberately does NOT go

- `scripts/lib/contamination.sh` — unchanged, called at both ends.
- `scripts/lib/placeholders.sh` — unchanged.
- `MANAGED_FILES` validation — still the first check at propose time.
- `_should_substitute` — unchanged.
- `blueprint pull` / `drift` — untouched. This plan changes one direction only.

### 3b.5 The consequence for the open decision

If derived projects genuinely cannot perform changes, then **`--apply-now`
contradicts the premise** — it is precisely a derived project performing a
change. Codex independently recommends omitting it initially (F6). My original
recommendation to keep it was written before the founder framed the premise
this way, and I now think it was wrong: an escape hatch that reinstates the
exact capability the change removes is not a convenience, it is the old design
wearing a flag.

Recommendation is now **omit it**, and add it later only if a real workflow
proves it necessary — which is the "derived, not designed" rule applied to this
plan's own escape hatch.

## 4. Tests

Behavioural, driven through the real CLI against fixture repos.

1. `a2bp` creates a proposal **and the managed file is byte-identical** after.
2. Contaminated content produces a `BLOCKED_FINDINGS` proposal carrying the
   content and the full findings — **not** a refusal. It is non-applicable, and
   `inbox apply` without `--force` refuses it.
2b. The derived side **cannot** promote a `BLOCKED_FINDINGS` proposal out of
   that state by any command or by editing the proposal.
3. `inbox apply` writes the file and the result matches `content` exactly.
4. `inbox apply` **refuses when the blueprint moved** since propose time.
5. `inbox apply` re-runs the guard: a proposal whose content was hand-edited in
   the inbox after creation is caught, not trusted.
6. `inbox reject` removes it and requires `--why`.
7. Two projects proposing the same file produce **two proposals**, neither
   overwriting the other. (Today the second silently wins.)
8. `drift` reports count and age; zero proposals prints nothing.
9. **No path writes a managed file except `inbox apply`.** Assert it directly:
   run every `a2bp` variant and confirm the managed tree is byte-identical
   afterwards. This is the plan's central safety claim and needs its own test
   rather than being implied by other cases.
10. A proposal survives a blueprint `git pull` — it is tracked, not scratch.

Mutation-check each: a test that passes with the behaviour removed is
decoration. Today's session produced two of those and both were caught in
review, not by me.

## 5. Rollback

Rollback is a single `git revert` of the implementation commit, which restores
the direct-write `cmd_a2bp`. Any proposals already in the inbox remain readable
markdown + content files and can be applied by hand or left in place; nothing is
lost and nothing needs migrating. No state lives outside the repo.

Note this is a **revert, not a fallback** — v3 claimed rollback was cheap partly
because `--apply-now` preserved the old path. With that removed, the old path
exists only in git history, which is the correct trade but a different one.

## 6. Open decision for the founder

**Does `--apply-now` exist at all?**

**Recommendation changed — now: omit it.** The first draft argued to keep it as
a loud escape hatch. Two things moved me:

- The founder's framing — *"derived projects are not allowed to perform any
  changes anymore"* — makes `--apply-now` a direct contradiction of the
  premise, not an exception to it. An escape hatch that reinstates exactly the
  capability being removed is the old design wearing a flag.
- Codex reached the same conclusion independently (F6).

The case for keeping it was the same-person-both-repos typo fix. Under F4 that
case is already served: the primary flow is synchronous, so propose → apply
happens in one session and costs one extra command, not a context switch.

**If it is omitted and that turns out to be wrong**, adding it later is cheap
and reversible. Removing it later, once people have built habits around it, is
not. That asymmetry decides it.

## 7. Risks, stated rather than discovered later

- **Graveyard.** Mitigated by age reporting and by grooming, not solved by them.
  If proposals routinely rot, the answer is that back-propagation is too hard,
  not that the inbox needs another reminder.
- **Staleness.** A proposal against a moved blueprint must be re-made. Correct,
  but it is friction, and heavy blueprint churn makes it worse.
- **More steps.** Propose → decide → apply → ripples is four beats where it was
  one. That is the point. With no `--apply-now`, the pressure valve is no longer
  a flag but **hand-editing the blueprint directly** — which loses the guard and
  the record together. That is the failure to watch for, and the argument for
  keeping the synchronous flow (§2.4) genuinely cheap.
- **Repo growth.** Proposals carry full file content and are **retained**, not
  deleted: `APPLIED_PENDING_RIPPLES` until the playbook closes, `REJECTED` with
  its reason, `BLOCKED_FINDINGS` until resolved. v3 said "deleted on
  apply/reject", which contradicts the lifecycle in §2.1d — retention is the
  point, since a deleted proposal takes its provenance with it. Growth is small
  in practice (managed files are text, mostly < 50 KB) but it is unbounded
  without a **closed-proposal retention policy**, which §2.1d does not yet
  define. Flagged as the one gap I know remains.

## 8. Why this is worth doing now

The blueprint is the multiplier: a rule tightened once benefits every project,
and a mistake copied once reaches every project the same way. `a2bp` is the only
write path into it. Today that path is guarded but not gated — the guard checks
*what* is written, never *whether it should be*.

BUG-002 and A-09 both entered through this door. A-07 made the door check its
visitors. This makes someone answer it.
