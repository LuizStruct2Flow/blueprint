/**
 * tests/manifest/manifest.spec.ts — BUG-005, and BUG-074.
 *
 * WHAT THIS SUITE IS. Not a test of product behaviour: a META-CONTROL. It
 * derives the suite set from the filesystem, then asserts every suite is
 * invoked by the gate and by CI, and that `.gitattributes`'s declared export
 * boundary matches what `git archive` actually produces. The reasoning for each
 * check lives beside it in `manifest.ts`, which is where the check is.
 *
 * WHY EVERY CHECK HAS A FIXTURE CASE. The live cases at the bottom run over the
 * real repo, where everything passes — and a control that has only ever been
 * seen passing proves nothing about what it would say over a broken tree. That
 * is TASK-018-RULES R6, and it is not hypothetical here: `a2bp-contamination`'s
 * headline assertion was dead for months, printing its failure 28 times and
 * still exiting 0. So every check below is first shown RED, on a synthetic tree
 * carrying exactly the defect it exists to catch, with the baseline asserted
 * green in the same file so a red case cannot be red for some other reason.
 *
 * EQUIVALENCE RECORD (R6, and the migration's own evidence).
 *
 * "Ported" is a claim, so it was measured rather than reviewed. Twenty-one
 * perturbed trees — the ones below, plus the real repo — were built once and
 * BOTH implementations run over each: the retiring `tests/manifest/test.sh`,
 * wired into the fixture as an ordinary suite, and `inspect()`. The per-check
 * verdict SETS were compared mechanically. They agreed on all twenty-two
 * inputs.
 *
 * Three differences exist and are recorded rather than smoothed over:
 *
 *   - BUG-074, the one behavioural divergence, and it is a defect in the SHELL
 *     version. It could only discover a bridge whose `source` line was
 *     INDENTED, so an unindented one made #4 fail for the wrong reason and made
 *     #2c skip that bridge entirely — fail-OPEN, which is the half that
 *     matters. Two cases below pin the fix. Every source line in this repo's
 *     hooks happens to be indented, which is why it stayed latent.
 *   - `#9` / `#9a` / `#9b` DO NOT EXIST HERE, and cannot. The shell version
 *     re-ran itself with node/npm/npx/tsc/vitest poisoned and asserted it
 *     invoked none of them, so that a project with no toolchain still got a
 *     truthful answer out of its own coverage control. A vitest spec cannot
 *     assert that about itself. What stands in its place is
 *     `scripts/run-ts-suites.sh` BLOCKING rather than skipping when `npx` or
 *     `tests/node_modules` is absent: no answer and no push, instead of a wrong
 *     answer believed. That is weaker, and saying so is the point.
 *   - The shell version interpolated suite names into regexes unescaped, so a
 *     suite named `a.b` would have matched `axb` in #4/#5. Ported escaped. No
 *     suite name in this repo or in any fixture carries a metacharacter, so no
 *     verdict differed; noted because a silent tightening is still a change.
 */

import { describe, it, expect } from 'vitest'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import { inspect, type CheckResult } from './manifest.js'
import {
  baselineTree,
  gateFor,
  materialize,
  workflowFor,
  BP_ONLY_SUITE,
  SHELL_SUITES,
  TS_SUITE,
} from './fixture.js'

/** The ids of the checks that FAILED — the verdict, in one comparable shape. */
const red = (checks: CheckResult[]): string[] => checks.filter((c) => !c.ok).map((c) => c.id)

/** The failure text for one check, for asserting the message names the culprit. */
const why = (checks: CheckResult[], id: string): string =>
  checks.find((c) => c.id === id && !c.ok)?.message ?? `(#${id} did not fail)`

/**
 * Build a perturbed tree and inspect it.
 *
 * `mutate` receives the healthy file map and the post-commit overlay. Returning
 * nothing and mutating in place keeps each case's perturbation to the one or
 * two lines that ARE the perturbation.
 */
async function inspectFixture(
  s: Scenario,
  name: string,
  mutate: (files: Map<string, string>, postCommit: Map<string, string | null>) => void = () => {},
): Promise<CheckResult[]> {
  const files = await baselineTree()
  const postCommit = new Map<string, string | null>()
  mutate(files, postCommit)
  const root = await materialize(s, name, files, postCommit)
  return inspect(root, s.run)
}

