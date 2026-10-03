# PLAN — TASK-088: a port deletes its shell file

Row: [`BACKLOG.md`](BACKLOG.md) (TASK-088). Author: Christian (Architect), 2026-10-03.
Status: **revised after the Claude and Codex reviews.** Markus (Security,
Claude) and Alexey (Codex) both returned APPROVE WITH CHANGES, and every
finding is folded in below. Kimi's review is missing because Kimi is out of
quota. **Approved by the founder, 2026-10-03:** go ahead without Kimi's review,
and Q2-Q5 are confirmed as recommended (§6). Kimi reviews the first
implementation slice instead when its quota returns.

The founder's rule and his 2026-10-03 ruling are quoted in the row and settled.
This plan implements them. It does not re-argue them:

- **The rule.** When a script is ported to TypeScript, every reference names
  the `.mts` and the shell file is deleted. The tests that only pin the shim or
  the adapter go with it.
- **The ruling.** A legacy shell caller is edited to call the `.mts` without
  being ported. That edit must be the only change to the file, and the
  inventory check verifies it mechanically.

**Evidence.** Every count comes from `grep -rnP` over `scripts .githooks
.github .claude/settings.json tests docs README.md AGENTS.md AGENT_SIGNAL.md
templates` and the root instruction files. The patterns were
`scripts/blueprint(?![.\w-])`, `log-activity\.sh`, `(?<![-\w])signal-watch\.sh`,
`start-(codex|kimi|gemini)-signal-watch\.sh`, `dod-gate\.sh` and
`(?<![-\w])gate\.sh`.

Dated records are history and keep the old paths: `docs/done/`,
`docs/waiting-acceptance/`, `docs/backlog/`, `findings.md`, `BUGS.md` and the
2026-07-23 audit. `HANDOVER.md` is live, so it is swept (§4).

## 1. The checker

### 1.1 What it accepts today

`scripts/shell-inventory-check.mts` accepts a changed legacy file only if it is
now one of two shapes:
- the exact two-line shim: `isValidShim`, checked at :410;
- one of the two generated adapters: `isValidSourcedAdapter`, checked at :411.
  The adapter table is `SOURCED_ADAPTERS` (:270), with `canonicalPairs` at
  :215 and :264.

The same two shapes pass in two other places:
- a file with no inventory row (:400-401, BUG-145);
- a removed row (:372-374), which also passes when its file is gone.

Any other edit to a legacy file is reported as `CHANGED`.

### 1.2 The new acceptance: a reference-only edit

**D, the set of ported paths.** A shell path P is in D when P is not in the
tracked tree and its stem's `.mts` is tracked. `x.sh` maps to `x.mts`. The
extensionless `scripts/blueprint` maps to `scripts/blueprint.mts`. D is computed
from HEAD's tree and the stdin file list (:449).

**Tokens.** A reference to P is either its repo-relative path or its bare
basename. The basename form is resolved against D only when exactly one member
of D has that basename; an ambiguous basename is not a token.
- **Boundaries.** A token is delimited by `(?<![-\w/])` before and `(?![-\w.])`
  after. So `codex-signal-watch.sh` (`agent-activity.sh:110`) is not a
  `signal-watch.sh` token.
- **Several per line.** Every token on a line is matched, as at
  `start-all-watchers.sh:21` and `pre-push-project:470`.

**C is directional** (Markus F1, Alexey 1). Two canonicalisers map to one shared
set of placeholders:
- **C_base** recognises only the shell forms. It is run on the BASE blob, which
  is the sha the BASE inventory records, read with `git cat-file blob`.
- **C_head** recognises only the `.mts` forms. It is run on the HEAD file.

A changed legacy file is accepted when `C_base(BASE)` and `C_head(HEAD)` have the
same lines, byte for byte, including whitespace and the final newline. A BASE
form left in HEAD, or added to it, is not recognised by C_head. It stays literal
and the comparison fails. That covers an inserted source line, a kept source
line, a bare function call left beside a swapped guard, and a reverted
interpreter.

The rules run in order R3, R5, R4, R2, R1. L is a sourced lib in D, and
PREFIX_L is the set of prefixes BASE's own R3 lines use for L.

