# PLAN — TASK-022: anchor the rules in mechanisms, and shrink what agents must remember

**Status: replanned 2026-09-17 against `26600f5`. Not started.** Replaces the
2026-09-11 plan.

## 1. Goal

Agents should remember less, and fewer rules should generate churn.
A rule that matters becomes a mechanism: CI first, then git hooks, then Claude Code hooks.
A rule that does not matter, or that produces churn without value, is deleted, not automated.
Prose is kept only for judgement no mechanism can make, and it says that it is unchecked.
Measure: `CLAUDE.md` + `docs/DoD.md` go from **2,234 lines to at most 650**, and no rule contradicts a founder decision.

## 2. What changed since 2026-09-11, and what it invalidates

| Change (verified) | Invalidates in the old plan |
|---|---|
| Founder, 2026-09-16: a review finding becomes work only if it is real and practical (DoD §1b rule 4). No mutation work, no re-review rounds for hypotheticals. | §3 "a new control needs a mutant". **Replaced:** a control needs one test that fails when the rule is broken. Nothing more. |
| Founder, 2026-09-16: no separate filing or promotion commits. The handover is committed with the work. The project is "going in circles", and process about process is the failure mode. | Phase 2, the meta-check that fails on any unanchored rule. It needs every rule machine-readable, which is process about process. **Dropped.** |
| The same decisions are recorded only in `HANDOVER.md` §2. `docs/DoD.md` still says the opposite: §1b rule 2 "promote BEFORE starting", §1 "PR merging to main". | Nothing in the old plan. The contradictions go in the first batch. |
| Gate at ~30 s: parallel suites (TASK-055), five `*.release.spec.ts` CI-only suites (TASK-054), `.md`-only pushes skip code stages (TASK-053). | The old plan treated gate cost as a reason to be careful about adding stages. A cheap check can now go in the gate or CI. |
| Blueprint-maintenance rules moved to `CLAUDE.blueprint.md` (209 lines, not shipped, TASK-021). | `CLAUDE.md` is still **1,318** lines, more than the "~1,200" the old plan measured. DoD §1b rule 6 still points at a CLAUDE.md section that has moved. |
| TASK-024, the skills and procedure layer, is cancelled (findings F-005). | Nothing may move prose into skills. Prose is deleted, turned into a mechanism, or kept. |
| The 309-row CSV was built against the old files. | Phase 1 is done, and **it will not be refreshed**. A second description of the rules drifts like any copy. This plan's §4 is built from the current files. When stage 1 lands, the CSV is deleted with it. |
| Coverage is still unmeasured. `tests/vitest.config.ts` has no coverage config, and the blueprint's logic is shell. | Phase 3, "measure coverage for the TS suites", would measure test code, not the product. **Replaced** by founder question Q1. |
| Cross-provider review is still only printed (`dod_stage_judgement`). | Phase 3 "require a review artefact per push" means a filing commit per push. **Dropped:** the rule stays as prose and is labelled unchecked (Q3). |
| CI's `commit-subjects` job checks only `HEAD~1..HEAD` on a push to main, so a 12-commit push checks one commit. CI does not run the DoD rows or bug-test stages at all. | Confirms the old §4 direction, but reverses its default: **CI comes first**, because hooks bind only a checkout whose `core.hooksPath` is armed. |

Kept from the old plan: no auditor agent; the reason for a rule belongs next to
its mechanism, not in a file every agent loads.

## 3. Triage rule, applied to every rule

Ask in order, and stop at the first yes.

