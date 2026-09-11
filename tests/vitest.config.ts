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
    // 600s -> 320s on 2026-09-11, on a MEASUREMENT rather than on the plan's
    // prediction, because the paragraph this replaces told the next reader not
    // to carry a number forward.
    //
    // The 600 was temporary by design: `bootstrap-gate` #2/#3 bootstraps a
    // project and runs that project's ENTIRE pre-push gate, and while the
    // migration kept both implementations that nested gate ran 35 shell suites
    // AND every TypeScript spec. It roughly doubled and hit the old 300s
    // ceiling at 300005ms. The shell runners are now retired, so that half is
    // gone: the case was re-run on this tree and reported 206716ms, against
    // 374491ms before. 320s is 1.5x that, rounded up.
    //
    // WHAT THE CEILING NOW COVERS is one nested gate of ~207s whose cost is
    // almost entirely the nested vitest run -- there is no shell half left to
    // remove. So the next lever on this number is TASK-013, the declared
    // bootstrap profile, and it stopped being one optimisation among many.
    // If this is ever hit again, measure #2/#3 before raising it.
    testTimeout: 320_000,
    hookTimeout: 120_000,

    // A scenario that leaves a stray handle is a scenario that leaked a process
    // or a watcher — that is a defect under this task's own contract, not a
    // reason to force-exit and move on.
    dangerouslyIgnoreUnhandledErrors: false,

    reporters: ['default'],
  },
})
