# Development Instructions

This file is the struct2flow **generic** agent protocol. Project-specific
overrides live in `project_config_overview.md`, `project_config_paths.md`,
and `project_config_dod.md` at the repo root. Read those alongside this file.

## Agent Coordination

The agents on this project coordinate through [AGENT_SIGNAL.md](AGENT_SIGNAL.md)
— the slim live "radio over" baton (Holder / State / Task / Last update; history
in `git log`). `Holder` is a **persona name** from the team roster, not a bare
agent type.

- **[AGENT_ROSTER.md](AGENT_ROSTER.md)** — the team (who's who): each persona, its
  role, and its backing agent. This is the DEFAULT setup; each team edits it to fit
  the agents and credits it has.
- **[AGENTS.md](AGENTS.md)** — the coordination protocol: mic states, the ACTIVE-on-claim rule
  (claiming the mic means setting `State = ACTIVE` first), reactivity / Monitor
  setup, and how each backing agent (Codex, Gemini, Copilot) is dispatched/watched.
  Read it before any coordinated work.

Watch the whole team live in one terminal: `bash scripts/agent-activity.sh` streams
a single `[Persona - Backing Agent]` feed. `bash scripts/team-kickoff.sh` runs a
round-robin kick-off to confirm the roster after editing it.

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

## Cost is a main concern

**Working software that quietly bankrupts the founder is broken software.**
Any code path that calls a metered third-party API (LLM, search, OCR,
storage, egress) burns real money on every invocation, and the failure
mode is silent until the bill arrives. Cost is therefore a first-class
concern, encoded in the design — not a number the founder watches
manually.

The pattern that bites: a previously-broken call path gets fixed (good!)
and now processes an unbounded backlog of work that built up while it
was broken. The fix is correct; the absence of a guardrail turns the
correctness into a runaway charge. **Every billable path must be
priced + capped + alertable BEFORE it is wired into a loop.**

Four capabilities are non-negotiable for every struct2flow project with
a billable code path:

1. **Every billable code path declares a budget cap.** Per-call,
   per-batch, per-tick, or per-day — the limit is in code and enforced
   as a hard stop, not a soft warning. Cap reached → halt the loop, do
   not just log. The cap value (in dollars or tokens) is declared in
   `project_config_overview.md` §"Cost stack" alongside the model /
   service it applies to.
2. **Every billable code path logs its actual spend per invocation.**
   Input tokens, output tokens, dollars-or-currency-units, model id —
   all structured so the agent can answer "how much did we spend
   yesterday / this tick / on this source?" without the founder
   ferrying numbers from a vendor dashboard. Cf.
   `feedback_use_malt_dont_ask_for_logs`.
3. **Every billable code path alerts when spend exceeds the cap, or
   when daily spend trends to exceed budget.** Same Slack lane as
   observability alerts; same transition-edge contract — fire once on
   the rising edge, not every tick the cap is still hit.
4. **Backlog-replay paths require explicit opt-in.** "Process
   everything that has piled up since the last successful run" is
   never the default. The founder (or the operator running the CLI)
   types a flag — `--catch-up`, `--first-run`, `--replay-since=…` —
   that says "I have looked at the size of this backlog and I'm
   willing to pay for it." Implicit replay is a defect.

The **mechanism** is project-specific. Typical recipes:

- **LLM-backed agent** — Anthropic/OpenAI token-cost SDK helper,
  per-tick budget gate that halts further calls when cumulative
  spend > cap, structured `{model, input_tokens, output_tokens, usd}`
  log line per call, transition-edge Slack alert when daily cap is
  hit. The freshness gate and dedup store are the upstream defences
  that prevent the call from happening in the first place; the cap
  is the last-line backstop.
- **External API consumer** (Twilio, Stripe webhooks fan-out, etc.) —
  same shape: declared cap, per-call cost logged, alert on transition,
  explicit opt-in for backlog replay.
- **Storage / egress** — per-tick byte budget, structured per-call
  size log, alert on transition, explicit opt-in for large historical
  syncs.

The **capabilities** are non-negotiable. The mechanism row goes in
`project_config_overview.md` §"Cost stack" — every project with a
billable path declares its choice (model + cap + monitoring path +
backlog-replay flag).

A real incident shows the shape: the linkedin-watcher-agent took a
single $10 hit when a fetcher bug fix (BUG-001) unblocked a 374-post
backlog and the freshness gate didn't exist yet (BUG-003). BUG-003
became the canonical capability-#4 instance (explicit opt-in needed
for backlog replay); the freshness gate is enforced before any
billable call. Future projects should design the cap + the explicit-
opt-in flag together, not retrofit them after the first surprise bill.

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

