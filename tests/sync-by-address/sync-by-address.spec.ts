/**
 * tests/sync-by-address/sync-by-address.spec.ts — TASK-025: `drift` and `pull`
 * read the blueprint by its ADDRESS.
 *
 * Parallelism class: serial-global. Every case owns a scenario workspace, its
 * own fixture remote, its own HOME and therefore its own blueprint cache.
 *
 * THE DEFECT. `drift` and `pull` read a LOCAL checkout: `$BLUEPRINT_ROOT`, else
 * `blueprint_source`, else the checkout the running CLI lives in. So a project
 * reported against whatever that folder held — a stale sibling, or unpushed
 * commits nobody else could see. On 2026-09-14 the blueprint checkout was ahead
 * of its remote and every derived project was reporting against the unpushed
 * commits; a `pull` at that moment would have recorded an unpushed SHA in
 * `bootstrap_sha` (PLAN-TASK-025 §0.2 #4).
 *
 * THE CLI UNDER TEST IS A COPY, placed in a workspace directory that is not a
 * blueprint. Not decoration: the CLI in REPO_ROOT lives inside a real blueprint
 * checkout, so any code path that falls back to "the checkout the CLI runs from"
 * — the parent commit, or a mutant restoring it — would compare against the
 * operator's real tree and probe its real `origin` over the network. A copy
 * keeps every run, red or green, inside the workspace. #13 places its copy
 * inside a FIXTURE checkout on purpose, because that fallback is its subject.
 *
 * REPRODUCER RECORD — observed on the reproducer commit, before the CLI change:
 *
 *   #1   rc=1 with NO message. `.blueprint-source` has no `blueprint_source`
 *        line, and `grep '^blueprint_source' | cut | xargs` under `pipefail`
 *        kills the CLI through `set -e` before it prints anything. A project
 *        that deletes the field today gets a silent exit 1 from drift and pull.
 *   #2   rc=128. It read the stale sibling (header `blueprint: …/sibling`),
 *        whose history lacks the project's bootstrap_sha, and `git log` failed.
 *   #3   rc=1, the same silent death as #1, where 5 is required.
 *   #13  rc=1, the same silent death as #1. The fallback this case exists for
 *        (the checkout the CLI runs from) is shown red by its mutant instead.
 *
 * Plan: docs/doing/PLAN-TASK-025.md §9.2.
 */

import { describe, it, expect } from 'vitest'
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type RunResult, type Scenario } from '../harness/index.js'

async function git(s: Scenario, cwd: string, args: string[]) {
  const r = await s.run('git', args, { cwd })
  expect(r.code, `git ${args.join(' ')} failed in ${cwd}:\n${r.output}`).toBe(0)
  return r.stdout.trim()
}

async function initRepo(s: Scenario, dir: string) {
  await git(s, dir, ['init', '-q', '-b', 'main', '.'])
  await git(s, dir, ['config', 'user.email', 't@local'])
  await git(s, dir, ['config', 'user.name', 't'])
  await git(s, dir, ['config', 'commit.gpgsign', 'false'])
}

async function commitAll(s: Scenario, dir: string, message: string) {
  await git(s, dir, ['add', '-A'])
  await git(s, dir, ['commit', '-q', '-m', message])
  return git(s, dir, ['rev-parse', 'HEAD'])
}

/**
 * Copy the CLI and its libs to `<at>/scripts/`. Returns the CLI's path. Run it
 * as `bash <path>` so the copy needs no exec bit.
 */
async function cliCopy(s: Scenario, at: string): Promise<string> {
  const dest = s.workspace.path(at, 'scripts')
  await cp(join(REPO_ROOT, 'scripts'), dest, { recursive: true })
  return join(dest, 'blueprint')
}

/**
 * A fixture blueprint that serves as the REMOTE. A plain working repository: git
 * fetches from a path as readily as from a bare one, and a working tree lets a
 * case advance it with an ordinary commit.
 *
 * `tests/fixture/test.sh` is mandatory: `tests/` is a managed directory whose
 * expansion is fail-closed (BUG-029).
 */
