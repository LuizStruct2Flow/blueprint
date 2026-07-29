# PLAN — `a2bp` opens a pull request

**Status:** DRAFT v8 — supersedes `PLAN-A2BP-INBOX.md` (678 lines, five review
rounds, still design-level findings). No code written.

**v8.** §3 rewritten after the founder asked, for the second time, whether the
cleanup is in the plan. It was thinner than the inbox plan's hard-won §3b: four
carry-forwards missing, and **two items described as comment edits are
substantial code** — `security.yml` (absent entirely, though it is the mechanism
the security claim rests on) and `contamination.sh`'s marker scoping. Review
round 2 findings folded in: the base-only marker rule now **byte-binds whole
lines** rather than trusting line numbers, the trusted load covers **every
helper** the guard sources, ripple checkboxes are called acknowledgement rather
than evidence, the up-to-date policy is **chosen**, the build uses a **scratch
clone** with a stable retry id and exact remote-tip matching, and **trusted
source-project identity is named as unresolved**.

**v7, after review of v6.** Three corrections, and the first was the claim I
had explicitly asked to have attacked:

- **"Unbypassable" was false** (§1.1). The guard's own `a2bp-allow` marker is
  contributor-authored under a PR flow, the guard lives in the repo the PR
  modifies, and the PR body is not evidence. The property now has stated
  requirements — base-branch guard code, base-only markers, a named required
  check and bypass contract — and a defensible claim replaces the absolute one.
- **The branch could not have been built as described** (§2.1b). A derived repo
  has history unrelated to the blueprint's, so there is no common ancestor to
  commit against. The proposal is now built in an isolated worktree from the
  fetched blueprint base, with a contract for pushed-branch-but-no-PR.
- **PRs supply lifecycle, not obligations** (§4b). Ripple closure, rejection
  reasons and up-to-date policy still have to be specified.

Also corrected: `--dry-run` previews and does **not** persist, so it is not the
offline mitigation v6 claimed; and branch-mode is conditional on a trusted-owner
boundary rather than simply preferred.
**Raised by:** founder, 2026-07-29 — *"what about doing this with PRs, since
this is an external collaboration to the project"*
**Author:** Sylvia (Orchestrator)

---

## 1. Why this supersedes the inbox plan

The founder's framing is the correction: a derived project proposing a change to
the blueprint **is an external contribution**. Pull requests are the mechanism
built for that, and five rounds of the inbox plan were me re-implementing it in
shell, badly.

Every open finding against v5 is something GitHub already does:

| v5 finding | Under PRs |
|---|---|
| **F1** — atomic, no-clobber, symlink-safe publication; I specified opened-dir no-follow + true no-replace, which **cannot be written in portable shell** | A branch push. Server-side ref compare-and-swap, atomic, already correct. |
| **F2 / F3** — approved identity and tamper-evidence; my digest sat in the same mutable file it guarded | A PR anchors to commit SHAs. Content-addressed and immutable; a force-push is *visible as* a force-push. |
| **F5** — complete transition system, illegal/repeated transitions, crash recovery | PR states **are** the lifecycle, with an append-only event log carrying actor and timestamp. No journal to reconcile. |
| Retention, archive, explicit purge | GitHub retains. No policy to invent. |
| Multi-file transaction semantics | One PR, N files. |
| Two projects proposing the same file | Two PRs, ordinary merge semantics. |

That is the whole of §2.1b–e, §3b.6, §3b.7 and the retention section of the
inbox plan — deleted, not ported.

### 1.1 The security upgrade — and what it costs to actually get it

Today the contamination guard runs **inside the proposing project**, which can
simply not run it. `a2bp --force` exists precisely because the proposing side
holds the waiver.

Moving it to the blueprint's CI is a real improvement, but **v6 claimed
"unbypassable" and that was false as written** (review F1). Three defeats, all
of which follow from the same fact — *a PR is contributor-authored input, and
so is everything in it*:

1. **The guard's own escape hatch.** `contamination.sh` honours a per-line
   `a2bp-allow: <reason>` marker — added in A-07 — and under a PR flow the
   contributor writes the lines. Anyone can silence a finding by putting the
   marker on the line the finding is on.
2. **The guard is in the repo the PR modifies.** CI must run guard code from
   the **trusted base branch**, never from the PR head, or a PR can weaken its
   own gate.
3. **PR-body provenance is not evidence.** v6 had the body carrying the source
   project and local guard output as if it were trustworthy. The contributor
   writes it. It is display-only.

**What the property actually requires:**

- CI checks out and runs the guard **from the base branch**, against the PR's
  merge result.
