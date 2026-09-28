/**
 * tests/blueprint-port/blueprint-port.release.spec.ts — TASK-081, the
 * differential harness (plan §5). Compares OLD (`bash scripts/blueprint`)
 * against NEW (`node scripts/blueprint.mts`) subcommand family by
 * subcommand family, as each slice lands. Deleted once the founder accepts
 * TASK-081 (plan §5) — its results live in the port commit body instead.
 *
 * SLICE 1 covers dispatch (no args, `help`, `--help`, `-h`, an unknown
 * subcommand, `push`) and `files` for the two paths that need no network
 * (standing in "the blueprint" itself, and the BLUEPRINT_ROOT override of
 * that same root). `files` in a REGISTERED derived project needs the fetch
 * machinery (P1), added in slice 2 — its own row is below, alongside drift
 * and pull.
 *
 * Release tier: it shells out to real `git`/`bash`/`node` against fixture
 * repositories, which is slower than the suite's usual unit tests — the same
 * reason tests/a2bp-e2e and tests/bootstrap-gate are release-tier.
 */
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { chmod, cp, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import type { RunResult } from '../harness/process.js'
import { withCttyAnswer, withCttyNoStdin } from '../helpers/tty.js'

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

  // The third matrix row this describe's own header comment once called
  // "no row for it here yet" — cmd_files' network-fetch path (read_blueprint_
  // source → the address-mode managed set), added in slice 2. Reuses the
  // same registered-project fixture the drift/pull describes below build,
  // hoisted here by function declaration.
  it('in a registered derived project (read_blueprint_source, the address path)', async () => {
    await scenario('blueprint-port-files-registered', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const [oldResult, newResult] = await Promise.all([runOld(s, proj, ['files']), runNew(s, proj, ['files'])])
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('CLAUDE.md')
      expect(oldResult.stdout).toContain('docs/DoD.md')
    })
  })
})

/**
 * blueprint-port differential — drift (TASK-081 slice 2, plan §8 row 2).
 *
 * This describe covers: clean, drifted, new-in-blueprint, a refused file
 * (BUG-034/BUG-113), unregistered, and not-a-project. Each proves a different
 * code path (the fetch, the managed-set diff, bp_prospective_for's
 * marker-structure refusal, read_blueprint_source's marker-count heuristic,
 * and its plain refusal).
 *
 * The REST of plan §5's ~90-row drift matrix is covered by later describes
 * in this file, added closing Codex's re-review finding 7 (the claim that
 * these were "unit-proven" was wrong: `bpSettingsLayer`/`reportStaleness`/
 * `bpFetchBlueprint` are none of them exported, so nothing outside this
 * differential harness ever calls them) — see "settings-layer refusals",
 * "staleness states", "fetch failures", "drift's fast-forward prompt" (the
 * interactive y/N answer to the "behind" status) and the pull describe's own
 * matrix below. missing-in-blueprint is the one row genuinely absent: it is
 * the SAME code path as "new in blueprint" above with the two managed-set
 * sides swapped (a file the project still names in `.blueprint-source`'s
 * history but the blueprint's `git archive HEAD` no longer lists), and
 * TASK-021 §4.2's retirement rows (below, in the pull describe) already drive
 * that exact managed-set asymmetry end to end.
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
 * blueprint-port differential — drift's fast-forward prompt (plan §5's
 * "drift … the fast-forward prompt y/N" row).
 *
 * Only reachable under the BLUEPRINT_ROOT override (report_staleness's own
 * doc comment: "runs only where drift compares against a LOCAL checkout"),
 * with a clean, on-branch, behind-but-not-diverged local checkout — the exact
 * shape tests/staleness's own `driftFixture` builds. `BP_NO_PROMPT` is
 * deliberately NOT set here (unlike every drift row above): those rows exist
 * to prove the prompt is SUPPRESSED; these prove what happens when it fires.
 */
