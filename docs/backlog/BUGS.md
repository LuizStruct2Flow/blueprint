# Parked Bugs

Bugs that keep a `BUG-XXX` identity but aren't active work. Each row
carries the reproduction / trigger that re-opens it. See
[README.md](README.md) for the lifecycle.

| # | Bug | Last seen | Re-open trigger |
|---|---|---|---|
| **BUG-021** | **Codex output is labelled `[CODEX]`, never `[Persona - Codex]`.** [`scripts/agent-activity.sh:486`](../../scripts/agent-activity.sh#L486) pumps `codex-runs.log` under a **static** label bound once at daemon start. The persona is a *per-dispatch* fact, so the feed cannot know it — only the launcher, which holds `$AGENT_SIGNAL_HOLDER` at that moment, can. Fix proven downstream in the redcare blueprint: the launcher self-appends to the feed and the feed stops merging that source. | 2026-08-05 — 11 bare `[CODEX]` vs 2 `[Persona - Codex]` in this repo; 103 vs 5 in linkedin-watcher-agent; **0 vs 237** in redcare | Any session where the founder cannot tell which persona produced a Codex line. Both defective repos derive from this blueprint, so it ships. |
| **BUG-022** | **A dispatch to a dead watcher fails silently.** Mic state and dispatcher liveness are unremarkable alone and conclusive together, and nothing compares them: the baton reads `OVER_TO_CODEX`, the feed is quiet *exactly as it looks when an agent is thinking*, and the run log — the only honest surface — is the one nobody reads. Solved downstream as redcare's BUG-033: an edge-triggered check in the feed, which already polls and already reads the mic, so the comparison is free. **Liveness comes from the lock record, never `pgrep`** — every process-table check written during their incident matched its own command line. Scope note: proves the *process exists*, not that it is healthy; a wedged watcher still reads alive, and closing that needs a heartbeat in every dispatcher. | 2026-08-05 — Alexis dispatched, baton sat at `OVER_TO_CODEX` with no listener; found only because the founder asked. redcare's own instance cost ~40 min | Any dispatch that produces no reply. Recurs on every watcher crash, which is unattended by definition. |

Both rows are **back-propagation candidates, not fresh design** — each is fixed
and running in the redcare blueprint, a derived project. That is the direction
§"The blueprint is derived, not designed" prescribes: prove it downstream, then
travel up. What arrives here is a *request* to implement, not a patch to copy.
