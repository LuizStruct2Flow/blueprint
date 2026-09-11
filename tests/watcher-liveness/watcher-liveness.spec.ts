/**
 * tests/watcher-liveness/watcher-liveness.spec.ts — BUG-022.
 *
 * A dispatch to a dead watcher fails SILENTLY. The baton reads OVER_TO_CODEX, the
 * feed is quiet exactly as it looks when an agent is thinking, and the run log —
 * the only honest surface — is the one nobody reads. On 2026-08-05 a BA dispatch
 * sat unheard until the founder asked; a peer project's identical incident cost
 * ~40 minutes.
 *
 * The mic state and the dispatcher's liveness are two facts that are unremarkable
 * alone and conclusive together. Nothing compared them.
 *
 * WHY flock AND NEVER pgrep. Every process-table check written during that
 * incident matched the checking shell's OWN command line — a `pgrep -f` for a
 * pattern present in its own arguments — and was wrong three different ways. A
 * lock is repo-scoped, cannot self-match, and is released by the KERNEL on death
 * including SIGKILL, so "can I take it?" answers "is a holder alive?" with no
 * stale-pid ambiguity.
 *
 * EQUIVALENCE RECORD (R6, and this migration's own evidence).
 *
 * Nineteen trees — one per check carrying exactly the defect it exists to catch,
 * plus the healthy control and two negative controls — were built once and BOTH
 * implementations run over each: the retiring `tests/watcher-liveness/test.sh`,
 * copied into the tree, and this spec with `BP_SPEC_ROOT` pointed at it. The
 * per-id verdict sets were compared mechanically. Divergences are recorded in the
 * report for TASK-018 rather than smoothed over; the two that matter are:
 *
 *   - `#2`'s lock-path assertion ("the lock is not beside the baton dir it was
 *     given") had NO pass branch in the shell version — it could only ever print
 *     a failure, so on a healthy tree it was invisible and its absence from the
 *     output was indistinguishable from it not existing. Here it is a named case.
 *     That is a tightening, and it is the reason to look: an assertion with no
 *     positive outcome cannot be told from an assertion that was deleted.
 *   - the shell `#3` greps the lib with comments stripped and `#4`/`#5` grep the
 *     watcher and the feed RAW. So documenting `pgrep` in either of those two
 *     files is safe and documenting `dead_last` is not, for no reason anyone
 *     chose. Every source check here strips comments.
 *
 * TIMING (R4). No case waits a duration. The two that need a lock HELD by a live
 * process use a pid-file handshake: the holder writes its pid and `exec`s a long
 * sleep, so the test waits for the FILE to exist and then kills the exact process
 * whose fd holds the lock. The two that drive a real feed wait for a line to
 * appear, and prove that further ticks elapsed by round-tripping a sentinel
 * through the pumped run log — not by sleeping and hoping.
 */

import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import { feedFixture } from '../helpers/feed-fixture.js'

/**
 * The tree under test. `BP_SPEC_ROOT` repoints it at a perturbed copy, which is
 * how the equivalence driver runs this spec and the retiring shell suite over the
 * same bytes. It selects the SUBJECT, never the sandbox.
 */
const SUBJECT = process.env.BP_SPEC_ROOT ?? REPO_ROOT

const LIB = join(SUBJECT, 'scripts', 'lib', 'watcher-lock.sh')
const WATCH = join(SUBJECT, 'scripts', 'codex-signal-watch.sh')
const FEED = join(SUBJECT, 'scripts', 'agent-activity.sh')

/**
 * A script's source with comments stripped.
 *
 * The lib NAMES `pgrep` in the comment explaining why it must never be used, and
 * a check that cannot tell an explanation from a call would force that
 * explanation to be deleted to stay green — removing the one place a future
 * reader learns why.
 */
