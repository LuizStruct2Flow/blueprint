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
| Secret scan | `gitleaks protect --staged --redact` | zero findings |
| SAST | `semgrep --config=p/owasp-top-ten --severity=WARNING --severity=ERROR --error --timeout=20` | zero `WARNING+` |
| SCA | `osv-scanner --recursive --skip-git --fail-on-vuln .` | zero `HIGH+` CVE |
| IaC validate (Recipe A) | `cd infra && cdk synth --quiet` | synth clean |
| IaC validate (Recipe B) | `cd infra && terraform fmt -check -recursive` + `terraform validate` | clean (init required for validate) |
| IaC validate (Recipe C) | `helm lint infra/charts/*/` | each chart clean |
| Build | `cd backend && npm run build` | tsc clean |
| Lint (BE) | `cd backend && npm run lint` | `--max-warnings <N>` ratcheted |
| Format check (BE) | `cd backend && npm run format:check` | prettier clean |
| Test + coverage (BE) | `cd backend && npm run test:coverage` | all green; coverage meets project mode (see below) |
| Lint (FE) | `cd frontend && npm run lint` | `--max-warnings <N>` ratcheted |
| Format check (FE) | `cd frontend && npm run format:check` | prettier clean |
| Test + coverage (FE) | `cd frontend && npm run test:coverage` | all green; coverage meets project mode (see below) |
| (Project-specific guards) | sourced from `.githooks/pre-push-project` | each guard fails-fast |

**Security + IaC tooling install** (each developer's machine):
```bash
brew bundle   # uses ./Brewfile at the repo root
```
The blueprint Brewfile pins the security gate (`gitleaks`, `semgrep`,
`osv-scanner`) plus the IaC tooling (`awscli`, `aws-cdk`, `terraform`,
`helm` — install only what your recipe needs).

If a binary is missing, the pre-push hook **skips** its step with a
warning rather than blocking — CI re-runs the same gate as a backstop.
See [docs/SECURITY.md](docs/SECURITY.md) and
[docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) for the full per-stack
recipes (CI deep-SAST packs, container scan, plan-diff posting,
nightly drift watch, DAST baseline).

Project-specific tooling (Node version pin, `kubectl`, `argocd`,
etc.) goes in the `Brewfile` below the `# Project-specific extensions`
marker — the blueprint sync preserves your additions.

## Coverage mode (DoD §3.6)

> Pick exactly one. Greenfield projects must hit the 90% bar from the
> first push; brownfield projects start wherever they are and ratchet
> upward — never let the number drop.

- **Mode:** `{{greenfield | brownfield}}` (delete the one that doesn't apply)
- **Threshold (overall):**
  - greenfield → **≥90%** statements + branches on `application/` + `domain/`
  - brownfield → **≥70%** on the same scope, ratcheted; the current floor is `{{N%}}` (commit SHA `{{SHA}}`)
- **Scope (what counts toward the threshold):**
  ```
  include: src/application/**, src/domain/**
  exclude: src/adapters/**, src/**/__generated__/**, **/*.d.ts
  ```
- **New / modified files** always have to clear the **greenfield 90% bar**,
  regardless of project mode. (Brownfield's lower floor is for legacy code,
  not for fresh code added today.)
- **Invocation:** `npm run test:coverage` runs the suite and fails the
  process if any of the thresholds above aren't met. The pre-push hook
  blocks on this.

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
