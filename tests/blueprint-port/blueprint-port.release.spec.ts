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
import { cp, copyFile, mkdir, writeFile } from 'node:fs/promises'
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

// PWD is set explicitly to `cwd` for BOTH sides. Bash recomputes $PWD from
// getcwd() at startup regardless (so this is a no-op for `runOld`), but
// `runNew` spawns node DIRECTLY — there is no bash shim yet to set it — and
// the ported CLI's `logicalPwd()` (plan §2 rule 6) reads `process.env.PWD`,
// never `process.cwd()`. Without this, the child inherits whatever PWD the
// test runner's OWN shell happened to have, which is not `cwd` and, worse,
// can itself resolve to a real ancestor project (this repo's own worktree)
// through the state-dir walk. Once slice 5's shim exists this stops being
// test-only scaffolding, because the shim's `exec` under bash sets it for real.
async function runOld(s: Scenario, cwd: string, args: string[], env?: Record<string, string>): Promise<RunResult> {
  return s.run('bash', [join(cwd, 'scripts/blueprint'), ...args], { cwd, env: { PWD: cwd, ...env } })
}

async function runNew(s: Scenario, cwd: string, args: string[], env?: Record<string, string>): Promise<RunResult> {
  return s.run(process.execPath, [join(cwd, 'scripts/blueprint.mts'), ...args], { cwd, env: { PWD: cwd, ...env } })
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

/**
 * blueprint-port differential — drift (TASK-081 slice 2, plan §8 row 2).
 *
 * A representative slice of the ~90-row matrix in plan §5, not the whole
 * thing: clean, drifted, new-in-blueprint, a refused file (BUG-034/BUG-113),
 * unregistered, and not-a-project. Each proves a different code path (the
 * fetch, the managed-set diff, bp_prospective_for's marker-structure refusal,
 * read_blueprint_source's marker-count heuristic, and its plain refusal) — the
 * remaining rows (missing-in-blueprint, the settings-layer refusals, staleness
 * under BLUEPRINT_ROOT, the interactive fast-forward prompt, every fetch
 * failure mode) are unit-proven by bpConfigLoad/bpProspectiveFor/
 * reportStaleness's own logic reading the same shell libs, but have no
 * dedicated differential row here yet — left for the row that ports `pull`
 * (slice 3), which reads the identical bp_prospective_for/settings-layer
 * surface and needs the same fixtures anyway.
 *
 * The `fetched:    SHA  at TIMESTAMP` line's timestamp is real wall-clock time
 * (both CLIs call `date -u`), so a `date` shim pins it to one value — the one
 * normalisation these rows need beyond byte equality (plan §5's "only
 * normalisations" list, extended for the one new source of non-determinism
 * this slice introduces).
 */
describe('blueprint-port differential — drift', () => {
  async function seedBlueprintRepo(s: Scenario, dir: string): Promise<string> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
    await initRepo(s, dir)
    await commitAll(s, dir, 'base')
    const r = await git(s, dir, ['rev-parse', 'HEAD'])
    return r.stdout.trim()
  }

  async function seedRegisteredProject(
    s: Scenario,
    dir: string,
    blueprintDir: string,
    bootstrapSha: string,
  ): Promise<void> {
    // runOld/runNew invoke `<dir>/scripts/blueprint[.mts]`, and cmd_drift's
    // arm_gate / bpFetchBlueprint reach into `scripts/lib/*.sh` — the whole
    // `scripts/` tree, not just the two CLI files, exactly like a real
    // derived project that pulled it.
    await cp(join(REPO_ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true })
    await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
    await mkdir(join(dir, '.githooks'), { recursive: true })
    await writeFile(join(dir, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
    await s.run('chmod', ['+x', join(dir, '.githooks/pre-push')], { cwd: dir })
    await writeFile(
      join(dir, '.blueprint-source'),
      `config_version   = 2\nblueprint_remote = ${blueprintDir}\nblueprint_branch = main\nbootstrap_sha    = ${bootstrapSha}\nbootstrap_date   = 2026-01-01\n`,
      'utf8',
    )
    await initRepo(s, dir)
    await commitAll(s, dir, 'init')
  }

  // For the unregistered/not-a-project rows: ONLY the CLI files and its libs
  // — never the whole `scripts/` tree, which also carries
  // scripts/install-toolchain.sh and scripts/agent-activity.sh. Those are two
  // of read_blueprint_source's own UNREGISTERED_MARKERS, so copying them
  // unconditionally would push every such fixture over the "3 marker files"
  // threshold regardless of what the test actually means to seed.
  async function seedCliOnly(s: Scenario, dir: string): Promise<void> {
    await mkdir(join(dir, 'scripts/lib'), { recursive: true })
    await copyFile(SHELL_CLI, join(dir, 'scripts/blueprint'))
    await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
    await copyFile(PORTED_CLI, join(dir, 'scripts/blueprint.mts'))
    await cp(join(REPO_ROOT, 'scripts/lib'), join(dir, 'scripts/lib'), { recursive: true })
  }

  async function dateShimEnv(s: Scenario): Promise<Record<string, string>> {
    const shims = await s.shimDir('shims')
    await shims.add('date', 'echo 2026-01-01T00:00:00Z')
    return { PATH: shims.path() }
  }

  // ONE project directory for both CLIs — run OLD, capture its report, then
  // reset the gate/keepalive config it armed (so NEW sees the same "was
  // unset" starting state) and run NEW. This is the same directory rather
  // than one-per-side because `drift`'s own report prints `project: <cwd>`,
  // and two distinct fixture directories can never agree on that line.
  async function driftBoth(
    s: Scenario,
    proj: string,
    env: Record<string, string>,
  ): Promise<{ readonly oldResult: RunResult; readonly newResult: RunResult }> {
    const oldResult = await runOld(s, proj, ['drift'], env)
    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
    const newResult = await runNew(s, proj, ['drift'], env)
    return { oldResult, newResult }
  }

  it('clean — a registered project fully synced', async () => {
    await scenario('blueprint-port-drift-clean', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // Fully synced: copy the blueprint's managed files into the project and
      // commit, so nothing is drifted or missing.
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'sync')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('✓ All blueprint-managed files match the blueprint HEAD.')
      expect(oldResult.code).toBe(0)
    })
  })

  it('drifted — a project file differs from the blueprint HEAD', async () => {
    await scenario('blueprint-port-drift-drifted', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await mkdir(join(proj, 'docs'), { recursive: true })
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nan older, edited copy\n', 'utf8')
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'partial sync')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Drifted (project ≠ blueprint HEAD): 1')
      expect(oldResult.stdout).toContain('~ CLAUDE.md')
    })
  })

  it('new in blueprint — a managed file the project never pulled', async () => {
    await scenario('blueprint-port-drift-new', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('New in blueprint (not in this project): 2')
      expect(oldResult.stdout).toContain('+ CLAUDE.md')
      expect(oldResult.stdout).toContain('+ docs/DoD.md')
    })
  })

  it('refused — invalid marker structure in the project copy (BUG-034)', async () => {
    await scenario('blueprint-port-drift-refused', async (s) => {
      const bp = await s.workspace.dir('bp')
      // Give the blueprint's CLAUDE.md a well-formed marker region.
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content\n<!-- BLUEPRINT:END -->\nkeep\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // An END with no open region: bp_marker_structure reports "bad …".
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n<!-- BLUEPRINT:END -->\nbroken\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'broken markers')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 1')
      expect(oldResult.stdout).toContain("this project's markers are invalid")
    })
  })

  it('unregistered — three or more struct2flow marker files but no .blueprint-source', async () => {
    await scenario('blueprint-port-drift-unregistered', async (s) => {
      const proj = await s.workspace.dir('proj')
      await seedCliOnly(s, proj)
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
      await writeFile(join(proj, 'AGENTS.md'), '# AGENTS\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await writeFile(join(proj, 'docs/DoD.md'), '# DoD\n', 'utf8')
      const env = await dateShimEnv(s)
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stderr).toContain('NEVER REGISTERED with blueprint sync')
      expect(oldResult.code).toBe(1)
    })
  })

  it('not a project — no .blueprint-source and fewer than three marker files', async () => {
    await scenario('blueprint-port-drift-not-a-project', async (s) => {
      const proj = await s.workspace.dir('proj')
      await seedCliOnly(s, proj)
      const { oldResult, newResult } = await driftBoth(s, proj, {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.stderr).toContain('not a struct2flow project')
      expect(oldResult.code).toBe(1)
    })
  })
})
