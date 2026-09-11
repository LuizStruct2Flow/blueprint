/**
 * tests/lifecycle-docs/lifecycle-docs.spec.ts — the lifecycle documents must
 * say something true.
 *
 * The reasoning for each check lives beside it in `lifecycle-docs.ts`, which is
 * where the check is. This file is the population: a perturbed tree per
 * assertion, each carrying exactly the defect that assertion exists to catch,
 * with the baseline asserted green in the same file so a red case cannot be red
 * for some other reason (TASK-018-RULES R6).
 *
 * EQUIVALENCE RECORD (R6, and the migration's own evidence).
 *
 * TWELVE trees — ten perturbed, a healthy baseline, and the real `docs/` tree —
 * were built once and BOTH implementations run over each: the retiring
 * `tests/lifecycle-docs/test.sh`, copied into the fixture and run with the
 * fixture as its ROOT, and `scanLifecycleDocs()`. The per-case verdicts (#3, #4,
 * #5) were compared mechanically. **They agreed on all twelve inputs**, and the
 * `checked` count matched on every one.
 *
 * Three differences exist and are recorded rather than smoothed over:
 *
 *   - #6 IS NEW AND HAS NO SHELL COUNTERPART. It is not a port; it is the gap
 *     the 2026-09-11 `lcm` pass found by hand, filed as BUG-086. A bug number
 *     with commits and no row was invisible to every control in the repo —
 *     `tests/bug-numbers` guards the opposite direction. Proven able to fail
 *     against `2bde427^`, where BUG-073 had two commits and zero rows.
 *   - `recordedHere`'s ACCEPTANCE-file fallback: the shell used
 *     `grep -rqE … "$DOCS/$2"/ACCEPTANCE-*.md`, which with no matching file
 *     expands to a literal unmatched glob and greps a path that does not exist —
 *     returning 1, i.e. the same answer as "not found". Ported as an explicit
 *     directory listing. Same verdict on all twelve trees, including a tree
 *     with no ACCEPTANCE file at all, which is the input where the two could
 *     have differed.
 *   - The shell's `find … -name A -o -name B` precedence means the `-o` chain
 *     binds as expected here but is a known trap; ported as an explicit set
 *     membership test. Verified identical on a tree carrying all three record
 *     filenames plus a decoy `BUGS.md.bak`.
 *
 * R6 NEGATIVE PROOF — per CASE, not per case GROUP.
 *
 * The record above compares VERDICT SETS between the shell suite and this
 * port. Three Codex reviews of neighbouring groups refused certification on
 * the same point: agreeing on `#3` does not say which of the cases NAMED `#3`
 * can be made red. So every `it()` here was put to the narrower question —
 * is there a perturbation OBSERVED to turn it red — and the answer is
 * recorded in docs/waiting-acceptance/TASK-018-R6-isolation/outputs/gap.txt, which names
 * the mutant(s) per case. The denominator comes from the runner rather than
 * from a grep, so the `it.each` tables are expanded rather than counted once.
 *
 * Fourteen cases, fourteen with an observed red, and the non-vacuity pair
 * needs two OPPOSITE mutants: dropping the increment turns the healthy
 * fixture red, while seeding the count non-zero turns `#3 an empty tree
 * examines nothing` red. One mutant cannot do both, which is the point of
 * having both cases.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import {
  bugsWithoutRows,
  rowedBugIds,
  scanLifecycleDocs,
  LIFECYCLE_STATES,
  type LifecycleScan,
} from './lifecycle-docs.js'

/** One row in the founder's table shape — `| **BUG-0XX** | … |`. */
const row = (id: string): string => `| **${id}** | a real row | fixed |\n`

const TABLE_HEAD = '| ID | What | State |\n|---|---|---|\n'

async function scanTree(
  s: Scenario,
  name: string,
  files: Record<string, string>,
): Promise<LifecycleScan> {
  const docs = await s.workspace.dir(name, 'docs')
  for (const [rel, content] of Object.entries(files)) {
    await s.fs.write(join(name, 'docs', rel), content)
  }
  return scanLifecycleDocs(docs)
}

