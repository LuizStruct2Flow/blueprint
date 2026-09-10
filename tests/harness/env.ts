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
 *   'scenario-path'
 *               the scenario OWNS it: scenarioEnv sets it on every child, an
 *               override must resolve inside the workspace, and it may not be
 *               UNSET either. Not scrubbed, because it is replaced rather than
 *               removed — a child with no HOME does not get "no home", it gets
 *               the operator's real one from getpwuid, and a child with no
 *               TMPDIR writes to /tmp.
 *   'scenario-token'
 *               the scenario owns it AND its value is load-bearing: it carries
 *               the escape token that makes a leak into the operator's real
 *               feed visible (BUG-062). An override must still contain the
 *               token. Dropping it is permitted ONLY when the child has been
 *               handed its own feed AND that feed is provably inside the
 *               workspace — see assertTokenMayBeDropped.
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
  // AGENT_CI_WATCH IS A BEHAVIOURAL SWITCH, NOT A LABEL, and 'inert' was wrong
  // for it in both directions. .githooks/pre-push:569 backgrounds
  // scripts/watch-ci.sh when "${AGENT_CI_WATCH:-1}" is 1 — so an INHERITED 1
  // (or an inherited empty-but-set value, or anything that is not 0) makes a
  // fixture that runs a gate spawn a real CI watcher against the operator's
  // repository, out of a test. Scrubbed for that reason; an override is not
  // checked because "0"/"1" contains nothing to contain, and tests/bootstrap-gate
  // passes 0 deliberately to suppress exactly this.
  AGENT_CI_WATCH: 'opaque',
  // AGENT_FEED_TAG CARRIES THE ESCAPE TOKEN (BUG-062). scenarioEnv sets it to
  // this scenario's token so every gate line pipeline.sh renders carries it and
  // a leak into the operator's real feed is DETECTED. A per-call override that
  // replaced it would turn a detectable leak into the untagged append that
  // BUG-062's row documents as the known, undetected hole — i.e. the fix would
  // have shipped with a one-line route to defeat itself.
  //
  // Dropping it is conditional rather than forbidden — see
  // assertTokenMayBeDropped for the two clauses and why both are needed.
  AGENT_FEED_TAG: 'scenario-token',
  // The two the scenario owns from OUTSIDE both namespaces. R3 requires every
  // scenario to own its HOME and its TMPDIR, and until these were declared here
  // nothing refused `{ env: { HOME: '/home/<operator>' } }`: the override merge
  // in index.ts happens before this check, and this check looked only at GIT_*
  // and AGENT_*. That made "own HOME, own temp dir" a convention again — the
  // exact distinction the harness exists to remove, and the shape of BUG-046
  // and BUG-047, which were each one forgotten line.
  HOME: 'scenario-path',
  TMPDIR: 'scenario-path',
  // Declared safe to inherit as well as to set: git's author/committer identity
  // carries no path, redirects nothing, and is what tests/bootstrap-* and
  // tests/template-source legitimately pass.
  GIT_AUTHOR_NAME: 'inert',
  GIT_AUTHOR_EMAIL: 'inert',
  GIT_COMMITTER_NAME: 'inert',
  GIT_COMMITTER_EMAIL: 'inert',
} as const satisfies Record<string, EnvKind>

type EnvKind =
  | 'path'
  | 'path-list'
  | 'opaque'
  | 'inert'
  | 'denied'
  | 'scenario-path'
  | 'scenario-token'

export type ForbiddenVar = keyof typeof ENV_KIND

/**
 * Everything the scrub removes: every declared GIT_* / AGENT_* variable that is
 * not 'inert'.
 *
 * THE NAMESPACE FILTER IS LOAD-BEARING, not decoration. This list is also what
 * assertProcessEnvClean requires the TEST process not to be carrying, and the
 * test process always carries HOME — so a scenario-path name in here would
 * refuse every scenario on every machine. Those two are REPLACED per scenario
 * rather than removed (there is no such thing as a child with no home
 * directory), which is a different mechanism, checked in a different place.
 *
 * It also keeps the invariant scripts/run-ts-suites.sh depends on: every name
 * here is GIT_* or AGENT_*, so its prefix-based scrub covers the whole list
 * without restating it, and tests/ts-bridge #1c can cross-check that from this
 * file rather than from a second copy.
 */
