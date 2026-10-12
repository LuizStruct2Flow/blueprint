# PLAN — TASK-092: port `scripts/lib/state-dir.sh` to TypeScript

**Status:** reviewed by Christian (Claude) and Alexey (Codex), both APPROVE WITH
CHANGES; the changes are folded in (§7). No port is part of
this document. Serves TASK-091: the client name's last tree occurrence is one
comment line in this file (`scripts/lib/state-dir.sh:16`; a case-insensitive
`git grep` for the name hits nothing else), and the shell-inventory gate refuses any edit to a
legacy shell file short of a whole-file port. Founder ruling 2026-10-12: port.

## 1. Cascade verdict — the premise is REFUTED, one file is ported

The brief's unverified reading was: the file sets shell variables at source
time, the reference-only edit covers only sourced FUNCTIONS, so every shell
caller must be ported, cascading. **Reading the file refutes the premise:**
`state-dir.sh` sets nothing at source time. It defines seven functions
(`bp_state_root`, `agent_state_dir`, `agent_state_dir_for`,
`agent_signal_file`, `agent_signal_file_for`, `agent_signal_journal`,
`agent_signal_journal_for`), each a pure path derivation that prints one path
to stdout. Every caller obtains values by command substitution —
`BP_STATE_ROOT="$(bp_state_root)" || exit 9` — and R4 covers exactly that:
`fn` → `ENV node "PFX/scripts/lib/state-dir.mts" sub`, anywhere on a
non-comment line, `$(...)` included (dod-gate's row is the shipped precedent;
`.githooks/pre-push-project:447-461` is a legacy caller repointed this way and
passing the gate today).

**The smallest port set is one file: `scripts/lib/state-dir.sh` itself.** No
shell caller is ported. The cascade is:

- 8 shell callers repointed by reference-only edits — 7 under today's checker,
  1 (`scripts/lib/pipeline.sh`) after a small reviewed checker widening
  (slice 2, item 2);
- 3 more legacy shell files that only MENTION the old path in comments
  (`scripts/lib/feed.sh`, `scripts/lib/roster.sh`, `scripts/new-project.sh`),
  whose mentions are repointed in the same commit (R1) — measured in review:
  left untouched, the checker reports all three `CHANGED` once the lib is gone;
- 5 `.mts` files that reach the lib across a process boundary and 3 `.mts`
  files embedding a wake-command shell snippet that sources it — all free
  edits, the inventory gate does not judge `.mts`;
- **Nothing in the closed exempt list sources it** — verified by
  `git grep "state-dir.sh"`: zero hits in `install-toolchain.sh`,
  `lib/signals.sh`, `lib/watcher-lock.sh`, `no-chain-guard.sh`,
  `run-ts-suites.sh`. No `.githooks/` file references it either. The exempt
  list is untouched.

## 2. Dependency list (evidence: `git grep -n "state-dir.sh" -- scripts tests .githooks .github`)

### Shell callers (all `legacy` in `scripts/shell-inventory.json`)

| Caller | Takes | Evidence |
|---|---|---|
| `scripts/agent-activity.sh` (792 ln) | source L76, `bp_state_root` L77, `agent_signal_file` L81, `agent_state_dir` L99 | prefix `$repo_root/` |
| `scripts/claude-agents.sh` (68 ln) | source L21, `bp_state_root` L22 | prefix `$root/`, shellcheck directive L20 |
| `scripts/lib/pipeline.sh` (562 ln) | conditional source L64-67, `bp_state_root` L67 | prefix `$_PIPE_LIB/` — **not R3-shaped, see §4.2** |
| `scripts/session-resume.sh` (439 ln) | source L91, `bp_state_root` L92, `agent_signal_file_for` L137 | prefix `$_bp_root/` |
| `scripts/signal-set.sh` (302 ln) | source L56, `bp_state_root` L67, `agent_signal_file` L68 | prefix `$_bp_root/` |
| `scripts/start-copilot-signal-watch.sh` (52 ln) | source L11, `bp_state_root` L12, `agent_signal_file` L16 | prefix `$repo_root/`, `set -euo pipefail` |
| `scripts/team-kickoff.sh` (121 ln) | source L31, `bp_state_root` L32, `agent_signal_file` L36 | prefix `$repo_root/`, `set -u` |
| `scripts/watch-ci.sh` (104 ln) | source L45, `bp_state_root` L46 (`\|\| exit 0`) | prefix `$repo_root/` |

