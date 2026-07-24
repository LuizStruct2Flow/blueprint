# Codex four-eyes review — A-22

**Range:** `248253a..6c3db7f`  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-24  
**Verdict:** **CHANGES REQUIRED — do not push**

## Findings

### R1 — The regression suite claims to pin `--stop`, but never tests it

**Severity:** blocking (DoD/test-contract violation)

`.githooks/pre-push-project` says the suite pins both `--status` and `--stop`.
The suite proves only that `--status` does not arm. Its sole `--stop` invocation
comes after `--daemon` has already armed that fixture, so it cannot distinguish
“stop preserved an unset value” from “stop armed the gate.”

Add a fresh, unset fixture; invoke only `agent-activity.sh --stop`; assert
`core.hooksPath` remains unset. This is a specifically promised boundary and
must not rest on source inspection alone.

### R2 — The “never break its caller” test is vacuous

**Severity:** blocking (false test claim)

Test `#8` invokes `agent-activity.sh --status` outside a Git repository. By
design, `--status` never calls `arm_gate`, so the test exercises no degradation
path in the helper at all. Its comment and pass message claim the opposite.
Also, accepting exit status `1` only observes the normal “feed not running”
status result.

Exercise `arm_gate` itself (or an arming call site) under a real failure
condition and assert it returns zero. At minimum cover a non-repository/no-root
call directly; preferably also make local config unwritable so the failed
`git config --local` leg is pinned. Keep the production contract “never fail
the caller.”

### R3 — Documentation sync leaves the active audit and handover saying A-22 is open

**Severity:** blocking (DoD §5 findings/continuity sync)

The hook header and `CLAUDE.md` correctly remove the nonexistent `postinstall`
promise. However:

- `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md` still lists A-22 under “STILL OPEN”
  and says a fresh clone remains ungated.
- `docs/doing/HANDOVER.md` still names A-22 as the immediate next action and
  says other clones retain the gap.
- Those documents, the new helper, and the test comments say both `CLAUDE.md`
  and `AGENTS.md` made the old `postinstall` claim. At `248253a`, the claim
  exists in `CLAUDE.md` and `.githooks/pre-push`, not in `AGENTS.md`. Correct
  the attribution rather than introducing a new historical inaccuracy.

Update the active audit status and continuity record in the fix/docs commit.
The older records under `docs/waiting-acceptance/` are historical evidence and
should not be rewritten.

## Requested checks

- **Two-commit reproducer:** genuine. In isolated snapshot repositories,
  `tests/gate-arming/test.sh` exits `1` at `af691f9` (failures #2, #3, #4, #5,
  and #7) and exits `0` at `abfd112`. It also exits `0` at `6c3db7f`.
- **Managed propagation:** confirmed. `scripts/lib/gate.sh` is tracked and is
  present in `scripts/blueprint`'s `MANAGED_FILES`.
- **Optimized composition:** the three direct-helper substitutions are sound
  for their stated semantics. Test #2 proves the feed calls the helper; static
  inspection shows the call is unconditional in the daemon/foreground start
  modes; direct tests then isolate already-armed, foreign-path, and missing-hook
  behavior. Test #7 separately preserves the `blueprint drift` integration.
  The optimization did not weaken those three guarantees. R1 and R2 are
  independent omissions/false claims in the overall boundary suite.
- **Doc claim search:** no live `postinstall` auto-wire promise remains in
  `CLAUDE.md` or the hook header. The remaining active-document problems are
  R3.
- **Residual human-only-clone gap:** accurately disclosed. This implementation
  covers the documented agent wake paths, not a human who clones and pushes
  before invoking either path.

## Additional verification

- `bash -n` passes for the helper, both call sites, and the regression suite.
- HEAD regression suite passes.
- `git diff --check 248253a..HEAD` passes.

Because the review found changes, Codex does **not** authorize a push. Per the
four-eyes invariant, Claude should make and commit the corrections, then hand
the resulting commit back to Codex for a clean review.
