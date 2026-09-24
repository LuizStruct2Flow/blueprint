# PLAN — TASK-062 draft split (Klaus, revised after three-Architect review)

**Status: DRAFT v2.** Written by Klaus (PO), synthesising independent reviews
from Christian (Architect-1, Claude), Alexey (Architect-2, Codex) and Slava
(Architect-3, Kimi) — `.scratch/review062-christian.md`,
`.scratch/review062-alexey.md`, `.scratch/review062-slava.md`. Applies the
Orchestrator's declared consensus without re-arguing it; states the one real
split (goal d sequencing) for the founder. Not committed, not pushed, baton
untouched.

## 0. What changed from v1, and two citation corrections

**Dropped entirely: Task 0** (porting `scripts/lib/dod-gate.sh` +
`.githooks/pre-push-project` up front). All three reviewers measured the "≥20
rows" claim independently and got different, smaller numbers (Christian: 4
rows point at those two files directly, 15 if every row a task *chooses* to
route there is counted; Alexey: the 20-row claim isn't demonstrated, ten of
the cited rows are duplicate prose citations for two rules, not ten
implementations; Slava: the honest figure is 9 rows across 3 tasks, 13 with
the dropped D020 family — still real, but not 20, and not the entire
quantitative case for a prerequisite). More importantly, Christian and Alexey
both show the port itself is not what v1 described: `dod-gate.sh` is a
**sourced library**, not a script — TASK-067's method migrates a sourced
library only once its last shell caller has migrated — and
`pre-push-project` is itself **sourced by** `.githooks/pre-push` and shares
its parent's `pipe_stage` state, so a two-line `exec node …` shim would
terminate the parent process before `pipe_finish` runs and cannot mutate the
in-process pipeline state 54 call sites depend on. It also carries the
`BLUEPRINT:BEGIN/END` marker a derived project extends below. None of that is
a behaviour-identical translation; it's a boundary redesign. **New checks go
into TypeScript vitest suites** — the BUG-138/`lifecycle-docs` pattern — run
locally through `scripts/run-ts-suites.sh` (exempt from the shell-to-TS rule)
and in CI through the `ts-tests` job. **A port happens only when a specific
remaining mechanism genuinely has no other path, designed and reviewed as its
own item when that task is picked up** — never bundled as a blanket
prerequisite.

**Reframed entirely: what was wave-3 #13** (detecting a `--no-verify`
bypass). All three reviewers reject it as stated, for the same reason: git
does not record whether a local hook ran, so nothing in a pushed range can
prove or disprove it, and a committed "I ran the hook" marker would be
forgeable — exactly the F-002 shape this epic must not repeat. See
§1's TASK-062-15.

**Two factual corrections to v1's citations**, both from Christian:
- **C005/D119** (Holder must be a rostered persona) are validated in
  `scripts/signal-set.sh` and `scripts/lib/dod-gate.sh:523-554` — not at
  `scripts/signal-watch.mts:304`, which only passes `AGENT_ROSTER_FILE`
  through.
- **N025**'s live bare-`ctx.skip()` violation is now at
  `tests/dod-gate/dod-gate.spec.ts:1291`, not `:1135`.

The rest of §0 from v1 stands: the audit (`TASK-022-rule-enforcement.csv`,
last touched 2026-09-17) has 47 MECHANISE rows, 4 already fixed by
BUG-138/139/140 (C005, D018, D099, D119 — named in their own commit
messages), leaving **43 open**. This revision accounts for all 43 (§2).

## 1. Completeness — all 43 open rows, one disposition each

