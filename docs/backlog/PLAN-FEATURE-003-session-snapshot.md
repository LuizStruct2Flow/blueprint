# PLAN-FEATURE-003 — HANDOVER as a snapshot, the logs as the event stream

**Status: PARKED in `backlog/`. Not started, not promoted.** Promotion into
`doing/` is the founder's call (`backlog/README.md` §"What triggers a grooming
pass").

**Origin:** founder, 2026-08-03 — *"I have a very bad connectivity at the
moment, so the session can drop every second. The handover could be like
transactions or snapshots in event driven architectures: you don't have to read
all events, you read the last snapshot and all events after the last
snapshot."*

---

## 1. The problem

A session can die at any moment. Today's wake cost real time because
`HANDOVER.md` was stale — it claimed `doing/ 0, done/ 16` while `doing/` held
six rows and `done/` seventeen — so the waking session had to reconstruct state
from `git log`, folder counts and the baton by hand.

DoD §10 already demands the resume doc be current *"whenever you finish a
meaningful unit of work"*, and treats staleness as lying. That rule is correct
and it is not enough: it depends on remembering, at exactly the moment a
connection is about to drop. It is the shape this repo has now rejected six
times.

## 2. The proposal

Event-sourcing's snapshot pattern:

```
HANDOVER.md  =  the SNAPSHOT   (last known-good state, machine-readable header)
logs/        =  the EVENT LOG  (what happened since)

wake  =  read snapshot  +  replay events after its marker
```

## 3. What the investigation found — this changes the design

**The obvious implementation is wrong in two ways**, both verified against this
repo rather than assumed.

### 3a. The activity feed is VOLATILE

`scripts/agent-activity.sh:450` does `: >"$out"` — **the daemon truncates
`logs/agent-activity.log` every time it starts.** The daemon was restarted twice
on 2026-08-03 alone.

So a replay built on the feed silently loses every event before the last daemon
start. Worse, it loses them in the shape this repo keeps getting burned by: an
empty replay is indistinguishable from "nothing happened since the snapshot".

`logs/state/signal-history.log` is append-only and nothing truncates it
(`signal-set.sh` only ever `>>`). **That is the durable stream.**

### 3b. Timestamps are not orderable here

- The feed writes `HH:MM:SS` with **no date**.
- **The system clock jumped BACKWARDS during 2026-08-03** — feed entries stamped
  `19:47` sit *earlier in the file* than entries stamped `14:39`.

So "everything after timestamp T" is wrong twice: it cannot span midnight, and
it mis-orders whenever the clock moves. **Use a MARKER LINE, not a timestamp
comparison** — a marker is a position in an append-only file, which is exactly
what the feed supervisor already does with byte offsets (BUG-001).

## 4. Design

1. **Snapshot header in `HANDOVER.md`** — a machine-readable block carrying
   `snapshot_id`, `snapshot_at` (ISO-8601 UTC), `head` (git sha), `branch`.
2. **Marker into the DURABLE journal.** Writing a snapshot appends
   `[SNAPSHOT] <id> head=<sha>` to `logs/state/signal-history.log`. It survives
   daemon restarts because nothing truncates that file.
3. **`scripts/session-snapshot.sh`** — writes the header, appends the marker,
   one atomic publication (same discipline as `signal-set.sh`).
4. **`scripts/session-resume.sh`** — prints the snapshot header, then every
   journal line after the marker, then the feed lines after the marker **if the
   feed still reaches back that far**.
5. **THE CRITICAL BEHAVIOUR.** If the marker is absent from the feed — daemon
   restarted, log truncated — say so **loudly**:

   > `⚠ the activity feed was truncated after this snapshot; N journal events
   > are shown but tool-level detail is GONE.`

   Never print a short replay that reads as a quiet one. This is the single
   requirement the whole feature stands or falls on, and it is the lesson of
   BUG-004, BUG-018, and every guard fixed this week.

## 5. Tests

- A snapshot marker written, feed truncated, resume run → **must warn**, not
  return quietly. This is the reproducer; it fails on any naive implementation.
- Two snapshots → resume replays only events after the LATER one.
- Clock moved backwards between snapshot and events → replay is still correct
  (proves the marker, not the timestamp, is what orders it).
- No snapshot at all (fresh clone) → resume says so rather than printing empty.
- Non-vacuity: a control where events DO exist and are replayed, so an
  always-empty implementation cannot pass.

## 6. Open questions for the founder

1. **Snapshot cadence.** Every handoff only, or also after each push? More
   snapshots mean shorter replays but more noise in the journal.
2. **Does the feed stop truncating?** Making `--daemon` append instead of
   truncate would make the rich stream durable too — but the feed is designed as
   a live tail, and an unbounded log needs rotation, which reintroduces the
   inode problem the supervisor already had to solve.
3. **Scope.** Blueprint-only, or `MANAGED_FILES` so every project gets it? It is
   generic, so probably the latter — but that is a decision about what `pull`
   writes into every project.

## 7. Rollback

Additive: two new scripts plus a header block in `HANDOVER.md`. Nothing existing
changes behaviour, so reverting is deleting them. The header is a comment block
and is inert to every current reader.
