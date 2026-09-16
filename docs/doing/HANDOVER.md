<!-- session-marker: 2c7bdd58 -->

# HANDOVER — what a waking agent needs to TAKE OVER

**Founder rule, 2026-08-05:** *"the file should only contain the data needed for
the next agents that will take something over that is open / wip, all other
things should be documented in the tasks/bugs || commits || md files."*

**Founder rule, 2026-09-14:** this file is updated **continuously**, as work
lands — never offered as an option, never asked permission for. It had described
TASK-018 as half-done for four days after it was finished and accepted.

| If you want to know… | Read |
|---|---|
| what is open, and what to test | the four `docs/<state>/` folders |
| what changed and why | `git log` — commit bodies carry the reasoning |
| what a fix taught | the item's own row in `BUGS.md` |
| the rules | `CLAUDE.md`, `docs/DoD.md`, `docs/requirements/TASK-018-RULES.md` |
| the target design | `docs/requirements/TASK-018-TARGET.md` |
| the recurring defect shape | `docs/config/findings.md` F-002 |
| host quirks, standing founder decisions | `project_config_overview.md` |

**Anything derivable from a command does not belong here.**

---

## 0. THE THINGS THAT WILL COST YOU FIRST

**1. Run vitest from `tests/`, never from the repo root.** From the root there is
no config, so the timeout silently drops to 5 s, and `npx` fetches an **unpinned**
vitest (5.x) instead of the lockfile's 4.1.11 — a green result from the wrong
runner. Works from anywhere:

```
env -u GIT_EDITOR -u GIT_PAGER -u AGENT_PERSONA tests/node_modules/.bin/vitest run --root "$PWD/tests" <suite>
```

