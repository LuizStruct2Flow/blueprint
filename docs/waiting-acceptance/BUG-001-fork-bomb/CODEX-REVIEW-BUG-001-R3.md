# Codex / Slava review — BUG-001 consensus round 3

**Date:** 2026-07-23  
**Scope:** revision 3 of `PLAN-BUG-001.md`; review only.  
**Verdict:** **NO CONSENSUS.** The revision-2 architecture remains accepted, and
revision 3 resolves the bounded-range, partial-record, daemon-identity, resident
process, and first-discovery requirements in design intent. However, the
specified shell read primitive cannot implement its newline-boundary rule as
written. This is a genuine implementation blocker, not a preference.

## Accepted

- Keep the single offset-tracking supervisor, short-lived helpers, ordinary
  single-process teardown, and no orphan sweep.
- A bounded snapshot-range read is the correct answer to the append-during-read
  race.
- Advancing the persisted offset only through complete newline-terminated
  records is a simpler valid alternative to an explicit carry buffer. There is
  no load-bearing requirement for a separate carry object.
- The `MAX_FRAGMENT` bound and tests #10–#16 cover the right behavioral risks.
- Using the lock as the liveness oracle and validating PID plus process start
  token before signalling is fail-closed for the stated stale-PID/PID-reuse
  problem.

## Implementation blocker — command substitution removes the delimiter

Section 3 specifies:

```sh
delta=$(tail -c +$((offset+1)) "$f" 2>/dev/null | head -c $((S - offset)))
```

POSIX shell command substitution removes all trailing newline bytes from the
captured output. Consequently, if the snapshot range ends with a complete
newline-terminated record—the normal JSONL/run-log case—the shell variable no
longer contains that final newline. Step 3 cannot find the true last complete
record boundary.

The smallest example is a newly appended `one\n`: `delta` becomes `one`, `k`
is zero, nothing is emitted, and the offset does not advance. With multiple
records, the last record is held back; repeated reads continue stripping the
latest trailing delimiter. A quiet file containing one ordinary complete line
can therefore remain un-emitted until the fragment force-flush threshold, which
violates the feed contract and tests #3, #10, #11, and #16.

## Required correction

Preserve the bounded range as bytes outside ordinary command substitution—for
example, write the range to a per-tick temporary file, verify that exactly
`S - offset` bytes were captured, find the final newline in that byte-preserving
representation, emit only the complete prefix, then advance by that prefix
length. An explicitly proven sentinel technique is also acceptable, but the
plan must state how it preserves trailing newlines.

The implementation must also define pipeline success precisely. With
`pipefail`, `head -c N` may close after `N` bytes while an append makes `tail`
attempt more output, producing a benign SIGPIPE status. Success should mean
that the bounded sink completed and the captured byte count is exactly the
requested range—not necessarily that every upstream producer exited zero.

Add or sharpen a deterministic assertion for a quiet file whose only append is
one newline-terminated record: it must emit on the next tick and advance the
offset, without requiring a subsequent record or force-flush.

This correction stays entirely within the accepted revision-2/revision-3
architecture. No tail pool, process-group teardown, carry buffer, or orphan
sweep is requested.