| # | C_base recognises (shell, BASE only) | C_head recognises (`.mts`, HEAD only) | Placeholder |
|---|---|---|---|
| R3 | A whole line that only sources L: `. Q`, `source Q`, `[ -r\|-f Q ] && . Q`, plus the `# shellcheck source=…` directive above it. Q is `scripts/lib/L.sh`, optionally after one shell variable (`$V/` or `${V}/`). Nothing else is R3, which closes Markus's `tests/x/scripts/lib/gate.sh` insertion. | none | line deleted |
| R5 | `command -v fn >/dev/null 2>&1 && ` | `[ -r "PREFIX/scripts/lib/L.mts" ] && `, with PREFIX in PREFIX_L | `⟨guard L⟩` |
| R4 | a word-bounded `fn` in L's table, on a non-comment line, anywhere on the line, including a one-line body such as `_st_dod_rows(){ dod_stage_rows "$_dod_ranges"; }` (`pre-push-project:454`) | L's HEAD template: `ENV node "PREFIX/scripts/lib/L.mts" sub`, with PREFIX in PREFIX_L. ENV is the table's fixed text and may be empty. | `⟨call L fn⟩` |
| R2 | `bash ` or `sh ` before a token | `node ` before a token | `⟨run P⟩` |
| R1 | any other token for P (code or comment) | any other token for P's `.mts` | `⟨P⟩` |

**The rules couple.** If C_base applied R3 or R5 to L in a file, C_head must have
applied R4 to L at least once in that file; otherwise the file is refused. This
is also enforced on its own, besides falling out of directionality.

**R2 keeps the interpreter** (Alexey 2). Placeholders must match one for one,
with two widenings:
- `⟨P⟩` in BASE may become `⟨run P⟩` in HEAD, because adding `node` is always
  runnable.
- `⟨run P⟩` in BASE may become `⟨P⟩` in HEAD only when P's `.mts` is `100755` in
  the index.

`blueprint.mts` is `100644`, so `bash scripts/blueprint drift` →
`scripts/blueprint.mts drift` is refused.

**The function table** is today's `canonicalPairs` without the adapter headers:
`{lib: {fn: sub}, mts, headTemplateEnv}`. It is the evidence for R4, because
without it `dod_stage_rows` could become `… dod-gate.mts bugtests` and pass.
- `gate.sh`: ENV is empty.
- `dod-gate.sh`: ENV is
  `DOD_GATE_NOTE_FILE="${_PIPE_DIR:+$_PIPE_DIR/note.$_PIPE_N}" ` (§6 Q1).
- A new test checks that every `sub` in the table is a `case` in its
  `.mts`'s `main()` (Markus Q4).

**The row stays at the pre-edit sha.** Editing it is `ROW-CHANGED` (:351), so
every later push makes the same comparison against the same base.

**The renaming trap** (Markus F4). The row cannot be refreshed: changing it is
`ROW-CHANGED` (:351) and removing it is `ROW-REMOVED-WITHOUT-MIGRATION` (:375).
So if a ported `.mts` is later renamed or folded into another file, its `.sh`
leaves D. Every caller repointed at it is then `CHANGED` on every push until
that caller is ported. AGENTS.md says so (§4).

**Ceiling.** D accepts any absent `.sh` whose `.mts` is tracked, not only paths
that once shipped. Repointing a dead reference at a live `.mts` is still a
reference edit.

`checkRemovedRows` and `checkGoneRows` are unchanged: deleting a file and its row
together is already legal (:372).

### 1.3 What replaces the shim and adapter recognition

Slice 9 deletes the adapter code: `isValidSourcedAdapter`,
`renderSourcedAdapter`, `parseSourcedAdapterPairs` and the headers (:103-325).

**Shim recognition stays, scoped to Git hooks** (Markus F2, Alexey Q2). Git fixes
a hook's name, and Node cannot run an extensionless TypeScript file. I measured
this on Node 22.23.2: it loads the file as CommonJS and throws `SyntaxError`,
with or without `--experimental-strip-types`. So a hook port keeps a two-line
`exec` entry at the hook's path. `isValidShim` is then accepted only for
`.githooks/<name>` where `<name>` is a Git hook name. Anywhere else, a file with
no row is `NEW`.

