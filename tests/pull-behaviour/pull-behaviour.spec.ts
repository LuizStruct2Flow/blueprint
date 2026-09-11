/**
 * tests/pull-behaviour/pull-behaviour.spec.ts — BUG-016, BUG-018, BUG-054.
 *
 * `pull` is the product's core verb: the one thing every derived project runs
 * against this repo. Three of its defects were reported from a real downstream
 * project, and all three have the same shape — the command DECLINES to do
 * something and reports success for declining.
 *
 *   BUG-016  a SINGLE-FILE pull advanced bootstrap_sha to blueprint HEAD, so
 *            every later `drift` said "0 commits since sync" while the project
 *            was still behind on every other managed file. The lie is durable:
 *            nothing recomputes that number.
 *   BUG-018  `read -r ans </dev/tty` was unguarded, so any non-interactive
 *            context crashed with "No such device or address".
 *   BUG-054  the case for BUG-018 let the ENVIRONMENT choose which code path it
 *            ran. `</dev/null` answers "is stdin a terminal"; the guard asks
 *            about /dev/tty, which is about the CONTROLLING TERMINAL. So the
 *            case tested the refusal path when launched detached (green) and the
 *            broken path when launched from a terminal — which is every
 *            `git push` a human types. It reported green on exactly the runs
 *            that mattered.
 *
 * BUG-054 IS WHY #1 PROVIDES A PTY INSTEAD OF INHERITING ONE. The harness
 * spawns with stdio 'ignore', which is neither of the two conditions: a child
 * may or may not inherit vitest's controlling terminal depending on how the gate
 * was launched. `script` supplies one unconditionally, with stdin redirected to
 * /dev/null INSIDE it — terminal present, stdin not a terminal, which is the
 * pre-push gate's own shape and the combination both previous fixes got wrong.
 *
 * PORTED FROM tests/pull-behaviour/test.sh, WHICH STAYS IN THE GATE until the
 * central retirement pass. BUG-017 does not reproduce at HEAD; the evidence is
 * in README-BUG-017.md and there is deliberately no case for it.
 *
 * Parallelism hazard: none. Every case owns a scenario workspace; the fixture
 * blueprint and project are built per case, and `script` runs inside it.
 *
 * EQUIVALENCE RECORD (R6, and the migration's own evidence).
 *
 * "Ported" is a claim, so it was measured rather than reviewed. Five perturbed
 * trees were built and BOTH implementations run over each — the retiring
 * `tests/pull-behaviour/test.sh` and this spec — with the per-case verdict sets
 * compared mechanically. THE VERDICTS AGREED ON ALL FIVE. The sets are OBSERVED,
 * not predicted.
 *
 *   Mutant P1: advance bootstrap_sha even on a partial pull — BUG-016 verbatim.
 *     shell #2 · spec #2 · AGREE. #3 stays GREEN, which is the point of having
 *     it: it stops the #2 fix from being satisfied by never advancing at all.
 *   Mutant P2: never advance it (the over-correction).
 *     shell #3 · spec #3 · AGREE, with #2 green — the mirror image.
 *   Mutant P3: refuse, print the right advice, and exit 0 anyway — BUG-018's
 *     FIRST fix, the one acceptance testing rejected.
 *     shell #1 · spec #1 · AGREE. Only the exit-status arm fires; the other two
 *     stay satisfied, which is exactly how that fix passed its own test.
 *   Mutant P4: no guard, and `read -r ans </dev/tty` restored — the original
 *     crash.
 *     shell #1 · spec #1 · AGREE.
 *   Mutant P5: every pull reports a refusal — the opposite error to P3.
 *     shell #1b · spec #1b #2 #3 · AGREE on the verdict, and the spec names
 *     three cases where the shell names one. Not a strengthening, a REPORTING
 *     difference: the shell runner's `#2`/`#3` read bootstrap_sha through a
 *     helper that returns the old value when nothing was pulled, so they go
 *     green on a pull that did nothing. #1b is what catches it in both. Recorded
 *     because a difference in what a failure NAMES is still a difference.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const CLI = join(REPO_ROOT, 'scripts/blueprint')

async function git(s: Scenario, cwd: string, args: string[]) {
  return s.run('git', args, { cwd })
}

async function initRepo(s: Scenario, dir: string) {
  await git(s, dir, ['init', '-q', '-b', 'main', '.'])
  await git(s, dir, ['config', 'user.email', 't@local'])
  await git(s, dir, ['config', 'user.name', 't'])
  await git(s, dir, ['config', 'commit.gpgsign', 'false'])
}

interface Fixture {
  /** The fixture blueprint's root. */
  bp: string
  /** The sha the project claims to have bootstrapped from (one commit back). */
  first: string
  /** The blueprint's HEAD — what a FULL pull must advance the project to. */
  head: string
}

