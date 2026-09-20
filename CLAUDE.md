# Development Instructions

This file is the struct2flow **generic** agent protocol. Project-specific
overrides live in files at the repo root. They are imported here, so every
session loads them with this file:

- @project_config_overview.md
- @project_config_paths.md
- @project_config_dod.md
- @project_config_security.md
- @project_config_infra.md
- @claude.internal.md
- @CLAUDE.blueprint.md

A project that has not created one of them yet still gets a working session:
Claude Code skips an import whose file is missing. Project rules belong in these
files, never in this one, because a pull replaces this file whole.

**`claude.internal.md` is the project's own file, and nothing in the blueprint
ever writes it.** It is not managed, so `blueprint pull` cannot replace it, and
no bootstrap seeds one — the import above names a file that does not exist until
the project creates it. It is the place for agent context that belongs to this
project rather than to the framework: house rules, local runbooks, notes a
session should carry that no other project should inherit.

**Whether it is tracked is the project's decision.** Commit it and the whole team
gets it; add it to `.gitignore` and it stays on one machine. Nothing in the
framework reads it or depends on the choice. This is what makes the split
possible: the generic protocol can be tracked and public, because the private
half has a home of its own.

**`CLAUDE.blueprint.md` exists only in the blueprint.** It holds the rules for
maintaining the blueprint itself: its trunk, implementing a back-propagation
request, publishing the deck. It does not ship, so in a project the import is
skipped exactly as a missing `claude.internal.md` is, and this file carries only
what operates a project or asks the blueprint for a change (TASK-021).

## Agent Coordination

The agents on this project coordinate through the live baton at
`logs/state/signal.md` — untracked per-checkout state, written only by
`scripts/signal-set.sh`, with the protocol documented in
[AGENT_SIGNAL.md](AGENT_SIGNAL.md)
— the slim live "radio over" baton (Holder / State / Task / Last update; history
in `logs/state/signal-history.log`, appended on every flip). **Do not hand-edit
the baton rows** — one writer publishes the whole baton atomically, so no poller
can sample a half-written state. `Holder` is a **persona name** from the team
roster, not a bare agent type.

