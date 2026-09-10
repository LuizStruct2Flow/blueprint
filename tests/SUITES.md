# Suite manifest — every regression suite, its tier, and why

**This file is enforced.** `tests/manifest/test.sh` fails the push if a suite
exists but is not listed here, if a listed suite does not exist, if a suite
declared `pre-push` is not actually invoked by the gate, if a suite declares no
**parallelism class**, or if a rationale is empty or **argues from the clock**.

**A suite is discovered by its runner, and a runner is a `*.sh` OR a
`*.spec.ts`.** Both halves matter. TASK-018 migrates these suites to TypeScript,
and until the manifest understood `.spec.ts` the migration was invisible to its
own control: move a suite to TS, delete its `.sh`, delete its row here, and
*nothing failed* — no unclassified-suite error, because no shell file remained
to discover; no missing-invocation error, because no row remained to check. That
is BUG-005 exactly, re-entering through a door the control could not see
(PLAN-TASK-018 §7.1).

*Enforced* is meant literally, and it took two rounds to become true. Codex found
the first version proved only that **strings existed**: membership was an
unanchored `grep`, so commenting out an invocation kept the control green while
the suite stopped running; and discovery recognised only `tests/*/test.sh`, so
renaming a runner made a suite invisible. Neither bypass required lying in this
file — ordinary refactoring was enough. Now comments are stripped and an
anchored `bash tests/<suite>/<file>.sh` command is required (or, for a TS suite,
a proven-covering `vitest` stage), and **every** shell file *and every spec file*
under `tests/` must belong to a declared suite.

## Why it exists (BUG-005, Codex F1)

The pre-push gate used to have a 30 s ceiling. It was removed because it had
stopped being a performance budget and had become a coverage policy: when a
suite outgrew the budget the cheapest response was to demote it to CI-only, and
the gate carried on printing "all checks passed" over a smaller set.

I replaced the ceiling with a rule — *coverage is decided on risk, never on the
clock* — and claimed it was enforced because `pipe_skip` requires a reason.
**That claim was false, and Codex caught it:** a suite simply *omitted* from
`.githooks/pre-push-project` never reaches `pipe_skip` at all. Deleting a
`pipe_stage` block is the silent skip, it takes one line, and the pipeline still
renders PASSED. `signal-dispatch` was the live proof — the gate could not report
an exclusion it did not know about.

A rule that only a careful reviewer can check is not a control. This manifest is
the control: **membership is asserted against the filesystem**, so an omission
fails a test instead of passing unnoticed.

## Rules

- **Tier** is `pre-push`, `CI`, `both`, or `blueprint`.
  - `pre-push` — the gate blocks the push on it. Also runs in CI as a backstop.
  - `CI` — runs after the push. **Reporting, not blocking.**
  - `both` — in the gate, and additionally run in CI under different conditions
    (e.g. a slower clock, or extra cases).
  - `blueprint` — `both`, **plus: does not ship to derived projects.** Reserved
    for suites that drive blueprint-ONLY machinery — `new-project.sh`,
    `templates/`, `.blueprint-root` — which no derived project has, because
    bootstrapping is the one thing a derived project never does (CLAUDE.md
    §"blueprint-only machinery"). This tier exists because BUG-028: five such
    suites shipped anyway, `.githooks/pre-push-project` wired them into every
    derived project's gate, and they failed on day one on machinery that could
    not have been there. The claim is enforced — `tests/manifest` #2b asserts
    the `.gitattributes` export boundary in BOTH directions, so a
    `blueprint`-tier suite that ships fails the push, and so does a shipping
    suite that has been export-ignore'd behind everyone's back. It asserts
    **runner by runner, against HEAD**: a directory is not a suite — one that
    arrives without its runners is skipped in silence by the derived gate's own
    `if [ -f … ]` guard — and HEAD is the tree actually being pushed, so a
    boundary that exists only in the author's working tree cannot turn it green.
- **Risk** — what breaks if this suite is absent and the thing it guards
  regresses. One line. This is the field that decides the tier.
