# TASK-018 — implementation conventions

**Binding contract for every agent working this task.** Agreed before fan-out so
parallel work converges instead of diverging. If something here is wrong, say so
rather than quietly deviating — a second convention is worse than a bad one.

## File ownership during implementation

Each file has exactly ONE owner. Do not edit outside your set.

| Owner | Files |
|---|---|
| Sylvia (Orchestrator) | `package.json`, `tsconfig.json`, `vitest.config.ts`, `tests/harness/**`, one exemplar spec |
| Manifest agent | `tests/manifest/test.sh`, `tests/SUITES.md` (schema + rows) |
| Pipeline agent | `scripts/lib/pipeline.sh`, `scripts/install-toolchain.sh` |
| Isolation agent | `scripts/new-project.sh` (seed only), `tests/template-source/`, `tests/bootstrap-contents/`, `tests/bootstrap-gate/`, `tests/bootstrap-identity/`, `tests/commit-subjects/`, `tests/git-isolation/` |

`docs/doing/BUGS.md` is append-only per agent — add your row, never rewrite
another's.

## Layout

```
package.json          root, private, "type": "module"
tsconfig.json         strict
vitest.config.ts      pool: 'forks', isolate: true
tests/harness/        the fixture API (TypeScript, blueprint-owned)
tests/<suite>/<suite>.spec.ts    migrated suites, one per suite directory
tests/<suite>/test.sh            shell runner, retained until equivalence proven
```

A suite directory may hold BOTH runners during migration. That is deliberate:
§5 of the plan forbids deleting a shell runner before its mutants pass.

## Naming

- Spec file: `tests/<suite>/<suite>.spec.ts` — the basename matches the suite
  directory so the manifest can anchor on it mechanically.
- Scenario names **preserve the shell case IDs verbatim**: `#1`, `#4c`, `#10b`.
  These are the behavioural contract and the thing `git log` and every bug row
  refer to. `it('#4c a BUG parked in backlog/ needs no regression test', …)`.

## The fixture API — what every spec uses

Exported from `tests/harness/index.ts`. **A spec MUST NOT call `spawn`,
`mkdtemp`, `process.env` mutation or `git` directly.** Everything goes through a
handle that owns cleanup, because the whole point is that isolation cannot be
forgotten (BUG-046/BUG-047 were one-line omissions).

```ts
const repo = await fixtureRepo()      // owns its dir, GIT_DIR-safe, auto-removed
const home = await tempHome()         // HOME, TMPDIR, AGENT_* all per-scenario
const proc = await home.spawn(...)    // tracked pid, reaped in afterEach
canary.assertRealStateUnchanged()     // real baton + feed byte-identical
```

Hard requirements of the API, derived from the audit:

1. Every scenario gets its own temp root, resolved with the **physical** path
   (`realpath`) — macOS `/var` vs `/private/var` broke three suites (BUG-036).
2. `HOME`, `TMPDIR`, `AGENT_STATE_HOME`, `AGENT_SIGNAL_FILE`, `AGENT_FEED_LOG`
   are set per scenario, never inherited.
3. `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
   `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` are scrubbed before every child
   process. This is BUG-047, made structurally impossible.
4. Every spawned process is registered and reaped in `afterEach`; a survivor
   fails the test.
5. Teardown asserts the temp root is removed — BUG-049 was 133 MB of debris.

## Parallelism class — declared, not assumed

Every spec declares one, and `tests/manifest` fails on a suite that declares
none (same doctrine as tier and invocation):

- `parallel-safe` — verified by the self-concurrency check.
- `serial-timing` — asserts something about elapsed wall-clock.
- `serial-global` — legitimately observes a global (e.g. `pipeline`'s escape
  canary). Not a defect; a declaration.

**Self-concurrency is necessary and NOT sufficient** — `pipeline` passes it
while its hazard survives, because both copies avoid the shared target. It is
always paired with the real-state canary.

## What a migrated suite must prove before its shell runner is deleted

1. Listed in `tests/SUITES.md`, invoked by gate and CI, covered by the manifest.
2. **Every historical bug it guards has a mutation recipe, and the spec FAILS on
   it with the named scenario.** A suite that cannot fail on the defect it exists
   for is theatre.
3. Both runners green on current code, and both red on the same mutants.
4. Case IDs and count non-decreasing.

## Ground rules

- No commits, no pushes, no branches by agents — Sylvia integrates.
- Never touch `logs/state/signal.md` or run `scripts/signal-set.sh`.
- Never run the full pre-push gate (~13 min).
- Report what you verified by execution vs by reading.