async function code(path: string): Promise<string> {
  const raw = await readFile(path, 'utf8').catch(() => '')
  return raw.replace(/^[ \t]*#.*$/gm, '')
}

/** Call a lock-lib function in the tree under test. */
async function lib(s: Scenario, snippet: string): Promise<string> {
  const r = await s.run('sh', ['-c', `. "${LIB}"; ${snippet}`], { cwd: s.workspace.root })
  return r.stdout.trim()
}

/**
 * A baton dir with a baton in it — the first argument every lock function takes.
 *
 * The default state is ACTIVE, which is the one the #7 cases need: the watcher
 * takes the lock for the state it is WAITING FOR, not the state the baton
 * currently reads, so a fixture baton that already said OVER_TO_CODEX would
 * dispatch instead of waiting and the case would be measuring something else.
 */
async function batonDir(s: Scenario, rel = 'proj/logs/state', state = 'ACTIVE'): Promise<string> {
  const dir = await s.fs.mkdirp(rel)
  await s.fs.write(
    `${rel}/signal.md`,
    `| Field | Value |\n|---|---|\n| Holder | X |\n| State | ${state} |\n| Task | t |\n`,
  )
  return dir
}

/**
 * Hold a lock with a real process, and return a release function.
 *
 * `flock file cmd` FORKS rather than execs, so the command inherits the open fd
 * and keeps the lock held after its parent dies. That is not a quirk to route
 * around — it is exactly how a real watcher's children behave, and a test that
 * killed only the parent would assert something production never does. So the
 * inner shell `exec`s the sleep: the pid file then names the process whose fd
 * actually holds the lock, and killing it is what releases it.
 */
async function holdLock(
  s: Scenario,
  lockPath: string,
  pidFile: string,
): Promise<{ release: (signal: string) => Promise<void>; settled: Promise<unknown> }> {
  const settled = s
    .run(
      'flock',
      [lockPath, 'sh', '-c', `echo $$ > "${pidFile}"; exec sleep 300`],
      { cwd: s.workspace.root, timeoutMs: 120_000 },
    )
    .catch(() => undefined)

  // Condition, not a duration: the lock is held once the holder has published
  // the pid it holds it with.
  await vi.waitFor(async () => expect(await s.fs.exists(pidFile)).toBe(true), {
    timeout: 20_000,
    interval: 50,
  })

  return {
    settled,
    release: async (signal) => {
      const pid = (await s.fs.read(pidFile)).trim()
      await s.run('kill', [signal, pid], { cwd: s.workspace.root })
      // The kernel releases on process death, so the condition to wait for is
      // that the lock has become takeable — never a sleep after the kill.
      await vi.waitFor(
        async () => {
          const r = await s.run('flock', ['-n', lockPath, 'true'], { cwd: s.workspace.root })
          expect(r.code).toBe(0)
        },
        { timeout: 20_000, interval: 50 },
      )
    },
  }
}

describe('BUG-022 — a dispatch into silence is visible', () => {
  it('#1 scripts/lib/watcher-lock.sh exists', async () => {
    // Without it the watcher and the feed each invent one, and two
    // implementations of "is a watcher alive" disagree exactly when it matters
    // while each keeps passing its own tests.
    expect(await code(LIB)).not.toBe('')
  })

  it('#1 bp_watch_lock_path is exposed', async () => {
    await scenario('wl-1a', async (s) => {
      const r = await s.run(
        'sh',
        ['-c', `. "${LIB}"; command -v bp_watch_lock_path >/dev/null 2>&1`],
        { cwd: s.workspace.root },
      )
      expect(r.code).toBe(0)
    })
  })

  it('#1 bp_watch_liveness is exposed', async () => {
    await scenario('wl-1b', async (s) => {
      const r = await s.run(
        'sh',
        ['-c', `. "${LIB}"; command -v bp_watch_liveness >/dev/null 2>&1`],
        { cwd: s.workspace.root },
      )
      expect(r.code).toBe(0)
    })
  })

  it("#2 no lock file → 'none' (a project without watchers is never warned)", async () => {
    await scenario('wl-2-none', async (s) => {
      const dir = await batonDir(s)
      // THIS is what makes the check safe to run unconditionally on every poll.
      // A project that has never run a watcher must never be warned about one it
      // never had, or the warning becomes noise and noise gets muted.
      expect(await lib(s, `bp_watch_liveness "${dir}" OVER_TO_CODEX`)).toBe('none')
    })
  })

  it('#2 the lock is derived from the baton dir it was given, not from a repo root', async () => {
    await scenario('wl-2-path', async (s) => {
      const dir = await batonDir(s)
      const lock = await lib(s, `bp_watch_lock_path "${dir}" OVER_TO_CODEX`)

      // THE SHELL VERSION OF THIS ASSERTION HAD NO PASS BRANCH — it could only
      // print a failure — so on a healthy tree it was invisible. Deriving the
      // lock from a ROOT is what let a test's watcher take the LIVE repo's lock
      // (see #7), so it is worth a case that can be seen succeeding.
      expect(lock.startsWith(dir + '/')).toBe(true)
      expect(lock).toBe(join(dir, '.watch-over_to_codex.lock'))
    })
  })

  it("#2 an unheld lock file → 'dead' (a watcher was expected and is gone)", async () => {
    await scenario('wl-2-dead', async (s) => {
      const dir = await batonDir(s)
      await s.fs.write('proj/logs/state/.watch-over_to_codex.lock', '')

      // THIS IS THE INCIDENT: a watcher claimed this mic at some point, and is
      // gone.
      expect(await lib(s, `bp_watch_liveness "${dir}" OVER_TO_CODEX`)).toBe('dead')
    })
  })

  it("#2 a held lock → 'alive'", async () => {
    await scenario('wl-2-alive', async (s) => {
      const dir = await batonDir(s)
      const lock = join(dir, '.watch-over_to_codex.lock')
      await s.fs.write('proj/logs/state/.watch-over_to_codex.lock', '')
      const holder = await holdLock(s, lock, join(s.workspace.root, 'holder.pid'))

      expect(await lib(s, `bp_watch_liveness "${dir}" OVER_TO_CODEX`)).toBe('alive')

      await holder.release('-TERM')
      await holder.settled
    })
  })

  it("#2 after SIGKILL → 'dead' (the kernel released it; no stale-pid ambiguity)", async () => {
    await scenario('wl-2-sigkill', async (s) => {
      const dir = await batonDir(s)
      const lock = join(dir, '.watch-over_to_codex.lock')
      await s.fs.write('proj/logs/state/.watch-over_to_codex.lock', '')
      const holder = await holdLock(s, lock, join(s.workspace.root, 'holder.pid'))
      expect(await lib(s, `bp_watch_liveness "${dir}" OVER_TO_CODEX`)).toBe('alive')

      // SIGKILL leaves no chance to clean up. The kernel releases the lock
      // anyway, which is the entire reason this is a lock and not a pid file.
      await holder.release('-KILL')
      await holder.settled

      expect(await lib(s, `bp_watch_liveness "${dir}" OVER_TO_CODEX`)).toBe('dead')
    })
  })

  it('#3 the lib never greps the process table', async () => {
    const body = await code(LIB)
    // Guarded on the lib being NON-EMPTY, or this passes vacuously: a grep over a
    // missing file finds no pgrep and reports clean, which is a green earned by
    // the ABSENCE of the thing under test. That was in the shell version's first
    // draft, and it is the failure this suite exists to prevent one level up.
    expect(body, 'cannot check for process-table use — the lib does not exist').not.toBe('')
    expect(body, 'the lib consults the process table — it will match its own command line')
      .not.toMatch(/pgrep|pidof|ps -ef|ps -eo/)
  })

  it('#4 the watcher sources the shared lock lib', async () => {
    // Without this the feed's check is decorative: every state would read 'none'
    // forever and the warning could never fire.
    expect(await code(WATCH)).toMatch(/watcher-lock\.sh/)
  })

  it('#4 the watcher holds the lock for its lifetime', async () => {
    expect(await code(WATCH)).toMatch(/bp_watch_hold/)
  })

  it("#5 the feed compares the mic against the dispatcher's liveness", async () => {
    expect(await code(FEED)).toMatch(/bp_watch_liveness/)
  })

  it('#5 the warning is edge-triggered, not repeated every poll', async () => {
    // A line on every poll trains the operator to ignore the feed, which is the
    // failure this is meant to prevent rather than cause.
    expect(await code(FEED)).toMatch(/dead_last/)
  })

  it('#6 a running feed warns that the mic is held with nobody listening', async () => {
    await scenario('wl-6-dead', async (s) => {
      // #4 and #5 are source checks: they prove the code SAYS the right thing,
      // not that a running supervisor emits the warning. That distinction is the
      // entire subject of this bug — a check nothing invokes looks exactly like a
      // check that passed.
      const f = await feedFixture(s, 'dead', {
        source: SUBJECT,
        holder: 'Codexy',
        state: 'OVER_TO_CODEX',
      })
      // An unheld lock: a watcher claimed this state and is gone.
      await s.fs.write('dead/state/.watch-over_to_codex.lock', '')

      await f.withFeed(async () => {
        await f.expectLine('NO watcher is listening')
      })
    })
  })

  it('#6 it fires exactly once across many polls, not per tick', async () => {
    await scenario('wl-6-once', async (s) => {
      const f = await feedFixture(s, 'once', {
        source: SUBJECT,
        holder: 'Codexy',
        state: 'OVER_TO_CODEX',
      })
      await s.fs.write('once/state/.watch-over_to_codex.lock', '')
      // The pumped run log is how further ticks are PROVEN to have elapsed. The
      // shell version slept 3.5s and inferred it; a sentinel that comes back out
      // of the feed is evidence, and it does not get slower on a loaded box.
      await s.fs.write('once/state/gemini-runs.log', '')

      await f.withFeed(async () => {
        await f.expectLine('NO watcher is listening')
        await f.readerReady('once/state/gemini-runs.log')
        for (const tick of ['TICK-A', 'TICK-B', 'TICK-C']) {
          await s.fs.write('once/state/gemini-runs.log', `${tick}\n`, { append: true })
          await f.expectLine(tick)
        }

        expect(
          await f.count('NO watcher is listening'),
          'a per-poll warning trains the operator to ignore it',
        ).toBe(1)
      })
    })
  })

  it('#6 a live watcher produces no warning, and the feed WAS running', async () => {
    await scenario('wl-6-alive', async (s) => {
      // NON-VACUITY, AND IT IS LOAD-BEARING: an implementation that warned
      // unconditionally would satisfy both cases above. This one must also prove
      // the feed was AWAKE, or "no warning" cannot be told from "never ran".
      const f = await feedFixture(s, 'alive', {
        source: SUBJECT,
        holder: 'Codexy',
        state: 'OVER_TO_CODEX',
      })
      await s.fs.write('alive/state/.watch-over_to_codex.lock', '')
      await s.fs.write('alive/state/gemini-runs.log', '')
      const lock = join(f.stateDir, '.watch-over_to_codex.lock')
      const holder = await holdLock(s, lock, join(s.workspace.root, 'holder.pid'))

      await f.withFeed(async () => {
        // The awake-ness proof comes FIRST, so the absence assertion below is
        // known to be measuring a feed that had the chance to warn. It has to be
        // the BUG-038 handshake rather than one append: with no warning to wait
        // for, this case reaches its first write before the supervisor has seeded
        // the run log, and a single append is then lost permanently — which is
        // how this case failed on its first run, reading exactly like the feed
        // having gone silent.
        await f.readerReady('alive/state/gemini-runs.log')
        await s.fs.write('alive/state/gemini-runs.log', 'AWAKE\n', { append: true })
        await f.expectLine('AWAKE')

        expect(
          await f.count('NO watcher is listening'),
          'the feed warned while the lock was HELD — it warns unconditionally',
        ).toBe(0)
      })

      await holder.release('-TERM')
      await holder.settled
    })
  })

  it('#7 a watcher on a fixture baton leaves no lock in this repo', async () => {
    await scenario('wl-7', async (s) => {
      // THE ASSERTION THAT WAS MISSING. tests/signal-dispatch runs the REAL
      // watcher against a fixture baton, and while the lock was derived from the
      // repo ROOT the watcher happily took the LIVE repo's lock — leaving a record
      // that made a checkout which never ran a watcher report `dead` forever, and
      // refusing any genuine watcher started while the suite ran.
      //
      // Isolation is not a property a fixture can be careful enough to have. It
      // has to fall out of where the path comes from.
      const dir = await batonDir(s, 'fix/state')

      // The live lock lives under the STATE root, not the code root — after the
      // scaffolding/ split those differ, and naming the code root would watch a
      // path the watcher never touches, so the guard could not fire. NOT
      // `agent_state_dir`: this scenario points AGENT_STATE_HOME at a fixture, and
      // that override is the first thing `agent_state_dir` honours, so calling it
      // would accuse the watcher of polluting "the LIVE repo" while pointing at a
      // temp directory.
      const rootProbe = await s.run(
        'sh',
        ['-c', `BP_CODE_ROOT="${SUBJECT}" . "${join(SUBJECT, 'scripts/lib/state-dir.sh')}"; bp_state_root`],
        { cwd: SUBJECT, env: { AGENT_STATE_HOME: undefined } },
      )
      const stateRoot = rootProbe.stdout.trim()
      expect(stateRoot, 'could not resolve the live state root').not.toBe('')
      const liveLock = join(stateRoot, 'logs', 'state', '.watch-over_to_codex.lock')

      await s.run(
        'sh',
        [
          '-c',
          `AGENT_SIGNAL_SETTLE=0 timeout 3 bash "${WATCH}" --file "${join(dir, 'signal.md')}" ` +
            `--poll 1 --log "${join(dir, 'signal.log')}" -- true`,
        ],
        { cwd: s.workspace.root, env: { AGENT_SIGNAL_SETTLE: '0' }, timeoutMs: 30_000 },
      )

      // TASK-021 deleted the "only if there was no lock before" conjunct that used
      // to guard this. It made the assertion skip itself whenever a lock already
      // existed at the watched path — so a canary pointed at the WRONG root passed
      // on every run, which is the shape tests/live-state-canary now pins.
      const leaked = await readFile(liveLock).then(
        () => true,
        () => false,
      )
      expect(
        leaked,
        `the watcher created a lock in the LIVE repo (${liveLock}) while watching a fixture baton`,
      ).toBe(false)
    })
  })

  it('#7 it put the lock beside the baton it was actually watching', async () => {
    await scenario('wl-7b', async (s) => {
      // Without this #7 proves nothing: a watcher that took NO lock at all also
      // leaves none in the live repo.
      const dir = await batonDir(s, 'fix/state')
      await s.run(
        'sh',
        [
          '-c',
          `AGENT_SIGNAL_SETTLE=0 timeout 3 bash "${WATCH}" --file "${join(dir, 'signal.md')}" ` +
            `--poll 1 --log "${join(dir, 'signal.log')}" -- true`,
        ],
        { cwd: s.workspace.root, env: { AGENT_SIGNAL_SETTLE: '0' }, timeoutMs: 30_000 },
      )

      expect(
        await s.fs.exists('fix/state/.watch-over_to_codex.lock'),
        'no lock beside the fixture baton — the watcher took none, so #7 proves nothing',
      ).toBe(true)
    })
  })
})
