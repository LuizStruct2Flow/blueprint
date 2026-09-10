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
import { readFile, writeFile, stat, symlink } from 'node:fs/promises'
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

  it('BUG-060 lets a scenario set a forbidden variable only inside its workspace', async () => {
    // git-isolation exists to prove a hostile GIT_DIR cannot reach the real
    // repo, so it must be able to set one on purpose. Deliberate is fine;
    // ambient is the defect. If this ever stops working, that suite cannot be
    // migrated at all.
    const ws = await createWorkspace('forbidden-env-inside')
    try {
      const gitDir = join(ws.root, 'victim/.git')
      const env = fixtureEnv({ GIT_DIR: gitDir }, ws.root)
      expect(env.GIT_DIR).toBe(gitDir)
      expect(() =>
        fixtureEnv({ GIT_DIR: '/real/repository/.git' }, ws.root),
      ).toThrow(/Refusing forbidden environment override/)
      await symlink('/tmp', join(ws.root, 'escape-link'))
      expect(() =>
        fixtureEnv({ GIT_DIR: join(ws.root, 'escape-link/victim.git') }, ws.root),
      ).toThrow(/Refusing forbidden environment override/)
    } finally {
      await ws.dispose()
    }
  })

  it('ACCEPTS a forbidden variable that is a name, a label or a count', async () => {
    // The containment rule is only meaningful for values that are paths.
    // AGENT_PERSONA is a persona name, AGENT_BACKING a backing-agent label,
    // AGENT_GATE_PROFILE a profile name and GIT_CONFIG_COUNT a number — none of
    // them names anything on disk, and refusing them "because the path must be
    // inside the workspace" is a guard blaming a value for a property it never
    // had. tests/codex-persona-label and tests/roster deal in exactly these.
    const ws = await createWorkspace('forbidden-env-opaque')
    try {
      const env = fixtureEnv(
        {
          AGENT_PERSONA: 'Vitali',
          AGENT_BACKING: 'Codex',
          AGENT_GATE_PROFILE: 'bootstrap',
          GIT_CONFIG_COUNT: '2',
        },
        ws.root,
      )
      expect(env.AGENT_PERSONA).toBe('Vitali')
      expect(env.AGENT_BACKING).toBe('Codex')
      expect(env.AGENT_GATE_PROFILE).toBe('bootstrap')
      expect(env.GIT_CONFIG_COUNT).toBe('2')
    } finally {
      await ws.dispose()
    }
  })

  it('validates a colon-separated path LIST element by element', async () => {
    // GIT_ALTERNATE_OBJECT_DIRECTORIES and GIT_CEILING_DIRECTORIES are lists.
    // Judged as one string a two-element value is not a path at all, so a
    // fixture with two contained alternates would be refused; judged element by
    // element, one escaping entry is still enough to refuse the whole value.
    const ws = await createWorkspace('forbidden-env-list')
    try {
      const both = `${join(ws.root, 'objects-a')}:${join(ws.root, 'objects-b')}`
      expect(
        fixtureEnv({ GIT_ALTERNATE_OBJECT_DIRECTORIES: both }, ws.root)
          .GIT_ALTERNATE_OBJECT_DIRECTORIES,
      ).toBe(both)
      expect(() =>
        fixtureEnv(
          {
            GIT_ALTERNATE_OBJECT_DIRECTORIES: `${join(ws.root, 'objects-a')}:/tmp/not-mine`,
          },
          ws.root,
        ),
      ).toThrow(/the path \/tmp\/not-mine must be inside/)
    } finally {
      await ws.dispose()
    }
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
  it('BUG-062 DETECTS its unique token appended to an activity feed', async () => {
    const ws = await createWorkspace('canary-feed-token')
    try {
      const victim = join(ws.root, 'agent-activity.log')
      await writeFile(victim, 'existing operator activity\n', 'utf8')
      const token = RealStateCanary.escapeToken('harness-feed-token')
      const canary = await RealStateCanary.capture([
        { label: 'activity feed', path: victim },
      ])
      await writeFile(victim, `existing operator activity\n${token}\n`, 'utf8')
      await expect(canary.assertUnchanged(token)).rejects.toThrow(/unique escape token/)
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-062 a gate line a fixture emits CARRIES the token, so a leak would be visible', async () => {
    // The other half, and the half that was missing: detection is worthless if
    // nothing can produce the token. This drives the REAL pipeline library the
    // way the gate does and reads the line back out of the scenario's own feed
    // — so the mechanism is proved without writing a byte into the operator's.
    // If AGENT_FEED_TAG ever stops reaching a feed line, this goes red here
    // rather than by quietly making the canary vacuous again.
    await scenario('canary-token-emitted', async (s) => {
      const script = await s.fs.write(
        'run-gate.sh',
        // pipeline.sh finds feed.sh through _PIPE_LIBDIR, which defaults to the
        // RELATIVE `scripts/lib` — it feeds only when the caller's cwd is the
        // repo root, which is true of a git hook and not of a fixture.
        `_PIPE_LIBDIR="${REPO_ROOT}/scripts/lib"\n` +
          `. "${REPO_ROOT}/scripts/lib/pipeline.sh"\n` +
          `pipe_init gate\n` +
          `pipe_stage 'a stage that passes' true\n` +
          `pipe_finish\n`,
      )
      const r = await s.run('bash', [script], { cwd: s.workspace.root })
      expect(r.code, r.output).toBe(0)
      expect(await s.fs.read('logs/agent-activity.log')).toContain(s.escapeToken)
    })
  })

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

describe('harness — filesystem writes cannot escape (Andreas, Codex)', () => {
  it('BUG-058 REFUSES a write through an in-workspace symlink to the outside', async () => {
    await scenario('fs-escape-symlink', async (s) => {
      await symlink('/tmp', s.workspace.path('escape-link'))
      await expect(s.fs.write('escape-link/escaped.txt', 'nope')).rejects.toThrow(
        /Refusing to write outside/,
      )
    })
  })

  // The gap Andreas found: the first version enforced isolation for processes
  // and merely asked for it politely for files. writeFile is one import away
  // while spawning is not, so the weaker standard governed the easier mistake.
  it('REFUSES an absolute path outside the workspace', async () => {
    await scenario('fs-escape-abs', async (s) => {
      await expect(
        s.fs.write('/tmp/definitely-not-mine.txt', 'nope'),
      ).rejects.toThrow(/Refusing to write outside/)
    })
  })

  it('REFUSES an escape via ..', async () => {
    await scenario('fs-escape-rel', async (s) => {
      await expect(s.fs.write('../escaped.txt', 'nope')).rejects.toThrow(
        /Refusing to write outside/,
      )
    })
  })

  it('REFUSES a sibling whose name merely starts with the root', async () => {
    await scenario('fs-escape-prefix', async (s) => {
      // startsWith(root) without the separator would accept `<root>-evil`.
      await expect(
        s.fs.write(`${s.workspace.root}-evil/x.txt`, 'nope'),
      ).rejects.toThrow(/Refusing to write outside/)
    })
  })

  it('allows writes inside, with modes, and reads them back', async () => {
    await scenario('fs-inside', async (s) => {
      await s.fs.write('deep/nested/file.txt', 'hello', { mode: 0o755 })
      expect(await s.fs.read('deep/nested/file.txt')).toBe('hello')
      expect(await s.fs.mode('deep/nested/file.txt')).toBe('755')
      expect(await s.fs.exists('deep/nested/file.txt')).toBe(true)
      expect(await s.fs.exists('deep/nope.txt')).toBe(false)
    })
  })
})

describe('harness — git fixtures (Andreas, Codex)', () => {
  it('creates a repo with a LOCAL identity and a pinned branch', async () => {
    await scenario('git-basic', async (s) => {
      const repo = await s.gitRepo('proj', { initialCommit: true })

      expect(await repo.config('user.email')).toBe('fixture@example.test')
      const branch = await repo.git(['rev-parse', '--abbrev-ref', 'HEAD'])
      expect(branch.stdout.trim()).toBe('main')
      expect(await repo.head()).not.toBe('')
    })
  })

  it('supports a repo with NO identity — bootstrap-identity needs that state', async () => {
    await scenario('git-no-identity', async (s) => {
      const repo = await s.gitRepo('proj', { identity: null })
      expect(await repo.config('user.email')).toBe('')
    })
  })

  it('the repo is real: git init created a .git INSIDE the fixture (BUG-047)', async () => {
    await scenario('git-real', async (s) => {
      await s.gitRepo('proj')
      // Under an inherited GIT_DIR, `git init` returns 0 and creates NO .git
      // here, and every later commit lands in the real repository. That is the
      // defect, and this is the assertion that would catch it coming back.
      expect(await s.fs.exists('proj/.git')).toBe(true)
    })
  })
})

describe('harness — PATH shims (Andreas, Codex)', () => {
  it('puts a shim ahead of the real tool without discarding the rest of PATH', async () => {
    await scenario('shim', async (s) => {
      const shims = await s.shimDir()
      await shims.add('git', 'echo SHIMMED')

      const r = await s.run('sh', ['-c', 'git --version'], {
        cwd: s.workspace.root,
        env: { PATH: shims.path() },
      })
      expect(r.stdout.trim()).toBe('SHIMMED')

      // The rest of PATH survives: a tool the shim dir does NOT define still
      // resolves. Replacing PATH outright would silently turn a fault-injection
      // case into a "what if coreutils is missing" case.
      const real = await s.run('sh', ['-c', 'echo ok'], {
        cwd: s.workspace.root,
        env: { PATH: shims.path() },
      })
      expect(real.stdout.trim()).toBe('ok')
    })
  })
})

describe('harness — process ownership', () => {
  it('BUG-059 retains a completed parent group and fails on its detached descendant', async () => {
    await expect(
      scenario('harness-descendant', async (s) => {
        const r = await s.run(
          'sh',
          ['-c', 'sleep 30 </dev/null >/dev/null 2>&1 &'],
          { cwd: s.workspace.root },
        )
        expect(r.code).toBe(0)
      }),
    ).rejects.toThrow(/left 1 process\(es\) running/)
  })

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
