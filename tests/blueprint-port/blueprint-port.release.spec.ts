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
import { cp, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import type { RunResult } from '../harness/process.js'
import { withCttyNoStdin } from '../helpers/tty.js'

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

// `pull`'s preview runs `diff -u FILE TMP`, and both header lines carry
// non-deterministic bytes the differential must normalise away rather than
// compare (plan §5's "only normalisations" list): the `---` line's mtime
// timestamp (real wall-clock time, a few hundred ms apart between the OLD
// and NEW invocations even against the SAME file) and the `+++` line's
// mktemp path (a fresh random suffix, and a fresh workspace directory when
// the row builds two independent project copies).
function normalizeDiffHeaders(output: string): string {
  return output.replace(/^(--- [^\t\n]*)\t[^\n]*$/gm, '$1').replace(/^\+\+\+ [^\n]*$/gm, '+++ <tmp>')
}

/** Like expectIdentical, but for a pull row whose preview includes a `diff
 * -u` block — stdout is compared after normalizeDiffHeaders. */
function expectPullIdentical(oldResult: RunResult, newResult: RunResult): void {
  expect(normalizeDiffHeaders(newResult.stdout)).toBe(normalizeDiffHeaders(oldResult.stdout))
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
// --- fixture builders shared by the drift AND pull differential describes --
//
// Hoisted to module scope (originally local to the drift describe) so
// slice 3's pull rows can reuse them rather than reimplementing the same
// blueprint/project fixtures.

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

// --- fault-injection PATH shims, shared by the finding-2/finding-1 rows below.
//
// Each shim is BUILT ONCE PER SIDE (a fresh shimDir per OLD/NEW run) so the
// two runs never share a mutable directory — the same reason the pull
// describe above builds two independent project copies rather than reusing
// one, for any row that actually writes.

async function realBinPath(s: Scenario, name: string): Promise<string> {
  const r = await s.run('sh', ['-c', `command -v ${name}`], { cwd: s.workspace.root })
  expect(r.stdout.trim(), `no ${name} on PATH — cannot build a passthrough shim`).not.toBe('')
  return r.stdout.trim()
}

/** A PATH shim for `bin` that fails only when some WHOLE argv element
 * exactly equals one of `verbs` — never a substring match, so a path or
 * file name that merely CONTAINS a verb (e.g. a file called "show.md") does
 * not trip it — and otherwise execs the real binary untouched. Same idiom as
 * tests/gate-arming #9's `core.hooksPath` shim. */
async function verbFailShim(s: Scenario, tag: string, bin: string, verbs: string[]): Promise<string> {
  const real = await realBinPath(s, bin)
  const shims = await s.shimDir(tag)
  const cases = verbs.map((v) => `    ${JSON.stringify(v)}) exit 1 ;;`).join('\n')
  await shims.add(bin, `for a in "$@"; do\n  case "$a" in\n${cases}\n  esac\ndone\nexec ${JSON.stringify(real)} "$@"\n`)
  return shims.path()
}

/** A PATH shim for `bin` that fails only when some argv element CONTAINS the
 * fixed string `needle` — for a jq PROGRAM argument that is one whole
 * multi-line string, where the text that tells one jq call apart from
 * another is buried inside it rather than being the whole argument. `needle`
 * must carry no shell glob metacharacter (`*?[`); every needle used below is
 * a plain jq keyword. */
async function substringFailShim(s: Scenario, tag: string, bin: string, needle: string): Promise<string> {
  expect(needle, 'needle must be glob-metacharacter-free — this helper does no escaping').not.toMatch(/[*?[]/)
  const real = await realBinPath(s, bin)
  const shims = await s.shimDir(tag)
  // The needle is QUOTED inside the pattern (`*"needle"*`) — an unquoted
  // space in a case pattern is a bash SYNTAX ERROR (confirmed directly: a
  // bare `*def uniq*)` pattern fails the whole script to parse), which would
  // break the shim for EVERY invocation rather than the one it targets.
  await shims.add(bin, `for a in "$@"; do\n  case "$a" in\n    *${JSON.stringify(needle)}*) exit 1 ;;\n  esac\ndone\nexec ${JSON.stringify(real)} "$@"\n`)
  return shims.path()
}

describe('blueprint-port differential — drift', () => {
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

/**
 * blueprint-port differential — pull (TASK-081 slice 3, plan §8 row 3).
 *
 * A representative slice of plan §5's pull rows, not the whole ~30-row
 * family: nothing to pull; a full `--yes` pull that advances bootstrap_sha;
 * a partial named-file pull that does not; the BUG-018/BUG-054 non-TTY
 * refusal (exit 7); a guard refusal (BUG-034, exit 4); and `pull
 * scripts/blueprint` against the REAL shell CLI's own lib list (plan §7).
 *
 * PULL WRITES FILES, unlike drift. A row that actually lands something
 * builds TWO INDEPENDENT project copies (one per CLI) rather than reusing
 * driftBoth's one-directory-then-reset pattern, which only works because
 * drift never mutates. A row that provably writes nothing (nothing-to-pull,
 * the two refusal rows, and the fully-in-sync `scripts/blueprint` row) runs
 * OLD then NEW on the SAME directory, like driftBoth.
 */
describe('blueprint-port differential — pull', () => {
  /** A blueprint with TWO commits, so "the project is one commit behind" and
   * "the project is fully synced" are distinguishable — with one commit the
   * two coincide and a bootstrap_sha assertion would be vacuous (the same
   * mistake pull-behaviour's own fixtureBlueprint calls out). */
  async function seedBlueprintRepoTwoCommits(s: Scenario, dir: string): Promise<{ first: string; head: string }> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
    await initRepo(s, dir)
    await commitAll(s, dir, 'base')
    const first = (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\nsecond commit\n', 'utf8')
    await commitAll(s, dir, 'second')
    const head = (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
    return { first, head }
  }

  /** A project registered against the blueprint's FIRST commit, drifted on
   * CLAUDE.md only (docs/DoD.md stays in sync) — the shape both the
   * full-pull and partial-pull rows need. */
  async function driftedProject(s: Scenario, tag: string, bp: string, firstSha: string): Promise<string> {
    const proj = await s.workspace.dir(tag)
    await seedRegisteredProject(s, proj, bp, firstSha)
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(proj, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await commitAll(s, proj, 'partial sync')
    return proj
  }

  it('nothing to pull — a fully synced project', async () => {
    await scenario('blueprint-port-pull-nothing', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'sync')
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, proj, ['pull'], env)
      const newResult = await runNew(s, proj, ['pull'], env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('✓ Nothing to pull. Project matches blueprint HEAD.')
    })
  })

  it('full --yes — the one drifted managed file is pulled, bootstrap_sha advances', async () => {
    await scenario('blueprint-port-pull-full-yes', async (s) => {
      const bp = await s.workspace.dir('bp')
      const { first, head } = await seedBlueprintRepoTwoCommits(s, bp)
      const oldProj = await driftedProject(s, 'old', bp, first)
      const newProj = await driftedProject(s, 'new', bp, first)
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('✓ Pulled 1 file(s). Review')
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      expect(oldClaude).toBe('# CLAUDE\nfixture\nsecond commit\n')
      const oldSrc = await readFile(join(oldProj, '.blueprint-source'), 'utf8')
      const newSrc = await readFile(join(newProj, '.blueprint-source'), 'utf8')
      expect(newSrc).toBe(oldSrc)
      expect(oldSrc).toContain(`bootstrap_sha    = ${head}`)
    })
  })

  it('partial — one named file pulls, bootstrap_sha stays at the OLD sha (BUG-016)', async () => {
    await scenario('blueprint-port-pull-partial', async (s) => {
      const bp = await s.workspace.dir('bp')
      const { first } = await seedBlueprintRepoTwoCommits(s, bp)
      const oldProj = await driftedProject(s, 'old', bp, first)
      const newProj = await driftedProject(s, 'new', bp, first)
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'CLAUDE.md', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'CLAUDE.md', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('bootstrap_sha left unchanged — this was a partial pull')
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      expect(oldClaude).toBe('# CLAUDE\nfixture\nsecond commit\n')
      const oldSrc = await readFile(join(oldProj, '.blueprint-source'), 'utf8')
      expect(oldSrc).toContain(`bootstrap_sha    = ${first}`)
    })
  })

  it('non-TTY without --yes: a controlling terminal, non-interactive stdin — exit 7 (BUG-018/BUG-054)', async () => {
    await scenario('blueprint-port-pull-non-tty', async (s) => {
      const bp = await s.workspace.dir('bp')
      const { first } = await seedBlueprintRepoTwoCommits(s, bp)
      const proj = await s.workspace.dir('proj')
      await driftedProjectInto(s, proj, bp, first)
      const oldResult = await withCttyNoStdin(s, proj, `bash '${SHELL_CLI}' pull </dev/null 2>&1`, { PWD: proj })
      const newResult = await withCttyNoStdin(
        s,
        proj,
        `'${process.execPath}' '${PORTED_CLI}' pull </dev/null 2>&1`,
        { PWD: proj },
      )
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.code).not.toBe(0)
      expect(oldResult.output).toMatch(/not interactive|no terminal|--yes/i)
      // Nothing written: both runs share ONE directory, so a write in the
      // first run would make the second run see an already-synced project.
      const claudeAfter = await readFile(join(proj, 'CLAUDE.md'), 'utf8')
      expect(claudeAfter).toBe('# CLAUDE\nfixture\n')
    })
  })

  /** driftedProject, but writing into an ALREADY-CREATED directory — the
   * non-TTY row runs OLD then NEW on one shared project (nothing is ever
   * written), so it needs the fixture built once, not the two-copy shape. */
  async function driftedProjectInto(s: Scenario, proj: string, bp: string, firstSha: string): Promise<void> {
    await seedRegisteredProject(s, proj, bp, firstSha)
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(proj, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await commitAll(s, proj, 'partial sync')
  }

  it('refused — invalid marker structure in the project copy: exit 4 (BUG-034)', async () => {
    await scenario('blueprint-port-pull-refused', async (s) => {
      const bp = await s.workspace.dir('bp')
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
      // An END with no open region: bp_marker_structure reports "bad …", so
      // pull_file refuses it outright — no prompt is ever reached for this
      // file, so OLD then NEW on the SAME directory is safe (nothing else in
      // this fixture drifts, so nothing else is written either).
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n<!-- BLUEPRINT:END -->\nbroken\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'broken markers')
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, proj, ['pull'], env)
      const newResult = await runNew(s, proj, ['pull'], env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain("this project's markers are invalid")
      expect(oldResult.stdout).toContain('Nothing pulled.')
    })
  })

  /**
   * `pull scripts/blueprint` against the REAL shell CLI and its real
   * scripts/lib/*.sh — plan §7's "for a shell scripts/blueprint the output
   * is today's" proof, using the actual file (not a stripped fixture copy)
   * so `_bp_cli_libs`'s grep and `bpCliLibs`'s regex are compared on the
   * bytes that matter.
   *
   * ONE DELIBERATE, DOCUMENTED DIVERGENCE (not yet in plan §6's accepted-
   * deviations list — worth adding there): `cmd_pull`'s `namesCli` treats
   * naming EITHER `scripts/blueprint` OR `scripts/blueprint.mts` as naming
   * BOTH (plan §7, "naming either alone brings both, never one without the
   * other"), and `scripts/blueprint.mts` is itself a real tracked file in
   * THIS repo already (mid-port), so it is part of the blueprint's managed
   * set today, not only after slice 5. The shell CLI has no notion of it at
   * all, so OLD's output can never mention it. `scripts/blueprint.mts` never
   * spells the project-name placeholder token (pinned by a slice 1 test), so
   * substituting it is the identity regardless of the project's name — it
   * reports "same" on both fixture copies, one extra line, asserted
   * explicitly rather than papered over with `expectIdentical`.
   *
   * TWO INDEPENDENT PROJECT COPIES, not one shared directory: several of the
   * REAL scripts/lib/*.sh files DO carry the placeholder token (e.g.
   * request-inputs.sh, state-dir.sh's incident-record quote), and this
   * fixture's project tree is a raw filesystem `cp`, never a real pull — so
   * those libs compare as DRIFTED (the blueprint's copy, substituted with
   * this project's name, differs from the project's still-literal-token raw
   * copy) and DO get pulled. That is correct, substitution-driven behaviour,
   * not a fixture bug — but it means this row mutates, like the full/partial
   * rows above.
   */
  it('pull scripts/blueprint — the real shell CLI and its real libs', async () => {
    await scenario('blueprint-port-pull-cli-libs', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await cp(join(REPO_ROOT, 'scripts'), join(bp, 'scripts'), { recursive: true })
      await s.run('chmod', ['+x', join(bp, 'scripts/blueprint')], { cwd: bp })
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      // SAME leaf name ("proj") under two distinct parents — several of the
      // real libs substitute the project's name (its logical PWD's basename)
      // into their content, and a `old`/`new` leaf mismatch would make that
      // substitution itself the difference this row is trying to rule out.
      const oldProj = await s.workspace.dir('side-old', 'proj')
      const newProj = await s.workspace.dir('side-new', 'proj')
      await seedRegisteredProject(s, oldProj, bp, sha)
      await seedRegisteredProject(s, newProj, bp, sha)
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'scripts/blueprint', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'scripts/blueprint', '--yes'], env)

      expect(oldResult.code).toBe(0)
      expect(newResult.code).toBe(0)
      expect(newResult.stderr).toBe(oldResult.stderr)
      const oldNormalized = normalizeDiffHeaders(oldResult.stdout)
      const newNormalized = normalizeDiffHeaders(newResult.stdout)
      expect(oldNormalized).toContain('scripts/blueprint brings the libs it sources:')
      expect(oldNormalized).not.toContain('scripts/blueprint.mts')
      expect(oldNormalized).toMatch(/ {2}same {2}scripts\/blueprint\n/)
      // NEW's stdout is OLD's, plus exactly one extra "same" line for the
      // .mts sibling it also considers, inserted right after scripts/
      // blueprint's own "same" line (the order `cmdPull` iterates files in).
      const expectedNewNormalized = oldNormalized.replace(
        /( {2}same {2}scripts\/blueprint\n)/,
        '$1  same  scripts/blueprint.mts\n',
      )
      expect(newNormalized).toBe(expectedNewNormalized)
    })
  })
})

/**
 * blueprint-port differential — finding 1 (plan §5's required failure rows):
 * `cp`, `awk` and `jq` failing INSIDE bp_prospective_for's own dynamic extent
 * (bp_prospective_pull's `cp`, marker_aware_merge's `awk`, and
 * _bp_settings_layer's merge `jq`) — 1ced574 proved the `unchecked()`
 * mechanism itself with unit tests (a bare call rejects, the wrapped call
 * absorbs and returns the last-command result); these four rows are the
 * TRUE END-TO-END proof plan §5 asks for: a real `drift`/`pull` run, driven
 * by a PATH shim, comparing the shell CLI against the port.
 *
 * Each shim fails the tool for EVERY invocation during the run (not just one
 * call), which is safe here because a plain drift/pull run (no a2bp) reaches
 * `cp`/`awk` NOWHERE ELSE — checked directly against scripts/blueprint and
 * every scripts/lib/*.sh it sources for this file set. The one exception is
 * `cp` in a PULL that actually writes: `_bp_shielded_write` (P2) ALSO runs a
 * `cp -p DEST tmp` to preserve an EXISTING destination's mode before
 * overwriting it — reached for `.blueprint-source` itself once any file is
 * pulled — so a `cp` shim used in a pull row fails only the PLAIN, no-flags
 * form `cp SRC DST` that bp_prospective_pull's own "new"/"copy"/"backup-copy"
 * branches use, passing the `-p` form through untouched.
 */
describe('blueprint-port differential — finding 1 (tool failures inside prospective)', () => {
  async function dateAndToolFailEnv(s: Scenario, tag: string, bin: string): Promise<Record<string, string>> {
    const shims = await s.shimDir(tag)
    await shims.add('date', 'echo 2026-01-01T00:00:00Z')
    await shims.add(bin, 'exit 1\n')
    return { PATH: shims.path() }
  }

  /** Same idea as `dateAndToolFailEnv`, but for `cp` in a row that reaches
   * `_bp_shielded_write`'s OWN unrelated `cp -p` (the pull-writes-something
   * case) — passes any invocation carrying `-p` through to the real `cp`,
   * and fails only the plain two-argument form bp_prospective_pull uses. */
  async function dateAndCpFailUnlessPreserveEnv(s: Scenario, tag: string): Promise<Record<string, string>> {
    const real = await realBinPath(s, 'cp')
    const shims = await s.shimDir(tag)
    await shims.add('date', 'echo 2026-01-01T00:00:00Z')
    await shims.add(
      'cp',
      `for a in "$@"; do\n  case "$a" in\n    -p) exec ${JSON.stringify(real)} "$@" ;;\n  esac\ndone\nexit 1\n`,
    )
    return { PATH: shims.path() }
  }

  it('drift — cp fails inside bp_prospective_pull\'s "copy" mode (none:none, no markers either side)', async () => {
    await scenario('blueprint-port-f1-drift-cp', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // Neither copy carries BLUEPRINT:BEGIN/END markers (seedBlueprintRepo's
      // plain fixture content), so bp_marker_structure reports "none" on
      // both sides and bp_prospective_pull takes the `none:none` branch —
      // the one whose OWN body is a bare `cp`, not `marker_aware_merge`.
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nan older, edited copy\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'partial sync')

      const oldEnv = { ...(await dateAndToolFailEnv(s, 'old-shims', 'cp')), BP_NO_PROMPT: '1' }
      const oldResult = await runOld(s, proj, ['drift'], oldEnv)
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newEnv = { ...(await dateAndToolFailEnv(s, 'new-shims', 'cp')), BP_NO_PROMPT: '1' }
      const newResult = await runNew(s, proj, ['drift'], newEnv)

      expectIdentical(oldResult, newResult)
      // NON-VACUITY: a working `cp` here would report both files as cleanly
      // DRIFTED (content differs, comparison succeeds) — the REFUSED bucket
      // below is only reachable because the shimmed `cp` made
      // bp_prospective_for's own return status non-zero for BOTH managed
      // files (docs/DoD.md is unchanged content-wise, but its "copy" branch
      // runs the same failing `cp`), which cmd_drift reads as a refusal
      // regardless of the WHY it's carrying (a stale or empty BP_PP_WHY from
      // this exact hazard — reproduced, not designed).
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 2')
    })
  })

  it('pull — cp fails inside bp_prospective_pull\'s "new" mode, on a file the project never pulled', async () => {
    await scenario('blueprint-port-f1-pull-cp', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const oldProj = await s.workspace.dir('old-proj')
      const newProj = await s.workspace.dir('new-proj')
      await seedRegisteredProject(s, oldProj, bp, sha)
      await seedRegisteredProject(s, newProj, bp, sha)
      // Neither project has CLAUDE.md or docs/DoD.md at all — both are "new
      // in blueprint", so bp_prospective_pull's `[ ! -f "$proj" ]` branch is
      // what's exercised (mode=new, a bare `cp "$bp" "$out"`), never the
      // `none:none` copy branch the drift row above targets.
      const oldEnv = await dateAndCpFailUnlessPreserveEnv(s, 'old-shims')
      const newEnv = await dateAndCpFailUnlessPreserveEnv(s, 'new-shims')
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], oldEnv)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], newEnv)

      expectPullIdentical(oldResult, newResult)
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      // NON-VACUITY, and the genuinely surprising part this row exists to
      // pin: BP_PP_MODE stays "new" (set BEFORE the cp call), so pull_file
      // proceeds to WRITE anyway — from an `$out` mktemp file the failed cp
      // never populated. The write itself (`cat`, not `cp` — P2's shield)
      // succeeds on zero bytes, so pull reports success and installs an
      // EMPTY file rather than failing loudly. Both sides must agree this
      // is what happens, not just that they agree with each other.
      expect(oldClaude).toBe('')
    })
  })

  it('pull — awk fails inside marker_aware_merge, falling back to backup-copy silently', async () => {
    await scenario('blueprint-port-f1-pull-awk', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const oldProj = await s.workspace.dir('old-proj')
      const newProj = await s.workspace.dir('new-proj')
      await seedRegisteredProject(s, oldProj, bp, sha)
      await seedRegisteredProject(s, newProj, bp, sha)
      // bp_marker_structure is ITSELF awk-based, so once awk is globally
      // broken it reports neither "none" nor "ok N" for either side — the
      // failed command substitution captures empty stdout. That falls
      // through both the `none:none`/`none:ok*`/`ok*:none` cases (none of
      // which match an empty string) to the wildcard branch, whose own
      // `marker_aware_merge` call fails on the SAME broken awk and the
      // whole thing degrades to `backup-copy`: a bare `cp` overwrite (with a
      // "marker structure mismatch" WHY that is cosmetically wrong — it
      // wasn't a mismatch, awk itself failed — but stays byte-identical
      // between the two CLIs, which is what this row actually proves).
      for (const proj of [oldProj, newProj]) {
        await mkdir(join(proj, 'docs'), { recursive: true })
        await writeFile(join(proj, 'CLAUDE.md'), "# CLAUDE\nthe project's own edit\n", 'utf8')
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await commitAll(s, proj, 'partial sync')
      }
      const oldEnv = await dateAndToolFailEnv(s, 'old-shims', 'awk')
      const newEnv = await dateAndToolFailEnv(s, 'new-shims', 'awk')
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], oldEnv)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], newEnv)

      expectPullIdentical(oldResult, newResult)
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      // NON-VACUITY: the fallback landed the BLUEPRINT's content whole,
      // never the project's own edit — the divergence a broken merge would
      // otherwise hide.
      expect(oldClaude).toBe('# CLAUDE\nfixture\n')
      expect(oldClaude).not.toContain('own edit')
    })
  })

  it('pull — jq fails inside the settings merge (_bp_settings_layer), refusing the file', async () => {
    await scenario('blueprint-port-f1-pull-jq-merge', async (s) => {
      const settingsJson = (allow: string[]) =>
        `${JSON.stringify({ permissions: { allow, ask: [], deny: [] } }, null, 2)}\n`
      const layer = `${JSON.stringify({ permissions: { allow: ['Bash(aws logs tail *)'] } }, null, 2)}\n`

      async function seedSettingsBlueprint(dir: string): Promise<string> {
        await mkdir(join(dir, 'docs'), { recursive: true })
        await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
        await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
        await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
        await mkdir(join(dir, '.claude'), { recursive: true })
        await writeFile(join(dir, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
        await initRepo(s, dir)
        await commitAll(s, dir, 'base')
        return (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
      }

      const bp = await s.workspace.dir('bp')
      const sha = await seedSettingsBlueprint(bp)
      const oldProj = await s.workspace.dir('old-proj')
      const newProj = await s.workspace.dir('new-proj')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, sha)
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await mkdir(join(proj, '.claude'), { recursive: true })
        await writeFile(join(proj, '.claude/settings.json'), settingsJson([]), 'utf8')
        await writeFile(join(proj, '.claude/settings.project.json'), layer, 'utf8')
        await commitAll(s, proj, 'layered settings')
      }

      // Fails ONLY jq calls whose PROGRAM ARGUMENT contains "def uniq" — the
      // settings MERGE program (BP_SETTINGS_MERGE) and no other jq call this
      // run makes (bpOneObject's and the shape check's programs contain
      // neither word), so the earlier checks succeed normally and the run
      // reaches exactly the merge step this row means to break.
      const oldPath = await substringFailShim(s, 'old-jq', 'jq', 'def uniq')
      const newPath = await substringFailShim(s, 'new-jq', 'jq', 'def uniq')
      const oldResult = await runOld(s, oldProj, ['pull', '.claude/settings.json'], { PATH: oldPath })
      const newResult = await runNew(s, newProj, ['pull', '.claude/settings.json'], { PATH: newPath })

      expectPullIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('could not be merged')
      // Refused: nothing written, the project's settings.json is untouched.
      const oldSettings = await readFile(join(oldProj, '.claude/settings.json'), 'utf8')
      expect(oldSettings).toBe(settingsJson([]))
    })
  })
})

