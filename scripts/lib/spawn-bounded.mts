// scripts/lib/spawn-bounded.mts — TASK-065 (Codex re-review, round 3).
//
// Extracted verbatim out of scripts/signal-watch.mts (behaviour-identical
// port — no logic change in this commit) so a unit test can drive it
// directly: it is otherwise a pure, self-contained function with no
// top-level await and no repo/env dependency, and its only previous host was
// a module whose import runs live shell-lib resolution at load time.
//
// spawn the child DETACHED (its own process group) and on timeout kill the
// WHOLE GROUP (`kill(-pid)`), because a grandchild started without its own
// `setpgid` stays in the parent's group and a plain child-only kill leaves it
// running (see signal-watch.mts's own header comment for the measurement).
import { spawn } from 'node:child_process'

export type StdioMode = 'ignore' | 'pipe' | 'inherit'

export interface BoundedSpawnResult {
  readonly status: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly error?: Error
}

export function spawnBounded(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; stdio: readonly [StdioMode, StdioMode, StdioMode] },
  timeoutMs: number,
  // Test-only seam: production callers never pass this, so `process.kill` is
  // exactly what always ran.
  killFn: (pid: number, signal: NodeJS.Signals) => void = process.kill,
): Promise<BoundedSpawnResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, {
        env: options.env,
        stdio: [...options.stdio],
        detached: true,
      })
    } catch (err) {
      resolve({ status: null, signal: null, stdout: '', stderr: '', error: err instanceof Error ? err : new Error(String(err)) })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })

    const timer = setTimeout(() => {
      if (settled) return
      timedOut = true
      // Negative pid = the whole process group (valid because `detached:
      // true` made this child its own group leader). SIGKILL, not SIGTERM: a
      // hung shell/child is exactly the case where a trap or a stuck syscall
      // could no-op a termination request, and nothing on this bounded path
      // needs a graceful shutdown.
      try {
        killFn(-(child.pid as number), 'SIGKILL')
      } catch {
        // The group is already gone (child exited between the timer firing
        // and this line) — nothing left to kill, not an error.
      }
    }, timeoutMs)

    const finish = (status: number | null, signal: NodeJS.Signals | null, error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // exactOptionalPropertyTypes: the `error` key is only ADDED when there
      // actually is one — never set to `undefined` on purpose, which is a
      // distinct (and disallowed) shape from leaving it out.
      const resolvedError = error ?? (timedOut ? new Error(`timed out after ${timeoutMs}ms`) : undefined)
      resolve(resolvedError === undefined
        ? { status, signal, stdout, stderr }
        : { status, signal, stdout, stderr, error: resolvedError })
    }

    child.once('error', (err) => finish(null, null, err))
    // 'close', not 'exit' — waits for the stdio streams to actually end, the
    // same guarantee spawnSync's captured stdout/stderr always had. Reachable
    // now because the group kill above closes every fd a grandchild held,
    // instead of leaving the read end waiting on a pipe nothing will ever
    // close.
    child.once('close', (code, signal) => finish(code, signal))
  })
}
