# PLAN — TASK-025: `drift` and `pull` read the blueprint by its address

**Status:** PLAN, **revision 2**. Revised after Alexey's cross-provider review
(Codex, verdict *"build A with changes"*). It needs a re-review of this revision,
and a founder answer to §2.1. **No code is authorised by this document.**
Author: Christian (Senior Architect). Revision 1 and revision 2 both 2026-09-14.

**Two options were on the table; the review chose A with changes.**

- **Option A: the git remote.** §1–§10.
- **Option B: the blueprint as an npm package.** §11. Revision 2 corrects two of
  its arguments per review finding 4. The recommendation is still A (§11.9).

**Founder decision, 2026-09-14:** *"what if we keep track of the repository
address of the blueprint? It doesn't matter where it is physically."*

**Scope:** `cmd_drift`, `cmd_pull`, `read_blueprint_source`,
`_bp_resolve_blueprint_root` and `pull_file` in `scripts/blueprint`, plus the
test harness (`tests/harness/env.ts`, `tests/harness/index.ts`,
`scripts/run-ts-suites.sh`) and the fixtures of the suites that drive them.
`a2bp`, `prs`, `files` and `help` are untouched.

---

## R. Response to the review (revision 2)

Every finding is answered. Evidence is from probes under
`.scratch/christian-025/`, against **local** bare remotes only. No network was
used. The design changes are in the sections named.

| # | Finding (short) | Answer | Where |
|---|---|---|---|
| 1 | The signal trap cleans up but does not terminate; a killed pull goes on writing | **Adopted.** The EXIT handler and the INT/TERM handler are now separate. On INT or TERM it cleans up, clears its own trap and re-raises the signal. Measured across 3 stages × 2 signals × 2 execution shapes: every run ended by the signal (status 130 or 143), left no scratch and made no write, including under the CLI's own `set -euo pipefail`. **The review undercounted one thing:** a Ctrl-C reaches the whole process group, and it killed a writer mid-write and **truncated the project file** (6 of 40 lines). Writes now run with INT and TERM ignored, and the parent stops after the write completes (40 of 40 lines, no later write). That defect exists in today's `pull` too. | §1.4, §9.2 #20–#23 |
| 2 | "No cache" overrides an explicit founder requirement | **Adopted.** The backlog row does require it, and revision 1 turned it into a re-open trigger without saying so. There is now a persistent bare cache, refreshed on every run. A failed refresh exits 5 and nothing is read from the cache. Measured locally: warm refresh 5–7 ms, per-run tree built from the cache 27 ms with 120 KiB of scratch, 16 concurrent refreshes × 5 rounds with 0 failures. Two creation designs were measured: plain concurrent `git init` failed **3 of 160** runs, and init-beside-then-rename failed **0 of 160**. The second is adopted. Corruption: a truncated pack healed itself on refresh, with a byte-identical tree. A missing tree object left the refresh **reporting success**, and only building the tree failed (status 128). So building the tree is the corruption check, and its failure is 5. | §1, §3, §4, §9.2 #5, #24–#27 |
| 3 | Adding `BLUEPRINT_ROOT` to `ENV_KIND` does not scrub it | **Adopted.** Confirmed by reading the code: `FORBIDDEN_ENV` keeps only `GIT_`/`AGENT_`/`BP_` names (`env.ts:267`), and `run-ts-suites.sh:177` scrubs by the same prefixes. The scrub list gains an explicit unprefixed-names list. The bridge unsets the same names, and ts-bridge #1c pins that the two agree. There are two harness witnesses: an ambient value is absent, and an explicit override inside the workspace is kept while one outside it is refused. **The review missed two more names of the same class,** both added: `XDG_CACHE_HOME`, which the new cache reads, and `GIT_SSH_COMMAND` / `GIT_SSH`, which are undeclared, so an ambient value reaches fixtures and bypasses the ssh shim in a direct vitest run. | §9.1 |
| 4 | B's "must wait for Stage B" and "no offline wake" are framing, not constraints | **Adopted in part, measured.** (a) A payload built by CI from `git archive`, under one `files` entry, does avoid a third copy of the managed list. **But npm silently dropped 11 of 151 shipped files, including `CLAUDE.md` and `docs/DoD.md`.** The payload carries the blueprint's `.gitignore`, whose privacy block lists tracked files, and npm treats that as ignore rules. An empty `.npmignore` fixes it (150 of 151). The last file is `.gitignore`, which npm never packs. So the claim holds, with two traps it did not name. (b) The offline point depends on the product contract, which is now an explicit founder question. Under the "pinned" contract, **A with this cache answers offline too**, so offline is no longer a reason to pick B. | §2.1, §11.2, §11.9 |
| 5 | Missing tests: missing branch, no timeout provider, scratch not creatable, INT and signals mid-compare / mid-write, concurrency, corruption | **Adopted.** Measured: a reachable remote with a missing branch fails with status 128 and `couldn't find remote ref`, which the CLI reports separately from a transport failure. Staleness records that no contained way exists to hide `timeout` (`staleness.spec.ts:179`). This plan adds one: a PATH made of symlinks to every executable on the current PATH except the hidden names. Every ssh case is pinned by scrubbing `GIT_SSH_COMMAND`/`GIT_SSH` (finding 3), not by relying on PATH order. | §9.2 #16–#27 |
| 6 | A `released` branch needs the tested SHA and an ancestry check | **Adopted as conditions.** It stays a founder option, not a default. If chosen: CI pushes `$GITHUB_SHA` (never the moving `main`) without force, after every job in `security.yml`, on `push` events only. An older job then loses the non-fast-forward race by design. Before any project switches branch, migration checks that its `bootstrap_sha` is an ancestor of `released`. | §7.4 |
| 7 | BUG-110: prove the fetched root is exactly the tree | **Adopted as a test, measured.** With an ancestor `.git` present, as an empty directory or as a `gitdir:` file, the tree's top level was exactly the tree in both cases. Discovery from the scratch parent failed in both. The cache is only ever addressed with `--git-dir`, so it runs no discovery at all. **Declined:** a `GIT_CEILING_DIRECTORIES` guard on top. Nothing it would stop was reproduced, and the test pins the property. | §1.3, §9.2 #19 |

**Also found, out of scope, flagged to the orchestrator:** `a2bp` installs the
exact trap shape finding 1 reproduced (`trap _a2bp_cleanup EXIT INT TERM`,
`scripts/blueprint:1497`), and a2bp pushes and opens PRs after it. The same
continuation is likely there, but it was **not** reproduced against a2bp itself.
It needs its own bug row.

---

## 0. What was measured

### 0.1 Facts that held (revision 1, re-checked where the code moved)

