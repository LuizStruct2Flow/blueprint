/**
 * tests/harness/process.ts — every child process a scenario spawns is owned,
 * tracked, and reaped.
 *
 * WHY OWNERSHIP AND NOT PATTERN MATCHING. The shell suites discover their own
 * processes with `ps -eo pid,args | grep '[a]gent-activity.sh --supervise'` and
 * then filter by cwd. That works only because each fixture has a unique cwd, it
 * costs an lsof per candidate process, and two of the assertions never filtered
 * at all — `agent-activity-bound:264,491,494` count `tail -n0 -F` across the
 * WHOLE MACHINE, so any unrelated process falsifies them.
 *
 * scripts/lib/watcher-lock.sh:17 already records why the process table is the
 * wrong oracle: a `pgrep -f` matches the checking shell's own command line. The
 * repo knew; the tests did it anyway.
 *
 * Here a process is a handle. You cannot obtain one without the registry
 * recording it, and afterEach fails if any survive — which is how "leaves no
 * stray processes" becomes checkable instead of promised. Orphaned supervisors
 * were observed for real on 2026-09-09: two, at ppid 1, causing a failure that
 * vanished when they were killed.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { fixtureEnv } from './env.js'

export interface SpawnOptions {
  cwd: string
  env?: Record<string, string | undefined>
  /** Milliseconds before the process is killed and the call rejects. */
  timeoutMs?: number
}

export interface RunResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  /** stdout and stderr interleaved is NOT reconstructable; this is stdout+stderr concatenated for convenience greps. */
  output: string
}

/**
 * Tracks every process a scenario starts. One per scenario, created by the
 * harness — specs never construct it.
 */
export class ProcessRegistry {
  private readonly live = new Set<ChildProcess>()

  /**
   * Spawn a process and wait for it to exit.
   *
   * Uses `detached: true` so the child gets its own process GROUP, which is
   * what makes reaping GRANDCHILDREN possible. Without it, killing the child
   * leaves its children orphaned at ppid 1 — exactly the shape observed on
   * 2026-09-09, and the gap Jesko flagged in the "assert no survivors" check.
   */
  async run(
    command: string,
    args: string[],
    options: SpawnOptions,
  ): Promise<RunResult> {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: fixtureEnv(options.env),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.live.add(child)

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })

    const timeoutMs = options.timeoutMs ?? 120_000
    let timer: NodeJS.Timeout | undefined
    let timedOut = false

    try {
      const code = await new Promise<{
        code: number | null
        signal: NodeJS.Signals | null
      }>((resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          this.killGroup(child)
        }, timeoutMs)

        child.on('error', reject)
        child.on('close', (code, signal) => resolve({ code, signal }))
      })

      if (timedOut) {
        throw new Error(
          `Timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}\n` +
            `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
        )
      }

      return {
        code: code.code,
        signal: code.signal,
        stdout,
        stderr,
        output: stdout + stderr,
      }
    } finally {
      if (timer) clearTimeout(timer)
      this.live.delete(child)
    }
  }

  /**
   * Start a long-lived process (a daemon, a watcher) without waiting for exit.
   * The caller gets the handle; the registry keeps it for teardown.
   */
  startBackground(
    command: string,
    args: string[],
    options: SpawnOptions,
  ): ChildProcess {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: fixtureEnv(options.env),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.live.add(child)
    return child
  }

  /** Kill a process and its whole group. Negative pid = the group. */
  private killGroup(child: ChildProcess, signal: NodeJS.Signals = 'SIGKILL'): void {
    if (child.pid === undefined) return
    try {
      process.kill(-child.pid, signal)
    } catch {
      // Group already gone, or never became a group leader. Fall back to the
      // single pid rather than assuming failure.
      try {
        child.kill(signal)
      } catch {
        // Already reaped.
      }
    }
  }

  /**
   * Reap everything. Returns the pids that had to be killed — a non-empty
   * result is a DEFECT in the scenario, not routine housekeeping, and the
   * harness fails the test on it.
   */
  async disposeAll(): Promise<number[]> {
    const survivors: number[] = []

    for (const child of this.live) {
      if (child.exitCode === null && child.signalCode === null) {
        if (child.pid !== undefined) survivors.push(child.pid)
        this.killGroup(child, 'SIGTERM')
      }
    }

    if (survivors.length > 0) {
      // Give SIGTERM a moment, then insist.
      await new Promise((r) => setTimeout(r, 300))
      for (const child of this.live) {
        if (child.exitCode === null && child.signalCode === null) {
          this.killGroup(child, 'SIGKILL')
        }
      }
    }

    this.live.clear()
    return survivors
  }
}
