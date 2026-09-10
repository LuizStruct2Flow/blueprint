# TASK-021 — implementation map for the `scaffolding/` + `forge/` restructure

**This is a READ-ONLY map, produced before any implementation.** Nothing in the
repository was edited to produce it; the only thing run was one throwaway `git`
probe in a scratch directory (result reproduced verbatim in §2.1).

- **Mapped against commit `e5e3600`.**
- **Design it implements:** [`TASK-018-TARGET.md`](TASK-018-TARGET.md) §2, and
  [`TASK-018-RULES.md`](TASK-018-RULES.md) R2.
- **Design it partially CORRECTS:** §0 and §6 below contradict TARGET §2. The
  target says two buckets partition the tree and that the founder chose the
  symmetric shape "knowing the cost". Two costs it did not name are structural,
  not incremental — §0 (some files' location is dictated by an external tool
  that only reads the repository root, and `.github/workflows/` cannot move at
  all) and §6 (the move breaks every derived project's `blueprint` CLI hard,
  including the recovery path). Both need a founder decision before
  implementation starts. Read those two sections before the rest.

---

## 0. The headline: the symmetric shape has a cost §2 did not anticipate

**Some files' location is dictated by an external tool that only reads the
repository root.** They cannot move into `scaffolding/` and still work *for this
repo*, and they cannot stay at root and still be "the template" — the two-bucket
rule has no cell for them.

| File | Tool that pins it to the repo root | Move to `scaffolding/`? |
|---|---|---|
| `.github/workflows/security.yml` | GitHub Actions discovers workflows **only** at `<root>/.github/workflows` | **Impossible.** The blueprint's own CI stops running entirely. No config can redirect it. |
| `CLAUDE.md` | Claude Code reads it from the project root | Possible only if the blueprint's agents give up their own protocol file |
| `.claude/settings.json` | Claude Code reads it from the project root | Same — the blueprint loses its own allowlist **and the `no-chain-guard` PreToolUse hook** |
| `.githooks/` | `core.hooksPath` | Movable — `git config core.hooksPath scaffolding/.githooks` works. `arm_gate` hardcodes `.githooks` (`scripts/lib/gate.sh:42,49,50,58,60,64,65`) and would need to learn both. |
| `.gitignore`, `.gitattributes` | git, per-directory — see §2.1 | Movable, and *better* moved |
| `tests/package.json` + `node_modules` | npm/vitest resolution root | Movable (already relocated once by TASK-020) |

`.github/workflows/` is the hard one and it has no clean answer. Three options,
all founder decisions:

- **(a) Root-anchored shipping files stay at root.** Honest, and it is the third
  bucket returning through a different door — the target doc explicitly killed a
  third bucket, so this needs a conscious reversal, not a drift.
- **(b) A `scaffolding/.github/workflows/security.yml` that ships, plus a root
  `.github/workflows/security.yml` that is *this repo's own* CI.** Two files.
  Today they are one. Drift between them is exactly the class of defect BUG-009
  and A-05 are about — and there is no `drift` check for a file the blueprint
  owns twice.
- **(c) Root `.github/workflows/security.yml` becomes a two-line shim** that
  calls a script under `scaffolding/`. One copy of the logic, the root file is
  inert boilerplate. Cheapest of the three; still means the root workflow file is
  a root-anchored shipping artefact, i.e. option (a) with a small surface.

**Second unanticipated cost, same shape.** §2 says `forge/` is "bootstrap, sync,
a2bp, templates". But `scripts/blueprint` — the sync *and* a2bp CLI — **must
ship**: it is how a derived project runs `drift`, `pull` and `a2bp` at all, and
it is in `MANAGED_FILES` today. Sync is not a forge-only function; it is
bidirectional by design. Founder decision: either `forge/` means "bootstrap +
templates only" (and `scripts/blueprint` is scaffolding), or `scripts/blueprint`
is split, which I would not recommend.

---

## 0.1 §0 RESOLVED — founder decision + verified mechanism (2026-09-10)

> **SUPERSEDED in part, 2026-09-10.** This section resolved §0 as *"the root file
> is a stub"* and counted two of three files as supporting it. Cross-provider
> review knocked out the CI row, and the founder re-decided. **The current answer
> is decision 1 in the ANSWERED table: a named `ROOT_SHIPPED` class.** The
> mechanism research below is still accurate and still load-bearing — it is *why*
> the stub works for one file and cannot work for the other two — so it stays.
> Read the verdict row, not the old conclusion.

| File | Stub viable | Mechanism, verified |
|---|---|---|
| `CLAUDE.md` | **YES** | A root `CLAUDE.md` containing `@scaffolding/CLAUDE.md`. The `@path` import is **expanded at launch and treated identically to inline content** — not lazily, not summarised. Paths resolve relative to the FILE CONTAINING the import, so `@scaffolding/CLAUDE.md` from the root works. Recursive imports allowed to 4 hops. |
| `.github/workflows/security.yml` | **NO** — *revised* | The root workflow can `run:` a script under `scaffolding/`, and that much is true. But a workflow is not shell logic: it declares triggers, permissions, containers, pinned actions, caches, job-level conditions and multiple jobs, and none of that can be delegated to a YAML file outside `.github/workflows/`. A reusable workflow must live there too, so it does not move the boundary either. A "stub" retaining all GitHub-specific structure and delegating only `run:` bodies IS coherent — but it is not "content lives in scaffolding", it is a root shipping artefact with a smaller surface. Call it what it is. |
| `.claude/settings.json` | **NO** | Settings are plain JSON with **no extends, include or import of any kind**, and a settings file may only live in a `.claude/` directory. There is no pointer mechanism to use. **And the delivery gap is worse than the pointer gap:** Stage B bootstraps from `git archive HEAD scaffolding` and manages only `scaffolding/`, so a file left at root participates in NEITHER path. New projects would not receive it and existing projects could not pull it. It is not merely un-stubbable; it is undeliverable without an explicit second archive path. |

**Therefore two files, not one, are root-anchored AND shipping — which makes it a
class.** The distinguishing property is not "we could not find a pointer": it is
that the tool reading the file hardcodes the repository root, so location cannot
determine propagation for these files no matter where we put them. That is a
delivery mechanism, not the third audience bucket §2 rejected — but it needs to be
a NAMED, short, explicit list, because a class nobody enumerated is how the third
bucket returns by drift instead of by decision.