describe('BUG-005 — every runner on disk is invoked, and the export boundary behaves as declared', () => {
  it('#0 the healthy fixture passes every check — without which no case below means anything', async () => {
    await scenario('manifest-baseline', async (s) => {
      const checks = await inspectFixture(s, 'bp')

      expect(red(checks), checks.map((c) => `${c.ok ? 'ok' : 'FAIL'} ${c.message}`).join('\n')).toEqual([])
      // NON-VACUITY OF THE FIXTURE ITSELF. Every check passes trivially over a
      // tree with no suites in it, which is the exact failure mode this whole
      // suite exists to refuse — so the baseline has to be seen doing work.
      expect(checks.map((c) => c.id)).toEqual(['#1', '#1b', '#2b', '#2c', '#4', '#5', '#7', '#7b'])
      expect(why(checks, 'nothing')).toBe('(#nothing did not fail)')
    })
  })

  it('a missing scripts/lib/suites.sh REFUSES to judge, rather than passing over zero suites', async () => {
    await scenario('manifest-nolib', async (s) => {
      // The vacuity #7 exists to catch, one step earlier and with the right
      // culprit named: with no derivation every assertion passes trivially, and
      // #7 would blame the tree rather than the absent file.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.delete('scripts/lib/suites.sh')
      })

      expect(red(checks)).toEqual(['suites-lib'])
      expect(why(checks, 'suites-lib')).toContain('blueprint pull scripts/lib/suites.sh')
    })
  })

  it('#1 a runner sitting directly in tests/ belongs to no suite, so it executes nowhere', async () => {
    await scenario('manifest-1', async (s) => {
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set('tests/orphan.sh', 'echo nothing invokes me\n')
      })

      expect(red(checks)).toEqual(['#1'])
      expect(why(checks, '#1')).toContain('tests/orphan.sh')
    })
  })

  it('#1b a shared helper no suite sources is dead code the helpers exemption would hide', async () => {
    await scenario('manifest-1b', async (s) => {
      // A helper is exempt from being a suite because it is SOURCED rather than
      // run. That exemption is a place to hide code unless something asserts
      // the sourcing actually happens.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set('tests/helpers/nobody-sources-me.sh', 'true\n')
      })

      expect(red(checks)).toEqual(['#1b'])
      expect(why(checks, '#1b')).toContain('nobody-sources-me.sh')
    })
  })

  it('#2b a suite declared blueprint-only that nevertheless SHIPS is caught (BUG-028)', async () => {
    await scenario('manifest-2b-shipped', async (s) => {
      // The tier is read from the working tree; the archive is HEAD. Adding the
      // line after the commit is how "declared blueprint-only, ships anyway"
      // becomes expressible — and it is also the real shape, since the
      // manifest runs at pre-push over a boundary someone has just edited.
      const checks = await inspectFixture(s, 'bp', (files, post) => {
        post.set('.gitattributes', `${files.get('.gitattributes') ?? ''}tests/s01/   export-ignore\n`)
      })

      expect(red(checks)).toEqual(['#2b'])
      expect(why(checks, '#2b')).toContain('s01')
      expect(why(checks, '#2b')).toContain('NOT COMMITTED')
    })
  })

  it('#2b a suite that ships its directory but NOT its runner is hollow, and the derived gate skips it silently', async () => {
    await scenario('manifest-2b-hollow', async (s) => {
      const checks = await inspectFixture(s, 'bp', (files) => {
        // A sibling file so the DIRECTORY still arrives — `grep "^tests/s02/"`
        // used to call that a healthy boundary while the recipient's
        // `if [ -f tests/s02/test.sh ]` guard skipped the suite in silence.
        files.set('tests/s02/README.md', 'a sibling that ships\n')
        files.set('.gitattributes', `${files.get('.gitattributes') ?? ''}tests/s02/test.sh   export-ignore\n`)
      })

      expect(red(checks)).toEqual(['#2b'])
      expect(why(checks, '#2b')).toContain('s02(0/1 shell)')
    })
  })

  it('#2b a suite with no blueprint-only line whose files never arrive is a silent cut for every project but this one', async () => {
    await scenario('manifest-2b-withheld', async (s) => {
      // `tests/s03/**` is NOT a tier declaration — the derivation requires a
      // directory-level `tests/<suite>/ export-ignore`. So the suite is `both`
      // and nothing of it ships: caught by a broad pattern elsewhere in the
      // file is exactly the accident this branch is for.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set('.gitattributes', `${files.get('.gitattributes') ?? ''}tests/s03/**   export-ignore\n`)
      })

      expect(red(checks)).toEqual(['#2b'])
      expect(why(checks, '#2b')).toContain('s03')
    })
  })

  it('#2b + #2c specs that ship while the whole TS toolchain does not are runners the recipient cannot execute (BUG-073)', async () => {
    await scenario('manifest-2b-unrunnable', async (s) => {
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          '.gitattributes',
          `${files.get('.gitattributes') ?? ''}` +
            'tests/package.json   export-ignore\n' +
            'tests/package-lock.json   export-ignore\n' +
            'tests/tsconfig.json   export-ignore\n' +
            'tests/vitest.config.ts   export-ignore\n' +
            'tests/harness/   export-ignore\n',
        )
      })

      expect(red(checks)).toEqual(['#2b', '#2c'])
      expect(why(checks, '#2b')).toContain(`${TS_SUITE}(1 spec)`)
      expect(why(checks, '#2c')).toContain('BUG-073')
    })
  })

  it('#2c a toolchain that ships in PART is worse than none — the CI job is MANAGED and runs npm ci (BUG-061)', async () => {
    await scenario('manifest-2c-partial', async (s) => {
      // package-lock.json ALONE once shipped for the whole of phase 1, because
      // nothing listed it and the check computed the toolchain from a
      // hand-written subset that also omitted it. Here the omission is
      // inverted — one file withheld — and the partial-ship tally catches it
      // either way, which is the property that closes the class.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          '.gitattributes',
          `${files.get('.gitattributes') ?? ''}tests/package-lock.json   export-ignore\n`,
        )
      })

      expect(red(checks)).toEqual(['#2b', '#2c'])
      expect(why(checks, '#2c')).toContain('ships in PART')
      expect(why(checks, '#2c')).toContain('tests/package-lock.json')
    })
  })

  it('#2c the harness arriving in PART leaves every shipped spec importing a module that is not there', async () => {
    await scenario('manifest-2c-harness', async (s) => {
      // The toolchain check is satisfied by ONE file under tests/harness/ — a
      // one-file proxy for a whole directory, which is the shape BUG-061 walked
      // through. Both sides are read off the filesystem so a harness file added
      // tomorrow is covered with nothing to remember.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          '.gitattributes',
          `${files.get('.gitattributes') ?? ''}tests/harness/canary.ts   export-ignore\n`,
        )
      })

      expect(red(checks)).toEqual(['#2c'])
      expect(why(checks, '#2c')).toContain('tests/harness/canary.ts')
    })
  })

  it('#2c a toolchain that ships with NO spec to run means every project pays npm ci for nothing', async () => {
    await scenario('manifest-2c-runner-alone', async (s) => {
      // The phase-2 mirror image, and it is deliberately not symmetric with the
      // phase-1 pass: the invariant is an IFF — the toolchain ships BECAUSE a
      // shipping suite is TypeScript. Reachable by an ordinary edit, and
      // without this branch #2c would print "phase 2 is whole" over a toolchain
      // that ships for nothing, which is a check going green for the wrong
      // reason.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.delete(`tests/${TS_SUITE}/${TS_SUITE}.spec.ts`)
      })

      expect(red(checks)).toEqual(['#2c'])
      expect(why(checks, '#2c')).toContain('NO *.spec.ts')
    })
  })

  it('#2c refuses to judge when MANAGED_FILES cannot be parsed, rather than passing vacuously', async () => {
    await scenario('manifest-2c-vacuous', async (s) => {
      // A textual parse can go stale in silence, and stale here would pass
      // vacuously — which is the failure mode the whole check exists to
      // prevent. So the parse asserts its own non-vacuity first.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set('scripts/blueprint', '#!/bin/sh\nMANAGED_FILES=(\n  "CLAUDE.md"\n)\n')
      })

      expect(red(checks)).toEqual(['#2c'])
      expect(why(checks, '#2c')).toContain('parsed 1 entries')
    })
  })

  it('#2c a bridge the managed hook sources must travel by BOTH propagation paths or by neither', async () => {
    await scenario('manifest-2c-bridge', async (s) => {
      // ships=1,managed=0 means a NEW project gets the bridge and freezes it
      // forever, while an EXISTING project that pulls the hook never receives
      // it at all — its gate takes the `else` branch and pipe_skips that stage
      // on every push, permanently, with a reason that reads as deliberate.
      const checks = await inspectFixture(s, 'bp', (files) => {
        const bp = files.get('scripts/blueprint') ?? ''
        files.set('scripts/blueprint', bp.replace('  "scripts/run-ts-suites.sh"\n', ''))
      })

      expect(red(checks)).toEqual(['#2c'])
      expect(why(checks, '#2c')).toContain('scripts/run-ts-suites.sh(ships=1,managed=0)')
    })
  })

  it('#4 a suite whose gate stage is DELETED is named, and the suites still wired in are not', async () => {
    await scenario('manifest-4-dropped', async (s) => {
      // This is the case tests/suite-sync used to reach across into this suite's
      // shell runner to assert: the blueprint drops a suite, pull deliberately
      // leaves the orphan in place, and the control that already exists names
      // it. Both halves are pinned — s04 named, s05 not.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          '.githooks/pre-push-project',
          `${gateFor(SHELL_SUITES.filter((x) => x !== 's04'))}\n`,
        )
      })

      expect(red(checks)).toEqual(['#4'])
      expect(why(checks, '#4')).toContain('s04(shell runner never invoked)')
      expect(why(checks, '#4')).not.toContain('s05')
    })
  })

  it('#4 COMMENTING OUT a stage stops the suite running, and is not readable as an invocation (Codex R2-F1b)', async () => {
    await scenario('manifest-4-commented', async (s) => {
      // Membership was once checked with an unanchored grep for the path, so
      // `sed -i '/tests\\/pipeline/s/^/#/' .githooks/pre-push*` left this
      // passing "every suite is invoked by the gate" while the suite had
      // stopped running. Comments are stripped before anything is matched.
      const checks = await inspectFixture(s, 'bp', (files) => {
        const g = files.get('.githooks/pre-push-project') ?? ''
        files.set(
          '.githooks/pre-push-project',
          g.replace('bash tests/s06/test.sh', '# bash tests/s06/test.sh'),
        )
      })

      expect(red(checks)).toEqual(['#4'])
      expect(why(checks, '#4')).toContain('s06(shell runner never invoked)')
    })
  })

  it('#4 a PATH-FILTERED vitest run in the bridge proves nothing about the suites it does not name', async () => {
    await scenario('manifest-4-filtered', async (s) => {
      // Link 3 of the chain. `vitest run tsone` must not be readable as "every
      // suite is invoked" — that is the whole distinction the classifier draws.
      const checks = await inspectFixture(s, 'bp', (files) => {
        const b = files.get('scripts/run-ts-suites.sh') ?? ''
        files.set('scripts/run-ts-suites.sh', b.replace('npx vitest run', 'npx vitest run tsone'))
      })

      expect(red(checks)).toEqual(['#4'])
      expect(why(checks, '#4')).toContain(`${TS_SUITE}(no vitest stage in .githooks/pre-push*)`)
    })
  })

  it('#4 removing the bridge the hook sources breaks the chain even though the stage text is untouched', async () => {
    await scenario('manifest-4-nobridge', async (s) => {
      // Link 2. An absent bridge is pipe_skipped at runtime — a skip carries a
      // reason and is still not running, so it must FAIL a blocking suite
      // rather than pass it. #2c goes red alongside, because the hook now
      // sources nothing while MANAGED_FILES still promises the file.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.delete('scripts/run-ts-suites.sh')
      })

      expect(red(checks)).toEqual(['#4'])
      expect(why(checks, '#4')).toContain(TS_SUITE)
    })
  })

  it('#4 and #5 narrowing the vitest include glob is a coverage cut every other link stays green through', async () => {
    await scenario('manifest-4-include', async (s) => {
      // Link 4. The config sits inside tests/, which is vitest's root, so a
      // tests-prefixed glob matches nothing at all — and the gate, the bridge
      // and the spec file are all still exactly where they were.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          'tests/vitest.config.ts',
          "export default { test: { include: ['tests/**/*.spec.ts'] } }\n",
        )
      })

      expect(red(checks)).toEqual(['#4', '#5'])
      expect(why(checks, '#4')).toContain('include no longer covers')
      expect(why(checks, '#5')).toContain('include no longer covers')
    })
  })

  it('#5 a suite the workflow never runs is caught even when the gate runs it (A-15)', async () => {
    await scenario('manifest-5', async (s) => {
      // `drift-in-blueprint` was found running in NEITHER; `a2bp-e2e` was
      // gate-only, so CI carried no backstop. The two checks are independent
      // for that reason.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          '.github/workflows/security.yml',
          `${workflowFor(SHELL_SUITES.filter((x) => x !== 's07'))}\n`,
        )
      })

      expect(red(checks)).toEqual(['#5'])
      expect(why(checks, '#5')).toContain('s07(shell runner)')
    })
  })

  it('#7 a derivation finding almost no suites fails, because every check above would pass over it', async () => {
    await scenario('manifest-7', async (s) => {
      const checks = await inspectFixture(s, 'bp', (files) => {
        for (const s2 of SHELL_SUITES.slice(2)) files.delete(`tests/${s2}/test.sh`)
        files.delete(`tests/${TS_SUITE}/${TS_SUITE}.spec.ts`)
        files.set('.githooks/pre-push-project', `${gateFor(SHELL_SUITES.slice(0, 2))}\n`)
        files.set('.github/workflows/security.yml', `${workflowFor(SHELL_SUITES.slice(0, 2))}\n`)
      })

      // #2c goes red too, and legitimately: the toolchain ships with no spec
      // left to run. #7 is the one being demonstrated.
      expect(red(checks)).toContain('#7')
      expect(why(checks, '#7')).toContain('derived only 3 suites')
    })
  })

  it('#7b unbalanced markers make pull CLOBBER the file instead of merging it (BUG-052)', async () => {
    await scenario('manifest-7b', async (s) => {
      // The counts are of SUBSTRINGS, so a sentence explaining "put your rows
      // after BLUEPRINT:END" counts as an END. Both managed marker files in the
      // real repo were in that state for their whole lives, so neither had ever
      // been marker-merged and every derived project's own gate guards were
      // being replaced on every pull.
      const checks = await inspectFixture(s, 'bp', (files) => {
        const g = files.get('.githooks/pre-push-project') ?? ''
        files.set('.githooks/pre-push-project', `${g}\n# put your own guards after BLUEPRINT:END\n`)
      })

      expect(red(checks)).toEqual(['#7b'])
      expect(why(checks, '#7b')).toContain('.githooks/pre-push-project(1 BEGIN/2 END)')
    })
  })

  it('BUG-074 a bridge sourced at column 0 is still discovered, so #2c does not silently skip it', async () => {
    await scenario('manifest-bug074', async (s) => {
      // THE DEFECT THE PORT REMOVED, kept as a case because nothing else would
      // notice it coming back. The retired shell control stripped a discovered
      // `source` line with a pattern that required whitespace BEFORE the dot,
      // so an unindented `. ./scripts/run-ts-suites.sh` was never resolved to a
      // file. Two consequences, and the second is the dangerous one: #4 failed
      // for the wrong reason, and #2c's ships-⟺-managed check skipped that
      // bridge with nothing said. Measured against both implementations on this
      // exact tree during the migration — shell red on #4, this one green.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          '.githooks/pre-push-project',
          (files.get('.githooks/pre-push-project') ?? '').replace(
            '  . ./scripts/run-ts-suites.sh',
            '. ./scripts/run-ts-suites.sh',
          ),
        )
      })

      // Nothing about this gate is broken: the bridge is sourced, called, and
      // still holds the blanket run.
      expect(red(checks)).toEqual([])
    })
  })

  it('BUG-074 and the bridge is still judged by #2c when it is sourced at column 0', async () => {
    await scenario('manifest-bug074-2c', async (s) => {
      // The half that failed OPEN. An undiscovered bridge is an unchecked
      // bridge, so the same unindented source line PLUS a ships/managed split
      // must still be caught — otherwise the case above only proves #4 recovered.
      const checks = await inspectFixture(s, 'bp', (files) => {
        files.set(
          '.githooks/pre-push-project',
          (files.get('.githooks/pre-push-project') ?? '').replace(
            '  . ./scripts/run-ts-suites.sh',
            '. ./scripts/run-ts-suites.sh',
          ),
        )
        files.set(
          'scripts/blueprint',
          (files.get('scripts/blueprint') ?? '').replace('  "scripts/run-ts-suites.sh"\n', ''),
        )
      })

      expect(red(checks)).toEqual(['#2c'])
      expect(why(checks, '#2c')).toContain('scripts/run-ts-suites.sh(ships=1,managed=0)')
    })
  })

  it('a suite ships nothing but its runner arrives — the blueprint-only tier is honoured in the healthy tree', async () => {
    await scenario('manifest-bponly', async (s) => {
      // The positive half of #2b, which no perturbation above exercises: the
      // declared blueprint-only suite must be ABSENT from the archive while
      // still being derived, invoked and counted. If the fixture's
      // export-ignore silently stopped working every #2b case would still pass.
      const files = await baselineTree()
      const root = await materialize(s, 'bp', files)
      const listing = await s.run(
        'sh',
        ['-c', 'git -C "$1" archive --format=tar HEAD | tar -t', 'sh', root],
        { cwd: root },
      )

      expect(listing.stdout).toContain(`tests/${SHELL_SUITES[0]}/test.sh`)
      expect(listing.stdout).not.toContain(`tests/${BP_ONLY_SUITE}/`)
    })
  })
})

