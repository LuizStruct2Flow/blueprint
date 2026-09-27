/**
 * tests/helpers/tty.ts — BUG-054's fix, factored out of
 * tests/pull-behaviour/pull-behaviour.spec.ts so TASK-081's differential
 * harness (tests/blueprint-port/blueprint-port.release.spec.ts) can drive the
 * SAME interactive-prompt path on both the shell CLI and the ported one,
 * rather than reinventing it.
 */
import { expect } from 'vitest'
import type { Scenario } from '../harness/index.js'
import type { RunResult } from '../harness/process.js'

/**
 * Run a command WITH a controlling terminal and a NON-interactive stdin.
 *
 * util-linux takes `-qec CMD FILE`; BSD/macOS takes `-q FILE CMD ...`. Which
 * one is present is probed rather than assumed, and a host with neither FAILS
 * rather than skipping — R7, and a skip here is how a BUG-054 case reported
 * green for two fixes in a row.
 *
 * The inner `</dev/null` is the whole point: without it the child inherits the
 * pty as stdin, `[ -t 0 ]` is true, and this exercises the interactive path.
 *
 * `env`, additive on top of the scenario's own scrubbed base env — TASK-081's
 * differential harness needs `PWD` set explicitly for the PORTED CLI (its
 * `logicalPwd()` reads `process.env.PWD`, never `process.cwd()`; bash
 * recomputes `$PWD` from `getcwd()` at startup regardless, so this is a no-op
 * for the shell CLI — see blueprint-port.release.spec.ts's `runOld`/`runNew`).
 */
export async function withCttyNoStdin(
  s: Scenario,
  cwd: string,
  command: string,
  env?: Record<string, string>,
): Promise<RunResult> {
  const opts = env === undefined ? { cwd } : { cwd, env }
  const utilLinux = await s.run('script', ['-qec', 'true', '/dev/null'], opts)
  const args = utilLinux.code === 0 ? ['-qec', command, '/dev/null'] : ['-q', '/dev/null', '/bin/sh', '-c', command]
  const r = await s.run('script', args, opts)
  expect(
    r.output,
    'neither `script` calling convention worked, so no case here supplied a ' +
      'controlling terminal — which is BUG-054 exactly, not a reason to skip',
  ).not.toMatch(/script: (invalid|unrecognized) option|usage: script/i)
  return r
}