describe("blueprint-port differential — drift's fast-forward prompt", () => {
  /** A registered project whose `.blueprint-source` carries ONLY
   * bootstrap_sha/bootstrap_date (config v1 shape, no blueprint_remote) —
   * report_staleness is only reached via the BLUEPRINT_ROOT override branch
   * of read_blueprint_source, which needs no remote field at all. */
  async function seedOverrideProject(s: Scenario, dir: string, bootstrapSha: string): Promise<void> {
    await cp(join(REPO_ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true })
    await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
    await mkdir(join(dir, '.githooks'), { recursive: true })
    await writeFile(join(dir, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
    await s.run('chmod', ['+x', join(dir, '.githooks/pre-push')], { cwd: dir })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await writeFile(
      join(dir, '.blueprint-source'),
      `bootstrap_sha    = ${bootstrapSha}\nbootstrap_date   = 2026-01-01\n`,
      'utf8',
    )
    await initRepo(s, dir)
    await commitAll(s, dir, 'init')
  }

  /** One shared upstream, cloned to `bp` at its FIRST commit, then advanced
   * once — so a caller that clones `bp` again from the SAME `up` (the "y"
   * row below, which needs two independent `bp` copies because fast-forward
   * mutates one) gets the identical commit OBJECTS, not a second,
   * independently-timestamped near-miss with a different sha. */
  async function seedUpstream(s: Scenario, tag: string): Promise<{ up: string; firstSha: string }> {
    const up = await s.workspace.dir(`${tag}-up`)
    await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await initRepo(s, up)
    await commitAll(s, up, 'base')
    const firstSha = (await git(s, up, ['rev-parse', 'HEAD'])).stdout.trim()
    return { up, firstSha }
  }

  async function cloneBp(s: Scenario, tag: string, up: string): Promise<string> {
    const bp = s.workspace.path(`${tag}-bp`)
    await git(s, s.workspace.root, ['clone', '-q', up, bp])
    await git(s, bp, ['config', 'user.email', 't@local'])
    await git(s, bp, ['config', 'user.name', 't'])
    return bp
  }

  it('y fast-forwards the local checkout to the (shared) remote tip', async () => {
    await scenario('blueprint-port-drift-ff-y', async (s) => {
      const { up, firstSha } = await seedUpstream(s, 'ff-y')
      const oldBp = await cloneBp(s, 'ff-y-old', up)
      const newBp = await cloneBp(s, 'ff-y-new', up)
      // Advance the SHARED upstream exactly once — both clones will later
      // fetch this SAME commit object, not two independently-built ones.
      await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\nmore\n', 'utf8')
      await commitAll(s, up, 'ahead')
      const headSha = (await git(s, up, ['rev-parse', 'HEAD'])).stdout.trim()

      const oldProj = await s.workspace.dir('ff-y-old-proj')
      const newProj = await s.workspace.dir('ff-y-new-proj')
      await seedOverrideProject(s, oldProj, firstSha)
      await seedOverrideProject(s, newProj, firstSha)

      const oldResult = await withCttyAnswer(
        s,
        oldProj,
        `BLUEPRINT_ROOT='${oldBp}' bash '${join(oldProj, 'scripts/blueprint')}' drift`,
        'y\n',
        { PWD: oldProj },
      )
      const newResult = await withCttyAnswer(
        s,
        newProj,
        `BLUEPRINT_ROOT='${newBp}' '${process.execPath}' '${join(newProj, 'scripts/blueprint.mts')}' drift`,
        'y\n',
        { PWD: newProj },
      )
      // Every absolute fixture path differs between the two independent
      // sides (bp AND proj alike — drift's own report prints `project:
      // $(pwd)`), so both are scrubbed to a shared placeholder before
      // comparing rather than only the one this row happens to mutate.
      const scrub = (t: string) =>
        t.split(oldBp).join('<bp>').split(newBp).join('<bp>').split(oldProj).join('<proj>').split(newProj).join('<proj>')
      expect(scrub(newResult.output)).toBe(scrub(oldResult.output))
      expect(oldResult.output).toContain('fast-forward it now?')
      expect(oldResult.output).toContain(`✓ fast-forwarded to ${headSha.slice(0, 7)}`)
      // NON-VACUITY: the LOCAL CHECKOUT actually moved, on both sides, to the
      // SAME shared commit object — not merely "some later commit".
      expect((await git(s, oldBp, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(headSha)
      expect((await git(s, newBp, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(headSha)
    })
  })

  it('N leaves the local checkout untouched', async () => {
    await scenario('blueprint-port-drift-ff-n', async (s) => {
      // No mutation on a decline, so ONE shared bp/proj pair for OLD then NEW
      // is safe — same shape as `driftBoth` above.
      const { up, firstSha } = await seedUpstream(s, 'ff-n')
      const bp = await cloneBp(s, 'ff-n', up)
      await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\nmore\n', 'utf8')
      await commitAll(s, up, 'ahead')
      const proj = await s.workspace.dir('ff-n-proj')
      await seedOverrideProject(s, proj, firstSha)

      const oldResult = await withCttyAnswer(
        s,
        proj,
        `BLUEPRINT_ROOT='${bp}' bash '${join(proj, 'scripts/blueprint')}' drift`,
        'N\n',
        { PWD: proj },
      )
      // Same reset as `driftBoth` above: arm_gate writes core.hooksPath /
      // core.sshCommand into the project's own LOCAL git config, and a
      // second run on the SAME directory would otherwise see them already
      // armed and print a DIFFERENT status line — a divergence the run
      // ORDER would cause, not the CLI under test.
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newResult = await withCttyAnswer(
        s,
        proj,
        `BLUEPRINT_ROOT='${bp}' '${process.execPath}' '${join(proj, 'scripts/blueprint.mts')}' drift`,
        'N\n',
        { PWD: proj },
      )
      expect(newResult.output).toBe(oldResult.output)
      expect(oldResult.output).toContain('fast-forward it now?')
      expect(oldResult.output).toContain('left alone')
      expect((await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(firstSha)
    })
  })
})

/**
 * blueprint-port differential — pull (TASK-081 slice 3, plan §8 row 3).
 *
 * This describe: nothing to pull; a full `--yes` pull that advances
 * bootstrap_sha; a partial named-file pull that does not; the
 * BUG-018/BUG-054 non-TTY refusal (exit 7); a guard refusal (BUG-034, exit
 * 4); `pull scripts/blueprint` against the REAL shell CLI's own lib list
 * (plan §7); and the interactive y/N/q prompt. The REST of plan §5's ~30-row
 * pull family — backup-copy and merge on their own genuine terms (not only
 * as a tool-failure fallback), retirement, and the executable bit in both
 * directions — is the "pull matrix" describe further down this file, and
 * settings-layer refusals reached via `pull` are proven in that describe's
 * own group (closing Codex re-review finding 7).
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

  /**
   * The interactive `Pull this file? [y/N/q]` prompt itself (plan §5's first
   * remaining row group), under a REAL controlling terminal with a REAL
   * answer on stdin — `withCttyNoStdin` (used by the non-TTY row above)
   * deliberately supplies an EMPTY answer to prove the refusal path; these
   * three rows drive the answer PAST that guard to prove `read`/
   * `readLineFromStdin()` itself, via `withCttyAnswer` (tests/helpers/tty.ts).
   */

  it('interactive prompt — y pulls the file and advances bootstrap_sha', async () => {
    await scenario('blueprint-port-pull-prompt-y', async (s) => {
      // TWO INDEPENDENT project copies (a write happens), but ONE SHARED
      // upstream: `bp` is cloned twice from the SAME `up`, and `up`'s second
      // commit is created exactly ONCE — so the commit object `bp` fast-
      // forwards to (and the sha `pull` reports fetching) is the identical
      // object on both sides, not two independently-timestamped near-misses.
      // (Unlike the pull describe's own two-commit blueprint, which needs no
      // such sharing because nothing here mutates a SEPARATE local checkout —
      // this row's write is the pulled file, and `seedBlueprintRepoTwoCommits`
      // already builds ONE bp both `oldProj`/`newProj` register against.)
      const bp = await s.workspace.dir('prompt-y-bp')
      const { first, head } = await seedBlueprintRepoTwoCommits(s, bp)
      const oldProj = await driftedProject(s, 'prompt-y-old', bp, first)
      const newProj = await driftedProject(s, 'prompt-y-new', bp, first)
      const oldResult = await withCttyAnswer(
        s,
        oldProj,
        `bash '${join(oldProj, 'scripts/blueprint')}' pull`,
        'y\n',
        { PWD: oldProj },
      )
      const newResult = await withCttyAnswer(
        s,
        newProj,
        `'${process.execPath}' '${join(newProj, 'scripts/blueprint.mts')}' pull`,
        'y\n',
        { PWD: newProj },
      )
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.output).toContain('✓ Pulled 1 file(s). Review')
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

  it('interactive prompt — N skips the file, nothing written, bootstrap_sha unchanged', async () => {
    await scenario('blueprint-port-pull-prompt-n', async (s) => {
      // Nothing this answer can ever write (a skip, never a pull), so ONE
      // shared project for OLD then NEW is safe — same shape as the non-TTY
      // row's shared-directory reuse just above.
      const bp = await s.workspace.dir('prompt-n-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prompt-n-proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const oldResult = await withCttyAnswer(
        s,
        proj,
        `bash '${join(proj, 'scripts/blueprint')}' pull`,
        'N\n',
        { PWD: proj },
      )
      const newResult = await withCttyAnswer(
        s,
        proj,
        `'${process.execPath}' '${join(proj, 'scripts/blueprint.mts')}' pull`,
        'N\n',
        { PWD: proj },
      )
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.output).toContain('skipped')
      expect(oldResult.output).toContain('Nothing pulled.')
      // NON-VACUITY: both managed files are genuinely NEW here
      // (seedRegisteredProject seeds no CLAUDE.md/docs/DoD.md of its own), so
      // "skipped" means the operator's "N" was HONOURED — neither landed.
      expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(false)
      expect(existsSync(join(proj, 'docs/DoD.md'))).toBe(false)
    })
  })

  it("interactive prompt — q quits: the remaining file, retirement, and bootstrap_sha are all untouched", async () => {
    await scenario('blueprint-port-pull-prompt-q', async (s) => {
      // Two "new" managed files (CLAUDE.md, docs/DoD.md) so `q` at the FIRST
      // file's prompt leaves a SECOND, later file provably unreached — the
      // shape plan §5 asks for ("remaining files untouched"). `q` aborts
      // before any write, so ONE shared project for OLD then NEW is safe.
      const bp = await s.workspace.dir('prompt-q-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prompt-q-proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const oldResult = await withCttyAnswer(
        s,
        proj,
        `bash '${join(proj, 'scripts/blueprint')}' pull`,
        'q\n',
        { PWD: proj },
      )
      const newResult = await withCttyAnswer(
        s,
        proj,
        `'${process.execPath}' '${join(proj, 'scripts/blueprint.mts')}' pull`,
        'q\n',
        { PWD: proj },
      )
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.output).toContain('aborted')
      expect(oldResult.output).toContain('Nothing pulled.')
      // NON-VACUITY, the whole point of this row: neither file landed, and
      // the SECOND file's own prompt never even printed — `q` at the first
      // stopped the loop before docs/DoD.md was ever reached.
      expect(oldResult.output).not.toContain('docs/DoD.md')
      expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(false)
      expect(existsSync(join(proj, 'docs/DoD.md'))).toBe(false)
      const src = await readFile(join(proj, '.blueprint-source'), 'utf8')
      expect(src).toContain(`bootstrap_sha    = ${sha}`)
    })
  })
})

/**
 * blueprint-port differential — the remaining pull-mode rows (plan §5's pull
 * matrix, Codex re-review finding 7): a GENUINE backup-copy (`ok:none`, no
 * tool failure — the finding-1 describe below only proves the FALLBACK into
 * backup-copy when `awk` fails, never this branch reached on its own terms),
 * a GENUINE marker-aware merge that succeeds, retirement offered and
 * accepted (`--yes`) alongside an edited copy kept, and the executable bit
 * following the blueprint's own mode in both directions.
 */
describe('blueprint-port differential — pull matrix (backup-copy, merge, retirement, exec bit)', () => {
  it('backup-copy — the blueprint uses markers, the project copy has none', async () => {
    await scenario('blueprint-port-pull-backup-copy', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content v2\n<!-- BLUEPRINT:END -->\nkeep\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, sha)
        // The project's own copy carries NO marker region at all (bs=ok,
        // ps=none) — the backup-copy branch's own condition, reached
        // without any tool ever failing.
        await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nplain, no markers, project-edited\n', 'utf8')
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await commitAll(s, proj, 'unmarked copy')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'CLAUDE.md', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'CLAUDE.md', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('blueprint uses markers')
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      // NON-VACUITY: the project's own edit is gone — backup-copy OVERWRITES,
      // unlike merge, which would have kept "keep" outside the region.
      expect(oldClaude).toBe(await readFile(join(bp, 'CLAUDE.md'), 'utf8'))
    })
  })

  it('merge — both sides carry markers, the managed region updates and the project text outside it survives', async () => {
    await scenario('blueprint-port-pull-merge', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content v2\n<!-- BLUEPRINT:END -->\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, sha)
        await writeFile(
          join(proj, 'CLAUDE.md'),
          '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content v1\n<!-- BLUEPRINT:END -->\nthe project wrote this\n',
          'utf8',
        )
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await commitAll(s, proj, 'marked copy')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'CLAUDE.md', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'CLAUDE.md', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      expect(oldClaude).toContain('managed content v2')
      // NON-VACUITY: the merge, not a plain overwrite — the project's own
      // text outside the marker region survived.
      expect(oldClaude).toContain('the project wrote this')
    })
  })

  it('retirement — an unedited retired file is removed with --yes, an edited one is kept ("yours now")', async () => {
    await scenario('blueprint-port-pull-retirement', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await writeFile(join(bp, 'docs/gone.md'), 'unedited, about to be retired\n', 'utf8')
      await writeFile(join(bp, 'docs/kept.md'), 'about to be retired, but edited\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'one')
      const first = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()
      await git(s, bp, ['rm', '-q', 'docs/gone.md', 'docs/kept.md'])
      await commitAll(s, bp, 'two — stopped shipping both')

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, first)
        await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await writeFile(join(proj, 'docs/gone.md'), 'unedited, about to be retired\n', 'utf8')
        await writeFile(join(proj, 'docs/kept.md'), 'about to be retired, but edited\nand the project added this\n', 'utf8')
        await commitAll(s, proj, 'sync at first, plus the soon-to-retire files')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toMatch(/retired\s+docs\/gone\.md/)
      expect(oldResult.stdout).toMatch(/yours now\s+docs\/kept\.md/)
      expect(existsSync(join(oldProj, 'docs/gone.md'))).toBe(false)
      expect(existsSync(join(newProj, 'docs/gone.md'))).toBe(false)
      expect(existsSync(join(oldProj, 'docs/kept.md'))).toBe(true)
      expect(existsSync(join(newProj, 'docs/kept.md'))).toBe(true)
    })
  })

  it('exec bit — pull sets +x on a newly-executable managed file and clears it when the blueprint drops it', async () => {
    await scenario('blueprint-port-pull-exec-bit', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      // CLAUDE.md starts executable (unusual, but exercises "+x lands"); a
      // second managed file, scripts/tool.sh, starts executable in the
      // PROJECT and loses its bit in the blueprint's second commit.
      await mkdir(join(bp, 'scripts'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nv1\n', 'utf8')
      await writeFile(join(bp, 'scripts/tool.sh'), '#!/bin/sh\necho v1\n', 'utf8')
      await chmod(join(bp, 'scripts/tool.sh'), 0o755)
      await initRepo(s, bp)
      await commitAll(s, bp, 'one')
      const first = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nv2\n', 'utf8')
      await chmod(join(bp, 'CLAUDE.md'), 0o755)
      await writeFile(join(bp, 'scripts/tool.sh'), '#!/bin/sh\necho v2\n', 'utf8')
      await chmod(join(bp, 'scripts/tool.sh'), 0o644)
      await commitAll(s, bp, 'two — CLAUDE.md gains +x, tool.sh loses it')

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, first)
        await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nv1\n', 'utf8')
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await mkdir(join(proj, 'scripts'), { recursive: true })
        await writeFile(join(proj, 'scripts/tool.sh'), '#!/bin/sh\necho v1\n', 'utf8')
        await chmod(join(proj, 'scripts/tool.sh'), 0o755)
        await commitAll(s, proj, 'sync at first commit')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      const oldClaudeMode = (await stat(join(oldProj, 'CLAUDE.md'))).mode & 0o777
      const newClaudeMode = (await stat(join(newProj, 'CLAUDE.md'))).mode & 0o777
      const oldToolMode = (await stat(join(oldProj, 'scripts/tool.sh'))).mode & 0o777
      const newToolMode = (await stat(join(newProj, 'scripts/tool.sh'))).mode & 0o777
      // The EXACT resulting mode is a umask artefact of how this host's git
      // materialises a substituted blueprint copy — not this row's subject.
      // Byte-for-byte parity between the two CLIs is; the owner exec bit
      // moving in the right direction on each file is the behaviour under
      // test.
      expect(newClaudeMode).toBe(oldClaudeMode)
      expect(newToolMode).toBe(oldToolMode)
      expect(oldClaudeMode & 0o100, 'CLAUDE.md did not gain +x').toBe(0o100)
      expect(oldToolMode & 0o100, "scripts/tool.sh did not lose +x").toBe(0)
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
 * blueprint-port differential — a needed tool ABSENT on PATH, or present but
 * not executable, during a real `pull` run (plan §5's "command-not-found
 * rows", extended beyond drift/pull's own two named cases to the tools this
 * TASK actually asked for: `comm` and `cmp` in pull's retirement stage,
 * `diff` in pull's preview, and `jq` entirely missing for a project that
 * carries a settings file).
 *
 * `comm`/`cmp`/`diff` are unguarded in the shell (no `command -v` check
 * anywhere near them) — bash's own "command not found"/"Permission denied"
 * diagnostic is what fires, and `s.pathWithout` (TASK-025 H4) is what makes
 * the tool GENUINELY ABSENT rather than merely shadowed by a shim `command
 * -v` would still find. Building the retirement fixture (comm/cmp rows) SURFACED
 * two real divergences in blueprint.mts — see the fix comments at each `run()`
 * call site (comm, cmp, and the `diff -u` preview) — where 'ignore' had
 * swallowed a diagnostic the shell's own unredirected stderr always showed.
 */
describe('blueprint-port differential — finding 4 (tool absence during pull)', () => {
  // Strips the leading "<program>: " prefix bash's own diagnostic carries
  // (measured directly: it is "<script>: line N: " when the failing call is
  // a plain statement, but bash omits the "line N:" part for a call inside a
  // process substitution — `_bp_retire`'s `< <(comm …)`, exactly what the
  // comm/cmp rows below hit — so that middle segment is OPTIONAL). NEW's own
  // message (run()'s `${cliName()}: ${cmd}: ${reason}`) carries the SAME
  // kind of leading "<program>: " prefix with no line number at all, so this
  // strips both sides down to the tool name uniformly rather than only OLD's.
  const stripLinePrefix = (t: string): string => t.replace(/^\S+: (line \d+: )?/gm, '')

  /** A blueprint that SHIPPED `OLD-FILE.md` at its first commit and STOPPED
   * shipping it at its second — the shape `_bp_retire`'s own `comm -23 hist
   * cur` needs to name a retirement candidate at all. The project's own copy
   * is seeded byte-identical to what the blueprint shipped, so a WORKING
   * `cmp` would call it a clean, unedited retire candidate. */
  async function seedRetirementFixture(s: Scenario, tag: string): Promise<{ proj: string }> {
    const bp = await s.workspace.dir(`${tag}-bp`)
    await mkdir(join(bp, 'docs'), { recursive: true })
    await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
    await writeFile(join(bp, 'OLD-FILE.md'), 'todo: retire me\n', 'utf8')
    await initRepo(s, bp)
    await commitAll(s, bp, 'base')
    await rm(join(bp, 'OLD-FILE.md'))
    await commitAll(s, bp, 'retire old file')
    const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

    const proj = await s.workspace.dir(`${tag}-proj`)
    await seedRegisteredProject(s, proj, bp, sha)
    await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
    await mkdir(join(proj, 'docs'), { recursive: true })
    await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
    await writeFile(join(proj, 'OLD-FILE.md'), 'todo: retire me\n', 'utf8')
    await commitAll(s, proj, 'sync')
    return { proj }
  }

  it('comm absent (127) — retirement never enumerates a candidate, on either CLI', async () => {
    await scenario('blueprint-port-f4-retire-no-comm', async (s) => {
      const { proj } = await seedRetirementFixture(s, 'no-comm')
      const path = await s.pathWithout(['comm'])
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      expect(stripLinePrefix(newResult.stderr)).toBe(stripLinePrefix(oldResult.stderr))
      expect(newResult.stdout).toBe(oldResult.stdout)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.stderr).toContain('comm: command not found')
      expect(oldResult.stdout).toContain('✓ Nothing to pull. Project matches blueprint HEAD.')
      // NON-VACUITY: with a working `comm`, OLD-FILE.md is exactly the
      // retirement candidate this fixture built — an unedited copy of a path
      // the blueprint stopped shipping. `comm` failing means the candidate is
      // never even enumerated (its process substitution feeds an empty loop,
      // silently — bash does not fail the surrounding `while` on it), so the
      // file survives, untouched, on both sides.
      expect(await readFile(join(proj, 'OLD-FILE.md'), 'utf8')).toBe('todo: retire me\n')
    })
  })

  it('cmp absent (127) — every substitutable managed file misreads as binary, refusing the whole pull', async () => {
    await scenario('blueprint-port-f4-retire-no-cmp', async (s) => {
      const { proj } = await seedRetirementFixture(s, 'no-cmp')
      const path = await s.pathWithout(['cmp'])
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      // `cmp` is not only `_bp_retire`'s own call (:1500) — scripts/lib/
      // placeholders.sh:189's `bp_contains_nul` ALSO shells out to it
      // (`tr -d '\0' < "$1" | cmp -s - "$1"`), and BOTH CLIs bridge to that
      // SAME shell library rather than reimplementing it (plan §4: libraries
      // stay shell), so this is a SHARED side effect, not a porting
      // divergence. NON-VACUITY, and the reason this row's title changed
      // from the retirement-only story it started with: with `cmp` missing,
      // `bp_contains_nul` misreports EVERY substitutable file as binary
      // (`!` negates cmp's own 127 into a false "differs"), so CLAUDE.md and
      // docs/DoD.md — both substitutable, and otherwise perfectly in sync —
      // ALSO show up "drifted" with an empty prospective result. That drift
      // reaches the interactive prompt BEFORE retirement's own turn ever
      // comes (retirement runs only when nothing aborted the main loop), so
      // with no TTY the whole pull refuses (exit 7) and `_bp_retire` never
      // executes at all — OLD-FILE.md is neither retired NOR reclassified,
      // simply never reached, on either CLI.
      const stripScratch = (t: string) => t.replace(/blueprint-sync\.[A-Za-z0-9]+/g, 'blueprint-sync.<tmp>')
      const strip = (t: string) => stripScratch(normalizeDiffHeaders(stripLinePrefix(t)))
      expect(strip(newResult.stderr)).toBe(strip(oldResult.stderr))
      expect(strip(newResult.stdout)).toBe(strip(oldResult.stdout))
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(7)
      expect(oldResult.stderr).toContain('cmp: command not found')
      expect(oldResult.stdout).toContain('not interactive')
      expect(oldResult.stdout).not.toContain('yours now')
      expect(oldResult.stdout).not.toContain('OLD-FILE.md')
      expect(await readFile(join(proj, 'OLD-FILE.md'), 'utf8')).toBe('todo: retire me\n')
    })
  })

  /** One drifted managed file (CLAUDE.md), docs/DoD.md in sync — the shape
   * `cmd_pull`'s main loop needs to reach the PREVIEW step at all. */
  async function seedSingleDriftFixture(s: Scenario, tag: string): Promise<string> {
    const bp = await s.workspace.dir(`${tag}-bp`)
    const sha = await seedBlueprintRepo(s, bp)
    const proj = await s.workspace.dir(`${tag}-proj`)
    await seedRegisteredProject(s, proj, bp, sha)
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nan older, edited copy\n', 'utf8')
    await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
    await commitAll(s, proj, 'partial sync')
    return proj
  }

  it('diff absent (127) — pull\'s preview, no TTY to prompt (refused, exit 7)', async () => {
    await scenario('blueprint-port-f4-pull-no-diff', async (s) => {
      const proj = await seedSingleDriftFixture(s, 'no-diff')
      const path = await s.pathWithout(['diff'])
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      const strip = (t: string) => normalizeDiffHeaders(stripLinePrefix(t))
      expect(strip(newResult.stderr)).toBe(strip(oldResult.stderr))
      expect(strip(newResult.stdout)).toBe(strip(oldResult.stdout))
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(7)
      expect(oldResult.stderr).toContain('diff: command not found')
      expect(oldResult.stdout).toContain('not interactive')
    })
  })

  it('diff present but not executable (126) — same shape, Permission denied', async () => {
    await scenario('blueprint-port-f4-pull-diff-noexec', async (s) => {
      const proj = await seedSingleDriftFixture(s, 'diff-noexec')
      const noExecDir = await s.workspace.dir('diff-noexec-bin')
      const diffPath = join(noExecDir, 'diff')
      await writeFile(diffPath, '#!/bin/sh\necho fake\n', 'utf8')
      await chmod(diffPath, 0o644)
      const path = `${noExecDir}:${await s.pathWithout(['diff'])}`
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      // TWO named normalisations here, not one: the usual "line N: " prefix
      // (plan §6.5), plus the tool's own NAME vs the full RESOLVED PATH bash
      // reports for a found-but-non-executable file (measured directly —
      // bash: "<script>: line N: /abs/path/to/diff: Permission denied";
      // Node's spawn EACCES handler, run()'s own code, only ever has argv0,
      // "diff", to name). An accepted, per-row divergence, same shape as the
      // a2bp "finding 3" row's stripLinePrefix — not something run() can fix
      // without duplicating bash's own PATH resolution.
      const strip = (t: string) => stripLinePrefix(t).replace(/\/\S*\/diff\b/g, 'diff')
      expect(strip(newResult.stderr)).toBe(strip(oldResult.stderr))
      expect(normalizeDiffHeaders(newResult.stdout)).toBe(normalizeDiffHeaders(oldResult.stdout))
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(7)
      expect(oldResult.stderr).toContain('Permission denied')
      expect(newResult.stderr).toContain('Permission denied')
    })
  })

  it('jq entirely missing — the guarded refusal (BUG-127-shaped), not a raw crash', async () => {
    await scenario('blueprint-port-f4-pull-no-jq', async (s) => {
      const settingsJson = (allow: string[]) =>
        `${JSON.stringify({ permissions: { allow, ask: [], deny: [] } }, null, 2)}\n`

      const bp = await s.workspace.dir('no-jq-bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await mkdir(join(bp, '.claude'), { recursive: true })
      await writeFile(join(bp, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir('no-jq-proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await mkdir(join(proj, '.claude'), { recursive: true })
      await writeFile(join(proj, '.claude/settings.json'), settingsJson([]), 'utf8')
      await commitAll(s, proj, 'has settings')

      const path = await s.pathWithout(['jq'])
      const oldResult = await runOld(s, proj, ['pull', '.claude/settings.json'], { PATH: path })
      const newResult = await runNew(s, proj, ['pull', '.claude/settings.json'], { PATH: path })
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain('jq is not on PATH')
      // Refused, not crashed: nothing written, the project's settings.json
      // is untouched.
      const settingsAfter = await readFile(join(proj, '.claude/settings.json'), 'utf8')
      expect(settingsAfter).toBe(settingsJson([]))
    })
  })
})

/**
 * blueprint-port differential — settings-layer refusals (plan §5's "the
 * settings-layer refusals" row group, Codex re-review finding 7).
 *
 * `bpSettingsLayer`/`_bp_settings_layer` is reached identically from `drift`
 * and `pull` — both call `bpProspectiveFor('.claude/settings.json', …)`, which
 * calls it before ever touching `bpProspectivePull` — so each SHAPE is proven
 * once here (via `pull --yes`, the cheapest call that still exercises the
 * whole chain and never writes on a refusal, so OLD then NEW share one
 * project directory like the pull describe's own refused/non-mutating rows).
 * One extra row (the array-layer shape) is run through `drift` too, to prove
 * the SAME refusal reaches drift's own report shape (exit 4 vs pull's, the
 * "Cannot sync" bucket) identically — not every shape twice, since the code
 * path the two subcommands share is exactly what is under test, not two
 * independent implementations of it.
 *
 * Shapes mirror tests/permission-policy's own #12/#12b/#13/#14/#14b/#15,
 * which pin these against the shell CLI alone; ported here as true OLD-vs-NEW
 * differential rows.
 */
describe('blueprint-port differential — settings-layer refusals', () => {
  const settingsJson = (allow: string[]) =>
    `${JSON.stringify({ permissions: { allow, ask: [], deny: [] } }, null, 2)}\n`

  /** A registered project whose `.claude/settings.json` and/or
   * `.claude/settings.project.json` (the layer) are written VERBATIM —
   * `body`/`layerBody` are raw bytes, never JSON.stringify'd, so a shape
   * that is not even one JSON object (a stream, an array, a scalar) can be
   * placed exactly as the permission-policy suite does. */
  async function seedShapeProject(
    s: Scenario,
    dir: string,
    bp: string,
    sha: string,
    opts: { settingsBody?: string | undefined; layerBody?: string | undefined },
  ): Promise<void> {
    await seedRegisteredProject(s, dir, bp, sha)
    await mkdir(join(dir, 'docs'), { recursive: true })
    await copyFile(join(bp, 'CLAUDE.md'), join(dir, 'CLAUDE.md'))
    await copyFile(join(bp, 'docs/DoD.md'), join(dir, 'docs/DoD.md'))
    await mkdir(join(dir, '.claude'), { recursive: true })
    if (opts.settingsBody !== undefined) {
      await writeFile(join(dir, '.claude/settings.json'), opts.settingsBody, 'utf8')
    }
    if (opts.layerBody !== undefined) {
      await writeFile(join(dir, '.claude/settings.project.json'), opts.layerBody, 'utf8')
    }
    await commitAll(s, dir, 'settings fixture')
  }

  const rows: Array<{ name: string; settingsBody?: string; layerBody?: string }> = [
    // The project's OWN settings.json has no layer file to hold its rules —
    // each of these is a SHAPE the "not a single JSON object" / "wrong
    // shape" checks must catch without ever calling it invalid JSON.
    { name: 'settings.json is a two-object JSON stream {}{}', settingsBody: `{}\n{"permissions":{"allow":["x"]}}\n` },
    { name: 'settings.json is a JSON array', settingsBody: '[]\n' },
    { name: 'settings.json is null', settingsBody: 'null\n' },
    { name: 'settings.json is a number', settingsBody: '42\n' },
    // The layer file (.claude/settings.project.json, BP_SETTINGS_LAYER)
    // carries the same shape family, on the OTHER branch of bpSettingsLayer.
    {
      name: 'the layer (.claude/settings.project.json) is a two-object stream',
      settingsBody: settingsJson([]),
      layerBody: `{}\n{"permissions":{"allow":["x"]}}\n`,
    },
    {
      name: 'the layer is a JSON array',
      settingsBody: settingsJson([]),
      layerBody: '[]\n',
    },
    {
      name: 'the layer is null',
      settingsBody: settingsJson([]),
      layerBody: 'null\n',
    },
    // A merge-unsupported shape: a single JSON object, valid shape at the
    // top level, but carrying a key the layer schema does not allow.
    {
      name: 'the layer is one object but holds an unsupported key (hooks)',
      settingsBody: settingsJson([]),
      layerBody: `${JSON.stringify({ hooks: { PreToolUse: [] } }, null, 2)}\n`,
    },
    // No layer at all: the project's settings.json itself carries an
    // unsupported top-level key, with no permission rules of its own to
    // report alongside it — the "unsupported-only" branch of the detail text.
    {
      name: 'settings.json (no layer) carries an unsupported key (otherList)',
      settingsBody: `${JSON.stringify({ permissions: { allow: [], otherList: ['x'] } }, null, 2)}\n`,
    },
  ]

  for (const row of rows) {
    it(`pull refuses — ${row.name}`, async () => {
      await scenario(`blueprint-port-settings-shape-${row.name.replace(/[^a-z0-9]+/gi, '-')}`, async (s) => {
        const bp = await s.workspace.dir('bp')
        await mkdir(join(bp, 'docs'), { recursive: true })
        await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
        await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
        await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
        await mkdir(join(bp, '.claude'), { recursive: true })
        await writeFile(join(bp, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
        await initRepo(s, bp)
        await commitAll(s, bp, 'base')
        const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

        const proj = await s.workspace.dir('proj')
        await seedShapeProject(s, proj, bp, sha, { settingsBody: row.settingsBody, layerBody: row.layerBody })

        // Refusal writes nothing, so OLD then NEW share the same directory
        // (same idiom as the pull-refused / drift-refused rows above).
        const oldResult = await runOld(s, proj, ['pull', '.claude/settings.json', '--yes'])
        const newResult = await runNew(s, proj, ['pull', '.claude/settings.json', '--yes'])
        expectPullIdentical(oldResult, newResult)
        expect(oldResult.code, oldResult.output).toBe(4)
        expect(oldResult.stdout, oldResult.output).not.toMatch(/not valid JSON/i)
        if (row.settingsBody !== undefined) {
          const after = await readFile(join(proj, '.claude/settings.json'), 'utf8')
          expect(after, 'a refusal must never overwrite the project file').toBe(row.settingsBody)
        }
      })
    })
  }

  it('drift also refuses the same shape (the array-layer row), in its own report bucket', async () => {
    await scenario('blueprint-port-settings-shape-drift', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await mkdir(join(bp, '.claude'), { recursive: true })
      await writeFile(join(bp, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir('proj')
      await seedShapeProject(s, proj, bp, sha, { settingsBody: settingsJson([]), layerBody: '[]\n' })
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const oldResult = await runOld(s, proj, ['drift'], env)
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newResult = await runNew(s, proj, ['drift'], env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 1')
    })
  })
})

/**
 * blueprint-port differential — staleness states under the BLUEPRINT_ROOT
 * override (plan §5's "staleness current/behind/ahead/diverged/unknown" row
 * group, Codex re-review finding 7). `reportStaleness`/`bp_staleness_assess`
 * is reached only from drift's own BLUEPRINT_ROOT-override branch (the
 * describe comment above "drift's fast-forward prompt" says so), and that
 * describe already proves "behind" (both the y and N answers to the
 * fast-forward prompt). These four rows are the REMAINING statuses
 * `bp_staleness_assess` can report, none of which ever reach a prompt, so
 * BP_NO_PROMPT is irrelevant to all four and included only for parity with
 * every other override row in this file.
 */
describe('blueprint-port differential — staleness states', () => {
  async function seedUpstream(s: Scenario, tag: string): Promise<{ up: string; sha: string }> {
    const up = await s.workspace.dir(`${tag}-up`)
    await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await initRepo(s, up)
    await commitAll(s, up, 'base')
    const sha = (await git(s, up, ['rev-parse', 'HEAD'])).stdout.trim()
    return { up, sha }
  }

  async function cloneBp(s: Scenario, tag: string, up: string): Promise<string> {
    const bp = s.workspace.path(`${tag}-bp`)
    await git(s, s.workspace.root, ['clone', '-q', up, bp])
    await git(s, bp, ['config', 'user.email', 't@local'])
    await git(s, bp, ['config', 'user.name', 't'])
    return bp
  }

  async function seedOverrideProject(s: Scenario, dir: string, bootstrapSha: string): Promise<void> {
    await cp(join(REPO_ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true })
    await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
    await mkdir(join(dir, '.githooks'), { recursive: true })
    await writeFile(join(dir, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
    await s.run('chmod', ['+x', join(dir, '.githooks/pre-push')], { cwd: dir })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await writeFile(
      join(dir, '.blueprint-source'),
      `bootstrap_sha    = ${bootstrapSha}\nbootstrap_date   = 2026-01-01\n`,
      'utf8',
    )
    await initRepo(s, dir)
    await commitAll(s, dir, 'init')
  }

  async function driftUnderOverride(
    s: Scenario,
    bp: string,
    proj: string,
  ): Promise<{ oldResult: RunResult; newResult: RunResult }> {
    const env = { ...(await dateShimEnv(s)), BLUEPRINT_ROOT: bp, BP_NO_PROMPT: '1' }
    const oldResult = await runOld(s, proj, ['drift'], env)
    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
    const newResult = await runNew(s, proj, ['drift'], env)
    return { oldResult, newResult }
  }

  it('current — the local checkout is level with origin/main', async () => {
    await scenario('blueprint-port-staleness-current', async (s) => {
      const { up, sha } = await seedUpstream(s, 'current')
      const bp = await cloneBp(s, 'current', up)
      const proj = await s.workspace.dir('current-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('local checkout is level with origin/main')
    })
  })

  it('ahead — the local checkout has an unpushed commit', async () => {
    await scenario('blueprint-port-staleness-ahead', async (s) => {
      const { up, sha } = await seedUpstream(s, 'ahead')
      const bp = await cloneBp(s, 'ahead', up)
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nlocal-only\n', 'utf8')
      await commitAll(s, bp, 'local ahead commit')
      const proj = await s.workspace.dir('ahead-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('local checkout is ahead of origin/main (unpushed commits)')
    })
  })

  it('diverged — the local checkout and the remote each moved on their own', async () => {
    await scenario('blueprint-port-staleness-diverged', async (s) => {
      const { up, sha } = await seedUpstream(s, 'diverged')
      const bp = await cloneBp(s, 'diverged', up)
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nlocal-only\n', 'utf8')
      await commitAll(s, bp, 'local commit')
      await mkdir(join(up, 'docs'), { recursive: true })
      await writeFile(join(up, 'docs/DoD.md'), '# DoD\nremote-only\n', 'utf8')
      await commitAll(s, up, 'remote commit')
      // bp_staleness_assess can only tell "diverged" from the ordinary,
      // not-yet-fetched shape of "behind" when the remote's commit object is
      // ALREADY present locally (staleness.sh:112-118, `have_remote`) — the
      // exact fixture shape tests/staleness #5 uses.
      await git(s, bp, ['fetch', '-q', 'origin', 'main'])
      const proj = await s.workspace.dir('diverged-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('local checkout has DIVERGED from origin/main')
      expect(oldResult.stdout).toContain('resolve by hand')
    })
  })

  it('unknown — origin is unreachable', async () => {
    await scenario('blueprint-port-staleness-unknown', async (s) => {
      const { up, sha } = await seedUpstream(s, 'unknown')
      const bp = await cloneBp(s, 'unknown', up)
      await git(s, bp, ['remote', 'set-url', 'origin', s.workspace.path('unknown-does-not-exist')])
      const proj = await s.workspace.dir('unknown-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('? staleness unknown (unreachable)')
    })
  })
})

/**
 * blueprint-port differential — fetch failures (plan §5's "unreachable;
 * hung; missing branch; ... no `timeout`; scratch uncreatable; damaged
 * cache" row groups, Codex re-review finding 7). `bpFetchBlueprint` is pure
 * TypeScript with no shell bridge for the fetch itself (only `bpConfigLoad`
 * bridges), so — unlike settings-layer/staleness above — nothing here is
 * "proven once, shared by drift and pull": each row is its own independent
 * reimplementation risk, tested here via `drift` (plan §5's "at minimum"),
 * on a REGISTERED (address-mode) project — `bpFetchBlueprint` is reached only
 * on that path, never under BLUEPRINT_ROOT (the describe above).
 *
 * Every row is read-only (nothing is ever written on any of these exits), so
 * OLD then NEW run on the SAME registered-project fixture, like the other
 * non-mutating rows in this file. `HOME`/`XDG_CACHE_HOME` are scoped per
 * scenario workspace already (the harness's own env scrub), so OLD and NEW
 * never share a blueprint-sync cache across the two runs.
 *
 * The damaged-cache row below reuses sync-by-address #27a's technique: a
 * WARM cache first (a successful drift, which already exercises this exact
 * fetch machinery end-to-end), then a leftover per-run ref pinned at the
 * tip PLUS the tip's root tree made loose and deleted — a refresh only
 * re-verifies objects no ref already covers, so without the leftover ref
 * git notices the gap on its own and heals the cache instead of reporting
 * it damaged (observed while writing sync-by-address #27a).
 */
describe('blueprint-port differential — fetch failures', () => {
  async function seedFetchBlueprint(s: Scenario, dir: string): Promise<string> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
    await initRepo(s, dir)
    await commitAll(s, dir, 'base')
    return (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
  }

  async function runBoth(
    s: Scenario,
    proj: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<{ oldResult: RunResult; newResult: RunResult }> {
    const oldResult = await runOld(s, proj, args, env)
    // Same reset `driftBoth` uses above: arm_gate's own git config writes
    // (core.hooksPath, core.sshCommand) into the SHARED project directory,
    // and a second run would otherwise see them already armed and print a
    // different status line — a divergence the run ORDER causes, not drift.
    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
    const newResult = await runNew(s, proj, args, env)
    return { oldResult, newResult }
  }

  it('an unreachable remote exits 5, without ever calling it damaged', async () => {
    await scenario('blueprint-port-fetch-unreachable', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ${s.workspace.path('no-such-remote')}\nblueprint_branch = main\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain('could not read the blueprint')
      expect(oldResult.stderr).toContain('NOT a clean drift report')
      expect(oldResult.stderr).not.toContain('is damaged')
    })
  })

  it("a reachable remote WITHOUT the branch exits 5, naming the branch — not a connection failure", async () => {
    await scenario('blueprint-port-fetch-missing-branch', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ${bp}\nblueprint_branch = nope\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain("no branch 'nope' on that remote")
      expect(oldResult.stderr).not.toMatch(/could not connect|unable to connect/i)
    })
  })

  it("no 'timeout' or 'gtimeout' on PATH: exits 5 before any fetch, no cache created", async () => {
    await scenario('blueprint-port-fetch-no-timeout', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const path = await s.pathWithout(['timeout', 'gtimeout'])
      const cacheRoot = join(s.workspace.path('cache-home'), 'struct2flow')
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {
        PATH: path,
        XDG_CACHE_HOME: s.workspace.path('cache-home'),
      })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain("no 'timeout' or 'gtimeout'")
      expect(existsSync(cacheRoot)).toBe(false)
    })
  })

  it('a HUNG remote is cut off at BP_FETCH_TIMEOUT and exits 5, naming the timeout', async () => {
    await scenario('blueprint-port-fetch-hung', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ssh://git@127.0.0.1/blackhole.git\nblueprint_branch = main\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      // An ssh shim that accepts the connection and never answers — the fetch
      // it is wrapped in is what `timeout` cuts off, not ssh itself refusing.
      const oldShims = await s.shimDir('old-hung')
      await oldShims.add('ssh', 'sleep 999\n')
      const newShims = await s.shimDir('new-hung')
      await newShims.add('ssh', 'sleep 999\n')
      const began = Date.now()
      const oldResult = await runOld(s, proj, ['drift'], { PATH: oldShims.path(), BP_FETCH_TIMEOUT: '2' })
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newResult = await runNew(s, proj, ['drift'], { PATH: newShims.path(), BP_FETCH_TIMEOUT: '2' })
      const elapsed = Date.now() - began
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain('timed out after 2s')
      expect(elapsed, `a hung remote held both runs for ${elapsed}ms`).toBeLessThan(20_000)
    })
  })

  it('a scratch directory that cannot be created exits 5, with no cache and no project write', async () => {
    await scenario('blueprint-port-fetch-no-scratch', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // A regular file as TMPDIR: `mktemp -d` under it cannot succeed, and
      // unlike a chmod'd directory this holds even when the suite runs as root.
      await writeFile(s.workspace.path('not-a-directory'), 'x\n', 'utf8')
      const cacheRoot = join(s.workspace.path('cache-home'), 'struct2flow')
      const before = await readFile(join(proj, '.blueprint-source'), 'utf8')
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {
        TMPDIR: s.workspace.path('not-a-directory'),
        XDG_CACHE_HOME: s.workspace.path('cache-home'),
      })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain('could not create a scratch directory')
      expect(existsSync(cacheRoot)).toBe(false)
      expect(await readFile(join(proj, '.blueprint-source'), 'utf8')).toBe(before)
    })
  })

  it('a damaged cache exits 5, naming the cache and how to remove it', async () => {
    await scenario('blueprint-port-fetch-damaged-cache', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const cacheHome = s.workspace.path('cache-home')

      // Warm the cache with a successful drift, then damage it exactly as
      // sync-by-address #27a does, then drift again through the SAME cache.
      async function warmThenDamage(runDrift: (env: Record<string, string>) => Promise<RunResult>): Promise<RunResult> {
        const env = { XDG_CACHE_HOME: cacheHome }
        const warm = await runDrift(env)
        expect(warm.code, warm.output).toBe(0)

        const cacheParent = join(cacheHome, 'struct2flow')
        const cacheNames = (await readdir(cacheParent).catch(() => [] as string[])).filter(
          (n) => n.startsWith('blueprint-') && n.endsWith('.git'),
        )
        expect(cacheNames, 'expected exactly one blueprint cache').toHaveLength(1)
        const cache = join(cacheParent, cacheNames[0]!)

        // A leftover per-run ref at the tip is the condition, not decoration:
        // with it present the next refresh trusts the tip and skips
        // connectivity-checking objects it already "has"; without it git
        // would notice the gap on its own and refetch, healing the cache.
        await s.run('git', ['--git-dir', cache, 'update-ref', 'refs/bp-run/blueprint-sync.0', sha], {
          cwd: s.workspace.root,
        })

        // Every packed object loose, so a single deletion can target the
        // tip's root tree specifically.
        const packDir = join(cache, 'objects/pack')
        for (const name of await readdir(packDir).catch(() => [] as string[])) {
          if (!name.endsWith('.pack')) continue
          const moved = s.workspace.path(`loose-${name}`)
          await rename(join(packDir, name), moved)
          const unpack = await s.run(
            'sh',
            ['-c', 'git --git-dir="$1" unpack-objects -q < "$2"', 'sh', cache, moved],
            { cwd: s.workspace.root },
          )
          expect(unpack.code, unpack.output).toBe(0)
        }
        for (const name of await readdir(packDir).catch(() => [] as string[])) {
          if (name.endsWith('.idx') || name.endsWith('.rev')) await rm(join(packDir, name), { force: true })
        }

        const treeR = await s.run('git', ['--git-dir', cache, 'rev-parse', `${sha}^{tree}`], {
          cwd: s.workspace.root,
        })
        expect(treeR.code, treeR.output).toBe(0)
        const tree = treeR.stdout.trim()
        const object = join(cache, 'objects', tree.slice(0, 2), tree.slice(2))
        expect(existsSync(object), 'the tree object is not loose, so deleting it proves nothing').toBe(true)
        await rm(object)

        return runDrift(env)
      }

      const oldResult = await warmThenDamage((env) => runOld(s, proj, ['drift'], env))
      // Same reset `runBoth` uses above, plus resetting the cache directory
      // itself so the NEW side gets its own independent warm-then-damage
      // cycle through the identical cache PATH (same XDG_CACHE_HOME, same
      // remote address), which is what lets a plain expectIdentical compare
      // the two sides byte-for-byte despite the cache path being embedded in
      // the error message.
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      await rm(cacheHome, { recursive: true, force: true })
      const newResult = await warmThenDamage((env) => runNew(s, proj, ['drift'], env))

      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain(`cache ${join(cacheHome, 'struct2flow')}`)
      expect(oldResult.stderr).toContain('is damaged')
      expect(oldResult.stderr).toContain('remove it (rm -rf')
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
