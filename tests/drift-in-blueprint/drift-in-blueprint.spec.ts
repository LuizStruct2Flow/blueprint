/**
 * tests/drift-in-blueprint/drift-in-blueprint.spec.ts — BUG-007 regression.
 *
 * Parallelism class: serial-global.
 *   Every case now runs in a scenario-owned directory. Case #1 used to run the
 *   real CLI in the real checkout, described here as intentional — see
 *   BUG-056 at createBlueprintCheckout below for why that was a defect rather
 *   than a decision, and how it hid.
 *
 * MUTATION RECIPE (TASK-018-RULES R6). This suite's shell runner was deleted
 * once this spec was proven equivalent to it. R6 requires the way to reintroduce
 * the bug to be RECORDED, and R1 puts a test's description in the test — so it
 * lives here rather than in the tier table that used to hold it.
 *
 *   Mutant: Make `_bp_is_blueprint_itself` (`scripts/blueprint`) always report false, so
 * `drift` stops recognising the blueprint as itself and takes the derived-project
 * path.
 *   Turns red: `#1` goes red exactly where the shell runner did, on the BUG-007 assertion that
 * `drift` exits 0 in the blueprint.
 */

import { describe, it, expect } from 'vitest'
import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const CLI = join(REPO_ROOT, 'scripts/blueprint')

async function run(s: Scenario, command: string, cwd: string) {
  return s.run('bash', ['-c', command], { cwd })
}

async function git(s: Scenario, cwd: string, args: string[]) {
  return s.run('git', args, { cwd })
}

async function initRepo(s: Scenario, dir: string) {
  await git(s, dir, ['init', '-q', '-b', 'main', '.'])
  await git(s, dir, ['config', 'user.email', 't@local'])
  await git(s, dir, ['config', 'user.name', 't'])
}

async function commitAll(s: Scenario, dir: string, message = 'init') {
  await git(s, dir, ['add', '-A'])
  await git(s, dir, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message])
}

async function createFixtureBlueprint(s: Scenario, root: string) {
  await mkdir(join(root, 'docs'), { recursive: true })
  await mkdir(join(root, 'tests/fixture'), { recursive: true })
  await writeFile(join(root, 'CLAUDE.md'), '# CLAUDE\nshared\n', 'utf8')
  await writeFile(join(root, 'docs/DoD.md'), '# DoD\nshared\n', 'utf8')
  await writeFile(join(root, 'tests/fixture/test.sh'), 'echo fixture\n', 'utf8')
  await initRepo(s, root)
  await commitAll(s, root, 'base')
}

async function createDerivedProject(
  s: Scenario,
  root: string,
  blueprintRoot: string,
  options: { ownCli?: boolean } = {},
) {
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'CLAUDE.md'), '# CLAUDE\nshared\n', 'utf8')
  await writeFile(join(root, 'docs/DoD.md'), '# DoD\nDRIFTED HERE\n', 'utf8')

  if (options.ownCli) {
    await cp(join(REPO_ROOT, 'scripts'), join(root, 'scripts'), { recursive: true })
  }

  await initRepo(s, root)
  const bpSha = (await git(s, blueprintRoot, ['rev-parse', 'HEAD'])).stdout.trim()
  await writeFile(
    join(root, '.blueprint-source'),
    [
      `blueprint_source = ${blueprintRoot}`,
      `bootstrap_sha    = ${bpSha}`,
      'bootstrap_date   = 2026-01-01',
      '',
    ].join('\n'),
    'utf8',
  )
  await commitAll(s, root)
}

/**
 * A checkout that IS a blueprint: `.blueprint-root` present, `.blueprint-source`
 * absent. That pair is the entire input BUG-007 is about.
 *
 * BUG-056 — cases #1 and #1b used to run against REPO_ROOT, the developer's
 * actual checkout, and the header called that intentional. It was not safe:
 * `drift` arms the gate (CLAUDE.md §"Before Every Push"), `arm_gate` writes
 * `core.hooksPath` into `.git/config`, and so the case MUTATED THE REAL
 * REPOSITORY — which is BUG-047 exactly, the defect the real-state canary was
 * added to catch. It caught it.
 *
 * It also made the case environment-dependent, which is why nobody noticed:
 * on any machine where the gate is already armed `arm_gate` is a no-op and the
 * config never changes, so it passed for every developer and failed on the
 * first fresh clone — CI. Same shape as BUG-054's case and BUG-044's, twice
 * more in the same week.
 *
 * The fixture reproduces the INPUT rather than borrowing the directory. What
 * the old form additionally covered — "drift works in this actual checkout" —
 * is not a regression test; it is the wake protocol, which runs it every
 * session.
 */
