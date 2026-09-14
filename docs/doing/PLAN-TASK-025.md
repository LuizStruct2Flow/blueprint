# PLAN — TASK-025: `drift` and `pull` read the blueprint by its address

**Status:** PLAN. Awaiting cross-provider review. No code is authorised by this
document. Author: Christian (Senior Architect), 2026-09-14.

**Two options are on the table, and the review decides between them.**

- **Option A: the git remote.** §1–§10 of this document.
- **Option B: the blueprint as an npm package.** Raised by the founder the same
  day (*"what if doing a npm / yarn package out of the blueprint?"*). §11 gives
  it the same treatment and a side-by-side comparison.

The author's recommendation is in §11.9. It is a recommendation, not a
settled decision.

**Founder decision, 2026-09-14:** *"what if we keep track of the repository
address of the blueprint? It doesn't matter where it is physically."*

**Scope:** `cmd_drift`, `cmd_pull`, `read_blueprint_source` and
`_bp_resolve_blueprint_root` in `scripts/blueprint`, plus the fixtures of the
suites that drive them. `a2bp`, `prs`, `files` and `help` are untouched.

---

## 0. What was measured before writing this (2026-09-14)

Every claim below about current behaviour was run, not read. Where the brief I
was handed disagreed with the measurement, the measurement is recorded and the
brief is corrected in §0.2.

### 0.1 Facts that held

| Claim | How it was checked | Result |
|---|---|---|
| `drift`/`pull` resolve a LOCAL checkout | read `_bp_resolve_blueprint_root` (`scripts/blueprint:579`); ran drift in all three projects | `$BLUEPRINT_ROOT` → `blueprint_source` → the CLI's own checkout. All three reported `blueprint: <local path>` |
| Every derived project records `blueprint_remote` + `blueprint_branch`, config v2 | read the three `.blueprint-source` files | all three: `config_version = 2`, `git@github.com:LuizStruct2Flow/blueprint.git`, `main` |
| `~/.local/bin/blueprint` hard-codes the checkout path | read it | `exec /home/luiz/dev/struct2flow/blueprint/scripts/blueprint "$@"` |
| linkedin-watcher-agent and struct2flow-www carry `scripts/blueprint`; storm2flow does not | `ls` | true. storm2flow has no `scripts/blueprint` and no `scripts/lib/` at all |
| Both local copies already carry Stage A′ | `grep -c bp_blueprint_path` | 7 in each, same as the blueprint |
| PR #66 changes `cmd_drift`'s comparison loop | `gh pr diff 66` | U6 wraps the `diff -q` at `scripts/blueprint:1078` in a `marker_aware_merge`. Still OPEN, no review decision |
| `drift` exits 0 when files have drifted | ran it in www (4 drifted) | exit 0. **Unchanged by this plan** |

### 0.2 Facts that did NOT hold, or held differently

1. **`a2bp` does not use a clone, and does not read through `ls-remote`.**
   `bp_file_fetch_base` (`scripts/lib/request-file.sh:34`) runs `git init --bare`
   and then `git fetch --depth 1 <remote> <branch>`. `ls-remote` is used only for
   the push-adoption check. A depth-1 fetch **cannot serve `drift`**: `drift`
   prints `git log BOOTSTRAP_SHA..HEAD`, which needs history. So this plan reuses
   a2bp's *pattern* (the scratch dir, the EXIT/INT/TERM trap, the transport env
   scrub, the exit-status vocabulary), not its fetch depth.
2. **struct2flow-www's `blueprint_source` is an absolute host path**
   (`/home/luiz/dev/struct2flow/blueprint`), not `../blueprint`. That is the
   BUG-012 shape, live in a derived project today.
3. **PATH matters for all three projects, not only storm2flow.** The managed
   `CLAUDE.md` tells every agent to run plain `blueprint drift`. `type -a
   blueprint` resolves only the wrapper. So when lwa and www follow the wake
   protocol they run **the blueprint checkout's CLI**, not their own local copy.
   Their local copies run only when someone types `bash scripts/blueprint`.
4. **The local blueprint checkout is ahead of its remote right now, and every
   derived project is reporting against the unpushed commits.** Local HEAD was
   `f9e693f`, `origin/main` was `567b266`. A fresh fetch of the remote proves
   `f9e693f` and `0a9c7ed` do not exist there (`cat-file --batch-check`:
   `missing`). But drift in all three projects listed them under *"Blueprint has
   N commit(s) since this project was last synced"*. A `pull` run at that moment
   would have written an unpushed SHA into `bootstrap_sha`. **This is the defect
   this task removes, observed live.**
5. **The test harness does not scrub `BLUEPRINT_ROOT`.** `tests/harness/env.ts`
   declares `BP_CODE_ROOT` and `BP_STATE_ROOT` and nothing else from that
   family. An operator with `BLUEPRINT_ROOT` exported makes every sync suite
   resolve to their own checkout and silently take the override path. That is an
   R3 hole today, and it becomes a worse one here, because this plan makes the
   override the *only* local path.
6. **GitHub refuses `git archive --remote`.** It fails with `Invalid command:
   git-upload-archive`. That rules out option (c) in §1.
7. Unrelated, recorded so it is not lost: **linkedin-watcher-agent's gate is not
   armed.** `core.hooksPath` holds an absolute path, and `arm_gate` correctly
   refuses to overwrite it. That is not this task's to fix.

### 0.3 Cost measurements (Linux box, SSH to GitHub)

| Operation | Wall time |
|---|---|
| `git ls-remote` of `refs/heads/main` | < 1 s |
| cold `git fetch` of full `main` into an empty bare repo | 2.44 s |
| warm `git fetch` into that same bare repo, nothing new | 1.51 s |
| cold `git clone --single-branch --branch main` including checkout | 2.53 s |
| blueprint pack size (`count-objects`) | 2.03 MiB |

The SSH handshake dominates, so a persistent cache saves about **1 s per wake**.
Everything in §1 rests on that number.

---

## 1. The fetch model

### Options

