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

## Cost stack

Implements the blueprint's cost rule (CLAUDE.md §"Cost is a main
concern"). The four capabilities are non-negotiable; the mechanism
below is this project's choice. Fill one row per billable code path
(LLM, paid external API, metered storage / egress).

| Billable path | Service / model | Budget cap | Per-call spend log | Cap-breach alert | Backlog-replay flag |
|---|---|---|---|---|---|
| {{e.g. summarization}} | {{anthropic claude-opus-4-7}} | {{$5 / tick, $50 / day}} | {{structured `{model, input_tokens, output_tokens, usd}` per call}} | {{transition-edge alert to `#alerts-cost` Slack on rising-edge of `daily_usd > cap`}} | {{`--catch-up` flag required for replay; default skips}} |
| {{e.g. embedding store sync}} | {{pinecone / openai-embeddings}} | {{$2 / day}} | {{call size + dollar log}} | {{same Slack lane as observability}} | {{`--replay-since=YYYY-MM-DD` required}} |
| | | | | | |

**Reminder:** every row should have a freshness gate or dedup store
*upstream* of the call so the cap is the last-line backstop, not the
first defence. A previously-broken path being repaired must NOT
default to processing the backlog — that requires an explicit operator
flag (capability #4).

## Documentation stack

Implements the blueprint's documentation rule (CLAUDE.md §"Documentation
is a main concern"). The four capabilities are non-negotiable; the
mechanism below is this project's choice. Pick a recipe from
[`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) and fill in the rows.

- **Recipe:** `{{A — single-repo README-only | B — static-site marketing + docs | C — customer help portal + status + privacy/TOS}}`

| Surface | Mechanism in this project |
|---|---|
| External release notes | {{e.g. append-only `docs/RELEASE-NOTES.md` / `docs-site/content/release-notes/YYYY-MM-DD.md` per push / in-app changelog UI fed by build}} |
| Customer help | {{e.g. `frontend/public/help.html` / `docs-site/content/features/*.md` / Intercom portal with `help-index.md` in repo}} |
| Public status / changelog | {{e.g. N/A / `docs-site/content/changelog.md` generated / Statuspage at status.{{PROJECT_NAME}}.com}} |
| Legal (privacy / TOS) | {{e.g. N/A (internal tool) / `docs-site/content/legal/privacy-vYYYY-MM-DD.md` versioned / hand-managed at legal.{{PROJECT_NAME}}.com}} |
| API reference | {{e.g. N/A / generated OpenAPI + markdown summaries / Stripe-style hand-curated reference}} |
| Pricing | {{e.g. N/A / `docs-site/content/pricing.md` / split between marketing page + billing config}} |

**Doc-sync list lives in [`project_config_dod.md`](project_config_dod.md)
§"Doc-sync list"** — two tables (External / Internal). The handoff
checklist (DoD §7.D) walks both before any `OVER_TO_USER` flip.

**Pre-push drift hint** — declare project-specific grep patterns in
`project_config_dod.md` §"User-surface rules"; the hook in
`.githooks/pre-push-project` runs them on every push.

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
