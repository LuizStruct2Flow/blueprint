# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-091** | **A client's name must not appear in this public repository.** Founder, 2026-10-11. **Done in the tree:** a case-insensitive `git grep` for the name and its two repository names is empty on `main` since `e282216` (17 files reworded at `822f3c3`, the last one removed by TASK-092's port). **Still open, the founder's call:** git history and GitHub. Old file versions and 16 commit subjects carry the name, GitHub keeps every old commit reachable through the pull requests, five pull requests mention it, and PR #25's head branch name contains it and cannot be renamed. The routes: recreate the repository from a rewritten history, force-push a rewritten history and ask GitHub Support to purge, or make the repository private. | S2 | KEEP | Closes when the founder has chosen a route for the history and it is carried out. Do not force-push or pass `--no-verify` without that answer. |
