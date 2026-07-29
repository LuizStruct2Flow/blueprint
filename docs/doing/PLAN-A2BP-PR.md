# PLAN — `a2bp` files a feature request

**Status:** DRAFT v11. No code written.
**Supersedes:** `PLAN-A2BP-INBOX.md` (678 lines, five review rounds) and this
document's own v6–v10 (five further rounds).

**The reframe that collapsed it** — founder, 2026-07-29:

> *"the contamination can be avoided in the blueprint, we are not going to
> blindly merge down, and the PR is like a 'Feature Request' not the 'Feature
> Implementation'"*

---

## 1. What was wrong with v6–v10

Every version until now assumed **the PR is the delivery mechanism** — that
merging it *is* the back-propagation. That single assumption generated the
entire apparatus:

| Machinery | Existed only because… |
|---|---|
| Required contamination check on the PR | …merging would land unreviewed bytes |
| Base-branch guard loading, pinned SHAs, helper trust | …the check had to resist the contributor |
| `a2bp-allow` byte-binding against base lines | …the contributor could otherwise waive findings |
| `a2bp-ripples` schema + class→paths table + check | …merging had to imply ripple completion |
| Evidence-in-commit, merge-transform handling | …the checked tree had to be the merged tree |
| Canonical publication key, collision rules | …two merges could race |

**None of that is needed if the PR is a request.** The blueprint owner reads it
and *does the work*, and a human doing the work is where contamination gets
caught — the same place it has always been caught for every other blueprint
change.

Eleven review rounds of increasingly precise findings, against a premise that
was wrong from v6. The findings were all correct; they were correct *about the
wrong design*.

## 2. This is an existing blueprint rule, not a new one

CLAUDE.md already says it, for spikes:

> …that arm's code is *re-implemented* (or carefully copied) into `src/` as part
> of the implementation sprint — **never `mv`'d wholesale from the spike
> folder**.

And §"The blueprint is derived, not designed" describes promotion as deliberate
upstream work after a pattern has proved itself — not an automatic transfer.

`a2bp` has been the exception: the one path that moves bytes wholesale into the
blueprint without anyone re-deciding them. **v11 makes it obey the rule the rest
of the repo already follows.**

## 3. The change

```
derived project ──a2bp──▶ PR against the blueprint = a REQUEST
                                    │
                    "here is an improvement that proved itself here"
                                    │
                   blueprint owner reads it, and IMPLEMENTS upstream
                        (merge if trivially right, adapt, or rewrite)
```

`a2bp` guards locally for the requester's benefit, builds a branch in a scratch
clone from the blueprint base, pushes, opens a PR, prints the URL. It writes
into no working tree — not the blueprint's, not its own.

**Merging is one possible outcome, not the definition of success.** A typo fix
may be merged as-is. A rule change is usually re-implemented with the ripples
done properly, and the PR closed with a reference to the real commit.

### 3.1 The guard is advisory, and that is now correct

It runs locally at `a2bp` time, shows findings, and the requester fixes what it
flags. It is **not** a gate, because the gate is a person deciding whether to
implement.

Optional later: a CI run on the PR as a **convenience signal** for the reviewer
— "this request contains a host path" is useful to see. It is not load-bearing
and needs none of the trust machinery v7–v10 accumulated. **Explicitly out of
scope for this plan.**

### 3.2 Ripples belong to the implementer

`A2BP_PLAYBOOK.md` is for whoever makes the change *in the blueprint*, which is
now unambiguously the blueprint-side operator. No schema, no class table, no
check. The playbook's "same session, no context switch" rule applies to the
implementation session, where it always belonged.

### 3.3 CLI

| Command | Behaviour |
|---|---|
| `blueprint a2bp FILE...` | Guard locally, build branch in a scratch clone, push, open PR, print URL. |
| `blueprint a2bp --dry-run FILE...` | Guard and show the diff. No remote contact. |
| `blueprint prs` | Open a2bp requests: number, project, files, age — plus pushed branches with no PR (§3.4). |

No `--force` (nothing to waive — the guard is advisory). No `push` alias.

### 3.4 Build mechanics — the parts still genuinely needed

