# struct2flow — blueprint

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
3. Fill out `project_config_overview.md`, `project_config_paths.md`,
   `project_config_dod.md`
4. Start adding code under `backend/`, `frontend/`, etc.
5. Optional: copy `.githooks/pre-push-project.example` to
   `.githooks/pre-push-project` and add your project-specific guards

---

## What's in the blueprint

```
blueprint/
├── README.md                       ← this file
├── CLAUDE.md                       ← generic agent protocol (uses {{PROJECT_NAME}})
├── AGENTS.md                       ← Codex wake-up rules
├── AGENT_SIGNAL.md                 ← signal template (Task field is a stub)
├── project_config_overview.md      ← project-specific overview (stub)
├── project_config_paths.md         ← project-specific paths / URLs (stub)
├── project_config_dod.md           ← project-specific DoD extensions (stub)
├── .gitignore                      ← generic node + agent ignores
├── .githooks/
│   ├── pre-push                    ← generic build/lint/test gate
│   └── pre-push-project.example    ← copy → edit for project-specific guards
├── .claude/
│   └── settings.json               ← generic AWS / git / shell permission allow-list
├── scripts/
│   ├── codex-signal-watch.sh       ← signal poller (whole-file generic)
│   ├── start-codex-signal-watch.sh ← Codex CLI launcher (uses {{PROJECT_NAME}})
│   └── new-project.sh              ← bootstrap a new project
└── docs/
    ├── DoD.md                      ← generic Definition of Done
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
directions, both founder-gated through the agent:

### 1. Pull (blueprint → project)

When you improve the blueprint (anything that benefits every project),
projects should pull that improvement forward.

**Wake-time check.** At the start of any session where the project's
agent infra might be stale, the agent runs:

```bash
diff -ru ~/sources/struct2flow/blueprint/CLAUDE.md ./CLAUDE.md
diff -ru ~/sources/struct2flow/blueprint/docs/DoD.md ./docs/DoD.md
# (etc. for the other blueprint-managed files)
```

If there's drift since the project's `.blueprint-source` commit, the
agent surfaces a short summary ("blueprint has 2 updates since last
sync: tightened DoD §3.4 wording; new failure mode in §9 generic list")
and offers to pull forward. The founder approves or skips per file.

The agent files that are blueprint-managed (do NOT edit directly; pull
from blueprint):

- `CLAUDE.md`
- `AGENTS.md`
- `docs/DoD.md`
- `scripts/codex-signal-watch.sh`
- `scripts/start-codex-signal-watch.sh`
- `.githooks/pre-push`
- `.claude/settings.json`
- The folder skeleton READMEs under `docs/`

### 2. Push (project → blueprint, back-propagate)

When you improve one of the blueprint-managed files in a project (e.g.
tightening a DoD rule, fixing a bug in the dispatcher script), the agent
should ask:

> "This change to `docs/DoD.md` §3.4 looks generic — back-propagate to
> the blueprint so other projects inherit it?"

If yes, the agent commits the same change to the blueprint repo and
updates the project's `.blueprint-source` to point at the new blueprint
commit (signaling the project is up-to-date again).

### What does NOT sync

The three `project_config_*.md` files, `.githooks/pre-push-project`, and
everything under `backend/`, `frontend/`, `infrastructure/`, `docs/doing/`,
`docs/waiting-acceptance/`, `docs/done/` are **project-owned**. The
blueprint never touches them after bootstrap.

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
