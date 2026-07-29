# Codex / Slava review — BUG-001 consensus round 2

**Date:** 2026-07-23  
**Scope:** revision 2 of `PLAN-BUG-001.md`; review only.  
**Verdict:** **NO CONSENSUS YET.** The offset-tracking supervisor is the right
architecture and resolves all five revision-1 blockers, but three details of
the new design remain implementation-blocking because they can duplicate
output, lose transcript records, or signal an unrelated process. Implementation
is not yet authorized.

## Accepted

- Replacing the permanent `tail -F` pool with one offset-tracking supervisor is
  the correct fix. It preserves quiet files without an eviction heuristic and
  bounds resident process count independently of transcript count.
- A short-lived, sequential `tail -c +N` for each changed file is acceptable.
  “One supervisor” should mean one long-lived process, not zero helper
  invocations. The helpers exit within a tick and consume no persistent inotify
  resources.
- The revision structurally answers the five round-1 blockers: no long-lived
  lock-inheriting children, no `kill 0`, explicit foreground/daemon control
  modes, no command-line orphan sweep, and a coherent SIGKILL assertion.
- RC-6/A-06 and the one-time GNU/BSD `stat` probe are correct.

## Remaining implementation blockers

### 1. The size snapshot and delta read are not atomic

The plan says to `stat` size `S`, run `tail -c +(offset+1)`, then advance the
offset. `tail` reads to the EOF it observes while running, which may be beyond
`S` if the writer appends between `stat` and EOF. If the offset is advanced to
the pre-read `S`, those extra bytes are emitted again next tick. If it is
advanced to a later restat size, a still-concurrent append can instead be
skipped.

Specify a bounded read of exactly `S - offset` bytes from the snapshot range,
and advance to `S` only after that read succeeds. For example, the implementation
may compose short-lived `tail` and `head` helpers, both with FD 9 closed. Add a
regression test that appends while a deliberately slowed delta read is in
progress and asserts every record is emitted exactly once.

### 2. Partial final JSONL records need per-file carry state

File size can grow before the writer has completed the terminating newline. If
the supervisor reads and advances over an incomplete JSON object, the current
line-oriented `jq` projection rejects that fragment; the next tick begins in
the middle of the object, so the record is permanently lost.

Keep an in-memory pending-byte buffer per path (or advance only through the last
complete newline), prepend it to the next delta, and clear it on
rotation/truncation according to an explicitly tested policy. Add a test that
writes one JSONL record in multiple appends and verifies it is emitted once,
only after completion. The same rule should cover non-JSON run-log lines so a
split line is not emitted as two feed entries.

### 3. `--stop` / `--status` cannot trust a stale PID file

F-2' says `--stop` sends TERM, then KILL, to the recorded PID. After supervisor
SIGKILL the pidfile can remain; once that PID is reused, `--stop` can terminate
an unrelated process. This recreates the unsafe ownership problem that revision
2 correctly removed from orphan sweeping.

Define a fail-closed identity check before signalling. A portable design can
combine the repo lock with a supervisor-owned nonce/token recorded in the state
file and validated from the live process; platform-specific process start time
may be used where available, but command-line substring matching is not enough.
State-file publication/removal must be atomic, and concurrent start/stop tests
must cover stale PID and PID-reuse simulation. `--status` must likewise report a
stale identity as not running without signalling it.

## Non-blocking precision for revision 3

- Foreground “tees to the log” must not introduce a second long-lived `tee`
  process if the claimed resident bound is one. Have the supervisor write both
  sinks itself, or state and test a resident bound of two.
- State initial-offset semantics for newly discovered files: whether existing
  content is intentionally skipped (matching current `tail -n0`) or replayed.
  Rotation/truncation behavior is already stated, but first discovery is not.

## Round-3 acceptance condition

Keep the revision-2 architecture. Add bounded snapshot-range reads, per-file
partial-line carry, and fail-closed daemon identity validation, with the tests
above. With those specified, I expect to give consensus; no return to a tail
pool, process-group teardown, or orphan sweep is needed.
