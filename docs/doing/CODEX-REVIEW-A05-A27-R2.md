# Codex re-review — A-05/A-27 follow-up

**Range:** `b720b3a..cb5e432`

**Reviewer:** Slava (Codex)

**Date:** 2026-07-23

## Verdict

**CHANGES REQUIRED — one security-gate blocker remains. Do not push.**

R-1 and the specific R-3 reproducer are now credible and correctly ordered.
The three requested nominal Semgrep classes work, and a missing `jq` fails
closed. However, the classifier still has an uncovered fail-open case caused by
the same exit-1 ambiguity R-3 is intended to remove.

## Verified

### (a) A-05 history regression

I transplanted the current `tests/bootstrap-contents/test.sh` into a repository
made from `9f024c0^`, committed only that reproducer, and ran it. It exited 1.
In particular, `PLAN-BUG-999` was present in the derived repository's committed
file set. The same test passes at HEAD and confirms both distinct properties:

- the tracked work item is absent from committed history;
- `.env` is absent from the derived working tree.

This genuinely distinguishes copied-but-ignored `.env` from the tracked,
copied-and-committed work item. The corrected A-05 audit row matches the proof.

### (b) R-3 reproducer-first order

I transplanted the test from `d791af3` into a repository made from
`d791af3^`. It exited 1 at the new R-3 assertion: exit 1 plus traceback and no
JSON was still classified as a finding by the parent hook. At HEAD the scanner
suite passes 13/13. The commit ordering is therefore a genuine failing
reproducer followed by the fix.

### (c) Requested nominal classes and `jq`

The HEAD suite verifies:

- a non-empty JSON `.results[]` blocks as a finding without retry;
- valid JSON plus exit 2 is incomplete, retries once with `--jobs 1`, and fails
  closed if the retry also crashes;
- traceback/no JSON plus exit 1 is incomplete, retries once, and fails closed;
- removing `jq` from `PATH` while leaving Semgrep present exits 1 before the
  scanner invocation.

The focused bootstrap and scanner suites pass at HEAD, and `bash -n` passes for
the changed hook and tests.

## Blocking finding

### R2-1 — valid JSON plus exit 1 and no results is accepted as clean

`.githooks/pre-push` currently classifies:

```sh
if results > 0; then finding
elif rc >= 2; then incomplete
else clean
fi
```

That makes **exit 1 + syntactically valid JSON + zero results** clean. I
replayed the R-3 shim with:

```json
{"version":"1","results":[],"errors":[{"level":"error"}]}
```

and exit 1. The hook returned 0 and continued through the gate. Thus JSON
syntax validity is being used as though it proved scan completeness; it does
not. The hook also suppresses a failed `.results[]` extraction with `|| echo 0`,
so valid JSON with a missing or malformed `results` member has the same
fail-open shape.

This contradicts the surrounding premise that exit 1 is ambiguous between
findings and fatal errors, and it overstates these claims:

- “uses the exit code only for completeness (≥2 ⇒ crashed)”;
- “without a reliable parser” / “Invalid JSON is itself the crash signal” when
  only JSON syntax, not the expected Semgrep schema, is validated;
- the broader claim that the revised gate fails closed for scanner failures.

Classify any non-zero exit with zero JSON results as incomplete (or otherwise
prove and validate Semgrep's complete-success schema), and reject missing or
non-array `results` rather than converting the parse failure to zero.
Regression coverage must include valid JSON + exit 1 + zero results and a
valid-JSON/wrong-schema case.

## Other observations

`git diff --check b720b3a..HEAD` reports trailing whitespace on lines 3–4 of
`docs/doing/CODEX-REVIEW-A05-A27.md`. Those lines predate this four-commit range,
so this is not a new-range blocker, but the claim “full gate green” should not
be generalized to a clean whole-tree `git diff --check`.

Running the real hook in this sandbox reached Semgrep, received the host
read-only-settings OSError on both attempts, and correctly blocked as a tool
failure. That environmental failure prevents a full local gate-green
confirmation here; it does validate the invalid-JSON OSError path.
