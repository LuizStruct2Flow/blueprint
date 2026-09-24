# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-082** | **A dispatcher for the local junior personas, so their work reaches the feed like everyone else's.** Founder, 2026-09-24, on the first junior dispatch: *"I don't see the logs of what Nils did."* The three junior personas (Timo, Nils, Sanne; `AGENT_ROSTER.md`, Ollama `qwen3-coder-64k:latest`) have no watcher, so the Orchestrator ran `ollama run` from its own shell and the only feed trace was its own tool-call line. Nils's run was backfilled into `logs/agent-activity.log` by hand. **What it builds:** one TypeScript command (`scripts/junior-dispatch.mts`, no new shell) that takes a persona and a brief file, resolves the model from the roster (`bp_roster_model_for_name`), runs Ollama, and writes every output line to the feed as `[<Persona> - Ollama]` (through the same writer the watchers use) and to `logs/state/ollama-runs.log`, with a dispatched line, a finished/FAILED line, exit code and duration. **Not in scope:** autonomous baton dispatch for juniors (they stay Orchestrator-briefed, founder rule 2026-09-23 "only simple tasks"), and applying their output (a chat model returns text; the Orchestrator applies and verifies it). **Overlap:** TASK-065's rotation should treat juniors as their own family; coordinate, do not duplicate. | S3 | KEEP | **Done when** a junior dispatch shows up in `tail -F logs/agent-activity.log` under its persona with no hand work, proven by a test with a stub `ollama`. **Re-open if** a junior run leaves no trace in the feed. |
| **TASK-081** | **Port `scripts/blueprint`, the sync CLI, whole to TypeScript, so BUG-152 can land.** Founder decision 2026-09-24, asked directly with the cost stated: *"Port scripts/blueprint now."* BUG-152's fix changes `scripts/lib/gate.sh`, which TASK-067 makes a whole-file port to `scripts/lib/gate.mts` behind a sourced adapter. `scripts/blueprint` sources `gate.sh`, and its `_bp_cli_libs` bundles a single-file `pull scripts/blueprint` with the libs it names by `NAME.sh` only. After the gate.sh port that pull would bring the adapter without `gate.mts`, and a derived project's `drift` would die (`tests/managed-references` #3). Teaching the CLI the new dependency is a change to `scripts/blueprint`, so the whole file (2,257 lines) is ported first, exactly the case CLAUDE.md §"Shell to TypeScript" names. **Method:** the TASK-067 port method ([`../done/PLAN-TASK-067-shell-to-typescript.md`](../done/PLAN-TASK-067-shell-to-typescript.md) §"The port method"): a behaviour-identical port behind the exact two-line exec shim, proven by the existing suites, a byte-for-byte differential against the old shell and mutants the suites catch; then the `_bp_cli_libs` change. **Four-eyes:** a Codex review before push; this is the one script every derived project runs. **Design:** [PLAN-TASK-081-blueprint-port.md](PLAN-TASK-081-blueprint-port.md). | S2 | KEEP | **Done when** `scripts/blueprint` is the two-line shim, the differential is identical, and a single-file `pull scripts/blueprint` brings every lib and `.mts` it needs. **Re-open if** a derived project's `blueprint pull` or `drift` behaves differently from before the port. |
| **TASK-065** | **Provider load balancing, in code rather than in an agent's memory.** Founder rule, 2026-09-20, now written as protocol in `AGENTS.md` §"Who does the work": plan review goes to all three providers seeking consensus, code-writing round-robins across providers with quota, a provider at zero quota leaves the rotation until it returns, only Claude orchestrates and pushes, and every provider commits its own work (TASK-066 made that true for Codex). **The rule is stated. It is not enforced, and prose is the weak form** — this is precisely the shape TASK-062 exists to convert, and the failure mode is specific and predictable: the cheapest provider for the Orchestrator to reach is the one it is already running on, so left to convenience every dispatch lands on Claude, two subscriptions pay for nothing, and the four-eyes reviewer has no second blind spot to offer. **The rotation is per ROLE FAMILY, not one global queue** (founder, 2026-09-20): the work picks the role, the rotation picks the provider within it, and `Back-End-1/-2/-3` is one role with three representatives. **The selector must therefore report coverage, not just a name.** When this was written only four role families had all three providers; `309191e` closed the gaps (Christian moved from Senior Architect to Architect-1, Annika and Stefan were added), so every DELIVERY role now rotates three ways while PO, UX and Orchestrator remain deliberately single-provider. **That is the roster of one engineer on one day, and the selector must not assume it** — rosters are per-engineer and gitignored, so a derived project's may cover a role with one provider or none. A role short of a provider rotates across whoever it has, and **never spills into another role** — that would trade competence for balance, which is the one thing this rule must not do. **The rotation turns per WORK ITEM and the agent ends with it** (founder, 2026-09-20): an item is assigned to the next provider with quota, every slice of it runs there, and when the item is done the agent shuts down rather than being resumed into the next one. The cost being avoided is measured, not assumed — one agent resumed three times across slices of TASK-063 went 133k → 167k → 328k tokens for the same quality of answer, carrying a transcript irrelevant to each new slice. **What this owns:** (a) rotation state that survives a session — which provider holds the current item and which is next, held where agent state lives (`logs/state/`, per BUG-020), not in a session's head; (b) a selector the Orchestrator calls instead of choosing, so the choice is a command and not a judgement; (c) **quota detection, which is the hard part and must not be faked** — each CLI signals exhaustion differently and none was designed to be asked, so the honest first version reads a provider's own refusal from a failed dispatch rather than predicting a limit, and records the provider as out until something proves it back. A predicted quota is a guess standing in for a fact, which is `findings.md` F-002 again; (d) the collision the protocol names — when the rotation shrinks to one provider, four-eyes cannot be satisfied, and the answer is to hold and tell the founder, never to let a provider review itself. **Prior art to reuse, not reinvent:** the rotation is per-checkout agent state exactly like the baton, and `scripts/signal-set.sh` is the worked example of one writer publishing atomically so no reader samples a half-written value. **Known unknown:** whether `kimi`, `codex` or `gemini` expose any quota or usage query at all was not established — establish it before designing around its absence. | S2 | KEEP | Founder, 2026-09-20: *"no matter what kind of work I want a load balancing between the providers as long as they have quota"*. **Next-step gate:** find out what each CLI actually reports on exhaustion before building the selector around an assumption. Re-open the moment a dispatch is routed by convenience rather than by rotation — which, until this lands, is every dispatch. |

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

