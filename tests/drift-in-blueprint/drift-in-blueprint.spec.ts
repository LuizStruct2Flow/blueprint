/**
 * tests/drift-in-blueprint/drift-in-blueprint.spec.ts — BUG-007 regression.
 *
 * Parallelism class: serial-global.
 *   Case #1 intentionally runs the real blueprint CLI in the real blueprint
 *   checkout because that is the wake-time failure this suite exists to guard.
 *   Fixture cases use scenario-owned directories but still exercise git repos.
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

describe('BUG-007 — drift completes in the blueprint and still refuses non-projects', () => {
  it("#1 'blueprint drift' completes inside the blueprint itself", async () => {
    await scenario('drift-in-blueprint-1', async (s) => {
      const r = await s.run(CLI, ['drift'], { cwd: REPO_ROOT, timeoutMs: 120_000 })

      expect(r.code, r.output).toBe(0)
      expect(r.output).not.toContain('not a struct2flow project')
    })
  })

  it('#1b it names the case rather than exiting quietly', async () => {
    await scenario('drift-in-blueprint-1b', async (s) => {
      const r = await s.run(CLI, ['drift'], { cwd: REPO_ROOT, timeoutMs: 120_000 })

      expect(r.code, r.output).toBe(0)
      expect(r.output).toMatch(/blueprint itself|is the blueprint|source of truth/i)
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
