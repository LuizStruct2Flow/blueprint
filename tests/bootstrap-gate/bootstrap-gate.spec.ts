/**
 * tests/bootstrap-gate/bootstrap-gate.spec.ts — BUG-028 regression, TypeScript.
 *
 * A freshly bootstrapped project must pass its OWN pre-push gate, and be
 * drift-clean against its own source. Those are the first two commands an
 * operator runs, and 39 suites failed on day one, at EXIT=1, on the first push
 * of every project — a failure that arrives on someone else's machine, which is
 * the only reason this suite is worth its runtime.
 *
 * Parallelism class: serial-timing.
 *
 * TWO THINGS ABOUT COST, BOTH DELIBERATE.
 *
 * 1. #2 and #3 SHARE ONE CASE, and that is the one merge in this migration.
 *    They are two properties of a single observation: the derived gate runs
 *    once, #2 asserts it passed and #3 asserts it passed NON-VACUOUSLY. That
 *    run is ~150s. Splitting them into two scenarios means running it twice and
 *    adding ~150s to every push, to gain a case boundary between two assertions
 *    about the same output. TASK-018-CONVENTIONS allows a reduction "unless a
 *    deletion is explicitly justified" — this is the justification, and both
 *    IDs stay in the case name so neither disappears from the record.
 *
 * 2. EVERY OTHER CASE OWNS ITS FIXTURE, which the shell original could not
 *    afford. Its #7 carried the comment "Deliberately LAST: it breaks the
 *    shared fixture blueprint's CLI in place" — a case that had to run last
 *    because it sabotaged the fixture every earlier case depended on. That is
 *    the internal serialism the audit describes, written down as a scheduling
 *    constraint. Here #7 and #7b build their own blueprint and break it, so
 *    they can run in any order and cannot reach anything else.
 */

import { describe, it, expect } from 'vitest'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

/** Hermetic identity: bootstrap REFUSES without one (A-14). */
const IDENTITY = {
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@t.io',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@t.io',
} as const

/**
 * A blueprint whose HEAD is this repo's HEAD.
 *
 * `checkout-index` rather than `git archive`, and the difference is the point:
 * archive applies export-ignore, which is what a DERIVED project receives. A
 * BLUEPRINT is the whole working tree. It also preserves file MODES, which
 * `git show` would not — a hook that arrives non-executable is silently never
 * run (BUG-008).
 *
 * GIT_INDEX_FILE is on the harness's forbidden list and is passed here
 * EXPLICITLY, which is exactly the path the harness leaves open for a scenario
 * that must exercise one: `checkout-index` needs an index, and the real one
 * must not be touched. Deliberate and visible; ambient is the defect.
 */
async function fixtureBlueprint(s: Scenario): Promise<string> {
  const bp = await s.workspace.dir('blueprint')
  const index = s.workspace.path('fixture-index')

  const materialise = await s.run(
    'bash',
    [
      '-c',
      `git -C "${REPO_ROOT}" read-tree HEAD && ` +
        `git -C "${REPO_ROOT}" checkout-index -a -f --prefix="${bp}/"`,
    ],
    { cwd: s.workspace.root, env: { GIT_INDEX_FILE: index } },
  )
  expect(materialise.code, `could not materialise HEAD: ${materialise.output}`).toBe(0)

  const counted = await s.run('bash', ['-c', 'find . -type f | wc -l'], { cwd: bp })
  expect(
    Number(counted.stdout.trim()),
    'the fixture is not a blueprint, so nothing below would prove anything',
  ).toBeGreaterThan(50)

  // The blueprint tracks several files that are ALSO in its .gitignore (the
  // public-publishing privacy block). `git add -A` respects .gitignore, so the
  // fixture would silently drop them and stop mirroring what really ships.
  const init = await s.run(
    'bash',
    [
      '-c',
      'git init -q . && git add -A && ' +
        'git ls-files --others --ignored --exclude-standard -z | xargs -0 -r git add -f && ' +
        'git commit -qm "fixture blueprint from HEAD"',
    ],
    { cwd: bp, env: IDENTITY },
  )
  expect(init.code, `could not init the fixture blueprint: ${init.output}`).toBe(0)

  expect(await s.fs.exists(join(bp, 'scripts/new-project.sh')), 'fixture has no bootstrap').toBe(
    true,
  )
  expect(
    await s.fs.exists(join(bp, 'templates')),
    'fixture has no templates/ — it is not a blueprint',
  ).toBe(true)

  return bp
}