export const FORBIDDEN_ENV = (Object.keys(ENV_KIND) as ForbiddenVar[]).filter(
  (k) => ENV_KIND[k] !== 'inert' && /^(GIT|AGENT)_/.test(k),
) as readonly ForbiddenVar[]

/**
 * The kind that governs an override of `key`.
 *
 * Undeclared names in the GIT_* / AGENT_* namespaces are DENIED rather than
 * waved through — see the table above. Anything else (PATH, LC_ALL) is not this
 * harness's business and returns undefined; HOME and TMPDIR used to fall in
 * that gap and are now declared, because the scenario owns them.
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
 * May this call DROP the escape token — i.e. unset AGENT_FEED_TAG?
 *
 * THE RULE. A scenario may drop the token only when it has handed the child its
 * own feed (`AGENT_FEED_LOG` unset in the same call) AND the feed the child
 * will then derive is provably inside the workspace (its cwd is). Both clauses,
 * or the token stays.
 *
 * WHY THE FIRST CLAUSE. The token is not decoration on a contained run — it is
 * what makes a leak VISIBLE when containment fails inside the child, which the
 * harness cannot police. While `AGENT_FEED_LOG` still points at the scenario's
 * feed, a child that resets or ignores that pointer (scripts/lib/feed.sh:35 is
 * the only honest reader; agent-activity.sh:78 ignores it outright) reaches the
 * operator's feed, and the token on the line is the whole detection. So a call
 * that keeps the pointer and drops the token has removed the backstop while
 * claiming the belt still holds.
 *
 * WHY THE SECOND CLAUSE, WHICH THE OBVIOUS RULE MISSES. "Unset the tag whenever
 * the feed pointer is unset too" reads safe and is exactly inverted: unsetting
 * `AGENT_FEED_LOG` is what makes the destination AMBIENT — feed.sh:37 derives it
 * from `git rev-parse --show-toplevel`, falling back to `pwd`. Point the child
 * at the real repository and that resolves to the OPERATOR'S REAL FEED, which is
 * the one place the token exists to be seen. The pair alone would therefore
 * license the single most dangerous combination this file can express. Requiring
 * the cwd to be contained is what turns "derives its own feed" into "derives a
 * feed inside this workspace": the workspace root is an mkdtemp under the system
 * temp dir and so is inside no git tree, so from a contained cwd git either
 * finds a repository inside the workspace or finds none and pwd answers.
 *
 * This is a rule and not an exemption (TASK-018 R5): any scenario that hands a
 * child its own contained feed qualifies, and the one that does today —
 * tests/bootstrap-gate, which runs a derived project's entire gate and whose
 * tests/pipeline #16 greps for the literal `[GATE] PASSED` — qualifies by
 * meeting it, not by being named.
 */
function assertTokenMayBeDropped(
  key: string,
  overrides: Record<string, string | undefined>,
  workspaceRoot: string | undefined,
  cwd: string | undefined,
): void {
  const ownFeed =
    'AGENT_FEED_LOG' in overrides && overrides.AGENT_FEED_LOG === undefined
  const contained =
    cwd !== undefined &&
    workspaceRoot !== undefined &&
    resolvesInsideWorkspace(cwd, workspaceRoot)

  if (ownFeed && contained) return

  throw new Error(
    `Refusing to UNSET ${key}: it carries this scenario's escape token, and ` +
      `without it every gate line a leaking fixture emits becomes the ` +
      `untagged, UNDETECTED append BUG-062's row documents. Dropping it needs ` +
      `BOTH: unset AGENT_FEED_LOG in the same call, so the child derives its ` +
      `own feed rather than writing to one the token is the only guard on; ` +
      `and give it a cwd inside the workspace, so what it derives lands there ` +
      `— an unset AGENT_FEED_LOG makes the destination ambient (feed.sh falls ` +
      `back to \`git rev-parse --show-toplevel\`, then \`pwd\`), and from the ` +
      `real repository that IS the operator's feed. ` +
      (ownFeed
        ? `AGENT_FEED_LOG is unset here, but cwd ${cwd ?? '(missing)'} is not ` +
          `inside ${workspaceRoot ?? '(missing)'}.`
        : `AGENT_FEED_LOG is not being unset here.`) +
      ` If the fixture just needs its own label, COMPOSE it with the token ` +
      `instead — \`\${s.escapeToken}-my-tag\`.`,
  )
}

