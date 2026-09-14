# PLAN — TASK-025: `drift` and `pull` read the blueprint by its address

**Status:** PLAN, **revision 6**. Alexey's re-review of revision 2 (Codex)
returned *"build with these changes"*, and both technical changes are in (§R2).
The founder decided the four open questions on 2026-09-14 (§R3), and revision 4
writes them in. Alexey's review of revision 4's additions returned *"revise
again"* with four findings, all on commits 3 and 4, the migration and the
rollback; revision 5 answers them (§R4). His re-review of revision 5 returned
*"build with these changes"* with one new finding, on where commit 4's
replacement mode validates the command; revision 6 answers it (§R5). **Commits
1 and 2 are unchanged by revisions 5 and 6** and remain unblocked, in the commit
order of §10.
Author: Christian (Senior Architect), revisions 1–4; Philipp (Infrastructure),
revisions 5–6. All 2026-09-14.

**Two options were on the table; the review chose A with changes.**

- **Option A: the git remote.** §1–§10.
- **Option B: the blueprint as an npm package.** §11, kept as the record of why
  it was not chosen (§11.9).

**Founder decision, 2026-09-14:** *"what if we keep track of the repository
address of the blueprint? It doesn't matter where it is physically."*

**Scope:** `cmd_drift`, `cmd_pull`, `read_blueprint_source`,
`_bp_resolve_blueprint_root` and `pull_file` in `scripts/blueprint`;
`bp_config_load` in `scripts/lib/request-config.sh` (one new optional field,
§7.4); `scripts/new-project.sh`; `scripts/install-toolchain.sh` (the
per-machine `blueprint` command, §8.1); one job in
`.github/workflows/security.yml` (§7.4); the test harness
(`tests/harness/env.ts`, `tests/harness/index.ts`, `scripts/run-ts-suites.sh`)
and the fixtures of the suites that drive them. The behaviour of `a2bp`, `prs`,
`files` and `help` is untouched; §9.2 #31 pins that a2bp's PR base does not move.

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
| 4 | B's "must wait for Stage B" and "no offline wake" are framing, not constraints | **Adopted in part, measured.** (a) A payload built by CI from `git archive`, under one `files` entry, does avoid a third copy of the managed list. **But npm silently dropped 11 of 151 shipped files, including `CLAUDE.md` and `docs/DoD.md`.** The payload carries the blueprint's `.gitignore`, whose privacy block lists tracked files, and npm treats that as ignore rules. An empty `.npmignore` fixes it (150 of 151). The last file is `.gitignore`, which npm never packs. So the claim holds, with two traps it did not name. (b) The offline point depended on the product contract. The founder chose "latest tip" (§2.1), under which neither A nor B can say "newest" offline, so offline is not a reason to pick B. | §2.1, §11.2, §11.9 |
| 5 | Missing tests: missing branch, no timeout provider, scratch not creatable, INT and signals mid-compare / mid-write, concurrency, corruption | **Adopted.** Measured: a reachable remote with a missing branch fails with status 128 and `couldn't find remote ref`, which the CLI reports separately from a transport failure. Staleness records that no contained way exists to hide `timeout` (`staleness.spec.ts:179`). This plan adds one: a PATH made of symlinks to every executable on the current PATH except the hidden names. Every ssh case is pinned by scrubbing `GIT_SSH_COMMAND`/`GIT_SSH` (finding 3), not by relying on PATH order. | §9.2 #16–#27 |
| 6 | A `released` branch needs the tested SHA and an ancestry check | **Adopted, and the founder adopted the branch itself (§R3).** CI pushes `$GITHUB_SHA` (never the moving `main`) without force, after every other job in `security.yml`, on `push` events only. An older job loses the non-fast-forward race by design. Before a project switches to `released`, migration checks that its `bootstrap_sha` is an ancestor of `released`. | §7.4 |
| 7 | BUG-110: prove the fetched root is exactly the tree | **Adopted as a test, measured.** With an ancestor `.git` present, as an empty directory or as a `gitdir:` file, the tree's top level was exactly the tree in both cases. Discovery from the scratch parent failed in both. The cache is only ever addressed with `--git-dir`, so it runs no discovery at all. **Declined:** a `GIT_CEILING_DIRECTORIES` guard on top. Nothing it would stop was reproduced, and the test pins the property. | §1.3, §9.2 #19 |

**Also found, out of scope, flagged to the orchestrator:** `a2bp` installs the
exact trap shape finding 1 reproduced (`trap _a2bp_cleanup EXIT INT TERM`,
`scripts/blueprint:1497`), and a2bp pushes and opens PRs after it. The same
continuation is likely there, but it was **not** reproduced against a2bp itself.
It needs its own bug row.

## R2. Response to the re-review (revision 3)

Alexey found findings 1, 2 and 5–9 and 11 resolved. The three that were not:

| # | Finding (short) | Answer | Where |
|---|---|---|---|
| 3, 10 | Direct vitest runs still inherit **undeclared** ambient `GIT_*` / `AGENT_*` names; the bridge unsets the whole prefix population, so the two run modes differ | **Adopted. Checked against the code, and it holds.** `fixtureEnv` deletes `FORBIDDEN_ENV` (`env.ts:534`), which is built from *declared* names only (`:267`), then any `GIT_CONFIG*` (`:543`). `assertProcessEnvClean` checks `FORBIDDEN_ENV` only (`:579`). `overrideKind` refuses an undeclared name as an explicit **override** (`:289`) but nothing removes it as an **ambient** value. `run-ts-suites.sh:177` unsets every `GIT_`/`AGENT_`/`BP_` name. No other path covers the gap. So `GIT_EXEC_PATH`, `GIT_ASKPASS`, `GIT_ALLOW_PROTOCOL` and every future git name reach fixtures in a direct run. New rule H5: undeclared ambient `GIT_*`/`AGENT_*` are scrubbed by `fixtureEnv` and refused by `assertProcessEnvClean`; declared `inert` names are kept. ts-bridge #1c compares that rule, not the declared list. H3's two declarations become unnecessary and are dropped, and its witness moves under H5 | §9.1 H5 |
| 4 | T versus P is still open, and the implementation does **not** survive both answers unchanged | **Adopted.** Revision 2's sentence saying it did is withdrawn. The founder has since chosen T (§R3), and the plan is written for T only | §2.1, §2.2 |
| 8 | Case #23 pins group INT only; the measured contract covers group TERM too | **Adopted.** #23 now sends group INT and group TERM, as two runs | §9.2 #23 |

## R3. Founder decisions (revision 4)

Recorded 2026-09-14. Each one is written into the section named. The TASK-025
backlog row carries the same four.

| # | Question | Decision | Where |
|---|---|---|---|
| 1 | What does `drift` mean? | **T:** *"matches the newest blueprint on its branch"*. Contract P (pinned) was considered and not chosen | §2.1, §2.2 |
| 2 | A `released` branch? | **Adopt it.** CI fast-forwards it to the tested `$GITHUB_SHA` after all required jobs pass, on push events only, never with force. Migration checks ancestry before switching a project | §7.2, §7.4, §9.2 #30–#33b, #39 |
| 3 | A leftover `blueprint_source` field? | **Warn on every run, with no cut-off date** | §5, §9.2 #29 |
| 4 | Does the toolchain installer write the per-machine `blueprint` command? | **Yes** | §8.1, §9.2 #34–#38, #37b |

Two things the decisions required that the questions did not name. Both are
design choices made in this revision:

- **`blueprint_branch` cannot become `released`.** `a2bp` uses that field as the
  base of every pull request it opens (`gh pr create --base "$BP_CFG_BRANCH"`,
  `scripts/blueprint:1698`). Setting it to `released` would file requests
  against the branch CI owns. So derived projects fetch `released` through a new
  optional field, `blueprint_release_branch`, and `blueprint_branch = main`
  keeps its one meaning: where requests go (§7.4).
