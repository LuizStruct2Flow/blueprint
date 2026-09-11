/**
 * tests/lifecycle-docs/lifecycle-docs.ts — the lifecycle documents must say
 * something true.
 *
 * WHY THIS IS SMALLER THAN IT WAS. This suite began by checking that
 * `waiting-acceptance/INDEX.md` and `BUGS.md` agreed on which items were
 * waiting — INDEX had drifted to 5 rows against 14 real ones, so nine fixes
 * were invisible to the only person who can accept them. That guard was the
 * wrong repair: two records of one fact drift BY CONSTRUCTION and a test only
 * reports it afterwards. The answer was to delete `INDEX.md`. One record cannot
 * disagree with itself, so those cases are gone.
 *
 * What remains guards things a single record still cannot enforce about itself,
 * each one a defect the FOUNDER found by reading files:
 *
 *   #3  an item's ARTEFACTS sit in the same folder as its row
 *   #4  no table carries an all-empty placeholder row
 *   #5  no empty table says where its items went
 *   #6  a bug with commits has a row SOMEWHERE (BUG-086 — new, see below)
 *
 * #6 IS NOT A PORT. It is the gap the 2026-09-11 `lcm` pass found by hand, and
 * it is in this file because the property is exactly this suite's subject.
 * `tests/bug-numbers` guards the opposite direction — one number must not have
 * TWO rows — and nothing guarded the number having NONE. BUG-073's row was
 * dropped by a whole-file clobber (`5dd158e` rebuilt the table from a base that
 * predated the row) and stayed dropped through two further sessions while its
 * fix was on `main`, because the only thing that would have noticed was someone
 * reading the folders. Measured at `2bde427^`: two `BUG#73:` commits, zero rows.
 *
 * THE PREDICATE HAD TO BE CHOSEN CAREFULLY, and the obvious one is a
 * false-positive factory. "Every BUG-NNN mentioned anywhere has a row" reports
 * twelve numbers on a healthy tree: `BUG-099`, `BUG-123`, `BUG-200`, `BUG-999`
 * and friends are SYNTHETIC numbers inside test fixtures, which is why nobody
 * built this check. Asking git instead — "which numbers have a commit subject?"
 * — has no synthetic population at all, because a fixture never commits to this
 * repository. Zero false positives on the real tree, verified before the check
 * was written.
 */

import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** The three founder-gated lifecycle states an item's artefacts may sit in. */
export const LIFECYCLE_STATES = ['doing', 'waiting-acceptance', 'done'] as const

export interface LifecycleScan {
  /** How many per-item artefacts were examined. The non-vacuity number. */
  readonly checked: number
  /** `<state>/<artefact>` for each artefact stranded away from its row. */
  readonly orphans: readonly string[]
  /** Files carrying a row of nothing but pipes. */
  readonly phantomRows: readonly string[]
  /** Files whose "(Empty …)" line names where the items went. */
  readonly forwardingNotes: readonly string[]
}

const RECORD_FILES = ['BUGS.md', 'BACKLOG.md', 'CHANGES.md']

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

async function entries(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort()
  } catch {
    return []
  }
}

/**
 * Is this item's disposition recorded in the folder its artefacts sit in?
 *
 * TWO legitimate records, not one. `done/BUG-001-fork-bomb` has no row in
 * `done/BUGS.md` because it was accepted on 2026-07-29 and written up in
 * `ACCEPTANCE-JESKO-2026-07-29.md` instead — and the folder is in exactly the
 * right place. Failing on it would have forced either a fabricated historical
 * row or a weakened check, and both are worse than widening it to the truth.
 */
async function recordedHere(docsDir: string, id: string, state: string): Promise<boolean> {
  const rows = await readOrEmpty(join(docsDir, state, 'BUGS.md'))
  if (new RegExp(`^\\| \\*\\*${id}\\*\\*`, 'm').test(rows)) return true

  for (const name of await entries(join(docsDir, state))) {
    if (!name.startsWith('ACCEPTANCE-') || !name.endsWith('.md')) continue
    const text = await readOrEmpty(join(docsDir, state, name))
    if (new RegExp(`\\b${id}\\b`).test(text)) return true
  }
  return false
}