No caller uses `agent_state_dir_for`, `agent_signal_journal` or
`agent_signal_journal_for` in production (grep-verified); those exist for
tests and the `AGENT_SIGNAL.md` Monitor recipe (`agent_signal_file_for`,
AGENT_SIGNAL.md:365-370).

### `.mts` consumers (process boundary today; repoint is a free edit)

| File | Use | Evidence |
|---|---|---|
| `scripts/signal-watch.mts` | `stateDirFn('bp_state_root'/'agent_state_dir'/'agent_signal_file')` via `sh -c '. "$1"; fn'` | L121, L190-201 |
| `scripts/rotation.mts` | `stateDir()` spawns the same | L74, L86-94 |
| `scripts/log-activity.mts` | resolves `BP_STATE_ROOT` once via `sh -c` | L40, L150-156 |
| `scripts/lib/dod-gate.mts` | `stageSignal()` builds a sh script sourcing the lib, `existsSync` guard | L554-566 |
| `scripts/blueprint.mts` | `bpProjectRoot()` bridge, `existsSync` guard + fallback | L1654-1665 |
| `scripts/start-codex-signal-watch.mts` | wake-command snippet sources + calls both | L99-101 |
| `scripts/start-gemini-signal-watch.mts` | same | L144-146 |
| `scripts/start-kimi-signal-watch.mts` | same | L93-95 |
| `scripts/lib/contamination.mts` | names the old path in a comment and in a BLOCK message | L57, L324 |
| `scripts/lib/scratch-tmpdir.mts` | names it in a comment | L13 |

### Tests and fixtures