1. **Delete** if any of these is true:
   - it restates a mechanism that already enforces it (the error message carries the why, as `no-chain-guard.sh`'s does);
   - it duplicates another section;
   - it is history or provenance (that lives in `git log` and `done/`);
   - it contradicts a founder decision;
   - it has produced commits or review rounds without catching a real defect.

   *Test:* nothing that already works gets worse. The existing suites stay green, and `doc-links` finds no dangling anchor.
2. **Mechanise** if breaking the rule is observable in the repo: files, commits, push range.
   - Anchor it in CI first, and in a git hook only when CI would find it too late to be useful.
   - Use a Claude Code hook only for session behaviour.

   *Test:* one fixture that breaks the rule and makes the check exit non-zero, added to the suite that already covers that area.
3. **Keep as prose** only if it needs judgement, such as quality, review or a user-facing doc sync.
   - At most a few lines, in one place.
   - Labelled unchecked where the DoD lists it, as `dod_stage_judgement` already prints.

   *Test:* it appears exactly once across CLAUDE.md and DoD.md.

## 4. First batch — the highest cost today

Cost means the lines every session loads, plus the churn in the log. Line counts
come from the current files. **D** = delete, **M** = mechanise, **P** = keep as
prose.

| # | Rule (where, lines today) | Verdict | Mechanism, or what remains |
|---|---|---|---|
| 1 | a2bp reference manual: CLAUDE.md §Back-propagating (191) | D → 12 | Already enforced by `scripts/blueprint` (refusals, guard, exit codes). What remains: when to offer it, the command, "exit 3 is filed, not landed". |
| 2 | Four "main concern" sections: CLAUDE.md Obs/Cost/Sec/IaC/Docs (264), plus DoD §6.1–6.4 checklists (183) | D → 40 | One paragraph per concern pointing at its recipe doc, which no session loads. The scanners are already in the hook and CI. The checklists live only in the recipe docs. |
| 3 | Lifecycle restated: CLAUDE.md §Documentation Structure (112) vs DoD §1 (37) | D (CLAUDE.md copy) | `tests/lifecycle-docs`. DoD §1 is the single copy. |
| 4 | "Promote to doing/ BEFORE starting", "row in docs/backlog/" (DoD §1b rules 1–2) | D | Contradicts the 2026-09-16 decision. The row lands in `doing/` with the first work commit. |
| 5 | "PR merging to main" as the landing trigger, plus §1b rule 6's trunk history (DoD §1, §2.2, §1b 6–7: ~35) | D → 4 | Stale since TASK-019. What remains: "landing on main moves the row", with no PR wording. |
| 6 | "Pushed and CI green" as its own commit per item (DoD §7A/§7C, HANDOVER). This is one extra commit per item. | D (Q4) | The row moves to `waiting-acceptance/` in the last work commit. A red CI moves it back. The `released` branch already stops a red commit from shipping. |
| 7 | Every item has a row (§1b 1) and every BUG has a named test (§2.3): hook-only today | **M, CI** | New CI step: run `dod_stage_rows` and `dod_stage_bugtests` over `github.event.before..after`. *Test:* a `tests/dod-gate` fixture where a push range holds a `BUG#n` commit with no test, and the step fails. |
| 8 | Commit subject names its item: CI checks `HEAD~1..HEAD` only | **M, CI** | `check-commit-subjects.sh --range before..after`. *Test:* a `tests/commit-subjects` fixture where the bad subject is not the tip. |
| 9 | Coverage "run and report", with 90/80/75 tiers (CLAUDE.md 30, DoD §3.6 + §4.4 + §7B: ~25). Vacuous here since day one. | D (Q1) | The project's own test-runner thresholds fail CI. `templates/project_config_dod.md` already has the "Coverage mode" section. |
| 10 | Gate internals: CLAUDE.md §Before Every Push (77), DoD §4 (69) | D → 12 | The hook prints its own stages and skip reasons. What remains: the gate exists, `arm_gate` arms it, CI is the backstop, never `--no-verify`. |
| 11 | BUG-005 and release-tier history: CLAUDE.md §Pre-push tolerance (58), DoD §3.7 (13) | D → 3 | `tests/manifest` already enforces it. What remains: "expensive suite → `*.release.spec.ts`". |
| 12 | Test layout, the `.spec.ts` migration recipe, BP_TEST_ROOTS rules: CLAUDE.md §Test Layers + §Test directory layout (105), DoD §2.3 + §3.4 (~70) | D → 20 | `dod_stage_bugtests` and `tests/vitest.config.ts` enforce them. One table stays in the DoD. The migration recipe stays in TASK-047's commit. |
| 13 | Chain rule essay: CLAUDE.md §Running commands (66) | D → 6 | `no-chain-guard.sh` (Claude Code), whose error text already carries the why. What remains: one command per call, pipes allowed, `.scratch/` for message bodies. |
| 14 | Two-commit reproducer procedure (stash-verify, exception list: DoD §3.2 ~18, CLAUDE.md 1) | P → 3 (Q2) | The CI step in #7 checks the test exists. Whether the reproducer comes first stays prose, and `git log` is the evidence. |
| 15 | Cross-provider review of every item (DoD §1b rule 4: 22, §7F/F.1: 35) | P → 8 (Q3) | Judgement, printed unchecked. F.1 shrinks to "review a named commit, not the tree". |
| 16 | Handoff checklist A–H (DoD §7: 115) | D → 25 | A: CI. B: #7. C: `lifecycle-docs`. H: redundant with F.1. What remains: baton via `signal-set.sh`, handover current, what the founder tests. |
| 17 | Doc sync restated three times: DoD §5 + §5.1 README (67), §6.4, CLAUDE.md Docs concern | D → 8 | One rule: a user-facing change updates the project's doc-sync list in the same commit. The prose is kept and unchecked. `doc-links` covers dead references. |
| 18 | Quality bar duplicated: CLAUDE.md §Quality (27), DoD §6 (22) | D (DoD copy) | Prose, kept once in CLAUDE.md. |
| 19 | SonarQube runbook in the always-loaded file: CLAUDE.md (68) | D → 4 | The runbook moves to the `scripts/sonar.sh` header, and the file keeps a pointer. |
| 20 | Wake procedure and drift check: CLAUDE.md §On wake (52) + §Wake-time drift (39) + §Pulling (12) | **M, Claude hook** → 12 | A `SessionStart` hook runs `blueprint drift` and `agent-activity.sh --daemon` (idempotent). *Test:* a `tests/permission-policy` fixture asserting the hook is declared in `settings.json`. What remains: arm the Monitors. |
| 21 | Resume doc, `lcm`, sync, §8/§9 (DoD §10 55, §1c 46, §11 16, §8–9 24) | D → 35 | The handover is committed with the work (2026-09-16). §9 is empty, and §11 duplicates CLAUDE.md. |

**Batch size:**
- 17 delete (#1–6, 9–13, 16–19, 21);
- 3 mechanise (#7, #8 in CI; #20 as a Claude Code hook);
- 2 keep as prose (#14, #15).

**Size:**
- `CLAUDE.md` 1,318 → **≤ 380**;
- `docs/DoD.md` 916 → **≤ 270**;
- together, 2,234 → **≤ 650** (−71%).

`CLAUDE.blueprint.md` (209) and `AGENTS.md` (330) are out of this batch.

## 5. Stages

1. **Delete (#1–6, 9–19, 21).** The DoD first, then CLAUDE.md, one `TASK#22:` commit per file. A rule that stage 2 will mechanise keeps its prose until then.
   - *Value:* about 1,580 fewer lines loaded or read by every agent. The four contradictions with founder decisions are gone. One commit per item disappears (#6).
2. **CI anchors (#7, #8).** One workflow step each, with one fixture each.
   - *Value:* three rules go from "binds only if hooks are armed" to "binds every agent and every machine". Right now, a fresh clone or a Codex push is unchecked.
3. **Session hook (#20).**
   - *Value:* about 90 lines of wake instructions become a hook. The drift check stops depending on memory. This binds Claude Code only.
4. **Tell the derived projects.** One note to storm2flow when it lands on `released`.
   - *Value:* their next `blueprint pull` shrinks CLAUDE.md and DoD, and they learn that coverage tiers now live in their `project_config_dod.md`.

No stage 5. Whether a later batch is needed (AGENTS.md, CLAUDE.blueprint.md) is decided after measuring stage 1, not now.

## 6. Verification

- `wc -l CLAUDE.md docs/DoD.md` meets the targets in §4.
- The full pre-push gate and CI are green. `doc-links` catches anchors into deleted sections, and `lifecycle-docs` and `manifest` are unchanged.
- Each mechanism in stages 2–3 has one fixture that breaks the rule and turns the check red, run once before commit.
- `grep -c` per kept rule: each appears once across CLAUDE.md and DoD.md (§3 test 3).
- No stage adds a filing, promotion or narration commit. `git log` for TASK#22 shows only work commits.

## 7. Known limits

- **CI detects, it does not prevent.** A bad push reaches `main` and is fixed forward. `released` is what keeps it from derived projects.
- **A new-branch push has no `before` SHA.** Steps #7 and #8 then fall back to the tip commit and print that they did.
- **Hooks bind unevenly.** The #20 session hook and `no-chain-guard` bind Claude Code only. Codex and Gemini sessions get neither.
- **Judgement rules stay unchecked:** quality bar, cross-provider review, user-facing doc sync. They are labelled as unchecked, not presented as enforced.
- **The deleted provenance survives only in `git log` and `done/`.** A future author who removes a check may not see why it existed. The mitigation is the header comment beside each mechanism, which already exists for most.
- **Derived projects inherit the shrink on pull.** A project that relied on CLAUDE.md's coverage tiers must restate them in its own `project_config_dod.md`.
- **Spawned personas.** If `SessionStart` also fires for them, the feed daemon is idempotent per repository, so a second start is a no-op (the BUG-001 guard).

## 8. Founder questions

- **Q1 — Coverage.** Delete the generic tiered-coverage rule (#9) and leave thresholds to each project's runner config? The alternative is to keep 90/80/75 as a generic default in `templates/project_config_dod.md` only. *Default: delete from CLAUDE.md and DoD, keep the template section.*
- **Q2 — Reproducer first.** Keep "failing reproducer commit, then fix" for product bugs as prose? Or drop it to "a bug fix carries a test naming it", which CI checks (#7)? *Default: keep, without the stash procedure and exception list.*
- **Q3 — Cross-provider review.** Required for every item, or only for major bugs and core-path changes? *Default: major bugs and core paths only.*
- **Q4 — Acceptance move.** Should the row move to `waiting-acceptance/` in the last work commit, before CI reports? That ends the separate "pushed and CI green" commit per item, and a red CI moves the row back. *Default: yes.*
- **Q5 — Deck in the same commit.** `CLAUDE.blueprint.md` requires the deck to change in the same commit as any concern change, so this batch drags `docs/way-of-working.md` edits along with it. Drop that rule and update the deck when it is next presented? *Default: drop.*
