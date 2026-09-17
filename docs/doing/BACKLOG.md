# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-059** | **Each persona runs on a model tier from the roster, never a hardcoded version.** Founder-approved 2026-09-17. The roster gains a `Model` cell, `<tier>:<effort>`: `frontier` is the provider's best model, `frontier-N` is N places down its ranked list. Codex ranks from `~/.codex/models_cache.json` (visibility `list`, by priority); Claude from one roster line, `Claude models, best first: fable, opus, sonnet, haiku`, whose aliases Claude Code resolves to the newest version. `bp_roster_model_for_name` in `scripts/lib/roster.sh` resolves it; an invalid tier, an unsupported effort or a missing list is an error naming the persona. Codex dispatch passes `-m` and `model_reasoning_effort`, and refuses a cell that does not resolve. `scripts/claude-agents.sh`, run from `scripts/session-start.sh`, writes `.claude/agents/<name>.md` with `model:` and `effort:` for every Claude persona but the Orchestrator. Feed lines read `[Name - model - effort]`, with the model a Claude subagent actually ran on once its transcript records one. | S2 | Agent team | **In progress.** **What to test:** start a session: `.claude/agents/` holds one file per Claude persona with its resolved model and effort; dispatch a Codex persona: the run log shows `-m <slug>`; the feed labels both `[Name - model - effort]`. **Re-open if** a persona runs on a model its `Model` cell does not name, or a bad cell is used without an error. |


## TASK-012 — how to run it, and why not a fork

**The method is a `MANAGED_FILES` profile, not a second repo.** The founder's
instinct was a thin blueprint with orchestration stripped out, as the spike's
vehicle. The separation is right and the fork is not: two blueprints is one fact
recorded twice, and it drifts — the same defect as `INDEX.md` (TASK-005), the
lifecycle triggers when the PR rule landed, and the forwarding notes removed on
2026-08-18. At repo scale it would be the worst instance yet, because nothing
would fail when they diverged.

`MANAGED_FILES` and `new-project.sh` already decide what reaches a derived
project, so "thin" is a profile in the one blueprint.

**THE DELIVERABLE IS FALSIFIABLE: bootstrap a project with orchestration OFF and
see whether the lifecycle, the gates and the sync still hold together alone.**
That is worth doing whatever ruflo turns out to be, because it answers the
question underneath this one — **is the differentiator separable at all?**

- If a no-orchestration bootstrap is coherent, the blueprint is a product with a
  plug-in orchestration socket, and ruflo is a candidate to fill it.
- If it is not, **the orchestration IS the product**, and adopting ruflo means
  adopting a different product rather than a component.

**Do this BEFORE evaluating ruflo.** It needs no third party, it cannot be
invalidated by what ruflo turns out to do, and stripping first would risk
deleting the half of the feed that works — the Codex half — on the strength of a
capability nobody has verified yet.

### The measurement, taken 2026-08-18

| | files | lines |
|---|---|---|
| orchestration — baton, watchers, feed, roster | 18 | 3,150 |
| core — DoD, gates, sync CLI, concern recipes | 18 | 5,892 |

Plus **9 of 37 test suites** are orchestration (3,463 lines), measured on a branch
missing `wait-mic` and `subagent-feed` — so the real figure is higher. Roughly
**40% of the repo**, and effectively all of 2026-08-18.

That number is the argument for asking the question, not for any particular
answer to it.

