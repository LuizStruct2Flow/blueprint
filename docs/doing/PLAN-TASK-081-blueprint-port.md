# PLAN — TASK-081: port `scripts/blueprint` whole to TypeScript

**Status:** design only, for review by all three providers. No code is part of
this document. Written from a full read of `scripts/blueprint` at `8385dd1`
(2,257 lines) and of the suites that run or read it.

**Why now:** BUG-152's fix ports `scripts/lib/gate.sh` to a sourced adapter
plus `scripts/lib/gate.mts`. The CLI sources `gate.sh`, and `_bp_cli_libs`
(`scripts/blueprint:1445-1452`) brings a single-file `pull scripts/blueprint`
only the libs it names as `NAME.sh`. Teaching it about `gate.mts` is a change to
a legacy shell file, so CLAUDE.md §"Shell to TypeScript" makes this port first.
Method: [`../done/PLAN-TASK-067-shell-to-typescript.md`](../done/PLAN-TASK-067-shell-to-typescript.md)
§"The port method".

## 1. The boundary

**The FILE ports whole; the WORK is sliced; `main` never runs half of it.**

| Where | What is there |
|---|---|
| `main`, slice 0 | Test preparation only (§8). No `scripts/` change except the shim-helper export. Green against the unported shell. |
| branch `task-081-blueprint-port`, slices 1-4 | `scripts/blueprint.mts` grows one subcommand family per commit, each with its own differential rows and unit tests. `scripts/blueprint` is untouched, so every suite on the branch still runs the shell. |
| `main`, slice 5 | ONE port commit: the branch squashed, plus the shim, the inventory row, the doc lines. |
| `main`, slice 6 | The `_bp_cli_libs` change BUG-152 needs, as its own reproducer and fix. |

**Between slices `main` is exactly today's `main`.** `scripts/blueprint.mts`
does not exist there until the port commit. It cannot land earlier as dead
code: `scripts/` ships (`git archive`), so every derived project's next
`blueprint pull` would install a half-built `.mts` and `drift` would report it.

**The branch cannot conflict on its subject.** `scripts/blueprint` is a legacy
row in `scripts/shell-inventory.json`; nothing else may change it until the
port. Libs can move on `main`, so the branch rebases before each slice's review.

**Squash, not fast-forward.** CLAUDE.md: "the migration is its own commit".
The slice commits stay on the branch ref for provenance. Reviews run per slice
(smaller units, design drift caught early), then once more on the squashed diff
before push, which is the Codex four-eyes the backlog row requires.

**Owner:** a provider that can run the fixture-git suites (port method rule 6).
Codex reviews; it does not implement.

## 2. Design rules for `scripts/blueprint.mts`

1. **One file, no local imports.** `node:` built-ins only (the gate's
   no-bare-specifiers rule). A single file keeps the CLI's closure at "shim +
   `.mts` + the libs it names" (§7). The shell comments that explain a decision
   travel with the code they explain.
2. **Exports for unit tests; `main()` runs only as the entry point.** This also
   pays the TASK-067 debt: `scripts/shell-inventory-check.mts` gets the same
   guard, so `tests/helpers/shim.ts` imports the helpers instead of copying them.
3. **Port the control flow, keep the tools.** Every external program the shell
   runs, the port runs, with the same argv: `git`, `tar`, `awk`, `jq`, `diff`,
   `cmp`, `sed`, `sort`, `comm`, `mktemp`, `mkdir`, `cp`, `cat`, `chmod`, `mv`,
   `rm`, `date`, `timeout`, `env`, `sh`, `gh`. Bash builtins and plumbing
   become JS: `echo`, `printf`, `test`, `read`, arrays, arithmetic, parameter
   expansion, `: >`. A filter over a string the CLI already holds may become JS
   only when it is a fixed-string or line operation (`grep -q` on a literal,
   `cut -f`, `head -n`, `sed 's/^/  /'`). Anything regex- or locale-dependent
   stays external.
   *Why:* port method rule 2. The suites observe these commands through PATH
   seams (`mktemp`, `diff`, `mkdir -p docs`, `cat`, `chmod`, `env`, `ssh`), and
   keeping them makes awk ERE classes, `LC_ALL=C sort` and jq formatting
   identical by construction rather than by translation. Moving any of them
   in-process is a later item with its own tests (open question B).
