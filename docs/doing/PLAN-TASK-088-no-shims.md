# PLAN — TASK-088: a port deletes its shell file

Row: [`BACKLOG.md`](BACKLOG.md) (TASK-088). Author: Christian (Architect), 2026-10-03.
Status: **draft, waiting for the three-provider plan review.**

The founder's rule and his 2026-10-03 ruling are quoted in the row and settled.
This plan implements them. It does not re-argue them:

- **The rule.** When a script is ported to TypeScript, every reference names
  the `.mts` and the shell file is deleted. The tests that only pin the shim or
  the adapter go with it. No two-line shim, no sourced adapter.
- **The ruling.** A legacy shell caller is edited to call the `.mts` without
  being ported. That edit must be the only change to the file, and the
  inventory check verifies it mechanically.

Every count below comes from `grep -rnP` over `scripts .githooks .github
.claude/settings.json tests docs README.md AGENTS.md AGENT_SIGNAL.md templates`
plus the root instruction files. The patterns were
`scripts/blueprint(?![.\w-])`, `log-activity\.sh`, `(?<![-\w])signal-watch\.sh`,
`start-(codex|kimi|gemini)-signal-watch\.sh`, `dod-gate\.sh` and
`(?<![-\w])gate\.sh`. Dated records (`docs/done/`, `docs/waiting-acceptance/`,
`docs/backlog/`, `findings.md`, `BUGS.md`, the 2026-07-23 audit) are history:
they keep naming the old paths and are not counted as callers.

## 1. The checker

### 1.1 What it accepts today

`scripts/shell-inventory-check.mts` accepts a changed legacy file only if the
file is now the exact two-line shim (`isValidShim`, :410) or one of two
generated adapters (`isValidSourcedAdapter`, :411). The adapter table is
`SOURCED_ADAPTERS` (:270): `dod-gate.sh` and `gate.sh`, each with
`canonicalPairs` (:215, :264). It also accepts a file with no row if the file is
a shim or an adapter (:400-401, BUG-145), and a removed row if its file is gone,
a shim or an adapter (:372-374). Any other edit to a legacy file is `CHANGED`.

### 1.2 The new acceptance: a reference-only edit

**D, the set of ported paths.** A shell path P is in D when P is not in the
tracked tree and its stem's `.mts` is tracked. `x.sh` maps to `x.mts`, and the
extensionless `scripts/blueprint` maps to `scripts/blueprint.mts`. D is computed
from HEAD's tree and the stdin file list the checker already receives (:449).

**C, the canonical form.** A legacy file whose blob differs from its BASE row is
accepted when `C(BASE blob) === C(HEAD file)`. BASE blob means the sha the BASE
inventory records, read with `git cat-file blob`. C runs these rewrites in
order. Every rewrite is line-local except R3, which only deletes whole lines:

| # | BASE form (shell) | Required HEAD form | C maps both to |
|---|---|---|---|
| R3 | a line that only sources a lib L ∈ D: `. P`, `source P`, `[ -r\|-f P ] && . P`, and the `# shellcheck source=…L.sh` directive above it | the line is gone | line deleted |
| R4 | `fn ARGS`, where fn is in L's function table | `node "PREFIX/scripts/lib/L.mts" sub ARGS` | `fn ARGS` |
| R5 | `command -v fn >/dev/null 2>&1 && ` | `[ -r "PREFIX/scripts/lib/L.mts" ] && ` | `⟨guard L⟩` |
| R2 | `bash ` or `sh ` before a P ∈ D token, or no interpreter | `node ` before the `.mts` token, or none | interpreter removed |
| R1 | the path token `…P` (code or comment) | the same token with `.mts` | `⟨P⟩` |

- **PREFIX is pinned.** It must equal a prefix BASE used to source L (e.g.
  `$BP_CODE_ROOT/`, `$repo_root/`). Otherwise a rewrite could point the call at
  another file.