`isValidShim`, `shimContent`, `blobHash`, `isTracked` and `readFileOrUndefined`
move into the checker, which is export-ignored. `scripts/lib/shim.mts` is
deleted, and the deletion reaches projects through retire-on-pull.

### 1.4 Tests

**`tests/shell-inventory`'s 25 cases.**
- These 17 are deleted: #3, #4, #7, #11, #13 (the shim, outside hooks) and
  #14-#24 including #16b, #16c and #19 (the adapters).
- These 8 stay: #1, #2, #5, #6, #8, #9, #10, #12.

**New cases.** N1-N4 use the real shapes (Markus F5).

Accepted:
- **N1**: R1 on three basenames on one line (`start-all-watchers.sh:21`), with
  `codex-signal-watch.sh` on the same line left alone.
- **N2**: R2, `bash "$BLUEPRINT_ROOT/scripts/blueprint" files` →
  `node "$BLUEPRINT_ROOT/scripts/blueprint.mts" files` (`new-project.sh:111`).
- **N3**: R3 plus R4 inside one-line function bodies (`pre-push-project:447-470`
  with the ENV template), and the two tokens on line 470.
- **N4**: R3 plus R5 plus R4 (`agent-activity.sh:766-791`).
- **N10**: a second push, with BASE's row still at the old sha.

Refused:
- **N5**: a reference edit plus one unrelated byte.
- **N6**: a rename to an `.mts` whose `.sh` still exists.
- **N7**: the right `fn` mapped to the wrong `sub`.
- **N8**: a node call with a PREFIX not in PREFIX_L.
- **N11**: an inserted source line, Markus's `tests/x/…/gate.sh`.
- **N12**: a BASE source line kept in HEAD.
- **N13**: guard swapped and source dropped while the bare `arm_gate` stays
  (Alexey 1).
- **N14**: `bash X` → bare `X.mts` with the `.mts` at `100644`.
- **N15**: a basename that two members of D share.
- **N9**, after slice 9: a two-line shim at `scripts/x.sh` is `NEW`, while one
  at `.githooks/pre-push` is accepted.

**`tests/helpers/shim.ts`.** 22 files name it (`grep -rl helpers/shim tests`):
20 importers, `tests/tsconfig.json`'s comment, and the helper itself (Markus
F6). Each pair slice moves that pair's importers to read the `.mts` directly.
Slice 9 deletes the helper, along with `state-dir.spec.ts` #7 R6 (:744, :779).

## 2. The sweep: callers per pair

**Legend.**
- **L**: legacy shell, edited under R1-R5.
- **X**: exempt.
- **TS/JSON/YAML**: edited freely, because the checker judges only shell under
  `scripts/` and `.githooks/` (`run-ts-suites.sh:285-298`).
- **Comments**: R1 renames.

**Inventory rows exist only for the three launchers**
(`shell-inventory.json:42,44,45`, Alexey). The other five pairs have no row,
because their port push removed it.

