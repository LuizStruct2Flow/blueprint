# PLAN — TASK-018: isolated, deterministic, parallel-safe tests (and the TypeScript/BDD migration)

**Status: DRAFT, in consensus review.** Four independent passes contributed:
Sylvia (Orchestrator, Claude Code), Slava (Architect, Codex), Jesko (QA-2,
Codex), Vitali (QA-1, Claude Code), Philipp (Infrastructure-1, Claude Code).
Per CLAUDE.md §"Major Bug Process", implementation is not authorised until the
founder has both provider views in front of them and agrees.

## 1. The requirement, stated as the founder stated it

> *"I want all tests to be isolated, independent and deterministic, so they can
> be parallelized without side effects."*

and, on the choice of TypeScript + BDD:

> *"is a valid point for me, since I'm skilled in typescript and like bdd"*

Two separate things, and the plan keeps them separate because they have
different justifications and different risks:

- **Isolation / determinism / parallel-safety** is the *requirement*. It is
  language-independent and it is where the value is.
- **TypeScript + BDD** is the *vehicle*, justified by who maintains this repo.
  That is a legitimate and sufficient reason on its own. It does **not** need a
  performance justification, and this plan does not give it one — see §3.

## 2. What this plan will not claim

**TypeScript does not make the gate faster by itself.** Slava and Sylvia agree
independently, and the measurements say so:

| Cost | Source | Does TS remove it? |
|---|---|---|
| `bootstrap-gate` runs a complete second gate | TASK-013 §"The single fact" | No |
| ~104s of orchestration suites paid twice | TASK-013 §"The second gate" | No |
| Settle windows, daemon timing, negative timeout cases | `signal-dispatch:58`, `agent-activity-bound:226`, `wait-mic:94` | No |
| Shell parsing, helper subprocess churn | throughout | Partly — and more than usual on a Rosetta host |

The gate was 357.8s in August (TASK-013) and measured **778.3s** on 2026-09-09.
A plan that implies the rewrite fixes that would be wrong, and would be found
out. What *does* address it is §6.

## 3. What actually buys wall-clock, ranked

Slava's ranking, which Sylvia agrees with:

1. **TASK-013's declared bootstrap profile.** `bootstrap-gate` is structurally
   ~50% of the gate. The nested gate re-proves orchestration suites the outer
   gate has just proved against the same code.
2. **Stop paying orchestration suites twice.** The disciplined form of #1, via a
   declared profile rather than a blunt `export-ignore`.
3. **Isolation-enabled parallelism.** Real, but only reachable after §4. It will
   not collapse a test whose assertion is "nothing happened for N seconds".
4. **The TypeScript migration.** Below the others for speed, above shell for
   maintainability — which is why it is still worth doing.

**#1 and #2 are orthogonal to language and should not wait for the migration.**

## 4. Isolation — the actual work item

### 4.1 What blocks parallelism today (Vitali, QA-1 — full audit)

Full inventory in `.scratch/vitali-isolation-audit.md`. **Four findings were live
correctness holes rather than parallelism hazards, and are rowed as BUG-046
through BUG-049** — they are defects today, on a serial gate, and do not wait
for this task.

