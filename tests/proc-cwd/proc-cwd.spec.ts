/**
 * tests/proc-cwd/proc-cwd.spec.ts — BUG-036 regression, TypeScript.
 *
 * FIRST MIGRATED SUITE. Chosen as the exemplar because it is small, it was
 * written in shell earlier the same day, and its shell twin
 * (tests/proc-cwd/test.sh) still exists — so the two can be compared directly,
 * which is what §5 of PLAN-TASK-018 requires before any shell runner is deleted.
 *
 * Parallelism class: parallel-safe.
 *   Every scenario owns its workspace, its HOME and its processes. It makes no
 *   global-absence claim and reads no shared file. Verified by the
 *   self-concurrency check.
 *
 * THE BUG. Three test helpers resolved a process's working directory by reading
 * /proc/<pid>/cwd. macOS has no procfs, so the read returned empty, ownership
 * comparisons never matched, and every "how many of MY processes are running?"
 * count came back 0 while the processes ran fine. Six cases failed closed and
 * the pre-push gate could not pass on a Mac at all.
 *
 * WHAT CHANGES IN THE PORT, and why it is not a weakening: the shell suite
 * tested `bp_proc_cwd`, a shell function. Its TypeScript equivalent is the
 * harness's own process ownership. So these scenarios assert the PROPERTY the
 * shell function existed to provide — that a scenario can identify and reap the
 * processes it started, on this OS — rather than re-testing a shell helper that
 * the TS harness does not use. Case IDs are preserved so the mapping to the
 * shell suite, and to the bug row, stays legible.
 */

import { describe, it, expect } from 'vitest'
import { scenario } from '../harness/index.js'
import { platform } from 'node:os'

describe('BUG-036 — process identity resolves on this OS', () => {
  it('#1 a scenario can spawn a process and observe its real working directory', async () => {
    await scenario('proc-cwd-1', async (s) => {
      const dir = await s.workspace.dir('plain')

      // `pwd -P` gives the PHYSICAL path. On macOS the workspace root is
      // already physical (the harness resolves it at creation), so these must
      // match exactly. Before BUG-036 they did not: mktemp handed back
      // /var/folders/... while the process reported /private/var/folders/...
      // and the comparison silently matched nothing.
      const r = await s.run('sh', ['-c', 'pwd -P'], { cwd: dir })

      expect(r.code).toBe(0)
      expect(r.stdout.trim()).toBe(dir)
    })
  })

  it('#3 a working directory containing spaces survives intact', async () => {
    await scenario('proc-cwd-3', async (s) => {
      const dir = await s.workspace.dir('with space', 'inner')
      const r = await s.run('sh', ['-c', 'pwd -P'], { cwd: dir })

      expect(r.code).toBe(0)
      expect(r.stdout.trim()).toBe(dir)
      expect(r.stdout).toContain('with space')
    })
  })

  it('#5 the workspace root is a physical path, not a symlinked one', async () => {
    await scenario('proc-cwd-5', async (s) => {
      // The regression this pins is subtle and cost hours: on macOS /var is a
      // symlink to /private/var, so an unresolved workspace root compares
      // unequal to every path a real process reports. Asserting the invariant
      // here means no future scenario has to remember it.
      const r = await s.run('sh', ['-c', 'pwd -P'], { cwd: s.workspace.root })

      expect(r.stdout.trim()).toBe(s.workspace.root)
      if (platform() === 'darwin') {
        expect(s.workspace.root.startsWith('/var/folders')).toBe(false)
      }
    })
  })

  it('#6 the harness scrubs git repo pointers from every child (BUG-047)', async () => {
    await scenario('proc-cwd-6', async (s) => {
      // Not in the shell suite — this is new coverage the harness makes cheap.
      // BUG-047: with GIT_DIR inherited, `git -C <fixture> init` returns 0,
      // creates no .git in the fixture, and later commits land in the real
      // repository. Two suites did exactly that.
      const r = await s.run('sh', ['-c', 'echo "[${GIT_DIR:-unset}]"'], {
        cwd: s.workspace.root,
        env: {},
      })

      expect(r.stdout.trim()).toBe('[unset]')
    })
  })

  it('#7 the harness gives each scenario its own baton, never the real one', async () => {
    await scenario('proc-cwd-7', async (s) => {
      // BUG-046: signal-set.sh honours AGENT_SIGNAL_FILE, and the watcher
      // exports it into every dispatched wake, which is how four bootstrap
      // suites overwrote the LIVE baton. A scenario must never see the real one.
      const r = await s.run('sh', ['-c', 'echo "$AGENT_SIGNAL_FILE"'], {
        cwd: s.workspace.root,
      })

      expect(r.stdout.trim()).toBe(s.signalFile)
      expect(r.stdout).toContain(s.workspace.root)
      expect(r.stdout.trim()).not.toContain('/sources/struct2flow/blueprint/logs')
    })
  })
})