- **Scratch clone**, not the operator's blueprint tree, and not a worktree
  sharing their object store. A derived repo's history is unrelated to the
  blueprint's, so the commit must be built against the fetched blueprint base;
  there is no common ancestor to commit against locally.
- **Stable branch id** derived from target paths + content, not a timestamp, so
  a retry finds its own branch instead of creating a second one.
- **Push-succeeded-PR-failed** is a real state: re-running verifies the remote
  tip matches the commit it would have built and opens the PR, or refuses and
  names both SHAs. Never force-push.
- **Absent-from-base files** are creation; called out as such in the PR body.
- Scratch clone removed on success and failure; path reported if removal fails.

## 4. What this removes

### 4.1 From the current implementation

| What | Why |
|---|---|
| The direct write `cp "$staged" "$bp"` | The point of the exercise. |
| `--force` on the project side | The guard is advisory; there is nothing to waive. |
| `a2bp\|push` alias | It files a request. |
| Step A–E ripple checklist in `cmd_a2bp` | Belongs to the implementer, i.e. the playbook. |
| `BLUEPRINT_ROOT` as a **write** target | Still read, to compute the diff and run the local guard. |

### 4.2 Docs describing a direct copy

All managed: `CLAUDE.md` §Back-propagating, `README.md` §2 **and its command
tree**, `docs/way-of-working.md` sync slide + CLI block, `docs/A2BP_PLAYBOOK.md`
(reframed to "you are implementing a request"), `docs/DOCUMENTATION.md`
§Back-propagation, the CLI header / `usage()` / comments / stale-drift message,
`contamination.sh`'s contract comments, `.githooks/pre-push-project`'s A-07 gate
text. Plus this repo's own `BLUEPRINT-AUDIT-2026-07-23.md` and `HANDOVER.md`,
whose A-07 rows describe a guard gating a copy.

### 4.3 Changed

- `.blueprint-source` — needs a remote identity beside the local path, with a
  version marker and behaviour when absent.
- `project_config_paths.md` — records the trusted-owner boundary (§6).

### 4.4 What deliberately does NOT go

- `scripts/lib/contamination.sh` — **unchanged**. No marker scoping, no base
  trust. v7–v10's changes here existed only for the receiver-enforced gate.
- `scripts/lib/placeholders.sh`, `MANAGED_FILES` validation,
  `_should_substitute`, `pull`, `drift` — all unchanged.
- The local guard run — advisory, and that is its correct role.

### 4.5 Tests

`tests/a2bp-contamination/` emits **38** assertions (measured). **27 run through
the CLI** and need harness migration: success becomes "a PR exists and no
managed file changed". The other 11 are `placeholders.sh` primitives, unaffected.

**Cases #13/#14 stay as they are** — they pin `a2bp-allow` semantics, and those
semantics are unchanged now that marker scoping is out of scope. v8–v10 said
they needed rewriting; that followed from the gate design, which is gone.

New: PR construction from a scratch clone, stable-id retry, absent-from-base
creation, and no-path-writes-a-managed-file.

## 5. Rollback

Single `git revert`. Open requests stay open and remain valid as requests.

## 6. Trade-offs and boundaries

- **Network and `gh` auth required.** `a2bp` is purely local today.
  `--dry-run` previews only; it does not persist offline work.
- **Trusted-owner boundary.** Branch-push is fine while every derived project
  belongs to the same owner. Beyond that, forks — and *trusted source-project
  identity*, which nothing here establishes, becomes a real problem. Recorded in
  `project_config_paths.md` so the first externally-owned project trips over it.
- **Contamination reaching the blueprint is now a human-review property**, as it
  is for every other change to this repo. That is weaker than a machine gate and
  stronger than today's bare `cp`, which has no review at all.

## 7. What is deliberately deferred

The receiver-enforced guard — required checks, base-branch trust, marker
byte-binding, ripple evidence. **The design record for it is v6–v10 plus eleven
review rounds in `PLAN-A2BP-PR-REVIEW.md` and `PLAN-A2BP-INBOX-REVIEW.md`**, and
it is genuinely valuable: it documents exactly what such a gate must handle and
five specific ways a hand-rolled version fails.

Build it when a derived project is owned by someone whose review you would not
take on trust. Until then it is machinery guarding against a threat model that
does not exist here.