| # | Hazard | Evidence | Effect |
|---|---|---|---|
| S1.1 | Bootstrap family writes the LIVE baton via inherited `AGENT_SIGNAL_FILE`/`AGENT_STATE_HOME` | `new-project.sh:253` seeds with no `--file`; `template-source:26`, `bootstrap-contents:38`, `bootstrap-gate:47`, `bootstrap-identity` scrub none of it | **Reproduced.** BUG-046 — supersedes BUG-030's suspect |
| S1.2 | Two suites mutate the real repo through inherited `GIT_DIR` | `commit-subjects` rewrote a victim's config incl. `core.hooksPath`; `bootstrap-identity` left a commit | **Reproduced.** BUG-047 |
| S1.3 | The guard for S1.2 selects its population by grepping **comments** | `git-isolation:118` greps `'git init'`; `commit-subjects:195` is `git -C "$T6" init -q` | BUG-047 |
| S5 | `fail` inside a command substitution — headline assertion cannot fail | `a2bp-contamination:201` | BUG-048 |
| S4 | 133 MB of leaked blueprint archives, measured | `marker-merge:89`; `state-dir` has no trap at all | BUG-049 |
| S2.1 | Real-feed escape canary: **token** check survives anything, **count** check cannot | `pipeline:284-286` vs `pipeline.sh:153` `feed_append "[GATE]"` | Declare serial; keep the token half |
| S2.2 | Global `/tmp` scan, **vacuous on macOS** (`TMPDIR` is `/var/folders/…`) | `pipeline:170-175` | BUG-005 class here, real hazard on CI |
| S2.3 | Global `$TMPDIR` absence + `-newer` | `a2bp-e2e:309` vs `request-file.sh:28` | `a2bp-e2e` ∥ `a2bp-contamination` fails **by construction** |
| S2.4 | Global `tail -n0 -F` count, no ownership filter | `agent-activity-bound:264,491,494` | Blocks |
| S2.5 | Reads **and `rm -f`s** the real watcher lock | `watcher-liveness:282-296` | Deletes a live watcher's lock |
| S2.8 | Asserts a **recycled pid** resolves to empty | `proc-cwd:93-102` | Nondeterministic under pid churn |

**Two corrections to earlier drafts of this section, both from execution:**

- **`no-chain-guard:54` is not a fixed `/tmp` path.** It is a heredoc payload
  string fed to the guard and never executed. `no-chain-guard` is in fact the
  cleanest suite in the repo and is one of the reference implementations.
- **`agent-activity-bound:176` and `subagent-feed:53,132` are correctly
  ownership-filtered** via `bp_proc_cwd` against `$WORK`. Their cost is O(all
  supervisors) `lsof` calls — they *degrade*, they do not block. Only the
  unfiltered `tail` counts block.

**Already parallel-safe — the cheap win (17 suites).** Self-concurrency verified
by execution for `doc-links`, `lifecycle-docs`, `no-chain-guard`, `signal-set`,
`proc-cwd`, `commit-msg-gate`, `pipeline`, `manifest`, `dod-gate`,
`branch-guard`, `template-source`, `pull-behaviour`; plus `watcher-liveness` ∥
`signal-dispatch` green in 39 s.

**Must be declared serial (8):** `pipeline` (intrinsically global — the only one
unfixable in principle), `a2bp-e2e` + `a2bp-contamination` (two halves of one
collision), `bootstrap-gate`, `git-isolation`, `drift-in-blueprint`, `staleness`,
`agent-activity-bound`.

**Almost every suite is also internally serial** — shared temp root, one
`$TMP/out`, one fixture repo, or a case reading what the previous one left. That
matters more than it sounds: it caps parallelism at the suite level until
scenario-level fixtures exist, which is precisely what a typed harness provides.

### 4.2 Language or discipline?

**Isolation is not blocked by shell.** Slava and Jesko agree. TypeScript helps by
making ownership *explicit* — typed `FixtureRepo` / `OwnedProcess` / `TempHome`
handles, automatic `afterEach` teardown, per-worker env — but it will re-encode
`ps | grep`, fixed `/tmp` and inherited `AGENT_SIGNAL_FILE` just as happily if
the discipline is absent.

**And this is the strongest argument for the founder's TypeScript preference,
grounded in the repo's own doctrine.** The three S1 defects (BUG-046, BUG-047)
are each **a one-line omission** — a missing `unset`, a missing `--file`. They
were forgotten in exactly the places a busy author forgets them, and the control
meant to catch them selected its population by grepping comments. A typed
`FixtureRepo` owning its `GIT_DIR`, an `OwnedProcess` reaped in `afterEach`, a
`TempHome` setting `HOME`/`TMPDIR`/`AGENT_*` per worker — **none of these can be
forgotten**, because there is no path to a fixture that does not go through them.

That is precisely the conclusion CLAUDE.md already reached about
`no-chain-guard.sh` and BUG-004: *"a rule that must be remembered at the moment
the author is busy is the wrong shape of fix."* The TypeScript case does not rest
on speed or on taste; it rests on converting four remembered rules into one
structural one.