| Pair (deleted file) | Production callers, and how each changes | Docs | Tests |
|---|---|---|---|
| `scripts/log-activity.sh` | `.claude/settings.json:285,296`: both hooks become `node "$CLAUDE_PROJECT_DIR/scripts/log-activity.mts"`. Comments: `lib/roster.sh:244`, `lib/feed.sh:6` (L), `install-toolchain.sh:164` (X), `log-activity.mts:1-2`. **No shell code calls it.** | none live | 12 files / 46 lines. Delete `subagent-feed` #7 (:733, the shim pin). The copies in `feed-fixture.ts:172` and `roster-models:121,156` and the `sh` runs at :139,177 move to the `.mts`. The `isShim` branch in `env-namespace.ts:155` goes. |
| `scripts/signal-watch.sh` | **No code caller.** The launchers already run the `.mts` (`start-codex…mts:377`, `-kimi:315`, `-gemini:234`). The `Usage:` line at `signal-watch.mts:29` changes. Comments: `agent-activity.sh:53,109`, `new-project.sh:331` (L), `lib/watcher-lock.sh:5` (X). | README:133,243,343; AGENT_SIGNAL:410,484,495; PUBLISHING:53,108,153,201,258 | 16 files / 31 lines |
| `start-{codex,kimi,gemini}-signal-watch.sh` (one commit, because one array names all three) | `start-all-watchers.sh:21` (L, R1 by basename). `[ -x ]` and `nohup "$script"` still work, because all three `.mts` are `100755` with `#!/usr/bin/env node`. Logs become `….mts.log`. Comments: `lib/state-dir.sh:106`, `lib/codex-session.sh:39` (L), `signal-watch.mts:60`, the three `.mts` headers. The three rows are removed. | AGENT_SIGNAL:409,415 (the Monitor command becomes `node scripts/start-codex-signal-watch.mts`),475,483,494; README:134,344; PUBLISHING ×5; A2BP_PLAYBOOK:160; AGENT_ROSTER.example:143-144; HANDOVER:211 | 13 files / 39 lines |
| `scripts/lib/gate.sh` | `agent-activity.sh` (L): lines 766-767 go (R3). :787,788,791 become `[ -r "$repo_root/scripts/lib/gate.mts" ] && node "$repo_root/scripts/lib/gate.mts" arm-gate "$BP_STATE_ROOT"` (R5+R4). `blueprint.mts` `armGate` (:1684-1712) runs `node gate.mts arm-gate`. `gate.mts` reads no `BP_CODE_ROOT` (grep). The message at :1687-1689 names the `.mts`. Comments: `.githooks/pre-push:18`, `lib/state-dir.sh:20` (L). | none live | 9 files / 70 lines. Delete `shell-inventory` #20-#24. `pull-behaviour` #6/#10 and `managed-references` #6 keep testing the dependency-first ordering on a synthetic lib→`.mts` edge. |
| `scripts/lib/dod-gate.sh` | `.githooks/pre-push-project:447-470` (L): `if [ -f …dod-gate.mts ]` and the `pipe_skip` text (R1); :448-449 go (R3); the four `_st_dod_*` bodies use the R4 template with ENV. `security.yml:243` (YAML): the source line goes and the calls become `DOD_GATE_NOTE_FILE="${_PIPE_DIR:+…}" node scripts/lib/dod-gate.mts rows\|bugtests "$RANGE"`. `dod-gate.mts` replaces `DOD_GATE_NOTE_DIR` with `DOD_GATE_NOTE_FILE` (§6 Q1). Comments: `lib/pipeline.sh:63`, `lib/commit-subject.sh:6`, `lib/suites.sh:69` (L), `blueprint.mts:1680,1998,2094`, `signal-watch.mts:390`. | DoD.md:200; AGENTS.md:322 (slice 1) | 12 files / 46 lines. Delete `shell-inventory` #14-#19. `forbidden-idiom` reads the `.mts`. `tests/dod-gate`'s note cases move to `DOD_GATE_NOTE_FILE`. |
| `scripts/blueprint` | `session-start.sh:33,35,44` (L): `[ -f scripts/blueprint.mts ]`, `node scripts/blueprint.mts drift`, keeping the interpreter. `new-project.sh:111` (L): R2. `lib/placeholders.sh:89` (L): R1; the `.mts` holds no token (TASK-081 §9 D). `install-toolchain.sh:364-368,385` (X): §3. `blueprint.mts`: `UNREGISTERED_MARKERS` (:1723); the seed reads the `.mts` (:2056-2082); `CLI_SHIM_SOURCE` goes (:1994); `namesCli` and the pull order drop the shim (:2415, :2483, :2485); the hint at :1689. `.claude/settings.json:192,193,204`: deleted, because `Edit(/home/**/**)` and `Bash(node *)` cover the `.mts`. Comments: `lib/request-file.sh:17`, `lib/contamination.sh:77,81,197`, `lib/suites.sh:172`, `pre-push-project:6` (L), `lib/signals.sh:19` (X), `gate.mts:12`, `contamination-push-scan.mts:6,42`. | README:166,178; AGENTS.md:87,305,350; AGENTS.blueprint.md:169; way-of-working:972; A2BP_PLAYBOOK:73,159; project_config_overview.md:66; HANDOVER:123-130 | 24 files / 185 lines. Delete `blueprint-port.spec.ts` :425, :440, :454 and `blueprint-port.release` :2021. The differential harness's references to the historical shell stay. |