- **Rationale** — why that tier. A CI-only rationale must argue from *risk*
  (what it guards is not on the push path, and a regression cannot reach a
  commit). **It may not argue from cost.** "Too slow", "does not fit", "seconds",
  "budget", "ceiling" are rejected by the test, by design — a slow suite that
  matters is a suite to make faster, as `signal-dispatch` demonstrated by going
  from 125.4 s to 75.0 s with every assertion intact.
- **Parallelism** is `parallel-safe`, `serial-timing`, or `serial-global`, and
  it is **declared, never inferred**. An unclassified suite fails the push the
  same way an untiered one does.
  - `parallel-safe` — it may run beside other suites. Earned by the
    self-concurrency check, not assumed. **Self-concurrency is necessary and not
    sufficient:** two copies of a suite that both avoid the same shared target
    pass it while the hazard survives, which is exactly how `pipeline` and
    `template-source` passed while carrying one each.
  - `serial-timing` — it asserts something about elapsed wall-clock. A loaded
    host moves the measurement, so the suite is measuring the machine as much as
    the fixture.
  - `serial-global` — it legitimately observes or mutates a global: the real
    feed, the real baton, `${TMPDIR}`, the process table, the pid space, a lock
    outside its fixture, or another suite. Not automatically a defect —
    `pipeline`'s escape canary exists *to* watch the whole machine — but it is a
    declaration the scheduler has to honour.
  - **The class carries its own rationale, in the last column, and that
    rationale may not argue from the clock either.** Name the shared thing the
    suite observes, or the measurement that load would move. "It is slow" is not
    a parallelism class, for the same reason it was never a tier.
  - **When in doubt, `serial-global` with an explicit
    `unclassified-pending-verification` rationale.** Defaulting to serial costs
    wall-clock; defaulting to parallel costs a flake nobody can reproduce, which
    is how a suite gets deleted. Seven suites currently sit there and say so.

## The suites

This file travels with the suites: `tests/` is a blueprint-managed **directory**
(BUG-029), so `blueprint pull` replaces everything between the markers below
with the blueprint's rows — the same suites it just delivered. **Your own
suites go in the second table, below the managed region**, where the pull leaves
them alone. `tests/manifest` parses both tables identically, so a project row is
enforced exactly as hard as a blueprint one.

**Every table here is delimited, and a row outside a delimited region belongs to
nothing.** The parse lives in `scripts/lib/suites.sh` — one definition, sourced
by `tests/manifest` and by the vitest bridge, because two parsers of one table
drift and this file has already watched that happen. It used to decide what a
row was by counting fields, which meant a table with the wrong number of columns
silently became a table of suites; now each table is bounded by its own comment
markers and nothing else is read.

Two consequences worth knowing before you edit this file:

- **Prose must never contain a marker token.** `blueprint pull` counts those
  strings to decide whether it can merge, and an unbalanced count makes it
  replace the whole file — including everything of yours below. Write "the
  managed region" in a sentence and keep the literal token for markers.
  `tests/manifest` #7b fails the push if the counts stop balancing.
- **Upgrading an existing project:** if your suite rows stop being recognised
  after a pull, your own tables need the markers the blueprint's now have. Wrap
  each with its `BEGIN`/`END` comment pair, copying the shape below. The failure
  is loud — every suite directory of yours is reported unclassified — and this
  is the whole fix.

<!-- BLUEPRINT:BEGIN — blueprint-managed rows. Yours go in the table after the managed region. -->

<!-- SUITES:BEGIN — blueprint-managed. -->

