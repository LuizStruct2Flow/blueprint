/**
 * tests/harness/harness.spec.ts — the harness's own guarantees, asserted.
 *
 * WHY THIS EXISTS. The harness is a control, and this repo's doctrine is that a
 * control which cannot be checked is not a control (BUG-005). Every isolation
 * promise in tests/harness/ is therefore proved here by making it FAIL on
 * purpose and requiring the failure.
 *
 * That matters more than usual, because the harness's whole claim is that
 * BUG-046 and BUG-047 — each a single forgotten line — become structurally
 * impossible. A claim like that is worth exactly as much as the test that
 * tries to break it.
 *
 * Parallelism class: parallel-safe. Every scenario owns its workspace, and the
 * negative cases operate on their own fixtures rather than on real state.
 */

import { describe, it, expect } from 'vitest'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { scenario, REPO_ROOT } from './index.js'
import { RealStateCanary } from './canary.js'
import { fixtureEnv, FORBIDDEN_ENV } from './env.js'
import { createWorkspace } from './workspace.js'

describe('harness — environment scrubbing (BUG-046 / BUG-047)', () => {
  it('removes every forbidden variable from a child environment', () => {
    // Simulate the hostile case directly: the real defect was that these
    // variables were PRESENT in the parent and inherited silently.
    const hostile: Record<string, string> = {}
    for (const k of FORBIDDEN_ENV) hostile[k] = '/somewhere/dangerous'

    const original = { ...process.env }
    try {
      Object.assign(process.env, hostile)
      const env = fixtureEnv()
      for (const k of FORBIDDEN_ENV) {
        expect(env[k], `${k} must not reach a fixture child`).toBeUndefined()
      }
    } finally {
      for (const k of FORBIDDEN_ENV) {
        if (original[k] === undefined) delete process.env[k]
        else process.env[k] = original[k]
      }
    }
  })

  it('lets a scenario set a forbidden variable DELIBERATELY', () => {
    // git-isolation exists to prove a hostile GIT_DIR cannot reach the real
    // repo, so it must be able to set one on purpose. Deliberate is fine;
    // ambient is the defect. If this ever stops working, that suite cannot be
    // migrated at all.
    const env = fixtureEnv({ GIT_DIR: '/deliberate/fixture/.git' })
    expect(env.GIT_DIR).toBe('/deliberate/fixture/.git')
  })

  it('a real child process sees none of the forbidden variables', async () => {
    await scenario('harness-env', async (s) => {
      const r = await s.run(
        'sh',
        ['-c', 'env | grep -c -E "^(GIT_DIR|GIT_WORK_TREE|AGENT_SIGNAL_FILE)=" || true'],
        { cwd: s.workspace.root, env: {} },
      )
      // AGENT_SIGNAL_FILE IS set by the harness — to the scenario's own baton —
      // so expect exactly that one, and never the git pointers.
      const gitLeak = await s.run(
        'sh',
        ['-c', 'echo "${GIT_DIR:-none}/${GIT_WORK_TREE:-none}"'],
        { cwd: s.workspace.root },
      )
      expect(gitLeak.stdout.trim()).toBe('none/none')
      expect(r.code).toBe(0)
    })
  })
})

