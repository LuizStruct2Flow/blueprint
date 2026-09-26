/**
 * tests/blueprint-port/blueprint-port.release.spec.ts — TASK-081, the
 * differential harness (plan §5). Compares OLD (`bash scripts/blueprint`)
 * against NEW (`node scripts/blueprint.mts`) subcommand family by
 * subcommand family, as each slice lands. Deleted once the founder accepts
 * TASK-081 (plan §5) — its results live in the port commit body instead.
 *
 * SLICE 1 covers exactly what the skeleton runs: dispatch (no args, `help`,
 * `--help`, `-h`, an unknown subcommand, `push`) and `files` for the two
 * paths that need no network (standing in "the blueprint" itself, and the
 * BLUEPRINT_ROOT override of that same root). `files` in a REGISTERED
 * derived project needs the fetch machinery (P1), which is slice 2's — the
 * skeleton's cmd_files refuses that path loudly rather than faking it, so
 * there is no row for it here yet.
 *
 * Release tier: it shells out to real `git`/`bash`/`node` against fixture
 * repositories, which is slower than the suite's usual unit tests — the same
 * reason tests/a2bp-e2e and tests/bootstrap-gate are release-tier.
 */
import { describe, expect, it } from 'vitest'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import type { RunResult } from '../harness/process.js'

const SHELL_CLI = join(REPO_ROOT, 'scripts/blueprint')
const PORTED_CLI = join(REPO_ROOT, 'scripts/blueprint.mts')

async function git(s: Scenario, cwd: string, args: string[]): Promise<RunResult> {
  return s.run('git', args, { cwd })
}

async function initRepo(s: Scenario, dir: string): Promise<void> {
  await git(s, dir, ['init', '-q', '-b', 'main', '.'])
  await git(s, dir, ['config', 'user.email', 't@local'])
  await git(s, dir, ['config', 'user.name', 't'])
}

async function commitAll(s: Scenario, dir: string, message = 'init'): Promise<void> {
  await git(s, dir, ['add', '-A'])
  await git(s, dir, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message])
}

/** Copy both CLI forms into `root/scripts/`, committed, so `git archive HEAD`
 * in that fixture sees them — bp_managed_files reads the TREE, never the
 * working directory. */
async function seedFixtureRoot(s: Scenario, root: string): Promise<void> {
  await mkdir(join(root, 'scripts'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await copyFile(SHELL_CLI, join(root, 'scripts/blueprint'))
  await s.run('chmod', ['+x', join(root, 'scripts/blueprint')], { cwd: root })
  await copyFile(PORTED_CLI, join(root, 'scripts/blueprint.mts'))
  await writeFile(join(root, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
  await writeFile(join(root, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
  // README.md is a TEMPLATE_FILES entry: committed here so a passing test
  // actually exercises the filter, rather than the filter never being asked
  // to remove anything.
  await writeFile(join(root, 'README.md'), '# fixture project\n', 'utf8')
  await initRepo(s, root)
  await commitAll(s, root, 'base')
}

async function runOld(s: Scenario, cwd: string, args: string[], env?: Record<string, string>): Promise<RunResult> {
  return s.run('bash', [join(cwd, 'scripts/blueprint'), ...args], { cwd, ...(env ? { env } : {}) })
}

async function runNew(s: Scenario, cwd: string, args: string[], env?: Record<string, string>): Promise<RunResult> {
  return s.run(process.execPath, [join(cwd, 'scripts/blueprint.mts'), ...args], { cwd, ...(env ? { env } : {}) })
}

function expectIdentical(oldResult: RunResult, newResult: RunResult): void {
  expect(newResult.stdout).toBe(oldResult.stdout)
  expect(newResult.stderr).toBe(oldResult.stderr)
  expect(newResult.code).toBe(oldResult.code)
  expect(newResult.signal).toBe(oldResult.signal)
}

describe('blueprint-port differential — dispatch', () => {
  const rows: Array<{ readonly name: string; readonly args: string[] }> = [
    { name: 'no args', args: [] },
    { name: 'help', args: ['help'] },
    { name: '--help', args: ['--help'] },
    { name: '-h', args: ['-h'] },
    { name: 'an unknown subcommand', args: ['not-a-real-subcommand'] },
    { name: 'push', args: ['push'] },
  ]

  for (const row of rows) {
    it(row.name, async () => {
      await scenario(`blueprint-port-dispatch-${row.name}`, async (s) => {
        const dir = await s.workspace.dir('cwd')
        const [oldResult, newResult] = await Promise.all([
          s.run('bash', [SHELL_CLI, ...row.args], { cwd: dir }),
          s.run(process.execPath, [PORTED_CLI, ...row.args], { cwd: dir }),
        ])
        expectIdentical(oldResult, newResult)
      })
    })
  }
})

describe('blueprint-port differential — files', () => {
  it('in the blueprint (no .blueprint-source: the CLI’s own root is BLUEPRINT_ROOT)', async () => {
    await scenario('blueprint-port-files-in-blueprint', async (s) => {
      const root = await s.workspace.dir('bp')
      await seedFixtureRoot(s, root)
      const [oldResult, newResult] = await Promise.all([runOld(s, root, ['files']), runNew(s, root, ['files'])])
      expectIdentical(oldResult, newResult)
      // Sanity: the filter actually did something observable, not merely
      // "both sides agree on nothing".
      expect(oldResult.stdout).toContain('scripts/blueprint')
      // README.md IS a TEMPLATE_FILES entry, so it legitimately appears under
      // "Template files" below — the filter's job is to keep it OUT of the
      // MANAGED section above that, even though it is tracked in this fixture.
      const managedSection = oldResult.stdout.split('Template files')[0]
      expect(managedSection).not.toMatch(/^ {2}README\.md$/m)
    })
  })

  it('under the BLUEPRINT_ROOT override (a project with no .blueprint-source, pointed elsewhere)', async () => {
    await scenario('blueprint-port-files-override', async (s) => {
      const projectRoot = await s.workspace.dir('project')
      const blueprintRoot = await s.workspace.dir('elsewhere-blueprint')
      await seedFixtureRoot(s, projectRoot)
      // A distinct blueprint checkout with its own file set, so the override
      // is provably being read rather than the project's own root.
      await mkdir(join(blueprintRoot, 'docs'), { recursive: true })
      await writeFile(join(blueprintRoot, 'ONLY-IN-OVERRIDE.md'), 'x\n', 'utf8')
      await initRepo(s, blueprintRoot)
      await commitAll(s, blueprintRoot, 'override base')

      const env = { BLUEPRINT_ROOT: blueprintRoot }
      const [oldResult, newResult] = await Promise.all([
        runOld(s, projectRoot, ['files'], env),
        runNew(s, projectRoot, ['files'], env),
      ])
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('ONLY-IN-OVERRIDE.md')
      expect(oldResult.stdout).not.toContain('CLAUDE.md')
    })
  })
})
