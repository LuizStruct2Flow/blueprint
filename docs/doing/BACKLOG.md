# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-091** | **A client's name must not appear in this public repository.** Founder, 2026-10-11. The name, and two of its repository names, sat in 17 tracked files as the label for a peer stream. **Done in the tree:** 16 files now say "the peer stream" (docs, three test files, two exempt shell files, one historical test snapshot), and a test fixture's example env prefix became `ACME_`. **Still open, both the founder's call:** (1) one comment line in `scripts/lib/state-dir.sh`, a legacy shell file the shell-inventory gate refuses any edit to short of a whole-file port (`AGENTS.md` §"Shell to TypeScript"); (2) git history, where the name stays in old file versions and in 16 commit subjects until history is rewritten and force-pushed. | S2 | KEEP | Closes when `git grep -i` for the name is empty on `main` and the founder has decided on the history rewrite. |
