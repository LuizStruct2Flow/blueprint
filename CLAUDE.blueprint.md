# Blueprint maintenance

This file is imported by [CLAUDE.md](CLAUDE.md) and exists **only in the
blueprint**. It is `export-ignore`d, so no project receives it, and there the
import is skipped because the file is missing. It holds what maintains the
blueprint rather than what operates a project (TASK-021).

## What ships is decided by responsibility

What operates a project, or asks the blueprint for a change (`a2bp`, `prs`),
ships. What maintains the blueprint, publishes the deck, carries the brand or
records this repo's own requirements and work does not. `.gitattributes`
implements it, by directory where it can (`docs/requirements/**` keeping its
README, the lifecycle folders, `docs/config/**`), so the next such document needs
no new line. The managed set is the archive, so a file that stops shipping is
offered for retirement to projects that hold an unedited copy.

**Where a rule goes:** a rule a project follows goes in `CLAUDE.md`, `docs/DoD.md`
or a recipe doc. A rule about maintaining the blueprint goes here. A shipped file
must not link to anything that does not ship: `tests/bootstrap-contents` #12
checks the root `CLAUDE.md` and `README.md` of a real bootstrap, and
`tests/bootstrap-gate` runs `doc-links` over its `docs/`.

**The root `project_config_*.md` files are THIS repo's own config and do not
ship** — the seed source a new project is built from lives in
[`templates/`](templates/README.md). They used to be the same files, so anything
the blueprint wrote about itself propagated to every project (BUG-009). If you
are editing one, ask which you mean: `templates/` if it belongs to every
project, the root copy if it is about this one.

## The blueprint's `main` is its trunk

**Commit and push to `main` like any other struct2flow project.** No branch is
required, no pull request is required, and nothing enforces one.

This used to say the opposite, emphatically, and pre-closed three
rationalisations for ignoring it. It was removed on 2026-09-10 by founder
decision, and the reason is worth keeping because the rule was not silly:

- **What it was protecting is real.** The blueprint's `main` is the trunk every
  derived project pulls from, so anything landing there fans out on their next
  `blueprint pull`. That reach is exactly what a review step would gate.
- **What it got wrong is who was being gated.** A pull request is a request
  made OF someone. On this repo the author, the reviewer and the owner are the
  same person, so the PR was a step taken against oneself — and one that
  `git push` refused to let you skip. **Pull requests exist for external
  collaboration, which is what `blueprint a2bp` files.** That door still works
  exactly as before and is still the only way a derived project reaches this
  repo (`CLAUDE.md` §"Back-propagating").
- **The enforcement had become the problem.** A `pre-commit` hook refused the
  commit, `pre-push` refused the push, and `tests/branch-guard` pinned both. So
  the owner's ordinary workflow required disabling a guard, and a gate someone
  must route around to do their job protects nothing — the same argument BUG-031
  makes about a red CI everyone merges over, and BUG-045 about a local scan
  harsher than CI.

**What still holds, and is now the whole protection:** the pre-push gate runs on
every push, `blueprint a2bp` is still a request rather than a delivery, and a
back-propagation from a derived project still requires a human to merge it.
Nothing about the reach of `main` changed — only who is asked for permission to
use it.

If you want isolation for a risky change, a branch is still available and still
works. It is a tool now, not a rule.

`CLAUDE.md`'s trunk-based bullet used to say the opposite — that the blueprint
was exempt and every contribution there needed a branch and a PR. TASK-019
removed that, and the line survived pointing at a section that no longer
existed, so the file contradicted itself for a while. **When a workflow changes,
every rule that referenced the old one has to be re-read** — they do not fail
loudly, they just quietly describe something that no longer happens.

## Implementing a back-propagation request

`CLAUDE.md` §"Back-propagating" is the requester's side. This is the owner's:
what `blueprint a2bp` filed is a proposal, and the owner **implements it in the
blueprint** — merging it as-is, adapting it, or rewriting it.

Three consequences, stated because the property is behavioural and evaporates
quietly:

- **No automatic merge.** No auto-merge setting, no bot, no tool verb that lands
  a back-propagation.
- **No self-integration without a distinct decision step.** The same person is
  usually on both ends — that is normal — but filing and integrating are two
  acts, separated by reading the diff in the blueprint's context. Landing a
  proposal seconds after raising it is the thing this rule exists to stop, and
  nothing mechanical prevents it.
- **Merging as-is is legitimate *because someone judged it trivial*.** That
  judgement is the step that must not be skipped.

**The ripples are the implementer's, not the requester's.** Deciding which deck
slides, recipe docs and README rows travel with a change is part of implementing
it in the blueprint — so it belongs to whoever does that, in that session, with
the blueprint's whole tree in front of them.
[`docs/A2BP_PLAYBOOK.md`](docs/A2BP_PLAYBOOK.md) addresses them, and its
"same session, no context switch" rule applies to the implementation session.

## The blueprint is derived, not designed

The blueprint is a **living operating system**, not a top-down
specification. Its capabilities are admitted only after they have
**proved themselves in a real project**:

