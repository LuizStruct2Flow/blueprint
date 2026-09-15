/**
 * tests/managed-references/managed-references.spec.ts — BUG-114.
 *
 * Parallelism class: every case owns a scenario workspace. #1 and #2 READ the
 * real checkout's HEAD through `git archive` and never write to it.
 *
 * THE DEFECT. `blueprint pull` delivers MANAGED_FILES and nothing else. Three
 * scripts — `no-chain-guard.sh`, `session-resume.sh`, `wait-mic.sh` — are named
 * by managed files (`.claude/settings.json` runs `no-chain-guard.sh` as a
 * PreToolUse hook; the shipped harness and suites drive the other two) and were
 * never in the list.
 *
 * THE VICTIM IS NOT WHO PR #66 SAID. A fresh bootstrap receives all three,
 * because bootstrap is `git archive HEAD`, not MANAGED_FILES — Jesko's review
 * measured the three suites 39/39 on a fresh bootstrap BEFORE the fix. The
 * damage is to an EXISTING project updated by pull: its hook and suites advance
 * and the scripts they call never arrive. #2 is that project.
 *
 * WHY #1 DERIVES INSTEAD OF LISTING. A case naming three files catches those
 * three and nothing else; the next script a managed file starts calling reopens
 * the defect with this suite green. So the population is computed: every
 * `scripts/…` path named inside a shipped managed file, that is itself a shipped
 * file, must be managed. Jesko's independent sweep found exactly these three
 * before the fix and none after; #1 agreeing with it is the cross-check.
 *
 * BLUEPRINT-TIER (export-ignore). The question is whether THE BLUEPRINT's list
 * is complete. In a derived project a locally edited copy of a managed file may
 * legitimately name that project's own scripts, which would read as a false gap
 * and fail a gate that has nothing to fix.
 *
 * MUTATION RECORD (R6) — observed, not predicted.
 *   The reproducer commit's tree (the three entries absent): #1 red, naming
 *     exactly no-chain-guard.sh, session-resume.sh and wait-mic.sh; #2 red,
 *     the same three absent after `pull --yes` reported 37 files pulled.
 *   With the three entries: #1 #2 green.
 *
 * TASK-025 #3 (Alexey, c3-4 review #1) — observed on a copy of the tree with
 * its history (.scratch/c025/mutants9.py set9b):
 *   The CLI before the fix (copies only what it is named)   → #3: the project's
 *     own CLI exits 1, "scripts/lib/signals.sh is missing"
 *   No lib closure at all                                    → #3
 * NOT SEEN: deriving the closure from `lib/NAME.sh` paths only, dropping the
 * `for lib in a.sh b.sh` lists, leaves #3 green. Every lib this old project
 * needs updated is ALSO named by a path somewhere in the CLI's code, so the
 * list form has no independent witness here. Also unwitnessed: a lib the
 * operator DECLINES interactively, or a guard refuses, keeps the CLI from
 * being written. That path needs a terminal to answer the prompt.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const CLI = join(REPO_ROOT, 'scripts/blueprint')

/** A `scripts/…` path as it appears in prose, code or JSON. */
const SCRIPT_REF = /scripts\/[A-Za-z0-9_./-]*[A-Za-z0-9_]/g

