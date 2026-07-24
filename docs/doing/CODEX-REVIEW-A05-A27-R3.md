# Codex re-review — A-05/A-27 R2-1 follow-up

**Range:** `cb5e432..0e43834`

**Reviewer:** Slava (Codex)

**Date:** 2026-07-23

## Verdict

**APPROVED — no blocking findings.**

R2-1 is fixed, the two-commit reproducer-first history is genuine, and the
Semgrep classifier now fails closed for every reviewed class. I made no source
changes. Per the handoff instruction, I did not push.

## Verified

### (a) Both R2-1 reproducers fail before the fix and pass at HEAD

I archived `9ff0b4e^`, transplanted only
`tests/pre-push-scanners/test.sh` from `9ff0b4e`, and ran it. The suite exited
1 with exactly the two new failures:

- valid JSON + exit 1 + zero results was waved through with hook exit 0;
- valid JSON + non-array `.results` + exit 0 was waved through with hook exit 0.

I then ran the same suite from HEAD. It passed all 15 checks. This establishes
that `9ff0b4e` is a real failing reproducer commit and `0e43834` is the
subsequent fix.

### (b) Classifier soundness

The implementation now validates these independent facts:

1. `.results` must exist and be an array. Invalid JSON, a missing member, or a
   non-array member is `incomplete`.
2. A non-empty validated results array is a `finding`, regardless of exit code.
3. An empty validated results array is `clean` only when Semgrep exited 0.
4. An empty validated results array plus any non-zero exit is `incomplete`.

The focused suite covers the requested classes:

- real finding: blocks as a finding, without retry;
- crash with valid JSON and exit 2: retries once, then fails closed;
- OSError/invalid JSON and exit 1: retries once, then fails closed;
- valid JSON + exit 1 + zero results: retries once, then fails closed;
- valid JSON + non-array results: retries once, then fails closed;
- clean exit 0 + empty results array: passes;
- parallel-only crash: retry includes `--jobs 1` and can recover.

There is no longer a `jq ... || echo 0` path that can turn schema failure into
zero findings.

### (c) Checks run

- `bash -n tests/pre-push-scanners/test.sh` — pass
- `sh -n .githooks/pre-push` — pass
- parent archive + transplanted reproducer — expected fail, both R2-1 cases
- `bash tests/pre-push-scanners/test.sh` at HEAD — pass
- `git diff --check cb5e432..HEAD` — pass

The real hook also reached the exact expected classification path here:
parallel Semgrep exited 2, was classified incomplete, and retried with
`--jobs 1`. This sandbox cannot independently reproduce the claimed host-side
green run because its registry/network environment made the single-job retry
exit 2 as well; the hook correctly failed closed. Therefore Claude's reported
`parallel exit 2 -> single-job exit 0 -> clean` run and ~22-second timing remain
host-side evidence rather than a result reproduced in this Codex sandbox.

## Non-blocking observation

The older high-level comment immediately above the classifier still says
“`>=2` means the scan crashed / did not finish.” The new, more precise
classifier comment and the code correctly treat **any non-zero exit with zero
results** as incomplete. Updating the older prose in a later documentation
cleanup would remove that small internal drift; it does not alter behavior or
block this approval.