| Claim | How it was checked | Result |
|---|---|---|
| `drift`/`pull` resolve a LOCAL checkout | read `_bp_resolve_blueprint_root` (`scripts/blueprint:677`); ran drift in all three projects | `$BLUEPRINT_ROOT`, then `blueprint_source`, then the CLI's own checkout. All three reported `blueprint: <local path>` |
| Every derived project records `blueprint_remote` + `blueprint_branch`, config v2 | read the three `.blueprint-source` files | all three: `config_version = 2`, `git@github.com:LuizStruct2Flow/blueprint.git`, `main` |
| `~/.local/bin/blueprint` hard-codes the checkout path | read it | `exec /home/luiz/dev/struct2flow/blueprint/scripts/blueprint "$@"` |
| linkedin-watcher-agent and struct2flow-www carry `scripts/blueprint`; storm2flow does not | `ls` | true. storm2flow has no `scripts/blueprint` and no `scripts/lib/` |
| PR #66 is decided | TASK-026 row; `git log` | **Changed since revision 1.** TASK-026 implemented it in the blueprint. U6 became BUG-113's single prospective-pull result (`4076faf`, `3535758`) |
| `drift` exits 0 when files have drifted | ran it in www (4 drifted) | exit 0. **Unchanged by this plan** |
| The CLI runs under `set -euo pipefail` | `scripts/blueprint:37` | true. Every handler below was measured under it |

### 0.2 Facts that did NOT hold, or held differently