/**
 * A blueprint with TWO managed files and TWO commits.
 *
 * The two commits are what make #2 expressible at all: the project bootstraps
 * from the FIRST and is behind on CLAUDE.md, so "did a single-file pull claim a
 * full sync?" has a distinguishable answer. With one commit, `first` and `head`
 * are equal and the assertion is vacuous — asserted below rather than assumed.
 *
 * `tests/fixture/test.sh` is mandatory, not decoration: `tests/` is a managed
 * DIRECTORY whose expansion is fail-closed (BUG-029), so a fixture blueprint
 * that ships no suites is refused before pull does anything.
 */
async function fixtureBlueprint(s: Scenario, tag: string): Promise<Fixture> {
  const bp = await s.workspace.dir(tag, 'bp')
  await s.fs.write(join(bp, 'docs/DoD.md'), '# DoD\nowner {{PROJECT_NAME}}\nversion two\n')
  await s.fs.write(join(bp, 'CLAUDE.md'), '# CLAUDE\nfor {{PROJECT_NAME}}\n')
  await s.fs.write(join(bp, 'tests/fixture/test.sh'), 'echo fixture\n')
  await s.fs.write(join(bp, '.blueprint-root'), '')
  await initRepo(s, bp)
  await git(s, bp, ['add', '-A'])
  await git(s, bp, ['commit', '-q', '-m', 'one'])
  const first = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

  await s.fs.write(join(bp, 'CLAUDE.md'), '# CLAUDE\nfor {{PROJECT_NAME}}\nsecond commit\n')
  await git(s, bp, ['add', '-A'])
  await git(s, bp, ['commit', '-q', '-m', 'two'])
  const head = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

  expect(first, 'the fixture has one commit — #2 and #3 cannot differ').not.toBe(head)
  return { bp, first, head }
}

/** A project bootstrapped from `f.first`, i.e. one commit behind. */
async function newProject(s: Scenario, tag: string, name: string, f: Fixture) {
  const p = await s.workspace.dir(tag, name)
  await s.fs.write(join(p, 'docs/DoD.md'), '# DoD\nowner proj\nOLD\n')
  await s.fs.write(join(p, 'CLAUDE.md'), '# CLAUDE\nfor proj\n')
  await s.fs.write(
    join(p, '.blueprint-source'),
    [
      `blueprint_source = ${f.bp}`,
      `bootstrap_sha    = ${f.first}`,
      'bootstrap_date   = 2026-01-01',
      '',
    ].join('\n'),
  )
  await initRepo(s, p)
  await git(s, p, ['add', '-A'])
  await git(s, p, ['commit', '-q', '-m', 'init'])
  return p
}

/** The bootstrap_sha the project currently records. */
async function shaOf(proj: string): Promise<string> {
  const text = await readFile(join(proj, '.blueprint-source'), 'utf8')
  const line = text.split('\n').find((l) => l.startsWith('bootstrap_sha'))
  return (line ?? '').split('=').slice(1).join('=').trim()
}

/**
 * Run a command WITH a controlling terminal and a NON-interactive stdin.
 *
 * This is BUG-054's fix. util-linux takes `-qec CMD FILE`; BSD/macOS takes
 * `-q FILE CMD ...`. Which one is present is probed rather than assumed, and a
 * host with neither FAILS rather than skipping — R7, and a skip here is how the
 * case reported green for two fixes in a row.
 *
 * The inner `</dev/null` is the whole point: without it the child inherits the
 * pty as stdin, `[ -t 0 ]` is true, and this exercises the interactive path.
 */
async function withCttyNoStdin(s: Scenario, cwd: string, command: string) {
  const utilLinux = await s.run('script', ['-qec', 'true', '/dev/null'], { cwd })
  const args =
    utilLinux.code === 0
      ? ['-qec', command, '/dev/null']
      : ['-q', '/dev/null', '/bin/sh', '-c', command]
  const r = await s.run('script', args, { cwd })
  expect(
    r.output,
    'neither `script` calling convention worked, so no case here supplied a ' +
      'controlling terminal — which is BUG-054 exactly, not a reason to skip',
  ).not.toMatch(/script: (invalid|unrecognized) option|usage: script/i)
  return r
}

