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

import { describe, it, expect } from 'vitest'
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

/**
 * The transcript tree Claude Code actually writes, under the scenario's HOME.
 *
 * The project directory is the repo path with every `/` replaced by `-`, which is
 * how the real client names it; deriving it rather than hardcoding is what makes
 * the fixture follow the workspace instead of agreeing with it by coincidence.
 */
async function transcripts(s: Scenario, f: FeedFixture, agentId: string): Promise<Transcripts> {
  const projectDir = `home/.claude/projects/${f.repo.replace(/\//g, '-')}`
  const mainRel = `${projectDir}/sess.jsonl`
  const subRel = `${projectDir}/sess/subagents/agent-${agentId}.jsonl`

  await s.fs.write(mainRel, '')
  await s.fs.write(subRel, '')
  // THE DISPATCH DESCRIPTION IS THE ONLY CARRIER OF THE PERSONA.
  await s.fs.write(
    `${projectDir}/sess/subagents/agent-${agentId}.meta.json`,
    `${JSON.stringify({
      agentType: 'general-purpose',
      description: "Nadia implements Pike's prescription",
      toolUseId: 'toolu_x',
      spawnDepth: 1,
    })}\n`,
  )
  return { mainRel, subRel }
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

/** Feed a SubagentStart payload to the hook. */
async function fireHook(
  s: Scenario,
  dir: string,
  payload: Record<string, string>,
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
  it('#4 the dispatch bookend carries the persona, not the agent type', async () => {
    await scenario('sf-4a', async (s) => {
      // Two labels that agree only by coincidence is the BUG-010/BUG-021 shape.
      const f = await feedFixture(s, 'repo', {
        source: SUBJECT,
        roster: ROSTER,
        holder: 'Wren',
        withHook: true,
      })
      const r = await s.run(
        'sh',
        [
          '-c',
          `printf '%s' "$1" | sh scripts/log-activity.sh`,
          'x',
          JSON.stringify({
            hook_event_name: 'SubagentStart',
            agent_id: 'abc123def456',
            subagent_type: 'general-purpose',
            description: 'Nadia implements Pikes prescription',
          }),
        ],
        { cwd: f.repo, env: { ...f.env, AGENT_FEED_LOG: f.log }, timeoutMs: 30_000 },
      )
      expect(r.code, r.output).toBe(0)

      expect(await f.read()).toContain('[Nadia - Claude Code] → dispatched')
    })
  })

  it('#4 .subagent-map records the persona, so the fallback path is right too', async () => {
    await scenario('sf-4b', async (s) => {
      const f = await feedFixture(s, 'repo', {
        source: SUBJECT,
        roster: ROSTER,
        holder: 'Wren',
        withHook: true,
      })
      await s.run(
        'sh',
        [
          '-c',
          `printf '%s' "$1" | sh scripts/log-activity.sh`,
          'x',
          JSON.stringify({
            hook_event_name: 'SubagentStart',
            agent_id: 'abc123def456',
            subagent_type: 'general-purpose',
            description: 'Nadia implements Pikes prescription',
          }),
        ],
        { cwd: f.repo, env: { ...f.env, AGENT_FEED_LOG: f.log }, timeoutMs: 30_000 },
      )

      expect(await s.fs.read('repo/logs/.subagent-map')).toMatch(/^abc123def456 Nadia$/m)
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

      const r = await fireHook(
        s,
        dir,
        {
          hook_event_name: 'SubagentStart',
          agent_id: 'deadbeef',
          subagent_type: 'general-purpose',
          description: 'Nadia does a thing',
        },
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

      // The outer bound is the HARNESS's, deliberately several times the hook's, so
      // a regression shows up as a failure and never as a suite that never returns.
      // It replaces the shell version's run-time search for `timeout(1)`, which
      // SKIPPED the case where none was found — R7 makes a skip a build failure.
      const r = await fireHook(
        s,
        dir,
        {
          hook_event_name: 'SubagentStart',
          agent_id: 'hang01',
          subagent_type: 'general-purpose',
          description: 'Nadia does a thing',
        },
        { AGENT_FEED_LOG: feedLog, BP_ROSTER_LOOKUP_TIMEOUT: '1' },
        20_000,
      )

      expect(
        r.code,
        `a hook must always exit 0. A roster lib that never returns must not hang it.\n` +
          `hook stderr:\n${r.stderr}`,
      ).toBe(0)
      expect(
        (await readFile(feedLog, 'utf8').catch(() => '')).length,
        'the hook survived the hang but logged nothing — the bookend is what makes a dispatch visible',
      ).toBeGreaterThan(0)
      expect(
        await s.fs.read('hang/logs/.subagent-map'),
        'no .subagent-map row after a bounded lookup — the streamed-line fallback goes dark',
      ).toMatch(/^hang01 /m)
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

  it('static: the feed resolves the persona through the roster lib', async () => {
    expect(await code(FEED)).toMatch(/bp_roster_name_in_text/)
  })

  it('static: the hook has not grown its own persona derivation again', async () => {
    // The BUG-010 shape: two copies of a rule are two rules.
    expect(await code(HOOK)).toMatch(/bp_roster_name_in_text/)
    expect(await code(HOOK)).toMatch(/ROSTER_LIB/)
  })

  it('static: the hook resolves its timeout provider through scripts/lib/staleness.sh', async () => {
    // That question has one answer. A second way to find a timeout command is a
    // second rule that will disagree with the first on some host.
    expect(await code(HOOK)).toMatch(/bp_staleness_timeout_cmd/)
  })
})
