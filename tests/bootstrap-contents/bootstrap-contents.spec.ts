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
 *   TASK-025 no `blueprint_source` at all — drift and pull read the blueprint's
 *            address, so there is no local path to record (this replaced BUG-012's
 *            rule that the path be RELATIVE)
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
 *
 * MUTATION RECIPE (TASK-018-RULES R6). This suite's shell runner was deleted
 * once this spec was proven equivalent to it. R6 requires the way to reintroduce
 * the bug to be RECORDED, and R1 puts a test's description in the test — so it
 * lives here rather than in the tier table that used to hold it.
 *
 *   Mutant: Delete the `.blueprint-root  export-ignore` line from `.gitattributes` AND
 * COMMIT IT — the fixture is built from `git archive HEAD`, so an uncommitted
 * mutant does not exist as far as this suite is concerned.
 *   Turns red: `#1` goes red reporting that `.blueprint-root` shipped, which would make every
 * derived project claim to BE the blueprint and `drift` compare nothing
 * (BUG-013).
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import { relativeLinkTargets } from '../doc-links/doc-links.js'
import { resolveConsumer } from '../helpers/shim.js'

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
  // The bootstrapper does not ship either (TASK-021), for the same reason.
  await s.run('cp', ['-p', join(REPO_ROOT, 'scripts/new-project.sh'), join(blueprint, 'scripts/new-project.sh')], {
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
  // A requirement document no .gitattributes line names, so #11 judges the
  // directory convention rather than a list of today's files.
  await s.fs.write(
    join(blueprint, 'docs/requirements/FIXTURE-999-SPEC.md'),
    "# FIXTURE-999 — this repo's own requirement\n\nMust NOT reach a derived project.\n",
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

      expect(libs.length, 'discovery is broken, so this would prove nothing').toBeGreaterThanOrEqual(5)

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

  it("#2b TASK-021: the blueprint's own docs/config records do not ship, and the folder README does", async () => {
    await scenario('bootstrap-contents-2b', async (s) => {
      const { derived } = await build(s)

      // What ships is managed now. A shipped findings.md would have pull offer to
      // overwrite every project's own findings register with this repo's.
      expect(await s.fs.exists(join(derived, 'docs/config/findings.md')), 'this repo\'s findings shipped').toBe(false)
      expect(await s.fs.exists(join(derived, 'docs/config/README.md')), 'the folder convention did not ship').toBe(true)
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
        // A "did tests/ arrive downstream" probe, so any SHIPPING runner in
        // that suite serves. It named `tests/marker-merge/test.sh` until
        // TASK-018 retired the shell runners; pinning the probe to a file
        // scheduled for deletion is how a case about one thing goes red for
        // another. The spec ships by the same `.gitattributes` rule the runner
        // did — `tests/` is a managed directory with no `export-ignore` line
        // for `marker-merge` — which is what `tests/manifest` #2b asserts.
        'tests/marker-merge/marker-merge.spec.ts',
      ]) {
        if (!(await s.fs.exists(join(derived, f)))) missing.push(f)
      }

      expect(missing).toEqual([])
    })
  })

  it('#3c TASK-046: the claude.internal.md import ships, and no bootstrap seeds the file', async () => {
    await scenario('bootstrap-contents-3c', async (s) => {
      const { derived } = await build(s)

      // The two halves of the contract, and they pull in opposite directions.
      // The IMPORT must arrive, because it is what makes a project-private file
      // load without the project editing the managed CLAUDE.md.
      const claudeMd = await readFile(join(derived, 'CLAUDE.md'), 'utf8')
      expect(claudeMd, 'a derived project does not import claude.internal.md').toContain(
        '@claude.internal.md',
      )

      // The FILE must not, because the project owns it. Seeding one would make
      // the blueprint the author of a file it promises never to write, and the
      // first `blueprint pull` would then be expected to maintain it.
      expect(
        await s.fs.exists(join(derived, 'claude.internal.md')),
        'bootstrap seeded claude.internal.md — the project owns that file, not the blueprint',
      ).toBe(false)

      // HONEST LIMIT. That Claude Code SKIPS an import whose file is missing is a
      // property of its loader, verified for TASK-043 and not executable from a
      // vitest spec. What this case pins is the blueprint's half of it: the
      // import is delivered and the file deliberately is not, which is exactly
      // the state a fresh project starts in.
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

  it('#5c TASK-048: a fresh project TRACKS the six framework documents, and still ignores project_config_*.md', async () => {
    await scenario('bootstrap-contents-5c', async (s) => {
      const { derived } = await build(s)

      // THE FOUNDER'S CRITERION, CHECKED RATHER THAN ASSUMED. `git add -A` at
      // bootstrap skips an ignored path in SILENCE — it reports nothing — so
      // "the six are tracked now" and "the six look tracked now" render
      // identically without this. #3b only asserts CLAUDE.md exists on disk,
      // which was true while it was ignored too.
      //
      // Before TASK-048 every one of these sat in the privacy block and none
      // reached the first commit's index, which is why a doc link into them
      // was dead in a clone (the limitation BUG-125 had to accept).
      const tracked = (await s.run('git', ['ls-files'], { cwd: derived })).stdout.split('\n')
      expect(tracked.length, 'the derived project has no index to read').toBeGreaterThan(10)

      const untracked = [
        'CLAUDE.md',
        'AGENTS.md',
        'AGENT_SIGNAL.md',
        'docs/DoD.md',
        'docs/PUBLISHING.md',
        'docs/doing/HANDOVER.md',
      ].filter((f) => !tracked.includes(f))
      expect(untracked, 'these are excluded again, so a clone cannot resolve a link into them').toEqual([])

      // The other half of the same decision: what stays private stays private.
      // A-27 put the threat model, the adversary assumptions and the infra
      // account IDs in two of these five, and TASK-048 did not touch them.
      expect(
        tracked.filter((f) => /^project_config_.*\.md$/.test(f)),
        'a project_config file reached the derived index',
      ).toEqual([])
    })
  })

  it.each([
    'scripts/start-codex-signal-watch.sh',
    'scripts/start-kimi-signal-watch.sh',
    'scripts/start-gemini-signal-watch.sh',
    'scripts/signal-watch.sh',
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

      // TASK-083 — a migrated launcher's own text is a fixed two-line shim
      // with no {{PROJECT_NAME}} of its own; the placeholder lives in its
      // `.mts` TARGET's AGENT_WAKE_COMMAND body now. Checking the shim's own
      // bytes here would pass vacuously (it never contained the placeholder),
      // exactly the "no test asserted substitution" gap this case exists to
      // close — resolveConsumer follows the shim, same as tests/state-dir.
      const target = resolveConsumer(derived, rel)?.rel ?? rel
      const text = await readFile(join(derived, target), 'utf8')
      expect(text, 'omitted from new-project.sh substitution').not.toContain('{{PROJECT_NAME}}')
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

  it('#8 TASK-025: bootstrap records no blueprint_source, only the address drift and pull read', async () => {
    await scenario('bootstrap-contents-8', async (s) => {
      const { derived } = await build(s)

      // BUG-012 made this field RELATIVE, because an absolute host path cannot
      // be right on two machines at once. TASK-025 removes it: the blueprint is
      // read by its address, and a local path was exactly what let a stale or
      // unpushed checkout become "the blueprint". A bootstrap that still wrote
      // it would hand every new project a line the CLI warns about on every run.
      const conf = await readFile(join(derived, '.blueprint-source'), 'utf8')
      expect(
        conf.split('\n').filter((l) => /^\s*blueprint_source\s*=/.test(l)),
        'bootstrap still records a local blueprint path',
      ).toEqual([])
      expect(conf, 'bootstrap no longer records the address placeholder drift and pull read').toMatch(
        /^blueprint_remote\s*=\s*FILL-ME-IN$/m,
      )
      // And the branch they read: released, which CI fast-forwards to the newest
      // commit every job passed. blueprint_branch stays a2bp's base.
      expect(conf, 'bootstrap does not point a new project at released').toMatch(
        /^blueprint_release_branch\s*=\s*released$/m,
      )
      expect(conf, 'bootstrap moved a2bp\'s base off main').toMatch(/^blueprint_branch\s*=\s*main$/m)
    })
  })

  it('#8b the placeholder bootstrap writes is the one a2bp refuses to push to', async () => {
    await scenario('bootstrap-contents-8b', async (s) => {
      const { derived } = await build(s)

      // Moved from a2bp-inputs #4c (TASK-021): that suite ships, and this reads
      // the bootstrapper, which does not. Asserted against what bootstrap really
      // wrote rather than a copy of the string, so the two cannot drift into a
      // config that bootstraps unusable and validates fine.
      const conf = await readFile(join(derived, '.blueprint-source'), 'utf8')
      const remote = /^blueprint_remote\s*=\s*(.*)$/m.exec(conf)?.[1]?.trim() ?? ''
      expect(remote, 'bootstrap wrote no blueprint_remote line').not.toBe('')

      const cfg = await s.fs.write('cfg', `config_version   = 2\nblueprint_remote = ${remote}\n`)
      const r = await s.run(
        'bash',
        ['-c', '. "$1/scripts/lib/request.sh"\n. "$1/scripts/lib/request-config.sh"\nbp_config_load "$2"', '_', REPO_ROOT, cfg],
        { cwd: s.workspace.root },
      )
      expect(r.code, `bootstrap writes '${remote}', which bp_config_load ACCEPTS — a fresh project would push to it`).not.toBe(0)
    })
  })

  it('#9 TASK-021: the bootstrapper, LICENSE and the dead acceptance script do not ship, and no link names LICENSE', async () => {
    await scenario('bootstrap-contents-9', async (s) => {
      const { derived } = await build(s)

      const shipped: string[] = []
      for (const f of ['scripts/new-project.sh', 'LICENSE', 'scripts/accept-bug-022.sh']) {
        if (await s.fs.exists(join(derived, f))) shipped.push(f)
      }
      expect(shipped, 'blueprint-only files reached a new project').toEqual([])

      const readme = await readFile(join(derived, 'README.md'), 'utf8')
      expect(readme, 'the delivered README links to a LICENSE the project does not have').not.toMatch(/\]\(LICENSE\)/)
    })
  })

  it('#11 TASK-021: blueprint maintenance does not ship, by directory where it can, and protocol still does', async () => {
    await scenario('bootstrap-contents-11', async (s) => {
      const { derived } = await build(s)

      // The split is by responsibility: what operates a project, or asks the
      // blueprint for a change, ships. Deck publication, brand, the implementer's
      // playbook and this repo's own requirements are the blueprint's.
      const shipped: string[] = []
      for (const f of [
        'CLAUDE.blueprint.md',
        'docs/requirements/FIXTURE-999-SPEC.md',
        'docs/requirements/TASK-018-TARGET.md',
        'docs/talk-enforcing-agentic-quality.md',
        'docs/assets/brand/struct2flow-mark.svg',
        'docs/way-of-working.md',
        'scripts/build-deck.sh',
        'docs/A2BP_PLAYBOOK.md',
      ]) {
        if (await s.fs.exists(join(derived, f))) shipped.push(f)
      }
      expect(shipped, 'blueprint maintenance reached a new project').toEqual([])

      const missing: string[] = []
      for (const f of ['docs/requirements/README.md', 'AGENT_SIGNAL.md']) {
        if (!(await s.fs.exists(join(derived, f)))) missing.push(f)
      }
      expect(missing, 'protocol or a folder convention stopped shipping').toEqual([])

      // Same mechanism as claude.internal.md (#3c): the import arrives, the file
      // does not, and Claude Code skips an import whose file is missing.
      const claudeMd = await readFile(join(derived, 'CLAUDE.md'), 'utf8')
      expect(claudeMd, 'CLAUDE.md does not import the blueprint-only file').toContain('@CLAUDE.blueprint.md')
    })
  })

  it('#12 TASK-021: every relative link in the delivered root CLAUDE.md and README.md resolves', async () => {
    await scenario('bootstrap-contents-12', async (s) => {
      const { derived } = await build(s)

      // doc-links walks docs/ only, so the root files a project reads first were
      // checked nowhere. Judged where they are delivered: a real bootstrap.
      let examined = 0
      const broken: string[] = []
      for (const f of ['CLAUDE.md', 'README.md']) {
        for (const target of relativeLinkTargets(await readFile(join(derived, f), 'utf8'))) {
          examined++
          if (target.startsWith('/') || !(await s.fs.exists(join(derived, target)))) broken.push(`${f} -> ${target}`)
        }
      }
      expect(examined, 'no links examined, so a pass would mean nothing').toBeGreaterThan(5)
      expect(broken, 'links a derived project cannot follow').toEqual([])
    })
  })
})

/** The two sections `blueprint files` prints, run by `root`'s own CLI from `root`. */
async function filesOf(s: Scenario, root: string): Promise<{ managed: string[]; owned: string[] }> {
  const r = await s.run('bash', [join(root, 'scripts/blueprint'), 'files'], { cwd: root })
  expect(r.code, `blueprint files failed, so nothing below would be a comparison:\n${r.output}`).toBe(0)
  const managed: string[] = []
  const owned: string[] = []
  let into: string[] | null = null
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('Blueprint-managed files')) into = managed
    else if (line.startsWith('Template files')) into = owned
    else if (/^ {2}\S/.test(line)) into?.push(line.trim())
  }
  expect(managed.length, 'blueprint files listed no managed files').toBeGreaterThan(20)
  expect(owned.length, 'blueprint files listed no project-owned files').toBeGreaterThan(0)
  return { managed, owned }
}

/**
 * TASK-021 Stage 1 — the BOOTSTRAP/SYNC CONSISTENCY CHECK (Alexey, plan review
 * finding 3). Bootstrap delivers `git archive HEAD` plus the template seeds; pull
 * delivers the managed set. They have to be the same fact, so the managed set is
 * the archive minus what the project owns once seeded.
 *
 * Not an audience classifier: a blueprint document that should not ship still
 * ships, and is managed, until `.gitattributes` says otherwise.
 */
describe('TASK-021 — bootstrap and sync deliver the same set', () => {
  it('#10 archive = managed ∪ (archive ∩ project-owned), with ownership disjoint', async () => {
    await scenario('bootstrap-contents-10', async (s) => {
      const { managed, owned } = await filesOf(s, REPO_ROOT)

      const listing = await s.run(
        'bash',
        ['-c', 'git -C "$1" archive --format=tar HEAD | tar -t', '_', REPO_ROOT],
        { cwd: s.workspace.root },
      )
      expect(listing.code, listing.output).toBe(0)
      const archive = listing.stdout.split('\n').filter((l) => l && !l.endsWith('/')).sort()

      expect(managed.filter((f) => owned.includes(f)), 'a file is both managed and project-owned').toEqual([])
      expect(
        [...new Set([...managed, ...archive.filter((f) => owned.includes(f))])].sort(),
        'what pull keeps current is not what bootstrap ships',
      ).toEqual(archive)
    })
  })

  it('#10b every file a real bootstrap delivers is managed or project-owned, and every seed arrives', async () => {
    await scenario('bootstrap-contents-10b', async (s) => {
      const { blueprint, derived } = await build(s)
      const { managed, owned } = await filesOf(s, blueprint)

      const tracked = (await s.run('git', ['ls-files'], { cwd: derived })).stdout.split('\n').filter(Boolean)
      expect(tracked.length, 'the derived project has no index to read').toBeGreaterThan(20)

      // .blueprint-source is bootstrap's own record of where the project came from.
      expect(
        tracked.filter((f) => f !== '.blueprint-source' && !managed.includes(f) && !owned.includes(f)),
        'bootstrap delivered files that neither pull keeps current nor the project owns',
      ).toEqual([])

      const missing: string[] = []
      for (const f of owned) if (!(await s.fs.exists(join(derived, f)))) missing.push(f)
      expect(missing, 'project-owned files bootstrap did not seed').toEqual([])
    })
  })
})