- **`security.yml` is a managed file** (`.gitattributes` comment at `:171`), so
  it ships to every derived project. The release job is therefore guarded to run
  only in the blueprint's own repository (§7.4).

## R4. Response to the review of revision 4 (revision 5)

Alexey reviewed revision 4's additions and returned *"revise again"* with four
findings. All four are adopted. Evidence is from probes under
`.scratch/philipp-025/`, run against local bare remotes and scratch directories
only, with no network. **Nothing commits 1 and 2 depend on changed.** Every edit
is in commit 3 (the release job), commit 4 (the installer command), the
migration, or the rollback. One harness question was checked: #33b passes
`GITHUB_SHA` to a child. `overrideKind` gives an undeclared unprefixed name no
kind (`tests/harness/env.ts:341`), so no declaration is needed.

| # | Finding (short) | Answer | Where |
|---|---|---|---|
| 1 | A marker prefix does not prove the installer wrote a file; no marked-but-foreign case | **Adopted.** Ownership is now byte-exact equality (`cmp -s`) with a body from a closed set: every body the installer has released, carried verbatim. At commit 4 the set is one body, v1, which is also the current body. The marker line stays as a note to readers and proves nothing. A marked file with any other body is foreign, exactly like an unmarked one: left byte-identical, with the `⚠` lines. Measured: v1 plus one hand-edited line is refused, the exact body is accepted, and a symlink to the exact body is refused. Revision 4's "marked, different body → replaced" row is deleted, and so is #36's old-body run. No earlier released body exists, so that code would have nothing to act on. It returns with v2, which adds v1 to the set with its case | §8.1, §9.2 #36, #37 (c) |
| 2 | Step 8's `rm`, then install, leaves no command on any failure | **Adopted.** Step 8 is one installer operation, `--replace-blueprint-command`. It prepares the body beside the target, validates it by running it (in the invoking migrated project since revision 6, §R5 #5), copies the old command into a fresh backup directory, and then swaps with one `mv`. Measured with each step made to fail (validation, `chmod`, the backup `cp`, `mv`): every run exited 1, the old command was byte-identical and still ran, and no temp file remained. A symlink target was replaced as a link, and the file it pointed at was untouched. **One thing the review did not name was measured:** an INT sent to the installer process alone, while it waited on a child before the rename, **did not stop it**. Bash treats a child that survives the signal as having handled it, so the script carried on and completed the swap. The group signal a terminal sends did stop it (130/143). §1.4's handler shape (clean up, clear the trap, re-raise) closes the gap: all four shapes, INT and TERM each sent to the group and to the installer alone, ended 130/143 with the old command identical. The success path is unchanged | §7.2 step 8, §8.1, §9.2 #37b |
| 3 | Reverting commit 3 removes the job before `released` carries the rollback | **Adopted, after reproducing it.** Bare-remote scenario: four fixture commits, the third adding the job. Reverting all four in one commit left `released` at the fourth, because the workflow at the rollback SHA had no job, and a migrated project kept reading the unreverted CLI. The new order reverts all four **but keeps `security.yml`**, so the job at the rollback SHA fast-forwards `released` to it (measured: `released` = rollback, old CLI). Projects then pull through their own address path, and only after that is the job removed, in a second publication, after which `released` stayed at the rollback SHA (measured). A reviewed, explicit, non-force fast-forward is the fallback if the rollback commit cannot go green | §10 Rollback, §9.2 #39 |
| 4 | #30–#33 inspect YAML and never run the release commands | **Adopted, and it found a defect in revision 4's block.** The block ran as a `shell: bash` step runs (`bash --noprofile --norc -eo pipefail`) against a bare remote, in four states and two checkout shapes. Revision 4 fetched `released` and then tested `origin/released`, which exists only if the checkout configured a fetch refspec. Without one, **the legitimate old-run rerun exited 1**. With the check reading `FETCH_HEAD`, all 8 runs were right: missing → created at the tested SHA (0); newer descendant published → 0, not moved; diverged → 1, not moved; older ancestor → advanced (0). Measured red: `--force` moves a newer ref back and moves a diverged one; `is-ancestor` replaced by `true` exits 0 when diverged; pushing `origin/main` creates the ref at `main`'s tip instead of the tested SHA. The step now declares `shell: bash`, so the case runs the block the way the workflow declares | §7.4, §9.2 #33, #33b |

## R5. Response to the re-review of revision 5 (revision 6)

Alexey re-reviewed revision 5 and returned *"build with these changes"*.
Findings 1–4 are resolved, and finding 6 confirms commits 1–2 are untouched.
Revision 6 adopts finding 5 and changes nothing else. **Nothing commits 1 and 2
depend on changed:** the edits are to commit 4's installer mode, §7.2 step 8
and #37b.

| # | Finding (short) | Answer | Where |
|---|---|---|---|
| 5 | `--replace-blueprint-command` validated the new command with the installer's `$ROOT` as working directory. `$ROOT` always has its own CLI, so the check proved nothing about the project, and contradicted the plan's claim that it fails from an unmigrated project | **Adopted.** The installer records `CALLER_DIR="$PWD"` before any `cd` and takes `--project=<dir>` to name a project from elsewhere, the blueprint included. That directory must be a migrated project (`.blueprint-source` sets `blueprint_release_branch`, no `blueprint_source`), and the temp command runs `help` there. #37b now keeps the installer root and the project apart, with a working CLI in the root in every run. It adds the root-has-a-CLI, project-has-none run, an unmigrated-project run and a root-without-`--project` run, each non-zero with the old command byte-identical. Revision 5's `$ROOT` validation is a named mutant | §7.2 step 8, §8.1, §9.2 #37b |

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

"The blueprint" is the tip of the read branch on `blueprint_remote`, as fetched
by this run into its own ref (§2.1). The read branch is
`blueprint_release_branch` when set, else `blueprint_branch` (§7.4).
`CURRENT_SHA` is that SHA, and the tree's `HEAD` equals it.

- **`drift`** lists `BOOTSTRAP_SHA..CURRENT_SHA` from the tree, whose history
  comes through alternates. All three projects' bootstrap SHAs exist on the
  remote.
