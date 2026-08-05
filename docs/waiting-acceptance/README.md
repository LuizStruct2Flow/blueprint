# `waiting-acceptance/` — pushed to main, awaiting founder sign-off

Items moved here after their fix/feature pushes to `main`. They stay here until
the founder explicitly accepts ("done") or rejects ("reopen"). The agent never
auto-promotes to `done/`.

Triggers:
- **Push to main** moves rows from `doing/BUGS.md` → `waiting-acceptance/BUGS.md`, and — for whichever of these exist — `doing/BACKLOG.md` → `waiting-acceptance/BACKLOG.md`, `doing/PLAN-*.md` → `waiting-acceptance/`. **Multi-file folders travel whole**, which is the half that gets forgotten: on 2026-08-03 all 14 rows were promoted and their folders were left behind.
- **Founder acceptance** → move to `done/`.
- **Founder rejection / regression** → move back to `doing/`.

`BUGS.md` is always here. `BACKLOG.md` appears when a promoted row lands, and
`CHANGES.md` on first use — it holds *forward features* and behaviour changes
with no underlying defect (CLAUDE.md §Lifecycle). Absence means none yet, not a
missing file.

**Two record files travel the whole lifecycle**: `BACKLOG.md` and `BUGS.md`,
`backlog/` → `doing/` → here → `done/`. Anything else in this folder is either a
per-item artefact (a plan, a review, a work-item folder) travelling with its
row, or it does not belong.

**"What to test" lives in the BUGS row itself**, not in a separate index.
There was an `INDEX.md` carrying a second copy of the membership; it drifted to
5 rows against 14 real ones, and the first response was a test to hold the two
in step — which is the wrong repair for two records of one fact. One record
cannot disagree with itself.

## How acceptance works on this project

Acceptance for agent-protocol and repo-infrastructure work is **delegated to
QA-2** (founder decision 2026-07-29). Scope, conditions, and the stated
independence limitation are in `project_config_dod.md` §"Acceptance authority".
User-surface work is explicitly excluded and still needs the founder's eye.
