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
tests/node_modules/.bin/vitest run --root "$PWD/tests" <suite>
```

`cd tests` does not persist between an agent's Bash calls.

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

**First: TASK-026 — implement PR #66** (the `a2bp` request from struct2flow-www),
all six changes, **in the blueprint** rather than merged as-is (founder decision
2026-09-14, after Jesko's cross-provider review). Being built. The row carries the
specification; two changes differ from what the PR says — the missing managed
scripts hurt *existing* projects that `pull`, not fresh bootstraps, and `drift`'s
managed-region comparison must be ONE helper shared with `pull`'s selection and
preview, refusing inverted markers. Close the PR with a comment linking the commits.
Committed locally, not yet pushed (2026-09-14): BUG-114 (the three managed scripts),
BUG-112 (a marker is a whole line), BUG-034's reproducer. Still to do: BUG-034's fix,
the skip-reason hint, the shared drift/pull region helper, the annotation, the
settings move. Check `git log` before redoing any of it.

**Then: TASK-025 — `drift` and `pull` read the blueprint by its repository
address.** Founder chose **option A, git fetch, now**; the npm package (option B)
is deferred until after Stage B. Plan: `docs/doing/PLAN-TASK-025.md`.
**Reviewed by Alexey (Codex): build A with changes** —
`.scratch/ALEXEY-plan025-review.md`. The plan as written must NOT be implemented
unrevised:
  - its signal trap cleans up but does not STOP a killed run — measured, a TERM
    during `pull`'s write let the script write to the project and exit 0;
  - it dropped the cache the backlog row asked for — reinstate a persistent cache,
    refreshed every run, failing with exit 5 rather than answering from stale data;
  - its `BLUEPRINT_ROOT` scrub fix does not reach the real scrub boundary;
  - its test list misses branch-missing, interrupts at every stage, concurrency
    and cache corruption.
Revise the plan, then build. It also waits for TASK-026's shared comparison.
**Open for the founder:** does `drift` mean "matches the latest blueprint" (what
A assumes) or "matches the version this project pinned" (which would favour the
package option)?

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

- **TASK-023** — `tests/manifest` #9 (the control proving itself independent of
  the toolchain) could not be ported; `tests/ts-bridge/test.sh` is held back until
  this is decided.
- **BUG-034 (S1, parked)** — `blueprint pull` can lose a project's content on
  inverted markers **while printing that it preserved it**.
- **BUG-083** — the gate prints its colour codes as literal text (`[2m`, `[32m`);
  pinned by `pipeline` #9b, which turns red when fixed.
- **BUG-108** — a product defect with a witness and no fix, kept deliberately so a
  port did not silently change behaviour.
