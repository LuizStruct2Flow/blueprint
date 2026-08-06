# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **FEATURE-003** | **`scripts/session-resume.sh` derives where a woken session is** — git state, the four lifecycle folders, the live baton, and the journal events since the last handoff marker. It holds nothing, so it cannot go stale. `--mark` rolls the handoff window in one append; `--rollback` stashes uncommitted work rather than discarding it. Exit 9 means the report is incomplete or the snapshot untrusted. **The writer stays parked** — only the marker append survives of it. Nine cross-provider rounds, sixteen findings, fifteen defects, each with a regression case red on its own parent. **The feed probe was deleted** (−544 lines) after the founder's *"you are both overcomplicating this"*: it guarded a file the tool never reads, and fired on the ordinary path. Post-mortem in [`PLAN-FEATURE-003-session-snapshot.md`](PLAN-FEATURE-003-session-snapshot.md) §8b. | — | KEEP | Landed 2026-08-06 (#32). §6.2 (marker cadence) and §6.4 (ship via `MANAGED_FILES`?) are still open founder calls. |

## What to test — FEATURE-003

Run it: `bash scripts/session-resume.sh`. On a checkout that has never marked, it
must say **no snapshot marker** and exit 9 — that is the correct first-run answer,
not a failure. Then:

- `bash scripts/session-resume.sh --mark`, then run it again. It should be
  **silent and exit 0**, replaying the journal events since the marker. Restart
  the feed daemon first if you want to confirm a truncated feed is a non-event.
- Edit the `session-marker:` id in `docs/doing/HANDOVER.md` to something invented.
  Resume must name both ids, say which to trust, and exit 9.
- `bash scripts/session-resume.sh --rollback` with a dirty tree stashes rather
  than discards — `git stash pop` must bring the work back intact.
- `bash tests/session-resume/test.sh` — 13 cases.

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.