| | Model | Verdict |
|---|---|---|
| a | **A throwaway `git clone --single-branch` per invocation**, into `mktemp -d`, removed on every exit path | **CHOSEN** |
| b | A persistent bare mirror under `${XDG_CACHE_HOME:-$HOME/.cache}`, fetched each run | rejected for v1, with a re-open trigger |
| c | `git archive --remote` | impossible: GitHub refuses it (§0.2 #6) |
| d | `ls-remote` + fetch into a cache only when the tip moved | a variant of (b), and it still pays the handshake for the `ls-remote` |

### Why (a)

1. **It changes one thing: where `BLUEPRINT_ROOT` points.** A clone is a real
   repository with a real working tree and a real HEAD. So every existing
   consumer runs unmodified against it:
   - `git -C "$BLUEPRINT_ROOT" archive HEAD tests` (the BUG-029 expansion)
   - `rev-parse HEAD`, and `rev-list` / `log BOOTSTRAP_SHA..HEAD`
   - `bp_blueprint_path`'s `[ -e ]` filesystem oracle (Stage A′)
   - the comparison loop, including PR #66's U6 if it lands

   Measured: the expansion listed 71 shipped test files from the scratch clone.
   No consumer learns that the tree came from a network.
2. **No staleness exists to reason about.** Every report is either fresh as of
   this run, or a non-zero failure. §4 is therefore short, and cannot become
   F-002.
3. **No locking.** The orchestrator and several personas wake at once and each
   run `drift`. Concurrent fetches into one shared cache contend on ref locks,
   which (b) would need `flock` for, and macOS has no `flock`. Separate
   scratches share nothing.
4. **No persistent directory to own, prune, or corrupt.** There is nothing
   between runs to clean up.
5. **The saving (b) buys is about 1 s** (§0.3), set against 2.5 s. That does not
   pay for items 2–4.

**Re-open (b) if** a cold clone exceeds 10 s on a normal connection, the
blueprint pack exceeds 50 MiB, or offline `drift` becomes a stated need that the
`BLUEPRINT_ROOT` override (§5) does not meet. Record the measurement in this
file when you do.

### Mechanics

- **Where.** `mktemp -d "${TMPDIR:-/tmp}/blueprint-sync.XXXXXXXX"`. It is a
  tooling workspace that git walks, so per CLAUDE.md §"Running commands" it must
  be outside any git tree and created by the code that needs it. The system temp
  dir satisfies both. It is **not** `.scratch/`, which is inside the project
  tree.
- **Who creates it.** A new `_bp_fetch_blueprint` in `scripts/blueprint`, called
  from `read_blueprint_source` only on the address path.
- **Who cleans it up.** The same function. It installs `trap … EXIT INT TERM`,
  and the path lives in a **global** (`BP_SYNC_SCRATCH`). This copies a2bp's
  `_a2bp_cleanup` exactly, including its lesson: a `local` is out of scope by the
  time the EXIT trap fires, and a2bp once leaked a clone per run for that reason
  (`scripts/blueprint:1366`). `die` calls `exit 1`, so the EXIT trap covers that
  path too.
- **How.** A single command:
  `bp_request_transport_env <timeout> git clone -q --single-branch --branch "$BP_CFG_BRANCH" --no-tags "$BP_CFG_REMOTE" "$scratch/tree"`.
  - `bp_request_transport_env` (`scripts/lib/request.sh:155`) keeps
    credentials, and unsets `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the
    config injectors. That matters because `drift` can run inside a hook, where
    git exports `GIT_DIR`, and BUG-077 is the proof that this redirects git.
  - The clone copies no hooks from the remote, so nothing from the blueprint
    executes.
- **Timeout.** It reuses `bp_staleness_timeout_cmd`. The budget is
  `BP_FETCH_TIMEOUT`, default **30 s**, which is 12× the measured 2.5 s: set from
  a measurement, per R4. If no `timeout`/`gtimeout` exists the run fails with 5,
  not unbounded. `install-toolchain.sh` already treats a missing timeout as
  gate-blocking (`:210`, `:333`), so this adds no new requirement, and a hung
  wake is worse than a clear refusal.

---

## 2. Which commit is "the blueprint"

**The tip of `blueprint_branch` on `blueprint_remote` at the moment of the
clone.** It is the scratch clone's `HEAD`, so `CURRENT_SHA=$(git -C
"$BLUEPRINT_ROOT" rev-parse HEAD)` needs no change.

- **`drift`** lists `BOOTSTRAP_SHA..CURRENT_SHA` from the clone's full
  single-branch history. All three projects' bootstrap SHAs (`d37d28c`,
  `90b809e`, `4a7958c`) were checked and exist on the remote.
- **`bootstrap_sha` not in the fetched history.** This happens when it was
  recorded from an unpushed or rewritten commit, which §0.2 #4 shows can happen
  today. Current code prints `?` and an empty log (`2>/dev/null || echo "?"`),
  which reads like "nothing new". The new code prints one explicit line instead:
  *"bootstrap_sha `<x>` is not in `<remote>` `<branch>` history. It was recorded
  from a commit that was never pushed or was rewritten, so commits since sync are
  unknown."* Exit stays 0, because the file-by-file comparison is still valid.
  What changes is that the silence is gone.
- **`pull`** writes the **full** SHA it cloned into `bootstrap_sha`, and only on
  a full pull (BUG-016, unchanged). So `bootstrap_sha` can no longer name a
  commit that exists only on one machine.
- **A race between `drift` and a later `pull`.** If the remote moves in between,
  `pull` clones again, shows the diff it is about to apply, and records the
  commit it actually applied. That is correct, not a hazard: each command's
  answer describes the tree it read.
- **The header** replaces `blueprint: <path>` / `blueprint HEAD: <sha>` with:

  ```
  blueprint:  git@github.com:LuizStruct2Flow/blueprint.git  (main)
  fetched:    <full sha>  at 2026-09-14T15:02:11Z
  ```

---

## 3. Offline and failure behaviour; exit statuses

**An unreachable remote is never a clean report.** No fallback runs: not to a
local checkout, not to a previous result, not to an empty tree. In particular
the old third resolver step, "the checkout this CLI runs from", is **removed
from the address path**. On the day the network fails, it would quietly
reintroduce exactly the local-folder answer this task deletes, and nothing would
say so. That is F-002.

The vocabulary is `a2bp`'s (`scripts/lib/request-file.sh:17`). Only values that
mean the same thing are reused.

| Status | `drift` | `pull` | Same meaning in a2bp? |
|---|---|---|---|
| **0** | report produced against a freshly cloned tip, drifted or not (unchanged); or in the blueprint itself (unchanged) | pulled, or nothing to pull (unchanged; BUG-018's comment says "nothing to do" is success) | yes: "did its job" |
| **1** | `die`: no `.blueprint-source`, expansion failure (unchanged) | same (unchanged) | n/a |
| **4** | config refused: version 1 with no override, placeholder or empty `blueprint_remote`, invalid branch, or version too new | same | yes: a2bp returns 4 when `bp_config_load` refuses (`scripts/blueprint:1337`) |
| **5** | **could not reach the blueprint**: clone failed, timed out, no timeout provider, or scratch not creatable | same, and **nothing is written** to the project | yes: "operational failure" |
| **7** | — | refused, no TTY without `--yes` (unchanged) | n/a |

`3` (filed, pending) and `6` (nothing to request) have no analogue here and are
not used.

Status 5 always prints, to stderr:

```
error: could not reach the blueprint at <remote> (<branch>)
  <git's first error line, or "timed out after 30s">
  Nothing was compared. This is NOT a clean drift report.
  Offline? Compare against a local checkout explicitly:
    BLUEPRINT_ROOT=<path to a blueprint checkout> blueprint drift
```

**The wake protocol.** CLAUDE.md §"Wake-time drift check" lists three cases.
A fourth is added in the same commit: *"4. Unreachable — non-zero, says so.
Tell the founder the drift check did not run. Do not report the project as
in sync."*

---

## 4. Staleness, and telling fresh from cached

There is no cache in v1, so no answer is ever cached. What the operator needs to
tell apart is **address** from **override**:

- **Address path.** The header shows `blueprint: <remote> (<branch>)` and
  `fetched: <sha> at <UTC time>`. That line is the proof of freshness.
  `report_staleness` does not run: it asks whether a local checkout is behind
  its remote, and there is no local checkout.
- **Override path** (`BLUEPRINT_ROOT` set). The header shows
  `blueprint: LOCAL CHECKOUT <path> (BLUEPRINT_ROOT override, not the published address)`,
  and `report_staleness` runs exactly as it does today. That is the one case
  where "your copy is N behind / ahead with unpushed commits" means something.
  A local override that is ahead of its remote is exactly §0.2 #4, now
  labelled.

If §1's re-open trigger ever fires and (b) is built, the header gains
`cached: <sha> fetched <age> ago`, and a failed refresh is still status 5, never
a silent read from the cache. That is recorded here so a future cache cannot be
designed around that rule.

---

## 5. What still needs a local checkout

| Case | Behaviour |
|---|---|
| **The blueprint itself** | Unchanged. `_bp_is_blueprint_itself` (the `.blueprint-root` marker) returns before any config is read, so no network is contacted except the existing `ls-remote` in `report_staleness`, which already degrades to "unknown". Pinned by `tests/drift-in-blueprint`. |
| **`BLUEPRINT_ROOT` override** | **Kept, and it is the only local path.** It is for three things: (1) the blueprint maintainer previewing an **unpushed** blueprint change against a derived project before pushing it; (2) working offline; (3) **recovery**, see below. It is an env var, per shell and never committed, because a committed path is the field that "cannot be right on two machines at once". |
| **`blueprint_source` field** | **Ignored** by `drift` and `pull`. It is not an override: two overrides is one too many, and this is the one that caused BUG-007 and BUG-012. While the field is present, `drift` prints one dim line, *"blueprint_source is no longer read (TASK-025). Remove it from .blueprint-source."*, so migration is driven and finite rather than silent. |

**Recovery property (tested, §9 #12).** The override path must not source the
network libraries (`request.sh`, `request-config.sh`). A project that pulls the
new `scripts/blueprint` without its libs then still has a way out:
`BLUEPRINT_ROOT=<checkout> blueprint pull scripts/lib/request.sh scripts/lib/request-config.sh`.
A2BP-style "every lib required up front" is right for a2bp and wrong here,
because here the libs are what is being repaired. That is BUG-028's shape, and
Stage A′ exists for the same reason.

The address path sources those two libs lazily, and fails with 1 and the
recovery command above if they are missing.

---

## 6. The layout inside the fetched tree (Stage A′ / Stage B)

**The per-path resolver applies unchanged, because the fetched tree is a real
working tree.**

- `bp_blueprint_path` asks `[ -e "$BLUEPRINT_ROOT/scaffolding/$f" ]` and
  otherwise returns the root path. Against the scratch clone that is the
  filesystem of the fetched commit. It gives the same answer as `git cat-file -e
  <sha>:scaffolding/$f`, because the checkout **is** that commit, with nothing
  staged or dirty.
- `bp_expand_managed_dirs` runs `git archive HEAD <scaffolding/dir | dir>` and
  unions the results. Against the clone, `HEAD` is the fetched tip. The comment
  at `scripts/blueprint:425-439` explains that the two oracles (filesystem vs
  HEAD) diverge only while a `git mv` is staged and uncommitted. **A fresh clone
  cannot be in that state**, so the address path removes the one divergence the
  Stage A′ comment had to justify. The override path keeps it, as today.
- a2bp's `bp_base_path` answers the same question against a bare repo with
  `cat-file`. No merge of the two resolvers is proposed: each asks the oracle it
  reads from, which is the Stage A′ design rule.
- **Proven by test**, not by argument: §9 #10 re-runs all four
  `blueprint-relocation` shapes (flat, moved, and both half-moved trees) served
  **through a remote**, and re-applies that suite's mutants A, B, C, D and F.

---

## 7. Migration

### 7.1 The config

| Project state | New behaviour |
|---|---|
| v2, real `blueprint_remote` (all three today) | reads the remote. `blueprint_source` is ignored and nagged once per run |
| v2, `blueprint_remote = FILL-ME-IN` (every fresh bootstrap) | **4**, with `bp_config_load`'s existing placeholder message, plus: *"or export BLUEPRINT_ROOT=<checkout> to compare against a local checkout"* |
| v1 (no `config_version`) | **4**, with `bp_config_load`'s existing "add these lines" message, plus the same override hint. The remote is **never inferred** from a checkout's `origin`, for the reason `request-config.sh:9` gives |
| any version, `BLUEPRINT_ROOT` exported | local override, labelled (§4) |

Validation is `bp_config_load`, reused as-is. No second parser is written:
a2bp and sync reading the same file two ways is the A-07 R5-F1 defect.

**`scripts/new-project.sh`** (forge, blueprint-only) stops writing
`blueprint_source` and its `_relative_path` helper is deleted. It keeps writing
the `FILL-ME-IN` placeholder, deliberately and for the reason already stated at
`new-project.sh:282`, and its closing "next steps" output names that field as
the first thing to fill in. The unregistered-project message in
`read_blueprint_source` stops suggesting `blueprint_source`.

### 7.2 Order of operations

1. **PR #66 is decided** (merged, adapted, or closed). See §8.
2. **TASK-025 lands in the blueprint and is pushed.** It must be pushed: after
   this, projects read what is *published*, so an unpushed TASK-025 is invisible
   to them by design.
3. **Each project pulls the new CLI with its current CLI.** Before Stage B the
   current CLI's local-folder mode still works:
   `blueprint pull scripts/blueprint scripts/lib/request.sh scripts/lib/request-config.sh`,
   plus any other lib the implementation touches. This is a partial pull, so it
   leaves `bootstrap_sha` alone (BUG-016), which is correct.
4. **Each project deletes `blueprint_source`** and its "LOCAL checkout" comment
   from `.blueprint-source`, in the same commit as step 3, and runs `blueprint
   drift` to confirm the header names the remote.
5. **Replace the wrapper on each machine** (§8).
6. **Only then Stage B.**

### 7.3 Per project

- **linkedin-watcher-agent.** Local CLI present with A′. Steps 3–4 as written.
  It is 18 files drifted and 7 commits behind, which is independent of this
  task.
- **struct2flow-www.** Local CLI present with A′, and its absolute
  `blueprint_source` goes away at step 4. **Its local `scripts/blueprint` carries
  PR #66's U1/U6 edits** (verified by `diff`). If #66 is rejected, step 3
  overwrites them, with the diff shown. So www must see #66's outcome before
  pulling. That is the other reason for step 1.
- **storm2flow.** **No local CLI, no `scripts/lib/`,** 398 commits behind, and
  its `.blueprint-source` reserves the `bootstrap_sha` bump for its own slice S8.
  It needs step 3 to pull `scripts/blueprint` **and every `scripts/lib/*.sh` the
  CLI sources** (the drift list shows all 18 libs as `+`). This is still a
  partial pull, so S8's reservation holds. **Until storm2flow has done that, it
  is the one project that depends on the wrapper pointing into a blueprint
  checkout, and Stage B must wait for it.**

---

## 8. The wrapper, Stage B, and PR #66

### 8.1 The wrapper, concretely

TASK-025 does not by itself remove the Stage B hazard, and this plan will not
claim it does. The wrapper still `exec`s
`/home/luiz/dev/struct2flow/blueprint/scripts/blueprint`, Stage B still moves
that file, and §0.2 #3 shows all three projects reach it through PATH.

What TASK-025 changes is that **the wrapper no longer needs to point at the
blueprint at all.** A project-local CLI reads the remote, so it needs no checkout
beside it. The wrapper becomes:

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

- The second candidate is the blueprint itself after Stage B. Before Stage B the
  first one matches there too.
- **It is a file outside git, so no commit can install it.** It lands as the
  README §"One-time setup" text, replacing the PATH/symlink instructions (which
  also name a stale `~/sources/` path), and each machine updates it by hand.
  Whether `install-toolchain.sh` should write it is a **founder question**. It
  already writes to `~/.local/bin` on Linux, but it has never owned a file that
  runs project code.
- **Cost, stated:** `blueprint files` and `blueprint help` now work only from a
  project root, since `./scripts/blueprint` must exist relative to cwd. Every
  other subcommand already required that.
- The allowlist entry `Bash(blueprint *)` still matches, so the wake command
  is unchanged.

### 8.2 Stage B

Gate: **Stage B may start when all three projects have completed §7.2 steps 3–4
and every machine has the §8.1 wrapper.** This is a checkable condition: each
project's `drift` header names a remote, and `type -a blueprint` on each machine
shows no path into the blueprint. It joins Stage A′ as a precondition in
`PLAN-TASK-021-RESTRUCTURE.md`, as an edit to that plan in the implementation
commit, not now.

### 8.3 PR #66 composes, and the assumed order is #66 first

- **No shared lines.** #66's U6 sits inside the comparison loop
  (`scripts/blueprint:1076-1082`) and its U1 in `MANAGED_FILES`. TASK-025
  changes `read_blueprint_source`, `_bp_resolve_blueprint_root`, the drift
  header (`:1041-1057`) and the pull banner (`:1155`). Different hunks.
- **No shared semantics.** U6 compares a blueprint file with a project file.
  TASK-025 changes only which directory the blueprint file is read from, and the
  scratch clone is a filesystem like any other. `marker_aware_merge` cannot tell
  the difference.
- **Assumed order: #66 decided first**, because it is under review now and
  because of www (§7.3). If #66 merges, the new suite's marker case (§9 #9b)
  runs through the remote path and `tests/marker-merge` migrates its fixture like
  the rest. **If #66 is rejected:** drop §9 #9b, keep the U1 files out of the
  migration pull list, and www's step 3 overwrites its local U6. Nothing else in
  this plan changes.
- **If TASK-025 were to land first instead:** #66 would conflict only textually
  near the header, and its U6 test fixture would need `blueprint_remote`
  instead of `blueprint_source`. That is a rebase, not a redesign.

---

## 9. Tests

**All new coverage is TypeScript on `tests/harness`. No new shell test code.**
There is one new suite, `tests/sync-by-address/sync-by-address.spec.ts`.
`vitest.config.ts` includes `**/*.spec.ts`, and `tests/manifest` derives the
suite set from the filesystem, so no registration step exists to forget.

### 9.1 The fixture: a local remote, never GitHub

- **The remote is a directory inside the scenario workspace.** A bare repo
  (`git init --bare`) pushed from a fixture working repo, or a non-bare fixture
  repo, which `git clone <path>` accepts. `.blueprint-source` gets
  `blueprint_remote = <absolute workspace path>`. `bp_config_load` accepts any
  non-placeholder string, and the existing `a2bp-e2e` suite already files
  against a local remote this way.
- **Nothing can reach GitHub.** Every remote a case writes is a workspace path
  or the `ssh://git@127.0.0.1/blackhole.git` address that `tests/staleness` #8
  already uses behind an `ssh` shim (`makeShimDir`).
- **Harness change, required, landing in the reproducer commit:**
  - add `BLUEPRINT_ROOT: 'path'` to `ENV_KIND` in `tests/harness/env.ts`, so it
    is scrubbed from every scenario and refused as an escaping override. Without
    it, an operator with `BLUEPRINT_ROOT` exported sends every case down the
    override path and the suite passes over the wrong code (§0.2 #5).
  - add `BP_FETCH_TIMEOUT: 'opaque'`.
  - Cases that test the override set `BLUEPRINT_ROOT` to a workspace path, which
    the `'path'` kind permits.
- `HOME` and `TMPDIR` are already scenario-owned, so the scratch clone lands in
  the scenario's temp dir, where #11 can inspect it.

### 9.2 Cases, each with its mutant (R6)

Each mutant is applied once, at implementation time, and the observed red set is
recorded in the suite header, as `blueprint-relocation.spec.ts` does. The table
says which case *must* go red. The recorded set is whatever is observed.

| # | Case | Mutant that must turn it red |
|---|---|---|
| 1 | `drift` reads the remote when **no local checkout exists anywhere**. Report matches the remote's content, header names the remote and the fetched SHA | resolver keeps step 3 (CLI's own checkout): the report reflects the real blueprint, not the fixture |
| 2 | **A stale sibling checkout, named by `blueprint_source`, is not consulted.** The sibling holds an older `docs/DoD.md`, the remote the newer one, and drift reports against the newer | restore `blueprint_source` precedence in `_bp_resolve_blueprint_root` |
| 3 | **Unreachable remote** (a workspace path that does not exist) → exit **5**, stderr contains `could not reach the blueprint`, stdout contains neither `✓ All blueprint-managed files match` nor any `~`/`+` line | `clone … \|\| true` (degrade to an empty tree), or fall back to step 3 on failure |
| 4 | **Hung remote** (shimmed `ssh` that never answers, `BP_FETCH_TIMEOUT=2`) → exit **5** mentioning the timeout, within a bound set from measurement; waits on process exit, never a sleep (R4) | remove the `timeout` wrapper |
| 5 | **The remote advances between two runs** (the cache-stale case). Run 1 reports tip A. A commit lands on the remote. Run 2 reports tip B and the newly drifted file | reuse an existing `blueprint-sync.*` scratch when one is present, i.e. a hidden cache |
| 6 | **Override works offline, and says so.** `BLUEPRINT_ROOT` set, remote unreachable → exit 0, header contains `BLUEPRINT_ROOT override`, staleness line present | ignore the override (goes 5) or drop the label |
| 7 | **Config v1** (no `config_version`) → exit **4**, prints `config_version   = 2` and `blueprint_remote`, prints no report. Same fixture plus override → 0 | infer the remote from the override checkout's `origin` |
| 8 | **Placeholder remote** `FILL-ME-IN` → exit **4**, names the field, no network contact (the shim `ssh` records zero invocations) | skip `bp_config_load`'s placeholder arm |
| 9 | **A full `pull --yes` records the full fetched SHA** in `bootstrap_sha` and lands substituted bytes. A partial pull leaves `bootstrap_sha` byte-identical | record a short SHA, or record on a partial pull |
| 9b | *(only if #66 merges)* a marker file whose managed region matches and whose project tail differs is **not** drift, read through the remote | revert U6 |
| 10 | **All four `blueprint-relocation` shapes served through a remote**: that suite's `derivedProject` writes `blueprint_remote` and not `blueprint_source`, and its #1–#7 run unchanged | that suite's mutants A, B, C, D, F, re-applied; the red sets must match the ones recorded there. #8 is rewritten: it asserted step 3, which this plan removes |
| 11 | **Scratch removed on every exit path**: after 0, after 5 (#3's fixture), after 1 (an expansion failure: a remote whose `tests/` holds only export-ignored files), and after `SIGTERM` delivered mid-clone (shim `ssh` blocks until signalled). The scenario `TMPDIR` holds no `blueprint-sync.*` afterwards | remove the trap, or make the scratch variable `local` (a2bp's own past bug) |
| 12 | **Recovery**: a project whose `scripts/lib/request-config.sh` is missing can run `BLUEPRINT_ROOT=<fixture checkout> pull scripts/lib/request-config.sh --yes` → exit 0, file lands. Without the override it exits 1 and prints that command | source the network libs unconditionally at the top of `cmd_drift`/`cmd_pull` |
| 13 | **Unpushed commits are not reported** (§0.2 #4, reproduced). The fixture blueprint working repo has a commit not pushed to its bare remote, and the project's drift neither lists it in commits-since-sync nor compares against its content | read from the working repo instead of the remote |
| 14 | **`bootstrap_sha` absent from remote history** → the explicit "not in … history" line, exit 0 | restore `2>/dev/null \|\| echo "?"` with no message |
| 15 | **Hook context**: `GIT_DIR` pointing at the project's `.git` is passed explicitly, the way `tests/git-isolation` does. The clone still lands in the scratch, and the project's `.git/config` is byte-unchanged (canary) | call `git clone` without `bp_request_transport_env` |

### 9.3 Existing suites that migrate their fixtures

These currently write `blueprint_source` and must write `blueprint_remote`
instead. Otherwise they either break or, worse, pass through the nag line while
testing nothing new. Measured `grep -c`:

| Suite | uses | Change |
|---|---|---|
| `blueprint-relocation` | 4 | §9.2 #10 |
| `suite-sync` | 4 | retarget, and re-run its #1c mutant |
| `bootstrap-contents` | 6 | asserts what bootstrap writes. It must now assert `blueprint_source` is **absent** |
| `pull-behaviour`, `marker-merge`, `drift-in-blueprint`, `bootstrap-gate` | 1–2 each | retarget |
| `staleness` D#1–D#5 | 1 | these test a *local checkout* being stale, which is now the override path: set `BLUEPRINT_ROOT` |
| `a2bp-e2e`, `a2bp-inputs`, `a2bp-contamination` | 1–3 | a2bp never reads the field. Leave as-is, and confirm green |

---

## 10. Implementation shape (for review, not authorised)

The commits follow the two-commit reproducer pattern (DoD §3):

1. `TASK#25: minimal reproducer (failing)`. The harness `BLUEPRINT_ROOT` scrub,
   plus §9.2 #1, #2, #3 and #13. They fail on the parent: today's CLI reads
   `blueprint_source`, and on #3 falls back to its own checkout and exits 0.
2. `TASK#25: drift and pull read the blueprint by its address`. The CLI change,
   the remaining cases, the §9.3 fixture migrations, and the same-commit
   ripples:
   - the `scripts/blueprint` header (`:26-30`)
   - `README.md` §"The sync model" (setup and wrapper, wake-time)
   - CLAUDE.md §"Wake-time drift check" (fourth case) and `templates/` if it
     mirrors that section
   - `scripts/new-project.sh`
   - the `staleness.sh` header (it now serves the override only)
   - `docs/way-of-working.md` sync slides (`:286`, `:324`, `:352`)
   - `PLAN-TASK-021-RESTRUCTURE.md` (the §8.2 gate)

**Expected diff in `scripts/blueprint`:**
- one new function, `_bp_fetch_blueprint`, of about 40 lines, most of it the
  trap and the error text
- `_bp_resolve_blueprint_root` shrinks to "override, or nothing"
- `read_blueprint_source` gains the address/override branch
- the drift header and pull banner change
- the bootstrap-history message is added

**Rollback.** Revert the two commits in the blueprint. Projects that already
pulled the new CLI pull the reverted one back through
`BLUEPRINT_ROOT=<checkout> blueprint pull scripts/blueprint`. The override path
is the recovery path by design (§5), which is why #12 exists.

---

## 11. Option B: the blueprint as an npm package

### 11.0 Measured for this option

| Claim | Check | Result |
|---|---|---|
| All three derived projects are Node | coordinator's check, re-run with `ls` | lwa and www have a root `package.json`. **storm2flow has none at the root**, only `backend/`, `frontend/` and `infrastructure/` |
| The managed `tests/package.json` is present | `ls` | in lwa and www, **not in storm2flow**, which has not pulled `tests/` |
| The blueprint has a root `package.json` | `ls` | **no**. One would be added |
| The blueprint repo's visibility | `gh repo view` | **PUBLIC**. That changes the registry question, see §11.6 |
| The CLI resolves its libs through the path it was invoked by | `grep BASH_SOURCE` | **7 sites** (`:50`, `:844`, `:976`, `:1006`, `:1299`, `:1624`, plus the resolver at `:591`, which does `readlink -f`). The other six use unresolved `dirname`. The wrapper's own comment records the consequence: *"exec, not a symlink: scripts/blueprint resolves lib/ from dirname of BASH_SOURCE unresolved"* |
| What the pre-push gate and CI scan | read `security.yml`, `.githooks/pre-push` | `osv-scanner scan source`, recursive over lockfiles. CI runs `npm ci` in `tests/` only |
| How bootstrap decides what ships | `new-project.sh:141` | `git archive HEAD`, with `.gitattributes` `export-ignore` as the boundary |

### 11.1 Mechanism

- **The blueprint** gains a root `package.json`: `name` (e.g.
  `@struct2flow/blueprint`), `version`,
  `"bin": {"blueprint": "scaffolding/scripts/blueprint"}`, and
  `"files": ["scaffolding/"]`.
- **Projects** add it as a devDependency, pinned by their lockfile.
- **`drift`/`pull`** set `BLUEPRINT_ROOT` to the installed package directory,
  `node_modules/@struct2flow/blueprint`.
- **The installed version** replaces "which address" and "which commit" at once.

### 11.2 What the coordinator's summary got right, and what needs correcting

**Right:**
- Network is needed only at install and update.
- npm owns the cache and integrity: registry packages carry a `sha512`
  `integrity` in the lockfile.
- Drift against the installed version works offline.
- `scaffolding/` is naturally the `files` set, and `forge/` stays out.
- The managed files must still be real files in the project, so `drift`/`pull`
  survive, reading from a different directory.
- An `npm pack` tarball is a more honest bootstrap source for `bootstrap-gate`
  than `git archive`, because it *is* the artefact that ships.

**Needs correcting:**

1. **"PATH and the wrapper stop mattering entirely": half true.** The
   `~/.local/bin` wrapper goes. But the command becomes `npx blueprint drift`,
   so three things change:
   - the managed `.claude/settings.json` needs `Bash(npx blueprint *)`, because
     `Bash(blueprint *)` does not match it;
   - CLAUDE.md's wake command changes, in every project;
   - **a fresh clone cannot run `drift` until someone runs `npm ci`.** That is
     A-22's shape: a check that silently cannot happen on a clone that has not
     done a setup step.
2. **The CLI does not survive being installed as an npm `bin` as it is.** npm
   links `node_modules/.bin/blueprint` as a symlink on POSIX. Six of the seven
   lib sites use unresolved `dirname`, so they resolve to `node_modules/.bin/lib`
   and fail. All of them must move to a single symlink-resolving root. That is a
   small change, but it is not zero, and a miss at one site fails only that
   subcommand (e.g. `drift`'s `gate.sh` — the one that arms the gate, A-22 again).
3. **"osv-scanner already scans the lockfile": true and worth almost nothing
   here.** It matches package versions against CVE advisories. No advisory will
   ever name `@struct2flow/blueprint`, and it does not read the bash the package
   carries. It is no argument either way.
4. **"Network only at install/update" answers the wrong wake question.** The
   wake check has to ask *"is this project behind the blueprint?"*.
   - Under B, "files match the installed version" is **clean immediately after
     every pull, however far the blueprint has moved on**. Reported as "in
     sync", that is F-002 exactly.
   - An honest wake must also ask the registry for the latest version
     (`npm view <pkg> version`), and offline it must say *unknown whether a newer
     blueprint exists*.
   - So **B moves the wake's network call; it does not remove it.** What B does
     add is a trustworthy offline answer to the narrower question.
5. **More of `cmd_drift` changes than in A.** The installed package is not a git
   repository, so:
   - `bp_expand_managed_dirs` (`git archive HEAD`) becomes a filesystem listing
     of the package. That is correct, since the package *is* what ships.
   - `git log BOOTSTRAP_SHA..HEAD` has no history, and becomes "installed X,
     latest Y" plus a changelog the blueprint must now keep.
   - `bootstrap_sha` becomes a second record of what the lockfile already pins,
     so under B it is **removed**, not kept.
   - PR #66's U6 still composes: the comparison loop is untouched under B too.

### 11.3 Release semantics

A blueprint change reaches projects only when a version is published. The two
ways to do that:

| | Publish on every push to `main` (CI job) | Deliberate release step |
|---|---|---|
| Fan-out | the same as Option A: the project's `pull` is still the gate | batched: projects see releases, not commits |
| Credential | a publish token in the blueprint's CI | a publish token on the owner's machine, or CI triggered by a tag |
| Gate quality | **stronger than A as A stands**: publish can require green CI, while A reads `main` even when CI is red (BUG-031's red-CI-merged-over shape) | the same, if the release job requires green |
| Versioning | mechanical (`0.0.<run>` or `x.y.z-<sha>`), so semver carries no meaning | semver can mean something: a config_version bump is a major |
| Human cost | none | **a step one person must remember.** The old PR rule was exactly a gate on this fan-out, and TASK-019 removed it because it gated the owner against himself. A manual release is that gate by a new name, and TASK-022 is the standing direction against rules that live in memory |

**Assessment:** if B is chosen, publish from CI on a green `main`, or on a tag
CI creates. A manual release step should not be the mechanism.

**Also recorded, because it weakens B's case:** the gate B gets from "publish
only when CI is green" is available to Option A without npm. Point
`blueprint_branch` at a branch (e.g. `released`) that CI fast-forwards to
`main` only on green. It is one config value plus one CI job.

### 11.4 What B costs that A does not

- **Every `npm ci` in every project needs the registry.** That covers a fresh
  clone, a CI run and a new contributor, plus credentials if the registry is
  private. Under A only `drift`/`pull` touch the blueprint, and **CI never
  runs them**.
- **A new credential that can publish.** Whoever holds the publish token can
  ship bash that runs in every project on its next `npx blueprint`. A has the
  equivalent in push access to `main`, which §"Back-propagating" already records
  as not a boundary. B adds a second such credential rather than replacing the
  first.
- **One fact recorded twice during the transition.** Today `.gitattributes`
  `export-ignore` decides what ships, both for bootstrap (`git archive`) and for
  the managed-directory expansion. Under B, `package.json` `files` decides it.
  Both cannot stay authoritative, or they drift (BUG-051/053/061). So B also
  moves bootstrap to `npm pack`, and before Stage B `files` would have to list
  paths: **a third copy of `MANAGED_FILES`.** In practice **B is sequenced after
  TASK-021 Stage B**, when `"files": ["scaffolding/"]` is one line.
- **A decision per project about where the devDependency lives** (§11.5).

### 11.5 storm2flow: where the devDependency lives

storm2flow has three manifests and none at its root.

| Placement | Cost |
|---|---|
| **(i) A new root `package.json` holding only tooling** | A fourth manifest and lockfile at the root of a monorepo that deliberately has none. `npm ci` at the root becomes a setup step every contributor must know, or the wake check cannot run. osv and CI gain a lockfile to scan. It can collide with a later npm-workspaces setup, which also wants to own the root manifest. **Least wrong of the four.** |
| **(ii) One of the existing manifests** (e.g. `backend/`) | `drift` must run from the project root, but the binary is in `backend/node_modules/.bin`, so the command is spelled differently in this one project. The blueprint version is coupled to backend's dependency upgrades (Dependabot PRs, backend `npm ci`). A frontend-only contributor never has the CLI. And ownership is wrong: the sync tool is not backend's. |
| **(iii) `npx -y @struct2flow/blueprint@<ver>` with no install** | No lockfile, so no integrity pin. The version has to be pinned somewhere, which means `.blueprint-source` again: it rebuilds Option A's config with a registry where the remote was. It needs the network on every npx cache miss, and the registry token is still needed if private. |
| **(iv) The managed `tests/package.json`** (already present in lwa and www) | **Circular, rejected.** `pull` overwrites the manifest that pins the version `pull` reads from, so every project's pin *is* the blueprint's pin, and upgrading requires the new version to already be installed. Named because it is the obvious-looking spot. |

lwa and www would use their existing root `package.json`.

### 11.6 Registry: public npm vs GitHub Packages (laid out, not picked)

| | Public npmjs | GitHub Packages |
|---|---|---|
| Content exposure | **Nothing new.** The blueprint repo is already PUBLIC (verified), so the content is already published on GitHub. The tension is that `docs/PUBLISHING.md` §5 lists `CLAUDE.md`, `docs/DoD.md` and `.claude/` among things a public tree should not show, and those are managed files. **That tension exists today under A as well**, so B neither creates nor resolves it | the same content, visible only to the scope's members |
| Install credential | none | a token in every project's `.npmrc` or env, on every developer machine and in every CI, even for installs (GitHub Packages' npm registry requires authentication to install; **re-verify at decision time**) |
| Publish credential | an npm token in the blueprint's CI | `GITHUB_TOKEN` in the blueprint's own CI (no extra secret) |
| Name | the `@struct2flow` scope must be owned on npmjs | tied to the GitHub owner (`@luizstruct2flow/…`) |
| Supply-chain surface | a public registry package with a `bin` | the same, with a smaller audience |

### 11.7 Tests under B

The same R3 sandbox, and no registry is needed in tests.

- The fixture blueprint is `npm pack`ed.
- Projects install the tarball by path (`npm install <tarball>`), and `npm ci`
  honours the lockfile's `file:` entry.
- **"A newer version exists"** is a shimmed `npm view` (`makeShimDir`), and the
  offline case is that shim failing. It must yield "unknown", never "in sync".
- `bootstrap-gate` bootstraps from the tarball.
- **The `.bin` symlink case** (§11.2 #2) runs every subcommand through
  `node_modules/.bin/blueprint`. Its mutant: revert any one lib site to
  unresolved `dirname`.

### 11.8 Side by side

| | **A: git remote** (§1–§10) | **B: npm package** |
|---|---|---|
| Network at wake | yes, a clone of ~2.5 s | yes, if the wake is to answer "am I behind" (`npm view`); no, for "do I match what I installed" |
| Offline wake | 5, "could not reach", or an explicit `BLUEPRINT_ROOT` override | an honest partial answer: matches installed version X, unknown whether newer |
| Cache and integrity | none (a throwaway clone); git object hashes | npm's cache; lockfile `integrity` |
| What pins "the blueprint" | branch tip, recorded as `bootstrap_sha` | installed version, in the lockfile; `bootstrap_sha` removed |
| CLI invocation | project-local `scripts/blueprint`, through a cwd-relative wrapper (§8.1) | `npx blueprint`; the allowlist and CLAUDE.md wake command change; needs `npm ci` first |
| Fresh clone | works once the remote is reachable | nothing works until `npm ci` (A-22's shape) |
| CI impact | none: CI never runs sync | every `npm ci` needs the registry, plus a token if private |
| Release fan-out | on push to `main`; a green-CI branch is available (§11.3) | on publish; CI-driven publish recommended |
| New credentials | none (read access to the remote already exists for a2bp) | a publish token; install tokens everywhere if private |
| "What ships" boundary | unchanged: `.gitattributes` export-ignore | `package.json` `files`; bootstrap moves to `npm pack` |
| `cmd_drift` change size | small: resolver swap, header, one message | larger: lib-root resolution, expansion rewrite, version-vs-latest, `bootstrap_sha` removal |
| Sequencing vs TASK-021 | **before Stage B**, and it unblocks it (§8.2) | **after Stage B** in practice (§11.4); it does not unblock Stage B, the wrapper does |
| storm2flow | pulls the CLI and libs (§7.3) | also needs a manifest decision (§11.5) |
| PR #66 | composes | composes |
| Reversibility | revert two commits; the override is the recovery path | unpublish/deprecate, remove the devDependency from three projects, restore the allowlist and wake command |

### 11.9 Recommendation (the author's; the review decides)

**Do A now. Keep B open as a successor, to be judged after TASK-021 Stage B
lands.**

1. **A is what unblocks Stage B, and B cannot be.** B's clean form
   (`"files": ["scaffolding/"]`) only exists after Stage B. Before it, B
   carries a third copy of the managed-file list.
2. **B does not take the network out of an honest wake.** It moves the call to
   `npm view`. Its real gain is a trustworthy offline answer to the narrower
   question, and that is worth something. It is not the gain the proposal
   leads with.
3. **B's strongest point, publish only when CI is green, is available to A** as
   one config value plus one CI job (§11.3). If the founder wants that gate, it
   can be added to A without adopting a registry.
4. **B puts the blueprint on every project's `npm ci` path, CI included.** A
   keeps it on the sync path only. That is a new failure surface in exchange for
   offline drift.
5. **The cost of being wrong is asymmetric.** If B wins later, most of A
   survives:
   - the harness `BLUEPRINT_ROOT` scrub
   - the override and its recovery property
   - the §9.3 fixture migrations
   - the wrapper retirement
   - F-002-safe failure reporting

   What is thrown away is `_bp_fetch_blueprint` (~40 lines) and its fixture.

**Re-open B when** Stage B has landed, **and** one of these is true:
- offline drift is a stated need that `BLUEPRINT_ROOT` does not meet;
- a derived project is maintained by someone without read access to the
  blueprint remote;
- the blueprint wants semver releases for a reason beyond gating fan-out.

---

## 12. Open questions for the reviewers

1. **A or B** (§11.8, §11.9). The primary question of this review.
2. **No cache in v1** (§1). Is ~1 s per wake the right thing to give up in
   exchange for no staleness, no locking and no persistent state? The
   measurement is from one Linux box. A reviewer on a slower link should
   re-measure §0.3.
3. **A green-CI branch for A** (§11.3). Point `blueprint_branch` at a
   CI-advanced `released` branch now, or leave it on `main`?
4. **The `blueprint_source` nag** (§5). Is one dim line per run until the field
   is removed the right pressure, or should the field refuse (4) after a date?
5. **The wrapper** (§8.1). Should `install-toolchain.sh` own it?
6. **`BP_FETCH_TIMEOUT` default 30 s.** Tight enough for a wake, loose enough
   for a cold SSH handshake on hotel wifi?
7. *If B:* **the registry** (§11.6) **and storm2flow's manifest placement**
   (§11.5) are founder decisions this plan deliberately does not make.
