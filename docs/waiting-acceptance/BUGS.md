# Bugs — pushed to main, awaiting founder acceptance

Fixed and pushed; awaiting the founder's explicit acceptance signal before they
move to `docs/done/BUGS.md`. Claude does NOT auto-promote to `done/`. If a
regression is found, the row moves back to `docs/doing/BUGS.md`.

See [README.md](README.md) for the lifecycle.

**"What to test" is a column here, not a separate index.** There used to be an
`INDEX.md` holding the same membership plus per-item test instructions. It
drifted — 5 rows listed against 14 real ones, so nine fixes were invisible to
the only person who can accept them — and the first repair was a test to hold
the two files in step. That is the wrong repair: two records of one fact drift
by construction, and a guard only tells you afterwards. One record cannot
disagree with itself.

**Put the acceptance command in the CHAT, not only in this column.** BUG-022
shipped with `scripts/accept-bug-022.sh` and a pointer in its row, and the
founder still had no idea how to accept it — because this column lives in a file
he would have to open first. Klaus and Alexis both said acceptance instructions
belong where the decision happens.

| # | Bug | Severity | Status | What to test | Detail |
|---|---|---|---|---|---|
| **BUG-138** | **The "artefacts travel with their item" check only sees BUG folders, so a stranded TASK or SPIKE artefact passes.** `docs/DoD.md` §1b rule 8 cites `tests/lifecycle-docs` #3 for plans, reviews, mockups and spike code alike, but the scan matches `BUG-*` folders and `PLAN-BUG-*.md` only. Found 2026-09-17 by the founder: TASK-022's plan and six refreshed audit files sat loose in `waiting-acceptance/`, where a later move would have taken the row and left them behind, and nothing failed. Fixed by hand in `b1b70f0`. | S2 | **LANDED**, CI green on `892d4ca` (2026-09-18) | Move a `TASK-`/`FEATURE-`/`SPIKE-` row to another state folder and leave its `PLAN-*.md` or folder behind: `tests/lifecycle-docs` fails naming it. Two loose files of one item are REPORTED (`looseGroups`), not failed. | **Fix:** the scan covers every item prefix the lifecycle uses (`BUG`, `TASK`, `FEATURE`, `SPIKE`) for both folders and `PLAN-*.md`, and a multi-file item with loose files beside its row is reported. **Regression test:** named BUG-138. **Re-open if** an artefact of any item type can sit in a state folder its row has left. |
| **BUG-139** | **The bug-regression-test check is satisfied by a comment, so a fix can land with no test.** `scripts/lib/dod-gate.sh:425` greps the declared test roots for `BUG-0*<n>\b` in any file. `// BUG-9999` in any spec passes it, and no test title is ever required. DoD §2 calls this the guarantee that every bug ships with a reproducer. Found 2026-09-17 in the TASK-022 audit (rules D027/D099) and confirmed in the source. | S2 | **LANDED**, CI green on `892d4ca` (2026-09-18) | Name a bug in a commit whose only mention in `tests/` is a `// BUG-NNN` comment: the pre-push bug-test stage refuses it. A row carrying `**No regression test:** <reason>` passes. Known limit: a test title split across lines is not matched. | **Fix:** the bug number must appear in a test TITLE (`it(...)`/`describe(...)`), not anywhere in a file. Check first which already-landed bugs would fail the stricter rule and report before changing it. **Regression test:** named BUG-139. **Re-open if** a push naming a bug passes with no test whose title carries that number. |
| **BUG-140** | **The baton check passes an empty or unknown Holder, and never runs in CI.** `dod_stage_signal` (`scripts/lib/dod-gate.sh:460-491`) only checks that the `Holder`, `State` and `Task` rows exist. A hand-edited baton with an empty Holder, or a persona no roster names, is reported well-formed, and `scripts/signal-set.sh --holder NoSuchPersona` publishes it. `AGENT_SIGNAL.md` says `Holder` is a persona name from the roster. Found 2026-09-17 in the TASK-022 audit (rules C004/C005/D119). | S3 | **LANDED**, CI green on `892d4ca` (2026-09-18) | `bash scripts/signal-set.sh --holder NoSuchPersona …` refuses and points at `AGENT_ROSTER.md`; `--holder Nobody` passes. **Not done:** the title's "never runs in CI" half — `.github/workflows/security.yml` still runs only `dod_stage_rows` and `dod_stage_bugtests`. The baton is untracked, so CI has none to check and that half may be moot: accept it as such, or reopen. | **Fix:** `signal-set.sh` refuses a Holder that is not a roster persona (and not the founder's own `USER` convention, if one exists — check), and the gate stage checks the same. **Regression test:** named BUG-140. **Re-open if** a baton naming nobody on the roster is published or passes the gate. |

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
