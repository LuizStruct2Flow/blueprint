# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|

| **TASK-012** | **Should the blueprint adopt [ruflo](https://github.com/ruvnet/ruflo), and in which form?** Not *how to use it* — that presumes the answer. **Why now:** 2026-08-18 produced four commits of feed plumbing and seven cross-provider review findings, none of which is why anyone would use this blueprint. The differentiator is the four-state lifecycle, the DoD gates, the cross-provider review rule and the `a2bp` sync model; the feed is infrastructure, and infrastructure is what you buy rather than debug. Founder asked whether an off-the-shelf answer exists, which is ladder rung 1 — *does this need to exist at all* — and nobody had asked it about the feed. **THREE QUESTIONS DECIDE IT, and none needs a commitment to answer.** (1) Does its observability capture a **`codex exec` dispatch**, or only Claude agents? Ruflo advertises 5 providers with failover, but that is MODEL ROUTING — our reviews run a different *harness* (`codex exec`, own sandbox, own context), and that is where the findings come from. If it cannot see the Codex half, it replaces the half of our feed that already works. (2) Does the **lite plugin path** (`/plugin install ruflo-core@ruflo`, *"slash commands only, zero workspace files"*) stay out of `CLAUDE.md`? The full CLI writes to `CLAUDE.md`, `.claude/` and `.claude-flow/` — and `CLAUDE.md` is a `MANAGED_FILES` entry that `blueprint pull` owns, so the full path collides head-on with the sync model. (3) Does the dashboard **replace** `tail -f logs/agent-activity.log`, or sit beside it as a second record — the failure mode this repo has fixed three times (TASK-005, the lifecycle triggers, the forwarding notes)? **Evaluate on the lite path only**; the full one adds Node + TypeScript + Rust and a daemon to a repo that is POSIX `sh`, `jq` and `awk`. **Exit criterion is a recommendation with evidence, not a migration.** **Method and sequencing below** — a `MANAGED_FILES` profile rather than a thin fork, and a no-orchestration bootstrap run FIRST, because it answers whether the differentiator is separable at all and cannot be invalidated by whatever ruflo turns out to do. Compare against [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) as the narrower alternative — 12 hook types, but Claude-only and its subagent handling is the bookend approach BUG-027 just replaced. | S2 | KEEP | Founder, 2026-08-18. **Blocks nothing, but should be answered before more feed hardening lands** — if the feed is going to be replaced, BUG-027's residue and FEATURE-004 are work we would throw away. |

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