**History pointers stay** (Q5): the roughly 35 `scripts/blueprint:NNN` comments
in `blueprint.mts`, the "port of X.sh" headers, and dated records.

## 3. Derived projects

### (a) The `blueprint` command

The v1 body (`install-toolchain.sh:359-370`) runs only `./scripts/blueprint`, and
this machine runs v1 (`~/.local/bin/blueprint:2`). Keeping the name is not
viable: an extensionless TypeScript file does not run (§1.3), and a symlink is a
shim under another name.

1. **Slice 2 ships the v2 body.** It runs `node ./scripts/blueprint.mts` (and the
   `scaffolding/` twin) when present, keeping `node` because the `.mts` is
   `100644`. Otherwise it execs an executable `./scripts/blueprint`.
   - v1 joins the released set, so the installer replaces an owned v1 body
     (:356-358).
   - **`check` today never counts the command** (:593-602). Slice 2 counts an
     owned v1 body as missing, so `check` exits 1 until v2 is in place. A
     foreign body still only warns. Install replaces v1, so install and `check`
     still agree.
   - `tests/install-toolchain` pins this: v1 gives exit 1, v2 gives exit 0
     (Alexey 7).
2. **The Orchestrator reruns the installer here after slice 2** (Q3). Slice 8
   has a hard precondition: `install-toolchain.sh check` exits 0 here.
3. **Another machine** recovers with one `bash scripts/install-toolchain.sh`. The
   founder ruled the other machine does not matter (2026-07-30).

**TASK-081's trap, compared.** A pre-TASK-088 CLI that single-file-pulls the
`.mts` reads its seed from the deleted `scripts/blueprint` (:2059), so the `.mts`
lands without its lib closure. Today that matters only if the `.mts` names a
missing lib, and it names only `gate.mts`, present since BUG-152. A full pull
selects every differing file. Its trailing `scripts/blueprint` prints "skip (not
in blueprint)" (:2528-2532) and holds nothing back.

### (b) Break sequences

**Two facts make each sequence below possible.**
- Pull prompts for each update and each retirement independently
  (`blueprint.mts:2579-2600`, `2339-2351`).
- `bpRetire` runs after the pull whatever was held (:2318-2353, `libNeeds` at
  :2506-2516).

Each sequence below is a declined or held update followed by an accepted
retirement:

| Slice | Declined or held | Then retired | Result |
|---|---|---|---|
| 3 | `.claude/settings.json` | `log-activity.sh` | The subagent hook fails on every subagent. |
| 6 | `scripts/blueprint.mts` (declined, or held by `libNeeds`) | `lib/gate.sh` | The old `armGate` dies (:1688). Drift refuses, and session-start says UNKNOWN (Markus F3). |
| 8 | `scripts/session-start.sh` | `scripts/blueprint` | Session-start says "scripts/blueprint not present", so drift is UNKNOWN (Markus F3). |
| 8, on a pre-TASK-081 project (shell CLI) | `install-toolchain.sh` and `scripts/blueprint.mts` | `scripts/blueprint` | Neither v1 nor v2 finds a runnable local CLI (Alexey 6). |

**Project-owned files.** `.claude/settings.project.json` holds only permission
lists, so a rule naming an old path becomes inert and pull cannot rewrite it.

I measured the five derived projects on this machine: linkedin-watcher-agent,
lyricscreator, seals-validator, storm2flow and struct2flow-www. None of them has
a `settings.project.json`, `settings.local.json` or post-`BLUEPRINT:END` hook
naming the eight paths. The one hit in a project-owned script is
`storm2flow/scripts/blueprint-deltas/signal-dispatch.release.spec.ts.patch:4`.

### (c) What each deleting commit body announces

- The path deleted, and its `.mts`.
- **The acceptance order:** accept every update first, and accept a
  retirement only when the pull printed no `skipped` or `refuse:` line
  (`blueprint.mts:2596`, :2510, :1970). If in doubt,
  answer N to the retirement; the next pull offers it again.
