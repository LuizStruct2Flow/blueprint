/**
 * tests/harness/index.ts — the ONLY way a spec obtains a fixture.
 *
 * The contract, and the reason it is shaped this way:
 *
 * BUG-046 and BUG-047 were each ONE MISSING LINE in a shell suite. A missing
 * `unset AGENT_SIGNAL_FILE`; a missing `unset GIT_DIR`. Both survived months of
 * review, in four suites and two suites respectively, and the guard meant to
 * catch the second chose its population by grepping comments.
 *
 * CLAUDE.md already states the conclusion: "a rule that must be remembered at
 * the moment the author is busy is the wrong shape of fix." That is why this
 * module exports no primitive that lets a spec build its own environment. There
 * is no scenario in which forgetting is possible, because there is no path that
 * requires remembering.
 *
 * USAGE
 *
 *   import { scenario } from '../harness/index.js'
 *
 *   describe('BUG-036 — process cwd resolves on this OS', () => {
 *     it('#2 a live process resolves to its start directory', async () => {
 *       await scenario('proc-cwd-2', async (s) => {
 *         const dir = await s.workspace.dir('plain')
 *         const r = await s.run('sh', ['-c', 'pwd'], { cwd: dir })
 *         expect(r.stdout.trim()).toBe(dir)
 *       })
 *     })
 *   })
 */

import { afterEach, expect } from 'vitest'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorkspace, type Workspace } from './workspace.js'
import { ProcessRegistry, type RunResult, type SpawnOptions } from './process.js'
import { RealStateCanary, realStateTargets } from './canary.js'
import { assertProcessEnvClean } from './env.js'
import { ScopedFs } from './files.js'
import {
  makeFixtureRepo,
  makeShimDir,
  type FixtureRepo,
  type FixtureRepoOptions,
  type ShimDir,
} from './fixture-repo.js'

/** Absolute path to the blueprint checkout under test. */
export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

export interface Scenario {
  /** This scenario's private, physical-path temp root. */
  readonly workspace: Workspace
  /** Per-scenario HOME. Real $HOME is never visible to a fixture child. */
  readonly home: string
  /** Per-scenario AGENT_STATE_HOME. */
  readonly stateHome: string
  /** Per-scenario baton path. Never the real one. */
  readonly signalFile: string
  /** Per-scenario feed log. Never the real one. */
  readonly feedLog: string
  /** A token that must never appear in real logs. */
  readonly escapeToken: string

  /** Run a process to completion, scrubbed and tracked. */
  run(command: string, args: string[], options: SpawnOptions): Promise<RunResult>

  /** Run a shell script from the blueprint under test. */
  runScript(relPath: string, args?: string[], options?: Partial<SpawnOptions>): Promise<RunResult>

  /**
   * Filesystem operations that REFUSE to write outside this workspace.
   *
   * Added after Andreas (Codex) pointed out that the first version enforced
   * isolation for processes but only asked for it politely for files — and
   * `writeFile` is one import away while spawning is not. The canary caught
   * such a write after the fact; this prevents it.
   */
  readonly fs: ScopedFs

  /** A git repository this scenario owns. Identity is local, never global. */
  gitRepo(name: string, options?: FixtureRepoOptions): Promise<FixtureRepo>

  /** A directory of executable shims, plus a PATH that finds them first. */
  shimDir(name?: string): Promise<ShimDir>
}

/**
 * The default environment every fixture child receives.
 *
 * Every one of these is a variable that a shell suite forgot at least once.
 */