- **The function table is the evidence for R4.** It is today's `canonicalPairs`,
  kept as a table of `{lib: {fn: sub}}` without the adapter headers. Without it,
  `dod_stage_rows` could be rewritten to `… dod-gate.mts bugtests` and pass. A
  future port of a sourced lib adds its own reviewed row (Q4).
- **What equality proves.** The two canonical forms must have the same number
  of lines and every line must match byte for byte, including whitespace and the
  final newline. Only the rewritten tokens can differ, so the rest of the file
  is identical to BASE by construction.
- **The row stays.** The legacy row keeps the pre-edit sha. Editing it is still
  `ROW-CHANGED` (:351), so every later push repeats the same comparison against
  the same base. This is the stability the stale rows of today's shims already
  rely on (`shell-inventory.json:42,44,45`).
- **Ceiling.** D accepts any absent `.sh` whose `.mts` is tracked, not only
  paths that once shipped. Repointing a dead reference at a live `.mts` is still
  a reference edit, so the rule is not tightened.

`checkRemovedRows` and `checkGoneRows` are unchanged: deleting a file and its row
together is already legal (:372).

### 1.3 What replaces the shim and adapter recognition

Nothing. In the final slice (§5, slice 9) the three `isValidShim` and three
`isValidSourcedAdapter` call sites go. So do `renderSourcedAdapter`,
`parseSourcedAdapterPairs` and the adapter headers (:103-325). A file with no
row is then `NEW`, whatever its shape.

`scripts/lib/shim.mts` is deleted. Its `blobHash`, `isTracked` and
`readFileOrUndefined` move into the checker, which is export-ignored. Nothing
that ships needs them once `tests/helpers/shim.ts` is gone. The deletion reaches
projects through retire-on-pull.

### 1.4 Tests

- **`tests/shell-inventory` today has 25 cases.** These 17 are deleted: #3, #4,
  #7, #11, #13 (shim) and #14-#24 including #16b, #16c and #19 (adapters).
  These 8 stay: #1, #2, #5, #6, #8, #9, #10, #12.
- **New cases for R1-R5.**
  - Accepted: N1 path rename in a comment and in code; N2 `bash x.sh` → `node
    x.mts`; N3 a source line dropped plus a call rewritten to a subcommand; N4
    the guard pair.
  - Refused: N5 a reference edit plus one unrelated byte; N6 a rename to an
    `.mts` whose `.sh` still exists; N7 the right fn mapped to the wrong
    subcommand; N8 a node call with a prefix BASE never sourced from.
  - Stability: N10 a second push with BASE's row still at the old sha passes.
  - Refused once slice 9 lands: N9 a two-line shim for a ported path is `NEW`.
- **`tests/helpers/shim.ts` is deleted.** Its 19 importers (`grep
  helpers/shim`) are updated pair by pair, each to read the `.mts` path
  directly, in the slice that deletes that path. The tests for kind and redirect
  in `state-dir.spec.ts` #7 R6 (:744, :779) go with it.

## 2. The sweep — callers per pair

**Legend.** **L** = legacy shell, edited under R1-R5. **X** = in the exempt
list, edited freely. **TS/JSON/YAML** = edited freely, because the checker
judges only shell under `scripts/` and `.githooks/` (`sh_lint_files`,
`run-ts-suites.sh:285`). "Comments" means R1 path renames.

