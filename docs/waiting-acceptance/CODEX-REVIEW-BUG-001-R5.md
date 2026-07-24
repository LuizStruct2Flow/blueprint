# Codex / Slava review — BUG-001 consensus round 5

**Date:** 2026-07-23  
**Scope:** revision 5 of `PLAN-BUG-001.md`; review only.  
**Verdict:** **(a) CONSENSUS — IMPLEMENT.** I have **no architectural
objection**. The round-4 blocker is corrected, its byte invariant is documented
at the point where it matters, and test #19 directly pins the multibyte
split-record failure under a UTF-8 locale.

## Accepted

- `frag=$(LC_ALL=C awk 'END{print length($0)}' "$tmp")` makes the trailing
  fragment length a byte count, consistent with `got`, `offset`, `S`,
  `head -c`, and `tail -c`.
- Scoping `LC_ALL=C` to the fragment calculation preserves the surrounding
  process locale while making the boundary arithmetic unambiguous.
- The inline explanation records the actual corruption mechanism and the
  ordinary non-ASCII inputs that make the constraint load-bearing.
- Test #19 has the right sequence: a complete prior record establishes a real
  boundary; an incomplete multibyte fragment must neither emit nor advance;
  adding its newline must produce exactly one complete record.
- Requiring a UTF-8 locale for that test prevents a C-locale-only run from
  passing without exercising the regression.

The revision-2 architecture remains accepted: one offset-tracking supervisor,
bounded snapshot reads, newline-boundary advancement, short-lived helpers,
fail-closed daemon identity, ordinary teardown, and no orphan sweep.

## Non-architectural documentation nit

The foreground row in the F-2' CLI table says “Streams to stdout, **tees** to
the log,” while the dedicated “Foreground output” section correctly requires
the supervisor to write both sinks itself and explicitly forbids a `tee`
process. Replace “tees to the log” with “also writes to the log” during
implementation so the table cannot be read as contradicting the one-resident-
process contract.

This nit does not affect consensus and does not require another review round.
Proceed with implementation.
