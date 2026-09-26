<!-- session-marker: 2c7bdd58 -->

# HANDOVER — what a waking agent needs to TAKE OVER

**Founder rule, 2026-08-05:** *"the file should only contain the data needed for
the next agents that will take something over that is open / wip, all other
things should be documented in the tasks/bugs || commits || md files."*
It is committed with the work that changes the open state (founder, 2026-09-16),
because another machine only sees what is pushed.

| If you want to know… | Read |
|---|---|
| what is open, and what to test | the four `docs/<state>/` folders |
| what changed and why | `git log`: commit bodies carry the reasoning |
| the rules | `CLAUDE.md`, `docs/DoD.md`, `CLAUDE.blueprint.md` (blueprint only) |
| cancelled work and accepted limits | `docs/config/findings.md` |
| host quirks, standing founder decisions | `project_config_overview.md` |

---

## 0. THE THINGS THAT WILL COST YOU FIRST

1. **Run the suites with one command, from anywhere:**
   `npm --prefix tests test` (or `cd tests && npm test`).
   The `test` script scrubs the terminal's `GIT_*` / `AGENT_*` exports through
   `run-ts-suites.sh`'s `ts_scrubbed` itself (BUG-149), so a VS Code terminal's
   `GIT_ASKPASS` no longer matters. To run one suite, append it:
   `npm --prefix tests test -- doc-links`. A bare `vitest run` still fails by
   design — the harness guard (`assertProcessEnvClean`) protects specs that
   spawn directly; only the documented entry point scrubs for you.
2. **The gate is fast now** (~30 s): suites run in parallel, five
   `*.release.spec.ts` suites run in CI only, and a push of only `.md` files skips the
   code stages. **CI is the release gate**: `released` moves only on green, and the
   derived projects pull `released`. Always wait for CI after a push.
3. **Check parallel changes on CI-sized hardware.** BUG-133 was green on this
   32-core machine and red on CI's 4 cores. `taskset -c 0-3` reproduces CI's load.
4. **`gh run list --commit` needs the full SHA.** A short one returns nothing and a
   wait loop never ends.
5. **Codex sandboxes cannot write `~/.cache`**: give a Codex reviewer `TMPDIR=/dev/shm`.
5b. **A `Stop` hook now judges the Orchestrator's own replies (TASK-080).** Every
   `TASK-`/`BUG-`/`FEATURE-`/`SPIKE-NNN` id in a message to the founder must be
   a markdown link to the lifecycle file that HOLDS that row; a stale link to
   the folder a row has left is refused too, naming the retarget. Code fences
   and inline code are exempt — but tool output pasted WITHOUT a fence counts as
   prose and will block the reply, so fence it. A row in two folders at once
   (the reopen transition) accepts a link to either and names both when bare.
6. **One agent per checkout — dispatch with `isolation: "worktree"`.** Three
   agents shared this checkout on 2026-09-22 and their git indexes collided:
   one agent's CSV edit was swept into another's commit by a shared `git add`,
   and two of them cost hand-trimmed patches to separate. A worktree agent
   commits on its own branch; collect it with `git cherry-pick`, or, if it
   stopped before committing, `git -C <worktree> add -A` then
   `git diff --cached --binary` into a patch and `git apply -3` here.
7. **BUG-152: a worktree agent un-arms the gate's own check, every time.**
   Launching a worktree-isolated agent rewrites `core.hooksPath` from
   `.githooks` to an ABSOLUTE path, and `session-start.sh` then reports *"the
   struct2flow pre-push gate is NOT active"*. Reproduced four times on
   2026-09-23. Hooks still fire (the path resolves and the gate ran its stages
   on every push), so it is a false alarm — but re-arm before every push with
   `git config --local core.hooksPath .githooks`, read the wake report, and
   never push past that line. The fix is behind a `scripts/lib/gate.sh` port,
   which is why BUG-152 is filed rather than patched.

---

## 1. OPEN, AND WHOSE CALL IT IS

### The founder's

