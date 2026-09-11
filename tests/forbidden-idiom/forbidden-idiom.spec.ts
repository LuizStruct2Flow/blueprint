/**
 * tests/forbidden-idiom/forbidden-idiom.spec.ts — BUG-076, WIDENED by BUG-077.
 *
 * THE RULE, and it is scoped to the HAZARD rather than to a subsystem:
 *
 *   No script in this repository resolves a path with
 *   `git rev-parse --show-toplevel`.
 *
 * WHY, stated as the question the command answers rather than as a list of
 * places it has hurt us. `--show-toplevel` answers *"what repository does my
 * caller's git environment point at"*. Nothing here is asking that. Every
 * consumer needs one of two other things:
 *
 *   * its CODE root — where the scripts and suites it runs live. Answered by
 *     the physical-script block (`BP_CODE_ROOT`), or by `pwd` where git's hook
 *     contract guarantees the work-tree root.
 *   * its STATE root — where the live baton, roster, logs and lifecycle docs
 *     live. Answered by `bp_state_root`, an upward filesystem walk.
 *
 * Both are answerable without git, and the git answer differs from both — under
 * a redirected `GIT_DIR` today (git exports it to every hook, and the gate runs
 * the suites from a pre-push hook: BUG-014's mechanism, A-09's consequence),
 * and under TASK-021's code/state split tomorrow, where the repository root and
 * the code root are simply different directories.
 *
 * HOW THE SCOPE GOT HERE, because the history is the argument for the shape.
 *
 * `tests/state-dir` #6c banned the idiom for *state-dir consumers* and swept
 * `scripts/agent-activity.sh` plus three dispatchers. BUG-076 found that it
 * never looked in `scripts/lib/`, where `state-dir.sh` was the one file that
 * actually contained the expression; the port widened the sweep to
 * `scripts/lib/` but kept the subsystem filter.
 *
 * BUG-077 then found `scripts/lib/feed.sh` and `scripts/lib/gate.sh` — both
 * carrying the idiom, both OUTSIDE that filter, and both faithfully green under
 * the old rule AND the port. A mutation of either implementation would have
 * shown nothing, because both were correctly out of scope. Only running 19
 * trees through both and diffing verdicts surfaced it. The scope was never
 * wrong; it was narrower than the hazard. So the filter is gone: `feed.sh` now
 * follows from the rule instead of being named by it, and so does the next file
 * nobody has thought of.
 *
 * THE ESCAPE, and why it is a comment rather than a list here. A file that
 * genuinely needs the caller's git environment marks the line
 * `bp-allow-toplevel: <why it is safe>`. A justification that lives on the line
 * cannot drift away from it, which an exemption list in this spec would.
 *
 * MATCHING THE COMMAND, NOT THE WORD "git". `bp_state_root` legitimately tests
 * for a `.git` path — that is the whole point of a filesystem walk no
 * environment variable can redirect. A guard that fired on it would be noise,
 * and this repo has already learned that a guard which flags the benign case
 * gets ignored.
 *
 * MUTATION RECIPE (R6) — observed red, not predicted:
 *   Restore `_fl_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"` in
 *   scripts/lib/feed.sh, or the `${1:-$(git rev-parse --show-toplevel ...)}`
 *   default in scripts/lib/gate.sh.
 *   → this spec goes red naming the file and line. The pre-BUG-077 version
 *     stayed green on both, which is the whole reason this file changed.
 */

import { describe, it, expect } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT } from '../harness/index.js'

/**
 * `git … rev-parse … --show-toplevel` on one line.
 *
 * Deliberately tolerant of what sits between the words: `git -C "$d" rev-parse`
 * is the same hazard and is in fact WORSE, because `-C` reads as a scoping flag
 * while an exported GIT_DIR overrides it. Matching `git … rev-parse … --short`
 * or a bare `.git` path test is what the second half of #H2 pins against.
 */
const FORBIDDEN = /\bgit\b[^\n]*\brev-parse\b[^\n]*--show-toplevel/

/** An inline waiver, with its reason. A bare marker does not count. */
const WAIVED = /bp-allow-toplevel:\s*\S/

/**
 * Every executable this repository ships or runs, in one population.
 *
 * Derived from the filesystem, never from a list: a list is a second
 * description of what `scripts/` and `.githooks/` already say, and the drift
 * between them is how #6c stayed green over the one file that broke it.
 */
async function population(): Promise<string[]> {
  const out: string[] = []
  for (const dir of ['scripts', 'scripts/lib']) {
    const names = await readdir(join(REPO_ROOT, dir))
    for (const n of names) {
      if (n.endsWith('.sh')) out.push(`${dir}/${n}`)
    }
  }
  // The sync CLI has no .sh suffix and is the most widely shipped script here.
  out.push('scripts/blueprint')
  // The hooks are where the hazard is REAL rather than latent: git exports
  // GIT_DIR into exactly these processes.
  for (const n of await readdir(join(REPO_ROOT, '.githooks'))) {
    if (n.endsWith('.example')) continue
    out.push(`.githooks/${n}`)
  }
  return out.sort()
}

describe('BUG-076 / BUG-077 — nothing resolves a path with git rev-parse --show-toplevel', () => {
  it('#H the forbidden idiom is absent from scripts/, scripts/lib/ and .githooks/', async () => {
    const files = await population()
    const offenders: string[] = []

    for (const rel of files) {
      const body = await readFile(join(REPO_ROOT, rel), 'utf8')
      body.split('\n').forEach((line, i) => {
        // Comments are documentation: this very file's subjects explain in
        // prose why they do NOT use the idiom, and flagging that would train
        // people to ignore the guard.
        const code = line.replace(/#.*$/, '')
        if (!FORBIDDEN.test(code)) return
        if (WAIVED.test(line)) return
        offenders.push(`${rel}:${i + 1}`)
      })
    }

    expect(offenders).toEqual([])

    // Non-vacuity, per surface. The widening IS the point of this spec, so a
    // population that quietly stopped covering one of the three directories
    // would make it pass by looking at nothing — which is the defect class the
    // whole file is about.
    const count = (p: string) => files.filter((f) => f.startsWith(p)).length
    expect(count('scripts/lib/'), 'scripts/lib/ is not being scanned').toBeGreaterThanOrEqual(10)
    expect(count('scripts/'), 'scripts/ is not being scanned').toBeGreaterThanOrEqual(20)
    expect(count('.githooks/'), '.githooks/ is not being scanned').toBeGreaterThanOrEqual(3)
    expect(files, 'the sync CLI dropped out of the population').toContain('scripts/blueprint')
  })

  it('#H2 the matcher fires on the command and not on the word "git"', async () => {
    // Two halves of one claim, because a guard that is merely strict is a guard
    // people delete. `bp_state_root`'s `.git` test is the SAFE expression the
    // ban exists to make possible, and it must stay unflagged.
    expect(FORBIDDEN.test('  _r="$(git rev-parse --show-toplevel 2>/dev/null)"')).toBe(true)
    expect(FORBIDDEN.test('  _r="$(git -C "$d" rev-parse --show-toplevel)"')).toBe(true)
    expect(FORBIDDEN.test('  while [ ! -e "$d/.git" ]; do')).toBe(false)
    expect(FORBIDDEN.test('  git rev-parse --short HEAD')).toBe(false)

    // And the waiver needs a reason, not a token.
    expect(WAIVED.test('x  # bp-allow-toplevel: the caller IS the repo under test')).toBe(true)
    expect(WAIVED.test('x  # bp-allow-toplevel:')).toBe(false)
  })
})
