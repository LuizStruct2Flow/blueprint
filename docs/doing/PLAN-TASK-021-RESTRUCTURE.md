# TASK-021 — what ships, decided by one boundary (replan)

Replanned 2026-09-16 against `0598871`. It replaces the 832-line map made against
`e5e3600` on 2026-09-10, which git history keeps. The target is still
[`TASK-018-TARGET.md`](../requirements/TASK-018-TARGET.md) §2. This plan follows the
founder's direction of 2026-09-16: automation and standards over edge cases,
Stage 0 first, short.

## 1. Goal

1. A derived project gets exactly what it needs, and nothing that describes this repo.
2. **One mechanical boundary** decides what ships, and the managed set is **derived** from that boundary. Nobody keeps a list of managed files by hand.
3. A CI and manifest check fails the push when the boundary and the managed set disagree. Nothing depends on a comment saying they agree.
4. The three derived projects migrate through `blueprint pull`, without steps done by hand.
5. The `scaffolding/` + `forge/` directory move is a means to 1–4, not a goal. §5 asks whether it is still needed.

## 2. What changed since 2026-09-10, and what it does to the plan

| Change | Verified at HEAD | Effect |
|---|---|---|
| All tests are `*.spec.ts`. Five are `*.release.spec.ts` and run in CI only. No shell suites remain (TASK-047, TASK-054) | `git ls-files tests` shows no `test.sh`. The only `.sh` is `tests/helpers/proc-cwd.sh` | The old §2.5 and §2.8 are moot: there are no 38 hook blocks, 39 `ROOT=../..` anchors or 13 fixture fixes. The only test-path couplings left are `suites.sh:82,114`, `run-ts-suites.sh:51,225,497,502` (`/tests/<suite>/`) and `tests/vitest.config.ts` |
| Sync reads the blueprint by its remote, from `released` (TASK-025) | `read_blueprint_source` clones the fetched ref into a scratch tree (`scripts/blueprint:1128-1134`). All three projects set `blueprint_release_branch = released` | The old §6 scenario (a blueprint checkout on local disk moving under a frozen CLI) is gone. A move now reaches a project only when `released` advances, so CI gates it first |
| Stage A′ has **landed** (`cc16e62`) and code-root ranking has landed (BUG-066) | `bp_blueprint_path` is at `scripts/blueprint:526`. `bp_base_path` is at `lib/request.sh:205`. The pre-push hook ranks code roots at `.githooks/pre-push:86`. The storm2flow, linkedin-watcher-agent and struct2flow-www CLIs each contain the resolver (11 references each) | **Decision 8 is done.** Its precondition, that every derived project has pulled it, holds |
| a2bp carries unmanaged files (TASK-037) | `scripts/blueprint:2054,2115` | `a2bp` no longer needs a path to be managed. Old decision 7's worry that "a2bp rejects every request under a literal `("scaffolding/")`" loses most of its force |
| `settings.json` merges `settings.project.json` (TASK-042) | Documented in CLAUDE.md, and `drift` compares the merged result | Under the move, the blueprint's own `PreToolUse` hook path would need `scaffolding/scripts/no-chain-guard.sh` while the shipped file needs `scripts/…`. The merge covers **only permission lists, not hooks**, so the physical move gains a new cost (§5, Stage 3) |
| Projects track CLAUDE.md, AGENTS.md, AGENT_SIGNAL.md, DoD.md, PUBLISHING.md and HANDOVER.md (TASK-048) | CLAUDE.md §TASK-048 | `AGENT_SIGNAL.md` ships and is tracked downstream, **but it is not in `MANAGED_FILES`**. That is the same defect as Stage 0(a), found again (Stage 1) |
| `scripts/sonar.sh` imports ShellCheck (TASK-051) | `sonar.sh` is managed | Under a move, `sonar-project.properties` `sonar.sources` gains a prefix here and nowhere else. One line |
| A push that changes only `.md` files skips the code stages (TASK-053) | `run-ts-suites.sh:264-273` | Stage 2 is mostly `.md`, but it edits `.gitattributes`, so it takes the full gate anyway. No effect |