| Row(s) | Disposition | Where |
|---|---|---|
| N025 | Task | TASK-062-01 |
| C110, D073 | Task (doc fix, not a mechanism) | TASK-062-02 |
| C037, C038, C041, D005, D021 | Task | TASK-062-03 |
| D058 | Task | TASK-062-04 |
| D130 | Task | TASK-062-05 |
| D092 | Task, explicitly partial | TASK-062-06 |
| C095 | Task, narrowed to a syntactic sub-rule | TASK-062-07 |
| C040, C042, C044, D007, D022 | Task, contingent on a founder choice (§4) | TASK-062-08 |
| D114, D075, D079 | Task | TASK-062-09 |
| C109, D074 | Parked (dormant — zero suppressions exist) | TASK-062-10 |
| C083, D038, D104 | Parked (dormant — zero snapshot suites exist) | TASK-062-11 |
| D100 | Task, gated on a prerequisite schema | TASK-062-12 |
| D116 | Task | TASK-062-13 |
| C029, D098 | Task | TASK-062-14 |
| D097, D056 | Task, reframed (not bypass detection) | TASK-062-15 |
| C168 | Task, corrected premise, two priced options | TASK-062-16 |
| D086 | Parked (dormant — no `infra/` tree) | §3 |
| C035 | Parked (dormant — no `src/` tree; also judgement) | §3 |
| C052 | Relabel LABEL-UNCHECKED | §3 |
| C053 | Relabel LABEL-UNCHECKED | §3 |
| D093, D094, D095 | Relabel LABEL-UNCHECKED | §3 |
| D020, C031, D121, D124 | Relabel LABEL-UNCHECKED | §3 |

31 rows → 16 tasks (2 of which are parks, tracked as rows not builds), 2 rows
→ parked outside any task, 9 rows → relabelled. 31 + 2 + 9 = 42... plus the 1
row inside TASK-062-10 that was missing from v1 (D074) brings the task-column
total to 32, **32 + 2 + 9 = 43.**

## 2. The tasks

Each gets its own `TASK-062-NN` row under the `TASK-062` epic — one item per
commit, per CLAUDE.md's commit-subject rule; ten sub-items all committing as
bare `TASK#62` cannot move through the lifecycle independently (Christian).
"Evidence" is a measured fact, not a citation count. "Prose deleted" points at
the audit's own `CURRENT_LOCATION` for that row. "Port" states whether the
task needs a legacy-shell edit and, if so, that the port is a separate,
later, single-purpose decision — never a prerequisite bundle.

