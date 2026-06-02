# struct2flow — blueprint

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Status: alpha](https://img.shields.io/badge/Status-alpha-orange.svg)](#status)

> **A living operating system for AI-native software development.**

One git repo that codifies how I ship software — architecture, lifecycle,
quality, observability, security, IaC — plus the two AIs that operate it.
Every project I build forks from here; every lesson learned travels back
upstream so every other project inherits it.

## What makes this different from "another opinionated framework"

- **Two AIs share the mic.** Codex and Claude Code coordinate through a
  single `AGENT_SIGNAL.md` file — radio-over handoff, one mic at a time,
  no overwrites or duplicate work. See [CLAUDE.md](CLAUDE.md) §"Agent
  Coordination Signal".
- **The blueprint evolves with every project.** Patterns proven in
  production travel back upstream via `blueprint a2bp`; every project —
  current *and* future — gets every improvement within the same week
  one project learned it.
- **Enforced by tooling, not memos.** Eight concerns, all gated by code:
  pre-push hooks, scripts, CI. Rules live in code, not in docs nobody
  reads.

## The eight concerns it encodes

| Concern | Where | Pre-push gate |
|---|---|---|
| **Architecture** — DDD + Clean + Hexagonal | [STACK_DEFAULTS.md](STACK_DEFAULTS.md) | — |
| **Lifecycle** — four founder-gated states | [docs/DoD.md](docs/DoD.md) §1 | — |
| **Quality** — DoD, two-commit pattern, ≥90% coverage | [docs/DoD.md](docs/DoD.md) §3, §6 | build · lint · prettier · test:coverage |
| **Observability (MALT)** — Monitoring · Alerting · Logging · Tracing | [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | — |
| **Security** — secret-scan, SAST, SCA, IaC scan, DAST | [docs/SECURITY.md](docs/SECURITY.md) | gitleaks · semgrep · osv-scanner |
| **Infrastructure as Code** — defined, reviewable, reproducible | [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) | cdk synth / terraform / helm lint |
| **Cost** — billable paths capped, logged, alerted; backlog-replay opt-in | [CLAUDE.md §"Cost is a main concern"](CLAUDE.md) | — |
| **Documentation** — internal + external, same-commit rule | [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) + [docs/DoD.md §6.4](docs/DoD.md) | per-project grep hints in `pre-push-project` |

## Read the deck

The full pitch — 30 slides — covering all eight concerns plus the two
meta-layers (agent + blueprint):

- **Source:** [`docs/way-of-working.md`](docs/way-of-working.md) (Marp markdown)
- **Render to PDF:** `scripts/build-deck.sh` (needs `node`)

## Status

This repo is a **framework / template**, not a runnable application. It
bootstraps new struct2flow projects via `scripts/new-project.sh` and
stays alive across them via two-way sync (see [The sync model](#the-sync-model)).

**Alpha.** The patterns are stable; the names may still move. The
blueprint is intentionally incomplete — it contains *only what has been
proven in production* across struct2flow's existing projects.

---

## Create a new project

```bash
~/sources/struct2flow/blueprint/scripts/new-project.sh acme-flow
```

That copies the blueprint into `~/sources/struct2flow/acme-flow/`,
substitutes `{{PROJECT_NAME}}` placeholders, initializes git, wires
the `.githooks` path, and records the blueprint commit you forked from
in `.blueprint-source`.

After bootstrap:

1. `cd ~/sources/struct2flow/acme-flow`
2. `code .` (open in VS Code)
3. `brew bundle` (installs `gitleaks` + `semgrep` + `osv-scanner` for the pre-push gate)
4. Fill out `project_config_overview.md`, `project_config_paths.md`,
   `project_config_dod.md`, `project_config_security.md`,
   `project_config_infra.md`
5. Start adding code under `backend/`, `frontend/`, etc.
6. Optional: copy `.githooks/pre-push-project.example` to
   `.githooks/pre-push-project` and add your project-specific guards

---

## What's in the blueprint

```
blueprint/
├── README.md                       ← this file
├── CLAUDE.md                       ← generic agent protocol (uses {{PROJECT_NAME}})
├── AGENTS.md                       ← Codex wake-up rules
├── AGENT_SIGNAL.md                 ← signal template (Task field is a stub)
├── STACK_DEFAULTS.md               ← default tech stack for new struct2flow projects
├── Brewfile                        ← brew bundle: gitleaks + semgrep + osv-scanner (security gate deps)
├── project_config_overview.md      ← project-specific overview (stub)
├── project_config_paths.md         ← project-specific paths / URLs (stub)
├── project_config_dod.md           ← project-specific DoD extensions (stub)
├── project_config_security.md      ← project-specific threat model + scan thresholds (stub)
├── project_config_infra.md         ← project-specific envs / state / cost ceilings / rollback (stub)
├── .gitignore                      ← generic node + agent ignores
├── .githooks/
│   ├── pre-push                    ← generic security + build/lint/format/coverage gate
│   └── pre-push-project.example    ← copy → edit for project-specific guards
├── .claude/
│   └── settings.json               ← generic AWS / git / shell permission allow-list
├── scripts/
│   ├── codex-signal-watch.sh       ← signal poller (whole-file generic)
│   ├── start-codex-signal-watch.sh ← Codex CLI launcher (uses {{PROJECT_NAME}})
│   ├── new-project.sh              ← bootstrap a new project
│   ├── blueprint                   ← sync CLI: drift / pull / a2bp (add to PATH)
│   └── build-deck.sh               ← render docs/way-of-working.md → PDF (via marp-cli)
├── config/
│   └── README.md                   ← two-file config convention (committed *.example, gitignored *)
└── docs/
    ├── DoD.md                      ← generic Definition of Done
    ├── OBSERVABILITY.md            ← capture / retrieve / alert recipes per runtime
    ├── SECURITY.md                 ← secret-scan / SAST / SCA / DAST recipes per runtime
    ├── INFRASTRUCTURE.md           ← IaC recipes per stack (CDK / Terraform / Helm-ArgoCD)
    ├── DOCUMENTATION.md            ← doc-sync recipes (internal + external; per-project shape)
    ├── way-of-working.md           ← Marp deck source: how struct2flow ships software (8 concerns + 2 meta-layers)
    ├── assets/brand/               ← struct2flow CI: logo SVGs (blueprint-only; not synced to projects)
    ├── PUBLISHING.md               ← runbook for publishing a project (or part of it) publicly
    ├── backlog/
    │   ├── README.md               ← parked-state lifecycle + categories (KEEP/DEFER/OBSOLETE)
    │   ├── BACKLOG.md              ← stub: parked feature / polish rows
    │   └── BUGS.md                 ← stub: parked bugs awaiting re-open triggers
    ├── doing/
    │   ├── README.md
    │   └── HANDOVER.md             ← canonical resume doc (template stub)
    ├── waiting-acceptance/README.md
    ├── done/README.md
    ├── config/README.md
    ├── requirements/README.md
    └── mocks/README.md
```

---

## The sync model

Once a project is bootstrapped, the blueprint stays alive. Two sync
directions, both founder-gated through the agent and both driven by a
single CLI: **`blueprint`** (at `scripts/blueprint` in this repo).

### One-time setup

Add the blueprint's `scripts/` to PATH so the CLI is callable as
`blueprint` from any project:

```bash
# ~/.zshrc (or ~/.bashrc)
export PATH="$HOME/sources/struct2flow/blueprint/scripts:$PATH"
```

Or symlink it: `ln -s ~/sources/struct2flow/blueprint/scripts/blueprint /usr/local/bin/blueprint`.

### 1. Pull (blueprint → project)

When you improve the blueprint (anything that benefits every project),
projects pull that improvement forward.

**Wake-time check.** At the start of any session, from the project root:

```bash
blueprint drift
```

Output: which blueprint-managed files differ from the blueprint HEAD, plus
the commit log of what's changed in the blueprint since this project was
last synced (read from `.blueprint-source`). The agent surfaces a short
summary and offers to pull forward.

```bash
blueprint pull                    # interactive: per-file y/n/quit
blueprint pull docs/DoD.md        # pull a single file
blueprint pull --yes              # skip the per-file prompt (pull everything drifted)
```

`pull` updates `.blueprint-source` to the blueprint's current HEAD when
it finishes, so the next `drift` call shows the project as up-to-date.
Review with `git diff` and commit in the project repo.

### 2. Push (project → blueprint) — `blueprint a2bp`

When you improve one of the blueprint-managed files in a project (e.g.
tightening a DoD rule, fixing a bug in the dispatcher script), copy the
change back to the blueprint:

```bash
blueprint a2bp docs/DoD.md scripts/codex-signal-watch.sh
```

`a2bp` (apply-to-blueprint) copies the project's version of each named
file into the blueprint working tree. It **stages** the change — it
does not auto-commit. You then `cd ~/sources/struct2flow/blueprint`,
review with `git diff`, and commit + push yourself. After the
blueprint commit lands, `blueprint drift` in the project shows the
project matches HEAD again.

`a2bp` refuses files that aren't in the blueprint-managed list — if a
new file *should* be managed, add it to the `MANAGED_FILES` array in
`scripts/blueprint` first (a2bp itself), then re-run.

### What's managed and what isn't

The canonical list is the `MANAGED_FILES` array inside
[`scripts/blueprint`](scripts/blueprint). Run `blueprint files` to print
it. Current contents:

- **Top-level:** `CLAUDE.md`, `AGENTS.md`, `STACK_DEFAULTS.md`, `Brewfile`
- **`docs/` (canonical references):** `DoD.md`, `OBSERVABILITY.md`,
  `SECURITY.md`, `INFRASTRUCTURE.md`, `PUBLISHING.md`, `way-of-working.md`
- **`scripts/`:** `codex-signal-watch.sh`, `start-codex-signal-watch.sh`,
  `new-project.sh`, `blueprint` itself
- **`.githooks/`:** `pre-push`, `pre-push-project.example`
- **`.claude/`:** `settings.json` (host-specific bits live in
  `settings.local.json`, gitignored)
- **Folder skeleton READMEs:** every `README.md` under `docs/` and `config/`

**Project-owned (never synced):**
- The five `project_config_*.md` files (`overview`, `paths`, `dod`,
  `security`, `infra`) — these are *templates* seeded once at bootstrap
  and then evolve with the project
- `.githooks/pre-push-project` — project-specific guards
- `AGENT_SIGNAL.md`, `docs/doing/HANDOVER.md` — stamped at bootstrap, then
  evolve session-by-session
- Everything under `backend/`, `frontend/`, `infra/`, `docs/doing/`,
  `docs/waiting-acceptance/`, `docs/done/`, `docs/backlog/`,
  `docs/config/`, `docs/mocks/`, `docs/requirements/`

---

## Placeholder convention

The blueprint uses `{{PROJECT_NAME}}` and `{{YYYY-MM-DD}}` placeholders.
`new-project.sh` substitutes them on bootstrap. If you add a new
placeholder, document it here AND extend the substitution loop in
`scripts/new-project.sh`.

Current placeholders:
- `{{PROJECT_NAME}}` — kebab-case project name, used in `~/.{{NAME}}/`
  log paths and protocol preambles.
- `{{YYYY-MM-DD}}` — today's date, used in `AGENT_SIGNAL.md` and
  `HANDOVER.md` "Last updated" lines.
- `{{REPO_PATH}}` — absolute path to the project root, used in
  `AGENTS.md` example invocations. (Currently left as a placeholder
  string; the agent fills it on first session.)

---

## Editing the blueprint

### Founder workflow (direct commits)

The blueprint is itself a git repo. I commit directly on `main` with
descriptive messages. To roll forward improvements into existing
projects, I work through each project's agent and let the sync model
do the pull.

Anything project-specific that leaks into a blueprint file (a
storm2flow path, a customer name, a feature flag) is a bug — moved
into the equivalent `project_config_*.md` template instead.

### Contributing (PRs welcome)

Issues and pull requests are open. Two kinds of contributions land at
different speeds:

- **Fast track** — typos, clarity fixes, missing edge cases, broken
  links, doc improvements, bug fixes in the agent scripts or the
  pre-push gate. Open a PR with a [Conventional
  Commits](https://www.conventionalcommits.org/) message
  (`fix(scripts): …`, `docs(dod): …`); CI runs the pre-push gate
  locally so make sure `brew bundle && .githooks/pre-push` passes
  before opening the PR.
- **Slower track — new capabilities or new concerns.** The blueprint
  is **derived, not designed** ([CLAUDE.md](CLAUDE.md) §"The
  blueprint is derived, not designed"): capabilities are admitted
  only after they have proven themselves in a real struct2flow
  project. If you want to propose a new recipe / gate / concern,
  open an **issue first** describing where it has been used in
  production and how it survived a follow-up round of work. We can
  discuss before any code lands. This isn't to be precious about
  the surface area — it's because intentional incompleteness is
  what makes the blueprint reliable.

**Out of scope:** project-specific content (customer names, internal
URLs, feature flags) belongs in a downstream project's
`project_config_*.md`, never in a blueprint-managed file. PRs that
hard-code such content will be asked to refactor.

**Before opening a PR:**
- `brew bundle` to install `gitleaks` + `semgrep` + `osv-scanner`.
- `.githooks/pre-push` to run the full gate locally (security +
  build + lint + format + tests + IaC validate).
- For any change to [docs/DoD.md](docs/DoD.md), [CLAUDE.md](CLAUDE.md),
  or a recipe doc, also update [docs/way-of-working.md](docs/way-of-working.md) in
  the same commit — the deck is the canonical pitch surface and
  must stay current with the rules (see CLAUDE.md §"docs/way-of-working.md
  is the canonical pitch surface").
