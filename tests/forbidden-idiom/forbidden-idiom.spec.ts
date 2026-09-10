/**
 * tests/forbidden-idiom/forbidden-idiom.spec.ts — BUG-076.
 *
 * THE DEFECT. `tests/state-dir` #6c forbade `git rev-parse --show-toplevel` on
 * the state-dir path, because that command answers about the CALLER's exported
 * GIT_DIR — git exports GIT_DIR to every hook, the gate runs the suites from a
 * pre-push hook, and A-09/BUG-014 are what a redirected root reopens.
 *
 * Its sweep was `scripts/agent-activity.sh` plus three dispatchers. It never
 * looked in `scripts/lib/` — and `scripts/lib/state-dir.sh` was the one file
 * that actually CONTAINED the forbidden expression, as the default for the
 * positional root:
 *
 *     _asd_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
 *
 * So the guard banned an expression everywhere except where it lived, and
 * stayed green for months. It was safe only by accident: every caller happened
 * to pass an explicit root, so the default never ran. The moment anyone
 * "simplified" a call site by dropping the argument, they would have landed on
 * the banned path with no test to stop them.
 *
 * This is #6c ported to TypeScript (no new shell suites) and WIDENED to
 * scripts/lib/. The shell case is deleted, not duplicated.
 *
 * MATCHING THE COMMAND, NOT THE WORD "git". `bp_state_root` legitimately tests
 * for a `.git` path — that is the whole point of a filesystem walk that no
 * environment variable can redirect. A guard that fired on it would be noise,
 * and this repo has already learned that a guard which flags the benign case
 * gets ignored (tests/state-dir #5b says so about its own artefact matching).
 *
 * MUTATION RECIPE (R6) — observed red, not predicted:
 *   Restore `_asd_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"`
 *   as a fallback in scripts/lib/state-dir.sh.
 *   → this spec goes red naming scripts/lib/state-dir.sh and its line number,
 *     which #6c could not do because it never read the file.
 */

import { describe, it, expect } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT } from '../harness/index.js'

describe('BUG-076 — no state-dir consumer anchors its root with git rev-parse', () => {
  it('#H the forbidden idiom is absent from scripts/ AND scripts/lib/', async () => {
    /**
     * BUG-076. This is tests/state-dir #6c, ported and WIDENED.
     *
     * #6c swept `scripts/agent-activity.sh` plus three dispatchers. It did not
     * sweep `scripts/lib/` — and `scripts/lib/state-dir.sh` was where the
     * forbidden `git rev-parse --show-toplevel` actually lived, as the default
     * for the positional root. The guard banned an expression everywhere except
     * the one file that contained it, and stayed green for months.
     *
     * The match is on the COMMAND, not the substring "git": `bp_state_root`
     * legitimately tests for a `.git` path, and a guard that fires on that
     * teaches people to ignore it.
     */
    const dir = join(REPO_ROOT, 'scripts')
    const files = [
      ...(await readdir(dir)).filter((n) => n.endsWith('.sh')).map((n) => join(dir, n)),
      ...(await readdir(join(dir, 'lib')))
        .filter((n) => n.endsWith('.sh'))
        .map((n) => join(dir, 'lib', n)),
    ]

    const offenders: string[] = []
    let scannedLib = 0

    for (const f of files) {
      const name = f.slice(REPO_ROOT.length + 1)
      if (name.startsWith('scripts/lib/')) scannedLib += 1
      const body = await readFile(f, 'utf8')
      // only files on the state-dir path are in scope
      if (!/state-dir\.sh|agent_state_dir|bp_state_root/.test(body)) continue
      body.split('\n').forEach((line, i) => {
        const code = line.replace(/#.*$/, '')
        if (/git\s+rev-parse\s+--show-toplevel/.test(code)) {
          offenders.push(`${name}:${i + 1}`)
        }
      })
    }

    expect(offenders).toEqual([])
    // Non-vacuity: the widening is the whole point of this port.
    expect(scannedLib).toBeGreaterThanOrEqual(10)
  })
})
