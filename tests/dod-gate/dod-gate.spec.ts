/**
 * tests/dod-gate/dod-gate.spec.ts — TASK-007, and BUG-040 underneath it.
 *
 * The DoD checklist runs as pipeline stages so that its ABSENCE is visible in
 * the feed — the FEATURE-002 argument applied to docs/DoD.md §7. That only holds
 * if the stages actually FAIL when the thing they check is wrong. A stage that
 * always passes is worse than no stage, because it adds a green to the count.
 *
 * So every case here drives a REAL failure and asserts the stage catches it, and
 * every case that asserts a PASS is paired with the failure it must still catch.
 * That pairing is the whole design: `#2` is the case that would otherwise make
 * every run vacuous (a textual compare finds nothing, so nothing is ever
 * missing, so the stage always passes), and `#8` asserts the premise every other
 * case rests on — that `dod_items_in_push` extracts anything at all. On macOS it
 * extracted NOTHING, because BSD `sed` does not implement alternation inside
 * `\(…\)`, and three DoD rules were silently off on every Mac while the gate
 * printed PASSED. This repo's signature failure, sitting inside the guard that
 * enforces the Definition of Done.
 *
 * PORTED FROM tests/dod-gate/test.sh, WHICH STAYS IN THE GATE until the central
 * retirement pass.
 *
 * ONE DIVERGENCE, and it is a split rather than a change. The shell runner put
 * several independent assertions under one `#N` banner and let a shared `$W`
 * fixture carry state between them — `#4c` in particular asserted a PASS, then
 * MOVED the row, then asserted the FAIL, in one case. R5 forbids that shape
 * (each case must own what it reads), so each assertion is its own `it` with the
 * shell ID preserved and a suffix where the shell had none: `#4-tested`,
 * `#4c-promoted`. No assertion was added, dropped or weakened; the case COUNT
 * rises from 8 banners to 14 cases, which the conventions require to be
 * non-decreasing.
 *
 * Parallelism hazard: `#7` is `serial-global` in the narrow sense that it reads
 * the REAL `.githooks/pre-push-project` — read-only, never written, which is why
 * it is safe. Everything else builds its own fixture repo.
 *
 * EQUIVALENCE RECORD (R6, and the migration's own evidence).
 *
 * "Ported" is a claim, so it was measured rather than reviewed. Fifteen perturbed
 * trees were built and BOTH implementations run over each — the retiring
 * `tests/dod-gate/test.sh` and this spec — with the per-case verdict sets
 * compared mechanically. THE VERDICTS AGREED ON ALL FIFTEEN. The red sets are
 * OBSERVED, not predicted; where they differ textually it is the case SPLIT
 * described above, one shell banner mapping onto its named halves.
 *
 *   Mutant D1: BUG-040's EFFECT — make `dod_items_in_push` print nothing. (The
 *     defect itself is a BSD-sed BRE and cannot be injected on GNU sed by
 *     editing the expression, so what is reproduced is what it produced.)
 *     shell #1 #4 #4c #8 · spec #1 #4 #4c-promoted #8 · AGREE.
 *     THE GREEN SET IS THE FINDING: #2, #3, #4b, #5*, #6, #7 all stay green over
 *     an empty item list. Six cases pass over nothing, and only #8 names the
 *     cause — which is why "the existing cases DID catch it, three steps
 *     downstream" was not good enough.
 *   Mutant D2: drop the zero-padding strip, so `BUG#99` stops finding a
 *     `**BUG-099**` row.
 *     shell #2 #4c · spec #2 #4c · AGREE. The stage then calls every item
 *     missing, which is the LOUD direction — #2 is what stops the opposite fix
 *     (matching nothing, silently) from passing.
 *   Mutant D3: `return 0` instead of `return 1` on a missing backlog row.
 *     shell #1 · spec #1 · AGREE.
 *   Mutant D4: drop the `backlog` exemption entirely.
 *     shell #4c · spec #4c · AGREE — filing a bug becomes impossible, which
 *     blocked two real downstream bugs on 2026-08-05.
 *   Mutant D5: key the exemption on "a row exists anywhere" instead of on
 *     PARKED.
 *     shell #4 #4c · spec #4 #4c-promoted · AGREE, and this is the mutant that
 *     justifies splitting #4c: the shell banner goes red without saying which of
 *     its two opposite assertions broke.
 *   Mutant D6: require a regression test for TASK and FEATURE items too.
 *     shell #4b · spec #4b · AGREE — asserting a rule that does not exist trains
 *     people to ignore the stage.
 *   Mutant D7: stop failing on an absent OR malformed baton.
 *     shell #5 · spec #5-absent #5-rows · AGREE. The split earns itself here
 *     too: one banner becomes two named failures.
 *   Mutant D8: make `dod_stage_judgement` silent.
 *     shell #6 · spec #6 · AGREE — it exists to be VISIBLE, so silence is its
 *     only possible failure.
 *   Control D9: the healthy tree. Both PASS.
 *   Control L1: prose elsewhere in the lib MENTIONING `BUG#99` and `BUG-099`
 *     without any commit naming them. Both PASS — the extraction reads commit
 *     SUBJECTS, not the tree, and is not tricked by a comment.
 *
 * ROUND 2 — FIVE MORE MUTANTS. Jesko (QA-2) enumerated the cases the first ten
 * never reached: `#0`, `#3`, `#4-tested`, the well-formed `#5` and `#7` had names
 * and no recorded way to go red. Every one of them asserts a PASS, which is the
 * side of the pairing this file's own header says must be paired — so they were
 * exactly the cases least able to prove themselves. Observed:
 *
 *   Mutant D10: the lib is gone (#0).
 *     shell #0 · spec #0 and every other case · AGREE-fail. The spec's fixture
 *     copies the lib in, so its absence fails all fourteen — and that is the
 *     point #0 makes: without it the run reads as a broken fixture rather than a
 *     missing DoD gate.
 *   Mutant D11: a push carrying no item-bearing commits becomes a VIOLATION (#3).
 *     shell #3 · spec #3 · AGREE. The mirror image of D1: D1 passes vacuously
 *     over an empty item list, this refuses a legitimate merge-only push.
 *   Mutant D12: the regression-test search stops tolerating zero-padding, so a
 *     `BUG#42` commit no longer finds a test naming `BUG-042` (#4-tested).
 *     shell #4 · spec #4-tested · AGREE, via the split — the shell banner covers
 *     both halves and cannot say which one broke.
 *   Mutant D13: the baton validator demands a row no baton has (#5).
 *     shell #5 · spec #5 · AGREE. An over-strict gate fails every push and gets
 *     trained out, which is why the PASS case is load-bearing.
 *   Mutant D14: `.githooks/pre-push-project` never restores `AGENT_FEED_TAG`, so
 *     every stage after the DoD block renders as `[DoD-Gate]` (#7).
 *     shell #7 · spec #7 · AGREE.
 *
 * WHAT NEITHER IMPLEMENTATION COVERS, recorded rather than fixed:
 *   - `dod_stage_rows`'s `pipe_note "rows outside doing/"` branch. Both
 *     implementations stub `pipe_note` to a no-op, so a row in
 *     `waiting-acceptance/` is indistinguishable from one in `doing/` to every
 *     assertion here. The branch is advisory (it notes, it does not fail), which
 *     is why this is a gap and not a defect.
 */

