/**
 * tests/shell-inventory/shell-inventory.spec.ts —
 * scripts/shell-inventory-check.mts (TASK-067 §5).
 *
 * Parallelism class: mockable. Every case owns a fresh fixture git repository;
 * the checker under test is invoked as a real child process against that
 * fixture's root, never against this repo's own tree.
 *
 * WHAT THE CHECKER DOES (see its own header for the full account): given a
 * BASE ref's scripts/shell-inventory.json (an `exempt` list and a `legacy`
 * map of path -> git blob sha, tamper-proof because the pushed range cannot
 * edit history before itself) and the current shell-file list on stdin, it
 * refuses a shell file in neither list, a `legacy` file whose blob no longer
 * matches BASE unless the new content is the exact two-line shim WITH A
 * TRACKED TARGET, a `legacy` row removed without its file becoming that shim
 * or disappearing, an `exempt` entry BASE did not have, and a `legacy` row
 * added or changed relative to BASE — the last two being the SELF-
 * AUTHORIZATION path: a commit editing both a file and its own row (Elias,
 * Codex, four-eyes review of 7a060d1/8b5a68b).
 *
 * EACH CASE BUILDS ITS OWN REAL GIT REPO rather than faking blob shas or a
 * base ref: a "seed" commit establishes BASE (an inventory + whatever files
 * it covers), then further commits are "the pushed range" the case is
 * actually testing, and the checker is invoked with the seed commit's sha as
 * argv[3] — exactly the shape ts_shell_inventory_base hands it in real use.
 *
 * THE CHECKER ITSELF IS NOT COPIED INTO THE FIXTURE. It is invoked from this
 * repo's own scripts/shell-inventory-check.mts against the fixture's root, so
 * these cases exercise the current code, not a snapshot of it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { scenario, REPO_ROOT, type Scenario } from '../harness/index.js'

const CHECKER = `${REPO_ROOT}/scripts/shell-inventory-check.mts`

// BUG-147/PLAN-BUG-147: the real, generated scripts/lib/dod-gate.sh IS the one
// valid instance of the sourced-adapter form the checker re-renders and
// byte-compares. Reading it here (rather than re-typing the fixed header
// text a second time) means a drift between the checker's own constant and
// the file it validates shows up as every positive case below going red,
// instead of two hand-maintained copies silently agreeing with each other.
const DOD_GATE_ADAPTER = readFileSync(`${REPO_ROOT}/scripts/lib/dod-gate.sh`, 'utf8')
const DOD_GATE_TARGET_STUB = 'console.log("dod-gate stub")\n'

function inventoryJson(exempt: string[], legacy: Record<string, string>): string {
  return JSON.stringify({ exempt, legacy }, null, 2) + '\n'
}

/** Run the checker against `root` at `base`, feeding it `files` as sh_lint_files would. */
async function runChecker(s: Scenario, root: string, base: string, files: string[]) {
  const list = files.map((f) => `'${f}'`).join(' ')
  const script =
    files.length === 0
      ? `printf '' | "${process.execPath}" "${CHECKER}" "${root}" "${base}"`
      : `printf '%s\\n' ${list} | "${process.execPath}" "${CHECKER}" "${root}" "${base}"`
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

/** Seeds scripts/foo.sh + scripts/foo.mts + a matching inventory, returns the BASE sha. */
async function seedFooWithTarget(repo: Awaited<ReturnType<Scenario['gitRepo']>>, s: Scenario): Promise<string> {
  await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho one\n')
  await s.fs.write('repo/scripts/foo.mts', 'console.log("one")\n')
  await repo.commitAll('seed foo.sh + foo.mts')
  const sha = await blobShaOf(repo, 'scripts/foo.sh')
  await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], { 'scripts/foo.sh': sha }))
  await repo.commitAll('seed inventory')
  return repo.head()
}

