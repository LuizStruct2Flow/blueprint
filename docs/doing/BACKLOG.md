# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-002** | **REOPENED 2026-08-05** — acceptance rejected. A `commit-msg` hook that rejects a subject not starting with its backlog item (`BUG#20:`, `TASK#1:`). The hook itself works and is not in question. What it does not cover is the **squash-merge path**: GitHub composes the merge commit from the PR title on its own servers, where no client-side hook exists, and CI runs `tests/commit-msg-gate/test.sh` — which exercises the hook against fixtures and never reads the repository's actual commits. So the rule is unenforced at the one door every blueprint change goes through (branch → PR → squash merge). | — | KEEP | Proven by `5fe89e0`, which landed on `main` **after** the gate shipped with the subject `TASK-001/002/003/005/006/007: …` — a form the hook rejects. Closes when a check reads real commit subjects on the PR head and the merge result, not fixtures. |
