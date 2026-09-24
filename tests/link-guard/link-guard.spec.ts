/**
 * tests/link-guard/link-guard.spec.ts — TASK-080.
 *
 * The subject is `scripts/link-guard.mts`, a Claude Code **Stop** hook. The
 * founder reads replies in the VS Code extension, where
 * `[TASK-077](docs/waiting-acceptance/BACKLOG.md)` is clickable and a bare
 * `TASK-077` is a manual lookup. He asked for links twice and prose failed
 * twice, because every other gate in this repo reads the REPOSITORY and this
 * rule governs the Orchestrator's reply TEXT. The only mechanism that sees a
 * finished assistant message is a Stop hook, which receives the transcript
 * path on stdin.
 *
 * The guard's contract, from the TASK-080 row (docs/doing/BACKLOG.md):
 *
 *   - for every TASK-/BUG-/FEATURE-/SPIKE-NNN id in the last assistant
 *     message, the FIRST mention must be a markdown link whose target is the
 *     lifecycle file that ACTUALLY holds that row today (backlog/, doing/,
 *     waiting-acceptance/ or done/). "Some link exists" is the findings.md
 *     F-002 proxy shape and is explicitly not the check.
 *   - fenced code blocks and inline code spans are quoted material, not
 *     prose, and demand nothing.
 *   - later mentions of an id already linked demand nothing.
 *   - an id with no row anywhere demands nothing — the guard reports what it
 *     found, never invents a target.
 *   - refusal is exit 2 naming each id AND the exact path it should have
 *     linked to, so the fix is mechanical.
 *   - `stop_hook_active` in the payload short-circuits (a guard that re-fires
 *     on its own stop loops the session), and any failure of the guard's own
 *     machinery exits 0 — a guard that blocks the session on its own bug is
 *     worse than the miss it was built for.
 *
 * Parallelism hazard: none. Every case writes into its own scenario workspace
 * and spawns a short-lived `node`; the lifecycle docs under docs/ are read
 * only.
 *
 * NON-VACUITY FLOOR. The guard prints a one-line summary on stderr when run
 * with `--verbose` (the settings.json wiring runs WITHOUT it, so a passing
 * reply stays silent for the founder). Every passing case below asserts on
 * that summary, so the guard cannot pass this suite by parsing nothing: a
 * guard that examined zero mentions would fail the floor in #5 and #6.
 *
 * REAL ROWS, verified against the tree on 2026-09-24 and deliberately chosen
 * from three different prefixes and two different files:
 *
 *   TASK-080     -> docs/doing/BACKLOG.md      (the row under test)
 *   FEATURE-007  -> docs/backlog/BACKLOG.md
 *   BUG-035      -> docs/backlog/BUGS.md
 *   TASK-999     -> no row anywhere
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const GUARD = join(REPO_ROOT, 'scripts/link-guard.mts')

/** Exit code the hook uses to refuse a stop. Its whole contract. */
const BLOCKED = 2

/** Build one JSONL transcript line. */
function line(obj: unknown): string {
  return JSON.stringify(obj)
}

/**
 * A transcript whose last text-bearing assistant message is `message`.
 * A user turn and a text-less assistant turn (tool call only) precede it, so
 * the guard must walk to the last message that actually carries prose rather
 * than trusting the final line.
 */
function transcript(message: string): string {
  return [
    line({
      type: 'user',
      message: { role: 'user', content: 'what landed today?' },
      uuid: 'u1',
    }),
    line({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }] },
      uuid: 'a1',
    }),
    line({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: message }] },
      uuid: 'a2',
    }),
  ].join('\n')
}

/**
 * Drive the real hook: write the transcript and the Stop payload into the
 * scenario workspace, then exec the guard with the payload on stdin. Same
 * driver pattern as tests/no-chain-guard — the harness spawns with stdin
 * closed, so the payload travels through a file the scenario owns.
 */
