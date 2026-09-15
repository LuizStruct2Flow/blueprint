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

**TASK-026 (PR #66) is DONE and waiting for acceptance** — all six changes pushed
2026-09-14, PR closed with a comment linking the commits, its branch deleted. The shared
comparison it built is `bp_prospective_pull` / `bp_prospective_for` in
`scripts/blueprint`; TASK-025 swaps only the latter.

**Derived projects and pulling:** struct2flow-www may pull freely; storm2flow file by
file (its `settings.json` is ~5 months old). **linkedin-watcher-agent already pulled,
deliberately** (its TASK#7, file by file, re-applying its own change; it took the
blueprint's `security.yml`). It does not use `agent-exchange` (only a historical doc
mentions it), so losing those permissions cost nothing. Pull only while this checkout
has no unpushed commits (`git log origin/main..main` empty).

**Now: TASK-025 — `drift` and `pull` read the blueprint by its repository
address.** Founder chose **option A, git fetch, now**; the npm package (option B)
is deferred until after Stage B. Plan: `docs/doing/PLAN-TASK-025.md`.
**First review (Alexey, Codex): build A with changes** —
`.scratch/ALEXEY-plan025-review.md`. **Revised by Christian in `b4983f3`** (2026-09-14):
six findings adopted with probes, one rejected with evidence; he also found SIGINT
truncating a mid-write file, which today's `pull` shares. **Re-review (Alexey, 2026-09-14): build with
these changes** → `.scratch/ALEXEY-plan025-rereview.md` — 5 of 7 original findings
resolved, the added write-shield and cache-race designs sound. Both technical changes
are in revision 3 (`90fa82a`: H5 scrubs undeclared `GIT_*`/`AGENT_*` in direct runs;
case #23 runs group INT and group TERM). **The only blocker left is the founder's:**
record T ("matches the newest blueprint") or P ("matches the version last pulled, plus
a newer-exists line") — plan §2.2 lists what changes under P. Build nothing before that.
**Founder decisions recorded 2026-09-14:** **T** — `drift` means "matches the newest
blueprint" (unblocks implementation); adopt the `released` branch — yes; a leftover
`blueprint_source` field — warn on every run (no cut-off date); the toolchain installer
writes the per-machine `blueprint` command — yes. **All four are in plan revision 4
(`6caced7`) and the backlog row (`6f24650`).** Consequences found against the code:
projects read `released` through a NEW optional field `blueprint_release_branch`
(`blueprint_branch` stays `main`, because `a2bp` uses it as every PR's base); the
release job in the shipped `security.yml` names `LuizStruct2Flow/blueprint`; migration
is 9 steps and no project switches before the first green run creates `released`.
Implementation order: (1) reproducer + harness scrubs, (2) drift/pull by address,
(3) `released` job + field + bootstrap, (4) installer writes the command. **Review of the
revision-4 additions (Alexey, 2026-09-14): revise again** →
`.scratch/ALEXEY-plan025-rev4-review.md` — installer ownership is forgeable by a marker
line; migration step 8 deletes the working command before installing; rollback cannot
reach projects already on `released`; the release job's cases never run it. **Revision 5
(`cb18a17`, Philipp) adopts all four**, with measurements in its §R4 table, and found two
more: a SIGINT to the installer alone was absorbed and the command swap went ahead, and
revision 4's release job wrongly failed an old-run rerun (`origin/released` vs
`FETCH_HEAD`). **Re-review of revision 5 (Alexey): build with one change** →
`.scratch/ALEXEY-plan025-rev5-review.md` — all four findings resolved (probes re-run);
the one change: `--replace-blueprint-command` must validate the new command from the
invoking migrated project, not from the installer's own checkout. Folded in as
revision 6 (`12b59b5`: records the invoking directory, adds `--project=<dir>`, #37b keeps
installer checkout and project apart). **The plan is buildable.** **Commits 1–2 landed locally,
not pushed** — `6ed93b1` (reproducer + harness scrubs) and `21e2803` (drift and pull read
the blueprint by its address). **Implementation review (Alexey, 2026-09-14): push after
these fixes** → `.scratch/ALEXEY-025-impl-review.md` — cache, history, `BLUEPRINT_ROOT`,
H5 and BUG-110 PASS; to fix: (S1) the refresh subshell can spawn its fetch after cleanup
looked for it; (S1) the exec-bit `chmod` runs outside the write shield; (S2) the
ignore-before-redirect ordering has no red witness (M23c); (S3) the mutant catalogue names
the wrong cases. **All four fixed locally, reproducer-first** (`83dfcd7`/`6c024f1` the
refresh runs as one process; `3c4fe46`/`4683167` exec bit inside the shield; `b27eadd`
redirect ordering pinned structurally; `b9473ed` catalogue corrected, #24 narrowed).
**Fix confirmation (Alexey, 2026-09-14):** exec-bit, redirect ordering and catalogue
RESOLVED, 126/126 focused tests; **the spawn race is PARTLY** — the behavioural half of #20b
was green before the fix too, so push only after a witness that goes red on the pre-fix
launch, or a proof that the residual is only bash's fork-to-exec window. **Resolved by
`c6d9bd2` (#20c):** a FIFO at the refresh child's `fetch.err` holds it forked-but-not-fetching;
red on the pre-fix launch, green now (sync-by-address 35/35). Residual, documented and
unwitnessed: a TERM in bash's fork-to-handler-reset microseconds can wait out the 30 s
budget. (Alexey's review file was not written; his verdict is `.scratch/alexey-025-fix-last.md`.) **Christian's report of where the plan met the code** (verify in review): four
listed mutants do not redden their case (M1→#1h instead, M22b→#11/#20, **M23c reddens
nothing**, **M24 leaves #24 green**); killing the refresh subshell orphaned the fetch
(fixed with `pkill -P`, #20 now time-bounded); a damaged cache usually self-heals, exit 5
only with a leftover ref (#27a); a2bp-contamination #24 and bootstrap-gate #4/#6 needed
changes. **Live consequence of commit 2:** derived projects run this checkout's CLI
through the wrapper, so their `blueprint drift` now reads GitHub `main`, warns about
`blueprint_source`, and exits 5 offline (`BLUEPRINT_ROOT=<checkout>` is the override).
BUG-116 adopts the handler by replacing its trap with `_bp_terminating_traps _a2bp_cleanup`. **Commit 3 waits only for** linkedin's #67/#69 to be decided (they
touch the same files).
**Open for the founder:** does `drift` mean "matches the latest blueprint" (what
the plan is written for) or "matches the version this project recorded"? Also: adopt a
`released` branch; retire `blueprint_source` by warning or by date; should the
toolchain installer write the per-machine `blueprint` command.
**BUG-116 (parked) waits on this task:** `a2bp` has the same non-stopping trap and
pushes after it — adopt TASK-025's handler, reproducer first.

**Live now, and a reason to push promptly:** unpushed commits in this checkout show
up in every derived project's `drift` as "commits since last sync", so a `pull`
there could record a commit that exists on one machine only. TASK-025 removes this.

**Then: TASK-021 Stage B** — the `scaffolding/` + `forge/` move.

TASK-018 (the TypeScript test migration) is **finished and accepted**. 35 shell
suites were retired; **one survives on purpose**: `tests/ts-bridge/test.sh`, the
last assertion not run through vitest, held pending TASK-023 (founder decision).

**Stage B's preconditions, as of 2026-09-14:**

| | state |
|---|---|
| Stage A (code root / state root split) | landed |
| Stage A′ (compatibility release in the CLI) | landed |
| gate finds its suites after the move (BUG-066) | landed — the **runtime-assertion half is still open** |
| feed does not split in two (BUG-077) | landed |
| linkedin-watcher-agent, struct2flow-www | carry the compatibility release |
| storm2flow | no local CLI — runs `blueprint` from PATH, which is covered |

**One hazard the plan does not contain yet — add it before moving.**
`~/.local/bin/blueprint` is a per-machine wrapper that `exec`s the hard-coded path
`…/blueprint/scripts/blueprint`. Stage B moves that file into `scaffolding/`. The
moment it moves, `blueprint` breaks for **every project on this machine**, and no
commit fixes it because the wrapper is outside git. It must change in the same step
as the move (or learn to look in both places).

**Read `docs/doing/PLAN-TASK-021-RESTRUCTURE.md` against the tree as it is now.**
It predates most of the work above and has been corrected repeatedly — atomicity
twice, the site inventory once, one piece of arithmetic three times. Re-measure its
claims; do not re-read them.

**The one ordering rule that survived every correction:** `scripts/`, `tests/` and
the scaffolding-bound half of `docs/` move in **one commit**, because the hook
derives its code root from where `scripts/lib/pipeline.sh` is and every suite path
hangs off that root.

**After the restructure:** internals component by component (TARGET §3.2) —
`state-dir`, `commit-subject`, `placeholders`, `suites`, `signal-set`, then
`pipeline`, the `blueprint` CLI, `new-project`, and `agent-activity` last.

---

## 3. LIVE HAZARDS

- **CI GREEN AGAIN on `4bbcac7` (run 34904164240, 2026-09-15); BUG-117 is in
  waiting-acceptance.** **Philipp — TASK-028 DONE locally (2026-09-15), 7 commits, unpushed**
  (`554b86a`..`68d212c`): BUG-110 closed by its long-planned preflight (the harness now
  refuses a workspace under a stray marker — loudly; remedy: remove it or point `TMPDIR`
  elsewhere), BUG-111 closed (`run()` waits for the killed group), BUG-119 new (`childRoot`
  type + option spreads), `exactOptionalPropertyTypes` on. **Jesko's review (2026-09-15): push after these fixes** →
  `.scratch/JESKO-task028-review.md` — BUG-110 shell fix, BUG-111, BUG-119 and H5 verified;
  (1) the preflight witness only plants the marker AT `TMPDIR`, so a base-only check passes
  it — Philipp is adding below-`TMPDIR` cases for all three markers; (2) the five suites
  could not run inside his sandbox (its own `/tmp/.git`) — being re-run with `TMPDIR` outside
  `/tmp`.
  **Gap found: no gate stage or CI job runs `tsc`** — row it once Christian's uncommitted
  backlog edit is in. **While a Codex run is live, run suites with
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

- **TASK-023** — `tests/manifest` #9 (the control proving itself independent of
  the toolchain) could not be ported; `tests/ts-bridge/test.sh` is held back until
  this is decided.
- **BUG-034 (S1, parked)** — `blueprint pull` can lose a project's content on
  inverted markers **while printing that it preserved it**.
- **BUG-083** — the gate prints its colour codes as literal text (`[2m`, `[32m`);
  pinned by `pipeline` #9b, which turns red when fixed.
- **BUG-108** — a product defect with a witness and no fix, kept deliberately so a
  port did not silently change behaviour.
