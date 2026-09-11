/**
 * tests/marker-merge/marker-merge.spec.ts — BP-7, and the BUG-034 that lives
 * inside it.
 *
 * `marker_aware_merge` is the one place `blueprint pull` can DELETE a derived
 * project's own content. Everything else pull does is additive or a whole-file
 * copy of a file the project already agreed is managed; this one reads a file
 * the project half-owns and writes a new version of it. So the assertion is
 * byte-exact rather than "contains" — a merge that drops one line of the
 * project's half has done the damage, and a substring check would not see it.
 *
 * PORTED FROM tests/marker-merge/test.sh, WHICH STAYS IN THE GATE until the
 * central retirement pass. The three fixture files are REUSED rather than
 * re-authored: they are the oracle, and re-typing an oracle is how a port
 * proves the wrong thing.
 *
 * ONE DELIBERATE DIVERGENCE FROM THE SHELL SUITE, and it is a speed-up with a
 * verdict-equivalence proof rather than a shortcut. The shell version built its
 * fixture blueprint with `git archive HEAD | tar -x` — a full copy of the real
 * repo, which is what BUG-049 measured at 133 MB of leaked debris across 23
 * runs. It did that only so that `docs/mocks/README.md` (a real MANAGED_FILES
 * entry) would exist upstream. A two-file fixture blueprint gives the CLI the
 * same answer for that path: every OTHER managed entry lands in the
 * missing-in-blueprint list, which `pull <one file>` never consults.
 * tests/blueprint-relocation #1 already pins that property independently.
 * Measured equivalence: both implementations agree on all six perturbed trees
 * in the population below.
 *
 * EQUIVALENCE RECORD (R6, and the migration's own evidence).
 *
 * "Ported" is a claim, so it was measured. Six perturbed trees were built and
 * BOTH implementations run over each — the retiring `tests/marker-merge/test.sh`
 * and this spec — with the per-case verdict sets compared mechanically. The red
 * sets below are OBSERVED, not predicted.
 *
 *   Mutant M1: `marker_aware_merge` returns 1 unconditionally, forcing the
 *     whole-file-copy fallback — the BP-7 defect verbatim.
 *     shell #1 · spec #1 · AGREE.
 *   Mutant M2: drop `in_inside { next }` from the awk, so the project's STALE
 *     region content survives beside the blueprint's.
 *     shell #1 · spec #1 · AGREE.
 *   Mutant M3: delete the `[ "$bp_begin" -ne "$proj_begin" ]` arm of the
 *     structural guard.
 *     shell PASSES · spec #2 · THE PORT IS STRICTER, and #2 is why it exists.
 *   Mutant M4: make that guard `return 0` instead of `return 1`.
 *     shell PASSES · spec #2 · THE PORT IS STRICTER.
 *   Control M5: the healthy tree. Both PASS.
 *   Control M6: the three fixtures with their markers inverted. Both FAIL — on
 *     the byte comparison, because the oracle was inverted too. This is a
 *     fixture-corruption control (neither implementation is blind to its own
 *     data changing), NOT the BUG-034 probe. See below for that.
 *   Control L1: a comment elsewhere in the tree that MENTIONS both marker
 *     strings without using them. Both PASS — the merge is not tricked by prose,
 *     which is the shape BUG-052 came from one file over.
 *
 * M3 AND M4 ARE THE JUSTIFICATION FOR ADDING #2, stated because a tightening
 * needs one: the shell suite exercised only the happy path, so the structural
 * guard it carries had never been observed firing, and BOTH of its arms could be
 * deleted with the suite still green. That is R6's own case — a guard seen only
 * not-firing proves nothing — and it is one arm away from BUG-034.
 *
 * WHAT NEITHER IMPLEMENTATION COVERS — recorded, not fixed here. A file whose
 * `BLUEPRINT:END` precedes its `BLUEPRINT:BEGIN` has counts 1 and 1, passes
 * every arm of the guard, and reaches an awk that tracks the region backwards.
 * That is BUG-034, open and parked in docs/backlog/BUGS.md. It is in this
 * suite's perturbation population and BOTH implementations pass it. No case
 * below asserts it, deliberately: a spec that asserted the correct behaviour
 * would be red on `main`, and one that asserted the current behaviour would pin
 * the defect. The row is the right home for it until it is fixed, and the fix
 * arrives with its own reproducer (the row says so).
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const CLI = join(REPO_ROOT, 'scripts/blueprint')
const FIXTURES = join(REPO_ROOT, 'tests/marker-merge')

async function initRepo(s: Scenario, dir: string) {
  await s.run('git', ['init', '-q', '-b', 'main', '.'], { cwd: dir })
  await s.run('git', ['config', 'user.email', 't@local'], { cwd: dir })
  await s.run('git', ['config', 'user.name', 't'], { cwd: dir })
  await s.run('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir })
  await s.run('git', ['add', '-A'], { cwd: dir })
  await s.run('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir })
}

/**
 * A blueprint holding ONE marker-bearing managed file, plus the suite directory
 * `tests/` is a managed DIRECTORY whose expansion is fail-closed (BUG-029), so a
 * fixture blueprint with no suites at HEAD is refused before pull does anything.
 */
