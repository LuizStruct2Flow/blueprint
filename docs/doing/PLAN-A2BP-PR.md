# PLAN — `a2bp` files a feature request

**Status:** DRAFT v12 — **reframe accepted at review round 6**; this revision is
the build contract. No code written.

**v12.** §3.0 states the operating boundary the reframe rests on (no automatic
merge, no self-integration without a distinct decision step) — without it "a
person decides" is a habit, not a property. §3.4 restores **canonical request
identity**, which v11 deleted along with the gate machinery: it was never
gating, it is what makes the retry able to recognise its own branch. Plus
PR-response-loss recovery that queries for open *and closed* PRs, base-movement
handling, all-input validation before remote contact, versioned config, honest
`--dry-run` base semantics, and `prs` failure behaviour. §3.1 pins what
"advisory" means — findings still stop `a2bp`; they no longer decide what
reaches the blueprint. §4.2 no longer lists `contamination.sh`, which §4.4 had
already called unchanged.
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

### 3.0 The operating boundary — without this, the reframe is nominal

The whole design now rests on "a person decides upstream". That is a property of
*behaviour*, not of the tool, and it evaporates silently if the same operator
opens a request and merges it in the same breath. So it is stated as a rule
rather than assumed as a habit:

- **No automatic merge.** No auto-merge setting, no bot, no `--merge` flag on
  `a2bp`. The tool has no verb that lands a request.
- **No self-integration without a distinct decision step.** The same person may
  well be on both ends — that is the normal case here — but opening a request
  and integrating it are two acts, separated by actually reading the diff in the
  blueprint's context. Merging a request seconds after filing it is the thing
  this plan exists to stop, and no mechanism prevents it; only the rule does.
- **Merging as-is is a decision, not a shortcut.** It is legitimate for a trivial
  change. It is legitimate *because someone judged it trivial*, which is the step
  that must not be skipped.

Recorded in `CLAUDE.md` §Back-propagating, so it travels to every derived
project rather than living in this plan's memory.

### 3.1 The guard is advisory, and that is now correct

**"Advisory" means precisely this:** the guard runs locally at `a2bp` time and
**still blocks the request from being filed** when it finds something — the
requester fixes it or marks it, exactly as today. What it no longer does is
decide what reaches the blueprint, because that decision is now a person's.

So it is advisory *with respect to the blueprint*, not toothless with respect to
the requester. The distinction matters: v11 said "advisory" and left it open
whether findings still stop `a2bp`. They do.

`--force` is gone because the guard no longer stands between a project and the
blueprint — a requester who genuinely needs to file something the guard dislikes
can say so in the request, and the person implementing decides.

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

`prs` behaviour, since a discovery command that is silent about its own failures
is worse than none: it reports **drafts** and **closed-but-branch-present**
distinctly, ignores nothing silently, and on a `gh` API failure **says the list
is incomplete** rather than printing an empty one that reads as "nothing
pending".

No `--force` (nothing to waive — the guard is advisory). No `push` alias.

### 3.4 Build mechanics — the parts still genuinely needed

- **Scratch clone**, not the operator's blueprint tree, and not a worktree
  sharing their object store. A derived repo's history is unrelated to the
  blueprint's, so the commit must be built against the fetched blueprint base;
  there is no common ancestor to commit against locally.
- **Canonical request identity.** v11 deleted this along with the gate
  machinery, which was wrong: it is load-bearing for the **retry**, not for
  gating, and the retry survives. A stable id that cannot recognise its own
  branch either duplicates it or adopts a stranger's. The key binds, in this
  order:

  | Component | Why |
  |---|---|
  | destination repo | the same content to two remotes is two requests |
  | target branch | rebasing the request onto a different base is a different request |
  | **exact base SHA** | not "the base branch" — a moved base changes what the diff means |
  | target paths, **sorted** | so argument order cannot produce two ids for one request |
  | staged bytes **and file modes**, framed | length-prefixed per path, so `ab`+`c` and `a`+`bc` cannot collide |
  | stated digest + encoding | named in the plan, not left to the implementer |

- **Adoption is exact-tip only, never force.** On retry: if a branch of that name
  exists remotely, adopt it **only if its tip is byte-identical to the commit
  just built**. Otherwise refuse and print both SHAs. Never force-push, and
  never assume a name match is a content match.
- **PR-response loss.** Push succeeded, PR creation returned no answer: the
  request may or may not exist. Recovery **queries for an existing PR on that
  branch — open *or closed*** — before creating one. Creating a duplicate of a
  request the owner already closed is worse than failing.
- **Base movement between build and push.** The base SHA is captured at build
  and re-checked before push; if it moved, the request is rebuilt against the
  new base or refused, never pushed as though built against the current one.
- **Absent-from-base files** are creation; called out as such in the PR body.
- **All inputs validated before any remote contact** — every path in
  `MANAGED_FILES`, every file readable — so a bad argument cannot leave a branch
  pushed and the run aborted.
- **Exact scratch-clone algorithm:** clone with no working-tree checkout of
  unrelated refs, fetch the single base ref at the captured SHA, apply staged
  content, commit, push. Removed on success and failure; path reported if
  removal fails.
- **Versioned config.** `.blueprint-source` gains a remote identity with a
  version marker and a stated behaviour when absent (refuse and say how to add
  it, rather than guessing a remote).
- **`--dry-run` base semantics, honestly.** It resolves and reports the base it
  *would* build against, and says so — it does not promise that base will still
  be current at push time, because it cannot.
- **Existing staging behaviour is unchanged.** `contamination_stage` still
  produces the bytes; only their destination changes.

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
and `.githooks/pre-push-project`'s A-07 gate text. Plus this repo's own
`BLUEPRINT-AUDIT-2026-07-23.md` and `HANDOVER.md`, whose A-07 rows describe a
guard gating a copy.

**`contamination.sh` is NOT in this list.** v11 said it is unchanged in §4.4 and
still listed its contract comments here — both cannot be true. Its comments
describe a guard that blocks a copy, and under v11 that is still exactly what
the *local, advisory* guard does for the requester. Nothing to change.

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