- **The recovery:** `git checkout -- <retired file>` (retirement only removes
  it; it is still in git), then a full `blueprint pull`.
- Slice 8 also says:
  - update with a full pull, not a single-file pull of the CLI;
  - run `bash scripts/install-toolchain.sh` once per machine;
  - until then, `node scripts/blueprint.mts <command>` works.
- A rule, hook or project script naming an old path is the project's to
  repoint. Slice 4 names storm2flow's delta patch.

## 4. The docs

**`AGENTS.md` §"Shell to TypeScript, organically" (:295-371), in slice 1:**
- **The shim paragraph (:301-317)** says that a port deletes the shell file, and
  that every hook, allowlist entry, doc, workflow, suite and managed script names
  the `.mts` in the same commit.
- **The adapter paragraph (:318-335)** is replaced by the ruling: a legacy shell
  caller is repointed without being ported. The edit may only:
  - rename the path;
  - keep its interpreter, as `node`;
  - drop the source line;
  - call `node L.mts sub` for a sourced function.
  Anything else forces the file's port. It also states **the renaming trap**
  (§1.2): never rename or fold a ported `.mts` while a legacy caller names it.
- **Hooks.** "TASK-088 supersedes TASK-018 §3.3 except for one named case: a
  Git-mandated hook name keeps a two-line `exec` entry to its `.mts`" (Alexey
  Q2). The closed-exceptions list (:343-354) keeps its three files.
- **The enforcement paragraph (:355-371)** says: "its BASE blob changed only by
  those rewrites, or a hook entry".
- **A transitional sentence** says the checker still recognises the remaining
  pairs until slice 9. Slice 9 deletes it.

**Also in slice 1:**
- `docs/way-of-working.md:713`, Quality slide 3: "The old path becomes a fixed
  two-line shim" becomes "The shell file is deleted; callers name the `.mts`".
  This lands in the same commit, per `AGENTS.blueprint.md`.
- `HANDOVER.md:168-171`, which says TASK-088 awaits a decision.
- `HANDOVER.md:271-274`, which mandates shims (Alexey 8).

The CLI description at `HANDOVER.md:123-130` moves in slice 8. No README
concern-table row changes.

## 5. Slices

Each slice lands on `main`, green on its own. The work picks the role and the
rotation picks the provider. QA comes from a different provider than the
implementer, and four-eyes review is per `AGENT_SIGNAL.md`.

| # | Commit | Implements / verifies | Proof |
|---|---|---|---|
| 1 | **The rule and the checker.** AGENTS.md, the deck and HANDOVER (§4). Directional C, R1-R5, the function table and its `case` test, added beside the existing recognition. Tests N1-N8 and N10-N15. | Back-End / QA, plus Security for four-eyes | `tests/shell-inventory`. Mutants, each turning its named case red: symmetric C (N11, N12), no coupling (N13), R4 without its table (N7), PREFIX unpinned (N8), no D test (N6), interpreter drop allowed (N14), line-count blind (N5), basename without a uniqueness test (N15). The real tree passes. |
| 2 | **The v2 command, and `check` counting v1** (`install-toolchain.sh`, exempt). | Infrastructure / QA | `tests/install-toolchain`: v1 replaced, a foreign body kept, v2 runs the `.mts` and falls back to the shell, `check` exits 1 on v1 and 0 on v2. Then the installer is rerun here. |
| 3 | `log-activity.sh` | Back-End / QA | `subagent-feed`, `env-namespace`, `roster-models`, `harness` |
| 4 | `signal-watch.sh` | Back-End / QA | `state-dir`, `watcher-liveness`, `signal-dispatch`, `baton-durability`, `mic-recovery`, `dispatch-identity`, `doc-links` |
| 5 | the three launchers, and their three rows | Back-End / QA | `dispatch-identity`, `codex-dispatch-status`, `codex-session`, `pull-exec-bit`, `scratch-tmpdir-dispatch`, `state-dir` |
| 6 | `lib/gate.sh` | Back-End / QA | `gate-arming`, `drift-in-blueprint`, `managed-references`, `pull-behaviour`, `forbidden-idiom`, `blueprint-port` |
| 7 | `lib/dod-gate.sh`, plus `DOD_GATE_NOTE_FILE` in `dod-gate.mts` | Back-End / QA | `dod-gate`, `commit-subjects`, `manifest`, `gate-ci-parity`. **The note contract:** a real buffered pre-push run's four DoD stage lines are byte-compared before and after, including the `· note` tails, and the same is done for an unbuffered run. |
| 8 | `scripts/blueprint`, only once `install-toolchain.sh check` exits 0 here | Back-End / QA, plus a Codex review of the diff | The full suite and the release tier (`blueprint-port.release`, `bootstrap-gate`, `sync-by-address`, `a2bp-e2e`). A fixture on a v1 command shows the announced failure and its recovery. |
| 9 | **Recognition removed.** The adapter code goes and shim recognition is scoped to `.githooks/*`. `lib/shim.mts` and `tests/helpers/shim.ts` are deleted, and the transitional sentence goes. N9. | Back-End / QA | `tests/shell-inventory`, and `tsc` over `tests/` with no importer left |

