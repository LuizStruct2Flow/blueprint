/**
 * tests/subagent-feed/subagent-feed.spec.ts — BUG-027.
 *
 * The feed goes dark for the whole duration of any Claude-persona run. Measured
 * 2026-08-18: 28 tool calls over 4 minutes produced two lines, while 165 KB and
 * 190 KB subagent transcripts sat on disk being written. The founder watched work
 * happen in the UI with the feed blank.
 *
 * It punishes the rule it serves — delegating to a persona buys a blackout, so
 * working solo keeps the feed live.
 *
 * TWO INDEPENDENT CAUSES, and either one alone still produces a useless feed, so
 * both are asserted end to end against a REAL supervisor reading a REAL fixture
 * transcript. The source checks at the bottom are a backstop against the specific
 * idioms, never the coverage — the whole defect was two functions that each looked
 * correct in isolation.
 *
 *   1. `project_jsonl` filtered `.isSidechain != true` for every file it read.
 *      EVERY assistant record in a subagent's own transcript is sidechain, so the
 *      projection dropped 100% of them. The same filter is CORRECT on the session
 *      transcript, which also carries those records and would otherwise show each
 *      subagent line twice. One function, two files, opposite requirements — so
 *      the cases below assert BOTH directions, or a fix that simply deletes the
 *      filter passes.
 *
 *   2. The label came from `.subagent_type`, which is the agent TYPE
 *      (`general-purpose`), never the roster persona — fourteen identical rows in
 *      `.subagent-map`. The persona is only in the dispatch description, in the
 *      transcript's sibling `agent-<id>.meta.json`.
 *
 * EQUIVALENCE RECORD (R6, and this migration's own evidence).
 *
 * Trees carrying one injected defect each, plus the healthy control and negative
 * controls, were built once and BOTH implementations run over each: the retiring
 * `tests/subagent-feed/test.sh`, copied into the tree, and this spec with
 * `BP_SPEC_ROOT` pointed at it. The per-id verdict sets were compared
 * mechanically; the TASK-018 report lists every divergence.
 *
 * TWO THINGS THE PORT CHANGES, both recorded because a silent change is still a
 * change:
 *
 *   - `#6` (a roster lib that never returns) bounds the hook with the HARNESS's
 *     process timeout rather than with `timeout(1)` resolved at run time, and
 *     therefore no longer SKIPS where no `timeout(1)` exists. R7: a skipped test
 *     fails the build. The hook still needs `timeout(1)` internally to bound its
 *     own lookup, so its absence is now a FAILURE with a message saying so rather
 *     than a silent gap in coverage on that host.
 *   - `#7` stays a SOURCE check, deliberately, and that is a real limit rather
 *     than an oversight. The behavioural check needs a shell that LACKS
 *     `pipefail`, and this machine has none to offer — a stub cannot help, because
 *     it would have to INTERPRET the script rather than merely launch it. #5 and
 *     #6 run the hook under `sh` and do catch BUG-031 behaviourally, but only
 *     where that `sh` lacks the option, i.e. on the runner where it broke and
 *     where a green local suite said nothing.
 */

import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import { feedFixture, type FeedFixture } from '../helpers/feed-fixture.js'

/**
 * The tree under test. `BP_SPEC_ROOT` repoints it at a perturbed copy, which is
 * how the equivalence driver runs this spec and the retiring shell suite over the
 * same bytes. It selects the SUBJECT, never the sandbox.
 */
const SUBJECT = process.env.BP_SPEC_ROOT ?? REPO_ROOT

const FEED = join(SUBJECT, 'scripts', 'agent-activity.sh')
const HOOK = join(SUBJECT, 'scripts', 'log-activity.sh')
const ROSTER_LIB = join(SUBJECT, 'scripts', 'lib', 'roster.sh')

