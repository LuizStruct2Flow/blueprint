# struct2flow Stack Defaults

When a project doesn't say otherwise, this is the stack. Each project's
own `project_config_overview.md` + `project_config_paths.md` may
override per surface — but state **why** in one sentence so it's a
deliberate decision, not drift.

## Architecture

- **Style:** Domain-Driven Design (DDD) + Clean Code + Clean
  Architecture. Hexagonal (ports & adapters) whenever the surface
  warrants it — i.e. anything with non-trivial external integration
  (DB, HTTP, queues, third-party APIs). Pure utilities and one-shot
  scripts don't need ports.
- **Why:** keeps the domain pure and testable, makes adapter swaps
  (DynamoDB → Mongo, REST → GraphQL, sync → event-driven) a
  bounded change instead of a rewrite, and pushes infrastructure
  concerns to the edges so the core remains framework-agnostic.
- **Layering** (inside → out): `domain` (entities, value objects,
  domain services — no framework imports) → `application`
  (use-cases / interactors orchestrating the domain) → `ports`
  (interfaces the application depends on) → `adapters`
  (infrastructure implementations of the ports — DB, HTTP, AWS
  SDK, etc.). Dependencies only point inward.
- **Override:** if a project's surface is genuinely a thin CRUD
  wrapper or a one-shot script, full hexagonal is overkill — say
  so in `project_config_overview.md` with one sentence. Default
  assumption is hexagonal.

## Backend

- **Language / runtime:** Node.js / TypeScript.
- **Compute:** AWS Lambda (serverless-first). Reach for ECS / Fargate
  only when Lambda's 15-min ceiling, cold-start, or package-size limits
  bite.

## Frontend

- **Language:** TypeScript.
- **Framework:** React or Next.js — project's choice, document in
  `project_config_overview.md`.
- **Hosting:** AWS Amplify Hosting.

## Data

- **Default:** DynamoDB (key-value / single-table design).
- **Alternative:** MongoDB — pick when the access pattern needs
  ad-hoc query + flexible secondary indexes that DynamoDB can't model
  cleanly.
- **Avoid by default:** RDS / Aurora unless the workload is genuinely
  relational and the SQL semantics are load-bearing.

## Infrastructure

- **IaC:** AWS CDK (TypeScript).
- **Cloud:** AWS.
- **Posture:** serverless-first — Lambda + DynamoDB + API Gateway +
  Amplify Hosting + EventBridge before anything that runs 24/7.

## CI / Remote repo

- **Remote git:** AWS (CodeCommit). GitHub is the fallback when a
  project needs public visibility or external contributors.
- **Pipelines:** AWS CodePipeline + CodeBuild when the repo is on
  CodeCommit; GitHub Actions when the repo is on GitHub.

## Observability

The four non-negotiable capabilities (capture, agent-query, alert,
agent-diagnose-first) are defined in CLAUDE.md §"Observability is a main
concern" and DoD §6.1. The mechanism is project-specific — pick one of
the three recipes in [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md):

- **AWS-hosted / serverless (default for hosted projects):** CloudWatch
  structured JSON logs + a MALT-style admin debug route
  (`/api/admin/debug/last-failures`) + CloudWatch alarms → SNS → Slack.
  Frontend errors captured via a tiny `/api/client-errors` Lambda. No
  Sentry — the agent-led triage model makes a separate error UI
  redundant; Slack covers alerting and the agent reads CloudWatch
  directly.
- **Local app / desktop / CLI:** rotating file logs under
  `~/.{{PROJECT_NAME}}/logs/` + a `--diagnose` CLI flag the agent runs +
  desktop notification + Slack webhook on crash. Used in
  `linkedin-watcher-agent`.
- **Containerized service:** JSON to stdout + the platform-native log
  aggregator (CloudWatch for ECS / Loki or Elastic for k8s / journald
  for Docker-on-VM) + an admin route wrapping the aggregator's query
  API + platform-native alarms → Slack.

Each project declares its mechanism row in `project_config_overview.md`
§"Observability stack" — that table is the agent's first stop when it
needs to diagnose a production error.

**Product analytics (separate from error observability):** Plausible,
EU-hosted, cookie-free. The agent reads usage data via the Plausible
Stats API.

## Git author identity (fresh-clone bootstrap)

The founder's machine has a **work** git identity set globally
(e.g. `*.ext@<employer>.de`). That email must NOT appear in
personal struct2flow project history — it conflates work
identity with personal open-source work and risks corporate
IP-assignment ambiguity if the repo is ever published.

**Default personal identity for struct2flow projects:**

- **Name:**  `Luiz Scheidegger`
- **Email:** `luiz@struct2flow.com`

**On fresh clone / new project bootstrap, before any commit:**

```bash
git config user.email "luiz@struct2flow.com"
git config user.name  "Luiz Scheidegger"
```

Use repo-local (`git config`, NOT `--global`) so work repos keep
their own identity. The `new-project.sh` bootstrap script should
set this automatically once; until then, an agent's first action
on a fresh personal repo is to set + verify the identity.

**If commits already exist under the wrong email**, rewrite with
`git filter-branch --env-filter` (or `git filter-repo`) after
creating a backup ref. Always keep the backup ref reachable until
the founder confirms the rewrite looks right, then drop it.

**Override:** if a struct2flow project is genuinely a work
project (client engagement, employer-sanctioned), use that
employer's email — state so in
`project_config_overview.md`.

## When to override

Override is normal. The default exists so that "new project, no
constraints, pick a stack" lands the same place every time and the
founder doesn't re-decide. If a project's customer, integration
target, or workload type makes a different choice obviously better
(e.g. a Python ML project; a deeply-relational app; an existing
codebase to extend), override it and write a single-sentence rationale
in the project's `project_config_overview.md` tech-stack block.
