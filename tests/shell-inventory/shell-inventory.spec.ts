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
import { SOURCED_LIBS } from '../../scripts/shell-inventory-check.mts'

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

  // TASK-088 — a ported script's shell file is deleted, and a legacy shell
  // caller is repointed at the .mts. The fixtures below are the REAL caller
  // shapes (PLAN-TASK-088-no-shims.md §1.4), not single-token lines.
  describe('TASK-088 — the reference-only edit of a legacy shell caller', () => {
    interface RefEdit {
      caller: string
      base: string
      head: string
      /** shell files that exist at BASE and are deleted in HEAD (unless kept) */
      ported: string[]
      /** the .mts files HEAD adds */
      mts: string[]
      kept?: string[]
      /** judge a later push: BASE is the edit commit, with the row still at the old sha */
      secondPush?: boolean
    }

    async function refEdit(s: Scenario, o: RefEdit) {
      const repo = await s.gitRepo('repo')
      const kept = o.kept ?? []
      await s.fs.write(`repo/${o.caller}`, o.base)
      for (const p of o.ported) await s.fs.write(`repo/${p}`, '#!/bin/sh\n:\n')
      await repo.commitAll('seed')
      const legacy: Record<string, string> = { [o.caller]: await blobShaOf(repo, o.caller) }
      for (const p of o.ported) legacy[p] = await blobShaOf(repo, p)
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], legacy))
      await repo.commitAll('seed inventory')
      let base = await repo.head()

      await s.fs.write(`repo/${o.caller}`, o.head)
      for (const p of o.ported) {
        if (kept.includes(p)) continue
        await s.fs.rm(`repo/${p}`)
        delete legacy[p]
      }
      for (const m of o.mts) await s.fs.write(`repo/${m}`, 'console.log("stub")\n')
      await s.fs.write('repo/scripts/shell-inventory.json', inventoryJson([], legacy))
      await repo.commitAll('repoint the caller, delete the ported shell files')
      if (o.secondPush) {
        base = await repo.head()
        await s.fs.write('repo/docs-note.md', 'an unrelated change\n')
        await repo.commitAll('unrelated change')
      }
      return runChecker(s, repo.dir, base, [o.caller, ...kept])
    }

    // start-all-watchers.sh:21 — three basenames on one line, and a name that
    // merely ENDS in a ported basename (agent-activity.sh:110's shape).
    const WATCHERS = ['scripts/start-codex-signal-watch.sh', 'scripts/start-gemini-signal-watch.sh', 'scripts/start-kimi-signal-watch.sh', 'scripts/signal-watch.sh']
    const WATCHERS_MTS = WATCHERS.map((p) => p.replace(/\.sh$/, '.mts'))
    const N1_BASE = '#!/bin/bash\ndispatchers=(start-codex-signal-watch.sh start-gemini-signal-watch.sh start-kimi-signal-watch.sh codex-signal-watch.sh)\n'
    const N1_HEAD = '#!/bin/bash\ndispatchers=(start-codex-signal-watch.mts start-gemini-signal-watch.mts start-kimi-signal-watch.mts codex-signal-watch.sh)\n'

    // new-project.sh:111
    const N2_BASE = '#!/bin/bash\n_files_raw="$(mktemp)"\nif ! bash "$BLUEPRINT_ROOT/scripts/blueprint" files >"$_files_raw" 2>&1; then\n  echo "failed" >&2\nfi\n'
    const N2_HEAD = N2_BASE.replace('bash "$BLUEPRINT_ROOT/scripts/blueprint"', 'node "$BLUEPRINT_ROOT/scripts/blueprint.mts"')

    // .githooks/pre-push-project:447-470
    const DOD_ENV = 'DOD_GATE_NOTE_FILE="${_PIPE_DIR:+$_PIPE_DIR/note.$_PIPE_N}" '
    const DOD_CALL = (sub: string, pfx = '$BP_CODE_ROOT/') => `${DOD_ENV}node "${pfx}scripts/lib/dod-gate.mts" ${sub}`
    const N3_BASE = `#!/bin/sh
if [ -f "$BP_CODE_ROOT/scripts/lib/dod-gate.sh" ]; then
  # shellcheck source=scripts/lib/dod-gate.sh
  . "$BP_CODE_ROOT/scripts/lib/dod-gate.sh"
  _dod_ranges="$(push_log_opts)"

  AGENT_FEED_TAG="DoD-Gate"

  _st_dod_rows(){ dod_stage_rows "$_dod_ranges"; }
  pipe_stage "§1b·1 every item has a backlog row" _st_dod_rows

  _st_dod_bugtests(){ dod_stage_bugtests "$_dod_ranges"; }
  pipe_stage "§2 every BUG has a regression test" _st_dod_bugtests

  _st_dod_signal(){ dod_stage_signal; }
  pipe_stage "§7G the live baton is well-formed" _st_dod_signal

  _st_dod_judgement(){ dod_stage_judgement; }
  pipe_stage "§D·F·H judgement — printed, not verified" _st_dod_judgement

  AGENT_FEED_TAG="GATE"
else
  pipe_skip "DoD checklist" "scripts/lib/dod-gate.sh absent — run: blueprint pull scripts/lib/dod-gate.sh"
fi
`
    const n3Head = (rowsSub = 'rows', pfx = '$BP_CODE_ROOT/') => `#!/bin/sh
if [ -f "$BP_CODE_ROOT/scripts/lib/dod-gate.mts" ]; then
  _dod_ranges="$(push_log_opts)"

  AGENT_FEED_TAG="DoD-Gate"

  _st_dod_rows(){ ${DOD_CALL(rowsSub, pfx)} "$_dod_ranges"; }
  pipe_stage "§1b·1 every item has a backlog row" _st_dod_rows

  _st_dod_bugtests(){ ${DOD_CALL('bugtests', pfx)} "$_dod_ranges"; }
  pipe_stage "§2 every BUG has a regression test" _st_dod_bugtests

  _st_dod_signal(){ ${DOD_CALL('signal', pfx)}; }
  pipe_stage "§7G the live baton is well-formed" _st_dod_signal

  _st_dod_judgement(){ ${DOD_CALL('judgement', pfx)}; }
  pipe_stage "§D·F·H judgement — printed, not verified" _st_dod_judgement

  AGENT_FEED_TAG="GATE"
else
  pipe_skip "DoD checklist" "scripts/lib/dod-gate.mts absent — run: blueprint pull scripts/lib/dod-gate.mts"
fi
`
    const DOD_FILES = { ported: ['scripts/lib/dod-gate.sh'], mts: ['scripts/lib/dod-gate.mts'] }

    // scripts/agent-activity.sh:766-791
    const GATE_SOURCE = '# shellcheck source=scripts/lib/gate.sh\n[ -r "$repo_root/scripts/lib/gate.sh" ] && . "$repo_root/scripts/lib/gate.sh"\n'
    const N4_BASE = `#!/bin/bash
${GATE_SOURCE}
case "\${1:-}" in
  --daemon)    command -v arm_gate >/dev/null 2>&1 && arm_gate "$BP_STATE_ROOT"
               command -v arm_push_keepalive >/dev/null 2>&1 && arm_push_keepalive "$BP_STATE_ROOT"
               cmd_daemon ;;
  "")          command -v arm_gate >/dev/null 2>&1 && arm_gate "$BP_STATE_ROOT"
               AGENT_FEED_FOREGROUND=1 supervise ;;
esac
`
    const gateCall = (sub: string, pfx = '$repo_root/') => `[ -r "${pfx}scripts/lib/gate.mts" ] && node "${pfx}scripts/lib/gate.mts" ${sub} "$BP_STATE_ROOT"`
    const n4Head = (head = '', pfx = '$repo_root/') => `#!/bin/bash
${head}
case "\${1:-}" in
  --daemon)    ${gateCall('arm-gate', pfx)}
               ${gateCall('arm-push-keepalive', pfx)}
               cmd_daemon ;;
  "")          ${gateCall('arm-gate', pfx)}
               AGENT_FEED_FOREGROUND=1 supervise ;;
esac
`
    const GATE_FILES = { ported: ['scripts/lib/gate.sh'], mts: ['scripts/lib/gate.mts'] }

    it('N1 R1: three basenames on one line are repointed, a name merely ending in one is left alone', async () => {
      await scenario('shell-inventory-n1', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/start-all-watchers.sh', base: N1_BASE, head: N1_HEAD, ported: WATCHERS, mts: WATCHERS_MTS })
        expect(r.code, r.output).toBe(0)
      })
    })

    it('N2 R2: bash "$ROOT/scripts/blueprint" becomes node "$ROOT/scripts/blueprint.mts"', async () => {
      await scenario('shell-inventory-n2', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/new-project.sh', base: N2_BASE, head: N2_HEAD, ported: ['scripts/blueprint'], mts: ['scripts/blueprint.mts'] })
        expect(r.code, r.output).toBe(0)
      })
    })

    it('N3 R3+R4: a sourced lib becomes node calls inside one-line function bodies, with its ENV', async () => {
      await scenario('shell-inventory-n3', async (s) => {
        const r = await refEdit(s, { caller: '.githooks/pre-push-project', base: N3_BASE, head: n3Head(), ...DOD_FILES })
        expect(r.code, r.output).toBe(0)
      })
    })

    it('N4 R3+R5+R4: guard, source line and calls of gate.sh become node calls', async () => {
      await scenario('shell-inventory-n4', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/agent-activity.sh', base: N4_BASE, head: n4Head(), ...GATE_FILES })
        expect(r.code, r.output).toBe(0)
      })
    })

    it('N10 a second push is judged against BASE\'s old blob, the row still at the old sha', async () => {
      await scenario('shell-inventory-n10', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/agent-activity.sh', base: N4_BASE, head: n4Head(), ...GATE_FILES, secondPush: true })
        expect(r.code, r.output).toBe(0)
      })
    })

    it('N5 a reference edit plus one unrelated byte, or one extra trailing newline, is refused', async () => {
      await scenario('shell-inventory-n5a', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/new-project.sh', base: N2_BASE, head: N2_HEAD.replace(' files ', ' filez '), ported: ['scripts/blueprint'], mts: ['scripts/blueprint.mts'] })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/new-project\.sh/)
      })
      await scenario('shell-inventory-n5b', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/new-project.sh', base: N2_BASE, head: `${N2_HEAD}\n`, ported: ['scripts/blueprint'], mts: ['scripts/blueprint.mts'] })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/new-project\.sh/)
      })
    })

    it('N6 a rename to an .mts whose .sh still exists is refused', async () => {
      await scenario('shell-inventory-n6', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/new-project.sh', base: N2_BASE, head: N2_HEAD, ported: ['scripts/blueprint'], mts: ['scripts/blueprint.mts'], kept: ['scripts/blueprint'] })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/new-project\.sh/)
      })
    })

    it('N7 the right function mapped to the wrong subcommand is refused', async () => {
      await scenario('shell-inventory-n7', async (s) => {
        const r = await refEdit(s, { caller: '.githooks/pre-push-project', base: N3_BASE, head: n3Head('bugtests'), ...DOD_FILES })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*pre-push-project/)
      })
    })

    it('N8 a node call with a prefix BASE\'s own source lines never used is refused', async () => {
      await scenario('shell-inventory-n8', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/agent-activity.sh', base: N4_BASE, head: n4Head('', '$other_root/'), ...GATE_FILES })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*agent-activity\.sh/)
      })
    })

    it('N11 an inserted source line (another path ending in scripts/lib/gate.sh) is refused', async () => {
      await scenario('shell-inventory-n11', async (s) => {
        const inserted = '[ -r "tests/x/scripts/lib/gate.sh" ] && . "tests/x/scripts/lib/gate.sh"\n'
        const r = await refEdit(s, { caller: 'scripts/agent-activity.sh', base: N4_BASE, head: n4Head(inserted), ...GATE_FILES })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*agent-activity\.sh/)
      })
    })

    it('N12 a BASE source line kept in HEAD is refused', async () => {
      await scenario('shell-inventory-n12', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/agent-activity.sh', base: N4_BASE, head: n4Head(GATE_SOURCE), ...GATE_FILES })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*agent-activity\.sh/)
      })
    })

    it('N13 guard swapped and source dropped while the bare function call stays is refused', async () => {
      await scenario('shell-inventory-n13', async (s) => {
        const head = N4_BASE.replace(GATE_SOURCE, '').replace(/command -v (arm_\w+) >\/dev\/null 2>&1 && /g, '[ -r "$repo_root/scripts/lib/gate.mts" ] && ')
        const r = await refEdit(s, { caller: 'scripts/agent-activity.sh', base: N4_BASE, head, ...GATE_FILES })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*agent-activity\.sh/)
      })
    })

    it('N13b a source line dropped with no node call left to replace it is refused (coupling)', async () => {
      await scenario('shell-inventory-n13b', async (s) => {
        const base = `#!/bin/bash\n${GATE_SOURCE}echo ready\n`
        const r = await refEdit(s, { caller: 'scripts/agent-activity.sh', base, head: '#!/bin/bash\necho ready\n', ...GATE_FILES })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*agent-activity\.sh/)
      })
    })

    it('N14 bash X becoming a bare X.mts is refused while the .mts is not executable', async () => {
      await scenario('shell-inventory-n14', async (s) => {
        const head = N2_BASE.replace('bash "$BLUEPRINT_ROOT/scripts/blueprint"', '"$BLUEPRINT_ROOT/scripts/blueprint.mts"')
        const r = await refEdit(s, { caller: 'scripts/new-project.sh', base: N2_BASE, head, ported: ['scripts/blueprint'], mts: ['scripts/blueprint.mts'] })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/new-project\.sh/)
      })
    })

    it('N15 a bare basename that two ported files share is not a token and is refused', async () => {
      await scenario('shell-inventory-n15', async (s) => {
        const r = await refEdit(s, {
          caller: 'scripts/caller.sh',
          base: '#!/bin/sh\nnode_run x.sh\n',
          head: '#!/bin/sh\nnode_run x.mts\n',
          ported: ['scripts/x.sh', 'scripts/lib/x.sh'],
          mts: ['scripts/x.mts', 'scripts/lib/x.mts'],
        })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/caller\.sh/)
      })
    })

    it('N10b an extensionless path survives the push after its first repoint (BASE no longer has it)', async () => {
      await scenario('shell-inventory-n10b', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/new-project.sh', base: N2_BASE, head: N2_HEAD, ported: ['scripts/blueprint'], mts: ['scripts/blueprint.mts'], secondPush: true })
        expect(r.code, r.output).toBe(0)
      })
    })

    it('N16 a pre-existing nested path ending in a deleted root path is not repointed', async () => {
      await scenario('shell-inventory-n16', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/caller.sh', base: '#!/bin/sh\nbash tests/x/scripts/lib/gate.sh\n', head: '#!/bin/sh\nnode tests/x/scripts/lib/gate.mts\n', ...GATE_FILES })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/caller\.sh/)
      })
    })

    it('N17 a path followed by .${suffix} is not a token; a sentence-ending dot still is', async () => {
      const ported = { ported: ['scripts/foo.sh'], mts: ['scripts/foo.mts'] }
      await scenario('shell-inventory-n17a', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/caller.sh', base: '#!/bin/sh\ncp scripts/foo.sh.${suffix} out\n', head: '#!/bin/sh\ncp scripts/foo.mts.${suffix} out\n', ...ported })
        expect(r.code).not.toBe(0)
        expect(r.output).toMatch(/CHANGED:.*scripts\/caller\.sh/)
      })
      await scenario('shell-inventory-n17b', async (s) => {
        const r = await refEdit(s, { caller: 'scripts/caller.sh', base: '#!/bin/sh\n# see scripts/foo.sh.\n', head: '#!/bin/sh\n# see scripts/foo.mts.\n', ...ported })
        expect(r.code, r.output).toBe(0)
      })
    })

    // The case labels of main()'s switch only: comments and strings do not count.
    function mainSwitchBody(src: string): string {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const open = code.indexOf('{', code.indexOf('switch (', code.search(/function main\(/)))
      let depth = 0
      for (let i = open; i < code.length; i++) {
        if (code[i] === '{') depth++
        else if (code[i] === '}' && --depth === 0) return code.slice(open, i)
      }
      return ''
    }

    it('N18 a case label that appears only in a comment is not found in main()\'s switch', () => {
      const src = "// case 'rows':\nfunction main(): void {\n  switch (sub) {\n    case 'bugtests':\n      break\n    // case 'rows':\n  }\n}\n"
      expect(mainSwitchBody(src)).toContain("case 'bugtests':")
      expect(mainSwitchBody(src)).not.toContain("case 'rows':")
    })

    it('the function table names only subcommands the .mts main() switch has', () => {
      for (const lib of SOURCED_LIBS) {
        const body = mainSwitchBody(readFileSync(`${REPO_ROOT}/${lib.mts}`, 'utf8'))
        for (const sub of Object.values(lib.fns)) expect(body, `${lib.mts} case '${sub}'`).toContain(`case '${sub}':`)
      }
    })
  })
})
