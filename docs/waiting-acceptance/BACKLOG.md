# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-018** | **Migrate the blueprint regression suites from shell runners to TypeScript BDD-style tests, with deterministic parallel execution as the payoff rather than the premise.** Founder request, 2026-09-09: the current tests are slow and unpleasant to maintain in shell; the desired end state is BDD tests in TypeScript, parallel where isolation makes that honest. **Current shape:** 41 `tests/*/test.sh` suites, ~13.6k lines, wired one by one through `.githooks/pre-push-project` and duplicated in `.github/workflows/security.yml`; recent local gate runs are ~10 minutes, with `env-namespace` ~104-116s, `agent-activity-bound` ~98-106s, `a2bp-contamination` ~50s, `signal-dispatch`/`baton-durability` ~35-38s, and `a2bp-e2e` ~26-30s. **Decision to make explicit before implementation:** TypeScript improves fixture reuse, assertions, diagnostics, portability and parallel scheduling, but it will not by itself remove real elapsed time from negative timing tests, daemon settle windows, `timeout` cases, or real git/bootstrap end-to-end checks. **Plan:** add a root TS harness (`vitest` is the likely first fit; reserve full `@cucumber/cucumber`/Gherkin for acceptance-level flows if its ceremony earns its keep), typed helpers for hermetic repos/processes/signals/output assertions, and a BDD vocabulary (`given*`, `when*`, `then*`) while still spawning the real shell scripts/hooks as the product under test. Run TS serially at first and keep shell suites beside it until each translated suite proves equivalent; then replace the gate/CI invocation for that suite and delete the old runner. **Migration order:** start with mostly static/CLI suites (`doc-links`, `lifecycle-docs`, `manifest`, `commit-subjects`, `commit-msg-gate`, `env-namespace`, `no-chain-guard`, `proc-cwd`, `signal-set`), then git/bootstrap/a2bp suites, then daemon/timing suites last (`agent-activity-bound`, `signal-dispatch`, `baton-durability`, `wait-mic`, `watcher-liveness`, `subagent-feed`, `roster`). **Parallelism gate:** mark tests parallel-safe only after every scenario owns unique temp dirs, `HOME`, `AGENT_STATE_HOME`, `AGENT_SIGNAL_FILE`, logs, remotes and lock files; unsets inherited git pointers; kills only fixture-owned processes; and never relies on mutable global state. **Toolchain consequence:** this adds a root Node/TypeScript dependency to a blueprint that currently has no root `package.json`, so `scripts/install-toolchain.sh`, `tests/SUITES.md`, `.githooks/pre-push-project`, CI, bootstrap export boundaries and derived-project expectations must change together. **Success measure:** gate output still lists every suite/stage (no silent coverage cut), deterministic suites run safely in parallel, slowest-stage reporting remains honest, and any intentionally serial/timing test is named as such rather than hidden. | S2 | KEEP | Re-open when test-infrastructure work is prioritised, when the gate duration starts causing skipped hooks, or when a new suite would be significantly easier to write in TS than shell. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.


*(Empty.)*
