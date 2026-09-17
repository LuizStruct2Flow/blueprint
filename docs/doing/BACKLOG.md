# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-022** | **Anchor the rules in mechanisms, and shrink what agents must remember.** Founder direction, 2026-09-10: *"I think we should rely in automation and not in agents having all rules in their context and being disciplinated on applying these rules… the md files will be used for documentation, and we will anchor the controls in the ci and development lifecycle."* Triggered by a cross-review of `docs/way-of-working.md` in which two reviewers independently found its strongest untold story was that **controls are required to be checkable and are repeatedly caught lying** — a framing the founder rejected as pitched, while accepting the evidence behind it. Artefacts: [`PLAN-TASK-022.md`](PLAN-TASK-022.md), the rule-enforcement audit as `TASK-022-rule-enforcement.{csv,xlsx}`, and the talk at [`../talk-enforcing-agentic-quality.md`](../talk-enforcing-agentic-quality.md). **Partly landed:** `34d5d00` fixed the trunk rule contradicting itself across CLAUDE.md and DoD §6 — TASK-019 made `main` the trunk and deleted the section two other rules still pointed at — and reframed the landing table on the axis that was wrong all along: **the contributor, not the repo.** The rest is not started. | S2 | Process | **Next-step gate:** the plan's inventory of which rules are prose-only versus mechanically enforced. This session produced eight instances of `docs/config/findings.md` F-002 — checks inferring a property from a proxy satisfiable without it — which is direct evidence for the plan's premise and should be folded in before the rest is sequenced. |
| **TASK-058** | **Lifecycle pass: `doing/` holds only work in flight.** Founder request 2026-09-16 ("we have too many things in doing"). 46 bug rows from the TASK-018 port (BUG-036..109) sat in `doing/` with a stale `OPEN` status. A read-only classification (Vitali) checked each against `origin/main`: 35 fixed rows moved straight to `done/` on the founder's bulk acceptance ("yes, straight to done"), each carrying its fix commit. The 11 still-open bugs and TASK-021/022/024 go to `backlog/` or are cancelled per the founder's call on the review rule. | S3 | Lifecycle | Raised 2026-09-16 by the founder. **Re-open if** `doing/` again holds rows nobody is working on. |


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

