/**
 * tests/template-source/template-source.spec.ts — BUG-009 regression, TypeScript.
 *
 * The seed template and this repo's own config were the same files.
 * `project_config_*.md` at the root was simultaneously the template every new
 * project is seeded with AND the blueprint's live configuration. Bootstrap
 * ships `git archive HEAD`, so whatever the blueprint wrote about itself went
 * out to every new project.
 *
 * Not hypothetical: a wake-time `Monitor` row — with a rationale describing an
 * incident in *this* stream — was seeded verbatim into a derived project. The
 * 2026-08-02 mitigation emptied the table and added a warning, leaving the
 * STRUCTURE intact, so the next concrete thing written there would do it again.
 * Fourth instance of one defect, with BUG-002 (a hardcoded state dir), BUG-006
 * (one project's env namespace) and BUG-010 (a fleet's persona names).
 *
 * The split this pins:
 *   templates/project_config_*.md  → the seed source, placeholders only
 *   project_config_*.md (root)     → this repo's own, export-ignore'd
 *
 * Parallelism class: parallel-safe.
 *   Reads of the real checkout are read-only (`git archive`, file contents).
 *   The one case that writes — the bootstrap in #4 — does so entirely inside a
 *   scenario workspace, and the scenario canary asserts the real baton, feed
 *   and git config are byte-unchanged afterwards. That canary is the reason
 *   this port is worth making: the shell original needed four `unset` lines at
 *   the top to be safe (BUG-014, BUG-046), and each was a line someone had to
 *   remember.
 *
 * MUTATION RECIPE (TASK-018-RULES R6). This suite's shell runner was deleted
 * once this spec was proven equivalent to it. R6 requires the way to reintroduce
 * the bug to be RECORDED, and R1 puts a test's description in the test — so it
 * lives here rather than in the tier table that used to hold it.
 *
 *   Mutant: Delete the `project_config_overview.md  export-ignore` line from
 * `.gitattributes` AND COMMIT IT — `git archive` reads that file from the commit,
 * not the working tree, so an uncommitted deletion changes nothing and the spec
 * stays green.
 *   Turns red: `#2` goes red exactly where the shell runner did, reporting
 * `project_config_overview.md` as shipping, which is BUG-009 itself.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

/** The five configs every project needs. */
const CONFIGS = [
  'project_config_overview.md',
  'project_config_paths.md',
  'project_config_dod.md',
  'project_config_security.md',
  'project_config_infra.md',
] as const

/**
 * What bootstrap actually ships.
 *
 * Asserted against `git archive`, never against `.gitattributes`: the export
 * BEHAVIOUR is what matters, and a rule that is present but not taking effect
 * is precisely the failure mode being guarded.
 */
async function archiveListing(s: Scenario): Promise<string[]> {
  const r = await s.run('bash', ['-c', 'git archive --format=tar HEAD | tar -t'], {
    cwd: REPO_ROOT,
  })
  return r.stdout.split('\n').filter(Boolean)
}

