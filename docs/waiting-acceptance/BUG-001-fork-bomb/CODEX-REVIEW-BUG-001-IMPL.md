# Codex / Slava four-eyes review — BUG-001 implementation

**Date:** 2026-07-23
**Reviewed commits:** `d0b3f2b` (reproducer), `8c8bd36` (fix)
**Verdict:** **CHANGES REQUIRED — do not push.**

The core offset-supervisor architecture matches rev 5, and the four
implementation details called out in the handoff are present:

- `pump()` bounds the read with `tail -c +$((off+1)) | head -c
  $((size-off))`, closes FD 9 in both helpers, and judges success by the captured
  byte count.
- Payload bytes go through `.delta.$$`; only derived scalar values enter command
  substitution.
- Fragment length is computed with `LC_ALL=C awk`.
- `--stop` / `--status` consult the flock before state, compare the live start
  token, and state publication uses same-directory temp + `mv`.

That is not enough for a clean implementation review. The committed result
does not honour the rev-5 test contract and contains concrete defects in paths
that contract required it to exercise.

## Blockers

### I-1 — The promised 19-case regression suite was not implemented

`PLAN-BUG-001.md` §4 is part of the consensus implementation spec. It requires
19 behavioral assertions. `tests/agent-activity-bound/test.sh` has seven
sections; sections 1–6 are static source greps and section 7 performs only
concurrent start plus stop.

Missing behavioral coverage includes:

- 40+40 transcript process bound and quiet-but-active transcripts;
- SIGKILL lock release and restart;
- foreground/daemon caller semantics and one-resident-process checks;
- concurrent stop/start, paths with spaces, rotation and truncation;
- unchanged-signal behavior as an actual runtime assertion;
- deterministic append-during-read and short-sink cases;
- split JSONL and raw lines, including the required UTF-8 multibyte case;
- `MAX_FRAGMENT` force-flush;
- stale state and unrelated-PID/start-token fail-closed checks;
- first-discovery/no-replay and single-complete-record advancement.

The current concurrency assertion is itself too weak:
`[ "$n" -le 1 ]` accepts **zero** supervisors, although the plan requires
exactly one survivor. It therefore does not prove that any daemon successfully
started.

This is a DoD blocker independently of the source findings below: the difficult
correctness properties agreed in five review rounds are currently claims, not
regressions.

### I-2 — Missing nonce is accepted instead of failing closed

In `scripts/agent-activity.sh`, `read_state()` reads `s_nonce` but its final
validation requires only `s_pid` and `s_token`. A state file with no nonce
passes `read_state()`, and `resolve_supervisor()` can then authorize status or a
signal using that incomplete state.

Rev 5 F-2' explicitly requires reading `pid + nonce + start_token` and says
**any missing field** must fail closed. Require a non-empty nonce (and add the
missing-state-field behavioral test). If the nonce is not intended to be part
of identity validation beyond presence, document that limitation; otherwise it
currently adds no identity evidence at all.

### I-3 — Signal change detection misses same-size in-place edits

`supervise()` identifies the signal snapshot as
`"$(f_size)-$(f_inode)"`. An in-place edit that preserves both byte length and
inode is invisible, so a real mic/task change can be omitted from the feed.
Size + inode is suitable for rotation/truncation handling of offset streams; it
is not a change token.

The RC-6 fix was to select the correct platform-specific **mtime** operation,
not to stop observing mtime. Track a portable high-resolution change token
(with a content fallback where timestamp resolution can alias), or pump the
signal through a correct offset/content mechanism. Add a behavioral same-size
in-place-edit case alongside the unchanged-file assertion.

## Additional correctness concern to pin while repairing the suite

At `pump()` the offset advances after
`head -c "$k" "$tmp" >"$tmp.p" && emit_delta ...` even if materializing or
emitting the prefix fails. With `set -u -o pipefail` but no `set -e`, a failed
sink can therefore consume bytes that were never emitted. The rev-5 rule is
emit complete bytes **then** advance. Make advancement conditional on successful
materialization/emission, or explicitly define and test the intended failure
policy.

## Verification performed

- `bash -n` passed for the rewritten feed, both watcher scripts, and the test.
- `bash tests/agent-activity-bound/test.sh` passed.
- `bash .githooks/pre-push-project` passed.
- Direct source review covered `emit` / `emit_delta` / `project_jsonl`,
  first-discovery seeding, inode/size reset handling, fragment force-flush,
  teardown ordering, associative arrays, and the internal `--supervise` mode.

The green commands do not clear I-1: the hook only runs the incomplete suite.
Per the four-eyes rule, `8c8bd36` is **not authorized for push**. The writer
should implement the missing tests and correct I-2/I-3 (plus the advancement
failure policy), commit the changes, and hand the new writer commit back to
Codex for another clean review.
