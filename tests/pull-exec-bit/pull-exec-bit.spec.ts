/**
 * tests/pull-exec-bit/pull-exec-bit.spec.ts — BUG-008 regression, TypeScript.
 *
 * Parallelism class: parallel-safe.
 *   Every mutation happens inside a scenario workspace. The only real-checkout
 *   access is read-only case #5, which is intentionally non-vacuous only in the
 *   blueprint tier: if no executable placeholder-bearing managed file exists,
 *   the suite must fail rather than silently covering nothing.
 *
 * MUTATION RECIPE (TASK-018-RULES R6). This suite's shell runner was deleted
 * once this spec was proven equivalent to it. R6 requires the way to reintroduce
 * the bug to be RECORDED, and R1 puts a test's description in the test — so it
 * lives here rather than in the tier table that used to hold it.
 *
 *   Mutant: Remove the mode-preservation block from `scripts/lib/placeholders.sh`, so a
 * pulled hook lands without its executable bit.
 *   Turns red: `#1` goes red on the mode assertion, observing 600 where 755 is required, which
 * is the BUG-008 defect itself.
 */

import { describe, it, expect } from 'vitest'
import { chmod, copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const LIB = join(REPO_ROOT, 'scripts/lib/placeholders.sh')

async function modeOf(path: string): Promise<string> {
  const st = await stat(path)
  return (st.mode & 0o777).toString(8)
}

async function substitute(
  s: Scenario,
  file: string,
  name: string,
  env: Record<string, string | undefined> = {},
) {
  return s.run(
    'bash',
    ['-c', '. "$1"; bp_substitute_in_place "$2" "$3"', '_', LIB, file, name],
    { cwd: s.workspace.root, env },
  )
}

describe('BUG-008 — pull preserves executable bits during substitution', () => {
  it('#1 the substitution primitive preserves 755 on an executable file', async () => {
    await scenario('pull-exec-bit-1', async (s) => {
      const f = s.workspace.path('exec-file.sh')
      await writeFile(f, '#!/bin/sh\n# {{PROJECT_NAME}}\necho hi\n', 'utf8')
      await chmod(f, 0o755)

      const before = await modeOf(f)
      const r = await substitute(s, f, 'demo-project')
      const after = await modeOf(f)

      expect(before, 'fixture must start executable or the assertion is meaningless').toBe('755')
      expect(r.code).toBe(0)
      expect(after).toBe('755')
    })
  })

  it('#2 the placeholder was substituted (the mode fix did not skip the write)', async () => {
    await scenario('pull-exec-bit-2', async (s) => {
      const f = s.workspace.path('exec-file.sh')
      await writeFile(f, '#!/bin/sh\n# {{PROJECT_NAME}}\necho hi\n', 'utf8')
      await chmod(f, 0o755)

      const r = await substitute(s, f, 'demo-project')
      const content = await readFile(f, 'utf8')

      expect(r.code).toBe(0)
      expect(content).not.toContain('{{PROJECT_NAME}}')
      expect(content).toContain('demo-project')
    })
  })

  it('#3 a 644 file stays 644 (the mode is preserved, not forced)', async () => {
    await scenario('pull-exec-bit-3', async (s) => {
      const g = s.workspace.path('plain.md')
      await writeFile(g, '# {{PROJECT_NAME}}\n', 'utf8')
      await chmod(g, 0o644)

      const r = await substitute(s, g, 'demo-project')

      expect(r.code).toBe(0)
      expect(await modeOf(g)).toBe('644')
    })
  })

  it('#4 a refused substitution leaves content and mode exactly as they were', async () => {
    await scenario('pull-exec-bit-4', async (s) => {
      const h = s.workspace.path('refused.sh')
      const original = '#!/bin/sh\n{{PROJECT_NAME}}\n'
      await writeFile(h, original, 'utf8')
      await chmod(h, 0o700)

      const r = await substitute(s, h, 'bad\nname')

      expect(r.code).not.toBe(0)
      expect(await readFile(h, 'utf8')).toBe(original)
      expect(await modeOf(h)).toBe('700')
    })
  })

  it('#5 all executable placeholder-bearing managed files stay executable', async () => {
    await scenario('pull-exec-bit-5', async (s) => {
      const managed = [
        '.githooks/pre-push',
        'scripts/start-codex-signal-watch.sh',
        'scripts/start-gemini-signal-watch.sh',
      ]
      let checked = 0

      for (const rel of managed) {
        const src = join(REPO_ROOT, rel)
        const srcStat = await stat(src).catch(() => undefined)
        if (!srcStat?.isFile()) continue
        const srcContent = await readFile(src, 'utf8')
        if (!srcContent.includes('{{PROJECT_NAME}}')) continue
        if ((srcStat.mode & 0o111) === 0) continue

        checked += 1
        const dst = s.workspace.path(`real-${basename(rel)}`)
        await copyFile(src, dst)
        await chmod(dst, srcStat.mode & 0o777)

        const r = await substitute(s, dst, 'demo-project')
        const m = await modeOf(dst)

        expect(r.code, `${rel} substitution should succeed`).toBe(0)
        expect(
          (Number.parseInt(m, 8) & 0o111) !== 0,
          `${rel} came out non-executable (${m})`,
        ).toBe(true)
      }

      expect(
        checked,
        'no executable placeholder-bearing managed file found — this suite is vacuous',
      ).toBeGreaterThan(0)
    })
  })

  it('#6 when the mode cannot be preserved, the original is left untouched and the call fails', async () => {
    await scenario('pull-exec-bit-6', async (s) => {
      const inj = await s.workspace.dir('inj')
      const statLog = s.workspace.path('stat-args')
      await writeFile(statLog, '', 'utf8')
      await writeFile(join(inj, 'chmod'), '#!/bin/sh\nexit 1\n', 'utf8')
      await chmod(join(inj, 'chmod'), 0o755)
      await writeFile(
        join(inj, 'stat'),
        `#!/bin/sh\necho "$@" >>"${statLog}"\nexit 1\n`,
        'utf8',
      )
      await chmod(join(inj, 'stat'), 0o755)

      const k = s.workspace.path('faulty.sh')
      const original = '#!/bin/sh\n# {{PROJECT_NAME}}\n'
      await writeFile(k, original, 'utf8')
      await chmod(k, 0o755)

      const r = await substitute(s, k, 'demo-project', {
        PATH: `${inj}:/usr/bin:/bin:/usr/sbin:/sbin`,
      })
      const leftovers = (await readdir(dirname(k))).filter((name) =>
        name.startsWith('.bp-subst.'),
      )

      expect(r.code).not.toBe(0)
      expect(await modeOf(k)).toBe('755')
      expect(await readFile(k, 'utf8')).toBe(original)
      expect(leftovers).toEqual([])
    })
  })

  it('#6b both the GNU and BSD mode probes are attempted before giving up', async () => {
    await scenario('pull-exec-bit-6b', async (s) => {
      const inj = await s.workspace.dir('inj')
      const statLog = s.workspace.path('stat-args')
      await writeFile(statLog, '', 'utf8')
      await writeFile(join(inj, 'chmod'), '#!/bin/sh\nexit 1\n', 'utf8')
      await chmod(join(inj, 'chmod'), 0o755)
      await writeFile(
        join(inj, 'stat'),
        `#!/bin/sh\necho "$@" >>"${statLog}"\nexit 1\n`,
        'utf8',
      )
      await chmod(join(inj, 'stat'), 0o755)

      const k = s.workspace.path('faulty.sh')
      await writeFile(k, '#!/bin/sh\n# {{PROJECT_NAME}}\n', 'utf8')
      await chmod(k, 0o755)

      await substitute(s, k, 'demo-project', {
        PATH: `${inj}:/usr/bin:/bin:/usr/sbin:/sbin`,
      })
      const log = await readFile(statLog, 'utf8')

      expect(log, 'GNU stat probe was never attempted').toMatch(/(?:^|\n)-c /)
      expect(log, 'BSD stat fallback was never attempted').toMatch(/(?:^|\n)-f /)
    })
  })

  it('#7 the temp is created in the destination directory (atomic rename)', async () => {
    await scenario('pull-exec-bit-7', async () => {
      const lib = await readFile(LIB, 'utf8')

      expect(lib).toContain('mktemp "$dir/.bp-subst.XXXXXX"')
    })
  })
})