/**
 * A tree with one artefact folder correctly beside its row, in each state.
 *
 * `checked` must be non-zero or every #3 case below is vacuous — the shell
 * version passes #3 "vacuously satisfied" on an empty population, which is the
 * BUG-005 shape, so the baseline has to be seen doing work.
 */
function healthyTree(): Record<string, string> {
  return {
    'doing/BUGS.md': TABLE_HEAD + row('BUG-101'),
    'doing/BUG-101-a-slug/PLAN.md': '# plan\n',
    'waiting-acceptance/BUGS.md': TABLE_HEAD + row('BUG-102'),
    'waiting-acceptance/PLAN-BUG-102.md': '# plan\n',
    'done/BUGS.md': TABLE_HEAD + row('BUG-103'),
    'done/BUG-103-done-slug/PLAN.md': '# plan\n',
    'backlog/BACKLOG.md': TABLE_HEAD + '| **FEATURE-004** | parked | KEEP |\n',
  }
}

describe('lifecycle-docs — a record that states something untrue costs more than an absent one', () => {
  it('#3+#4+#5 the healthy fixture is green, and #3 is seen examining a real population', async () => {
    await scenario('lifecycle-baseline', async (s) => {
      const scan = await scanTree(s, 'bp', healthyTree())

      expect(scan.orphans).toEqual([])
      expect(scan.phantomRows).toEqual([])
      expect(scan.forwardingNotes).toEqual([])
      expect(scan.checked).toBe(3)
    })
  })

  it('#3 an artefact FOLDER whose row did not travel with it is named', async () => {
    await scenario('lifecycle-3-folder', async (s) => {
      const files = healthyTree()
      // The whole folder moved to waiting-acceptance/ and the row stayed in
      // doing/ — which is the half of the move people forget, because the
      // folder is the visible half.
      files['waiting-acceptance/BUG-104-stranded/PLAN.md'] = '# plan\n'

      const scan = await scanTree(s, 'bp', files)

      expect(scan.orphans).toEqual(['waiting-acceptance/BUG-104-stranded'])
      expect(scan.checked).toBe(4)
    })
  })

  it('#3 a PLAN-BUG-0XX.md travels with its work too', async () => {
    await scenario('lifecycle-3-plan', async (s) => {
      const files = healthyTree()
      files['done/PLAN-BUG-105.md'] = '# plan\n'

      const scan = await scanTree(s, 'bp', files)

      expect(scan.orphans).toEqual(['done/PLAN-BUG-105.md'])
    })
  })

  it('#3 an ACCEPTANCE write-up is also a record — a historical item needs no fabricated row', async () => {
    await scenario('lifecycle-3-acceptance', async (s) => {
      const files = healthyTree()
      // done/BUG-001-fork-bomb is the real instance: accepted 2026-07-29 and
      // written up in ACCEPTANCE-JESKO-2026-07-29.md rather than rowed. The
      // folder is in exactly the right place; a narrower check would have
      // forced either a fabricated row or a weakened guard.
      files['done/BUG-106-historical/PLAN.md'] = '# plan\n'
      files['done/ACCEPTANCE-SOMEONE-2026-07-29.md'] = 'BUG-106 accepted live.\n'

      const scan = await scanTree(s, 'bp', files)

      expect(scan.orphans).toEqual([])
      expect(scan.checked).toBe(4)
    })
  })

  it('#3 a ROW ELSEWHERE is not a record HERE — the folder is what answers "where is it"', async () => {
    await scenario('lifecycle-3-elsewhere', async (s) => {
      const files = healthyTree()
      // The artefact is in done/ and the row is in doing/. Both exist, so a
      // "does this number have a row anywhere" check would pass. The property
      // is co-location, which is what makes the folder authoritative.
      files['done/BUG-107-split/PLAN.md'] = '# plan\n'
      files['doing/BUGS.md'] = TABLE_HEAD + row('BUG-101') + row('BUG-107')

      const scan = await scanTree(s, 'bp', files)

      expect(scan.orphans).toEqual(['done/BUG-107-split'])
    })
  })

  it('#4 an all-empty placeholder row claims an item that does not exist', async () => {
    await scenario('lifecycle-4', async (s) => {
      const files = healthyTree()
      // `| | | | |` was shipped as a "stub" in backlog/BACKLOG.md and
      // backlog/BUGS.md. It RENDERS as a real row, so each file claimed one
      // parked item that was not there. A header with nothing under it already
      // says "none".
      files['backlog/BUGS.md'] = `${TABLE_HEAD}| | | |\n`

      const scan = await scanTree(s, 'bp', files)

      expect(scan.phantomRows).toHaveLength(1)
      expect(scan.phantomRows[0]).toContain('backlog/BUGS.md')
    })
  })

  it('#4 the |---|---| separator is NOT a phantom row', async () => {
    await scenario('lifecycle-4-separator', async (s) => {
      // Every table in the repo has one. A check that flagged it would fire on
      // all of them, which is how a guard gets deleted rather than obeyed.
      const scan = await scanTree(s, 'bp', healthyTree())

      expect(scan.phantomRows).toEqual([])
    })
  })

  it('#5 an empty table that says where its items WENT is a forwarding note', async () => {
    await scenario('lifecycle-5', async (s) => {
      const files = healthyTree()
      // Both real instances pointed at waiting-acceptance/ while the items sat
      // in done/, and one of them was three lines above the sentence "Do not
      // narrate status here".
      files['doing/CHANGES.md'] =
        '*(Empty — BUG-023 landed in #32 and is in ../waiting-acceptance/)*\n'

      const scan = await scanTree(s, 'bp', files)

      expect(scan.forwardingNotes).toHaveLength(1)
      expect(scan.forwardingNotes[0]).toContain('doing/CHANGES.md')
    })
  })

  it('#5 a bare "*(Empty.)*" is the correct form and is not flagged', async () => {
    await scenario('lifecycle-5-bare', async (s) => {
      const files = healthyTree()
      files['doing/CHANGES.md'] = '*(Empty.)*\n'

      const scan = await scanTree(s, 'bp', files)

      expect(scan.forwardingNotes).toEqual([])
    })
  })

  it('#3 a state folder with NO BUGS.md is skipped, not reported as all-orphan', async () => {
    await scenario('lifecycle-3-nostate', async (s) => {
      const files = healthyTree()
      delete files['done/BUGS.md']

      const scan = await scanTree(s, 'bp', files)

      // done/BUG-103-done-slug is no longer examined at all — a bootstrapped
      // project legitimately has fewer lifecycle folders than this repo.
      expect(scan.orphans).toEqual([])
      expect(scan.checked).toBe(2)
    })
  })

  it('#3 an empty tree examines nothing, which is the vacuous pass #3 can still give', async () => {
    await scenario('lifecycle-3-empty', async (s) => {
      const scan = await scanTree(s, 'bp', {})

      // Recorded rather than fixed: the shell version prints "#3 no per-item
      // artefacts to check (vacuously satisfied)" and passes, and the port
      // agrees. The count is what makes the vacuity VISIBLE, which is why the
      // baseline above asserts it is 3.
      expect(scan.checked).toBe(0)
      expect(scan.orphans).toEqual([])
    })
  })

  it('#6 BUG-086 — a bug with commits and no row is caught (the gap the lcm pass found by hand)', async () => {
    // The 2026-09-11 `lcm` pass found BUG-073's row missing entirely: 5dd158e
    // rebuilt the table from a base predating the row, so the repair reverted a
    // row the same way the clobber it was repairing did. Nothing noticed for two
    // sessions, because the only control on bug numbers guards DUPLICATES.
    const rowed = new Set(['BUG-101', 'BUG-102'])
    const subjects = [
      'BUG#101: a fix whose row is present',
      'BUG#73: the row a whole-file write dropped',
      'BUG#73: a second commit on the same number',
      'TASK#18: not a bug, carries no obligation here',
      'FEATURE#3: likewise',
      'Merge branch of no item',
    ]

    expect(bugsWithoutRows(subjects, rowed)).toEqual(['BUG-073'])

    // The number is zero-padded to the row format, so `BUG#7` and `BUG-007` are
    // the same item. Without this the check would report every single-digit bug
    // in the repo's history as rowless.
    expect(bugsWithoutRows(['BUG#7: x'], new Set(['BUG-007']))).toEqual([])
    // And it must not invent obligations: no commits, nothing to report.
    expect(bugsWithoutRows([], new Set())).toEqual([])
  })

  it('#6 a row is a ROW, not a mention — a bug named in prose is still rowless', async () => {
    await scenario('lifecycle-6-mention', async (s) => {
      const docs = await s.workspace.dir('bp', 'docs')
      // `tests/bug-numbers` #3 makes the same distinction from the other side.
      // Sharing it matters: if a mention counted, the clobber that dropped
      // BUG-073's row would still have passed, because the row's own commit
      // message mentions the number.
      await s.fs.write(
        'bp/docs/doing/BUGS.md',
        `${TABLE_HEAD}${row('BUG-101')}\nBUG-073 is discussed at length here.\n`,
      )

      const ids = await rowedBugIds(docs)

      expect([...ids]).toEqual(['BUG-101'])
      expect(bugsWithoutRows(['BUG#73: x'], ids)).toEqual(['BUG-073'])
    })
  })

  it('THE REAL TREE — artefacts sit with their rows, no table lies, every committed bug has a row', async () => {
    const docs = join(REPO_ROOT, 'docs')
    const scan = await scanLifecycleDocs(docs)

    // NON-VACUITY WITHOUT A CONTENT CLAIM, and it took two tries to get here.
    //
    // This asserted `checked > 0` — a floor on artefact folders — and a freshly
    // bootstrapped project has none, so it failed a derived project's own gate.
    // Replacing it with a floor on lifecycle TABLES was the same mistake once
    // removed: `git archive HEAD` ships only README.md in doing/, done/ and
    // waiting-acceptance/, so zero is correct there too.
    //
    // Any FLOOR here is a claim about this repository's content, in a suite that
    // ships. The question is not "did the scan find things" but "does what it
    // found agree with what is on disk" — two facts derived independently, which
    // is non-vacuous in any tree and cannot be satisfied by an empty population
    // unless the population really is empty.
    const statesWithTables = (
      await Promise.all(
        LIFECYCLE_STATES.map(async (state) =>
          (await readFile(join(docs, state, 'BUGS.md'), 'utf8').catch(() => '')).trim() !== ''
            ? 1
            : 0,
        ),
      )
    ).reduce<number>((a, b) => a + b, 0)

    expect(
      scan.statesScanned,
      `the scan walked ${scan.statesScanned} lifecycle tables but ${statesWithTables} exist on disk — discovery is broken, so #3 proved nothing`,
    ).toBe(statesWithTables)
    expect(scan.orphans, scan.orphans.join(' ')).toEqual([])
    expect(scan.phantomRows, scan.phantomRows.join(' ')).toEqual([])
    expect(scan.forwardingNotes, scan.forwardingNotes.join(' ')).toEqual([])

    // #6 over the real history. `scenario()` is not used because this reads the
    // repository and writes nothing; `git log` with no pathspec is the only
    // command, and the harness's afterEach still proves no GIT_DIR leaked in.
    await scenario('lifecycle-6-real', async (s) => {
      const log = await s.run('git', ['log', '--format=%s', 'HEAD'], { cwd: REPO_ROOT })
      expect(log.code).toBe(0)

      const subjects = log.stdout.split('\n').filter(Boolean)
      // Non-vacuity: a `git log` that returned nothing would make #6 pass over
      // an empty population, which is precisely BUG-005. The floor used to be a
      // constant 50, which is this repository's history — a fresh project has
      // one commit. Compare against the same fact from an independent command
      // instead, so the check is non-vacuous in ANY tree.
      const count = await s.run('git', ['rev-list', '--count', 'HEAD'], { cwd: REPO_ROOT })
      expect(count.code).toBe(0)
      expect(subjects.length).toBe(Number(count.stdout.trim()))
      expect(subjects.length).toBeGreaterThan(0)

      const rowless = bugsWithoutRows(subjects, await rowedBugIds(docs))
      expect(
        rowless,
        `bug(s) with commits on HEAD and no row in any docs/*/BUGS.md: ` +
          `${rowless.join(', ')}. A row dropped by a whole-file write is ` +
          `invisible to every other control (BUG-086).`,
      ).toEqual([])
    })
  })
})