**What gets WORSE under a naive port:** parallel workers turn today's latent
races live. `staleness` #8 and `pre-push-secrets` #10 pass today largely *because*
the gate is serial, and Node startup adds to every wall-clock budget.

**Critically: the runner gives almost none of this for free.** Vitest's
`pool: 'forks'` and `isolate: true` isolate JavaScript modules and worker
processes. They do **not** sandbox OS files, real git repositories, lock files,
`$HOME`, spawned child processes or ports — which is the entire surface these
suites touch. Anyone assuming "vitest handles isolation" will ship the same
hazards with better syntax.

### 4.3 Isolation must be enforced, not promised

This repo's doctrine is that a control which cannot be checked is not a control
(BUG-005: a suite that silently covers nothing still prints PASSED). So
"the tests are isolated" has to become something the gate *checks*. Both Codex
agents converged on the same primary mechanism independently.

| Mechanism | Catches | Misses |
|---|---|---|
| **Run each suite twice CONCURRENTLY WITH ITSELF** | fixed paths, shared `HOME`/state/lock/remote, global temp scans, process discovery matching siblings, order assumptions | consistent pollution of a shared *external* target by both copies |
| Harness-owned `HOME`, `AGENT_STATE_HOME`, `AGENT_SIGNAL_FILE`, `AGENT_FEED_LOG`, `TMPDIR` + git env scrub, then assert real state canaries byte-unchanged | leaks into the developer's real repo, baton and feed | leaks to unmonitored resources (network, fixed ports, `/tmp` outside the harness root) |
| Hostile-env second pass (inject `GIT_DIR`, baton vars) and require the suite to scrub or override | BUG-014 / BUG-030 classes | — |
| Owned-process registry: track every spawned pid/process group, reap in teardown, fail on survivors | orphaned daemons (observed for real today) | grandchildren, unless process groups are created explicitly |
| Randomised scenario order, seed printed | order coupling | cross-process file leaks |

Precedent already exists in-tree for the canary pattern: `pipeline:278`
(real feed unchanged), `git-isolation:4`, `dod-gate:18`.

**The blind spot in self-concurrency, found by executing it.** Both Codex agents
proposed running a suite twice concurrently with itself as *the* primary check.
Vitali ran it and found the counter-example: **`pipeline` PASSES self-concurrency
while hazard S2.1 remains broken**, because both copies pin `AGENT_FEED_LOG` and
therefore both avoid the shared target. Self-concurrency cannot catch *"concurrent
with a **different** writer of a shared target"* — and every gate stage is such a
writer, via `pipeline.sh:153` `feed_append "[GATE] …"`.

`template-source` makes the same point from the other direction: it passes
self-concurrency **while carrying the S1.1 live-baton hole**.

So self-concurrency is necessary and **not sufficient**. It must be paired with
the real-state canaries, which catch precisely the class it misses. Any plan
that adopts only the first check will believe it has isolation it does not have —
which would be this repo's signature failure committed by the very control
built to prevent it.

**Manifest classification.** `tests/SUITES.md` gains a parallelism class per
suite — `parallel-safe`, `serial-timing`, `serial-global` — with a rationale,
and `tests/manifest` **fails on an unclassified suite**, exactly as it already
does for tier and invocation. A suite that legitimately asserts a global absence
(`pipeline`'s escape canary) is declared serial rather than contorted into
false independence.

## 5. Migration — proving equivalence, not just green

A rewrite is an opportunity to silently drop assertions. These suites are the
repo's most valuable asset: on 2026-09-09 alone they caught **BUG-040** (the DoD
gate matched items with a GNU-only sed BRE, so on macOS it enforced *nothing*
while printing PASSED) and **BUG-044** (the bootstrap's "never assume an
identity" guard used `git var`, which guesses rather than fails — the guard was
assuming an identity). **Both were caught because a suite asserted a
consequence, not an implementation detail.** That property must survive
translation.

**The bar before any shell runner is deleted** (Jesko, adopted):

1. The TS suite is in `tests/SUITES.md`, invoked by the gate and by CI, and
   covered by `tests/manifest`.
