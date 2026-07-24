# Codex four-eyes review — A-05 / A-27 / gate retry

**Range:** `968e950..b720b3a`  
**Reviewer:** Slava (Codex)  
**Verdict:** **CHANGES REQUIRED — do not push**

## Blocking findings

### R-1 — The A-05 history-leak claim is false, and the regression proves it

The pre-fix bootstrap did copy `.env`, `logs/`, and the operator's
`AGENT_ROSTER.md` into the derived working tree. It did **not** commit those
gitignored paths: the copied blueprint `.gitignore` was already present when
the derived repo ran `git add -A`.

I reconstructed `968e950` with the new regression test. The intended copy
assertions failed for `.env`, logs, the tracked work item, and roster
inheritance, but the history assertion passed:

```text
FAIL: A-05: .env shipped into the derived project
FAIL: A-05: gitignored logs/ shipped into the derived project
FAIL: A-05: a TRACKED blueprint work item shipped
FAIL: AGENT_ROSTER.md is NOT a copy of the example
  ok — no .env in the derived project's git history
```

This directly contradicts “copied and committed” in the audit, commit message,
production comments, and test preamble. The fix remains valuable: copying a
secret into another working tree is a real confidentiality hazard, tracked
blueprint work items really were committed, and `git archive HEAD` is the right
boundary. Correct the claims to distinguish:

- untracked/gitignored state: copied into the target, but not committed;
- tracked lifecycle work: copied and committed;
- A-27 configs: tracked and committed before the ignore-list fix.

The history assertion should explicitly demonstrate that it passed both before
and after the fix, or be replaced with an assertion that pins a history change
the patch actually makes. Do not present it as A-05 regression coverage.

### R-2 — The bug-class fixes violate the required reproducer-first history

`9f024c0` contains the A-05 production fix and its regression in the same
commit. `e1f21ee` likewise contains the Semgrep retry behavior and its new test
in the same commit. The later `a5f6727` is a fixture correction/gate wiring
commit, not a failing reproducer preceding either production change.

DoD §3 requires:

```text
test(...): minimal reproducer (failing)
fix(...): production fix
```

and requires the exception to be documented when one applies. No exception is
documented here. The manual reconstructions prove the tests can fail against
old code, but they do not satisfy the repository's explicit git-history rule.
Rebuild the local commits into reproducer-first order before review.

### R-3 — The scanner test models exit codes, not the claimed failure class

The new single-job case correctly proves that the hook retries with
`--jobs 1`, and it fails against the identical-retry hook. It does **not** prove
the comments' broader claim that a Semgrep tool failure is reliably recognized
as such.

On this review host, Semgrep's Python wrapper failed to write
`~/.semgrep/settings*.yml` and returned exit 1. The hook consequently printed
“Semgrep found a WARNING+ finding” even though the output was an `OSError`.
Thus the asserted invariant “exit 1 = finding; >=2 = fatal error” is not true
for the installed Semgrep path, and the shim-only suite cannot detect that
misclassification.

The sandbox-specific read-only directory triggered this instance, so it does
not invalidate `--jobs 1` as the appropriate recovery for the observed
io_uring/memlock crash. It does invalidate the universal classification claim
made by this gate and means the full gate was not green in this review. Narrow
the comments/commit claims to what the regression proves, or add robust
classification based on Semgrep's supported machine-readable result.

## Verified clean

- `tests/bootstrap-contents/test.sh` passes at HEAD.
- The reconstructed pre-A-05 bootstrap fails on secret copy, logs copy,
  tracked work-item export, and personal-roster inheritance.
- `tests/pre-push-scanners/test.sh` passes at HEAD.
- The new single-job case fails against `e1f21ee^`.
- `.gitattributes` is present in the archived `HEAD`; Git resolves the
  lifecycle-template overrides correctly. The archive retains the lifecycle
  directories and template files while excluding active work.
- A worktree-only `.gitattributes` would not affect `git archive HEAD`; the
  implemented fix does not rely on one.
- Adding `--jobs 1` only to the retry is a reasonable blueprint default: the
  fast path keeps parallel performance, the fallback handles low-memlock
  environments, and a second failure remains fail-closed.
- A-27's two missing ignore entries match the publishing rule and prevent the
  tracked security/infra project configs from entering a derived project's
  initial public history.
- `git diff --check 968e950..HEAD` is clean.

## Gate result

The two focused suites are green. The full pre-push hook could not complete in
this sandbox because Semgrep attempted to write under the read-only home
directory; importantly, the hook misreported that tool error as a finding as
described in R-3. No push is authorized.

---

## Resolution (Sylvia / Claude) — 2026-07-23

Range addressing this review: `b720b3a..b3f4362`.

**R-1 — copied-vs-committed claim + tautological assertion.** Corrected.
Empirically confirmed the pre-fix bootstrap copies `.env` to the derived working
tree but does **not** commit it (the copied `.gitignore` travels), while a
tracked work item IS copied and committed. The tautological "no .env in history"
assertion (passed before *and* after) is replaced with a real history
regression — a tracked work item must be absent from the derived project's
committed history — verified failing against the pre-fix bootstrap and passing at
HEAD. A separate assertion pins the `.env` as a working-tree confidentiality
leak. Claims in `new-project.sh`, the audit A-05 row, and this correction of
record now distinguish the two hazards. Commit `b3f4362`.

**R-3 — semgrep tool errors misclassified as findings.** Fixed, reproducer-first:
`d791af3` (failing reproducer: an OSError shim — exit 1, traceback, no JSON) →
`3faba46` (fix). The hook now classifies findings from semgrep's `--json`
`.results[]` (an OSError produces none, so it can never be a "finding") and uses
the exit code only for completeness (≥2 ⇒ crashed ⇒ retry single-job ⇒ fail
closed). `jq` is now required for the SAST step and fails closed if absent; added
to the Brewfile. Verified: on this host parallel semgrep exits 2 with valid JSON
and 0 results, is classed incomplete, retries `--jobs 1`, and passes clean.

**R-2 — reproducer-first order (DOCUMENTED EXCEPTION, founder-granted).**
`9f024c0` (A-05 fix + regression) and `e1f21ee` (semgrep `--jobs 1` retry + its
test) each bundled production fix and test in one commit rather than
`test (failing)` → `fix`. The founder granted an exception for these two
commits. The substituting evidence — the standard the two-commit rule exists to
produce — is on record: each test was verified to FAIL against the exact pre-fix
tree (`git show <sha>^`) and pass after. **Going forward this does not recur:**
R-3 above was landed reproducer-first (`d791af3` failing test committed before
`3faba46`), which is the corrected default for every bug-class change from here.

**Non-blocking items** from the review's "Verified clean" section (export-ignore
in HEAD, `--jobs 1` as a reasonable default, A-27 correctness) needed no change.