- **Ten rows wait for acceptance:** TASK-071 to TASK-080 in
  [`../waiting-acceptance/BACKLOG.md`](../waiting-acceptance/BACKLOG.md), all on
  `main` with CI green (`d1917cb` for 071-075, `0271a20` for 076-079, `8c128ac`
  for 080). Each row's "Done when" is what to test;
  `npm --prefix tests test -- <suite>` runs the check behind it, and
  `node scripts/flip-checks.mts` prints TASK-075's three observations directly.
  Everything landed through 2026-09-22 is already accepted and in `../done/`.
- **BUG-146 is open, and its next step is the founder's to start:**
  [`BUGS.md`](BUGS.md). `tests/sync-by-address` #20d hangs about 1 CI run in 10
  and has never reproduced locally (162 clean runs). The proposed next step is
  a harness change that dumps the process tree when a scenario's wait times
  out, so the next CI hang is captured rather than rerun.
- **TASK-062 (backlog) is the live epic:** enforcement in code, not in agent
  context. Its input is the refreshed audit in
  [`../done/TASK-022-anchor-rules/`](../done/TASK-022-anchor-rules/): of 309 rules
  audited twice, 222 have no mechanism and 77 are proven enforced. Do not start a
  slice without the founder picking it.
- **Reopen or new bug:** the same root cause reopens its row. A different cause is
  a new bug that links the old one.
- **Dispatching personas (TASK-059..061, accepted):**
  - A Claude persona: `subagent_type: <name-lowercase>` (e.g. `philipp`), with no
    `model` override.
  - A Codex persona: pass the persona as `--holder` so its model resolves. Start the
    dispatcher first. A `Monitor` that expires kills it.
  - The Orchestrator's `Model` cell is `session-based`.
- **TASK-049 (backlog):** managed vs project placement for a guard that refuses to
  publish a live handover.

### The rotation, as of 2026-09-24

**TASK-065 landed: the rotation is a command, not a table.** Run
`node scripts/rotation.mts coverage` (or `coverage <family>`) for who covers
each role family, their state, and the next pick — `logs/state/rotation.log`
is the per-checkout event log behind it, seeded from this section's last hand
table with `node scripts/rotation.mts assign <persona> --item <ID> --reason
"seeded from HANDOVER 2026-09-22"`. The table that used to live here is gone;
`coverage` is now the one place this is read from, so it cannot drift out of
sync with what actually got dispatched the way a hand-updated table did.

**2026-09-24: both other providers ran out mid-item, and the founder waived
four-eyes for that batch only.** Kimi hit its 5-hour limit at 13:41Z during
BUG-153 (Thomas); Codex hit its usage limit at 13:55Z during Alexey's TASK-065
plan review, resetting at 19:31 local. Per the founder's D1 ruling (reassign,
PLAN-TASK-065 §5), BUG-153, BUG-152 and BUG-150 moved to Claude. Asked whether
to hold pushes until Codex returned or waive the review, the founder chose
**"Waive for this batch"**: a fresh Claude reviewer (Vitali) reviewed the
round-2 fixes instead. It is not a standing waiver, and it covered only that
afternoon's batch.

**State at the 2026-09-26 cut (~21:50Z). PAUSED by the founder for the
night; nothing is running. The mic is with the Orchestrator. Resume TASK-081
slice 3 first.**

**TASK-081 (the `scripts/blueprint` port) — where it stands.** Author:
Matthias (Claude) per slice, a fresh agent each; Codex reviews the whole port
before slice 5 lands (the row requires it, no waiver applies).
- **Worktree:** `.scratch/task081-port`, branch `task081-port` (local only,
  never pushed). `tests/node_modules` is installed there. It was moved from
  `.claude/worktrees/` on 2026-09-26: a workspace belongs in `.scratch/`.
  Its own inner `.scratch/` holds the slice agents' throwaway scripts
  (`blueprint.orig`, `run-*.sh`, probes); none is needed, clean it on resume.
