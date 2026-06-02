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

## Doc-sync list (DoD §6.4)

> The files that must move together with code changes. The blueprint
> names the rule; you name the file set. The agent uses these lists
> to gate handoffs (DoD §7.D).
>
> Pick a recipe in [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)
> (A / B / C) and the rows below are the starting set — extend per
> your project's surfaces.

### External (customer-facing)

> Updated in the **same commit** as any change a user can see / click /
> read. "Same commit" means the code commit, not just the same PR.

| File / surface | Audience | Trigger | Sync rule |
|---|---|---|---|
| `README.md` | Visitor / future hire | Architecture / install / CLI surface change | Same commit |
| `docs/RELEASE-NOTES.md` *(or `docs-site/content/release-notes/YYYY-MM-DD.md`)* | Customer | Every push shipping a user-noticed change | Append-only; never edit history |
| `docs-site/content/features/*.md` *(Recipe B/C)* | Customer | New / removed / renamed feature | Same commit |
| `docs-site/content/pricing.md` *(Recipe B/C)* | Customer | Plan / tier / price change | Same commit as billing code |
| `frontend/public/help.html` *(Recipe A)* | Customer | New / changed user-facing feature | Same commit |
| Help portal article index *(Recipe C)* | Customer / support | New article published or retired | Index entry same commit; article same week |
| `docs-site/content/legal/privacy-vYYYY-MM-DD.md` *(Recipe C)* | Customer / regulator | New data class, processor, region | Same commit + `legal-reviewed` PR label |
| `docs-site/content/legal/terms-vYYYY-MM-DD.md` *(Recipe C)* | Customer / regulator | Pricing / liability / dispute terms | Same commit + `legal-reviewed` PR label |
| Public status page *(Recipe C)* | Customer | Outage / planned maintenance / postmortem | Real-time (tooling) for incidents; same-day manual for postmortem |
| Public roadmap *(Recipe C — Productboard / Canny)* | Customer / investor | Lifecycle move (`backlog/` → `doing/` → `waiting-acceptance/`) | Same week |
| `docs-site/content/api/*.md` + OpenAPI spec *(Recipe B/C)* | Customer / integrator | API surface change | Same commit; spec generated from code |
| | | | |

### Internal (team-facing)

> Updated in the **same commit** as the code-state change they describe.
> Not user-noticeable, but stale internal docs make every future
> decision worse.

| File / surface | Audience | Trigger | Sync rule |
|---|---|---|---|
| `docs/config/FEATURES.md` | Team / agent | New / removed / renamed feature | Same commit as the code |
| `docs/config/ACCEPTANCE_TESTS.md` | Team / QA | New acceptance test catalogued / retired | Same commit as the test |
| `docs/config/findings.md` | Team / Codex review | Finding raised, fixed, or accepted | `Status: Fixed` block same commit as the fix |
| `docs/doing/BUGS.md` → `waiting-acceptance/` → `done/` | Team / agent | Bug numbered, fixed, founder-accepted | Lifecycle move in same commit as the action (DoD §1) |
| `docs/doing/PLAN-*.md` | Team / Codex | Plan-driven work in flight | Lifecycle move at each transition |
| `project_config_security.md` (threat model) | Team / agent | New trust boundary / auth surface / data class | Same commit as the route / data path |
| `project_config_infra.md` (rollback) | Team / on-call | New prod resource | Same commit as the IaC change |
| `docs/architecture/ADR-*.md` *(Recipe C)* | Team / new hire | Architectural decision taken or reversed | Numbered, dated, same commit as embodying code |
| `docs/runbooks/*.md` *(Recipe C)* | On-call / agent | New alert wired | Same PR as the alert; link in the alert payload |
| `docs/done/INCIDENT-YYYY-MM-DD.md` | Team / regulator | Production incident | Within 48h of resolution (DoD §6.2) |
| `docs/doing/HANDOVER.md` | Future-self / next session | End of any meaningful unit of work | Overwrite in place (DoD §10) |
| | | | |

**Promotion / removal** — see [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) §"Promotion criteria for the sync list". Changes to the lists above are committed as part of a doc-sync-list change PR, not silently.

**Pre-push drift hint** — declare project-specific grep patterns in
§"User-surface rules" below; the hook in `.githooks/pre-push-project`
runs them on every push. Best-effort, not exhaustive — the
§7.D handoff checklist is the human gate.

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
