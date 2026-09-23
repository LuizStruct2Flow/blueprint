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
 * ROUND 3 (`findings.md` F-002 shape) — THE ROSTER IS NOT BESIDE THE BATON.
 * The previous version of this fixture wrote AGENT_ROSTER.md beside the
 * fixture's OWN baton file and asserted recovery against that copy. That
 * layout does not exist in production — the real roster lives at the repo
 * root, the real baton several directories under it
 * (`logs/state/AGENT_SIGNAL.md`) — so the suite proved the fixture's own
 * shape, not the mechanism, and went green over a poller that could not find
 * a roster anywhere near the real baton (observed live 2026-09-22).
 *
 * This suite runs the REAL scripts/signal-watch.sh directly against
 * REPO_ROOT (never copied into an isolated tree, same as before), which means
 * its roster resolution is NOT isolatable to a fixture directory: `BP_CODE_ROOT`
 * is the script's own physical location, so `bp_state_root` finds `.git` at
 * REPO_ROOT on its very first step regardless of `BP_STATE_ROOT_CEILING`, and
 * the roster it reads is genuinely REPO_ROOT's own AGENT_ROSTER.md (or the
 * shipped AGENT_ROSTER.example.md where a live one is absent — never both, per
 * BUG-075). So rather than fabricate a name the fix cannot actually resolve,
 * each case resolves the SAME expected name through the SAME mechanism
 * (`bp_roster_name_for_role`) up front, and asserts recovery lands on it —
 * proving the live path end to end instead of a stand-in for it.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import { startWatcher, until } from '../harness/watcher.js'

const WATCHER = join(REPO_ROOT, 'scripts', 'signal-watch.sh')
const ROSTER_LIB = join(REPO_ROOT, 'scripts', 'lib', 'roster.sh')

// The exact name recoverStrandedMic must resolve, from the exact mechanism it
// uses (bp_roster_name_for_role against REPO_ROOT) — not a fixture stand-in.
// Resolved once: it is a read of a file this suite does not touch.
let ORCHESTRATOR = ''

