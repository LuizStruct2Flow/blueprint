# Development Instructions

This file is the struct2flow **generic** agent protocol. Project-specific
overrides live in files at the repo root. They are imported here, so every
session loads them with this file:

- @project_config_overview.md
- @project_config_paths.md
- @project_config_dod.md
- @project_config_security.md
- @project_config_infra.md
- @claude.internal.md
- @CLAUDE.blueprint.md

A project that has not created one of them yet still gets a working session:
Claude Code skips an import whose file is missing. Project rules belong in these
files, never in this one, because a pull replaces this file whole.

**`claude.internal.md` is the project's own file, and nothing in the blueprint
ever writes it.** It is not managed, so `blueprint pull` cannot replace it, and
no bootstrap seeds one — the import above names a file that does not exist until
the project creates it. It is the place for agent context that belongs to this
project rather than to the framework: house rules, local runbooks, notes a
session should carry that no other project should inherit.

**Whether it is tracked is the project's decision.** Commit it and the whole team
gets it; add it to `.gitignore` and it stays on one machine. Nothing in the
framework reads it or depends on the choice. This is what makes the split
possible: the generic protocol can be tracked and public, because the private
half has a home of its own.

**`CLAUDE.blueprint.md` exists only in the blueprint.** It holds the rules for
maintaining the blueprint itself: its trunk, implementing a back-propagation
request, publishing the deck. It does not ship, so in a project the import is
skipped exactly as a missing `claude.internal.md` is, and this file carries only
what operates a project or asks the blueprint for a change (TASK-021).

## Agent Coordination

The agents on this project coordinate through the live baton at
`logs/state/signal.md` — untracked per-checkout state, written only by
`scripts/signal-set.sh`, with the protocol documented in
[AGENT_SIGNAL.md](AGENT_SIGNAL.md)
— the slim live "radio over" baton (Holder / State / Task / Last update; history
in `logs/state/signal-history.log`, appended on every flip). **Do not hand-edit
the baton rows** — one writer publishes the whole baton atomically, so no poller
can sample a half-written state. `Holder` is a **persona name** from the team
roster, not a bare agent type.

