# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-069** | **TASK-062-02: two claims the docs made were false.** (1) `project_config_dod.md` and its template named the secret scan `gitleaks protect --staged`; the hook runs `gitleaks detect` over the pushed range (`.githooks/pre-push:307`). (2) `docs/SECURITY.md`'s CI table read as though trivy and ZAP run on every push. It now has a "Runs when" column and says plainly that this blueprint's own CI has no trivy or ZAP job, because it ships no container and deploys nothing. Audit rows D073 moved to ALREADY-OK (the gate always ran, only the prose was wrong) and C110 to LABEL-UNCHECKED (infrastructure scanning has no mechanism here). Authored by Klaus (Claude). He caught that the brief had the two audit IDs swapped. Reviewed by Jesko (Codex), who found the fix had introduced a new false line ("only Deep SAST runs on every push", when secret-scan and SCA do too); Klaus corrected it in `663723a`. **LANDED**, CI green on `663723a` (2026-09-22). | S3 | **What to test:** read `project_config_dod.md`'s secret-scan row against `.githooks/pre-push:307`, and `docs/SECURITY.md`'s CI table against `.github/workflows/security.yml`. Each should say exactly what runs and when. | **Re-open if** either doc again names a command or cadence the code does not run. |
| **TASK-068** | **TASK-062-01: a bare `ctx.skip(` in a test can never land.** Audit row N025, the first TASK-062 sub-task. `tests/manifest` gains `bareSkips`, which walks the parsed TypeScript tree (a mention in a comment or a string does not trip it), and a `#live` case that derives every runner through `scripts/lib/suites.sh`, as the gate does, and refuses any zero-argument `.skip(`. The one live violation (`dod-gate.spec.ts:1291`) now skips with a stated reason via `skipVisibly`. DoD §3 rule 7 carries its `enforced by` pointer, and audit row N025 moved MECHANISE to ALREADY-OK in the same commit. Authored and committed by Vijay (Kimi). Reviewed by the Orchestrator (Claude), who put the bare skip back and saw the check fail on exactly that line. Two notes not taken (no practical trigger): an empty reason `ctx.skip('')` passes, and helper files are not scanned. **LANDED**, CI green on `abf6d9c` (2026-09-22). | S3 | **What to test:** put `ctx.skip()` (no argument) in any `tests/**/*.spec.ts` and run `tests/node_modules/.bin/vitest run --root tests manifest -t 'bare skip'`. It fails, naming the file and line. `ctx.skip('why')` and `skipVisibly(ctx, 'why')` pass. | **Re-open if** a bare `ctx.skip(` lands. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.