- **`bootstrap_sha` absent from the fetched history** (recorded from an unpushed
  or rewritten commit, §0.2 #4, or from one `released` has not reached yet, §7.4). `git cat-file -e "$BOOTSTRAP_SHA^{commit}"`
  fails, and drift prints one explicit line: *"bootstrap_sha `<x>` is not in
  `<remote>` `<branch>` history. It was recorded from a commit that is not on
  that branch (never pushed, rewritten, or not yet released), so commits since
  sync are unknown."* Exit 0, since
  the file comparison is still valid. **If the commit is present but `rev-list`
  fails, that is a damaged cache, and it exits 5** rather than printing "unknown"
  (today's `2>/dev/null || echo "?"` makes the two look the same).
- **`pull`** writes the **full** fetched SHA into `bootstrap_sha`, and only on a
  full pull (BUG-016, unchanged).
- **The remote moves between `drift` and `pull`:** `pull` refreshes, previews
  what it will apply, and records the commit it applied.
- **Header:**

  ```
  blueprint:  git@github.com:LuizStruct2Flow/blueprint.git  (released)
  fetched:    <full sha>  at 2026-09-14T15:02:11Z
  ```

  The branch in parentheses is the read branch, so a project that has not yet
  switched to `released` shows `(main)`, visibly.

### 2.1 The product contract: T (decided)

**Founder decision, 2026-09-14:** `drift` means *"the project matches the newest
blueprint on its branch."* Revision 1 had presented this as technically forced.
It is not: it is the product choice, and it is now made.

What follows from it, all already written into §1 and §3–§10:

- `drift` and `pull` compare against the tip this run fetched, and nothing else.
- Right after a full `pull`, a project is clean until the blueprint moves.
- Offline, or with any refresh failure, the answer is **5**: nothing is
  compared. The one offline path is the explicit `BLUEPRINT_ROOT` override,
  labelled as such (§4, §5).
- A partial pull needs no special wording: pulled files match the tip, the rest
  show drift.
- The wake protocol has four cases (§3).

### 2.2 Considered and not chosen: P (pinned)

P read `drift` as *"the project matches the blueprint version it recorded
(`bootstrap_sha`), with whether a newer one exists on a separate line."* Its one
advantage was an offline answer: conformity to the pin, plus "newer: unknown".

It was not chosen because the wake-time question is *"is there blueprint work
to bring in?"*, which only the tip answers. P also cost more than it returned:
a partially pulled file shows as drift against the old pin, which needs its own
"ahead of the pin" wording or BUG-016's rule reopens; a `bootstrap_sha` absent
from history becomes a hard failure instead of a note; the wake protocol gains a
fifth case; and fourteen cases change. The offline need it served is met by the
`BLUEPRINT_ROOT` override, which says exactly what it compared against.

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
| **4** | config refused by `bp_config_load`: version 1 without override, placeholder or empty remote, invalid `blueprint_branch` or `blueprint_release_branch`, version too new | same |
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
| **`blueprint_source` field** | **Ignored, and warned about on every run, with no cut-off date** (founder decision). While the field is present, every `drift` and `pull` run in the project prints exactly one line to stderr, before anything else it prints, on the address path and the override path alike:<br>`warning: .blueprint-source still has blueprint_source, which is no longer read. The blueprint is read from blueprint_remote (TASK-025). Delete the blueprint_source line.`<br>It is not dimmed, not suppressed after a first run, and changes no exit status or stdout. The blueprint itself never prints it, since it returns before reading any config. Pinned by §9.2 #29 |

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
| v2, real `blueprint_remote` (all three today) | reads the remote (the read branch, §7.4); a leftover `blueprint_source` is ignored and warned about (§5) |
| v2, `blueprint_remote = FILL-ME-IN` (fresh bootstrap) | **4**, `bp_config_load`'s message, plus *"or export BLUEPRINT_ROOT=<checkout>"* |
| v1 | **4**, `bp_config_load`'s message, plus the same hint. The remote is never inferred from a checkout's `origin` |
| any version, `BLUEPRINT_ROOT` exported | local override, labelled |

Validation is `bp_config_load`, reused as it is. `scripts/new-project.sh` stops
writing `blueprint_source`, deletes `_relative_path`, and keeps the `FILL-ME-IN`
placeholder. It writes `blueprint_release_branch = released` (§7.4).
`read_blueprint_source`'s unregistered-project message stops suggesting
`blueprint_source`.

### 7.2 Order of operations

1. ~~PR #66 decided.~~ **Done:** TASK-026 implemented it.
2. **TASK-025 lands on `main` and is pushed** (§10's four commits). Projects
   read what is published, so an unpushed TASK-025 is invisible to them by
   design.
3. **Wait for `released` to exist.** The first green `security` run on that
   push creates it (§7.4). Check with
   `git ls-remote <remote> refs/heads/released`: it must print the last TASK-025
   commit or a later one. No project switches before this.
4. **Each project pulls the new CLI with its current CLI,** through the
   still-unchanged wrapper. The pull list is **derived, not hand-counted**
   (review): `scripts/blueprint`, plus every `scripts/lib/*.sh` it sources,
   transitively. Collect the list with `grep -o 'lib/[a-z-]*\.sh'` over the CLI
   and each lib found, until nothing new appears. It is a partial pull, so
   `bootstrap_sha` is left alone (BUG-016).
5. **Verify before changing anything else:** in the project,
   `bash scripts/blueprint drift` prints a header naming the remote with
   `(main)` and exits 0 or shows drift, never 1. It also prints the §5 warning,
   because `blueprint_source` is still there.
6. **Check ancestry, then switch.** In a blueprint checkout, `git fetch origin`,
   then `git merge-base --is-ancestor <the project's bootstrap_sha> origin/released`.
   - **Passes:** in the project, add `blueprint_release_branch = released` and
     delete `blueprint_source`, in the same project commit as step 4.
   - **Fails, and `git merge-base --is-ancestor <sha> origin/main` passes:**
     `released` has not caught up with the commit this project synced to. Wait
     for CI and repeat the check.
   - **Fails against both:** the SHA was never pushed or was rewritten
     (§0.2 #4). Switch anyway. Drift then prints §2's "not on that branch"
     line until the next full pull records a `released` SHA. Tell the founder;
     do not run the full pull unasked.
7. **Verify again:** drift's header shows `(released)`, it exits 0 or shows
   drift, and the §5 warning is gone.
8. **Only then replace the per-machine command, on each machine** (§8.1). With
   a project that has passed step 7 as the working directory, run
   `bash scripts/install-toolchain.sh --replace-blueprint-command`. From anywhere
   else, the blueprint included, name that project:
   `bash scripts/install-toolchain.sh --replace-blueprint-command --project=<project root>`.
   The new command is validated by running it **in that project**, and the
   installer refuses a directory that is not a migrated project, so a working
   CLI in the installer's own checkout cannot stand in for the project's (§R5
   #5). That single
   operation prepares and validates the new command beside the old one, copies
   the old one into a backup directory, and only then exposes the new one with
   one rename. On every failure before the rename, the old command is left
   byte-identical and still runs. It prints the one-rename command that restores
   the old one, which the rollback uses (§10). **No manual `rm`, ever:** deleting
   first is the per-machine outage this order exists to avoid (§R4 #2). Until
   step 7 passes in every project, the old wrapper is the recovery path and
   stays. A plain install never replaces a file it did not write, so running the
   installer earlier, for its other tools, is harmless.
9. **Only then Stage B** (§8.2).

### 7.3 Per project

- **linkedin-watcher-agent.** Local CLI present. Steps 4–7 as written.
- **struct2flow-www.** Local CLI present; its absolute `blueprint_source` goes at
  step 6. Its local copy carries PR #66's U1/U6 edits, and step 4 replaces them
  with TASK-026's implementation, with the diff shown.
- **storm2flow.** No local CLI and no `scripts/lib/`. Step 4's derived closure is
  the whole lib set, and after it the project has the local CLI that the §8.1
  command needs. `bootstrap_sha` stays reserved for its slice S8, so if step 6
  lands in its third branch, the "not on that branch" line stays until S8.
  **Stage B waits for it.**

### 7.4 The `released` branch

**Adopted (founder, 2026-09-14).** `released` is the newest `main` commit on
which every other CI job passed. Derived projects read it. `main` stays the
trunk the owner pushes to and `a2bp` files against.

**The CI job,** added to `.github/workflows/security.yml`:

```yaml
  release:
    name: release (fast-forward released to the tested commit)
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.repository == 'LuizStruct2Flow/blueprint'
    needs: [secret-scan, sast, sca, commit-subjects, shell-tests, ts-tests]
    permissions:
      contents: write
    steps:
      - name: Check out
        uses: actions/checkout@<the SHA the other jobs pin> # v6
        with:
          fetch-depth: 0
      - name: Fast-forward released
        shell: bash
        run: |
          if git push origin "$GITHUB_SHA:refs/heads/released"; then exit 0; fi
          git fetch origin refs/heads/released
          if git merge-base --is-ancestor "$GITHUB_SHA" FETCH_HEAD; then
            echo "released already contains $GITHUB_SHA: a newer green run got there first"
            exit 0
          fi
          echo "::error::released does not contain $GITHUB_SHA and was not moved"
          exit 1
```

- **The tested SHA.** It pushes `$GITHUB_SHA`, the commit every `needs:` job
  tested, never `main` by name, which may have moved during the run.
- **After all required jobs.** `needs:` lists every other job in the file. A
  failed or skipped dependency skips the release. §9.2 #33 derives the job list
  from the file, so a job added later but left out of `needs:` turns it red.
- **Push events only.** The `if` excludes `pull_request`, `schedule` and
  `workflow_dispatch`, and `on.push` is `main` only.
- **Never force.** No `--force`, no `-f`, no `+` refspec. The server refuses a
  non-fast-forward. If `released` already contains the SHA, because an older run
  finished after a newer one, the job is green. Any other refusal is red and
  leaves the ref where it was: `released` diverged from `main`, which only a
  hand push can cause, or the push failed for another reason.
- **The blueprint's repository only.** `security.yml` is managed and ships to
  every derived project. There the repository condition is false and the job
  shows as skipped. The name is the blueprint's own address, which every
  project's `.blueprint-source` already records, so it is not contamination. A
  fork of the blueprint edits that one line.
- **The refusal path reads `FETCH_HEAD`, not `origin/released`** (revision 5). A
  remote-tracking ref moves only if the checkout configured a fetch refspec,
  and that is the checkout action's choice, not this file's. Measured without
  one, revision 4's `origin/released` form **failed the legitimate old-run
  rerun** (§R4 #4). `FETCH_HEAD` is written by the fetch itself, with or without
  a refspec.
- **`shell: bash` is declared,** so the step runs as
  `bash --noprofile --norc -eo pipefail`, which is GitHub's documented
  invocation for that shell. §9.2 #33b runs the extracted block exactly that
  way, and #33 pins the declaration.
- **`contents: write` on this job only.** Every other job keeps `read`.
- **Creation.** The first green run creates `released`; a push to a missing ref
  needs no force. Nobody pushes `released` by hand. That is a convention, not an
  enforced rule, for the same one-identity reason CLAUDE.md gives for `a2bp`.
  A push made with `GITHUB_TOKEN` starts no workflow, and nothing triggers on
  `released` anyway.

**Which branch derived projects fetch: `released`, through a new optional field.**

```
config_version           = 2
blueprint_remote         = git@github.com:LuizStruct2Flow/blueprint.git
blueprint_branch         = main
blueprint_release_branch = released
```

- **`drift` and `pull` read `blueprint_release_branch` when it is set, else
  `blueprint_branch`.** The fallback keeps a project mid-migration, and every
  existing fixture, working, and the header names the branch it read (§2).
- **`a2bp` keeps `blueprint_branch`** as its fetch base and pull request base,
  unchanged.
- **`bp_config_load`** validates the new field with the same
  `git check-ref-format --branch` check and emits `BP_CFG_READ_BRANCH`: the
  field, or `BP_CFG_BRANCH` when it is absent. The config version stays 2. The
  field is optional, and a CLI that predates it does not read the remote at all.
- **`scripts/new-project.sh` writes `blueprint_release_branch = released`.** A
  fresh bootstrap made between a push and its green CI run may record a
  `bootstrap_sha` that `released` does not contain yet. Drift then shows §2's
  "not yet released" line, exit 0, until the next full pull.
- **Rejected: pointing `blueprint_branch` itself at `released`.** It is a2bp's
  pull request base (`scripts/blueprint:1698`), so requests would be filed
  against the branch CI owns, where `security.yml`'s `pull_request` trigger does
  not even run.

**The migration ancestry check** is §7.2 step 6: a one-time procedure run in a
blueprint checkout, not CLI code. What a project sees if it is switched too
early is CLI behaviour, and §9.2 #32 pins it.

**Cases:** §9.2 #30 (the read branch and its fallback), #31 (a2bp's base does
not move), #32 (switched before `released` caught up), #33 (the job's declared
shape), #33b (the block, run against a bare remote in every state), #39 (the
rollback reaches migrated projects).

---

## 8. The per-machine command and Stage B

### 8.1 The per-machine `blueprint` command, written by the installer

**Founder decision, 2026-09-14:** `scripts/install-toolchain.sh` writes it.

**Today.** `~/.local/bin/blueprint` is hand-written and `exec`s a hard-coded
checkout path (§0.1). README §"One-time setup" tells readers to put the
blueprint's `scripts/` on `PATH` or to symlink the CLI, which is the same thing
in two more shapes. All three point into a checkout. That is the hazard
`docs/doing/HANDOVER.md` §2 records for TASK-021 Stage B: the move breaks
`blueprint` for every project on the machine, and no commit can fix a file
outside git.

**What the installer writes:** `$HOME/.local/bin/blueprint` (the installer's
existing `$BIN_DIR`), mode 0755, on Linux and macOS alike. Exact content:

```bash
#!/usr/bin/env bash
# struct2flow-blueprint-command v1: written by scripts/install-toolchain.sh (TASK-025).
# Runs THIS project's own blueprint CLI. The blueprint is read by its address,
# so no checkout path belongs in this file. Edit the installer, not this copy.
for c in ./scripts/blueprint ./scaffolding/scripts/blueprint; do
  [ -x "$c" ] && exec "$c" "$@"
done
echo "blueprint: no scripts/blueprint in $PWD. Run from a project root," >&2
echo "  or fetch the CLI once with: BLUEPRINT_ROOT=<checkout> bash <checkout>/scripts/blueprint pull scripts/blueprint" >&2
exit 1
```

- **Why this closes the Stage B hazard.** It names no checkout. It runs the CLI
  of the project in the current directory, which the address path makes
  self-sufficient. It tries `./scaffolding/scripts/blueprint` second, so Stage
  B's layout works too. Inside the blueprint it runs the blueprint's own CLI,
  which `drift` already recognises (§5).
- **Where in the installer.** A function `install_blueprint_command`, run in
  install mode **before** the OS branch, so a missing Homebrew or `curl` cannot
  skip it. The existing `mkdir -p "$BIN_DIR"` and "not on PATH" warning move
  above the OS branch with it and serve both OSes. `--replace-blueprint-command`
  and `--project=<dir>` join the argument `case` (`:82`), and the usage line
  names both. `--project` is accepted only with `--replace-blueprint-command`
  (exit 2 otherwise). It is one `=` token because the loop reads one argument
  at a time.
- **Ownership is byte-exact membership in a closed set** (revision 5, §R4 #1).
  The installer carries, verbatim, every body it has ever released. A file is
  the installer's only if it is a regular file, not a symlink, whose bytes equal
  one of them (`cmp -s`). At commit 4 the set is one body, v1, the text above.
  **The `# struct2flow-blueprint-command` line proves nothing:** anyone can copy
  it, so it is a note to readers only. A byte-identical file is safe to replace
  by construction, because replacing it loses nothing anyone wrote. When a v2
  body ships, v1 stays in the set, and "identical to an earlier body → replaced"
  becomes a row, with its case in #36. It is not written now: there is no
  earlier body for it to act on. The symlink test comes before every read or
  write of the path.

| Existing `$BIN_DIR/blueprint` | Action | Output |
|---|---|---|
| absent | write to a temp file in `$BIN_DIR`, `chmod 0755`, `mv` into place | `✓ blueprint command installed (<path>)` |
| a regular file, byte-identical to the current body | nothing; not rewritten | `✓ blueprint command already present` |
| anything else: a symlink wherever it points, today's hand-written wrapper, or a file carrying the marker with any other body | **left untouched**, and not counted as a failure | `⚠ <path> was not written by this installer, so it is left alone.`<br>`  If it runs a checkout's scripts/blueprint, TASK-021 Stage B will break it.`<br>`  Once every project has the address-reading CLI, replace it with:`<br>`  bash scripts/install-toolchain.sh --replace-blueprint-command` |

- **`--replace-blueprint-command`: the approved replacement of a foreign file**
  (§7.2 step 8). It is a mode of its own: it installs no other tool, and exits.
  Typing the flag is the operator's approval. On a target that already holds the
  current body, it does nothing and prints `already present`. Otherwise it runs
  these steps in order, and every failure exits 1 with the target untouched and
  the temp file removed:
  1. **Prepare:** `mktemp "$BIN_DIR/.blueprint.new.XXXXXX"`, write the body,
     `chmod 0755`.
  2. **Validate, in the project the command will serve** (revision 6, §R5 #5).
     The installer's `$ROOT` is the wrong place: it is whichever tree supplied
     the installer, usually the blueprint, and it always has its own
     `scripts/blueprint`, so a run there proves nothing about any project.
     - **Which project.** `--project=<dir>` when given, else the caller's
       working directory. The installer records that as
       `CALLER_DIR="$PWD"` beside `ROOT` (`:47`), before any `cd`. The installer
       changes no directory of its own today (`ROOT` is computed in a
       subshell), and recording it first keeps that true if one is added.
     - **It must be a migrated project**, the state §7.2 step 7 verifies:
       `<dir>/.blueprint-source` is a regular file that sets
       `blueprint_release_branch` and has no `blueprint_source` line. Otherwise
       exit 1 with
       `✗ <dir> is not a migrated project (§7.2 steps 4–7); run from one, or pass --project=<dir>`.
       The blueprint has no `.blueprint-source`, so running there without
       `--project` is refused rather than validated against the blueprint's own
       CLI.
     - **Then run the temp file as `help` with `<dir>` as its working
       directory.** That proves it is executable, its shebang resolves, and it
       reaches **that project's** CLI. It fails from a project that has not done
       §7.2 step 4, even when the installer's root has a working CLI (#37b (c)).
  3. **Back up:** if a target exists, `mktemp -d "$BIN_DIR/.blueprint-replaced.XXXXXX"`,
     then `cp -pP` the target into it. `-P` copies a symlink as a link. The
     destination is a new name inside a fresh directory, so nothing is written
     through an existing path.
  4. **Swap:** `mv -f` the temp file onto the target. It is one rename within one
     directory, so `blueprint` is always either the old command or the validated
     new one. A symlink target is replaced as a link, and the file it pointed at
     is untouched (measured).
  5. **Report:** `✓ blueprint command replaced (<path>)`, then
     `  previous command kept; restore it with: mv <backup>/blueprint <path>`.
     The installer never deletes a backup.
  - **Signals.** Steps 1–4 run under §1.4's handler shape: EXIT removes the temp
    file, and INT and TERM clean up, clear the trap and re-raise. It is needed,
    not decorative. Without it, an INT sent to the installer alone while it
    waited on a child was absorbed, and **the swap completed** (§R4 #2). A
    SIGKILL before step 4 can leave a `.blueprint.new.*` file and a backup
    directory. Both are dot-names that nothing reads. `# ponytail:` no pruning
    of either; add it if a real `$BIN_DIR` is seen to collect them.

- **After writing,** if `command -v blueprint` resolves somewhere other than
  `$BIN_DIR/blueprint`, it prints
  `⚠ blueprint resolves to <other> first on PATH, not <path>.` That is the
  README's old `PATH` instruction: the same hazard in another shape.
- **Never replacing a foreign file without the flag is what keeps §7.2 safe.**
  The founder's current wrapper is the recovery path until step 7 passes in
  every project, and a machine may run the installer for its other tools before
  then. Replacing it is the deliberate flag at step 8, never an `rm`. A symlink
  is never followed: writing through one into a checkout would overwrite that
  checkout's CLI.
- **`check` mode** prints one line: `✓ blueprint command (<path>)`,
  `✗ blueprint command MISSING (run: bash scripts/install-toolchain.sh)`, or the
  `⚠` line above. It does not add to the missing count: nothing in the gate
  calls `blueprint`, and install does not fail on it either, so check and
  install still report the same set.
- **README §"One-time setup"** replaces the `PATH` and symlink instructions with
  "run `bash scripts/install-toolchain.sh`; it writes the `blueprint` command",
  and says the command runs the project's own CLI. The command's text lives
  only in the installer.
- **Cost, stated:** `blueprint` works only from a project root, `files` and
  `help` included. From a subdirectory it exits 1 with the message above.
- **Cases:** §9.2 #34–#38 and #37b.

### 8.2 Stage B

Gate: **all three projects have completed §7.2 steps 4–7, and every machine has
completed step 8.** Checkable: each project's drift header names the remote with
`(released)`, and `type -a blueprint` lists the installer's command first and
nothing that resolves into a blueprint checkout. §10 commit 4 adds this as a
precondition to `PLAN-TASK-021-RESTRUCTURE.md`, which is the hazard
`HANDOVER.md` §2 says that plan does not contain yet.

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
    and the `npx` stub records prefix names **plus** `UNPREFIXED_FORBIDDEN`
    names (imported, per BUG-063). The assertion compares H5's rule, not the
    declared list (below). Mutant: delete the `unset` → #1c red.
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
- **H3 — folded into H5** (revision 3). Revision 2 declared `GIT_SSH_COMMAND`
  and `GIT_SSH` `'denied'` by name. They were two members of a population, and
  H5 covers the whole population, so the declarations add nothing and are not
  made. An explicit override of either is already refused as an undeclared
  `GIT_` name (`env.ts:289`). The witness survives as H5's W3.
- **H5 — the whole undeclared `GIT_*` / `AGENT_*` population is forbidden in
  direct runs** (§R2 #3). Today `fixtureEnv` removes `FORBIDDEN_ENV` (declared
  names, `env.ts:534`) plus `GIT_CONFIG*` (`:543`), and `assertProcessEnvClean`
  checks `FORBIDDEN_ENV` only (`:579`). The bridge unsets every `GIT_`/`AGENT_`/`BP_`
  name (`run-ts-suites.sh:177`). Undeclared ambient names such as `GIT_EXEC_PATH`,
  `GIT_ASKPASS`, `GIT_ALLOW_PROTOCOL` and `GIT_SSH_COMMAND` therefore reach fixtures
  in a direct `vitest run` and not through the gate.
  - **One predicate** in `env.ts`, exported:
    `isForbiddenAmbient(k) = FORBIDDEN_ENV.includes(k) || (/^(GIT|AGENT)_/.test(k) && ENV_KIND[k] !== 'inert')`.
    It is true for declared hazards (including `BP_` and `UNPREFIXED_FORBIDDEN`
    names, which reach `FORBIDDEN_ENV` by declaration) and for every
    **undeclared** `GIT_`/`AGENT_` name. It is false for declared `inert` names
    (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `env.ts:232–235`), which stay.
  - **`fixtureEnv` scrubs** `Object.keys(env).filter(isForbiddenAmbient)`. That
    one loop replaces both loops at `:534` and `:543`. `GIT_CONFIG_KEY_<n>` is
    an undeclared `GIT_` name, so the prefix loop's reason is kept without the
    loop. Overrides are still applied after the scrub, under `overrideKind`, as
    today.
  - **`assertProcessEnvClean` refuses**
    `Object.keys(process.env).filter(isForbiddenAmbient)`. It exists to catch a
    spec that spawns through `child_process` directly, which would inherit the
    undeclared names just as well as the declared ones.
  - **`BP_` is deliberately not in the undeclared arm**, as `overrideKind`
    already records (BUG-066: `BP_NO_PROMPT` and other tunables are passed on
    purpose). That is the one population where the bridge scrubs more than a
    direct run, and #1c states it rather than leaving it implied.
  - **ts-bridge #1c compares the rule.** The driver (`ts-bridge.spec.ts:432–438`)
    additionally exports an undeclared `GIT_ALLOW_PROTOCOL=decoy`, an undeclared
    `AGENT_TASK025_DECOY=<escape token>` and the declared-inert
    `GIT_AUTHOR_NAME=decoy`. None of them can redirect git inside the driver.
    Assertions:
    (1) the runner sees no recorded name at all, as today;
    (2) for every name the driver exports and every `FORBIDDEN_ENV` name,
    `isForbiddenAmbient(name)` implies the bridge removed it;
    (3) every name `isForbiddenAmbient` accepts is prefixed or in
    `UNPREFIXED_FORBIDDEN`, which replaces the declared-list loop at `:215`.
    Together these say the gate removes at least what a direct run removes, and
    the only extra it removes is declared-inert or `BP_`.
  - **Witness W3** (`harness.spec.ts`): with `GIT_ALLOW_PROTOCOL`,
    `GIT_SSH_COMMAND`, `AGENT_TASK025_DECOY`, `GIT_CONFIG_KEY_0` and
    `GIT_AUTHOR_NAME` set in `process.env` (restored in `finally`),
    `fixtureEnv()` lacks the first four and keeps `GIT_AUTHOR_NAME`. Mutants:
    revert the scrub to `FORBIDDEN_ENV` (red); drop the undeclared arm from the
    predicate (red); drop the `!== 'inert'` guard (red, `GIT_AUTHOR_NAME` gone).
  - **Witness W4:** `assertProcessEnvClean` throws naming `GIT_ALLOW_PROTOCOL`
    when only that is set, and does not throw when only `GIT_AUTHOR_NAME` is
    set. Mutant: revert it to `FORBIDDEN_ENV.filter` → red.
  - **Mutant for #1c:** narrow the bridge's loop to unset only the names in
    `FORBIDDEN_ENV` → #1c red on `GIT_ALLOW_PROTOCOL`.
  - **Cost, stated:** a direct `vitest run` from a shell that exports any
    undeclared `GIT_`/`AGENT_` name (`GIT_EDITOR`, `GIT_PAGER`) is refused, with
    the names listed. The remedy is to unset it, run through the gate's runner,
    or declare it `'inert'` in `ENV_KIND` if it truly is. That is the existing
    rule for undeclared names (`env.ts:274`) applied to ambient values. At
    implementation, grep that no spec or harness module writes a `GIT_`/`AGENT_`
    name into `process.env` itself.
  - **Ripples:** the comments at `env.ts:260–265` and `run-ts-suites.sh:164–167`
    ("FORBIDDEN_ENV is fifteen names … by prefix") are rewritten to describe the
    predicate.
- **H4 — `s.pathWithout(names)`**: a `PATH` of one workspace directory holding
  symlinks to every executable on the current `PATH` (first occurrence wins),
  except `names`. It is derived, not hand-listed. It gives the
  no-timeout-provider case a contained fixture, which `staleness.spec.ts:179`
  records does not exist today.
- `BP_FETCH_TIMEOUT: 'opaque'`.

Remotes are workspace paths, or `ssh://git@127.0.0.1/blackhole.git` behind the
FIFO-blocking `ssh` shim that `tests/staleness` #8 uses. With H5, nothing can
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
| 23 | **Group INT and group TERM mid-write**, two runs (`cat` shim; the signal is sent to the whole process group). Each run: the target file holds the **complete** new content (never truncated), no later write starts, `.blueprint-source` is unchanged, and the run died of that signal (130 for INT, 143 for TERM) | remove `_bp_shielded_write` (file left empty, both runs), move the redirect outside its subshell, or ignore INT only in the subshell (TERM run red) |
| 24 | **Concurrent runs, one cache.** A blocks in compare (its own `diff` shim dir). B runs a full drift with the same `HOME` → 0. The remote advances; C runs → 0 at the new tip. A is released → 0, its header SHA and "commits since sync" are **its own tip**, not C's. All scratch gone, cache valid | (a) cleanup deletes the cache or all `refs/bp-run/*` → A's history read fails; (b) read the log from a shared branch ref instead of the run's SHA → A lists C's commits |
| 25 | **Failed refresh with a warm cache.** Run 1 succeeds; the remote is then made unreachable; run 2 → **5**, although the cache holds a complete answer | on fetch failure, use the newest cached ref |
| 26 | **Interrupted refresh leftovers.** The cache is pre-seeded with what a SIGKILL leaves (§0.4): a `tmp_pack_*` file, a dead `refs/bp-run/<nonce>` at an **older** commit, and that ref's `.lock` → next run 0 at the current tip | pick "the newest `bp-run` ref" instead of the run's own |
| 27 | **Damaged cache.** (a) the tip's root tree object deleted (§0.4) → **5** naming the cache path and `rm -rf` remedy; (b) a truncated pack → 0 with a byte-correct report (git heals it, measured) | `checkout … \|\| true`, or fall back to the previous tree; for (b), treating any `error:` on stderr as corruption |
| 28 | **Concurrent first runs:** 8 parallel `drift` from no cache → all 0, one cache dir, no `.bp-cache-init.*` debris. A smoke case (0/160 measured), not mutant-deterministic; its deterministic partner is **#28b**: a stray `.bp-cache-init.X` directory already inside a valid cache (a lost race's leftover) → 0 and the stray is gone | plain `git init` over an existing path (its `config.lock` fails); skip the nested-temp removal |
| 29 | **A leftover `blueprint_source` warns on every run.** The field is present and points at a decoy directory. Two `drift` runs and one `pull --yes`: each prints §5's line exactly once on stderr, and exit status and stdout are identical to the same runs without the field. Under `BLUEPRINT_ROOT` the line still prints. Field absent: `blueprint_source` appears on no stream | warn only on a first run (a stamp file under the cache); warn only in `drift`; refuse with 4; skip the warning on the override path |
| 30 | **The read branch.** A fixture remote where `main` is one commit ahead of `released`, and that commit changes a managed file. With `blueprint_release_branch = released`: the header says `(released)`, and the report and the SHA `pull --yes` records are `released`'s tip. Field absent: `(main)` and `main`'s tip. Field `bad..name` → 4, naming the field | read `blueprint_branch` regardless of the field; skip the field's validation |
| 31 | **a2bp's base does not move.** The same fixture with both fields set: `a2bp --dry-run <file>` prints `branch:   main` and resolves its base from `main`'s tip | `bp_config_load` emits the release branch as `BP_CFG_BRANCH` |
| 32 | **Switched before `released` caught up.** `bootstrap_sha` is the `main`-only commit and the field is `released` → 0, §2's "not on that branch (… not yet released)" line, no commit list. Fast-forward `released` in the fixture remote and run again → 0, the normal commits-since-sync list, no such line | restore `2>/dev/null \|\| echo "?"`; read history from `blueprint_branch` |
| 33 | **The release job's declared shape,** read from `.github/workflows/security.yml` with the harness's existing `yaml` package: its step declares `shell: bash`; its `if` requires `github.event_name == 'push'` and the repository; its `needs` equals the set of every other job id in the file, derived rather than listed; it alone has `contents: write`. What the block **does** is #33b's, not this case's | drop a job from `needs`; drop the push-event condition; grant `contents: write` to the whole workflow; drop `shell: bash` |
| 33b | **The release block, run** (§R4 #4). The step's `run` string is taken from #33's parsed workflow, so it is the bytes CI runs, written into the workspace and run as `bash --noprofile --norc -eo pipefail <file>` with `GITHUB_SHA` set. The work repository's `origin` is a bare fixture remote holding `C1 ← C2 ← C3` on `main` and `X` branching from `C1`. It is built twice: once with `git remote add` (a fetch refspec) and once with only `remote.origin.url` (none). Every state asserts the exit status **and** the bare remote's final `refs/heads/released`: (a) missing, SHA `C2` → 0, `C2`; (b) `C3` present, SHA `C2`, an older run re-run after a newer one published → 0, still `C3`; (c) `X` present, SHA `C3`, diverged → non-zero, still `X`; (d) `C1` present, SHA `C3` → 0, `C3`. The remote is a workspace path, so no network | `--force` on the push ((b) moves back to `C2`, (c) moves to `C3`); `merge-base --is-ancestor` replaced by `true` ((c) exits 0); push `refs/remotes/origin/main` ((a) lands on `C3`); revision 4's `origin/released` ((b) exits 1 without a refspec). All four mutants measured red |
| 34 | **The installer writes the command.** Scenario `HOME` with no `.local/bin/blueprint`; `PATH` is `s.pathWithout(['curl', 'brew'])` (H4), so the installer stops at its own `curl` check on Linux or `brew` check on macOS, before any download can start. After `install-toolchain.sh`: the file exists, mode 0755, byte-equal to §8.1's text, and does not contain the blueprint fixture's path. From a fixture project whose `scripts/blueprint` is a stub recording its arguments, `blueprint drift` through `PATH` runs the stub with `drift` | write `exec "$ROOT/scripts/blueprint"`; install the command after the OS branch (the early exit then skips it, on either OS) |
| 35 | **Layouts.** Only `scaffolding/scripts/blueprint` present → it runs. Neither present → 1, with §8.1's message on stderr | drop the `scaffolding/` candidate; `exit 0` when no CLI is found |
| 36 | **Idempotent.** In #34's environment, run the installer, set the command's mtime to the epoch, run it again: the mtime is unchanged. (The "earlier released body → replaced" run joins this case when a v2 body ships, §8.1) | rewrite unconditionally (the mtime moves) |
| 37 | **Never overwrites what it did not write.** In #34's environment, with a plain install. (a) Today's shape, `exec <workspace>/bp/scripts/blueprint "$@"`, as a regular file → byte-identical afterwards, and the `⚠` lines with the `--replace-blueprint-command` remedy are printed; `check` prints the `⚠` line too. (b) A symlink to `<workspace>/bp/scripts/blueprint` → the link and its target are both byte-identical. (c) **Marked but unknown:** §8.1's exact body plus one hand-edited line, as a regular file → byte-identical afterwards, and the same `⚠` lines; `check` prints the `⚠` line | overwrite any file without the marker; write through the path with `cat >` (the target is overwritten); treat any file carrying the marker as the installer's ((c) is overwritten) |
| 37b | **The approved replacement, and every failure before the swap** (§R4 #2). In #34's environment. The target is today's hand-written wrapper, running a stub checkout CLI that prints `OLD`. **The installer's root and the invoking project are separate directories** (§R5 #5): the installer runs from its root, which has a working stub `scripts/blueprint` that prints `ROOT`, and the project is a migrated fixture (`.blueprint-source` with `blueprint_release_branch = released`, no `blueprint_source`) whose stub prints `NEW`. The installer is invoked with the project as its working directory unless a run says otherwise. (a) `--replace-blueprint-command` → 0: the target is §8.1's body and, run from the project, prints `NEW`; exactly one `.blueprint-replaced.*/blueprint` exists, byte-identical to the old wrapper; no `.blueprint.new.*` remains. (a2) The same, invoked with the installer's root as working directory and `--project=<project>` → 0, and the same result. (b) The same as (a) with a symlink target → the target is the body, the backup is a symlink with the old link text, and the file it pointed at is byte-identical. (c) **Injected failures**, one per run, each a `PATH` shim that exits 1: `chmod`, the backup's `cp`, `mv`. **Validation failing**, three runs, the installer's root keeping its working `ROOT` CLI in all of them: the project has no `scripts/blueprint` (§7.2 step 4 not done); the project's `.blueprint-source` still carries `blueprint_source` (step 6 not done); invoked from the installer's root without `--project`. Each run exits non-zero, the target is byte-identical and still prints `OLD`, and no `.blueprint.new.*` remains. (d) **Interrupted before the swap:** a `cp` shim that writes `reached` and blocks on a FIFO (§9.2's seam pattern). INT and TERM are each sent once to the installer's process group and once to the installer alone, four runs → each died of that signal (130 or 143), the target is byte-identical and still prints `OLD`, and no `.blueprint.new.*` remains | `rm` the target before preparing (every (c) and (d) run leaves no command); write the body straight onto the target (a failed `chmod` leaves it replaced and not executable); swap before validating (every validation-failure run replaces it); validate with `$ROOT` as working directory, revision 5's text (the no-CLI project run passes on the root's `ROOT` stub and replaces it); skip the migrated-project test (the `blueprint_source` run and the no-`--project` run replace it); ignore `--project` ((a2) exits non-zero); drop the signal handler (the INT-to-installer-alone run completes the swap: measured, §R4 #2) |
| 38 | **Shadowed on `PATH`.** In #34's environment, with `PATH` holding a directory that contains another `blueprint` and then `$BIN_DIR` (on `PATH` already, so the installer's own prepend does not apply) → the "resolves to … first on PATH" warning names that other file | drop the check |
| 39 | **The rollback reaches migrated projects** (§10 Rollback, §R4 #3). A bare fixture remote: base commit `B`; then `Ta`, which changes a managed file F; then `Tb`, which adds the `release` job (taken from the working tree's `security.yml`) to a workflow that lacked it. "CI" is the harness: after each push, if the workflow **at the pushed SHA** has the `release` job, it runs #33b's extracted block at that SHA, which is how GitHub chooses the workflow. A project with `blueprint_release_branch = released` runs the real CLI with `BLUEPRINT_ROOT` scrubbed. §10's rollback commands run verbatim in a clone. After step 1 (revert, keep the workflow, push): the project's `drift` header shows the rollback SHA, F is reported against `B`'s content, and `pull --yes F` writes `B`'s content. After step 5 (remove the job, push): `refs/heads/released` is still the rollback SHA, and the project's header is unchanged | omit `git checkout HEAD -- .github/workflows/security.yml` from step 1: `released` stays at `Tb`, and the project goes on reading `Ta`'s F (measured, §R4 #3) |

### 9.3 Existing suites that migrate their fixtures

| Suite | Change |
|---|---|
| `blueprint-relocation` | §9.2 #10 |
| `suite-sync` | retarget to `blueprint_remote`; re-run its #1c mutant |
| `bootstrap-contents` | asserts `blueprint_source` is **absent** and `blueprint_release_branch = released` is present |
| `pull-behaviour`, `marker-merge`, `drift-in-blueprint`, `bootstrap-gate` | retarget |
| `staleness` D#1–D#5 | now the override path: set `BLUEPRINT_ROOT` (permitted by H1) |
| `a2bp-e2e`, `a2bp-inputs`, `a2bp-contamination` | a2bp reads neither `blueprint_source` nor the release field; leave as they are and confirm green (#31 pins the base) |
| `manifest` | the `release` job invokes no suite; confirm green against the new `security.yml` |
| `harness`, `ts-bridge` | H1, H2 and H5 witnesses (W1–W4) and #1c (§9.1) |

---

## 10. Implementation order

Four commits, in this order, all pushed before §7.2 step 3. Commits 1 and 2 are
the reproducer pattern (DoD §3) for the defect this task removes (§0.2 #4).
Commits 3 and 4 add behaviour rather than fix a defect, so their cases land in
the same commit as the code.

1. **`TASK#25: minimal reproducer (failing)`** — H1, H2 and H5 with witnesses
   W1–W4, the H2 witness and ts-bridge #1c, plus §9.2 #1, #2, #3, #13. They fail
   on the parent: ambient `BLUEPRINT_ROOT`, `XDG_CACHE_HOME`, `GIT_SSH_COMMAND`
   and `GIT_ALLOW_PROTOCOL` all reach fixtures in a direct run today; the CLI
   reads `blueprint_source`; on #3 it falls back to its own checkout and exits
   0; and it reports unpushed commits.
2. **`TASK#25: drift and pull read the blueprint by its address`** — the CLI
   change (§1–§5, including the §5 warning), H4, cases #4–#12, #14–#28b and #29,
   the §9.3 migrations, and the same-commit ripples: the `scripts/blueprint`
   header; `README.md` §"The sync model"; CLAUDE.md §"Wake-time drift check"
   (fourth case) and `templates/` if it mirrors it; `scripts/new-project.sh`
   stops writing `blueprint_source`; the `staleness.sh` header;
   `docs/way-of-working.md` sync slides.
3. **`TASK#25: projects read the released branch, which CI fast-forwards to the tested commit`**
   — the `release` job and `blueprint_release_branch` (§7.4): its validation in
   `bp_config_load`, its use on the read path and in the header, and
   `new-project.sh` writing it. Cases #30–#33b and #39, and the
   `bootstrap-contents` assertion. Ripples: CLAUDE.md §"Back-propagating" config block,
   `README.md` §"The sync model", and the `docs/way-of-working.md` sync slide
   gain the field.
4. **`TASK#25: the toolchain installer writes the per-machine blueprint command`**
   — `install_blueprint_command`, its closed-set ownership check, the
   `--replace-blueprint-command` mode with `--project=<dir>` and its
   migrated-project validation, and the `check` line (§8.1), cases #34–#38
   and #37b, README §"One-time setup", and §8.2's precondition added to
   `PLAN-TASK-021-RESTRUCTURE.md`.

**Why this order.** Commit 2 needs commit 1's harness scrub to be testable.
Commit 3 builds on commit 2's read path: a read branch means nothing before
there is an address to read it from. Commit 4 is last because the command it
writes is safe only once a project can carry a self-sufficient CLI, which
commit 2 provides, and it must be published before any machine reaches §7.2
step 8.

**Expected diff in `scripts/blueprint`** (commits 2 and 3):
- `_bp_fetch_blueprint`: cache, refresh, tree, error text, about 70 lines
- the two handlers and `_bp_shielded_write`: about 15 lines
- `_bp_resolve_blueprint_root` shrinks to "override, or nothing"
- `read_blueprint_source` gains the address/override branch and the §5 warning
- `pull_file`'s writes go through `_bp_shielded_write`
- the drift header (with the read branch), pull banner and bootstrap-history
  message change

**Rollback** (revision 5, §R4 #3). A migrated project reads `released` and
nothing else. So the rollback is published **through** the release job, and the
job is removed last. Reverting all four commits at once removes the job in the
same commit. That commit's run then has no job, and `released` stays on the
unreverted tree (reproduced). Pinned by §9.2 #39.

1. **Publish the rollback, keeping the job.** In a blueprint checkout at `main`:
   `git revert --no-commit <c4> <c3> <c2> <c1>`, then
   `git checkout HEAD -- .github/workflows/security.yml`, then one commit,
   `TASK#25: roll back TASK-025, keeping the release job so released carries the rollback`,
   pushed. The pre-push gate runs on it like any other push. Its green run
   fast-forwards `released` to it, since it descends from every SHA `released`
   has held.
2. **Wait** until `git ls-remote <remote> refs/heads/released` prints that SHA.
   If the rollback commit cannot go green, the fallback is a reviewed, explicit
   fast-forward: the owner runs the gate at that SHA, then
   `git push origin <rollback sha>:refs/heads/released`, without force, which
   the server refuses unless it is a fast-forward. This is the one hand push of
   `released` this plan allows.
3. **Each migrated project pulls through its own address path:**
   `blueprint pull scripts/blueprint` plus the lib closure, derived as in §7.2
   step 4 but from the rollback tree. It is a partial pull, so `bootstrap_sha`
   stays (BUG-016). No `BLUEPRINT_ROOT`, and no restored wrapper, is involved.
4. **On each machine that did §7.2 step 8,** once every project on it has done
   step 3, restore the previous command with the one rename the installer
   printed: `mv ~/.local/bin/.blueprint-replaced.<X>/blueprint ~/.local/bin/blueprint`.
   Also `git pull` the checkout that wrapper names. Until then, do not run
   `blueprint` in a rolled-back project on that machine: a CLI from before
   TASK-025 finds the blueprint from its own location, and the installer's
   command would hand it the project's copy.
5. **Only then remove the job:** `git checkout <c1>~1 -- .github/workflows/security.yml`,
   one commit, pushed. Its run has no `release` job, so `released` stays at the
   rollback SHA, whose tree is the rolled-back one. A leftover
   `blueprint_release_branch` line is inert for the old CLI, since
   `bp_config_field` greps only the key it is asked for
   (`scripts/lib/request-config.sh:24`), so it can be deleted at leisure.
   Delete `released` by hand once no project carries the field.

Caches under `~/.cache/struct2flow/` are inert without the new CLI and can be
deleted.

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
- **"B does not remove the network from an honest wake": it holds under
  contract T** (§2.1, decided). "Matches the newest blueprint" needs the network
  under A and B alike, so offline is not a differentiator.

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

- §11.3's green-CI branch is adopted for A, under the conditions in §7.4.
- §11.4's "sequenced after Stage B" is softened. The payload approach removes
  that dependency, and the costs remain: every `npm ci` needs the registry, a
  new publish credential, storm2flow's manifest decision, and the two npm traps
  above.

### 11.8 Side by side (revision 2)

| | **A: git remote + cache** | **B: npm package** |
|---|---|---|
| Network at wake | one warm fetch (WAN 1.51 s measured, rev 1; local 5–7 ms) | none for conformity to the installed version; `npm view` for availability |
| Offline wake | **5**; the labelled `BLUEPRINT_ROOT` override compares against a local checkout | conformity to the installed version + "newer: unknown", which does not answer contract T |
| Cache and integrity | persistent bare cache, git object hashes, per-run ref; corruption → 5 | npm cache; lockfile `integrity` |
| What "the blueprint" is | the tip of `released` | installed version; `bootstrap_sha` removed |
| CLI invocation | project-local `scripts/blueprint` via the installer's command (§8.1) | `npx blueprint`; needs `npm ci` first |
| CI impact | none | every `npm ci` needs the registry |
| New credentials | none | a publish token; install tokens if private |
| "What ships" boundary | unchanged | payload from `git archive` + mandatory `.npmignore`; `.gitignore` needs special handling |
| `cmd_drift` change | resolver, cache, tree, handlers, header | lib-root resolution, expansion rewrite, version-vs-latest, `bootstrap_sha` removal |
| Sequencing vs TASK-021 | before Stage B, and unblocks it | no longer forced after Stage B; does not unblock it (the wrapper does) |
| Reversibility | revert four commits; the override is the recovery path | unpublish/deprecate, edit three projects, restore allowlist and wake command |

### 11.9 Recommendation (the author's)

**Build A with the review's changes. B stays a possible successor.**

1. **A unblocks Stage B, and B does not.** The wrapper in §8.1 needs a
   project-local CLI that can read the blueprint without a checkout, which is
   A.
2. **Offline answers do not separate them** (§11.2). Under contract T neither
   can say "newest" offline.
3. **B's green-CI gate is available to A, and A adopts it** (§7.4).
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

## 12. Settled questions

The founder's four are recorded in §R3. The two the re-review was asked are
settled here, so no alternative remains in the plan:

- **`BP_FETCH_TIMEOUT` is one budget, 30 s.** A warm refresh is one round trip
  and finishes far inside it (§0.3, §0.4). Only a cold first run transfers the
  pack. A split budget adds a cold-or-warm decision to get wrong, for no
  measured gain. Revisit if a warm wake is ever seen near the budget.
- **#28 stays a smoke case paired with #28b.** The race lives in where `mv`
  places the loser's directory, and #28b reproduces that deterministically by
  pre-seeding what a lost race leaves. A seam inside `mv` would test the seam.