| Suite | Tier | Risk if absent | Rationale for the tier | Parallelism | Why that class |
|---|---|---|---|---|---|
| `pipeline` | both | The gate renderer could pass a failing stage, silently opening every gate in the repo | Guards fail-closed on the push path | serial-global | Its escape canary reads the REAL feed and counts `[GATE]` lines around its own window, and every gate stage appends there. A legitimate global oracle: the unique-token half survives concurrency, the count half cannot |
| `marker-merge` | both | A pull clobbers project-owned content outside the markers | Data loss in a command run on every wake | serial-global | unclassified-pending-verification. It also allocates a clone root outside its own trap (BUG-049, 133 MB measured) and is re-executed inside `git-isolation`, so two copies run per gate |
| `agent-activity-bound` | both | The feed fork-bomb returns (BUG-001 pegged ~24 of 32 threads for 2.7 days) | Host-level damage, caused by code every wake runs; the race and fault-injection cases guard the same mechanism and belong with it | serial-global | Asserts the count of `tail -n0 -F` processes is 0 across the WHOLE process table with no ownership filter — a claim about the host rather than about its fixture — on top of a wide wall-clock surface |
| `pre-push-scanners` | both | A broken scanner reads as a clean scan, so security gates fail open | Directly guards whether the gate itself is honest | serial-global | unclassified-pending-verification. Its `run_hook` does not redirect stdin while the copied hook drains stdin to EOF, so its behaviour depends on what the parent process left on fd 0 |
| `gate-arming` | both | A clone pushes ungated (BUG-004) | Guards whether any gate runs at all | serial-timing | Asserts `--daemon`/`--stop` complete inside a fixed 5 s internal poll. It measures ~0.6 s idle on macOS, so a loaded host reaches the bound and the red test names the wrong defect |
| `state-dir` | both | Cross-project log contamination returns (A-09) | Cheap, and guards a mechanism every project shares | serial-global | unclassified-pending-verification. The suite has no `trap` at all and leaves a `mktemp` root behind on every run, so repeated concurrent runs accumulate state nothing owns |
| `proc-cwd` | both | A test helper resolves a process's cwd through Linux-only procfs, so every "is this MY process" count silently returns 0 on macOS and the suites that gate the push fail closed (BUG-036) | Guards a mechanism every project's feed and dispatcher suites depend on. It must block, because the failure mode is not a red test on the affected host but an UNRUNNABLE gate: `agent-activity-bound` reported six failures on macOS while the supervisors it could not see were running fine, and `subagent-feed`'s cleanup silently stopped killing them. Cheap — five cases, no wall-clock waits beyond process startup | serial-global | Asserts a DEAD pid resolves to an empty cwd. That holds only while the pid stays unallocated, and the pid space is global — concurrent suites churn it and recycle the pid onto someone else's cwd |
| `baton-durability` | both | A branch operation silently kills a live dispatch (BUG-019) | Every change here is a branch, which is the condition that made the bug routine; a race needs real elapsed time to test, and that time buys the only assertion that distinguishes a lost dispatch from a slow one | serial-timing | Two wall-clock assertions: a 2 s sleep that must land inside an 8 s settle — whose own overshoot path calls `fail`, not skip — and a 400-iteration sampler racing the publisher, which under load finishes first and passes vacuously |
| `lifecycle-docs` | both | An artefact is stranded away from its row after a promotion, or a table claims an item that does not exist | Lifecycle moves leave folders behind by default — rows are one line, folders are not; both failure modes were found by a human reading a directory listing | parallel-safe | Self-concurrency verified by execution. A working-tree reader with global-absence claims over `docs/`, so it needs a read view of the tree rather than exclusive use of the host |
| `wait-mic` | both | The mic waiter fires on something that is not a handoff, so the agent re-arms on a phantom — or stops firing at all, which is the blindness it was built to replace (FEATURE-005) | Eight of its thirteen cases assert a NEGATIVE, and a negative is exactly what no reviewer notices missing; the five positives are the other half — a reader that fails closed goes silent through a real handoff (#11, #12, #13) — and it drives the real `signal-set.sh` atomic-rename publish, which is the path a hand-rolled fixture would get wrong | serial-timing | Its five positive cases publish to a background waiter after a fixed 0.5 s. If the waiter has not started, the publish becomes its baseline and the case is killed at the 6 s bound. The eight negative cases are load-immune; the positives are not |
| `session-resume` | both | A woken session gets a short, tidy replay of a window it cannot actually see, and treats it as the full picture (FEATURE-003) | Silence is the failure mode being guarded, so it is invisible without a test; the feed is truncated on every daemon start, which makes an incomplete replay the ORDINARY case rather than an edge one, and this runs on every wake | serial-global | unclassified-pending-verification — it drives the feed replay path and has not been execution-probed for concurrency |
| `doc-links` | both | A doc moves, references keep pointing at the old path, and readers hit dead links until someone opens one | Cheap, and lifecycle moves break links constantly by design; 13 were already broken when it was written, one wrong across two relocations | parallel-safe | Self-concurrency verified by execution. Reads the working tree and asserts absence over `docs/` — safe beside other readers, and every suite that writes works inside its own fixture |
| `commit-msg-gate` | both | Work lands with no traceable backlog item, so nobody can tell what a change was for | Guards DoD §1b rule 1; the alternative is remembering, which this repo has rejected five times | parallel-safe | Self-concurrency verified by execution. Drives the hook against a fixture message file in its own root |
| `watcher-liveness` | both | A dispatch to a dead watcher fails silently — the baton reads `OVER_TO_CODEX`, the feed is quiet exactly as it looks when an agent is thinking, and the run log is the one surface nobody reads. Cost redcare ~40 minutes and cost this repo a BA dispatch on 2026-08-05 | Pins the oracle to the LOCK and forbids the process table, which matched the checking shell's own command line every time it was tried; and asserts end-to-end that a live watcher produces no warning, so an unconditional implementation cannot pass | serial-global | Reads and `rm -f`s `logs/state/.watch-over_to_codex.lock`, a path it does not own. A live watcher inside the window is either falsely failed and its lock deleted, or already holds it and the assertion passes vacuously |
| `codex-persona-label` | both | Codex output reaches the feed as a bare `[CODEX]`, so the founder cannot tell which persona produced a line — and a label built inside the feed can never be right, because the feed binds it once at daemon start while the mic changes hands under it | Pins the label to ONE shared roster lookup used by both the feed and the launcher; without that assertion the launcher's copy drifts from the feed's and both keep passing in isolation | parallel-safe | Verified by reading: one roster lookup against a fixture roster, no daemon and no feed write |
| `subagent-feed` | both | Delegated work is invisible: a subagent's transcript is 100% `isSidechain`, so the projection drops every record and the feed is silent for the whole run (BUG-027) — and the surviving bookends all read `general-purpose`, so no line names who produced it | Guards the observability of the team itself, on the path every dispatch takes; the blackout LOOKS like an idle agent, so it is undetectable without a test, and it punishes the delegation rule the repo mandates. Drives a real supervisor over a real transcript, and pins BOTH directions of the filter — asserting only that subagent lines appear would pass against deleting the filter, which doubles every line under the wrong label | serial-global | unclassified-pending-verification. Its kill/count IS ownership-filtered, but every poll costs one `lsof` per supervisor on the host, so its behaviour is a function of what else is running |
| `commit-subjects` | both | The item rule goes unchecked on the ONE path every blueprint change takes — GitHub composes the squash-merge subject from the PR title, where no client-side hook can run, so `5fe89e0` landed on main after the gate shipped | Guards the door `commit-msg-gate` structurally cannot reach; also pins the hook and CI to ONE definition of the rule, because two copies drift while each keeps passing its own tests | serial-global | Runs `git -C … init` without scrubbing an inherited `GIT_DIR`, and was PROVEN to rewrite a victim repository's `core.hooksPath` and identity (BUG-047) |
| `dod-gate` | both | The DoD stages stop failing when they should, so the gate prints four extra greens that check nothing — worse than absent, because they inflate the stage count the founder reads as evidence | Guards the checklist that guards everything else; every case drives a real failure rather than asserting the happy path | parallel-safe | Self-concurrency verified by execution. Scrubs `AGENT_SIGNAL_FILE`/`AGENT_STATE_HOME` at `:21` — one of the two hygiene patterns the rest of the tree should copy. Internally serial across its own cases, which is a separate question from cross-suite safety |
| `roster` | both | Persona identity stops following the roster (BUG-010) | Ships to every project; the live-supervisor case runs here | serial-timing | Sleeps 1–2 s around the real feed and then greps for a persona, against a first-record latency this repo has measured at 32.6 s (BUG-039). Already marginal while serial |
| `pre-push-secrets` | both | Secrets ride out in commits nothing scanned (A-03) | The repo is public — a pushed secret is world-readable before CI starts | serial-timing | #10 asserts elapsed `-ge 9` across three refs against a 3 s per-ref cap. Three concurrent forks of `timeout`+`git`+`sh` on an emulated host cross that, and the suite then reports the cap as per-ref |
| `a2bp-contamination` | both | One project's host paths and name reach every other project (BUG-002, A-09) | Guards the door both contamination incidents came through | serial-global | Drives the real `a2bp` ~35 times, keeping `${TMPDIR}/a2bp.*` populated for most of its runtime — the exact population `a2bp-e2e` asserts is empty |
| `signal-set` | both | A torn baton dispatches an agent against finished work | Guards atomic publication of the handoff | parallel-safe | Self-concurrency verified by execution. Every publish goes to a fixture baton it created, never the live one |
| `signal-dispatch` | both | The watcher fires on a Task nobody updated, dispatching against stale work | Happened twice in one session; re-clocked 125.4 s → 75.0 s so cost is no longer the question. It is the slowest stage and the SLO says so on every run — visible, not demoted. CI additionally runs it at the original slower settle | serial-timing | #5 asserts an exact race trace (`old/old/new`) built on a 0.4 s sleep that must stay inside a 2 s settle. A scheduler stall publishes a torn state and the trace changes |
| `a2bp-request` | both | Back-propagation writes into the blueprint instead of filing a request | Guards the only sanctioned upstream path | serial-global | unclassified-pending-verification — it shares the `a2bp` request path with two suites that are proven global |
| `a2bp-build` | both | A malformed request branch reaches the blueprint remote | Same path, build half | parallel-safe | Verified by reading: a hermetic request build against a bare fixture remote, no shared path and no absence claim |
| `a2bp-inputs` | both | a2bp acts on an unvalidated destination or input | Fails closed before anything leaves the machine | parallel-safe | Verified by reading: input validation only — it fails closed before anything leaves the machine, so it allocates no shared resource |
| `a2bp-e2e` | both | The leak-critical wiring breaks: a contaminated file is pushed anyway | End-to-end proof that contamination blocks the whole request | serial-global | Asserts absence of `a2bp.*` in the shared `${TMPDIR}`, which on macOS is the per-user root every process this user owns writes to. Fails by construction beside `a2bp-contamination` |
| `staleness` | both | `drift` blocks a wake, prompts with no TTY, or reports an unknown checkout as current | Runs at every agent wake with nobody watching | serial-timing | A two-sided elapsed window — lower bound 1.5 s, upper bound 6.0 s — around a clone plus `ls-remote` plus a `timeout` kill. The least load-tolerant assertion in the repo. Parallel-safe under `--fast`, which skips #8 |
| `bootstrap-contents` | blueprint | A new project inherits this repo's work items, `.env`, or logs (A-05) | Every bootstrap is affected. `blueprint` because it drives the real `new-project.sh` against a fixture blueprint carrying `templates/` — neither exists downstream, so there it failed on machinery that could not have been present (BUG-028) | serial-global | Drives the real `new-project.sh` and builds its fixture with `git archive HEAD`, so it bootstraps from COMMITTED code — the BUG-046 root fix in the working tree does not protect it, only its own `unset` does. Serial while that asymmetry stands |
| `bootstrap-identity` | blueprint | Bootstrap writes a git identity or fails unsafely without one | Same path, and the same reason it cannot ship: it bootstraps, and only a blueprint can | serial-global | Bootstraps and runs git directly. BUG-046 and BUG-047 are fixed here and `git-isolation` #1 now proves the `GIT_DIR` scrub by EXECUTING this suite under a victim repo, so the hazard is guarded rather than merely absent |
| `drift-in-blueprint` | blueprint | `blueprint drift` dies in the blueprint itself (BUG-007) | Guards the command every agent runs on every wake. **Found by this manifest's first run to be executing NOWHERE — in neither the gate nor CI (audit finding A-15 exactly)**. `blueprint` because the path it exercises is keyed on `.blueprint-root`, which by BUG-013 must never ship — downstream there is nothing for it to be true about | serial-global | Runs the real CLI against the real `$ROOT`: it takes `.git/config.lock` through `arm_gate`, `.git/index.lock` through `git status --porcelain`, and reaches the network with `ls-remote` |
| `git-isolation` | both | A test suite writes commits and config into the developer's real repository, disarming the gate (BUG-014) | Guards the gate's own integrity: this is what wiped `core.hooksPath` and let an ungated push through | serial-global | Executes two other suites in-process (`marker-merge`, `gate-arming`) and makes a global absence claim over `tests/`. A scheduler that models it as one unit is silently running three |
| `no-chain-guard` | both | The command-chaining guard fails open, so compound commands inherit an allowlist match and defeat the deny list | Guards an enforcement control; it shipped failing open on malformed input and missing jq, which nothing could have detected without this | parallel-safe | Self-concurrency verified by execution. Subshell-scoped `PATH`, one `mktemp` root, no git, no spawned daemons, no absence claim about the host — the reference implementation |
| `pull-behaviour` | both | A partial pull claims a full sync so drift reports zero commits behind, and pull dies with no TTY (BUG-016/BUG-018) | Guards the sync record every project trusts; a false "in sync" is invisible until someone diffs by hand | parallel-safe | Self-concurrency verified by execution. Operates on a fixture blueprint and a fixture project |
| `a2bp-pr-filing` | both | `a2bp` reports a request as filed when no PR was opened (BUG-011) | Guards the only sanctioned path for improvements to reach the blueprint; an exit code that asserts success while doing nothing is undetectable downstream | parallel-safe | Verified by reading: a `PATH`-shimmed `gh` inside a subshell, one `mktemp` root — a reference implementation alongside `no-chain-guard` |
| `pull-exec-bit` | blueprint | A pulled hook comes out non-executable, so the gate is armed but silently never runs (BUG-008) | Guards whether the gate runs at all in every project that pulls; git skips a non-executable hook without a word. `blueprint` because its #5 needs an executable file with the placeholder still IN it, and a bootstrapped project has none by construction — downstream it announced itself VACUOUS, which is the honest form of a suite that cannot hold there | parallel-safe | Verified by reading: file-mode assertions entirely inside its own fixture |
| `env-namespace` | both | A managed script carries one project's env namespace to every other project (BUG-006) | Same class as BUG-002/009/010 — a specific thing baked into a file that travels; found four times by hand before this guard existed | parallel-safe | Verified by reading: greps managed scripts in the working tree. A reader with a global-absence claim over the tree, so it is safe beside other readers |
| `template-source` | blueprint | The blueprint's own config ships as the seed template, so anything it writes about itself propagates to every project (BUG-009) | Fourth instance of the travelling-contamination class; asserts against the real `git archive` and a real bootstrap. `blueprint` because `templates/` is itself export-ignore'd — the suite needs the very thing whose absence it asserts | parallel-safe | **Reclassified with the TypeScript port.** It was `serial-global` because the shell runner drove `new-project.sh` with no `AGENT_SIGNAL_FILE` scrub and was reproduced overwriting the live baton (BUG-046) — a hazard self-concurrency could not see, because both copies shared it. The harness REMOVES that hazard rather than declaring it: the bootstrap runs in a scenario workspace with its own HOME, TMPDIR and AGENT_* vars, and the canary asserts the real baton, feed and git config are byte-unchanged. Reads of the real checkout are read-only |
| `bootstrap-gate` | blueprint | A freshly bootstrapped project cannot pass its own pre-push gate and nobody here finds out — the failure lands on the new project's first push, on someone else's machine, after this repo's gate went green over the same suites passing at home (BUG-028) | The one assertion that could have caught six day-one failures, and the one nothing else makes: every other bootstrap suite checks what the archive CONTAINS, none ever ran what the new project RUNS. It must block, because `.gitattributes`, `new-project.sh` and this manifest are all on the push path and a regression in any of them reaches a commit unopposed. `blueprint` because it bootstraps, which only a blueprint can do. It is the slowest stage in the gate and the SLO names it on every run — visible, not demoted | serial-global | Runs an entire second pre-push gate, inheriting every hazard of the ~30 suites nested inside it — including the other global claims in this table. Sole occupant of the host by construction |
| `suite-sync` | both | Either half of BUG-029 returns: a derived project's suites freeze at bootstrap while the machinery they test keeps being pulled forward — so its gate goes green over assertions about code it no longer runs — or the sync grows a delete path and takes out the project's own suites with it | Guards the only mechanism that keeps a derived project's coverage honest, on the command every wake runs. Both failure directions are silent: a frozen suite still PASSES, and an additive-only sync leaves no trace when it is not additive. Drives the real CLI against a real fixture blueprint, and pins the `git check-attr` trap — the obvious query for "what ships" gives the wrong answer, and this repo has walked into it once already (`tests/manifest`:139-141) | parallel-safe | Verified by reading: drives the real CLI against a fixture blueprint and a fixture project, never against `$ROOT` |
| `harness` | blueprint | The TypeScript fixture API stops isolating, and every migrated suite silently inherits the defect it was built to make impossible: an unscrubbed `GIT_DIR` writing the developer's real repository (BUG-047), an inherited `AGENT_SIGNAL_FILE` resetting the live baton (BUG-046), an unreaped child, a temp root left behind (BUG-049) | TASK-018's whole claim is that isolation becomes structural instead of remembered, and `tests/harness/` is the only place that claim is tested directly rather than relied upon. A harness that quietly stops scrubbing turns every green spec above it into a spec that proved nothing, so it blocks on the same path as the suites it carries. **`blueprint` for TASK-018 phase 1 only, and that is an enforced claim rather than a label:** `.gitattributes` holds `tests/harness/` back until a SHIPPING suite is TypeScript, so this suite genuinely reaches no derived project and #2b fails the push the moment it does. Phase 2 flips this cell to `both` in the same change that deletes those export-ignore lines — #2c is what stops that move being half-done | serial-global | unclassified-pending-verification — it exercises the fixture primitives themselves, spawned children and temp roots included, and has not been execution-probed for concurrency |
| `manifest` | both | This manifest stops being enforced, and silent exclusions return | Guards the control that guards every tier above, now including the export boundary that decides which suites reach a derived project at all | parallel-safe | Self-concurrency verified by execution. Reads `tests/`, this file, the gate and the workflow; writes nothing outside two `mktemp` files |
| `ts-bridge` | both | Every TypeScript suite silently stops running under a real `git push`, and a failing runner truncates the gate with no error (BUG-055) | The manifest proves the bridge is INVOKED; nothing proved it WORKS. It only ever ran by hand, where `GIT_DIR` is absent — under a push git sets it, the harness correctly refuses every scenario, and `set -e` killed the hook before a single stage printed. A stage that fails as silence is indistinguishable from one that does not exist, so this must block | parallel-safe | Fully hermetic: its own `mktemp` root, a stubbed `npx`, and a fixture manifest. Touches no real repo, spawns no daemon, and asserts nothing about wall-clock |

<!-- SUITES:END -->

### Retired shell runners

A migrated suite keeps its `*.sh` on disk until the whole migration is finished
— deleting it early throws away the only thing the spec can be checked against —
but the gate **stops running it** as soon as the spec is equivalence-proven,
because running both is paying twice for one assertion.

**That decision has to be DECLARED, or it is indistinguishable from forgetting.**
"We deliberately stopped invoking this" and "this fell out of the gate and nobody
noticed" look identical from outside, and the second one is BUG-005 — the defect
this whole file exists to prevent. So a suite may have a `*.sh` the gate never
invokes only when every one of these holds, and `tests/manifest` #4/#4b/#5 check
all of them:

1. it has a row **here**, naming the mutant and the case that mutant turned red,
2. the suite **has** a `*.spec.ts`, and
3. that spec is **actually invoked** — the full four-link chain, same as any
   other spec. Losing a shell runner without gaining a running TypeScript one is
   not expressible.

**The recipe is required, and it is checked for content, not just presence.**
PLAN-TASK-018 §5 says a shell runner is not retired until a mutant proves the
spec fails on the defect the suite exists for. Recorded only in a commit
message, that proof is unauditable at the point the claim is made — the same
failure as `git-isolation` deciding its own membership from comments (BUG-047).
So the cell must name a concrete change (a backticked path, and any path named
must exist) and the case ID it turned red, and — like every other rationale in
this file — **it may not argue from the clock.** The saving is a consequence of
retirement, never its justification: "it is slow" is exactly the sentence that
produced BUG-005, and it is rejected here for the same reason it is rejected in
the Rationale column.

**Nothing here is permanent, and one thing pushes back.** There is no deadline —
this repo does not gate on calendars. But #4b fails if a retired `*.sh` has been
modified more recently than the spec that replaced it: an edit to a runner
nothing executes means the equivalence claim underneath it is now stale, and the
honest answers are to delete the dead runner, revert the edit, or carry the
change into the spec and re-prove it. The count is also reported on every green
run, so the number that is meant to reach zero is visible rather than remembered.

<!-- RETIRED-SHELL-RUNNERS:BEGIN — blueprint-managed. Your own go in the project-owned table below. -->

| Suite | The mutant that proved the spec equivalent | The case it turned red |
|---|---|---|
| `drift-in-blueprint` | Make `_bp_is_blueprint_itself` (`scripts/blueprint`) always report false, so `drift` stops recognising the blueprint as itself and takes the derived-project path | `#1` — the spec goes red exactly where the shell runner did, on the BUG-007 assertion that `drift` exits 0 in the blueprint |
| `pull-exec-bit` | Remove the mode-preservation block from `scripts/lib/placeholders.sh`, so a pulled hook lands without its executable bit | `#1` — the spec goes red on the mode assertion, observing 600 where 755 is required, which is the BUG-008 defect itself |
| `template-source` | Delete the `project_config_overview.md         export-ignore` line from `.gitattributes` **and commit it** — `git archive` reads that file from the commit, not the working tree, so an uncommitted deletion changes nothing and both runners stay green | `#2` — the spec goes red exactly where the shell runner did, reporting `project_config_overview.md` as shipping, which is BUG-009 itself |

| `bootstrap-identity` | Replace the `unset AGENT_SIGNAL_FILE AGENT_STATE_HOME` in `scripts/new-project.sh`'s seed subshell with a no-op, so the seeded baton is published over whatever the caller had | `#6` — both runners go red reporting that bootstrap REPUBLISHED the caller's live baton, which is BUG-046 itself |
<!-- RETIRED-SHELL-RUNNERS:END -->

<!-- BLUEPRINT:END -->

## Your project's suites

Rows below are **project-owned**. `blueprint pull` never touches them, and
`tests/manifest` enforces them exactly as it enforces the table above: a suite
directory under `tests/` with no row here fails the push, and a rationale that
argues from the clock is rejected whichever table it sits in.

The blueprint ships this table empty on purpose — its own suites are all above.

<!-- SUITES:BEGIN — project-owned. -->

| Suite | Tier | Risk if absent | Rationale for the tier | Parallelism | Why that class |
|---|---|---|---|---|---|

<!-- SUITES:END -->

### Your project's retired shell runners

Same rules as the blueprint's table above, same enforcement, and this one is
yours — `blueprint pull` never touches it. The markers are what the manifest
parses, so keep them even while the table is empty; a retirement row anywhere
else in this file is not a declaration, it is a comment.

<!-- RETIRED-SHELL-RUNNERS:BEGIN — project-owned. -->

| Suite | The mutant that proved the spec equivalent | The case it turned red |
|---|---|---|


<!-- RETIRED-SHELL-RUNNERS:END -->
