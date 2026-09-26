/**
 * tests/blueprint-port/blueprint-port.spec.ts — TASK-081 slice 1.
 *
 * Plain unit tests over scripts/blueprint.mts's skeleton primitives: the
 * errexit-context rule, command-not-found/permission-denied mapping, and the
 * signal machinery (deferral to a child's exit, shield, freeze, and
 * serialisation of repeated signals) — plan §2 rules 4 and 7, §3 P1/P2.
 *
 * WHY A PLAIN UNIT TEST, not the scenario()/harness fixture API this repo
 * otherwise requires: like tests/spawn-bounded, these are dependency-free
 * primitives over node:child_process/node:async_hooks with no repo, baton or
 * AGENT_* state that could leak into a fixture (TASK-018-CONVENTIONS.md's
 * guard is about exactly that leak, which nothing here can cause).
 *
 * The differential rows against the shell CLI (dispatch, `files`) live in
 * tests/blueprint-port/blueprint-port.release.spec.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HELP_TEXT,
  beginChild,
  capture,
  endChild,
  errexitEnabled,
  freeze,
  installSignals,
  maybeRunHandler,
  recordSignal,
  run,
  shield,
  unchecked,
  _resetSignalStateForTests,
} from '../../scripts/blueprint.mts'

const BLUEPRINT_MTS = fileURLToPath(new URL('../../scripts/blueprint.mts', import.meta.url))
const PLACEHOLDER_TOKEN = '{{' + 'PROJECT_NAME' + '}}'

beforeEach(() => {
  _resetSignalStateForTests()
})
afterEach(() => {
  _resetSignalStateForTests()
})

describe('plan §9 D — the placeholder hole, Option 1', () => {
  it('scripts/blueprint.mts never spells the project-name placeholder token', () => {
    const src = readFileSync(BLUEPRINT_MTS, 'utf8')
    expect(src).not.toContain(PLACEHOLDER_TOKEN)
  })

  it('HELP_TEXT (the ported header) never spells it either', () => {
    expect(HELP_TEXT).not.toContain(PLACEHOLDER_TOKEN)
  })
})

describe('errexit context (plan §2 rule 4)', () => {
  it('run() rejects a non-zero status by default (errexit on)', async () => {
    await expect(run('sh', ['-c', 'exit 3'], { stdout: 'ignore', stderr: 'ignore' })).rejects.toThrow()
  })

  it('unchecked(fn) continues past a non-zero status instead of rejecting', async () => {
    const result = await unchecked(() => run('sh', ['-c', 'exit 3'], { stdout: 'ignore', stderr: 'ignore' }))
    expect(result.status).toBe(3)
  })

  it('the same call bare, outside unchecked, still rejects — the context does not leak', async () => {
    await unchecked(() => run('sh', ['-c', 'exit 3'], { stdout: 'ignore', stderr: 'ignore' }))
    expect(errexitEnabled()).toBe(true)
    await expect(run('sh', ['-c', 'exit 3'], { stdout: 'ignore', stderr: 'ignore' })).rejects.toThrow()
  })

  it('capture(fn) runs with errexit off and strips trailing newlines like $( )', async () => {
    const out = await capture(async () => {
      const r = await run('sh', ['-c', 'printf "x\\n\\n"; exit 1'], { stdout: 'capture', stderr: 'ignore' })
      return r.stdout
    })
    expect(out).toBe('x')
  })
})

describe('command-not-found / permission-denied mapping (plan §2 rule 4)', () => {
  it('an absent command maps to status 127 with the bash-shaped message', async () => {
    const r = await unchecked(() =>
      run('definitely-not-a-real-command-xyz', [], { stdout: 'ignore', stderr: 'capture' }),
    )
    expect(r.status).toBe(127)
    expect(r.stderr).toContain(': definitely-not-a-real-command-xyz: command not found')
  })

  it('prints nothing under a stderr redirect, as 2>/dev/null would', async () => {
    const r = await unchecked(() =>
      run('definitely-not-a-real-command-xyz', [], { stdout: 'ignore', stderr: 'ignore' }),
    )
    expect(r.status).toBe(127)
    expect(r.stderr).toBe('')
  })

  it('a non-executable file maps to status 126', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bp-port-eacces-'))
    const file = join(dir, 'noexec')
    writeFileSync(file, '#!/bin/sh\necho hi\n')
    chmodSync(file, 0o644)
    try {
      const r = await unchecked(() => run(file, [], { stdout: 'ignore', stderr: 'capture' }))
      expect(r.status).toBe(126)
      expect(r.stderr).toContain('Permission denied')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function tick(n = 1): Promise<void> {
  return (async () => {
    for (let i = 0; i < n; i++) await new Promise<void>((r) => setImmediate(r))
  })()
}

function noopKill(): (pid: number, sig: NodeJS.Signals) => void {
  return () => {
    // The test observes state directly; nothing here needs to act.
  }
}

describe('signal machinery (plan §2 rule 7, §3 P1/P2)', () => {
  it('a signal recorded with no child in flight and no shield runs the handler at the next turn', async () => {
    let calls = 0
    installSignals(() => {
      calls++
    }, noopKill())
    recordSignal('SIGTERM')
    await tick(2)
    expect(calls).toBe(1)
  })

  it('deferral: a signal recorded while a child is "in flight" waits for it to end', async () => {
    let calls = 0
    installSignals(() => {
      calls++
    }, noopKill())
    beginChild()
    recordSignal('SIGINT')
    await tick(2)
    expect(calls).toBe(0)
    await endChild()
    expect(calls).toBe(1)
  })

  it('shield: a signal recorded while shielded waits until the shield closes', async () => {
    let calls = 0
    installSignals(() => {
      calls++
    }, noopKill())
    let release: () => void = () => {}
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate
    })
    const shielded = shield(async () => {
      await gate
    })
    recordSignal('SIGTERM')
    await tick(2)
    expect(calls).toBe(0)
    release()
    await shielded
    expect(calls).toBe(1)
  })

  it('freeze: the main flow stays pending once a signal is recorded before the awaited value settles', async () => {
    // installSignals first, as main() always does before anything can call
    // recordSignal in production — otherwise recordSignal's own scheduled
    // maybeRunHandler() would run with the module's DEFAULT (real) kill
    // function and actually terminate this test process.
    installSignals(() => {}, noopKill())
    let resolveChild: (v: string) => void = () => {}
    const childExit = new Promise<string>((resolveExit) => {
      resolveChild = resolveExit
    })
    const frozen = freeze(childExit)
    let settled = false
    void frozen.then(() => {
      settled = true
    })
    recordSignal('SIGTERM')
    resolveChild('done')
    await tick(3)
    expect(settled).toBe(false)
  })

  it('freeze: resolves normally when no signal was ever recorded', async () => {
    installSignals(() => {}, noopKill())
    const value = await freeze(Promise.resolve('ok'))
    expect(value).toBe('ok')
  })

  it('serialisation: the FIRST recorded signal decides, and the handler runs exactly once', async () => {
    let calls = 0
    let killedWith: NodeJS.Signals | undefined
    installSignals(
      () => {
        calls++
      },
      (_pid, sig) => {
        killedWith = sig
      },
    )
    recordSignal('SIGINT')
    recordSignal('SIGTERM')
    await maybeRunHandler()
    await maybeRunHandler()
    await tick(2)
    expect(calls).toBe(1)
    expect(killedWith).toBe('SIGINT')
  })
})