async function initRepo(s: Scenario, dir: string) {
  await s.run('git', ['init', '-q', '-b', 'main', '.'], { cwd: dir })
  await s.run('git', ['config', 'user.email', 't@local'], { cwd: dir })
  await s.run('git', ['config', 'user.name', 't'], { cwd: dir })
  await s.run('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir })
  await s.run('git', ['add', '-A'], { cwd: dir })
  await s.run('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir })
}

/** What `git archive HEAD` ships out of the real checkout — what a bootstrap receives. */
async function shippedFiles(s: Scenario): Promise<Set<string>> {
  const r = await s.run(
    'bash',
    ['-c', 'git -C "$1" archive --format=tar HEAD | tar -t\n', 'archive', REPO_ROOT],
    { cwd: s.workspace.root },
  )
  const files = r.stdout.split('\n').filter((l) => l.length > 0 && !l.endsWith('/'))
  expect(files.length, `git archive of the real checkout listed nothing\n${r.output}`).toBeGreaterThan(0)
  return new Set(files)
}

/**
 * MANAGED_FILES as the CLI prints it — the CLI's own source of truth, rather
 * than a regex over a bash array, which would be a second parser of one fact.
 */
async function managedEntries(s: Scenario): Promise<string[]> {
  const r = await s.run(CLI, ['files'], { cwd: s.workspace.root })
  expect(r.code, r.output).toBe(0)
  const lines = r.stdout.split('\n')
  const start = lines.findIndex((l) => l.startsWith('Blueprint-managed files'))
  expect(start, r.output).toBeGreaterThanOrEqual(0)
  const end = lines.findIndex((l, i) => i > start && l.trim() === '')
  return lines.slice(start + 1, end).map((l) => l.trim())
}

interface References {
  /** Referenced shipped scripts that ARE managed. */
  satisfied: Set<string>
  /** Referenced shipped scripts that are NOT managed, with the files naming them. */
  gaps: Map<string, string[]>
}

async function scriptReferences(s: Scenario): Promise<References> {
  const shipped = await shippedFiles(s)
  const managed = new Set<string>()
  for (const entry of await managedEntries(s)) {
    if (entry.endsWith('/')) {
      for (const f of shipped) if (f.startsWith(entry)) managed.add(f)
    } else {
      managed.add(entry)
    }
  }

  const satisfied = new Set<string>()
  const gaps = new Map<string, string[]>()
  for (const file of managed) {
    if (!shipped.has(file)) continue
    const text = await readFile(join(REPO_ROOT, file), 'utf8')
    for (const ref of new Set(text.match(SCRIPT_REF) ?? [])) {
      if (!shipped.has(ref)) continue
      if (managed.has(ref)) satisfied.add(ref)
      else gaps.set(ref, [...(gaps.get(ref) ?? []), file])
    }
  }
  return { satisfied, gaps }
}

describe('BUG-114 — every script a managed file names reaches a project that pulls', () => {
  it('BUG-114 #1 every shipped script named by a shipped managed file is itself managed', async () => {
    await scenario('managed-references-1', async (s) => {
      const { satisfied, gaps } = await scriptReferences(s)

      // NON-VACUITY. A broken derivation finds no references at all and then
      // finds no gaps either; the population it checked has to be seen.
      expect(
        satisfied.size,
        'no managed script reference was found at all — the derivation is broken, not the list',
      ).toBeGreaterThan(0)

      const report = [...gaps].map(([ref, by]) => `${ref} (named by ${by.slice(0, 3).join(', ')})`)
      expect(
        report,
        'shipped scripts named by managed files but absent from MANAGED_FILES — pull never delivers them to an existing project',
      ).toEqual([])
    })
  })

  it('BUG-114 #2 an existing project that pulls receives every script its managed files name', async () => {
    await scenario('managed-references-2', async (s) => {
      // The fixture blueprint carries the DERIVED set, so a newly referenced
      // script is covered here without anyone editing this file.
      const { satisfied, gaps } = await scriptReferences(s)
      const referenced = [...new Set([...satisfied, ...gaps.keys()])].sort()

      const bp = await s.workspace.dir('bp')
      for (const f of referenced) await s.fs.copyIn(join(REPO_ROOT, f), join(bp, f))
      // tests/ is a managed directory and its expansion is fail-closed (BUG-029).
      await s.fs.write(join(bp, 'tests/fixture/test.sh'), 'echo fixture\n')
      await initRepo(s, bp)

      // An EXISTING project: registered, synced once, and missing the scripts.
      const proj = await s.workspace.dir('proj')
      const sha = (await s.run('git', ['rev-parse', 'HEAD'], { cwd: bp })).stdout.trim()
      await s.fs.write(
        join(proj, '.blueprint-source'),
        [
          'config_version   = 2',
          `blueprint_remote = ${bp}`,
          `bootstrap_sha    = ${sha}`,
          'bootstrap_date   = 2026-01-01',
          '',
        ].join('\n'),
      )
      await initRepo(s, proj)

      const r = await s.run(CLI, ['pull', '--yes'], { cwd: proj })
      expect(r.code, r.output).toBe(0)

      const absent: string[] = []
      for (const f of referenced) if (!(await s.fs.exists(join(proj, f)))) absent.push(f)
      expect(absent, r.output).toEqual([])
    })
  })
})

/**
 * TASK-025 — pulling ONLY scripts/blueprint must not strand a project.
 *
 * Alexey (Codex) review of 1cc78cf, finding 1. Commit 4 moved the signal
 * handler into scripts/lib/signals.sh, and commit 3 made request-config.sh emit
 * the read branch. `pull` copies exactly the paths it is given, so an existing
 * project that pulled `scripts/blueprint` alone got the new CLI beside its old
 * libs, and its own CLI then refused every drift and pull. MANAGED_FILES
 * membership proves a FULL pull delivers the libs, not that a partial one does.
 *
 * THE OLD PROJECT IS REAL, not reconstructed: scripts/ as it stood in the last
 * commit before drift read the blueprint by its address, which is where every
 * derived project was when TASK-025 began. It is read from history, and the
 * commit is DERIVED (the parent of the first commit that introduced
 * _bp_fetch_blueprint) rather than pinned, so a rebase cannot silently turn it
 * into a new project. CI's ts-tests checkout carries full history for this.
 */
describe('TASK-025 — a single-file pull of the CLI brings the libs it needs', () => {
  it('#3 an old project pulls only scripts/blueprint, then its own CLI runs drift against the remote', async () => {
    await scenario('managed-references-3', async (s) => {
      const first = await s.run(
        'git',
        ['-C', REPO_ROOT, 'log', '--reverse', '--format=%H', '-S', '_bp_fetch_blueprint', '--', 'scripts/blueprint'],
        { cwd: s.workspace.root },
      )
      const introduced = first.stdout.split('\n')[0] ?? ''
      expect(
        introduced,
        `no commit introduced _bp_fetch_blueprint — is this a shallow clone? (ts-tests needs fetch-depth: 0)\n${first.output}`,
      ).toMatch(/^[0-9a-f]{40}$/)

      // The remote: this tree's CLI and libs, as a project would fetch them.
      const bp = await s.workspace.dir('bp')
      for (const f of (await s.run('git', ['-C', REPO_ROOT, 'ls-files', 'scripts'], { cwd: s.workspace.root })).stdout
        .split('\n')
        .filter(Boolean)) {
        await s.fs.copyIn(join(REPO_ROOT, f), join(bp, f))
      }
      await s.fs.write(join(bp, 'docs/DoD.md'), '# DoD\nowner {{PROJECT_NAME}}\n')
      await s.fs.write(join(bp, 'tests/fixture/test.sh'), 'echo fixture\n')
      await initRepo(s, bp)
      const sha = (await s.run('git', ['rev-parse', 'HEAD'], { cwd: bp })).stdout.trim()

      // The old project: scripts/ from before TASK-025, and its own DoD edit.
      const proj = await s.workspace.dir('proj')
      const extracted = await s.run(
        'bash',
        ['-c', 'git -C "$1" archive --format=tar "$2^" scripts | tar -x -C "$3"\n', 'old', REPO_ROOT, introduced, proj],
        { cwd: s.workspace.root },
      )
      expect(extracted.code, extracted.output).toBe(0)
      expect(await s.fs.exists(join(proj, 'scripts/lib/signals.sh')), 'the old project already has signals.sh').toBe(false)
      await s.fs.write(join(proj, 'docs/DoD.md'), '# DoD\nowner proj\nedited here\n')
      await s.fs.write(
        join(proj, '.blueprint-source'),
        [
          'config_version   = 2',
          `blueprint_remote = ${bp}`,
          'blueprint_branch = main',
          `bootstrap_sha    = ${sha}`,
          'bootstrap_date   = 2026-01-01',
          '',
        ].join('\n'),
      )
      await initRepo(s, proj)

      // Only the CLI, through the address-reading CLI of this tree.
      const pulled = await s.run(CLI, ['pull', 'scripts/blueprint', '--yes'], { cwd: proj })
      expect(pulled.code, pulled.output).toBe(0)
      expect(await s.fs.read(join(proj, 'docs/DoD.md')), 'a partial pull of the CLI pulled an unrelated file').toBe(
        '# DoD\nowner proj\nedited here\n',
      )

      // Then the project's OWN CLI, with nothing fetched separately.
      const own = await s.run(join(proj, 'scripts/blueprint'), ['drift'], { cwd: proj })
      expect(own.code, `the project's own CLI refused after pulling scripts/blueprint:\n${pulled.output}\n---\n${own.output}`).toBe(0)
      expect(own.stdout).toContain(`fetched:    ${sha}`)
    })
  })
})
