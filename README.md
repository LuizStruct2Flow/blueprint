# struct2flow — blueprint

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)

The **living template** for new struct2flow projects. Holds the generic
agent-coordination protocol (Codex + Claude Code radio-over), the
lifecycle-managed `docs/` skeleton, the pre-push gate, and the
bootstrap-a-new-project script.

This repo is the canonical home for everything generic. Project-specific
overrides live in three `project_config_*.md` files at the root of each
project (see [What's in the blueprint](#whats-in-the-blueprint) below).

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
    ├── way-of-working.md           ← Marp deck source: how struct2flow ships software (architecture / lifecycle / quality / MALT / security / IaC)
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

The blueprint is itself a git repo. Edit freely; commit with descriptive
messages. To roll forward improvements into existing projects, work
through each project's agent and let the sync model do the pull.

Anything project-specific you find leaking into a blueprint file (a
storm2flow path, a customer name, a feature flag) is a bug — move it
into the equivalent `project_config_*.md` template instead.