function scenarioEnv(s: {
  home: string
  stateHome: string
  signalFile: string
  feedLog: string
  workspaceRoot: string
  escapeToken: string
}): Record<string, string> {
  return {
    HOME: s.home,
    // TMPDIR too: a fixture that calls mktemp must land inside its own
    // workspace, or it contributes to the $TMPDIR debris that a2bp-e2e:309
    // scans and that BUG-049 measured at 133 MB.
    TMPDIR: join(s.workspaceRoot, 'tmp'),
    AGENT_STATE_HOME: s.stateHome,
    AGENT_SIGNAL_FILE: s.signalFile,
    AGENT_FEED_LOG: s.feedLog,
    // THE ESCAPE TOKEN HAS TO RIDE ON THE LINES THEMSELVES, or the canary that
    // searches the real feed for it can never fire. Pinning AGENT_FEED_LOG is
    // what SHOULD keep a fixture out of the real feed; these two are what makes
    // a failure of that pinning visible, and they are the same trick
    // tests/pipeline #19 plays by naming its fixture stage after the token.
    //
    //   AGENT_FEED_TAG  scripts/lib/pipeline.sh:173 renders every gate line as
    //                   "[${AGENT_FEED_TAG:-GATE}] …", so a whole gate run —
    //                   header, every stage, the summary — carries it.
    //   AGENT_PERSONA   scripts/agent-activity.sh:113 labels the supervisor's
    //                   lines with it, and that script IGNORES AGENT_FEED_LOG
    //                   (line 78 derives the path from the repo root), so it is
    //                   the one writer a scenario can invoke that reaches the
    //                   real feed with the pinning fully intact. It is the leak
    //                   most worth being able to see.
    //
    // WHAT THIS DOES NOT COVER — and "does not cover" means NOT DETECTED AT
    // ALL, not "detected by the other half". An append leaves the captured
    // content intact as a prefix, so the canary's prefix check passes on every
    // append by construction; with no token in the line, the token check passes
    // too. These writers therefore reach the operator's feed unseen:
    //
    //   scripts/watch-ci.sh:45      labels its lines with the LITERAL "[CI]".
    //   scripts/log-activity.sh:172 takes its persona from the hook payload.
    //   .githooks/pre-push-project  RE-SETS AGENT_FEED_TAG itself (:838 to
    //                               "DoD-Gate", :852 back to "GATE"), so a
    //                               fixture that runs a whole gate — which
    //                               tests/bootstrap-gate does — emits untagged
    //                               lines for exactly those stages.
    //   feed_append "<prose>"       anything calling the appender directly.
    //
    // So this is a real check over the two dominant writers, and it is not a
    // claim that every append is detectable. canary.ts states the same scope
    // where the check lives, and harness.spec.ts pins it with a case.
    //
    // AND THE TOKEN CANNOT BE OVERRIDDEN AWAY. A per-call `env` merges OVER
    // this object, so `{ env: { AGENT_FEED_TAG: 'DoD-Gate' } }` used to replace
    // the token and silently convert a detectable leak into the undetectable
    // untagged one above — the fix for BUG-062 with a one-line route to defeat
    // itself. env.ts declares AGENT_FEED_TAG 'scenario-token': an override must
    // still CONTAIN the token (`${s.escapeToken}-my-tag`), and unsetting it is
    // refused.
    //
    // AGENT_PERSONA IS DELIBERATELY NOT PROTECTED THAT WAY, and that is a real
    // residual limit rather than an oversight. It is a persona NAME, and
    // tests/roster and tests/codex-persona-label exist to assert what a named
    // persona renders as, so composing a token into it would break the thing
    // under test. A scenario that overrides AGENT_PERSONA therefore gives up
    // the agent-activity.sh half of the detection for that scenario; the
    // AGENT_FEED_TAG half still holds.
    AGENT_FEED_TAG: s.escapeToken,
    AGENT_PERSONA: s.escapeToken,
    // Deterministic collation and character classes. [[:space:]] is
    // locale-dependent and matched U+00A0 under a UTF-8 locale on BSD, which is
    // BUG-043 — the baton trimmed differently depending on the publisher's LANG.
    LC_ALL: 'C',
  }
}

