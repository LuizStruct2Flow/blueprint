# PLAN — TASK-081: port `scripts/blueprint` whole to TypeScript

**Status:** design only. Reviewed by all three providers on 2026-09-24 and
revised to that review (§"Review synthesis"); one question is open for the
founder (§9 D). No code is part of this document. Written from a full read of
`scripts/blueprint` at `8385dd1` (2,257 lines) and of the suites that run or
read it; every line reference the revision relies on was re-checked at
`fe37d4e`.

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
| `main`, slice 5b | The `drift` line announcing the full-pull rule (§7), its own commit, in the same push as slice 5. |
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
4. **`set -euo pipefail` becomes one spawn helper, and errexit is a property
   of the CALL CONTEXT, not of the command.** `run()` rejects on a non-zero
   status only while errexit is on. An uncaught rejection exits with the
   failing command's status and prints nothing of its own, as bash does. A
   signal-terminated child reads as `128+n` wherever a status is read. Every
   capture strips ALL trailing newlines, as `$( )` does.
   - **Where bash turns errexit off, the port turns it off for the callee's
     whole dynamic extent.** Bash ignores `-e` inside a function called as an
     `if`/`while` condition, after `!`, or on the left of `&&`/`||`. And
     without `inherit_errexit`, which the CLI never sets, it clears `-e` inside
     every `$( )`. Probed on this host: `x=$(f)` and `if f` both run `f` past
     a failing `false`, and a bare `f` exits there. Every one of
     `bp_prospective_for` (`:1394`, `:1572`, `:1639`), `_bp_settings_layer`
     (`:595`), `marker_aware_merge` (`:401`) and `bp_prospective_pull`
     (`:596`, `:603`) is only ever called in such a context, so an inner
     failure CONTINUES and the function returns its last command's status.
   - **Mechanism:** the errexit flag lives in an `AsyncLocalStorage`
     (`node:async_hooks`, a built-in). `unchecked(fn)` runs `fn` with it off,
     `capture(fn)` does the same and strips trailing newlines, and every site
     where the shell calls a FUNCTION in one of those contexts calls it through
     one of the two. A ported function returns its last command's status
     explicitly wherever the shell relied on it.
   - **Proof:** unit tests on `unchecked` and `capture` (an inner failure
     continues; the same call bare rejects), and failure rows in the
     differential (§5), since no success row can see this.
   - **Command not found.** `spawn`'s `ENOENT` maps to status 127 and a
     non-executable file (`EACCES`) to 126, as bash does, in every context,
     including under `2>/dev/null`, where the port prints nothing either. The
     message keeps bash's shape, `<cli>: <cmd>: command not found`, where
     `<cli>` is `process.argv[1]` without `.mts`. The shim builds that argument
     from `$(dirname "$0")`, so it equals bash's `$0`. Bash also prints
     `line N:`, which the port cannot reproduce (§5, §6). `command -v` becomes
     a PATH search in JS.
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
   - **The token, pending §9 D.** Under the recommended option,
     `scripts/blueprint.mts` never spells the project-name placeholder token,
     in code or comments, and the three shell comments that do (`:44`,
     `:278`, `:308`) are reworded as they travel. Why, and the alternative:
     §9 D.
