# Project DoD Extensions — {{PROJECT_NAME}}

Project-specific extensions to `docs/DoD.md`. The generic DoD rules
(lifecycle, bug management, two-commit pattern, pre-push gate, quality
bar, handoff checklist, resume continuity) apply to every struct2flow
project. This file adds the rules that ONLY apply to {{PROJECT_NAME}}.

## Pre-push gate — project commands

> The blueprint's `.githooks/pre-push` runs build / lint / tests in the
> conventional locations (`backend/`, `frontend/`). If your project uses
> different layouts or commands, document them here AND adjust
> `.githooks/pre-push-project` accordingly.

| Step | Command | Threshold |
|---|---|---|
| Build | `cd backend && npm run build` | tsc clean |
| Lint (BE) | `cd backend && npm run lint` | `--max-warnings <N>` ratcheted |
| Test (BE) | `cd backend && npm test` | all green |
| Lint (FE) | `cd frontend && npm run lint` | `--max-warnings <N>` ratcheted |
| Test (FE) | `cd frontend && npm test` | all green |
| (Project-specific guards) | sourced from `.githooks/pre-push-project` | each guard fails-fast |

## Doc-sync list (DoD §5)

> The files that must move together for any user-facing change. The
> blueprint names the rule; you name the file set. Add a row per file;
> the agent uses this list to gate handoffs (DoD §D).

| File | Audience | Why it must stay in sync |
|---|---|---|
| `docs/config/FEATURES.md` | Internal | Catalog of what exists |
| `frontend/public/help.html` | Customer | In-app help page |
| | | |

## User-surface rules

> Project-specific quality rules for customer-visible surfaces.
> The generic DoD names the categories; you fill them in.

### Localization
> If the product ships in multiple languages, declare them here. Which
> files hold which language? What's the key-parity check?

### No internal customer references on public pages
> If applicable. Generic version in DoD §5.

### Standard page invariants
> Head block, favicon, OG tags, canonical URLs — anything that silently
> drifts when pages are hand-written. Enforce in `.githooks/pre-push-project`.

## Project-specific quality gates (DoD §E)

> Beyond the generic DoD checklist, what does this project specifically
> require before flipping to `OVER_TO_USER`?
>
> Examples (delete and replace):
> - Visual / layout SVG worked example for any layout-rule change
> - Accessibility checks for new UI components
> - Infra cost-delta estimate for any IaC change >$10/month
> - Security posture review for any new IAM resource

| Trigger | Required artefact | Where it lives |
|---|---|---|
| | | |

## Failure modes seen on this project

> Project-specific incidents that motivated a rule. Add a row when a
> miss bites — agents read this to avoid repeats. Generic failure modes
> live in `docs/DoD.md` §9.

| Date | Failure | Rule it motivated |
|---|---|---|
| | | |

## Test architecture — project specifics

> If the project has a non-standard non-deterministic stage (LLM, real-time
> data, external API the test suite can't pin), name it here, and name
> the fixture / provenance pattern that captures its output deterministically.

## Snapshot tooling

> Project-specific snapshot commands and where snapshots live.

| Snapshot type | Approve command | Review command | Baseline location |
|---|---|---|---|
| Data | `npm run snap:approve` | `npm run snap:review` | `__snapshots__/` |
| Pixel | | | |
