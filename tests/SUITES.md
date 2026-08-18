# Suite manifest — every regression suite, its tier, and why

**This file is enforced.** `tests/manifest/test.sh` fails the push if a suite
exists but is not listed here, if a listed suite does not exist, if a suite
declared `pre-push` is not actually invoked by the gate, or if a rationale is
empty or **argues from the clock**.

*Enforced* is meant literally, and it took two rounds to become true. Codex found
the first version proved only that **strings existed**: membership was an
unanchored `grep`, so commenting out an invocation kept the control green while
the suite stopped running; and discovery recognised only `tests/*/test.sh`, so
renaming a runner made a suite invisible. Neither bypass required lying in this
file — ordinary refactoring was enough. Now comments are stripped and an
anchored `bash tests/<suite>/<file>.sh` command is required, and **every** shell
file under `tests/` must belong to a declared suite.

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
    suite that has been export-ignore'd behind everyone's back.
- **Risk** — what breaks if this suite is absent and the thing it guards
  regresses. One line. This is the field that decides the tier.
- **Rationale** — why that tier. A CI-only rationale must argue from *risk*
  (what it guards is not on the push path, and a regression cannot reach a
  commit). **It may not argue from cost.** "Too slow", "does not fit", "seconds",
  "budget", "ceiling" are rejected by the test, by design — a slow suite that
  matters is a suite to make faster, as `signal-dispatch` demonstrated by going
  from 125.4 s to 75.0 s with every assertion intact.

## The suites