describe("BUG-009 — the seed template and this repo's own config are separate", () => {
  it('#1 templates/ carries all 5 project_config templates', async () => {
    await scenario('template-source-1', async (s) => {
      const missing: string[] = []
      for (const c of CONFIGS) {
        const r = await s.run('test', ['-f', join(REPO_ROOT, 'templates', c)], {
          cwd: REPO_ROOT,
        })
        if (r.code !== 0) missing.push(c)
      }

      expect(
        missing,
        'templates/ is the seed source — a project cannot be bootstrapped without these',
      ).toEqual([])
    })
  })

  it("#2 the root project_config_*.md do not ship (this repo's own config stays here)", async () => {
    await scenario('template-source-2', async (s) => {
      const listing = await archiveListing(s)

      // Non-vacuity FIRST. The assertion below passes against an empty
      // listing, so the listing has to be proven real before it is read.
      expect(
        listing,
        'the archive listing is empty or unreadable — the assertion below would pass over nothing',
      ).toContain('CLAUDE.md')

      const shipped = CONFIGS.filter((c) => listing.includes(c))
      expect(
        shipped,
        "the blueprint's OWN config ships to every new project — this is BUG-009 itself",
      ).toEqual([])
    })
  })

  it('#2b templates/ does not ship either', async () => {
    await scenario('template-source-2b', async (s) => {
      const listing = await archiveListing(s)

      expect(listing, 'archive listing unreadable — this case would prove nothing').toContain(
        'CLAUDE.md',
      )
      expect(
        listing.filter((p) => p.startsWith('templates/')),
        'a derived project would carry a seed source it cannot use',
      ).toEqual([])
    })
  })

  it('#2c the archive is non-empty and recognisable', async () => {
    await scenario('template-source-2c', async (s) => {
      // Kept as its OWN case rather than folded into #2 and #2b as a
      // precondition, which is what the first draft of this port did.
      // TASK-018-CONVENTIONS requires case IDs and counts to be
      // non-decreasing: a merged case is invisible in the count, and "we
      // covered it inline" is how a migration quietly drops an assertion.
      // #2 and #2b assert it too -- cheap, and each case should fail for its
      // own reason.
      const listing = await archiveListing(s)

      expect(
        listing.length,
        'the archive produced no listing at all, so #2 and #2b proved nothing',
      ).toBeGreaterThan(0)
      expect(
        listing,
        'the archive has no CLAUDE.md — the listing is wrong, so #2/#2b proved nothing',
      ).toContain('CLAUDE.md')
    })
  })

  it('#3 templates contain no host paths', async () => {
    await scenario('template-source-3', async () => {
      // Host homes, absolute user paths, and this repo's own state dir. A
      // template naming a host, a path or an incident is the bug reappearing
      // on the other side of the fence.
      const hostPath = /\/(Users|home)\/[A-Za-z0-9_.-]+\/|~\/\.blueprint\b/
      const dirty: string[] = []

      for (const c of CONFIGS) {
        let text: string
        try {
          text = await readFile(join(REPO_ROOT, 'templates', c), 'utf8')
        } catch {
          continue // absence is #1's assertion, not this one's
        }
        if (hostPath.test(text)) dirty.push(c)
      }

      expect(
        dirty,
        'a template contains host-specific paths — it would seed into every project',
      ).toEqual([])
    })
  })

  describe('#4 bootstrap still produces a complete project', () => {
    /**
     * new-project.sh REFUSES to run without a git author identity (A-14: it
     * inherits one rather than baking a person into every derived repo). The
     * scenario gives every child its own HOME, so the operator's real identity
     * is invisible by construction and one must be supplied — via the
     * documented env-var override, which is exactly the path that contract
     * exists to support.
     *
     * BUG-044 is why that is worth stating: `git var` GUESSES an identity from
     * gecos and hostname rather than failing, so on some hosts a bootstrap with
     * no identity silently commits as a machine-invented author. The probe now
     * sets `user.useConfigOnly`; this case supplies an identity rather than
     * relying on whatever the host would have invented.
     */
    async function bootstrap(s: Scenario) {
      const out = s.workspace.path('proj')
      const r = await s.runScript('scripts/new-project.sh', ['tmpl-check', out], {
        cwd: s.workspace.root,
        env: {
          GIT_AUTHOR_NAME: 'tmpl test',
          GIT_AUTHOR_EMAIL: 'tmpl@local',
          GIT_COMMITTER_NAME: 'tmpl test',
          GIT_COMMITTER_EMAIL: 'tmpl@local',
        },
        timeoutMs: 120_000,
      })
      return { out, r }
    }

    it('#4 bootstrap seeds all 5 configs into the new project', async () => {
      await scenario('template-source-4', async (s) => {
        const { out, r } = await bootstrap(s)
        expect(r.code, r.output).toBe(0)

        const absent: string[] = []
        for (const c of CONFIGS) {
          const t = await s.run('test', ['-f', join(out, c)], { cwd: out })
          if (t.code !== 0) absent.push(c)
        }

        expect(
          absent,
          'the split dropped a config — a project without one looks fine until somebody needs it',
        ).toEqual([])
      })
    })

    it('#4b the seeded config is substituted for the new project', async () => {
      await scenario('template-source-4b', async (s) => {
        const { out, r } = await bootstrap(s)
        expect(r.code, r.output).toBe(0)

        const seeded = await readFile(join(out, 'project_config_paths.md'), 'utf8')
        expect(seeded, 'the seeded config still carries the raw placeholder').not.toContain(
          '{{PROJECT_NAME}}',
        )
        expect(seeded, "substitution ran but did not write this project's name").toContain(
          'tmpl-check',
        )
      })
    })

    it('#4c the new project has no templates/ of its own', async () => {
      await scenario('template-source-4c', async (s) => {
        const { out, r } = await bootstrap(s)
        expect(r.code, r.output).toBe(0)

        const t = await s.run('test', ['-d', join(out, 'templates')], { cwd: out })
        expect(t.code, 'the new project carries a templates/ directory it cannot use').not.toBe(0)
      })
    })
  })
})
