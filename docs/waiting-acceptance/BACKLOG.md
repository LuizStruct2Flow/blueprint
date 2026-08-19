# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-012** | **ANSWERED — both halves, 2026-08-19.** Part 1 (strip test): orchestration is **separable-with-work**, so the blueprint is a product with a plug-in orchestration socket. Part 2 (ruflo): **DO NOT ADOPT**, and Q1 decides it alone — ruflo's Codex support is a *dispatcher*, not an observer, so it cannot see a `codex exec` we launched, which is the half of the feed that produces our review findings. Full evidence in [`TASK-012-strip-test.md`](TASK-012-strip-test.md). **Should the blueprint adopt [ruflo](https://github.com/ruvnet/ruflo), and in which form?** Not *how to use it* — that presumes the answer. **Why now:** 2026-08-18 produced four commits of feed plumbing and seven cross-provider review findings, none of which is why anyone would use this blueprint. The differentiator is the four-state lifecycle, the DoD gates, the cross-provider review rule and the `a2bp` sync model; the feed is infrastructure, and infrastructure is what you buy rather than debug. Founder asked whether an off-the-shelf answer exists, which is ladder rung 1 — *does this need to exist at all* — and nobody had asked it about the feed. **THREE QUESTIONS DECIDE IT, and none needs a commitment to answer.** (1) Does its observability capture a **`codex exec` dispatch**, or only Claude agents? Ruflo advertises 5 providers with failover, but that is MODEL ROUTING — our reviews run a different *harness* (`codex exec`, own sandbox, own context), and that is where the findings come from. If it cannot see the Codex half, it replaces the half of our feed that already works. (2) Does the **lite plugin path** (`/plugin install ruflo-core@ruflo`, *"slash commands only, zero workspace files"*) stay out of `CLAUDE.md`? The full CLI writes to `CLAUDE.md`, `.claude/` and `.claude-flow/` — and `CLAUDE.md` is a `MANAGED_FILES` entry that `blueprint pull` owns, so the full path collides head-on with the sync model. (3) Does the dashboard **replace** `tail -f logs/agent-activity.log`, or sit beside it as a second record — the failure mode this repo has fixed three times (TASK-005, the lifecycle triggers, the forwarding notes)? **Evaluate on the lite path only**; the full one adds Node + TypeScript + Rust and a daemon to a repo that is POSIX `sh`, `jq` and `awk`. **Exit criterion is a recommendation with evidence, not a migration.** **Strip test RUN 2026-08-18 — verdict separable-with-work, findings in [`TASK-012-strip-test.md`](TASK-012-strip-test.md).** **Method and sequencing below** — a `MANAGED_FILES` profile rather than a thin fork, and a no-orchestration bootstrap run FIRST, because it answers whether the differentiator is separable at all and cannot be invalidated by whatever ruflo turns out to do. Compare against [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) as the narrower alternative — 12 hook types, but Claude-only and its subagent handling is the bookend approach BUG-027 just replaced. | S2 | KEEP | Founder, 2026-08-18. **Blocks nothing, but should be answered before more feed hardening lands** — if the feed is going to be replaced, BUG-027's residue and FEATURE-004 are work we would throw away. |

*(Empty.)*

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.


*(Empty.)*