7. **A signal is handled where bash handles it: after the foreground child.**
   Bash runs a trap only between commands, so a signal that arrives while a
   foreground child runs waits for that child to exit. Node's handler would
   otherwise fire mid-child. That is harmless on a path that terminates, but
   not for `a2bp`'s handler, which cleans up and RESUMES (`:1886`): bash runs
   `_a2bp_cleanup` after the in-flight `git` or build returns, and a handler
   firing mid-child would `rm -rf` the scratch under it.
   - **The rule.** The OS-level listener only records the signal. `run()`
     checks the record when its child exits, before it resolves, and only then
     runs the installed handler: terminate (clean up, die of the signal) or
     `a2bp`'s resume (clean up, then `run()` settles with the child's status,
     as bash continues with the next command). A shield (§3 P2) checks the
     record only when it closes. With no child in flight, the handler runs at
     the next event-loop turn, which is where bash checks traps between
     commands.
   - **The one interruptible wait is the fetch.** Bash's `wait` builtin
     returns to a trap at once, which is why the refresh runs in the
     background (§3 P1). So while the fetch wait is pending, the terminating
     handler runs immediately.
   - **Repeated signals are serialised.** The first recorded signal decides.
     A signal that arrives while a handler runs is recorded and never
     re-enters it. The handler runs once, then the process dies of the first
     signal. `#20f` (§8, slice 0) pins what the shell does with two signals,
     and if the shell's observable outcome differs from this rule, the port
     follows the shell and the plan records the difference.
   - This makes P2's deferral the general case rather than a special one, and
     it covers `a2bp`'s resuming handler with no extra mechanism.

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
- **The exit promise is made at spawn.** `spawn` returns, and in the same
  synchronous step the port creates the one promise for the child's exit.
  The main flow's wait and the cleanup both await THAT promise, never a fresh
  `once(child, 'exit')`. A fresh listener on a child already reaped waits
  forever, and bash's cleanup never hits this because the shell blanks
  `BP_SYNC_CHILD` after its `wait` (`:886`). The port blanks its child
  reference at the same point.
- **Cleanup has three parts.**
  1. A synchronous part with no `await`: `truncateSync(GO)`, then
     `process.kill(pid, 'SIGTERM')`. A syscall does not fork, so nothing runs
     between revoking the token and sending the TERM.
  2. An `await` on the exit promise, if a child is still recorded. This is
     bash's `wait`, and it returns at once for a child already reaped.
  3. A synchronous tail: `git update-ref -d` and `rm -rf` of the scratch.

  The EXIT path never has a live child: `_bp_fetch_fail` runs only after the
  wait. So it runs parts 1 and 3 only.
- **Freezing the main flow during the fetch wait.** This is the one place a
  handler runs while a child is in flight (rule 7). In bash, the handler runs
  to completion and the script never resumes. In Node, the handler's `await`
  and the main flow's `await` settle on the same exit promise, and the main
  flow's continuation, registered first, runs first. It would read the
  killed fetch as a failure and print `_bp_fetch_fail` with exit 5. So the
  handler sets `terminating` first, and the fetch wait checks it on resuming
  and returns a promise that stays pending. The cleanup's own spawns bypass
  `run()`.
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
- **#20e stays structural until slice 5.** It reads the shell's text, and the
  shell is untouched until then. No child-side observation can pin the
  ordering it pins: a shim that records the token's state when its TERM
  arrives passes revoke-after-TERM on one CPU, because the parent can
  truncate before the shim's handler is scheduled, and a forking `rm` in the
  gap is invisible to it (the current case says so at `:1224-1231` of the
  spec). In slice 5, #20e is replaced by two things:
  - a unit test on the exported cleanup, with an injected `kill`, asserting
    the token is empty when `kill` is called and that the synchronous part
    returns no promise;
  - a structural check on the `.mts` cleanup: nothing between
    `truncateSync(GO)` and `process.kill` awaits or spawns.
- **Any test shim that reads the gate's argv finds GO by its name, never by
  position.** The port's launch puts ERR between `bp-refresh` and GO, so "the
  argument after `bp-refresh`" is GO on the shell and ERR on the port. No
  planned case reads it that way now that #20e stays structural. The rule is
  recorded for the next one.
- **The reaped child:** a unit test runs cleanup after the child has exited
  and asserts it returns.
- **Repeated signals: `#20f` (slice 0).** INT then TERM, and INT twice, while
  cleanup waits on a refresh child held by the #20c FIFO. It asserts the
  shell's outcome: exit status or signal, nothing left, the project
  untouched, no message printed twice. Green on the shell first, then on the
  port.