async function fixtureBlueprint(s: Scenario, tag: string, upstreamFile: string) {
  const bp = await s.workspace.dir(tag, 'bp')
  await s.fs.copyIn(join(FIXTURES, upstreamFile), join(bp, 'docs/mocks/README.md'))
  await s.fs.write(join(bp, 'tests/fixture/test.sh'), 'echo fixture\n')
  await initRepo(s, bp)
  return bp
}

/** A derived project whose copy of the managed file is `projectFile`. */
async function derivedProject(
  s: Scenario,
  tag: string,
  bp: string,
  projectFile: string,
) {
  const proj = await s.workspace.dir(tag, 'proj')
  await s.fs.copyIn(join(FIXTURES, projectFile), join(proj, 'docs/mocks/README.md'))
  const sha = (await s.run('git', ['rev-parse', 'HEAD'], { cwd: bp })).stdout.trim()
  await s.fs.write(
    join(proj, '.blueprint-source'),
    [
      'config_version   = 2',
      `blueprint_source = ${bp}`,
      `bootstrap_sha    = ${sha}`,
      'bootstrap_date   = 2026-01-01',
      '',
    ].join('\n'),
  )
  await initRepo(s, proj)
  return proj
}

describe('BP-7 — `blueprint pull` replaces the marker region and keeps the project half byte-identical', () => {
  it('#1 the merge produces the expected file byte-for-byte', async () => {
    await scenario('marker-merge-1', async (s) => {
      const bp = await fixtureBlueprint(s, 'a', 'fixture-blueprint.md')
      const proj = await derivedProject(s, 'a', bp, 'fixture-project-before.md')

      // NON-VACUITY, FIRST. The oracle is a third file on disk; if it ever
      // matched the project's BEFORE state, this case would pass without pull
      // having done anything at all — and it would keep passing after the merge
      // was deleted entirely. The shell suite asserted only the final diff and
      // could not tell those apart.
      const before = await readFile(join(FIXTURES, 'fixture-project-before.md'), 'utf8')
      const expected = await readFile(
        join(FIXTURES, 'fixture-project-after-expected.md'),
        'utf8',
      )
      const upstream = await readFile(join(FIXTURES, 'fixture-blueprint.md'), 'utf8')
      expect(expected, 'the oracle equals the pre-pull state — the case is vacuous').not.toBe(before)
      expect(expected, 'the oracle equals the blueprint copy — a whole-file cp would pass').not.toBe(upstream)

      const r = await s.run(CLI, ['pull', 'docs/mocks/README.md', '--yes'], { cwd: proj })
      expect(r.code, r.output).toBe(0)

      const landed = await readFile(join(proj, 'docs/mocks/README.md'), 'utf8')
      expect(landed).toBe(expected)
    })
  })

  it('#2 a region-count mismatch is refused into a backup rather than merged', async () => {
    await scenario('marker-merge-2', async (s) => {
      // The structural guard's whole purpose: when the two files do not agree
      // on how many regions there are, the awk cannot align them, so pull must
      // fall back to a whole-file copy AND leave the project's version
      // recoverable. Without the backup this path is indistinguishable from the
      // BP-7 defect it replaces.
      //
      // Added by the port. The shell suite exercised only the happy path, so
      // nothing asserted that the guard it carries does anything — and a guard
      // that has only ever been seen not firing is the R6 case exactly.
      const bp = await s.workspace.dir('b', 'bp')
      await s.fs.write(
        join(bp, 'docs/mocks/README.md'),
        [
          'project keeps this',
          '<!-- BLUEPRINT:BEGIN -->',
          'region one from the blueprint',
          '<!-- BLUEPRINT:END -->',
          '<!-- BLUEPRINT:BEGIN -->',
          'region two from the blueprint',
          '<!-- BLUEPRINT:END -->',
          '',
        ].join('\n'),
      )
      await s.fs.write(join(bp, 'tests/fixture/test.sh'), 'echo fixture\n')
      await initRepo(s, bp)

      const projBody = [
        'MY OWN CONTENT, which must survive somewhere',
        '<!-- BLUEPRINT:BEGIN -->',
        'stale',
        '<!-- BLUEPRINT:END -->',
        '',
      ].join('\n')
      const proj = await s.workspace.dir('b', 'proj')
      await s.fs.write(join(proj, 'docs/mocks/README.md'), projBody)
      const sha = (await s.run('git', ['rev-parse', 'HEAD'], { cwd: bp })).stdout.trim()
      await s.fs.write(
        join(proj, '.blueprint-source'),
        [
          'config_version   = 2',
          `blueprint_source = ${bp}`,
          `bootstrap_sha    = ${sha}`,
          'bootstrap_date   = 2026-01-01',
          '',
        ].join('\n'),
      )
      await initRepo(s, proj)

      const r = await s.run(CLI, ['pull', 'docs/mocks/README.md', '--yes'], { cwd: proj })
      expect(r.code, r.output).toBe(0)
      expect(r.output).toMatch(/marker structure mismatch/)

      // The project's bytes are recoverable, exactly, from the backup.
      const backup = await readFile(join(proj, 'docs/mocks/README.md.bp-bak'), 'utf8')
      expect(backup).toBe(projBody)
      // And the file itself is now the blueprint's — both regions present, so a
      // silently-dropped region cannot hide here either.
      const landed = await readFile(join(proj, 'docs/mocks/README.md'), 'utf8')
      expect(landed).toContain('region one from the blueprint')
      expect(landed).toContain('region two from the blueprint')
    })
  })
})
