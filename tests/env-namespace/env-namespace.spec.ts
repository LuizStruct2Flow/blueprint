/**
 * tests/env-namespace/env-namespace.spec.ts — BUG-006.
 *
 * A managed file carries a project-specific env-var namespace, and every
 * derived project inherits configuration named after somebody else's repo. The
 * reasoning lives beside the checks in `env-namespace.ts`; this file is the
 * population that proves each one can fail.
 *
 * EQUIVALENCE RECORD (TASK-018-RULES R6).
 *
 * TEN trees — eight perturbed, a healthy baseline, and the real repository —
 * were built once and BOTH implementations run over each: the retiring
 * `tests/env-namespace/test.sh`, copied into the fixture with a stub
 * `scripts/blueprint` whose `files` verb prints the fixture's managed list, and
 * `scanEnvNamespace()`. The per-case verdicts (#1, #2, #3) were compared
 * mechanically. **They agreed on all ten inputs**, and the `checked` count
 * matched on every one where the shell printed it.
 *
 * Two differences, recorded rather than smoothed over:
 *
 *   - THE CLI'S EXIT STATUS IS A SEPARATE CHECK HERE (`#files`), where the shell
 *     version made it an early `exit 1` before any case ran. Same behaviour —
 *     nothing is judged over a truncated population — but it now has an id, so
 *     the difference between "the scan is clean" and "the scan never happened"
 *     is legible in the verdict set rather than only in the absence of output.
 *     That distinction is the whole of BUG-029 R4 and of BUG-005.
 *   - The shell read the list through a leading-whitespace `sed` over the CLI's
 *     stdout and split on IFS whitespace; the port splits on newlines and trims.
 *     A managed
 *     path containing a space would differ — there is none, in this repo or in
 *     any fixture — and the port is the stricter of the two. Noted because a
 *     silent tightening is still a change.
 *
 * R6 NEGATIVE PROOF — per CASE, not per case GROUP.
 *
 * The record above compares VERDICT SETS between the shell suite and this
 * port. Three Codex reviews of neighbouring groups refused certification on
 * the same point: agreeing on `#3` does not say which of the cases NAMED `#3`
 * can be made red. So every `it()` here was put to the narrower question —
 * is there a perturbation OBSERVED to turn it red — and the answer is
 * recorded in docs/doing/TASK-018-R6-isolation/outputs/gap.txt, which names
 * the mutant(s) per case. The denominator comes from the runner rather than
 * from a grep, so the `it.each` tables are expanded rather than counted once.
 *
 * Twelve cases, twelve with an observed red. `#1 the FLOOR` needed its own
 * mutant: nothing else distinguishes it, because it is the case that draws
 * the line between "all clean" and "discovery found nothing", and only a
 * defect in the COUNT itself can cross it.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import {
  readsLwaAsPrimary,
  scanEnvNamespace,
  settableNames,
  type EnvNamespaceScan,
} from './env-namespace.js'

/** The floor below which a clean scan means "discovery is broken". */
const MIN_SCANNED = 5

/** A managed script with nothing wrong with it. */
const CLEAN_SCRIPT = [
  '#!/bin/sh',
  'max="${AGENT_FEED_MAX_LINES:-2000}"',
  'label="${BP_LABEL:-gate}"',
  'home="${HOME}/x"',
  '',
].join('\n')

async function scanTree(
  s: Scenario,
  name: string,
  files: Record<string, string>,
  managed: readonly string[],
): Promise<EnvNamespaceScan> {
  const root = await s.workspace.dir(name)
  for (const [rel, content] of Object.entries(files)) {
    await s.fs.write(join(name, rel), content)
  }
  return scanEnvNamespace(root, managed)
}

/** Six clean managed scripts — one over the non-vacuity floor. */
function healthyTree(): { files: Record<string, string>; managed: string[] } {
  const files: Record<string, string> = {
    // #3's subject. It must source the shared appender and hold no rotation.
    'scripts/log-activity.sh': `#!/bin/sh\n. "$root/scripts/lib/feed.sh"\nfeed_append "$1"\n`,
  }
  const managed = ['scripts/log-activity.sh']
  for (let i = 0; i < 5; i++) {
    const rel = `scripts/clean-${i}.sh`
    files[rel] = CLEAN_SCRIPT
    managed.push(rel)
  }
  // A non-script managed entry, to prove the filter narrows rather than counts.
  files['docs/DoD.md'] = 'a doc reading ${LWA_ANYTHING:-x} in prose\n'
  managed.push('docs/DoD.md')
  return { files, managed }
}