2. **Every historical bug the suite guards has a mutation recipe, and the TS
   suite FAILS on it with the expected scenario name.** Tracked as a *mutant
   catalog*, not oral history. A suite that cannot fail on the defect it exists
   for is theatre.
3. Shell and TS run side by side until both pass on current code **and both fail
   the same mutants**. The shell runner is demoted to equivalence-only for one
   review cycle before deletion.
4. Static tripwires: bug IDs, scenario names and case counts are non-decreasing
   unless a deletion is explicitly justified.

Side-by-side alone is insufficient — if both implementations assert only the
happy path, both pass while the regression is gone. Case-count parity alone is
theatre. The mutant catalog is what does the work.

This extends the existing "a suite is three things" rule (BUG-029: files +
`SUITES.md` row + gate invocation) to **four**: files, row, invocation, and a
mutant that proves it still fails closed.

## 6. Sequence

Where Sylvia diverges from Slava, stated openly: Slava recommends building the
isolation contract first *in shell*, treating TS as a second move. That means
touching all 41 suites twice. Since the founder is migrating to TS regardless,
the contract and its enforcement checks are language-independent and should be
**defined** now but **implemented** as each suite migrates — one pass per suite.

**A premise correction that removes most of the phasing.** An earlier draft of
this plan gated the migration on not inflicting Node/TypeScript on derived
projects, on the strength of a hypothetical Python service or static site. The
founder corrected it: **all derived projects are TypeScript projects**, and the
repo says so itself —

- `STACK_DEFAULTS.md:32` *"Language / runtime: Node.js / TypeScript"*, `:39`
  *"Language: TypeScript"*, `:55` *"IaC: AWS CDK (TypeScript)"*
- `CLAUDE.md:434-439` already prescribes `vitest.config.ts`, `tsconfig.json` and
  co-located `src/**/*.test.ts` for every project

So Node and vitest are **already mandatory downstream**. The blueprint is the
outlier: it prescribes vitest to everyone while testing itself in shell. Adopting
a TS harness makes the blueprint consistent with what it already requires, and
the "blast radius" objection was reasoning from an invented premise against the
repo's own declared stack. That is the same class of error this repo keeps
catching, and it is recorded in §10 rather than quietly deleted.

**What this does NOT dissolve** is §7.1. The manifest is blind to `.ts` runners
regardless of who ships them, and that is a property of the control, not of the
export boundary. It remains a hard prerequisite.

1. **Now, independent of language:** TASK-013's declared bootstrap profile,
   asserted by `tests/manifest`. Largest single win, no bearing on TS.
2. **Define the isolation contract** (§4.3): add the parallelism class to
   `tests/SUITES.md` + `tests/manifest` and classify the existing shell suites.
   This makes today's hazards visible before anything is rewritten, and it is
   what the founder's requirement actually asks for.
3. **Prerequisites — three items, none optional, all independent of who ships:**
   1. **`tests/manifest` discovers and anchors on TS runners** (`#1`, `#2b`,
      `#4`, `#5`). Until this lands, every migration is an undetectable coverage
      cut (§7.1). This is the gate on everything below.
   2. **`scripts/lib/pipeline.sh` gains a result-injection API**
      (`pipe_stage_report LABEL MS RC`) fed by a machine-readable vitest
      reporter, so one runner process still renders one line per suite.
      Otherwise `bootstrap-gate #3`'s ≥25-stage non-vacuity guard and the
      slowest-stage SLO both stop meaning anything (§7.3).
   3. **Node expressed as a blocking capability check** in
      `scripts/install-toolchain.sh`, modelled on `have_timeout` /
      `have_gnu_diff` — `node -e` asserting the engine floor, not
      `command -v node`. Plus the local/CI osv severity alignment (§7.4).
4. **Start with the six `blueprint`-tier suites** — `bootstrap-contents`,
   `bootstrap-identity`, `template-source`, `drift-in-blueprint`,
   `pull-exec-bit`, `bootstrap-gate`. **The reason is no longer blast radius**
   (that premise was wrong); it is that they are the git/bootstrap end-to-end
   suites with the worst fixture ergonomics in shell, they are where BDD reads
   best, and the set includes `bootstrap-gate` — the 50.6% stage. They are also
   `export-ignore`d, so a mistake in the first batch cannot reach a derived
   project while the harness conventions are still settling. That is a useful
   property of the starting set, not the argument for it.