4. **`set -euo pipefail` becomes one spawn helper.** `run()` rejects on a
   non-zero status unless the call site says why not (the shell's `|| true` or
   `if`). An uncaught rejection exits with the failing command's status and
   prints nothing of its own, as bash does. A signal-terminated child reads as
   `128+n` wherever a status is read. Every capture strips ALL trailing
   newlines, as `$( )` does.
5. **No `spawnSync` after the first signal handler is installed.** A handler
   runs only between event-loop turns, so a synchronous child would hold a
   signal until the whole loop finished. Each `await` is where bash would check
   its traps between commands.
6. **Bash's implicit inputs are explicit:**
   - **Logical `PWD`.** Project name and `project:` lines come from the `PWD`
     the shim's bash exported, never `process.cwd()`, which is physical. From a
     symlinked project directory the two give different names, and the name
     drives substitution. `cmd_files`' `cd "$root"` updates the tracked value.
   - **The CLI's directory** comes from `process.argv[1]` resolved against that
     `PWD`, not `import.meta.dirname`, which Node realpaths.
   - **Colour** from `isatty(1)`. **Prompts** read one line from fd 0 a byte at
     a time, so a later prompt gets its own line, as `read -r` does.
   - **`help`** is a constant holding the header text. `cmd_help` read it from
     `$0`, which is now the shim.
   - **`$$`** is `process.pid`, the same pid, because the shim `exec`s node. So
     `DEST.bp-new.$$` keeps its name.

## 3. The five properties

### P1 — BUG-120: a TERM to the refresh child cannot be lost

**Shell today** (`:707-722`, `:873-885`): cleanup truncates the `go` token
with a builtin, then TERMs `$!`, then `wait`s. The fetch runs only through
`sh -c '[ -s "$1" ] || exit 1; shift; exec "$@"'`.

**Node design:**
- **Launch.** `spawn` (async) of
  `env <UNSET…> sh -c 'exec 2>"$1"; [ -s "$2" ] || exit 1; shift 2; exec "$@"' bp-refresh ERR GO timeout N git … fetch …`.
  `child.pid` is published when `spawn` returns, like `$!`. The refresh child
  execs `env`, then `sh`, then `timeout`, all in one pid, so #20b's identity
  claim holds. **The stderr redirect moves into `sh`, deliberately.** In bash,
  the forked child opened `fetch.err`. In Node the parent would open it, and a
  synchronous open of #20c's FIFO would block the event loop and every signal
  handler. Moving the redirect into `sh` keeps the held window where the suites
  hold it: the child exists, its pid is published, and it has not reached the
  gate. Accepted delta: an `env` failure prints to the terminal rather than to
  `fetch.err`.
- **Cleanup has three parts.**
  1. A synchronous part with no `await`: `truncateSync(GO)`, then
     `process.kill(pid, 'SIGTERM')`. A syscall does not fork, so nothing runs
     between revoking the token and sending the TERM.
  2. An `await` on the child's `exit` event. This is bash's `wait`.
  3. A synchronous tail: `git update-ref -d` and `rm -rf` of the scratch.

  The EXIT path never has a live child: `_bp_fetch_fail` runs only after the
  wait. So it runs parts 1 and 3 only.
- **Freezing the main flow is the Node-specific hazard.** In bash, the handler
  runs to completion and the script never resumes. In Node, the handler's
  `await` and the main flow's `await` both wait on the same child exit. The
  main flow would then resume, read the killed fetch as a failure, and print
  `_bp_fetch_fail` with exit 5. So the handler sets `terminating` first, and
  `run()` never resolves once it is set: it returns a promise that stays
  pending. The cleanup's own spawns bypass `run()`.