describe('BUG-005 — THE REAL TREE', () => {
  it('#live every check passes over this checkout, over a non-vacuous suite set', async () => {
    await scenario('manifest-live', async (s) => {
      // Read-only over the real tree: the whole point is to fail the push when
      // the gate, CI and the export boundary have come apart, so pointing it at
      // a fixture would make it a restatement of the cases above that guards
      // nothing.
      const checks = await inspect(REPO_ROOT, s.run)
      const report = checks.map((c) => `${c.ok ? '  ok — ' : 'FAIL: '}${c.message}`).join('\n')

      expect(red(checks), report).toEqual([])

      // THE CHECK IDS THAT MUST HAVE BEEN ANSWERED — because "everything
      // passed" and "nothing was asked" render identically, which is BUG-066's
      // shape and the thing this whole suite exists to refuse.
      //
      // THE SET DEPENDS ON WHICH TREE THIS IS, and that is not a loophole: #2b
      // and #2c police an EXPORT BOUNDARY, which only a blueprint has. A
      // derived project has no `.blueprint-root`, so those two do not apply and
      // must not be demanded — the shell version this replaces skipped them the
      // same way, and demanding them downstream is precisely the BUG-028 class
      // (a blueprint-only obligation shipped to projects that cannot meet it).
      // What IS demanded either way is that the answer be complete FOR THIS
      // TREE, so a blueprint quietly reporting six checks fails here.
      const inBlueprint = await s.run('sh', ['-c', 'test -f "$1/.blueprint-root"', 'sh', REPO_ROOT], {
        cwd: REPO_ROOT,
      })
      const expected =
        inBlueprint.code === 0
          ? ['#1', '#1b', '#2b', '#2c', '#4', '#5', '#7', '#7b']
          : ['#1', '#1b', '#4', '#5', '#7', '#7b']
      expect(checks.map((c) => c.id), report).toEqual(expected)

      // And #2b's own precondition is reachable rather than merely assumed: an
      // unreadable archive reports "#2b could not archive HEAD" and would have
      // been caught above, so its ABSENCE from the red list means the archive
      // was genuinely read.
      expect(checks.find((c) => c.id === '#2b')?.message ?? '').not.toContain('could not archive')
    })
  })
})
