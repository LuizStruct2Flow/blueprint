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

1. **Run vitest with the pinned binary and a scrubbed env**, from anywhere:
   `env -u GIT_ASKPASS -u GIT_EDITOR -u GIT_PAGER -u AGENT_PERSONA tests/node_modules/.bin/vitest run --root "$PWD/tests" <suite>`.
   The harness refuses ambient `GIT_*` / `AGENT_*` variables (a VS Code terminal sets
   `GIT_ASKPASS`), and the repo root has no vitest config.
2. **The gate is fast now** (~30 s): suites run in parallel, five
   `*.release.spec.ts` suites run in CI only, and a push of only `.md` files skips the
   code stages. **CI is the release gate**: `released` moves only on green, and the
   derived projects pull `released`. Always wait for CI after a push.
3. **Check parallel changes on CI-sized hardware.** BUG-133 was green on this
   32-core machine and red on CI's 4 cores. `taskset -c 0-3` reproduces CI's load.
4. **`gh run list --commit` needs the full SHA.** A short one returns nothing and a
   wait loop never ends.
5. **Codex sandboxes cannot write `~/.cache`**: give a Codex reviewer `TMPDIR=/dev/shm`.

---

## 1. OPEN, AND WHOSE CALL IT IS

### The founder's

- **Acceptance: BUG-138, BUG-139 and BUG-140** are in
  [`../waiting-acceptance/BUGS.md`](../waiting-acceptance/BUGS.md) with what to
  test (CI green on `892d4ca`, 2026-09-18). BUG-140's "never runs in CI" half was
  not done; its row asks the founder to accept it as moot or reopen.
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

### The rotation, as of 2026-09-21

**There is no rotation state file yet** (TASK-065 builds it), so it lives here
until there is one. Anyone picking up work reads this and advances it.

| Role | Last completed by | In flight | Next |
|---|---|---|---|
| Infrastructure | Elias (Codex) — TASK-066 | — | Thomas (Kimi) |
| Back-End | Matthias (Claude) — TASK-063 | — | Andreas (Codex) |

BUG-141, 142 and 143 were the first work the rule routed — Elias (Codex), Thomas
(Kimi), Philipp (Claude), one full turn of Infrastructure — each reviewed by
another provider. All three landed together, CI green on `3c4d133`, and wait in
`waiting-acceptance/`. The founder accepted their single-commit form over DoD
§3.1's two-commit reproducer convention at push (2026-09-21); do not read that
as a standing waiver.

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
  exact shape TASK-062 exists to delete. **Four commits UNPUSHED:** `00e0242`,
  `cdfc38b`, `e38a5bd`, `309191e`. They are doc-and-roster only, so the code
  stages skip, but the four-eyes rule still applies and has NOT been run on them.
  **The first real test of the rule is the next code item** — it must go to the
  next provider in that role's rotation, not to whichever agent is convenient.
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
