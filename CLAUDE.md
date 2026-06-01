# Development Instructions

This file is the struct2flow **generic** agent protocol. Project-specific
overrides live in `project_config_overview.md`, `project_config_paths.md`,
and `project_config_dod.md` at the repo root. Read those alongside this file.

## Agent Coordination Signal

Codex and Claude Code coordinate through [AGENT_SIGNAL.md](AGENT_SIGNAL.md),
the shared "radio over" file.

Before doing substantive work, **read the signal first** and confirm the mic is
available:

- proceed if `State = IDLE`
- proceed if `State = OVER_TO_<your agent>`
- proceed if `Holder = <your agent>`
- otherwise stop and report that another actor has the mic

After confirming the mic is available, claim it by updating:

- `Holder` — who currently owns the mic (`Codex`, `Claude Code`, or `User`)
- `State` — set to `ACTIVE` while working, or to `OVER_TO_CODEX`, `OVER_TO_CLAUDE`, `OVER_TO_USER`, or `IDLE` when handing off
- `Task` — one short sentence naming the current work
- `Last update` — absolute date

Rules:

- The `ACTIVE` state locks WHO IS COORDINATING THE SIGNAL, not WHO MAY EDIT
  FILES. While another agent is `ACTIVE`:
  - **Always allowed**: investigative / read-only work (Read, Grep, log
    lookups, infra API queries), planning work (drafting `PLAN-*.md`,
    designing approaches), and writing prompts for subagents.
  - **Allowed in parallel**: implementation work on files outside the
    active holder's declared `Task` scope. Surface what you did in your
    next signal flip — don't silently land changes mid-handoff.
  - **Blocked**: edits to files that overlap with the active holder's
    declared `Task` scope, unless the founder explicitly interrupts or
    the signal is clearly stale.
- If the state is `OVER_TO_CODEX` or `OVER_TO_CLAUDE`, that agent may proceed
  directly with its review/fix without waiting for the founder to ask again.
- When handing off, update the state to the target actor and include `OVER` in
  the state value, e.g. `OVER_TO_CODEX`.
- Use `OVER_TO_USER` when founder acceptance, rejection, or product direction
  is needed.

**Claude Code stays active after a handoff** — after flipping the state to
`OVER_TO_CODEX` or `OVER_TO_USER`, Claude Code does NOT go silent waiting
for a prompt. It keeps re-reading `AGENT_SIGNAL.md` until the state
advances (e.g. `OVER_TO_CLAUDE`), then claims the mic and continues.
Claude Code only stops when there's genuinely nothing to do (signal
`IDLE`, no open plans, all bugs in `done/`).

**Reactivity — what's possible.** Three mechanisms, preferred order:

