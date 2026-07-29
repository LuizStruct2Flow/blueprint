# PLAN — `a2bp` files a feature request

**Status:** DRAFT v14 — reframe, behavioural boundary and `CLAUDE.md` rule all
accepted. This revision closes the build contract. No code written.

**v14.** v13 specified a verification step that **cannot be implemented**:
"verify the SHA the key predicts". A content key cannot yield a git commit SHA —
the SHA is over the commit object. Replaced with rebuild-and-compare against the
remote tip, which compares to something that exists. Commit metadata is now
**chosen** rather than offered as options (identity fixed, date = the base
commit's committer date, exact message and ref formats). Input validation is a
full rule table — duplicates, canonicalisation, symlinks, types, modes, the
no-op case. Base re-check is placed explicitly between build and push. And a
third "option" for a blocked requester is removed: it was unreachable, since a
blocked invocation files nothing.

**v13.** The operating boundary is now **actually in `CLAUDE.md`** — v12 said
"Recorded in CLAUDE.md, so it travels" and never recorded it, which is the same
failure as reporting a fix landed in four files when it landed in three. The
canonical key now **states** its digest, encoding and framing rather than saying
"stated"; and **commit metadata is fixed**, because git hashes the commit, not
the content — an identical tree with a moved timestamp is a different SHA, so
without this the exact-tip retry silently degrades to "always refuse". Config
validation and the scratch-clone algorithm are procedures now. Two
contradictions removed: `--dry-run` claimed "no remote contact" while also
resolving the base, and `--force` was justified by "nothing to waive" when §3.1
says findings still stop `a2bp`.

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
| `blueprint a2bp --dry-run FILE...` | Guard, resolve the base, show the diff. **Reads the remote; writes nothing.** |
| `blueprint prs` | Open a2bp requests: number, project, files, age — plus pushed branches with no PR (§3.4). |

`prs` behaviour, since a discovery command that is silent about its own failures
is worse than none: it reports **drafts** and **closed-but-branch-present**
distinctly, ignores nothing silently, and on a `gh` API failure **says the list
is incomplete** rather than printing an empty one that reads as "nothing
pending".

**No `--force`, and the reason is not "nothing to waive".** §3.1 is explicit
that findings still stop `a2bp`, so there *is* something a waiver would waive —
v12 said otherwise in two places and contradicted its own §3.1.

The flag is absent because a finding has exactly **two** correct responses:

1. **Fix it.**
2. **Mark the line** with a justified `a2bp-allow: <why it is safe>`.

v13 listed a third — "file the request describing why the guard is wrong and let
the implementer judge". **That is not reachable:** a blocked invocation files
nothing, and with `--force` gone there is no path from a finding to a request.
Prose describing an option the mechanism does not provide is worse than no
prose, and this is the second time in two rounds I have written one.

If the guard is genuinely wrong, that is a bug in `contamination.sh` and it gets
fixed as one — not routed around per-request.

No `push` alias.

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
  | stated digest + encoding | see below — v12 said "stated" and then did not state them |

  **The key, exactly.** Concatenate, in order, with `\n` between records:

  ```
  v1                                     # key schema version
  <destination remote URL, verbatim>
  <target branch name>
  <base commit SHA, 40 hex, lowercase>
  ```

  then, for each target path **sorted byte-wise ascending**, one record:

  ```
  <path length in bytes> <path> <mode, 6 octal digits> <content length in bytes> <content bytes>
  ```

  Length-prefixing both path and content is what stops `ab`+`c` colliding with
  `a`+`bc`. The digest is **SHA-256** over that byte string, rendered
  **lowercase hex**; the branch id uses its **first 12 characters**. Schema
  version leads the key so a future change is a different id rather than a
  silent collision.

- **The commit must be DETERMINISTIC, or exact-tip adoption never matches.**
  v12 specified a content key and forgot that **git hashes the commit, not the
  content** — an identical tree with a moved timestamp is a different SHA, so
  every retry would refuse and the mechanism would silently degrade to
  "always refuse". Therefore, all fixed:

  Every field **chosen**, not offered as options — v13 gave an "e.g." identity
  and two candidate date rules, and determinism described as a menu is not
  determinism:

  | Field | Value, exactly |
  |---|---|
  | tree | from the staged content |
  | parent | the captured base SHA |
  | author name / email | `a2bp` / `a2bp@blueprint.invalid` |
  | committer name / email | identical to author |
  | author date | **the base commit's committer date**, verbatim, including its timezone offset — available without a clock, and it ties the request to the base it was built from |
  | committer date | identical to author date |
  | message | exactly `a2bp: <n> file(s) from <project>\n\n` followed by one sorted target path per line, LF-terminated, no trailing blank line |
  | branch ref | `refs/heads/a2bp/<project>-<id12>` where `<id12>` is the key digest's first 12 hex characters |

  Set via `GIT_AUTHOR_*` / `GIT_COMMITTER_*` in the environment of the commit
  call, never from the operator's `git config`.

  **How determinism is verified — and how v13 got this wrong.** v13 said to
  "verify the resulting SHA equals the one the key predicts". *There is no such
  prediction.* A content key cannot produce a git commit SHA; the SHA is over
  the commit object. That step was unimplementable and read as rigorous.

  The real check is **rebuild and compare**: on retry, build the commit again
  from the same inputs and compare **the rebuilt SHA to the remote tip**. Equal
  → adopt. Different → refuse and print both. The key's only job is to name the
  branch; the commit's identity is git's, and it is compared against something
  that actually exists rather than something predicted.

- **Adoption is exact-tip only, never force.** On retry: if a branch of that name
  exists remotely, adopt it **only if its tip SHA equals the commit just
  built**. Otherwise refuse and print both SHAs. Never force-push, and never
  assume a name match is a content match.
- **PR-response loss.** Push succeeded, PR creation returned no answer: the
  request may or may not exist. Recovery **queries for an existing PR on that
  branch — open *or closed*** — before creating one. Creating a duplicate of a
  request the owner already closed is worse than failing.
- **Base movement between build and push.** The base SHA is captured at build
  and re-checked before push; if it moved, the request is rebuilt against the
  new base or refused, never pushed as though built against the current one.
- **Absent-from-base files** are creation; called out as such in the PR body.
- **All inputs validated before any remote contact**, so a bad argument cannot
  leave a branch pushed and the run aborted. The full rule set, since v13 said
  "validated" and left the rules to the implementer:

  | Case | Rule |
  |---|---|
  | Path not in `MANAGED_FILES` | Refuse, naming it. Unchanged from today. |
  | **Duplicate paths** in one invocation | Deduplicate after canonicalisation; two spellings of one file are one input, not two records in the key. |
  | **Canonical form** | Resolve `.`/`..` and normalise separators **before** the `MANAGED_FILES` check and before sorting, so the key is stable across spellings. |
  | Path escaping the project root | Refuse. Same class as A-07's project name — argument-supplied path components are never trusted. |
  | **Symlink** at the target | Refuse. A request must carry file content, and following a link would file bytes from somewhere the operator did not name. |
  | Not a regular file (dir, device, fifo) | Refuse, naming the type. |
  | **Mode** | Only `100644` and `100755` are representable; anything else refuses. The mode travels in the key, so a mode-only change is a real request. |
  | Unreadable | Refuse before any remote contact. |
  | **No-op** — staged content and mode identical to base for *every* input | Refuse with a distinct "nothing to request" status. Filing an empty PR wastes the reviewer's attention, which is the scarce resource this whole design is protecting. |
  | Partial no-op | The unchanged files are dropped from the request, and **reported as dropped**; the rest proceed. |
  | Two inputs canonicalising to the same target | Impossible after dedup, but asserted rather than assumed. |

- **Concurrent push to the same branch id.** Two projects producing an identical
  key means identical content against an identical base — the same request.
  Whoever pushes second finds the ref exists, compares tips, and **adopts** it
  (§ exact-tip). A push rejected as non-fast-forward means the tips differ,
  which is the refuse-and-print-both case. Never force, never retry-with-force.
- **Exact scratch-clone algorithm**, step by step, because "clone and commit"
  hides the decisions:

  1. `mktemp -d` under the system temp dir — **never inside either repository**,
     so a failure cannot leave residue in a tracked tree.
  2. `git init` there; add the remote from `blueprint_remote`.
  3. `git fetch --depth 1 <remote> <branch>` — shallow, since only the base tree
     is needed; capture the resolved SHA as **the** base for the key.
  4. `git checkout` that SHA detached.
  5. Write the staged bytes to the target paths, creating parent directories;
     set modes from the key.
  6. `git add` exactly the target paths — **never `-A`**, so nothing incidental
     in the scratch tree can ride along.
  7. Commit with the fixed identity, date and message template above.
  8. **Re-check the base** — `git ls-remote` the target branch and confirm it
     still resolves to the captured SHA. Placed *here*, immediately before the
     push and after the build, because a base that moved during the build makes
     the commit's parent stale. If it moved: discard, rebuild against the new
     base, and re-check once; on a second move, refuse rather than loop.
  9. Push the branch.
  10. Remove the directory on **every** exit path; if removal fails, print the
      path and say it must be cleaned by hand.
- **Versioned config — the procedure, not a summary.** `.blueprint-source`
  gains two keys:

  ```
  config_version   = 2
  blueprint_remote = git@github.com:Owner/blueprint.git
  blueprint_branch = main
  ```

  Validation order, before any remote contact: file exists → `config_version`
  present and understood (**unknown version refuses**, naming the version it
  saw and the one it supports) → `blueprint_remote` present and non-empty →
  `blueprint_branch` present, defaulting to `main` only if the key is absent
  under version 2.

  **Absent `config_version` means version 1** — the pre-existing local-path-only
  file — and `a2bp` refuses with the exact two lines to add. It does **not**
  infer the remote from the local blueprint checkout's `origin`: that checkout
  may point somewhere the operator did not intend to file against, and guessing
  a push destination is not a recoverable mistake.
- **`--dry-run` base semantics, honestly.** It **reads the remote** to resolve
  the base and reports the SHA it would build against — a diff against a guessed
  base is worse than no diff. It writes nothing: no branch, no push, no PR. It
  does not promise that base is still current at a later push, because it
  cannot. v12 said "no remote contact" here and "resolves the base" three
  paragraphs down; resolving the base *is* remote contact, and the first claim
  was the wrong one. **There is no offline mode**; if one is wanted it is a
  separate feature, not a property to imply.
- **Existing staging behaviour is unchanged.** `contamination_stage` still
  produces the bytes; only their destination changes.

## 4. What this removes

### 4.1 From the current implementation

| What | Why |
|---|---|
| The direct write `cp "$staged" "$bp"` | The point of the exercise. |
| `--force` on the project side | Not because there is nothing to waive (§3.1 — findings still stop `a2bp`), but because fix / `a2bp-allow` / say-so-in-the-request already cover it. It is the flag that let a project push contamination upstream. |
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