/**
 * blueprint-port differential — a2bp / prs (TASK-081 slice 4, plan §8 row 4).
 *
 * A representative slice of plan §5's a2bp/prs rows: dry-run, no-derived-
 * project, missing-lib, contamination refusal, gitleaks unavailable, gh
 * unavailable, filed (exit 3, via a `gh` shim — no real network), and prs
 * (empty / a listing / gh query failure). `a2bp` WRITES A REAL BRANCH to its
 * (local, filesystem) remote when it gets that far, so every row that reaches
 * that point builds its OWN blueprint remote per side, like the pull
 * describe's full/partial rows above — reusing one remote across OLD and NEW
 * would make the second run see the first run's already-pushed branch.
 */
/** Normalises everything two INDEPENDENT scenario fixtures can never agree
 * on byte-for-byte: each side's own absolute workspace path (down to the
 * shared "proj"/"bp" leaf), the scratch clone's random mktemp suffix, commit
 * SHAs (content differs a hair between the two builds — the request commit
 * embeds the base's own committer date, which is fine to differ; the actual
 * TREE content is identical) and the request branch's content-derived key. */
function scrubA2bp(out: string): string {
  return out
    .replace(/\/[^ \n]*-side\/(proj|bp)\b/g, '<$1>')
    .replace(/\/[^ \n]*\/a2bp\.[^/ \n]+/g, '<scratch>')
    .replace(/\b[0-9a-f]{40}\b/g, '<sha>')
    .replace(/a2bp\/proj\/[0-9a-f]+/g, 'a2bp/proj/<key>')
}

