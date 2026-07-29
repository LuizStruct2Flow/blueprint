# PLAN — `a2bp` opens a pull request

**Status:** DRAFT v7 — supersedes `PLAN-A2BP-INBOX.md` (678 lines, five review
rounds, still design-level findings). No code written.

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
- **An `a2bp-allow` marker introduced or modified by the PR does not
  suppress.** Only markers already present in the base branch count. This is
  the important one: it preserves the marker's legitimate use (documenting a
  known-benign line that is already upstream) while removing it as a
  contributor-side waiver.
- A named **required check** and repository ruleset, with the bypass list
  stated explicitly — "required" means nothing if administrators silently
  bypass.
- Provenance that matters is derived from **git** (commit author, branch, tree),
  not from prose in the PR body.

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

1. Fetch the blueprint's base branch into an **isolated worktree or scratch
   clone** — never the operator's blueprint working tree, which stays untouched.
2. Apply the guard-staged content there.
3. Commit on a fresh branch from that base, so the branch has exactly one commit
   with the blueprint's history behind it.
4. Push the branch, then open the PR.

**Push succeeded but PR creation failed** is a real state and needs a contract:
the branch exists on the remote with no PR attached. `a2bp` reports it by name
and is **idempotent** — re-running finds the pushed branch and opens the PR
rather than building a second one. Leaving an orphan branch and printing a stack
trace is not acceptable.

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

## 3. What this removes

Beyond §1's table, from the current implementation:

| What | Why |
|---|---|
| The direct write `cp "$staged" "$bp"` | The point of the exercise. |
| `--force` on the project side | The waiver is a merge decision. |
| `a2bp|push` alias | It opens a PR. |
| Step A–E ripple checklist in `cmd_a2bp` (~110 lines) | Moves to the **PR template**, where the reviewer sees it. |
| `BLUEPRINT_ROOT` as the write target | Still needed to compute the diff and run the guard; no longer written to. |

**Docs** (all managed, all currently describe a direct copy): `CLAUDE.md`
§Back-propagating, `README.md` §2, `docs/way-of-working.md` sync slide + CLI
block, `docs/A2BP_PLAYBOOK.md` (largest rewrite — its premise is post-write),
`docs/DOCUMENTATION.md` §Back-propagation, plus the CLI's own header, `usage()`,
comments and stale-drift message, `contamination.sh`'s contract comments, and
`.githooks/pre-push-project`'s A-07 gate text.

**Tests:** `tests/a2bp-contamination/` emits **38** assertions (measured, not
estimated — the inbox plan asserted 41 from memory and was wrong twice). **27
run through the CLI** and need migration: success is now "a PR exists and no
managed file changed". The other 11 are `placeholders.sh` primitive assertions
and are unaffected.

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
  checklist, and a required check verifies the ripple boxes are ticked — the
  obligation has to be visible on the artefact being merged, or it goes the way
  of the four §6.4 violations that produced the playbook.
- **Rejection reasons.** Closing a PR without a comment is a silently discarded
  contribution. Closing requires a reason, same rule the inbox plan had.
- **Partial publication.** One `a2bp` invocation opens **one PR** covering all
  named files. Per-file PRs would fragment a coherent change; the partial state
  to handle is §2.1b's pushed-branch-without-PR, not a half-populated PR.
- **Up-to-date policy.** Whether a PR must be rebased on a moved base before
  merge is a ruleset setting and must be stated, not left to whatever GitHub
  defaults to.

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