5. **Then the rest, in the row's stated order** — static/CLI, then
   git/bootstrap/a2bp, then daemon/timing suites last. `bootstrap-gate` needs
   `npm ci` inside the nested gate before shipped suites become TS; measure that
   cost rather than assume it (§7.3).
6. **Enable parallelism only for suites that pass the self-concurrency check.**

## 7. Toolchain and downstream cost (Philipp, Infrastructure-1)

### 7.1 THE BLOCKER — the migration is invisible to its own control

**`tests/manifest` is anchored on `*.sh` in every assertion**, verified by
reading:

- `#1` discovers suites with `find "$ROOT/tests" -name '*.sh'` (`manifest:78`)
- `#2b` counts runners with `find tests -type f -name '*.sh'` (`:230`)
- `#4` requires `bash +tests/$s/[a-z0-9._-]+\.sh` (`:296`), `#5` likewise for CI (`:319`)

So: **migrate a suite to `.ts`, delete its `.sh`, delete its `SUITES.md` row —
and nothing fails.** No unclassified-suite error, because nothing `*.sh` remains
to discover. No missing-invocation error, because there is no row to check.

That is exactly the BUG-005 defect the manifest exists to prevent, reintroduced
through a door the control cannot see. **This is a prerequisite, not a detail:
until the manifest understands TS runners, any migration of a shipped suite is
an undetectable coverage cut.**

One fail-closed path exists and is fragile: leaving the row at `both` with only
`.ts` runners drives `#2b` to the `withheld` bucket and FAILS (`:246-252`) — but
the obvious "fix" is retiering to `blueprint`, which is a silent cut wearing a
legal tier.

### 7.2 What actually ships

**Read this section with §6's premise correction in hand.** Every derived
project is already a Node/TypeScript project with a `package.json` and a
lockfile (`STACK_DEFAULTS.md:32,39,55`; `CLAUDE.md:434-439`), so "a root
`package.json` reaches every derived project" is not a cost — they have one.
What follows is still worth knowing, because it governs *mechanics* rather than
*permission*.

- **Bootstrap ships the whole archive, not `MANAGED_FILES`** —
  `new-project.sh:159` is `git archive HEAD | tar -x`. A root `package.json`
  therefore reaches **every derived project by default** unless `export-ignore`d.
- **`tests/` sync is additive-only, no delete path** (`scripts/blueprint:77-79`).
  A `.ts` file shipped once is never removed downstream by a later upstream
  deletion.
- `node_modules` can never ship (`.gitignore:2`, pinned by
  `bootstrap-contents:88-91`).

### 7.3 What breaks

- **`bootstrap-gate` breaks twice.** Its fixture is built from tracked content
  only, so a derived project gets `package.json` with no dependencies and any
  vitest stage fails. Fixing that means `npm ci` **inside a blocking pre-push
  gate** — a network dependency in the stage that is already 50.6% of the run.
  And `#3` requires the derived gate to pass **≥25 stages** as an explicit
  non-vacuity guard (`bootstrap-gate:159`); `.githooks/pre-push-project` emits
  **49** `pipe_stage` calls today, and collapsing 37 shipped suites into one
  `vitest run` drops the derived count to ~12. `#3` fails — for the right reason.
- **Per-stage reporting does not survive one-process vitest.**
  `scripts/lib/pipeline.sh` has no result-injection API; timing is measured
  around each invocation (`:184-190`). One `vitest run` = one stage =
  `slowest: vitest 200s`, which fails this plan's own success measure. Keeping
  42 `pipe_stage` calls means 42 node startups and discards the parallelism that
  is the entire point. Resolution: add `pipe_stage_report LABEL MS RC` fed by a
  machine-readable vitest reporter — but note `pipeline.sh` is
  blueprint-managed and ships everywhere, so that is a real-reach change.