| # | Rule(s) | Evidence (measured) | Mechanism | Port | ROLE | Size | Prose deleted |
|---|---|---|---|---|---|---|---|
| **TASK-062-01** | N025 | 1 live violation today, confirmed at `dod-gate.spec.ts:1291` | Pin the check now, before dispatch — a `manifest`-suite case that fails on any bare `ctx.skip(` under `tests/`, or a lint rule; the implementer does not choose | none | QA | XS | none (closes a gap in an existing convention) |
| **TASK-062-02** | C110, D073 | 2 confirmed false/misleading claims today: `project_config_dod.md:17` + `templates/…:17` still say `gitleaks protect --staged` (hook runs `detect` over the push range); `docs/SECURITY.md`'s scan table reads as "every push" but trivy/ZAP gate deploy/ECR push, not every push | Doc correction, not code | none | PO | XS | `docs/SECURITY.md` scan-cadence table; `project_config_dod.md`/`templates/…` gitleaks line |
| **TASK-062-03** | C037, C038, C041, D005, D021 | 5 of 33 backlog rows measured missing KEEP/DEFER/OBSOLETE today; real incident history — TASK-032, BUG-024, BUG-025, BUG-026, BUG-030 | `lifecycle-docs` vitest case (BUG-138's own pattern: it fixed D018 entirely this way, no shell touched) | none | Back-End | S | `CLAUDE.md:47-48`; `docs/DoD.md:19,26-27,80` (5 duplicate citations collapse to the check's own message) |
| **TASK-062-04** | D058 | 0 detectable today — the check as originally proposed (grep `{{` in the doc-sync tables) would pass vacuously; the tables hold template rows naming paths this repo doesn't ship (`docs-site/…`) | Two steps: (a) PO writes the project's real doc-sync list first — for this repo, mostly N/A rows, since it ships no `docs-site/`; (b) a check that every path *named* in the list exists in the tree, which fails today until (a) lands | none | PO, then Back-End | S | `docs/DoD.md:183` |
| **TASK-062-05** | D130 | 0 today (no `HANDOVER-*.md` exists), but cheap and permanent | Glob check, `docs/doing/HANDOVER-*.md` must not exist, CI-only | none | Back-End | XS | `docs/DoD.md:241-242` |
| **TASK-062-06** | D092 | Mechanism exists (`session-resume.sh`'s marker check) but isn't wired anywhere | Wire the existing check via a `settings.json` hook entry if that alone suffices; **explicitly partial** — wiring the marker check does not enforce "HANDOVER contains WIP/ephemeral/hazards only," which stays an unchecked residual, named as such in the row | flagged, own decision if `session-start.sh` (legacy, 55 lines) must be touched | Back-End | S | `docs/DoD.md:238-252` (partial credit only) |
| **TASK-062-07** | C095 | 48 bindingless `catch {}` sites in `scripts/`+`tests/` today, most a legitimate fallback | Narrow the claim: a TS-AST/lint check in a vitest suite (not semgrep — semgrep's local config is hard-coded at `pre-push:416`, editing it means touching the 830-line hook) flags a bindingless `catch` with no rethrow and no comment. **Closes only that syntactic sub-rule** — "every error path is captured" stays partially judgement | none | Back-End/Security | M (48 sites to triage) | `CLAUDE.md:182-183` (narrowed, not fully closed) |
| **TASK-062-08** | C040, C042, C044, D007, D022 | Measured: **37 of 173 `done/` rows never transited `waiting-acceptance/`**, 35 of them moved in one commit (`8b8865a`, TASK-058, "the founder's bulk acceptance") | **Contingent — do not build as literally stated.** The property in the rule text ("only the founder's acceptance moves it") is not what a waiting-acceptance-transit check observes; the transit is a proxy for founder sign-off, and the proxy is false on 35/173 rows of real, legitimate history. Two ways forward, founder's call: (a) relabel as judgement (the F-002 reading — "founder accepted" is not a git fact); (b) narrow to rows landed after a stated cutover date, explicitly excluding named bulk-acceptance commits by hash. **Not scheduled until the founder picks.** | none either way | Back-End | S if (b) | `CLAUDE.md:53-64`; `docs/DoD.md:28-29,80-81` |
| **TASK-062-09** | D114, D075, D079 | 5 of 5 findings in `findings.md` today have **no `Status:` line at all** and 0 carry `[SEC]` tags — the format doesn't exist yet, this isn't a check-writing task alone | (a) PO establishes the `Status:` enum (`Open`/`Fixed`/`Deferred`+date/`Accepted`+sign-off) and an upgrade-date field for CVE-tagged findings (D075); (b) a standalone `.mts` + CI check enforces the schema once findings use it | none | PO, then Security | S–M | `docs/DoD.md:187-190,472` (SECURITY.md:345-349,362-364 for D075/D079) |
| **TASK-062-10** | C109, D074 | 0 today — no `nosemgrep`/`nosec`/`eslint-disable` exists anywhere in the tree | **Parked.** A check here passes vacuously and proves nothing until a real suppression exists. Re-open trigger: the first suppression added. | none | — | — | none until re-opened |
| **TASK-062-11** | C083, D038, D104 | 0 today — no snapshot suite exists, no `-u`/`--update-snapshots` anywhere | **Parked**, same reasoning as TASK-062-10, for consistency (v1 inconsistently scheduled this one and parked C109/D086 for the same reason — fixed here). Re-open trigger: the first snapshot suite added. | none | — | — | none until re-opened |
| **TASK-062-12** | D100 | Which bugs the two-commit pattern "applies to" is judgement; inferring "product bug" from files/labels/prose is the F-002 shape | **Gated on a prerequisite.** Add a machine-readable `reproducer required` / `not applicable: <reason>` fact to a bug's row first — the BUG-139 pattern (turning a judgement call into data on the row, not inferring it). Only once that field exists does a git-log order check over *declared* rows become sound. (a) schema field, XS, PO; (b) order check, M, Back-End, blocked on (a). | none | PO, then Back-End | XS + M | `docs/DoD.md:124-126` |
| **TASK-062-13** | D116 | Directly observable fact (`git status --short` output), not a proxy; applies only inside §7F, when a review is required | A flip-time check: any in-scope entry, including untracked, blocks the flip while a review is required | flagged — needs wiring at the flip action (`signal-set.sh`, 302 lines, legacy); an advisory/print-only version needs none, a hard-gated version is its own port decision when picked up | Back-End | S | `docs/DoD.md:221-223` |
| **TASK-062-14** | C029, D098 | 0 today — nothing checks CI status at flip time | A standalone `.mts` querying `gh api`/`gh run list` for the latest pushed commit's status, printed or (if hard-gated) blocking a flip to `OVER_TO_USER` unless the Task field says explicitly "CI in flight" | same as TASK-062-13 if hard-gated; advisory version needs none | Back-End | S–M | `docs/DoD.md:164-165,229-230` |
| **TASK-062-15** | D097, D056 | Git records nothing about whether a local hook ran — this is not detectable, by any of the three reviews independently | **Reframed, not bypass detection.** Name the real mechanism: CI re-runs the checks on the pushed range, and the `release` job (`security.yml:429`) only advances `released` after `secret-scan, sast, sca, commit-subjects, ts-tests` are green — so in this repo a `--no-verify` push cannot fan out to a derived project even though it can land on `main`. Add a **local/CI parity check**: every local-judging gate stage also has a CI counterpart (closing the gap TASK-067's synthesis flagged and never landed — local semgrep runs `p/owasp-top-ten` only, CI adds `p/javascript`+`p/typescript`). **Cites the BUG-005 founder decision (2026-08-02)**, which restored CI-only suites into the local gate for the same reason argued here — a documented precedent for this direction, not a silent reversal of it. Name the residual explicitly: not every local `dod-gate.sh` stage is re-run in CI today, so "CI catches it" covers security checks, not the full gate. | none for the reframe itself; the parity gaps it finds may each need their own fix, sized separately | Security | M | `docs/DoD.md:60,164-165,164` |
| **TASK-062-16** | C168 | **Corrected premise (Slava):** `.githooks/pre-push` contains **no** contamination call site at all — `contamination.sh` runs only from `scripts/blueprint`'s `a2bp` path. There is nothing to "extend"; the absence of a push-time call site *is* C168. | Two options, price both, cite BUG-005's doctrine same as TASK-062-15: (a) **CI-only** push-time scan reading the pushed diff, reusing `contamination.sh`'s checker logic without duplicating its patterns — after-the-fact, protects `released` not `main`; state plainly that contamination publishes a project's identity to every downstream project on the next pull, and CI-only detects after that publication, not before; (b) port **only** `contamination.sh` (477 lines, not the 830-line `pre-push`) and add the new call site to `pre-push-project`, which is a separate, single-purpose port decision when this task is picked up — not bundled with TASK-062-15. | (a) none; (b) `contamination.sh` alone, own decision | Security | M (a) / M–L (b) | `CLAUDE.md:306` |

## 3. Relabelled to judgement, and parked as dormant — not built

**Relabel to `LABEL-UNCHECKED`** (the Orchestrator's declared consensus,
applied without re-arguing):
- **D093, D094, D095** — "did this commit touch a blueprint concern" has no
  observable proxy in the repo; `findings.md` F-002 names eight prior
  instances of exactly this inference shape, and `CLAUDE.blueprint.md`
  already documents that this rule "self-violated four times" before the
  fix that stuck — `docs/A2BP_PLAYBOOK.md`'s ripple checklist, prose read at
  the moment of judgement, not a gate.
- **D020, C031, D121, D124** — correlating the baton's free-text `Task` field
  to specific artefacts in `waiting-acceptance/` is the same shape. (Slava
  proposed building the observable half — "`waiting-acceptance/` is
  non-empty when `State = OVER_TO_USER`" is a fact, not a proxy — but the
  declared consensus relabels the whole family; noted here for the record,
  not re-argued.)
- **C052** — "major bug" is a classification with no repo-observable
  definition, and checking a `PLAN-BUG` file's content for "root cause,
  files, tests, rollback" is a content-quality judgement, not a structural
  fact. (A narrow structural follow-up — do the expected headings exist,
  when such a file exists — is possible but not proposed as a task here;
  it wouldn't establish which bugs needed the file in the first place.)
- **C053** — "Codex and Claude both agree on the plan" before implementation
  is cross-provider review judgement, already covered by DoD §1b rule 4's
  own *Judgement* label.

**Parked — dormant, zero real population today, not worth a vacuous check:**
- **D086** — no `infra/` tree in this repo. Re-open trigger: the first prod
  resource declared.
- **C035** — no `src/` tree in this repo; the rule also requires a
  mock-vs-production classification judgement even where `src/` exists. Park
  for both reasons.
- (C109/D074 and C083/D038/D104 are tracked as TASK-062-10/-11 above, in the
  table, for traceability, but are dispositioned park, not build.)

## 4. Order and evidence

Cheapest and most-violated first, **evidence stated per cluster, not
inferred from citation count** (v1's error, caught independently by all
three reviewers): duplication across CLAUDE.md/DoD.md measures how often a
rule gets re-explained, not how often it's broken.

1. **TASK-062-01 (N025), -02 (doc fixes), -05 (D130)** — zero design
   dependency, near-free, do first.
2. **TASK-062-03 (backlog markers)** — the largest real, measured violation
   in the whole open set: **5 of 33 backlog rows** currently lack their
   marker, with five real incidents behind it (TASK-032, BUG-024/025/026/030).
   This is the correct "most violated" pick, on measured grounds, not the
   BUG-034/TASK-016 citations v1 used — BUG-034 is about
   `BLUEPRINT:BEGIN/END` sync in `pull`, unrelated to backlog markers, and
   TASK-016's finding ("the backlog was not the problem — the gate's
   self-knowledge was") argues the opposite of what v1 cited it for.
3. **TASK-062-04 (D058), -09 (findings schema), -07 (C095, narrowed)** —
   each needs a small prerequisite (a real list, a real schema, a triage
   pass) but no design dependency on anything else in this plan.
4. **TASK-062-06 (D092), -13 (D116), -14 (C029/D098)** — flip-time checks;
   group these together when scheduled, since more than one may end up
   wiring into `signal-set.sh`, and a single port decision (if any is
   needed) should be made once, deliberately, not per-task.
5. **TASK-062-12 (D100)** — blocked on its own schema half landing first.
6. **TASK-062-15 (D097/D056), -16 (C168)** — last: both are security-posture
   changes that deviate from or extend a named prior founder decision
   (BUG-005), both need that doctrine stated in the task text, and C168 in
   particular needs its two options priced before scheduling, not decided
   inside this document.
7. **TASK-062-08 (waiting-acceptance history)** — do not schedule until the
   founder picks between relabel and cutover-date narrowing (§2's table).
8. **TASK-062-10, -11 (parked)** — no schedule; re-open triggers stated.

## 5. Goal (d), audit reproducibility — the one real split

All three reviewers agree the *rejected* PLAN-TASK-022 meta-gate (fail every
unanchored rule, force all judgement machine-readable) should not be rebuilt.
They disagree on what to build instead and when. Both positions, stated
fairly:

**Alexey — a narrow freshness/regeneration task, first, ahead of wave 1.**
Deterministically reproduce row identity, source text and counts; preserve
the human-judgement columns (`VERIFIED`, `STILL_CURRENT`) rather than
deriving them; flag `NEEDS_REVIEW` when a row's source text or location
changes; validate that every open row has a disposition (which this document
now provides once, but will drift again). Alexey's argument for urgency: the
CSV is already five days stale, four fixed rows still say MECHANISE, an
entire new section (TASK-067's shell-to-TS rule) is invisible to it, and this
very revision had to hand-fix seven rows v1 silently dropped — deferral is
demonstrably costly, not theoretical. Alexey explicitly **rejects adjacency
pointers as a substitute** ("adjacency is another proxy, and the existing
corpus was not authored around it").

**Christian — fix the "enforced by" pointer convention before wave 1, defer
the full regenerator.** Each mechanised rule's prose carries
`(enforced: tests/<suite> "<it title>")`; a doc-suite case asserts every such
pointer resolves to a real `it()` title (mechanical — it resolves or it
doesn't); each task updates its own CSV row's `DISPOSITION`/`MECHANISM` in
the same commit, so the audit stays current without a regenerator running at
all. Christian's argument: today CLAUDE.md/DoD.md/AGENTS.md together hold
only ~10 `tests/<suite>` references, so a counter has nothing to count yet —
the convention has to exist before counting it means anything — and building
a full regenerator against prose that waves 1-3 are actively shrinking
re-breaks the regenerator with every wave-1 commit.

**Klaus's recommendation:** do both, but sequence Christian's piece first,
inside wave 1, not as a separate gate. Every task in §2 that closes a row
should carry its "enforced by" pointer as part of its own commit — that's a
one-line convention addition per task the plan already schedules, not new
work. Take Alexey's narrow freshness task as **the** goal-(d) deliverable,
scheduled immediately after wave 1 lands (not after wave 2, as v1 proposed —
Alexey's "deferral is already costly" point is well taken and this revision
is itself evidence of it) rather than before it, because the freshness
task's own value (accurate row identity + `NEEDS_REVIEW` flags) is highest
once wave 1's pointers exist to validate against. This is a compromise, not
a resolution of the adjacency-pointer disagreement — Alexey may still object
that pointers are a proxy for "enforced," and that specific disagreement is
one the founder should rule on directly, not one Klaus can synthesise away.

## Founder decisions, 2026-09-22

The four open questions below are settled:

1. **Goal (d):** Klaus's compromise. Each wave-1 task carries its
   `enforced by: tests/<suite> "<it title>"` pointer and updates its own audit
   row in the same commit, and a doc check asserts that every pointer resolves
   to a real test title. Alexey's narrow freshness task comes right after
   wave 1. The founder chose this with Alexey's proxy objection on the table.
2. **TASK-062-08:** relabelled as judgement. "The founder accepted it" is not a
   git fact, and a folder transit is a proxy for it (F-002). Not built.
3. **TASK-062-16:** the CI-only route. The existing checker scans the pushed
   diff, with no duplicated patterns and no port. Contamination on `main` is
   caught before `released` moves.
4. **TASK-062-06/-13/-14:** warning-only first. They print at mic flip and
   block nothing, so `signal-set.sh` is not ported. Port it later only if a
   warning is shown to be ignored.

**Execution:** task by task, in §4's order. Each sub-task gets a real task
number when it is picked up, because the commit-msg hook accepts only
`TASK#<n>` subjects. TASK-062-01 is TASK-068.

## 6. Open questions for the founder (answered above)

Only the points where the reviews genuinely disagree, or where this document
made a call that changes the epic's shape:

1. **TASK-062-08** (waiting-acceptance transit history) — relabel as
   judgement, or narrow to a cutover date excluding the named bulk-acceptance
   commit? Neither is scheduled until this is picked.
2. **Goal (d) sequencing** — Alexey's freshness/regeneration task first
   (before wave 1), or Klaus's compromise (pointer convention inside wave 1,
   freshness task right after)? And separately: is an adjacency pointer
   ("enforced by") an acceptable form of currency for the audit, or does
   Alexey's proxy objection stand and something else is needed?
3. **TASK-062-16 (C168)** — CI-only push-time scan, or port `contamination.sh`
   alone and add the call site to `pre-push-project`? Both are priced in §2;
   neither is chosen here.
4. **TASK-062-06/-13/-14** — if any of these needs to hard-gate rather than
   advise, that requires touching `scripts/signal-set.sh` (legacy, 302
   lines). Confirm whether an advisory (print-only) version is acceptable
   for a first cut, deferring the port decision, or whether the founder wants
   the port scoped now as its own item.
5. **Who revises again** — per the Orchestrator's brief, this is the one
   synthesis pass; a second review round on this revision would re-litigate
   points already settled by consensus. The founder picks task-by-task from
   here, or asks for one more targeted pass on a named open question only.
