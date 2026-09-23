/**
 * tests/contamination-push-scan/contamination-push-scan.spec.ts — TASK-079
 * (TASK-062-16), audit row C168.
 *
 * THE FINDING. C168 was written as if `.githooks/pre-push` had a contamination
 * call site to extend. Measured, it has none: `contamination_scan`
 * (scripts/lib/contamination.sh) ran only from `scripts/blueprint`'s a2bp
 * path, so nothing scanned a push for the BUG-002 / A-09 shapes — a host home
 * path, a foreign per-project state dir, an operator's specifics landing in a
 * managed file and publishing to every downstream project on the next
 * `blueprint pull`. The founder chose the CI-only route (PLAN-TASK-062
 * §"Founder decisions" #3, 2026-09-22): the `contamination` job in
 * .github/workflows/security.yml runs scripts/contamination-push-scan.mts over
 * the pushed diff, and the release job's needs-list keeps a red result from
 * advancing `released`.
 *
 * THE PROPERTY THAT MATTERS MOST IS REUSE. The job's value is that it applies
 * contamination.sh's OWN checker to the pushed diff — not a forked copy of its
 * patterns, which would drift silently (the audit CSV's re-open condition).
 * Case #1 pins that mechanically: the script sources the library and contains
 * none of its regexes itself.
 *
 * A GitHub job cannot be run locally, so the fixture cases below drive the
 * checker EXACTLY the way the job's step does — `node
 * scripts/contamination-push-scan.mts --range/--before/--after` — over a
 * fixture repo, with the plant shown red and its removal shown green.
 *
 * SCOPE, stated so the fixture cases read as intent and not omission: the
 * scan runs only where `.blueprint-root` exists. A derived project's push
 * publishes nothing (a2bp's own scan is its pre-publication stop), and
 * scanning a project's whole diff would block its own files for naming their
 * own project — so there the script announces the skip and exits 0.
 */

import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { REPO_ROOT, scenario } from '../harness/index.js'

const SUBJECT_ROOT = process.env.BP_SUBJECT_ROOT ?? REPO_ROOT
const SCRIPT = join(SUBJECT_ROOT, 'scripts/contamination-push-scan.mts')

async function workflow(): Promise<string> {
  return readFile(join(REPO_ROOT, '.github/workflows/security.yml'), 'utf8')
}