Only slice 5 removes inventory rows. Slices 3-8 delete their pair's file, its
shim and adapter tests, and the helper imports it needed, and each carries
§3(c)'s announcement.

## 6. Open questions and risks

1. **Q1: the notes are kept.** I checked Alexey's route against the files, and
   it holds without touching `pipeline.sh`:
   - `pre-push-project` is sourced into `pre-push`'s own shell
     (`pre-push:803-810`), after `pipe_init` (:223).
   - A stage function runs in that same shell: `"$@" >"$_out" 2>&1`
     (`pipeline.sh:224`).
   - During the call, `_PIPE_N` is the stage index whose `note.$_PIPE_N` was
     just truncated (:214) and is read afterwards (:234). It is incremented only
     in `_pipe_record` (:160).
   - So `${_PIPE_DIR:+$_PIPE_DIR/note.$_PIPE_N}`, expanded by the calling shell
     in the wrapper body, names the right file, and no export is needed.

   **The behaviour of `dod-gate.mts` for each value of `DOD_GATE_NOTE_FILE`,
   matching what the adapter produced byte for byte:**

   | `DOD_GATE_NOTE_FILE` | `dod-gate.mts` does | Matches |
   |---|---|---|
   | non-empty | appends each note's raw text, with no separator | `pipe_note`'s buffered `printf '%s' >>` (:207) |
   | set but empty (unbuffered, and CI, where `_PIPE_DIR=""` from :73 and `_PIPE_BUF` is unset) | prints `     note: %s\n` | `pipe_note`'s unbuffered branch (:208), which the adapter reached |
   | unset (a bare CLI run) | prints `note: %s\n`, as today (:70-71) | today's bare-run output |

   Markus's concern stands for any route that needs an export, and this route
   needs none.
2. **Q2: Git hooks.** Recommended by both reviewers: a hook keeps a two-line
   `exec` entry, recognised only under `.githooks/` (§1.3). AGENTS.md says that
   TASK-088 supersedes TASK-018 except for this case.
3. **Q3: the installer.** The Orchestrator reruns
   `bash scripts/install-toolchain.sh` here after slice 2 (founder, 2026-10-03),
   with `check` exiting 0 as the precondition for slice 8.
4. **Q4: the function table.** Each future sourced-lib port adds one reviewed
   row. Both reviewers say yes. Markus asks for the `case`-coverage test, and
   Alexey asks for the row to land in an additive, mutant-tested commit before
   its deletion commit. Both are adopted.
5. **Q5: history pointers.** Historical line pointers, port headers and dated
   records keep the old names, while live instructions and executable examples
   move to `.mts`. Both reviewers say yes.

**Risk.** C is the part of the gate that guards against self-authorization.
Slice 1's mutants are the evidence that it holds.

**Not verified:**
- how `gate-ci-parity` and `manifest` react to the `security.yml` edit;
- which of `blueprint-port.release`'s 56 lines are history references;
- whether the pre-TASK-081 shell CLI's own retirement prompt matches Alexey's
  sequence exactly. I took that sequence from his review and did not rerun it.
- the derived projects on any other machine.