/**
 * Refuse an override the declared kind does not permit. Silent when it does.
 *
 * Split out of fixtureEnv so the refusal reads as one decision per variable
 * rather than as three nested branches inside a loop.
 */
function assertOverrideAllowed(
  key: string,
  value: string | undefined,
  overrides: Record<string, string | undefined>,
  workspaceRoot?: string,
  escapeToken?: string,
  cwd?: string,
): void {
  const kind = overrideKind(key)

  // UNSETTING IS AN OVERRIDE TOO, and for the two kinds the scenario owns it is
  // the more dangerous one: it looks like removal and behaves like a redirect.
  // With HOME unset git and friends fall back to getpwuid — the operator's real
  // home, the very thing the per-scenario HOME exists to hide; with TMPDIR
  // unset mktemp writes to /tmp, which is the $TMPDIR debris BUG-049 measured
  // at 133 MB; with AGENT_FEED_TAG unset pipeline.sh renders "[GATE]" and every
  // line a leaking fixture emits becomes the untagged, UNDETECTED append.
  //
  // Deleting any other declared variable stays legitimate and is how
  // tests/bootstrap-gate stops a derived gate inheriting this scenario's baton,
  // journal and feed pointers.
  if (value === undefined) {
    if (kind === 'scenario-path') {
      throw new Error(
        `Refusing to UNSET ${key}: the scenario owns it, and its absence is ` +
          `not neutral — an unset HOME resolves to the operator's real home ` +
          `via getpwuid, and an unset TMPDIR sends mktemp to /tmp. Set it to a ` +
          `value inside this scenario instead.`,
      )
    }
    if (kind === 'scenario-token') {
      assertTokenMayBeDropped(key, overrides, workspaceRoot, cwd)
    }
    return
  }

  if (kind === 'scenario-token') {
    if (escapeToken !== undefined && value.includes(escapeToken)) return
    throw new Error(
      `Refusing forbidden environment override ${key}=${value}: the harness ` +
        `sets it to this scenario's escape token so that every gate line ` +
        `pipeline.sh renders carries the token, which is what makes a leak ` +
        `into the operator's real activity feed DETECTABLE (BUG-062). ` +
        `Replacing it restores the untagged-append hole that BUG-062's row ` +
        `documents as the part the canary cannot see. If a fixture needs its ` +
        `own label, COMPOSE it with the token — \`\${s.escapeToken}-my-tag\` — ` +
        `so detection survives.` +
        (escapeToken === undefined
          ? ` (No escape token was supplied to fixtureEnv, so no override of ` +
            `${key} can be checked here; go through scenario().)`
          : ''),
    )
  }

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

  if (kind !== 'path' && kind !== 'path-list' && kind !== 'scenario-path') {
    return
  }

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
        `${workspaceRoot ?? '(missing)'}` +
        (kind === 'scenario-path'
          ? `. Every scenario owns its ${key} (R3) precisely so a fixture ` +
            `cannot read the operator's real dotfiles or scatter temp files ` +
            `outside its workspace. Use s.home, or s.workspace.path(...).`
          : ''),
    )
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
 *
 * `cwd` is where the child will RUN, and it is here because one rule cannot be
 * decided without it: with AGENT_FEED_LOG unset the feed a child writes to is
 * derived from its working directory (assertTokenMayBeDropped).
 */
export function fixtureEnv(
  overrides: Record<string, string | undefined> = {},
  workspaceRoot?: string,
  escapeToken?: string,
  cwd?: string,
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
    assertOverrideAllowed(
      key,
      value,
      overrides,
      workspaceRoot,
      escapeToken,
      cwd,
    )
    if (value === undefined) delete env[key]
    else env[key] = value
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
