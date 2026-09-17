/**
 * tests/roster-models/roster-models.spec.ts — TASK-059.
 *
 * A persona's roster Model cell is `<tier>:<effort>`, resolved against the
 * provider's own ranked list, never a hardcoded version. One case per control:
 *
 *   #1 the resolver maps tiers for both providers;
 *   #2 an effort the model does not support is refused, naming the persona;
 *   #3 the generator writes the Claude subagent definition;
 *   #4 a feed line carries the model and the effort.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const SUBJECT = process.env.BP_SPEC_ROOT ?? REPO_ROOT
const LIB = join(SUBJECT, 'scripts', 'lib', 'roster.sh')

const ROSTER = `# Roster

## Members

| Role | Name | Backing agent | Model |
|---|---|---|---|
| Orchestrator | Ada | Claude Code | frontier:max |
| QA-1 | Nadia | Claude Code | frontier-2:medium |
| Architect | Olek | Codex | frontier-1:high |
| QA-2 | Pim | Codex | frontier-3:ultra |

Claude models, best first: fable, opus, sonnet, haiku
`

/** Priority order is NOT file order, and a hidden model sits between listed ones. */
const MODELS = JSON.stringify({
  models: [
    { slug: 'm-third', visibility: 'list', priority: 9, supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] },
    { slug: 'm-best', visibility: 'list', priority: 1, supported_reasoning_levels: [{ effort: 'high' }] },
    { slug: 'm-hidden', visibility: 'hide', priority: 2, supported_reasoning_levels: [{ effort: 'high' }] },
    { slug: 'm-second', visibility: 'list', priority: 5, supported_reasoning_levels: [{ effort: 'high' }] },
    { slug: 'm-fourth', visibility: 'list', priority: 12, supported_reasoning_levels: [{ effort: 'low' }] },
  ],
})

async function project(s: Scenario): Promise<{ dir: string; env: Record<string, string> }> {
  const dir = await s.fs.mkdirp('proj')
  await s.fs.write('proj/AGENT_ROSTER.md', ROSTER)
  await s.fs.write('proj/.blueprint-source', '')
  await s.fs.write('codex/models_cache.json', MODELS)
  return { dir, env: { CODEX_HOME: s.workspace.path('codex') } }
}

async function lib(s: Scenario, snippet: string) {
  const { dir, env } = await project(s)
  return s.run('bash', ['-c', `. "${LIB}"; ${snippet.replace(/@/g, dir)}`], { cwd: s.workspace.root, env })
}

