# PLAN-FEATURE-003 — HANDOVER as a snapshot, the logs as the event stream

**Status: the READER is built (2026-08-06). The writer stays parked.** Promoted
into `doing/` by the founder on 2026-08-05 ("3. ok"), reader-only, on Klaus's and
Alexis's converging recommendation. What the build settled and what §6 still owes
is in §8b — read that against §6 rather than instead of it.

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

**Revised 2026-08-05** after the founder's marker refinement and flow reviews
from Klaus (PO) and Alexis (BA). The reviews reached the same verdict
independently, and it changes what gets built:

> An authored `HANDOVER.md` snapshot is a **second bookkeeping surface** and will
> go stale for the same reason the present one did. Atomic publication only
> guarantees a *coherent* stale snapshot; it does not make its claims true.
> — Alexis (BA)

The evidence arrived while this plan sat parked: `HANDOVER.md` was rewritten to
be true on 2026-08-05, and **went stale again within the same working session** —
four false claims, including a dispatch it said was still running which had
finished hours earlier. Twice in one day is not a discipline problem to solve
with more discipline.

So the feature splits, and the halves get **opposite verdicts**:

| Half | Verdict | Why |
|---|---|---|
| **Reader** (`session-resume`) | **promote** | derives state from git, folders, baton, journal — cannot go stale, because it holds nothing |
| **Writer** (authored snapshot prose) | **park** | until a fact is demonstrated that no command can derive |

What survives of the writer is not prose at all: **a marker append**. That is an
*event* — it records that a handoff happened at a point in the stream — and no
amount of deriving can reconstruct an event nobody wrote down. It is also
immune to the failure above, because a marker has no claims in it to be wrong.

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

### 3c. A single marker cannot tell "nothing happened" from "nobody wrote it down"

The founder's refinement, 2026-08-05:

> *"We can use hashes, for instance `<kldsfo234jfdsffsw>`. As soon as we update
> the handover, we can log `</kldsfo234jfdsffsw>` and a new one with the new
> hash."*

**Paired open/close markers, and the pairing is the whole point.** One marker
per snapshot answers "what happened since?" but is silent on the question that
actually bit us twice today: *is this snapshot still describing reality?*

With `<id>` written when a handoff opens and `</id>` when the next one closes it:

| Journal state | What it means |
|---|---|
| `<X>` … `</X>` … `<Y>` open | normal — Y is the live window, replay after `<Y>` |
| `<X>` open, header says X | normal — replay after `<X>` |
| `<X>` open, **header says Y** | the file and the journal **disagree** — one was written without the other |
| `<X>` open, N events after, N large | not corrupt, but **aging** — quantified rather than boolean |

The third row is the staleness detector, and it is *cheap*: it compares two
independent writes that must agree, rather than trying to verify prose against
the world. The fourth is what a boolean `stale: true` could never express.

**The founder named this design's hard limit before it was built** — *"if the
logging fails, it fails. There is no way around this, isn't?"* — and that is
correct and worth writing down rather than engineering around. If the marker
append fails, the window is lost. What the design owes in return is that the
loss is **loud**: an unpaired or missing marker prints a warning, never a clean
empty replay. A failure that announces itself is a different thing from one
that looks like success, and that distinction is the whole subject of §5.

## 4. Design

**The reader is the feature. The writer is one append.**

1. **`scripts/session-resume.sh` — DERIVES, holds nothing.** Reports, in order:
   `git status` + branch + ahead/behind, the four lifecycle folder counts, the
   live baton, and the journal events since the last open marker. Every one of
   these is read at run time from the thing that owns it, so none can be stale —
   which is the property the authored snapshot could never have.
2. **Marker into the DURABLE journal.** A handoff appends `</previous-id>` then
   `<new-id> head=<sha>` to `logs/state/signal-history.log`. It survives daemon
   restarts because nothing truncates that file (`signal-set.sh` only ever
   `>>`), unlike the feed (§3a).
3. **`HANDOVER.md` shrinks to what cannot be derived** — the current `id`, and
   free prose reserved for *exceptional context a command cannot produce*:
   a halted rename, a fixture that writes live state, a deliberate omission.
   Everything the four folders and `git log` already answer comes out. Both
   reviewers named this file the repo's single biggest ceremony surface.
4. **THE CRITICAL BEHAVIOUR — an incomplete replay must be LOUD.** Three cases,
   three distinct warnings, never a quiet short output:

   > `⚠ the activity feed was truncated after this snapshot; N journal events
   > are shown but tool-level detail is GONE.`

   > `⚠ HANDOVER says <Y> but the journal's open marker is <X> — the two were
   > written independently. Trust git and the folders, not the prose.`

   > `⚠ no snapshot marker found. This is a fresh clone or the journal was
   > lost; nothing is being replayed.`

   This is the requirement the feature stands or falls on — the lesson of
   BUG-004, BUG-018, and every guard fixed this week.
