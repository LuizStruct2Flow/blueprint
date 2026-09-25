# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-081** | **Port `scripts/blueprint`, the sync CLI, whole to TypeScript, so BUG-152 can land.** Founder decision 2026-09-24, asked directly with the cost stated: *"Port scripts/blueprint now."* BUG-152's fix changes `scripts/lib/gate.sh`, which TASK-067 makes a whole-file port to `scripts/lib/gate.mts` behind a sourced adapter. `scripts/blueprint` sources `gate.sh`, and its `_bp_cli_libs` bundles a single-file `pull scripts/blueprint` with the libs it names by `NAME.sh` only. After the gate.sh port that pull would bring the adapter without `gate.mts`, and a derived project's `drift` would die (`tests/managed-references` #3). Teaching the CLI the new dependency is a change to `scripts/blueprint`, so the whole file (2,257 lines) is ported first, exactly the case CLAUDE.md §"Shell to TypeScript" names. **Method:** the TASK-067 port method ([`../done/PLAN-TASK-067-shell-to-typescript.md`](../done/PLAN-TASK-067-shell-to-typescript.md) §"The port method"): a behaviour-identical port behind the exact two-line exec shim, proven by the existing suites, a byte-for-byte differential against the old shell and mutants the suites catch; then the `_bp_cli_libs` change. **Four-eyes:** a Codex review before push; this is the one script every derived project runs. **Design:** [PLAN-TASK-081-blueprint-port.md](PLAN-TASK-081-blueprint-port.md). | S2 | KEEP | **Done when** `scripts/blueprint` is the two-line shim, the differential is identical apart from the plan's named normalisations, a single-file `pull scripts/blueprint` run by the PORTED CLI brings every lib and `.mts` it needs, and the pre-port CLI's single-file pull is announced as unsupported. Founder decision 2026-09-24, *"Accept, announce it."*: a pre-port CLI that pulls `scripts/blueprint` alone gets the shim without `blueprint.mts` and fails loudly until a full pull; the port commit body, the release announcement and the ported `drift` say to update with a full `blueprint pull` (plan §7; the drift line is plan §9 E). **Re-open if** a derived project's `blueprint pull` or `drift` behaves differently from before the port, other than that announced case. |

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

