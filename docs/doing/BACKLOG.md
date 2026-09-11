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
| **TASK-023** | **The procedure layer: named procedures move out of always-on prose into scripts, with per-provider pointers — and skills are recorded as ergonomics, never as controls.** Two problems were being conflated under "rely on automation": TASK-022 anchors *invariants* in the lifecycle, and this item fixes *context economy* — the founder's other half of the same sentence, "the md files will be used for documentation". **Measured today:** `CLAUDE.md` is 1214 lines / 10147 words and is in every session's context before the founder types anything, with `docs/DoD.md` (818) read on top by instruction, and the four recipe docs (`OBSERVABILITY` 309, `SECURITY` 304, `INFRASTRUCTURE` 377, `DOCUMENTATION` 292) carrying "choose one of three recipes" decisions a project makes ONCE at bootstrap. `.claude/skills/` does not exist. **The rule this item is built on, and it is the reason skills are not the deliverable:** a control inside one vendor's client binds one provider. Derived from the TASK-022 sheet — of 309 rules, **233 bind nothing, 67 bind every provider *only if* `core.hooksPath` is armed (A-22: a fresh clone is not), 8 bind Claude Code alone (`PreToolUse`), and exactly 1 binds unconditionally (CI)**. Jesko (Codex) proved the 8 empirically in the TASK-022 audit: the no-chain guard does not reach `exec_command`, and he complied *by discipline* while auditing whether rules are enforced by discipline. **So the shape is: the procedure is a SCRIPT** (`scripts/<name>.sh`, testable, one copy, runnable by any provider), **a Claude skill is a thin pointer at it**, a line in `AGENTS.md` is Codex's pointer, and **a CI job running the same script is the only layer that binds everyone**. A skill whose body is a prose checklist is `DoD.md` §1c with a new filename and must not be built. **Candidates, strongest first:** `lcm` — already triggered by the founder typing `lcm`, i.e. a slash command implemented as prose an agent must remember to find in DoD §1c; the wake protocol (four identical numbered steps, in the always-on file only because there was nowhere else); the Sonar triage workflow (five steps plus exact API queries); the major-bug consensus process; the `a2bp` playbook; backlog grooming. **Blocked on TASK-021**, deliberately: a `.claude/skills/` directory needs the same ships-vs-blueprint-only tier decision that the `scaffolding/` + `forge/` split is establishing, plus its `MANAGED_FILES` and `.gitattributes` entries, and deciding that twice is how BUG-051/053/061 each happened. | S2 | KEEP | Raised 2026-09-10 by the founder, asking whether skills could cover some of the TASK-022 requirements — the answer that produced this item is that they cover the *context* half and none of the *enforcement* half. **Promote when TASK-021 lands** and the tier axis exists. Re-open earlier if any procedure is proposed as a skill whose body is prose rather than a pointer at a script, or if a Claude-only mechanism is ever recorded in the enforcement sheet without its `BINDS` value. |
| **TASK-021** | **The `scaffolding/` + `forge/` restructure — TASK-018-TARGET §2, mapped end-to-end before implementation.** Map: [`PLAN-TASK-021-RESTRUCTURE.md`](PLAN-TASK-021-RESTRUCTURE.md) (read-only, against `e5e3600`). **Three stages.** **Stage A — `forge/` alone**, green and pushable on its own: `templates/`, `scripts/new-project.sh` and the six blueprint-only suites move, no path strip is introduced, ~15 file moves, and the terminology inversion (`blueprint`/`both` → `forge`/`scaffolding`, `bp_blueprint_only` → `bp_forge_only`, 11 load-bearing sites) flips here. **Stage A′ — the compatibility release, and it is NOT OPTIONAL:** a `scripts/blueprint` that probes `[ -d "$BLUEPRINT_ROOT/scaffolding" ]` and prefixes only if present, landed while the blueprint is still flat so it is byte-identical in behaviour, then pulled by every derived project *before* Stage B. Without it, `bp_expand_managed_dirs` (`scripts/blueprint:670`) runs `git archive HEAD tests` against a blueprint that no longer has a root `tests/`, `_bp_expand_die` fires fail-closed (BUG-029 R2-S1) inside `read_blueprint_source` — the one path every subcommand goes through — so **`linkedin-watcher-agent`, `storm2flow` and `struct2flow-www` each lose `drift`, `pull` AND `a2bp` at once, including `blueprint pull scripts/blueprint`, which is the recovery path.** Recovery would be a manual `cp` on three machines with no tool saying why: BUG-028 exactly, self-inflicted with the map in hand. `blueprint drift` is mandated at every wake, so this lands on the first session after the push. **Stage B — `scaffolding/`, and it is ATOMIC: ~185 file moves** plus 7 CLI path sites, the bootstrap archive+strip line, the `.gitattributes` split, 37 CI lines, 38 hook blocks, 13 shell-suite fixture fixes and 5 TS sites. Nothing in it is individually green — the moment `scripts/` moves, the blueprint's own gate cannot source `scripts/lib/pipeline.sh`. Iterate with a throwaway all-suites runner, not the ~390 s gate that reveals only the first failure (BUG-057). **Stage C — co-location (R2), incremental per component**, in TARGET §3.2's order. **Verified by probe, and it changes the shape of the work:** `git archive` honours a nested `scaffolding/.gitattributes`, patterns stay relative to the containing directory, and `--strip-components=1` lands them correctly — so the export-ignore lines move **unchanged, byte for byte**, `scripts/lib/suites.sh:96` keeps working, the derived project stops inheriting blueprint-only lines, and the ~46-line TASK-018-phase-1 block dissolves. **Two costs TARGET §2 did not anticipate, both blocking:** (1) `.github/workflows/security.yml` **cannot move** — GitHub Actions discovers workflows only at the repo root — and `CLAUDE.md` + `.claude/settings.json` are pinned the same way by Claude Code, so root-anchored *shipping* files are a third class the two-bucket rule has no cell for; (2) `scripts/blueprint` is sync + a2bp yet **must ship**, contradicting "`forge/` = bootstrap, sync, a2bp, templates". | S2 | OPEN | **BLOCKED on eight founder decisions** — see the map's closing section; the gating ones are §0 (`.github/workflows/`) and §8 (authorize Stage A′). Do not start Stage B until A′ has landed and all three derived projects have pulled it. Re-open if any derived project is found on a `scripts/blueprint` predating A′. |


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