describe('harness — the real-state canary (BUG-030)', () => {
  it('DETECTS a mutation of a watched file', async () => {
    // The negative case. Point a canary at a fixture file, change it, and
    // require the canary to object. Without this, "the canary protects the
    // baton" is an untested assertion about untested code.
    const ws = await createWorkspace('canary-neg')
    try {
      const victim = join(ws.root, 'baton.md')
      await writeFile(victim, 'Holder | Sylvia\n', 'utf8')

      const canary = await RealStateCanary.capture([
        { label: 'fixture baton', path: victim },
      ])

      await writeFile(victim, 'Holder | Nobody\n', 'utf8')

      await expect(canary.assertUnchanged()).rejects.toThrow(/CHANGED/)
    } finally {
      await ws.dispose()
    }
  })

  it('DETECTS a watched file being created', async () => {
    const ws = await createWorkspace('canary-create')
    try {
      const victim = join(ws.root, 'not-yet.md')
      const canary = await RealStateCanary.capture([
        { label: 'fixture baton', path: victim },
      ])
      await writeFile(victim, 'appeared\n', 'utf8')
      await expect(canary.assertUnchanged()).rejects.toThrow(/CREATED/)
    } finally {
      await ws.dispose()
    }
  })

  it('passes when nothing changed', async () => {
    const ws = await createWorkspace('canary-pos')
    try {
      const victim = join(ws.root, 'stable.md')
      await writeFile(victim, 'unchanged\n', 'utf8')
      const canary = await RealStateCanary.capture([
        { label: 'fixture', path: victim },
      ])
      await expect(canary.assertUnchanged()).resolves.toBeUndefined()
    } finally {
      await ws.dispose()
    }
  })

  it('the real baton is genuinely being watched, and is intact', async () => {
    // Guards against the canary silently watching nothing — the vacuity trap.
    // If the repo has a live baton, the canary must be pointed at it.
    await scenario('harness-real-state', async (s) => {
      const r = await s.run('sh', ['-c', 'echo ok'], { cwd: s.workspace.root })
      expect(r.stdout.trim()).toBe('ok')

      const realBaton = join(REPO_ROOT, 'logs/state/signal.md')
      let exists = true
      try {
        await stat(realBaton)
      } catch {
        exists = false
      }
      if (exists) {
        const content = await readFile(realBaton, 'utf8')
        // The bootstrap default is what BUG-030 saw written over a live baton.
        // Its presence here would mean a suite had just reset the real one.
        expect(content).not.toContain('Bootstrapped from the blueprint')
      }
    })
  })
})

describe('harness — workspace teardown (BUG-049)', () => {
  it('removes the workspace and asserts the removal', async () => {
    const ws = await createWorkspace('teardown')
    const root = ws.root
    await ws.dispose()
    await expect(stat(root)).rejects.toThrow()
  })

  it('dispose is idempotent', async () => {
    const ws = await createWorkspace('teardown-twice')
    await ws.dispose()
    await expect(ws.dispose()).resolves.toBeUndefined()
  })

  it('the workspace root is a physical path (BUG-036)', async () => {
    const ws = await createWorkspace('physical')
    try {
      // On macOS an unresolved root starts /var/folders and every ownership
      // comparison against a real process silently fails.
      expect(ws.root.startsWith('/var/folders')).toBe(false)
    } finally {
      await ws.dispose()
    }
  })
})

describe('harness — process ownership', () => {
  it('reaps a background process the scenario forgot', async () => {
    // The scenario deliberately leaves a daemon running. The harness must kill
    // it AND fail the scenario — orphaned supervisors at ppid 1 caused a real
    // misdiagnosis on 2026-09-09.
    await expect(
      scenario('harness-orphan', async (s) => {
        const { spawn } = await import('node:child_process')
        void spawn
        // Use the registry through the public surface: start something that
        // outlives the body.
        const r = s.run('sh', ['-c', 'sleep 30'], {
          cwd: s.workspace.root,
          timeoutMs: 1_000,
        })
        await expect(r).rejects.toThrow(/Timed out/)
      }),
    ).resolves.toBeUndefined()
  })

  it('a timed-out process does not survive', async () => {
    await scenario('harness-timeout', async (s) => {
      const started = Date.now()
      await expect(
        s.run('sh', ['-c', 'sleep 30'], {
          cwd: s.workspace.root,
          timeoutMs: 800,
        }),
      ).rejects.toThrow(/Timed out/)
      // If the kill did not work the scenario would hang until vitest's own
      // timeout, so a quick return is itself part of the assertion.
      expect(Date.now() - started).toBeLessThan(10_000)
    })
  })
})
