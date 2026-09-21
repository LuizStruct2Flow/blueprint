/**
 * tests/shell-inventory/shell-inventory.spec.ts —
 * scripts/shell-inventory-check.mts (TASK-067 §5).
 *
 * Parallelism class: mockable. Every case owns a fresh fixture git repository;
 * the checker under test is invoked as a real child process against that
 * fixture's root, never against this repo's own tree.
 *
 * WHAT THE CHECKER DOES (see its own header for the full account): given
 * `scripts/shell-inventory.json` (an `exempt` list and a `legacy` map of path
 * -> git blob sha) and the current shell-file list on stdin, it refuses a
 * shell file in neither list (a new one), a `legacy` file whose recorded blob
 * no longer matches the tree unless the new content is the EXACT two-line shim,
 * and a `legacy` row whose file no longer exists. `exempt` files are unchecked.
 *
 * EACH CASE BUILDS ITS OWN REAL GIT REPO rather than faking blob shas, because
 * the one thing worth proving is that the checker reads the tree the way git
 * itself does (`git ls-files -s`) — a hand-picked fake sha would test the
 * checker against an oracle nothing else in this repo uses.
 *
 * THE CHECKER ITSELF IS NOT COPIED INTO THE FIXTURE. It is invoked from this
 * repo's own scripts/shell-inventory-check.mts against the fixture's root, so
 * these cases exercise the current code, not a snapshot of it.
 */
import { describe, it, expect } from 'vitest'
import { scenario, REPO_ROOT, type Scenario } from '../harness/index.js'

const CHECKER = `${REPO_ROOT}/scripts/shell-inventory-check.mts`

function inventoryJson(exempt: string[], legacy: Record<string, string>): string {
  return JSON.stringify({ exempt, legacy }, null, 2) + '\n'
}

/** Run the checker against `root`, feeding it `files` as sh_lint_files would. */
async function runChecker(s: Scenario, root: string, files: string[]) {
  const list = files.map((f) => `'${f}'`).join(' ')
  const script =
    files.length === 0
      ? `printf '' | "${process.execPath}" "${CHECKER}" "${root}"`
      : `printf '%s\\n' ${list} | "${process.execPath}" "${CHECKER}" "${root}"`
  return s.run('sh', ['-c', script], { cwd: root })
}

/** The recorded blob sha for `path` as `git ls-files -s` currently reports it. */
async function blobShaOf(repo: Awaited<ReturnType<Scenario['gitRepo']>>, path: string): Promise<string> {
  const r = await repo.git(['ls-files', '-s', '--', path])
  const sha = r.stdout.trim().split(/\s+/)[1]
  if (!sha) throw new Error(`git ls-files -s reported nothing for ${path}:\n${r.output}`)
  return sha
}

const SHIM = '#!/usr/bin/env bash\nexec node "$(dirname "$0")/foo.mts" "$@"\n'

describe('TASK-067 — the shell inventory gate', () => {
  it('#1 a new .sh in neither list is refused', async () => {
    await scenario('shell-inventory-1', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
      await s.fs.write('repo/scripts/new.sh', '#!/bin/sh\necho hi\n')
      await repo.commitAll('seed')

      const r = await runChecker(s, repo.dir, ['scripts/new.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/NEW:.*scripts\/new\.sh/)
    })
  })

  it('#2 a one-byte change to a legacy file is refused', async () => {
    await scenario('shell-inventory-2', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho one\n')
      await repo.commitAll('seed foo.sh')
      const sha = await blobShaOf(repo, 'scripts/foo.sh')
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson([], { 'scripts/foo.sh': sha }),
      )
      await repo.commitAll('seed inventory')

      // Sanity: unmodified, the same file passes.
      const clean = await runChecker(s, repo.dir, ['scripts/foo.sh'])
      expect(clean.code).toBe(0)

      // One byte differs ('one' -> 'two').
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho two\n')
      await repo.commitAll('one-byte change')
      const r = await runChecker(s, repo.dir, ['scripts/foo.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/CHANGED:.*scripts\/foo\.sh/)
    })
  })

  it('#3 the exact two-line shim is accepted', async () => {
    await scenario('shell-inventory-3', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho one\n')
      await repo.commitAll('seed foo.sh')
      const sha = await blobShaOf(repo, 'scripts/foo.sh')
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson([], { 'scripts/foo.sh': sha }),
      )
      await repo.commitAll('seed inventory')

      await s.fs.write('repo/scripts/foo.sh', SHIM)
      await repo.commitAll('migrate to shim')
      const r = await runChecker(s, repo.dir, ['scripts/foo.sh'])

      expect(r.code).toBe(0)
    })
  })

  it('#4 a shim with anything extra is refused', async () => {
    await scenario('shell-inventory-4', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho one\n')
      await repo.commitAll('seed foo.sh')
      const sha = await blobShaOf(repo, 'scripts/foo.sh')
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson([], { 'scripts/foo.sh': sha }),
      )
      await repo.commitAll('seed inventory')

      await s.fs.write('repo/scripts/foo.sh', `${SHIM}# one extra line\n`)
      await repo.commitAll('shim plus an extra line')
      const r = await runChecker(s, repo.dir, ['scripts/foo.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/CHANGED:.*scripts\/foo\.sh/)
    })
  })

  it('#5 an exempt file may change freely', async () => {
    await scenario('shell-inventory-5', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/exempt.sh', '#!/bin/sh\necho one\n')
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson(['scripts/exempt.sh'], {}),
      )
      await repo.commitAll('seed')

      await s.fs.write('repo/scripts/exempt.sh', '#!/bin/sh\necho something totally different\n')
      await repo.commitAll('exempt file changes')
      const r = await runChecker(s, repo.dir, ['scripts/exempt.sh'])

      expect(r.code).toBe(0)
    })
  })

  it('#6 a legacy row whose file is gone is refused', async () => {
    await scenario('shell-inventory-6', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/ghost.sh', '#!/bin/sh\necho boo\n')
      await repo.commitAll('seed ghost')
      const sha = await blobShaOf(repo, 'scripts/ghost.sh')
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson([], { 'scripts/ghost.sh': sha }),
      )
      await repo.commitAll('seed inventory')

      // Remove the file but leave its row — a migration that forgot to prune
      // the inventory, or a plain deletion nobody updated the row for.
      await s.fs.rm('repo/scripts/ghost.sh')
      await repo.commitAll('delete ghost.sh, forget the row')
      const r = await runChecker(s, repo.dir, [])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/GONE:.*scripts\/ghost\.sh/)
    })
  })
})
