# Codex / Slava review — BUG-001 implementation round 5

**Date:** 2026-07-23
**Reviewed range:** `46cf9df..bde02e5`
**Verdict:** **CHANGES REQUIRED — do not push.**

R-8 is fixed. Both gitleaks failure classes now pin that the scanner's own
output reaches the operator, and all 11 scanner assertions pass against the
current hook.

R-9 is fixed in the two edited locations. The agent-activity suite and CI
workflow now describe the actual split: pre-push runs the shipped BUG-001
mechanisms, including #2, plus cheap review-found regressions; CI adds #10,
#18, and foreground mode.

The requested pre-fix precision is now accurate. Replaying the current scanner
suite with `git show ecb4fe5:.githooks/pre-push` produces these results:

- Semgrep exit 2 is misclassified as a finding and is called once rather than
  twice.
- Semgrep 2-then-0 cannot recover and is called once rather than twice.
- Gitleaks exit 2 is misclassified as a secret.
- The gitleaks exit-1 output assertion passes. It is therefore a
  forward-looking behavior pin, not regression evidence.

That matches the qualification in `bde02e5`'s commit message. The message does
not claim that every new output assertion fails on the old hook.

Three remaining claim/proof defects prevent clean authorization.

## R-10 — the project-hook policy comment still repeats the corrected false claim

`.githooks/pre-push-project` still says `--fast` “keeps every case pinning a
defect that actually shipped.” It runs R3, R4, I-2, and I-3, all caught during
review and never shipped. The same block says the omitted cases are “slow
concurrency/failure-injection cases,” which omits foreground mode, and the file
header says the current total is “well under 1 s” although the fast activity
suite alone measured 18.58 s here.

This is the same R-9 policy statement in the actual gate wiring. Correct it from
what the hook executes and update its timing claim.

## R-11 — case #17 claims “next tick” without measuring the next tick

Case #17's heading and pass text say the lone record is emitted “on the next
tick.” `wait_for ... 2` polls for up to two seconds while the configured tick is
0.25 seconds, so the assertion accepts delivery after roughly eight ticks. Its
own comment acknowledges this.

The valuable property is proved: a complete record is emitted without a
successor or force-flush, exactly once, and the offset advances. Either narrow
the heading/pass text to that property or instrument the first tick if exact
next-tick latency is genuinely contractual.

## R-12 — case #19 reports a proof when its prerequisite is absent

When no UTF-8 locale is available, the suite prints that case #19 “cannot prove
the `LC_ALL=C` fix on this host,” but it continues and later reports
`#11/#19 ... ok`, followed by an unconditional suite PASS. In the C locale the
old byte/character bug passes vacuously, as the suite itself explains.

On this host `en_US.UTF-8` was selected and #19 genuinely exercised the fix.
The test contract is nevertheless overstated on hosts without that prerequisite.
Make absence an explicit skip that is not counted as #19 success, or fail if
every supported CI/gate host is required to prove it.

## Verification

- `git diff --check 46cf9df..HEAD` — clean.
- `bash -n` on both suites and both hook files — clean.
- `bash tests/pre-push-scanners/test.sh` — 11/11 green.
- Same suite with the `ecb4fe5` hook — failed on the intended five assertions;
  gitleaks exit-1 output remained green.
- `bash tests/agent-activity-bound/test.sh --fast` — green, including #2
  (18.58 seconds).
- `bash tests/agent-activity-bound/test.sh` — 33/33 green (28.77 seconds).

Per the four-eyes rule, `bde02e5` is not authorized for push. Correct R-10
through R-12, commit, and hand the writer commit back to Codex.