/** A script's source with comments stripped — this suite's own header names the idioms. */
async function code(path: string): Promise<string> {
  const raw = await readFile(path, 'utf8').catch(() => '')
  return raw.replace(/^[ \t]*#.*$/gm, '').replace(/[ \t]#.*$/gm, '')
}

/**
 * A roster of our OWN, never the repo's.
 *
 * A persona literal from someone's real fleet in a test is the BUG-010
 * contamination class in fixture form, and the assertions must not depend on which
 * names this engineer happens to run. Every row below earns its place:
 *
 *   Nadia / Pike        the description names TWO personas, which is the ordinary
 *                       shape ("<X> implements <Y>'s prescription"), and Pike sits
 *                       HIGHER in the table — so a resolver that returns the first
 *                       roster ROW rather than the earliest MENTION is caught.
 *   Bo / Bonnie         a short name that is a PREFIX of a longer one. A bare
 *                       substring match resolves 'Bonnie' to 'Bo', stably and
 *                       wrongly.
 *   Mary Jane / Mary    a name containing a SPACE, and one that is a prefix of it
 *                       at the same position with clean boundaries — so the
 *                       longest match has to win the tie.
 *   O'Neil              a name containing PUNCTUATION. The first implementation
 *                       tokenised the description and compared each token to the
 *                       WHOLE name, so any name holding a space or an apostrophe
 *                       could never equal one token and resolved to nothing,
 *                       silently, for every such fleet.
 */
const ROSTER = `# Roster

## Members

| Role | Name | Backing agent |
|---|---|---|
| Orchestrator | Wren | Claude Code |
| Senior Architect | Pike | Claude Code |
| Back-End-1 | Nadia | Claude Code |
| Front-End-2 | Bo | Codex |
| Front-End-1 | Bonnie | Claude Code |
| Data-1 | Mary Jane | Claude Code |
| Data-2 | Mary | Codex |
| QA-1 | O'Neil | Codex |
`

/** Resolve a description to a persona through the shared lookup. */
async function nameInText(s: Scenario, rosterDir: string, text: string) {
  return s.run(
    'bash',
    ['-c', `. "${ROSTER_LIB}"; bp_roster_name_in_text "${rosterDir}" "$1"`, 'x', text],
    { cwd: s.workspace.root },
  )
}

/** One assistant record as Claude Code writes it. */
const rec = (text: string, isSidechain: boolean): string =>
  `${JSON.stringify({
    type: 'assistant',
    isSidechain,
    message: { content: [{ type: 'text', text }] },
  })}\n`

interface Transcripts {
  /** The session transcript — carries the orchestrator's own records AND sidechain copies. */
  readonly mainRel: string
  /** The subagent's own transcript — every record in it is sidechain. */
  readonly subRel: string
}

/** The session transcript Claude Code writes for a fixture, under the scenario's HOME. */
const sessionRel = (f: FeedFixture): string =>
  `home/.claude/projects/${f.repo.replace(/\//g, '-')}/sess.jsonl`

/**
 * A subagent's sibling meta file, as Claude Code writes it beside the session
 * transcript. THE DISPATCH DESCRIPTION IN IT IS THE ONLY CARRIER OF THE PERSONA,
 * and `parentAgentId` (present only on a nested dispatch) the only link from a
 * helper to the agent that started it. Shape recorded 2026-09-15 (BUG-124).
 */
async function writeMeta(
  s: Scenario,
  session: string,
  agentId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await s.fs.write(
    session.replace(/\.jsonl$/, `/subagents/agent-${agentId}.meta.json`),
    `${JSON.stringify({ agentType: 'general-purpose', toolUseId: 'toolu_x', spawnDepth: 1, ...meta })}\n`,
  )
}

/**
 * The transcript tree Claude Code actually writes, under the scenario's HOME.
 *
 * The project directory is the repo path with every `/` replaced by `-`, which is
 * how the real client names it; deriving it rather than hardcoding is what makes
 * the fixture follow the workspace instead of agreeing with it by coincidence.
 */
async function transcripts(
  s: Scenario,
  f: FeedFixture,
  agentId: string,
  meta: Record<string, unknown> = { description: "Nadia implements Pike's prescription" },
): Promise<Transcripts> {
  const mainRel = sessionRel(f)
  const subRel = mainRel.replace(/\.jsonl$/, `/subagents/agent-${agentId}.jsonl`)

  await s.fs.write(mainRel, '', { append: true })
  await s.fs.write(subRel, '')
  await writeMeta(s, mainRel, agentId, meta)
  return { mainRel, subRel }
}

/**
 * The hook payloads Claude Code ACTUALLY sends — recorded from a live dispatch on
 * 2026-09-15 (BUG-124), trimmed to the fields that matter.
 *
 * NEITHER CARRIES THE DISPATCH DESCRIPTION. The previous #4 fed the hook a
 * `description` field that no real payload has, so it passed while every real
 * bookend in the feed read `[general-purpose - Claude Code]`. And at SubagentStart
 * the meta file that does carry it is not there yet: measured absent across a 2 s
 * poll from inside the hook, i.e. it is written after the hook RETURNS. At
 * SubagentStop it is present every time.
 */
function hookPayload(
  event: 'SubagentStart' | 'SubagentStop',
  sessionJsonl: string,
  agentId: string,
  agentType = 'general-purpose',
): Record<string, unknown> {
  const start = {
    session_id: 'sess',
    transcript_path: sessionJsonl,
    cwd: '/',
    agent_id: agentId,
    agent_type: agentType,
    hook_event_name: event,
  }
  if (event === 'SubagentStart') return start
  return {
    ...start,
    stop_hook_active: false,
    agent_transcript_path: sessionJsonl.replace(/\.jsonl$/, `/subagents/agent-${agentId}.jsonl`),
    last_assistant_message: 'OK',
  }
}

/** A standalone tree holding only the hook, its libs and a roster — for #5 and #6. */
async function hookTree(s: Scenario, name: string, rosterLib: string): Promise<string> {
  const dir = await s.fs.mkdirp(name)
  await s.fs.mkdirp(`${name}/logs`)
  await s.fs.write(`${name}/.blueprint-source`, '')
  await s.fs.copyIn(HOOK, `${name}/scripts/log-activity.sh`)
  const libs = await s.run('sh', ['-c', `ls "${join(SUBJECT, 'scripts', 'lib')}"`], {
    cwd: s.workspace.root,
  })
  for (const lib of libs.stdout.split('\n').filter((l) => l.endsWith('.sh'))) {
    await s.fs.copyIn(join(SUBJECT, 'scripts', 'lib', lib), `${name}/scripts/lib/${lib}`)
  }
  await s.fs.write(`${name}/AGENT_ROSTER.md`, ROSTER)
  // The poison goes in LAST, so it overwrites the real lib rather than racing it.
  await s.fs.write(`${name}/scripts/lib/roster.sh`, rosterLib)
  return dir
}

/** Feed a hook payload to the hook, as Claude Code does, and wait for it to exit. */
async function fireHook(
  s: Scenario,
  dir: string,
  payload: Record<string, unknown>,
  env: Record<string, string | undefined> = {},
  timeoutMs = 30_000,
) {
  return s.run(
    'sh',
    ['-c', `printf '%s' "$1" | sh "${join(dir, 'scripts', 'log-activity.sh')}"`, 'x', JSON.stringify(payload)],
    { cwd: dir, env, timeoutMs },
  )
}

describe('BUG-027 — delegated work is visible in the feed, under its persona', () => {
  // =========================================================================
  // #0 — the roster resolver, the ONE derivation both readers share.
  // =========================================================================
  it('#0 bp_roster_name_in_text is exposed by the roster lib', async () => {
    await scenario('sf-0-exposed', async (s) => {
      const r = await s.run(
        'bash',
        ['-c', `. "${ROSTER_LIB}" && command -v bp_roster_name_in_text >/dev/null 2>&1`],
        { cwd: s.workspace.root },
      )
      expect(
        r.code,
        'no shared text→persona lookup — the feed and the hook must each grow one, and drift',
      ).toBe(0)
    })
  })

  it('#0 the EARLIEST persona named wins, not the highest roster row', async () => {
    await scenario('sf-0-earliest', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
      // Resolving by table order would answer Pike, who sits higher. Wrong, and
      // STABLY wrong, which is worse than a visible miss.
      const r = await nameInText(s, dir, "Nadia implements Pike's prescription")
      expect(r.stdout).toBe('Nadia')
    })
  })

  it("#0 matches whole words — 'Bonnie' is not read as 'Bo'", async () => {
    await scenario('sf-0-prefix', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
      const r = await nameInText(s, dir, 'Bonnie reviews the diff')
      expect(r.stdout).toBe('Bonnie')
    })
  })

  it('#0 a description naming no persona resolves nothing (rc!=0)', async () => {
    await scenario('sf-0-none', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
      const r = await nameInText(s, dir, 'nobody by name here')
      expect(r.code, 'a description naming no persona still resolved one').not.toBe(0)
      expect(r.stdout).toBe('')
    })
  })

  it('#0 a name containing a SPACE resolves', async () => {
    await scenario('sf-0-space', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
      const r = await nameInText(s, dir, 'Mary Jane reviews')
      expect(r.stdout).toBe('Mary Jane')
    })
  })

  it('#0 a name containing PUNCTUATION resolves', async () => {
    await scenario('sf-0-punct', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
      const r = await nameInText(s, dir, "O'Neil reviews")
      expect(r.stdout).toBe("O'Neil")
    })
  })

  it('#0 earliest mention still wins with multi-word names', async () => {
    await scenario('sf-0-earliest-multi', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
      // The roster is ordered so that resolving by row would answer 'Mary Jane'.
      const r = await nameInText(s, dir, "O'Neil reviews Mary Jane's plan")
      expect(r.stdout).toBe("O'Neil")
    })
  })

  it('#0 a name that is a PREFIX of a longer one still resolves to the longer', async () => {
    await scenario('sf-0-tie', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
      // 'Mary' and 'Mary Jane' both start at position 1 with clean boundaries, so
      // the boundary check alone cannot decide it — the specific name has to win
      // the tie. Bo/Bonnie above covers the other direction.
      const r = await nameInText(s, dir, "Mary Jane's plan lands")
      expect(r.stdout).toBe('Mary Jane')
    })
  })

  // =========================================================================
  // #1-#3 — THE REPRODUCER, against a real supervisor.
  // =========================================================================
  it('#1 a sidechain record in a subagent transcript reaches the feed', async () => {
    await scenario('sf-1', async (s) => {
      const f = await feedFixture(s, 'repo', { source: SUBJECT, roster: ROSTER, holder: 'Wren' })
      const t = await transcripts(s, f, 'abc123def456')

      await f.withFeed(async () => {
        // The handshake, on the very file the case will use: `wait_sup` proves a
        // supervisor is RESIDENT, not that it has seeded THIS transcript, and a
        // payload written before the seed is skipped PERMANENTLY (BUG-038). Without
        // it this case reports "nothing emitted", which reads exactly like the
        // blackout it exists to detect.
        await f.readerReady(t.subRel, { wrap: (tag) => rec(tag, true) })
        await s.fs.write(t.subRel, rec('SUBAGENT-VISIBLE-LINE', true), { append: true })

        await f.expectLine('SUBAGENT-VISIBLE-LINE')
      })
    })
  })

  it("#2 labelled '[Nadia - Claude Code]' — persona + backing, from the roster", async () => {
    await scenario('sf-2', async (s) => {
      // Asserting the persona ALONE would pass against a label built by any means;
      // the backing agent is what proves it went through bp_roster_label.
      // `.subagent_type` is the agent TYPE (general-purpose) for every persona.
      const f = await feedFixture(s, 'repo', { source: SUBJECT, roster: ROSTER, holder: 'Wren' })
      const t = await transcripts(s, f, 'abc123def456')

      await f.withFeed(async () => {
        await f.readerReady(t.subRel, { wrap: (tag) => rec(tag, true) })
        await s.fs.write(t.subRel, rec('LABELLED-LINE', true), { append: true })
        await f.expectLine('LABELLED-LINE')

        expect(await f.read()).toContain('[Nadia - Claude Code] LABELLED-LINE')
      })
    })
  })

  it("#3 the session transcript's own records still stream", async () => {
    await scenario('sf-3a', async (s) => {
      const f = await feedFixture(s, 'repo', { source: SUBJECT, roster: ROSTER, holder: 'Wren' })
      const t = await transcripts(s, f, 'abc123def456')

      await f.withFeed(async () => {
        await f.readerReady(t.mainRel, { wrap: (tag) => rec(tag, false) })
        await s.fs.write(t.mainRel, rec('MAIN-OWN-LINE', false), { append: true })

        await f.expectLine('MAIN-OWN-LINE')
      })
    })
  })

  it('#3 sidechain records in the SESSION transcript are still dropped (no duplicates)', async () => {
    await scenario('sf-3b', async (s) => {
      // WITHOUT THIS, DELETING THE FILTER OUTRIGHT PASSES #1 — and every subagent
      // line then appears twice, the second time under the orchestrator's label.
      const f = await feedFixture(s, 'repo', { source: SUBJECT, roster: ROSTER, holder: 'Wren' })
      const t = await transcripts(s, f, 'abc123def456')

      await f.withFeed(async () => {
        await f.readerReady(t.mainRel, { wrap: (tag) => rec(tag, false) })
        await s.fs.write(t.mainRel, rec('MAIN-SIDECHAIN-COPY', true), { append: true })
        // An absence assertion needs a LATER positive to bound it, or it cannot
        // tell "dropped" from "not read yet". The sentinel is written after the
        // sidechain record and to the same file, so its arrival proves the
        // sidechain record was seen and discarded rather than still queued.
        await s.fs.write(t.mainRel, rec('MAIN-BOUND-SENTINEL', false), { append: true })
        await f.expectLine('MAIN-BOUND-SENTINEL')

        expect(
          await f.count('MAIN-SIDECHAIN-COPY'),
          'the sidechain filter was removed rather than made per-file — every ' +
            'subagent line will now appear twice, the second time mislabelled',
        ).toBe(0)
      })
    })
  })

  // =========================================================================
  // #4 — the hook labels its bookends from the same lookup.
  // =========================================================================
  const hookFixture = (s: Scenario) =>
    feedFixture(s, 'repo', { source: SUBJECT, roster: ROSTER, holder: 'Wren', withHook: true })

  it('#4 BUG-124: the dispatch bookend carries the persona, although its meta file is written after the hook returns', async () => {
    await scenario('sf-4a', async (s) => {
      // Two labels that agree only by coincidence is the BUG-010/BUG-021 shape.
      const f = await hookFixture(s)
      const session = join(s.workspace.root, sessionRel(f))

      const r = await fireHook(s, f.repo, hookPayload('SubagentStart', session, 'abc123def456'), {
        ...f.env,
        AGENT_FEED_LOG: f.log,
      })
      expect(r.code, r.output).toBe(0)
      // Only NOW, as the real client does it.
      await writeMeta(s, sessionRel(f), 'abc123def456', { description: "Nadia implements Pike's prescription" })

      await f.expectLine('[Nadia - Claude Code] → dispatched')
      expect(await f.count('→ dispatched'), 'one dispatch, one bookend').toBe(1)
    })
  })

  it('#4 BUG-124: the finish bookend carries the persona', async () => {
    await scenario('sf-4b', async (s) => {
      const f = await hookFixture(s)
      await writeMeta(s, sessionRel(f), 'abc123def456', { description: "Nadia implements Pike's prescription" })

      const r = await fireHook(
        s,
        f.repo,
        hookPayload('SubagentStop', join(s.workspace.root, sessionRel(f)), 'abc123def456'),
        { ...f.env, AGENT_FEED_LOG: f.log },
      )
      expect(r.code, r.output).toBe(0)

      expect(await f.read()).toContain('[Nadia - Claude Code] ← finished')
    })
  })

  it("#4 BUG-124: a helper a persona starts is labelled with that persona, not only the helper's type", async () => {
    await scenario('sf-4c', async (s) => {
      // The 23:04 case: Christian started a claude-code-guide helper, and its
      // bookends and 43 lines read `[claude-code-guide - Claude Code]` with
      // nothing tying them to him. `parentAgentId` is the tie.
      const f = await hookFixture(s)
      await writeMeta(s, sessionRel(f), 'abc123def456', { description: "Nadia implements Pike's prescription" })
      await writeMeta(s, sessionRel(f), 'fed654cba321', {
        agentType: 'claude-code-guide',
        description: 'Check missing import behaviour',
        parentAgentId: 'abc123def456',
        spawnDepth: 2,
      })

      const r = await fireHook(
        s,
        f.repo,
        hookPayload('SubagentStop', join(s.workspace.root, sessionRel(f)), 'fed654cba321', 'claude-code-guide'),
        { ...f.env, AGENT_FEED_LOG: f.log },
      )
      expect(r.code, r.output).toBe(0)

      expect(await f.read()).toContain('[Nadia › claude-code-guide - Claude Code] ← finished')
    })
  })

  it("#4 BUG-124: a helper's STREAMED lines carry the same parent label", async () => {
    await scenario('sf-4d', async (s) => {
      const f = await feedFixture(s, 'repo', { source: SUBJECT, roster: ROSTER, holder: 'Wren' })
      await transcripts(s, f, 'abc123def456')
      const t = await transcripts(s, f, 'fed654cba321', {
        agentType: 'claude-code-guide',
        description: 'Check missing import behaviour',
        parentAgentId: 'abc123def456',
        spawnDepth: 2,
      })

      await f.withFeed(async () => {
        await f.readerReady(t.subRel, { wrap: (tag) => rec(tag, true) })
        await s.fs.write(t.subRel, rec('HELPER-LINE', true), { append: true })
        await f.expectLine('HELPER-LINE')

        expect(await f.read()).toContain('[Nadia › claude-code-guide - Claude Code] HELPER-LINE')
      })
    })
  })

  it('#4 a meta file that never appears costs the label, not the bookend', async () => {
    await scenario('sf-4e', async (s) => {
      const f = await hookFixture(s)
      const r = await fireHook(
        s,
        f.repo,
        hookPayload('SubagentStart', join(s.workspace.root, sessionRel(f)), 'abc123def456'),
        { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_META_WAIT: '1' },
      )
      expect(r.code, r.output).toBe(0)

      await f.expectLine('[general-purpose - Claude Code] → dispatched')
    })
  })

  // =========================================================================
  // #5 / #6 — a broken roster lib must cost the LABEL, never the tool call.
  // =========================================================================
  it('#5 a roster lib that exits cannot take the hook down', async () => {
    await scenario('sf-5', async (s) => {
      // Found by the cross-provider reviewer: absent, unreadable and
      // non-zero-return all degraded safely, and a bare `exit` inside the lib did
      // not — it took the hook down with it, and a hook that dies fails the tool
      // call it was only there to observe.
      //
      // THIS REPLACES A SOURCE CHECK on the guard's SHAPE. The shape was the wrong
      // thing to assert: one attempt at it passed a correct implementation and
      // another failed one, both for reasons of formatting rather than behaviour.
      // Poison the lib and see what happens — that cannot be fooled by where a
      // line break falls.
      const dir = await hookTree(s, 'poison', 'exit 3\n')
      const feedLog = join(await s.fs.mkdirp('poison/logs'), 'feed.log')
      // The meta is PRESENT, so the hook really runs the lookup through the lib.
      await writeMeta(s, 'poison/sess.jsonl', 'deadbeef', { description: 'Nadia does a thing' })

      const r = await fireHook(
        s,
        dir,
        hookPayload('SubagentStop', join(dir, 'sess.jsonl'), 'deadbeef'),
        { AGENT_FEED_LOG: feedLog },
      )

      // The hook's stderr is KEPT, not discarded. This assertion used to swallow it
      // and report `rc=2` alone, which is how it failed in CI for a whole day while
      // passing on every developer machine: the number named the symptom and
      // nothing else. An assertion that cannot say WHY is the same defect this
      // suite exists to fix.
      expect(
        r.code,
        `a roster lib that calls exit killed the hook — it would fail the tool call.\n` +
          `hook stderr:\n${r.stderr}`,
      ).toBe(0)
      expect(
        (await readFile(feedLog, 'utf8').catch(() => '')).length,
        'the hook survived but logged nothing — the bookend is what makes a dispatch visible at all',
      ).toBeGreaterThan(0)
    })
  })

  it('#6 a roster lib that never returns is bounded; the line still lands, labelled by agent type', async () => {
    await scenario('sf-6', async (s) => {
      // THE SIBLING OF #5, AND THE ONE MODE THE SUBSHELL DOES NOT COVER: a subshell
      // contains an `exit`, it does not contain an infinite loop. Measured at
      // rc=124 under an external 2s bound, no feed line, no map row, while every
      // other broken-library mode degraded correctly. A hook that HANGS is worse
      // than one that dies: it stalls the tool call it was only there to observe.
      const dir = await hookTree(s, 'hang', 'while :; do :; done\n')
      const feedLog = join(await s.fs.mkdirp('hang/logs'), 'feed.log')
      await writeMeta(s, 'hang/sess.jsonl', 'hang01', { description: 'Nadia does a thing' })

      // The outer bound is the HARNESS's, deliberately several times the hook's, so
      // a regression shows up as a failure and never as a suite that never returns.
      // It replaces the shell version's run-time search for `timeout(1)`, which
      // SKIPPED the case where none was found — R7 makes a skip a build failure.
      const r = await fireHook(
        s,
        dir,
        hookPayload('SubagentStop', join(dir, 'sess.jsonl'), 'hang01'),
        { AGENT_FEED_LOG: feedLog, BP_ROSTER_LOOKUP_TIMEOUT: '1' },
        20_000,
      )

      expect(
        r.code,
        `a hook must always exit 0. A roster lib that never returns must not hang it.\n` +
          `hook stderr:\n${r.stderr}`,
      ).toBe(0)
      expect(
        await readFile(feedLog, 'utf8').catch(() => ''),
        'the hook survived the hang but did not land the bookend labelled by agent type',
      ).toContain('[general-purpose - Claude Code] ← finished')
    })
  })

  it('#7 pipefail is probed in a subshell before being set (source check — see the header)', async () => {
    // BUG-031. `set -uo pipefail` on line 20 killed the hook at rc=2 under the CI
    // runner's dash, before one defensive branch could run: the most defensive
    // script in the repo was destroyed by its own first statement. It passed on
    // every developer machine, because this dash ACCEPTS pipefail and the runner's
    // rejects it — so "my /bin/sh is dash too" was never evidence.
    const body = await code(HOOK)
    expect(body, 'the hook is missing or empty — the assertion would be vacuous').not.toBe('')
    expect(body, 'the hook sets pipefail unconditionally — it exits 2 on a sh without it')
      .not.toMatch(/set -uo pipefail|^[ \t]*set -o pipefail/m)
    expect(body, 'cannot tell how the hook handles pipefail — BUG-031 needs an explicit guard')
      .toMatch(/\([ \t]*set -o pipefail[ \t]*\)/)
  })

  // =========================================================================
  // Source backstops. Cheap guards against the exact idioms, not the coverage.
  // =========================================================================
  it('static: subagent transcripts are pumped under their own kind', async () => {
    expect(await code(FEED)).toMatch(/pump .*subagent|pump "\$f" jsonl-sub/)
  })

  it('static: the hook and the feed label a subagent through the one shared function', async () => {
    // The BUG-010 shape: two copies of a rule are two rules. BUG-124 was exactly
    // that — the hook derived its label apart from the feed, and they disagreed.
    expect(await code(HOOK)).toMatch(/bp_roster_subagent_label/)
    expect(await code(HOOK)).toMatch(/ROSTER_LIB/)
    expect(await code(FEED)).toMatch(/bp_roster_subagent_label/)
  })

  it('static: the hook resolves its timeout provider through scripts/lib/staleness.sh', async () => {
    // That question has one answer. A second way to find a timeout command is a
    // second rule that will disagree with the first on some host.
    expect(await code(HOOK)).toMatch(/bp_staleness_timeout_cmd/)
  })
})

