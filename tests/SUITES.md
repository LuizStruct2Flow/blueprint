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

- **Tier** is `pre-push`, `CI`, or `both`.
  - `pre-push` — the gate blocks the push on it. Also runs in CI as a backstop.
  - `CI` — runs after the push. **Reporting, not blocking.**
  - `both` — in the gate, and additionally run in CI under different conditions
    (e.g. a slower clock, or extra cases).
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
| `bootstrap-contents` | both | A new project inherits this repo's work items, `.env`, or logs (A-05) | Every bootstrap is affected; cheap |
| `bootstrap-identity` | both | Bootstrap writes a git identity or fails unsafely without one | Same path |
| `drift-in-blueprint` | both | `blueprint drift` dies in the blueprint itself (BUG-007) | Guards the command every agent runs on every wake. **Found by this manifest's first run to be executing NOWHERE — in neither the gate nor CI (audit finding A-15 exactly)** |
| `git-isolation` | both | A test suite writes commits and config into the developer's real repository, disarming the gate (BUG-014) | Guards the gate's own integrity: this is what wiped `core.hooksPath` and let an ungated push through |
| `no-chain-guard` | both | The command-chaining guard fails open, so compound commands inherit an allowlist match and defeat the deny list | Guards an enforcement control; it shipped failing open on malformed input and missing jq, which nothing could have detected without this |
| `pull-behaviour` | both | A partial pull claims a full sync so drift reports zero commits behind, and pull dies with no TTY (BUG-016/BUG-018) | Guards the sync record every project trusts; a false "in sync" is invisible until someone diffs by hand |
| `a2bp-pr-filing` | both | `a2bp` reports a request as filed when no PR was opened (BUG-011) | Guards the only sanctioned path for improvements to reach the blueprint; an exit code that asserts success while doing nothing is undetectable downstream |
| `manifest` | both | This manifest stops being enforced, and silent exclusions return | Guards the control that guards every tier above |