async function createBlueprintCheckout(s: Scenario, root: string) {
  await mkdir(join(root, 'scripts/lib'), { recursive: true })
  await mkdir(join(root, '.githooks'), { recursive: true })
  await copyFile(CLI, join(root, 'scripts/blueprint'))
  await s.run('chmod', ['+x', join(root, 'scripts/blueprint')], { cwd: root })
  await copyFile(join(REPO_ROOT, 'scripts/lib/gate.sh'), join(root, 'scripts/lib/gate.sh'))
  await copyFile(
    join(REPO_ROOT, 'scripts/lib/placeholders.sh'),
    join(root, 'scripts/lib/placeholders.sh'),
  )
  await copyFile(join(REPO_ROOT, '.blueprint-root'), join(root, '.blueprint-root'))
  await writeFile(join(root, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
  await s.run('chmod', ['+x', join(root, '.githooks/pre-push')], { cwd: root })
  await writeFile(join(root, 'f.txt'), 'x\n', 'utf8')
  await initRepo(s, root)
  await commitAll(s, root, 'blueprint checkout')
}

describe('BUG-007 — drift completes in the blueprint and still refuses non-projects', () => {
  it("#1 'blueprint drift' completes inside the blueprint itself", async () => {
    await scenario('drift-in-blueprint-1', async (s) => {
      const b = await s.workspace.dir('bp')
      await createBlueprintCheckout(s, b)

      const r = await run(s, './scripts/blueprint drift 2>&1 </dev/null', b)

      expect(r.code, r.output).toBe(0)
      expect(r.output).not.toContain('not a struct2flow project')
    })
  })

  it('#1b it names the case rather than exiting quietly', async () => {
    await scenario('drift-in-blueprint-1b', async (s) => {
      const b = await s.workspace.dir('bp')
      await createBlueprintCheckout(s, b)

      const r = await run(s, './scripts/blueprint drift 2>&1 </dev/null', b)

      expect(r.code, r.output).toBe(0)
      expect(r.output).toMatch(/blueprint itself|is the blueprint|source of truth/i)
    })
  })

  it('#1c BUG-056: the case owns the repo it drifts — no real config is touched', async () => {
    await scenario('drift-in-blueprint-1c', async (s) => {
      const b = await s.workspace.dir('bp')
      await createBlueprintCheckout(s, b)
      await git(s, b, ['config', '--unset', 'core.hooksPath'])

      await run(s, './scripts/blueprint drift 2>&1 </dev/null', b)
      const armed = await git(s, b, ['config', '--get', 'core.hooksPath'])

      // drift arms the gate — that is the documented behaviour, and the point
      // is that the arming lands in the FIXTURE's config. The scenario-wide
      // canary asserts the real .git/config is untouched; if this case ever
      // reverts to REPO_ROOT, that canary fails rather than this expectation.
      expect(armed.stdout.trim()).toBe('.githooks')
    })
  })

  it('#2 the gate is still armed even on the blueprint-itself path (BUG-004 holds)', async () => {
    await scenario('drift-in-blueprint-2', async (s) => {
      const c = await s.workspace.dir('clone')
      await initRepo(s, c)
      await mkdir(join(c, '.githooks'), { recursive: true })
      await mkdir(join(c, 'scripts/lib'), { recursive: true })
      await writeFile(join(c, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
      await s.run('chmod', ['+x', join(c, '.githooks/pre-push')], { cwd: c })
      await copyFile(CLI, join(c, 'scripts/blueprint'))
      await s.run('chmod', ['+x', join(c, 'scripts/blueprint')], { cwd: c })
      await copyFile(join(REPO_ROOT, 'scripts/lib/gate.sh'), join(c, 'scripts/lib/gate.sh'))
      await copyFile(
        join(REPO_ROOT, 'scripts/lib/placeholders.sh'),
        join(c, 'scripts/lib/placeholders.sh'),
      )
      await writeFile(join(c, 'f.txt'), 'x\n', 'utf8')
      await commitAll(s, c)
      await git(s, c, ['config', '--unset', 'core.hooksPath'])

      const drift = await run(s, './scripts/blueprint drift 2>&1 </dev/null', c)
      const armed = await git(s, c, ['config', '--get', 'core.hooksPath'])

      expect(armed.stdout.trim(), drift.output).toBe('.githooks')
    })
  })

  it('#3 a genuine non-project still fails loudly, naming the missing file', async () => {
    await scenario('drift-in-blueprint-3', async (s) => {
      const n = await s.workspace.dir('notaproject')
      await initRepo(s, n)

      const r = await s.run(CLI, ['drift'], { cwd: n })

      expect(r.code).not.toBe(0)
      expect(r.output).toContain('no .blueprint-source')
    })
  })

  it('#4 a derived project still gets its normal file-by-file drift report', async () => {
    await scenario('drift-in-blueprint-4', async (s) => {
      const bp = await s.workspace.dir('bp')
      const p = await s.workspace.dir('derived')
      await createFixtureBlueprint(s, bp)
      await createDerivedProject(s, p, bp)

      const r = await s.run(CLI, ['drift'], { cwd: p })

      // Drift is a report, not an error: differences are expected and rc=0.
      expect(r.code, r.output).toBe(0)
      expect(r.output).toContain('docs/DoD.md')
      expect(r.output).not.toMatch(/is the blueprint/i)
    })
  })

  it('#4b a derived project running its own scripts/blueprint still gets a real drift report', async () => {
    await scenario('drift-in-blueprint-4b', async (s) => {
      const bp = await s.workspace.dir('bp')
      const p = await s.workspace.dir('derived-own-cli')
      await createFixtureBlueprint(s, bp)
      await createDerivedProject(s, p, bp, { ownCli: true })

      const r = await run(s, 'bash scripts/blueprint drift 2>&1 </dev/null', p)

      // The project's own copy has the same reporting contract: drift is rc=0.
      expect(r.code, r.output).toBe(0)
      expect(r.output).not.toMatch(/is the blueprint/i)
      expect(r.output).toContain('docs/DoD.md')
    })
  })

  it('#5 a project missing its config is not mistaken for the blueprint', async () => {
    await scenario('drift-in-blueprint-5', async (s) => {
      const bp = await s.workspace.dir('bp')
      const p = await s.workspace.dir('derived')
      await createFixtureBlueprint(s, bp)
      await createDerivedProject(s, p, bp)
      await rm(join(p, '.blueprint-source'), { force: true })

      const r = await s.run(CLI, ['drift'], { cwd: p })

      expect(r.code).not.toBe(0)
    })
  })

  it('#6 an unregistered-but-obvious struct2flow project is told so, with the lines to add', async () => {
    await scenario('drift-in-blueprint-6', async (s) => {
      const u = await s.workspace.dir('unregistered')
      await mkdir(join(u, '.githooks'), { recursive: true })
      await mkdir(join(u, 'scripts'), { recursive: true })
      await mkdir(join(u, 'docs'), { recursive: true })
      await initRepo(s, u)
      await writeFile(join(u, 'AGENT_SIGNAL.md'), 'sig\n', 'utf8')
      await writeFile(join(u, 'STACK_DEFAULTS.md'), 'stack\n', 'utf8')
      await writeFile(join(u, 'scripts/install-toolchain.sh'), '#!/usr/bin/env bash\n', 'utf8')
      await writeFile(join(u, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
      await copyFile(CLI, join(u, 'scripts/blueprint'))

      const r = await s.run(CLI, ['drift'], { cwd: u })

      expect(r.code).not.toBe(0)
      expect(r.output).not.toContain('not a struct2flow project')
      expect(r.output).toMatch(/never registered|not registered|adopt/i)
      expect(r.output).toContain('blueprint_source')
    })
  })
})