- **`AGENT_ROSTER.md`** — the team (who's who): each persona, its role, and its
  backing agent. **Per-engineer and gitignored, on the `.env` model**: the tracked
  template is [AGENT_ROSTER.example.md](AGENT_ROSTER.example.md); you copy it once
  (`cp AGENT_ROSTER.example.md AGENT_ROSTER.md`) and edit your copy. Each engineer
  runs a different fleet — different agents, subscriptions and quotas — so the live
  roster is neither shared nor overwritten by a blueprint sync. The `Backing agent`
  column is free text (Claude Code, Codex, Kimi, Gemini, Copilot, Qwen, …); only
  autonomous dispatch needs a matching signal watcher.
- **[AGENTS.md](AGENTS.md)** — the coordination protocol: mic states, the ACTIVE-on-claim rule
  (claiming the mic means setting `State = ACTIVE` first), reactivity / Monitor
  setup, and how each backing agent (Codex, Gemini, Kimi, Copilot) is dispatched/watched.
  Read it before any coordinated work.

Watch the whole team live in one terminal: `bash scripts/agent-activity.sh --daemon`
then `tail -F logs/agent-activity.log` streams
a single `[Persona - model - effort]` feed. `bash scripts/team-kickoff.sh` runs a
round-robin kick-off to confirm the roster after editing it.

### On wake — the primary session is the Orchestrator

The Claude Code prompt the founder talks to **directly** is the **Orchestrator**.
Its name is the `Name` cell of the `Orchestrator` row in
[AGENT_ROSTER.md](AGENT_ROSTER.md) (`bash scripts/agent-activity.sh --whoami`
prints it); never assume it. That name is your `Holder`, and handoffs to you are
`OVER_TO_<NAME>`.

**A `SessionStart` hook does the rest of the wake** (`scripts/session-start.sh`,
wired in `.claude/settings.json`): it starts the activity feed and runs
`blueprint drift`, and its report is in your context. A drift line reading
`UNKNOWN` means nothing was compared: tell the founder, and never report the
project as in sync. If drift shows changes, summarise them and offer
`blueprint pull`; do not pull silently.

**Then arm the wake-time Monitors**, `persistent: true`, each emitting only on
change: the mic (`logs/state/signal.md`, every `Holder`/`State` change, not just
`OVER_TO_<you>`), and whatever `project_config_paths.md` §"Wake-time Monitors"
declares. Then orchestrate the roster.

**Agents without Claude hooks (Codex, Gemini, Kimi) wake by hand:** run
`bash scripts/blueprint drift` and report a non-zero exit as unknown, then
`bash scripts/agent-activity.sh --daemon` regardless of the drift result.

## Running commands — one per call, chains only when dependent

**One command per tool call.** Do not join independent commands with `;`, `&&`
or `||`: permission is granted per command pattern, and a compound string is
matched as one unit, which also defeats the deny list. Chain only commands that
genuinely depend on each other; a pipe qualifies. Never wrap a command until it
stops matching its allowlist entry — run it plainly and let the prompt happen,
or ask for it to be allowed.

`scripts/no-chain-guard.sh` blocks chains, including operators inside quoted
text and heredocs. Write a commit message or a snippet to `.scratch/`
(in-project and gitignored) and run or reference the file:
`git commit -F .scratch/msg`.

**Everything temporary goes in `.scratch/`, including a tooling workspace** — a
scratch clone, a worktree, a dispatch fixture. Create it with
`mktemp -d -p .scratch` and remove it when done. This used to carve out
workspaces "a tool will walk" and send them to a system temp dir, which was
wrong on both halves (TASK-064):

- **Nothing walks it.** `.scratch/` is gitignored, and the gate's scanners honour
  that — measured, not assumed: the pre-push semgrep step scans 198 files here
  and enters `.scratch/` for none of them. `gitleaks protect --staged` sees only
  the index, and `blueprint files` is `git archive`, so an untracked workspace is
  invisible to it by construction.
- **`/tmp` is where cleanup fails.** `rm -rf .scratch/*` is an allowed command
  and `rm -rf /tmp/...` is not, so an agent that follows the old advice cannot
  remove what it made and leaves litter the founder deletes by hand. That is what
  happened when a dispatcher fixture went to `mktemp -d` (2026-09-20).

`.gitignore` already said so — *"Kept INSIDE the repo so the work is visible next
to the code that prompted it, rather than hidden in a system temp dir"* — and
this file contradicted it for long enough to send an agent the wrong way.

**This governs what an AGENT creates, not the test suites.** A suite's fixture
roots are governed by its own isolation contract and stay where that contract
puts them; do not migrate them here on the strength of this rule.

## Before Every Push

The pre-push gate (`.githooks/pre-push`) blocks a failing push, and CI is the
backstop. What it expects of you — never `--no-verify`, the lint ratchet, where
project guards go — is [docs/DoD.md](docs/DoD.md) §4.

## Definition of Done — read before every handoff

[`docs/DoD.md`](docs/DoD.md) holds the lifecycle, the work-intake rules, bug
management and the handoff checklist. Walk its §7 before flipping the baton.

## Documentation Structure

```
docs/
├── DoD.md                ← Definition of Done (read before every handoff)
├── config/               ← stable reference (FEATURES.md, ACCEPTANCE_TESTS.md, findings.md)
├── backlog/              ← parked work (KEEP / DEFER / OBSOLETE)
├── doing/                ← active work (BUGS.md, BACKLOG.md, PLAN-*.md, HANDOVER.md)
├── waiting-acceptance/   ← landed on main, awaiting founder acceptance
├── done/                 ← founder-accepted work
├── requirements/         ← cross-cutting specs referenced by several plans
└── mocks/                ← design mockups and throwaway prototypes
```

How an item moves between those folders is [docs/DoD.md](docs/DoD.md) §1, and
bug numbering, regression tests and the plan-first process for a major bug are
§2.

## Team Workflow

- Work as a team: spawn specialized agents (backend, frontend, infra, QA, design) via the `Agent` tool with the right `subagent_type`
- Use agents for all non-trivial work — even small bug fixes should be
  delegated rather than quick-fixed inline
- **Commits:** the subject starts with the item it serves (`BUG#20:`,
  `FEATURE#3:`, `TASK#1:`), one item per commit, and the body says why
  ([docs/DoD.md](docs/DoD.md) §1b rules 1 and 3). `.githooks/commit-msg` refuses
  any other subject, and CI checks every commit of a push to `main`.
- Trunk-based development: a maintainer pushes to `main` and uses feature
  toggles, not branches. An external contribution is a pull request, which for
  the blueprint is what `blueprint a2bp` files (§"Back-propagating").
- Test layers, reproducer-first bug fixes, snapshots and the release tier:
  [docs/DoD.md](docs/DoD.md) §3. Coverage thresholds are the project's, in
  `project_config_dod.md`.

## Quality is non-negotiable

This product's value is the quality of what it delivers. Therefore:

- **Quality is non-negotiable.** If a fix "works" but the approach is
  ugly, brittle, or stitched from overlapping fallbacks, it is not a
  fix — it is a deferred regression. Stop, step back, find the
  solution that belongs in the codebase.
- **Don't chase shortcuts.** Patch-on-patch stacks are a signal the
  architecture is being worked around, not fixed. When you catch
  yourself adding a third fallback layer to compensate for the second
  one compensating for the first, escalate to team + Codex for a
  clean redesign — don't keep patching.
- **Pick the most evolutionary solution.** The right solution is the
  one that the next person (or the next bug) will thank you for. It
  composes well with the existing primitives, it survives adjacent
  changes, and it removes surface area rather than adding it. Pay the
  larger up-front cost when it eliminates a class of problems —
  especially on the core USP paths named in `project_config_overview.md`.
- **Delight the customer.** Acceptance is not "the test passes" — it
  is "the founder and the customer would show this to someone else."
  That's the bar. Anything short of that is unfinished work.

When in doubt between a quick patch and a slower clean rewrite, pick
the clean rewrite. Document why in the plan file and push for team +
Codex alignment before committing.

## Observability is a main concern

Quality is how fast errors are found and fixed. Every project captures every
error path (no silent fallback, no `try/catch` that returns success); makes every
captured error agent-queryable, and the agent uses that path before asking the
founder for logs; alerts when a shipped capability fails in production; and has
the agent diagnose first, pinging a human only when it cannot resolve the problem.
The mechanism is a recipe in [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md),
declared in `project_config_overview.md` §"Observability stack".

## Cost is a main concern

Every billable path (LLM, paid API, metered storage or egress) is priced, capped
and alertable **before** it is wired into a loop: a budget cap in code that halts
rather than logs; structured spend per call (`{model, input_tokens,
output_tokens, usd}`); a rising-edge alert when spend passes the cap; and backlog
replay only behind an explicit operator flag (`--catch-up`,
`--replay-since=…`), because a repaired path must never silently bill for the
backlog that piled up while it was broken. Each path is declared in
`project_config_overview.md` §"Cost stack".

## Security is a main concern

No secrets in code or git history, and a leaked one is rotated before it is
investigated. Static analysis blocks OWASP top-10 patterns at `WARNING+`, and
every suppression carries a justification naming the threat-model entry that
makes it safe. Dependencies and infrastructure are scanned on every push and
nightly. The agent triages and fixes findings itself, pulling the founder in only
for a risk-acceptance decision or a supply-chain incident. The mechanism is a
recipe in [docs/SECURITY.md](docs/SECURITY.md); the threat model and thresholds
live in `project_config_security.md`.

## Infrastructure as Code is a main concern

Everything in prod is defined in code, and a resource created out of band is
imported or deleted within the week. Every change is reviewed as its plan diff
(`cdk diff`, `terraform plan`, `helm diff`), environments are parameters of the
same code, and drift is detected nightly and resolved by codifying or reverting,
never ignored; drift open over 24 h is a `findings.md` entry. The mechanism is a
recipe in [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md); environments, cost
ceilings and rollback live in `project_config_infra.md`.

## Documentation is a main concern

Stale documentation fails silently, so keeping it in sync is a rule:
[docs/DoD.md](docs/DoD.md) §5. Recipes per project shape are in
[docs/DOCUMENTATION.md](docs/DOCUMENTATION.md), declared in
`project_config_overview.md` §"Documentation stack".

## Code Quality

- Run periodic code reviews using multiple perspectives (reuse, quality, efficiency, junior comprehension)
- Eliminate redundant DB reads — cache data in middleware, don't re-fetch
- Remove dead code: unused imports, parameters, constants, state fields
- Don't duplicate logic — extract shared helpers
- **SonarQube** audits bugs, vulnerabilities, smells and coverage: `npm run sonar`
  scans (`scripts/sonar.sh`) and `scripts/sonar-api.sh` queries the results. The
  triage workflow is in the header of `scripts/sonar.sh`; a Quality Gate `ERROR`
  blocks the handoff to the founder.

## Architecture Principles

- No hardcoded configuration — everything configurable via admin UI and stored in the project's config store
- Keep it simple — don't over-engineer
- **DRY — reuse before you add. Avoid creating unnecessary routes/endpoints,
  modals, or services when an existing one already does the job.** Before
  adding a new API route or UI surface, check whether an existing flow
  covers it. A new route is justified only when no existing path fits;
  say why in the plan. Redundant routes/surfaces are a review-blocking
  finding.
- Preserve user work where applicable; show diffs so users can see exactly what changed

## Blueprint sync (struct2flow framework)

This CLAUDE.md is sourced from the struct2flow **blueprint** at
`~/sources/struct2flow/blueprint/`. Project-specific extensions live in the
five `project_config_*.md` files at the repo root, imported at the top of this
file.

Sync is driven by a single CLI — `blueprint`. Its per-machine command is
written by `bash scripts/install-toolchain.sh` and runs the CLI of the project
you are standing in, so it names no checkout. The agent uses it directly; do
not hand-roll `diff -ru` invocations.

### Drift and pull

`blueprint drift` compares this project with the blueprint's fetched tip; the
session-start hook runs it (§"On wake"). Exit 5 means the blueprint could not be
read, which is **not** a clean report. After a non-empty `blueprint pull`
(`--yes` only when the founder asks), review with `git diff` and commit;
`.blueprint-source` is updated by the pull, never by hand.

### Back-propagating (apply-to-blueprint)

When you improve a generic rule in a blueprint-managed file, **offer to
back-propagate it** rather than committing it only here: *"This change to
`docs/DoD.md` looks generic — back-propagate it so other projects inherit it?"*
If yes:

```bash
blueprint a2bp --dry-run docs/DoD.md   # show the request, push nothing
blueprint a2bp docs/DoD.md             # file it
blueprint prs                          # what is currently asked of the blueprint owner
```

`a2bp` pushes a branch to the blueprint's remote and opens a pull request. It
lands nothing: a human merges. **Exit 3 means filed, not landed**, and no script
may read it as "the blueprint has this". It refuses what must not travel
(secrets, project config, a project name or host path left in the file) and says
why; a contamination finding is fixed, or its line marked with a justified
`a2bp-allow: <why it is safe>`. It is a convention the command implements, not a
wall: an agent with push access could bypass it
(`project_config_paths.md` §"Back-propagation trust boundary").

**Propose what has held up**: "the next two bugs in this area didn't regress",
not "it worked once". **A change is generic** if every struct2flow project would
benefit. One that names this project, a customer, a local incident or a local
path belongs in the `project_config_*.md` files, never upstream.

### What blueprint sync covers

Nobody keeps a list of synced files. The managed set is **derived**: every file
the blueprint's `git archive` ships at the commit sync reads, minus the
project-owned seeds (`TEMPLATE_FILES` in `scripts/blueprint`), so bootstrap and
pull deliver the same set and `.gitattributes` alone decides what ships
(TASK-021). Run `blueprint files` to print it. If you catch
yourself adding a project-specific incident or path to a blueprint-managed
file, move it to the right `project_config_*.md` before committing.

### Your project's `.gitignore` is yours (TASK-048)

`.gitignore` is seeded at bootstrap and is **not** managed, so a
blueprint change to it reaches NEW projects only. A project bootstrapped before
2026-09-16 still excludes the framework's own documents, and every doc link into
them is dead in a clone. To adopt the change:

1. Delete these six lines from your `.gitignore`: `/CLAUDE.md`, `/AGENTS.md`,
   `/AGENT_SIGNAL.md`, `docs/DoD.md`, `docs/PUBLISHING.md`,
   `docs/doing/HANDOVER.md`.
2. Run `git status`. Some of them may already be tracked — a project that
   force-added one keeps it — so "nothing changed" here is a legitimate
   outcome and not a failure.
3. Track whatever is still untracked:

```bash
git add CLAUDE.md AGENTS.md AGENT_SIGNAL.md \
        docs/DoD.md docs/PUBLISHING.md docs/doing/HANDOVER.md
```

Keep `project_config_*.md` ignored — A-27 put the threat model and the infra
account IDs there. If your copy of any of the six has **diverged** from the
blueprint's — a locally edited `AGENTS.md`, say — tracking it publishes that
divergence: run `blueprint drift` and reconcile first, not after. And if you
publish this repo publicly, re-read `docs/PUBLISHING.md` first: its preflight
and its allowlist changed with this.

**`.claude/settings.json` is managed, but a project's own permission rules are
not lost.** Put them in `.claude/settings.project.json`: it is tracked and
project-owned, and it holds only `permissions.allow`/`ask`/`deny`/`additionalDirectories`.
`blueprint pull` lands `settings.json` as the blueprint's file with those lists
merged in, and `drift` compares that merged result. The blueprint's `ask` and
`deny` always win: a project `allow` naming one is dropped, so a rule the
blueprint tightened (BUG-118) cannot be re-allowed from a project. Never
hand-edit `settings.json` for a project rule — the next pull refuses it until
the rule moves to the project file (TASK-042).