## Documentation is a main concern

**Working software with stale documentation is software no one trusts.**
Customers stop believing the help page; investors stop believing the
deck; new hires can't onboard; agents make wrong assumptions and ship
regressions. Documentation drift is the *silent* failure mode of every
otherwise-healthy project — there's no exception thrown, no alert
firing. Just compounding embarrassment until someone notices.

Two distinct audiences, both non-negotiable:

- **External (customer-facing)** — README, help page, release notes,
  pricing / landing copy, public status page, privacy policy, terms,
  API docs, the way-of-working deck. A user can see / click / read
  the surface change; if the doc disagrees with the running product,
  the doc is wrong.
- **Internal (team-facing)** — feature catalog, acceptance test list,
  findings register, threat model, architecture decision records,
  plan docs. The code's state changed; the artefact that *describes*
  the state must move with it.

Four capabilities are non-negotiable for every struct2flow project:

1. **Every user-facing change touches every external doc in the
   project's sync list, in the same commit.** New feature → feature
   table + release notes + help page in one PR. Removed feature →
   delete from feature table, "Sunset" entry in release notes,
   delete from help page. Same-commit rule is what stops "I'll do
   docs later" from rotting.
2. **Every code-state-changing internal artefact moves with the
   state it describes.** New bug → row in `BUGS.md` *and* the fix
   commit references it. Codex finding fixed → finding block gets
   `Status: Fixed` (not just the backlog row). Threat-model entry
   added → `project_config_security.md` updated *before* the route
   ships.