1. **`a2bp` does not use a clone.** `bp_file_fetch_base`
   (`scripts/lib/request-file.sh:34`) runs `git init --bare` and then
   `git fetch --depth 1`. A depth-1 fetch cannot serve `drift`, which prints
   `git log BOOTSTRAP_SHA..HEAD`. So this plan reuses a2bp's scratch-directory
   pattern, transport-environment scrub and exit-status vocabulary, but not its
   fetch depth, and **not its trap** (§R #1).
2. **struct2flow-www's `blueprint_source` is an absolute host path.** That is the
   BUG-012 shape, live today.
3. **PATH matters for all three projects.** The managed `CLAUDE.md` says to run
   plain `blueprint drift`, and only the wrapper resolves, so every wake runs
   **the blueprint checkout's CLI**.
4. **The local blueprint checkout was ahead of its remote, and every derived
   project was reporting against the unpushed commits.** Local HEAD `f9e693f`,
   `origin/main` `567b266`. A `pull` at that moment would have written an
   unpushed SHA into `bootstrap_sha`. The review reproduced this independently
   (`.scratch/alexey-025/unpushed-results2/`). **This is the defect this task
   removes.**
5. **The test harness does not scrub `BLUEPRINT_ROOT`, and declaring it is not
   enough to change that** (§R #3).
6. **GitHub refuses `git archive --remote`** (`Invalid command:
   git-upload-archive`).
7. Unrelated: linkedin-watcher-agent's gate is not armed (`core.hooksPath` is an
   absolute path that `arm_gate` correctly refuses to overwrite).

### 0.3 WAN cost (revision 1, Linux box, SSH to GitHub)

| Operation | Wall time |
|---|---|
| `git ls-remote` of `refs/heads/main` | < 1 s |
| cold `git fetch` of full `main` into an empty bare repo | 2.44 s |
| warm `git fetch` into that bare repo, nothing new | 1.51 s |
| cold `git clone --single-branch --branch main` including checkout | 2.53 s |
| blueprint pack size (`count-objects`) | 2.03 MiB |

The review could not re-measure the WAN numbers (its sandbox forbids network).
Its bandwidth argument stands without them: a throwaway clone re-transfers the
whole pack on every wake, while a warm fetch transfers only new objects.

### 0.4 Revision 2 measurements (local bare remote of this repository, no network)

| Probe | Result |
|---|---|
| Cold fetch into an empty cache | 548 ms |
| Warm no-op refresh into a per-run ref, 3 runs | 5, 7, 6 ms |
| Build the per-run tree: `clone --shared --no-checkout` + `checkout --detach <sha>` | 27 ms; `.git` 120 KiB (objects via alternates); `archive HEAD tests` 0; full history (456) readable |
| Throwaway full clone (revision 1's design), for comparison | 53 ms |
| 16 concurrent refreshes × 5 rounds, per-run refs | 0 / 80 failed |
| Concurrent first runs, plain `git init --bare` + refresh, 16 × 10 | **3 / 160 failed** |
| Concurrent first runs, init beside the cache + `mv` into place + refresh, 16 × 10 | **0 / 160 failed**, no debris |
| `git init --bare` on an existing cache while `config.lock` is held | fails, status 128. A refresh with the lock held: 0. So an existing cache is never re-initialised |
| SIGKILL mid cold fetch, after a temp pack appeared | leaves `objects/pack/tmp_pack_*`, no ref. Next refresh 0; tree byte-identical to a full clone |
| Pack truncated to 100 KiB, then refresh | refresh 0, a second pack fetched; tree byte-identical |
| The tip's root tree object deleted, then refresh | **refresh 0** (the tip commit is present, so nothing is fetched); `archive` 128; building the tree 128 |
| Remote reachable, branch missing | status 128, `fatal: couldn't find remote ref refs/heads/nope` |
| Ancestor `.git` (empty dir / `gitdir:` file) above the scratch | tree top level = the tree, both kinds; discovery from the scratch parent fails, both kinds |
| Signal handler: 3 stages × INT/TERM × foreground/`wait`, under `set -euo pipefail` | 12 / 12 ended by the signal (130 / 143), no scratch, no write |
| Group INT/TERM while a slow writer is writing a project file | writer unshielded: **file truncated, 6 / 40 lines**. Writer started with INT/TERM ignored: 40 / 40 lines, parent then stopped, no later write |
| `npm pack` of a payload made from `git archive HEAD` | 140 / 151 files: the payload's `.gitignore` dropped 11 managed files. With an empty `.npmignore`: 150 / 151; npm never packs `.gitignore` |

---

## 1. The fetch model

### 1.1 Options

| | Model | Verdict |
|---|---|---|
| a | A throwaway `git clone --single-branch` per invocation | **rejected** (revision 1's choice). It re-transfers the whole pack every wake, which contradicts the backlog row's cache requirement (§R #2) |
| b | **A persistent bare cache per remote, refreshed every run; each run builds its own tree from it** | **CHOSEN** |
| c | `git archive --remote` | impossible: GitHub refuses it |
| d | `ls-remote`, then fetch only when the tip moved | not worth it: a warm no-op fetch is already one round trip, and `ls-remote` pays the same handshake |

### 1.2 The cache

- **Where.** `${XDG_CACHE_HOME:-$HOME/.cache}/struct2flow/blueprint-<key>.git`,
  where `<key>` is `printf '%s' "$remote" | git hash-object --stdin`. That is
  portable (no `sha1sum`/`shasum` split) and gives one cache per remote address,
  which the three projects on a machine share.
- **Creation (first run only).** If the directory does not exist:
  `git init --bare` into a `mktemp -d` **beside** it, then `mv` it into place.
  If another run won in between, BSD and GNU `mv` both put the loser's temp dir
  *inside* the winner, and the loser deletes `<cache>/<its temp name>`. No `-T`
  (GNU only) and no lock. Measured 0 / 160 against 3 / 160 for plain init
  (§0.4). An existing cache is never re-initialised.
- **No shared config writes.** `gc.auto=0` is passed as `-c` on every command
  rather than written to the cache's config. A concurrent `config.lock` then
  cannot fail a run (§0.4), and no automatic gc ever runs underneath another
  run's alternates.
- **Refresh, every run.** The fetch runs through
  `bp_request_transport_env <timeout> "$BP_FETCH_TIMEOUT" git -c gc.auto=0 --git-dir="$cache" fetch -q --no-tags "$remote" "+refs/heads/$branch:refs/bp-run/<nonce>"`.
  `<nonce>` is the basename of this run's scratch dir, so it is unique. Runs
  never update the same ref, so they never contend on a ref lock. The SHA this
  run answers from is `rev-parse refs/bp-run/<nonce>`, and nothing else.
- **Never stale.** If the refresh fails, times out or is interrupted, the run
  exits 5 (§3). No code path reads a ref it did not just fetch, and no fallback
  to an earlier ref exists.
- **Corruption.** Building the tree (§1.3) is the check, because §0.4 shows a
  damaged cache can refresh "successfully". A failure there exits 5 and names
  the cache path and `rm -rf <path>` as the remedy. The run does not delete the
  cache itself: another run may be reading through it.
- **Ceilings, stated rather than engineered away.** A SIGKILLed run (which no
  trap can see) leaves a `refs/bp-run/<nonce>` ref and possibly a `tmp_pack_*`
  file. INT and TERM leave neither. Neither affects correctness, since a run
  reads only its own ref. `# ponytail:` prune stale `bp-run` refs and temp packs
  when a real cache is seen to grow.

### 1.3 The per-run tree, and why that is the swap point

TASK-026 landed, so the swap point was re-read from the code rather than from
revision 1. Everything that reads the blueprint copy:

| Reader | Reads | Line |
|---|---|---|
| `bp_prospective_for` → `substituted_blueprint_copy` | the **content**. It locates and substitutes the copy, and is the one place that does | `:623`, `:520` |
| `cmd_drift` | **existence** (`[ ! -f "$bp" ]`) | `:1164` |
| `cmd_pull` selection and file loop | **existence** | `:1245`, `:1266` |
| `pull_file` | **mode**: `cp "$bp" "$f"` for a new file, then `_bp_sync_exec_bit` | `:637` |
| `bp_expand_managed_dirs` | the **shipped set**, `git -C "$BLUEPRINT_ROOT" archive HEAD` | `:874` |
| drift header, commits since sync, `bootstrap_sha` write | `rev-parse HEAD`, `rev-list`, `log` | `:1144–1153`, `:1364` |

**Decision: bind `BLUEPRINT_ROOT` to a tree built from the cache at the fetched
SHA.** The tree is `git clone -q --shared --no-checkout "$cache" "$scratch/tree"`
followed by `git -C "$scratch/tree" checkout -q --detach "$sha"`. Every reader
above then runs unchanged, `bp_prospective_for` included. It costs 27 ms and
120 KiB per run (§0.4).

**Rejected: swapping inside `bp_prospective_for`** (having it read
`git show <sha>:<path>` from the cache). That moves the content, but not the
existence and mode checks, the expansion or the history. Each of those would
need a git-object version of `bp_blueprint_path`, while the override path
(§5) keeps the filesystem one. Two answers to "does the blueprint have this
file" is BUG-113's shape, drift and pull disagreeing, arriving by a different
route. The tree keeps one oracle for both paths.

- The tree is a fresh detached checkout, so it can never be in the
  staged-but-uncommitted `git mv` state where Stage A′'s two oracles diverge
  (§6).
- **BUG-110.** The tree's own `.git` is nearer than any ancestor marker
  (measured, §0.4). The cache is always addressed with `--git-dir`. No command
  resolves a root from the scratch parent. Pinned by §9.2 #19.
- Every git command on the cache and the tree runs through
  `bp_request_transport_env`. `drift` can run inside a hook, where `GIT_DIR`
  redirects git (BUG-077), pinned by §9.2 #15.

### 1.4 Scratch, signals and writes

- **Order,** so that cheap failures happen before any network:
  config (4) → timeout provider (5) → `mktemp -d "${TMPDIR:-/tmp}/blueprint-sync.XXXXXXXX"` (5)
  → create the cache if missing (5) → refresh (5) → build the tree (5) → compare
  and write.
- **State lives in globals** (`BP_SYNC_SCRATCH`, `BP_SYNC_CACHE`, `BP_SYNC_REF`,
  `BP_SYNC_CHILD`), never locals. a2bp once leaked a clone per run because a
  `local` was out of scope when the EXIT trap fired.
- **Handlers.** Measured shape (§0.4):

  ```bash
  _bp_sync_cleanup() {        # idempotent; if-form throughout, because set -e
    if [ -n "$BP_SYNC_CHILD" ]; then kill "$BP_SYNC_CHILD" 2>/dev/null || true; fi
    if [ -n "$BP_SYNC_REF" ]; then
      git -c gc.auto=0 --git-dir="$BP_SYNC_CACHE" update-ref -d "$BP_SYNC_REF" 2>/dev/null || true
    fi
    if [ -n "$BP_SYNC_SCRATCH" ]; then rm -rf "$BP_SYNC_SCRATCH"; fi
    BP_SYNC_CHILD="" BP_SYNC_REF="" BP_SYNC_SCRATCH=""
  }
  _bp_sync_on_signal() { _bp_sync_cleanup; trap - "$1" EXIT; kill -s "$1" "$$"; }
  trap _bp_sync_cleanup EXIT
  trap '_bp_sync_on_signal INT' INT
  trap '_bp_sync_on_signal TERM' TERM
  ```

  On INT or TERM the run cleans up, removes its handlers and dies of the same
  signal, so the caller sees 130 or 143 and nothing after the signal runs. EXIT
  covers `die` (`exit 1`) and normal returns. **Nothing is preserved because
  nothing exists to preserve:** no other trap is installed on the drift or pull
  path (checked across `scripts/blueprint` and every lib it sources). a2bp's is
  a separate command.
- **The refresh runs in the background, and the run `wait`s on it**
  (`wait "$BP_SYNC_CHILD" || rc=$?`). A trapped signal interrupts `wait` at once.
  In the foreground, bash would defer the handler until the fetch returned,
  which can be up to the timeout.
- **Writes are shielded.** A terminal Ctrl-C signals the whole process group,
  writer included, and an unshielded `cat "$out" > "$f"` truncated the project
  file (§0.4). Every write to a project or config file (`pull_file`'s `cat`, its
  two `cp`s, and the `bootstrap_sha` `sed -i`) goes through:

  ```bash
  _bp_shielded_write() { ( trap '' INT TERM; exec cat "$1" > "$2" ); }
  ```

  The redirect sits **inside** the subshell, after the ignore, so no gap exists
  in which the file is truncated but the writer is still killable. The parent's
  handler runs once the write returns, and it exits, so the next write never
  starts. `cp`'s mode-carrying role in the new-file case becomes `cat` plus the
  existing `_bp_sync_exec_bit`, which already mirrors the only bit that matters
  (BUG-008).
- **Timeout.** `bp_staleness_timeout_cmd`, budget `BP_FETCH_TIMEOUT`, default
  30 s. A missing provider is a 5, not an unbounded fetch.
- `# ponytail:` HUP is not handled. Add it to the same handler if a closed
  terminal is ever seen to leave debris.

---

## 2. Which commit is "the blueprint"

**Under contract T (§2.1), which this plan is written for:** the tip of
`blueprint_branch` on `blueprint_remote`, as fetched by this run into its own
ref. `CURRENT_SHA` is that SHA, and the tree's `HEAD` equals it.

- **`drift`** lists `BOOTSTRAP_SHA..CURRENT_SHA` from the tree, whose history
  comes through alternates. All three projects' bootstrap SHAs exist on the
  remote.
- **`bootstrap_sha` absent from the fetched history** (recorded from an unpushed
  or rewritten commit, §0.2 #4). `git cat-file -e "$BOOTSTRAP_SHA^{commit}"`
  fails, and drift prints one explicit line: *"bootstrap_sha `<x>` is not in
  `<remote>` `<branch>` history. It was recorded from a commit that was never
  pushed or was rewritten, so commits since sync are unknown."* Exit 0, since
  the file comparison is still valid. **If the commit is present but `rev-list`
  fails, that is a damaged cache, and it exits 5** rather than printing "unknown"
  (today's `2>/dev/null || echo "?"` makes the two look the same).
- **`pull`** writes the **full** fetched SHA into `bootstrap_sha`, and only on a
  full pull (BUG-016, unchanged).
- **The remote moves between `drift` and `pull`:** `pull` refreshes, previews
  what it will apply, and records the commit it applied.
- **Header:**

  ```
  blueprint:  git@github.com:LuizStruct2Flow/blueprint.git  (main)
  fetched:    <full sha>  at 2026-09-14T15:02:11Z
  ```

### 2.1 The product contract — OPEN FOUNDER QUESTION, not decided here

Revision 1 presented "compare against the latest tip" as if it were technically
forced. **It is not; it is a product choice** (§R #4). Two readings of "is this
project in sync with the blueprint?":

- **T — latest tip.** *"The project matches the newest blueprint on
  `blueprint_branch`."* This plan as written.
- **P — pinned.** *"The project matches the blueprint version it recorded
  (`bootstrap_sha`). Whether a newer one exists is a separate line."*

| | **T (latest tip)** | **P (pinned)** |
|---|---|---|
| What drift compares against | the fetched tip | the tree at `bootstrap_sha` |
| Right after a full `pull` | clean until the blueprint moves | clean until the project edits a file |
| Offline, pin already in the cache | **5**, nothing compared | **0**: conformity to the pin is reported, plus *"newer blueprint: unknown (could not reach `<remote>`)"*. It is never worded as "in sync with the latest" |
| Offline, pin not in the cache | 5 | 5 |
| Refresh failure | always 5 | 5 only if the pin is missing from the cache; otherwise availability is "unknown" |
| `pull` with no paths | moves to the tip (unchanged) | moves the pin to the tip (unchanged) |
| After a **partial** pull | pulled files match, the rest show drift | **pulled files show as drift against the old pin** (the project is ahead of it). Needs its own wording, or BUG-016's rule reopens |
| `bootstrap_sha` absent from history | the explicit line, exit 0 | **cannot compare at all: 5** |
| Wake protocol, CLAUDE.md | four cases (§3) | a fifth: *"in sync with pin X; newer: N commits / unknown"* |
| Cache design (§1) | as written | unchanged. The refresh is still attempted every run; it only changes what a failure means |
| Tests that change | — | #5 (report shows availability, not drift), #13, #14, #25 (failed refresh with pin cached → 0 + "unknown"), a new partial-pull wording case |
| Option B | B's offline advantage stands | **gone**: A with the cache answers the same narrower question offline |

The backlog row's wording (*"an offline wake must say could not reach the
blueprint rather than report clean"*) reads naturally as T, and both columns
satisfy it. That is why this is recorded as a question and not inferred. **The
implementation shape survives either answer.** The cache, the tree, the handlers
and the harness changes are identical, and P adds one branch in `cmd_drift` plus
the wording above.

---

## 3. Offline and failure behaviour; exit statuses

**A failed refresh never yields a report.** Nothing falls back: not to a local
checkout, not to a cached ref, not to an empty tree. The "CLI's own checkout"
resolver step is removed from the address path, because on the day the network
fails it would quietly bring back the local-folder answer this task deletes
(F-002).

| Status | `drift` | `pull` |
|---|---|---|
| **0** | report produced against this run's freshly fetched tip (drifted or not, unchanged); or in the blueprint itself (unchanged) | pulled, or nothing to pull (unchanged) |
| **1** | `die`: no `.blueprint-source`, expansion failure (unchanged) | same |
| **4** | config refused by `bp_config_load`: version 1 without override, placeholder or empty remote, invalid branch, version too new | same |
| **5** | **could not read the blueprint**: remote unreachable; **branch missing on a reachable remote** (its own message); timed out; no timeout provider; scratch not creatable; cache not creatable; **cache damaged** (tree build or history read failed) | same, and **nothing is written** |
| **7** | — | refused, no TTY without `--yes` (unchanged) |
| **130 / 143** | interrupted by INT / TERM: cleaned up, then died of the signal | same; nothing written after the signal |

Status 5 always prints to stderr, with the second line specific to the cause:

```
error: could not read the blueprint at <remote> (<branch>)
  <"no branch '<branch>' on that remote" | "timed out after 30s" | git's first error line |
   "cache <path> is damaged — remove it (rm -rf <path>) and run again">
  Nothing was compared. This is NOT a clean drift report.
  Offline? Compare against a local checkout explicitly:
    BLUEPRINT_ROOT=<path to a blueprint checkout> blueprint drift
```

**Wake protocol:** CLAUDE.md §"Wake-time drift check" gains a fourth case in the
same commit: *"4. Unreachable — non-zero, says so. Tell the founder the drift
check did not run. Do not report the project as in sync."*

---

## 4. Telling fresh from cached

The cache holds objects, never answers. **Every report comes from a ref this
run just fetched.** The header's `fetched: <sha> at <UTC>` is this run's refresh
time, not the cache's age, so there is no "cached N minutes ago" state to show.

- **Address path:** header as in §2. `report_staleness` does not run, since there
  is no local checkout for it to judge.
- **Override path** (`BLUEPRINT_ROOT` set): the header reads
  `blueprint: LOCAL CHECKOUT <path> (BLUEPRINT_ROOT override, not the published address)`,
  and `report_staleness` runs as today. The cache is not touched.

---

## 5. What still needs a local checkout

| Case | Behaviour |
|---|---|
| **The blueprint itself** | Unchanged. `_bp_is_blueprint_itself` returns before any config is read. Pinned by `tests/drift-in-blueprint` |
| **`BLUEPRINT_ROOT` override** | **Kept, the only local path.** Used for previewing an unpushed blueprint change, working offline, and **recovery** (below). Per shell, never committed |
| **`blueprint_source` field** | **Ignored.** While present, drift prints one dim line: *"blueprint_source is no longer read (TASK-025). Remove it from .blueprint-source."* |

**Recovery property (§9.2 #12).** The override path does not source the network
libraries (`request.sh`, `request-config.sh`). A project that pulled the new CLI
without its libs can still run
`BLUEPRINT_ROOT=<checkout> blueprint pull scripts/lib/request.sh scripts/lib/request-config.sh`.
The address path sources them lazily, and fails with 1 plus that command if they
are missing (BUG-028's shape).

---

## 6. The layout inside the fetched tree (Stage A′ / Stage B)

Unchanged from revision 1, because the per-run tree is a real working tree:
`bp_blueprint_path`'s `[ -e ]` and `bp_expand_managed_dirs`' `archive HEAD` both
answer about the fetched commit. A fresh detached checkout has nothing staged, so
the one divergence Stage A′'s comment justifies cannot occur on the address
path. The override path keeps it, as today. Proven by §9.2 #10: all four
`blueprint-relocation` shapes served through a remote, with that suite's
mutants A, B, C, D and F re-applied.

---

## 7. Migration

### 7.1 The config

| Project state | New behaviour |
|---|---|
| v2, real `blueprint_remote` (all three today) | reads the remote; `blueprint_source` is ignored and nagged |
| v2, `blueprint_remote = FILL-ME-IN` (fresh bootstrap) | **4**, `bp_config_load`'s message, plus *"or export BLUEPRINT_ROOT=<checkout>"* |
| v1 | **4**, `bp_config_load`'s message, plus the same hint. The remote is never inferred from a checkout's `origin` |
| any version, `BLUEPRINT_ROOT` exported | local override, labelled |

Validation is `bp_config_load`, reused as it is. `scripts/new-project.sh` stops
writing `blueprint_source`, deletes `_relative_path`, and keeps the `FILL-ME-IN`
placeholder. `read_blueprint_source`'s unregistered-project message stops
suggesting `blueprint_source`.

### 7.2 Order of operations

1. ~~PR #66 decided.~~ **Done:** TASK-026 implemented it.
2. **TASK-025 lands in the blueprint and is pushed.** Projects read what is
   published, so an unpushed TASK-025 is invisible to them by design.
3. **Each project pulls the new CLI with its current CLI,** through the
   still-unchanged wrapper. The pull list is **derived, not hand-counted**
   (review): `scripts/blueprint`, plus every `scripts/lib/*.sh` it sources,
   transitively. Collect the list with `grep -o 'lib/[a-z-]*\.sh'` over the CLI
   and each lib found, until nothing new appears. It is a partial pull, so
   `bootstrap_sha` is left alone (BUG-016).
4. **Verify before changing anything else:** in the project, `bash
   scripts/blueprint drift` must print a header naming the remote and exit 0 or
   show drift, never 1.
5. **Delete `blueprint_source`** from `.blueprint-source`, in the same project
   commit as step 3.
6. **Only then replace the wrapper on each machine** (§8.1). Until step 4 passes
   in every project, the old wrapper is the recovery path and must stay.
7. **Only then Stage B.**

### 7.3 Per project

- **linkedin-watcher-agent.** Local CLI present. Steps 3–5 as written.
- **struct2flow-www.** Local CLI present; its absolute `blueprint_source` goes at
  step 5. Its local copy carries PR #66's U1/U6 edits, and step 3 replaces them
  with TASK-026's implementation, with the diff shown.
- **storm2flow.** No local CLI and no `scripts/lib/`. Step 3's derived closure is
  the whole lib set. `bootstrap_sha` stays reserved for its slice S8. **Stage B
  waits for it.**

### 7.4 If the founder adopts a `released` branch (§12 Q2), the conditions

- **CI job**, in `security.yml`, `on: push` to `main` only, `needs:` every other
  job (`secret-scan`, `sast`, `sca`, `commit-subjects`, `shell-tests`,
  `ts-tests`): `git push origin "$GITHUB_SHA:refs/heads/released"` **without
  force**. It pushes the immutable tested SHA, never the moving `main`. A slower,
  older run is refused as non-fast-forward, which is correct: a newer green
  commit is already there. Permissions `contents: write` on that job only.
- **Migration, per project, before changing `blueprint_branch`:**
  `git merge-base --is-ancestor <bootstrap_sha> origin/released` must succeed.
  If it fails, the project was synced to a `main` commit that `released` has not
  reached, so wait for CI to catch up rather than switching. Otherwise
  `BOOTSTRAP_SHA..released` would print an empty or misleading history.
- **Test:** a fixture remote where `released` lags `main`, and a project whose
  `bootstrap_sha` is on `main` only. The migration check refuses it, and after
  `released` fast-forwards past it, the check passes.

---

## 8. The wrapper and Stage B

### 8.1 The wrapper

Unchanged from revision 1. TASK-025 does not by itself remove the Stage B
hazard, but it makes a wrapper possible that names no checkout:

```bash
#!/usr/bin/env bash
# Run THIS project's own blueprint CLI. The blueprint is read by its address
# (TASK-025), so no checkout path belongs in this file.
for c in ./scripts/blueprint ./scaffolding/scripts/blueprint; do
  [ -x "$c" ] && exec "$c" "$@"
done
echo "blueprint: no scripts/blueprint in $PWD. Run from a project root," >&2
echo "  or fetch the CLI once with: BLUEPRINT_ROOT=<checkout> bash <checkout>/scripts/blueprint pull scripts/blueprint" >&2
exit 1
```

It lives outside git, so it ships as README §"One-time setup" text. Whether
`install-toolchain.sh` writes it is a founder question (§12). Cost:
`blueprint files` and `help` then work only from a project root.

### 8.2 Stage B

Gate: **all three projects have completed §7.2 steps 3–5, and every machine has
the §8.1 wrapper.** Checkable: each project's drift header names a remote, and
`type -a blueprint` shows no path into the blueprint. It becomes a precondition
in `PLAN-TASK-021-RESTRUCTURE.md` in the implementation commit.

### 8.3 TASK-026 composes

BUG-113 put the comparison behind `bp_prospective_for`, which resolves through
`BLUEPRINT_ROOT` (§1.3). TASK-025 changes only what `BLUEPRINT_ROOT` is bound
to, so the shared comparison, its refusal of inverted markers, and pull's
preview all run unchanged against the fetched tree. §9.2 #9b pins that.

---

## 9. Tests

**All new coverage is TypeScript on `tests/harness`; no new shell test code.**
One new suite, `tests/sync-by-address/sync-by-address.spec.ts`. Suites are
discovered from the filesystem, so nothing needs registering.

### 9.1 Harness changes (land in the reproducer commit)

- **H1 — `BLUEPRINT_ROOT` reaches the real scrub boundary** (§R #3).
  - `ENV_KIND`: `BLUEPRINT_ROOT: 'path'`.
  - `env.ts`: `export const UNPREFIXED_FORBIDDEN = ['BLUEPRINT_ROOT'] as const`,
    and `FORBIDDEN_ENV`'s filter becomes
    `kind !== 'inert' && (/^(GIT|AGENT|BP)_/.test(k) || UNPREFIXED_FORBIDDEN.includes(k))`.
    It is **not** changed to a kind-based filter: that would drop
    `AGENT_FEED_TAG` (a `scenario-token` name) out of the list, which is a
    behaviour change nobody asked for.
  - `scripts/run-ts-suites.sh`: after the prefix loop at `:177`,
    `unset BLUEPRINT_ROOT`. That is a one-name second copy, pinned rather than
    trusted:
  - `tests/ts-bridge` #1c: the fixture exports `BLUEPRINT_ROOT` into the bridge,
    the `npx` stub records prefix names **plus** `UNPREFIXED_FORBIDDEN` names
    (imported, per BUG-063), and the assertion at `:215` accepts a name that is
    prefixed **or** listed there. Mutant: delete the `unset` → #1c red.
  - **Witness W1** (`harness.spec.ts`): with `process.env.BLUEPRINT_ROOT` set,
    `fixtureEnv()` has no `BLUEPRINT_ROOT`. Mutant: drop it from
    `UNPREFIXED_FORBIDDEN` → red.
  - **Witness W2:** `fixtureEnv({ BLUEPRINT_ROOT: ws.path('bp') }, ws.root)`
    keeps it; `fixtureEnv({ BLUEPRINT_ROOT: '/elsewhere' }, ws.root)` throws.
    Mutant: declare it `'opaque'` → the second half goes red. (The *label*
    half of "allowed and labelled" is the CLI's, and is sync case #6.)
  - Cost, stated: a direct `vitest run` from a shell with `BLUEPRINT_ROOT`
    exported is refused by `assertProcessEnvClean`, the same loud refusal
    `GIT_DIR` gets. The gate's runner unsets it.
  - Rejected: renaming the override into the `BP_` namespace.
    `BLUEPRINT_ROOT` is both the documented override in every project's managed
    docs and the CLI's own internal global throughout `scripts/blueprint`.
- **H2 — `XDG_CACHE_HOME` is scenario-owned** (new: the cache reads it). It is
  declared `'scenario-path'`, and `scenarioEnv` sets it to
  `join(s.home, '.cache')`. Otherwise an operator's ambient value would put
  every fixture's cache in their real cache directory. Witness: an ambient value
  is replaced; an override outside the workspace is refused. Mutant: remove it
  from `scenarioEnv` → red.
- **H3 — `GIT_SSH_COMMAND` and `GIT_SSH` are declared `'denied'`** (new). They
  are undeclared today, so an ambient value is **inherited** by fixtures in a
  direct vitest run, and it would override the `ssh` PATH shim every hang case
  relies on. The `GIT_` prefix keeps the ts-bridge invariant intact. Witness: an
  ambient `GIT_SSH_COMMAND` is absent from `fixtureEnv()`. Same direct-run cost
  as H1.
- **H4 — `s.pathWithout(names)`**: a `PATH` of one workspace directory holding
  symlinks to every executable on the current `PATH` (first occurrence wins),
  except `names`. It is derived, not hand-listed. It gives the
  no-timeout-provider case a contained fixture, which `staleness.spec.ts:179`
  records does not exist today.
- `BP_FETCH_TIMEOUT: 'opaque'`.

Remotes are workspace paths, or `ssh://git@127.0.0.1/blackhole.git` behind the
FIFO-blocking `ssh` shim that `tests/staleness` #8 uses. With H3, nothing can
reach a real host.

### 9.2 Cases, each with its mutant (R6)

Observed red sets are recorded in the suite header at implementation time, as
`blueprint-relocation.spec.ts` does. Every failure case asserts **both** stdout
and stderr contain no `✓ All blueprint-managed files match` and no `~`/`+`/`!`
report line.

**Seams for stage-precise signals, all deterministic (R4: no sleeps).** A shim
writes a `reached` marker and then blocks on a FIFO. The test waits for the
marker, sends the signal, **then** opens the FIFO so the shim returns, and waits
for the process to exit.
- Fetch: the `ssh` shim.
- Compare: a `diff` shim.
- Write: a `mkdir` shim (`cmd_pull` calls `mkdir -p` immediately before
  `pull_file`).
- Mid-write: a `cat` shim that blocks only when its first argument contains the
  fixture's sentinel line, then execs the real `cat`.

| # | Case | Mutant that must turn it red |
|---|---|---|
| 1 | `drift` reads the remote when **no local checkout exists**. The report matches the remote; the header names the remote and the fetched SHA | resolver keeps the CLI's-own-checkout step |
| 2 | **A stale sibling named by `blueprint_source` is not consulted** | restore `blueprint_source` precedence |
| 3 | **Unreachable remote** (a nonexistent workspace path) → **5**, `could not read the blueprint` | `fetch … \|\| true`, or fall back to the CLI's checkout |
| 4 | **Hung remote** (`ssh` FIFO shim, `BP_FETCH_TIMEOUT=2`) → **5**, mentions the timeout, within a measured bound | remove the `timeout` wrapper |
| 5 | **The remote advances between two runs sharing one cache.** Run 2 reports tip B and the newly drifted file | answer from the cache without refreshing (reuse the newest `refs/bp-run/*`) |
| 6 | **Override works offline and is labelled.** `BLUEPRINT_ROOT` in the workspace, remote unreachable → 0, `BLUEPRINT_ROOT override`, staleness line present, cache dir **not created** | ignore the override; drop the label; refresh anyway |
| 7 | **Config v1** → **4**; plus override → 0 | infer the remote from `origin` |
| 8 | **Placeholder remote** → **4**; the `ssh` shim records zero invocations | skip the placeholder arm |
| 9 | **A full `pull --yes` records the full fetched SHA**; a partial pull leaves `bootstrap_sha` byte-identical | short SHA, or record on a partial pull |
| 9b | **BUG-113 through the remote:** a marker file whose managed region matches and whose project tail differs is not drift, is not selected by pull, and is not previewed as deleted | read the blueprint copy outside `bp_prospective_for` |
| 10 | **All four `blueprint-relocation` shapes served through a remote**; that suite's #1–#7 unchanged, #8 rewritten (it asserted the removed resolver step) | that suite's mutants A, B, C, D, F; red sets must match |
| 11 | **Scratch removed on normal exits:** after 0, after 5 (#3), after 1 (a remote whose `tests/` holds only export-ignored files). No `blueprint-sync.*` under `TMPDIR`, no `refs/bp-run/*` left in the cache | make `BP_SYNC_SCRATCH` a `local`; skip the ref delete |
| 12 | **Recovery**: missing `request-config.sh` + override → pull lands it, 0; without override → 1 and prints the command | source the network libs unconditionally |
| 13 | **Unpushed commits are not reported** (§0.2 #4) | read the working repo instead of the remote |
| 14 | **`bootstrap_sha` absent from remote history** → explicit line, 0 | restore `2>/dev/null \|\| echo "?"` silently |
| 15 | **Hook context**: explicit `GIT_DIR` at the project's `.git`; the project's `.git/config` is byte-unchanged (canary) | call git without `bp_request_transport_env` |
| 16 | **Reachable remote, branch missing** → **5**, stderr says no such branch on that remote, and does **not** say it could not connect | treat a missing ref as an empty tree, or fetch the remote's `HEAD` instead |
| 17 | **No timeout provider** (`PATH` from `pathWithout(['timeout','gtimeout'])`, local remote) → **5** before any fetch; no cache created | run the fetch unbounded (it would succeed locally → 0) |
| 18 | **Scratch not creatable** (`TMPDIR` = a regular file inside the workspace) → **5**; no cache created, no project write. Works as root too, which a `chmod` would not | `mktemp … \|\| true`, or fall back to `$PWD` |
| 19 | **BUG-110:** a `gitdir:` `.git` file at `<workspace>/tmp/.git`, above every scratch, pointing at a decoy repo with different content → 0; the report matches the remote, not the decoy; the decoy's refs and config are byte-unchanged | resolve the tree with `git -C "$scratch" rev-parse --show-toplevel` |
| 20 | **INT and TERM during fetch** (`ssh` shim) → died of that signal; no scratch; no `refs/bp-run/*`; project files and `.blueprint-source` byte-identical | revision 1's trap: `trap cleanup EXIT INT TERM` without exit → the run continues |
| 21 | **INT and TERM during compare** (`diff` shim), same assertions | same |
| 22 | **INT and TERM at pull's write step** (`mkdir` shim, `pull --yes` with drift present), same assertions: **no file written after the signal** | same; also: move the handler install after the refresh |
| 23 | **Group INT mid-write** (`cat` shim; signal sent to the process group) → the target file holds the **complete** new content (never truncated), `.blueprint-source` is unchanged, and the run died of INT | remove `_bp_shielded_write` (file left empty), or move the redirect outside its subshell |
| 24 | **Concurrent runs, one cache.** A blocks in compare (its own `diff` shim dir). B runs a full drift with the same `HOME` → 0. The remote advances; C runs → 0 at the new tip. A is released → 0, its header SHA and "commits since sync" are **its own tip**, not C's. All scratch gone, cache valid | (a) cleanup deletes the cache or all `refs/bp-run/*` → A's history read fails; (b) read the log from a shared branch ref instead of the run's SHA → A lists C's commits |
| 25 | **Failed refresh with a warm cache.** Run 1 succeeds; the remote is then made unreachable; run 2 → **5**, although the cache holds a complete answer | on fetch failure, use the newest cached ref |
| 26 | **Interrupted refresh leftovers.** The cache is pre-seeded with what a SIGKILL leaves (§0.4): a `tmp_pack_*` file, a dead `refs/bp-run/<nonce>` at an **older** commit, and that ref's `.lock` → next run 0 at the current tip | pick "the newest `bp-run` ref" instead of the run's own |
| 27 | **Damaged cache.** (a) the tip's root tree object deleted (§0.4) → **5** naming the cache path and `rm -rf` remedy; (b) a truncated pack → 0 with a byte-correct report (git heals it, measured) | `checkout … \|\| true`, or fall back to the previous tree; for (b), treating any `error:` on stderr as corruption |
| 28 | **Concurrent first runs:** 8 parallel `drift` from no cache → all 0, one cache dir, no `.bp-cache-init.*` debris. A smoke case (0/160 measured), not mutant-deterministic; its deterministic partner is **#28b**: a stray `.bp-cache-init.X` directory already inside a valid cache (a lost race's leftover) → 0 and the stray is gone | plain `git init` over an existing path (its `config.lock` fails); skip the nested-temp removal |

### 9.3 Existing suites that migrate their fixtures

| Suite | Change |
|---|---|
| `blueprint-relocation` | §9.2 #10 |
| `suite-sync` | retarget to `blueprint_remote`; re-run its #1c mutant |
| `bootstrap-contents` | asserts `blueprint_source` is **absent** |
| `pull-behaviour`, `marker-merge`, `drift-in-blueprint`, `bootstrap-gate` | retarget |
| `staleness` D#1–D#5 | now the override path: set `BLUEPRINT_ROOT` (permitted by H1) |
| `a2bp-e2e`, `a2bp-inputs`, `a2bp-contamination` | a2bp never reads the field; leave as they are and confirm green |
| `harness`, `ts-bridge` | H1–H3 witnesses and #1c (§9.1) |

---

## 10. Implementation shape (for review, not authorised)

Two-commit reproducer pattern (DoD §3):

1. **`TASK#25: minimal reproducer (failing)`** — H1–H3 with witnesses W1/W2
   and the H2/H3 witnesses, plus §9.2 #1, #2, #3, #13. They fail on the parent:
   ambient `BLUEPRINT_ROOT`, `XDG_CACHE_HOME` and `GIT_SSH_COMMAND` all reach
   fixtures today; the CLI reads `blueprint_source`; on #3 it falls back to its
   own checkout and exits 0; and it reports unpushed commits.
2. **`TASK#25: drift and pull read the blueprint by its address`** — the CLI
   change (§1–§4), H4, the remaining cases, the §9.3 migrations, and the
   same-commit ripples: the `scripts/blueprint` header; `README.md` §"The sync
   model"; CLAUDE.md §"Wake-time drift check" (fourth case) and `templates/` if
   it mirrors it; `scripts/new-project.sh`; the `staleness.sh` header;
   `docs/way-of-working.md` sync slides; `PLAN-TASK-021-RESTRUCTURE.md` (§8.2).

**Expected diff in `scripts/blueprint`:**
- `_bp_fetch_blueprint`: cache, refresh, tree, error text, about 70 lines
- the two handlers and `_bp_shielded_write`: about 15 lines
- `_bp_resolve_blueprint_root` shrinks to "override, or nothing"
- `read_blueprint_source` gains the address/override branch
- `pull_file`'s writes go through `_bp_shielded_write`
- the drift header, pull banner and bootstrap-history message change

**Rollback:** revert the two commits. Projects that already pulled the new CLI
recover through `BLUEPRINT_ROOT=<checkout> blueprint pull scripts/blueprint`
(§5, #12). Caches under `~/.cache/struct2flow/` are inert without the new CLI
and can be deleted.

---

## 11. Option B: the blueprint as an npm package

### 11.0 Measured for this option

| Claim | Check | Result |
|---|---|---|
| All three derived projects are Node | `ls` | lwa and www have a root `package.json`; **storm2flow has none at the root** |
| The managed `tests/package.json` is present | `ls` | in lwa and www, not in storm2flow |
| The blueprint has a root `package.json` | `ls` | no |
| Blueprint repo visibility | `gh repo view` | **PUBLIC** |
| The CLI resolves its libs through the path it was invoked by | `grep BASH_SOURCE` | 7 sites; 6 use unresolved `dirname`, which breaks under npm's `.bin` symlink |
| What bootstrap ships | `new-project.sh` | `git archive HEAD`, `.gitattributes` export-ignore as the boundary |
| **npm packs a CI-generated payload** (revision 2) | `npm pack --dry-run` of `git archive HEAD` extracted under one `files` entry | **140 / 151: the payload's `.gitignore` dropped `CLAUDE.md`, `AGENTS.md`, `AGENT_SIGNAL.md`, `docs/DoD.md`, `docs/PUBLISHING.md`, `.claude/settings.json`, `scripts/new-project.sh` and more.** With an empty `.npmignore` in the payload: 150 / 151. **npm never packs `.gitignore`** |

### 11.1 Mechanism

The blueprint gains a root `package.json` with a `bin` and one `files` entry.
Projects add it as a devDependency, pinned by the lockfile. `drift`/`pull` set
`BLUEPRINT_ROOT` to the installed package.

### 11.2 Corrections

**Revision 2, per review finding 4:**

- **"Before Stage B, B needs a third copy of `MANAGED_FILES`": withdrawn.** CI
  can build the payload from `git archive HEAD`, so export-ignore stays the one
  authority (measured, §11.0). Two traps come with it, and B would need a test
  for each:
  1. The payload **must** carry an empty `.npmignore`. Without one, npm reads the
     payload's `.gitignore` and silently drops the managed files the privacy
     block lists. That is BUG-029's silent-under-sync shape, and it would surface
     as `+ CLAUDE.md` in no project at all.
  2. `.gitignore` cannot ship through npm. It is not managed, but bootstrap
     seeds it, so a tarball bootstrap needs a rename-on-publish, restore-on-
     bootstrap step.
- **"B does not remove the network from an honest wake": contract-dependent**
  (§2.1). Under T it holds. Under P, "matches pinned X; newer: unknown" is a
  complete offline answer, **and A with the cache gives exactly the same
  answer**. So under either contract, offline is not a differentiator.

**Still standing from revision 1:**
- the wake command becomes `npx blueprint`, and the allowlist and CLAUDE.md
  change with it;
- a fresh clone cannot run drift until `npm ci` (A-22's shape);
- the `.bin` symlink breaks 6 lib sites;
- osv-scanner reading the lockfile is worth nothing here;
- the installed package is not a git repository, so expansion, history and
  `bootstrap_sha` are redesigned.

### 11.3–11.7

Unchanged from revision 1 (release semantics, costs, storm2flow manifest
placement, registry, tests under B), except as follows:

- §11.3's green-CI branch for A now carries the conditions in §7.4.
- §11.4's "sequenced after Stage B" is softened. The payload approach removes
  that dependency, and the costs remain: every `npm ci` needs the registry, a
  new publish credential, storm2flow's manifest decision, and the two npm traps
  above.

### 11.8 Side by side (revision 2)

| | **A: git remote + cache** | **B: npm package** |
|---|---|---|
| Network at wake | one warm fetch (WAN 1.51 s measured, rev 1; local 5–7 ms) | none for conformity to the installed version; `npm view` for availability |
| Offline wake | T: **5**. P: conformity to the cached pin + "newer: unknown" | conformity to the installed version + "newer: unknown" |
| Cache and integrity | persistent bare cache, git object hashes, per-run ref; corruption → 5 | npm cache; lockfile `integrity` |
| What pins "the blueprint" | T: branch tip. P: `bootstrap_sha` | installed version; `bootstrap_sha` removed |
| CLI invocation | project-local `scripts/blueprint` via a cwd wrapper | `npx blueprint`; needs `npm ci` first |
| CI impact | none | every `npm ci` needs the registry |
| New credentials | none | a publish token; install tokens if private |
| "What ships" boundary | unchanged | payload from `git archive` + mandatory `.npmignore`; `.gitignore` needs special handling |
| `cmd_drift` change | resolver, cache, tree, handlers, header | lib-root resolution, expansion rewrite, version-vs-latest, `bootstrap_sha` removal |
| Sequencing vs TASK-021 | before Stage B, and unblocks it | no longer forced after Stage B; does not unblock it (the wrapper does) |
| Reversibility | revert two commits; the override is the recovery path | unpublish/deprecate, edit three projects, restore allowlist and wake command |

### 11.9 Recommendation (the author's)

**Build A with the review's changes. B stays a possible successor.**

1. **A unblocks Stage B, and B does not.** The wrapper in §8.1 needs a
   project-local CLI that can read the blueprint without a checkout, which is
   A.
2. **Offline answers no longer separate them** (§11.2). Whichever contract the
   founder picks, A with the cache gives the same offline answer B would.
3. **B's green-CI gate is available to A** under §7.4's conditions.
4. **B puts the blueprint on every `npm ci`, CI included**, and adds two
   silent-drop traps (§11.2) that A does not have.
5. **Being wrong costs more one way than the other.** If B wins later, the
   harness changes, the handlers, the override and recovery, the fixture
   migrations and the wrapper all survive. `_bp_fetch_blueprint` is what gets
   thrown away.

**Re-open B when** a derived project is maintained by someone without read
access to the blueprint remote, or the blueprint wants semver releases for a
reason beyond gating fan-out.

---

## 12. Open questions

**For the founder** (this plan does not decide them):

1. **The contract, T or P** (§2.1). The implementation shape survives either
   answer; only the wording and one drift branch differ.
2. **A `released` branch** under §7.4's conditions, or stay on `main`?
3. **The `blueprint_source` nag** (§5): one dim line per run until removed, or
   refuse (4) after a date?
4. **The wrapper** (§8.1): should `install-toolchain.sh` own it?

**For the re-review:**

5. **`BP_FETCH_TIMEOUT` default 30 s.** Under the cache, a warm refresh is one
   round trip, and only a cold first run transfers the pack. Should the default
   be lower for warm runs, or is one budget simpler and enough?
6. **§9.2 #28 is a smoke case,** with #28b as its deterministic partner. Is
   that pairing acceptable under R6, or should the concurrent-creation race get
   a seam of its own?