import { describe, it, expect } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const LIB = 'scripts/lib/dod-gate.sh'
const SUBJECT_LIB = 'scripts/lib/commit-subject.sh'
const HOOK = join(REPO_ROOT, '.githooks/pre-push-project')

const BUGS_HEADER = '| # | Bug | Sev | Status | Detail |\n|---|---|---|---|---|\n'
const BACKLOG_HEADER = '| # | Item | Sev | Category | Trigger |\n|---|---|---|---|---|\n'
const LIFECYCLE = ['backlog', 'doing', 'waiting-acceptance', 'done'] as const

interface Fixture {
  /** The fixture repo's working tree. */
  dir: string
  /** The root commit — every range in this suite is `base..HEAD`. */
  base: string
}

async function git(s: Scenario, cwd: string, args: string[]) {
  return s.run('git', args, { cwd })
}

/**
 * A fixture repo carrying a lifecycle tree, so the lib's RELATIVE paths resolve.
 *
 * `dod-gate.sh` reads `docs/<state>/BUGS.md` and `tests/` with no root argument —
 * git runs hooks from the work-tree root, so the lib's cwd IS the project. That
 * is why the whole tree is built rather than just the files one case touches:
 * a missing `docs/done/BACKLOG.md` would make `dod_find_row` skip a folder, and
 * a skipped folder reads as "no row" — the vacuous direction.
 */
/**
 * TASK-039: `kind` is whose `tests/` this is. In the blueprint (`.blueprint-root`)
 * it holds the repo's own regression tests. In a derived project it holds the
 * suites the blueprint ships, which name the BLUEPRINT's bug numbers, so the
 * bug-test stage must not count them. Every pre-TASK-039 case models the
 * blueprint, which is the shape they were written against.
 */