| Pair (deleted file) | Production callers, and how each changes | Docs | Tests |
|---|---|---|---|
| `scripts/log-activity.sh` | `.claude/settings.json:285,296`: both hooks become `node "$CLAUDE_PROJECT_DIR/scripts/log-activity.mts"`. Comments: `lib/roster.sh:244`, `lib/feed.sh:6` (L), `install-toolchain.sh:164` (X), `log-activity.mts:1-2`. **No shell code calls it.** | none live | 12 files / 46 lines. Delete `subagent-feed` #7 (:733, pins the shim). The fixture copies in `feed-fixture.ts:172` and `roster-models:121,156` and the `sh …log-activity.sh` runs at :139,177 switch to the `.mts`. The `isShim` branch in `env-namespace.ts:155` goes. |
| `scripts/signal-watch.sh` | **No code caller.** The launchers already run `signal-watch.mts` (`start-codex…mts:377`, `-kimi:315`, `-gemini:234`). The `Usage:` text in `signal-watch.mts:29` names the `.sh`. Comments: `agent-activity.sh:53,109`, `new-project.sh:331` (L), `lib/watcher-lock.sh:5` (X). | README:133,243,343; AGENT_SIGNAL:410,484,495; PUBLISHING:53,108,153,201,258 | 16 files / 31 lines |
| `start-{codex,kimi,gemini}-signal-watch.sh` (one commit, because one array names all three) | `start-all-watchers.sh:21` (L, R1): the array names the `.mts`. `start_watch`'s `[ -x ]` and `nohup "$script"` still work, because all three `.mts` files are `100755` with `#!/usr/bin/env node`. Log names become `….mts.log`. Comments: `lib/state-dir.sh:106`, `lib/codex-session.sh:39` (L), `signal-watch.mts:60`, the three `.mts` headers. The stale rows at `shell-inventory.json:42,44,45` are removed. | AGENT_SIGNAL:409,415 (the Monitor command becomes `node scripts/start-codex-signal-watch.mts`),475,483,494; README:134,344; PUBLISHING ×5; A2BP_PLAYBOOK:160; AGENT_ROSTER.example:143-144; HANDOVER:211 | 13 files / 39 lines |
| `scripts/lib/gate.sh` | `agent-activity.sh` (L). Lines 766-767 go (R3). `arm_gate`/`arm_push_keepalive` at :787,788,791 become `[ -r "$repo_root/scripts/lib/gate.mts" ] && node "$repo_root/scripts/lib/gate.mts" arm-gate "$BP_STATE_ROOT"` (R4+R5). `blueprint.mts` `armGate` (:1684-1712): `bash -c '. lib; arm_gate'` becomes `run('node', [gate.mts, 'arm-gate', root])`. `gate.mts` reads no `BP_CODE_ROOT` (grep), so that env goes. The missing-file message (:1687-1689) names `gate.mts`. Comments: `.githooks/pre-push:18`, `lib/state-dir.sh:20` (L). | none live | 9 files / 70 lines. Delete `shell-inventory` #20-#24. `pull-behaviour` #6/#10 and `managed-references` #6 use the adapter as their dependency example. They keep testing the dependency-first ordering on a synthetic lib→`.mts` edge. |
| `scripts/lib/dod-gate.sh` | `.githooks/pre-push-project:447-470` (L). The `if [ -f …dod-gate.sh ]` test and the `pipe_skip` message become `.mts` (R1). The directive and source at :448-449 go (R3). The four `_st_dod_*` wrappers call `node "$BP_CODE_ROOT/scripts/lib/dod-gate.mts" rows\|bugtests\|signal\|judgement` (R4). `security.yml:243` (YAML): the source line goes and the two calls become `node scripts/lib/dod-gate.mts rows\|bugtests "$RANGE"`. Comments: `lib/pipeline.sh:63`, `lib/commit-subject.sh:6`, `lib/suites.sh:69` (L), `blueprint.mts:1680,1998,2094`, `signal-watch.mts:390`. **Q1 must be answered first** (§6). | DoD.md:200; AGENTS.md:322 (rewritten in slice 1) | 12 files / 46 lines. Delete `shell-inventory` #14-#19. `helpers/shim.ts` loses its adapter table. `forbidden-idiom` reads `dod-gate.mts` directly. |
| `scripts/blueprint` | `session-start.sh:33,35,44` (L): `[ -f scripts/blueprint.mts ]`, `node scripts/blueprint.mts drift`. `new-project.sh:111` (L): `node "$BLUEPRINT_ROOT/scripts/blueprint.mts" files`. `lib/placeholders.sh:89` (L): the case arm names `*scripts/blueprint.mts`, which holds no token (TASK-081 §9 D). `install-toolchain.sh:364-368,385` (X): see §3. `blueprint.mts`: `UNREGISTERED_MARKERS` (:1723); the seed reads `scripts/blueprint.mts` directly, and `CLI_SHIM_SOURCE` and the shim-follow branch go (:1994, :2056-2082); `namesCli` and the pull order drop the shim (:2415, :2483, :2485); the hint at :1689. `.claude/settings.json:192,193,204`: deleted, because `Edit(/home/**/**)` and `Bash(node *)` already cover the `.mts`. Comments: `lib/request-file.sh:17`, `lib/contamination.sh:77,81,197`, `lib/suites.sh:172`, `.githooks/pre-push-project:6` (L), `lib/signals.sh:19` (X), `gate.mts:12`, `contamination-push-scan.mts:6,42`. | README:166,178; AGENTS.md:87,305,350; AGENTS.blueprint.md:169; way-of-working:972; A2BP_PLAYBOOK:73,159; project_config_overview.md:66 | 24 files / 185 lines. Delete the shim-follow cases in `blueprint-port.spec.ts` (:425, :440, :454) and `blueprint-port.release` :2021. The differential harness's references to the historical shell source stay (TASK-081 §5). |

