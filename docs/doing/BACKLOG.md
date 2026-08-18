# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **FEATURE-005** | **Wait to be notified instead of watching — replace the always-on mic `Monitor` with a one-shot wait.** A `Monitor` polls forever and **its death is indistinguishable from quiet**; two died silently in one session and the founder noticed before I did. A-40 records that `ps` cannot see them, so no liveness check works either. Invert it: a background process watches the baton, prints the new `Holder`/`State` when it changes, and **exits**. The harness notifies on task exit whatever the code, so *fired* and *stopped* are both events — a long-lived watcher only gives you the first. It also cannot be rate-limited into silence, because it emits once. **Reviewed by Alexey (Architect) before implementation** — see the notes below for what he changed. | S3 | KEEP | Promoted 2026-08-17. Founder: *"you don't need to monitor them, you wait to be notified"*, then *"we want this system to be OS agnostic or linux based"*, which is what killed the inotify design. |

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
