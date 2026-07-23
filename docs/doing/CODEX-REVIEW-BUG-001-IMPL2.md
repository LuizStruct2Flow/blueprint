# Codex / Slava re-review — BUG-001 implementation fixes

**Date:** 2026-07-23
**Reviewed range:** `8c8bd36..ecb4fe5`
**Verdict:** **CHANGES REQUIRED — do not push.**

The four source fixes requested in the first implementation review are present,
and direct behavioral verification confirms the serious FD-9 defect and its
repair:

- `read_state()` now requires pid, nonce, and start token.
- signal change detection now uses a content checksum, so same-size rewrites
  are visible.
- `pump()` advances only after prefix materialization and emission both
  succeed.
- the supervisor body runs with FD 9 closed to descendants. Running the new
  suite against the `8c8bd36` script fails the SIGKILL/restart case with
  `already running` and zero replacement supervisors; it passes against
  `ecb4fe5`. This is a genuine regression test, not a static or tautological
  assertion.

The implementation review is nevertheless not clean. The commit says it
honours the rev-5 test contract, but multiple cases in `PLAN-BUG-001.md` §4 are
missing or materially weaker than that contract.

## Blocking test-contract findings

### R-1 — Cases #10 and #18 are absent

There is no deterministic append-during-read test and no short-sink test. The
suite contains neither the test hook specified by case #10 nor any injected
short read/materialization/emission failure.

Consequently it does not prove either of these agreed byte-exactness rules:

- a concurrent append during the bounded snapshot read is emitted exactly
  once, with neither a gap nor a duplicate;
- a short sink emits and advances nothing, then retries the full range intact.

These cases were explicitly added to pin the hardest concurrency and failure
semantics in the offset design. Static inspection of the happy path is not an
equivalent regression.

### R-2 — The missing-nonce assertion does not isolate a missing nonce

Case `#14b` writes both a missing nonce **and** `token=whatever`, while naming
`pid=$$`. The old `8c8bd36` implementation therefore rejects the state because
the token does not match, and the assertion passes even though that
implementation accepts a missing nonce.

This was confirmed by running the new suite against the baseline: `#14b`
prints `ok`. Construct a state file with the live supervisor's real pid and
matching start token, omit only the nonce, then assert fail-closed behavior.

### R-3 — Foreground behavior from cases #5 and #15 is not tested

The suite tests daemon return/status/stop and counts daemon supervisors. It
never starts the script in foreground, never proves that foreground blocks,
never proves foreground has exactly one resident process, and never verifies
foreground output without `tee`.

### R-4 — Concurrent stop/start still accepts zero supervisors

Case #6 uses `[ "$n" -le 1 ]`, the exact weak shape rejected in round one. The
baseline run demonstrates the problem: this case reports success with `n=0`.
The contract says “no wedged lock, no double start”; zero is the wedged/no-feed
outcome and must fail. Require convergence to exactly one running supervisor,
then stop it cleanly.

### R-5 — Several named properties are only partially asserted

- Case #12 says “force-flushed once” but merely waits for one matching log
  line. It does not assert exactly one force-flush, exact payload emission, or
  offset advancement/no re-read loop.
- Case #17 checks eventual emission within eight seconds, not “the very next
  tick” or exact offset advancement by the record byte length.
- Case #13 checks stale `--status`, but does not call stale `--stop` and prove
  that it exits cleanly without signalling anything before restart.
- Case #19 neither selects nor verifies a multibyte UTF-8 locale, although the
  contract explicitly requires that precondition so removal of `LC_ALL=C`
  genuinely fails.
- Case #1 uses 20 starts rather than the specified 50. Case #2 uses 30 then 90
  transcripts rather than 40 then 80. Those count changes are not inherently
  weaker in every dimension, but they are undocumented deviations from the
  claimed contract.

## Other range / gate findings

- `git diff 8c8bd36 ecb4fe5` changes four files, not the stated three: it also
  adds the previous review document and changes `AGENT_SIGNAL.md`.
- `git diff --check 8c8bd36 ecb4fe5` reports trailing whitespace on lines 3–4
  of `docs/doing/CODEX-REVIEW-BUG-001-IMPL.md`.
- The focused suite passes against `ecb4fe5` in about 17 seconds.
- The focused suite fails against the `8c8bd36` script on same-size signal
  edits and FD-9 SIGKILL recovery. It also exposes the weak `#6` and `#14b`
  assertions described above.
- `.githooks/pre-push-project` passes in about 17 seconds, and `bash -n` passes
  for the script and suite.
- The full `.githooks/pre-push` could not be completed in the Codex sandbox:
  its Semgrep pack lookup failed after Semgrep's config/log writes were
  redirected from the read-only home directory to `/tmp`. This is an
  environment limitation, not a green gate result.

The source corrections appear sound on direct review, and the FD-9 regression
is confirmed. A clean four-eyes authorization still requires the behavioral
contract to be real: implement R-1 through R-5, demonstrate the corrected
assertions fail for the intended reason against the relevant baseline/mutant,
run the full gate in an environment where Semgrep can complete, and hand the
new writer commit back for review.