- **Node is a BLOCK-class dependency, not a skip-class one.** The gate
  `pipe_skip`s a scanner it cannot find, so a machine without Node would get a
  green gate over 37 fewer suites — the exact TASK-017 defect just closed. Model
  it on `have_timeout` / `have_gnu_diff` as a **capability** check (`node -e`
  asserting the engine floor), not `command -v node`: `have node` is true for a
  v12 that cannot run vitest. Do **not** vendor a Node tarball — the installer
  already declines to vendor `cdk` and `terraform` for the same reason.

### 7.4 The finding nobody else surfaced — osv-scanner goes live

Verified by execution: today `osv-scanner scan --recursive .` returns *"No
package sources found"* in 11 ms, and `.githooks/pre-push:396-399` treats that as
a clean no-op. **Add a lockfile and that branch disappears — in the blueprint and
in every derived project.** And the two gates disagree:

- **Local** (`pre-push:391-410`) blocks on **any** non-zero exit with output —
  no severity filter at all.
- **CI** (`security.yml:110-119`) blocks **MEDIUM+ (CVSS ≥ 4.0)** only.

So a low-severity advisory anywhere in vitest's transitive tree would block
pushes locally in every project while CI stayed green — the first time the local
gate is strictly harsher than CI. Keep harness devDependencies minimal (vitest +
typescript, no plugin zoo) and align the local osv policy with CI's MEDIUM+ in
the same change.

## 8. Success measures

- Gate output still lists every suite and stage — **no silent coverage cut**.
- Every suite carries a parallelism class, and unclassified fails the gate.
- Each `parallel-safe` suite passes when run concurrently with itself.
- Real baton, feed and repo state are byte-unchanged after a full run.
- No fixture-owned process survives a run.
- Each migrated suite fails on its catalogued mutants.
- Slowest-stage reporting stays honest; serial suites are named as serial rather
  than hidden.

## 9. Status

All four passes are in. **The plan is ready for the founder's decision.**

Live defects found while planning, rowed rather than buried in this document:
**BUG-045** (local osv gate harsher than CI — affects every derived project
today), **BUG-046** (bootstrap family writes the live baton; supersedes
BUG-030's suspect), **BUG-047** (two suites mutate the real repo via `GIT_DIR`,
and the guard greps comments), **BUG-048** (`a2bp-contamination`'s headline
assertion cannot fail), **BUG-049** (133 MB of leaked archives).

**None of those five needs TASK-018.** They are defects on today's serial gate
and can be fixed independently, which is the strongest evidence that the
isolation work has value whether or not the TypeScript migration proceeds.

## 10. Disagreements, recorded rather than smoothed over

Consensus is only worth something if the dissent is visible.

- **Slava vs Sylvia on sequencing.** Slava wants the isolation contract built
  first *in shell*, TS second. Sylvia's objection: that touches every suite
  twice when the founder is migrating regardless. Resolved by §6 — the contract
  is *defined* first (step 2) and *implemented* per suite as it migrates.
- **The original row's migration order vs Philipp's.** The row proposes
  static/CLI suites first; §6 supersedes it. Those suites ship, so they are the
  set most exposed to §7.1. Difficulty was the wrong axis; blast radius is the
  right one.
- **Philipp's premise was wrong, and the founder caught it.** Its recommendation
  rested on protecting derived projects that are "a Python service or static
  site" from an inherited Node dependency. No such project exists or is
  permitted: `STACK_DEFAULTS.md` declares Node/TypeScript, and `CLAUDE.md`
  already prescribes `vitest.config.ts` and `*.test.ts` for every project. The
  analysis reasoned carefully from a premise it never checked against the repo's
  own stack document — the same shape as every real error in the TASK-012/014
  sequence, and again caught by the founder rather than by an agent. **The
  findings survive; the recommendation built on top of them did not.** §7.1,
  §7.3 and §7.4 are properties of the controls and hold regardless.
- **Resolved by that correction:** whether `both`-tier suites may become
  TypeScript. They may. The blueprint already requires vitest of every project;
  it is the blueprint itself that is the outlier, and the current split is the
  drift rather than the design.

## 10. Note on a stale number

The row says 41 suites. `tests/manifest` parses **42** rows on this branch —
`proc-cwd` was added on 2026-09-09 (BUG-036). Verified by execution.
