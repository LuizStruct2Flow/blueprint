# TASK-021 — what ships, decided by one boundary (replan)

Replanned 2026-09-16 against `0598871`, and revised the same day with Alexey's
(Codex) alignment review of `8bfa593`, whose verdict was "aligned after these
changes". All four of its findings are applied below. It replaces the 832-line
map made against `e5e3600` on 2026-09-10, which git history keeps. The target is
[`TASK-018-TARGET.md`](../requirements/TASK-018-TARGET.md) §2. The direction is the
founder's, from 2026-09-16: automation and standards over edge cases, Stage 0
first, and short.

## 1. Goal

1. A derived project gets exactly what it needs to operate, and nothing that maintains this repo.
2. **One mechanical boundary**, the export archive, decides what ships. The managed set is **derived** from it, and nobody keeps a list of managed files by hand.
3. A bootstrap/sync consistency check fails the push when delivery and sync disagree.
4. The three derived projects migrate through `blueprint pull`, with no steps done by hand, whatever order they pull in.

## 2. What changed since 2026-09-10

| Change | Effect |
|---|---|
| All tests are `*.spec.ts`, and no shell suites remain (TASK-047, TASK-054) | The old §2.5/§2.8 hook and anchor work is moot |
| Sync reads `released` by its remote (TASK-025). All three projects set it | A change reaches a project only after the blueprint's CI has gated it |
| Stage A′ resolver and code-root ranking landed (`cc16e62`, BUG-066) and are in all three CLIs | Decision 8 is done. It becomes dead code if Stage 3 is dropped |
| a2bp carries unmanaged files (TASK-037) | Paths no longer need to be managed to be proposed |
| `settings.json` merges only permission lists, not hooks (TASK-042) | A physical move would need different hook paths here and downstream, a new cost for Stage 3 |
| `AGENT_SIGNAL.md` ships and is tracked downstream, but is not in `MANAGED_FILES` | The same class of defect as Stage 0(b), found again. Stage 1 closes it |

### Founder decisions, re-read

| # | Decision (2026-09-10) | Status |
|---|---|---|
| 1 | `ROOT_SHIPPED` class and a root CLAUDE.md stub | Moot if Stage 3 is dropped |
| 2 | `new-project.sh` stops shipping, and `scripts/blueprint` ships | Stands. It is Stage 0(b) |
| 3 | Split `docs/` by audience | Stands. It is Stage 2, now split by **responsibility** |
| 4 | `LICENSE` as a template with a `{{COPYRIGHT_HOLDER}}` token | **APPROVED by the founder 2026-09-16: ship no LICENSE.** A second token would need the placeholder guard, the a2bp restore, a bootstrap prompt and a test default, all for a file the owner writes once. Both reviewers agree |
| 5 | Delete `scripts/accept-bug-022.sh` | Stands. It is Stage 0(d) |
| 6 | `docs/assets/brand/` resolved by #3 | Stands. It is Stage 2 |
| 7 | `MANAGED_FILES` derived from `scaffolding/` | **APPROVED by the founder 2026-09-16: derive it from the export archive instead.** That keeps the whole value, with no hand-kept array and nothing shipped unmanaged, and needs no file moves. Both reviewers agree |
| 8 | Stage A′ per-path resolver | Done |
| 9 | Retire files that stop shipping | **APPROVED by the founder 2026-09-16: the corrected design in §4.2** |
| — | Stage 3, the physical `scaffolding/` + `forge/` move | **APPROVED by the founder 2026-09-16: drop it (§5).** Both reviewers agree |

## 3. Stage 0 — defect fixes, no moves

