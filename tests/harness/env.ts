import { realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

/**
 * tests/harness/env.ts — the environment a fixture child process may inherit.
 *
 * WHY THIS FILE EXISTS. BUG-046 and BUG-047 were each a single missing line in
 * a shell suite: a missing `unset AGENT_SIGNAL_FILE`, a missing `unset GIT_DIR`.
 * The consequences were not small — a suite overwrote the LIVE coordination
 * baton mid-review, and another rewrote the real repository's git config,
 * setting `core.hooksPath` and thereby producing the A-22/BUG-004 failure from
 * inside a test.
 *
 * Both were invisible for months, and the guard meant to catch the second
 * selected its population by grepping COMMENTS (git-isolation:118).
 *
 * CLAUDE.md already draws the conclusion this file implements: "a rule that
 * must be remembered at the moment the author is busy is the wrong shape of
 * fix." So scrubbing is not a helper a spec may call — it is the only way to
 * obtain an environment at all. There is no exported path to an unscrubbed one.
 */

/**
 * Variables that MUST NOT reach a fixture child.
 *
 * Two families, both proven dangerous by execution rather than by reasoning:
 *
 *  - git's repo pointers. With GIT_DIR set, `git -C <fixture> init` returns 0,
 *    creates no .git in the fixture, and every later commit lands in the
 *    directory GIT_DIR names — i.e. the real repository (BUG-014, BUG-047).
 *  - the blueprint's own coordination state. signal-set.sh honours
 *    AGENT_SIGNAL_FILE and AGENT_STATE_HOME, and codex-signal-watch.sh exports
 *    AGENT_SIGNAL_FILE into every dispatched wake — which is why BUG-046 struck
 *    during a Codex review and not during ordinary local runs.
 */
export const FORBIDDEN_ENV = [
  // git repo pointers (BUG-014 / BUG-047)
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  // git identity/config resolution — a fixture must not read the developer's
  // real config, and must not be able to write it either.
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_COUNT',
  // blueprint coordination state (BUG-046 / BUG-030)
  'AGENT_SIGNAL_FILE',
  'AGENT_STATE_HOME',
  'AGENT_FEED_LOG',
  'AGENT_PERSONA',
  'AGENT_BACKING',
  'AGENT_GATE_PROFILE',
] as const

/**
 * Build the environment for a fixture child process.
 *
 * Starts from the real environment (PATH, LANG, SHELL and the rest are needed —
 * these suites run real tools), then removes every forbidden variable and
 * applies the caller's per-scenario overrides.
 *
 * `overrides` is applied AFTER the scrub deliberately: a scenario that must
 * exercise a forbidden variable — `git-isolation` exists precisely to prove
 * that a hostile GIT_DIR cannot reach the real repo — sets it explicitly and
 * visibly, rather than inheriting it by accident. Deliberate is fine; ambient
 * is the defect.
 */
export function fixtureEnv(
  overrides: Record<string, string | undefined> = {},
  workspaceRoot?: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }

  for (const key of FORBIDDEN_ENV) {
    delete env[key]
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
    } else {
      if ((FORBIDDEN_ENV as readonly string[]).includes(key)) {
        const isNullGitConfig =
          (key === 'GIT_CONFIG_GLOBAL' || key === 'GIT_CONFIG_SYSTEM') &&
          value === '/dev/null'
        let insideWorkspace = false
        if (workspaceRoot !== undefined) {
          let ancestor = resolve(value)
          for (;;) {
            try {
              const physicalAncestor = realpathSync(ancestor)
              const suffix = resolve(value).slice(ancestor.length).replace(/^[/\\]+/, '')
              const physicalValue = resolve(physicalAncestor, suffix)
              insideWorkspace =
                physicalValue === workspaceRoot ||
                physicalValue.startsWith(workspaceRoot + sep)
              break
            } catch {
              const parent = dirname(ancestor)
              if (parent === ancestor) break
              ancestor = parent
            }
          }
        }
        if (!isNullGitConfig && !insideWorkspace) {
          throw new Error(
            `Refusing forbidden environment override ${key}=${value}: ` +
              `the path must be inside the scenario workspace ${workspaceRoot ?? '(missing)'}`,
          )
        }
      }
      env[key] = value
    }
  }

  return env
}

/**
 * Assert that this process itself is not carrying state that would corrupt a
 * fixture. Called once per scenario by the harness.
 *
 * This is belt-and-braces over fixtureEnv, and it is not redundant: it catches
 * the case where a spec bypasses the harness and calls node's child_process
 * directly. The conventions forbid that, but a forbidden practice that nothing
 * detects is how BUG-046 survived in four suites at once.
 */
export function assertProcessEnvClean(): void {
  const carried = FORBIDDEN_ENV.filter((k) => process.env[k] !== undefined)
  if (carried.length > 0) {
    throw new Error(
      `The test process is carrying variables that must never reach a fixture: ` +
        `${carried.join(', ')}. This is the BUG-046/BUG-047 class. The harness ` +
        `scrubs child environments, but a spec calling child_process directly ` +
        `would inherit these — which is why specs must spawn through the ` +
        `harness (docs/doing/TASK-018-CONVENTIONS.md).`,
    )
  }
}
