# Codex / Slava review — BUG-001 implementation round 3

**Date:** 2026-07-23
**Reviewed range:** `ecb4fe5..cccf28a`
**Verdict:** **CHANGES REQUIRED — do not push.**

The R-1 through R-5 corrections requested in the prior review are now real.
The full suite passes with 33 assertions in 28.78 seconds; `--fast` passes in
15.44 seconds. `bash -n` and `git diff --check` are clean.

In particular:

- #10 deterministically widens the post-snapshot window and proves all three
  records are emitted exactly once.
- #18 clears the injected short sink on the same supervisor and proves the
  deferred range is delivered intact exactly once.
- #14b now isolates the missing nonce with a live pid and matching start token.
- #6 requires convergence to exactly one supervisor.
- Foreground mode blocks, has no resident `tee`, and writes both sinks.
- #12, #13b, #17, and #19 now exercise the named properties rather than weaker
  proxies.
- `AGENT_FEED_TEST_SLOW_READ` and `AGENT_FEED_TEST_SHORT_SINK` cannot affect
  production behavior when unset. Their placement does not change the normal
  `want = size - off` bounded-read path.

Two blocking findings remain in the expanded gate/workflow scope.

## R-6 — `--fast` removes the central shipped RC-2 regression from pre-push

The suite's policy comment says `--fast` covers every case pinning a defect
that actually shipped, but it skips #2, the 40→80 transcript-scaling case.
RC-2 is not peripheral: unbounded per-transcript followers are one of the two
core mechanisms of BUG-001 and the source of the thousands of resident
processes. #15 proves the current implementation has one supervisor at one
instant; the static `tail -F` grep only rejects one known implementation idiom.
Neither proves that resident process count remains independent of watched-file
count.

This is also inexpensive relative to the stated budget: the measured full/fast
difference includes #2, #10, #18, and all foreground assertions, while the fast
gate is currently about 17 seconds per the handoff. Keep #2 in `--fast`; the
slow deterministic race/fault-injection and foreground cases may remain in CI.
Then remeasure the whole hook under the 30-second ceiling. If #2 alone really
breaks the ceiling on a typical developer host, document that measurement and
choose a cheaper behavioral scaling assertion rather than dropping the core
regression from the blocking gate.

## R-7 — The scanner exit-code fix has no committed regression test

Commit `cccf28a` fixes a defect in two security gates, but the range contains no
test for either scanner's exit-code contract. The handoff reports manual shim
runs; those are useful verification, not a regression that future changes run.
This violates the repository's DoD requirement that every defect-shaped change
have a numbered regression and, where applicable, the reproducer-before-fix
history.

Add a shell regression suite that invokes the hook in an isolated fixture with
`gitleaks` and `semgrep` shims and asserts at minimum:

- exit 0 passes;
- exit 1 blocks and is labelled as a finding;
- exit >=2 blocks and is labelled as a tool failure, not a finding;
- Semgrep exit >=2 followed by 0 retries exactly once and passes;
- Semgrep exit >=2 twice retries exactly once, exposes diagnostic output, and
  fails closed.

Wire the fast deterministic shim suite into pre-push. Give the defect a bug
number and preserve the required reproducer/fix commit ordering, or document a
specific DoD exception if the team determines the existing commit cannot be
split safely.

## Non-blocking observations

- The new `shell-tests` CI job executes the full BUG-001 suite on every
  non-scheduled workflow run and uses a pinned checkout SHA.
- The Semgrep retry and classification logic is sound on direct inspection:
  exit 1 remains a finding, exit >=2 retries once, and a second non-zero result
  fails closed with captured diagnostics.
- Gitleaks correctly distinguishes exit 1 from exit >=2 and fails closed. It
  does not retry tool failures; that is a defensible policy, but the handoff's
  phrase “identical fix” should not imply identical retry behavior.

The BUG-001 implementation and the repaired R-1…R-5 test cases are otherwise
clean. A clean cross-provider authorization needs R-6 and R-7 corrected and the
resulting writer commit handed back for review.
