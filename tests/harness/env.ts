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
 * Every GIT_* / AGENT_* variable this harness knows about, and the KIND of
 * value each one holds.
 *
 * Two families are dangerous to INHERIT, both proven by execution rather than
 * by reasoning:
 *
 *  - git's repo pointers. With GIT_DIR set, `git -C <fixture> init` returns 0,
 *    creates no .git in the fixture, and every later commit lands in the
 *    directory GIT_DIR names — i.e. the real repository (BUG-014, BUG-047).
 *  - the blueprint's own coordination state. signal-set.sh honours
 *    AGENT_SIGNAL_FILE and AGENT_STATE_HOME, and codex-signal-watch.sh exports
 *    AGENT_SIGNAL_FILE into every dispatched wake — which is why BUG-046 struck
 *    during a Codex review and not during ordinary local runs.
 *
 * THE KIND DECIDES WHAT A DELIBERATE OVERRIDE GETS, because one check is not
 * meaningful for all of them:
 *
 *   'path'      scrubbed; an override must resolve inside the workspace.
 *   'path-list' scrubbed; a COLON-SEPARATED list of paths — git accepts
 *               several — validated element by element, because the joined
 *               string is not a path and judging it as one refuses every
 *               legitimate multi-element value.
 *   'opaque'    scrubbed; an override is NOT checked, because a name has
 *               nothing to contain. A containment check here is worse than
 *               none: it rejects `AGENT_PERSONA=Vitali` with a message about
 *               paths, which is the BUG-041/BUG-042 misdirection class — a
 *               guard indicting the thing it was pointed at — rebuilt inside
 *               the guard.
 *   'inert'     NOT scrubbed and not checked. Declared safe both ways: git's
 *               author/committer identity and two feed labels carry no path,
 *               redirect nothing, and are what tests/bootstrap-* and
 *               tests/template-source legitimately pass.
 *   'denied'    scrubbed, and an override is REFUSED outright — there is no
 *               contained form of it. See the GIT_CONFIG_* switches below.
 *
 * AND AN UNDECLARED GIT_* / AGENT_* OVERRIDE IS REFUSED TOO. That is the half
 * this table was missing: it said what happens to the names in it and nothing
 * at all about the rest, so every other variable in both namespaces passed
 * through no check whatsoever — the same shape as GIT_CONFIG_COUNT one level
 * up, and it is how GIT_CONFIG_KEY_<n> was reachable. Declaring a variable is
 * now the only way to pass one, and the refusal says so.
 *
 * The kinds and the scrub list are ONE declaration, not two: FORBIDDEN_ENV is
 * derived from it. A second hand-written copy is how BUG-051, BUG-053 and
 * BUG-061 each went stale — an enumeration cannot see what it was never told
 * about.
 */
const ENV_KIND = {
  // git repo pointers (BUG-014 / BUG-047)
  GIT_DIR: 'path',
  GIT_WORK_TREE: 'path',
  GIT_INDEX_FILE: 'path',
  GIT_OBJECT_DIRECTORY: 'path',
  GIT_ALTERNATE_OBJECT_DIRECTORIES: 'path-list',
  GIT_CEILING_DIRECTORIES: 'path-list',
  // git identity/config resolution — a fixture must not read the developer's
  // real config, and must not be able to write it either.
  GIT_CONFIG: 'path',
  GIT_CONFIG_GLOBAL: 'path',
  GIT_CONFIG_SYSTEM: 'path',
  // THE CONFIG-INJECTION SWITCHES, and the reason 'opaque' was wrong for the
  // count. "A number redirects no write and names nothing on disk" is true of
  // GIT_CONFIG_COUNT alone, and it is never alone: it is the SWITCH that
  // activates GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n>, and GIT_CONFIG_PARAMETERS
  // carries the same pairs inline. Probed on this machine's git before this
  // line was written:
  //
  //   GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath \
  //     GIT_CONFIG_VALUE_0=/tmp/evil-hooks git config --get core.hooksPath
  //   → /tmp/evil-hooks
  //
  // That is A-22/BUG-004 — the failure BUG-047 produced from inside a test —
  // arriving past every containment check in this file, with the guard's own
  // classification saying the value was harmless. Denied rather than validated:
  // a fixture that needs configuration has two contained ways to get it (set it
  // in its own repository, or point GIT_CONFIG_GLOBAL at a file inside the
  // workspace), so validating a third — which would mean modelling what every
  // git config key does with its value — buys nothing.
  GIT_CONFIG_COUNT: 'denied',
  GIT_CONFIG_PARAMETERS: 'denied',
  // blueprint coordination state (BUG-046 / BUG-030)
  AGENT_SIGNAL_FILE: 'path',
  AGENT_STATE_HOME: 'path',
  AGENT_FEED_LOG: 'path',
  // A persona NAME, a backing-agent LABEL, and a gate-profile NAME.
  AGENT_PERSONA: 'opaque',
  AGENT_BACKING: 'opaque',
  AGENT_GATE_PROFILE: 'opaque',
  // Declared safe to inherit as well as to set. The identity four are what a
  // bootstrap fixture needs in order to commit at all; AGENT_CI_WATCH=0 is how
  // a fixture gate is told not to background a CI watcher; AGENT_FEED_TAG is a
  // feed label that scenarioEnv sets on every scenario anyway, so an ambient
  // one never reaches a fixture through the harness.
  GIT_AUTHOR_NAME: 'inert',
  GIT_AUTHOR_EMAIL: 'inert',
  GIT_COMMITTER_NAME: 'inert',
  GIT_COMMITTER_EMAIL: 'inert',
  AGENT_CI_WATCH: 'inert',
  AGENT_FEED_TAG: 'inert',
} as const satisfies Record<string, EnvKind>

