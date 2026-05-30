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
