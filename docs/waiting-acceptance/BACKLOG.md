# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **FEATURE-005** | **Wait to be notified instead of watching — replace the always-on mic `Monitor` with a one-shot wait.** A `Monitor` polls forever and **its death is indistinguishable from quiet**; two died silently in one session and the founder noticed before I did. A-40 records that `ps` cannot see them, so no liveness check works either. Invert it: a background process watches the baton, prints the new `Holder`/`State` when it changes, and **exits**. The harness notifies on task exit whatever the code, so *fired* and *stopped* are both events — a long-lived watcher only gives you the first. It also cannot be rate-limited into silence, because it emits once. **Reviewed by Alexey (Architect) before implementation** — see the notes below for what he changed. | S3 | KEEP | Promoted 2026-08-17. Founder: *"you don't need to monitor them, you wait to be notified"*, then *"we want this system to be OS agnostic or linux based"*, which is what killed the inotify design. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.

## What to test — FEATURE-005

```bash
sh scripts/wait-mic.sh logs/state/signal.md &
```

It should print nothing while the mic is unchanged. Flip the baton with
`scripts/signal-set.sh` and it must print `MIC: Holder=… State=…` **and exit**.
That exit is the whole feature: the harness reports a task ending whatever the
reason, so a waiter that stops is an event rather than silence.

- `bash tests/wait-mic/test.sh` — 13 cases, 8 of them negatives.
- **It does NOT close the blindness**, and the row must not be read as claiming
  it does. It has to be re-armed after every event, and forgetting is silent —
  which happened to its author on 2026-08-18 and cost 40 minutes.

## What the review changed, before a line was written

Recorded here because two of the three are constraints on the *claims*, not the
code, and those are the ones that quietly get dropped.

**Alexey (Architect), 2026-08-17 — "build it, with narrower claims":**

1. **It is not self-healing, and must not be described as eliminating
   blindness.** The one-shot converts three things into visible events — the
   baton changes, the waiter crashes, the harness stops it — and that is the
   whole gain. But it must be RE-ARMED after each event, and forgetting is
   silent. The third shape that would close it is a **supervisor**, which this
   repo does not have. Say the gap is **narrowed, not closed**.
2. **Replace the Monitor, do not run both.** Two mechanisms watching one file is
   the A-09 shape one level up.
3. **Pilot project-locally.** Not in `MANAGED_FILES`, and `AGENTS.md` stays
   silent — it travels, and a project told to run a command it does not have is
   worse off than one told nothing. The wake instruction lives in the
   project-owned `HANDOVER.md` until it has proved itself here.

**The design changed once before that, and the artefact is being deleted rather
than carried.** The parked prototype used inotify through Python `ctypes` —
~40 lines, and it needed "watch the DIRECTORY not the file" because
`signal-set.sh` publishes by atomic rename. The founder's *"OS agnostic or Linux
based"* killed it: inotify is Linux-only, `inotifywait` is not installed, and the
`Brewfile` is macOS-only, so it would have been a Linux-only dependency shipped
through a macOS-only package manager. Six lines of POSIX `sh` replace it, and the
rename subtlety disappears with it.