**Do NOT solve it with two copies.** `permissions.allow` lists MERGE across all
active settings files rather than overriding, so a root copy and a
`scaffolding/.claude/settings.json` would both apply here and silently diverge —
one file that is simultaneously this repo's live config and the shipped template
is BUG-009 exactly, and nothing checks it.

**Two consequences for the move:**

- **Prefer the import over subdirectory discovery.** Claude Code *does* read a
  `CLAUDE.md` from a subdirectory, but **lazily** — only once it touches a file
  there. A bare `scaffolding/CLAUDE.md` would therefore be absent from context at
  session start, which is when the protocol matters most. The root import is what
  makes it behave like today's file.
- **Hook paths resolve from the PROJECT ROOT**, verified against this repo's live
  `PreToolUse` hook. Moving `scripts/no-chain-guard.sh` to
  `scaffolding/scripts/` requires updating `"command"` in the settings —
  `${CLAUDE_PROJECT_DIR}` is available if the path should be explicit. Miss this
  and the no-chain guard silently stops running, which is the class of failure
  BUG-004 and A-22 are about.

---

## 1. Bucket inventory

Source: `git ls-files` (216 tracked files) and `git archive HEAD | tar -t` (174
entries, 76 of them outside `tests/`).

### Stays at root — this repo's own state

| Path | Why |
|---|---|
| `docs/doing/`, `docs/waiting-acceptance/`, `docs/done/`, `docs/backlog/` (contents) | already `export-ignore`d; this repo's real work items |
| `docs/config/BLUEPRINT-AUDIT-2026-07-23.md` | `export-ignore`d; this repo's audit register |
| `project_config_{overview,paths,dod,security,infra}.md` | `export-ignore`d (BUG-009); this repo's own config |
| `.blueprint-root` | `export-ignore`d; positive self-identification marker |
| `AGENT_ROSTER.md`, `logs/`, `.scratch/` | untracked / gitignored per-checkout state |
| `LICENSE` | ships today, but a derived project should carry its **own** licence. **Ambiguous — founder call.** It is currently in the archive and in nobody's MANAGED_FILES. |

### `forge/` — never ships

| Path | Why |
|---|---|
| `templates/` (6 files) | already `export-ignore`d; the seed source for `project_config_*` + HANDOVER + BACKLOG |
| `scripts/new-project.sh` | bootstrapping is the one thing a derived project never does. **Note: it ships today** (it is in `MANAGED_FILES` and in the archive). Moving it to `forge/` is a deliberate behaviour change — a good one, but a change. |
| `tests/bootstrap-contents/`, `tests/bootstrap-identity/`, `tests/bootstrap-gate/`, `tests/template-source/`, `tests/drift-in-blueprint/`, `tests/pull-exec-bit/` | already the six `export-ignore`d suites; each drives forge-only machinery |
| `scripts/accept-bug-022.sh` | one-off acceptance script for this repo's BUG-022; unmanaged. **Or delete it** — the bug is in `done/`. Founder call. |

### `scaffolding/` — everything a project receives

`scripts/` minus `new-project.sh` (35 files) · `tests/` minus the six above (≈95
files) · `docs/` generic docs and lifecycle READMEs · `config/README.md` ·
`.githooks/` (4) · `.gitleaks.toml` · `sonar-project.properties` · `AGENTS.md` ·
`AGENT_ROSTER.example.md` · `AGENT_SIGNAL.md` · `STACK_DEFAULTS.md` ·
`README.md` (project README template) · plus, per §0, some of `CLAUDE.md` /
`.claude/` / `.github/`.

### The one that splits, and it is the expensive one

**`docs/` is not one thing.** `docs/DoD.md`, `docs/SECURITY.md`,
`docs/OBSERVABILITY.md`, `docs/INFRASTRUCTURE.md`, `docs/DOCUMENTATION.md`,
`docs/A2BP_PLAYBOOK.md`, `docs/PUBLISHING.md`, `docs/way-of-working.md`
(+`.pdf`, +`docs/assets/brand/`) are simultaneously **this repo's own operating
docs** and **the template that ships**. Today one file serves both.

Split them into `scaffolding/docs/` and the root `docs/` breaks:

- **20 relative links** from root files into `docs/` (`CLAUDE.md` ×10,
  `README.md` ×9, `AGENTS.md`, `AGENT_SIGNAL.md`, `STACK_DEFAULTS.md` ×1 each)
  and **9 links back** (`docs/DoD.md` ×4, `OBSERVABILITY.md` ×2, `SECURITY.md`
  ×2, `way-of-working.md` ×1).
- `tests/doc-links/test.sh` is precisely the suite that fails on these.
- `CLAUDE.md` §"Documentation is a main concern" and §"way-of-working.md is the
  canonical pitch surface" both name `docs/…` paths as obligations *of this
  repo*.

**Ambiguous — founder call.** Either the blueprint reads its own doctrine out of
`scaffolding/docs/` (and every link in every root file is rewritten, and the
pitch surface lives in a directory named "scaffolding"), or the generic docs stay
at root and are option-(a) root-anchored shipping files like `CLAUDE.md`.

### Flagged, unrelated to the move but surfaced by it

- **`scripts/wait-mic.sh`, `scripts/session-resume.sh`,
  `scripts/no-chain-guard.sh` ship but are NOT in `MANAGED_FILES`.** Their suites
  (`tests/wait-mic`, `tests/session-resume`, `tests/no-chain-guard`) *are*
  both-tier and ship. So a derived project runs regression suites against three
  scripts that froze at its bootstrap commit — BUG-029's exact shape, one
  directory over. The move offers the fix for free: if `scaffolding/` becomes a
  single managed directory (`MANAGED_FILES=("scaffolding/")`), location
  determines propagation by construction, which is R2's actual promise.
  **Strongly recommend taking it.**
- `README.md:150` says brand assets are "blueprint-only; not synced to projects"
  — `docs/assets/brand/*.svg` **are in the archive**. Prose disagrees with the
  boundary.

---

## 2. The path-mapping problem — every site, file:line

The invariant that makes this tractable: **`MANAGED_FILES` entries stay
project-relative.** Only the blueprint-side filesystem path gains `scaffolding/`.
Every consumer of `blueprint files` output (bootstrap's substitution walk,
drift's project side, a2bp's staging) then needs no change.

### 2.1 `.gitattributes` — the cheapest win, verified

Probe run (`git init` in the scratchpad, `scaffolding/.gitattributes` + root
`.gitattributes`):