beforeAll(() => {
  ORCHESTRATOR = execFileSync(
    'bash',
    ['-c', `. "$1"; bp_roster_name_for_role "$2" Orchestrator`, 'bash', ROSTER_LIB, REPO_ROOT],
    { encoding: 'utf8' },
  ).trim()
  if (!ORCHESTRATOR) {
    throw new Error(
      `could not resolve an Orchestrator from ${REPO_ROOT} via ${ROSTER_LIB} — ` +
        'neither AGENT_ROSTER.md nor AGENT_ROSTER.example.md names one',
    )
  }
})

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
        return holder === ORCHESTRATOR && state === 'OVER_TO_CLAUDE'
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

  it('BUG-144: a stub wake command that claims ACTIVE and then dies is recovered: the mic returns to the Orchestrator', async () => {
    await scenario('mic-recovery-3', async (s) => {
      await s.fs.mkdirp('mic-recovery-3/state')
      const signalRel = 'mic-recovery-3/state/AGENT_SIGNAL.md'
      const signalPath = s.workspace.path(signalRel)

      await s.fs.write(
        signalRel,
        '# Agent Signal\n\n| Field | Value |\n|---|---|\n' +
          '| Holder | Kimi |\n| State | OVER_TO_KIMI |\n| Task | do the thing |\n',
      )

      // The common failure path (observed live 2026-09-22): the dispatched
      // agent claims the mic first (Holder stays the same, State flips to
      // ACTIVE — every well-behaved agent does this), then its CLI dies
      // before it ever hands the mic back. The wake command exits having
      // left the baton at Holder=Kimi State=ACTIVE, not at the dispatched
      // OVER_TO_KIMI pair.
      const stub = await s.fs.write(
        'mic-recovery-3/stub-wake',
        '#!/bin/sh\n' +
          `printf '# Agent Signal\\n\\n| Field | Value |\\n|---|---|\\n| Holder | Kimi |\\n| State | ACTIVE |\\n| Task | do the thing |\\n' > "${signalPath}"\n` +
          'exit 1\n',
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

      await until('the mic is handed back to the Orchestrator', async () => {
        w.assertStillRunning('the watcher must keep polling after recovering the mic')
        const holder = await readField(s, signalRel, 'Holder')
        const state = await readField(s, signalRel, 'State')
        return holder === ORCHESTRATOR && state === 'OVER_TO_CLAUDE'
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

  it('BUG-144 control: a dispatch that claims ACTIVE then hands off to someone else is left alone', async () => {
    await scenario('mic-recovery-4', async (s) => {
      await s.fs.mkdirp('mic-recovery-4/state')
      const signalRel = 'mic-recovery-4/state/AGENT_SIGNAL.md'
      const signalPath = s.workspace.path(signalRel)

      await s.fs.write(
        signalRel,
        '# Agent Signal\n\n| Field | Value |\n|---|---|\n' +
          '| Holder | Kimi |\n| State | OVER_TO_KIMI |\n| Task | do the thing |\n',
      )

      // Claims ACTIVE (same as the stranded case) but, unlike it, goes on to
      // hand the mic to someone else before the wake command returns — the
      // baton no longer names Kimi/ACTIVE once the poller checks, so this
      // must NOT be recovered.
      const stub = await s.fs.write(
        'mic-recovery-4/stub-wake',
        '#!/bin/sh\n' +
          `printf '# Agent Signal\\n\\n| Field | Value |\\n|---|---|\\n| Holder | Kimi |\\n| State | ACTIVE |\\n| Task | working |\\n' > "${signalPath}"\n` +
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

  it('BUG-144 F1 (Thomas/Kimi review): the wake command runs under bash, so a roster MISS inside it does not abort', async () => {
    // All three launchers (start-codex/kimi/gemini-signal-watch.sh) build
    // their own AGENT_WAKE_COMMAND string and source scripts/lib/roster.sh
    // INSIDE it to resolve the hand-back Orchestrator name — this is a
    // SEPARATE roster lookup from recoverStrandedMic's own (which already
    // runs under bash from round 3). roster.sh's lookup-MISS path uses
    // `${want// /_}`, a bash-only expansion; the happy path (a role that
    // resolves) never reaches it, which is why this stayed hidden. Reproduces
    // the launchers' own pattern verbatim — source, `command -v` guard,
    // resolve in a `$(...)` subshell — against a role that is guaranteed
    // absent from ANY roster, and proves the miss degrades cleanly (empty
    // result, roster.sh's own warning) rather than aborting the subshell with
    // "Bad substitution" (dash's behaviour, reproduced by hand against this
    // exact library before this fix: see the BUG-144 F1 commit body).
    await scenario('mic-recovery-6', async (s) => {
      await s.fs.mkdirp('mic-recovery-6/state')
      const signalRel = 'mic-recovery-6/state/AGENT_SIGNAL.md'
      const signalPath = s.workspace.path(signalRel)

      await s.fs.write(
        signalRel,
        '# Agent Signal\n\n| Field | Value |\n|---|---|\n' +
          '| Holder | Someone |\n| State | OVER_TO_SOMEONE |\n| Task | f1-probe |\n',
      )

      const resolvedPath = s.workspace.path('mic-recovery-6', 'resolved')
      const stderrPath = s.workspace.path('mic-recovery-6', 'roster-stderr')
      const donePath = s.workspace.path('mic-recovery-6', 'done')

      // Verbatim shape of start-codex-signal-watch.sh:159-166 (and its Kimi
      // and Gemini mirrors): source the lib, guard with `command -v`, resolve
      // in a command substitution. The only difference is the role
      // ("BUG144-F1-Missing-Role" instead of "Orchestrator") and that stderr
      // is captured to a file this test can read, instead of the launchers'
      // own `2>/dev/null` — which is exactly what let this hide: dash's
      // abort message never had anywhere to be seen.
      const wakeCommand =
        'set -u\n' +
        `. "${ROSTER_LIB}"\n` +
        'ORCHESTRATOR_NAME=""\n' +
        'if command -v bp_roster_name_for_role >/dev/null 2>&1; then\n' +
        `  ORCHESTRATOR_NAME="$(bp_roster_name_for_role "${REPO_ROOT}" "BUG144-F1-Missing-Role" 2>"${stderrPath}")"\n` +
        'fi\n' +
        `printf '%s' "$ORCHESTRATOR_NAME" > "${resolvedPath}"\n` +
        `: > "${donePath}"\n`

      const w = startWatcher(
        s,
        'bash',
        [WATCHER, '--file', signalPath, '--state', 'OVER_TO_SOMEONE', '--poll', '0.2'],
        {
          cwd: s.workspace.root,
          env: { AGENT_SIGNAL_SETTLE: '0', AGENT_WAKE_COMMAND: wakeCommand },
        },
      )

      try {
        await until('the wake command has run to completion', () => s.fs.exists('mic-recovery-6/done'))

        const stderr = await s.fs.read('mic-recovery-6/roster-stderr')
        expect(stderr, 'dash aborted the subshell on the miss instead of returning cleanly').not.toContain(
          'Bad substitution',
        )
        expect(stderr, "roster.sh's own miss warning should still fire").toContain('identity unresolved')

        const resolved = await s.fs.read('mic-recovery-6/resolved')
        expect(resolved, 'a genuine miss should resolve to nothing, not a stray partial value').toBe('')
      } finally {
        await w.stop()
      }
    })
  })
})