describe('BUG-006 — no managed file carries a project-specific env namespace', () => {
  it('#1+#2+#3 the healthy fixture is green, and is seen scanning a real population', async () => {
    await scenario('env-ns-baseline', async (s) => {
      const { files, managed } = healthyTree()
      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.offenders).toEqual([])
      expect(scan.lwaPrimary).toEqual([])
      expect(scan.rotationCopy).toBeNull()
      // Six scripts, not seven: docs/DoD.md is managed and is not scanned, so
      // its `${LWA_ANYTHING:-x}` is correctly invisible. Prose about a name is
      // not a namespace.
      expect(scan.checked).toBe(6)
      expect(scan.checked).toBeGreaterThanOrEqual(MIN_SCANNED)
    })
  })

  it('#1 the ORIGINAL regression — an LWA_ knob in a file that travels', async () => {
    await scenario('env-ns-1-lwa', async (s) => {
      const { files, managed } = healthyTree()
      files['scripts/clean-0.sh'] = `#!/bin/sh\nmax="\${LWA_FEED_MAX_LINES:-2000}"\n`

      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.offenders).toEqual(['scripts/clean-0.sh:LWA_FEED_MAX_LINES'])
      // And #2 names it too — the two checks overlap deliberately, because #1 is
      // the generic rule and #2 is the specific regression that taught it.
      expect(scan.lwaPrimary).toEqual(['scripts/clean-0.sh'])
    })
  })

  it('#1 any non-generic prefix is caught, not just the one that caused the bug', async () => {
    await scenario('env-ns-1-generic', async (s) => {
      const { files, managed } = healthyTree()
      // The point of a generic guard: the NEXT set of initials costs nothing to
      // catch. Four of these have been found by hand in this repo.
      files['scripts/clean-1.sh'] = `#!/bin/sh\nx="\${REDCARE_TICK:-5}"\n`

      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.offenders).toEqual(['scripts/clean-1.sh:REDCARE_TICK'])
    })
  })

  it('#1 an INTERNAL variable is not configuration and is not flagged', async () => {
    await scenario('env-ns-1-internal', async (s) => {
      const { files, managed } = healthyTree()
      // `ROOT`, `TICK`, `C_BOLD`: assigned, never read with a default, so a
      // derived project cannot set them. The first version of this guard
      // reported sixty of these, which is how a guard gets ignored.
      files['scripts/clean-2.sh'] = [
        '#!/bin/sh',
        'ROOT="$(pwd)"',
        'C_BOLD=$(printf "\\033[1m")',
        'TICK=5',
        'echo "$ROOT $C_BOLD $TICK"',
        '',
      ].join('\n')

      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.offenders).toEqual([])
    })
  })

  it('#1 a name inside a COMMENT is an incident record, not a namespace', async () => {
    await scenario('env-ns-1-comment', async (s) => {
      const { files, managed } = healthyTree()
      // This repo's own files quote the defective names in their headers — see
      // the module docstring, which names all three. A guard that read comments
      // would fire on every file that documents the bug it enforces.
      files['scripts/clean-3.sh'] =
        `#!/bin/sh\n# it used to read \${LWA_FEED_MAX_LINES:-2000}, which was the defect\ntrue\n`

      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.offenders).toEqual([])
      expect(scan.lwaPrimary).toEqual([])
    })
  })

  it('#2 a BACK-COMPAT fallback is allowed — a project that set the old name keeps its config', async () => {
    await scenario('env-ns-2-fallback', async (s) => {
      const { files, managed } = healthyTree()
      // `${AGENT_X:-${LWA_X:-default}}` reads the generic name FIRST. The
      // project-specific name survives only as a fallback, which is a migration
      // path rather than a namespace.
      files['scripts/clean-4.sh'] =
        `#!/bin/sh\nmax="\${AGENT_FEED_MAX_LINES:-\${LWA_FEED_MAX_LINES:-2000}}"\n`

      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.lwaPrimary).toEqual([])
      // #1 still sees the LWA_ name — the fallback is exempt from #2's
      // "primary source" rule, not from the namespace rule. Both verdicts are
      // what the shell produced, and the overlap is recorded rather than
      // reconciled, because reconciling it would change a verdict.
      expect(scan.offenders).toEqual(['scripts/clean-4.sh:LWA_FEED_MAX_LINES'])
    })
  })

  it('#1 the FLOOR is what separates "all clean" from "discovery found nothing"', async () => {
    await scenario('env-ns-1-floor', async (s) => {
      // A renamed CLI, a moved scripts/ directory, a typo in the glob: every one
      // of those produces an empty population and a green scan. The floor is the
      // only thing standing between the two, and it is asserted in the spec
      // rather than inside the scanner because it is a judgement about this
      // repo's size.
      const scan = await scanTree(s, 'bp', { 'scripts/one.sh': CLEAN_SCRIPT }, [
        'scripts/one.sh',
        'scripts/gone-a.sh',
        'scripts/gone-b.sh',
      ])

      expect(scan.offenders).toEqual([])
      expect(scan.checked).toBeLessThan(MIN_SCANNED)
    })
  })

  it('#3 log-activity.sh that does NOT source the shared appender is caught', async () => {
    await scenario('env-ns-3-unshared', async (s) => {
      const { files, managed } = healthyTree()
      files['scripts/log-activity.sh'] = `#!/bin/sh\necho "$1" >> "$log"\n`

      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.rotationCopy).toContain('does not source the shared appender')
    })
  })

  it('#3 a SECOND copy of the rotation is caught even when the appender is sourced', async () => {
    await scenario('env-ns-3-second-copy', async (s) => {
      const { files, managed } = healthyTree()
      // Sourcing the shared appender AND keeping the old trim is the shape that
      // actually drifts: a `mv`-based rotate in one copy orphans the feed
      // supervisor's open handle while the other stays correct.
      files['scripts/log-activity.sh'] = [
        '#!/bin/sh',
        '. "$root/scripts/lib/feed.sh"',
        'n=$(wc -l < "$log")',
        '',
      ].join('\n')

      const scan = await scanTree(s, 'bp', files, managed)

      expect(scan.rotationCopy).toContain('still contains its own rotation logic')
    })
  })

  it('#3 a MISSING log-activity.sh refuses to judge rather than passing', async () => {
    await scenario('env-ns-3-missing', async (s) => {
      const scan = await scanTree(s, 'bp', { 'scripts/clean.sh': CLEAN_SCRIPT }, [
        'scripts/clean.sh',
      ])

      expect(scan.rotationCopy).toContain('not found')
    })
  })

  it('the extractors themselves — the two predicates, on the exact strings that taught them', () => {
    // Unit-level, because these are the two places a silent narrowing would
    // hide: a regex that stops matching is not distinguishable from a tree that
    // stopped offending, and every case above is expressed through them.
    expect(settableNames('x="${LWA_FEED_MAX_LINES:-1}"')).toEqual(['LWA_FEED_MAX_LINES'])
    expect(settableNames('x="${AGENT_A:=1}"')).toEqual(['AGENT_A'])
    // Three characters after the first is the minimum length the shell required
    // (`[A-Z][A-Z0-9_]{3,}`), so a short name is invisible to BOTH. Recorded:
    // `${CI:-0}` and `${TZ:-x}` are not examined by either implementation.
    expect(settableNames('x="${CI:-0}"')).toEqual([])
    expect(settableNames('x="$LWA_FEED_LABEL"')).toEqual([])

    expect(readsLwaAsPrimary('x="${LWA_A:-1}"')).toBe(true)
    expect(readsLwaAsPrimary('x="${AGENT_A:-${LWA_A:-1}}"')).toBe(false)
    expect(readsLwaAsPrimary('# ${LWA_A:-1} was the defect')).toBe(false)
  })

  it('THE REAL REPO — every managed script keeps to a generic namespace', async () => {
    await scenario('env-ns-real', async (s) => {
      // #files — THE EXIT STATUS DECIDES, not the shape of the output.
      //
      // This was `managed=$(bash "$CLI" files | sed …)` guarded only by
      // `[ -n ]`, which covers a command that fails printing NOTHING and not one
      // that fails after printing SOME lines: the guard sees a non-empty string,
      // the scan runs over a truncated list, and every managed script the CLI
      // died before naming is silently unscanned — while the case reports "all N
      // managed scripts keep to generic env namespaces". Non-empty is not
      // success (BUG-029 R4). And the pipeline had to go with it: in `$(a | b)`
      // the status is b's, so `sed` would have reported success whatever the CLI
      // did.
      const listed = await s.run('bash', [join(REPO_ROOT, 'scripts/blueprint'), 'files'], {
        cwd: REPO_ROOT,
      })
      expect(
        listed.code,
        `'blueprint files' exited ${listed.code} — a partial listing would make ` +
          `the scan below pass over every file the CLI never named`,
      ).toBe(0)

      const managed = listed.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      expect(managed.length).toBeGreaterThan(20)

      const scan = await scanEnvNamespace(REPO_ROOT, managed)

      expect(
        scan.checked,
        `only ${scan.checked} managed scripts scanned — discovery is broken, so ` +
          `this proved nothing`,
      ).toBeGreaterThanOrEqual(MIN_SCANNED)
      expect(
        scan.offenders,
        `managed scripts define env vars outside the generic namespaces — these ` +
          `ship to every project: ${scan.offenders.join(' ')}`,
      ).toEqual([])
      expect(scan.lwaPrimary, scan.lwaPrimary.join(' ')).toEqual([])
      expect(scan.rotationCopy).toBeNull()
    })
  })
})
