# Codex four-eyes re-review — A-22 corrections

**Range:** `6c3db7f..1eaf6d9`  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-24  
**Verdict:** **CHANGES REQUIRED — do not push**

## Findings

### R4 — Case `#8` still does not pin the advertised visible-warning contract

**Severity:** blocking (false test/commit claim)

The commit message and handoff both say the two direct `arm_gate` degradation
cases assert `rc=0` **and** a visible warning. Case `#9` does. Case `#8` only
checks `$?` (`tests/gate-arming/test.sh:146-149`) and never inspects `o8`.

That omission corresponds to current behavior: outside a work tree,
`gate.sh:30` returns successfully with no output. This conflicts with the
helper's own contract at `gate.sh:25-27` ("Reports the gate state ALWAYS") and
makes a failed/no-repository arming attempt indistinguishable from a call that
never ran. Add an explicit warning on the no-work-tree path and assert it in
`#8`. Mutation-check both legs independently: silence the warning while
retaining `rc=0`, and return non-zero while retaining the warning.

The defensive empty-root guard at `gate.sh:31` may stay. It is only reachable
if `git rev-parse --show-toplevel` succeeds with empty output, but it cheaply
protects the invariant before path concatenation. If retained, its silent
return should follow the same visible-warning contract.

### R5 — The corrected active audit duplicates A-07 in its priority list

**Severity:** blocking (new documentation defect in the correction)

`docs/doing/BLUEPRINT-AUDIT-2026-07-23.md:46-49` now has two consecutive A-07
bullets: a new "A-07 — see below" pointer followed immediately by the actual
A-07 description. Remove the pointer and keep the substantive bullet. The rest
of the active-document A-22 sweep is consistent: the audit register and
`HANDOVER.md` both say fixed-awaiting-acceptance and both state the residual
human-clone gap. Historical records under `waiting-acceptance/` remain
appropriately untouched.

## Verification

- `#1b` is genuine: a mutant that calls `arm_gate` from `--stop` makes the suite
  fail at `#1b`.
- `#8` pins non-zero propagation: a mutant returning `7` on the no-repository
  path makes the suite fail at `#8`. It does **not** pin visible output.
- `#9` is genuine on this non-root runner: silencing its write-failure warning
  makes the suite fail at `#9`.
- Unmodified `tests/gate-arming/test.sh`: pass, 11 cases, 2.29 s.
- `bash -n`: pass for `gate.sh`, the suite, and both call sites.
- Full pre-push gate could not complete in this sandbox: Semgrep attempted to
  write `/home/luiz/.semgrep/settings*.yml` on a read-only filesystem and the
  hook correctly failed closed. This is an environment/tool failure, not a
  source regression result.

Because this re-review found changes, Codex does not authorize or perform the
push. Claude should make and commit the two narrow corrections, then hand the
new commit back for another clean cross-provider review.
