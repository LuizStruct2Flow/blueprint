# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-020** | **The suite set is derived from the filesystem and `tests/SUITES.md` is deleted, and the TypeScript harness manifest moves under `tests/`. Two founder decisions, 2026-09-10, landed as one change because both rewrite what `tests/manifest` believes about tier and shipping.** **(1) R1 wins over the tier table.** TASK-018-RULES R1 forbids a catalogue of tests, and the one that existed drifted twice in one afternoon while it was being built. `scripts/lib/suites.sh` now derives the suite set from the `*.sh` / `*.spec.ts` files under `tests/` and the tier from the `tests/<suite>/  export-ignore` lines in `.gitattributes`. Compared against every row of the deleted table before deleting it: 43 suites, **zero disagreements**. The residual risk `scripts/lib/pipeline.sh` names — the batch API's per-suite reports are only trustworthy if the expected set comes from a source the runner cannot edit at run time — is answered by the filesystem rather than weakened: `find` consults no vitest config, include glob or reporter. Five manifest cases policing the table are deleted (#2 ghosts, #3 legal tier, #4b retirement declarations, #6 tier rationale, #8 parallelism class), and with #8 goes the taxonomy R5 retires. The RETIRED-SHELL-RUNNERS table and the six dead shell runners it covered are deleted together — #4b required the `.sh` to exist for a row to be valid — and each mutation recipe is carried into its spec's docblock, which is where R6 requires it recorded and R1 says a test's description belongs. The rule is now: **every runner on disk is invoked**, no exemptions. **(2) `package.json` under `tests/`, because managing it at the root is a data-loss bug.** Verified: `pull_file` (`scripts/blueprint`) falls to the legacy whole-file `cp` for a file with no marker vocabulary, and writes no `.bp-bak` on that branch; JSON cannot carry markers and every derived project has its own root `package.json` (STACK_DEFAULTS.md), so listing ours in MANAGED_FILES would silently replace a project's real dependency manifest on the command every wake runs. `tests/` is already a managed DIRECTORY expanded through `git archive HEAD tests`, which is the same query bootstrap answers — so under it, ships and managed are one fact, collision is impossible rather than avoided, and phase 2 becomes one edit instead of two that must agree. `#2c`'s whole managed/shipped split for the toolchain is replaced by a structural check that no toolchain file has wandered back out from under `tests/`. **Phase 1's invariant is unchanged and still asserted:** the TS toolchain ships if and only if a shipping suite is TypeScript. Nothing was migrated and nothing new ships. | S2 | OPEN | Raised and done 2026-09-10 by founder decision. Re-open if a derived project is ever found running a suite the blueprint dropped, or if the export boundary and `.gitattributes` are found disagreeing — both are what `tests/manifest` #2b and #4 exist to refuse. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.


*(Empty.)*
