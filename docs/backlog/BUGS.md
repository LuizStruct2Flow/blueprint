# Parked Bugs

Bugs that keep a `BUG-XXX` identity but aren't active work. Each row
carries the reproduction / trigger that re-opens it. See
[README.md](README.md) for the lifecycle.

| # | Bug | Last seen | Re-open trigger |
|---|---|---|---|
| **BUG-021** | **Codex output is labelled `[CODEX]`, never `[Persona - Codex]`.** [`scripts/agent-activity.sh:486`](../../scripts/agent-activity.sh#L486) pumps `codex-runs.log` under a **static** label bound once at daemon start. The persona is a *per-dispatch* fact, so the feed cannot know it — only the launcher, which holds `$AGENT_SIGNAL_HOLDER` at that moment, can. Fix proven downstream in the redcare blueprint: the launcher self-appends to the feed and the feed stops merging that source. | 2026-08-05 — 11 bare `[CODEX]` vs 2 `[Persona - Codex]` in this repo; 103 vs 5 in linkedin-watcher-agent; **0 vs 237** in redcare | Any session where the founder cannot tell which persona produced a Codex line. Both defective repos derive from this blueprint, so it ships. |

This row is a **back-propagation candidate, not fresh design** — it is fixed and
running in the redcare blueprint, a derived project. That is the direction
§"The blueprint is derived, not designed" prescribes: prove it downstream, then
travel up. What arrives here is a *request* to implement, not a patch to copy.
