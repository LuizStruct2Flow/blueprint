import { defineConfig } from 'vitest/config'

// TASK-018 — the blueprint's own regression suites.
//
// READ THIS BEFORE TRUSTING THE POOL SETTINGS. `pool: 'forks'` and
// `isolate: true` isolate JavaScript modules and worker processes. They do NOT
// sandbox $HOME, OS files, real git repositories, lock files, spawned child
// processes or ports — which is the entire surface these suites touch. The
// isolation the founder asked for comes from tests/harness/, not from here.
// Anyone who reads this config as "vitest handles isolation" will ship the same
// hazards with better syntax (PLAN-TASK-018 §4.2).
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],

    // Forks, not threads: these suites spawn real processes and mutate real
    // environment variables. Worker threads share a process and therefore share
    // process.env and the cwd, which would reintroduce the exact class of
    // cross-contamination BUG-046 and BUG-047 are about.
    pool: 'forks',
    isolate: true,

    // Serial by default. Parallelism is EARNED per suite by declaring
    // `parallel-safe` in tests/SUITES.md and passing the self-concurrency
    // check — never assumed. Starting parallel would turn today's latent races
    // (staleness #8, pre-push-secrets #10, both of which pass largely BECAUSE
    // the gate is serial) live on day one.
    fileParallelism: false,

    // These drive real gates, real bootstraps and real daemons. The shell
    // suites they replace take up to ~180s (bootstrap-gate), and the host may
    // be running an emulated toolchain, so the default 5s would fail honest
    // tests. Individual scenarios tighten this where they can.
    testTimeout: 300_000,
    hookTimeout: 120_000,

    // A scenario that leaves a stray handle is a scenario that leaked a process
    // or a watcher — that is a defect under this task's own contract, not a
    // reason to force-exit and move on.
    dangerouslyIgnoreUnhandledErrors: false,

    reporters: ['default'],
  },
})