- **A suppression counts only if the entire candidate line matches, byte for
  byte, a validly-marked line in the base.** v7 said "markers already present in
  the base", which is not yet a rule — **a line number is not an identity**.
  Text moves, and a changed line can land at a position that was marked in the
  base. Byte-binding the whole line is what makes it checkable (R2-F1).
- **The trusted load covers the guard *and every helper it sources*, at a
  pinned base SHA.** v7 said "guard code from the base branch";
  `contamination.sh` sources `placeholders.sh`, which would otherwise be
  PR-controlled — the substitution primitive deciding what the guard sees.
- A named **required check** and repository ruleset, with the bypass list
  stated explicitly and **verified against the live repository** — ruleset, app
  identity and bypass actors — not assumed. "Required" means nothing if
  administrators silently bypass, and nothing at all if the rule is not
  actually configured.
- Provenance comes from **git**, not from prose in the PR body.

**Still unresolved and stated as such:** *trusted source-project identity.* Git
author identifies a person, not which derived project a change came from, and
the PR body is contributor-authored. Nothing in this plan currently establishes
which project proposed something in a way that survives an untrusted
contributor. Inside the trusted-owner boundary (§7) it does not bite; beyond it,
it must be solved before fork mode is used.

With those, the guard is bypassable only by someone who can change the base
branch or the ruleset — which is the founder. That is a defensible claim.
"Unbypassable" was not.

### 1.2 It may also close A-22

**A-22** is rejected and open because enforcement must be server-side, and the
blocker recorded in the register is that this repo is trunk-based, so no branch
exists for required checks to run against before a SHA reaches `main`.

PR-based back-propagation **creates exactly that branch, for exactly this
flow**. Protected branch plus required checks becomes viable for contributions
without making the blueprint's own work branch-based.

**Not claimed as closing A-22** — a human cloning and pushing directly is a
separate path and this does not touch it. But it removes the stated blocker for
the enforcement half, and A-22's disposition should be revisited once this
lands rather than treated as independent.

## 2. The change

```
derived project ──a2bp──▶ branch pushed to the blueprint remote
                                    │
                          PR opened, guard runs in CI
                                    │
                    founder reviews the diff on the PR
                                    │
                              merge  or  close
```

`a2bp` becomes: guard locally (fast feedback), commit to a branch, push, open a
PR, print the URL. It does not write into any working tree — not the blueprint's
and not its own.

### 2.1 CLI surface

| Command | Behaviour |
|---|---|
| `blueprint a2bp FILE...` | Guard, branch, commit, push, open PR, print URL. |
| `blueprint a2bp --dry-run FILE...` | Guard and show the diff; no branch, no push. |
| `blueprint prs` | `gh pr list` filtered to a2bp branches: number, project, files, age. |

No `--force`: the waiver is a merge decision now, made on the receiving side.
No `push` alias: the command opens a PR, and calling it "push" was already
misleading.

### 2.1b How the branch is built — the step v6 assumed away

**A derived project's repository has history unrelated to the blueprint's.**
There is no common ancestor, so "commit the file and push a branch" from inside
the project repo is not a thing that can work. v6 said it anyway, which is the
difference between a plan that reads well and one that runs.

The proposal commit is built **against the blueprint's base**, not the
project's:

1. Fetch the blueprint's base branch into a **scratch clone** — preferred over a
   worktree (R2-F3), because a worktree shares the operator's object store and
   config and is one accident away from touching their tree. Never the
   operator's blueprint working tree, which stays untouched.
2. Apply the guard-staged content there.
3. Commit on a fresh branch from that base, so the branch has exactly one commit
   with the blueprint's history behind it.
4. Push the branch, then open the PR.

**A managed file absent from the base** is creation, not modification, and is
constrained accordingly (R2-F3): it must be in `MANAGED_FILES`, and creating a
path that does not exist upstream is called out in the PR body, since "adds a
new managed file" is a different review than "edits one".

**Push succeeded but PR creation failed** is a real state and needs a contract:
the branch exists on the remote with no PR attached. The branch name is a
**stable retry id** derived from the content and target, not a timestamp, so
re-running produces the same name rather than a second branch. `a2bp` is then
**idempotent**: it finds the pushed branch, verifies the **remote tip matches
the commit it would have built** — exact match, not "a branch of that name
exists" — and opens the PR. On mismatch it refuses and names both SHAs rather
than force-pushing over whatever is there.

The scratch worktree is removed on success and on failure, and its path is
reported if removal fails.

### 2.2 Branch naming and provenance