/**
 * Run one isolated scenario.
 *
 * Guarantees, each enforced rather than documented:
 *  1. A private workspace at a physical path (BUG-036).
 *  2. HOME, TMPDIR and every AGENT_* variable are per-scenario (BUG-046).
 *  3. Git repo pointers and config vars are scrubbed from every child (BUG-047).
 *  4. Every spawned process is reaped; a survivor fails the test.
 *  5. Real baton, journal, feed and git config are byte-unchanged (BUG-030).
 *  6. The workspace is removed, and the removal is asserted (BUG-049).
 */
export async function scenario(
  label: string,
  body: (s: Scenario) => Promise<void>,
): Promise<void> {
  assertProcessEnvClean()

  const workspace = await createWorkspace(label)
  const canary = await RealStateCanary.capture(realStateTargets(REPO_ROOT))
  const escapeToken = RealStateCanary.escapeToken(label)
  const registry = new ProcessRegistry(workspace.root, escapeToken)

  const home = await workspace.dir('home')
  const stateHome = await workspace.dir('state')
  await workspace.dir('tmp')
  const signalFile = join(stateHome, 'signal.md')
  const feedLog = join(await workspace.dir('logs'), 'agent-activity.log')

  const baseEnv = scenarioEnv({
    home,
    stateHome,
    signalFile,
    feedLog,
    workspaceRoot: workspace.root,
    escapeToken,
  })
  const scopedFs = new ScopedFs(workspace.root)

  const s: Scenario = {
    workspace,
    home,
    stateHome,
    signalFile,
    feedLog,
    escapeToken,

    run(command, args, options) {
      return registry.run(command, args, {
        ...options,
        env: { ...baseEnv, ...(options.env ?? {}) },
      })
    },

    runScript(relPath, args = [], options = {}) {
      return registry.run('bash', [join(REPO_ROOT, relPath), ...args], {
        cwd: options.cwd ?? workspace.root,
        timeoutMs: options.timeoutMs,
        env: { ...baseEnv, ...(options.env ?? {}) },
      })
    },

    fs: scopedFs,

    async gitRepo(name, repoOptions = {}) {
      const dir = await workspace.dir(name)
      return makeFixtureRepo(
        (command, args, opts) =>
          registry.run(command, args, {
            ...opts,
            env: { ...baseEnv, ...(opts.env ?? {}) },
          }),
        dir,
        repoOptions,
      )
    },

    async shimDir(name = 'shims') {
      const dir = await workspace.dir(name)
      return makeShimDir(
        dir,
        (rel, content, o) => scopedFs.write(rel, content, o),
        name,
      )
    },
  }

  let bodyError: unknown
  try {
    await body(s)
  } catch (err) {
    bodyError = err
  }

  // Teardown runs even when the body failed, and its own failures are reported
  // — but never in a way that hides the original error, because a leaked
  // process is less interesting than the assertion that just failed.
  const survivors = await registry.disposeAll()
  let teardownError: unknown

  try {
    await canary.assertUnchanged(escapeToken)
    await workspace.dispose()
    if (survivors.length > 0) {
      throw new Error(
        `Scenario left ${survivors.length} process(es) running: ` +
          `${survivors.join(', ')}. Every spawned process must be reaped by the ` +
          `scenario that started it — orphaned supervisors at ppid 1 caused a ` +
          `real, hours-long misdiagnosis on 2026-09-09.`,
      )
    }
  } catch (err) {
    teardownError = err
  }

  if (bodyError) throw bodyError
  if (teardownError) throw teardownError
}

/**
 * Fail loudly if a spec forgot to go through `scenario()`.
 *
 * Registered globally so that a spec spawning processes directly still gets
 * SOME protection — the conventions forbid it, but a forbidden practice that
 * nothing detects is exactly how BUG-046 survived in four suites at once.
 */
afterEach(() => {
  expect(
    process.env.GIT_DIR,
    'GIT_DIR leaked into the test process — a spec bypassed the harness',
  ).toBeUndefined()
})

export { RealStateCanary, realStateTargets } from './canary.js'
export type { RunResult } from './process.js'
export type { Workspace } from './workspace.js'