```
=== archive HEAD scaffolding ===        === strip test (--strip-components=1) ===
scaffolding/.gitattributes              out/.gitattributes
scaffolding/docs/doing/README.md        out/docs/doing/README.md
```

`git archive` **does** honour a nested `.gitattributes`, patterns are relative to
the containing directory, and `--strip-components=1` lands them correctly. So:

- **`scaffolding/.gitattributes`** carries `docs/doing/** export-ignore` etc.
  **unchanged, byte for byte** — no prefixing — and ships to the project as its
  own root `.gitattributes`, which is *better* than today (a derived project
  currently inherits `templates/`, `.blueprint-root` and `project_config_*.md`
  lines that mean nothing there).
- The root `.gitattributes` shrinks to almost nothing: `forge/` and
  `project_config_*.md` and `.blueprint-root` are simply not in the archive
  query. **The whole "TASK-018 PHASE 1" block (`tests/package.json`,
  `tests/*.spec.ts`, `tests/harness/` — ~40 lines of comment plus 6 lines of
  rule) dissolves**, because the six forge suites live in `forge/`.
- **Trap:** `scripts/lib/suites.sh:96` greps `'^tests/…export-ignore'` out of
  `"$root/.gitattributes"`. With the nested file this **keeps working
  unchanged** — which is the argument for the nested file over a prefixed root
  file.

Current file: `.gitattributes:1-160` (every export-ignore line).

### 2.2 `scripts/new-project.sh`

| Line | Today | Needs |
|---|---|---|
| `:44` | `BLUEPRINT_ROOT=$(dirname $0)/..` | becomes `../..` if the script moves to `forge/` |
| `:111` | `bash "$BLUEPRINT_ROOT/scripts/blueprint" files` | `$BLUEPRINT_ROOT/scaffolding/scripts/blueprint` |
| **`:160`** | `git -C "$BLUEPRINT_ROOT" archive --format=tar HEAD \| tar -x -C "$TARGET_DIR"` | **`… archive --format=tar HEAD scaffolding \| tar -x --strip-components=1 -C "$TARGET_DIR"`** — the strip |
| `:197,198,203` | `$BLUEPRINT_ROOT/templates/$_src` | `$BLUEPRINT_ROOT/forge/templates/$_src` |
| `:229` | `. "$BLUEPRINT_ROOT/scripts/lib/placeholders.sh"` | `…/scaffolding/scripts/lib/…` |
| `:235-245` | substitution walk over `$TARGET_DIR/$f` | **unchanged** — `$f` is project-relative |
| `:274,286` | `$TARGET_DIR/scripts/signal-set.sh`, `$TARGET_DIR/docs/doing/HANDOVER.md` | **unchanged** — target side |
| `:405,413,417,426` | operator instructions naming `scripts/…`, `tests/<suite>/` | prose, but reader-facing |

### 2.3 `scripts/blueprint`

| Line | Site | Needs |
|---|---|---|
| `:81-268` | `MANAGED_FILES` array (69 entries) | **unchanged** if project-relative is kept. If you take the `MANAGED_FILES=("scaffolding/")` simplification, the whole array is deleted. |
| **`:397`** | `substituted_blueprint_copy()` — `local f="$1" bp="$BLUEPRINT_ROOT/$1"` | `bp="$BLUEPRINT_ROOT/scaffolding/$1"`. **`$f` must stay unprefixed** for `_should_substitute` — see §2.4. |
| **`:670`** | `bp_expand_managed_dirs` — `git archive --format=tar HEAD "${f%/}"` | archive `scaffolding/${f%/}`, then **strip the `scaffolding/` prefix from every line of the listing** before pushing into `expanded[]`. This is the single riskiest line: the expansion must yield project-relative paths. |
| `:533` | `_bp_resolve_blueprint_root` verifies `$cli_root/CLAUDE.md` + `$cli_root/docs/DoD.md` | new anchors; also `cd .../..` becomes `.../../..` |
| `:849` | `[ -f "$here/.blueprint-root" ]` | unchanged (root) |
| `:914` | drift — `bp="$BLUEPRINT_ROOT/$f"` | prefix |
| `:985` | pull "same?" check — `bp="$BLUEPRINT_ROOT/$f"` | prefix |
| `:1008` | pull loop — `bp="$BLUEPRINT_ROOT/$f"` | prefix |
| `:557-562` | `_bp_sync_exec_bit src dst` | callers pass the prefixed src |
| `:1140+` | a2bp — staging path is the **project**-relative path, written into the blueprint commit at `path` (`scripts/lib/request-build.sh:95,102`) | **must gain the `scaffolding/` prefix at commit time.** Also `scripts/lib/request-file.sh:64,65` (`cat-file -e "$base:$path"`, `show "$base:$path"`) — those read the *blueprint's* tree, so they need the prefixed path, while the diff summary at `:149` should print the project-relative one a reader recognises. |

Recommend one helper — `bp_blueprint_path <project-relative>` — and route all
seven sites through it. It is the same shape the repo already chose for
`bp_should_substitute` and `bp_suite_runners`.

### 2.4 The trap that will bite silently

`scripts/lib/placeholders.sh:86-93`:

```sh
bp_should_substitute() {
  case "$1" in
    *scripts/blueprint|*scripts/new-project.sh) return 1 ;;
    *scripts/lib/placeholders.sh|*scripts/lib/contamination.sh) return 1 ;;
    tests/*) return 1 ;;          # ← LEADING-COMPONENT, unanchored
  esac
```

`tests/*` is the one leading-component rule, and its header comment (`:44-55`)
says outright: *"Do not add a leading-component rule without checking every call
site."* If any caller starts passing `scaffolding/tests/…`, the case stops
matching, **every suite gets `{{PROJECT_NAME}}` substituted**, and BUG-029's
forever-drifted state returns — the file reports drifted and no pull can fix it.
Four call sites: `blueprint:397`, `blueprint`'s `substitute_placeholders`,
`new-project.sh:237`, and a2bp's staging loop.

### 2.5 `.githooks/pre-push` and `pre-push-project`

- `.githooks/pre-push:61,64,65` — sources `scripts/lib/pipeline.sh`; `:555,556`
  sources `.githooks/pre-push-project`; `:569,571` runs `scripts/watch-ci.sh`.
  All **project-relative and unchanged** — the hook runs with cwd = the repo root
  of whatever repo it guards. For the **blueprint itself** they resolve against
  the blueprint root, where `scripts/` no longer exists → all break unless the
  blueprint's own `core.hooksPath` and cwd are handled (see §0).
