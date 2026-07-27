# Codex four-eyes re-review — A-22 round 6

**Range reviewed:** `e805278..a6f8b06`, with the complete
`origin/main..HEAD` range independently confirmed as 16 commits  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-24  
**Verdict:** **CHANGES REQUIRED — do not push**

## Blocking finding

### R11 — `tests/pre-push-scanners` still leaks inherited PATH through `osv-scanner`

The handoff's narrower claims are true for `gitleaks` and `semgrep`: the fixture
creates both shims under `$FIX/bin`, and `run_hook` prepends that directory, so
ambient binaries with those names cannot win resolution. A hostile ambient
`gitleaks`/`semgrep` experiment left both binaries uncalled and the suite passed.

The broader claim that the suite has no inherited-PATH leak is false.
`.githooks/pre-push` also probes and executes `osv-scanner`, but the fixture
creates no `osv-scanner` shim. On this host the suite silently uses
`/home/luiz/.local/bin/osv-scanner`. With a hostile ambient `osv-scanner` first
on PATH, the suite returned 1 and three nominally unrelated clean/recovery cases
failed:

```text
HOSTILE_OSV_RC=1 FAIL_COUNT=3 HOSTILE_HITS=1
FAIL: clean scanners should pass, got exit 1
HOSTILE-AMBIENT-OSV
FAIL: a transient semgrep failure should retry and pass (rc=1)
FAIL: retry did not recover a parallel-only failure via --jobs 1 (rc=1)
```

This is the redcare inherited-PATH shape the handoff asked me to confirm or
refute. The fixture must control every executable the hook can discover during
these cases. Add an `osv-scanner` shim whose default behavior is the intended
neutral path, then counterfactually put a hostile same-named binary later on
PATH and prove it is never called.

## Positive-control review

The new `s2f.fixtureprobe` control is sound for its stated purpose. It requires
a successful repo-local config write and exact read-back through the same Git
configuration mechanism used by the absence assertions. It does not write
`core.hooksPath`, so it does not satisfy the condition under test.

I independently removed `git init` from a temporary copy of the suite. The
suite returned 1, emitted no `PASS:` line, and the probe flagged every broken
fixture. Thus the old all-green vacuity is closed. The run emitted 11 `FAIL:`
records on this host, not the commit message's claimed 12; that count should not
be used as fixed evidence, but the required red outcome is reliable.

One presentation weakness remains non-blocking: `mk_clone` records failure and
continues, so individual absence checks can still print `ok` after the fixture
probe has failed. The final process result is red, which preserves the gate.

## Other independent checks

- No `env PATH=… command -v` construct exists in the repository. The proposed
  shell-builtin-prober defect is absent.
- The case-insensitive live-doc sweep leaves only historical review quotations
  of the retracted “not closable client-side” wording. The active `HANDOVER.md`
  wording is corrected.
- `git rev-list --count origin/main..HEAD` returned 16 immediately before this
  verdict. The complete range and its three earlier permission/lifecycle
  commits were inspected; no push-scope ambiguity remains.
- `bash tests/gate-arming/test.sh` passed 11 cases in 2 seconds.
- `bash tests/pre-push-scanners/test.sh` passed in the normal host environment,
  which is precisely why the hostile-PATH counterfactual was necessary.

Because R11 requires a test-source change, Codex does not authorize or perform
the push. Under the cross-provider rule, the writer should fix and commit the
fixture, then hand the resulting range back for a clean review.