1. **`Monitor`-based mtime poll (push-style, preferred).** Spawn a
   persistent `Monitor` task at the start of any session where the
   signal is non-IDLE. The script polls `AGENT_SIGNAL.md`'s mtime
   every 2 s and emits one stdout line per change — each line arrives
   as a task notification that wakes the session asynchronously,
   even between turns. Exact command:

   ```bash
   cd <project-root>
   last=$(stat -f %m AGENT_SIGNAL.md 2>/dev/null)
   while true; do
     sleep 2
     new=$(stat -f %m AGENT_SIGNAL.md 2>/dev/null)
     if [ -n "$new" ] && [ "$new" != "$last" ]; then
       last=$new
       holder=$(grep '^| Holder ' AGENT_SIGNAL.md | head -1 | sed 's/^| Holder *| //; s/ *|$//')
       state=$(grep '^| State ' AGENT_SIGNAL.md | head -1 | sed 's/^| State *| //; s/ *|$//')
       echo "[signal-change] Holder=$holder State=$state"
     fi
   done
   ```

   Invoke via the `Monitor` tool with `persistent: true`,
   `timeout_ms: 3600000` (1 h — the tool's hard max), description
   `"AGENT_SIGNAL.md state-line change watcher (Holder + State)"`.
   Latency ~2 s, zero token cost between events, self-noise
   tolerable (fires on own writes too — just re-read and continue).
   Portable: works on any POSIX shell.

   **1-hour cliff.** The Monitor tool caps `timeout_ms` at 3 600 000
   (1 h). The watcher dies silently at that point. Mitigation:
   respawn it **at the top of every new user turn** if
   (a) state is non-IDLE and (b) the previous event hasn't arrived
   within the last ~45 min. Don't blindly respawn every turn — that
   burns tool calls and the existing task is still usable until the
   cliff.

2. **`ScheduleWakeup` polling (fallback for `/loop` mode).** Every
   15–30 min Claude Code wakes up, re-reads the signal, and either
   resumes (if state advanced) or reschedules. Costs tokens per
   poll.

3. **Turn-triggered read (passive fallback).** Claude Code always
   re-reads the signal at the start of every founder turn. Zero
   cost between turns, but only reacts when the founder next sends
   a message.

**Set up Monitor at the top of any session** where a handoff is open
or likely. If the signal is `IDLE` with no open plans, skip it. If
the user asks you to "stop polling" or "just wait for my next
message", cancel via `TaskStop` and rely on mechanism 3.

### Dispatching Codex (signal-driven, not a direct CLI call)

Claude Code does **not** invoke `codex` directly. Codex is woken by a
**signal-driven dispatcher** that watches `AGENT_SIGNAL.md` and runs the
real Codex CLI whenever the mic flips to `OVER_TO_CODEX`. Three pieces:

1. **The dispatcher (start once, leave running).** Launch
   `scripts/start-codex-signal-watch.sh` (which delegates to
   `scripts/codex-signal-watch.sh`) via the **`Monitor` tool with
   `persistent: true`** so it survives in the background and streams its
   run markers back as notifications:

   ```
   Monitor (persistent): cd <repo> && bash scripts/start-codex-signal-watch.sh 2>&1
   ```

   It polls every 2 s; on each poll where `State = OVER_TO_CODEX` with a
   `Holder|State|Task` key it hasn't fired yet, it runs:

   ```
   codex exec --cd <repo> --sandbox workspace-write --skip-git-repo-check \
     --output-last-message ~/.{{PROJECT_NAME}}/codex-last-message.md \
     "<radio-over preamble> + the verbatim Task field"
   ```

   **Trigger is state-based, not mtime-based:** because `last_trigger_key`
   starts empty, **starting the dispatcher while the signal is already
   `OVER_TO_CODEX` fires it on the first poll** — no re-flip needed.

2. **Trigger Codex by flipping the signal, never by calling `codex`.** Edit
   `AGENT_SIGNAL.md`: `State -> OVER_TO_CODEX` and put the actual prompt for
   Codex in the `Task` field (Codex receives `Task` verbatim, wrapped in the
   coordination preamble). **The dispatcher must already be running before
   you flip** — otherwise the trigger fires into the void.

3. **Where output lands.** `~/.{{PROJECT_NAME}}/codex-runs.log` (full run
   log; `tail -f`), `~/.{{PROJECT_NAME}}/codex-last-message.md` (Codex's
   final message), and `~/.{{PROJECT_NAME}}/signal.log` (trigger log).
   Codex writes its file edits + flips `AGENT_SIGNAL.md` back to
   `Holder=Claude Code / State=OVER_TO_CLAUDE` (or `ACTIVE`) itself, as
   instructed by the preamble. Keep a separate signal-change `Monitor`
   (mechanism 1) armed so Claude Code wakes on that flip-back.

**Codex binary discovery** (in `start-codex-signal-watch.sh`): `$CODEX_BIN`,
then `codex` on `PATH`, then `~/.vscode/extensions/*/bin/*/codex` (the CLI
bundled with the OpenAI / ChatGPT VS Code extension). It is normally **not on
a non-interactive shell's `PATH`** — that is expected; the launcher resolves
the extension binary. Set `CODEX_BIN=/path/to/codex` to override.

**Common failure modes:** dispatcher not running when the signal flips
(fires into the void); calling `codex` directly (bypasses the radio-over
protocol so Codex never sees the handoff); binary not found (set
`CODEX_BIN`); wrong log path (it is `~/.{{PROJECT_NAME}}/`, not `~/`).

## Before Every Push

A shared pre-push hook at `.githooks/pre-push` enforces the generic gate
(build, lint, tests) and blocks the push if anything fails. Project-specific
guards (placeholder checks, asset invariants, release-notes guards, etc.)
live in `.githooks/pre-push-project` and are sourced by the main hook if
present. The hook is tracked in the repo and should auto-wire on
`npm install` (or your project's bootstrap) via a `postinstall` that sets
`git config --local core.hooksPath .githooks`.

**Lint warnings count is ratcheted** — don't loosen `--max-warnings` without
explicit justification. After pushing, watch your CI pipeline; if red, fix
before moving on.

Details and the exact gate order live in [docs/DoD.md](docs/DoD.md) §4 + §7.

## Definition of Done — read before every handoff

[**`docs/DoD.md`**](docs/DoD.md) is the canonical handoff checklist for
Claude Code + Codex. Before flipping `AGENT_SIGNAL.md` to `OVER_TO_USER`
(or to the other agent), walk the **Handoff checklist** in §A–§H. The
sections of CLAUDE.md describe the rules in detail; the DoD is the
operational gate that enforces them.

If `waiting-acceptance/` doesn't contain the artefacts your signal claims
are waiting, **the handoff is not done**.

## Documentation Structure

Project documentation lives under `docs/`:

```
docs/
├── DoD.md                ← Definition of Done — handoff checklist (READ FIRST)
├── OBSERVABILITY.md      ← capture / retrieve / alert recipes per runtime
├── config/               ← stable reference docs (FEATURES.md, ACCEPTANCE_TESTS.md, findings.md)
├── backlog/              ← PARKED work (KEEP / DEFER / OBSOLETE — not active)
├── doing/                ← active work being implemented (BUGS.md, PLAN-*.md, HANDOVER.md)
├── waiting-acceptance/   ← pushed to main, awaiting user acceptance testing
├── done/                 ← user-accepted completed work
├── requirements/         ← cross-cutting normative specs referenced by multiple plans
└── mocks/                ← design mockups + throwaway prototypes
```

**Work-item folder rule:**
A work item that needs more than one file to describe it lives in its
own folder under `docs/<lifecycle-state>/`. Single-file items (just a
row in `BUGS.md` / `BACKLOG.md`, or a single `PLAN-*.md`) stay flat;
multi-file items get a folder containing the plan, code prototypes,
visual mockups, outputs, decision docs, and any other artefacts.

Folder-naming convention: `BUG-XXX-<short-slug>` / `SPIKE-XX-<NAME>` /
`SLICE-XX-<NAME>` / `SPRINT-YYYY-MM-DD<-letter>` so the folder name
self-identifies; inside the folder, file names can drop the
identifier and stay short (`PLAN.md`, `DECISION.md`, `code/`,
`outputs/`). Whole folder travels together through
`doing/` → `waiting-acceptance/` → `done/`.

This rule also forbids spike / prototype / mockup code under production
`src/` directories. Production `src/` stays free of dead branches. If a
spike outcome promotes one arm to production, that arm's code is
*re-implemented* (or carefully copied) into `src/` as part of the
implementation sprint — never `mv`'d wholesale from the spike folder.

**Lifecycle — four-state flow (parked + three founder-gated):**

```
backlog/  →  doing/  →  waiting-acceptance/  →  done/
         (promote)   (push to main)        (founder accepts)
                ↑          ↑
                └──────────┴─── reopen / regression
```

0. **`backlog/`** — **parked** items. Bugs, features, plans, decision records
   that exist but are not actively being worked on. Each row carries a state:
   `KEEP` (will be pulled when prioritised), `DEFER` (re-open trigger
   documented), or `OBSOLETE` (audit trail, deleted at next grooming). Items
   leave only by **promotion** (move the row / `PLAN-*.md` / multi-file folder
   into `doing/`) or **cancellation** (delete + leave a one-line pointer in
   `docs/config/findings.md`).
1. **`doing/`** — active work being implemented. Bugs tracked in
   `doing/BUGS.md`, major-bug / feature plans as `doing/PLAN-*.md`,
   multi-file epics in their own folder, and the canonical
   `doing/HANDOVER.md` resume doc.
2. **After pushing** the fix/feature to `main` → move to **`waiting-acceptance/`**:
   - Move the bug row from `doing/BUGS.md` to `waiting-acceptance/BUGS.md`.
   - Move the `PLAN-*.md` file from `doing/` to `waiting-acceptance/`.
   - Behaviour changes (no underlying defect) → row in
     `waiting-acceptance/CHANGES.md`.
3. **User tests and confirms** (explicit signal like "BUG-0XX is done" /
   "accept item Y") → move from `waiting-acceptance/` to `done/`. Claude
   does NOT auto-promote to `done/`.
4. **User reopens** (rejects acceptance, finds regression, asks for rework)
   → move from `waiting-acceptance/` back to `doing/`.

**Key rules:**
- `backlog/` is **not** a graveyard: every parked item carries an explicit
  re-open trigger or an OBSOLETE marker. Items without one get groomed out.
- Never skip `waiting-acceptance/`. Pushing is the trigger to leave `doing/`;
  user acceptance is the only trigger to enter `done/`.
- If the user hasn't said "done" or "reopen", the item stays in
  `waiting-acceptance/`.
- `done/` is user-accepted work only — the source of truth for "what has
  been delivered", not "what has been merged".

**When to put something in `backlog/` vs `doing/`:** if a thought is
"someday / maybe / depends on X" — it's `backlog/`. If you're starting work
in the next session — it's `doing/`. The grooming pass (an explicit founder
session — see storm2flow's `PLAN-BACKLOG-GROOMING-YYYY-MM-DD.md` precedent)
is what moves items between them.

## Bug Management

- Every bug gets a sequential number: BUG-001, BUG-002, etc.
- Track bugs across three files per the lifecycle above: `docs/doing/BUGS.md` (being implemented), `docs/waiting-acceptance/BUGS.md` (pushed, awaiting user acceptance), `docs/done/BUGS.md` (user-accepted)
- Every bug fix MUST have a corresponding regression test (unit, integration, or E2E)
- Reference the bug number in the test name: `it('BUG-007: <one-line summary>')`
- No recurring bugs — if it's fixed, it stays fixed

## Major Bug Process (Codex + Claude Code consensus)

When a **major bug** is raised (affects a core USP path declared in
`project_config_overview.md`, or has already had a failed fix attempt):

1. **Plan first — do NOT jump to implementation.** Spawn agents to investigate
   root cause and produce a concrete fix plan.
2. **Document the plan in `docs/doing/PLAN-BUG-0XX.md`**. Must include:
   root cause analysis, affected files, the fix approach, tests needed, and
   rollback strategy. Thorough enough for an independent AI reviewer to
   evaluate.
3. **Wait for multi-AI consensus.** The founder will activate both Codex and
   Claude Code to review the plan. **Implementation is NOT authorized until
   both agree and commit to the approach.** If there's disagreement, revise
   the plan until consensus.
4. **Then implement** with the full team of agents, with tests at every gate.

Plan files move with the work: `doing/` while implementing, `waiting-acceptance/` after push, `done/` once the user accepts. They stay as decision records at whichever state the work currently sits in.

Minor bugs (cosmetic, clearly scoped, low-impact) can still be fixed directly
per the normal team workflow below.

## Team Workflow

- Work as a team: spawn specialized agents (backend, frontend, infra, QA, design) via the `Agent` tool with the right `subagent_type`
- Use agents for all non-trivial work — even small bug fixes should be
  delegated rather than quick-fixed inline
- Every bug fix needs a numbered entry in `docs/doing/BUGS.md` + a regression test
- **Minimal reproducer first, two-commit pattern**. Every product or runtime bug fix lands as two commits in this order: `test(BUG-XXX): minimal reproducer (failing)` → `fix(BUG-XXX): <fix>`. The reproducer must fail on the parent commit (verified before pushing). "I added a regression test" is only credible when git log shows the test failing before the fix. Documented exceptions live in [docs/DoD.md](docs/DoD.md) §3.
- Trunk-based development only — no branches, use feature toggles instead
- Run and report test coverage before every commit/push
- **Coverage thresholds** (enforced in the pre-push gate):
  - **Greenfield projects** (started from the blueprint): **≥90%**
    statements + branches on the application + domain layers
    (adapters and generated code excluded).
  - **Brownfield projects** (existing codebase adopted into the
    blueprint): **≥70%** on the same scope, **ratcheted** — never
    let the number drop. New / modified files must hit the
    greenfield 90% bar.
  - The project declares its mode (`greenfield` / `brownfield`)
    and the exact `--coverage` invocation in
    `project_config_dod.md`.
- Never push code over the ratcheted ESLint `--max-warnings` threshold;
  the shared pre-push hook at `.githooks/pre-push` enforces this
- **Always run ESLint and Prettier (`--check`)** in the pre-push
  gate. Lint catches semantic mistakes; Prettier catches style
  drift. Both are blocking. Auto-format locally with
  `npm run format` (or equivalent) before pushing — CI never
  rewrites files on your behalf.

## Test Layers

| Layer | Filename suffix | Lives next to source? | Runs in |
|---|---|---|---|
| Minimal reproducer | sibling of `*.test.{js,ts}` | YES | pre-push |
| Unit | `*.test.{js,ts}` | YES (side-by-side) | pre-push |
| Integration / wire | `*.integration.test.{js,ts,jsx,tsx}` | YES (near subject) | pre-push |
| Data snapshot | `*.snap.test.{js,ts}` | NO (lives in `tests/`) | pre-push |
| Pixel snapshot | project-defined | NO | manual + CI pipeline |
| E2E / acceptance | project-defined | NO (lives in `tests/e2e/`) | CI pipeline |

DOM and layout snapshots live next to the deterministic transform they
pin. A change that ripples across multiple snapshot files is the signal
we want — it surfaces which layer changed.

## Test directory layout

**Unit and integration tests are co-located with the source file
they test**, not stashed in a separate `tests/` mirror. So
`src/domain/rating/decide.ts` is tested by
`src/domain/rating/decide.test.ts` sitting next to it. One test
file per source file when reasonable; multiple small files beat one
giant cross-cutting one.

**Snapshot and E2E tests live separately** under `tests/`
(typically `tests/` root for snapshots, `tests/e2e/` for E2E).
Their diff is a cross-cutting review concern; treating them as
sidebar tests muddies the per-source-file co-location rule.

**Shared test helpers / mocks / fixtures** live under
`tests/helpers/` or `tests/__helpers__/`, never co-located — they
serve multiple tests.

**Tooling consequences:**

- `vitest.config.ts` `include`: both `src/**/*.test.ts` (co-located
  unit/integration) and `tests/**/*.test.ts` (snapshot/e2e).
- `tsconfig.json`: a `src/**/*.ts` glob already includes
  `src/**/*.test.ts`; no separate entry needed.
- If you enforce layering with `eslint-plugin-boundaries` or
  similar, **exclude `src/**/*.test.ts` from the enforcement** so
  tests can import freely across layers (a domain test reaching
  for a fake adapter is normal and good).

## Snapshot tests — approval-based

A snapshot diff is a *change*, not necessarily a *break*. Update snapshots
locally with the project's approve command, commit the updated files,
review the diff in PR. **CI never runs with `-u` / `--update-snapshots`.**
The only path to update a snapshot is local approve + commit + PR review
of the diff. This turns "snapshot changed" into a visible decision instead
of silent re-baseline.

## Pre-push tolerance — 30 s ceiling

The shared pre-push hook at `.githooks/pre-push` must complete in
≤30 s wall-clock on a typical dev laptop.

- Anything slower lives in a `test:slow` target or in the CI pipeline.
- If a test category outgrows the budget, the answer is to move it OUT
  of pre-push, not to weaken the ceiling.

## Quality is non-negotiable

This product's value is the quality of what it delivers. Therefore:

- **Quality is non-negotiable.** If a fix "works" but the approach is
  ugly, brittle, or stitched from overlapping fallbacks, it is not a
  fix — it is a deferred regression. Stop, step back, find the
  solution that belongs in the codebase.
- **Don't chase shortcuts.** Patch-on-patch stacks are a signal the
  architecture is being worked around, not fixed. When you catch
  yourself adding a third fallback layer to compensate for the second
  one compensating for the first, escalate to team + Codex for a
  clean redesign — don't keep patching.
- **Pick the most evolutionary solution.** The right solution is the
  one that the next person (or the next bug) will thank you for. It
  composes well with the existing primitives, it survives adjacent
  changes, and it removes surface area rather than adding it. Pay the
  larger up-front cost when it eliminates a class of problems —
  especially on the core USP paths named in `project_config_overview.md`.
- **Delight the customer.** Acceptance is not "the test passes" — it
  is "the founder and the customer would show this to someone else."
  That's the bar. Anything short of that is unfinished work.

When in doubt between a quick patch and a slower clean rewrite, pick
the clean rewrite. Document why in the plan file and push for team +
Codex alignment before committing.

## Observability is a main concern

**Since quality is non-negotiable, the quality of the working software is
fundamental. The difference between good and bad systems is how quickly
we can find and fix errors when they happen — the speed-to-fix
differential.** Observability is therefore a first-class concern, not an
afterthought.

Four capabilities are non-negotiable for every struct2flow project:

1. **Every error path is captured.** No silent swallowing, no
   default-value fallbacks that hide failures, no `try/catch` that
   returns success. If it broke, it logs.
2. **Every captured error is agent-queryable** without human ferrying.
   The agent has a documented retrieval path (log query, debug route,
   CLI flag — project's choice) and uses it **before** asking the
   founder. Cf. memory `feedback_use_malt_dont_ask_for_logs`.
3. **Every shipped capability is alertable** when it starts failing in
   production. Threshold + destination are declared in
   `project_config_dod.md`.
4. **The agent diagnoses first.** Humans get pinged only when the agent
   can't resolve autonomously — not as the first responder. The agent's
   diagnosis runbook is documented somewhere it can find (CLAUDE.md
   project section, memory entry, or the project's `docs/diagnosis.md`).

The **mechanism** is project-specific — choose one of the three recipes
in [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md):

- **AWS-hosted / serverless** — CloudWatch structured logs + a MALT-style
  admin debug route + CloudWatch alarms → SNS → Slack.
- **Local app / desktop / CLI** — rotating file logs + a `--diagnose` CLI
  flag + a crash-time Slack webhook.
- **Containerized service** — journald or stdout JSON + a log aggregator
  + the same Slack/email alert routing.

The **capabilities** are non-negotiable. The mechanism row goes in
`project_config_overview.md` §"Observability stack" — every project
declares its choice.

## Security is a main concern

**Quality of working software degrades to zero the moment something is
exploited in production.** Security is therefore a first-class concern,
not a checkbox at the end. It lives next to observability — both protect
the working software, just at different timescales.

Four capabilities are non-negotiable for every struct2flow project:

1. **No secrets in code or git history.** `gitleaks` blocks the push;
   if one slips through, the credential is rotated **before** the
   commit is investigated. A leaked secret is compromised the moment
   it lands on `origin`.
2. **Static analysis catches the OWASP top-10 patterns at commit
   time.** Semgrep + the lint security plugins run in pre-push and
   block on `WARNING+` findings. Suppressions need a justification
   comment naming the threat-model entry that makes them safe.
3. **Dependencies and infra are scanned continuously.** `osv-scanner`
   on every push for new CVEs in pinned deps; `trivy config` over IaC
   before any deploy; nightly re-scan catches CVEs that drop *after*
   we shipped.
4. **The agent fixes security findings autonomously when possible.**
   Same pattern as the MALT diagnosis-first rule (§"Observability is
   a main concern"): the agent triages, patches, and verifies before
   pinging the founder — humans get pulled in only for risk-acceptance
   decisions or supply-chain incidents.

The **mechanism** is project-specific — choose one of the three
recipes in [`docs/SECURITY.md`](docs/SECURITY.md):

- **AWS-hosted / serverless** — gitleaks + Semgrep + osv-scanner in
  pre-push; trivy + ZAP baseline in CI; nightly active scan + new-CVE
  watcher.
- **Local app / desktop / CLI** — same SAST + SCA + secret-scan; signed
  releases instead of DAST (no remote surface).
- **Containerized service** — same SAST + SCA + secret-scan; `trivy
  image` blocks vulnerable base images; ZAP against the service's
  HTTP surface.

The **capabilities** are non-negotiable. The mechanism row goes in
`project_config_overview.md` §"Security stack" and the threat model
+ thresholds live in `project_config_security.md` — every project
declares its choice.

## Infrastructure as Code is a main concern

**Quality of working software depends on the environment matching its
definition.** Drift between code and prod is the silent killer of
reproducibility — and reproducibility is what makes "it worked in
staging" meaningful. IaC is therefore a first-class concern, sitting
alongside observability and security at the runtime edge.

Four capabilities are non-negotiable for every struct2flow project:

1. **Everything in prod is defined in code.** No console clicks, no
   out-of-band changes that "we'll codify later." If a resource exists
   in prod and isn't in CDK/Terraform/Helm, it's either imported into
   the IaC tree within the same week or it's deleted.
2. **Every change is reviewable as a diff.** `cdk diff` / `terraform
   plan` / `helm diff` is the artifact reviewers look at, not the
   TypeScript/HCL source. A PR touching `infra/` without that diff
   attached is incomplete.
3. **Environments are reproducible from the same code.** Dev /
   staging / prod are *parameters*, not copy-pasted apps. Spinning a
   new env is one command + one row of config, never a hand-crafted
   sandbox that diverges.
4. **Drift is detected, not assumed away.** A nightly diff/plan job
   alerts on out-of-band changes; the resolution is always "codify"
   or "revert + add an alarm," never "ignore and hope." Drift open
   >24h becomes a `findings.md` entry.

The **mechanism** is project-specific — choose one of the three
recipes in [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md):

- **AWS-first / CDK TypeScript** — struct2flow default. Single CDK
  app, multiple stacks, CodePipeline-driven applies, manual approval
  before prod, CDK Nag + Infracost gating cost + posture.
- **Multi-cloud / portable (Terraform / Pulumi)** — when the project
  ships into customer-managed accounts or stays cloud-agnostic. S3 +
  DynamoDB state/lock, pipeline-only prod-apply, `tfsec` + `infracost`
  gating.
- **Kubernetes-native (Helm + ArgoCD / Flux)** — GitOps. ArgoCD pulls
  cluster state from a branch; PR diff = the plan; `OutOfSync` is the
  native drift detector.

The **capabilities** are non-negotiable. The mechanism row goes in
`project_config_overview.md` §"Infra stack"; the environments,
ownership, drift cadence, cost ceilings, and rollback procedure go in
`project_config_infra.md` — every project declares its choices.

## Code Quality

- Run periodic code reviews using multiple perspectives (reuse, quality, efficiency, junior comprehension)
- Eliminate redundant DB reads — cache data in middleware, don't re-fetch
- Remove dead code: unused imports, parameters, constants, state fields
- Don't duplicate logic — extract shared helpers

## Architecture Principles

- No hardcoded configuration — everything configurable via admin UI and stored in the project's config store
- Keep it simple — don't over-engineer
- **DRY — reuse before you add. Avoid creating unnecessary routes/endpoints,
  modals, or services when an existing one already does the job.** Before
  adding a new API route or UI surface, check whether an existing flow
  covers it. A new route is justified only when no existing path fits;
  say why in the plan. Redundant routes/surfaces are a review-blocking
  finding.
- Preserve user work where applicable; show diffs so users can see exactly what changed

## Blueprint sync (struct2flow framework)

This CLAUDE.md is sourced from the struct2flow **blueprint** at
`~/sources/struct2flow/blueprint/`. Project-specific extensions live in
`project_config_overview.md`, `project_config_paths.md`,
`project_config_dod.md`, `project_config_security.md`, and
`project_config_infra.md` at the repo root.

Sync is driven by a single CLI — `blueprint` — installed by adding the
blueprint's `scripts/` to PATH (or symlinking). The agent uses it
directly; do not hand-roll `diff -ru` invocations.

### Wake-time drift check (mandatory on every fresh session)

```bash
blueprint drift
```

Output: which managed files differ from the blueprint HEAD, plus the
commit log in the blueprint since this project's `.blueprint-source`
bootstrap_sha. Three cases:

1. **Clean** — `blueprint drift` reports `✓ All blueprint-managed files
   match the blueprint HEAD.` → proceed with founder's task.
2. **Drifted** — surface a short summary to the founder ("blueprint has
   N commit(s); files M, P drifted"). Offer to pull. Do **not**
   silently pull — the founder may want to vet a specific change.
3. **Stale blueprint** — `blueprint drift` reports commits ahead but no
   file-level drift (rare; happens if the project already back-propagated
   everything). Bump `.blueprint-source` bootstrap_sha to the new HEAD
   (next `blueprint pull` does this automatically) and proceed.

### Pulling forward

```bash
blueprint pull                # interactive: y/n/quit per file
blueprint pull docs/DoD.md    # single file
blueprint pull --yes          # batch, no prompt (only when founder asks for it)
```

After a non-empty pull, **review with `git diff` and commit in the
project repo**. `.blueprint-source` bootstrap_sha is updated by
`blueprint pull` automatically — don't edit it by hand.

### Back-propagating (apply-to-blueprint)

When you improve a generic rule in a blueprint-managed file (a tighter
DoD wording, a new failure mode, a dispatcher bug fix), **offer to
back-propagate** rather than silently committing only in the project:

> "This change to `docs/DoD.md` §3.4 looks generic — back-propagate to
> the blueprint so other projects inherit it?"

If yes:

```bash
blueprint a2bp docs/DoD.md
```

`a2bp` copies the project's version into the blueprint working tree
(staged, not committed). Then in the blueprint repo: `git diff`, commit,
push. After the blueprint commit lands, re-run `blueprint drift` in the
project to confirm the project matches HEAD again.

**A change is generic** if it would benefit every struct2flow project
(tighter rule, better wording, missing capability). **A change is
project-specific** if it names the project, an internal customer, an
incident specific to this codebase, or a path/URL belonging to this
project. Project-specific edits go in the `project_config_*.md` files,
never back-propagated.

### What blueprint sync covers

The canonical list of synced files is the `MANAGED_FILES` array in
`scripts/blueprint` — run `blueprint files` to print it. If you catch
yourself adding a project-specific incident or path to a blueprint-managed
file, move it to the right `project_config_*.md` before committing.