**History pointers stay.** `blueprint.mts` carries about 35
`scripts/blueprint:NNN` comments that cite lines of the pre-port shell. Ported
headers say "port of X.sh". Both point at git history, not at a live file (Q5).

## 3. Derived projects

### (a) The `blueprint` command

The v1 body `install-toolchain.sh` writes (:359-370) runs
`./scripts/blueprint`, and only that file. This machine runs v1
(`~/.local/bin/blueprint:2`). A project that retires `scripts/blueprint` on a
v1 machine then gets "no scripts/blueprint in $PWD" from every `blueprint` call.
`node scripts/blueprint.mts …` still works.

**Keeping the name is not viable.** An extensionless `scripts/blueprint` written
in TypeScript fails on this host's Node 22.23.2: `SyntaxError`, loaded as
CommonJS, with or without `--experimental-strip-types`. Measured on a scratch
file. A symlink would work, but it is a shim under another name.

**Sequence:**
1. **Slice 2 ships the v2 body.** It runs `node ./scripts/blueprint.mts` (and
   the `scaffolding/` twin) when present, and otherwise falls back to an
   executable `./scripts/blueprint`, which keeps pre-TASK-081 projects working.
   v1 joins the released set, so the installer replaces an owned v1 body (the
   code :356-358 defers to "when a v2 ships"). `check` (:601) reports a v1 body
   as stale.
2. **The Orchestrator reruns the installer on this machine** after slice 2
   (Q3). Every project here then works whether or not it has pulled.
   `scripts/blueprint` must be the last pair: slice 8 is not pushed until
   `install-toolchain.sh check` is green here.
3. **Another machine** that pulls slice 8 on v1 recovers with one
   `bash scripts/install-toolchain.sh` (the pulled copy). The founder ruled the
   other machine does not matter (`project_config_overview.md`, 2026-07-30).

**TASK-081's trap, compared.** A pre-TASK-088 CLI that single-file-pulls
`scripts/blueprint.mts` reads its seed from the blueprint's `scripts/blueprint`
(:2059). That file is now gone, so the new `.mts` lands with no lib closure.
This only matters if slice 8's `.mts` names a lib the project lacks, and today
it names only `gate.mts`, present since BUG-152. A full pull is unaffected: it
selects every differing file, and its trailing `scripts/blueprint` entry prints
"skip (not in blueprint)" (:2528-2532) and holds nothing back. The
announcement repeats TASK-081's: update with a full pull.