- **Committed on the branch:** `9d672e8` slice 1 (skeleton: dispatch, help,
  files, errexit context, 127/126, lib bridge, signal machinery; 8
  differential rows), `1061dbb` slice 2 (`drift` complete: config, P1 fetch
  with the BUG-120 GO token, history, staleness, managed set, markers, P3
  prospective, P4 settings; 29/29 blueprint-port, full suite 1252 green; P1
  and P3 mutants caught). Slice 2's stated gap: not every drift matrix row has
  a differential row (named in the release spec's doc comment).
- **Slice 3 (`pull`) — UNCOMMITTED in the worktree, `scripts/blueprint.mts`
  only, typechecks clean.** Written: `shieldedWrite` (P2; each step its own
  `sh -c 'trap "" INT TERM; exec "$@"'` child, inside `shield()`), `pullFile`,
  `bpCliLibs` with shim-follow (§7), `bpRetire`, `cmdPull` (selection,
  closure, prompts, bootstrap_sha, retirement, exits 7/4/0), `headLines`,
  test-only `_setBlueprintRootForTests`, dispatch wired. **Not yet done:**
  (1) any test — unit cases for `bpCliLibs` shim-follow (unit ONLY: the shell
  has no `.mts` notion, so a differential row would legitimately disagree),
  `shieldedWrite` happy and failure paths, `headLines`; pull differential rows
  (nothing to pull, full `--yes`, partial named file, non-TTY without --yes →
  7, refused markers → 4, `pull scripts/blueprint` with a shell CLI), reusing
  the release spec's `seedBlueprintRepo`/`seedRegisteredProject`/`dateShimEnv`;
  interactive prompts need `withCttyNoStdin` from `tests/pull-behaviour` on
  BOTH sides; (2) the six suites under a working-tree-only shim
  (`pull-behaviour`, `pull-exec-bit`, `marker-merge`, `sync-by-address`
  #9-#23c, `managed-references`, `suite-sync`) — every suite calls
  `scripts/blueprint` directly, so installing the uncommitted shim is enough;
  restore with `git checkout -- scripts/blueprint` before any commit; (3) P2
  mutants (rename before chmod, no shield, `cp` without `-p`), expected
  catchers `sync-by-address` #23/#23b/#23c.
- **Traps the slice agents found, so nobody re-derives them:** a unit test
  that calls `recordSignal` without `installSignals(handler, stubKill)` first
  kills its own vitest worker; differential children get no `PWD`, so use
  `runOld`/`runNew` (they pass `PWD: cwd`); two fixture dirs never byte-match
  because the report prints the path, so run OLD then NEW on one directory and
  reset between; pin timestamps with a `date` shim; commit new test files
  BEFORE the full suite (`manifest` #2b reads `git archive HEAD`); the
  `sync-by-address` seams match each shielded step's own argv, so do not fold
  the steps into one subshell; `cmd_pull`'s trailing `if`/`if` returns 0 when
  neither fires, so `cmdPull`'s final `return 0` is right.
- **Machine noise:** the founder hears the fans during full-suite runs (~1,250
  tests across 32 cores). Brief every agent to iterate on named suites and run
  the full suite only before its final commit.

- **Waiting for the founder's acceptance:** BUG-154 (released `bfe4984`),
  BUG-151 and TASK-083 (released at `52e8e32`), BUG-156 [SEC] (released
  `686ca6c`), BUG-157, BUG-158, BUG-159 (released `0776f35`). PRs #76 and
  #79-#82 are closed with pointers to the landed commits.
- **Downstream action owed, not done here:** storm2flow, linkedin-watcher-agent
  and lyricscreator each need `blueprint pull`, then ONE full-history
  `gitleaks detect --no-banner --redact`. The gate and CI scan only pushed
  commits, and BUG-156 made every scan vacuous since bootstrap, so nothing
  else will ever look at that history. Rotate anything found before
  investigating. lyricscreator also has an uncommitted `.blueprint-source`
  remote fill-in and empty project config.
- **BUG-146:** the capture that names an orphaned pipe holder is released
  (`6ec8315`, reviewed under the founder's waiver). The founder's call: wait
  for the next #20d hang to name the survivor, then fix what it shows; no
  speculative change. Philipp's frequency finding (suite growth 61 → 73 spec
  files under `fileParallelism` plus the nested `bootstrap-gate` run, not
  TASK-083) is in the row, unproven.
- **Providers:** Codex and Kimi were "unproven" on the morning of 2026-09-26
  (quota likely reset, not yet exercised); Gemini back after 10:12Z. `node
  scripts/rotation.mts coverage` shows the live state.
- **The three watchers run with `nohup`.** Check with
  `pgrep -af scripts/signal-watch.mts` (three lines). One activity-feed
  supervisor runs per project checkout (four), which is expected.
- **Dispatched agents run the suites with a plain `npm --prefix tests test`**
  (TASK-083's `ts_scrubbed` redirect). Known limit: in the Codex sandbox
  `tests/ts-bridge` #5 still fails; judge a Codex run of that suite
  accordingly.

**Next, in order:**
1. **TASK-081 slice 3** — a fresh Matthias, briefed from the section above:
   tests, the six-suite shim run, P2 mutants, commit on `task081-port`.
2. **Slice 4** (`a2bp` + `prs`), then the **Codex review** of the whole
   branch, then **slices 5 and 6** on `main` (plan §8; slice 5b is dropped).
3. **BUG-152** (port `gate.sh`, then its fix), then **BUG-155** (port
   `contamination.sh`, then its fix).
4. **BUG-146** on the next #20d hang.

**The pre-push gate does not run the contamination push scan; only CI does.**
It turned `main` red twice today (`4a2b7e2`, `5966207`), both times on BUG-155's
misread of `${VAR:-$HOME/.codex}`. Until BUG-155 is fixed, run
`node scripts/contamination-push-scan.mts --before origin/main --after HEAD`
before pushing a change that names a home dotdir. Whether the gate should
run it is a question for the founder, not yet asked.

**Housekeeping, not urgent:** 32 agent worktrees under `.claude/worktrees/`.
Their work mostly landed by cherry-pick (new SHAs), so git cannot say which are
safe to delete; two are locked and two hold named branches (`bug147-proof`,
`bug153-port`). Vitest's glob also picks up their stale spec copies when run
from the repo root. Check each before removing.
**Pass `watch-ci.sh` the SHA from `git rev-parse HEAD`**, never a typed one:
a guessed SHA watches nothing.

**The watchers and the feed do not survive a reboot.** The founder plans one to
clear `/tmp`. Afterwards the next Claude session's start hook restarts the feed,
but the watchers must be restarted by hand, one per provider:
`nohup scripts/start-codex-signal-watch.sh >> logs/start-codex-signal-watch.sh.log 2>&1 &`,
and the same for `kimi` and `gemini`. Check with
`pgrep -af scripts/signal-watch.mts`. A watcher left running from before a code
change runs the old code: restart it after pulling watcher changes (that is why
the mic stranded until the restart at 2026-09-24 19:12Z). It bit again on
2026-09-25: a Codex review ran under a watcher started before TASK-083's
launcher port, saw `TMPDIR` unset, and reported a release blocker that the
new launcher does not have. The watchers were restarted at ~10:05Z.

**Another session writes to this checkout.** On 2026-09-22 storm2flow's
Orchestrator (Sylvia, session `storm2flow-a0`) sent an agent to commit BUG-147
straight into this repo, on top of unpushed Orchestrator work. It stopped when
asked, and its two commits are kept on local branch `storm2flow/bug147`. Before
committing here, check `git log origin/main..HEAD` for commits you did not make.
A derived project reaches the blueprint through `blueprint a2bp`, not by
committing into this checkout.

**BUG-150 is open, and it is the common path:** the stranded-mic recovery
matches on Holder AND Task, but an agent rewrites the Task when it claims
ACTIVE, so recovery never fires for the failure it was built for. Until it is
fixed, after every watcher dispatch read the run log for `FAILED` yourself — a
stranded `State=ACTIVE` is not recovered.
**TASK-062 (the enforcement epic) has landed and waits for acceptance**, with
its plan at
[`../waiting-acceptance/PLAN-TASK-062.md`](../waiting-acceptance/PLAN-TASK-062.md).
Every scheduled slice is on `main`; TASK-062-08 was relabelled judgement by the
founder, and -10/-11 stay parked on their stated re-open triggers.

**Two skips, both with reasons, both the rules working:**
- **TASK-067 skipped Thomas (Kimi):** the provider was out of its 5-hour quota
  at 13:05Z on 2026-09-21.
- **BUG-144 skipped Elias (Codex) after his attempt:** the item's proof is the
  fixture-git suites, which the Codex sandbox cannot run (AGENTS.md §"Who does
  the work", founder 2026-09-21). His blind attempt was never pushed, and its
  local branch was deleted when BUG-144 was accepted.

**Kimi hit its 5-hour quota mid-item on 2026-09-23** (`provider.auth_error:
403`), cutting Jonathan off in the middle of TASK-077's design with nothing
committed. His partial work was preserved, then dropped once Matthias landed the
item with a better implementation — but the idea Jonathan had reached, that a
docs-only commit is row work and not a fix a reproducer must precede, was TESTED
against real history and adopted. **A provider at zero quota leaves the rotation
until it returns**, and the item goes to a provider that can VERIFY it: Codex
could take neither open item here, because its sandbox cannot build the fixture
git repos both suites need.

**Gemini is now on the roster as QA-4 Gemma (2026-09-22), and two facts about
it cost a review:**
- **The Gemini CLI cannot read gitignored files, so it cannot see `.scratch/`.**
  A brief there is invisible to it: put a Gemini brief inline in the Task
  field, or in a tracked file.
- **Its free tier allows 20 requests a day** (`gemini-3.5-flash`), which is not
  enough for a real review. Gemma's first review ran out, and her hand-back
  said `ACCEPT-READY` with nothing behind it. **Never relay a verdict without
  reading the run log that produced it.**

**A failed dispatch now hands the mic back (BUG-144).** The watchers run
`scripts/signal-watch.mts`, restarted onto it on 2026-09-22. A watcher started
before that runs the old shell poller and does not recover the mic, so restart
any you find with `pgrep -af '[s]ignal-watch.sh'`.

**Shell to TypeScript is now a rule (TASK-067, `CLAUDE.md`).** Before editing any
shell file, check `scripts/shell-inventory.json`. A legacy file is migrated
whole to `.mts` behind the two-line shim first, and the gate refuses anything
else. **Follow the port method** in
[`../done/PLAN-TASK-067-shell-to-typescript.md`](../done/PLAN-TASK-067-shell-to-typescript.md)
§"The port method": a test-preparation commit first, then the port proven three
ways.

The founder accepted BUG-141 to 143's single-commit form over DoD §3.1's
two-commit reproducer convention (2026-09-21). Do not read that as a standing
waiver.

**Codex can commit.** TASK-066 keeps `--sandbox workspace-write` and adds only
Git's common directory with `--add-dir`, so a linked worktree grants its actual
objects and refs rather than its `.git` pointer file. `git push` remains
Claude-only by protocol. **A dispatched agent still must scrub `AGENT_*` before
running the suite:** the harness rejects those exported variables correctly.

**The mic is one at a time, so watcher-backed providers run in sequence.** Codex
and Kimi cannot both hold it, which bounds how much of an item can be
parallelised across providers. Claude subagents are not on the baton and do run
in parallel.

### In flight

- **TASK-065 — provider load balancing** ([`BACKLOG.md`](BACKLOG.md)). The RULE
  is written (`AGENTS.md` §"Who does the work") and the roster now backs it:
  every delivery role carries one persona per provider. **The MECHANISM is not
  built**, so routing is still an agent remembering a section — which is the
  exact shape TASK-062 exists to delete. Its quota-detection input now exists:
  BUG-144 hands a failed dispatch's mic back, and the provider's refusal is in
  its run log.
- **TASK-063 (Kimi) and TASK-064 (scratch) are ACCEPTED** (founder, 2026-09-20)
  and live in [`../done/BACKLOG.md`](../done/BACKLOG.md). Kept here only for what
  they cost, because every item below was a plausible wrong answer that
  shipped-looking evidence would have hidden.
  **Four things, each of which looked right and was not:**
  Kimi has no `medium` effort (only `low`/`high`/`max`), so a cell naming one is
  refused rather than substituted — that is why the Kimi rows read `high`.
  `kimi -m k3` is rejected outright and `-m kimi-code/k3` works, so the roster's
  ranking line carries provider-qualified aliases. `KIMI_HOME` is not a variable
  Kimi has — the CLI reads `KIMI_CODE_HOME`. And `kimi -p` REFUSES `--auto` and
  `--yolo`, so never "harden" the dispatcher by adding one.
  **Effort is logged, never applied:** kimi 2.0.2 has no per-invocation effort
  flag, so a persona's model is per-dispatch while its effort is global to the
  machine. Do not fake it.
  **A long-lived feed daemon runs the code it started with.** Both Kimi feed
  symptoms the founder reported were one stale daemon from before the change.
  After touching `agent-activity.sh` or `roster.sh`, restart the feed
  (`--stop` then `--daemon`) or you are reading yesterday's binary.
- **TASK-064 — agent scratch workspaces belong in `.scratch/`, not `/tmp`**
  ([`BACKLOG.md`](BACKLOG.md), 2026-09-20). `CLAUDE.md` used to send "a tooling
  workspace that a tool will walk" outside the git tree; it is now `.scratch/`
  for everything, `mktemp -d -p .scratch`. The reason is a permission
  asymmetry worth remembering: `rm -rf .scratch/*` is allowed and
  `rm -rf /tmp/...` is not, so the old rule produced workspaces no agent could
  clean up. Scoped to what an agent creates — the suites' fixture roots are
  TASK-018's isolation contract and must not be migrated on this rule's
  strength.
- **Three gate rules tightened today, and two of them bit** (BUG-139, BUG-140):
  `baton-durability`, `wait-mic` and `commit-subjects` all broke on the first push
  and were fixed without loosening the rules. If a suite of yours starts failing on
  a Holder name or a bug number, that is why: a fixture Holder must be on a roster
  (or `Nobody`, or point `AGENT_ROSTER_FILE` at a path with no roster), and a bug
  number must sit in an `it()`/`describe()` TITLE, or its row must carry
  `**No regression test:** <reason>`.

### Derived projects

storm2flow (session `storm2flow-3b`) was told about the TASK-021 and TASK-022
releases. Its pull still stops on its own `CLAUDE.md` markers and on permission rules
that belong in `.claude/settings.project.json`. That migration is its own work.
linkedin-watcher-agent and struct2flow-www have no reachable session. The first
pull with an old CLI prints one error after "Pulled N file(s)", and a second run is
clean.

---

## 2. HOW THE ORCHESTRATOR WORKS NOW (decisions of 2026-09-16/17)

- **Judge review findings; don't relay them.** Only real and practical findings
  become work (DoD §1b rule 4). Cross-provider review is for major bugs, core-path
  changes and new features.
- **Replan stale plans before implementing them.** TASK-021 and TASK-022 both were,
  then got one Codex alignment review, then went to the founder for decisions.
- **Spawn fresh agents with narrow briefs**, and cap their reports.
- **Every item named to the founder carries a link and a plain line** (AGENTS.md).
  The founder enforces this.
- **Be critical of the founder and of yourself.** Do not open with agreement.
- **A subagent's report is a claim until you check it** (2026-09-17, four times in
  one session): a "verified live" line was a hook replayed by hand, a "safe" fix
  guessed at a file by timestamp when an id was available, a helper reported files
  as unexplained that its own parent had written, and a suite handed over without a
  typecheck failed the gate. Read the diff, and prefer evidence the product itself
  produced — the feed, the run log, the provider's own session file.
- **Prove a feed or dispatcher change with a real dispatch**, not only a suite. The
  founder rejected TASK-059 twice on exactly that: the tests passed against fixtures
  that no longer matched what Claude Code writes.
