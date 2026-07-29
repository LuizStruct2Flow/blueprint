# PLAN — `a2bp` opens a pull request

**Status:** DRAFT v6 — supersedes `PLAN-A2BP-INBOX.md` (678 lines, five review
rounds, still design-level findings). No code written.
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

### 1.1 The part that is a security upgrade, not only a simplification

Today the contamination guard runs **inside the proposing project**, which can
simply not run it. `a2bp --force` exists precisely because the proposing side
holds the waiver.

Under a PR flow the guard runs in the **blueprint's CI, against the PR**. It
becomes **unbypassable by the contributor**: a project can open a PR with
anything in it, and the blueprint's own gate decides. That is strictly stronger
than any local design could be, and it is the property the inbox plan was
straining to approximate with digests and locks.

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

## 5. Rollback

Single `git revert`. Any open PRs remain open and mergeable by hand; nothing is
stranded, because the state lives on GitHub rather than in a local directory
this plan invented.

## 6. Trade-offs, stated rather than discovered

- **Network and `gh` auth become required.** `a2bp` is purely local today — a
  filesystem path in `.blueprint-source`. An offline project can propose today
  and could not then. Mitigation: `--dry-run` still works offline, and the guard
  is local, so an operator can prepare and push later. **This is the real cost
  of the change and should be weighed, not waved past.**
- **The trunk-based rule needs an explicit carve-out**, not a silent exception:
  branches exist for *cross-repo contribution*, never for a project's own work.
  `CLAUDE.md` §"Trunk-based development only" must say so, or the next reader is
  right to call this a violation.
- **`.blueprint-source` needs a remote identity** alongside the local path.
- **The blueprint must accept branch pushes or forks** from wherever projects
  live. Fine for one operator; a consideration if projects ever sit under
  different accounts.

## 7. Open decision

**Fork-based or branch-based?** Branch-push is simpler and fine while every
project belongs to the same owner. Forks are the correct model if a derived
project is ever owned by someone else. Recommendation: **branch-based now**,
because forks add ceremony for a case that does not exist yet — the same
"derived, not designed" reasoning that argues for this plan over the inbox.

## 8. Why this is the right shape

The inbox plan reached five rounds and was still producing design-level findings
because it was rebuilding, in shell, a system that already exists. This plan is
short for the same reason: almost all of it is deletion, and the remaining
mechanism is `git push` and `gh pr create`.

The blueprint's own rule says pick the solution the next person will thank you
for and prefer removing surface area to adding it. Five hundred lines of
concurrency and lifecycle design, versus a pull request, is not a close call.
