/**
 * tests/bootstrap-contents/bootstrap-contents.spec.ts — A-05 and friends.
 *
 * Bootstrap must ship TRACKED TEMPLATE CONTENT ONLY. Not the blueprint's
 * secrets, not its runtime state, not its own work items, not its
 * self-identification marker — and everything a project genuinely needs,
 * with every placeholder substituted.
 *
 * Guards, by the ID each is filed under:
 *   A-05     untracked/gitignored state and tracked work items must not ship
 *   BUG-013  `.blueprint-root` must not ship, or a derived project identifies
 *            as the blueprint and `drift` compares nothing and exits 0
 *   BUG-015  every lib in scripts/lib/ must be in MANAGED_FILES, or a derived
 *            project receives a CLI it cannot run
 *   BUG-012  `blueprint_source` must be RELATIVE — an absolute host path cannot
 *            be right on two machines at once
 *   A-09     every file carrying {{PROJECT_NAME}} must be substituted, the
 *            SonarQube key included, or every project collides on one key
 *
 * Parallelism class: parallel-safe.
 *
 * COST, STATED RATHER THAN HIDDEN. The shell original built ONE fixture
 * blueprint and asserted fourteen things against it, in 0.7s. This builds a
 * fixture per case, which is slower. That is deliberate: TASK-018's own audit
 * names "almost every suite is also internally serial — shared temp root, one
 * fixture repo, or a case reading what the previous one left" as the thing that
 * caps parallelism at the suite level, and says scenario-level fixtures are
 * "precisely what a typed harness provides". Cases here no longer share a
 * bootstrap, so none can be made to pass or fail by another, and the suite can
 * be parallelised the moment `fileParallelism` is earned (plan §6 step 6).
 * Until then it costs seconds on a gate that takes minutes.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const PROJECT = 'test-proj'

interface Fixture {
  /** A stand-in BLUEPRINT: the archive, plus templates/, as a real repo. */
  blueprint: string
  /** A project bootstrapped from it. */
  derived: string
}

/**
 * Build a fixture blueprint and bootstrap a project from it.
 *
 * The fixture has to model the split BUG-009 created, and the modelling is the
 * subtle part: `git archive` is what a DERIVED project receives and deliberately
 * omits `templates/`, while a BLUEPRINT is its working tree and cannot bootstrap
 * anything without them. So the archive is extracted and templates/ copied in
 * explicitly. A fixture that skipped that step was silently not a blueprint, and
 * new-project.sh failing loudly is what surfaced it.
 */
async function build(s: Scenario): Promise<Fixture> {
  const blueprint = await s.workspace.dir('blueprint')

  const archived = await s.run(
    'bash',
    ['-c', `git -C "${REPO_ROOT}" archive HEAD | tar -x -C "${blueprint}"`],
    { cwd: s.workspace.root },
  )
  expect(archived.code, `could not archive the blueprint: ${archived.output}`).toBe(0)

  await s.run('cp', ['-R', join(REPO_ROOT, 'templates'), join(blueprint, 'templates')], {
    cwd: s.workspace.root,
  })

  const hasScript = await s.fs.exists(join(blueprint, 'scripts/new-project.sh'))
  expect(hasScript, 'fixture blueprint has no new-project.sh — it is not a blueprint').toBe(true)

  // A tracked work item, so the export boundary has something to exclude even
  // when the real repo's own items were filtered out building this.
  await s.fs.mkdirp(join(blueprint, 'docs/doing'))
  await s.fs.write(
    join(blueprint, 'docs/doing/PLAN-BUG-999.md'),
    '# PLAN-BUG-999 — fixture work item\n\nMust NOT reach a derived project.\n',
  )

  // The blueprint tracks several files that are ALSO in its .gitignore (the
  // public-publishing privacy block). git ignores .gitignore for already-tracked
  // paths, so the real `git archive HEAD` ships them. A plain `git add -A` here
  // would respect .gitignore and drop them, so the fixture would not mirror the
  // real repo. Force-add them.
  const init = await s.run(
    'bash',
    [
      '-c',
      'git init -q . && git add -A && ' +
        'git ls-files --others --ignored --exclude-standard -z | xargs -0 -r git add -f && ' +
        'git -c user.name=T -c user.email=t@t.io commit -qm "fixture blueprint"',
    ],
    { cwd: blueprint },
  )
  expect(init.code, `could not init the fixture blueprint: ${init.output}`).toBe(0)

  // Untracked + gitignored state a real blueprint checkout accumulates. Each is
  // a leak path this suite exists to close.
  await s.fs.write(join(blueprint, '.env'), 'SONAR_TOKEN=squ_FIXTURE_SECRET\n')
  await s.fs.mkdirp(join(blueprint, 'logs'))
  await s.fs.write(join(blueprint, 'logs/agent-activity.log'), 'stale feed line\n')
  await s.fs.write(join(blueprint, 'AGENT_ROSTER.md'), 'personal roster\n')

  const derived = s.workspace.path('derived')
  const r = await s.run('bash', ['scripts/new-project.sh', PROJECT, derived], {
    cwd: blueprint,
    env: {
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@t.io',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@t.io',
    },
    timeoutMs: 120_000,
  })
  expect(r.code, `bootstrap exited non-zero: ${r.output}`).toBe(0)

  return { blueprint, derived }
}

