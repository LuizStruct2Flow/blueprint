# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

## Two namespaces, and only one of them is a work item

**`BUG-XXX` / `FEATURE-XXX` / `TASK-XXX` are the lifecycle IDs.** They are what the
commit convention, the regression-test naming rule and these lifecycle folders
key off (CLAUDE.md §"Bug Management", §"Team Workflow").

**`A-NN` is not a work item.** Those are findings from one audit — the
2026-07-23 contamination sweep in
[BLUEPRINT-AUDIT-2026-07-23.md](../config/BLUEPRINT-AUDIT-2026-07-23.md) — in the same
category as a Codex finding ID. A finding is a *claim that something is wrong*;
it becomes work when it gets a `BUG-`/`FEATURE-` number and a row here.

They were being used as though they were work items — folder names, rows in this
table, gate comments — and then extended with new numbers (A-38, A-39) for
findings that had nothing to do with that audit. Live items were renumbered on
2026-07-30. The audit document and everything in `done/` keep their `A-NN` IDs as
historical provenance, because the Codex review documents argue about findings by
those names and renaming them would break the trail they exist to be.

**Rule going forward:** an `A-NN` reference is a citation of history. If you are
about to work on something, give it a `BUG-`/`FEATURE-` number first.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| **BUG-029** | A derived project's test suites never update, while the scripts they test do | S1 | Fixed | **FIX.** `MANAGED_FILES` gains two entries: `tests/` — the first managed **directory** — and `.githooks/pre-push-project`, which has to travel with it. `bp_expand_managed_dirs` (called at the end of `read_blueprint_source`) replaces a trailing-slash entry with the files `git archive HEAD <dir>` ships, so `drift` and both `pull` loops are unchanged. **`git check-attr` is not the query**: a trailing-slash directory pattern in `.gitattributes` does not propagate to the files under it, so it reports `unspecified` for a suite git genuinely drops — `tests/manifest`:139-141 had already rejected it for this and `tests/suite-sync` #1c now pins the trap. **HEAD, not the working tree**, on the same argument as manifest #2b; content still comes from the working tree. **Additive only, no delete path** — the project cannot distinguish "the blueprint dropped this" from "we wrote this", and a prefix delete would take out project-authored suites; the announcement already exists, fail-closed and by name, in `tests/manifest` #1. `bp_should_substitute` now exempts `tests/*`: three suites carry a literal `{{PROJECT_NAME}}` as fixture data, safe only while `tests/` was unmanaged (the BUG-028 self-corruption class). `a2bp` validates a managed directory as a **path prefix**, because `cmd_a2bp` deliberately never resolves a local HEAD to expand from. `.githooks/pre-push-project` and `tests/SUITES.md` are split by `BLUEPRINT:BEGIN`/`END` markers, driving `marker_aware_merge` — built for this and until now used by nothing. **REVIEW R2 (Andreas, Codex) — REJECTED, two findings, both fixed.** **S1: the expansion swallowed failures**, so a broken or empty one degraded to "no test files are managed" and `drift` reported clean and exited **0** over it — BUG-029 reproduced inside its own fix, and the fifth instance of the shape. Now fail-closed: `git archive` and `tar` are run and checked **separately**, never as `x=$(a | b | c)` where only the last stage's status survives (the trap behind BUG-027 finding (b)), and an empty expansion is a hard exit naming the entry. **S2: the substitution exclusion was too broad** — but it was a **call-site bug**, not a pattern bug: `substituted_blueprint_copy` was the one site of five passing an ABSOLUTE path to `bp_should_substitute`, so a leading-component rule matched the checkout's own location and a blueprint under any directory named `tests/` exempted every managed file. Fixed at the call site (it now takes the repo-relative path, with the contract documented on the predicate); the pattern narrowed to `tests/*`. The symptom is on the **comparison** path, not the pulled bytes — the file that lands is correct either way, but drift compares against an unsubstituted copy and reports every templated file drifted forever. **Consequence of fail-closed, accepted deliberately:** a checkout with no `tests/` at HEAD is no longer a usable blueprint, so four suites' minimal fixture blueprints (`drift-in-blueprint`, `pull-behaviour`, `a2bp-contamination`, `staleness/drift-integration`, and `marker-merge`'s tree-only clone, which is now a real git repo) had to start shipping suites. That is a real coupling tax on every future fixture, and it is the price of the alternative being a silent zero-sync. **Regression:** `bash tests/suite-sync/test.sh` (14 assertions, ~3 s, in the gate + CI) — red on the parent at #1, #2, #3, #5, #6, #7, and red on R1 at #8, #8b, #9; plus `tests/bootstrap-gate` #6 (a full pull is a no-op on a fresh bootstrap and its manifest still passes). **One-time cost for existing projects**, stated rather than hidden: the first pull shows ~40 new files, and the markerless→markered hook takes `pull_file`'s asymmetric branch — the project's guards are preserved in `.githooks/pre-push-project.bp-bak` and must be re-appended after `BLUEPRINT:END` once, loudly. **Original report.** `tests/` is not in `MANAGED_FILES`, so a derived project's test suites are frozen at the day it was bootstrapped while `blueprint pull` keeps updating the scripts they test.** Bootstrap seeds the whole tree, so the suites arrive; `pull` then walks `MANAGED_FILES` file by file and `tests/` appears nowhere in it. Every project that exists is already carrying suites that are older than the code under them, and the gap widens on every pull. **The failure is silent in the worst direction**: a stale suite still passes, so the project's gate goes green over assertions written against a version of the machinery it no longer runs — the recurring shape this repo has hit four times (A-22, BUG-004, BUG-018, BUG-028), a mechanism present and reporting nothing, whose silence is indistinguishable from success. BUG-028 is the proof it is not theoretical: a bootstrapped project failed six of its own suites and nothing downstream could ever have told anyone. **What ships is already computed** — BUG-028 made `export-ignore` the predicate for the five blueprint-only suites, so the managed set is the complement of that and does not need a second hand-maintained list. The consumers (`files`, `drift`, `pull`, `a2bp`) all treat entries as plain paths, so the shape of the fix is expanding a directory entry once after `BLUEPRINT_ROOT` resolves, not four new loops. **A hand-listed set of 33 suite paths is the wrong answer**: it drifts the moment someone adds the 34th, which is this bug again one level up. |


**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
