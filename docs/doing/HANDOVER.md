<!-- session-marker: 2c7bdd58 -->

# HANDOVER — what a waking agent needs to TAKE OVER

**Founder rule, 2026-08-05:** *"the file should only contain the data needed for
the next agents that will take something over that is open / wip, all other
things should be documented in the tasks/bugs || commits || md files."*

| If you want to know… | Read |
|---|---|
| what is open, and what to test | the four `docs/<state>/` folders |
| what changed and why | `git log` — commit bodies carry the reasoning |
| what a fix taught | the item's own row in `BUGS.md` |
| the rules | `CLAUDE.md`, `docs/DoD.md`, and **`docs/doing/TASK-018-RULES.md`** |
| **the TARGET this is all aimed at** | **`docs/doing/TASK-018-TARGET.md`** — read it BEFORE writing any test |
| host quirks, standing founder decisions | `project_config_overview.md` |

**Anything derivable from a command does not belong here.** The previous version
of this file said "`doing/` holds no rows" while seventeen sat there. That is the
fourth time it has gone stale by restating something `ls` already answers.

---

## 0. THE TWO THINGS THAT WILL COST YOU FIRST

**1. RUN VITEST FROM `tests/`, NEVER FROM THE REPO ROOT.** The harness manifest,
`vitest.config.ts` and `node_modules` moved under `tests/` on 2026-09-10
(TASK-020). From the repo root vitest finds **no config**, so it silently uses a
**5 s** default timeout instead of 300 s — `bootstrap-gate`'s nested-gate case
then dies at 5 s and you will spend a run diagnosing a defect that is not there.
It also picks up `**/*.spec.ts` under **`.scratch/`**, which is exactly where
CLAUDE.md tells you to put scratch files.

```
tests/node_modules/.bin/vitest run --root "$PWD/tests"      # works from anywhere
```

`cd tests` does **not** persist between an agent's Bash calls. Two agents and I
each lost a ~200 s run to this on day one.

**2. `git push` runs the full gate (~390 s) and reveals ONE problem per push.**
A failing stage kills every stage after it (**BUG-057**), so a red push names the
first thing wrong and nothing about the rest. Budget several rounds, or run the
specific suite locally first.

---

## 1. START HERE

```bash
bash scripts/session-resume.sh
```

Derives git state, the four lifecycle folders, the live baton and the journal
since the last marker. **Exit 9** means the report is incomplete and says which
part — do not read a short replay as a quiet one.

---

## 2. WHAT IS IN FLIGHT

**TASK-018 phase 1 is COMPLETE.** Six `blueprint`-tier suites are TypeScript,
their shell runners are deleted, and each carries its mutation recipe in its own
spec docblock. `tests/SUITES.md` no longer exists: the expected suite set is
derived from the filesystem (`tests/*/*.spec.ts`) and tier from `.gitattributes`'
`export-ignore` lines. `TASK-018-RULES.md` and `TASK-018-CONVENTIONS.md` are
**agreed — do not reopen them**, except the correction in §4.

**Phase 2 is now three steps**, not the data-loss-shaped transition it was:

1. delete the four `export-ignore` lines withholding the TS toolchain,
2. teach `bootstrap-gate` to `npm ci` **on the product path**, not just in the
   fixture (measured: 0.84 s warm, 1.6 s cold — the cost objection in
   `PLAN-TASK-018` §7.3 is not real; the risk is offline availability),
3. land **BUG-045**.

No `MANAGED_FILES` change is needed. Under `tests/`, `pull` lists via
`git archive HEAD tests` — the same query bootstrap answers — so ships ⟺ managed
by construction.

**The 36 remaining suites can be ported in parallel.** Each touches its own
`tests/<suite>/` plus one block in `.githooks/pre-push-project`; that hook is the
only real contention. 4–6 agents on disjoint sets is the practical ceiling.

---

## 3. WHAT TO DO NEXT — the restructure, decided 2026-09-10

**Read `docs/doing/TASK-018-TARGET.md` first. It is the agreed target and this
session implemented against it without having been told it.** Four of the seven
rules are not yet true; that is by design, not defect.

**Next: the `scaffolding/` + `forge/` restructure (TARGET §2).**

```
docs/  AGENT_ROSTER.md  logs/     ← this repo's OWN state, like any project
scaffolding/                      ← everything a project RECEIVES
forge/                            ← bootstrap, sync, a2bp, templates. NEVER ships
```

Chosen to come first for the same reason TARGET §3.2 gives about tests: porting
into a tree that is about to move costs the move twice. Every spec, every
`MANAGED_FILES` entry and every path in `a2bp`/`drift`/`pull` is affected.

**The two hazards in it, both named in TARGET §2:**

- **The terminology inverts.** Today `blueprint`-tier means *does not ship*. In
  the target, `scaffolding` ships and `forge` does not. Every comment,
  `.gitattributes` line and bug row uses the old sense, so **the rename must be
  total or it is worse than either**.