describe('TASK-079 — the pushed diff is scanned by contamination.sh’s own checker', () => {
  it('#1 the script SOURCES contamination.sh and carries none of its patterns itself', async () => {
    const text = await readFile(SCRIPT, 'utf8')
    expect(text).toContain('contamination.sh')
    // The checker's regexes. If any of these appears in the script, the
    // patterns have been forked and will drift — the audit's re-open trigger.
    expect(text).not.toMatch(/\?\(Users\|home\)|\(Users\|home\)/)
    expect(text).not.toMatch(/\$HOME\|~/)
    expect(text).not.toMatch(/_CONTAMINATION_KNOWN_DOTDIRS\s*=/)
  })

  it('#2 the workflow wires the job to the script and gates released on it', async () => {
    const text = await workflow()
    const job = text.match(/^ {2}contamination:\n(?:(?: {4}.*| {2} {2}.*)\n?)+/m)
    expect(job, 'security.yml has a contamination job').not.toBeNull()
    expect(job?.[0]).toContain('node scripts/contamination-push-scan.mts')
    expect(text).toMatch(/needs: \[[^\]]*\bcontamination\b[^\]]*\]/)
  })

  it('#3 a derived project checkout skips, announced, and never blocks', async () => {
    await scenario('cps-derived', async (s) => {
      const repo = await s.gitRepo('acme-flow', { initialCommit: true })
      await s.fs.write('acme-flow/README.md', 'see /home/alice/notes\n')
      await repo.commitAll('add readme')
      // No .blueprint-root: contamination publishes only from the blueprint.
      const r = await s.run('node', [SCRIPT, '--repo', repo.dir, '--range', 'HEAD~1..HEAD'], {
        cwd: repo.dir,
      })
      expect(r.code).toBe(0)
      expect(r.output).toContain('SKIP')
      expect(r.output).toContain('.blueprint-root')
    })
  })

  it('TASK-079: a planted contaminated line fails the pushed-diff scan, and removing it passes', async () => {
    await scenario('cps-red-green', async (s) => {
      const repo = await s.gitRepo('bp', { initialCommit: true })
      await s.fs.write('bp/.blueprint-root', 'blueprint\n')
      await s.fs.write('bp/README.md', 'generic docs\n')
      await repo.commitAll('base')

      // RED — the plant, driven exactly as the job drives it.
      await s.fs.write('bp/README.md', 'generic docs\nsee /home/alice/secret-notes for details\n')
      await repo.commitAll('plant a host path')
      const red = await s.run('node', [SCRIPT, '--repo', repo.dir, '--range', 'HEAD~1..HEAD'], {
        cwd: repo.dir,
      })
      expect(red.code).toBe(1)
      expect(red.output).toContain('BLOCK')
      expect(red.output).toContain('host home path')
      expect(red.output).toContain('README.md')

      // GREEN — the plant removed.
      await s.fs.write('bp/README.md', 'generic docs\n')
      await repo.commitAll('remove the plant')
      const green = await s.run('node', [SCRIPT, '--repo', repo.dir, '--range', 'HEAD~1..HEAD'], {
        cwd: repo.dir,
      })
      expect(green.code).toBe(0)
      expect(green.output).toContain('PASS')
    })
  })

  it('#5 the a2bp-allow override works exactly as on the a2bp path: justified suppresses, bare does not', async () => {
    await scenario('cps-allow', async (s) => {
      const repo = await s.gitRepo('bp', { initialCommit: true })
      await s.fs.write('bp/.blueprint-root', 'blueprint\n')
      await s.fs.write(
        'bp/README.md',
        'generic\n/home/alice/x — a2bp-allow: incident record, not a live path\n',
      )
      await repo.commitAll('justified marker')
      const ok = await s.run('node', [SCRIPT, '--repo', repo.dir, '--range', 'HEAD~1..HEAD'], {
        cwd: repo.dir,
      })
      expect(ok.code).toBe(0)

      await s.fs.write('bp/README.md', 'generic\n/home/alice/x — a2bp-allow:\n')
      await repo.commitAll('bare marker')
      const bare = await s.run('node', [SCRIPT, '--repo', repo.dir, '--range', 'HEAD~1..HEAD'], {
        cwd: repo.dir,
      })
      expect(bare.code).toBe(1)
    })
  })

  it('#6 the residual-name class has no operand on a blueprint push and is demoted, not deleted', async () => {
    await scenario('cps-demote', async (s) => {
      // The repo's own basename IS "acme-flow": on the blueprint's own pushes
      // the name class would flag the repo's docs for naming themselves.
      const repo = await s.gitRepo('acme-flow', { initialCommit: true })
      await s.fs.write('acme-flow/.blueprint-root', 'blueprint\n')
      await s.fs.write('acme-flow/README.md', 'mentions acme-flow by name\n')
      await repo.commitAll('name the repo')
      const r = await s.run('node', [SCRIPT, '--repo', repo.dir, '--range', 'HEAD~1..HEAD'], {
        cwd: repo.dir,
      })
      expect(r.code).toBe(0)
      expect(r.output).toContain('demoted')
      // The other classes stand unfiltered in the same mode.
      await s.fs.write('acme-flow/TOOLS.md', 'state lives in ~/.other-project/state/\n')
      await repo.commitAll('plant a foreign state dir')
      const foreign = await s.run('node', [SCRIPT, '--repo', repo.dir, '--range', 'HEAD~1..HEAD'], {
        cwd: repo.dir,
      })
      expect(foreign.code).toBe(1)
      expect(foreign.output).toContain('literal per-project state dir')
    })
  })

  it('#7 push-event range semantics: new branch scans the tip with a warning, a rollback scans nothing', async () => {
    await scenario('cps-ranges', async (s) => {
      const repo = await s.gitRepo('bp', { initialCommit: true })
      await s.fs.write('bp/.blueprint-root', 'blueprint\n')
      await s.fs.write('bp/README.md', 'see /home/alice/notes\n')
      await repo.commitAll('tip with a plant')
      const zero = '0000000000000000000000000000000000000000'
      const after = (await repo.git(['rev-parse', 'HEAD'])).stdout.trim()
      const before = (await repo.git(['rev-parse', 'HEAD~1'])).stdout.trim()

      const newBranch = await s.run(
        'node',
        [SCRIPT, '--repo', repo.dir, '--before', zero, '--after', after],
        { cwd: repo.dir },
      )
      expect(newBranch.output).toContain('new branch push')
      expect(newBranch.code).toBe(1)

      // A rollback: after is an ancestor of before — nothing new to scan.
      const rollback = await s.run(
        'node',
        [SCRIPT, '--repo', repo.dir, '--before', after, '--after', before],
        { cwd: repo.dir },
      )
      expect(rollback.code).toBe(0)
      expect(rollback.output).toContain('nothing new')
    })
  })
})