async function blueprintRemote(s: Scenario, dod = 'published') {
  const dir = await s.workspace.dir('remote')
  await s.fs.write(join(dir, 'CLAUDE.md'), '# CLAUDE\nfor {{PROJECT_NAME}}\n')
  await s.fs.write(join(dir, 'docs/DoD.md'), `# DoD\nowner {{PROJECT_NAME}}\n${dod}\n`)
  await s.fs.write(join(dir, 'tests/fixture/test.sh'), 'echo fixture\n')
  await initRepo(s, dir)
  const head = await commitAll(s, dir, 'base')
  return { dir, head }
}

/** Advance a fixture repository by rewriting its DoD. Returns the new HEAD. */
async function advance(s: Scenario, dir: string, dod: string) {
  await s.fs.write(join(dir, 'docs/DoD.md'), `# DoD\nowner {{PROJECT_NAME}}\n${dod}\n`)
  return commitAll(s, dir, dod)
}

/**
 * A derived project named `proj` (the basename IS {{PROJECT_NAME}}), whose DoD
 * carries `dod` already substituted. `extra` lines are appended to its config.
 */
async function project(
  s: Scenario,
  remote: string,
  sha: string,
  dod: string,
  extra: string[] = [],
) {
  const dir = await s.workspace.dir('p', 'proj')
  await s.fs.write(join(dir, 'CLAUDE.md'), '# CLAUDE\nfor proj\n')
  await s.fs.write(join(dir, 'docs/DoD.md'), `# DoD\nowner proj\n${dod}\n`)
  await s.fs.write(join(dir, 'tests/fixture/test.sh'), 'echo fixture\n')
  await s.fs.write(
    join(dir, '.blueprint-source'),
    [
      'config_version   = 2',
      `blueprint_remote = ${remote}`,
      'blueprint_branch = main',
      `bootstrap_sha    = ${sha}`,
      'bootstrap_date   = 2026-01-01',
      ...extra,
      '',
    ].join('\n'),
  )
  await initRepo(s, dir)
  await commitAll(s, dir, 'init')
  return dir
}

/** Run a CLI copy in the project. */
function run(s: Scenario, cli: string, proj: string, args: string[], env: Record<string, string> = {}) {
  return s.run('bash', [cli, ...args], { cwd: proj, env, timeoutMs: 60_000 })
}

/**
 * The report's per-file lines for one list. `!` (missing in the blueprint) is
 * what a mis-resolved blueprint produces, so the lists are never read as one.
 */
function marked(output: string, mark: '~' | '+' | '!'): string[] {
  return output
    .split('\n')
    .filter((l) => l.trimStart().startsWith(mark + ' '))
    .map((l) => l.trim().slice(2).trim())
}

/** The fixture files; the real MANAGED_FILES names ~70 others a fixture lacks. */
const FIXTURE_FILES = ['CLAUDE.md', 'docs/DoD.md', 'tests/fixture/test.sh']

function fixtureMarked(output: string, mark: '~' | '+' | '!'): string[] {
  return marked(output, mark).filter((p) => FIXTURE_FILES.includes(p))
}

/**
 * A failure must not LOOK like a report, on either stream: no clean mark, and no
 * per-file line a reader could take as the answer (PLAN §9.2 preamble).
 */
function expectNoReport(r: RunResult) {
  for (const [name, text] of [
    ['stdout', r.stdout],
    ['stderr', r.stderr],
  ] as const) {
    expect(text, `${name} carries the clean mark on a failed read`).not.toContain(
      '✓ All blueprint-managed files match',
    )
    for (const mark of ['~', '+', '!'] as const) {
      expect(marked(text, mark), `${name} carries '${mark}' report lines on a failed read`).toEqual([])
    }
  }
}

