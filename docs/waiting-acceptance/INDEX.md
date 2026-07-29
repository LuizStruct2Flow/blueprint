# Waiting acceptance — what is actually sitting here

One row per **work item**, not per file. Everything below is pushed to `main`
and waiting on your explicit accept/reject. Nothing here moves to `done/`
without you saying so.

**If you only read one thing:** the two `ACCEPTANCE-JESKO-*` files are the QA
verdicts written for you. The per-item folders are the Codex review trail —
open them only if you want the evidence behind a claim.

| Item | What it delivered | Evidence | Status |
|---|---|---|---|
| **BUG-001** — fork-bomb process leak | The activity feed leaked ~17,400 processes and pegged a host at load 175 for 2.7 days. Now one flock-guarded supervisor tracking byte offsets, no `tail -F` followers. | [BUG-001-fork-bomb/](BUG-001-fork-bomb/) — plan + 12 review rounds | **QA-accepted 2026-07-24**, awaiting founder |
| **BUG-003** — security gate could not tell a scanner *failure* from a scanner *finding* | A broken scanner used to read as a clean pass. Now fails closed. | [BUG-001-fork-bomb/](BUG-001-fork-bomb/) (reviewed in the same rounds) | **QA-accepted 2026-07-24**, awaiting founder |
| **A-01 / A-12 / A-14** — roster + host paths + git identity | Host paths out of committed settings; roster on the `.env` model; bootstrap inherits your git identity instead of hardcoding one. | [A-01-A12-A14-roster/](A-01-A12-A14-roster/) | **QA-accepted 2026-07-24**, awaiting founder |
| **A-05 / A-27** — bootstrap leaks | Bootstrap shipped the blueprint's own work items and copied `.env` into derived trees; all five `project_config_*.md` now ignored before a public push. | [A-05-A27-bootstrap/](A-05-A27-bootstrap/) — 3 rounds | **QA-accepted 2026-07-24**, awaiting founder |
| **A-22** — the pre-push gate was never armed | `core.hooksPath` is repo-local, so a fresh clone had no gate — 12 commits went out ungated. Now armed by `arm_gate` from two paths that already run at wake. | [A-22-gate-arming/](A-22-gate-arming/) — 8 rounds | **NOT accepted** — Jesko's caveat: residual gap for a human who clones and pushes without ever running the feed or drift |
| **A-09** — cross-project log contamination | A redcare Codex verdict surfaced live in *this* repo's feed. Feed + all dispatchers now derive one per-project state dir. Sonar key half fixed too. | [A-09-state-dir/](A-09-state-dir/) | Awaiting founder |
| **BUG-002** — linkedin-watcher name in a generic file | Reopened once (the Gemini half was still literal), fixed with A-09, re-pushed. | [A-09-state-dir/](A-09-state-dir/) | Awaiting founder |
| **A-07** — the `a2bp` pipe was unguarded | `blueprint a2bp` was a bare `cp` — the vector that put BUG-002 and A-09 into the blueprint. Now restores `{{PROJECT_NAME}}` by positional diff, scans **every** staged line without trusting that alignment as an exemption, and verifies that staged and project content remain byte-identical after forward substitution. Explicit `a2bp-allow` and `--force` operator overrides remain. Also closed a **pre-existing `pull` bug**: project names containing `&` or `\` were silently mangled. | [A-07-a2bp-guard/](A-07-a2bp-guard/) — **7 review rounds** | Awaiting founder |

## The two QA verdicts

- [ACCEPTANCE-JESKO-2026-07-24.md](ACCEPTANCE-JESKO-2026-07-24.md) — round 1.
  Rejected BUG-002.
- [ACCEPTANCE-JESKO-ROUND2-2026-07-24.md](ACCEPTANCE-JESKO-ROUND2-2026-07-24.md)
  — round 2. Accepted seven items with executed evidence, **explicitly excluding
  A-22**.

## Why the folders

The work-item folder rule (CLAUDE.md §"Documentation Structure"): an item
needing more than one file to describe it gets its own folder, and the whole
folder travels through `doing/` → `waiting-acceptance/` → `done/` together.
This folder had grown to 30 flat files, 26 of them review records, which made
the lifecycle state unreadable — the exact failure the rule exists to prevent.