/** Every `BUGS.md` / `BACKLOG.md` / `CHANGES.md` under `docsDir`, recursively. */
async function recordFiles(docsDir: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (d: string): Promise<void> => {
    let items
    try {
      items = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      const full = join(d, item.name)
      if (item.isDirectory()) await walk(full)
      else if (RECORD_FILES.includes(item.name)) found.push(full)
    }
  }
  await walk(docsDir)
  return found.sort()
}

export async function scanLifecycleDocs(docsDir: string): Promise<LifecycleScan> {
  const orphans: string[] = []
  let checked = 0

  for (const state of LIFECYCLE_STATES) {
    // A state with no BUGS.md is not a state this repo uses — the shell version
    // skipped it, and a bootstrapped project legitimately has fewer.
    if ((await readOrEmpty(join(docsDir, state, 'BUGS.md'))) === '') continue

    for (const name of await entries(join(docsDir, state))) {
      const isArtefact = name.startsWith('BUG-') && name !== 'BUGS.md'
      const isPlan = name.startsWith('PLAN-BUG-') && name.endsWith('.md')
      if (!isArtefact && !isPlan) continue

      // A plan is named PLAN-BUG-0XX.md, an artefact folder BUG-0XX-<slug>.
      const id = (isPlan ? /BUG-[0-9]+/.exec(name) : /^BUG-[0-9]+/.exec(name))?.[0]
      if (!id) continue

      checked++
      if (!(await recordedHere(docsDir, id, state))) orphans.push(`${state}/${name}`)
    }
  }

  const phantomRows: string[] = []
  const forwardingNotes: string[] = []

  for (const file of await recordFiles(docsDir)) {
    const content = await readOrEmpty(file)
    for (const line of content.split('\n')) {
      // A row of nothing but pipes and whitespace — but NOT the |---|---|
      // separator. `| | | | |` renders as a REAL row, so a table carrying one
      // claims a parked item that does not exist.
      if (/^\|([ \t]*\|)+[ \t]*$/.test(line) && !phantomRows.includes(file)) {
        phantomRows.push(file)
      }
      // "*(Empty — BUG-023 landed in #32 and is in ../waiting-acceptance/)*" is
      // a forwarding note, and a forwarding note is the duplicate record one
      // size smaller: it goes stale the moment the item moves again. WHERE an
      // item is, is answered by which folder holds its row.
      if (
        /^\*\(Empty/.test(line) &&
        /(BUG|FEATURE|TASK|SPIKE|SLICE)-[0-9]+/.test(line) &&
        !forwardingNotes.includes(file)
      ) {
        forwardingNotes.push(file)
      }
    }
  }

  return { checked, orphans, phantomRows, forwardingNotes }
}

/**
 * #6 — every bug number with a commit has a row in some lifecycle folder.
 *
 * `commitSubjects` is injected rather than read here so the same function runs
 * over a fixture repository's log and over this one's. The commit convention is
 * enforced by `.githooks/commit-msg` (`BUG#20: …`), so the subject line is a
 * complete and machine-readable record of which numbers have work behind them.
 */
export function bugsWithoutRows(
  commitSubjects: readonly string[],
  rowedIds: ReadonlySet<string>,
): string[] {
  const committed = new Set<string>()
  for (const subject of commitSubjects) {
    const m = /^BUG#([0-9]+):/.exec(subject)
    if (m?.[1]) committed.add(`BUG-${m[1].padStart(3, '0')}`)
  }
  return [...committed].filter((id) => !rowedIds.has(id)).sort()
}

/** Every bug id carried by a ROW (not a mention) in any `BUGS.md` under docs/. */
export async function rowedBugIds(docsDir: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const file of await recordFiles(docsDir)) {
    if (basename(file) !== 'BUGS.md') continue
    for (const line of (await readOrEmpty(file)).split('\n')) {
      const m = /^\| \*\*(BUG-[0-9]+)\*\*/.exec(line)
      if (m?.[1]) ids.add(m[1])
    }
  }
  return ids
}
