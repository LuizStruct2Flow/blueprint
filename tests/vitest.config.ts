import { defineConfig } from 'vitest/config'

// TASK-018 — the blueprint's own regression suites.
//
// THIS FILE LIVES UNDER tests/, WHICH IS THEREFORE VITEST'S ROOT (TASK-020).
// `tests/` is a blueprint-managed DIRECTORY that no derived project owns a copy
// of, so the harness manifest beside it travels by both propagation paths or by
// neither, and a project's own root package.json can never be clobbered by a
// pull. The include glob below is root-relative in consequence — `**/*.spec.ts`,
// not `tests/**/*.spec.ts`. tests/manifest #4 asserts it still reaches the
// specs, because narrowing it is a coverage cut that breaks no other link.
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
    include: ['**/*.spec.ts'],

    // Forks, not threads: these suites spawn real processes and mutate real
    // environment variables. Worker threads share a process and therefore share
    // process.env and the cwd, which would reintroduce the exact class of
    // cross-contamination BUG-046 and BUG-047 are about.
    pool: 'forks',
    isolate: true,

    // Serial by default. TASK-018-RULES R5 is that tests run in parallel with
    // no serial category and no escape hatch — but R5 is a property R3's
    // isolation has to earn first, suite by suite. Starting parallel today
    // would turn latent races (staleness #8, pre-push-secrets #10, both of
    // which pass largely BECAUSE the gate is serial) live on day one.
    fileParallelism: false,

    // These drive real gates, real bootstraps and real daemons. The shell
    // suites they replace take up to ~180s (bootstrap-gate), and the host may
    // be running an emulated toolchain, so the default 5s would fail honest
    // tests. Individual scenarios tighten this where they can.
    //
    // 300s -> 600s on 2026-09-11, and the reason is temporary BY DESIGN.
    // `bootstrap-gate` #2/#3 bootstraps a project and runs that project's ENTIRE
    // pre-push gate. Until phase 2 that nested gate ran 35 shell suites; it now
    // runs those AND 35 TypeScript specs, because the migration keeps both
    // implementations until each port is independently certified. The nested run
    // therefore roughly doubled and hit the old ceiling at 300005ms -- a timeout,
    // not a failure: 707 of 708 tests passed and the casualty was the case that
    // is slowest by construction.
    //
    // This number comes back DOWN when the shell runners retire. If you are
    // reading it long after that has happened, the double-run is over and the
    // ceiling is now hiding something else -- measure before raising it again.
    testTimeout: 600_000,
    hookTimeout: 120_000,

    // A scenario that leaves a stray handle is a scenario that leaked a process
    // or a watcher — that is a defect under this task's own contract, not a
    // reason to force-exit and move on.
    dangerouslyIgnoreUnhandledErrors: false,

    reporters: ['default'],
  },
})