describe('TASK-067 — the shell inventory gate', () => {
  it('#1 a new .sh in neither list is refused', async () => {
    await scenario('shell-inventory-1', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
      await repo.commitAll('seed empty inventory')
      const base = await repo.head()

      await s.fs.write('repo/scripts/new.sh', '#!/bin/sh\necho hi\n')
      await repo.commitAll('add a new shell file')
      const r = await runChecker(s, repo.dir, base, ['scripts/new.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/NEW:.*scripts\/new\.sh/)
    })
  })

  it('#2 a one-byte change to a legacy file is refused', async () => {
    await scenario('shell-inventory-2', async (s) => {
      const repo = await s.gitRepo('repo')
      const base = await seedFooWithTarget(repo, s)

      // Sanity: unmodified, the same file passes against the same base.
      const clean = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])
      expect(clean.code).toBe(0)

      // One byte differs ('one' -> 'two'). The inventory itself is untouched.
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho two\n')
      await repo.commitAll('one-byte change')
      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/CHANGED:.*scripts\/foo\.sh/)
    })
  })

  it('#3 the exact, tracked two-line shim is accepted (row left in place)', async () => {
    await scenario('shell-inventory-3', async (s) => {
      const repo = await s.gitRepo('repo')
      const base = await seedFooWithTarget(repo, s)

      await s.fs.write('repo/scripts/foo.sh', SHIM)
      await repo.commitAll('migrate to shim, row left in the json')
      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

      expect(r.code).toBe(0)
    })
  })

  it('#4 a shim with anything extra is refused', async () => {
    await scenario('shell-inventory-4', async (s) => {
      const repo = await s.gitRepo('repo')
      const base = await seedFooWithTarget(repo, s)

      await s.fs.write('repo/scripts/foo.sh', `${SHIM}# one extra line\n`)
      await repo.commitAll('shim plus an extra line')
      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

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
      await repo.commitAll('seed, exempt from the start')
      const base = await repo.head()

      await s.fs.write('repo/scripts/exempt.sh', '#!/bin/sh\necho something totally different\n')
      await repo.commitAll('exempt file changes')
      const r = await runChecker(s, repo.dir, base, ['scripts/exempt.sh'])

      expect(r.code).toBe(0)
    })
  })

  it('#6 a legacy row whose file is gone (row untouched) is refused', async () => {
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
      const base = await repo.head()

      // Remove the file but leave its row untouched in the json.
      await s.fs.rm('repo/scripts/ghost.sh')
      await repo.commitAll('delete ghost.sh, forget the row')
      const r = await runChecker(s, repo.dir, base, [])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/GONE:.*scripts\/ghost\.sh/)
    })
  })

  it('#7 an exact shim whose target .mts is absent is refused', async () => {
    await scenario('shell-inventory-7', async (s) => {
      const repo = await s.gitRepo('repo')
      // Seed WITHOUT foo.mts this time.
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho one\n')
      await repo.commitAll('seed foo.sh, no target yet')
      const sha = await blobShaOf(repo, 'scripts/foo.sh')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], { 'scripts/foo.sh': sha }))
      await repo.commitAll('seed inventory')
      const base = await repo.head()

      await s.fs.write('repo/scripts/foo.sh', SHIM) // no scripts/foo.mts exists anywhere
      await repo.commitAll('shim with no target committed')
      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/CHANGED:.*scripts\/foo\.sh/)
    })
  })

  it('#8 a legacy file patched AND its own row updated in the same range is refused', async () => {
    await scenario('shell-inventory-8', async (s) => {
      const repo = await s.gitRepo('repo')
      const base = await seedFooWithTarget(repo, s)

      // Patch the file AND rewrite the inventory to match it — the exact
      // self-authorization path: judging HEAD against itself would pass this.
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho patched\n')
      await repo.commitAll('patch foo.sh')
      const patchedSha = await blobShaOf(repo, 'scripts/foo.sh')
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson([], { 'scripts/foo.sh': patchedSha }),
      )
      await repo.commitAll('update the row to match — self-authorization')

      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/ROW-CHANGED:.*scripts\/foo\.sh/)
    })
  })

  it('#9 a new .sh plus a fabricated new row for it is refused', async () => {
    await scenario('shell-inventory-9', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
      await repo.commitAll('seed empty inventory')
      const base = await repo.head()

      await s.fs.write('repo/scripts/sneaky.sh', '#!/bin/sh\necho sneaky\n')
      await repo.commitAll('add sneaky.sh')
      const sneakySha = await blobShaOf(repo, 'scripts/sneaky.sh')
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson([], { 'scripts/sneaky.sh': sneakySha }),
      )
      await repo.commitAll('add a matching row — self-authorization')

      const r = await runChecker(s, repo.dir, base, ['scripts/sneaky.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/ROW-ADDED:.*scripts\/sneaky\.sh/)
    })
  })

  it('#10 growing the exempt list in the pushed range is refused', async () => {
    await scenario('shell-inventory-10', async (s) => {
      const repo = await s.gitRepo('repo')
      await s.fs.write('repo/scripts/target.sh', '#!/bin/sh\necho one\n')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
      await repo.commitAll('seed, target.sh is unclassified (would be NEW)')
      const base = await repo.head()

      // Exempt it instead of migrating or classifying it — the exempt-side
      // version of the same self-authorization.
      await s.fs.write(
        'repo/scripts/shell-inventory.json',
        inventoryJson(['scripts/target.sh'], {}),
      )
      await repo.commitAll('grant target.sh an exemption nobody reviewed')

      const r = await runChecker(s, repo.dir, base, ['scripts/target.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/EXEMPT-GROWN:.*scripts\/target\.sh/)
    })
  })

  it('#11 a legacy row removed together with a valid shim is accepted', async () => {
    await scenario('shell-inventory-11', async (s) => {
      const repo = await s.gitRepo('repo')
      const base = await seedFooWithTarget(repo, s)

      await s.fs.write('repo/scripts/foo.sh', SHIM)
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {})) // row removed
      await repo.commitAll('migrate to shim AND remove its row')

      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

      expect(r.code).toBe(0)
    })
  })

  it('#13 BUG-145 the push AFTER a port: the ported shim, no row in BASE, is accepted', async () => {
    await scenario('shell-inventory-13', async (s) => {
      const repo = await s.gitRepo('repo')
      // BASE already has the port: foo.sh is the exact shim, foo.mts is
      // tracked, and the inventory names neither — the row was removed in the
      // port push. This is the state CI on main was in at 3cfa5e1.
      await s.fs.write('repo/scripts/foo.sh', SHIM)
      await s.fs.write('repo/scripts/foo.mts', 'console.log("one")\n')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
      await repo.commitAll('seed: the port has already landed')
      const base = await repo.head()

      // A later push touches something unrelated.
      await s.fs.write('repo/docs-note.md', 'an unrelated change\n')
      await repo.commitAll('unrelated change')

      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

      expect(r.code).toBe(0)
    })
  })

  it('#12 a legacy row removed WITHOUT its file migrating or disappearing is refused', async () => {
    await scenario('shell-inventory-12', async (s) => {
      const repo = await s.gitRepo('repo')
      const base = await seedFooWithTarget(repo, s)

      // Edit the file to something that is NOT the shim, and drop its row —
      // hiding an ordinary edit as if it were a migration.
      await s.fs.write('repo/scripts/foo.sh', '#!/bin/sh\necho not a shim\n')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
      await repo.commitAll('edit the file, drop its row, hope nobody checks')

      const r = await runChecker(s, repo.dir, base, ['scripts/foo.sh'])

      expect(r.code).not.toBe(0)
      expect(r.output).toMatch(/ROW-REMOVED-WITHOUT-MIGRATION:.*scripts\/foo\.sh/)
    })
  })

  describe('BUG-147 — the sourced-adapter form for scripts/lib/dod-gate.sh only', () => {
    it('#14 the exact, tracked sourced adapter is accepted (BUG-145 shape: no row in BASE)', async () => {
      await scenario('shell-inventory-14', async (s) => {
        const repo = await s.gitRepo('repo')
        // BASE already has the port: the adapter is the exact generated bytes,
        // its target is tracked, and the inventory names neither — the shape
        // a completed port leaves behind.
        await s.fs.write('repo/scripts/lib/dod-gate.sh', DOD_GATE_ADAPTER)
        await s.fs.write('repo/scripts/lib/dod-gate.mts', DOD_GATE_TARGET_STUB)
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
        await repo.commitAll('seed: the dod-gate port has already landed')
        const base = await repo.head()

        await s.fs.write('repo/docs-note.md', 'an unrelated change\n')
        await repo.commitAll('unrelated change')

        const r = await runChecker(s, repo.dir, base, ['scripts/lib/dod-gate.sh'])
        expect(r.code, r.output).toBe(0)
      })
    })

    it('#15 a legacy dod-gate.sh row removed together with the adapter, in the same push, is accepted', async () => {
      await scenario('shell-inventory-15', async (s) => {
        const repo = await s.gitRepo('repo')
        await s.fs.write('repo/scripts/lib/dod-gate.sh', '#!/bin/sh\necho legacy shell library\n')
        await repo.commitAll('seed legacy dod-gate.sh')
        const sha = await blobShaOf(repo, 'scripts/lib/dod-gate.sh')
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], { 'scripts/lib/dod-gate.sh': sha }))
        await repo.commitAll('seed inventory')
        const base = await repo.head()

        await s.fs.write('repo/scripts/lib/dod-gate.sh', DOD_GATE_ADAPTER)
        await s.fs.write('repo/scripts/lib/dod-gate.mts', DOD_GATE_TARGET_STUB)
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {})) // row removed
        await repo.commitAll('port dod-gate.sh to the sourced adapter, remove its row')

        const r = await runChecker(s, repo.dir, base, ['scripts/lib/dod-gate.sh'])
        expect(r.code, r.output).toBe(0)
      })
    })

    it('#16 an adapter with one extra NON-forwarding command is refused', async () => {
      await scenario('shell-inventory-16', async (s) => {
        const repo = await s.gitRepo('repo')
        await s.fs.write('repo/scripts/lib/dod-gate.sh', DOD_GATE_ADAPTER)
        await s.fs.write('repo/scripts/lib/dod-gate.mts', DOD_GATE_TARGET_STUB)
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
        await repo.commitAll('seed: the port has already landed')
        const base = await repo.head()

        // Not shaped like a `fn() { _dg_call sub "$1"; }` forwarding line, so
        // it can never come out of the renderer — the byte-equality check is
        // what catches this, whatever the added text says.
        await s.fs.write('repo/scripts/lib/dod-gate.sh', `${DOD_GATE_ADAPTER}echo pwned >&2\n`)
        await repo.commitAll('slip a non-forwarding command into the adapter')

        const r = await runChecker(s, repo.dir, base, ['scripts/lib/dod-gate.sh'])
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/NEW:.*scripts\/lib\/dod-gate\.sh/)
      })
    })

    it('#16b a SYNTACTICALLY valid extra forwarding pair is refused — pairs must match the canonical table', async () => {
      await scenario('shell-inventory-16b', async (s) => {
        // BUG-147 round 2 (Codex four-eyes finding): re-rendering from PARSED
        // PAIRS alone proves nothing — the renderer reproduces whatever shape
        // it is fed, so an appended pair re-renders itself right back and the
        // byte-equality check never sees a difference. The checker now also
        // requires the parsed pairs to equal DOD_GATE_CANONICAL_PAIRS exactly
        // (dod-gate.mts's own declared subcommand switch, transcribed once),
        // so an extra pair — even one shaped exactly like the generated ones —
        // is refused, whether it is a brand-new function name or a duplicate
        // of an existing one redefining it.
        const repo = await s.gitRepo('repo')
        await s.fs.write('repo/scripts/lib/dod-gate.sh', DOD_GATE_ADAPTER)
        await s.fs.write('repo/scripts/lib/dod-gate.mts', DOD_GATE_TARGET_STUB)
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
        await repo.commitAll('seed: the port has already landed')
        const base = await repo.head()

        await s.fs.write('repo/scripts/lib/dod-gate.sh', `${DOD_GATE_ADAPTER}dod_extra() { _dg_call extra "$1"; }\n`)
        await repo.commitAll('add a syntactically valid extra forwarding pair')

        const r = await runChecker(s, repo.dir, base, ['scripts/lib/dod-gate.sh'])
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/NEW:.*scripts\/lib\/dod-gate\.sh/)
      })
    })

    it('#16c redefining an existing bridge function (a duplicate function name) is refused', async () => {
      await scenario('shell-inventory-16c', async (s) => {
        // The exact Codex-found hole: appending
        // `dod_stage_bugtests() { _dg_call judgement; }` after the real
        // definition re-renders byte-identically under the old check (the
        // renderer just replays the pairs it parsed) and shell keeps only the
        // LAST definition, so the regression-test stage would silently run
        // `judgement` instead of `bugtests`. The canonical-pairs check refuses
        // it: the parsed pair list no longer equals DOD_GATE_CANONICAL_PAIRS.
        const repo = await s.gitRepo('repo')
        await s.fs.write('repo/scripts/lib/dod-gate.sh', DOD_GATE_ADAPTER)
        await s.fs.write('repo/scripts/lib/dod-gate.mts', DOD_GATE_TARGET_STUB)
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], {}))
        await repo.commitAll('seed: the port has already landed')
        const base = await repo.head()

        await s.fs.write(
          'repo/scripts/lib/dod-gate.sh',
          `${DOD_GATE_ADAPTER}dod_stage_bugtests() { _dg_call judgement; }\n`,
        )
        await repo.commitAll('redefine dod_stage_bugtests to forward to judgement instead')

        const r = await runChecker(s, repo.dir, base, ['scripts/lib/dod-gate.sh'])
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/NEW:.*scripts\/lib\/dod-gate\.sh/)
      })
    })

    it('#17 an adapter whose target .mts is absent is refused', async () => {
      await scenario('shell-inventory-17', async (s) => {
        const repo = await s.gitRepo('repo')
        // Seed WITHOUT dod-gate.mts this time.
        await s.fs.write('repo/scripts/lib/dod-gate.sh', '#!/bin/sh\necho legacy\n')
        await repo.commitAll('seed legacy dod-gate.sh, no target yet')
        const sha = await blobShaOf(repo, 'scripts/lib/dod-gate.sh')
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], { 'scripts/lib/dod-gate.sh': sha }))
        await repo.commitAll('seed inventory')
        const base = await repo.head()

        await s.fs.write('repo/scripts/lib/dod-gate.sh', DOD_GATE_ADAPTER) // no dod-gate.mts committed anywhere
        await repo.commitAll('adapter with no target committed')

        const r = await runChecker(s, repo.dir, base, ['scripts/lib/dod-gate.sh'])
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/lib\/dod-gate\.sh/)
      })
    })

    it("#19 the sourced-adapter form is refused for a file other than scripts/lib/dod-gate.sh", async () => {
      await scenario('shell-inventory-19', async (s) => {
        const repo = await s.gitRepo('repo')
        // Same generated bytes, borrowed for an unrelated path — the ceiling
        // (CLAUDE.md, landed with the port) says this form is file-specific.
        const adapterAtOtherPath = DOD_GATE_ADAPTER.replace(/dod-gate/g, 'other-lib')
        await s.fs.write('repo/scripts/lib/other-lib.sh', '#!/bin/sh\necho legacy\n')
        await repo.commitAll('seed legacy other-lib.sh')
        const sha = await blobShaOf(repo, 'scripts/lib/other-lib.sh')
        await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], { 'scripts/lib/other-lib.sh': sha }))
        await repo.commitAll('seed inventory')
        const base = await repo.head()

        await s.fs.write('repo/scripts/lib/other-lib.sh', adapterAtOtherPath)
        await s.fs.write('repo/scripts/lib/other-lib.mts', DOD_GATE_TARGET_STUB)
        await repo.commitAll('borrow the dod-gate adapter shape for a different file')

        const r = await runChecker(s, repo.dir, base, ['scripts/lib/other-lib.sh'])
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/lib\/other-lib\.sh/)
      })
    })
  })
})
