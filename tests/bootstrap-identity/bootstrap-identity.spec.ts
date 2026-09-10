/**
 * tests/bootstrap-identity/bootstrap-identity.spec.ts — A-14 + BUG-044 + BUG-046.
 *
 * `scripts/new-project.sh` must INHERIT the operator's git author identity,
 * never write one of its own — and must not write anything else that belongs to
 * the operator either.
 *
 * The blueprint used to run `git config --local user.email "<founder>"` in every
 * bootstrapped repo, so any other operator silently committed under the
 * founder's name. Removing that introduced a second defect, caught in Codex
 * review round 2: the identity check ran AFTER the target directory was created
 * and populated, so a missing identity left a half-bootstrapped directory and
 * the "fix it and re-run" advice was a lie — the re-run dies on the "Target
 * already exists" guard. Both behaviours are pinned here.
 *
 * Parallelism class: parallel-safe.
 *   Every bootstrap runs inside a scenario workspace. Case 6 is the reason this
 *   matters: it deliberately points AGENT_SIGNAL_FILE at a decoy to prove
 *   bootstrap cannot trample the caller's live mic, and the harness applies
 *   overrides AFTER its scrub precisely so a scenario can exercise a forbidden
 *   variable explicitly and visibly rather than inheriting one by accident.
 *
 * MUTATION RECIPE (TASK-018-RULES R6). This suite's shell runner was deleted
 * once this spec was proven equivalent to it. R6 requires the way to reintroduce
 * the bug to be RECORDED, and R1 puts a test's description in the test — so it
 * lives here rather than in the tier table that used to hold it.
 *
 *   Mutant: Replace the `unset AGENT_SIGNAL_FILE AGENT_STATE_HOME` in
 * `scripts/new-project.sh`'s seed subshell with a no-op, so the seeded baton is
 * published over whatever the caller had.
 *   Turns red: `#6` goes red reporting that bootstrap REPUBLISHED the caller's live baton,
 * which is BUG-046 itself.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const SCRIPT_REL = 'scripts/new-project.sh'
const SCRIPT = join(REPO_ROOT, SCRIPT_REL)

const NAME = 'Test Operator'
const EMAIL = 'operator@example.test'

/**
 * The identity env a bootstrap needs.
 *
 * GIT_CONFIG_GLOBAL/SYSTEM=/dev/null hides any real identity (git >= 2.32), so
 * these cases do not depend on how the host happens to be configured. That is
 * not belt-and-braces: the scenario already gives the child its own HOME, but
 * BUG-044 showed `git var` inventing an identity from gecos and hostname when
 * none is configured, so "no identity" has to be made unambiguous.
 */
const HIDE_REAL_IDENTITY = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
} as const

const WITH_IDENTITY = {
  ...HIDE_REAL_IDENTITY,
  GIT_AUTHOR_NAME: NAME,
  GIT_AUTHOR_EMAIL: EMAIL,
  GIT_COMMITTER_NAME: NAME,
  GIT_COMMITTER_EMAIL: EMAIL,
} as const

async function bootstrap(
  s: Scenario,
  name: string,
  target: string,
  env: Record<string, string>,
) {
  return s.runScript(SCRIPT_REL, [name, target], {
    cwd: s.workspace.root,
    env,
    timeoutMs: 120_000,
  })
}

async function git(s: Scenario, cwd: string, args: string[]) {
  return s.run('git', args, { cwd })
}

