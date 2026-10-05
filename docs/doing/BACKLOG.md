# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-089** | **a2bp request [PR #86](https://github.com/LuizStruct2Flow/blueprint/pull/86) (stash2flow): the mic-monitor recipe in `AGENT_SIGNAL.md` watches nothing.** §"Reactivity" mechanism 1 resolved the baton with `agent_signal_file "$PWD"`, but `agent_signal_file` takes no argument and refuses one (`scripts/lib/state-dir.sh:238`), so `SIG` came back empty and the loop polled nothing, silently: the session that armed it believed it was covered. Measured here: the old form prints the refusal and leaves `SIG=''` (exit 2). **Implemented, adapted:** the request set `BP_CODE_ROOT`/`BP_STATE_ROOT` and kept the no-argument call; the blueprint already has the root-taking form, `agent_signal_file_for "$PWD"`, which the refusal message itself names, so the recipe uses that. The request's two other lines are taken as they were: the recipe refuses to start when the baton is missing, and prints `[signal-monitor] armed on <path>` when it starts. | S2 | KEEP | Filed by stash2flow's `blueprint a2bp` on 2026-10-03; judged and implemented by Eto on 2026-10-05, the a2bp decision step being this read of the diff against `state-dir.sh`. **What to test:** run the recipe's lines from a project root: it prints `armed on …/logs/state/signal.md`, and a flip of the mic prints `[signal-change] Holder=… State=…`. PR #86 is closed with a pointer to the landed commit. |