### (b) A project's own rules and hooks

`.claude/settings.project.json` holds only permission lists (AGENTS.md
§"Blueprint sync"), so it cannot carry a hook. A rule there naming an old path
becomes inert: an allow turns into a prompt, and a deny or ask protects nothing.
Pull cannot rewrite it, because it is project-owned. The managed hook in
`settings.json` (log-activity) is rewritten by the same pull that offers the
retirement. Retirement prompts per file (`bpRetire`, :2339), so a project that
declines `settings.json` and accepts the retirement breaks its subagent hook.

**Measured on the five derived projects on this machine** (linkedin-watcher-agent,
lyricscreator, seals-validator, storm2flow, struct2flow-www): no
`settings.project.json` or `settings.local.json` names any of the eight paths,
and neither does any `pre-push-project` after `BLUEPRINT:END`. The one hit in a
project-owned script is `storm2flow/scripts/blueprint-deltas/signal-dispatch.release.spec.ts.patch:4`.

### (c) What each deleting commit body announces

- the path deleted, and the `.mts` that replaces it;
- "accept `.claude/settings.json` before you accept the retirement" (slice 3);
- "update with a full `blueprint pull`, not a single-file pull of the CLI"
  (slice 8);
- "run `bash scripts/install-toolchain.sh` once per machine; until then, run
  `node scripts/blueprint.mts <command>`" (slice 8);
- "a rule, hook or project script naming the old path must be repointed by the
  project". Named for storm2flow's delta patch (slice 4).

## 4. The docs

- **`AGENTS.md` §"Shell to TypeScript, organically" (:295-371), in slice 1.**
  - The shim paragraph (:301-317) becomes: "a port deletes the shell file, and
    every hook, allowlist entry, doc, workflow, suite and managed script names
    the `.mts` in the same commit".
  - The sourced-adapter paragraph (:318-335) is replaced by the ruling: "a
    legacy shell caller is repointed without being ported. The edit may only
    rename the path, swap the interpreter, drop the source line, and call
    `node L.mts sub` for a sourced function. Anything else in the file still
    forces its port."
  - The closed-exceptions list (:343-354) keeps its three files. Its
    `.githooks` sentence loses "behind a shim" and takes Q2's answer.
  - The enforcement paragraph (:355-371) replaces "the exact shim WITH A TRACKED
    `.mts` TARGET" with "its BASE blob changed only by those rewrites".
  - One sentence says the checker still recognises the remaining pairs until
    slice 9 removes them. Slice 9 deletes that sentence.
- **`docs/way-of-working.md:713`**, the Quality slide 3: "The old path becomes a
  fixed two-line shim" becomes "The shell file is deleted; callers name the
  `.mts`". Same commit, per `AGENTS.blueprint.md` §"docs/way-of-working.md is
  the canonical pitch surface".
- **No README concern-table row changes.** The README path rows move with their
  pairs (§2).

## 5. Slices

Each slice lands on `main`, green on its own, with no branch. The work picks the
role and the rotation picks the provider. QA comes from a different provider
than the implementer, and four-eyes review is per `AGENT_SIGNAL.md`.