### The eight founder decisions, re-read

| # | Decision (2026-09-10) | Status now | Proposal |
|---|---|---|---|
| 1 | `ROOT_SHIPPED` class for CI workflow + `settings.json`; CLAUDE.md root stub | **Moot unless Stage 3 goes ahead** | Keep as written for Stage 3. Without the move, every file already lives where its tool reads it |
| 2 | `forge/` = bootstrap + templates + their suites; `scripts/blueprint` ships; `new-project.sh` stops shipping | Stands | The "stops shipping" half is Stage 0(b), done with `export-ignore` and no move |
| 3 | Split `docs/` by audience (shipping / blueprint-only / this repo's pitch) | Stands | Done as Stage 2 with `export-ignore`, no move. **One cost it did not name:** the shipped CLAUDE.md links to `docs/way-of-working.md` and `docs/A2BP_PLAYBOOK.md`, so those CLAUDE.md sections have to leave the shipped file too, or `doc-links` fails downstream |
| 4 | `LICENSE` → `forge/templates/LICENSE` with a new `{{COPYRIGHT_HOLDER}}` token, prompted at bootstrap | **Proposed change** | **Do not ship a LICENSE at all** (`export-ignore`). A second token has to be taught to the placeholder guard, the a2bp restore and the bootstrap prompt, and non-interactive bootstrap tests would need a default, all for a file a project writes once. A project's licence is its owner's decision, and GitHub adds one in a click. Founder call (§9 Q1) |
| 5 | Delete `scripts/accept-bug-022.sh` | Stands | Stage 0(d) |
| 6 | `docs/assets/brand/` resolved by #3 | Stands | Stage 2 |
| 7 | `MANAGED_FILES` derived from `scaffolding/`, in project coordinates | **Proposed adjustment** | Same rule, different source: derive the managed set from the **export boundary that already exists** (`git archive HEAD`, minus `TEMPLATE_FILES`, minus a short seed list). This delivers the decision's whole value (no hand-kept array, and nothing that ships can be unmanaged) **with no file moves**. The known cost stands: the array's per-file "why" comments move into the files' headers first |
| 8 | Stage A′ authorized, per-path resolver | **Done** (`cc16e62`) | If the founder drops Stage 3, the resolver, the code-root ranking and `tests/blueprint-relocation` become dead code. Delete them in that case (§9 Q2) |

Decision 9 (retiring a shipped file) — **proposed adjustment:** derive the
retired set rather than keep a `RETIRED_FILES` manifest. A path is *retired* when
it was in the archive at the project's `bootstrap_sha` and is not in it at the
fetched `released` commit. The content proof and the `y/n` prompt stay as
decided. That removes the manifest nobody would remember to update.

## 3. Stage 0 — four defect fixes, no moves

| | Defect | Verified | Fix | Proves it |
|---|---|---|---|---|
| a | `wait-mic.sh`, `session-resume.sh` and `no-chain-guard.sh` ship unmanaged | **Already fixed** by BUG-114 (`1d4bcb4`). All three are in `blueprint files`, and `tests/managed-references` guards the class | Nothing | `managed-references` |
| b | `scripts/new-project.sh` ships to every project and is managed (`blueprint files`). All three projects hold a copy | Yes | Remove it from `MANAGED_FILES` and add `scripts/new-project.sh export-ignore` | `bootstrap-contents`: a new project has no `scripts/new-project.sh`. The bootstrap suites still run it from the blueprint |
| c | `LICENSE` ships as `Copyright (c) 2026 Luiz Scheidegger` | Yes (`git archive HEAD`). linkedin-watcher-agent carries it, which is correct there. The other two have none | Per §9 Q1: `LICENSE export-ignore` (recommended), or decision 4's token | `bootstrap-contents`: no `LICENSE` in a new project |
| d | `scripts/accept-bug-022.sh` is dead and ships | Yes. It is absent in all three projects, so nobody downstream is affected | `git rm` | Nothing to test. It is a deletion |

Size: one commit per row, about 10 lines of change plus two assertions. There is
no downstream migration, apart from the three orphaned `new-project.sh` copies,
which Stage 1's retirement removes, or which a one-line `git rm` in each project
removes today.

## 4. Stage 1 — the managed set is derived from the export boundary

**Value:** it closes the whole "ships but unmanaged / managed but not shipped"
class for good. That class produced BUG-029, BUG-114, Stage 0(a) and (b), and
today's `AGENT_SIGNAL.md`. It also deletes the 69-entry hand-kept array.

- `bp_managed_files` = `git archive HEAD` listing in the blueprint tree, minus
  `TEMPLATE_FILES` (already exists, `scripts/blueprint:296`), minus a named
  `SEEDED_FILES` list of files that ship once and then belong to the project:
  `README.md`, `.gitignore`, `.gitattributes`. The `tests/` directory special
  case (`bp_expand_managed_dirs`) disappears, because the listing is already
  per file.
- A new `tests/manifest` case checks that archive = managed ∪ templates ∪ seeds,
  exactly. It is the check that fails when the next file slips through.
- Running it at HEAD fails first on the leaks it exposes, which this stage fixes:
  `AGENT_SIGNAL.md` becomes managed (it ships and is tracked downstream), and
  `docs/config/findings.md`, `docs/requirements/TASK-018-{RULES,TARGET}.md` and
  `docs/talk-enforcing-agentic-quality.md` are **this repo's own content
  shipping into every new project** (A-05 class), so they get `export-ignore`.
- `pull` retires files by the derived rule (§2, decision 9). The first real
  users are the three `new-project.sh` copies.
- `blueprint files` output is unchanged in shape.

**Downstream:** a project runs `blueprint pull scripts/blueprint`, then `blueprint
drift` shows `AGENT_SIGNAL.md` as drifted or new, and `pull` offers to retire
`new-project.sh`. The old CLI keeps working until then, because the fetched tree
is a full checkout and every path it names still exists.

## 5. The stages after 1, and whether each is worth it

### Stage 2 — blueprint-only docs stop shipping (decisions 3, 6)

`export-ignore` `docs/way-of-working.{md,pdf}`, `docs/assets/brand/` and
`docs/A2BP_PLAYBOOK.md`. The CLAUDE.md sections that exist only for the
blueprint move out of the shipped CLAUDE.md into a file only this repo has: the
deck rule, the implementer half of a2bp, "the blueprint is derived", and the
blueprint-trunk section. CLAUDE.md imports that file here, and the import is
skipped downstream because the file is absent (the same mechanism as
`claude.internal.md`).

**Value:** every derived session stops loading the blueprint-only prose that
cannot apply to it. It stops `doc-links` from depending on files a project should
not have. It is the context-economy half of TASK-024, delivered where the files
already are. **Worth it.** Stage 1 retirement handles the downstream orphans.

### Stage 3 — the physical `scaffolding/` + `forge/` move (TARGET §2)

After Stages 0–2, what ships is already decided by one checked boundary. **What
the move still adds is legibility:** you can see what ships from the directory
name. What it costs at HEAD:

- About 180 `git mv`s, and link rewrites in every root file.
- `.github/workflows/security.yml`, `.claude/settings.json` (hook command
  paths, which TASK-042's merge does not cover) and `sonar-project.properties`
  each need a `scaffolding/` prefix here but not in the copy that ships. That
  means either two copies (BUG-009's shape) or a code-root indirection inside
  each file.
- The two-coordinate resolvers (`bp_blueprint_path`, `bp_base_path`, code-root
  ranking) stay permanently.
- `run-ts-suites.sh`'s `/tests/<suite>/` mapping and `suites.sh`'s `tests/`
  root gain a prefix.
- The `blueprint`/`both` tier names flip to `forge`/`scaffolding` across code
  and prose.

**Honest view: not worth its cost once Stages 1–2 land.** Every defect it was
meant to prevent is then prevented by a check rather than by a directory, and
the directory brings its own class of defect: files the reading tool pins to the
root. Recommendation: **drop it, and delete the Stage A′ machinery** (§9 Q2).
The founder chose the symmetric shape "knowing the cost", and that choice is
theirs to keep. If they keep it, decisions 1–3 and the old plan's §2.4
`bp_should_substitute` trap still apply as written.

### Stage 4 — co-location (TARGET R2, §3)

This is not TASK-021. Once specs live beside the code, the only coupling is
`run-ts-suites.sh:497,502`. It is independent of Stage 3 and belongs to its own
item.

## 6. Downstream: storm2flow, linkedin-watcher-agent, struct2flow-www

| Stage | What each project sees | How it migrates |
|---|---|---|
| 0 | Nothing, until it pulls. `new-project.sh` is left orphaned (all three) | Stage 1 retirement, or `git rm` |
| 1 | `drift` reports the changed CLI. After pulling it, `AGENT_SIGNAL.md` shows as drifted, and `new-project.sh` is offered for retirement | `blueprint pull`, then the per-file `y/n` |
| 2 | CLAUDE.md shrinks. `way-of-working.md`, `A2BP_PLAYBOOK.md` and brand files are offered for retirement | `blueprint pull` |
| 3 (if kept) | Nothing: the strip lands paths in the same place, and all three already carry A′ | Nothing. Precondition: `released` gates it |

Each stage reaches a project only when `released` advances, after the
blueprint's CI has run. linkedin-watcher-agent's `LICENSE` names the founder,
which is correct for it. Retirement will offer to delete it only if Stage 0(c)
makes it "shipped then, not now" **and** the content is identical, so the answer
at the prompt is `n` (§8).

## 7. Verification

| Stage | Automated proof |
|---|---|
| 0 | `bootstrap-contents` (new absence assertions for `new-project.sh` and `LICENSE`). `managed-references` stays green |
| 1 | New `manifest` case: archive = managed ∪ templates ∪ seeds. `bootstrap-gate` #4 (drift-clean) and #6 (a full pull is a no-op). `pull-behaviour` gains a retirement case (identical → offered, edited → reported, absent → silent). `a2bp-inputs` and `a2bp-request` stay green |
| 2 | `bootstrap-gate` #2/#3 run the derived project's gate, which includes `doc-links`, so a dangling link from the shipped CLAUDE.md fails there. The `manifest` case again |
| 3 | `blueprint-relocation`, `code-root`, `bootstrap-gate` all cases, and a new `bootstrap-contents` assertion that no delivered path starts with `scaffolding/` or `forge/` |

Iterate with `npx vitest run <files>`, not the full gate (BUG-057). Run the gate
once, at the end.

## 8. Known limits

- The shipped `.gitattributes` still carries blueprint-only lines downstream, and `suites.sh:114` reads it there. That is harmless because the paths do not exist.
- A project's first `drift` after Stage 1 reports the CLI as drifted. That is expected.
- Retirement compares against the archive at `bootstrap_sha`. A project whose `bootstrap_sha` is an adoption commit gets its retired set computed from that commit.
- A licence file identical to the blueprint's would be offered for retirement. The prompt is the guard.
- `README.md` still ships as the blueprint's own README, as a seed. Rewriting that template is a separate item.

## 9. Open questions for the founder

1. **Decision 4, `LICENSE`:** stop shipping it (recommended), or keep the prompted `{{COPYRIGHT_HOLDER}}` token as decided?
2. **Stage 3:** drop the physical move once Stages 1–2 land, and delete the A′ resolver, the code-root ranking and `tests/blueprint-relocation`? Or keep the symmetric shape as chosen?
3. **Decisions 7 and 9:** accept that the managed set and the retired set are derived from the `git archive` boundary rather than from a `scaffolding/` directory or a `RETIRED_FILES` manifest?
