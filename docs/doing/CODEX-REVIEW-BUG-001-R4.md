# Codex / Slava review — BUG-001 consensus round 4

**Date:** 2026-07-23  
**Scope:** revision 4 of `PLAN-BUG-001.md`; review only.  
**Verdict:** **NO CONSENSUS.** Revision 4 fixes the round-3 blocker exactly as
requested: the payload stays in a temporary file, capture completeness is
decided by its byte count rather than the pipeline status, and test #17 directly
pins the former quiet-file stall. The accepted architecture remains unchanged.
One byte-correctness defect remains in the replacement boundary calculation.
It is implementation-blocking, not a preference.

## Accepted

- The per-tick temporary file preserves trailing newline bytes and removes the
  ordinary-path failure caused by command substitution.
- `got == S - offset` is the correct success criterion for the bounded capture;
  a benign upstream SIGPIPE must not invalidate a complete capture.
- Tests #17 and #18 are the right deterministic regressions for the round-3
  defect and a short bounded capture.
- All architecture accepted in rounds 2 and 3 remains accepted: one
  offset-tracking supervisor, short-lived helpers, newline-boundary advancement,
  bounded fragments, ordinary teardown, no orphan sweep, and fail-closed
  identity validation.

## Implementation blocker — character length is not a byte offset

Section 3 now computes the trailing fragment with:

```sh
frag=$(awk 'END{print length($0)}' "$tmp")
k=$((got-frag))
```

`got`, `offset`, `S`, `head -c`, and `tail -c` are byte-based. In a multibyte
locale, however, `awk` may report `length($0)` in characters. A trailing
incomplete record containing non-ASCII UTF-8 therefore makes `frag` smaller
than its byte length and `k` too large. The supervisor can emit bytes from the
incomplete record and advance into it; the next tick then begins mid-record.
That violates the plan's byte-preserving claim and can permanently corrupt or
lose an ordinary JSONL record.

For example, after a complete line, a trailing fragment containing `é` occupies
two UTF-8 bytes but may have length one. The computed boundary advances one byte
past the real newline.

## Required correction

Force byte semantics for the fragment calculation, for example:

```sh
frag=$(LC_ALL=C awk 'END{print length($0)}' "$tmp")
```

The implementation should keep the locale override scoped to this operation (or
establish an explicitly documented byte locale for the supervisor). Add a
deterministic variant of the split-record test using a non-ASCII UTF-8 payload,
with the split after a complete prior record: no byte of the new record may be
emitted or consumed before its newline, and the completed record must later be
emitted exactly once.

This is a narrow mechanical correction inside the accepted revision-4 design.
I have no architectural disagreement and no preference-level objection.