- **Drive the lib as shell:** `tests/state-dir` (HELPER,
  state-dir.spec.ts:111; consumer scan asserts each consumer's source names
  `lib/state-dir.sh`, state-dir.ts:342-346; #7's ≥4-consumer floor),
  `tests/state-root` (sources it in `sh -c` snippets, state-root.spec.ts:87-90;
  lib sweep :345), `tests/watcher-liveness` (:555).
- **Copy it into fixtures:** `tests/baton-durability` (copy :149; replaces it
  with a POINTER_SHIM :101-219), `tests/pipeline` (:113), `tests/dod-gate`
  (:163), `tests/codex-model-retry` (:134), `tests/scratch-tmpdir-dispatch`
  (:85), `tests/mic-recovery` (:106), `tests/roster-models` (:83,99),
  `tests/live-state-canary` (:65).
- **Name it as a sample path** (fixture-local, likely inert):
  `tests/a2bp-build`, `tests/a2bp-inputs`.
- **Prose only:** `tests/forbidden-idiom` (:30), `tests/harness/*`,
  `tests/helpers/feed-fixture.ts`, `tests/signal-dispatch.release`,
  `tests/bootstrap-gate.release`, `tests/blueprint-port/historical/
  contamination.sh` (shell, but not inventory-gated — no row, free to edit).
- **Docs:** `AGENT_SIGNAL.md:365` (Monitor recipe sources it live — must
  change), `docs/doing/BACKLOG.md` rows, dated records (keep the old path per
  AGENTS.md). `scripts/new-project.sh`, `scripts/lib/feed.sh`,
  `scripts/lib/roster.sh` mention it in COMMENTS only; they are legacy, and
  slice 3 swaps the name in those comments (R1). They cannot stay
  byte-identical: a BASE-form mention of a ported path fails the comparison.

## 3. Design of `scripts/lib/state-dir.mts`

One file, `node:` builtins only, entry-point guard so it can be imported in
tests without running `main()` (repo pattern, e.g. shell-inventory-check.mts).

**CLI — one subcommand per function**, kebab-case, for shell callers and the
three wake snippets: `bp-state-root`, `agent-state-dir`,
`agent-state-dir-for <dir>`, `agent-signal-file`, `agent-signal-file-for
<dir>`, `agent-signal-journal`, `agent-signal-journal-for <dir>`. Contract
byte-compatible with the shell: one path on stdout, the same diagnostics on
stderr, exit 0 / 2 (usage: wrong arity — including the no-argument refusal) /
9 (resolution failure: `BP_CODE_ROOT` unset, walk found no terminator).
The walk keeps the filesystem test (`.blueprint-root` / `.blueprint-source` /
`.git` with `-e` semantics — a worktree's `.git` FILE included), the
`BP_STATE_ROOT_CEILING` contract, and physical resolution (`cd -P` →
`realpathSync`; differential covers symlinked trees). Empty string is treated
as unset for all five env inputs — verified against every shell test site
(`-z`/`-n`), and the differential pins the matrix.

**Env passthrough prefix** (the `env` field of the new `SOURCED_LIBS` row —
one fixed text in front of every `node` call, `set -u`-safe):

```
BP_CODE_ROOT="${BP_CODE_ROOT:-}" BP_STATE_ROOT="${BP_STATE_ROOT:-}" AGENT_STATE_HOME="${AGENT_STATE_HOME:-}" AGENT_SIGNAL_FILE="${AGENT_SIGNAL_FILE:-}" BP_STATE_ROOT_CEILING="${BP_STATE_ROOT_CEILING:-}" 
```

These variables are unexported shell locals in callers today; the prefix is
what carries them into the child. (Today `agent_state_dir` reads the
unexported `BP_STATE_ROOT` directly because it runs in-process.)

**`.mts` consumers keep the process boundary.** Swap `sh -c '. "$1"; fn'` →
`node <lib> <sub>` with the same env maps, the same `existsSync` guards and
fallbacks (`blueprint.mts` and `dod-gate.mts` ship and can run against a
partial pull — the guard is load-bearing), the same inherited stderr. Not a
static import: a managed `.mts` that refuses to start when its sibling is
absent turns a partial pull into a CLI that cannot self-heal. The wake
snippets become `BP_STATE_ROOT="$(<env prefix> node
"$ROOT/scripts/lib/state-dir.mts" bp-state-root)" || exit 9` etc. The prefix is
required there too: the launchers export neither `BP_CODE_ROOT` nor
`BP_STATE_ROOT`, so without it every dispatch exits 9 (review finding). — still resolved per dispatch (BUG-020's
"not baked in" design is preserved).

**Docblock:** the incident record (A-09, BUG-020, BUG-019, TASK-021, the
`BP_CODE_ROOT`-required rationale) is ported as TS comments, except that the
one client-identifying line (`:16`) says "the peer stream" per TASK-091's
convention. Line `:133` names linkedin-watcher-agent, the founder's own
project, and is kept. The name leaves the tree when slice 3 deletes the `.sh`.

## 4. Slices

Every slice lands on `main` as its own commit(s); no PRODUCTION caller reaches
the new code until slice 3 (dark code, no branches) — tests reach it from
slice 2. Port method proofs per slice: **full
suite**, **old-vs-new differential**, **mutant** (PLAN-TASK-067 §"The port
method" rule 5). Owner must be a provider that can run fixture-git suites (rule
6 — not Codex).

### Slice 1 — test preparation (tests only; green against the UNPORTED shell)

Port method rule 1. One commit (two if review wants fixtures and inventory
apart).

- Fixture copy lists become migration-aware: when `scripts/lib/state-dir.mts`
  exists, copy it beside (later: instead of) the `.sh` — `baton-durability`
  (the POINTER_SHIM gains a `.mts` form exporting the same four functions plus
  a CLI `main()`, still driven by `BD_POINTER`), `pipeline`, `dod-gate`,
  `codex-model-retry`, `scratch-tmpdir-dispatch`, `mic-recovery`,
  `roster-models`, `live-state-canary`, `watcher-liveness`.
- `tests/state-dir`: the consumer scan resolves the implementation — a
  consumer naming `lib/state-dir.mts` satisfies the one-derivation property
  once the `.mts` exists; #7's ≥4-consumer floor stays (TASK-015's vacuity
  control).
- `tests/state-root`: snippets drive the CLI when the `.mts` exists; the :345
  lib sweep skips `state-dir.mts` alongside `state-dir.sh`.
- Proof: full suite against the unported tree — nothing weakened.

### Slice 2 — checker row + widening, and the dark port

One commit: `scripts/lib/state-dir.mts` (whole port, dark code — only tests
reach it), plus in `scripts/shell-inventory-check.mts`:

1. **`SOURCED_LIBS` row** for `state-dir.sh` → `state-dir.mts` with the §3 env
   prefix and the seven `fn → sub` pairs. Inert until the `.sh` is deleted
   (the row applies only when the lib is in D), satisfying "one reviewed,
   mutant-tested table row landed before the commit that deletes its shell
   file".
2. **Widening for `pipeline.sh`'s shape:** its source
   line is `. "$_PIPE_LIB/state-dir.sh"` — `$_PIPE_LIB` already ends in
   `scripts/lib`, so neither R3 (requires the literal `scripts/lib/` in the
   path) nor R1 (path token likewise; basename token blocked by the preceding
   `/`) recognises it, and a repoint is REFUSED today. Widen, keyed to
   table-lib stems only: R3 accepts `. "$VAR/<stem>.sh"` for a stem in
   `SOURCED_LIBS` (prefix captured for R4 as today), and R1 accepts
   `"$VAR/<stem>.sh"` as a token for table libs, only for the variable BASE's
   own R3 line used. R4 gains the matching HEAD form `node "$VAR/<stem>.mts"
   sub` with that same variable: today's R4 appends the full
   `scripts/lib/<stem>.mts` to the prefix, which for `$_PIPE_LIB/` names a path
   that does not exist, and `pipeline.sh:67` would swallow the failure
   (review finding). Mutants: a different variable in HEAD refused; same shape with a
   non-table stem refused; a non-source `$VAR/stem.sh` reference that swaps
   nothing else refused; the dod-gate/gate rows' existing corpus unchanged.
   The alternative — porting `pipeline.sh` — is rejected: 562 lines sourced by
   two legacy hooks, i.e. BUG-147's Option D boundary the founder already
   refused, for a feed-path default.
- `tests/shell-inventory`: the cases for both checker changes, and for the
  Markus-Q4 rule (every `sub` in the table is a `case` in its `.mts`). They
  land here, with the change they test; in slice 1 they would be red.
- Differential corpus, old shell vs new CLI, over: each terminator kind;
  ceiling unset/set/misplaced; symlinked root and nested repo;
  `AGENT_STATE_HOME` / `AGENT_SIGNAL_FILE` set, empty, unset; arity 0/1/2 per
  function; `BP_CODE_ROOT` unset/empty; cwd ≠ root; decoy `GIT_DIR`.
- Mutant: the port ignores `BP_STATE_ROOT_CEILING` → `tests/state-root` #A6
  turns red.
- Proof: full suite; differential clean; mutant red as named.

### Slice 3 — switch-over, ONE commit

Deletes `scripts/lib/state-dir.sh` and its `shell-inventory.json` legacy row
(same commit, per `checkRemovedRows`), and everything that named the old path:

- The 8 shell callers, reference-only edits: drop the source line (R3, with
  the slice-2 widening for `pipeline.sh`), swap each function call for
  `<env> node "PFX/scripts/lib/state-dir.mts" <sub>` (R4), swap comment tokens
  `.sh` → `.mts` (R1 — required: a BASE-form mention left in HEAD fails the
  comparison).
- The 3 comment-only legacy files (`feed.sh`, `roster.sh`, `new-project.sh`):
  the name swapped in their comments, nothing else.
- The 5 `.mts` bridges and 3 wake snippets per §3, and the mentions in
  `contamination.mts` (its BLOCK message included) and `scratch-tmpdir.mts`.
- `AGENT_SIGNAL.md` §"Reactivity" recipe: the source line +
  `agent_signal_file_for` become one `node scripts/lib/state-dir.mts
  agent-signal-file-for "$PWD"` call (env prefix per §3).
- Test-suite sweeps that name the old path (`tests/state-dir` scan text,
  fixture copy lists now copying only the `.mts`, a2bp sample paths if they
  assert the managed set).
- Proofs: full non-release suite; commit first, then release suites
  (bootstrap-gate materialises committed HEAD); caller-level differential —
  each repointed caller's resolved `BP_STATE_ROOT` / baton / state-dir before
  and after, over the fixture matrix; named mutant: `agent-signal-file` stops
  honouring `AGENT_SIGNAL_FILE` → `tests/state-root` / `tests/signal-set` red.

### Slice 4 — lifecycle (docs only)

`docs/doing/BACKLOG.md` rows per DoD §1 (TASK-092 → waiting-acceptance),
HANDOVER, this plan moves with the item. TASK-091's remaining half (history
rewrite) stays the founder's decision, out of scope.