`a2bp/<project>-<utc-timestamp>` — the project name is validated as a single
path component (attacker-influenced input, same class as A-07's project name).
Provenance goes in the PR body: source project, its path, the files, and the
local guard output including anything it flagged.

### 2.3 The guard runs twice, and the second time is the one that counts

- **Locally at `a2bp` time** — fast feedback to the operator who has the
  context, exactly as today. Advisory.
- **In the blueprint's CI on the PR** — authoritative, unbypassable, a required
  check. This is where `--force` used to live and no longer can.

### 2.4 Wake integration

`blueprint drift` already runs at every wake. It reports open a2bp PRs — count
and oldest age, same reasoning as the inbox plan: a count alone gets ignored at
two and still ignored at forty.

Unlike the inbox, an unmerged PR is **not** invisible — GitHub notifies. Wake
reporting is a convenience here rather than the only discovery path.

## 3. What changes — removals, additions, and what stays

> Founder, twice now: *"is part of the plan also the cleanup needed?"* The first
> version of this section was thinner than the inbox plan's §3b, which had taken
> two review rounds to get right. Four carry-forwards never made it across, and
> **two items I described as comment edits are substantial code**. Corrected
> here rather than re-learned.

### 3.1 Removed

| What | Why |
|---|---|
| The direct write `cp "$staged" "$bp"` | The point of the exercise. |
| `--force` on the project side | The waiver is a merge decision now. |
| `a2bp\|push` alias | It opens a PR; "push" was already misleading. |
| Step A–E ripple checklist in `cmd_a2bp` (~110 lines) | Moves to the PR template + a check (§4b). |
| `BLUEPRINT_ROOT` as a **write** target | Still needed to compute the diff and run the local guard. |

### 3.2 Added or substantially changed — understated in v6/v7

| What | Scope |
|---|---|
| **`.github/workflows/security.yml`** | **Absent from v7's inventory entirely, and it is the mechanism the whole security claim rests on.** Needs a PR-triggered job that checks out the guard **and all its helpers** at a pinned trusted base SHA (R2-F1 — `contamination.sh` sources `placeholders.sh`, which would otherwise be PR-controlled), runs against the merge result, and is registered as a named required check. |
| **`scripts/lib/contamination.sh`** | **Real logic, not the "contract comments" v7 implied.** Marker scoping: a suppression counts only if the *entire candidate line* matches, byte-for-byte, a validly-marked line in the base. A line number is not an identity — text moves, and a changed line can land where a marked one was (R2-F1). |
| `scripts/blueprint` | `cmd_a2bp` rewritten; scratch-clone build (§2.1b); `prs` subcommand; `drift` reporting. |
| `.blueprint-source` | Needs a **remote identity** alongside the local path. Named in §6's trade-offs but missing from the inventory. |
| `project_config_paths.md` | Records the **trusted-owner boundary** (§7) so the first externally-owned project trips over it. |
| PR template | Carries the ripple classification — as acknowledgement, not evidence (§4b). |

### 3.3 Docs describing a flow that will not exist

All managed, so a stale one ships to every derived project: `CLAUDE.md`
§Back-propagating, `README.md` §2 **and its command tree**,
`docs/way-of-working.md` sync slide + CLI block, `docs/A2BP_PLAYBOOK.md`
(largest rewrite — its premise is post-write), `docs/DOCUMENTATION.md`
§Back-propagation, the CLI's own header / `usage()` / comments / stale-drift
message, `contamination.sh`'s contract comments, and
`.githooks/pre-push-project`'s A-07 gate text.

Plus, in this repo's own records: `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md` and
`docs/doing/HANDOVER.md`, whose A-07 entries describe a guard that gates a copy.

### 3.4 What deliberately does NOT go

Stated explicitly because a cleanup inventory invites over-deletion — the inbox
plan learned this and v7 dropped the lesson:

- `scripts/lib/placeholders.sh` — unchanged.
- `MANAGED_FILES` validation — still the first check.
- `_should_substitute` — unchanged.
- `blueprint pull` / `drift` — this changes one direction only.
- The **local** guard run — demoted to advisory, not deleted. It is the fast
  feedback the operator with context needs.

### 3.5 Not removable, contrary to v7's implication

Multi-file accounting. `a2bp` still takes `FILE...`; one invocation opens **one**
PR covering all of them, so the failure modes are all-inputs-or-none and the
pushed-branch-without-PR retry (§2.1b) — not per-file partial writes. The old
*partial-write* accounting dies; the *batch* accounting changes shape. The inbox
plan made exactly this mistake and had it caught in review.

### 3.6 Tests

`tests/a2bp-contamination/` emits **38** assertions (measured by running it —
the inbox plan asserted 41 from memory and was wrong twice). **27 run through
the CLI** and need migration: success becomes "a PR exists and no managed file
changed".

**More than 27 in practice:** cases **#13 and #14** pin `a2bp-allow` suppression
semantics, and the base-only rule *changes* those semantics. They need rewriting
on top of the harness migration, not just re-pointing.

The other 11 are `placeholders.sh` primitive assertions and are unaffected.

New suites: PR construction from a scratch clone, the base-only marker rule
(including a marker added by the PR, and a wholesale-new file where every marker
is new), and a CI-rejects-a-bypassed-guard case driven by pushing a branch
directly rather than through `a2bp`.

## 4. Tests

1. `a2bp` opens a PR **and the blueprint working tree is byte-identical** after.
2. Contaminated content still blocks locally, with the finding shown.
3. **CI rejects a contaminated PR even when the local guard was bypassed** —
   the property that only exists under this design. Drive it by pushing a
   branch directly, not through `a2bp`.
4. `--dry-run` touches no remote.
5. Branch names with a hostile project name are rejected, not interpolated.
6. Two projects proposing the same file produce two PRs.
7. `drift` reports open PR count and oldest age; zero prints nothing.
8. No `a2bp` path writes a managed file — snapshot the tree, assert byte-identity.

### 4b. What PRs do NOT give free (review F3)

A PR supplies lifecycle. It does not supply obligations, and v6 implied it did:

- **Ripple closure.** Merging is not completing the doc-sync ripples the
  A2BP_PLAYBOOK exists for. The PR template carries the classification
  checklist — but **a ticked box is acknowledgement, not evidence**, and v7
  implied a required check could verify it. It cannot: it can verify the box is
  ticked, which is a different claim. Real evidence means a check that inspects
  the diff for the ripple files the classification implies. Anything weaker
  should be described as a prompt, not a gate.
- **Rejection reasons.** Closing a PR without a comment silently discards a
  contribution. **No required check can prevent it** — GitHub has no such hook.
  This is a process convention, stated as one rather than dressed as
  enforcement.
- **Partial publication.** One `a2bp` invocation opens **one PR** covering all
  named files, **atomically over its inputs**: either every file is in the PR or
  none is, and a per-file guard failure fails the whole invocation. The partial
  state to handle is §2.1b's pushed-branch-without-PR.
- **Up-to-date policy — chosen, not listed.** Require the branch to be current
  with base before merge, via merge queue if available. A stale-base merge is
  precisely how a proposal built against one version of a managed file silently
  reverts someone else's change.

## 5. Rollback

Single `git revert`. Any open PRs remain open and mergeable by hand; nothing is
stranded, because the state lives on GitHub rather than in a local directory
this plan invented.

## 6. Trade-offs, stated rather than discovered

- **Network and `gh` auth become required.** `a2bp` is purely local today — a
  filesystem path in `.blueprint-source`. An offline project can propose today
  and could not then. Accepted as a cost by review, with one correction I had
  wrong: **`--dry-run` only previews.** It does not persist anything, so it is
  not an offline-prepare path, and v6 implied it was. If offline preparation
  matters, that is a separate feature and should be named as one rather than
  smuggled in as a mitigation.
- **The trunk-based rule needs an explicit carve-out**, not a silent exception:
  branches exist for *cross-repo contribution*, never for a project's own work.
  `CLAUDE.md` §"Trunk-based development only" must say so, or the next reader is
  right to call this a violation.
- **`.blueprint-source` needs a remote identity** alongside the local path.
- **The blueprint must accept branch pushes or forks** from wherever projects
  live. Fine for one operator; a consideration if projects ever sit under
  different accounts.

## 7. Open decision

**Fork-based or branch-based?** Review sharpened this: branch mode is acceptable
**only inside an explicit trusted-owner boundary**, and fork mode is *required*
beyond it. So the recommendation is conditional rather than simply right.

**Branch-based now**, with the boundary written down: every derived project is
owned by the same operator as the blueprint. The moment that stops being true —
a project under another account, an outside contributor — the flow **must**
move to forks, because branch-push grants write access to the blueprint's ref
namespace and that is not something to hand an untrusted party.

That condition belongs in `project_config_paths.md` as a stated assumption, not
in this plan's memory, so that the person who first adds an externally-owned
project trips over it.

## 8. Why this is the right shape

The inbox plan reached five rounds and was still producing design-level findings
because it was rebuilding, in shell, a system that already exists. This plan is
short for the same reason: almost all of it is deletion, and the remaining
mechanism is `git push` and `gh pr create`.

The blueprint's own rule says pick the solution the next person will thank you
for and prefer removing surface area to adding it. Five hundred lines of
concurrency and lifecycle design, versus a pull request, is not a close call.
