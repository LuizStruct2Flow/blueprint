# Codex four-eyes review — A-22 round 8 / A-09

**Range reviewed:** `origin/main..HEAD` (23 commits)  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-26  
**Verdict:** **CLEAN — push authorized**

## R12 — state-dir regression is blocking

Confirmed both reachability and failure propagation:

- `.githooks/pre-push` sources `.githooks/pre-push-project`.
- The project hook invokes `bash tests/state-dir/test.sh`.
- The real suite exits 0 with all seven assertions and its A-09 `PASS` line.
- In an isolated fixture containing the real project hook and a state-dir test
  forced to print a sentinel and exit 23, the sentinel appeared and the hook
  exited 1 with its A-09 failure message.
- CI's `shell-tests` job also invokes `bash tests/state-dir/test.sh`.

This is an executing, fail-closed gate, not merely a test present in the tree.
R12 is resolved by `7be0055`.

## R12(d) — derived-tree reproducer is non-vacuous

The assertion checks each dispatcher under `$TARGET`, the project produced by a
real `scripts/new-project.sh` bootstrap. It does not grep the source checkout.
The fixture itself is built with `git archive HEAD`, committed as a fixture
repository, and the bootstrap archives that fixture's HEAD into `$TARGET`.

Replayed at the test-only commit:

- `511d71e`: exit 1 because
  `$TARGET/scripts/start-gemini-signal-watch.sh` retained literal
  `{{PROJECT_NAME}}`.
- `1a876c8` / current HEAD: exit 0; all three files in `$TARGET` report their
  placeholder substituted.

The red result is caused by the intended Gemini omission and the green result
by adding the Gemini launcher to `TARGETS`. R12(d) is resolved.

## Full gate

I cannot independently affirm a green full gate in this sandbox. With an
isolated writable `HOME`, `sh .githooks/pre-push` completed gitleaks, but
Semgrep's remote `p/owasp-top-ten` pack failed both the normal and single-job
attempts with exit 2. The hook correctly failed closed before reaching project
tests. This is the same environment/tool-retrieval limitation as round 7, not a
source finding.

Claude reported a full `sh .githooks/pre-push` exit 0 in the operator
environment, including the A-09 `PASS` line. Per the handoff's explicit
operator-verification allowance, that supplies the full-gate evidence this
sandbox cannot reproduce.

## Hygiene note

`git diff --check origin/main..HEAD` still reports trailing whitespace in
pre-existing review/acceptance Markdown records in the range. The gate does not
enforce this check, the new three commits did not introduce it, and rewriting
historical review evidence in this correction round would add unrelated writer
changes. I agree it is non-blocking here.

No blocking findings remain in the three new commits. The previously settled
round-7 checks were not disturbed. Under the cross-provider rule, this clean
review authorizes the push.
