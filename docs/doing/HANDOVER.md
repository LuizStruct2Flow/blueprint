<!-- session-marker: dfffa1ea -->

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
| host quirks, standing founder decisions | `project_config_overview.md` |

**Anything derivable from a command does not belong here.** The previous version
of this file said "`doing/` holds no rows" while seventeen sat there. That is the
fourth time it has gone stale by restating something `ls` already answers.

---

## 0. MOVING TO evo-x2 — read this before anything else

Written 2026-09-09. The work is moving from `macbook-pro` to **evo-x2** (Linux,
x86_64, 32 cores, node v22.22.1), which is ~3× faster on this repo's test suite
and is where development continues.

**The four things that do not travel.** Same list as any fresh checkout, and
three of them will stop you inside five minutes:

```
cp AGENT_ROSTER.example.md AGENT_ROSTER.md          # gitignored, per-engineer
bash scripts/signal-set.sh --holder <name> --state ACTIVE --task '<what you are doing>'
bash scripts/agent-activity.sh --daemon             # also arms core.hooksPath
npm ci --legacy-peer-deps --include=optional        # the TS harness
```

The baton is untracked per-checkout state (BUG-019) and DoD §7G **fails closed**
without it — your first push dies before it starts. `core.hooksPath` is
repo-LOCAL config, so a clone is ungated until something arms it (BUG-004/A-22).

Then check the toolchain, which now BLOCKS rather than skips:

```
bash scripts/install-toolchain.sh check
```

**What you can stop worrying about on Linux.** Every defect fixed on 2026-09-09
was a BSD-vs-GNU difference, and none of them exists here: `/proc` is present,
`sed` supports `\|` alternation and bare `-i`, `[[:space:]]` does not match
U+00A0, and `git var` refuses to guess an identity. That is also why they
survived for months — **the blueprint was developed on Linux and had never run
on a Mac.** Do not re-derive them; the rows are in `BUGS.md` with mechanisms.

**Do not use `~/dev/struct2flow/blueprint-perf`.** That is a measurement scratch
copy with no remote. Delete it.

---

## 1. START HERE

```bash
bash scripts/session-resume.sh
```

It derives the git state, the four lifecycle folders, the live baton and the
journal since the last marker. **Exit 9** means the report is incomplete and the
warning says which — do not read a short replay as a quiet one.

---

## 2. WHAT IS IN FLIGHT — TASK-018, phase 1

**The rules and the structure are AGREED with the founder.** Do not reopen them;
read `docs/doing/TASK-018-RULES.md` (seven rules, each with its enforcement) and
`docs/doing/PLAN-TASK-018.md`.

Agreed structure, **not yet implemented**:

```
scaffolding/   ships to derived projects
forge/         bootstrap, sync, a2bp, templates — never ships
<root>/        this repo's own docs/, AGENT_ROSTER.md, logs/ — like any project
```

Tests are **co-located** with what they test. `SUITES.md` and most of
`tests/manifest` cease to exist once the migration lands, because vitest
discovers by glob and there is no per-suite wiring to forget.

**Sequencing decided, and it matters:** migrate **component by component**, not
"all tests then all internals". Port a script to TypeScript, write its spec
against the TypeScript, retire the shell script and its shell suite together,
run the mutant once. Porting a test faithfully against a shell script and then
rewriting the script means writing the test twice — and the first version is the
slow spawn-a-subprocess kind. Measured: a faithful port is ~1.7× slower than its
shell original; a test rewritten against logic is ~80× faster.

Order by risk: `state-dir`, `commit-subject`, `placeholders`, `suites`,
`signal-set` first (small, mostly pure). Then `pipeline`. Then the `blueprint`
CLI. Then `new-project`. **`agent-activity` last** — `flock` has no native Node
equivalent and BUG-001 was a fork bomb that ran 2.7 days.

**One thing stays shell permanently:** the pre-push hook's entry point, so a
broken `node_modules` fails loudly instead of not gating at all.

---

## 3. THE ONE THING BLOCKING THE BRANCH

`bootstrap-gate` #6 fails: a bootstrapped project's own `tests/manifest` is out
of step with its gate.

**Diagnosed, not guessed.** The suite DIRECTORIES for `drift-in-blueprint`,
`pull-exec-bit` and `harness` are blueprint-tier and correctly do not ship
(`git archive … | grep -c` → 0), but `tests/SUITES.md` DOES ship (→ 1). So a
derived project receives rows describing suites whose files are not there, and
its manifest enforces invocation for suites it cannot have.

Vitali (QA-1) has it. The proposed fix: a `blueprint`-tier row means "exists only
in a blueprint", so downstream — keyed on **"am I the blueprint"**, never on
"is the directory missing" — those rows are not-applicable rather than unmet.
Keying on absence would let a project silently lose a suite by deleting a
directory, which is the BUG-005 shape.

**Nothing else is blocking.** 44 of 45 stages passed.

---

## 4. LIVE HAZARDS

**No Codex signal watcher is running.** `ps -eo pid,ppid,etime,args | grep
'[s]ignal-watch'` — match on the path, not the count; that grep sees every
project's watcher on the machine. A stale watcher at `ppid 1` double-dispatches
and BUG-022's lock cannot see one started before that fix.

**Codex is installed and authenticated** (`codex-cli 0.153.4`, ChatGPT auth) and
the dispatcher's flags still match. Cross-provider review works — Slava, Jesko
and Andreas all contributed today, and Andreas found a hole in the test harness
that a Claude agent had not.

**Persona labels: put the NAME in the dispatch description** (BUG-052). The feed
resolves the persona from the description text, so `"Vitali isolation audit"`
labels correctly and `"QA-1 isolation audit"` does not. 1510 of 2489 feed lines
in one session read `[general-purpose - Claude Code]` because of this.

**Monitors die with the session.** Feed: `bash scripts/agent-activity.sh
--daemon`. Mic: `sh scripts/wait-mic.sh logs/state/signal.md` as a background
task, **re-armed after every event** — it exits on the first change by design
(FEATURE-005). Do not check a Monitor's liveness with `ps`; it cannot see them
(A-40). Only an event proves one is alive.

---

## 5. OPEN FOR THE FOUNDER

- **`pipeline.sh` → `package.json`.** Founder asked why the gate needs a bespoke
  shell renderer. Answer given: right idiom, wrong substitute — `package.json` is
  a task runner, `pipeline.sh` is a reporter, and most of what it renders is not
  npm. Recommended sequencing it after phase 1 rather than rebuilding the
  reporter while 40 shell suites still depend on it. **Not yet decided.**
- **Whether `both`-tier suites ever become TypeScript.** Phase 1 deliberately
  does not answer it. If the answer is no, the blueprint permanently runs two
  test stacks.
- **`docs/config/findings.md` does not exist** but is referenced by 12 files
  including one that ships, so the lifecycle's "cancel the row, leave a pointer"
  path terminates nowhere.