describe('blueprint-port differential — a2bp / prs', () => {
  // SAME leaf name ("proj") under a per-side parent, like the "pull
  // scripts/blueprint" row above — a2bp's own output prints the project's
  // basename (`(name: <basename>)`), so an "old"/"new" leaf mismatch would
  // make that difference the thing this row is trying to rule out.
  async function a2bpProject(s: Scenario, tag: string, claudeText = '# CLAUDE\nfixture\nan improvement worth requesting\n') {
    const bp = await s.workspace.dir(`${tag}-side`, 'bp')
    const sha = await seedBlueprintRepo(s, bp)
    const proj = await s.workspace.dir(`${tag}-side`, 'proj')
    await seedRegisteredProject(s, proj, bp, sha)
    // seedRegisteredProject seeds no CLAUDE.md of its own — a2bp needs a
    // project file that DIFFERS from the blueprint's copy, or every row
    // would exercise "nothing to request" (BP_RC_NOTHING) instead of the
    // path it means to prove.
    {
      await writeFile(join(proj, 'CLAUDE.md'), claudeText, 'utf8')
      await commitAll(s, proj, 'edit')
    }
    return { bp, proj }
  }

  /** A symlink farm of every executable on PATH EXCEPT `name`, deterministic
   * on any host (a2bp-e2e's own technique — a shim is useless here, since
   * `command -v` finds it; the binary must be genuinely absent). */
  async function pathWithout(s: Scenario, name: string, tag: string): Promise<string> {
    const dir = await s.workspace.dir(`${tag}-nobin`)
    const farm = await s.run(
      'sh',
      [
        '-c',
        'printf %s "$1" | tr : "\\n" | while IFS= read -r d; do\n' +
          '  [ -d "$d" ] || continue\n' +
          '  for exe in "$d"/*; do\n' +
          '    [ -f "$exe" ] || continue\n' +
          '    [ -x "$exe" ] || continue\n' +
          '    n="${exe##*/}"\n' +
          '    [ "$n" = "$2" ] && continue\n' +
          '    [ -e "$3/$n" ] || ln -s "$exe" "$3/$n" 2>/dev/null\n' +
          '  done\n' +
          'done\n' +
          'exit 0',
        '_',
        process.env.PATH ?? '',
        name,
        dir,
      ],
      { cwd: s.workspace.root },
    )
    expect(farm.code, farm.output).toBe(0)
    return dir
  }

  /**
   * Codex review finding 2 (TASK-081, commit 1ced574's body) — a2bp's
   * `bp_file_base_content` call (scripts/blueprint:1944) and its
   * `--no-pager diff --stat` pipeline (:2025) are BARE statements under
   * `set -e`, never an `if`/`||` condition — unlike bp_prospective_for's own
   * three call sites (plan §2 rule 4), a failure here must ABORT the whole
   * run with the failing command's own status, not be silently absorbed.
   * 1ced574 fixed the port to `throw` here instead of wrapping in
   * `unchecked()`; these two rows are the differential proof the review
   * asked for — a `git` PATH shim that fails ONLY the one verb each
   * statement uses (matching argv, never a substring), passing every other
   * git invocation through untouched, so `bp_file_fetch_base`'s own
   * clone/fetch/rev-parse and the later commit-tree build are unaffected.
   */
  it('finding 2 — bp_file_base_content’s bare `git show` failing aborts the whole run', async () => {
    await scenario('blueprint-port-a2bp-f2-base-content', async (s) => {
      const oldSide = await a2bpProject(s, 'old-f2a')
      const newSide = await a2bpProject(s, 'new-f2a')
      const oldPath = await verbFailShim(s, 'old-f2a-git', 'git', ['show'])
      const newPath = await verbFailShim(s, 'new-f2a-git', 'git', ['show'])
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: oldPath })
      const newResult = await runNew(s, newSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: newPath })
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.stderr).toBe(oldResult.stderr)
      expect(newResult.code).toBe(oldResult.code)
      // NON-VACUITY: died specifically of the shimmed git's own status, not
      // some unrelated refusal (a2bp's own guard codes are 3/4/5/6 — never 1
      // — so exit 1 here can only be the bare statement's abort).
      expect(oldResult.code).toBe(1)
    })
  })

  it('finding 2 — the bare `git --no-pager diff --stat` pipeline failing aborts the whole run', async () => {
    await scenario('blueprint-port-a2bp-f2-diff-stat', async (s) => {
      const oldSide = await a2bpProject(s, 'old-f2b')
      const newSide = await a2bpProject(s, 'new-f2b')
      const oldPath = await verbFailShim(s, 'old-f2b-git', 'git', ['--stat'])
      const newPath = await verbFailShim(s, 'new-f2b-git', 'git', ['--stat'])
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: oldPath })
      const newResult = await runNew(s, newSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: newPath })
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.stderr).toBe(oldResult.stderr)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(1)
      // The request got as far as building the commit (both sides printed
      // the "Request" header) before the bare diff --stat statement killed it.
      expect(oldResult.stdout).toContain('Request')
      expect(oldResult.stdout).not.toContain('request filed')
    })
  })

  /**
   * Codex review finding 3 — `scripts/lib/placeholders.sh` is not one of
   * a2bp's six required libs (it is sourced separately, plan §9 D), so a
   * project missing it does not hit the "lib is missing" refusal at all.
   * Instead `bpShouldSubstitute` bridges to it directly, and the shell's own
   * call site (`_should_substitute` at scripts/blueprint:1947, no
   * redirection) lets bash's own "command not found" line reach the real
   * stderr when the function is undefined. A path that SHOULD substitute
   * (CLAUDE.md is not in bp_should_substitute's exemption list) is what
   * reaches that call.
   *
   * FIXED, not just observed: `bpShouldSubstitute` used to pass
   * `stderr: 'ignore'`, silently swallowing this diagnostic outright — a
   * real divergence (CLAUDE.md's "no silent swallowing" rule), now
   * `stderr: 'inherit'`. What remains a NAMED, ACCEPTED divergence (plan §6
   * already has one of this shape) is the exact WORDING: the shell's
   * diagnostic is bash's own "scripts/blueprint: line 287: …", naming the
   * CLI's real file and line, while the port's bridge runs the function
   * through a SEPARATE `bash -c` subprocess, whose own diagnostic can only
   * ever read "bash: line 1: …" — a different bash process reporting on
   * itself, not something `run()` synthesizes and could be taught the CLI's
   * shape. Stdout and the exit code are still compared byte-for-byte; only
   * this one stderr line is normalised (both sides' prefix stripped before
   * the message).
   */
  it('finding 3 — scripts/lib/placeholders.sh missing, on a path that substitutes', async () => {
    await scenario('blueprint-port-a2bp-f3-no-placeholders', async (s) => {
      const oldSide = await a2bpProject(s, 'old-f3')
      const newSide = await a2bpProject(s, 'new-f3')
      const { rm } = await import('node:fs/promises')
      await rm(join(oldSide.proj, 'scripts/lib/placeholders.sh'))
      await rm(join(newSide.proj, 'scripts/lib/placeholders.sh'))
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', 'CLAUDE.md'])
      const newResult = await runNew(s, newSide.proj, ['a2bp', 'CLAUDE.md'])
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.code).toBe(oldResult.code)
      // The one named normalisation: strip "<program>: line N: " off the
      // front of each side's diagnostic before comparing — bash's own
      // prefix, naming a different program and line per side, never
      // reproducible byte-for-byte across two distinct bash processes.
      const stripLinePrefix = (s: string) => s.replace(/^\S+: line \d+: /gm, '')
      expect(stripLinePrefix(newResult.stderr)).toBe(stripLinePrefix(oldResult.stderr))
      expect(oldResult.stderr).toContain('bp_should_substitute: command not found')
      expect(newResult.stderr).toContain('bp_should_substitute: command not found')
    })
  })

  it('dry-run — files, base and diff --stat, nothing pushed', async () => {
    await scenario('blueprint-port-a2bp-dry-run', async (s) => {
      const oldSide = await a2bpProject(s, 'old-dry')
      const newSide = await a2bpProject(s, 'new-dry')
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', '--dry-run', 'CLAUDE.md'])
      const newResult = await runNew(s, newSide.proj, ['a2bp', '--dry-run', 'CLAUDE.md'])
      expect(oldResult.code, oldResult.output).toBe(0)
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.stderr).toBe(oldResult.stderr)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.stdout).toContain('--dry-run: nothing pushed')
    })
  })

  it('no files given — usage refusal, no remote contact', async () => {
    await scenario('blueprint-port-a2bp-no-files', async (s) => {
      const dir = await s.workspace.dir('cwd')
      const [oldResult, newResult] = await Promise.all([
        s.run('bash', [SHELL_CLI, 'a2bp'], { cwd: dir }),
        s.run(process.execPath, [PORTED_CLI, 'a2bp'], { cwd: dir }),
      ])
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain('usage: blueprint a2bp')
    })
  })

  it('not a derived project — no .blueprint-source here', async () => {
    await scenario('blueprint-port-a2bp-not-a-project', async (s) => {
      const dir = await s.workspace.dir('cwd')
      await seedCliOnly(s, dir)
      await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
      const oldResult = await runOld(s, dir, ['a2bp', 'CLAUDE.md'])
      const newResult = await runNew(s, dir, ['a2bp', 'CLAUDE.md'])
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
    })
  })

  it('a required lib is missing — dies with the exact scripts/lib/<name> message', async () => {
    await scenario('blueprint-port-a2bp-missing-lib', async (s) => {
      const root = await s.workspace.dir('missinglib')
      await mkdir(join(root, 'scripts/lib'), { recursive: true })
      await copyFile(SHELL_CLI, join(root, 'scripts/blueprint'))
      await s.run('chmod', ['+x', join(root, 'scripts/blueprint')], { cwd: root })
      await copyFile(PORTED_CLI, join(root, 'scripts/blueprint.mts'))
      const { readdir } = await import('node:fs/promises')
      for (const name of await readdir(join(REPO_ROOT, 'scripts/lib'))) {
        if (name === 'request-build.sh') continue
        await copyFile(join(REPO_ROOT, 'scripts/lib', name), join(root, 'scripts/lib', name))
      }
      await writeFile(
        join(root, '.blueprint-source'),
        'config_version   = 2\nblueprint_remote = /nonexistent\nblueprint_branch = main\nbootstrap_sha    = 0000000000000000000000000000000000000000\nbootstrap_date   = 2026-01-01\n',
        'utf8',
      )
      const oldResult = await runOld(s, root, ['a2bp', 'CLAUDE.md'])
      const newResult = await runNew(s, root, ['a2bp', 'CLAUDE.md'])
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain('scripts/lib/request-build.sh is missing')
    })
  })

  it('contamination BLOCK — a host path in the file: nothing filed (exit 4)', async () => {
    await scenario('blueprint-port-a2bp-contamination', async (s) => {
      const text = '# CLAUDE\nfixture\nsecret path /home/someuser/private/config\n'
      const oldSide = await a2bpProject(s, 'old-contam', text)
      const newSide = await a2bpProject(s, 'new-contam', text)
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', 'CLAUDE.md'])
      const newResult = await runNew(s, newSide.proj, ['a2bp', 'CLAUDE.md'])
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.stderr).toBe(oldResult.stderr)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain('host home path')
      expect(oldResult.stdout).toContain('blocked — nothing filed')
    })
  })

  it('gitleaks unavailable — the secret scan refuses (BUG-127), exit 4', async () => {
    await scenario('blueprint-port-a2bp-no-gitleaks', async (s) => {
      const oldSide = await a2bpProject(s, 'old-nogl')
      const newSide = await a2bpProject(s, 'new-nogl')
      const oldPath = await pathWithout(s, 'gitleaks', 'old-nogl')
      const newPath = await pathWithout(s, 'gitleaks', 'new-nogl')
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: oldPath })
      const newResult = await runNew(s, newSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: newPath })
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.stderr).toBe(oldResult.stderr)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stderr).toContain('gitleaks is not installed')
    })
  })

  it('gh unavailable — pushed but no PR opened (BUG-011), exit 5', async () => {
    await scenario('blueprint-port-a2bp-no-gh', async (s) => {
      const oldSide = await a2bpProject(s, 'old-nogh')
      const newSide = await a2bpProject(s, 'new-nogh')
      const oldPath = await pathWithout(s, 'gh', 'old-nogh')
      const newPath = await pathWithout(s, 'gh', 'new-nogh')
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: oldPath })
      const newResult = await runNew(s, newSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: newPath })
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.stderr).toBe(oldResult.stderr)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stdout).toContain('gh is not installed')
    })
  })

  it('filed — pushed and a PR opened via a gh shim: exit 3 (BUG-011 happy path)', async () => {
    await scenario('blueprint-port-a2bp-filed', async (s) => {
      const oldSide = await a2bpProject(s, 'old-filed')
      const newSide = await a2bpProject(s, 'new-filed')
      const oldGh = await s.shimDir('old-filed-gh')
      await oldGh.add(
        'gh',
        'case "$1 $2" in\n  "pr list") echo "" ;;\n  "pr create") echo "https://github.com/example/repo/pull/1" ;;\n  *) exit 1 ;;\nesac\n',
      )
      const newGh = await s.shimDir('new-filed-gh')
      await newGh.add(
        'gh',
        'case "$1 $2" in\n  "pr list") echo "" ;;\n  "pr create") echo "https://github.com/example/repo/pull/1" ;;\n  *) exit 1 ;;\nesac\n',
      )
      const oldResult = await runOld(s, oldSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: oldGh.path() })
      const newResult = await runNew(s, newSide.proj, ['a2bp', 'CLAUDE.md'], { PATH: newGh.path() })
      expect(scrubA2bp(newResult.stdout)).toBe(scrubA2bp(oldResult.stdout))
      expect(newResult.stderr).toBe(oldResult.stderr)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(3)
      expect(oldResult.stdout).toContain('✓ request filed: https://github.com/example/repo/pull/1')
    })
  })

  it('prs — empty, a listing, and a gh query failure', async () => {
    await scenario('blueprint-port-prs', async (s) => {
      const bp = await s.workspace.dir('prs-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prs-proj')
      await seedRegisteredProject(s, proj, bp, sha)

      const emptyGh = await s.shimDir('prs-empty-gh')
      await emptyGh.add('gh', 'case "$1 $2" in\n  "pr list") echo "" ;;\n  *) exit 1 ;;\nesac\n')
      const emptyOld = await runOld(s, proj, ['prs'], { PATH: emptyGh.path() })
      const emptyNew = await runNew(s, proj, ['prs'], { PATH: emptyGh.path() })
      expectIdentical(emptyOld, emptyNew)
      expect(emptyOld.code).toBe(0)
      expect(emptyOld.stdout).toContain('No open a2bp requests.')

      const listingGh = await s.shimDir('prs-listing-gh')
      await listingGh.add(
        'gh',
        'case "$1 $2" in\n' +
          '  "pr list") printf \'42\\ta2bp/proj-a/deadbeef\\t2026-01-02T03:04:05Z\\tfalse\\thttps://github.com/example/repo/pull/42\\n\' ;;\n' +
          '  *) exit 1 ;;\n' +
          'esac\n',
      )
      const listingOld = await runOld(s, proj, ['prs'], { PATH: listingGh.path() })
      const listingNew = await runNew(s, proj, ['prs'], { PATH: listingGh.path() })
      expectIdentical(listingOld, listingNew)
      expect(listingOld.code).toBe(0)
      expect(listingOld.stdout).toContain('#42')
      expect(listingOld.stdout).toContain('proj-a')

      const failGh = await s.shimDir('prs-fail-gh')
      await failGh.add('gh', 'exit 1\n')
      const failOld = await runOld(s, proj, ['prs'], { PATH: failGh.path() })
      const failNew = await runNew(s, proj, ['prs'], { PATH: failGh.path() })
      expectIdentical(failOld, failNew)
      expect(failOld.code).toBe(1)
      expect(failOld.stdout).toContain('INCOMPLETE, not empty')
    })
  })
})
