# Project Overview — {{PROJECT_NAME}}

Project-specific overview. CLAUDE.md and docs/DoD.md hold the **generic**
struct2flow agent protocol; this file holds what's specific to
{{PROJECT_NAME}}.

## What this project does

> One paragraph. Customer problem, core USP, the verbs the product owns.
> Avoid marketing copy — agents read this to make scope decisions.

## Core USP paths

> List the code paths / user journeys where "quality is non-negotiable"
> (CLAUDE.md §Quality, DoD §6). Anything that breaks here is a major bug
> by definition — plan first, no quick patches.
>
> Examples (delete and replace):
> - Signup / login
> - Core generate path (the main thing the product does for the customer)
> - Export / share
> - Edit / save flows

## Agents in use

> Which dispatchers are wired up for this project. The blueprint assumes
> Codex + Claude Code; list specialists / subagents the project uses
> beyond that.

- **Codex** (CLI dispatcher, signal-driven — see CLAUDE.md "Dispatching Codex")
- **Claude Code** (this assistant)
- Optional: list any specialist subagent_types you rely on
  (`Explore`, `Plan`, `claude-code-guide`, …)

## Tech stack

> One block per major surface. Keep concise — paths and runtimes, not
> exhaustive dependency lists. Defaults live in
> [`STACK_DEFAULTS.md`](STACK_DEFAULTS.md) — fill the rows below with the
> ACTUAL stack chosen for this project; if any row differs from the
> default, add a one-sentence rationale.

- **Backend:** {{language}} / {{framework}}, runs on {{runtime}}
- **Frontend:** {{language}} / {{framework}}, served via {{server}}
- **Infrastructure:** {{IaC tool}}, deploys to {{cloud}}
- **CI:** {{pipeline}}
- **Data:** {{databases / stores}}

## Observability stack

Implements the blueprint's §6.1 observability rule (CLAUDE.md
§"Observability is a main concern"). The four capabilities are
non-negotiable; the mechanism below is this project's choice. Pick a
recipe from [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) and fill in
the rows.

| Capability | Mechanism in this project |
|---|---|
| Error capture (backend) | {{e.g. CloudWatch structured JSON logs via shared `logger` module / rotating file logs in `~/.{{PROJECT_NAME}}/logs/` / journald JSON}} |
| Error capture (frontend) | {{e.g. `/api/client-errors` Lambda / `electron-log` to main-process logger / N/A (no frontend)}} |
| Agent-readable retrieval (MALT) | {{e.g. `GET /api/admin/debug/last-failures?since=30m` + `aws logs filter-log-events ...` / CLI `{{PROJECT_NAME}} --diagnose --last 20`}} |
| Alert routing | {{e.g. CloudWatch alarm errors>N/5min → SNS topic `arn:...` → Slack `#alerts-prod` / Slack webhook from `project_config_paths.md` on crash}} |
| Alert thresholds | {{e.g. error rate > 5/min for 5min; p99 latency > 2s for 10min — declare per service}} |
| Diagnosis runbook | {{path — e.g. CLAUDE.md "Project-specific diagnosis" section / `docs/diagnosis.md` / memory entry name}} |
| Product analytics | {{e.g. Plausible site ID `myapp.com` + dashboard URL / N/A (local app)}} |

**Reminder:** the agent uses the "Agent-readable retrieval (MALT)" entry
before asking the founder to paste logs (per memory
`feedback_use_malt_dont_ask_for_logs`).

## Domain glossary

> Project-specific terminology the agents need to use correctly. Avoid
> renaming things mid-codebase by guessing.

| Term | Definition |
|---|---|
| | |

## Customer-reference policy

> If user-facing surfaces have rules about naming customers / projects,
> declare them here. Example (storm2flow): no internal customer names on
> any public page; describe capabilities generically. (Generic version
> in docs/DoD.md §5.)