async function bootstrap(s: Scenario, bp: string, name: string, target: string) {
  return s.run('bash', ['scripts/new-project.sh', name, target], {
    cwd: bp,
    env: { ...IDENTITY },
    timeoutMs: 300_000,
  })
}

/** A blueprint plus a project bootstrapped from it. */
async function bootstrapped(s: Scenario) {
  const bp = await fixtureBlueprint(s)
  const target = s.workspace.path('derived-proj')
  const r = await bootstrap(s, bp, 'derived-proj', target)
  expect(r.code, `bootstrap exited non-zero: ${r.output}`).toBe(0)
  return { bp, target }
}

describe('BUG-028 — a fresh bootstrap passes its own gate, and is drift-clean', () => {
  it('#1 bootstrap completed', async () => {
    await scenario('bootstrap-gate-1', async (s) => {
      const bp = await fixtureBlueprint(s)
      const target = s.workspace.path('derived-proj')

      const r = await bootstrap(s, bp, 'derived-proj', target)

      expect(r.code, r.output).toBe(0)
      expect(await s.fs.exists(join(target, '.git'))).toBe(true)
    })
  })

  it('#2 and #3 a freshly bootstrapped project passes its own pre-push gate, non-vacuously', async () => {
    await scenario('bootstrap-gate-2', async (s) => {
      const { target } = await bootstrapped(s)

      // The operator's SECOND command is `git push`. The whole suite exists for
      // this. AGENT_CI_WATCH=0 so the derived gate does not background a CI
      // watcher out of a test fixture.
      const gate = await s.run(
        'sh',
        ['.githooks/pre-push', 'origin', 'git@example.com:acme/derived-proj.git'],
        {
          cwd: target,
          env: {
            AGENT_CI_WATCH: '0',
            // UNSET, not overridden. The scenario points AGENT_* at its own
            // baton, journal and feed so nothing can reach the operator's. The
            // derived project's gate then runs suites that MANAGE those files
            // -- agent-activity-bound among them -- and they must derive their
            // own per-project paths, which is what scripts/lib/state-dir.sh
            // exists to do. Inheriting the scenario's pointers made
            // agent-activity-bound #9b operate on this scenario's signal file
            // instead of its own fixture, and it failed for a reason that had
            // nothing to do with the code under test.
            //
            // Safe because the derived project lives inside the workspace, so
            // its derived state dir does too, and the canary still asserts the
            // real baton and feed are byte-unchanged.
            AGENT_SIGNAL_FILE: undefined,
            AGENT_STATE_HOME: undefined,
            AGENT_FEED_LOG: undefined,
          },
          timeoutMs: 600_000,
        },
      )

      expect(gate.code, `a freshly bootstrapped project CANNOT pass its own pre-push gate:\n${gate.output}`).toBe(0)

      // #3 — green must mean "the gate ran and passed", never "the gate ran
      // nothing". The cheapest way to make a bootstrapped gate green is to stop
      // shipping .githooks/pre-push-project altogether, at which point every
      // suite silently leaves the push path and the pipeline still renders
      // PASSED over `project guards · skipped`. That is BUG-004 and A-22
      // restored through the bootstrap door, and #2 alone would applaud it.
      const m = [...gate.output.matchAll(/PASSED[^0-9]*(\d+) stages/g)].pop()
      expect(
        m,
        "could not read a stage count from the derived gate's summary — 'passed' is unverified",
      ).toBeDefined()

      expect(
        Number(m![1]),
        'the derived gate is green because it runs almost nothing, which is the A-22 defect',
      ).toBeGreaterThanOrEqual(25)
    })
  })

  it('#4 a fresh bootstrap is drift-clean against its own source', async () => {
    await scenario('bootstrap-gate-4', async (s) => {
      const { target } = await bootstrapped(s)

      // The OTHER command CLAUDE.md mandates on every wake, run against a
      // zero-second-old project. It once reported 5 drifted files: the
      // hand-maintained substitution list in new-project.sh had gone stale and
      // its raw `sed` knew nothing of {{PROJECT_NAME_UPPER}}. Both of the first
      // two commands a new project runs were lying to it.
      const drift = await s.run('bash', ['scripts/blueprint', 'drift'], {
        cwd: target,
        timeoutMs: 120_000,
      })

      expect(
        drift.output,
        'a zero-second-old bootstrap already reports drift against its own source',
      ).not.toContain('Drifted (project')
      expect(
        drift.output,
        'drift did not report a clean checkout, and did not report drift either — its verdict is unreadable',
      ).toContain('blueprint-managed files match')
    })
  })

  it('#5 every managed/template file was substituted at bootstrap', async () => {
    await scenario('bootstrap-gate-5', async (s) => {
      const { bp, target } = await bootstrapped(s)

      // Drift compares only MANAGED_FILES against a SUBSTITUTED blueprint copy,
      // so it is silent about a template file bootstrap forgot — and an
      // unsubstituted {{PROJECT_NAME}} in a shipped config reads as a broken
      // install.
      //
      // BUG-029 R3: the status FIRST, then the shape. This list used to be
      // consumed as `done < <(blueprint files | sed …)`, so a failing command
      // produced an empty stream, the loop never ran, and the case PASSED. A
      // check that cannot fail is worth less than no check, because it is
      // counted. Checking only for emptiness is not enough either — it misses
      // the command that fails AFTER printing part of its output.
      const listed = await s.run('bash', ['scripts/blueprint', 'files'], { cwd: bp })
      expect(
        listed.code,
        'a partial list would let this case pass over the files it never saw',
      ).toBe(0)
      expect(
        listed.stdout.trim(),
        'the placeholder check below would have passed over an empty list',
      ).not.toBe('')

      // These carry the token as CODE and are exempt by design — the same list
      // bp_should_substitute holds. Named literally rather than sourced, so a
      // mistake that widens the exemption cannot also silence this check.
      const exempt = (f: string) =>
        /(scripts\/blueprint|scripts\/new-project\.sh|scripts\/lib\/placeholders\.sh|scripts\/lib\/contamination\.sh)$/.test(
          f,
        )

      const paths = listed.stdout
        .split('\n')
        .map((l) => l.replace(/^ {2}/, '').trim())
        .filter((l) => l && !l.startsWith('-'))

      let seen = 0
      const leftover: string[] = []
      for (const f of paths) {
        seen += 1
        if (exempt(f)) continue
        // `blueprint files` lists managed DIRECTORIES too (`tests/` is one), so
        // this must test for a regular file exactly as the shell original's
        // `[ -f ]` did. `exists` is true for a directory and the read then dies
        // with EISDIR.
        const st = await stat(join(target, f)).catch(() => null)
        if (!st?.isFile()) continue
        const text = await s.fs.read(join(target, f))
        if (text.includes('{{PROJECT_NAME')) leftover.push(f)
      }

      expect(
        leftover,
        'blueprint-managed files reached the project with the placeholder intact',
      ).toEqual([])
      expect(seen, 'the list is broken, so this proved nothing').toBeGreaterThanOrEqual(20)
    })
  })

  it("#6 a full pull is a no-op on a fresh bootstrap, and the project's manifest still passes", async () => {
    await scenario('bootstrap-gate-6', async (s) => {
      const { target } = await bootstrapped(s)

      // BUG-029. `tests/` is a managed DIRECTORY, so pull writes into the one
      // tree the gate reads its own membership from. Two things must hold at
      // once, and neither is visible from either side alone: pull over a
      // zero-second-old bootstrap must be a NO-OP (bootstrap seeds the suites
      // from `git archive` and pull re-derives that same set from HEAD — if
      // they disagree by so much as a substitution, every project gets a
      // spurious diff on its suites at the first wake), and tests/manifest must
      // still pass afterwards.
      const pull = await s.run('bash', ['scripts/blueprint', 'pull', '--yes'], {
        cwd: target,
        timeoutMs: 300_000,
      })

      expect(
        pull.code,
        `'blueprint pull --yes' failed on a zero-second-old bootstrap:\n${pull.output}`,
      ).toBe(0)
      expect(
        pull.output,
        'pull found work to do on a zero-second-old bootstrap — bootstrap and pull disagree about what the project should contain',
      ).toContain('Nothing to pull')

      const manifest = await s.run('bash', ['tests/manifest/test.sh'], {
        cwd: target,
        timeoutMs: 300_000,
      })
      expect(
        manifest.code,
        `the derived project's own tests/manifest fails after a full pull — its suites and its gate are out of step:\n${manifest.output}`,
      ).toBe(0)
    })
  })

  it("#7 bootstrap refuses loudly, names the cause, and creates nothing when 'blueprint files' fails", async () => {
    await scenario('bootstrap-gate-7', async (s) => {
      const bp = await fixtureBlueprint(s)

      // BUG-029 R3. new-project.sh consumed `blueprint files` through
      // `done < <(_synced_files)` — a process substitution, whose exit status
      // is discarded — and _synced_files was itself `blueprint files | sed`,
      // whose status is sed's. Two nested swallows. The result is not a WRONG
      // substitution but NO substitution: an empty list means the loop body
      // never executes, so no guard placed inside it could ever fire.
      //
      // Measured on the parent commit: bootstrap printed "Substituted
      // placeholders in 0 file(s)", then "Happy struct2flowing", and exited 0 —
      // delivering a project whose CLAUDE.md still said {{PROJECT_NAME}} in
      // five places.
      //
      // The failure is injected DIRECTLY rather than staged through a cause
      // that does not exist: cmd_files never calls read_blueprint_source, so
      // `blueprint files` cannot fail from the tests/ expansion the review
      // proposed. Writing the case around an unreachable trigger would have
      // produced one that passes for the wrong reason.
      await s.fs.write(join(bp, 'scripts/blueprint'), 'exit 9\n')

      const target = s.workspace.path('derived-broken')
      const r = await bootstrap(s, bp, 'derived-broken', target)

      expect(
        r.code,
        "bootstrap EXITED 0 with an unusable 'blueprint files' — a caller cannot tell that from a good project",
      ).not.toBe(0)
      expect(
        r.output.toLowerCase(),
        "the failure never names 'blueprint files', so the operator cannot act on it",
      ).toContain('blueprint files')
      expect(
        await s.fs.exists(target),
        "a half-built project was left behind — the 'fix it and re-run' path is then blocked by the 'Target already exists' guard",
      ).toBe(false)
      expect(r.output, 'bootstrap reported success while substituting nothing').not.toContain(
        'Happy struct2flowing',
      )
    })
  })

  it('#7b a successful-but-empty file list is refused too, and creates nothing', async () => {
    await scenario('bootstrap-gate-7b', async (s) => {
      const bp = await fixtureBlueprint(s)

      // #7 drives the non-zero path. This drives the path where the status is 0
      // and there is simply nothing to iterate — the case a status check alone
      // cannot catch, and the mirror image of the partial-output case a content
      // check alone cannot catch. Both refusals need a case, or one of them is
      // asserted only by reading the source.
      await s.fs.write(join(bp, 'scripts/blueprint'), 'exit 0\n')

      const target = s.workspace.path('derived-empty')
      const r = await bootstrap(s, bp, 'derived-empty', target)

      expect(
        r.code,
        'bootstrap EXITED 0 on an empty file list — it would deliver a project with every placeholder still in it',
      ).not.toBe(0)
      expect(await s.fs.exists(target)).toBe(false)
      expect(
        /no files|listed no/i.test(r.output),
        'the refusal does not distinguish an EMPTY list from a failed command',
      ).toBe(true)
    })
  })
})