describe('TASK-025 — drift and pull read the blueprint by its address', () => {
  it('#1 drift reads the remote when NO local checkout exists, and says which commit it read', async () => {
    await scenario('sync-by-address-1', async (s) => {
      const remote = await blueprintRemote(s, 'published')
      // The project is behind on exactly one file, so "the report matches the
      // remote" is a claim about content and not merely an exit status.
      const proj = await project(s, remote.dir, remote.head, 'OLD')
      const cli = await cliCopy(s, 'cli')

      const r = await run(s, cli, proj, ['drift'])

      expect(r.code, r.output).toBe(0)
      expect(r.stdout, 'the header does not name the remote and its branch').toMatch(
        new RegExp(`blueprint:\\s+${escapeRe(remote.dir)}\\s+\\(main\\)`),
      )
      expect(r.stdout, 'the header does not name the full fetched SHA').toMatch(
        new RegExp(`fetched:\\s+${remote.head}\\s+at\\s+\\S+`),
      )
      expect(fixtureMarked(r.output, '!'), r.output).toEqual([])
      expect(fixtureMarked(r.output, '~'), r.output).toEqual(['docs/DoD.md'])
    })
  })

  it('#2 a stale sibling named by blueprint_source is NOT consulted', async () => {
    await scenario('sync-by-address-2', async (s) => {
      const remote = await blueprintRemote(s, 'v1')
      const sibling = s.workspace.path('sibling')
      await git(s, s.workspace.root, ['clone', '-q', remote.dir, sibling])
      // The remote moves on; the sibling does not. The project matches the tip.
      const tip = await advance(s, remote.dir, 'v2')
      const proj = await project(s, remote.dir, tip, 'v2', [`blueprint_source = ${sibling}`])
      const cli = await cliCopy(s, 'cli')

      const r = await run(s, cli, proj, ['drift'])

      expect(r.code, r.output).toBe(0)
      expect(
        fixtureMarked(r.output, '~'),
        'drift reported DoD drifted: it compared against the stale sibling, not the remote',
      ).toEqual([])
      expect(r.stdout).toMatch(new RegExp(`fetched:\\s+${tip}\\b`))
      expect(r.stdout, 'the header names the sibling').not.toContain(`blueprint:  ${sibling}`)
    })
  })

  it('#3 an unreachable remote exits 5, says so, and produces nothing that reads as a report', async () => {
    await scenario('sync-by-address-3', async (s) => {
      const proj = await project(s, s.workspace.path('no-such-remote'), 'no-sha', 'OLD')
      const cli = await cliCopy(s, 'cli')

      const r = await run(s, cli, proj, ['drift'])

      expect(r.code, r.output).toBe(5)
      expect(r.stderr, r.output).toContain('could not read the blueprint')
      expect(r.stderr, r.output).toContain('NOT a clean drift report')
      expectNoReport(r)
    })
  })

  it('#13 unpushed commits in the checkout the CLI runs from are not reported', async () => {
    await scenario('sync-by-address-13', async (s) => {
      const remote = await blueprintRemote(s, 'published')
      const local = s.workspace.path('bp-local')
      await git(s, s.workspace.root, ['clone', '-q', remote.dir, local])
      await git(s, local, ['config', 'user.email', 't@local'])
      await git(s, local, ['config', 'user.name', 't'])
      await git(s, local, ['config', 'commit.gpgsign', 'false'])
      const unpushed = await advance(s, local, 'UNPUSHED')
      // The CLI runs from INSIDE the checkout that holds the unpushed commit —
      // the per-machine wrapper's shape today, and the fallback's whole premise.
      const cli = await cliCopy(s, 'bp-local')
      const proj = await project(s, remote.dir, remote.head, 'published')

      const r = await run(s, cli, proj, ['drift'])

      expect(r.code, r.output).toBe(0)
      expect(
        fixtureMarked(r.output, '~'),
        'drift reported the UNPUSHED DoD as the blueprint — it read the working checkout',
      ).toEqual([])
      expect(r.stdout).toMatch(new RegExp(`fetched:\\s+${remote.head}\\b`))
      expect(r.output, 'the unpushed commit appears in the report').not.toContain(unpushed)
    })
  })
})

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
