# `waiting-acceptance/` — pushed to main, awaiting founder sign-off

Items moved here after their fix/feature pushes to `main`. They stay here until
the founder explicitly accepts ("done") or rejects ("reopen"). The agent never
auto-promotes to `done/`.

Triggers:
- **Push to main** moves rows from `doing/BUGS.md` → `waiting-acceptance/BUGS.md`, and — for whichever of these exist — `doing/BACKLOG.md` → `waiting-acceptance/BACKLOG.md`, `doing/PLAN-*.md` → `waiting-acceptance/`. **Multi-file folders travel whole**, which is the half that gets forgotten: on 2026-08-03 all 14 rows were promoted and their folders were left behind.
- **Founder acceptance** → move to `done/`.
- **Founder rejection / regression** → move back to `doing/`.

`BUGS.md` and `INDEX.md` are always here. `CHANGES.md` is created on first
use: it holds *forward features* and behaviour changes with no underlying
defect (CLAUDE.md §Lifecycle). Its absence means none has shipped yet.

`INDEX.md` carries the per-item "what to test" prose that a bug row cannot —
it is what the founder reads to decide what to try. `tests/lifecycle-index/`
fails the push if it and `BUGS.md` disagree on which items are waiting, after
it listed 5 of 14 on 2026-08-03.