1. A project hits a real requirement (a customer ask, an incident,
   a bug that couldn't have been caught by what already existed).
2. The team builds the fix and captures it as a pattern in that
   project's `project_config_*.md` or `docs/` tree.
3. Once the pattern has survived contact with production — typically
   after the next round of bugs has *not* regressed on it — the
   generic core is back-propagated via `blueprint a2bp`.
4. The next project bootstrapped from the blueprint inherits the
   capability as a default.

What this means for the agent:

- **Do not invent capabilities directly in the blueprint.** New
  capabilities land in a project first, prove themselves, then
  travel up. The exception is when the founder explicitly asks for
  a blueprint-level edit (this file, `docs/DoD.md`, the recipe docs,
  etc.) — those are evolutionary improvements based on lessons
  already accumulated. Commit them to `main` like anything else
  (§"The blueprint's `main` is its trunk").
- **There is a third class the two rules above do not cover:
  blueprint-only machinery.** `scripts/new-project.sh` runs only ever
  *from* the blueprint, because bootstrapping is the one thing a derived
  project never does; the same is true of the code paths that behave
  differently inside the blueprint (`drift`'s self-detection, `a2bp`'s
  own plumbing). "Prove it downstream first" is not merely inconvenient
  for these — it is impossible, since no downstream executes them. Fix
  them in the blueprint directly, with a reproducer that runs in
  `tests/`, and file it as a PR like anything else. Say in the commit
  body why the change could not be proven downstream.
- **Don't over-engineer the blueprint** trying to anticipate
  every project's future needs. Intentional incompleteness is a
  feature — what the blueprint *does* carry, you can rely on.
- **When proposing a `blueprint a2bp`**, the founder will ask: has
  this pattern actually held up here? "We tightened the rule and
  it worked one time" usually isn't enough; "we tightened the rule
  and the next two bugs in this area didn't regress" usually is.

## docs/way-of-working.md is the canonical pitch surface

The deck at [`docs/way-of-working.md`](docs/way-of-working.md) is how
struct2flow is presented to customers, investors, hires, and at talks.
**Every change to a blueprint-level concern lands in the deck in the
same commit** — not "I'll update the deck later". The concerns the
deck currently mirrors:

1. Architecture (DDD + Clean + Hexagonal — `STACK_DEFAULTS.md`)
2. Lifecycle (four states — `docs/DoD.md` §1)
3. Quality (DoD — `docs/DoD.md`)
4. Observability / MALT (`docs/OBSERVABILITY.md` + CLAUDE.md §"Observability is a main concern")
5. Security (`docs/SECURITY.md` + CLAUDE.md §"Security is a main concern")
6. IaC (`docs/INFRASTRUCTURE.md` + CLAUDE.md §"Infrastructure as Code is a main concern")
7. Cost (CLAUDE.md §"Cost is a main concern" + `project_config_overview.md` §"Cost stack")
8. Documentation (`docs/DOCUMENTATION.md` + CLAUDE.md §"Documentation is a main concern" + DoD §6.4)
9. Persona team (radio-over — `AGENTS.md` protocol + `AGENT_ROSTER.example.md` team template, copied to a gitignored per-engineer `AGENT_ROSTER.md`, parsed by the one shared `scripts/lib/roster.sh` so identity resolves by **role** and a rename is one cell + `scripts/agent-activity.sh` live feed and `--whoami` + CLAUDE.md §"Running commands — one per call, chains only when dependent", which is what keeps the per-command allowlist reviewable)
10. Blueprint sync (CLAUDE.md §"Blueprint sync" + this file + README.md §"The sync model" + `scripts/blueprint`)

Tightening a rule in DoD §3? Touch the matching deck slide. Adding a
new principle to CLAUDE.md? New slide(s) under the right section
number. Adding a new CLI to `scripts/`? Update the agent-layer or
sync slide. **Drift between deck and reality reads to a customer the
same way a stale README reads to a new hire** — and the deck is the
pitch surface, so drift is more costly here than anywhere else.

If a change is genuinely internal-only and the deck doesn't need to
mention it (e.g. a typo fix in a comment), say so in the commit
message. Default to updating the deck.

### The blueprint's handoff boxes for a concern change

In addition to DoD §6.4, every push that **changes a blueprint-level concern**:

- [ ] **Deck updated in the same commit** — `docs/way-of-working.md`
      reflects the new concern count, principle, or recipe. PDF
      regenerated (`scripts/build-deck.sh`).
- [ ] **Per-concern recipe doc updated** — if the change touched
      Observability, Security, IaC, Documentation, or Cost, the
      corresponding `docs/<CONCERN>.md` matches.
- [ ] **README concern table matches** — if the change added,
      removed, or renamed a concern, the README table reflects the
      new shape.

What you don't ship: a blueprint-level concern change with the deck left at the
old count (it self-violated twice in one week — this gate is the third-time
backstop), or a deck slide that names "six concerns" when there are seven.

### The blueprint's own documentation stack

The blueprint is itself a project that ships documentation. It uses
Recipe A (single-repo README-only) with extras: `docs/way-of-working.md`
as the public pitch surface, `docs/DoD.md` as the methodology, and the
per-concern recipe docs (`OBSERVABILITY.md` / `SECURITY.md` /
`INFRASTRUCTURE.md` / `DOCUMENTATION.md`).

The same-commit rule applies: any blueprint-level concern change touches
the deck + the per-concern recipe doc + the README concern table in the
same commit. This rule has self-violated **four** times in one week
(Cost concern, "six" → "seven", Documentation itself, persona-team
framing); the gate above is meant to catch the next occurrence at commit
time.

Every one of those was the same shape: a file landed in the blueprint via
`a2bp` (or a direct edit), and the ripples were deferred to "a future session
in the blueprint", which never happened. The fix is procedural:
[`docs/A2BP_PLAYBOOK.md`](docs/A2BP_PLAYBOOK.md) walks the ripple checklist, and
§"Implementing a back-propagation request" above forbids the context-switch.