| # | Commit | Implements / verifies | Proof |
|---|---|---|---|
| 1 | **The rule and the checker.** AGENTS.md and the deck (§4). The checker gains D, C, R1-R5 and the function table, additively; shim and adapter recognition stay. Tests N1-N8, N10. | Back-End / QA, and Security for four-eyes (it is a self-authorization surface) | `tests/shell-inventory`. Mutants, each turning its named case red: R4 without its table (N7), PREFIX unpinned (N8), R1 without the D test (N6), C ignoring a line-count change (N5), R3 removed (N3). The real tree passes. |
| 2 | **The `blueprint` command v2** (`install-toolchain.sh`, exempt). | Infrastructure / QA | `tests/install-toolchain`: v1 is replaced, a foreign body is kept, v2 runs the `.mts` and falls back to the shell. `check` flags v1. Then the installer is rerun here (Q3). |
| 3 | `log-activity.sh` | Back-End / QA | `subagent-feed`, `env-namespace`, `roster-models`, `harness`, `shell-inventory` |
| 4 | `signal-watch.sh` | Back-End / QA | `state-dir`, `watcher-liveness`, `signal-dispatch`, `baton-durability`, `mic-recovery`, `dispatch-identity`, `doc-links` |
| 5 | the three `start-*-signal-watch.sh` | Back-End / QA | `dispatch-identity`, `codex-dispatch-status`, `codex-session`, `pull-exec-bit`, `scratch-tmpdir-dispatch`, `state-dir` |
| 6 | `lib/gate.sh` | Back-End / QA | `gate-arming`, `drift-in-blueprint`, `managed-references`, `pull-behaviour`, `forbidden-idiom`, `blueprint-port`. A mutant drops R5, and the agent-activity edit is then refused. |
| 7 | `lib/dod-gate.sh`, after Q1 | Back-End / QA | `dod-gate`, `commit-subjects`, `manifest`, `gate-ci-parity`. The real pre-push run's DoD stage lines are compared before and after. |
| 8 | `scripts/blueprint`, only after `install-toolchain.sh check` is green here | Back-End / QA, and a Codex review of the whole diff | the full suite plus the release tier (`blueprint-port.release`, `bootstrap-gate`, `sync-by-address`, `a2bp-e2e`). A fixture project on a v1 command shows the announced failure and its recovery. |
| 9 | **Recognition removed.** Shim and adapter code out of the checker, `lib/shim.mts` and `tests/helpers/shim.ts` deleted, the transitional AGENTS.md sentence gone, and N9. | Back-End / QA | `tests/shell-inventory`, and `tsc` over `tests/` (no importer left). A two-line shim planted on any ported path is refused. |

Slices 3-8 each delete their pair's rows and tests in the same commit, and each
carries §3(c)'s announcement.

## 6. Risks and open questions for the founder

1. **Q1. The DoD gate's notes.** `_dg_call` replays `dod-gate.mts`'s notes
   through `pipe_note`. Run directly, the CLI prints them to stdout instead
   (`dod-gate.mts:70-71`), and a passing buffered stage drops stdout
   (`pipeline.sh:224,246`). So the §D·F·H detail and the cancelled/parked notes
   vanish from a green run. Keeping them needs a `pipeline.sh` change, which
   forces its port. **Recommendation: accept the loss.** The stage labels
   remain.
2. **Q2. Git hooks.** Git fixes a hook's name, and Node cannot run an
   extensionless TypeScript file (measured), so a future hook port has no
   no-shim shape. **Recommendation: a hook keeps a shell entry that `exec`s its
   `.mts`. This is the only launcher left, and TASK-018 §3.3 already requires
   it.**
3. **Q3.** May the Orchestrator run `bash scripts/install-toolchain.sh` here
   after slice 2, so that `~/.local/bin/blueprint` becomes v2 before slice 8?
4. **Q4.** Each future port of a sourced lib adds one reviewed row to the
   checker's function table. No naming convention maps
   `dod_items_in_push` → `items`. Is that acceptable?
5. **Q5.** History pointers (`scripts/blueprint:NNN` in `blueprint.mts`, "port
   of X.sh" headers, dated records) keep the old names. Is that acceptable?

**Risk.** C is now the part of the gate that guards against self-authorization.
Its mutants in slice 1 are the evidence that it works.

**Not verified:** how `gate-ci-parity` and `manifest` react to the
`security.yml` edit (slice 7 runs them); how many of `blueprint-port.release`'s
56 `scripts/blueprint` lines are differential-history references rather than
callers (slice 8 sorts them); and the derived projects on any other machine.