| | Defect | Fix | Proof |
|---|---|---|---|
| a | `wait-mic.sh`, `session-resume.sh` and `no-chain-guard.sh` ship unmanaged | Already fixed by BUG-114 (`1d4bcb4`) | `managed-references` |
| b | `scripts/new-project.sh` is managed and ships, and all three projects hold a copy | Remove it from `MANAGED_FILES` and add `scripts/new-project.sh export-ignore`. **First** move `a2bp-inputs` #4c, which reads that script from the subject tree, into the blueprint-only `bootstrap-contents` suite. `a2bp-inputs` ships, so without the move every derived project's suite run fails. The validator cases (#4a, #4b and the rest) stay in `a2bp-inputs` | `bootstrap-contents`: a new project has no `new-project.sh`, and the relocated #4c passes |
| c | `LICENSE` ships a named owner's copyright | Per decision 4: `LICENSE export-ignore`, and remove the `[License: MIT](LICENSE)` badge from the README that ships (`README.md:3`) in the same commit | `bootstrap-contents`: no `LICENSE`, and no link to it in the delivered README |
| d | `scripts/accept-bug-022.sh` is dead and ships | `git rm` | None needed, it is a deletion |

**Verification includes the derived gate now, not at Stage 2.** `bootstrap-gate`
#2/#3 run a new project's own gate, so a shipped suite that depends on a removed
file fails here.

Stage 0's export removals are **not released before §4.2 retirement support**.
They land in the same release as it, or after it (see §4.2 for why).

## 4. Stage 1 — the managed set comes from the archive

**Value:** it closes the "ships but unmanaged / managed but not shipped" class
(BUG-029, BUG-114, Stage 0(a) and (b), and `AGENT_SIGNAL.md`), and it deletes
the 69-entry hand-kept array.

### 4.1 Derivation and the consistency check

- `project-owned` = `TEMPLATE_FILES` destinations ∪ `SEEDED_FILES` (`README.md`,
  `.gitignore`, `.gitattributes`). These files are delivered once and then belong
  to the project.
- `bp_managed_files` = the archive listing of the fetched commit, minus
  `project-owned`. `bp_expand_managed_dirs` goes away, because the listing is
  already per file. The shape of `blueprint files` output does not change.
- **The consistency check** (`tests/manifest`) asserts
  `archive = managed ∪ (archive ∩ project-owned)` and `managed ∩ project-owned = ∅`.
  It runs against the real `blueprint files` output and the real archive, not a
  second copy of the subtraction.
- **Template seeding is verified against real bootstrap output**
  (`bootstrap-contents`). Every path a fresh bootstrap writes is either managed
  or project-owned, and every `TEMPLATE_FILES` destination is present. The five
  root `project_config_*.md` files are seeded from `templates/` and are not in
  the archive, so they are checked here, not in the archive equation.
- This is a bootstrap/sync consistency check. **It is not an audience
  classifier:** a newly tracked blueprint document still ships by default.
  Audience is decided by directory conventions in `.gitattributes`, following
  the lifecycle directories' pattern:
  - `docs/requirements/** export-ignore` with `-export-ignore` for its README, so
    the next requirement document needs no new line.
  - The same pattern for `docs/config/` blueprint records (`findings.md`, the
    audit), keeping `docs/config/README.md`.
  - `docs/talk-enforcing-agentic-quality.md` moves into the Stage 2
    blueprint-only set.
- `AGENT_SIGNAL.md` becomes managed automatically.

**As built (2026-09-17), and where it differs from the above:**

- The consistency check is `bootstrap-contents` #10 (equation) and #10b (a real
  bootstrap), not `tests/manifest`. `manifest` ships, and the equation is only
  answerable where the blueprint is. `manifest` #2c lost its MANAGED_FILES parse
  and bridge checks, which the derivation makes structural.
- `docs/config/**` is export-ignored here rather than in Stage 2, keeping its
  README. Derived, a shipped `findings.md` would be managed, and pull would offer
  to overwrite every project's own findings register. The requirements
  documents, the talk and the brand assets become managed, which
  adds them to projects on the next pull; Stage 2 removes them.