- **Bootstrap grows a path-mapping step**, since `scaffolding/scripts/x` must
  land at `scripts/x` downstream. `git archive`, `MANAGED_FILES` and the
  `a2bp`/`drift`/`pull` path handling change **together**. `bootstrap-gate` is
  what proves the strip is correct, which makes it both the riskiest suite and
  the one that will tell you.

**After the restructure: internals component by component** (TARGET §3.2), in
this order — `state-dir`, `commit-subject`, `placeholders`, `suites`,
`signal-set`, then `pipeline`, then the `blueprint` CLI, then `new-project`, and
**`agent-activity` last** (it holds a `flock` with no native Node equivalent, and
BUG-001 was a fork bomb that ran 2.7 days).

Port the script to TypeScript, write its spec against the TypeScript, retire the
shell script and its shell suite **together**. Do NOT port a suite against a
shell script: that writes the test twice, and the first version is the slow kind.
Measured here — `drift-in-blueprint` 0.83 s shell → 1.44 s as a faithful port,
while `proc-cwd`, rewritten against logic, is 0.027 s.

**The six suites migrated on 2026-09-10 are faithful ports.** They are isolated
and their mutants are recorded, but they drive shell scripts and will be
rewritten as those scripts become TypeScript. That is expected, not waste.

**TASK-013 (the declared bootstrap profile) is still real but is NOT next.** 189
of 389 gate seconds are `bootstrap-gate` #2/#3 running a complete second gate.
Worth doing — after the restructure, since the profile would have to be
rewritten for the new paths anyway.

## 4. LIVE HAZARDS

**Two flakes in the one stage that gates every push.** `bootstrap-gate` failed at
51.2 s and passed at 186.8 s on the same commit; `agent-activity-bound` #12
failed once inside the nested gate and was isolated against a clean baseline as
pre-existing. Rowed as **BUG-065**. A retry cleared both — the `--admin` habit
**BUG-033** warns about. If you retry a red gate, say so out loud.

**`fileParallelism: true` is not safe yet**, and one blocker is inside the
harness: the canary compares the live baton **byte-exactly**, so one ordinary mic
flip mid-run would fail *every* concurrent scenario, each reporting "the scenario
mutated real state outside its fixture" — forty innocent specs accused of
something an orchestrator did. Fix that before flipping, not after.

**R3's wording overstates what the harness enforces.** Five rounds of
Claude/Codex review hardened it — symlink containment, process-group retention,
`GIT_CONFIG*` injection denial, default-deny on undeclared `GIT_*`/`AGENT_*`,
`HOME`/`TMPDIR` containment — but a spec *can* still exercise a forbidden
variable deliberately, by design (`git-isolation` needs it). Residuals are
written down in **BUG-060** and **BUG-062** rather than papered over.
**`AGENT_PERSONA` has a known open hole** — an override kills the
`agent-activity.sh` half of leak detection — left open deliberately because
`tests/roster` asserts what a named persona renders as.

**`bootstrap-gate`'s docblock says `serial-timing`. That is wrong** — it asserts
no wall-clock, it is merely slow — and R5 retires the taxonomy anyway. Harmless
today; correct it when you next touch the file.

---

## 5. WORKING WITH THE OTHER AGENTS

**This repo is TRUNK-BASED** (TASK-019, 2026-09-10). Commit and push to `main`.
No branch, no PR, and no guard will stop you. Pull requests exist for EXTERNAL
collaboration — that is what `blueprint a2bp` files.

**Dispatch Codex so it lands in the feed**, or it works invisibly:

```
codex exec --json … 2>>logs/agent-activity.log \
  | tee .scratch/<name>.jsonl \
  | bash scripts/codex-feed-filter.sh >> logs/agent-activity.log
```

`--json` and the filter are both required — raw output is 6000+ lines of file
contents and drowns the feed. The `tee` is required too: the filter clips at 220
characters, so without it a long review is **unrecoverable** and must be re-run.
All three mistakes were made on day one.

**Put the persona NAME in an Agent dispatch description** (BUG-052) — the feed
resolves the label from that text.

---

## 6. OPEN FOR THE FOUNDER

- **BUG-045** — the local osv-scanner gate blocks on ANY advisory while CI blocks
  only MEDIUM+. Now live here: the lockfile exists, so the "no package sources"
  exemption its row relies on is spent.
- **BUG-057** — a failing stage truncates the rest of the gate.
- **The `.scratch/` glob hazard** in §0 is not yet rowed.
- **`a2bp` has been used exactly twice, ever** (both 2026-07-31), and this repo
  structurally cannot run it — no `.blueprint-source`. Six blocking suites, 2605
  lines, 11.3 s per push guard it. The founder decided on 2026-09-10 to KEEP them
  all on the push path and fix their dead assertions instead. Recorded so the
  decision is not silently revisited.
- **`docs/config/findings.md` does not exist** but is referenced by 12 files
  including one that ships, so the lifecycle's "cancel the row, leave a pointer"
  path terminates nowhere.