`cd tests` does not persist between an agent's Bash calls. **The `env -u …` is required
since TASK-025 commit 1:** the harness refuses to run when the test process carries an
undeclared `GIT_*` variable or a scrubbed `AGENT_*` one. A Claude Code shell exports
`GIT_EDITOR`, a Codex shell also `GIT_PAGER`, and a dispatched persona `AGENT_PERSONA`.
This is deliberate (Alexey's review: those variables change what git launches). The gate's
runner already unsets them; a direct run without them is refused with the variable named.

**2. `git push` runs the full gate — ~440 s — and a failing stage stops the
rest (BUG-057).** One push reveals one problem. Run the specific suite first.

**3. A mutation harness built with `git init` + `git add -A` is blind to 16 files**
(BUG-096). This repo *tracks* files that `.gitignore` also names, and a fresh repo
applies `.gitignore` in full — so a mutation to `CLAUDE.md`, `docs/DoD.md`,
`AGENTS.md`, `scripts/new-project.sh` or `project_config_*.md` reads as "changed
nothing". Use `git add -A -f`, and compare bytes.

**4. Numbers are allocated by reading "the highest in use", which races.** Two
agents have collided on BUG numbers and on TASK-023. `tests/bug-numbers` catches
duplicate **BUG** rows; nothing yet catches duplicate TASK rows.

---

## 1. START HERE

```bash
bash scripts/session-resume.sh
```

**Exit 9** means the report is incomplete and says which part.

---

## 2. IN FLIGHT, IN ORDER

**State at handover, 2026-09-16 evening.**

**Landed and CI-green:** `1248230..c3e2044`. `released` is at `c3e2044` (run 35131958151).
Nineteen rows are in `docs/waiting-acceptance/` — TASK-039..048, BUG-122, 124, 125, 126,
127, 129, 130, 131 and **BUG-132** (CI's suites job never had gitleaks, so every a2bp
scenario was red on `71388b9`; the job now runs `install-toolchain.sh`). Read a row rather
than this file.

**Not yet pushed:** the BUG-132 row move and this handover update. They ride the next push.

**storm2flow was told** (session `storm2flow-3b`) that TASK-039/040/042/043 are on
`released`, including TASK-042's `settings.json` pull refusal.

**Nothing else is in flight.** No agent is running.

### What is open, and whose call it is

- **`doing/BUGS.md` holds 46 rows, BUG-036..BUG-109** — see §5. This is an `lcm` pass and
  the founder triggers it.
- **TASK-049 and BUG-128 are parked** in `docs/backlog/` with their re-open triggers.

### Token discipline — founder's instruction, 2026-09-16

Resuming an agent **re-sends its entire transcript**, which is what took the long-lived
agents to 580k–700k cumulative tokens each, ~2.7M in total. So: **spawn fresh agents with
narrow briefs**, resume only a young one to avoid a file collision, cap agent reports at
200 words, and batch handover updates per milestone rather than per event. The same rule
applies to this file — it is read by every waking session, so it carries what is open, not
what happened.

**The trail is in git, not here.** `git log 1248230..71388b9` carries the reasoning in the
commit bodies; each item's row carries what its fix taught. Nine hundred lines of narrative
were removed from this section on 2026-09-16 for exactly that reason.

---

## 3. LIVE HAZARDS

- **BUG-121 PUSHED 2026-09-15 (`dbed972`, gate green WITHOUT the TMPDIR workaround).** Scenario
  workspaces default to `${XDG_CACHE_HOME:-$HOME/.cache}/bp-harness-tmp`, resolved once at
  load and kept 0700. It is refused if it is a symlink, not a directory, or not yours. An
  explicit non-empty `TMPDIR` still wins, and the BUG-110 preflight is kept. **Plain
  `git push` is enough again.**
  - Jesko (Codex) reviewed the first fix and asked for the 0700 tightening
    (`.scratch/JESKO-bug121-review.md`). Philipp added it in `18ed663`/`dbed972`.
  - **Jesko's re-check ran (2026-09-16): push as is** → `.scratch/JESKO-bug121-recheck2.md`.
    Nothing to do; the reviewed commits were already on `main` and `released`.
  - Codex sandboxes cannot write `~/.cache` (EROFS), so a Codex reviewer running the harness
    needs `TMPDIR=/dev/shm`.
  - History (resolved):
- **ANY Codex run on this machine can turn the push gate red (BUG-121, fix next).** Scenario
  workspaces default to `/tmp`, and since TASK-028 the harness refuses every scenario while an
  empty `/tmp/.git` exists. Codex sandboxes create that folder for a few minutes, including
  runs from OTHER projects (storm2flow's `codex-signal-watch.sh`, VS Code Codex sessions). On
  2026-09-15 a docs-only push went 52/55 red with nobody running Codex here. **Until BUG-121
  lands, push with `TMPDIR=/home/luiz/.cache/bp-harness-tmp git push origin main`**, which is
  the remedy the refusal message names. A red gate whose failures all say "Project marker
  above every scenario workspace" is this, not your change.

- **Derived projects migrated to address-based sync (founder, 2026-09-15).** All three have
  `blueprint_remote` and no `blueprint_source`. linkedin-watcher-agent and struct2flow-www
  are at `bootstrap_sha 7d64687` with `blueprint_release_branch = released`. **storm2flow has
  no `blueprint_release_branch` line**, so its drift and pull read `main`, including commits
  CI has not yet passed; its own `.blueprint-source` records the pull as partial.
  struct2flow-www carries a large uncommitted Astro upgrade that is its own work, not the
  pull. **Per-machine command (plan §7.2 step 8):** on this Linux machine
  `~/.local/bin/blueprint` is already the installer-written
  `struct2flow-blueprint-command v1`, which runs the current project's own CLI, so the
  TASK-021 Stage B wrapper hazard is closed here. **The Mac is verified too** (founder,
  2026-09-15: its `~/.local/bin/blueprint` carries the same
  `struct2flow-blueprint-command v1` header), so the wrapper hazard is closed on both
  machines.

- **TASK-033 PUSHED 2026-09-15 as `a0ee5a6`; row in waiting-acceptance.** The ShellCheck
  stage ran in the real gate (4.4 s) after the founder installed ShellCheck here. **Nothing
  is in flight.** The rest of this entry is its history. Every machine that pushes now needs
  ShellCheck: `bash scripts/install-toolchain.sh` (brew on the Mac). Earlier state: built
  locally, unpushed — `168904b`,
  `7b8dd4b`, `8cf2a86`, `3377983`, `0a8a944`, `f8ef884` (Philipp, 2026-09-15). The 25 existing
  warnings are cleared (17 fixed, 8 disabled inline with a reason); the full suite is 837/837
  with ShellCheck on PATH. **Jesko's review (2026-09-15): push after one fix** →
  `.scratch/JESKO-task033-review.md` — installer, `sh_lint`, stage/CI parity, mutants, the 25
  fixes and docs all pass (install-toolchain 31/31, every TASK-033 case green). The fix: the
  Linux download helper comment in `scripts/install-toolchain.sh` falsely says downloads are
  checksummed; **fixed in `3020ae8`** (the wrong wording dated from `fe08cb5`, TASK-018; installer 31/31,
  ShellCheck clean). **TASK-033 is review-complete; the only blocker is the install below.**
  **Before it is pushed, ShellCheck
  must be installed on the pushing machine**: the stage blocks without it, and ts-bridge
  #6b/#6c/#7 run the real linter. On this machine `bash scripts/install-toolchain.sh check`
  reports ShellCheck as the only missing tool; the installer puts the pinned release into
  `~/.local/bin` without sudo on Linux, and uses brew on the Mac.
- **The activity feed can stop without leaving a trace.** On 2026-09-15 `--status` reported
  "not running" around 11:37; the last line had been written at 10:35 and nothing in `logs/`
  said why. Restarting it (`bash scripts/agent-activity.sh --daemon`) recreates
  `logs/agent-activity.log`, so an open `tail -f` keeps following the deleted file and shows
  nothing. **Watch with `tail -F`**, which reopens by name, and check `--status` whenever the
  feed goes quiet while agents are working. Cause not yet determined.

- **RESOLVED 2026-09-15 — pushed as `903117f`:** BUG-118 (the founder moved
  `put-approval-result` to `ask`), BUG-120 (the #20c race fix passed the loaded gate) and
  TASK-031 (the typecheck stage). All three rows are in waiting-acceptance. PR #64 is closed
  with a comment, and its branch is deleted on the remote and locally. CI on `903117f`: check
  `gh run list` before the next push. Still open, not blocking: a row for PR #64's BUG-095
  test commit, which was never carried over; ShellCheck is not installed. History of the
  block:
- **Pushes were blocked: `sync-by-address` #20c was red on 2 of 2 gate runs (BUG-120).** On
  2026-09-15 two consecutive docs-only pushes (08:00, 08:21) failed it — "a fetch started
  AFTER the run was signalled" — with the code byte-identical to `d984a45`, which had passed
  its own gate, CI and 816/816. A real race in TASK-025's signal handling that the gate's
  load now exposes reliably. GitHub `main` (`d984a45`) is CI-green; the unpushed local
  commits are lifecycle docs. **Fixed locally 2026-09-15** — `c48855a`
  promotion, `fcc5844` reproducer, `7981fcc` fix. Cause measured: CPU contention, not stage
  order — pinned to one CPU #20c failed 40/40 on the old code; a TERM arriving together with
  the child's release was recorded and then discarded by the exec. Fix: the launch writes a
  token, a `sh -c` gate after the child's first exec runs the fetch only while it is
  non-empty, and cleanup revokes it with the non-forking builtin `: >` before sending TERM.
  After the fix, pinned and unpinned stress runs are 150/150 green; the old CLI fails 10/10.
  Full suite 824/828: the 4 red are BUG-118's reproducer and bootstrap-gate carrying it.
  **Alexey's review (2026-09-15): push as is** →
  `.scratch/ALEXEY-bug120-review.md` — the mechanism is proven, #20d is red on the parent
  (3021 ms against a 2000 ms ceiling), the focused suites pass 72/72, and #20c passes 20/20
  idle and 20/20 under eight CPU burners. No fetch can start once cleanup begins; a fetch
  released in the instant between signal delivery and the handler starting is killed at
  once, and the docs say exactly that. **The push is still blocked by BUG-118**: the
  bootstrapped project's gate runs its failing reproducer until the founder edits
  `.claude/settings.json`. Do not retry the push before both are done; if you ever
  retry a red push on #20c, cite BUG-120. **In parallel:** Philipp's TASK-031 (typecheck
  stage) is **done locally** — `897ab2a`/`beff7de`/`a6a6bb4`: one `ts_typecheck` in
  `scripts/run-ts-suites.sh` through `ts_scrubbed`, a managed gate stage and a CI step; a
  planted type error fails both; ts-bridge 14/14; full suite 822/826, where the 4 red are
  BUG-118's reproducer and bootstrap-gate carrying it; the stage ran green (1.3 s) inside a
  bootstrapped project. **Jesko's review (2026-09-15): push after these fixes** →
  `.scratch/JESKO-task031-review.md`. His S1 (ts-bridge #5 red, empty compiler output) is
  **environmental**: the orchestrator re-ran ts-bridge outside the sandbox at 14/14 with both
  `TMPDIR=/home/luiz/.cache/bp-harness-tmp` and `TMPDIR=/dev/shm` — the Codex sandbox stops
  the compiler from starting. **All three answered, 2026-09-15:** `835fb3f` (#4b/#5 fail with exit
  code, signal, streams and commands; #5 states what it needs from its environment; mutants
  re-run from a 14/14 baseline, logs in `.scratch/philipp-task031-mutants/`, sets unchanged)
  and `f8f4102` (the managed typecheck stage and its order in CLAUDE.md §Before Every Push,
  DoD §4 and the deck). ts-bridge + manifest 41/41. **TASK-031 is ready to push; no second
  review** — the S1 finding was the sandbox, and S2/S3 now have logs and docs anyone can
  check. Vitali on BUG-118 (PR #64 rebuild) — **reproducer committed as `6adfb8a`,
  3/3 red; waiting on the founder's edit to `.claude/settings.json`**: move
  `"Bash(aws codepipeline put-approval-result *)"` from `permissions.allow` to
  `permissions.ask`. Then commit that file as `BUG#118:`, and after the push close PR #64 and
  delete `bug/110-approval-result-ask` on the remote (`gh api`) and locally — the local
  delete rewrites `.git/config`, so never while a gate runs. Note: the new
  `tests/permission-policy` spec ships to derived projects, so a project that pulls `tests/`
  without `.claude/settings.json` goes red until it takes both. PR #64's BUG-095 test commit
  was not folded in and still needs its own item.

- **CI GREEN AGAIN on `4bbcac7` (run 34904164240, 2026-09-15); BUG-117 is in
  waiting-acceptance.** **Philipp — TASK-028 DONE locally (2026-09-15), 7 commits, unpushed**
  (`554b86a`..`68d212c`): BUG-110 closed by its long-planned preflight (the harness now
  refuses a workspace under a stray marker — loudly; remedy: remove it or point `TMPDIR`
  elsewhere), BUG-111 closed (`run()` waits for the killed group), BUG-119 new (`childRoot`
  type + option spreads), `exactOptionalPropertyTypes` on. **Jesko's review (2026-09-15): push after these fixes** →
  `.scratch/JESKO-task028-review.md` — BUG-110 shell fix, BUG-111, BUG-119 and H5 verified;
  (1) the preflight witness only plants the marker AT `TMPDIR`, so a base-only check passes
  it — **resolved by `74db453`**: three below-`TMPDIR` cases, one per marker; the base-only
  mutant reddens all three, each missing-marker mutant reddens exactly its own case; (2) the five suites
  could not run inside his sandbox (its own `/tmp/.git`) — **resolved: re-run by the
  orchestrator with `TMPDIR=/home/luiz/.cache/bp-harness-tmp`, harness + state-root +
  state-dir + code-root + ts-bridge 96/96 green** (2026-09-15, on a tree that also held
  Christian's uncommitted TASK-025 edits). **TASK-025 commits 3–4 are committed locally**: `51654e8` (`released` branch)
  and `e24d801` (the installer writes `~/.local/bin/blueprint`; shared
  `scripts/lib/signals.sh`; install-toolchain 11/11, 19 mutants each red on its case).
  **TASK-027 (#67) is done**: `97b466c` reproducer, `4545048` fix. **TASK-029 (#69) is done**:
  `c07e53d` (U7a), `9051918`/`332c417` (U7b reproducer + drift refuses to report when it
  cannot arm the gate). Two regressions in commits 3–4 found by the full suite and fixed:
  `91f5b14` (`PROJECT_DIR` → `BP_PROJECT_DIR`, env-namespace) and `1cc78cf` (bootstrap-gate
  fixture lacked a `released` branch). **Full TypeScript suite 799/799.** Close comments
  ready: `.scratch/pr67-close-comment.md`, `.scratch/pr68-close-comment.md`,
  `.scratch/pr69-close-comment.md`. **Alexey's review (2026-09-15): push after these fixes** →
  `.scratch/ALEXEY-025-c34-review.md`. PASS: release job, BUG-117 parity, rollback ordering,
  ownership, caller validation, signals, TASK-029. To fix (Christian, now): (1) S2
  `pull scripts/blueprint` alone strands a project without `signals.sh` / the new
  `request-config.sh`, and the recovery message says to do exactly that; (2) S2 replacement
  into a symlink-to-directory writes into the referent and reports success; (3) S2 a Node
  range starting with `*` bypasses the rest (`* >=99.0.0` accepts 24.1.0); (4) S3 #37b's
  sub-runs lack independent red witnesses; (5) S3 no case for a missing
  `blueprint_release_branch`. **All five fixed locally (2026-09-15), `0f488c6`..`c93bdb3`:**
  wildcard is one comparator (`0f488c6`/`16ccc29`, `34bf260`); pulling `scripts/blueprint`
  brings the libs it sources first (`bdd9177`/`02b9c1d`); #37b split into independent cases
  (`0d3f3f5`, `c93bdb3`); replacement refuses a directory destination
  (`3155921`/`8082719`); a missing release branch exits 5, no fallback to main (`86af5c7`).
  **Alexey confirmed (2026-09-15): push as is** → `.scratch/ALEXEY-025-c34-fix-review.md` —
  findings 1–5 RESOLVED, 7–9 still PASS; he ran install-toolchain + sync-by-address +
  managed-references 73/73 with `TMPDIR=/dev/shm` (writable, outside `/tmp` and any git
  tree — use it when a sandbox's own temp is read-only). **Push once Christian's full-suite
  run reports**; the push gate itself is the full-suite run outside any sandbox. Check
  `ls -ld /tmp/.git` first: the harness now refuses to run under it.
  **PUSHED 2026-09-15 as `d984a45`** (45 commits: all of TASK-025, TASK-027, TASK-028,
  TASK-029, BUG-110, BUG-111, BUG-119, the TASK-031 row). **Rows moved to waiting-acceptance:
  TASK-025, TASK-027, TASK-028, TASK-029, BUG-110, BUG-111, BUG-119. PRs #67, #68, #69 closed
  with comments linking the commits; their branches deleted.** Next, in order: (1) CI green on
  `d984a45` — **confirmed** (run 34934182706); (2) push these lifecycle commits; (3) only then dispatch Vitali on
  BUG-118 (brief `.scratch/brief-vitali-pr64-rebuild.md`) — its reproducer fails until the
  founder edits `.claude/settings.json`, and a failing test on HEAD blocks every push;
  (4) TASK-031 (typecheck stage) is re-openable now that commit 4 is on main.
  **Not done by TASK-025 and founder-led:** migrating linkedin-watcher-agent, storm2flow and
  struct2flow-www to the address-based sync (plan §7.2, nine steps). ShellCheck is not
  installed; the changed shell scripts are unlinted. ShellCheck is not installed, so
  the changed scripts are unlinted.
  A refused deletion of an agent's own scratch copy is not a stop condition: leave it and
  report it. **TASK-028 is review-complete and ready to push,
  but cannot go alone:** its commits interleave with TASK-025 commit 3 (`51654e8`, not yet
  reviewed) — push everything together after Alexey reviews commits 3–4.
  **Gap found: no gate stage or CI job runs `tsc`** — rowed as **TASK-031** in
  `backlog/`, re-opened after TASK-025 commit 4 lands (same workflow and hook files). **While a Codex run is live, run suites with
  `TMPDIR=/home/luiz/.cache/bp-harness-tmp`.** Still in flight:
  **Christian — TASK-025 commits 3–4 with TASK-027 (#67) and TASK-029 (#69) inside commit 4**
  (owns `security.yml`, `scripts/blueprint`, `new-project.sh`, `install-toolchain.sh`).
  **Vitali — BUG-118 (#64) waits until both land**: its reproducer fails until the founder's
  settings edit and would block every push. History of the red:
- **Main was red in CI from `8ee949f` to `4bbcac7` (2026-09-15) — BUG-117.** GitHub-hosted runners export
  `AGENT_TOOLSDIRECTORY`; TASK-025's H5 makes the harness refuse any undeclared ambient
  `AGENT_*`/`GIT_*`, and the workflow runs vitest directly instead of through
  `scripts/run-ts-suites.sh`'s scrub — 697/770 refused in 11 s. The local gate is green and
  cannot see it. Christian fixes it reproducer-first (brief
  `.scratch/brief-christian-bug117-ci-env.md`): CI must run through the same scrub as the
  gate, not name one runner variable. **Fixed locally 2026-09-15** — `2ce1f39` reproducer
  (ts-bridge #3 executes every vitest step of `security.yml` with decoy `AGENT_`/`GIT_`/`BP_`
  names), `3036646` fix (one `ts_scrubbed` function in `scripts/run-ts-suites.sh`, called by
  the gate and sourced by the CI step). **Push, then confirm the CI run is green before
  anything else lands.**

- **Mutation runs rewrite the LIVE `scripts/blueprint`, and every project on this machine
  executes that file.** `~/.local/bin/blueprint` execs this checkout's CLI, so while a
  mutant is applied, `blueprint drift` / `pull` / `a2bp` in linkedin-watcher-agent,
  storm2flow or struct2flow-www run a deliberately broken sync tool. Observed 2026-09-14
  (TASK-025 commit 2's mutant sets). Until TASK-025 commit 4 replaces the wrapper: run
  mutants against a copy (a worktree outside any git tree), or tell the founder not to
  sync other projects while they run.

- **Do not change this checkout's git config while a push gate runs.** The harness
  canary snapshots the real `.git/config` (plus the baton, its journal and the feed) and
  fails any scenario that sees it change. `git branch -D` on a branch with an upstream
  deletes its `[branch]` section, so it rewrites the file: on 2026-09-14 that turned
  `bootstrap-gate` #2/#3 red mid-push with nothing wrong in the change. Same for
  `git config`, `git remote`, `git branch --set-upstream-to`. Commits and `gh api` calls
  are safe; do branch clean-ups between pushes.


- **Do not push while a Codex review is running (BUG-110).** An empty
  `/tmp/.git` appeared during one and vanished again on its own. While it exists,
  every test workspace under `/tmp` resolves its project root to `/tmp`, and
  `state-root` #A6 turns the gate red on a change that did nothing wrong.
  Attribution to the Codex sandbox is likely, not proven. If a push goes red on
  #A6, check `ls -ld /tmp/.git` before debugging anything else.
- **The harness can report a process it killed itself (BUG-111, parked).** On
  timeout it SIGKILLs the group without waiting for it to be gone, and teardown
  counts the not-yet-reaped process as a leftover. Under gate load that turns
  `harness` › *reaps a background process the scenario forgot* red with nothing
  wrong in the change. If you retry a red push on that case, **cite BUG-111** —
  a quietly retried red is how merging over red starts.
- **`fileParallelism` is still `false`** in `tests/vitest.config.ts`: two suites
  pass partly *because* the run is serial. Measure before flipping.
- **Flakes in the nested gate (BUG-065, parked).** If you retry a red gate, say
  so out loud — a quietly retried red is how merging over red starts.
- **`bootstrap-gate` is half the gate** (~215 s of ~440 s). That is TASK-013,
  parked until after the restructure.

---

## 4. WORKING WITH THE OTHER AGENTS

**Trunk-based.** Commit and push to `main`.

**Load split, founder direction 2026-09-11: roughly 75% Claude / 25% Codex.**
Cross-provider **reviews** go to Codex; implementation stays Claude. The
Codex-backed personas are **Alexis, Alexey, Alex, Andreas, Jesko, Elias** — never
give those names to a Claude subagent.

**Dispatch Codex so it lands in the feed**, or its work is invisible:

```
codex exec --json --cd "$PWD" --sandbox workspace-write --skip-git-repo-check \
  --output-last-message .scratch/<name>-last.md "<prompt>" 2>>logs/agent-activity.log \
  | tee .scratch/<name>.jsonl \
  | bash scripts/codex-feed-filter.sh >> logs/agent-activity.log
```

**Put the persona name in an Agent dispatch `description`** — the feed resolves
the label from that text, not from the prompt.

**Relayed numbers are not facts.** Seven figures from agent reports failed
independent checking in one session. Re-measure a number before repeating it.

---

## 5. OPEN FOR THE FOUNDER

### Live, as of 2026-09-16 — these three need you

- **`doing/BUGS.md` holds 46 bug rows, BUG-036..BUG-109.** They predate the September 16
  landing and none was touched by it. Some are genuinely open; at least one is finished
  work that never moved. **This is an `lcm` pass and you trigger it** — an agent moving
  another agent's rows on its own judgement is the thing the lifecycle exists to prevent.
  - **BUG-109 is the worked example, and it vindicates the discipline.** It predicted six
    controls would go red "the moment the TASK-018 shell runners retire". Christian fixed
    all six on 2026-09-11 **without performing the retirement**, green on that day's tree
    and on a rebuilt end-state copy (84/84 both sides). The retirement happened on
    2026-09-16 under TASK-047, and `vitest run manifest git-isolation live-state-canary`
    is 53/53. The cost was paid months before the benefit, and nothing would have noticed
    if it had not been.

- **TASK-049 (parked, `docs/backlog/`) needs a placement ruling.** `docs/PUBLISHING.md`
  §3b now redacts the live handover before a public push, but prose is not enforcement. A
  guard that refuses to publish a live handover has to live either in the managed set
  (every project inherits it, nobody can opt out) or in the project's own
  `.githooks/pre-push-project` (each project decides, and most will never add it).
  **Which?**

- **BUG-128 (parked, `docs/backlog/`) is a known hole in the SAST gate.** Semgrep's
  `paths.skipped` is classified nowhere, so a file semgrep never opened — too large,
  binary, timed out, filtered — produces no error entry and the run still reads clean.
  This repo cannot currently exhibit the dangerous reasons; closing it means changing the
  scan invocation, not tightening a filter. **Cheap first step when it is picked up:**
  check whether dropping `--quiet` alone surfaces `paths.skipped` without `--verbose`.

### Older, still unanswered

- **Founder decisions 2026-09-15 on #71–#74 (from struct2flow-www and storm2flow):**
  - **#71:** "an agent may not delegate acceptance to another agent without consulting me. I'm
    responsible for the acceptance or its delegation." This is TASK-034.
  - **#72:** a2bp should carry files the blueprint does not ship, because the owner reviews and
    can reject contamination. This is TASK-037.
  - **#73:** "I want it." This is TASK-035.
  - **#74:** "seems ok." This is TASK-036.
  - **How to name items to the founder:** re-ask an open question in full, with a link and a
    plain line per item. Never point back at "your answer about X".

- **Repository settings (founder, 2026-09-14): squash-merge only, and a branch is deleted
  when its PR merges.** A closed-unmerged PR's branch is NOT auto-deleted — delete it by
  hand (`gh api -X DELETE repos/LuizStruct2Flow/blueprint/git/refs/heads/<branch>`, which
  triggers no pre-push hook). Leftover merged branches were removed the same day.
- **Founder decisions 2026-09-14:** close #65 (done, superseded by BUG-115); send #67–#70
  to Jesko (Codex) for a recommendation each → `.scratch/JESKO-pr67-70-review.md`; rebuild
  #64 on main (brief `.scratch/brief-vitali-pr64-rebuild.md`) — **started only after the
  TASK-025 push**, because its failing reproducer on HEAD would turn every push red until
  the founder makes the settings edit.
- **PR #64 (open since 2026-09-12) — a live security gap.** `.claude/settings.json` still
  auto-allows `aws codepipeline put-approval-result`, so an agent can approve a production
  deployment unprompted; the PR moves it to `ask`. Its `BUG#110` collides with the
  `/tmp/.git` BUG-110 — re-implement on main under a new number, reproducer first; the
  settings edit itself must be the founder's (agents are refused). Then close #64 and
  delete `bug/110-approval-result-ask` (remote and local).
- **Jesko's recommendations on #67–#70 (Codex, 2026-09-14)** →
  `.scratch/JESKO-pr67-70-review.md` — **awaiting the founder's decision**; none blocks
  TASK-025 commit 3. **Tracked as backlog rows TASK-027 (#67), TASK-028 (#68), TASK-029
  (#69), TASK-030 (#70).** **Founder ACCEPTED all four recommendations, 2026-09-15.** Order:
  BUG-117 first (main red); then TASK-030 applied as-is (**done 2026-09-15: `b87491a` on main,
  row in waiting-acceptance, PR #70 closed with a comment, branch deleted**); TASK-028 ported after BUG-117 (same
  harness area); TASK-027 and TASK-029 built inside TASK-025 commit 4; each PR closed with a
  comment linking its commits, branch deleted by hand. PR #64 → BUG-118 after CI is green:
  - **#67** accept with changes, folded into TASK-025 commit 4 (reproduced: `install-toolchain
    check` accepts Node 20.0 against `^20.19.0 || >=22.12.0`; fix the custom semver's `^0.x`
    and record observed mutant red sets).
  - **#68** accept with changes: port onto the current H5 harness, reproducer-first for the
    marker-above-workspace inversion, the timeout returning before its group is gone, and
    the option-loss/`childRoot` type mismatch; the workspace preflight makes the harness
    refuse to run while `/tmp/.git` exists — document that.
  - **#69** implement differently: U1 already done by TASK-026; carry U7's two behavioural
    assertions into TASK-025 commit 4 instead of porting the symlink rewrite.
  - **#70** accept as-is (applies cleanly; test-only).
- **Five a2bp requests from linkedin-watcher-agent, filed 2026-09-14.** **#65
  (`security.yml`) is superseded:** after linkedin's TASK#7 pull its workflow is
  byte-identical to the blueprint's, which fixed the same parse defect as BUG-115 —
  close it with that note and delete its branch (founder's call). **#67 (toolchain
  installer), #68 (harness and state-dir, 10 files), #69 (`scripts/blueprint` +
  suite-sync), #70 (codex signal watcher) still differ** from `origin/main` and are
  untriaged. Treat like #66: cross-provider review first, then a founder decision. #67
  and #69 touch files TASK-025 is changing — decide them before commit 3.

- **TASK-023 is CLOSED** (founder, 2026-09-16) as an accepted loss, and
  `tests/ts-bridge/test.sh` is retired with it. `F-003` in `docs/config/findings.md` is
  the cancellation pointer and says plainly that what replaces it is weaker: a silently
  dead vitest bridge now produces no red case. **Cancelling an item correctly is what
  broke the closing push** — see BUG-130 in `waiting-acceptance/`.
- **BUG-034 (S1, parked)** — `blueprint pull` can lose a project's content on
  inverted markers **while printing that it preserved it**.
- **BUG-083** — the gate prints its colour codes as literal text (`[2m`, `[32m`);
  pinned by `pipeline` #9b, which turns red when fixed.
- **BUG-108** — a product defect with a witness and no fix, kept deliberately so a
  port did not silently change behaviour.
- **BUG-129 (S2) reworked after Codex's final review, and the lesson generalises.**
  The first fix removed the supervisor's startup wipe and then ASSERTED that startup
  was the feed's only non-append behaviour. It was not: `scripts/lib/feed.sh` had
  rotated at 4,000 lines all along, in place, deleting the history it trimmed and
  losing any append that raced the rewrite. **A claim about "the only writer" is worth
  checking against every writer, including the one in the file you are editing.**
  Rotation is now a RENAME to `<feed>.1` (no lock: `flock` is absent on macOS and a
  rename needs no coordination), and `tests/harness/canary.ts` reads the archive, so a
  rotation is a NOTE while lost history still fails. Followers need `tail -F`, not
  `tail -f` — every doc was updated with the change.
- **TASK-047 — `tests/dod-gate` #17 was a REMOVAL guard wearing an equality claim.**
  Its extraction regexes recognised only `.spec.ts`/`.spec.tsx`, so widening any of the
  three sides was invisible to it: Codex added `*.test.ts` to each in turn and it stayed
  green all three times. It now reads each side's COMPLETE pattern list with comments
  stripped, and #17b witnesses discovery behaviourally. **A guard whose reader only
  knows the values it expects can only catch their removal.** #18 gained the paired
  positives and the symlink witness it never had — it was all negatives, so it could not
  tell "the filter works" from "the filter matches nothing".