3. **Every blueprint-level concern change updates the deck + the
   per-concern recipe doc in the same commit.** `docs/way-of-working.md`
   is the canonical pitch surface (§"docs/way-of-working.md is the
   canonical pitch surface" below); drift between deck and rule is
   treated the same as drift between code and prod — and it has
   self-violated twice this week alone. The same applies to the
   per-concern recipe docs (`OBSERVABILITY.md`, `SECURITY.md`,
   `INFRASTRUCTURE.md`, `DOCUMENTATION.md`).
4. **Drift is detected, not assumed away.** Promotion criteria for
   adding a doc to the sync list, a pre-push grep-based drift hint
   for known mismatch patterns (e.g. new route under
   `frontend/pages/` with no entry in `FEATURES.md`), and a
   handoff-time checklist box that refuses the mic flip if any
   sync-list file is stale. Same recipe as security drift, just
   for prose.

The **mechanism** is project-specific — choose one of the three
recipes in [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md):

- **Single-repo README-only** — small projects, internal tools, CLIs.
  Sync list is short: README, RELEASE-NOTES, FEATURES catalog.
- **Static-site marketing + docs** — most struct2flow projects with a
  customer-facing app. Docs in `docs-site/` (Mintlify / Astro Starlight
  / Nextra), customer help + release notes generated from markdown,
  per-page-type sync rules.
- **Customer help portal + public status + privacy/TOS** — mature
  SaaS. Separate `help.html` / `status.html` / `privacy.html` /
  `terms.html`, each with its own sync trigger and editorial owner.

The **capabilities** are non-negotiable. The project's sync list goes
in `project_config_dod.md` §"Doc-sync list" with two tables (Internal /
External), and the per-stack mechanism row goes in
`project_config_overview.md` §"Documentation stack".

## Code Quality

- Run periodic code reviews using multiple perspectives (reuse, quality, efficiency, junior comprehension)
- Eliminate redundant DB reads — cache data in middleware, don't re-fetch
- Remove dead code: unused imports, parameters, constants, state fields
- Don't duplicate logic — extract shared helpers

### Static-analysis audit — SonarQube

Every struct2flow project ships with a SonarQube wiring so the agent
can audit bugs, vulnerabilities, code smells, and coverage without
asking the founder to interpret raw output.

**Files** (synced from blueprint, project-owned after bootstrap):

- `scripts/sonar.sh` — runs `npm run test:coverage` to regenerate
  `coverage/lcov.info`, then invokes `sonar-scanner`. Sources
  `SONAR_TOKEN` + `SONAR_HOST_URL` from gitignored `.env`. Skip
  the coverage regen with `--no-coverage` when you just ran the
  pre-push gate and want to re-upload.
- `scripts/sonar-api.sh` — calls SonarQube's REST API with auth
  from `.env`. Usage: `bash scripts/sonar-api.sh /api/<path>?<query>`.
  The wrapper exists so Claude can query the API without chaining
  the env-load + curl + jq across permission prompts.
- `sonar-project.properties` — projectKey + scanner config. Template
  in the blueprint uses `{{PROJECT_NAME}}`; `new-project.sh`
  substitutes on bootstrap.

**Workflow** (agent-driven, founder rarely opens the UI):

1. **Run the scan.** `npm run sonar` (wraps `scripts/sonar.sh`).
   Auto-creates the project on the SonarQube instance on first
   push if the token has create-on-the-fly privileges.
2. **Triage by severity.** Query via the helper:

   ```bash
   bash scripts/sonar-api.sh "/api/issues/search?componentKeys={{PROJECT_NAME}}&types=BUG&ps=20" | jq '.issues[] | {severity, component, line, rule, message}'
   bash scripts/sonar-api.sh "/api/issues/search?componentKeys={{PROJECT_NAME}}&types=CODE_SMELL&severities=BLOCKER,CRITICAL&ps=20" | jq '.issues[] | {severity, component, line, rule, message}'
   ```

   Priority order: **BUG → BLOCKER/CRITICAL code smell → MAJOR
   code smell → MINOR code smell**. Fix in that order.
3. **Fix or defer with rationale.** Each finding is either:
   - **Fixed** — narrow edit + tests stay green.
   - **Deferred** — commit message names the rule, the count, and
     the reason (e.g. "S7735 negated condition — 17 sites; defer
     until each can be reviewed in context"). Silent deferral is
     a smell of its own.
4. **Re-scan + verify Quality Gate.** `npm run sonar` again, then
   `bash scripts/sonar-api.sh "/api/qualitygates/project_status?projectKey={{PROJECT_NAME}}"`.
   Gate `OK` is the bar; `ERROR` blocks the handoff to the founder.
5. **Per-commit hygiene.** The Sonar gate evaluates "new code
   period" violations independently — touching a line can re-flag
   it even when the rest of the file improves. After each fix
   commit, re-scan and check the gate; if it goes ERROR on new
   violations, address those before moving on.

**Coverage gating.** SonarQube's coverage measure mirrors the
project's `--coverage` reporter — vitest writes `coverage/lcov.info`,
sonar reads `sonar.javascript.lcov.reportPaths=coverage/lcov.info`
(the JS scanner covers both `.js` and `.ts`). The pre-push gate
enforces the same threshold locally; SonarQube is the
post-commit / cross-time-window view (e.g. "did this PR drop
new-code coverage below 80%?").

**Mechanism row goes in `project_config_overview.md`** §"Code
quality stack" — alongside the observability/security/cost/infra
declarations. The mechanism is project-specific (the SonarQube
instance URL, the projectKey, the quality-profile chosen); the
capability is non-negotiable.

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
(staged, not committed). It also prints a class-based ripple checklist
naming every file that has to be touched in the same commit and a
strong reminder pointing at the playbook below.

> **Do NOT open a new prompt in the blueprint repo to "do the docs".**
> The agent doing `a2bp` is the agent who completes the
> back-propagation, from the same session. You already have
> `$BLUEPRINT_ROOT` from `.blueprint-source`; you can `cat`, `edit`,
> and `git -C $BLUEPRINT_ROOT ...` from here. Splitting the work
> across two prompts is exactly how doc-sync slips (the §6.4 rule
> self-violated four times in a single week from this habit).

The full post-`a2bp` procedure — classify the change, walk the
ripples, do the deck dance, commit + push from `$BLUEPRINT_ROOT`,
verify drift closed — lives in [`docs/A2BP_PLAYBOOK.md`](docs/A2BP_PLAYBOOK.md).
The `blueprint a2bp` output points at it and includes class hints for
every file you copied. Read both before touching `git commit`.

**A change is generic** if it would benefit every struct2flow project
(tighter rule, better wording, missing capability). **A change is
project-specific** if it names the project, an internal customer, an
incident specific to this codebase, or a path/URL belonging to this
project. Project-specific edits go in the `project_config_*.md` files,
never back-propagated.

### The blueprint is derived, not designed

The blueprint is a **living operating system**, not a top-down
specification. Its capabilities are admitted only after they have
**proved themselves in a real project**:

1. A project hits a real requirement (a customer ask, an incident,
   a bug that couldn't have been caught by what already existed).
2. The team builds the fix and captures it as a pattern in that
   project's `project_config_*.md` or `docs/` tree.
3. Once the pattern has survived contact with production — typically
   after the next round of bugs has *not* regressed on it — the
   generic core is back-propagated via `blueprint a2bp`.
4. The next project bootstrapped from the blueprint inherits the
   capability as a default.

What this means for the agent:

- **Do not invent capabilities directly in the blueprint.** New
  capabilities land in a project first, prove themselves, then
  travel up. The exception is when the founder explicitly asks for
  a blueprint-level edit (this file, `docs/DoD.md`, the recipe docs,
  etc.) — those are evolutionary improvements based on lessons
  already accumulated.
- **Don't over-engineer the blueprint** trying to anticipate
  every project's future needs. Intentional incompleteness is a
  feature — what the blueprint *does* carry, you can rely on.
- **When proposing a `blueprint a2bp`**, the founder will ask: has
  this pattern actually held up here? "We tightened the rule and
  it worked one time" usually isn't enough; "we tightened the rule
  and the next two bugs in this area didn't regress" usually is.

### What blueprint sync covers

The canonical list of synced files is the `MANAGED_FILES` array in
`scripts/blueprint` — run `blueprint files` to print it. If you catch
yourself adding a project-specific incident or path to a blueprint-managed
file, move it to the right `project_config_*.md` before committing.

### docs/way-of-working.md is the canonical pitch surface

The deck at [`docs/way-of-working.md`](docs/way-of-working.md) is how
struct2flow is presented to customers, investors, hires, and at talks.
**Every change to a blueprint-level concern lands in the deck in the
same commit** — not "I'll update the deck later". The concerns the
deck currently mirrors:

1. Architecture (DDD + Clean + Hexagonal — `STACK_DEFAULTS.md`)
2. Lifecycle (four states — `docs/DoD.md` §1)
3. Quality (DoD — `docs/DoD.md`)
4. Observability / MALT (`docs/OBSERVABILITY.md` + CLAUDE.md §"Observability is a main concern")
5. Security (`docs/SECURITY.md` + CLAUDE.md §"Security is a main concern")
6. IaC (`docs/INFRASTRUCTURE.md` + CLAUDE.md §"Infrastructure as Code is a main concern")
7. Cost (CLAUDE.md §"Cost is a main concern" + `project_config_overview.md` §"Cost stack")
8. Documentation (`docs/DOCUMENTATION.md` + CLAUDE.md §"Documentation is a main concern" + DoD §6.4)
9. Persona team (radio-over — `AGENTS.md` protocol + `AGENT_ROSTER.md` team config + `scripts/agent-activity.sh` live feed)
10. Blueprint sync (this section + README.md §"The sync model" + `scripts/blueprint`)

Tightening a rule in DoD §3? Touch the matching deck slide. Adding a
new principle to CLAUDE.md? New slide(s) under the right section
number. Adding a new CLI to `scripts/`? Update the agent-layer or
sync slide. **Drift between deck and reality reads to a customer the
same way a stale README reads to a new hire** — and the deck is the
pitch surface, so drift is more costly here than anywhere else.

If a change is genuinely internal-only and the deck doesn't need to
mention it (e.g. a typo fix in a comment), say so in the commit
message. Default to updating the deck.
