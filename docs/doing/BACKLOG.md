# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-063** | **Integrate Kimi as a third watcher-backed provider.** The founder added seven Kimi personas to `AGENT_ROSTER.example.md` on 2026-09-20 (BA-2 Joan, Architect-1 Slava, Front-End-3 Adam, Back-End-3 Jonathan, QA-3 Vijay, Security-2 Florian, Infrastructure-3 Thomas) plus a `Kimi models, best first:` line, and asked for the integration. The `Backing agent` column is free text by design, so the roster PARSED from the start — what was missing was everything downstream. **(a) Model resolution — DONE.** `bp_roster_claude_order` was Claude-only (it grepped a literal prefix) and `bp_roster_model_for_name` had `case "$backing"` arms for `Claude Code` and `Codex` alone. Replaced by `bp_roster_model_order <src> <provider>` plus a `Kimi` arm: the tier indexes the roster's own ranked line, and the supported efforts are read from `${KIMI_HOME:-~/.kimi-code}/config.toml` — the provider's own list, per the Codex precedent, never a hardcoded default. **Every row of the shipped template now resolves**, verified by resolving all 22 against the example roster rather than by suite alone. **(b) Dispatcher + feed** — `scripts/start-kimi-signal-watch.sh` on the shared provider-agnostic poller with `--state OVER_TO_KIMI`, plus the `[KIMI]` arm in `scripts/agent-activity.sh`, so a Kimi run is visible in the one feed instead of silent. **(c) `scripts/claude-agents.sh` needed nothing** — it already filters on `[ "$backing" = "Claude Code" ]`, so no Claude subagent file is generated for a Kimi persona. **The one thing that shaped the design: Kimi's efforts are `low` / `high` / `max` — there is no `medium`.** Six roster cells said `medium`; the founder chose `high` (2026-09-20) over mapping `medium`→`high` in code, because a cell naming an effort the provider does not have is `findings.md` F-002's shape — a value standing in for something it does not imply. Resolution refuses such a cell rather than substituting. **Three things were found by measuring rather than by reading docs, and each would have shipped as a plausible wrong answer:** (i) `kimi-for-coding-highspeed` carries no `support_efforts` key at all, so tier `frontier-3` refuses with a message naming the persona instead of running at an invented setting; (ii) **kimi 2.0.2 refuses `--prompt` combined with `--auto` or `--yolo`** — prompt mode has nobody to ask and already never interrupts, so a dispatcher "hardened" with `--auto` errors on every dispatch. `--help` does not say this; the first dispatch attempt did, and `AGENTS.md` now records it so the next person does not re-add the flag; (iii) BUG-006's `env-namespace` guard flagged `KIMI_HOME` until `KIMI_` joined `CODEX_`/`GEMINI_` in the allowed prefixes — a vendor namespace, which is what that list is for, not the project-specific namespaces (`LWA_`, `REDCARE_`) the rule exists to stop. **Ripples carried in the same commit** (CLAUDE.blueprint.md §deck rule): `AGENTS.md` §"Dispatching Kimi" + the mic-state lists + four-eyes review, the deck's persona-team slides, `README.md`, `CLAUDE.md`, `AGENT_ROSTER.example.md`, `docs/A2BP_PLAYBOOK.md` row F, and the seeds in `templates/`. **Prior art:** FEATURE-007 argued the three-tier roster and named K3 as the middle tier; its guardrail stands and is not re-argued here — a cheap cross-provider reviewer with no measured find-rate is theatre, and the row closes rather than being defended. | S2 | KEEP | Founder, 2026-09-20: *"i added kimi to the roster, please add a new task to integrate kimi"*, and *"it should be also added to the templates"*. **Next-step gate:** lands when the real-dispatch evidence is in — a suite alone is not acceptance for a dispatcher (the founder rejected TASK-059 twice on exactly that). Then `waiting-acceptance/`. |

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

