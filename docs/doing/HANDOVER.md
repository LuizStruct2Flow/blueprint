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
   `env -u GIT_EDITOR -u GIT_PAGER -u AGENT_PERSONA tests/node_modules/.bin/vitest run --root "$PWD/tests" <suite>`.
   The harness refuses ambient `GIT_*` / `AGENT_*` variables, and the repo root has
   no vitest config.
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

- **Acceptance.** Everything in `docs/waiting-acceptance/` (TASK-021, TASK-022,
  TASK-050..059, BUG-083, BUG-133, BUG-134) carries what to test.
- **TASK-059 is back for acceptance** after its rejection. Its row quotes the live
  feed lines that show each persona's model.
- **Open questions to the founder:**
  - Should one real Codex dispatch prove a Codex persona's model in the log? It
    costs quota.
  - Should session start restart a feed daemon that runs stale roster code?
  - Should the gate keep osv-scanner's stderr? An exit 127 on CI was transient, but
    the log could not say why.
- **BUG-133's re-open trigger fired** on 2026-09-17: #17 reported a leftover process
  twice on CI. The founder decides whether it stays in acceptance. The row carries the
  diagnosis (a test gap, not the product) and the fix `9a8a6fd`.
- **Dispatching personas (TASK-059):**
  - A Claude persona: `subagent_type: <name-lowercase>` (e.g. `philipp`), with no
    `model` override.
  - A Codex persona: pass the persona as `--holder` so its model resolves.
  - The Orchestrator's `Model` cell is `session-based`.
  - The first real Codex dispatch proves the service accepts `-m` and the effort flag.
- **TASK-049 (backlog):** managed vs project placement for a guard that refuses to
  publish a live handover.

### Nobody's in flight

`docs/doing/` is empty. No agent is running.

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