- **Dying of the signal:** remove the listeners, then
  `process.kill(process.pid, sig)`. POSIX delivers an unblocked self-signal
  before `kill()` returns, so no later statement runs.
- **The gate stays, although Node may not need it.** libuv's child resets
  signal dispositions before its first exec, so the bash mechanism (a forked
  bash that only records the TERM) should not exist. That is an assumption
  about libuv, so the gate stays. It costs one `sh` exec (open question C).

**Proof:**
- #20, #20b, #20c and #20d run unchanged against the port. Slice 0 widens
  #20c's and #20d's refresh-child predicate from `bash` to `bash|sh`.
- **#20e becomes behavioural (slice 0).** An `env` PATH shim that is the
  refresh child traps TERM. It records whether the token named after
  `bp-refresh` was still non-empty when the TERM arrived, then blocks. Green on
  the shell. Red for revoke-after-TERM, on the shell and on the port.
- A unit test on the exported cleanup, with an injected `kill`, asserts the
  token is empty when `kill` is called and that the synchronous part returns
  no promise.
- Recorded mutants, run on the port:
  - no token written: every fetching case fails closed;
  - gate never checks the token: #20d and the new #20e;
  - handler without the main-flow freeze: #20 prints exit 5, not died-of-signal;
  - `spawnSync` for the compare: #21 reports.
- **The libuv check:** the no-gate mutant on the port. If #20c and #20d stay
  green 50/50 pinned (`taskset -c 0`), that is evidence the window closed. It
  is not a reason to remove the gate.
- **BUG-146:** the port changes the process shape #20d exercises. If #20d stops
  hanging in CI afterwards, that is evidence for the row and does not close it.

### P2 — `_bp_shielded_write`: bytes, exec bit and rename finish together

**Shell today** (`:746-760`): a subshell that ignores INT and TERM does
`rm -f tmp`, `cp -p DEST tmp`, `cat SRC > tmp`, sets the exec bit, then
`mv -f tmp DEST`. The parent's trap runs after the subshell returns.

**Node design:** `shield(async () => …)` is a critical section.
- While a shield is open, the signal handler only records the signal. When the
  shield closes, a recorded signal takes the terminating path. Nothing after
  the write starts, which is what bash's deferred trap gave.
- Each step inside is spawned as `sh -c 'trap "" INT TERM; exec "$@"' bp-shield
  <cmd>`, so a group signal, as a terminal's Ctrl-C sends, cannot kill it. A
  signal ignored at exec stays ignored in the program exec'd.
- The steps are those commands in that order: `rm -f`, `cp -p`, `cat` with
  stdout on an fd the parent opened for **tmp**, `chmod ±x`, `mv -f`. The
  parent never opens DEST for writing, so #23b's hazard (DEST truncated before
  the ignore) has no Node equivalent. On failure the shield removes tmp and
  returns false. The config write for `bootstrap_sha` uses the same shield.

**Proof:**
- #23 and #23c run unchanged: their `cat` and `chmod` seams still fire.
- **#23b becomes behavioural (slice 0).** A `cp` seam blocks on
  `cp -p <dest> <dest>.bp-new.*`. A group INT or TERM there leaves the file
  complete, and the run dies of the signal with nothing written later. Green on
  the shell. Red if the ignore follows the first write step.
- **managed-references #5 gains an inode assertion (slice 0).** The pulled
  file's inode changes. Under the port, the running process no longer re-reads
  `scripts/blueprint`, so #5's current witness goes vacuous. The inode is what
  still pins "rename, never rewrite in place".
- Node mutant: the handler not deferred inside a shield leaves the rename
  undone, and #23 goes red.

### P3 — BUG-113: one prospective-pull result

