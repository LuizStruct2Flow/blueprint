# `waiting-acceptance/` — pushed to main, awaiting founder sign-off

Items moved here after their fix/feature pushes to `main`. They stay here until
the founder explicitly accepts ("done") or rejects ("reopen"). The agent never
auto-promotes to `done/`.

Triggers:
- **Push to main** moves rows from `doing/BUGS.md` → `waiting-acceptance/BUGS.md`, `doing/BACKLOG.md` → `waiting-acceptance/BACKLOG.md`, `doing/PLAN-*.md` → `waiting-acceptance/`, and multi-file folders travel whole.
- **Founder acceptance** → move to `done/`.
- **Founder rejection / regression** → move back to `doing/`.

`CHANGES.md` here holds *forward features* (new slice, new module) awaiting
acceptance — defects use `BUGS.md`.