## 5. Risks and known limits

1. **Long-running watchers hold the old wake snippet in memory.** The snippet
   text lives in the watcher process (that is BUG-020's deliberate design),
   so a watcher started before slice 3 lands sources a deleted file on its
   next dispatch and the dispatch dies at exit 9. Trigger: any watcher older
   than the pull. Mitigation: restart watchers after the pull; slice 4's
   handover says so, and the Orchestrator restarts this checkout's three
   watchers right after slice 3 lands.
2. **The `pipeline.sh` widening blesses more than intended.** Trigger: a later
   push sources `$VAR/gate.sh`-shaped text expecting refusal. Mitigation: the
   form is keyed to table stems and reviewed with the slice-2 mutants.
3. **Empty-vs-unset drift in the env passthrough.** Trigger: a harness
   exporting `AGENT_SIGNAL_FILE=` empty, which the shell treated as unset.
   The differential pins empty==unset for all five vars.
4. **Node startup per call.** ~37 ms measured on the BUG-147 baseline;
   signal-set pays 2 per flip, the gate 1 via `pipeline.sh`, the feed daemon 3
   at start — ≤ ~0.15 s against a 142 s gate. Settled cost; record the local
   measurement in the slice-3 commit body.
5. **Partial pull in a derived project.** New managed `.mts` without
   `state-dir.mts`: the `existsSync` guards keep today's fallback. Old
   un-repointed callers beside a deleted `.sh`: `.` of a missing file fails
   loudly. The silent inverse (both present, callers stale) remains
   `blueprint drift`'s job — same split as BUG-147.
6. **Renaming trap, forward-looking:** once callers are repointed at
   `state-dir.mts`, renaming or folding that file makes every repointed
   caller `CHANGED` on every push until ported (AGENTS.md). Do not rename it.

## 6. Rough size per slice

| Slice | Files | Lines (±) |
|---|---|---|
| 1 — test prep | ~10 test files | 150–250 |
| 2 — checker + dark port | `state-dir.mts` ~300 (from 287 shell, ~95 code), checker ~80, inventory tests ~120 | ~500 |
| 3 — switch-over | ~20: 8 shell repoints (~35 ln), 8 `.mts` (~60 ln), `AGENT_SIGNAL.md` ~6, suite sweeps | ~150 |
| 4 — lifecycle | 3 docs | ~20 |

## 7. Review synthesis (2026-10-12)

Christian (Claude) and Alexey (Codex) reviewed independently and agree: one
file is the right port set, and the plan needed these changes, all folded in
above. Each has a real trigger.

| Finding | Trigger | Where it went |
|---|---|---|
| Three legacy files mention the old path in comments and were left untouched | Measured in a scratch clone: the checker reports them `CHANGED` at switch-over, so the push is refused | §1, §2, slice 3 |
| The wake snippets called the new CLI without the env prefix | Every dispatch would exit 9 | §3 |
| The `pipeline.sh` widening accepted the edit but produced a path that does not exist | The gate's state root would silently fall back | slice 2, item 2 |
| Two `.mts` files naming the old path were missing | A BLOCK message would point at a deleted file | §2, slice 3 |
| The widening's test cases sat in slice 1 | They are red until slice 2's change exists | slices 1 and 2 |

Not checked by either reviewer: the full suite, and §2's test list.

### Slice 2 four-eyes review (Andreas, Codex, 2026-10-12)

Reviewed by reading. Confirmed: the real `pipeline.sh` rewrite slice 3 makes is
accepted and works at runtime; storing directory prefixes changes nothing for
the existing `gate` and `dod-gate` rows; the `export-ignore` is right; the
`tests/state-root` wrappers are stronger, not weaker. Two findings, both
judged known limits with no action (DoD §1b rule 4: no real trigger):

- **A caller that reassigns its root variable between the source line and the
  call** would source from the old value in BASE and run the `.mts` from the
  new value in HEAD, and the checker accepts it. No legacy caller does this,
  and the usual `$VAR/scripts/lib/` form has had the same property since
  TASK-088. Re-open if a legacy shell file ever reassigns such a variable.
- **A path value ending in newlines** (`AGENT_STATE_HOME=$'/x\n\n'`): the shell
  strips every trailing newline inside its nested command substitution, the
  port strips one. Nothing sets such a value. Re-open if a state path is ever
  built from unsanitised command output.

### Slice 3 four-eyes review (Andreas, Codex, 2026-10-12)

Reviewed by reading, and dispatched by a watcher already running the
switched-over code: the dispatch was normal (persona and model line, prompt,
state directory), which is the real-dispatch proof for the wake snippets and
for `signal-set.sh`. Clean on the production callers, the template escaping,
the `pipeline.sh` fallbacks, the narrowed tests and the remaining references.
One finding, fixed: the `AGENT_SIGNAL.md` monitor recipe called the CLI without
passing `AGENT_STATE_HOME` and `AGENT_SIGNAL_FILE`, so a value set but not
exported in that shell was no longer honoured.

The mutant for this slice (the CLI ignoring `AGENT_SIGNAL_FILE`) turned
`tests/baton-durability` #4 and #5 red, not `tests/state-root` or
`tests/signal-set` as slice 3 predicted. Known limit, no action: the property
is caught, by a different suite than expected.
