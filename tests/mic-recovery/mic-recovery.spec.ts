/**
 * tests/mic-recovery/mic-recovery.spec.ts — BUG-144: a failed dispatch must
 * not strand the mic.
 *
 * Observed live: a Kimi dispatch failed on a 403 (quota exhausted). Its wake
 * command exited without ever calling scripts/signal-set.sh, so the baton was
 * left reading exactly what it read before the dispatch — `Holder=Kimi
 * State=OVER_TO_KIMI` — and nothing told the Orchestrator. The mic was gone
 * until a human noticed.
 *
 * THE FIX (Orchestrator decision, in the brief for this item) lives in the
 * POLLER, once, for every provider — not in each of the three launchers. Each
 * launcher's own wake command already swallows its own exit status into a
 * printed finished/FAILED line (BUG-143) and the poller does not need to
 * parse that: it already knows which Holder/State it just dispatched. If the
 * live baton STILL reads exactly that pair once the dispatch call returns,
 * the poller hands the mic to the Orchestrator itself, through
 * scripts/signal-set.sh.
 *
 * This suite reproduces the failure with the simplest possible stand-in for
 * "a dispatch that ends without handing back the mic": a stub wake command
 * that exits 0 having done nothing. That is indistinguishable, from the
 * poller's side, from a crash or a quota refusal — which is exactly the
 * point: the fix does not depend on knowing WHY the dispatch failed to hand
 * back, only THAT it did.
 *
 * THE ROSTER IS RESOLVED BESIDE THE BATON, not beside the checkout the
 * watcher script happens to run from — same reasoning as
 * scripts/lib/watcher-lock.sh's lock path (its own docblock), and for the
 * same failure this fixture would otherwise reproduce: this suite runs the
 * REAL scripts/signal-watch.sh directly against REPO_ROOT (never copied into
 * an isolated tree), so resolving the roster from the script's own state
 * root would read THIS MACHINE's real, gitignored AGENT_ROSTER.md — a
 * fixture depending on whatever the operator's roster happens to contain,
 * and on some machines finding none at all. Placing AGENT_ROSTER.md beside
 * the fixture's own baton file, the same directory `--file` already isolates
 * the baton to, keeps the roster lookup exactly as isolated.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import { startWatcher, until } from '../harness/watcher.js'

const WATCHER = join(REPO_ROOT, 'scripts', 'signal-watch.sh')

const ROSTER = `# Agent Roster

| Role | Name | Backing agent | Model |
|---|---|---|---|
| Orchestrator | Orchy | Claude Code | session-based |
`

async function readField(s: Scenario, signalPath: string, field: string): Promise<string> {
  const content = await s.fs.read(signalPath)
  for (const line of content.split('\n')) {
    const parts = line.split('|')
    if (parts.length < 3) continue
    if ((parts[1] ?? '').trim() === field) return (parts[2] ?? '').trim()
  }
  return ''
}

describe('BUG-144 — a failed dispatch must not strand the mic', () => {
  it('a stub wake command that exits without flipping the baton is recovered: the mic returns to the Orchestrator', async () => {
    await scenario('mic-recovery-1', async (s) => {
      await s.fs.mkdirp('mic-recovery-1/state')
      const signalRel = 'mic-recovery-1/state/AGENT_SIGNAL.md'
      const signalPath = s.workspace.path(signalRel)

      await s.fs.write(
        signalRel,
        '# Agent Signal\n\n| Field | Value |\n|---|---|\n' +
          '| Holder | Kimi |\n| State | OVER_TO_KIMI |\n| Task | do the thing |\n',
      )
      await s.fs.write('mic-recovery-1/state/AGENT_ROSTER.md', ROSTER)

      // A dispatch that ends without ever touching the baton — the simplest
      // stand-in for "quota exhausted", "crashed" or "forgot to hand back":
      // the poller cannot tell these apart and must not need to.
      const stub = await s.fs.write('mic-recovery-1/stub-wake', '#!/bin/sh\nexit 0\n', {
        mode: 0o755,
      })

      const w = startWatcher(
        s,
        'bash',
        [
          WATCHER,
          '--file', signalPath,
          '--state', 'OVER_TO_KIMI',
          '--poll', '0.2',
          '--',
          stub,
        ],
        { cwd: s.workspace.root, env: { AGENT_SIGNAL_SETTLE: '0' } },
      )

      await until('the mic is handed back to the Orchestrator', async () => {
        w.assertStillRunning('the watcher must keep polling after recovering the mic')
        const holder = await readField(s, signalRel, 'Holder')
        const state = await readField(s, signalRel, 'State')
        return holder === 'Orchy' && state === 'OVER_TO_CLAUDE'
      })

      const task = await readField(s, signalRel, 'Task')
      expect(task, 'the handback Task should name who stranded the mic').toContain('Kimi')
      expect(
        task,
        'the handback Task should point at the provider run log',
      ).toContain('run log')

      await w.stop()
    })
  })

  it('a dispatch that DID hand back the mic is left alone — the poller does nothing', async () => {
    await scenario('mic-recovery-2', async (s) => {
      await s.fs.mkdirp('mic-recovery-2/state')
      const signalRel = 'mic-recovery-2/state/AGENT_SIGNAL.md'
      const signalPath = s.workspace.path(signalRel)

      await s.fs.write(
        signalRel,
        '# Agent Signal\n\n| Field | Value |\n|---|---|\n' +
          '| Holder | Kimi |\n| State | OVER_TO_KIMI |\n| Task | do the thing |\n',
      )
      await s.fs.write('mic-recovery-2/state/AGENT_ROSTER.md', ROSTER)

      // A dispatch that DOES hand back — writes a new baton before exiting,
      // the same shape a genuine agent's own signal-set.sh call produces.
      const stub = await s.fs.write(
        'mic-recovery-2/stub-wake',
        '#!/bin/sh\n' +
          `printf '# Agent Signal\\n\\n| Field | Value |\\n|---|---|\\n| Holder | Orchy |\\n| State | ACTIVE |\\n| Task | done |\\n' > "${signalPath}"\n`,
        { mode: 0o755 },
      )

      const w = startWatcher(
        s,
        'bash',
        [
          WATCHER,
          '--file', signalPath,
          '--state', 'OVER_TO_KIMI',
          '--poll', '0.2',
          '--',
          stub,
        ],
        { cwd: s.workspace.root, env: { AGENT_SIGNAL_SETTLE: '0' } },
      )

      await until('the dispatch has landed', async () => {
        const holder = await readField(s, signalRel, 'Holder')
        const state = await readField(s, signalRel, 'State')
        return holder === 'Orchy' && state === 'ACTIVE'
      })

      // Give the poller several more iterations to prove it does NOT also
      // fire a recovery on top of a baton that already moved.
      w.assertStillRunning('the watcher must still be polling')
      await until(
        'a few more polls pass with the baton unchanged',
        async () => {
          const holder = await readField(s, signalRel, 'Holder')
          const state = await readField(s, signalRel, 'State')
          const task = await readField(s, signalRel, 'Task')
          return holder === 'Orchy' && state === 'ACTIVE' && task === 'done'
        },
        2000,
      )

      await w.stop()
    })
  })
})