| Suite | Tier | Risk if absent | Rationale for the tier |
|---|---|---|---|
| `pipeline` | both | The gate renderer could pass a failing stage, silently opening every gate in the repo | Guards fail-closed on the push path |
| `marker-merge` | both | A pull clobbers project-owned content outside the markers | Data loss in a command run on every wake |
| `agent-activity-bound` | both | The feed fork-bomb returns (BUG-001 pegged ~24 of 32 threads for 2.7 days) | Host-level damage, caused by code every wake runs; the race and fault-injection cases guard the same mechanism and belong with it |
| `pre-push-scanners` | both | A broken scanner reads as a clean scan, so security gates fail open | Directly guards whether the gate itself is honest |
| `gate-arming` | both | A clone pushes ungated (BUG-004) | Guards whether any gate runs at all |
| `state-dir` | both | Cross-project log contamination returns (A-09) | Cheap, and guards a mechanism every project shares |
| `baton-durability` | both | A branch operation silently kills a live dispatch (BUG-019) | Every change here is a branch, which is the condition that made the bug routine; a race needs real elapsed time to test, and that time buys the only assertion that distinguishes a lost dispatch from a slow one |
| `lifecycle-docs` | both | An artefact is stranded away from its row after a promotion, or a table claims an item that does not exist | Lifecycle moves leave folders behind by default — rows are one line, folders are not; both failure modes were found by a human reading a directory listing |
| `wait-mic` | both | The mic waiter fires on something that is not a handoff, so the agent re-arms on a phantom — or stops firing at all, which is the blindness it was built to replace (FEATURE-005) | Eight of its thirteen cases assert a NEGATIVE, and a negative is exactly what no reviewer notices missing; the five positives are the other half — a reader that fails closed goes silent through a real handoff (#11, #12, #13) — and it drives the real `signal-set.sh` atomic-rename publish, which is the path a hand-rolled fixture would get wrong |
| `session-resume` | both | A woken session gets a short, tidy replay of a window it cannot actually see, and treats it as the full picture (FEATURE-003) | Silence is the failure mode being guarded, so it is invisible without a test; the feed is truncated on every daemon start, which makes an incomplete replay the ORDINARY case rather than an edge one, and this runs on every wake |
| `doc-links` | both | A doc moves, references keep pointing at the old path, and readers hit dead links until someone opens one | Cheap, and lifecycle moves break links constantly by design; 13 were already broken when it was written, one wrong across two relocations |
| `commit-msg-gate` | both | Work lands with no traceable backlog item, so nobody can tell what a change was for | Guards DoD §1b rule 1; the alternative is remembering, which this repo has rejected five times |
| `watcher-liveness` | both | A dispatch to a dead watcher fails silently — the baton reads `OVER_TO_CODEX`, the feed is quiet exactly as it looks when an agent is thinking, and the run log is the one surface nobody reads. Cost redcare ~40 minutes and cost this repo a BA dispatch on 2026-08-05 | Pins the oracle to the LOCK and forbids the process table, which matched the checking shell's own command line every time it was tried; and asserts end-to-end that a live watcher produces no warning, so an unconditional implementation cannot pass |
| `codex-persona-label` | both | Codex output reaches the feed as a bare `[CODEX]`, so the founder cannot tell which persona produced a line — and a label built inside the feed can never be right, because the feed binds it once at daemon start while the mic changes hands under it | Pins the label to ONE shared roster lookup used by both the feed and the launcher; without that assertion the launcher's copy drifts from the feed's and both keep passing in isolation |
| `commit-subjects` | both | The item rule goes unchecked on the ONE path every blueprint change takes — GitHub composes the squash-merge subject from the PR title, where no client-side hook can run, so `5fe89e0` landed on main after the gate shipped | Guards the door `commit-msg-gate` structurally cannot reach; also pins the hook and CI to ONE definition of the rule, because two copies drift while each keeps passing its own tests |
| `branch-guard` | both | The blueprint's main takes direct commits — whoever pushes next carries them out — OR the guard fires in derived projects and breaks every trunk-based one that pulls it | Both failure directions ship to every project; the derived-project case is the one that must never regress |
| `dod-gate` | both | The DoD stages stop failing when they should, so the gate prints four extra greens that check nothing — worse than absent, because they inflate the stage count the founder reads as evidence | Guards the checklist that guards everything else; every case drives a real failure rather than asserting the happy path |
| `roster` | both | Persona identity stops following the roster (BUG-010) | Ships to every project; the live-supervisor case runs here |
| `pre-push-secrets` | both | Secrets ride out in commits nothing scanned (A-03) | The repo is public — a pushed secret is world-readable before CI starts |
| `a2bp-contamination` | both | One project's host paths and name reach every other project (BUG-002, A-09) | Guards the door both contamination incidents came through |
| `signal-set` | both | A torn baton dispatches an agent against finished work | Guards atomic publication of the handoff |
| `signal-dispatch` | both | The watcher fires on a Task nobody updated, dispatching against stale work | Happened twice in one session; re-clocked 125.4 s → 75.0 s so cost is no longer the question. It is the slowest stage and the SLO says so on every run — visible, not demoted. CI additionally runs it at the original slower settle |
| `a2bp-request` | both | Back-propagation writes into the blueprint instead of filing a request | Guards the only sanctioned upstream path |
| `a2bp-build` | both | A malformed request branch reaches the blueprint remote | Same path, build half |
| `a2bp-inputs` | both | a2bp acts on an unvalidated destination or input | Fails closed before anything leaves the machine |
| `a2bp-e2e` | both | The leak-critical wiring breaks: a contaminated file is pushed anyway | End-to-end proof that contamination blocks the whole request |
| `staleness` | both | `drift` blocks a wake, prompts with no TTY, or reports an unknown checkout as current | Runs at every agent wake with nobody watching |
| `bootstrap-contents` | blueprint | A new project inherits this repo's work items, `.env`, or logs (A-05) | Every bootstrap is affected. `blueprint` because it drives the real `new-project.sh` against a fixture blueprint carrying `templates/` — neither exists downstream, so there it failed on machinery that could not have been present (BUG-028) |
| `bootstrap-identity` | blueprint | Bootstrap writes a git identity or fails unsafely without one | Same path, and the same reason it cannot ship: it bootstraps, and only a blueprint can |
| `drift-in-blueprint` | blueprint | `blueprint drift` dies in the blueprint itself (BUG-007) | Guards the command every agent runs on every wake. **Found by this manifest's first run to be executing NOWHERE — in neither the gate nor CI (audit finding A-15 exactly)**. `blueprint` because the path it exercises is keyed on `.blueprint-root`, which by BUG-013 must never ship — downstream there is nothing for it to be true about |
| `git-isolation` | both | A test suite writes commits and config into the developer's real repository, disarming the gate (BUG-014) | Guards the gate's own integrity: this is what wiped `core.hooksPath` and let an ungated push through |
| `no-chain-guard` | both | The command-chaining guard fails open, so compound commands inherit an allowlist match and defeat the deny list | Guards an enforcement control; it shipped failing open on malformed input and missing jq, which nothing could have detected without this |
| `pull-behaviour` | both | A partial pull claims a full sync so drift reports zero commits behind, and pull dies with no TTY (BUG-016/BUG-018) | Guards the sync record every project trusts; a false "in sync" is invisible until someone diffs by hand |
| `a2bp-pr-filing` | both | `a2bp` reports a request as filed when no PR was opened (BUG-011) | Guards the only sanctioned path for improvements to reach the blueprint; an exit code that asserts success while doing nothing is undetectable downstream |
| `pull-exec-bit` | blueprint | A pulled hook comes out non-executable, so the gate is armed but silently never runs (BUG-008) | Guards whether the gate runs at all in every project that pulls; git skips a non-executable hook without a word. `blueprint` because its #5 needs an executable file with the placeholder still IN it, and a bootstrapped project has none by construction — downstream it announced itself VACUOUS, which is the honest form of a suite that cannot hold there |
| `env-namespace` | both | A managed script carries one project's env namespace to every other project (BUG-006) | Same class as BUG-002/009/010 — a specific thing baked into a file that travels; found four times by hand before this guard existed |
| `template-source` | blueprint | The blueprint's own config ships as the seed template, so anything it writes about itself propagates to every project (BUG-009) | Fourth instance of the travelling-contamination class; asserts against the real `git archive` and a real bootstrap. `blueprint` because `templates/` is itself export-ignore'd — the suite needs the very thing whose absence it asserts |
| `bootstrap-gate` | blueprint | A freshly bootstrapped project cannot pass its own pre-push gate and nobody here finds out — the failure lands on the new project's first push, on someone else's machine, after this repo's gate went green over the same suites passing at home (BUG-028) | The one assertion that could have caught six day-one failures, and the one nothing else makes: every other bootstrap suite checks what the archive CONTAINS, none ever ran what the new project RUNS. It must block, because `.gitattributes`, `new-project.sh` and this manifest are all on the push path and a regression in any of them reaches a commit unopposed. `blueprint` because it bootstraps, which only a blueprint can do. It is the slowest stage in the gate and the SLO names it on every run — visible, not demoted |
| `manifest` | both | This manifest stops being enforced, and silent exclusions return | Guards the control that guards every tier above, now including the export boundary that decides which suites reach a derived project at all |