5. **Uncommitted work is STASHED, never discarded.** When the snapshot cannot be
   trusted, the founder's instinct was to roll back — *"the safest action would
   be rollback it if you cannot understand what the previous agents were
   doing"* — and the safe form of that is `git stash push` with a labelled
   message, not `checkout --`. Both clear the tree; only one is reversible when
   the judgement was wrong. An untrusted snapshot is *low confidence about the
   work*, which is precisely when destroying it is least defensible.

## 5. Tests

- A marker written, feed truncated, resume run → **must warn**, not return
  quietly. This is the reproducer; it fails on any naive implementation.
- **Header and journal disagree** (`HANDOVER` says `<Y>`, journal's open marker
  is `<X>`) → resume warns and says which source to trust. This is the case that
  went undetected twice on 2026-08-05.
- Two snapshots → resume replays only events after the LATER open marker.
- Clock moved backwards between snapshot and events → replay is still correct
  (proves the marker, not the timestamp, is what orders it).
- No marker at all (fresh clone) → resume says so rather than printing empty.
- **Uncommitted work under an untrusted snapshot is recoverable** — assert
  `git stash list` is non-empty and the content round-trips, so a future
  "simplification" to `checkout --` fails loudly.
- Non-vacuity: a control where events DO exist and are replayed, so an
  always-empty implementation cannot pass.

## 6. Open questions for the founder

1. **Promote the reader alone?** Both reviewers say yes: build
   `session-resume.sh` + the marker append, leave the authored snapshot parked
   until a fact appears that no command can derive. The counter-argument is that
   §0 prose has genuinely carried things worth having (a halted rename, a
   fixture that wrote live state) — the reviewers' answer is that those are
   *exceptional context*, which the shrunken file still holds.
2. **Snapshot cadence.** Every handoff only, or also after each push? More
   markers mean shorter replays but more journal noise.
3. **Does the feed stop truncating?** Making `--daemon` append instead of
   truncate would make the rich stream durable too — but the feed is designed as
   a live tail, and an unbounded log needs rotation, which reintroduces the
   inode problem the supervisor already had to solve.
4. **Scope.** Blueprint-only, or `MANAGED_FILES` so every project gets it? It is
   generic, so probably the latter — but that is a decision about what `pull`
   writes into every project.

## 7. What the reviews changed, and what they did not

Recorded because a plan that quietly absorbs its reviews cannot be audited later.

**Changed:** the writer went from "author a snapshot atomically" to "append a
marker" (§2, §4); the reader became the deliverable rather than the consumer of
a snapshot (§4.1); paired markers replaced the single marker (§3c); stash-don't-
discard became an explicit requirement with a test (§4.5, §5).

**Not changed and deliberately so:** the durable journal remains the event
stream, not the feed (§3a); ordering remains positional, never by timestamp
(§3b); and the loud-incomplete-replay rule stayed the feature's load-bearing
requirement — the reviews reinforced it rather than softening it.

**Still the founder's call:** everything in §6. Nothing here promotes the item;
it stays in `backlog/`.

## 8b. What the build settled, and what §6 still owes the founder

Recorded on 2026-08-06, when the reader was built. Kept beside §6 rather than
replacing it, so the questions and their answers can be read against each other.