describe('A-14 — bootstrap inherits the git identity and fails safely without one', () => {
  it('#1 the script never writes a git author identity', async () => {
    await scenario('bootstrap-identity-1', async () => {
      const src = await readFile(SCRIPT, 'utf8')

      // Asserted at the source, and legitimately so: the defect is the PRESENCE
      // of a hardcoded identity, and no consequence test can distinguish
      // "inherited the operator's" from "wrote the same one" when the operator
      // happens to be that person.
      expect(
        /git config .*user\.(email|name)[\s]+"/.test(src),
        'new-project.sh writes a hardcoded git identity (A-14 regression)',
      ).toBe(false)
    })
  })

  it('#2 BUG-044: missing identity fails before any filesystem change', async () => {
    await scenario('bootstrap-identity-2', async (s) => {
      const target = s.workspace.path('no-identity')

      const r = await bootstrap(s, 'test-noident', target, { ...HIDE_REAL_IDENTITY })

      expect(r.output).toContain('No git author identity configured')

      // The target must not exist. A half-bootstrapped directory makes the
      // documented "fix it and re-run" recovery impossible, because the re-run
      // dies on the "Target already exists" guard.
      const exists = await s.run('test', ['-e', target], { cwd: s.workspace.root })
      expect(
        exists.code,
        'the target was created despite a missing identity — the re-run advice is then a lie',
      ).not.toBe(0)
    })
  })

  it("#2b BUG-044: the identity probe disables git's auto-detection", async () => {
    await scenario('bootstrap-identity-2b', async () => {
      const src = await readFile(SCRIPT, 'utf8')

      // Case #2 asserts the consequence and is the right shape, but it can pass
      // VACUOUSLY on a host where git happens to fail on its own. That is what
      // hid BUG-044: `git var GIT_AUTHOR_IDENT` does not fail when identity is
      // absent, it GUESSES, from the passwd gecos name and the hostname. On
      // macOS that always succeeds, so the guard passed, bootstrap proceeded,
      // and the initial commit carried a machine-invented author — the A-14
      // outcome reached THROUGH the guard meant to prevent it.
      //
      // Whether the guess succeeds is a property of the HOST, so no consequence
      // test pins this everywhere. What holds everywhere is that the probe
      // disables auto-detection, and that is asserted at the source — the same
      // licence case 1 takes.
      expect(
        src,
        'the probe does not set user.useConfigOnly=true, so `git var` will GUESS an identity from gecos + hostname instead of failing — on any host where that guess succeeds, bootstrap commits as a machine-invented author and case #2 passes vacuously',
      ).toContain('user.useConfigOnly=true')
    })
  })

  it('#3 an inherited identity is the initial commit author', async () => {
    await scenario('bootstrap-identity-3', async (s) => {
      const target = s.workspace.path('with-identity')

      const r = await bootstrap(s, 'test-ident', target, { ...WITH_IDENTITY })
      expect(r.code, r.output).toBe(0)

      const isRepo = await s.run('test', ['-d', join(target, '.git')], { cwd: target })
      expect(isRepo.code, 'bootstrap did not create a git repo').toBe(0)

      const author = await git(s, target, ['log', '-1', '--format=%an <%ae>'])
      expect(author.stdout.trim()).toBe(`${NAME} <${EMAIL}>`)
    })
  })

  it('#4 nothing is written to the new repo\'s LOCAL config', async () => {
    await scenario('bootstrap-identity-4', async (s) => {
      const target = s.workspace.path('with-identity')

      const r = await bootstrap(s, 'test-ident', target, { ...WITH_IDENTITY })
      expect(r.code, r.output).toBe(0)

      const local = await git(s, target, ['config', '--local', '--get-regexp', '^user\\.'])
      expect(
        local.code,
        `bootstrap wrote a repo-local user.* setting; identity must be inherited: ${local.stdout}`,
      ).not.toBe(0)
    })
  })

  it('#5 bootstrap echoes the identity it commits as', async () => {
    await scenario('bootstrap-identity-5', async (s) => {
      const target = s.workspace.path('with-identity')

      const r = await bootstrap(s, 'test-ident', target, { ...WITH_IDENTITY })
      expect(r.code, r.output).toBe(0)

      // So a WRONG identity is visible rather than silent.
      expect(r.output).toContain(`Committing as: ${NAME} <${EMAIL}>`)
    })
  })

  it("#6 BUG-046: the baton is seeded into the NEW project, and the caller's is untouched", async () => {
    await scenario('bootstrap-identity-6', async (s) => {
      // Same shape as everything above: bootstrap must not write things that
      // belong to the operator. A-14 was a git identity; this is the operator's
      // LIVE MIC.
      //
      // THE MECHANISM. new-project.sh seeds a baton so a fresh project can run
      // the ceremony without a manual first step (BUG-019). It called
      // signal-set.sh without naming a file, and signal-set.sh honours
      // $AGENT_SIGNAL_FILE and $AGENT_STATE_HOME. Those are not exotic:
      // codex-signal-watch.sh EXPORTS AGENT_SIGNAL_FILE into every dispatched
      // wake, so bootstrapping from a dispatched agent published
      // "Holder=Nobody / State=IDLE" over a live hand-off, appended to that
      // project's journal, and reported success. That is BUG-030,
      // mis-attributed for weeks to path derivation inside one suite.
      const decoyDir = await s.workspace.dir('decoy-state')
      const decoyFile = join(decoyDir, 'signal.md')

      // The decoy must be a WELL-FORMED baton. signal-set.sh refuses to publish
      // over a file whose table rows it cannot find, so a decoy of arbitrary
      // text would survive for a reason that has nothing to do with the fix — a
      // vacuous pass, and one the shell original hit while being written.
      const decoyBefore = [
        '<!-- A DECOY live baton, standing in for the caller\'s real mic. -->',
        '',
        '| Field | Value |',
        '|---|---|',
        '| Holder | DecoyHolder |',
        '| State | OVER_TO_CODEX |',
        '| Task | a real hand-off that bootstrap must not overwrite |',
        '| Last update | 2026-01-01 |',
        '',
      ].join('\n')
      await s.fs.write(decoyFile, decoyBefore)

      const target = s.workspace.path('with-baton-env')
      const r = await bootstrap(s, 'test-baton', target, {
        ...WITH_IDENTITY,
        // DELIBERATE and visible, which is the whole point of the harness
        // applying overrides after its scrub: this scenario exists to prove a
        // hostile AGENT_SIGNAL_FILE cannot reach the caller's mic.
        AGENT_SIGNAL_FILE: decoyFile,
        AGENT_STATE_HOME: decoyDir,
      })
      expect(r.code, r.output).toBe(0)

      // Both halves are asserted, and each is vacuous without the other: "the
      // decoy survived" would also pass if the seed were simply deleted, and
      // "the project got a baton" was already true while the real mic was being
      // trampled.
      const decoyAfter = await readFile(decoyFile, 'utf8')
      expect(
        decoyAfter,
        'bootstrap REPUBLISHED the caller\'s live baton — a dispatched agent exports AGENT_SIGNAL_FILE, so this resets a real hand-off to IDLE while reporting success',
      ).toBe(decoyBefore)

      expect(
        await s.fs.exists(join(decoyDir, 'signal-history.log')),
        "bootstrap appended to the caller's baton JOURNAL",
      ).toBe(false)

      const seeded = await readFile(join(target, 'logs/state/signal.md'), 'utf8')
      expect(
        seeded,
        'the new project\'s baton is not the seeded IDLE one — the seed was scrubbed away rather than redirected, so a fresh project cannot run the ceremony (BUG-019). Half a fix is not a fix',
      ).toContain('| Holder | Nobody |')
    })
  })
})