- `docs/way-of-working.pdf` is export-ignored: managed files must be text, and
  substitution refuses its NUL bytes, so it drifted forever and never pulled
  (`bootstrap-gate` #4/#6).
- `tests/env-namespace` is export-ignored: its population is `blueprint files`,
  which in a derived project needs the blueprint fetched, and a fresh
  bootstrap's remote is `FILL-ME-IN`.
- `a2bp` derives the managed set from the base it fetched, so its ignore check
  now runs after that read and before any push. The secret checks still run
  before any remote contact.
- `tests/blueprint-relocation` and `bp_blueprint_path`'s `scaffolding/` branch
  are removed (§5, Stage 3 dropped). `bp_base_path`'s `scaffolding/` branches in
  `scripts/lib/request.sh`, and their cases in `a2bp-build` and
  `a2bp-contamination`, remain for that cleanup.

### 4.2 Retirement (decision 9, corrected)

`bootstrap_sha` is a moving sync checkpoint, not an inventory. An old CLI's full
pull advances it past an export removal (`scripts/blueprint:1926`). An endpoint
difference, `archive(bootstrap_sha) − archive(released)`, then loses the
candidate: in the ordinary staged rollout, and in any upgrade done by full pull.

**Design:** derive candidates from **export removals in the history** of the
fetched branch, not from the endpoints.

- A removal is a commit where a path leaves the archive, by deletion or by a new
  `export-ignore`. The CLI finds these from the commits that delete files or touch
  `.gitattributes`, using `git log` on the fetched clone, with no manifest.
- A candidate is a removed path that is absent from the current archive and
  present in the project.
- **Content proof stays:** a candidate is offered for deletion only when its
  bytes equal the version shipped just before its removal. Otherwise it is
  reported and retained. The explicit `y/n` decision stays.
- **Sequencing:** retirement support is in the CLI before or with the first
  export removal (Stage 0 b/c/d). Because candidates come from history,
  advancing `bootstrap_sha` cannot erase them.
- **Regression** (`pull-behaviour`): old CLI, then a full pull across a removal,
  then the new CLI offers the retirement. Also: identical is offered, edited is
  reported, absent is silent.

**Downstream:** `blueprint pull` updates the CLI, `drift` shows `AGENT_SIGNAL.md`,
and `pull` offers to retire `new-project.sh`. The old CLI keeps working until
then, because the fetched tree is a full checkout.

## 5. Stages after 1

### Stage 2 — blueprint maintenance stops shipping (decisions 3, 6)

**The split is by responsibility.** What operates a project, or asks the
blueprint for a change (`a2bp`, `prs`), ships. What maintains the blueprint,
publishes the deck or bootstraps a project does not. The one-time editorial
split makes future delivery mechanical: the archive and one named import decide
it, with no classification of prose.

- `export-ignore`: `docs/way-of-working.{md,pdf}`, `docs/assets/brand/`,
  `docs/A2BP_PLAYBOOK.md`, `docs/talk-enforcing-agentic-quality.md` and
  `scripts/build-deck.sh`. The deck builder exits 1 without the deck, so it
  cannot ship without its input.
- **The blueprint-only import file is `CLAUDE.blueprint.md`**, `export-ignore`d
  explicitly. The shipped CLAUDE.md imports it, and the import is skipped
  downstream because the file is absent (the `claude.internal.md` mechanism).
  These move into it:
  - the deck rule, both §"docs/way-of-working.md is the canonical pitch surface"
    and capability 3 of §"Documentation is a main concern" (`CLAUDE.md:911`)
  - the implementer half of a2bp
  - "The blueprint is derived"
  - the blueprint-trunk section
- The DoD's blueprint-only deck checklist (`docs/DoD.md:694`) moves the same
  way, and so does the README's instruction to run `scripts/build-deck.sh`
  (`README.md:57`, `:141`).
- **Links are tested where they are delivered.** `doc-links` walks only `docs/`,
  so a new `bootstrap-contents` case checks every relative link in the delivered
  root `CLAUDE.md` and `README.md` against the bootstrapped tree. `bootstrap-gate`
  #2/#3 still cover `docs/`.

**As built (2026-09-17):**

- Conventions, not file lines, where one exists: `docs/requirements/**` (keeping
  its README), `docs/assets/**`, `docs/way-of-working.*` (replacing the PDF-only
  line), `docs/talk-*`. Explicit: `docs/A2BP_PLAYBOOK.md`, `scripts/build-deck.sh`,
  `CLAUDE.blueprint.md`. Proof: `bootstrap-contents` #11, with a fixture
  requirement document no line names, and #12 (root links), which found
  `CLAUDE.md -> templates/README.md` dead in every project since BUG-009.
- `CLAUDE.blueprint.md` also took DOCUMENTATION.md's blueprint sections and the
  root `project_config_*.md` note. Documentation capability 3 stays in CLAUDE.md,
  stated generically. The a2bp output no longer names the playbook.
- `doc-links`' real-tree floor dropped from 20 to 10: it ships, and a fresh
  project's `docs/` now holds 17 links. `template-source` #import-1 names the
  blueprint-only import.
- Retirement needed no change. A Stage 1 bootstrap pulled forward was offered all
  eight newly unshipped files.

### Stage 3 — the physical move: DROPPED, approved by the founder 2026-09-16

It would take about 180 path moves and link rewrites. It would also need
permanent source-to-project coordinate translation in sync and a2bp, a prefix in
test-root discovery, and root-versus-shipped copies of the workflow, the
`settings.json` hook commands and the Sonar sources. After Stages 1–2 it adds
legibility, not consistency.

**If the founder drops it, the same change must:**

- record the accepted replacement (the archive boundary plus
  `CLAUDE.blueprint.md`) in `TASK-018-TARGET.md` §2 and in the TASK-021 backlog
  row, so no future agent reimplements the move
- remove the scaffolding-specific resolver branches (`bp_blueprint_path`,
  `bp_base_path`) and `tests/blueprint-relocation`, while keeping normal
  root discovery and the missing-toolchain failures

### Stage 4 — co-location (TARGET R2)

This is not TASK-021. It is independent, and belongs to its own item.

## 6. Downstream: storm2flow, linkedin-watcher-agent, struct2flow-www

| Stage | What each project sees | How it migrates |
|---|---|---|
| 0+1.2 | CLI update, then `new-project.sh` offered for retirement, whatever order the pulls ran in | `blueprint pull`, per-file `y/n` |
| 1.1 | `AGENT_SIGNAL.md` managed | `blueprint pull` |
| 2 | CLAUDE.md shrinks, and the deck, playbook, brand and deck-builder files are offered for retirement | `blueprint pull` |

## 7. Verification

| Stage | Automated proof |
|---|---|
| 0 | `bootstrap-contents` (absence of `new-project.sh` and `LICENSE`, no `LICENSE` link, relocated #4c). `bootstrap-gate` #2/#3 (the derived gate). `managed-references` |
| 1 | `manifest` consistency check. `bootstrap-contents` seeding check. `pull-behaviour` retirement cases, including old CLI → full pull → new CLI. `bootstrap-gate` #4/#6. `a2bp-inputs` and `a2bp-request` |
| 2 | `bootstrap-contents` delivered root-link check. `bootstrap-gate` #2/#3. `manifest` |

Iterate with `npx vitest run <files>` (BUG-057), and run the full gate once at
the end.

## 8. Known limits

- Archive membership does not establish audience. A new root document ships unless a convention excludes it.
- README files already in projects were seeded once, and fixing the template does not rewrite them.
- linkedin-watcher-agent's matching `LICENSE` will be offered for retirement. Identical bytes prove eligibility, not intent, so the answer there is `n`.
- Adoption baselines and partial pulls are not per-file provenance. An edited candidate is reported and retained.
- The shipped `.gitattributes` carries blueprint-only lines, which are harmless downstream.

## 9. Founder questions

All four answered **yes** by the founder on 2026-09-16: ship no LICENSE, derive the managed set from the export archive, retire files from export removals in history with the content proof, and drop the physical move.
