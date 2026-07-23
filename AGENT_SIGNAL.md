# Agent Signal

Shared "radio over" baton for the agent team. `Holder` is a **persona name** from
[AGENT_ROSTER.md](AGENT_ROSTER.md) (e.g. `Sylvia`); the coordination protocol is in
[AGENTS.md](AGENTS.md). On claiming the mic, set `State = ACTIVE` (A2BP).

**Before flipping the mic to `OVER_TO_USER`, walk [docs/DoD.md](docs/DoD.md)
§A–§G.** If `ls docs/waiting-acceptance/` doesn't show the artefacts the
`Task` field claims are waiting, the handoff is not done.

## Current Signal

| Field | Value |
|---|---|
| Holder | Slava |
| State | OVER_TO_CODEX |
| Task | **FOUR-EYES REVIEW of `968e950..HEAD`** (3 commits) — A-05, A-27, and a gate-robustness fix the work forced. I wrote them, so per AGENTS.md I cannot bless them for push. `git diff 968e950..HEAD`: 8 files, +250/-12. **A-05 (`9f024c0`):** bootstrap copied the whole WORKING TREE (`find | cp -R`) then `git add -A`, so a `.env` holding SONAR_TOKEN was copied AND committed into every derived project, along with logs/ and the blueprint's own in-flight docs/doing/ work items (a fresh project opened with the blueprint's active bugs). Two mechanisms: `git archive HEAD` (untracked/gitignored cannot ship) + `.gitattributes export-ignore` (excludes TRACKED work items in the lifecycle folders while keeping structure + templates README/HANDOVER + the empty backlog tables). The roster still follows the .env model: example ships, personal AGENT_ROSTER.md is seeded from it, never inherited. **A-27 (same commit):** `.gitignore` listed only 3 of 5 `project_config_*.md`; the two omitted (security = threat model/adversary/incident; infra = account IDs/state backends) are the most sensitive and were tracked, so a derived project's first public push exposed exactly them. Both added. **`a5f6727`:** the A-05 fixture rebuilt itself with `git add -A`, which respects .gitignore and dropped the tracked-but-gitignored privacy-block files (CLAUDE.md/AGENTS.md/HANDOVER.md), so it wrongly reported them missing — a fixture artifact; the real bootstrap ships them, verified. Fixture now force-adds them. **`e1f21ee` — a real gate defect the work surfaced:** semgrep 1.171 crashed 3/3 runs with `Cannot allocate memory io_uring_queue_init` — its multi-core engine hits this host's RLIMIT_MEMLOCK ceiling (8 MB, a common Linux default) despite 48 GB free; `--jobs 1` passes. BUG-003's retry repeated identically so it could not recover a deterministic failure. The retry now drops to `--jobs 1`. **Verify, and be adversarial — I have written claims that outran the code repeatedly in this thread:** (a) run `tests/bootstrap-contents/test.sh` and confirm it FAILS against the pre-fix bootstrap (`HEAD` before `9f024c0`) on secret+logs+work-item+roster, passes after; (b) run `tests/pre-push-scanners/test.sh` — the new single-job case must FAIL against the identical-retry hook and pass now; (c) confirm `.gitattributes` needs to be IN HEAD for `git archive` to honour it (it reads attributes from the tree being archived), so the fix only works once committed — check I have not left a worktree-only assumption; (d) is `--jobs 1` on the retry the right call for a blueprint hook affecting every project, or should it be surfaced to the founder instead; (e) does any assertion or comment still claim more than it proves. Full gate green without `--no-verify`, 19.9/21.6 s across runs. **REVIEW ONLY — change no source.** Verdict to `docs/doing/CODEX-REVIEW-A05-A27.md`, then flip to Holder=Sylvia / State=OVER_TO_CLAUDE. **Do not push.** |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
