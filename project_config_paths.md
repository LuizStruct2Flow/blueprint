# Project Paths — {{PROJECT_NAME}}

All project-specific paths, hosts, URLs, account IDs, and log locations.
Generic struct2flow paths (`docs/`, `.githooks/`, `scripts/`) are in
CLAUDE.md and the blueprint; everything here is unique to {{PROJECT_NAME}}.

## Repository layout

> Top-level dirs the agents need to know about. Keep one line each.

| Path | What lives here |
|---|---|
| `backend/` | |
| `frontend/` | |
| `infrastructure/` | |
| `scripts/` | Project utility scripts (the agent-protocol scripts come from the blueprint) |
| `docs/` | Project documentation, lifecycle-managed (see CLAUDE.md) |

## Local agent state

> Where the agent dispatchers write logs and artefacts on the founder's
> machine. The blueprint defaults to `~/.{{PROJECT_NAME}}/`. Override here
> only if you want a different location.

- Codex run log: `~/.{{PROJECT_NAME}}/codex-runs.log`
- Codex last message: `~/.{{PROJECT_NAME}}/codex-last-message.md`
- Signal trigger log: `~/.{{PROJECT_NAME}}/signal.log`

## Cloud / infra accounts

> AWS / GCP / Azure account IDs, regions, the names of long-lived
> infra-as-code stacks. Public info only — secrets go in env / SSM, not here.

| Stack / account | ID / name | Notes |
|---|---|---|
| | | |

## Pipelines

> CI/CD pipeline names + how to start / approve / monitor each.

| Pipeline | Purpose | How to trigger | How to approve |
|---|---|---|---|
| | | | |

## Customer-facing URLs

> Production / staging hostnames. Agents reference these in release notes
> and verification steps.

- Production: `https://{{PROD_HOSTNAME}}`
- Staging / dev: `https://{{DEV_HOSTNAME}}`

## External integrations

> Third-party services that the product depends on (analytics, email,
> auth, observability). Name the dashboards / consoles the agents should
> check.

| Service | Purpose | Console / dashboard URL |
|---|---|---|
| | | |