- Recorded mutants, run on the port:
  - no token written: every fetching case fails closed;
  - gate never checks the token: #20d;
  - handler without the main-flow freeze: #20 prints exit 5, not died-of-signal;
  - cleanup awaiting a fresh `exit` listener: the reaped-child unit test hangs
    to its timeout;
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
  `cp -p <dest> <dest>.bp-new.*`, and a group INT or TERM is sent there. The
  case asserts three things: DEST holds the blueprint's NEW bytes and the
  expected mode, the run dies of the signal, and nothing later is written
  (`bootstrap_sha` unchanged). The first assertion is the one that matters.
  Under a temp-and-rename write, a shield that dies at `cp` leaves the OLD
  file intact, so "the file is complete" alone passes while broken. Green on
  the shell. Red on a shell copy whose ignore follows the `cp`, and red on the
  port with the `cp` step outside the ignore wrapper.
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
that value. The type makes a write from anything else awkward, but it does
not rule it out: a `Prospective` can be built by hand. The per-site mutants
below are the proof, not the type. The subshell hazard disappears because
there are no globals.
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
  fix. Under rule 7 it runs after the in-flight child exits, as in bash, so
  the scratch is never removed under a running `git` or build.
- **`prs` never lists orphan branches.** `cmd_prs` sources only
  `request-config.sh` (`:2165-2167`), but its orphan section calls
  `bp_request_transport_env` (`:2214`), which only `request.sh` defines. The
  call exits 127, `2>/dev/null` hides the message, `|| true` hides the status,
  and the "Pushed branches with no open PR" listing never prints. The port
  reproduces this byte for byte: the blank line before the section prints,
  the listing does not, and the bridge for `prs` sources `request-config.sh`
  only. A bridge that sourced `request.sh` would start printing orphans and
  the "orphan branches" row would diverge. Filed after the port as a new bug,
  "`blueprint prs` never lists pushed a2bp branches with no open PR", fixed
  with its own reproducer.
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
  (`blueprint-sync.XXXXXXXX`, `tmp.XXXXXXXXXX`, the a2bp scratch), the
  timestamps in `diff -u` headers, and bash's `line N: ` in a
  `command not found` message (§6). Everything else must be byte-equal.
- **Failure rows are required, not optional.** Errexit is suspended inside a
  condition and inside `$( )` (§2 rule 4), and only a row where an inner
  command FAILS can tell a port that continues from one that exits. Each
  function rule 4 names gets at least one: a `diff` or `jq` that fails
  inside `bp_prospective_for`, `_bp_settings_layer` and `marker_aware_merge`,
  driven by a PATH shim that fails on the named argv.
- **Command-not-found rows:** an unguarded tool (`comm`, `cmp`) absent from
  PATH, once in `drift` and once in `pull`. Status must match exactly.
- **Slices 2-4 prove the suites locally.** On the branch the suites run
  against a working-tree-only shim that is never committed, so CI cannot
  re-run them and a slice reviewer has to recreate the shim to do so. The
  first CI run of the signal suites against the port is slice 5's. Each slice
  review says this.

**The matrix, about 90 rows:**