async function runHook(
  s: Scenario,
  message: string,
  options: { stopHookActive?: boolean; payload?: string } = {},
): Promise<{ code: number | null; stderr: string }> {
  const transcriptFile = await s.fs.write('transcript.jsonl', transcript(message))
  const payload =
    options.payload ??
    JSON.stringify({
      session_id: '11111111-2222-3333-4444-555555555555',
      transcript_path: transcriptFile,
      cwd: REPO_ROOT,
      permission_mode: 'default',
      hook_event_name: 'Stop',
      stop_hook_active: options.stopHookActive ?? false,
    })
  const payloadFile = await s.fs.write('payload.json', payload)
  const driver = await s.fs.write(
    'run-guard.sh',
    `exec node ${JSON.stringify(GUARD)} --hook --verbose < ${JSON.stringify(payloadFile)}\n`,
  )
  const r = await s.run('sh', [driver], { cwd: s.workspace.root, timeoutMs: 30_000 })
  return { code: r.code, stderr: r.stderr }
}

describe('TASK-080 — the link guard refuses unlinked item ids in the reply text', () => {
  it('#1 a bare id with a real row is refused, naming the exact path it should link', async () => {
    await scenario('linkguard-1', async (s) => {
      const r = await runHook(s, 'Landed today: TASK-080, the link guard.')
      expect(r.code, `a bare id with a real row was not refused\n${r.stderr}`).toBe(BLOCKED)
      // The message must name BOTH the id and the exact target — the fix is
      // meant to be mechanical, not a hunt.
      expect(r.stderr).toContain('TASK-080')
      expect(r.stderr).toContain('docs/doing/BACKLOG.md')
    })
  })

  it('#2 an id linked to the WRONG lifecycle folder is refused — a stale link is the case worth catching', async () => {
    await scenario('linkguard-2', async (s) => {
      // TASK-080's row lives in doing/ today. A link to backlog/ is "some link
      // exists", the F-002 proxy: satisfiable without the property. The guard
      // must resolve where the row ACTUALLY is and refuse the stale target.
      const r = await runHook(s, 'See [TASK-080](docs/backlog/BACKLOG.md) for the row.')
      expect(r.code, `a stale-folder link was not refused\n${r.stderr}`).toBe(BLOCKED)
      expect(r.stderr).toContain('TASK-080')
      expect(r.stderr).toContain('docs/doing/BACKLOG.md')
    })
  })

  it('#3 an id inside a fenced code block is quoted material and passes', async () => {
    await scenario('linkguard-3', async (s) => {
      const r = await runHook(s, 'Commit subject:\n\n```\nTASK#80: land the link guard (TASK-080)\n```\n\nDone.')
      expect(r.code, r.stderr).toBe(0)
      // NON-VACUITY, in the stripping direction: the summary must show that
      // zero PROSE mentions were examined — the fence swallowed the id. A
      // guard that stripped everything would show the same, which is what #6
      // exists to catch.
      expect(r.stderr).toContain('examined 0')
    })
  })

  it('#4 an id inside an inline code span is quoted material and passes', async () => {
    await scenario('linkguard-4', async (s) => {
      const r = await runHook(s, 'The commit subject is `TASK#80` and mentions `TASK-080` verbatim.')
      expect(r.code, r.stderr).toBe(0)
      expect(r.stderr).toContain('examined 0')
    })
  })

  it('#5 a correctly linked message passes, and the summary proves the guard parsed it', async () => {
    await scenario('linkguard-5', async (s) => {
      const r = await runHook(
        s,
        'Two rows moved: [TASK-080](docs/doing/BACKLOG.md) and [BUG-035](docs/backlog/BUGS.md).',
      )
      expect(r.code, r.stderr).toBe(0)
      // THE NON-VACUITY FLOOR for the whole suite: the guard reports that it
      // examined at least 2 prose mentions bound to at least 2 lifecycle rows.
      // A guard that parsed nothing — the F-002 failure direction — cannot
      // produce these numbers and therefore cannot pass this case.
      expect(r.stderr).toMatch(/examined [2-9]/)
      expect(r.stderr).toMatch(/rows found: 2 of 2/)
    })
  })

  it('#6 an id with no row anywhere demands nothing — the guard never invents a target', async () => {
    await scenario('linkguard-6', async (s) => {
      const r = await runHook(
        s,
        'TASK-999 has no row anywhere. See [TASK-080](docs/doing/BACKLOG.md) for the guard.',
      )
      expect(r.code, `an id with no row was treated as a violation\n${r.stderr}`).toBe(0)
      // The prose mention WAS examined and only one of the two ids resolved to
      // a row — proof the no-row branch was reached rather than the message
      // passing by parsing nothing.
      expect(r.stderr).toMatch(/examined [2-9]/)
      expect(r.stderr).toMatch(/rows found: 1 of 2/)
    })
  })

  it('#7 a later bare mention of an already-linked id demands nothing', async () => {
    await scenario('linkguard-7', async (s) => {
      const r = await runHook(
        s,
        '[TASK-080](docs/doing/BACKLOG.md) is the guard. TASK-080 closes the epic gap.',
      )
      expect(r.code, `a later bare mention was treated as the first\n${r.stderr}`).toBe(0)
      expect(r.stderr).toMatch(/examined [2-9]/)
    })
  })

  it('#8 stop_hook_active short-circuits — the guard never loops the session', async () => {
    await scenario('linkguard-8', async (s) => {
      const r = await runHook(s, 'Bare: TASK-080.', { stopHookActive: true })
      expect(r.code, `stop_hook_active did not short-circuit\n${r.stderr}`).toBe(0)
    })
  })

  it('#9 a malformed payload exits 0 — the guard never blocks on its own bug', async () => {
    await scenario('linkguard-9', async (s) => {
      const r = await runHook(s, 'ignored', { payload: '{bad json' })
      expect(r.code, `a malformed payload blocked the session\n${r.stderr}`).toBe(0)
    })
  })

  it('#10 an unreadable transcript exits 0 — same rule, one layer down', async () => {
    await scenario('linkguard-10', async (s) => {
      const payloadFile = await s.fs.write(
        'payload.json',
        JSON.stringify({
          session_id: 'x',
          transcript_path: join(s.workspace.root, 'no-such-transcript.jsonl'),
          cwd: REPO_ROOT,
          hook_event_name: 'Stop',
          stop_hook_active: false,
        }),
      )
      const driver = await s.fs.write(
        'run-guard.sh',
        `exec node ${JSON.stringify(GUARD)} --hook --verbose < ${JSON.stringify(payloadFile)}\n`,
      )
      const r = await s.run('sh', [driver], { cwd: s.workspace.root, timeoutMs: 30_000 })
      expect(r.code, `an unreadable transcript blocked the session\n${r.stderr}`).toBe(0)
    })
  })

  it('#11 the guard is wired as a Stop hook in settings.json', async () => {
    // Every assertion above tests a script that nothing may be invoking — the
    // A-15/BUG-004 defect this repo has had twice. Parsed as JSON rather than
    // grepped, so a reference inside a comment or an unrelated key cannot
    // satisfy it.
    const raw = await readFile(join(REPO_ROOT, '.claude/settings.json'), 'utf8')
    const settings = JSON.parse(raw) as {
      hooks?: { Stop?: Array<{ hooks?: Array<{ command?: string }> }> }
    }

    const commands = (settings.hooks?.Stop ?? []).flatMap((entry) =>
      (entry.hooks ?? []).map((h) => h.command ?? ''),
    )

    expect(
      commands.some((c) => c.includes('link-guard')),
      `the guard is referenced by no Stop hook — it runs nowhere. Saw: ${JSON.stringify(commands)}`,
    ).toBe(true)
  })
})