- **`AGENT_ROSTER.md`** — the team (who's who): each persona, its role, and its
  backing agent. **Per-engineer and gitignored, on the `.env` model**: the tracked
  template is [AGENT_ROSTER.example.md](AGENT_ROSTER.example.md); you copy it once
  (`cp AGENT_ROSTER.example.md AGENT_ROSTER.md`) and edit your copy. Each engineer
  runs a different fleet — different agents, subscriptions and quotas — so the live
  roster is neither shared nor overwritten by a blueprint sync. The `Backing agent`
  column is free text (Claude Code, Codex, Gemini, Copilot, Qwen, …); only
  autonomous dispatch needs a matching signal watcher.
- **[AGENTS.md](AGENTS.md)** — the coordination protocol: mic states, the ACTIVE-on-claim rule
  (claiming the mic means setting `State = ACTIVE` first), reactivity / Monitor
  setup, and how each backing agent (Codex, Gemini, Copilot) is dispatched/watched.
  Read it before any coordinated work.

Watch the whole team live in one terminal: `bash scripts/agent-activity.sh --daemon`
then `tail -F logs/agent-activity.log` streams
a single `[Persona - Backing Agent]` feed. `bash scripts/team-kickoff.sh` runs a
round-robin kick-off to confirm the roster after editing it.

### On wake — the primary session is the Orchestrator (do this first)

The Claude Code prompt the founder talks to **directly** (not a spawned persona) is
the **Orchestrator**. The moment you wake as this session, before anything else:

1. **Adopt the Orchestrator persona — read its name from the roster, do not
   assume it.** The name is the `Name` cell of the `Orchestrator` row in
   [AGENT_ROSTER.md](AGENT_ROSTER.md); `bash scripts/agent-activity.sh --whoami`
   prints it along with the roster it came from. That roster is per-engineer and
   gitignored, so **no two fleets share persona names** and any name written here
   would be wrong for someone. Your `Holder` on the live baton is that name;
   handoffs to you are `OVER_TO_<NAME>`. The feed resolves the same row by
   itself — `AGENT_PERSONA` is an override for spawned personas, not something
   the Orchestrator needs to set (BUG-010: it used to be the *only* thing that
   worked, which made renaming a persona appear to do nothing).
2. **Ensure the live team feed is running.** Run
   `bash scripts/agent-activity.sh --daemon`. This is *"ensure running"*, not
   *"run"*: it is idempotent **per repository** — the lock lives at
   `$BP_STATE_ROOT/logs/.agent-activity.lock`, so a second call in this project
   is a no-op, while each project you have checked out legitimately runs its own
   supervisor (so `pgrep -af agent-activity.sh` showing several is normal, and
   counts them across repositories rather than within one). It returns
   immediately. It cleans the activity log and streams the one
   `[Persona - Backing Agent]` feed of every agent's work. **Watch it with
   `tail -F logs/agent-activity.log`** — the feed does not open a terminal for
   you. Stop it with `--stop`; check with `--status`.

   > Spawned, non-primary personas must **not** start it. Every-wake spawning is
   > what turned a broken idempotency guard into BUG-001 (load 175 for 2.7 days).
3. **Arm the wake-time Monitors.** Reactivity is a `Monitor`, not a habit of
   remembering to look:

   - **The mic** (generic, every project) — watch `logs/state/signal.md` and emit on
     any change to `Holder` / `State`. Without it you discover a dispatched
     agent has finished only when the founder tells you, which turns every
     hand-off into a manual poll. Emit on **every** state change, not just
     `OVER_TO_<you>`: a watcher that only matches the happy path is silent
     when a dispatch dies.
   - **Whatever `project_config_paths.md` §"Wake-time Monitors" declares** —
     cross-stream exchange boards, shared queues, anything a second stream
     writes that nothing else will notify you about.

   Both are `persistent: true` and must emit **only on change**. A raw tail is
   noise, and a monitor that floods gets muted — which leaves you exactly as
   blind as having none.
4. **Then orchestrate** the roster — dispatch the Codex/Gemini personas, spawn / hand
   off to the other Claude personas, integrate their work.

A **spawned, non-primary** Claude session does the opposite: it adopts the persona
it was assigned, and does NOT re-run these orchestrator steps (the feed is already
up; it just participates).

## Running commands — one per call, chains only when dependent

**Every command goes in its own call. Do not join independent commands with
`;`, `&&`, or `||`.** Chain only when the commands are *fully dependent* — when
the later one operates on what the earlier one produced and is meaningless
without it (`mktemp` and then writing to that path; `fetch` and then reading the
fetched ref). A pipeline passes that test by construction: a filter cannot run
without its producer.

Commands that merely happen to run one after another are not a chain. Issue them
as separate calls — in parallel when none depends on another, which is faster
than sequencing them anyway.

**This is a permission rule, not a style preference.** `.claude/settings.json`
grants permission per command *pattern*. A compound string is matched as a single
unit, so a permissive early pattern silently carries everything joined to it: a
`cd` followed by four unrelated commands is reviewed as a `cd`. That collapses
one decision per command into one decision per blob, and it defeats the `deny`
list by the same mechanism. An allowlist is only worth the granularity it is
actually consulted at.

**The dependency test does not license wrapping.** A pipeline whose filter is
genuinely dependent still must not be built around a command in a way that stops
it matching its own allowlist entry — run the command, then filter its output.
Wrapping a command until its permission pattern no longer applies is *routing
around the prompt rather than asking*.

If a command is not on the allowlist, ask for it to be added, or run it plainly
and let the prompt happen. Both are correct; disguising it is not.

**This is enforced, not merely written down.** `scripts/no-chain-guard.sh` is a
`PreToolUse` hook on `Bash` that blocks `&&`, `||` and `;` and permits pipes.
It exists because the rule above lived here for weeks while an agent broke it
through an entire session believing it was complying, and the founder had to
correct it three separate times. A rule that must be remembered at the moment
the author is busy is the wrong shape of fix — the same conclusion BUG-004
reached about "flip the mic last" and BUG-014 about fixture isolation. Ported
from the peer stream rather than re-derived.

Two consequences to work with rather than around:

- **Agent scratch lives in the project, in `.scratch/`** (gitignored, and
  `export-ignore`d so it cannot reach a derived project). Out-of-project scratch
  needs a directory *grant* to be reachable; in-project scratch needs none — so
  this **removes** a permission rather than adding one, which is the half worth
  having. `/private/tmp` was dropped from `additionalDirectories` for exactly
  that reason.
- **The guard matches operators inside quoted text**, including heredoc bodies
  and string literals — a commit message or a Python snippet containing `;`
  trips it. So write the content to `.scratch/` with the Write tool and then run
  or reference the file: `git commit -F .scratch/msg`, `python3 .scratch/x.py`.
  The file is reviewable, which is better practice anyway. This repo has the same
  class of false positive in its deny list already: `Bash(* --no-verify*)` blocks
  a task string that merely *discusses* `--no-verify`.

**The distinction that decides where temp files go** is not "is it temporary?"
but **"would being inside a git tree break this?"**. Agent scratch — drafts,
fixtures, snippets — goes in `.scratch/`. A *tooling workspace* that a tool will
walk (a scratch clone, a worktree, a hermetic build root) must be outside any
git tree, is created with `mktemp -d` by the code that needs it, and is that
code's responsibility to remove on every exit path. `a2bp`'s scratch clone is
the worked example of the second kind.

The concrete instance of this rule for `blueprint drift` is in §"Wake-time drift
check (mandatory on every fresh session)".

## Before Every Push

The pre-push gate (`.githooks/pre-push`) blocks a failing push, and CI is the
backstop. What it expects of you — never `--no-verify`, the lint ratchet, where
project guards go — is [docs/DoD.md](docs/DoD.md) §4.

## Definition of Done — read before every handoff

[`docs/DoD.md`](docs/DoD.md) holds the lifecycle, the work-intake rules, bug
management and the handoff checklist. Walk its §7 before flipping the baton.

## Documentation Structure

```
docs/
├── DoD.md                ← Definition of Done (read before every handoff)
├── config/               ← stable reference (FEATURES.md, ACCEPTANCE_TESTS.md, findings.md)
├── backlog/              ← parked work (KEEP / DEFER / OBSOLETE)
├── doing/                ← active work (BUGS.md, BACKLOG.md, PLAN-*.md, HANDOVER.md)
├── waiting-acceptance/   ← landed on main, awaiting founder acceptance
├── done/                 ← founder-accepted work
├── requirements/         ← cross-cutting specs referenced by several plans
└── mocks/                ← design mockups and throwaway prototypes
```

How an item moves between those folders is [docs/DoD.md](docs/DoD.md) §1, and
bug numbering, regression tests and the plan-first process for a major bug are
§2.

## Team Workflow

- Work as a team: spawn specialized agents (backend, frontend, infra, QA, design) via the `Agent` tool with the right `subagent_type`
- Use agents for all non-trivial work — even small bug fixes should be
  delegated rather than quick-fixed inline
- **Commits:** the subject starts with the item it serves (`BUG#20:`,
  `FEATURE#3:`, `TASK#1:`), one item per commit, and the body says why
  ([docs/DoD.md](docs/DoD.md) §1b rules 1 and 3). `.githooks/commit-msg` refuses
  any other subject.
- Trunk-based development: a maintainer pushes to `main` and uses feature
  toggles, not branches. An external contribution is a pull request, which for
  the blueprint is what `blueprint a2bp` files (§"Back-propagating").
- Test layers, reproducer-first bug fixes, snapshots and the release tier:
  [docs/DoD.md](docs/DoD.md) §3. Coverage thresholds are the project's, in
  `project_config_dod.md`.

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

A real incident shows the shape: the linkedin-watcher-agent took a <!-- a2bp-allow: historical incident record; the blueprint names this project deliberately as the worked example and already carries this line verbatim — substituting the placeholder here would make every project claim the incident -->
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
  API docs, pitch decks. A user can see / click / read
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
3. **Every rule change updates every document that restates the rule,
   in the same commit.** A rule restated in a recipe doc, a runbook or a
   pitch deck drifts from the rule exactly as prod drifts from code, and
   is treated the same way.
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
  pre-push gate and want to re-upload. SonarQube has no shell analyser, so
  it also runs ShellCheck over the files the gate lints and imports the
  findings as external issues (`external_shellcheck:SC…`); SC2317 is left
  out. Files under a dot-directory such as `.githooks/` are never indexed by
  the scanner, so their findings stay with the gate's ShellCheck stage.
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
`~/sources/struct2flow/blueprint/`. Project-specific extensions live in the
five `project_config_*.md` files at the repo root, imported at the top of this
file.

Sync is driven by a single CLI — `blueprint`. Its per-machine command is
written by `bash scripts/install-toolchain.sh` and runs the CLI of the project
you are standing in, so it names no checkout. The agent uses it directly; do
not hand-roll `diff -ru` invocations.

### Wake-time drift check (mandatory on every fresh session)

```bash
blueprint drift
```

**Run it exactly like that — one plain command, not wrapped.** Do not build
`(command -v blueprint >/dev/null && blueprint drift || bash scripts/blueprint
drift) | tail -40` or any variant. The allowlist grants `Bash(blueprint *)`; a
compound wrapper does not match that pattern, so wrapping it is *routing around
the permission prompt rather than asking* — which is the founder's standing rule,
not a style preference. If `blueprint` is not on PATH, run
`bash scripts/blueprint drift` as its own command and fix the PATH afterwards.

In the blueprint repo itself there is no `.blueprint-source` — it is the source —
and `drift` reports exactly that and exits 0 (BUG-007). It still arms the gate,
and it still reports whether the checkout is behind its own remote.

Output: which managed files differ from the blueprint, plus the
commit log in the blueprint since this project's `.blueprint-source`
bootstrap_sha. The blueprint is read **by its address** — `blueprint_remote`,
fetched fresh on every run — never from a local folder, so the header names the
remote, the branch and the full SHA it compared against. The one exception is an
exported `BLUEPRINT_ROOT`, and then the header says `LOCAL CHECKOUT …
(BLUEPRINT_ROOT override)`. Four cases:

1. **Clean** — `blueprint drift` reports `✓ All blueprint-managed files
   match the blueprint HEAD.` → proceed with founder's task.
2. **Drifted** — surface a short summary to the founder ("blueprint has
   N commit(s); files M, P drifted"). Offer to pull. Do **not**
   silently pull — the founder may want to vet a specific change.
3. **Stale blueprint** — `blueprint drift` reports commits ahead but no
   file-level drift (rare; happens if the project already back-propagated
   everything). Bump `.blueprint-source` bootstrap_sha to the new HEAD
   (next `blueprint pull` does this automatically) and proceed.
4. **Unreachable** — non-zero (exit 5), and it says so: `could not read the
   blueprint … This is NOT a clean drift report`. Tell the founder the drift
   check did not run. Do **not** report the project as in sync.

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

`a2bp` pushes a branch to the blueprint's remote and opens a pull request
against it. It writes into no working tree — not yours, not the blueprint's —
and it lands nothing.

**It carries files outside the managed set too (TASK-037).** A path the blueprint
does not ship (`templates/`, a blueprint-only doc) is proposed as a change to it,
and a path the blueprint does not have is proposed as a new file. Both go through
the same guard and the same PR, and each is marked **not shipped** in the output
and in the PR body, so the reviewer judges it as a blueprint-only change. A new
file has no base to align against, so nothing in it is restored: a literal
project name blocks until you write `{{PROJECT_NAME}}` or justify an
`a2bp-allow`. What `a2bp` refuses before contacting the remote: a path outside
the project, a symlink or a path under a symlinked directory, anything inside a
`.git` directory, a root `project_config_*.md` in any letter case (that is the
blueprint's own config), a file named like a secret (`.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`,
`id_ed25519*`, `*.p12`, `*.pfx`), and any file, managed or not, in which
`gitleaks` finds a secret. A missing `gitleaks` **refuses the request**, unlike
the pre-push gate, which skips it: the gate's skip keeps unscanned bytes on your
machine, while `a2bp` pushes a branch to the blueprint's remote, and CI scanning
the pull request afterwards can refuse the merge but cannot un-disclose it
(BUG-127). Install it with `bash scripts/install-toolchain.sh`. A scanner that
cannot run — one too old for `gitleaks dir`, for instance — is reported as an
incomplete scan rather than as a found secret, and blocks either way. After
fetching, and before pushing anything, it also refuses an unmanaged path the
project gitignores (tracked or not), because the managed set is what the fetched
base ships, and a new path that differs
from a blueprint path only by letter case. A request that is not yet a file change goes in
`docs/backlog/feature-requests.md` in the blueprint.

It used to `cp` the file straight into the blueprint working tree, which made
every derived project a writer to the generic blueprint. That is the mechanism
by which **BUG-002** and **A-09** fanned out to every project on their next
pull, and it is why the write path is gone rather than merely guarded.

**Be precise about what that guarantees, because the obvious reading is wrong.**
"Lands nothing" is a property of **this command's behaviour**, not a boundary the
repository enforces. Two things are true at once:

- `a2bp` pushes only to `a2bp/<project>/<hash>` and never to `main`, opens a PR,
  and has no verb that merges. Nothing it does can land a change.
- **A derived project is not otherwise prevented from writing to the blueprint.**
  Filing a request needs push access to the blueprint remote, and in the
  same-owner setup every agent authenticates as the owner — typically with admin
  rights and `enforce_admins: false`, so branch protection's PR requirement does
  not apply to it. An agent that runs plain `git push` instead of `a2bp` reaches
  `main` directly.

So the discipline is **a convention that `a2bp` implements**, not a wall. It
cannot be fixed with repository settings while every agent shares one identity:
no ruleset can distinguish a derived project's agent from the owner when they
present the same credential. Enforcement needs a *separate, narrower credential*
(or a fork), which is a deliberate future step and not today's model — see
`project_config_paths.md` §"Back-propagation trust boundary".

Do not write, or rely on, the claim that a derived project *cannot* write into
the blueprint. It can. What is true is that `a2bp` does not, and that landing a
change still requires a human to merge a PR.

The command needs `config_version = 2` in `.blueprint-source`:

```
config_version           = 2
blueprint_remote         = git@github.com:<owner>/<blueprint>.git
blueprint_branch         = main
blueprint_release_branch = released
```

`blueprint_branch` is where requests are filed; `a2bp` never reads
`blueprint_release_branch`. That optional field is the branch `drift` and `pull`
read — `released`, which the blueprint's CI fast-forwards to the newest `main`
commit on which every job passed. Without it they read `blueprint_branch`.

A version 1 config (no `config_version`) refuses and prints those lines. The
remote is **never inferred** from the local checkout's `origin`: that would be
right often enough to be trusted and silently wrong for anyone whose checkout
tracks a fork, and pushing a request to the wrong repository is not a
recoverable mistake.

Useful shapes:

```bash
blueprint a2bp --dry-run docs/DoD.md   # resolve the base, show the diff, push nothing
blueprint a2bp docs/DoD.md             # file the request
blueprint prs                          # what is currently asked of the owner
```

**Exit statuses are distinct, and filing is deliberately non-zero** — filed is
not landed, and no script may read "PR opened" as "the blueprint has this":
`0` dry-run clean, `3` filed and awaiting a decision, `4` a guard refused
(nothing filed), `5` operational failure, `6` nothing to request.

**`3` means a PR actually exists.** A pushed branch with no PR opened — because
`gh` is missing, unauthenticated, or the call failed — is `5`, not `3`
(BUG-011). The distinction is the whole value of the code: `3` promises a
reviewer now has something in front of them, and a run that returns it while
nothing was filed has told every caller something false. `a2bp` says so
explicitly in that case and names the branch to open a PR from by hand.

**A back-propagation is a REQUEST, not a delivery.** What travels upstream is a
proposal that an improvement proved itself downstream; the blueprint owner then
**implements it in the blueprint** — merging it as-is, adapting it, or rewriting
it. This is the same rule the repo already applies to spikes ("*re-implemented*
… never `mv`'d wholesale from the spike folder", §"Documentation Structure").
Nothing merges it automatically, and filing it is not integrating it: the
blueprint's own rules for that decision live in the blueprint.

**Propose what has held up.** The blueprint is derived, not designed: a
capability is admitted after it proved itself in a real project. "We tightened
the rule and it worked one time" usually isn't enough; "we tightened the rule
and the next two bugs in this area didn't regress" usually is.

**It is guarded (A-07), and the guard is now advisory.** Before a request is
filed, `a2bp` restores `{{PROJECT_NAME}}` on the lines a positional diff against
the **fetched base** proves unchanged, then scans **every** staged line for host
home paths, literal per-project state dirs, and any project name that survived.
Findings stop the request and exit non-zero.

Advisory *with respect to the blueprint*, not toothless with respect to you: it
no longer decides what reaches the blueprint, because a person does. That is why
**there is no `--force`**. It existed to waive the guard and copy anyway, which
was coherent while a2bp landed bytes; now the reviewer is the override. A finding
has exactly two answers — fix it, or mark the line with a justified
`a2bp-allow: <why it is safe>`. If the guard is wrong, that is a bug in
`contamination.sh` and gets fixed as one. Passing `--force` is refused loudly
rather than ignored.

The promise is deliberately narrow: on the **default path** a recognized finding
cannot be filed. It is *not* a claim that contamination is impossible — the scan
is heuristic, and `a2bp-allow` plus the NOTICE class let things through by
design. One property holds unconditionally: staging never changes the file's
meaning under substitution, and that is asserted rather than assumed.

**A known cost, stated because it is deliberate:** every staged line is scanned,
including lines identical to the base. The alignment-derived exemption was
removed (A-07 R4-F2) because it was the one path by which a misattributed line
could wave contamination through. So a project named after a common word blocks
on its own generic prose and needs an explicit `a2bp-allow`. That is the price
of having no laundering path.

The restore is **alignment-based, not a search-and-replace** — there is no
general textual inverse of the substitution, and no content-based shortcut
either. `pull` replaces an unambiguous token; reversing would replace a bare
word that also occurs in prose (for a project named `blueprint`, every
occurrence). Matching on line content fails the same way one level up. So
lines you edited are left alone, and if one still carries the project name the
guard blocks and you write the placeholder explicitly. Mark a known-benign
line with an inline `a2bp-allow: <why it is safe>` comment — the justification
is required. This guard exists because `a2bp` is how **BUG-002** and **A-09** got
into the blueprint — an unguarded upstream door means one project's specifics
fan out to every other project on their next pull.

**One constraint the request flow adds.** The branch carries your project's name
so a reviewer can see whose request it is, and the name is never slugged into
something valid — a slug that differs from the real name destroys exactly the
provenance the branch exists to carry. So a project whose directory basename
cannot be a git ref component (`foo\bar`, `x*y`) can file no request at all, and
is told so explicitly. Rename the directory, or make the change in the blueprint
directly.

**The ripples are the implementer's, not the requester's.** Deciding which
blueprint documents travel with a change is part of implementing it in the
blueprint, with the blueprint's whole tree in front of you. Filing a request does
not put you on the hook for the blueprint's doc-sync.

See what is currently asked of the blueprint owner with `blueprint prs`. It
reports drafts and closed-but-branch-present distinctly, and on a `gh` API
failure says the list is **incomplete** rather than printing an empty one that
reads as "nothing pending".

**A change is generic** if it would benefit every struct2flow project
(tighter rule, better wording, missing capability). **A change is
project-specific** if it names the project, an internal customer, an
incident specific to this codebase, or a path/URL belonging to this
project. Project-specific edits go in the `project_config_*.md` files,
never back-propagated.

### What blueprint sync covers

Nobody keeps a list of synced files. The managed set is **derived**: every file
the blueprint's `git archive` ships at the commit sync reads, minus the
project-owned seeds (`TEMPLATE_FILES` in `scripts/blueprint`), so bootstrap and
pull deliver the same set and `.gitattributes` alone decides what ships
(TASK-021). Run `blueprint files` to print it. If you catch
yourself adding a project-specific incident or path to a blueprint-managed
file, move it to the right `project_config_*.md` before committing.

### Your project's `.gitignore` is yours (TASK-048)

`.gitignore` is seeded at bootstrap and is **not** managed, so a
blueprint change to it reaches NEW projects only. A project bootstrapped before
2026-09-16 still excludes the framework's own documents, and every doc link into
them is dead in a clone. To adopt the change:

1. Delete these six lines from your `.gitignore`: `/CLAUDE.md`, `/AGENTS.md`,
   `/AGENT_SIGNAL.md`, `docs/DoD.md`, `docs/PUBLISHING.md`,
   `docs/doing/HANDOVER.md`.
2. Run `git status`. Some of them may already be tracked — a project that
   force-added one keeps it — so "nothing changed" here is a legitimate
   outcome and not a failure.
3. Track whatever is still untracked:

```bash
git add CLAUDE.md AGENTS.md AGENT_SIGNAL.md \
        docs/DoD.md docs/PUBLISHING.md docs/doing/HANDOVER.md
```

Keep `project_config_*.md` ignored — A-27 put the threat model and the infra
account IDs there. If your copy of any of the six has **diverged** from the
blueprint's — a locally edited `AGENTS.md`, say — tracking it publishes that
divergence: run `blueprint drift` and reconcile first, not after. And if you
publish this repo publicly, re-read `docs/PUBLISHING.md` first: its preflight
and its allowlist changed with this.

**`.claude/settings.json` is managed, but a project's own permission rules are
not lost.** Put them in `.claude/settings.project.json`: it is tracked and
project-owned, and it holds only `permissions.allow`/`ask`/`deny`/`additionalDirectories`.
`blueprint pull` lands `settings.json` as the blueprint's file with those lists
merged in, and `drift` compares that merged result. The blueprint's `ask` and
`deny` always win: a project `allow` naming one is dropped, so a rule the
blueprint tightened (BUG-118) cannot be re-allowed from a project. Never
hand-edit `settings.json` for a project rule — the next pull refuses it until
the rule moves to the project file (TASK-042).