| Subcommand | Rows |
|---|---|
| dispatch | no args; `help`, `--help`, `-h`; an unknown subcommand; `push` |
| `files`/`list` | in the blueprint; in a derived project; under the `BLUEPRINT_ROOT` override |
| `drift` | in the blueprint, with staleness current/behind/ahead/diverged/unknown, the fast-forward prompt y/N and `BP_NO_PROMPT`; unregistered (three or more markers); not a project; `gate.sh` missing; v1 config (4); placeholder remote (4); unreachable (5); hung (5); missing branch (5); missing release branch (5); no `timeout` (5); scratch uncreatable (5); damaged cache (5); `bootstrap_sha` not in history; clean; drifted, new, missing-in-blueprint and refused (bad markers, `none:ok`, each settings refusal); override, and override not a directory; the leftover `blueprint_source` warning; an exported `GIT_DIR`; a symlinked project directory; a project name holding `&` and `\` |
| `pull` | nothing to pull, with retirement y, non-TTY and q; full `--yes`; partial; non-TTY without `--yes` (7); prompts y/N/q; refused (4); backup-copy with `.bp-bak`; merge; new file; exec bit +x and -x; every settings case from P4; `pull scripts/blueprint` (libs first, CLI last, a refused lib skips the CLI); a held file leaves `bootstrap_sha`; an unknown option (dies after the fetch, as today) |
| `a2bp` | the codes in P5; no files; `--force`; an unknown option; a missing lib; staging rc 3; GNU diff missing; an unshipped path; the remote moving once, then twice |
| `prs` | gh absent; gh erroring (INCOMPLETE); empty; a draft; orphan branches (none listed, as today, §3 P5) |

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
5. **A `command not found` message has no `line N:`.** The status (127 or
   126) and the rest of the line are bash's. The differential normalises only
   that part.
6. **A pre-port CLI must not pull `scripts/blueprint` alone** (§7, founder
   decision 2026-09-24). Announced, not fixed.

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

**Not fixable in code, and accepted: the pre-port single-file pull.** A
derived project whose OWN CLI is still the pre-port shell and pulls
`scripts/blueprint` alone gets the shim without its `.mts`. That CLI's closure
cannot see through a shim it has never heard of, and no later slice can reach
back into it.

**Founder decision, 2026-09-24, resolving Alexey's REJECT: "Accept, announce
it."** The exact two-line shim stays; no shim variant, and no fallback in it.
- **The failure is loud.** Every `blueprint` command exits 1 with Node's
  `Cannot find module '…/scripts/blueprint.mts'`, and session-start reports
  `UNKNOWN`. (This section said exit 127 before the review. That is only what
  happens when `node` itself is missing, measured on this host.)
- **A full pull is unaffected.** `blueprint.mts` is selected as new. Under
  §9 D's recommended option, the pre-port CLI's own `placeholders.sh` leaves
  it byte-identical, because it holds no token.
- **The recovery** is `git checkout -- scripts/blueprint`, then a full
  `blueprint pull`.
- **The announcement, one text in three places:**
  > After this release, update with a full `blueprint pull`, not a
  > single-file pull of the CLI (`blueprint pull scripts/blueprint`). A
  > pre-port CLI that pulls `scripts/blueprint` alone installs the shim
  > without `scripts/blueprint.mts`, and every `blueprint` command then fails
  > with `Cannot find module …/scripts/blueprint.mts`. To recover:
  > `git checkout -- scripts/blueprint`, then `blueprint pull`.
  1. **The port commit's body** carries it verbatim.
  2. **The release announcement** carries it verbatim. HANDOVER records it for
     the three derived projects until each has done its full pull.
  3. **What `drift` prints.** The ported `drift` adds one line to its `Next:`
     block whenever `scripts/blueprint` or `scripts/blueprint.mts` is drifted
     or new: *"scripts/blueprint and scripts/blueprint.mts travel together:
     update with a full `blueprint pull`, not a single-file pull of the
     CLI."* This is new behaviour, so it cannot be in the behaviour-identical
     port commit. It is slice 5b: its own commit, reproducer first, in the
     same push as slice 5, so no release carries the port without it.
- **The honest limit of item 3.** The `drift` that runs in a derived project
  at the moment of risk is that project's pre-port CLI, which this work cannot
  change. It lists `~ scripts/blueprint` and `+ scripts/blueprint.mts`
  together and says nothing more. The ported line reaches a project only after
  its full pull, when the ported closure already makes a single-file pull
  safe. So items 1 and 2 are what reach projects in time. Whether item 3 is
  still wanted is §9 E.

## 8. Slices, in order

| # | Where | Content | Test and proof | Size |
|---|---|---|---|---|
| 0 | `main` | **Test preparation.** #20c/#20d predicate `bash`→`bash\|sh`. #23b rewritten as a behavioural test asserting the new bytes and mode (§3 P2). #20e stays structural. New #20f, repeated signals (§3 P1). managed-references #5 inode assertion. `drift-in-blueprint` and `suite-sync` fixtures copy a shim's target. marker-merge's self-pull case and forbidden-idiom's population follow a shim (`resolveConsumer`). The shim helpers are exported from `shell-inventory-check.mts` behind an entry-point guard. | Full suite green against the unported shell. #23b shown red on a shell copy whose ignore follows the `cp`. #20f records the shell's outcome. | S, ~400 test lines |
| 1 | branch | **Skeleton.** Dispatch, `help`, `files`, colours, `die`, `run()` with the errexit-context rule, `unchecked`/`capture`, command-not-found mapping, the lib bridge, logical `PWD`, the signal machinery (record, defer to child exit, shield, fetch-wait freeze, serialisation). Harness plus rows for dispatch and `files`. A grep case pinning that `scripts/blueprint.mts` never spells the placeholder token (§9 D, if the founder takes the recommendation). | Unit tests for errexit contexts, 127/126 mapping, deferral, shield, freeze and serialisation. Differential rows identical. | M, ~400 TS + ~400 harness |
| 2 | branch | **Read path, `drift` complete.** Config, fetch (P1), history, staleness report, managed set, marker structure and merge, prospective (P3), settings layer (P4). | Drift rows identical. `sync-by-address`, `marker-merge`, `permission-policy`, `staleness`, `drift-in-blueprint`, `gate-arming`, `git-isolation` run against a working-tree-only shim (never committed on the branch). P1 and P3 mutants. | L, ~800 TS |
| 3 | branch | **`pull` complete.** Selection, the closure with shim-follow (§7), prompts, `pullFile`, shield (P2), `bootstrap_sha`, retirement. | Pull rows identical. `pull-behaviour`, `pull-exec-bit`, `marker-merge`, `sync-by-address` #9-#23c, `managed-references`, `suite-sync`. P2 mutants. | L, ~500 TS |
| 4 | branch | **`a2bp` and `prs`** (P5). | a2bp and prs rows identical. The five a2bp suites, plus `a2bp-e2e` run directly. | M, ~450 TS |
| 5 | `main` | **The port commit.** The branch squashed; `scripts/blueprint` becomes the exact two-line shim; its inventory row goes; CLAUDE.md's `TEMPLATE_FILES in scripts/blueprint` becomes `scripts/blueprint.mts`; `signals.sh`'s header is corrected; structural #20e is replaced by the cleanup unit test and the structural `.mts` check (§3 P1). The body carries the announcement (§7) verbatim. | Full suite, plus the release tier run directly (`bootstrap-gate` materialises committed HEAD). The first CI run of the signal suites against the port. Full differential against the parent. Every recorded mutant from the suites above, re-applied to the `.mts`. The drift timing. Codex review of the whole diff before push. | S diff, most of the cost is proof |
| 5b | `main`, same push as 5 | **The drift line** (§7 item 3, subject to §9 E). | Reproducer first: a `drift` case where `scripts/blueprint.mts` is new prints the line. Red on the port commit, green after. | S, ~15 TS + ~40 test |
| 6 | `main` | **Closure as a fixed point** (§7). | Reproducer first: a new `managed-references` case, in which a fixture blueprint's `scripts/lib/gate.sh` is an adapter naming `gate.mts`, and an old project pulls only `scripts/blueprint`, then its own `drift` must exit 0. Red, then green. | S, ~60 TS + ~100 test |

**Done when** (the backlog row, corrected in the same commit as this
revision): `scripts/blueprint` is the shim; the differential is identical
apart from the named normalisations; a single-file `pull scripts/blueprint`
run by the PORTED CLI brings every lib and `.mts` it needs (slice 6's case
green); and the pre-port single-file pull is announced as unsupported (§7).
The row promised the single-file pull for every CLI, which no code can
deliver for a pre-port one. BUG-152 then ports `gate.sh` on top.

## 9. Open questions

- **A. For the founder: Node on drift's gate-arming path.** **Decided
  2026-09-24 by the founder: accept.** The sync CLI requires Node like the
  rest of the toolchain, with no shell fallback. The port commit states it.
  - After the port, `blueprint drift` needs a Node that strips types. It is one
    of A-22's two paths that arm the pre-push gate. Without Node it exits 127:
    the wake reports `UNKNOWN` and the gate is not armed by drift. The feed
    (`agent-activity.sh`, shell) still arms it.
  - Node is already a derived-project requirement: `log-activity.sh` is a shim
    and `run-ts-suites.sh` fails closed without it.
  - **Recommendation:** accept, and state it in the port commit.
  - The alternative is to keep a shell arming step outside the CLI, which is
    new shell and against TASK-067.
- **B. "Keep the tools" versus in-process. Settled: keep the tools**, by all
  three reviewers.
  - The rule keeps `mktemp`, `mkdir`, `cat`, `chmod`, `diff -q` and `date` as
    child processes. The suites seam them, and awk, jq and `sort` semantics
    stay exact.
  - The alternative was leaner: in-process file operations and a synchronous
    JS write, which is itself a stronger shield. It pays for that by re-seating
    #20c, #20d, #21, #22, #23 and #23c on new seams, and by translating ERE
    and C-locale sort. Moving each in-process later is its own item with its
    own tests.
- **C. The BUG-120 gate under Node. Settled: keep it**, by all three
  reviewers, whatever the no-gate mutant shows.
  - Dropping it if #20c and #20d stay green without it would make libuv's
    child-side signal reset a load-bearing assumption. The gate costs one `sh`
    exec.
- **D. For the founder: the placeholder hole.** OPEN.
  - **The hole.** `bp_should_substitute` (`scripts/lib/placeholders.sh:87-94`)
    exempts `*scripts/blueprint`, and that pattern does not match
    `scripts/blueprint.mts`. So pull and drift substitute the `.mts` like any
    other file. The shell CLI spells the project-name placeholder token in
    three comments (`:44`, `:278`, `:308`). If those comments travel as
    written, every derived project's pull lands a `.mts` with its own name
    written into them: bytes that differ from the blueprint's, and the BUG-028
    shape the exemption exists to prevent. The differential cannot see it,
    because OLD and NEW substitute identically. Markus and Slava both found
    it.
  - **Option 1 (Markus): the `.mts` never spells the token.** The three
    comments are reworded ("the project-name placeholder"). One grep case, in
    slice 1, fails if the token ever appears in `scripts/blueprint.mts`.
    Substituting a file with no token is the identity, so the missing
    exemption does no harm.
    *Cost:* one test, three reworded comments, and a standing constraint on
    whoever edits the file. The first pull by a pre-port CLI, which uses that
    project's OWN `placeholders.sh`, lands the `.mts` byte-identical. A
    per-file bridge call for the substitution stays, as for every other file.
  - **Option 2 (Slava): add `*scripts/blueprint.mts` to the exemption.** This
    states the intent in the one place that decides it.
    *Cost:* `placeholders.sh` is a legacy row in `scripts/shell-inventory.json`,
    so changing it is a whole-file port first (TASK-067). It is SOURCED by
    `new-project.sh`, `contamination.sh`, `.githooks/pre-push-project` and the
    CLI, so it needs the sourced-adapter shape. CLAUDE.md says a second sourced
    library "earns its own reviewed extension of the checker rather than
    broadening it by analogy". That is a second port, with its own plan and its
    own review, ahead of this one. And it still does not close the hole in
    time. The pull that first brings the `.mts` is run by the pre-port CLI with
    the project's pre-port `placeholders.sh`, which lacks the new exemption.
    So the first `.mts` lands substituted anyway, and the next `drift` reports
    it until another pull.
  - **Recommendation: Option 1.** It closes the hole for the pull that
    matters, the first one, and it costs a test instead of a prerequisite
    port. Option 2 is the better statement of intent, and it can come later,
    when `placeholders.sh` is ported for a reason of its own. The grep case
    then retires.
- **E. For the founder: is the drift line (§7 item 3, slice 5b) still
  wanted?** OPEN, and minor. It was in the decision, but it can only live in
  the ported `drift`, which never meets the hazard: the projects at risk are
  running their pre-port `drift`. **Recommendation:** drop slice 5b and rely
  on the commit body and the release announcement, which reach those projects
  in time. If kept, it is 5b as specified.

## Not in scope

- Porting any lib, including `placeholders.sh` (§9 D).
- Fixing BUG-116, the two `a2bp` quirks in §3 P5, or the `prs` orphan
  listing in §3 P5.
- Changing the shim shape.
- BUG-152 itself, which follows slice 6.

## Review synthesis

Three providers reviewed the plan on 2026-09-24. Each
claim below was checked against `scripts/blueprint` before it was adopted.

| Reviewer | Provider | Verdict |
|---|---|---|
| Markus (Security-1) | Claude | APPROVE-WITH-CHANGES |
| Alexey | Codex | REJECT |
| Slava (Architect-3) | Kimi | APPROVE-WITH-CHANGES |

**Alexey's REJECT, and how it was resolved.** A pre-port CLI cannot discover
`blueprint.mts`, so its single-file pull of `scripts/blueprint` installs the
shim without a target, while the TASK-081 row's "Done when" promised that
pull would work. Correct, and no slice can fix it. The founder decided on
2026-09-24: *"Accept, announce it."* §7 now records the decision, the
announcement text and where it goes, and the backlog row's "Done when" is
corrected in this commit. The exit status the plan gave for that failure was
also wrong (127, not 1) and is corrected.

**Adopted:**
- **Errexit context** (Markus). Confirmed at `:401`, `:595`, `:1394`,
  `:1572` and `:1639`: each function is only ever called as a condition. The
  revision widens the finding. Without `inherit_errexit`, bash also clears
  `-e` inside every `$( )`, probed on this host. So §2 rule 4 makes errexit a
  property of the call context, with `unchecked`/`capture` and failure rows.
- **Signals deferred to the child's exit** (Markus). Bash runs traps between
  commands, and `a2bp`'s handler resumes (`:1886`), so a mid-child handler
  would delete the scratch under a running command. This is §2 rule 7. It
  makes the shield's deferral the general case, and narrows the main-flow
  freeze to the fetch wait, the one interruptible `wait`.
- **The reaped-child hole** (Markus). A fresh `exit` listener on a reaped
  child never fires. The exit promise is now made at spawn, and a unit test
  plus a mutant pin it.
- **Keep #20e structural until slice 5** (Markus). A child-side observation
  passes revoke-after-TERM on one CPU. It is replaced in slice 5 by the
  cleanup unit test and a structural check on the `.mts`.
- **#23b asserts the new bytes and mode** (Markus, Slava, Alexey). The weaker
  "file complete" passes while broken under temp-and-rename.
- **Find GO by name, never by position** (Slava). Correct about the plan as
  written. Moot for #20e, which stays structural; kept as a rule for any shim
  that reads the gate's argv.
- **Slices 2-4 are local-only proof** (Slava). Stated in §5 and in each slice
  review.
- **Command not found** (Alexey). 127/126 mapping, message shape, one named
  normalisation, rows in `drift` and `pull`.
- **Repeated signals** (Alexey). Serialisation rule, and `#20f` pins the
  shell's outcome first.
- **The `prs` orphan section is dead code** (Markus). Confirmed at `:2165-2167`
  and `:2214`: `bp_request_transport_env` is defined only in `request.sh`.
  The port reproduces it, and the defect is filed after the port as its own
  new bug.
- **"The type system rules out"** was overstated (Markus). Reworded; the
  mutants are the proof.
- **B and C** — all three: keep the tools, keep the gate.

**Not decided here: the placeholder hole.** Markus and Slava found it
together and proposed different fixes. Both are laid out with their costs in
§9 D, with a recommendation, for the founder.

**Rejected:** nothing a reviewer raised was rejected outright. The one
narrowing is Slava's argv finding, which stands as a rule but has no case to
apply to once #20e stays structural.
