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
 *   - `dod_find_row`'s `CHANGES.md` lookup. Both implementations seed only
 *     `BUGS.md` and `BACKLOG.md`, so a behaviour-change row has never been
 *     resolved by either.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const LIB = 'scripts/lib/dod-gate.sh'
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
async function build(s: Scenario, tag: string): Promise<Fixture> {
  const dir = await s.workspace.dir(tag)
  await s.fs.copyIn(join(REPO_ROOT, LIB), join(dir, LIB))
  await s.fs.copyIn(join(REPO_ROOT, 'scripts/lib/state-dir.sh'), join(dir, 'scripts/lib/state-dir.sh'))
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
async function runStage(s: Scenario, f: Fixture, fn: string, range: string) {
  return s.run(
    'bash',
    ['-c', `pipe_note(){ :; }\n. ./${LIB}\n"$1" "$2"\n`, 'dod-stage', fn, range],
    { cwd: f.dir, env: BATON_FROM_FIXTURE },
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
      const f = await build(s, 'r4')
      await appendRow(s, f, 'docs/doing/BUGS.md', '| **BUG-042** | untested | S3 | open | d |\n')
      await commit(s, f, 'c.txt', 'BUG#42: a fix with a regression test')
      await s.fs.write(join(f.dir, 'tests/x/test.sh'), 'echo "BUG-042: regression"\n')

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
})
