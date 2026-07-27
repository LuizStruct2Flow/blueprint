# Codex / Slava review — BUG-001 implementation round 4

**Date:** 2026-07-23
**Reviewed range:** `cccf28a..46cf9df`
**Verdict:** **CHANGES REQUIRED — do not push.**

R-6 is fixed in behavior: `--fast` now runs #2 and proves the resident process
count remains one while the watched transcript set grows from 40 to 80. The
whole project hook passed here in 18.75 seconds, below the 30-second ceiling.
The full suite passed with 33 assertions in 28.78 seconds.

R-7 is also substantially fixed. The new isolated scanner suite passes against
the current hook and fails against the pre-fix `ecb4fe5` hook for the intended
reasons: Semgrep exit 2 is misclassified as a finding, is not retried, and a
2-then-0 transient cannot recover; gitleaks exit 2 is misclassified as a
secret. That is sufficient evidence for the documented DoD ordering exception;
rewriting history into a synthetic two-commit sequence would add no evidence.

The fixture's non-recursion argument holds. It copies `.githooks/pre-push` into
an isolated repository but does not copy `.githooks/pre-push-project`; the
nested hook therefore has no path back into `tests/pre-push-scanners/test.sh`.

Two remaining claim/proof defects prevent a clean authorization.

## R-8 — “gitleaks equivalents” overstates what the suite proves

The commit body says the 11 assertions cover “exit 1 blocks as a finding and
prints it, exit >=2 blocks as a TOOL FAILURE ... and the gitleaks equivalents.”
The Semgrep cases assert the shim's own output is surfaced. The gitleaks exit-1
and exit-2 cases assert only classification and blocking (plus no retry for
exit 2); neither asserts that `SIMULATED-FINDING` / `shim gitleaks call ...` is
present in hook output.

The implementation currently prints that output, but the regression does not
pin it. Add output assertions for both gitleaks failure classes, or narrow the
claim explicitly. Given BUG-003's diagnosis that suppressed diagnostics made
the gate untrustworthy, pinning the behavior is the better correction.

## R-9 — The fast/full policy comments still make false execution claims

`tests/agent-activity-bound/test.sh` says `--fast` covers defects which
“actually SHIPPED” and then includes review-only R3/R4/I-2/I-3 defects that
were caught before push. The important gate selection is sound, but the stated
criterion is not true.

More concretely, `.github/workflows/security.yml` says the full suite includes
“the slow cases pre-push runs with --fast: #10 ... #18 ... #2 ... and
foreground mode.” Pre-push runs #2 and explicitly skips #10, #18, and
foreground mode. Correct both comments so they describe the real policy:
blocking pre-push covers the shipped BUG-001 mechanisms plus chosen cheap
high-value regressions; CI adds deterministic race/fault-injection and
foreground coverage.

## Verification

- `git diff --check cccf28a..HEAD` — clean.
- `bash -n` on both suites and both hook files — clean.
- `bash tests/pre-push-scanners/test.sh` — 11/11 green.
- Same suite with `git show ecb4fe5:.githooks/pre-push` in an isolated tree —
  fails on the intended Semgrep classification/retry/recovery and gitleaks
  classification assertions.
- `bash tests/agent-activity-bound/test.sh --fast` — green, including #2
  (18.58 seconds standalone).
- `bash tests/agent-activity-bound/test.sh` — 33/33 green (28.78 seconds).
- `bash .githooks/pre-push-project` — green (18.75 seconds).

No test currently confined to CI needs promotion to the blocking gate. #10 and
#18 are deterministic race/fault-injection coverage, and foreground mode pins a
supported contract without representing the shipped leak mechanism; keeping
those in CI is consistent with the measured gate budget and stated split.

Per the four-eyes rule, `46cf9df` is not yet authorized for push. Correct R-8
and R-9, commit, and hand the new writer commit back to Codex.