describe('A-05 — bootstrap ships tracked template content only', () => {
  it('#0 BUG-015: every lib in scripts/lib/ is in MANAGED_FILES', async () => {
    await scenario('bootstrap-contents-0', async (s) => {
      // No bootstrap needed: this compares the CLI's declared list against what
      // is on disk. A lib that exists but is not managed means a derived project
      // receives a CLI it cannot run.
      const managed = await s.runScript('scripts/blueprint', ['files'], { cwd: REPO_ROOT })
      expect(
        managed.code,
        'blueprint files exited non-zero — the comparison below would run against a truncated list',
      ).toBe(0)

      const listed = new Set(managed.stdout.split('\n').map((l) => l.trim()).filter(Boolean))

      const found = await s.run('bash', ['-c', 'ls scripts/lib/*.sh'], { cwd: REPO_ROOT })
      const libs = found.stdout.split('\n').map((l) => l.trim()).filter(Boolean)

      expect(libs.length, 'discovery is broken, so this would prove nothing').toBeGreaterThan(3)

      const unshipped = libs.filter((l) => !listed.has(l))
      expect(
        unshipped,
        'libs exist but are NOT in MANAGED_FILES, so a derived project cannot run the CLI',
      ).toEqual([])
    })
  })

  it('#1 BUG-013: the blueprint-root marker does not ship', async () => {
    await scenario('bootstrap-contents-1', async (s) => {
      const { derived } = await build(s)

      // If it shipped, every derived project would positively identify as the
      // blueprint, and `drift` would compare nothing and exit 0 — the bug
      // restored through the bootstrap door instead of the detection one.
      expect(await s.fs.exists(join(derived, '.blueprint-root'))).toBe(false)
    })
  })

  it('#1b A-05: an untracked .env does not ship', async () => {
    await scenario('bootstrap-contents-1b', async (s) => {
      const { derived } = await build(s)
      expect(
        await s.fs.exists(join(derived, '.env')),
        'this is the SONAR_TOKEN leak path',
      ).toBe(false)
    })
  })

  it('#1c A-05: gitignored logs/ do not ship', async () => {
    await scenario('bootstrap-contents-1c', async (s) => {
      const { derived } = await build(s)
      expect(await s.fs.exists(join(derived, 'logs/agent-activity.log'))).toBe(false)
    })
  })

  it("#2 A-05: the blueprint's own tracked work items do not ship", async () => {
    await scenario('bootstrap-contents-2', async (s) => {
      const { derived } = await build(s)

      // Otherwise a new project opens with the blueprint's active bugs in its
      // docs/doing/ and reads them as its own.
      expect(await s.fs.exists(join(derived, 'docs/doing/PLAN-BUG-999.md'))).toBe(false)
    })
  })

  it('#3 the lifecycle structure and templates still ship', async () => {
    await scenario('bootstrap-contents-3', async (s) => {
      const { derived } = await build(s)

      const missing: string[] = []
      for (const f of [
        'docs/doing/README.md',
        'docs/doing/HANDOVER.md',
        'docs/backlog/BACKLOG.md',
        'docs/backlog/BUGS.md',
        'docs/waiting-acceptance/README.md',
      ]) {
        if (!(await s.fs.exists(join(derived, f)))) missing.push(f)
      }

      expect(missing, 'the export boundary excluded template content it must keep').toEqual([])
    })
  })

  it('#3b the blueprint content a project needs still ships', async () => {
    await scenario('bootstrap-contents-3b', async (s) => {
      const { derived } = await build(s)

      // Split out as its own case: the shell original checked this list inside
      // case 3's loop and printed no pass line for it, so it was invisible in
      // the count and would have gone silent if the loop broke.
      const missing: string[] = []
      for (const f of [
        'CLAUDE.md',
        'AGENTS.md',
        'scripts/agent-activity.sh',
        '.githooks/pre-push',
        'tests/marker-merge/test.sh',
      ]) {
        if (!(await s.fs.exists(join(derived, f)))) missing.push(f)
      }

      expect(missing).toEqual([])
    })
  })

  it('#4 the roster is seeded from the example, not inherited', async () => {
    await scenario('bootstrap-contents-4', async (s) => {
      const { derived } = await build(s)

      // The .env model: the example is tracked and ships; the personal copy is
      // seeded FROM it, never inherited from whoever ran bootstrap. The fixture
      // blueprint carries a personal roster reading "personal roster", so an
      // inherited one is detectable rather than merely absent.
      expect(
        await s.fs.exists(join(derived, 'AGENT_ROSTER.example.md')),
        'nothing to seed from',
      ).toBe(true)
      expect(
        await s.fs.exists(join(derived, 'AGENT_ROSTER.md')),
        'the project has no live roster',
      ).toBe(true)

      const live = await readFile(join(derived, 'AGENT_ROSTER.md'), 'utf8')
      const example = await readFile(join(derived, 'AGENT_ROSTER.example.md'), 'utf8')
      expect(
        live,
        "the operator's personal roster was inherited instead of seeded from the example",
      ).toBe(example)
    })
  })

  it("#5 A-05: tracked work items are absent from the derived project's git history", async () => {
    await scenario('bootstrap-contents-5', async (s) => {
      const { derived } = await build(s)

      // This is the case that had to be corrected once. Asserting "no .env in
      // history" passed both before and after the fix — the copied .gitignore
      // travels with it, so `git add -A` skips it in the derived repo too. A
      // tautology, not coverage. The genuine history leak is the TRACKED work
      // item, which IS committed pre-fix and is excluded post-fix by
      // export-ignore. Pin THAT.
      const tracked = await s.run('git', ['ls-files'], { cwd: derived })
      expect(
        tracked.stdout,
        'git archive alone would still ship it; export-ignore is what excludes it',
      ).not.toContain('PLAN-BUG-999')
    })
  })

  it('#5b A-05: .env is absent from the derived working tree', async () => {
    await scenario('bootstrap-contents-5b', async (s) => {
      const { derived } = await build(s)

      // Recorded as its own case so the distinction is not overstated again:
      // the .env leak is CONFIDENTIALITY, not history. It must not reach the
      // working tree at all.
      expect(await s.fs.exists(join(derived, '.env'))).toBe(false)
    })
  })

  it.each([
    'scripts/start-codex-signal-watch.sh',
    'scripts/start-gemini-signal-watch.sh',
    'scripts/codex-signal-watch.sh',
  ])('#6 A-09: %s has its placeholder substituted at bootstrap', async (rel) => {
    await scenario(`bootstrap-contents-6-${rel.replace(/[^a-z0-9]+/gi, '-')}`, async (s) => {
      const { derived } = await build(s)

      // The Gemini launcher was omitted from new-project.sh TARGETS while both
      // Codex scripts were listed, so a derived Gemini launcher kept a literal
      // {{PROJECT_NAME}} in its prompt. No test caught it because none asserted
      // substitution. All three dispatchers are pinned, one case each.
      expect(await s.fs.exists(join(derived, rel)), 'did not ship into the derived project').toBe(
        true,
      )

      const text = await readFile(join(derived, rel), 'utf8')
      expect(text, 'omitted from new-project.sh TARGETS').not.toContain('{{PROJECT_NAME}}')
    })
  })

  it('#7 A-09: the SonarQube projectKey is substituted at bootstrap', async () => {
    await scenario('bootstrap-contents-7', async (s) => {
      const { derived } = await build(s)

      // Left literal, EVERY derived project uploads under the one key
      // "{{PROJECT_NAME}}" and they collide on a single SonarQube project,
      // trampling each other's issues and coverage — the same cross-project
      // contamination class as the shared log dir, on the Sonar key instead. It
      // is bootstrapped and project-owned rather than pull-synced, so
      // substitution here is the ONLY place this can be made right.
      expect(await s.fs.exists(join(derived, 'sonar-project.properties'))).toBe(true)

      const text = await readFile(join(derived, 'sonar-project.properties'), 'utf8')
      expect(text, 'every project would collide on one Sonar key').not.toContain(
        '{{PROJECT_NAME}}',
      )
      expect(text).toContain(PROJECT)
    })
  })

  it('#8 BUG-012: blueprint_source is relative and resolves from the project root', async () => {
    await scenario('bootstrap-contents-8', async (s) => {
      const { derived } = await build(s)

      // Bootstrap used to write an absolute host path. It is the one field in
      // .blueprint-source that cannot be correct on two machines at once, and a
      // derived project proved it: a `/Users/…` path carried onto a Linux box
      // killed every blueprint command. A relative path survives that, and the
      // commoner case of moving or re-cloning the tree, because what it pins is
      // the LAYOUT — blueprint beside project — which is what bootstrap knows.
      const conf = await readFile(join(derived, '.blueprint-source'), 'utf8')
      const line = conf.split('\n').find((l) => l.startsWith('blueprint_source'))
      expect(line, 'derived .blueprint-source has no blueprint_source field').toBeDefined()

      const value = line!.split('=').slice(1).join('=').trim()
      expect(value).not.toBe('')
      expect(value.startsWith('/'), `bootstrap wrote an ABSOLUTE blueprint_source (${value})`).toBe(
        false,
      )

      expect(
        await s.fs.exists(join(derived, value, 'scripts/blueprint')),
        `blueprint_source (${value}) does not resolve to a blueprint checkout from the project root — relative, but pointing nowhere`,
      ).toBe(true)
    })
  })
})
