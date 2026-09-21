# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-066** | **A Codex dispatch can commit its own work.** `scripts/start-codex-signal-watch.sh` passes `codex exec --add-dir <git common dir>`, so `.git` is writable while the sandbox stays `workspace-write`; a linked worktree grants its common dir, not its `.git` pointer file. Authored by Elias (Codex), reviewed APPROVE by Thomas (Kimi). **LANDED**, CI green on `6196bdd` (2026-09-21). | S3 | **What to test:** dispatch any Codex persona on a small item and check `git log`: the commit is its own, not the Orchestrator's. That first real commit is the one proof still outstanding. | **Re-open if** a Codex dispatch cannot commit, or the sandbox is widened beyond the git dir. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.
