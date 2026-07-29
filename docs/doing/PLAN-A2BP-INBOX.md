# PLAN — `a2bp` proposes, it does not write

**Status:** DRAFT — awaiting four-eyes consensus. No code written yet.
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
path, **the blueprint SHA at propose time**, the contamination scan output
(including anything waived), and the operator's stated rationale.

The blueprint SHA is what makes apply-time safe: if the target file has moved
since the proposal was made, the proposal is **stale** and apply refuses rather
than silently reverting someone else's work. That failure mode does not exist
today only because today's write is unconditional — which is worse, not better.

### 2.2 CLI surface

| Command | Behaviour |
|---|---|
| `blueprint a2bp FILE...` | Guard, then write a proposal. **No managed file is touched.** |
| `blueprint a2bp --apply-now FILE...` | Today's behaviour, explicitly requested. Loud. |
| `blueprint inbox` | List pending proposals: id, project, target, age. |
| `blueprint inbox show <id>` | Print `PROPOSAL.md` + `diff`. |
| `blueprint inbox apply <id>` | Re-run the guard, check staleness, write the managed file. |
| `blueprint inbox reject <id> --why "<reason>"` | Remove the proposal, append a line to `docs/config/findings.md`. |

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

### 2.4 Wake integration

`cmd_drift` already runs at every wake and already reports gate state, so it is
the path that exists rather than a new one to remember (A-22's lesson):

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
| `tests/a2bp-inbox/test.sh` | new | — |
| `.githooks/pre-push-project`, CI | wire the new suite | — |

Every managed file touched here ships to every derived project, which is
precisely why this needs consensus before code.

## 4. Tests

Behavioural, driven through the real CLI against fixture repos.

1. `a2bp` creates a proposal **and the managed file is byte-identical** after.
2. Contaminated content is refused at propose time — no proposal is created.
3. `inbox apply` writes the file and the result matches `content` exactly.
4. `inbox apply` **refuses when the blueprint moved** since propose time.
5. `inbox apply` re-runs the guard: a proposal whose content was hand-edited in
   the inbox after creation is caught, not trusted.
6. `inbox reject` removes it and requires `--why`.
7. Two projects proposing the same file produce **two proposals**, neither
   overwriting the other. (Today the second silently wins.)
8. `drift` reports count and age; zero proposals prints nothing.
9. `--apply-now` reproduces today's behaviour and says loudly that it did.
10. A proposal survives a blueprint `git pull` — it is tracked, not scratch.

Mutation-check each: a test that passes with the behaviour removed is
decoration. Today's session produced two of those and both were caught in
review, not by me.

## 5. Rollback

The change is additive at the CLI level and `--apply-now` reproduces the old
path exactly, so rollback is a single `git revert` of one commit. Any proposals
already in the inbox remain readable markdown + content files; nothing is lost
and nothing needs migrating. No state lives outside the repo.

## 6. Open decision for the founder

**Does `--apply-now` exist at all?**

- **Recommended: yes, but never the default.** There is a real case — same
  person, both repos open, a one-line typo fix — where routing through an inbox
  is ceremony. Refusing it entirely invites people to hand-edit the blueprint
  instead, which is worse because it loses the guard as well as the record.
- **Against:** every escape hatch gets used by reflex. If `--apply-now` is
  cheap, the inbox becomes decoration and this whole change buys nothing.

My recommendation is to keep it, print a loud banner naming what was bypassed,
and revisit if it turns out to be the common path rather than the exception.

## 7. Risks, stated rather than discovered later

- **Graveyard.** Mitigated by age reporting and by grooming, not solved by them.
  If proposals routinely rot, the answer is that back-propagation is too hard,
  not that the inbox needs another reminder.
- **Staleness.** A proposal against a moved blueprint must be re-made. Correct,
  but it is friction, and heavy blueprint churn makes it worse.
- **More steps.** Propose → notice → review → apply is four beats where it was
  one. That is the point, and it is also the thing most likely to make people
  reach for `--apply-now`.
- **Repo growth.** Proposals carry full file content. Small in practice
  (managed files are text, mostly < 50 KB) and they are deleted on apply/reject.

## 8. Why this is worth doing now

The blueprint is the multiplier: a rule tightened once benefits every project,
and a mistake copied once reaches every project the same way. `a2bp` is the only
write path into it. Today that path is guarded but not gated — the guard checks
*what* is written, never *whether it should be*.

BUG-002 and A-09 both entered through this door. A-07 made the door check its
visitors. This makes someone answer it.
