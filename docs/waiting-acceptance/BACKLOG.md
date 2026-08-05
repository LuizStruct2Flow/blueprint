# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-002** | **Re-fixed after rejection.** The `commit-msg` hook is client-side, so it could never reach the path every blueprint change takes: GitHub composes the squash-merge subject from the **PR title**, on its own servers. CI compounded it by running `tests/commit-msg-gate/test.sh`, which exercises the hook against fixtures it authored itself. Now: one shared rule (`scripts/lib/commit-subject.sh`) used by the hook *and* by `scripts/check-commit-subjects.sh`, with CI checking the PR title, the branch's commits, and what lands on `main`. | — | KEEP | First rejected 2026-08-05 because `5fe89e0` landed on `main` after the gate shipped. Re-opens if any commit reaches `main` with a subject the rule rejects. |

## What to test

- **The title check bites.** Set a PR title to `chore: something` — CI must fail,
  naming the offending title. Restore it and CI must pass. *(Verified on #23
  before merge: run `31022182435` failed, `31022539412` passed.)*
- **An edited title re-runs CI.** `edited` is not a default `pull_request`
  activity type, so a title changed after a green run would otherwise merge
  unchecked. *(Verified: the edit alone started a fresh run.)*
- **One rule, not two.** `.githooks/commit-msg` carries no regex of its own —
  `grep -F '(BUG|FEATURE|TASK)#[0-9]' .githooks/commit-msg` finds nothing.
- **It fails closed.** A checkout holding the hook but not
  `scripts/lib/commit-subject.sh` refuses to commit rather than passing.
- **Against real history**, not fixtures:
  `bash scripts/check-commit-subjects.sh --range 0097c85..5fe89e0` rejects and
  names the subject; `--range 5fe89e0..aaae771` passes.
- **An empty range is refused**, not reported clean — a shallow clone or wrong
  base must not read as zero violations.
