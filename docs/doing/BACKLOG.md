# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-090** | **The blueprint's own pre-push gate runs the contamination push scan.** Founder decision 2026-10-05, answering "should the pre-push gate run the contamination push scan? Today only CI runs it": **"yes, do it."** The CI-only gap turned `main` red three times (`4a2b7e2`, `5966207`, `d334541`) — each a line the gate could have caught before the push. The gate stage `contamination · TASK-090` runs `scripts/contamination-push-scan.mts --before <base> --after HEAD` on every blueprint push — the text-only profile included, through `ts_docs_stage`, because shipped markdown is exactly what the scan judges — and blocks on a BLOCK finding, exactly as CI's `contamination` job does. Wired inside `scripts/run-ts-suites.sh` (the hooks are legacy shell; editing them would force their whole-file port); the base resolves as the shell inventory's (`BP_SHELL_INVENTORY_BASE`, then `@{u}`, then `origin/main`) and fails closed when none resolves. CI stays the backstop. Enforced by tests/ts-bridge #cps-0–#cps-4 and tests/gate-ci-parity. | S1 | Gate | Travels to `waiting-acceptance/` when the push lands; founder acceptance is the gate. |
