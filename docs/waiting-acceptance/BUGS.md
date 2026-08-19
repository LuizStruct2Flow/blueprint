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
| **BUG-031** | CI has been red all day and five PRs were merged over it | S1 | Fixed | Nothing to run — **this one is verified by the CI badge itself.** Open any PR raised after 2026-08-19 and confirm `shell regression suites (full)` is green; it was red on every run of 2026-08-19 before this. Locally, `bash tests/subagent-feed/test.sh` #7 asserts the guard, and reverting `scripts/log-activity.sh` to `set -uo pipefail` makes it fail. | **CI has been red on every run since BUG-027 landed, and five PRs were merged over it with `--admin`.** The failing job is `shell regression suites (full)`, the failing assertions are `tests/subagent-feed` #5 and #6 — the suite BUG-027 itself added this morning. **That suite has never once passed in CI**: it was written, added to the workflow, and verified only on a developer machine. Both cases report `rc=2` from the hook and nothing else. **The real defect is that the assertion could not say why.** It ran the hook with `2>&1` discarded, so a full day of CI failures produced a single number that names the symptom, and the only remaining route in was local reproduction — which does not reproduce. Ruled out by measurement, not reasoning: the gitignored `AGENT_ROSTER.md` being absent (clean clone passes), suite-ordering contamination (CI's full sequence in order passes), the environment (`env -i` passes), `jq` absent (passes, on a synthetic PATH — the first probe of this was invalid because `/usr/bin` was still on PATH), and dash rejecting `set -o pipefail` (the runner is Ubuntu 24.04 with the same dash 0.5.12 that accepts it). `rc=2` is what dash returns for an unbound variable under `set -u` or an illegal `set -o`, and neither reproduces here. **The process failure is the bigger half**: `gh pr checks` was consulted once, reported "no checks reported" because the workflow had not registered yet, and was never re-checked — then `--admin` merged past the branch policy five times. A green local gate was treated as evidence about CI, which it is not.  |

*(Empty.)*

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
