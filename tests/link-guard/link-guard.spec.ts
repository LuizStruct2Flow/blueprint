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
 * The guard's contract, from the TASK-080 row:
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
 *   - an id whose row sits in TWO folders at once — the spec'd REOPEN
 *     transition of docs/DoD.md §1 — accepts a link to ANY folder that really
 *     holds the row, and a bare mention names every candidate. The guard
 *     never picks a winner by ordering (#12, #13).
 *   - refusal is exit 2 naming each id AND the exact path it should have
 *     linked to, so the fix is mechanical.
 *   - `stop_hook_active` in the payload short-circuits (a guard that re-fires
 *     on its own stop loops the session), and any failure of the guard's own
 *     machinery exits 0 — a guard that blocks the session on its own bug is
 *     worse than the miss it was built for.
 *
 * THE DOCS ROOT. The guard reads the lifecycle docs from the payload's `cwd`.
 * Every BEHAVIOURAL case plants its own docs/ tree in the scenario workspace
 * and points the payload's cwd at it — the pattern #12/#13 established. That
 * is deliberate: these cases used to assert against the live checkout with a
 * hard-coded folder, and they went RED on main the day TASK-080's own row
 * moved doing/ → waiting-acceptance/ — the ordinary lifecycle move this guard
 * exists to track broke the guard's own suite (CI 89861bb). A case that
 * asserts on a path owns the tree that path lives in. Exactly ONE case, #14,
 * runs against the real docs/ tree, and it resolves the row's folder at
 * runtime rather than hard-coding one, so the next move cannot break it.
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
 * FIXTURE ROWS. The planted docs/ tree holds, at locations fixed BY THE
 * FIXTURE (two prefixes, two files):
 *
 *   TASK-080  -> docs/doing/BACKLOG.md   (fixture only — the live row moves)
 *   BUG-035   -> docs/backlog/BUGS.md
 *   TASK-999  -> no row anywhere
 *
 * #14 is the only case that reads the live tree; it resolves TASK-080's row
 * at runtime, so a lifecycle move changes what it asserts, never whether it
 * passes.
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
  options: { stopHookActive?: boolean; payload?: string; payloadCwd?: string } = {},
): Promise<{ code: number | null; stderr: string }> {
  const transcriptFile = await s.fs.write('transcript.jsonl', transcript(message))
  const payload =
    options.payload ??
    JSON.stringify({
      session_id: '11111111-2222-3333-4444-555555555555',
      transcript_path: transcriptFile,
      // The docs root the guard reads. Defaults to the real checkout — which
      // ONLY #14 means: every other case plants its own docs/ tree and points
      // cwd at the workspace.
      cwd: options.payloadCwd ?? REPO_ROOT,
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

/**
 * The hermetic docs/ tree every behavioural case plants: two rows, two
 * prefixes, two files, at locations fixed BY THE FIXTURE so the assertions
 * can name them. The live TASK-080 row's location is none of these cases'
 * business — only #14 reads the live tree.
 */
const FIXTURE_BACKLOG = `# Fixture backlog

| Id | Title |
|---|---|
| **TASK-080** | the row under test |
`

const FIXTURE_BUGS = `# Fixture bugs

| Id | Title |
|---|---|
| **BUG-035** | a second row in a second file |
`

async function plantFixtureDocs(s: Scenario): Promise<void> {
  await s.fs.write('docs/doing/BACKLOG.md', FIXTURE_BACKLOG)
  await s.fs.write('docs/backlog/BUGS.md', FIXTURE_BUGS)
}

/**
 * Where the LIVE docs/ tree holds `id`'s row today — the same scan the guard
 * performs (same folders, same anchor shapes), so #14 can assert against
 * reality without hard-coding a folder. Empty when no lifecycle file holds
 * the row.
 */
async function liveRowPaths(id: string): Promise<string[]> {
  const found: string[] = []
  const tableRow = new RegExp(`^\\|\\s*\\*\\*${id}\\*\\*\\s*\\|`, 'm')
  const heading = new RegExp(`^#{1,6}\\s+\\*{0,2}${id}\\*{0,2}(?=[\\s—]|$)`, 'm')
  for (const folder of ['done', 'waiting-acceptance', 'doing', 'backlog'] as const) {
    for (const file of ['BACKLOG.md', 'BUGS.md'] as const) {
      const rel = `docs/${folder}/${file}`
      const content = await readFile(join(REPO_ROOT, rel), 'utf8').catch(() => null)
      if (content !== null && (tableRow.test(content) || heading.test(content))) {
        found.push(rel)
      }
    }
  }
  return found
}

describe('TASK-080 — the link guard refuses unlinked item ids in the reply text', () => {
  it('#1 a bare id with a real row is refused, naming the exact path it should link', async () => {
    await scenario('linkguard-1', async (s) => {
      await plantFixtureDocs(s)
      const r = await runHook(s, 'Landed today: TASK-080, the link guard.', {
        payloadCwd: s.workspace.root,
      })
      expect(r.code, `a bare id with a real row was not refused\n${r.stderr}`).toBe(BLOCKED)
      // The message must name BOTH the id and the exact target — the fix is
      // meant to be mechanical, not a hunt. The path is the FIXTURE's, never
      // the live tree's.
      expect(r.stderr).toContain('TASK-080')
      expect(r.stderr).toContain('docs/doing/BACKLOG.md')
    })
  })

  it('#2 an id linked to the WRONG lifecycle folder is refused — a stale link is the case worth catching', async () => {
    await scenario('linkguard-2', async (s) => {
      await plantFixtureDocs(s)
      // The fixture holds TASK-080's row in doing/. A link to backlog/ is
      // "some link exists", the F-002 proxy: satisfiable without the
      // property. The guard must resolve where the row ACTUALLY is and refuse
      // the stale target.
      const r = await runHook(s, 'See [TASK-080](docs/backlog/BACKLOG.md) for the row.', {
        payloadCwd: s.workspace.root,
      })
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
      await plantFixtureDocs(s)
      const r = await runHook(
        s,
        'Two rows moved: [TASK-080](docs/doing/BACKLOG.md) and [BUG-035](docs/backlog/BUGS.md).',
        { payloadCwd: s.workspace.root },
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
      await plantFixtureDocs(s)
      const r = await runHook(
        s,
        'TASK-999 has no row anywhere. See [TASK-080](docs/doing/BACKLOG.md) for the guard.',
        { payloadCwd: s.workspace.root },
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
      await plantFixtureDocs(s)
      const r = await runHook(
        s,
        '[TASK-080](docs/doing/BACKLOG.md) is the guard. TASK-080 closes the epic gap.',
        { payloadCwd: s.workspace.root },
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

  // THE DUAL-FOLDER CASE, both directions. docs/DoD.md §1's REOPEN transition
  // legitimately leaves one id in two folders at once — BUG-500 was accepted
  // (row in done/) and then reopened (row moved back to doing/), and until
  // the done/ row is removed the id is in both. This is the state the live
  // tree does not currently exhibit (221 ids, none in two folders, checked
  // 2026-09-24), so each case plants its own docs/ tree in the workspace and
  // points the payload's cwd at it.
  const DUAL_TREE = `# Fixture bugs

| Id | Title |
|---|---|
| **BUG-500** | reopened per docs/DoD.md §1 |
`

  it('#12 a reopened row in two folders: a BARE mention names EVERY candidate, not the done/ side', async () => {
    await scenario('linkguard-12', async (s) => {
      await s.fs.write('docs/done/BUGS.md', DUAL_TREE)
      await s.fs.write('docs/doing/BUGS.md', DUAL_TREE)
      const r = await runHook(s, 'Reopened: BUG-500 needs another pass.', {
        payloadCwd: s.workspace.root,
      })
      expect(r.code, `a bare mention with a dual-folder row was not refused\n${r.stderr}`).toBe(
        BLOCKED,
      )
      // The refusal must name BOTH folders that really hold the row — naming
      // only docs/done/BUGS.md would send the founder to the stale, closed
      // row, which is the defect this case exists to pin.
      expect(r.stderr).toContain('BUG-500')
      expect(r.stderr).toContain('docs/done/BUGS.md')
      expect(r.stderr).toContain('docs/doing/BUGS.md')
      // Non-vacuity: the planted row was actually resolved (1 of 1, not 0 of 1).
      expect(r.stderr).toMatch(/rows found: 1 of 1/)
    })
  })

  it('#13 a reopened row in two folders: a link to EITHER folder passes — the guard never picks a winner', async () => {
    await scenario('linkguard-13', async (s) => {
      await s.fs.write('docs/done/BUGS.md', DUAL_TREE)
      await s.fs.write('docs/doing/BUGS.md', DUAL_TREE)

      // The CURRENT side. Pre-fix code scanned done/ first, called this the
      // stale link and refused it — the exact failure the review found.
      const current = await runHook(s, 'See [BUG-500](docs/doing/BUGS.md) for the reopened row.', {
        payloadCwd: s.workspace.root,
      })
      expect(
        current.code,
        `a link to the doing/ side of a dual-folder row was refused\n${current.stderr}`,
      ).toBe(0)
      expect(current.stderr).toMatch(/rows found: 1 of 1/)

      // The STALE side. Pre-fix code endorsed this one — also wrong, but the
      // contract's answer is the same: it really holds the row, so it passes.
      const stale = await runHook(s, 'See [BUG-500](docs/done/BUGS.md) for the record.', {
        payloadCwd: s.workspace.root,
      })
      expect(
        stale.code,
        `a link to the done/ side of a dual-folder row was refused\n${stale.stderr}`,
      ).toBe(0)
    })
  })

  // THE LIVE-TREE CASE, exactly one. Every behavioural case above owns a
  // planted docs/ tree; this one runs the guard against the real checkout to
  // prove the wiring end to end on true rows. It must therefore never name a
  // folder: it resolves TASK-080's row at runtime and asserts on whatever
  // comes back, so the next lifecycle move (waiting-acceptance/ → done/)
  // changes what is asserted, not whether the case passes.
  it("#14 LIVE-TREE: a bare id is refused at the row's CURRENT live location, and a link there passes", async () => {
    const rowFiles = await liveRowPaths('TASK-080')
    expect(
      rowFiles.length,
      'the live docs/ tree holds no TASK-080 row in any lifecycle folder — ' +
        'repoint this case at an id that has one',
    ).toBeGreaterThan(0)

    await scenario('linkguard-14', async (s) => {
      // A bare mention is refused, and the refusal names EVERY folder that
      // really holds the row today (one, or two during a REOPEN).
      const bare = await runHook(s, 'Landed today: TASK-080, the link guard.')
      expect(bare.code, `a bare id with a real live row was not refused\n${bare.stderr}`).toBe(
        BLOCKED,
      )
      expect(bare.stderr).toContain('TASK-080')
      for (const f of rowFiles) expect(bare.stderr).toContain(f)

      // A link to the resolved location passes — the guard endorses the row
      // where it actually is, not where a fixture put it.
      const linked = await runHook(s, `See [TASK-080](${rowFiles[0]}) for the row.`)
      expect(
        linked.code,
        `a link to the row's live location was refused\n${linked.stderr}`,
      ).toBe(0)
    })
  })
})