describe('TASK-059 — roster Model tiers', () => {
  it('#1 tiers resolve against each provider list', async () => {
    await scenario('rm-1', async (s) => {
      const r = await lib(s, 'for p in Ada Nadia Olek; do bp_roster_model_for_name "@" "$p"; done')
      expect(r.stdout, r.stderr).toBe(
        'Claude Code\tfable\tmax\n' + 'Claude Code\tsonnet\tmedium\n' + 'Codex\tm-second\thigh\n',
      )
    })
  })

  it('#2 an effort the model does not support is refused, naming the persona', async () => {
    await scenario('rm-2', async (s) => {
      const r = await lib(s, 'bp_roster_model_for_name "@" Pim')
      expect(r.code).not.toBe(0)
      expect(r.stdout).toBe('')
      expect(r.stderr).toMatch(/Pim: effort 'ultra' is not supported by m-fourth/)
    })
  })

  it('#3 the generator writes one agent file per Claude persona, not the Orchestrator', async () => {
    await scenario('rm-3', async (s) => {
      const { dir, env } = await project(s)
      await s.fs.copyIn(join(SUBJECT, 'scripts', 'claude-agents.sh'), 'proj/scripts/claude-agents.sh')
      for (const f of ['roster.sh', 'state-dir.sh']) {
        await s.fs.copyIn(join(SUBJECT, 'scripts', 'lib', f), `proj/scripts/lib/${f}`)
      }
      const r = await s.run('bash', [join(dir, 'scripts', 'claude-agents.sh')], { cwd: dir, env })
      expect(r.code, r.output).toBe(0)
      expect(await readdir(join(dir, '.claude', 'agents'))).toEqual(['nadia.md'])
      expect(await readFile(join(dir, '.claude', 'agents', 'nadia.md'), 'utf8')).toMatch(
        /^---\nname: nadia\ndescription: QA-1\nmodel: sonnet\neffort: medium\n---\n/,
      )
    })
  })

  it('#3b a hand-written agent file with a persona name is kept, and a generated one is replaced', async () => {
    await scenario('rm-3b', async (s) => {
      const { dir, env } = await project(s)
      await s.fs.copyIn(join(SUBJECT, 'scripts', 'claude-agents.sh'), 'proj/scripts/claude-agents.sh')
      for (const f of ['roster.sh', 'state-dir.sh']) {
        await s.fs.copyIn(join(SUBJECT, 'scripts', 'lib', f), `proj/scripts/lib/${f}`)
      }
      const own = '---\nname: nadia\ndescription: mine\n---\nHand-written project instructions\n'
      await s.fs.write('proj/.claude/agents/nadia.md', own)
      const r = await s.run('bash', [join(dir, 'scripts', 'claude-agents.sh')], { cwd: dir, env })
      expect(await readFile(join(dir, '.claude', 'agents', 'nadia.md'), 'utf8'), r.output).toBe(own)
      expect(r.output).toMatch(/nadia\.md.*not generated/)

      // A file this script generated earlier is still its own to replace.
      await s.fs.write(
        'proj/.claude/agents/nadia.md',
        '---\nname: nadia\nmodel: opus\n---\n<!-- generated by scripts/claude-agents.sh from AGENT_ROSTER.md -->\n',
      )
      await s.run('bash', [join(dir, 'scripts', 'claude-agents.sh')], { cwd: dir, env })
      expect(await readFile(join(dir, '.claude', 'agents', 'nadia.md'), 'utf8')).toMatch(/model: sonnet/)
    })
  })

  it('#4 a subagent feed line reads [Name - model it ran on - effort]', async () => {
    await scenario('rm-4', async (s) => {
      const { dir, env } = await project(s)
      await s.fs.copyIn(join(SUBJECT, 'scripts', 'log-activity.sh'), 'proj/scripts/log-activity.sh')
      for (const f of await readdir(join(SUBJECT, 'scripts', 'lib'))) {
        if (f.endsWith('.sh')) await s.fs.copyIn(join(SUBJECT, 'scripts', 'lib', f), `proj/scripts/lib/${f}`)
      }
      const sub = 'proj/sess/subagents/agent-feed01'
      await s.fs.write(`${sub}.meta.json`, JSON.stringify({ agentType: 'general-purpose', description: 'Nadia checks it' }))
      await s.fs.write(`${sub}.jsonl`, JSON.stringify({ type: 'assistant', message: { model: 'claude-ran-7' } }) + '\n')
      const log = join(await s.fs.mkdirp('proj/logs'), 'feed.log')
      const payload = JSON.stringify({
        hook_event_name: 'SubagentStop',
        agent_id: 'feed01',
        agent_type: 'general-purpose',
        transcript_path: join(dir, 'sess.jsonl'),
        agent_transcript_path: join(dir, `${sub.slice('proj/'.length)}.jsonl`),
      })
      const r = await s.run(
        'sh',
        ['-c', `printf '%s' "$1" | sh "${join(dir, 'scripts', 'log-activity.sh')}"`, 'x', payload],
        { cwd: dir, env: { ...env, AGENT_FEED_LOG: log } },
      )
      expect(r.code, r.output).toBe(0)
      expect(await readFile(log, 'utf8')).toContain('[Nadia - claude-ran-7 - medium] ← finished')
    })
  })
})
