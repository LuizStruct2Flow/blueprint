# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-065** | **Provider load balancing, in code rather than in an agent's memory.** Founder rule, 2026-09-20, now written as protocol in `AGENTS.md` §"Who does the work": plan review goes to all three providers seeking consensus, code-writing round-robins across providers with quota, a provider at zero quota leaves the rotation until it returns, only Claude orchestrates and pushes, and every provider commits its own work (TASK-066 made that true for Codex). **The rule is stated. It is not enforced, and prose is the weak form** — this is precisely the shape TASK-062 exists to convert, and the failure mode is specific and predictable: the cheapest provider for the Orchestrator to reach is the one it is already running on, so left to convenience every dispatch lands on Claude, two subscriptions pay for nothing, and the four-eyes reviewer has no second blind spot to offer. **The rotation is per ROLE FAMILY, not one global queue** (founder, 2026-09-20): the work picks the role, the rotation picks the provider within it, and `Back-End-1/-2/-3` is one role with three representatives. **The selector must therefore report coverage, not just a name.** When this was written only four role families had all three providers; `309191e` closed the gaps (Christian moved from Senior Architect to Architect-1, Annika and Stefan were added), so every DELIVERY role now rotates three ways while PO, UX and Orchestrator remain deliberately single-provider. **That is the roster of one engineer on one day, and the selector must not assume it** — rosters are per-engineer and gitignored, so a derived project's may cover a role with one provider or none. A role short of a provider rotates across whoever it has, and **never spills into another role** — that would trade competence for balance, which is the one thing this rule must not do. **The rotation turns per WORK ITEM and the agent ends with it** (founder, 2026-09-20): an item is assigned to the next provider with quota, every slice of it runs there, and when the item is done the agent shuts down rather than being resumed into the next one. The cost being avoided is measured, not assumed — one agent resumed three times across slices of TASK-063 went 133k → 167k → 328k tokens for the same quality of answer, carrying a transcript irrelevant to each new slice. **What this owns:** (a) rotation state that survives a session — which provider holds the current item and which is next, held where agent state lives (`logs/state/`, per BUG-020), not in a session's head; (b) a selector the Orchestrator calls instead of choosing, so the choice is a command and not a judgement; (c) **quota detection, which is the hard part and must not be faked** — each CLI signals exhaustion differently and none was designed to be asked, so the honest first version reads a provider's own refusal from a failed dispatch rather than predicting a limit, and records the provider as out until something proves it back. A predicted quota is a guess standing in for a fact, which is `findings.md` F-002 again; (d) the collision the protocol names — when the rotation shrinks to one provider, four-eyes cannot be satisfied, and the answer is to hold and tell the founder, never to let a provider review itself. **Prior art to reuse, not reinvent:** the rotation is per-checkout agent state exactly like the baton, and `scripts/signal-set.sh` is the worked example of one writer publishing atomically so no reader samples a half-written value. **Known unknown:** whether `kimi`, `codex` or `gemini` expose any quota or usage query at all was not established — establish it before designing around its absence. | S2 | KEEP | Founder, 2026-09-20: *"no matter what kind of work I want a load balancing between the providers as long as they have quota"*. **Next-step gate:** find out what each CLI actually reports on exhaustion before building the selector around an assumption. Re-open the moment a dispatch is routed by convenience rather than by rotation — which, until this lands, is every dispatch. |
| **TASK-062** | **EPIC — enforcement in code, not in context: every rule an agent must remember is a rule that will be forgotten.** Founder request 2026-09-17, on accepting TASK-022: *"I want an epic to have even more code and automatic enforcement and less agents having rules in memory / context."* Its input is the audit in [`../done/TASK-022-anchor-rules/`](../done/TASK-022-anchor-rules/). **What this epic owns:** (a) mechanise the audit's MECHANISE rules, cheapest and most-violated first; (b) for every rule that gains a mechanism, delete or shorten the prose it replaces, and prove the mechanism fails on a violation before the prose goes; (c) fix mechanisms that exist but do not bind (BUG-138, 139 and 140 were the first three); (d) keep the audit reproducible. **Explicit non-goal:** mechanising judgement. **The hazard it must not repeat** is `docs/config/findings.md` F-002: a check that infers a property from a proxy it does not imply. **Promoted 2026-09-22** by the founder: *"split this epic in several tasks and go task by task."* The split is [PLAN-TASK-062.md](PLAN-TASK-062.md): drafted by Klaus (PO), reviewed independently by Christian (Claude), Alexey (Codex) and Slava (Kimi), and revised to their consensus. All 43 open MECHANISE rows are accounted for exactly once: 16 tasks, 9 relabelled to judgement and 4 parked. The founder settled the four open questions the same day (the plan's §"Founder decisions"). | S2 | KEEP | **Executed task by task in the plan's §4 order.** Each sub-task becomes its own `TASK-NNN` row when picked up, because the commit-msg hook accepts only `TASK#<n>`. **Re-open whenever** a rule is found that only prose defends. |
| **TASK-069** | **TASK-062-02: two claims the docs make today are false.** Audit rows C110 and D073. (1) `project_config_dod.md:17` and `templates/project_config_dod.md:17` say the secret scan is `gitleaks protect --staged`, but the hook runs `gitleaks detect` over the push range. (2) `docs/SECURITY.md`'s scan table reads as "every push" for trivy and ZAP, which gate deploy and the ECR push, not every push. **Do:** correct both against what the hook and CI actually run, and move rows C110 and D073 out of MECHANISE in the audit CSV in the same commit. This is a doc correction, not a mechanism, per the plan's §2. | S3 | KEEP | **Done when** both claims match the hook and CI, checked by reading them, and both audit rows carry their new disposition. |

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

