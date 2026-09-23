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
| Secret scan | `gitleaks detect --redact --no-banner --log-opts=<pushed-range>` | zero findings |
| SAST | `semgrep --config=p/owasp-top-ten --severity=WARNING --severity=ERROR --error --timeout=20` | zero `WARNING+` |
| SCA | `osv-scanner scan source --recursive --format=json .` | zero `MEDIUM+` (CVSS >= 4.0); lower reported, not blocking |
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

> The files that must move together with code changes. `templates/project_config_dod.md`
> keeps the seeded template shape (Recipe A/B/C rows, `{{PROJECT_NAME}}`
> placeholders) for a new project to fill in — that file is untouched by
> this task. **This is the root file: the blueprint's OWN doc-sync list,**
> judged surface by surface against THIS tree, not copied from the
> template (TASK-072, closing audit row D058).
>
> This repo ships **no** docs-site, help portal, status page, legal pages,
> pricing page or API — the template rows naming those (`docs-site/…`,
> `frontend/public/help.html`, …) are Recipe B/C rows and this repo is
> none of those recipes for itself. Every such row is marked **N/A**
> below rather than deleted, so the question is recorded as asked and
> answered, not silently missing.
>
> `tests/doc-links` scans this section and fails if a path named in a
> non-N/A row does not exist in the tree — a glob row (`PLAN-*.md`) checks
> its directory, not that an instance already exists (enforced by:
> `tests/doc-links` "THE REAL TREE — every path named in the doc-sync list
> exists").

### External (customer-facing)

> Updated in the **same commit** as any change a user can see / click /
> read. "Same commit" means the code commit, not just the same PR.

| File / surface | Audience | Trigger | Sync rule |
|---|---|---|---|
| `README.md` | Visitor / prospective adopter | Architecture, bootstrap/install, or `blueprint` CLI surface change | Same commit |
| `docs/way-of-working.md` | Customer / investor / hire — the canonical pitch deck | Any of the ten concerns it mirrors (`CLAUDE.blueprint.md` §"docs/way-of-working.md is the canonical pitch surface") | Same commit for the markdown; the PDF is deferred (`project_config_overview.md` §"Standing founder decisions") |
| N/A — `docs/RELEASE-NOTES.md` | — | This repo has none; its own history is its `git log`. A project bootstrapped from `templates/` gets Recipe A's release-notes row — this repo does not inherit its own template's row | N/A |
| N/A — `docs-site/content/features/*.md`, `pricing.md`, `api/*.md` + OpenAPI, `legal/*.md` | — | No docs-site exists; Recipe B/C do not apply to the blueprint itself | N/A |
| N/A — `frontend/public/help.html` | — | No `frontend/` tree in this repo | N/A |
| N/A — help portal article index, public status page, public roadmap | — | No portal, no status-page tooling; `docs/backlog/` and `docs/doing/` are the roadmap, read directly by the founder | N/A |

### Internal (team-facing)

> Updated in the **same commit** as the code-state change they describe.
> Not user-noticeable, but stale internal docs make every future
> decision worse.

| File / surface | Audience | Trigger | Sync rule |
|---|---|---|---|
| `docs/config/findings.md` | Team / Codex review | Finding raised, fixed, or accepted | `Status: Fixed` block same commit as the fix |
| `docs/doing/BUGS.md` → `docs/waiting-acceptance/BUGS.md` → `docs/done/BUGS.md` | Team / agent | Bug numbered, fixed, founder-accepted | Lifecycle move in same commit as the action (DoD §1) |
| `docs/doing/BACKLOG.md` | Team / agent | Task/Feature/Spike numbered, parked, or resolved | Lifecycle move in same commit as the action (DoD §1) |
| `docs/doing/PLAN-*.md` | Team / Codex | Plan-driven work in flight | Lifecycle move at each transition |
| `docs/doing/HANDOVER.md` | Future-self / next session | End of any meaningful unit of work | Overwrite in place (DoD §10) |
| `docs/done/INCIDENT-*.md` (dated INCIDENT-YYYY-MM-DD.md) | Team / regulator | A defect on `main` reaches (or nearly reaches) a derived project via `blueprint pull` before being caught | Within 48h of resolution (DoD §6.2) — none exist yet; the folder and naming convention are real, no incident has happened |
| N/A — `project_config_security.md` (threat model, product-surface sense) | — | This repo has no deployed service, API, or auth surface of its own — same reasoning as C035/D086 (no `src/`, no `infra/`). The one real trust boundary this repo has, `a2bp`'s push access, is already written up in `project_config_paths.md` §"Back-propagation trust boundary", not here | N/A |
| N/A — `project_config_infra.md` (rollback) | — | No `infra/` tree, no prod resource this repo owns (D086) | N/A |
| N/A — `docs/architecture/ADR-*.md` | — | No `docs/architecture/` tree (Recipe C only) | N/A |
| N/A — `docs/runbooks/*.md` | — | No `docs/runbooks/` tree, no alert wired (Recipe C only) | N/A |
| N/A — `docs/config/FEATURES.md` | — | No such file; this repo's own concern-ripple list is `CLAUDE.blueprint.md`'s ten-concern list, already the deck row above | N/A |
| N/A — `docs/config/ACCEPTANCE_TESTS.md` | — | No such file; this repo's acceptance tests ARE its `tests/` vitest suites (catalogued by `scripts/lib/suites.sh`), not a separate prose list | N/A |

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

## Acceptance authority — the founder's

> **Founder decision, 2026-09-15:** *"an agent may not delegate acceptance to
> another agent without consulting me. I'm responsible for the acceptance or its
> delegation."*

**Final acceptance is the founder's.** An agent may propose a QA pass by an
agent from the other provider, and run it once the founder agrees. That verdict
becomes acceptance only when the founder explicitly delegates acceptance of
**that item**. There is no standing delegation for any class of work, and an
agent never delegates acceptance to another agent on its own authority.

**History.** The 2026-07-29 decision (*"I delegate these ones to the machine"*)
covered the items in that day's QA pass: BUG-001, BUG-002, BUG-003,
A-01/A-12/A-14, A-05/A-27, A-03, A-07 and A-09 accepted, A-22 rejected
([`docs/done/ACCEPTANCE-JESKO-2026-07-29.md`](docs/done/ACCEPTANCE-JESKO-2026-07-29.md)).
This section later restated it as a standing rule for a whole class of work;
TASK-034 removed that generalisation.

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