type EnvKind = 'path' | 'path-list' | 'opaque' | 'inert' | 'denied'

export type ForbiddenVar = keyof typeof ENV_KIND

/** Everything the scrub removes: every declared variable that is not 'inert'. */
export const FORBIDDEN_ENV = (Object.keys(ENV_KIND) as ForbiddenVar[]).filter(
  (k) => ENV_KIND[k] !== 'inert',
) as readonly ForbiddenVar[]

/**
 * The kind that governs an override of `key`.
 *
 * Undeclared names in the GIT_* / AGENT_* namespaces are DENIED rather than
 * waved through — see the table above. Anything else (PATH, HOME, TMPDIR,
 * LC_ALL) is not this harness's business and returns undefined.
 */
function overrideKind(key: string): EnvKind | undefined {
  const declared = (ENV_KIND as Record<string, EnvKind>)[key]
  if (declared !== undefined) return declared
  return /^(GIT|AGENT)_/.test(key) ? 'denied' : undefined
}

/**
 * Does this path, resolved PHYSICALLY, land inside the workspace?
 *
 * The nearest existing ancestor is what gets resolved: the path itself usually
 * does not exist yet — a fixture names where it wants git to write — and a
 * symlink anywhere along the existing part is exactly the redirect this is
 * here to catch (the same reasoning as ScopedFs.resolve, BUG-058).
 */
function resolvesInsideWorkspace(value: string, workspaceRoot: string): boolean {
  const target = resolve(value)
  let ancestor = target
  for (;;) {
    try {
      const physicalAncestor = realpathSync(ancestor)
      const suffix = target.slice(ancestor.length).replace(/^[/\\]+/, '')
      const physicalTarget = resolve(physicalAncestor, suffix)
      return (
        physicalTarget === workspaceRoot ||
        physicalTarget.startsWith(workspaceRoot + sep)
      )
    } catch {
      const parent = dirname(ancestor)
      if (parent === ancestor) return false
      ancestor = parent
    }
  }
}

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
 *
 * Deliberate is not unconditional, though: an override is checked against the
 * KIND declared for it, and a GIT_* / AGENT_* name with no declaration — or one
 * declared 'denied' — is refused rather than passed on. "The spec author meant
 * it" is not a containment argument; it is how GIT_CONFIG_COUNT would have
 * carried `core.hooksPath` into a fixture with every check reporting green.
 */
/**
 * Refuse an override the declared kind does not permit. Silent when it does.
 *
 * Split out of fixtureEnv so the refusal reads as one decision per variable
 * rather than as three nested branches inside a loop.
 */
function assertOverrideAllowed(
  key: string,
  value: string,
  workspaceRoot?: string,
): void {
  const kind = overrideKind(key)

  if (kind === 'denied') {
    throw new Error(
      key in ENV_KIND
        ? `Refusing forbidden environment override ${key}=${value}: the ` +
            `GIT_CONFIG_* switches apply configuration no file ever held — ` +
            `GIT_CONFIG_COUNT activates GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n>, ` +
            `GIT_CONFIG_PARAMETERS carries the pairs inline — so this sets ` +
            `core.hooksPath or include.path past every containment check here. ` +
            `Set the config in the fixture's own repository, or point ` +
            `GIT_CONFIG_GLOBAL at a file inside the workspace.`
        : `Refusing UNDECLARED environment override ${key}=${value}: every ` +
            `GIT_* and AGENT_* variable a fixture may receive is declared in ` +
            `tests/harness/env.ts with the kind of value it holds, and an ` +
            `undeclared one has been through no check at all. Declare it with ` +
            `its kind (and why that kind is right), or use one already declared.`,
    )
  }

  if (kind !== 'path' && kind !== 'path-list') return

  // `/dev/null` is the standard read-only way to suppress a developer's real
  // git config, and it is outside every workspace by definition.
  if (
    (key === 'GIT_CONFIG_GLOBAL' || key === 'GIT_CONFIG_SYSTEM') &&
    value === '/dev/null'
  ) {
    return
  }

  // A list is validated ELEMENT BY ELEMENT. Joined, it is not a path, so a
  // value with two perfectly contained entries would be refused.
  const paths = kind === 'path-list' ? value.split(':').filter(Boolean) : [value]
  for (const path of paths) {
    if (
      workspaceRoot !== undefined &&
      resolvesInsideWorkspace(path, workspaceRoot)
    ) {
      continue
    }
    throw new Error(
      `Refusing forbidden environment override ${key}=${value}: ` +
        `the path ${path} must be inside the scenario workspace ` +
        `${workspaceRoot ?? '(missing)'}`,
    )
  }
}

export function fixtureEnv(
  overrides: Record<string, string | undefined> = {},
  workspaceRoot?: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }

  for (const key of FORBIDDEN_ENV) {
    delete env[key]
  }

  // The pair variables have no fixed names, so the scrub is by PREFIX: git
  // reads GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n> for any n. They are inert
  // without one of the two switches above, and both are denied — but a prefix
  // covers the next switch git invents before anyone here has heard of it,
  // which a name list cannot.
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_CONFIG')) delete env[key]
  }

  // The pair variables have no fixed names, so the scrub is by PREFIX: git
  // reads GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n> for any n. They are inert
  // without one of the two switches above, and both are denied — but a prefix
  // covers the next switch git invents before anyone here has heard of it,
  // which a name list cannot.

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
      continue
    }
    assertOverrideAllowed(key, value, workspaceRoot)
    env[key] = value
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