**Shell today:** `bp_prospective_pull`/`bp_prospective_for` (`:362-409`,
`:588-607`) set the globals `BP_PP_MODE`, `BP_PP_WHY` and `BP_PP_DETAIL`,
"never inside `$( )`". Four sites read them: drift (`:1394`), selection
(`:1572`), same-check and preview (`:1639`), and the write through `pull_file`
(`:612`).

**Node design:** `prospectiveFor(path): Promise<Prospective>` returns
`{mode, why, detail, out}` as a value. `pullFile(path, p: Prospective)` takes
that value, so the type system rules out a write that was not computed by the
one function. The subshell hazard disappears because there are no globals.
Settings go through the same function (P4).

**Proof:**
- `sync-by-address` #9b exercises all four sites through the remote.
- The BUG-113 cases in `marker-merge` and the `permission-policy` suite.
- One mutant per call site, each replacing the prospective result with a
  whole-file comparison. Each must redden a named case. A site whose mutant
  reddens nothing gets a case before the port commit.

### P4 — TASK-042: the settings merge

**Node design:** jq stays jq.
- `BP_SETTINGS_SHAPE`, `_MERGE`, `_EXTRA` and `_UNSUPPORTED`, and the
  one-object test (`:428-494`), move verbatim into string constants. They are
  invoked with the same flags: `jq -e -s`, `jq -s`, `jq -r -s`.
- No `JSON.parse` anywhere on this path. The landed bytes are jq's output, so
  indentation, number and unicode formatting stay jq's by construction.
- The stream-versus-object distinction stays jq's `-s` semantics. Re-deriving
  it in JS is exactly how the Alexey finding-4 class returns.

**Proof:** the `permission-policy` suite, plus differential rows:
- a layer present, which merges;
- a bad shape;
- a stream `{}{}`, an array, `null` and a number, on both sides;
- a legacy `settings.json` with extra rules, which produces the proposal text;
- unsupported keys;
- jq missing from PATH.

### P5 — `a2bp`: rebuild once, stage and scan, exit codes 3/4/5/6

**Node design:** `a2bp` is orchestration over the six request libs, so it
ports as straight-line code over bridge calls (§4).
- All six libs are checked and required before argument parsing, as today.
- The `BP_RC_*` codes are read from `request-file.sh` at run time, not copied.
- The two-pass rebuild keeps its "once": a second move fails with 5.
- Staging keeps `contamination_stage`'s rc 3 versus other failures.
- Scan lines split on the first three `|`, as `IFS='|' read -r ln kind reason
  text` does, so `text` keeps any later pipes.
- Every BUG-011 return is kept: gh absent → 5, `pr create` failing → 5,
  success without a PR URL → 5, an existing open or closed PR → 3, filed → 3,
  blocked → 4, nothing to request → 6, `--dry-run` → 0.

**Kept exactly, although it is wrong:**
- BUG-116: the handler cleans up and resumes (`:1886`). It stays BUG-116's
  fix.
- Two quirks found while reading, to be filed after the port:
  - the second pass's `kept=$(…) || drop_rc=$?` (`:2051`) neither resets
    `drop_rc` nor refuses a non-2 failure;
  - its `key=$(…)` (`:2058`) has no `|| return`, so under `set -e` a failure
    exits with that command's status instead of 5.

**Proof:** `a2bp-build`, `-inputs`, `-request`, `-contamination`, `-pr-filing`,
and `a2bp-e2e` (release tier; it holds the remote-moved case), plus one
differential row for each exit code above.

## 4. Libraries: all stay shell

The CLI uses eleven: `placeholders`, `signals`, `request`, `request-config`,
`request-build`, `request-inputs`, `request-file`, `contamination`,
`staleness`, `state-dir` and `gate` (each `.sh`). Every one has shell callers
(`new-project.sh`, `.githooks/*`, `install-toolchain.sh`, the CI workflow), so
none ports here.

- **The bridge.** One helper: `bash -c '. "$1"; <snippet>' _ LIB ARGS…`, bash
  because the request libs use arrays. It returns stdout and status, and
  inherits stderr. This is port method rule 3, as `log-activity.mts` does it.