/**
 * Alex's cross-provider review, 2026-09-16, finding 4: the deferred child is the
 * only part of this hook that outlives the tool call, and it inherited the
 * caller's open descriptors, took its bound from an unvalidated variable, and had
 * no cap on how many could be waiting at once.
 */
describe('BUG-124 — the deferred bookend child holds nothing and is bounded', () => {
  const deferFixture = (s: Scenario) =>
    feedFixture(s, 'repo', { source: SUBJECT, roster: ROSTER, holder: 'Wren', withHook: true })

  /** Deferred children of THIS scenario, by cwd — never machine-wide (BUG-089). */
  async function children(s: Scenario, repo: string): Promise<number> {
    const r = await s.run(
      'sh',
      [
        '-c',
        `. "${join(REPO_ROOT, 'tests', 'helpers', 'proc-cwd.sh')}"
         bp_proc_cwd_available || { echo NO-PROC-CWD-MECHANISM; exit 1; }
         n=0
         for p in $(ps -eo pid,args 2>/dev/null | grep '[l]og-activity.sh' | awk '{print $1}'); do
           case "$(bp_proc_cwd "$p")" in "$1"*) n=$((n+1)) ;; esac
         done
         printf '%s\\n' "$n"`,
        'x',
        repo,
      ],
      { cwd: repo },
    )
    if (r.stdout.includes('NO-PROC-CWD-MECHANISM')) {
      throw new Error(
        'this host has neither /proc nor lsof, so the deferred child cannot be counted. ' +
          'Every count would be 0 — which is what these cases assert — so the suite refuses ' +
          'to answer rather than reporting clean over nothing (BUG-089).',
      )
    }
    return Number(r.stdout.trim())
  }

  const start = (s: Scenario, f: FeedFixture, id: string): string =>
    JSON.stringify(hookPayload('SubagentStart', join(s.workspace.root, sessionRel(f)), id))

  it('#8 an inherited descriptor is released when the hook returns, not when the child finishes', async () => {
    await scenario('sf-8', async (s) => {
      // The hook redirects 0, 1 and 2 only, so everything above 2 went to the
      // child — including a lock. A dispatch lock could therefore be held for the
      // whole meta wait, long after the hook exited.
      const f = await deferFixture(s)
      await s.fs.write('lock', '')
      const lock = join(s.workspace.root, 'lock')
      const driver = await s.fs.write(
        'hold-fd.sh',
        `exec 9>${JSON.stringify(lock)}\n` +
          `flock -n 9 || exit 3\n` +
          `printf '%s' "$1" | sh ${JSON.stringify(join(f.repo, 'scripts/log-activity.sh'))}\n` +
          `exec 9>&-\n`,
      )

      const r = await s.run('sh', [driver, start(s, f, 'abc123def456')], {
        cwd: f.repo,
        env: { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_META_WAIT: '5' },
      })
      expect(r.code, `the fixture never took the lock\n${r.output}`).toBe(0)

      // While the child is still waiting for a meta file that never comes.
      const probe = await s.run('flock', ['-w', '2', lock, 'true'], { cwd: f.repo })
      expect(
        probe.code,
        'the lock was still held after the hook returned — the deferred child inherited it',
      ).toBe(0)
      await f.expectLine('→ dispatched', 15_000)
    })
  })

  it('#9 an out-of-range meta wait is capped, so the child cannot outlive the dispatch by hours', async () => {
    await scenario('sf-9', async (s) => {
      const f = await deferFixture(s)
      const r = await s.run(
        'sh',
        ['-c', `printf '%s' "$1" | sh ${JSON.stringify(join(f.repo, 'scripts/log-activity.sh'))}`, 'x', start(s, f, 'abc123def456')],
        { cwd: f.repo, env: { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_META_WAIT: '999999' } },
      )
      expect(r.code, r.output).toBe(0)
      expect(await children(s, f.repo), 'no child was deferred, so this case proves nothing').toBeGreaterThan(0)

      // PROCESS EXIT, not marker arrival: the bookend lands on the way out, so a
      // case that waits for the line says nothing about the process behind it.
      await vi.waitFor(
        async () => {
          const n = await children(s, f.repo)
          if (n > 0) throw new Error(`${n} deferred child(ren) still running`)
        },
        { timeout: 30_000, interval: 250 },
      )
      expect(await f.read()).toContain('→ dispatched')
    })
  })

  it('#10 a meta wait that is not a number costs neither the bookend nor the hook', async () => {
    await scenario('sf-10', async (s) => {
      // Unvalidated, the value reached shell arithmetic, where a non-numeric name
      // is an error under `set -u` — killing the child before it emits anything.
      const f = await deferFixture(s)
      const r = await s.run(
        'sh',
        ['-c', `printf '%s' "$1" | sh ${JSON.stringify(join(f.repo, 'scripts/log-activity.sh'))}`, 'x', start(s, f, 'abc123def456')],
        { cwd: f.repo, env: { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_META_WAIT: 'soon' } },
      )
      expect(r.code, `a hook must always exit 0\n${r.output}`).toBe(0)
      await f.expectLine('→ dispatched', 15_000)
    })
  })

  it('#11 a burst of dispatches is capped, and every bookend still lands', async () => {
    await scenario('sf-11', async (s) => {
      const f = await deferFixture(s)
      const ids = Array.from({ length: 12 }, (_, i) => `burst${i}0000000`)
      for (const id of ids) {
        const r = await s.run(
          'sh',
          ['-c', `printf '%s' "$1" | sh ${JSON.stringify(join(f.repo, 'scripts/log-activity.sh'))}`, 'x', start(s, f, id)],
          { cwd: f.repo, env: { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_META_WAIT: '20' } },
        )
        expect(r.code, r.output).toBe(0)
      }

      // Unbounded, all twelve sit waiting for twenty seconds each. The cap makes
      // the surplus emit at once instead — labelled by agent type, never dropped.
      expect(
        await children(s, f.repo),
        'every dispatch in the burst deferred a waiting child; nothing caps them',
      ).toBeLessThanOrEqual(8)
      await vi.waitFor(
        async () => {
          const n = await f.count('→ dispatched')
          if (n !== ids.length) throw new Error(`${n} of ${ids.length} bookends have landed`)
        },
        { timeout: 40_000, interval: 250 },
      )
    })
  })

  // --- Alexey's review of the fix, 2026-09-16 ------------------------------

  it('#12 twelve SIMULTANEOUS dispatches reserve at most the cap, and the knob cannot raise it', async () => {
    await scenario('sf-12', async (s) => {
      // #11 fires its twelve in sequence, so it only ever sees one claim at a
      // time: it cannot fail on a check-then-create race, which is what the cap
      // actually is. These twelve wait on a barrier and are released together.
      // BP_SUBAGENT_DEFER_MAX is 999 here, so the ceiling must be the hook's own.
      const f = await deferFixture(s)
      const go = s.workspace.path('go')
      const hook = join(f.repo, 'scripts/log-activity.sh')
      const runs = []
      for (let i = 0; i < 12; i += 1) {
        const driver = await s.fs.write(
          `race-${i}.sh`,
          `while [ ! -e ${JSON.stringify(go)} ]; do sleep 0.02; done\n` +
            `printf '%s' "$1" | sh ${JSON.stringify(hook)}\n`,
        )
        runs.push(
          s.run('sh', [driver, start(s, f, `race${i}00000000`)], {
            cwd: f.repo,
            env: {
              ...f.env,
              AGENT_FEED_LOG: f.log,
              BP_SUBAGENT_META_WAIT: '10',
              BP_SUBAGENT_DEFER_MAX: '999',
            },
          }),
        )
      }
      await s.fs.write('go', '')
      for (const r of await Promise.all(runs)) expect(r.code, r.output).toBe(0)

      expect(
        await children(s, f.repo),
        'more children than the cap: counting slots and then creating one is a race, not a limit',
      ).toBeLessThanOrEqual(8)
      await vi.waitFor(
        async () => {
          const n = await f.count('→ dispatched')
          if (n !== 12) throw new Error(`${n} of 12 bookends have landed`)
        },
        { timeout: 40_000, interval: 250 },
      )
    })
  })

  for (const shell of ['sh', 'bash']) {
    it(`#13 ${shell}: an inherited fd 19 is released AND the bookend still lands`, async () => {
      await scenario(`sf-13-${shell}`, async (s) => {
        // #8 uses fd 9. A multi-digit descriptor is the boundary: `eval "exec
        // 19>&-"` under dash is an attempted exec of a command named 19, which
        // exits 127 and takes the child with it — so the dispatch vanished with
        // the foreground hook still returning 0.
        const f = await deferFixture(s)
        await s.fs.write('lock', '')
        const lock = join(s.workspace.root, 'lock')
        const driver = await s.fs.write(
          `hold-19-${shell}.sh`,
          `exec 19>${JSON.stringify(lock)}\n` +
            `flock -n 19 || exit 3\n` +
            `printf '%s' "$1" | ${shell} ${JSON.stringify(join(f.repo, 'scripts/log-activity.sh'))}\n` +
            `exec 19>&-\n`,
        )

        // The DRIVER runs under bash, deliberately: dash cannot even open fd 19
        // (`exec 19>file` is an attempted exec of `19`), so a dash driver would
        // fail before the hook ran. The SUBJECT shell is the one that varies.
        const r = await s.run('bash', [driver, start(s, f, 'abc123def456')], {
          cwd: f.repo,
          env: { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_META_WAIT: '5' },
        })
        expect(r.code, `the fixture never took the lock\n${r.output}`).toBe(0)

        const probe = await s.run('flock', ['-w', '2', lock, 'true'], { cwd: f.repo })
        expect(probe.code, 'fd 19 was still held after the hook returned').toBe(0)
        await f.expectLine('→ dispatched', 15_000)
      })
    })
  }

  for (const wait of ['08', '0009', '99999999999999999999999999']) {
    it(`#14 a wait of ${wait} keeps the bookend and leaves no child behind`, async () => {
      await scenario(`sf-14-${wait.length}-${wait[1] ?? 'x'}`, async (s) => {
        // Digit strings pass the old validation unnormalised: `08` is not a
        // decimal 8 to shell arithmetic, it is a bad octal, and a 26-digit value
        // makes the clamp comparison print "integer expected" and skip. Both
        // lose the bookend — the silent-loss class `soon` was meant to close.
        const f = await deferFixture(s)
        const r = await s.run(
          'sh',
          [
            '-c',
            `printf '%s' "$1" | sh ${JSON.stringify(join(f.repo, 'scripts/log-activity.sh'))}`,
            'x',
            start(s, f, 'abc123def456'),
          ],
          { cwd: f.repo, env: { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_META_WAIT: wait } },
        )
        expect(r.code, `a hook must always exit 0\n${r.output}`).toBe(0)
        await f.expectLine('→ dispatched', 20_000)
        await vi.waitFor(
          async () => {
            const n = await children(s, f.repo)
            if (n > 0) throw new Error(`${n} deferred child(ren) still running`)
          },
          { timeout: 30_000, interval: 250 },
        )
      })
    })
  }

  it('#15 a dispatch past the cap says so, instead of degrading the label in silence', async () => {
    await scenario('sf-15', async (s) => {
      // Alexey's informational 8: over the cap the line is kept but the persona
      // is not, and nothing said so. A lost label with no notice reads exactly
      // like a subagent that has no persona.
      const f = await deferFixture(s)
      const r = await s.run(
        'sh',
        [
          '-c',
          `printf '%s' "$1" | sh ${JSON.stringify(join(f.repo, 'scripts/log-activity.sh'))}`,
          'x',
          start(s, f, 'abc123def456'),
        ],
        { cwd: f.repo, env: { ...f.env, AGENT_FEED_LOG: f.log, BP_SUBAGENT_DEFER_MAX: '0' } },
      )
      expect(r.code, r.output).toBe(0)
      await f.expectLine('→ dispatched', 15_000)
      expect(
        r.stderr,
        'the label was degraded with no notice — stderr is where a hook says such things (--debug shows it)',
      ).toMatch(/cap|label/i)
    })
  })
})
