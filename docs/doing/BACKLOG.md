# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-060** | **A Codex persona's feed label shows the model Codex actually ran, not the roster's resolution.** Founder decision 2026-09-17 ("the model actually running"). On Jesko's real dispatch the feed read `[Jesko - gpt-5.6-terra - medium]`, but that label is computed from the roster cell. The only record of what ran is Codex's own session file, `~/.codex/sessions/…/rollout-*.jsonl` (`"model":"gpt-5.6-terra"`, `"reasoning_effort":"medium"`), and `logs/state/codex-runs.log` records no model at all. A Claude subagent's label already reads the model from its transcript. | S2 | Agent team | **In progress.** **What to test:** dispatch a Codex persona; its feed lines and `codex-runs.log` name the model and effort from that run's Codex session file. **Re-open if** a Codex label names a model that run's session did not record. |
| **TASK-061** | **A Codex persona hands the mic back to the Orchestrator's persona, resolved from the roster.** Founder decision 2026-09-17: "to the orchestrator, it can vary from environment to environment and project to project." Jesko set `Holder = Claude Code`, because the Codex run preamble in `scripts/start-codex-signal-watch.sh` and `AGENTS.md` both name "Claude Code", while `Holder` is a persona name. The Orchestrator's name comes from the roster's `Orchestrator` row (`agent-activity.sh --whoami`), never a hardcoded value. | S3 | Agent team | **In progress.** **What to test:** dispatch a Codex persona; it flips back with `Holder` = the Orchestrator's roster name (here `Eto`). **Re-open if** a Codex hand-back names anything but the roster's Orchestrator. |

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

