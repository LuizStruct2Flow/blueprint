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

/**
 * Is ANY process in group `pgid` still signalable by us?
 *
 * THE CONDITION, AND WHY IT IS THE RIGHT ONE. What teardown must establish is
 * that nothing from this scenario can still run and write into the fixture — or
 * into the operator's real feed. `kill(-pgid, 0)` answering ESRCH is exactly
 * that fact: the kernel holds no member of the group, so there is nothing left
 * to schedule.
 *
 * It is deliberately NOT the claim "the group was reaped". Those differ, and the
 * difference cuts the way that matters: a zombie is signalable (so this reports
 * alive) yet cannot execute, which errs toward failing the test rather than
 * passing it; and a GRANDCHILD is never our child, so its reaping is not an
 * event this process can ever observe — reparented to init, the group is the
 * only handle on it we have. Asserting reaping would therefore mean asserting
 * something unobservable, and the harness would end up checking a proxy for it.
 * That is the trap docs/config/findings.md F-002 has seven instances of; this is
 * not the eighth, because the fact asserted here is the same fact `disposeAll`
 * uses to DECIDE a survivor, so oracle and assertion cannot drift apart.
 *
 * EPERM is the one answer that means "a member exists which we may not signal".
 * Impossible for our own descendants, and reading it as "gone" would be the
 * unsafe direction, so it is reported as alive rather than swallowed with ESRCH.
 */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Wait until group `pgid` is gone, or until the budget runs out. `false` means
 * the budget expired with the group still there.
 *
 * BOUNDED ON PURPOSE. An unbounded poll turns a leaked process into a hung
 * teardown, and `scripts/log-activity.sh` already argues that trade at length
 * for its roster lookup: a hook that hangs is worse than one that dies, because
 * a death is a report and a hang is silence. The bound is a ceiling, never the
 * pacing — a group that exits in 4 ms is waited on for 4 ms.
 */
async function waitGroupGone(pgid: number, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs
  while (groupAlive(pgid)) {
    if (Date.now() >= deadline) return false
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return true
}

/** How often the group is re-asked. Matches the harness's sanctioned `vi.waitFor` interval. */
const POLL_INTERVAL_MS = 10

/**
 * How long SIGTERM is given before SIGKILL.
 *
 * This bound is a ceiling on POLITENESS, not on correctness: it is only reached
 * by a group that ignored SIGTERM, and the next thing that happens is SIGKILL.
 * Nothing about the verdict depends on its value.
 */
const TERM_GRACE_MS = 2_000

/**
 * How long SIGKILL is given. 5 s is the bound `watcher.ts` already measured as
 * sufficient for the `wait-mic.sh` + `sleep` grandchild shape, which is the
 * slowest group any scenario here starts.
 */
const KILL_GRACE_MS = 5_000

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
  private readonly groups = new Set<number>()

  /**
   * `escapeToken` is the scenario's own token. The registry does not use it
   * itself — it hands it to fixtureEnv, which is where "an override of
   * AGENT_FEED_TAG must still carry the token" is enforced (BUG-062). It is
   * threaded rather than looked up because there is exactly one token per
   * scenario and the environment builder cannot invent it.
   *
   * `options.cwd` is handed over for the same reason: with AGENT_FEED_LOG unset
   * the feed a child writes to is derived from where it RUNS, so whether the
   * token may be dropped is a question only the spawn site can answer.
   */
  constructor(
    private readonly workspaceRoot: string,
    private readonly escapeToken?: string,
  ) {}

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
      env: fixtureEnv(options.env, this.workspaceRoot, this.escapeToken, options.cwd),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.live.add(child)
    if (child.pid !== undefined) this.groups.add(child.pid)

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
      env: fixtureEnv(options.env, this.workspaceRoot, this.escapeToken, options.cwd),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.live.add(child)
    if (child.pid !== undefined) this.groups.add(child.pid)
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

    for (const pgid of this.groups) {
      if (!groupAlive(pgid)) continue
      survivors.push(pgid)
      try {
        process.kill(-pgid, 'SIGTERM')
      } catch {
        // It exited between the check and the signal. Still a survivor: it was
        // alive when teardown started, which is the defect being reported.
      }
    }

    // SIGTERM, then insist — waiting on THE GROUP BEING GONE rather than on a
    // plausible interval. The 300 ms sleep this replaces was a fixed wait
    // standing in for exactly this condition (R4), and it was wrong in both
    // directions: it paused every clean teardown, and a group slower than the
    // guess was SIGKILLed while already dying.
    for (const pgid of survivors) {
      if (await waitGroupGone(pgid, TERM_GRACE_MS)) continue
      try {
        process.kill(-pgid, 'SIGKILL')
      } catch {
        continue
      }
      // A group that outlives SIGKILL is unkillable (uninterruptible sleep), and
      // the bound expiring is where we stop rather than hang. The test fails
      // either way: it is already in `survivors`.
      await waitGroupGone(pgid, KILL_GRACE_MS)
    }

    this.live.clear()
    this.groups.clear()
    return survivors
  }
}