describe('BUG-016 / BUG-018 — pull records only what it synced, and survives having no TTY', () => {
  it('#1 with no TTY: no device error, an actionable message, and a NON-ZERO exit', async () => {
    await scenario('pull-behaviour-1', async (s) => {
      const f = await fixtureBlueprint(s, 'a')
      const p = await newProject(s, 'a', 'p18', f)

      // The real CLI, not a copy inside the fixture. The shell suite copied
      // `scripts/blueprint` into its fixture blueprint; both spellings run the
      // same bytes, and not copying means a mutant applied to the checkout
      // reaches this case the same way it reaches #1b/#2/#3.
      const r = await withCttyNoStdin(
        s,
        p,
        `bash '${CLI}' pull docs/DoD.md </dev/null 2>&1`,
      )

      // THREE INDEPENDENT PROPERTIES, because each previous fix satisfied some
      // of them and the case passed on the strength of the others.
      expect(r.output, 'pull crashed on /dev/tty — it must degrade, as drift already does').not.toContain(
        '/dev/tty',
      )
      expect(
        r.output,
        'pull refused with no TTY but never said why — the operator cannot act on it',
      ).toMatch(/not interactive|no terminal|--yes/i)
      expect(
        r.code,
        'pull REFUSED to pull and still exited 0 — a caller cannot tell that ' +
          'from a successful sync (this is what acceptance rejected)',
      ).not.toBe(0)
    })
  })

  it('#1b an in-sync pull still exits 0 — the refusal code did not swallow the success case', async () => {
    await scenario('pull-behaviour-1b', async (s) => {
      // The converse control. Without it, "make the refusal non-zero" could be
      // satisfied by making every quiet pull look broken, which is the opposite
      // error and just as useless to a caller.
      const f = await fixtureBlueprint(s, 'b')
      const p = await newProject(s, 'b', 'p18b', f)

      const first = await s.run(CLI, ['pull', '--yes', 'docs/DoD.md'], { cwd: p })
      expect(first.code, first.output).toBe(0)
      const second = await s.run(CLI, ['pull', '--yes', 'docs/DoD.md'], { cwd: p })
      expect(
        second.code,
        `an in-sync pull exited ${second.code} — the non-zero refusal was ` +
          `over-applied to a legitimate no-op:\n${second.output}`,
      ).toBe(0)
    })
  })

  it('#2 a single-file pull leaves bootstrap_sha alone, so drift still reports the real gap', async () => {
    await scenario('pull-behaviour-2', async (s) => {
      const f = await fixtureBlueprint(s, 'c')
      const p = await newProject(s, 'c', 'p16', f)

      const r = await s.run(CLI, ['pull', '--yes', 'docs/DoD.md'], { cwd: p })
      expect(r.code, r.output).toBe(0)

      // THE FIXTURE'S OWN PREMISE, FIRST. If CLAUDE.md were not behind there
      // would be nothing for a claimed full sync to be wrong ABOUT, and the
      // assertion below would pass over an empty condition.
      const projClaude = await readFile(join(p, 'CLAUDE.md'), 'utf8')
      const bpClaude = await readFile(join(f.bp, 'CLAUDE.md'), 'utf8')
      expect(
        projClaude,
        'fixture broken — CLAUDE.md is not behind, so the assertion is meaningless',
      ).not.toBe(bpClaude)

      const got = await shaOf(p)
      expect(
        got,
        `a single-file pull advanced bootstrap_sha to blueprint HEAD while ` +
          `CLAUDE.md is still behind — every later drift reports 0 commits ` +
          `since sync`,
      ).not.toBe(f.head)
      expect(got, 'bootstrap_sha became an unexpected value').toBe(f.first)
    })
  })

  it('#3 a full pull still advances bootstrap_sha to blueprint HEAD', async () => {
    await scenario('pull-behaviour-3', async (s) => {
      // Otherwise the #2 fix breaks normal syncing and leaves every project
      // permanently reporting drift it no longer has.
      const f = await fixtureBlueprint(s, 'd')
      const p = await newProject(s, 'd', 'pfull', f)

      const r = await s.run(CLI, ['pull', '--yes'], { cwd: p })
      expect(r.code, r.output).toBe(0)
      expect(await shaOf(p), 'a full pull did NOT advance bootstrap_sha — the #2 fix broke normal syncing').toBe(
        f.head,
      )
    })
  })
})