- **`bp_config_load`** prints `%q` assignments that only a shell can read. The
  snippet evals them and prints the four values NUL-separated.
- **Point-of-use loading stays.** A missing lib fails when it is needed, never
  at load time. `drift` still arms the gate first (A-22), and the
  `BLUEPRINT_ROOT` recovery still works without the network libs (#12).
- **`signals.sh` is the exception.** Traps are process-local, so the port
  implements the same rule natively (§3 P1): clean up, clear, die of the same
  signal. `signals.sh` keeps its other caller, `install-toolchain.sh`, and it
  is exempt in the inventory, so the port commit corrects its "Callers" header.
- **Performance.** A bridge call adds one bash process where the shell called a
  function in-process: per file for substitution, and per commit in
  `_bp_retire`. Drift wall time for old versus new is measured on a 200-file
  fixture and recorded in the commit body. It is not gated.

## 5. The differential harness

`tests/blueprint-port/blueprint-port.release.spec.ts`, built from slice 1
onward.
- **OLD** is `bash scripts/blueprint` on the branch. After the port commit, it
  is `scripts/blueprint` at the parent of the commit that made it the shim,
  derived from history as `managed-references` #3 does.
- **NEW** is `node scripts/blueprint.mts`, and the shim after the port.
- The suite is deleted when the founder accepts TASK-081. Its results live in
  the port commit body.

**Determinism:**
- **Same path, twice.** Each row builds its fixture from one recipe at one
  absolute path, runs OLD, snapshots, deletes, rebuilds, and runs NEW. Paths,
  project names and hash-derived names (the a2bp request key includes the
  remote path) coincide without normalisation. Commits pin
  `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` and identity, so SHAs match.
- **No network.**
  - Remotes are local paths.
  - A hung or unreachable remote is `ssh://git@127.0.0.1/…` behind an `ssh`
    PATH shim (the sync-by-address technique). The timeout row uses
    `BP_FETCH_TIMEOUT=1`.
  - `gh` is a shim that replays canned output per row and logs its argv; the
    log is compared.
  - `date` is a shim with a fixed instant.
  - HOME, `XDG_CACHE_HOME` and TMPDIR are per fixture, under the harness's
    scrubbed environment.
- **TTY.** Rows that prompt run under `script -qfec` with the answers on
  stdin. Every other row gets a non-TTY stdin, which covers each refusal.
- **Compared:** exit status or died-of-signal; stdout and stderr bytes; the
  project tree (path, bytes, mode); `.blueprint-source`; the cache's refs; that
  no scratch is left; for `a2bp`, the refs pushed to the bare remote and the
  `gh` argv log.
- **The only normalisations, each named in the spec:** random mktemp suffixes
  (`blueprint-sync.XXXXXXXX`, `tmp.XXXXXXXXXX`, the a2bp scratch), and the
  timestamps in `diff -u` headers. Everything else must be byte-equal.

**The matrix, about 90 rows:**

| Subcommand | Rows |
|---|---|
| dispatch | no args; `help`, `--help`, `-h`; an unknown subcommand; `push` |
| `files`/`list` | in the blueprint; in a derived project; under the `BLUEPRINT_ROOT` override |
| `drift` | in the blueprint, with staleness current/behind/ahead/diverged/unknown, the fast-forward prompt y/N and `BP_NO_PROMPT`; unregistered (three or more markers); not a project; `gate.sh` missing; v1 config (4); placeholder remote (4); unreachable (5); hung (5); missing branch (5); missing release branch (5); no `timeout` (5); scratch uncreatable (5); damaged cache (5); `bootstrap_sha` not in history; clean; drifted, new, missing-in-blueprint and refused (bad markers, `none:ok`, each settings refusal); override, and override not a directory; the leftover `blueprint_source` warning; an exported `GIT_DIR`; a symlinked project directory; a project name holding `&` and `\` |
| `pull` | nothing to pull, with retirement y, non-TTY and q; full `--yes`; partial; non-TTY without `--yes` (7); prompts y/N/q; refused (4); backup-copy with `.bp-bak`; merge; new file; exec bit +x and -x; every settings case from P4; `pull scripts/blueprint` (libs first, CLI last, a refused lib skips the CLI); a held file leaves `bootstrap_sha`; an unknown option (dies after the fetch, as today) |
| `a2bp` | the codes in P5; no files; `--force`; an unknown option; a missing lib; staging rc 3; GNU diff missing; an unshipped path; the remote moving once, then twice |
| `prs` | gh absent; gh erroring (INCOMPLETE); empty; a draft; orphan branches |

Signals are not differential rows. They are the job of `sync-by-address`
#20-#23c, which run against the port.

## 6. Accepted deviations

Each is named in the port commit body.
1. **The refresh's stderr redirect moves into `sh`** (P1). An `env` failure
   reaches the terminal.
2. **A signal before the terminating handler is installed**, which is only
   drift's gate arming: Node dies at once. Bash waits for its foreground child
   first. No suite or row observes it.
3. **`signals.sh`'s header** now names one caller.
4. **Node is required on the drift path** (open question A).

## 7. The CLI's closure, before and after

`_bp_cli_libs` scans the PULLED `scripts/blueprint` for `NAME.sh` tokens that
exist in `scripts/lib/`. The two-line shim names none. So the port commit
itself must teach the closure to follow a valid shim. Otherwise the port
reddens `managed-references` #3 and strands every derived project that pulls
`scripts/blueprint` alone.

- **In the port commit (slice 5).** When the pulled `scripts/blueprint` is the
  exact shim, the closure adds `scripts/blueprint.mts` as a need and scans its
  non-comment lines for `NAME.sh`. The pull order is libs, then `.mts`, then
  shim, and a need that is not pulled holds the shim back. That is today's
  rule, with the `.mts` joining the needs.
  - Naming `scripts/blueprint.mts` alone gets the same closure, so the pair is
    never split.
  - For a shell `scripts/blueprint` the output is today's, which a differential
    row proves.
  - This is the one behaviour the port commit adds, and #3 is its proof.
- **Slice 6, the BUG-152 prerequisite.** The closure becomes a fixed point over
  `.sh` and `.mts` names. Every file in it is scanned, and every
  `scripts/lib/NAME.(sh|mts)` it names that exists in the blueprint joins it.
  So a sourced adapter (`gate.sh` after BUG-152, shaped like `dod-gate.sh`)
  brings its `.mts`.

**Not fixable in code:** a derived project whose OWN CLI is still the pre-port
shell and pulls `scripts/blueprint` alone gets the shim without its `.mts`. That
CLI's closure cannot see through a shim it has never heard of.
- The failure is loud: exit 127, and session-start reports `UNKNOWN`.
- A full pull is unaffected, because `blueprint.mts` is selected as new.
- The recovery is `git checkout -- scripts/blueprint`, then a full pull. The
  port commit body and HANDOVER say so for the three derived projects.

## 8. Slices, in order

| # | Where | Content | Test and proof | Size |
|---|---|---|---|---|
| 0 | `main` | **Test preparation.** #20c/#20d predicate `bash`→`bash\|sh`. #20e and #23b rewritten as behavioural tests. managed-references #5 inode assertion. `drift-in-blueprint` and `suite-sync` fixtures copy a shim's target. marker-merge's self-pull case and forbidden-idiom's population follow a shim (`resolveConsumer`). The shim helpers are exported from `shell-inventory-check.mts` behind an entry-point guard. | Full suite green against the unported shell. Each rewritten case shown red on a shell copy under the mutant it replaces (revoke-after-TERM; ignore-after-`cp`). | S, ~350 test lines |
| 1 | branch | **Skeleton.** Dispatch, `help`, `files`, colours, `die`, `run()` with the `set -e` rule, the lib bridge, logical `PWD`, the signal machinery (terminating, shield, freeze). Harness plus rows for dispatch and `files`. | Unit tests for terminating, shield and freeze. Differential rows identical. | M, ~350 TS + ~400 harness |
| 2 | branch | **Read path, `drift` complete.** Config, fetch (P1), history, staleness report, managed set, marker structure and merge, prospective (P3), settings layer (P4). | Drift rows identical. `sync-by-address`, `marker-merge`, `permission-policy`, `staleness`, `drift-in-blueprint`, `gate-arming`, `git-isolation` run against a working-tree-only shim (never committed on the branch). P1 and P3 mutants. | L, ~800 TS |
| 3 | branch | **`pull` complete.** Selection, the closure with shim-follow (§7), prompts, `pullFile`, shield (P2), `bootstrap_sha`, retirement. | Pull rows identical. `pull-behaviour`, `pull-exec-bit`, `marker-merge`, `sync-by-address` #9-#23c, `managed-references`, `suite-sync`. P2 mutants. | L, ~500 TS |
| 4 | branch | **`a2bp` and `prs`** (P5). | a2bp and prs rows identical. The five a2bp suites, plus `a2bp-e2e` run directly. | M, ~450 TS |
| 5 | `main` | **The port commit.** The branch squashed; `scripts/blueprint` becomes the exact two-line shim; its inventory row goes; CLAUDE.md's `TEMPLATE_FILES in scripts/blueprint` becomes `scripts/blueprint.mts`; `signals.sh`'s header is corrected. | Full suite, plus the release tier run directly (`bootstrap-gate` materialises committed HEAD). Full differential against the parent. Every recorded mutant from the suites above, re-applied to the `.mts`. The drift timing. Codex review of the whole diff before push. | S diff, most of the cost is proof |
| 6 | `main` | **Closure as a fixed point** (§7). | Reproducer first: a new `managed-references` case, in which a fixture blueprint's `scripts/lib/gate.sh` is an adapter naming `gate.mts`, and an old project pulls only `scripts/blueprint`, then its own `drift` must exit 0. Red, then green. | S, ~60 TS + ~100 test |

**Done when** (the backlog row): `scripts/blueprint` is the shim, the
differential is identical apart from the named normalisations, and slice 6's
case is green. BUG-152 then ports `gate.sh` on top.

## 9. Open questions

- **A. For the founder: Node on drift's gate-arming path.**
  - After the port, `blueprint drift` needs a Node that strips types. It is one
    of A-22's two paths that arm the pre-push gate. Without Node it exits 127:
    the wake reports `UNKNOWN` and the gate is not armed by drift. The feed
    (`agent-activity.sh`, shell) still arms it.
  - Node is already a derived-project requirement: `log-activity.sh` is a shim
    and `run-ts-suites.sh` fails closed without it.
  - **Recommendation:** accept, and state it in the port commit.
  - The alternative is to keep a shell arming step outside the CLI, which is
    new shell and against TASK-067.
- **B. For the reviewers: "keep the tools" versus in-process.**
  - The rule keeps `mktemp`, `mkdir`, `cat`, `chmod`, `diff -q` and `date` as
    child processes. The suites seam them, and awk, jq and `sort` semantics
    stay exact.
  - The alternative is leaner: in-process file operations and a synchronous JS
    write, which is itself a stronger shield. It pays for that by re-seating
    #20c, #20d, #21, #22, #23 and #23c on new seams, and by translating ERE
    and C-locale sort.
  - **Recommendation:** keep the tools for the port. Moving each in-process
    later is its own item with its own tests.
- **C. For the reviewers: the BUG-120 gate under Node.**
  - **Recommendation:** keep it (P1), whatever the no-gate mutant shows.
  - The alternative is to drop it if #20c and #20d stay green without it. That
    makes libuv's child-side signal reset a load-bearing assumption.

## Not in scope

- Porting any lib.
- Fixing BUG-116 or the two `a2bp` quirks in §3 P5.
- Changing the shim shape.
- BUG-152 itself, which follows slice 6.