async function build(s: Scenario, tag: string, kind: 'blueprint' | 'derived' = 'blueprint'): Promise<Fixture> {
  const dir = await s.workspace.dir(tag)
  await s.fs.copyIn(join(REPO_ROOT, LIB), join(dir, LIB))
  await s.fs.copyIn(join(REPO_ROOT, 'scripts/lib/state-dir.sh'), join(dir, 'scripts/lib/state-dir.sh'))
  await s.fs.copyIn(join(REPO_ROOT, SUBJECT_LIB), join(dir, SUBJECT_LIB))
  await s.fs.write(join(dir, kind === 'blueprint' ? '.blueprint-root' : '.blueprint-source'), `${kind}\n`)
  for (const state of LIFECYCLE) {
    await s.fs.write(join(dir, `docs/${state}/BUGS.md`), BUGS_HEADER)
    await s.fs.write(join(dir, `docs/${state}/BACKLOG.md`), BACKLOG_HEADER)
  }
  await s.fs.mkdirp(join(dir, 'tests/x'))
  await s.fs.write(
    join(dir, 'logs/state/signal.md'),
    '| Field | Value |\n|---|---|\n| Holder | X |\n| State | ACTIVE |\n| Task | t |\n',
  )

  await git(s, dir, ['init', '-q', '-b', 'main'])
  await git(s, dir, ['config', 'user.email', 't@e.com'])
  await git(s, dir, ['config', 'user.name', 't'])
  await git(s, dir, ['config', 'commit.gpgsign', 'false'])
  await s.fs.write(join(dir, 'f.txt'), 'seed\n')
  await git(s, dir, ['add', '-A'])
  await git(s, dir, ['commit', '-q', '-m', 'root'])
  const base = (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
  return { dir, base }
}

/** Add a commit whose subject names an item. */
async function commit(s: Scenario, f: Fixture, file: string, subject: string) {
  await s.fs.write(join(f.dir, file), `${file}\n`)
  await git(s, f.dir, ['add', '-A'])
  const r = await git(s, f.dir, ['commit', '-q', '-m', subject])
  expect(r.code, r.output).toBe(0)
}

async function appendRow(s: Scenario, f: Fixture, relPath: string, row: string) {
  const existing = await readFile(join(f.dir, relPath), 'utf8')
  await s.fs.write(join(f.dir, relPath), existing + row)
}

/**
 * Run one stage inside the fixture.
 *
 * `pipe_note` is stubbed: the lib calls it, and the real one lives in the
 * pipeline renderer, which `tests/pipeline` owns. The stub is also why the
 * `rows outside doing/` branch is uncovered here — noted in the docblock.
 */
async function runStage(s: Scenario, f: Fixture, fn: string, range: string, env: Record<string, string> = {}) {
  return s.run(
    'bash',
    ['-c', `pipe_note(){ :; }\n. ./${LIB}\n"$1" "$2"\n`, 'dod-stage', fn, range],
    { cwd: f.dir, env: { ...BATON_FROM_FIXTURE, ...env } },
  )
}

/**
 * Unset the baton pointers so the stage RESOLVES one instead of being handed one.
 *
 * The shell runner did this globally (`unset AGENT_SIGNAL_FILE AGENT_STATE_HOME`,
 * BUG-019) and the port initially did not — which the harness turned into a
 * silent vacuity worth recording. The harness sets `AGENT_SIGNAL_FILE` to the
 * scenario's OWN baton, so `dod_stage_signal` read that path, found no file, and
 * failed. `#5` caught it; `#5-rows` and `#5-absent` did NOT — they went green
 * because the baton was absent at the harness's path, not because of the defect
 * each one injects. Two of three cases passing for a reason unrelated to their
 * subject is the R6 class, produced by the migration itself.
 *
 * Unsetting does not weaken the isolation. `dod_stage_signal` resolves through
 * `bp_state_root`, which walks UP from `BP_CODE_ROOT="$(pwd)"` to the nearest
 * `.git` — the fixture's own, inside the workspace. HOME is per-scenario too, so
 * no fallback path can reach the operator's state either.
 */
const BATON_FROM_FIXTURE = {
  AGENT_SIGNAL_FILE: undefined,
  AGENT_STATE_HOME: undefined,
}

const rangeOf = (f: Fixture) => `${f.base}..HEAD`

describe('TASK-007 — the DoD prints as stages, and each one fails when it should', () => {
  it('#0 the DoD gate lib is present', async () => {
    // Not ceremony. Every case below sources it; if it were absent they would all
    // fail with a shell error naming a path, and nobody would read that as "the
    // lib is gone" — they would read it as a broken fixture.
    await expect(readFile(join(REPO_ROOT, LIB), 'utf8')).resolves.toContain('dod_items_in_push')
  })

  it('#1 an item with no backlog row fails, and the message names it', async () => {
    await scenario('dod-gate-1', async (s) => {
      const f = await build(s, 'r1')
      await commit(s, f, 'a.txt', 'BUG#99: fix a thing that has no backlog row')

      const r = await runStage(s, f, 'dod_stage_rows', rangeOf(f))
      expect(r.code, `a commit for an item with no row PASSED — the rule is unenforced:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed but did not say which item').toContain('BUG-99')
    })
  })

  it('#2 a zero-padded row (BUG-099) matches the commit BUG#99', async () => {
    await scenario('dod-gate-2', async (s) => {
      // THE CASE THAT WOULD SILENTLY MAKE EVERY RUN VACUOUS. Commits say BUG#99
      // and rows say **BUG-099**, so a string compare finds nothing, so nothing
      // is ever missing, so the stage always passes.
      const f = await build(s, 'r2')
      await commit(s, f, 'a.txt', 'BUG#99: fix a thing')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-099** | a thing | S3 | open | detail |\n')

      const r = await runStage(s, f, 'dod_stage_rows', rangeOf(f))
      expect(r.code, `zero-padding defeated the match — every run would pass vacuously:\n${r.output}`).toBe(0)
    })
  })

  it('#3 a push of only merge/revert commits does not fail the rows stage', async () => {
    await scenario('dod-gate-3', async (s) => {
      // Merge, revert and root commits carry no item BY DESIGN.
      const f = await build(s, 'r3')
      await commit(s, f, 'b.txt', 'Merge branch side')

      const r = await runStage(s, f, 'dod_stage_rows', rangeOf(f))
      expect(r.code, `a merge-only push was failed:\n${r.output}`).toBe(0)
    })
  })

  it('#4 a BUG with no regression test fails the stage', async () => {
    await scenario('dod-gate-4', async (s) => {
      const f = await build(s, 'r4')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-042** | untested | S3 | open | d |\n')
      await commit(s, f, 'c.txt', 'BUG#42: a fix with no regression test')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, 'a BUG with no test naming it PASSED').not.toBe(0)
    })
  })

  it('#4-tested adding a test that names BUG-042 satisfies it', async () => {
    await scenario('dod-gate-4-tested', async (s) => {
      // TASK-039: this is also the blueprint's own default. No roots are
      // declared, and in the blueprint `tests/` is this repo's own tests, so it
      // must still count. Excluding `tests/` everywhere turns this red.
      const f = await build(s, 'r4')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-042** | untested | S3 | open | d |\n')
      await commit(s, f, 'c.txt', 'BUG#42: a fix with a regression test')
      // TASK-047/#18: this fixture was `tests/x/test.sh`. It kept passing after a
      // shell runner stopped being evidence, because full-mode search was a
      // recursive grep over EVERY file — so the case proved "some file contains
      // the string", not "a test names the bug". Christian caught it.
      await s.fs.write(join(f.dir, 'tests/x/x.spec.ts'), "it('BUG-042: regression', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a test naming the bug did not satisfy the stage:\n${r.output}`).toBe(0)
    })
  })

  it('#4b a TASK is not required to have a regression test', async () => {
    await scenario('dod-gate-4b', async (s) => {
      // Asserting a rule that does not exist trains people to ignore the stage.
      const f = await build(s, 'r4b')
      await appendRow(s, f, 'docs/doing/BACKLOG.md', '| **TASK-007** | a task | — | KEEP | t |\n')
      await commit(s, f, 'd.txt', 'TASK#7: no regression test expected')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a TASK was required to have a regression test:\n${r.output}`).toBe(0)
    })
  })

  it('#4c a BUG parked in backlog/ needs no regression test', async () => {
    await scenario('dod-gate-4c', async (s) => {
      // A parked bug has no fix, so it can have no regression test. Requiring one
      // makes FILING a bug impossible — the stage blocked exactly that on
      // 2026-08-05 when BUG-021 and BUG-022 were parked from a downstream project.
      const f = await build(s, 'r4c')
      await appendRow(s, f, 'docs/backlog/BUGS.md', '| **BUG-099** | parked | S3 | KEEP | d |\n')
      await commit(s, f, 'e.txt', 'BUG#99: park a bug found downstream')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `parking a bug was blocked for having no test:\n${r.output}`).toBe(0)
    })
  })

  it('#4c-promoted moving that BUG to doing/ restores the test requirement', async () => {
    await scenario('dod-gate-4c-promoted', async (s) => {
      // The exemption must key on PARKED specifically, not on "a row exists".
      // The very same row in doing/ has to restore the requirement, or the stage
      // has been disabled rather than corrected — and only this case can see
      // that, which is why it is its own case rather than a second assertion
      // sharing #4c's mutated fixture.
      const f = await build(s, 'r4c2')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-099** | now active | S3 | open | d |\n')
      await commit(s, f, 'e.txt', 'BUG#99: now being fixed, with no test')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, 'the same BUG in doing/ with no test PASSED — the exemption is too broad').not.toBe(0)
    })
  })

  it('#5 a well-formed baton passes', async () => {
    await scenario('dod-gate-5', async (s) => {
      const f = await build(s, 'r5')

      const r = await runStage(s, f, 'dod_stage_signal', '')
      expect(r.code, `a well-formed baton was rejected:\n${r.output}`).toBe(0)
    })
  })

  it('#5-rows a baton missing its State/Task rows fails', async () => {
    await scenario('dod-gate-5-rows', async (s) => {
      // A malformed baton dispatches agents against nonsense, which BUG-019 and
      // the settle-window work both came out of.
      const f = await build(s, 'r5b')
      await s.fs.write(
        join(f.dir, 'logs/state/signal.md'),
        '| Field | Value |\n|---|---|\n| Holder | X |\n',
      )

      const r = await runStage(s, f, 'dod_stage_signal', '')
      expect(r.code, 'a baton missing its State/Task rows PASSED').not.toBe(0)
    })
  })

  it('#5-absent an absent baton fails', async () => {
    await scenario('dod-gate-5-absent', async (s) => {
      const f = await build(s, 'r5c')
      await s.fs.rm(join(f.dir, 'logs/state/signal.md'))

      const r = await runStage(s, f, 'dod_stage_signal', '')
      expect(r.code, 'an ABSENT baton PASSED').not.toBe(0)
    })
  })

  it('#6 the judgement stage prints that it does NOT verify', async () => {
    await scenario('dod-gate-6', async (s) => {
      // It always passes, and that is correct — it exists to be VISIBLE. So the
      // one thing that must be true is that it never silently claims to have
      // checked §D/§F/§H.
      const f = await build(s, 'r6')

      const r = await runStage(s, f, 'dod_stage_judgement', '')
      expect(r.code, 'the judgement stage failed — it is a reminder, not a check').toBe(0)
      expect(r.output.toLowerCase(), 'passed without saying it verifies nothing').toMatch(
        /not claimed to be|judgement/,
      )
    })
  })

  it('#7 the DoD stages are wired into the gate and tagged [DoD-Gate]', async () => {
    // Without this the lib could be perfect and never run — the exact gap
    // BUG-008 is about. Read-only against the REAL hook: this suite must never
    // write it, and the retirement pass is the only thing that edits it.
    const hook = await readFile(HOOK, 'utf8')

    expect(
      hook,
      'the DoD stages are not tagged — they would be indistinguishable from suite stages',
    ).toContain('AGENT_FEED_TAG="DoD-Gate"')

    const wired = hook.split('\n').filter((l) => l.includes('pipe_stage "§')).length
    expect(wired, `only ${wired} DoD stage(s) wired — expected at least 4`).toBeGreaterThanOrEqual(4)

    expect(
      hook,
      'the feed tag is never restored — every stage after the DoD block would read [DoD-Gate]',
    ).toContain('AGENT_FEED_TAG="GATE"')
  })

  it('#8 BUG-040: dod_items_in_push extracts every item kind', async () => {
    await scenario('dod-gate-8', async (s) => {
      // THE PREMISE EVERY OTHER CASE RESTS ON. When this returns an empty list,
      // nothing downstream has anything to check, so every stage passes over
      // nothing and the gate prints PASSED. That is what happened on macOS:
      // `sed -n 's/^\(BUG\|FEATURE\|TASK\)#…'` uses alternation inside `\(…\)`,
      // a GNU extension BSD sed does not implement, so it matched nothing and
      // the DoD enforced nothing.
      //
      // The existing cases DID catch it — they reported "the rule is
      // unenforced" — but only as a consequence, three steps downstream. This
      // asserts the premise directly, because "the parse came back empty" is the
      // failure that makes every other assertion in this file vacuous.
      const f = await build(s, 'r8')
      await commit(s, f, 'x.txt', 'BUG#40: a commit whose subject the extraction must see')
      await commit(s, f, 'y.txt', 'TASK#7: and a second item of a different kind')

      const r = await s.run(
        'bash',
        ['-c', `. ./${LIB}\ndod_items_in_push "$1"\n`, 'dod-items', rangeOf(f)],
        { cwd: f.dir },
      )
      const items = r.stdout.split('\n').filter(Boolean)

      expect(
        items,
        'BUG-040: dod_items_in_push returned NOTHING for two commits that plainly ' +
          'name items — every DoD rule downstream is now passing over an empty ' +
          'list while the gate prints PASSED',
      ).not.toEqual([])
      expect(items.sort(), `parsed, but not what it was given: ${r.stdout}`).toEqual(['BUG-40', 'TASK-7'])
    })
  })

  it('#17 TASK-047: what the gate COUNTS and what vitest RUNS are one set', async () => {
    // THE INVARIANT, ASSERTED INSTEAD OF RE-DERIVED BY HAND. It has now been
    // restated three times by three people — Alexey found the gate accepting
    // five extensions while vitest ran one, the founder collapsed it, and the
    // coordinator widened it by `.tsx` — and each time the two sides were
    // checked by reading them. A file accepted as evidence but never executed
    // is a green standing in for a test; a file executed but not accepted
    // silently fails to satisfy the gate. Either drift is a defect, and this is
    // the only case that can see it.
    // THREE SIDES, not two: accepted as evidence, DISCOVERED, and executed.
    // Discovery is the side that fails quietly — a suite `suites.sh` does not
    // find is never declared to the batch, so an assertion about "every runner"
    // passes vacuously over it rather than failing. Christian named that risk
    // for `.spec.tsx` in c5301c5 before it could happen.
    const lib = await readFile(join(REPO_ROOT, LIB), 'utf8')
    const config = await readFile(join(REPO_ROOT, 'tests/vitest.config.ts'), 'utf8')
    const suites = await readFile(join(REPO_ROOT, 'scripts/lib/suites.sh'), 'utf8')

    // DEDUPED, because the lib now names the extensions TWICE — once for the
    // shallow top-level search and once for the recursive one (#18). Without this
    // the comparison fails on multiplicity while all three sides agree, which is a
    // guard reporting a defect it invented.
    const exts = (text: string, re: RegExp) =>
      [...new Set([...text.matchAll(re)].map((m) => m[1]))].sort()
    const counted = exts(lib, /-name '\*(\.spec\.tsx?)'/g)
    const executed = exts(config, /'\*\*\/\*(\.spec\.tsx?)'/g)
    const discovered = exts(suites, /-name '\*(\.spec\.tsx?)'/g)

    expect(counted, `${LIB} accepts no *.spec.ts* evidence at all — the extraction below is blind`).not.toEqual([])
    expect(
      { counted, discovered, executed },
      'The extension rule must be ONE set on all three sides.\n' +
        `  counted as evidence (${LIB}): ${JSON.stringify(counted)}\n` +
        `  discovered (scripts/lib/suites.sh): ${JSON.stringify(discovered)}\n` +
        `  executed (tests/vitest.config.ts): ${JSON.stringify(executed)}\n` +
        'A file counted but not executed certifies a bug with a test that never ran.\n' +
        'A file executed but not discovered is never declared to the batch, so an\n' +
        'assertion about "every runner" passes over it silently (TASK-047).',
    ).toEqual({ counted, discovered: counted, executed: counted })
  })

  it('#8b TASK-039: the gate reads subjects with the same rule the commit-msg hook applies', async () => {
    await scenario('dod-gate-8b', async (s) => {
      // `BUG#41:no space` is refused by commit_subject_ok, so the commit-msg hook
      // would never have let it land. A private pattern that still extracts it
      // is a second definition of the rule that disagrees with the first.
      const f = await build(s, 'r8b')
      await commit(s, f, 'x.txt', 'BUG#41:no space after the colon')
      await commit(s, f, 'y.txt', 'TASK#7: a conforming subject')

      const r = await s.run(
        'bash',
        ['-c', `. ./${LIB}\ndod_items_in_push "$1"\n`, 'dod-items', rangeOf(f)],
        { cwd: f.dir },
      )
      expect(r.stdout.split('\n').filter(Boolean), r.output).toEqual(['TASK-7'])
    })
  })
})

describe('TASK-039 — a project bug is vouched for by the project, not by a blueprint suite', () => {
  /** A derived project fixing BUG-042, with its row in doing/. */
  async function derivedFix(s: Scenario, tag: string, roots?: string): Promise<Fixture> {
    const f = await build(s, tag, 'derived')
    await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-042** | project bug | S3 | open | d |\n')
    if (roots !== undefined) {
      await s.fs.write(join(f.dir, 'project_config_paths.md'), `# Paths\n\n- BP_TEST_ROOTS: \`${roots}\`\n`)
    }
    await commit(s, f, 'c.txt', 'BUG#42: fix a project bug')
    return f
  }

  /** What the blueprint ships into a derived project's tests/: a suite naming the blueprint's BUG-042. */
  const SHIPPED_SUITE = 'tests/x/test.sh'
  const SHIPPED_TEXT = 'echo "BUG-042: the blueprint\'s own bug"\n'

  it('#9 a test under a declared root satisfies the stage', async () => {
    await scenario('dod-gate-9', async (s) => {
      const f = await derivedFix(s, 'r9', 'backend/src frontend/e2e')
      await s.fs.write(join(f.dir, 'frontend/e2e/fix.spec.ts'), "it('BUG-042: regression', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a test under a declared root was not found:\n${r.output}`).toBe(0)
    })
  })

  it('#10 a blueprint-shipped suite naming the number does not count', async () => {
    await scenario('dod-gate-10', async (s) => {
      // The storm2flow defect: about 97 of its bug numbers are also named by
      // blueprint suites, and each of those passed with no test of its own.
      const f = await derivedFix(s, 'r10')
      await s.fs.write(join(f.dir, SHIPPED_SUITE), SHIPPED_TEXT)

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a blueprint suite vouched for a project bug:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed but did not name the bug').toContain('BUG-42')
    })
  })

  it('#10b a declared root that contains the shipped tests/ is refused, not searched', async () => {
    await scenario('dod-gate-10b', async (s) => {
      // Declaring a parent must not smuggle tests/ back in. The code root is
      // `scaffolding/` (the TASK-021 layout) so the declared root contains the
      // shipped tests/ and NOT docs/, which isolates the tests/ rule from #10d.
      const f = await derivedFix(s, 'r10b', 'scaffolding')
      await s.fs.copyIn(join(REPO_ROOT, SUBJECT_LIB), join(f.dir, 'scaffolding', SUBJECT_LIB))
      await s.fs.write(join(f.dir, 'scaffolding', SHIPPED_SUITE), SHIPPED_TEXT)

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f), {
        BP_CODE_ROOT: join(f.dir, 'scaffolding'),
      })
      expect(r.code, `a root containing the shipped tests/ vouched for a project bug:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without saying the root was refused').toContain('contains tests/')
    })
  })

  it('#11 storm2flow witness: a blueprint spec\'s fixture STRING naming BUG-200 does not vouch for it', async () => {
    await scenario('dod-gate-11', async (s) => {
      // Rehearsed by storm2flow's orchestrator on the pulled gate at dbed972:
      // its BUG-200 and BUG-201 passed only because tests/bug-numbers holds
      // synthetic rows with those numbers. The line below is that fixture's
      // shape. The project declares its real roots and has a test for a
      // different bug there, so only the fixture string could satisfy BUG-200.
      const f = await build(s, 'r11', 'derived')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-200** | project bug | S3 | open | d |\n')
      await s.fs.write(join(f.dir, 'project_config_paths.md'), '- BP_TEST_ROOTS: `backend frontend infrastructure`\n')
      await s.fs.write(join(f.dir, 'backend/src/other.test.ts'), "it('BUG-188: an unrelated project test', () => {})\n")
      await s.fs.write(
        join(f.dir, 'tests/bug-numbers/bug-numbers.spec.ts'),
        "row('BUG-200', 'cites **BUG-201** and BUG-201 again, and **BUG-200** in its own prose') +\n",
      )
      await commit(s, f, 'c.txt', 'BUG#200: a project fix with no test of its own')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a blueprint fixture string vouched for project BUG-200:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed but did not name the bug').toContain('BUG-200')
    })
  })

  it('#11b storm2flow witness: a project bug tested under a declared backend/ root passes', async () => {
    await scenario('dod-gate-11b', async (s) => {
      // The other half of the rehearsal: 11 of 13 recent storm2flow bugs have
      // their tests only under backend/, frontend/ or infrastructure/.
      const f = await build(s, 'r11b', 'derived')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-188** | project bug | S3 | open | d |\n')
      await s.fs.write(join(f.dir, 'project_config_paths.md'), '- BP_TEST_ROOTS: `backend frontend infrastructure`\n')
      // A spec, not `handler.test.ts`: `.test.ts` is exactly what the founder's
      // one-extension decision retired, and a witness written in the retired form
      // would pass only while declared roots still accepted anything (#18).
      await s.fs.write(join(f.dir, 'backend/src/handler.spec.ts'), "it('BUG-188: regression', () => {})\n")
      await commit(s, f, 'c.txt', 'BUG#188: a project fix tested under backend/')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a test under the declared backend/ root was not found:\n${r.output}`).toBe(0)
    })
  })

  it('#10d a declared root that contains docs/ is refused — the bug\'s own row would vouch for it', async () => {
    await scenario('dod-gate-10d', async (s) => {
      // docs/doing/BUGS.md names **BUG-042** by construction (the rows stage
      // requires it), so a `.` root would pass every bug with no test at all.
      // A blueprint fixture, so tests/ is not what refuses it.
      const f = await build(s, 'r10d')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-042** | untested | S3 | open | d |\n')
      await s.fs.write(join(f.dir, 'project_config_paths.md'), '- BP_TEST_ROOTS: `.`\n')
      await commit(s, f, 'c.txt', 'BUG#42: a fix with no regression test')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `the bug's own backlog row passed as its regression test:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without saying the root was refused').toContain('contains docs/')
    })
  })

  it('#10c REVERSED by Alexey finding 1: a declared root INSIDE the shipped tests/ is refused', async () => {
    await scenario('dod-gate-10c', async (s) => {
      // This case used to assert the opposite: that declaring tests/e2e was the
      // project claiming it. Alexey showed the same door admits tests/shipped
      // (#12), where the only evidence is a blueprint suite — a declaration
      // cannot prove provenance, and the gate has no local record of what the
      // blueprint ships (see the report). So descendants are refused with
      // ancestors, and the cost is that this documented layout no longer counts
      // until the founder rules on it.
      const f = await derivedFix(s, 'r10c', 'tests/e2e')
      await s.fs.write(join(f.dir, 'tests/e2e/fix.spec.ts'), "it('BUG-042: regression', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a root inside the blueprint's tests/ was searched:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without saying the root was refused').toContain('tests/')
    })
  })

  it('#12 Alexey finding 1: a declared tests/shipped cannot be vouched for by the suite in it', async () => {
    await scenario('dod-gate-12', async (s) => {
      // His probe: declaring a subdirectory of the shipped tests/ passed on a
      // synthetic shipped suite naming BUG-042.
      const f = await derivedFix(s, 'r12', 'tests/shipped')
      await s.fs.write(join(f.dir, 'tests/shipped/test.sh'), SHIPPED_TEXT)

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a suite under a declared tests/ subdirectory vouched for a project bug:\n${r.output}`).not.toBe(0)
    })
  })

  it('#12b Alexey finding 1: a declared docs/doing is refused — only the bug ROW names it', async () => {
    await scenario('dod-gate-12b', async (s) => {
      const f = await derivedFix(s, 'r12b', 'docs/doing')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `the bug's own row in docs/doing vouched for it:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without saying the root was refused').toContain('docs/')
    })
  })

  it('#12c Alexey finding 1: a declared scripts/ is refused — blueprint code names blueprint bugs', async () => {
    await scenario('dod-gate-12c', async (s) => {
      const f = await derivedFix(s, 'r12c', 'scripts')
      await s.fs.write(join(f.dir, 'scripts/tool.sh'), '# BUG-042 is mentioned in this managed script\n')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a blueprint-managed script vouched for a project bug:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without saying the root was refused').toContain('scripts/')
    })
  })

  it('#12d Alexey finding 1: a symlink root pointing into the shipped tests/ is refused', async () => {
    await scenario('dod-gate-12d', async (s) => {
      // Physical resolution is what closes this: the symlink's own path is
      // innocent, the directory it names is not.
      const f = await derivedFix(s, 'r12d', 'suites')
      await s.fs.write(join(f.dir, 'tests/shipped/test.sh'), SHIPPED_TEXT)
      await s.run('ln', ['-s', 'tests/shipped', 'suites'], { cwd: f.dir })

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a symlink into the blueprint's tests/ vouched for a project bug:\n${r.output}`).not.toBe(0)
    })
  })

  it('#12e Alexey finding 2: a glob in the declaration is refused, not expanded', async () => {
    await scenario('dod-gate-12e', async (s) => {
      // His probe: `*` expanded to directories and passed on the scripts witness.
      const f = await derivedFix(s, 'r12e', '*')
      await s.fs.write(join(f.dir, 'scripts/tool.sh'), '# BUG-042 mentioned here\n')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a glob expanded into the searched set:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without naming the glob as the problem').toMatch(/glob|metacharacter/i)
    })
  })

  it('#12f Alexey finding 2: a relative root that leaves the project is refused', async () => {
    await scenario('dod-gate-12f', async (s) => {
      const f = await derivedFix(s, 'r12f', '../outside')
      await s.fs.write(join(f.dir, '..', 'outside', 'notes.txt'), 'BUG-042 is named in a sibling directory\n')

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a root outside the project vouched for a project bug:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without saying the root was outside the project').toContain('outside the project')
    })
  })

  it('#12g Alexey finding 2: an absolute root outside the project is refused', async () => {
    await scenario('dod-gate-12g', async (s) => {
      const outside = await s.fs.mkdirp('absolute-outside')
      await s.fs.write(join(outside, 'notes.txt'), 'BUG-042 is named out here\n')
      const f = await derivedFix(s, 'r12g', outside)

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `an absolute root outside the project vouched for a project bug:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without saying the root was outside the project').toContain('outside the project')
    })
  })

  it('#12h Alexey finding 2: two BP_TEST_ROOTS declarations are refused, not silently first-wins', async () => {
    await scenario('dod-gate-12h', async (s) => {
      const f = await derivedFix(s, 'r12h', 'backend')
      await s.fs.write(
        join(f.dir, 'project_config_paths.md'),
        '- BP_TEST_ROOTS: `backend`\n- BP_TEST_ROOTS: `scripts`\n',
      )
      await s.fs.write(join(f.dir, 'backend/fix.test.ts'), "it('BUG-042: regression', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `two declarations were resolved silently:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without naming the duplicate declaration').toMatch(/twice|2 times|more than one/i)
    })
  })

  it('#12i Alexey finding 2: a malformed declaration is refused, not defaulted to tests/', async () => {
    await scenario('dod-gate-12i', async (s) => {
      // Falling back to the default here is the dangerous direction: the project
      // meant to declare roots, and a silent default searches the blueprint's.
      const f = await derivedFix(s, 'r12i', 'backend')
      await s.fs.write(join(f.dir, 'project_config_paths.md'), '- BP_TEST_ROOTS: backend\n')
      await s.fs.write(join(f.dir, SHIPPED_SUITE), SHIPPED_TEXT)

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a malformed declaration fell back to the blueprint's tests/:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed without naming the malformed declaration').toMatch(/malformed|backtick/i)
    })
  })

  it('#18 TASK-047: a NON-spec file under a declared root is not evidence either', async () => {
    await scenario('dod-gate-18', async (s) => {
      // THE HOLE CHRISTIAN'S FINDING EXPOSED. The one-extension rule was enforced
      // only at the tests/ top level: every declared project root — where projects
      // actually keep their tests — was searched with a recursive grep over ANY
      // file, so a README, a CHANGELOG or a commit note mentioning the number
      // satisfied the gate. "What the gate counts and what vitest runs are one
      // set" was false exactly where it mattered most.
      const f = await derivedFix(s, 'r18', 'backend')
      await s.fs.write(join(f.dir, 'backend/NOTES.md'), 'Fixed BUG-042 in the parser.\n')
      await s.fs.write(join(f.dir, 'backend/legacy.test.ts'), "it('BUG-042: retired form', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(
        r.code,
        `prose or a retired test form counted as the regression test:\n${r.output}`,
      ).not.toBe(0)
    })
  })

  it('#13 FOUNDER RULE: a PROJECT spec directly at the tests/ root counts', async () => {
    await scenario('dod-gate-13', async (s) => {
      // Founder decision, 2026-09-16, resolving Alexey finding 3: a runner
      // sitting directly in tests/ can only be the project's own, because the
      // blueprint ships none there (#14 guards that).
      //
      // TASK-047 narrowed the file to `*.spec.ts`. It was `own.snap.test.ts`
      // here, which read as evidence while vitest would never have run it.
      const f = await derivedFix(s, 'r13', 'tests')
      await s.fs.write(join(f.dir, 'tests/own.snap.spec.ts'), "it('BUG-042: snapshot', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `the documented snapshot layout did not count:\n${r.output}`).toBe(0)
    })
  })

  /**
   * TASK-047: what the gate COUNTS and what vitest RUNS are one set.
   *
   * These two extensions were accepted as evidence and are not executed by the
   * shipped runner (`tests/vitest.config.ts` includes `**​/*.spec.ts` only), so a
   * bug could be certified by a file nothing ever runs — a green standing in for
   * a test, which is this repo's signature failure. Founder, 2026-09-16:
   * "migrate the tests to be spec driven ts tests, we don't need exceptions".
   */
  const NOT_RUN: ReadonlyArray<readonly [string, string]> = [
    ['a TypeScript test that is not a spec', 'tests/own.snap.test.ts'],
    ['a JavaScript spec', 'tests/own.spec.js'],
  ]

  for (const [name, path] of NOT_RUN) {
    it(`#16 TASK-047: ${name} is not evidence — vitest never runs it`, async () => {
      await scenario(`dod-gate-16-${path.replace(/\W+/g, '-')}`, async (s) => {
        const f = await derivedFix(s, 'r16', 'tests')
        await s.fs.write(join(f.dir, path), "it('BUG-042: regression', () => {})\n")

        const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
        expect(
          r.code,
          `${path} counted as a regression test, but the shipped runner would never execute it:\n${r.output}`,
        ).not.toBe(0)
      })
    })
  }

  it('#16b TASK-047: a *.spec.tsx IS evidence — a component test is the same TypeScript spec', async () => {
    await scenario('dod-gate-16b', async (s) => {
      // Coordinator ruling, 2026-09-16: `.spec.ts` and `.spec.tsx` are ONE
      // convention, not an exception to the founder's rule. `.tsx` is
      // TypeScript, and a React project cannot write a component test without
      // it — so refusing it would not enforce "spec-driven TS tests", it would
      // just make component tests uncountable. The invariant is unchanged and
      // #17 holds it: whatever counts here must also be what vitest runs.
      const f = await derivedFix(s, 'r16b', 'tests')
      await s.fs.write(join(f.dir, 'tests/widget.spec.tsx'), "it('BUG-042: renders', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a component spec did not count as a regression test:\n${r.output}`).toBe(0)
    })
  })

  it('#13b FOUNDER RULE: a blueprint suite in a SUBDIRECTORY of tests/ still does not count', async () => {
    await scenario('dod-gate-13b', async (s) => {
      // The other half of the rule, and what keeps it safe: depth is the whole
      // distinction. The same declared `tests` root that blesses #13's snapshot
      // must not reach the shipped suites one level down.
      const f = await derivedFix(s, 'r13b', 'tests')
      await s.fs.write(
        join(f.dir, 'tests/bug-numbers/bug-numbers.spec.ts'),
        "row('BUG-042', 'a blueprint fixture naming the number')\n",
      )

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a shipped suite under tests/ vouched for a project bug:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it failed but did not name the bug').toContain('BUG-42')
    })
  })

  /**
   * Alexey finding 5: four lines that plainly SELECT `docs` and were ignored.
   * Each returned 0 by searching the default `tests/` instead — so a malformed
   * declaration slipped past the refusal and changed which evidence was read.
   */
  const NEAR_MISSES: ReadonlyArray<readonly [string, string]> = [
    ['an indented bullet', ' - BP_TEST_ROOTS: `docs`\n'],
    ['a tab after the dash', '-\tBP_TEST_ROOTS: `docs`\n'],
    ['a Markdown table row', '| BP_TEST_ROOTS | `docs` |\n'],
    ['an equals sign', '- BP_TEST_ROOTS = `docs`\n'],
  ]

  for (const [name, line] of NEAR_MISSES) {
    it(`#15 Alexey finding 5: ${name} is a MALFORMED declaration, not an absent one`, async () => {
      await scenario(`dod-gate-15-${name.replace(/\W+/g, '-')}`, async (s) => {
        // The top-level snapshot is what makes this visible: the default root
        // finds it, so the near-miss reads as a pass while the operator's text
        // asked for something else entirely.
        const f = await derivedFix(s, 'r15')
        await s.fs.write(join(f.dir, 'project_config_paths.md'), `# Paths\n\n${line}`)
        await s.fs.write(join(f.dir, 'tests/own.snap.test.ts'), "it('BUG-042: snapshot', () => {})\n")

        const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
        expect(r.code, `a malformed declaration silently used the default root:\n${r.output}`).not.toBe(0)
        expect(r.output, 'it refused without naming the malformed declaration').toMatch(/malformed/i)
      })
    })
  }

  it('#15e Alexey finding 5: an exact declaration beside a malformed one is a duplicate', async () => {
    await scenario('dod-gate-15e', async (s) => {
      const f = await derivedFix(s, 'r15e')
      await s.fs.write(
        join(f.dir, 'project_config_paths.md'),
        '- BP_TEST_ROOTS: `backend`\n- BP_TEST_ROOTS = `docs`\n',
      )
      await s.fs.write(join(f.dir, 'backend/fix.test.ts'), "it('BUG-042: regression', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `a malformed second declaration was ignored:\n${r.output}`).not.toBe(0)
      expect(r.output, 'it refused without naming the duplicate').toMatch(/twice|2 times|more than one/i)
    })
  })

  it('#15f PROSE IS NOT A DECLARATION: a bullet merely naming BP_TEST_ROOTS is inert', async () => {
    await scenario('dod-gate-15f', async (s) => {
      // The guard above must key on the declaration FORM, not on the string.
      // templates/project_config_paths.md documents the rule in a bullet that
      // names `BP_TEST_ROOTS`, and treating that as a second declaration would
      // refuse every project that ships the documentation it was seeded with.
      const f = await derivedFix(s, 'r15f')
      await s.fs.write(
        join(f.dir, 'project_config_paths.md'),
        '- BP_TEST_ROOTS: `backend`\n\n' +
          '- **Literal paths only.** No wildcards, and exactly one `BP_TEST_ROOTS` line.\n' +
          'Prose may mention BP_TEST_ROOTS mid-sentence without declaring anything.\n',
      )
      await s.fs.write(join(f.dir, 'backend/fix.test.ts'), "it('BUG-042: regression', () => {})\n")

      const r = await runStage(s, f, 'dod_stage_bugtests', rangeOf(f))
      expect(r.code, `documentation prose was read as a declaration:\n${r.output}`).toBe(0)
    })
  })

  it('#14 GUARD: the blueprint ships no runner directly at the tests/ root', async (ctx) => {
    // THE RULE ABOVE RESTS ON THIS FACT, so it is asserted rather than assumed.
    // Only meaningful in the blueprint: in a derived project a runner at the
    // tests/ root is precisely what the founder's rule blesses as project-owned,
    // so asserting there would fail every project that follows CLAUDE.md:466.
    if (!existsSync(join(REPO_ROOT, '.blueprint-root'))) ctx.skip()

    // TASK-047 collapsed this to the one extension the gate accepts and vitest
    // runs. A shipped `.sh` or `.test.ts` at this root is no longer a hazard for
    // the bug-test stage, because neither is evidence any more.
    const entries = await readdir(join(REPO_ROOT, 'tests'), { withFileTypes: true })
    const runners = entries
      .filter((e) => e.isFile() && /\.spec\.tsx?$/.test(e.name))
      .map((e) => e.name)
      .sort()

    expect(
      runners,
      `The blueprint now ships spec(s) directly at the tests/ root: ${runners.join(', ')}.\n` +
        'The DoD bug-test stage treats ANY spec there as the project\'s own (docs/DoD.md §2),\n' +
        'so a shipped one would vouch for a derived project\'s bug carrying the same number —\n' +
        'the exact defect TASK-039 exists to close. Move it into a suite directory under\n' +
        'tests/<suite>/, or change the rule in scripts/lib/dod-gate.sh and these tests together.',
    ).toEqual([])
  })
})