- `.githooks/pre-push-project` — **38 `if [ -f tests/<suite>/test.sh ]` blocks**
  at lines `53, 67, 88, 107, 126, 144, 159, 176, 190, 206, 220, 235, 251, 273,
  293, 310, 327, 348, 370, 392, 414, 449, 469, 489, 509, 527, 546, 564, 594, 640,
  655, 669, 689, 708, 733, 747, 766`, plus the TS bridge at `883-888`. **45
  `pipe_stage` calls total.** All project-relative → unchanged *as shipped*.
  Broken *for the blueprint* by the same cwd problem.
- Markers: `BLUEPRINT:BEGIN` at `:2`, `BLUEPRINT:END` at `:890`.
  `bp_marker_balance` (`suites.sh:161`) counts them; `tests/manifest` #7b asserts
  1/1. Do not let a prose sentence acquire a marker token during the rewrite.

### 2.6 `.github/workflows/security.yml`

37 `bash tests/<suite>/test.sh` invocations at lines `187-242`;
`scripts/check-commit-subjects.sh` at `:149,158,165`;
`hashFiles('tests/package.json')` guards at `:281,291,300,307`;
`cache-dependency-path: tests/package-lock.json` at `:286`. All project-relative.
**For the blueprint's own CI they all become `scaffolding/…`** — and this file
cannot itself move (§0).

### 2.7 The TypeScript side

| Site | Today | Needs |
|---|---|---|
| `tests/vitest.config.ts:21` | `include: ['**/*.spec.ts']`, root = `tests/` | With co-location (R2) specs live beside code, so the root becomes `scaffolding/` (or the repo root) and the glob widens. `node_modules` must be excluded explicitly once the root is not `tests/`. |
| `tests/harness/index.ts:49-53` | `REPO_ROOT = resolve(dirname(import.meta.url), '..', '..')` | depth changes; and it must resolve to the **repo** root, not `scaffolding/`, because `bootstrap-gate` runs `git -C REPO_ROOT checkout-index` |
| 7 specs | `import … from '../harness/index.js'` | `bootstrap-contents:49`, `bootstrap-gate:48`, `bootstrap-identity:38`, `drift-in-blueprint:25`, `proc-cwd:30`, `pull-exec-bit:24`, `template-source:46`. Four of these move to `forge/` while the harness stays in `scaffolding/` — so the import becomes `../../scaffolding/tests/harness/index.js` (or a `tsconfig` path alias). The `forge/ → scaffolding/` direction is the one §2 allows; do not let it reverse. |
| `scripts/run-ts-suites.sh:51,52` | `$root/tests/vitest.config.ts`, `find $root/tests` | new root |
| `scripts/run-ts-suites.sh:144` | `cd "$_ts_root/tests"` | new npm/vitest root |
| **`scripts/run-ts-suites.sh:191,196`** | `select(.name \| test("/tests/" + $s + "/"))` | **breaks hardest under co-location** — the suite name is no longer a path component. Every stage would report `_rc=1` ("declared suite did not report") and the gate goes red with an unreadable cause. Needs a different mapping from spec file → stage name. |
| `scripts/lib/suites.sh:67` | `find "$root/tests"` | new root; under co-location the `NF>=3 → $2` suite-name derivation (`:73-76`) no longer holds at all |
| `scripts/lib/suites.sh:96` | grep `^tests/…` in `.gitattributes` | preserved by the nested-`.gitattributes` choice (§2.1) |
| `tests/package.json`, `tsconfig.json`, `package-lock.json` | under `tests/` | move with the harness |
| `sonar-project.properties:12,27,31` | `sonar.sources=src,scripts`, `tsconfigPath=tests/tsconfig.json` | prefix |

### 2.8 The 39 shell suites — mostly free, and this is the good news

Every shell suite derives its root identically:

```sh
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
```

at `marker-merge:29`, `pre-push-secrets:49`, `a2bp-e2e:25`,
`a2bp-contamination:41`, `state-dir:31`, `doc-links:24`, `wait-mic:28`,
`ts-bridge:36`, `signal-dispatch:20`, `pull-behaviour:31`, `staleness:34`,
`commit-msg-gate:23`, `a2bp-build:29`, `staleness/drift-integration:41`,
`env-namespace:24`, `suite-sync:44`, `git-isolation:44`, `gate-arming:36`,
`codex-persona-label:23`, `watcher-liveness:23`, `a2bp-request:18`,
`a2bp-inputs:26`, `no-chain-guard:27`, `commit-subjects:37`,
`pre-push-scanners:39`, `proc-cwd:19`, `roster:35`, `signal-set:20`,
`pipeline:26`, `a2bp-pr-filing:33`, `agent-activity-bound:54`,
`lifecycle-docs:32`, `session-resume:32`, `dod-gate:23`, `manifest:109`,
`baton-durability:91`, `subagent-feed:39`.

**Because `scaffolding/` is shaped exactly like a project root,
`scaffolding/tests/<suite>/test.sh` → `../..` → `scaffolding/`, and every
filesystem use of `$ROOT` keeps working unchanged.** That is the symmetric shape
paying for itself, and it is worth stating loudly: ~37 files need no edit.

Two exceptions, and they are the ones to hunt:

1. **`$ROOT` used as a git repo root with git-object paths.** Git object paths
   are repo-root-relative regardless of `-C`:
   - `tests/gate-arming/test.sh:54,55,56,63,64,65` — `git -C "$ROOT" show
     HEAD:.githooks/pre-push`, `HEAD:scripts/agent-activity.sh`,
     `HEAD:scripts/blueprint`, `ls-tree HEAD scripts/lib/`,
     `HEAD:AGENT_ROSTER.example.md`
   - `tests/marker-merge/test.sh:55` (`git -C "$ROOT" rev-parse HEAD`), `:106`
     (`cd "$ROOT" && git archive HEAD | tar -x`)
   - `tests/manifest/test.sh:110,112` (`$ROOT/.githooks/pre-push-project`,
     `$ROOT/.github/workflows/security.yml` — the second is root-anchored, the
     first is not), `:449` (archive), `:572` (`git -C "$ROOT" diff --quiet HEAD
     -- .gitattributes`), `:586`
   - `tests/suite-sync/test.sh:154` (`git archive HEAD tests`)
   - `tests/a2bp-build/test.sh:204` (`ls-tree "$C2" -- scripts/lib/state-dir.sh`
     — this is the **blueprint side** of an a2bp request, so it becomes
     `scaffolding/scripts/lib/state-dir.sh`; it is the assertion that proves
     §2.3's a2bp prefix landed)
2. **The four suites that move to `forge/`.** `forge/tests/<suite>/…` → `../..`
   → `forge/`, which has no `scripts/`, no `docs/`. They need the real repo root,
   i.e. `../../..`. Note `tests/state-dir/test.sh:294,316` (#6, #6c) asserts the
   `ROOT="$(...)"` anchor **structurally across all suites** — a mixed-depth tree
   will trip #6c unless it learns two shapes.

---

## 3. The terminology inversion

**25 occurrences**, 21 of them outside `docs/done/`. Today `blueprint`-tier =
*does not ship*; in the target `scaffolding` ships and `forge` does not.

### Load-bearing (code / assertions / identifiers) — 11

| Site | What |
|---|---|
| `scripts/lib/suites.sh:95` | **function name `bp_blueprint_only()`** — the public identifier, called at `:113` and from `tests/manifest`, `tests/suite-sync`, `run-ts-suites` |
| `scripts/lib/suites.sh:113` | `_bsrow_bp=$(bp_blueprint_only …)` |
| `scripts/lib/suites.sh:104-107` | the `blueprint` / `both` **tier vocabulary** emitted by `bp_suite_rows` — this is the value other code branches on |
| `tests/manifest/test.sh:543,554,563,565` | #2b failure messages and the tier branch |
| `tests/suite-sync/test.sh:177,185,187,190` | #1d, including a `pass`/`fail` message pair |
| `tests/ts-bridge/test.sh:143,153` | a `pass` message asserting non-applicability |
| `tests/git-isolation/test.sh:98` | the anchor-set comment tied to BUG-053's floor-of-three |
| `tests/pull-exec-bit/pull-exec-bit.spec.ts:7` | spec header ("blueprint tier") — under R1 the spec text **is** the documentation, so this is load-bearing by policy |

The tier vocabulary is the decision: `blueprint`/`both` becomes
`forge`/`scaffolding`, and `bp_blueprint_only` becomes `bp_forge_only`. Both
flips are mechanical but must be simultaneous — a half-flipped vocabulary means
`case "$tier" in blueprint)` silently never matches and every suite derives as
shipping.

### Prose — 10

`.gitattributes:94,126` · `README.md:150` · `.github/workflows/security.yml:308`
(a `::notice::` string an operator reads) · `docs/doing/BUGS.md:43` (BUG-053's
row — historical, keep the old term with a note) ·
`docs/doing/TASK-018-TARGET.md:8` · `docs/done/BUGS.md` ×2,
`docs/done/TASK-012-strip-test.md`,
`docs/done/BUG-001-fork-bomb/CODEX-REVIEW-BUG-001.md` (**do not touch** —
`done/` is a historical record).

### Fixture data — 2, do not touch

`tests/marker-merge/fixture-project-before.md:30` and
`fixture-project-after-expected.md:33` contain the literal string `blueprint's
blueprint-only deploy notes.` — they are a matched pair asserting byte-identity
through the marker merge. Editing one and not the other fails the suite; editing
both is a no-op. Leave them.

---

## 4. What proves it

### `tests/bootstrap-gate` — which cases catch a wrong strip

| Case | Catches |
|---|---|
| **#1** "bootstrap completed" | a strip that produces a non-zero exit — the crudest failure |
| **#2/#3** derived project passes its own gate, non-vacuously (≥25 stages) | **the primary strip oracle.** A `--strip-components` off by one puts everything under `derived/scaffolding/…`, so `.githooks/pre-push` is not where `core.hooksPath` looks, `scripts/lib/pipeline.sh` is absent, and the gate cannot run. #3's ≥25-stage floor is what stops "gate produced no stages" reading as green. |
| **#4** drift-clean against its own source | **the mapping oracle.** If `bp_expand_managed_dirs` (`blueprint:670`) forgets to strip `scaffolding/` from the listing, drift compares `$BLUEPRINT_ROOT/scaffolding/scaffolding/tests/x` → MISSING_BLUEPRINT for every file under `tests/`. Also catches `substituted_blueprint_copy:397` missing the prefix. |
| **#5** every managed/template file was substituted | **the `bp_should_substitute` oracle (§2.4).** If a caller starts passing `scaffolding/tests/…`, `tests/*` stops matching, the suites get substituted, and #5's counterpart in `#4` reports them drifted forever. |
| **#6** a full pull is a no-op on a fresh bootstrap, and the project's manifest still passes | **the pull-path oracle**, and the only case that exercises `pull` end-to-end after the move. Also the case that found BUG-053. |
| #7 / #7b | refusal paths — orthogonal to the strip |

**One new assertion is needed, and it is not in this suite.** Nothing today
asserts that the *archive itself* contains no `scaffolding/` component after the
strip. #2/#4 catch it indirectly, at ~150 s and with a failure that names a gate
stage rather than the strip. Add to `tests/bootstrap-contents` (which already
runs `git archive HEAD | tar -x`, `:75`): **"no path in the delivered project
begins with `scaffolding/` or `forge/`"** — one `find`, sub-second, and it names
the actual cause. That is the assertion the founder's "a missed one is a silent
breakage downstream" is asking for.

Also add, in `tests/manifest` or `suite-sync`: **`git archive HEAD` (unqualified)
is never used to bootstrap** — a regression to the old line would ship `forge/`
and re-open A-05/BUG-009 wholesale.

### Break-because-of-the-move vs break-because-something-is-wrong

**Will break purely from moving** (fix the fixture, not the code):
`gate-arming` (`:54-65`, git-object paths), `marker-merge` (`:55,:106`),
`manifest` (`:110,:112,:449,:572`), `suite-sync` (`:154`), `state-dir` #6/#6c
(`:294,:316`, mixed ROOT depth), `a2bp-build` (`:204`), the four `forge/` specs'
`../harness` imports and `../..` depth, `run-ts-suites`'s jq path predicate
(`:191,196`), `suites.sh:67` find root, `sonar-project.properties:12,31`,
`vitest.config.ts:21`.

**Breaks because something is genuinely wrong** (do not "fix the fixture"):
`bootstrap-gate` #2/#3/#4/#5/#6 · `bootstrap-contents` · `template-source` ·
`pull-behaviour` · `pull-exec-bit` · `drift-in-blueprint` · `a2bp-e2e` /
`a2bp-request` / `a2bp-contamination` · `doc-links` (if `docs/` split, §1) ·
`manifest` #2b (export boundary against a real archive).

The distinction matters most in `manifest`: **#2b appears in both lists.** Its
`$ROOT/.gitattributes` read is a fixture concern; its archive comparison is a
correctness concern. Do not silence it as the former while it is telling you the
latter.

---

## 5. Sequencing

**Stages are possible, and there are three. Within the middle one, the `scripts/` slice is atomic; `docs/` and `tests/` are not — see Stage B.**

### Stage A — `forge/` alone. Green and pushable on its own.

Move `templates/`, `scripts/new-project.sh`, and the six blueprint-only suites
into `forge/`. **No path strip is introduced**: bootstrap still runs `git archive
HEAD` from the root, and `forge/` simply never enters it (one root `forge/
export-ignore`, or nothing at all once §2.2's `archive HEAD scaffolding` lands
later). `MANAGED_FILES` loses `scripts/new-project.sh`. ~40 lines of
`.gitattributes` delete. Roughly 15 file moves, 4 depth fixes
(`../..`→`../../..`), 4 import fixes.

Do the **terminology flip** here too (§3, 11 load-bearing sites) — `forge/` now
exists to name.

### Stage A′ — the compatibility release. **Do this before Stage B or downstream breaks hard.** See §6.

A `scripts/blueprint` that probes `[ -d "$BLUEPRINT_ROOT/scaffolding" ]` and
prefixes if present. While the blueprint is still flat the probe finds nothing
and behaviour is byte-identical, so this stage is trivially green. Push it, and
give the three derived projects a window to pull it.

### Stage B — `scaffolding/`. **One slice of it is atomic; the stage is not.**

**Corrected 2026-09-10.** This section read *"necessarily atomic"*, and that
verdict rested on two legs that were never checked separately.

The first leg does not hold. It was `blueprint drift` dying in
`bp_expand_managed_dirs` — but that death is caused by the Stage A′ probe
`[ -d "$BLUEPRINT_ROOT/scaffolding" ]`, which prefixes EVERY source path the
instant `scaffolding/` exists, including the files still sitting at root. The
probe manufactured the atomicity it was then cited as evidence for. A per-path
resolver — prefer `scaffolding/$f` when that exact path exists at committed HEAD,
else root `$f` — resolves a half-moved tree correctly for both halves, and the
constraint disappears. See decision 8.

The second leg holds, and it is about THIS repo rather than the derived ones: the
moment `scripts/` moves, the blueprint's own gate cannot source
`scripts/lib/pipeline.sh`. Nothing staged can fix that, because the gate is what
would have proven the stage green. **So the `scripts/` slice is atomic.**

`docs/` and `tests/` are not: nothing sources them, so with a per-path resolver
each can move in its own green, pushable commit. Take them first. The value is
not tidiness — it is that ~185 moves landing as one commit means the first
failure is the only signal you get, and you get it after ~390 s.

Size, if it does land as one: **~185 file moves**, plus 7 CLI
sites, 1 bootstrap archive line, the `.gitattributes` split, the 37 CI lines, the
38 hook blocks (if `.githooks` moves), 13 shell-suite fixture fixes, 5 TS sites,
and whatever §0 decides about `.github`/`CLAUDE.md`/`.claude`.

**BUG-057 mitigation, and it is the difference between an afternoon and a week.**
The gate takes ~390 s and reveals only the first failure. Do not iterate through
the gate. Write a throwaway `.scratch/allsuites.sh` that runs all 39 shell suites
and the vitest set unconditionally, collecting every failure, and iterate on
*that*. Run the gate once at the end as confirmation. This is the same reasoning
`pipe_batch_begin` already applies to vitest.

Order within the `scripts/` slice, so the first thing that breaks is the most
informative:

1. `.gitattributes` split (nested file) — verify with `git archive HEAD
   scaffolding | tar -t` before moving a single file.
2. `git mv` everything.
3. `blueprint:670` expansion strip + the six `$BLUEPRINT_ROOT/$f` prefix sites
   via one helper.
4. `new-project.sh:160` strip.
5. Fixtures (§4 first list).
6. CI + hooks.

### Stage C — co-location (R2). Incremental, per component, after B.

Follows TARGET §3.2's order (`state-dir`, `commit-subject`, `placeholders`,
`suites`, `signal-set` → `pipeline` → `blueprint` CLI → `new-project` →
`agent-activity` last). Each component is one green push. **Note the ordering
conflict:** `run-ts-suites.sh:191,196` maps stages by `/tests/<suite>/` path
component, which co-location destroys — so the very first co-located spec needs
that mapping replaced. Fix it in Stage B while `tests/` still exists, or the
first Stage-C slice is not a small one.

**Verdict: do not attempt A+B together.** Stage A is genuinely independent and
removes ~15 files and 40 `.gitattributes` lines from Stage B's blast radius, at
the cost of one extra push.

---

## 6. Risk to derived projects

Three exist: `linkedin-watcher-agent`, `storm2flow`, `struct2flow-www`.

**Their next `blueprint drift` does not degrade — it dies.** A derived project
runs *its own* copy of `scripts/blueprint` (managed, but frozen until it pulls).
That old copy holds `MANAGED_FILES` including the entry `"tests/"`, and
`bp_expand_managed_dirs` (`blueprint:670`) runs:

```sh
git -C "$BLUEPRINT_ROOT" archive --format=tar HEAD tests
```

After Stage B there is no `tests` at the blueprint's HEAD root, so the archive
fails and `_bp_expand_die` fires — **deliberately fail-closed** (BUG-029 R2-S1).
It is called from `read_blueprint_source`, which is the one path *every*
subcommand goes through. So:

- `blueprint drift` — dead. **CLAUDE.md mandates this at every wake.** Every
  derived project's every session begins with a hard failure.
- `blueprint pull` — dead, **including `blueprint pull scripts/blueprint`**,
  which is the obvious recovery. It dies before it can copy anything.
- `blueprint a2bp` — dead. No project can file a back-propagation.

Recovery from that state is manual: `cp
$BLUEPRINT_ROOT/scaffolding/scripts/blueprint ./scripts/blueprint`, by hand, on
three machines, with no tool telling anyone why. **This is BUG-028 exactly —
machinery that arrives broken on someone else's machine — and it would be
self-inflicted with the map in hand.**

**The migration path is Stage A′ and it is not optional.** Land a
`scripts/blueprint` that probes for `scaffolding/` *while the blueprint is still
flat*:

```sh
bp_blueprint_path() {          # project-relative in, blueprint-side out
  if [ -d "$BLUEPRINT_ROOT/scaffolding" ]; then printf '%s/scaffolding/%s' "$BLUEPRINT_ROOT" "$1"
  else printf '%s/%s' "$BLUEPRINT_ROOT" "$1"; fi
}
```

Same probe inside `bp_expand_managed_dirs`. Push it, confirm all three projects
have pulled it (`blueprint prs` / a direct check), *then* do Stage B. The
already-pulled CLI adapts on the day the blueprint moves, with no manual step
anywhere.

**Second-order effects after a successful pull**, all benign but worth expecting:

- `scripts/new-project.sh` leaves `MANAGED_FILES` and stops being pulled. It
  stays on disk in each project (bootstrap put it there) as a stale orphan.
  Either delete it in each project as part of the migration, or accept a dead
  file. **Founder call.**
- Each project's `.gitattributes` gets replaced by the new
  `scaffolding/.gitattributes` on its next full pull — *if* `.gitattributes`
  becomes managed. Today it is **not** in `MANAGED_FILES` (it only ships via
  bootstrap), so it will **not** update, and each project keeps a
  `.gitattributes` naming `templates/`, `.blueprint-root` and the phase-1 TS
  block. Harmless (those paths do not exist there) but `scripts/lib/suites.sh:96`
  reads it for tier derivation, so the six old suite names stay in
  `bp_forge_only`'s output downstream forever. Adding `.gitattributes` to
  `MANAGED_FILES` fixes it — and would be automatic under the
  `MANAGED_FILES=("scaffolding/")` simplification.
- Their `.githooks/pre-push-project` still invokes 38 `tests/<suite>/test.sh` at
  project-relative paths. **Unaffected.** Their own tree does not move at all —
  this is the whole point of the strip, and it is the reassuring half of the
  answer.

---

## Founder decisions — ANSWERED 2026-09-10

**Four of these were revised on 2026-09-10 after cross-provider review** —
decisions 1, 4, 7 and 8 were ruled wrong or incomplete by Codex and re-decided
by the founder. The cells below carry the REVISED answers; §"Revisions" after
the table records what changed and why. The list further down is the original
statement of the questions; keep it for the reasoning.

**THE RULE, in the founder's words:** *"forge is everything needed to run this
very project but not needed by the derived projects."*

That is a TEST, not a list, and it is better than §2's enumeration because it
decides the cases §2 did not anticipate:

- a derived project needs it → `scaffolding/` (and this repo runs on its own
  scaffolding — the factory using its own product)
- only this repo needs it, to operate → `forge/`
- it is this repo's own CONTENT rather than machinery → root, where a derived
  project's equivalent lives

| # | Question | Answer |
|---|---|---|
| 1 | Root-anchored files | **REVISED: a named third class, `ROOT_SHIPPED`.** `CLAUDE.md` keeps the `@scaffolding/CLAUDE.md` stub — that one works. The CI workflow and `.claude/settings.json` do NOT: GitHub reads workflows only from the repo root and a stub can delegate `run:` bodies but not triggers, permissions, containers or job structure; Claude Code reads settings only from the repo root and there is no import. Both therefore live at root, ship from root, and are archived and managed through an explicit named list rather than through `scaffolding/`. This is a DELIVERY class, not the third audience bucket §2 rejected — the distinguishing property is that the reading tool hardcodes the path, so location cannot determine propagation for these files no matter where we put them. Cost, stated: `MANAGED_FILES` is no longer purely "everything under `scaffolding/`" but that plus a short exception list, and the list must be short enough to read at a glance or it becomes the third bucket after all. |
| 2 | `forge/` scope | **Bootstrap + templates + the suites that test them.** `scripts/blueprint` goes to `scaffolding/`: it implements `drift`, `pull` and `a2bp`, all of which a DERIVED project runs, and `a2bp` cannot even run here. `scripts/new-project.sh` moves to `forge/` and STOPS SHIPPING — a deliberate behaviour change, and a correct one: every project carries a bootstrap script it cannot use. |
| 3 | `docs/` split | **By audience, three destinations.** `scaffolding/docs/`: `DoD.md`, `SECURITY.md`, `OBSERVABILITY.md`, `INFRASTRUCTURE.md`, `DOCUMENTATION.md`, and the `config/` `mocks/` `requirements/` READMEs — every project needs these and CLAUDE.md names them as the rules. `forge/docs/`: `A2BP_PLAYBOOK.md`, which says outright it addresses *"the implementer — whoever makes the change in the blueprint. Not the requester."* Root: `way-of-working.md` + `.pdf` + `assets/brand/` — struct2flow's own pitch and brand. Cost: ~29 links rewritten, and this repo reads its own DoD out of `scaffolding/docs/`. |
| 4 | `LICENSE` | **REVISED: `forge/templates/LICENSE` with a new `{{COPYRIGHT_HOLDER}}` token, PROMPTED at bootstrap, defaulting to `git config user.name`.** The original answer said "the holder" and no such token exists — the vocabulary is `{{PROJECT_NAME}}` and `{{PROJECT_NAME_UPPER}}` only — and "holder" was ambiguous in a repo where that word already means the mic holder. The token name now says which holder it means. Prompted rather than derived silently, because deriving from `git config` is silently wrong for anyone bootstrapping on a machine configured for someone else and nothing would surface it. Cost: a second substitution token, which the placeholder guard and the `a2bp` restore both have to learn. It currently ships unmanaged, so every derived project declares `Copyright (c) 2026 Luiz Scheidegger` permanently and no pull can ever correct it. Same shape as A-14 (a founder identity baked into every derived repo), in a different file. |
| 5 | `scripts/accept-bug-022.sh` | **Delete.** BUG-022 is accepted in `done/`, and `tests/watcher-liveness` is the actual guard (it names the bug twice). The script is an acceptance DEMO that never travelled with its item and has been shipping to every project since. |
| 6 | `docs/assets/brand/` | **Resolved by #3.** `README.md:150` claims they are "blueprint-only; not synced to projects". The sync half is true (unmanaged); the SHIP half is false (they are in `git archive`). Moving them to root makes the prose true without editing it. |
| 7 | `MANAGED_FILES` | **REVISED: derived from `scaffolding/`, but expressed in PROJECT coordinates.** A literal `("scaffolding/")` breaks two consumers that read the raw array and never reach the blueprint-side resolver: bootstrap substitutes at `$TARGET_DIR/$f`, which after `--strip-components=1` does not exist, so a new project ships with literal `{{PROJECT_NAME}}` throughout and reports zero substitutions rather than failing; and `a2bp` validates each requested path against the raw array, so `scripts/blueprint` is not beneath `scaffolding/` and EVERY legitimate request is rejected before staging. The intent survives intact — the set is still derived from location and the 69-entry hand-maintained array still dies. It becomes a FUNCTION: enumerate `scaffolding/` at the blueprint's committed HEAD and strip the prefix. One coordinate system on the outside, the prefix applied only where the blueprint's own tree is read. It also fixes `wait-mic.sh`, `session-resume.sh` and `no-chain-guard.sh`, which ship today while unmanaged — so derived projects run regression suites against scripts frozen at their bootstrap commit (BUG-029's shape). **Cost accepted:** the per-file comments explaining WHY each file must travel are real knowledge and will be lost; carry anything load-bearing into the files' own headers before deleting the array. |
| 8 | Stage A′ | **AUTHORIZED and required — but the stated reason was wrong, and so was the probe.** What is true: `read_blueprint_source` does call `bp_expand_managed_dirs`, so `drift` and `pull` die after root `tests/` disappears, and `blueprint pull scripts/blueprint` — the recovery — dies with them. That alone requires the stage. What is FALSE is "which every subcommand goes through": `files` reads the array directly, `a2bp` and `prs` load config and validate directly, `help` is local. `a2bp` does break after the move, for path-coordinate reasons (decision 7), not this chain. And the probe `[ -d "$BLUEPRINT_ROOT/scaffolding" ]` is too coarse: the first creation of `scaffolding/` prefixes every source path including files still at root, which is what FORCED §5's "Stage B is necessarily atomic" verdict. A per-path resolver — prefer `scaffolding/$f` when that exact path exists at committed HEAD, else root `$f` — supports staged moves, so the atomicity was an artefact of the probe rather than a property of the restructure. §5 is corrected accordingly. |

### Revisions — what the cross-provider review changed

Codex reviewed all eight answers on 2026-09-10 and ruled 1, 4, 7 and 8 wrong or
incomplete. Its verdict on the whole design was *"does not yet hold; findings 1–6
are implementation blockers before Stage B."*

Two of those four were repairable without changing the founder's intent. Decision
7's rule — location determines propagation — survives exactly as stated; only the
coordinate system was wrong. Decision 8's conclusion was right and its premise was
false, which matters because the premise is what a future reader would check the
decision against.

The other two were genuinely re-decided by the founder (see the cells).

**Finding 6 was investigated and does NOT hold.** Codex reported a fourth
failure-reporting bug in `scripts/run-ts-suites.sh` — `grep … | head -40` aborting
the outer gate under `set -e` + `pipefail`. Traced and measured: `pipefail` is set
nowhere on the path from `.githooks/pre-push` through `pre-push-project` to
`ts_suites_stage`, so the pipeline reports `head`'s status and both mechanisms are
masked. The precondition cannot be introduced by a derived project either — a
project's own guards run after `BLUEPRINT:END`, by which point the bridge has
already run. Recorded in `docs/config/findings.md` so the next review does not
re-raise it.

**Decision 9 — retiring a file that already shipped.** Decisions 2 and 4 both
create orphans: existing projects hold a `scripts/new-project.sh` that will stop
shipping and a `LICENSE` carrying the founder's copyright, and neither was ever in
`MANAGED_FILES`, so no `pull` can reach them. Founder decision: `pull` gains a
one-time migration, built on two ingredients.

*Inference is not one of them.* "Absent from `MANAGED_FILES`" is not evidence of
orphanhood — every file a project authored itself is also absent, so inference
alone turns `pull` into a delete-anything-unrecognised command.

1. **An explicit `RETIRED_FILES` manifest** — paths the blueprint once shipped and
   no longer does, each with the commit that retired it. Nothing is a candidate
   unless the blueprint declares it shipped it.
2. **Content proof before removal.** Compare the project's copy against what the
   blueprint shipped at that path, substituted for this project. Identical → offer
   deletion through the per-file `y/n/quit` prompt `pull` already has. Differs →
   the project edited it; never delete, report once as *"blueprint-shipped, now
   retired, and you have modified it — it is yours now."* Absent → silent.

The comparison is the alignment idea `a2bp` already uses for the placeholder
restore, so it is not a new primitive. The failure mode is safe by construction:
anything the blueprint cannot prove it wrote is left alone. `LICENSE` then needs no
special case — it is always in the "differs, is yours now" class, because a
project's licence is a legal decision and `pull` has no business rewriting it.

**One thing found while answering these, NOT part of the restructure and rowed
separately:** `docs/PUBLISHING.md` opens with *"This file is gitignored (under
`docs/`). It exists only on the founder's machine."* It is tracked, it is not
ignored, and it ships. A runbook describing the founder's personal
first-public-push process is delivered into every bootstrapped project. A-05
class, and unusual in that the file documents its own intended boundary while
the boundary does not exist.

---

## Founder decisions, collected

1. **§0 — `.github/workflows/`.** Cannot move. Choose (a) root-anchored shipping
   files as an accepted third class, (b) two copies, or (c) a root shim calling a
   scaffolding script. Same question applies to `CLAUDE.md` and
   `.claude/settings.json`.
2. **§0 — `scripts/blueprint` is sync + a2bp but must ship.** Does `forge/` mean
   "bootstrap + templates only"?
3. **§1 — `docs/` splits.** Does the blueprint read its own DoD/deck out of
   `scaffolding/docs/` (29 links to rewrite, pitch surface relocated), or do the
   generic docs stay root-anchored?
4. **§1 — `LICENSE`** ships today and is unmanaged. Should a derived project
   inherit the blueprint's licence at all?
5. **§1 — `scripts/accept-bug-022.sh`**: `forge/`, or delete?
6. **§1 — `docs/assets/brand/`** ships while `README.md:150` says it does not.
   Fix which end?
7. **§1 — take the `MANAGED_FILES=("scaffolding/")` simplification?** It is R2's
   actual promise, it deletes a 69-entry hand-maintained array, and it fixes
   `wait-mic.sh` / `session-resume.sh` / `no-chain-guard.sh` shipping unmanaged.
   It also removes the per-file comments that document *why* each file must
   travel — real knowledge, currently living in that array.
8. **§6 — is Stage A′ (the compatibility release) authorized before Stage B?**
   Without it, three projects break hard and recover by hand.