**THE FEED PROBE IS GONE (2026-08-06, founder: "I think you both may be
overcomplicating this").** Everything in the three subsections below describes a
mechanism that no longer exists. It is kept, unedited, because *how* it was wrong
is the useful part — six review rounds and ten defects went into hardening it, and
none of that work could have found the thing wrong with it.

Two facts, either of which was fatal:

1. **The replay never read the feed.** Events come from the journal (§3a said so
   from the start: *"that is the durable stream"*). The feed was only ever the
   thing being checked — a probe guarding a data source the tool does not use.
2. **The check could not have worked.** `agent-activity.sh:498` truncates the feed
   on every daemon start, and the daemon starts on every wake. So the probe was
   *guaranteed* missing by the time anyone read it: the warning fired on the
   ordinary path. A warning that always fires is noise, noise gets muted, and a
   muted tool detects nothing. **Structural, not a bug more rounds would have
   found** — R2 and R3 each fixed an individual false alarm without either of us
   asking why the mechanism produced so many.

With the feed gone, "incomplete" reduces to two states, both still loud: **no
marker**, and **prose disagreeing with the journal**. The marker is `<id>
head=<sha>`; `--mark` writes it, reads it back, then updates `HANDOVER.md`.

**−544 lines, +95.** Twelve of twenty-four test cases went with it — every one
guarded the probe. Two survive because they are about the journal and the prose:
the older-id/unbacked-id distinction (R2) and the unwritable-journal refusal
(R6-1), which matters *more* now that the journal is the only thing written.

The lesson worth keeping is not "we over-engineered". It is that **a review loop
optimises the thing in front of it.** Codex found ten real defects and every fix
was correct; the loop had no step that asked whether the mechanism should exist.
The founder's one sentence did what six adversarial rounds structurally could not.

---

*What follows describes the removed probe. Kept as the record of how it failed.*

**Settled by building it:**

- **The feed probe is the truncation detector — and what it proves is narrow.**
  §4.4's first warning needed a mechanism and the plan did not name one. `--mark`
  writes the open marker into the durable journal *and* a matching line into the
  feed; the feed line's ABSENCE at read time is the proof that the window was
  lost. It asks no timestamp anything, which is what §3b demands.

  **The first version overclaimed it and Codex R1 broke it three ways**, each a
  FALSE CLEAN — a tidy replay, no warning, exit 0, against a genuinely untrusted
  window. The check was `grep -q "<id>" "$FEED"`, which proves only that the id
  occurs somewhere in whatever file `$FEED` points at:

  | Codex's case | What it demonstrated |
  |---|---|
  | `unrelated_mention` | any feed line MENTIONING the id satisfied it |
  | `stale_override` | `$AGENT_FEED_LOG` aimed at another feed carrying an old probe satisfied it |
  | `retained_marker_only` | a feed trimmed after the marker satisfied it |

  Fixed by recording two more facts in the marker — **which** feed and **where in
  it** — and matching the probe's full prefix as a fixed string. The three cases
  are now regression tests #11–#13, verified red against the pre-fix script.

  **R2 found the fix still forgeable, and the repair changed the question.** The
  feed carries dispatch task text verbatim, so a task that *quotes* a probe line
  IS a probe line to any content check — and taking the last match meant the
  forgery won. Authentication is now by **recorded position**: the marker says
  which line the probe landed on, so the question is "does the recorded line
  still hold the probe?", which a later copy cannot answer for it. R2 also found
  that a marker predating the provenance fields fell through to the old
  content-only check, silently restoring the bug those fields were added to
  close — an upgrade path that gives back the old behaviour now refuses instead.

  **And it found the opposite failure twice, which matters as much.** A feed path
  containing a space could not round-trip through a space-separated field, and a
  relative `$AGENT_FEED_LOG` was recorded against the marking process's cwd but
  read against the data root. Both made a *healthy* feed warn. A tool that cries
  wolf gets muted, and then the false-clean findings stop mattering because
  nobody reads the output. `feed=` now goes last and is parsed to end-of-line;
  both sides normalise the path through one function.

  **The honest limit, stated rather than implied.** It proves the feed being read
  is the one that was marked, that the recorded line still holds the probe, and
  that nothing was removed from IN FRONT of it. It does NOT prove nothing was
  removed from AFTER it — nothing records how many lines there should be by now,
  so that is not derivable. No mechanism here does it either (the daemon
  truncates the whole file; `lib/feed.sh` rotation keeps the tail), and Codex
  independently confirmed both halves of that: no code path removes only
  post-probe lines, and no current metadata would detect it. The gap is
  documented rather than engineered around.
- **Every warning exits 9.** §4.4 said "loud" and meant prose. Prose alone is
  the BUG-018 shape — the right advice beside exit 0, which a caller reads as
  success. The converse is asserted too: an intact feed must be silent and exit
  0, or the tool gets muted and a woken session is as blind as before.
- **The id stays in the TRACKED `HANDOVER.md`**, against the grain of BUG-019.
  The check is "was the prose written without the journal being marked?", and
  only the authored surface can answer it. Codex confirmed BUG-019's exact
  silent-dispatch failure does not transfer — but raised the operational cost:
  a routine branch switch leaves a warning standing on every wake until someone
  re-marks, and **a tool that warns on every wake gets muted**. So the two cases
  are now distinguished: an id this journal has seen before is reported as
  *older prose, re-run `--mark`*, and an id it has never seen is reported as
  *a claim nobody backed*. Same severity, different advice (#14).

**R3 settled the scope, which is the part a reader will otherwise assume wrong.**
One more false alarm (a symlinked feed FILE — `norm_path` canonicalised the
directory but not the final link, so one inode under two names compared unequal)
and one finding that is **not fixable inside this design**: Codex built a clean
report by copying the probe to another feed line *and* editing `feedline=` to
match. Two coordinated hand-edits.

That is not a hole to close. The journal and the feed are local untracked state,
so anyone able to edit them can equally write a whole marker from nothing — no
check this script performs can be stronger than the files it reads, and a digest
would not help because the same hand recomputes it. Closing it needs an
append-only authenticated log, which is a different feature.

So the promise is stated narrowly, in the script header and here: **silence means
nothing was lost by itself. It does not mean nobody rewrote the record.** What is
guaranteed is that *inconsistent* corruption is loud — either half of that
forgery alone is caught (#15, #20). Codex's own summary is the fair one: he would
not trust the silence while journal metadata alone can manufacture a clean
result. Correct, and now written on the tin rather than discovered later.

**R4 accepted the scope and found the tool's own silent failure.** Codex confirmed
the loss-only promise is "honest and defensible", and that stronger tamper
detection would need an external authenticated append-only anchor — a local
digest is insufficient, which is what I had argued. He also confirmed the R3-1
symlink fix and that neither false alarm returned.

Then he found the one that matters most for a tool built around loud failure:
**`--mark` through a two-node symlink cycle exited 0 with no warning.** Bounding
the walk was not enough — on a cycle it ran out of hops and returned the
still-symlinked path, `feed_append` swallowed the write because it is deliberately
never fatal, and the marker landed with no probe behind it. That window would have
read as CLEAN forever after. `norm_path` now returns non-zero on an unresolvable
chain and the script refuses before opening anything (#21).

**R5 generalised it, and the prescription was better than the R4 fix.** Refusing
on the symlink cycle had fixed ONE INSTANCE of a class: `AGENT_FEED_LOG=/dev/null`
did the same thing — `--mark` exited 0 and opened a window with `feedline=0` and
no probe behind it. So do a full disk, a read-only file, and a FIFO with no
reader. Codex named the general guard exactly: **verify the probe at its recorded
position before appending any journal marker.**

That is now the guard, and the refusal leaves the journal **byte-identical** —
no close, no open. A close with no matching open is a worse state than never
having tried, and the close used to be written first (#22).

**R6 closed the class from both ends.** The feed write was verified and the
JOURNAL write was not — an asymmetry with no defence: an unwritable journal let
`--mark` exit 0 and stamp a new id into `HANDOVER.md` for a window that was never
opened, so the next read would report prose disagreeing with the journal. *The
tool manufacturing the exact staleness it exists to detect.* Both records are now
read back, and `HANDOVER` is written last, so a refusal leaves everything as it
was (#23).

And the R5 fix carried a false alarm of its own: it took `wc -l` after appending
as the probe's line, which is only true if nothing else wrote in between — while
the activity daemon appends to that file continuously. Codex measured **7 of 100
ordinary marks refusing**. Searching for the freshly-minted id instead is
race-free by construction and subsumes the read-back check. Under sustained
concurrent writes the old code fails **100 of 100**; the fix passes 100 of 100
(#24).

**Six rounds, eleven findings, ten of them defects** — including four false
alarms, which cost as much as false cleans because a muted tool detects nothing.
Four of the last six came through one door, and it is the lesson worth keeping:
`feed_append` is correctly never fatal, and that correctness is exactly what lets
a marker land with nothing behind it.

**Still unverified, and recorded as such rather than assumed:**

- **Partial `git stash push` failure.** Codex could not manufacture one, so
  "every stash failure leaves the tree unchanged" is untested. Mid-merge and
  unborn-repo failures WERE exercised and both preserved the tree.
- **Marker-shaped lines in the journal are trusted as real markers.** The journal
  is local state written only by `signal-set.sh` and this script, so a forged
  marker means someone edited it by hand — but the parser does not distinguish
  them, and that surface has no coverage.

**Still open, and both are the founder's:**

- **§6.2 cadence.** `--mark` is deliberately NOT wired into `signal-set.sh`, so
  markers are placed by hand at handoff. Auto-marking every mic flip is the
  harder-to-reverse choice and it multiplies journal markers; wiring it later is
  one line, unwiring it after every checkout has flips in its journal is not.
- **§6.4 scope.** Not in `MANAGED_FILES`. It is generic and §6.4 leans to
  shipping it, but CLAUDE.md §"The blueprint is derived, not designed" applies
  here too: it proves itself in this checkout first. That is also why neither
  `CLAUDE.md` nor `docs/DoD.md` names it yet — both travel, and instructing a
  derived project to run a command it does not have is worse than silence.

**§6.3 (does the feed stop truncating?) is answered NO by the design**, not
deferred: the probe makes truncation *detectable*, which is what the feature
needed. Making the feed append-only would trade a solved problem for an
unbounded log needing rotation — and rotation reintroduces the inode hazard the
supervisor already had to solve.

## 8. Rollback

Additive: one new script (`session-resume.sh`), a marker append at handoff, and
an `id` in `HANDOVER.md`. Nothing existing changes behaviour, so reverting is
deleting them. The marker lines are inert to every current reader of the journal,
and the `id` is a comment block.

Smaller than the original plan's rollback surface, because the writer is no
longer being built.
