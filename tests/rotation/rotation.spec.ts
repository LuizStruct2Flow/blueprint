import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const ROTATION_URL = pathToFileURL(join(process.cwd(), '..', 'scripts', 'rotation.mts')).href

async function subject(): Promise<any> {
  return import(ROTATION_URL)
}

const FIXTURE_ROSTER = `## Members

| Role | Name | Backing agent | Model |
|---|---|---|---|
| Orchestrator | Eto | Claude Code | session-based |
| PO | Klaus | Claude Code | frontier-2:medium |
| Back-End-1 | Matthias | Claude Code | frontier-2:medium |
| Back-End-2 | Andreas | Codex | frontier-3:medium |
| Back-End-3 | Jonathan | Kimi | frontier-2:high |
| QA-1 | Vitali | Claude Code | frontier-2:medium |
| QA-2 | Jesko | Codex | frontier-3:medium |
| QA-3 | Vijay | Kimi | frontier-2:high |
| Back-End-4 (junior) | Nils | Ollama | local |
`

async function runCli(stateDir: string, roster: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const result = spawnSync(process.execPath, [new URL(ROTATION_URL).pathname, ...args], {
    env: { ...process.env, AGENT_STATE_HOME: stateDir, AGENT_ROSTER_FILE: roster },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr }
}

async function selectorFixture(): Promise<{ dir: string; roster: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'rotation-selector-'))
  const roster = join(dir, 'roster.md')
  await writeFile(roster, FIXTURE_ROSTER)
  return { dir, roster }
}

describe('TASK-065 rotation event log', () => {
  it('folds quota through cooldown, retry and a proven successful outcome', async () => {
    const { foldEvents } = await subject()
    const events = [
      { ev: 'outcome', at: '2026-09-24T10:00:00Z', persona: 'Andreas', provider: 'Codex', class: 'quota', evidence: 'limit', source: 'run@0', until: '2026-09-24T15:00:00Z' },
    ]

    expect(foldEvents(events, new Date('2026-09-24T12:00:00Z')).providers.Codex.state).toBe('out')
    expect(foldEvents(events, new Date('2026-09-24T16:00:00Z')).providers.Codex.state).toBe('unproven')

    events.push({ ev: 'retry', at: '2026-09-24T12:30:00Z', provider: 'Codex', reason: 'credits purchased' } as any)
    expect(foldEvents(events, new Date('2026-09-24T12:31:00Z')).providers.Codex.state).toBe('unproven')

    events.push({ ev: 'outcome', at: '2026-09-24T12:32:00Z', persona: 'Andreas', provider: 'Codex', class: 'ok', evidence: 'finished', source: 'run@50' } as any)
    expect(foldEvents(events, new Date('2026-09-24T12:33:00Z')).providers.Codex.state).toBe('in')
  })

  it.each([
    ['Kimi', "error: failed to run prompt: provider.auth_error: 403 You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends.", 'quota', 5],
    ['Codex', "⚠ You've hit your usage limit. Upgrade to Pro", 'quota', 5],
    ['Gemini', 'Error when talking to Gemini API Full report available at: /tmp/report.json TerminalQuotaError: You have exhausted your daily quota on this model.\n    at classifyGoogleError (file:///bundle.js:1:1)', 'quota', 24],
    ['Claude Code', "You've hit your session limit · resets 4:30pm", 'quota', 5],
    ['Codex', '⚠ {"type":"error","status":400,"error":{"message":"The gpt model is not supported when using Codex with a ChatGPT account."}}', 'persona', 0],
    ['Kimi', 'Kimi — dispatch refused: roster model did not resolve', 'persona', 0],
    ['Codex', '⚠ Selected model is at capacity. Please try a different model.', 'transient', 0],
  ])('classifies the observed %s diagnostic from its provider-owned line', async (provider, output, expected, cooldownHours) => {
    const { classifyOutput } = await subject()
    const result = classifyOutput(provider, `${output}\nprovider FAILED (exit 1)\n`, 1, new Date('2026-09-24T10:00:00Z'))
    expect(result.class).toBe(expected)
    if (cooldownHours > 0) {
      expect(result.until).toBe(new Date(Date.parse('2026-09-24T10:00:00Z') + cooldownHours * 3_600_000).toISOString())
    }
  })

  it('an exit-zero run stays ok even when the agent quotes the Kimi refusal', async () => {
    const { classifyOutput } = await subject()
    // Verbatim line from blueprint kimi-runs.log around :3818; the surrounding
    // dispatch succeeded, so text alone is not a refusal.
    const quoted = "error: failed to run prompt: provider.auth_error: 403 You've reached your 5-hour usage limit"
    expect(classifyOutput('Kimi', `${quoted}\nkimi finished\n`, 0, new Date()).class).toBe('ok')
  })

  it.each([
    ['Gemini', 'TerminalQuotaError: You have exhausted your daily quota on this model.'],
    ['Gemini', '    TerminalQuotaError: You have exhausted your daily quota on this model.'],
    ['Gemini', 'agent quoted TerminalQuotaError: You have exhausted your daily quota on this model.'],
    ['Gemini', 'Error when talking to Gemini API Full report available at: /tmp/report.json TerminalQuotaError: You have exhausted your daily quota on this model.'],
    ['Kimi', "    error: failed to run prompt: provider.auth_error: 403 You've reached your 5-hour usage limit"],
    ['Codex', "    ⚠ You've hit your usage limit"],
  ])('does not trust quoted or incomplete %s quota prose in a failed run', async (provider, line) => {
    const { classifyOutput } = await subject()
    expect(classifyOutput(provider, `${line}\nprovider FAILED (exit 1)\n`, 1, new Date()).class).toBe('unknown')
  })

  it('records an unknown failed slice without taking its provider out', async () => {
    const { classifyOutput, foldEvents } = await subject()
    const result = classifyOutput('Codex', 'network broke\ncodex exec FAILED (exit 1)\n', 1, new Date())
    expect(result.class).toBe('unknown')
    expect(foldEvents([{ ev: 'outcome', at: new Date().toISOString(), persona: 'Andreas', provider: 'Codex', evidence: result.evidence, source: 'run@0', class: result.class }], new Date()).providers.Codex).toBeUndefined()
  })

  it('keeps a persona refusal out until retry and then success', async () => {
    const { foldEvents } = await subject()
    const refused = { ev: 'outcome', at: '2026-09-24T10:00:00Z', persona: 'Andreas', provider: 'Codex', class: 'persona', evidence: 'model refused', source: 'run@0' }
    const retried = { ev: 'retry', at: '2026-09-24T11:00:00Z', persona: 'Andreas', reason: 'roster fixed' }
    const ok = { ev: 'outcome', at: '2026-09-24T11:01:00Z', persona: 'Andreas', provider: 'Codex', class: 'ok', evidence: 'finished', source: 'run@20' }

    expect(foldEvents([refused], new Date()).personas.Andreas.state).toBe('out')
    expect(foldEvents([refused, retried], new Date()).personas.Andreas.state).toBe('unproven')
    expect(foldEvents([refused, retried, ok], new Date()).personas.Andreas.state).toBe('in')
  })

  it('ignores a torn final record and reports a malformed complete record', async () => {
    const { readEvents } = await subject()
    const dir = await mkdtemp(join(tmpdir(), 'rotation-read-'))
    const log = join(dir, 'rotation.log')
    await writeFile(log, '{"ev":"retry","provider":"Codex","reason":"x"}\nnot-json\n{"ev":"retry"')
    const errors: string[] = []
    const events = readEvents(log, (line: string) => errors.push(line))

    expect(events).toHaveLength(1)
    expect(errors).toEqual([expect.stringContaining('line 2')])
  })

  it('appends twenty concurrent records as twenty intact JSON lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rotation-append-'))
    const output = join(dir, 'output.log')
    await writeFile(output, '[2026-09-24T10:00:00Z] provider finished\n')
    const script = new URL(ROTATION_URL)
    await Promise.all(Array.from({ length: 20 }, (_, i) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [script.pathname, 'record', `Persona-${i}`, '--output', output, '--exit', '0'], {
        env: { ...process.env, AGENT_STATE_HOME: dir, AGENT_PROVIDER: `Provider-${i}` },
        stdio: 'ignore',
      })
      child.on('error', reject)
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`record exited ${code}`)))
    })))

    const lines = (await readFile(join(dir, 'rotation.log'), 'utf8')).trimEnd().split('\n')
    expect(lines).toHaveLength(20)
    expect(lines.map((line) => JSON.parse(line).persona).sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `Persona-${i}`).sort(),
    )
  })

  it('rotates a family in roster order, wraps, and is idempotent for one item', async () => {
    const { dir, roster } = await selectorFixture()
    const first = await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-1'])
    const same = await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-1'])
    const second = await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-2'])
    const third = await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-3'])
    const wrapped = await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-4'])
    expect(first.code, first.stderr).toBe(0)
    const events = (await readFile(join(dir, 'rotation.log'), 'utf8')).trim().split('\n')
    expect(events).toHaveLength(4)
    expect([first.stdout, same.stdout, second.stdout, third.stdout, wrapped.stdout]).toEqual([
      'Matthias\tClaude Code\tBack-End\n',
      'Matthias\tClaude Code\tBack-End\n',
      'Andreas\tCodex\tBack-End\n',
      'Jonathan\tKimi\tBack-End\n',
      'Matthias\tClaude Code\tBack-End\n',
    ])
  })

  it('keeps an item on its provider across families and excludes that provider from review', async () => {
    const { dir, roster } = await selectorFixture()
    await runCli(dir, roster, ['assign', 'Andreas', '--item', 'TASK-5', '--reason', 'founder chose Codex'])
    expect((await runCli(dir, roster, ['next', 'QA', '--item', 'TASK-5'])).stdout).toBe('Jesko\tCodex\tQA\n')
    expect((await runCli(dir, roster, ['review', 'QA', '--item', 'TASK-5'])).stdout).toBe('Vijay\tKimi\tQA\n')
  })

  it('skips an out provider with evidence, selects unproven as a probe, and records capability skips', async () => {
    const { dir, roster } = await selectorFixture()
    await writeFile(join(dir, 'rotation.log'),
      JSON.stringify({ ev: 'outcome', at: '2026-09-24T10:00:00Z', persona: 'Matthias', provider: 'Claude Code', class: 'quota', evidence: 'session limit', source: 'claude@0', until: '2099-01-01T00:00:00Z' }) + '\n' +
      JSON.stringify({ ev: 'retry', at: '2026-09-24T10:01:00Z', provider: 'Codex', reason: 'credits purchased' }) + '\n',
    )
    const result = await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-6', '--skip', 'Jonathan=cannot verify fixture'])
    expect(result.stdout).toBe('Andreas\tCodex\tBack-End\n')
    expect(result.stderr).toContain('session limit')
    expect(result.stderr).toContain('dispatch is the probe')
    expect(await readFile(join(dir, 'rotation.log'), 'utf8')).toContain('cannot verify fixture')
  })

  it('never spills into another family when nobody in the requested family is eligible', async () => {
    const { dir, roster } = await selectorFixture()
    const refused = [['Matthias', 'Claude Code'], ['Andreas', 'Codex'], ['Jonathan', 'Kimi']]
    await writeFile(join(dir, 'rotation.log'), refused.map(([persona, provider]) => JSON.stringify({ ev: 'outcome', at: '2026-09-24T10:00:00Z', persona, provider, class: 'persona', evidence: `${persona} out`, source: 'fixture@0' })).join('\n') + '\n')
    const result = await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-7'])
    expect(result.code).toBe(3)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Back-End')
    expect(result.stderr).not.toContain('Klaus')
  })

  it('reports single-provider coverage and refuses same-provider four-eyes', async () => {
    const { dir, roster } = await selectorFixture()
    await runCli(dir, roster, ['assign', 'Klaus', '--item', 'TASK-8', '--reason', 'PO work'])
    const coverage = await runCli(dir, roster, ['coverage', 'PO'])
    expect(coverage.stdout).toContain('no rotation')
    const review = await runCli(dir, roster, ['review', 'PO', '--item', 'TASK-8'])
    expect(review.code).toBe(4)
    expect(review.stderr).toContain('waiver is the founder\'s')
  })

  it('reassigns an item whose provider went out and keeps juniors in their literal family', async () => {
    const { dir, roster } = await selectorFixture()
    await runCli(dir, roster, ['assign', 'Andreas', '--item', 'TASK-9', '--reason', 'seed'])
    await writeFile(join(dir, 'rotation.log'), (await readFile(join(dir, 'rotation.log'), 'utf8')) + JSON.stringify({ ev: 'outcome', at: '2026-09-24T10:00:00Z', persona: 'Andreas', provider: 'Codex', class: 'quota', evidence: 'usage limit', source: 'run@0', until: '2099-01-01T00:00:00Z' }) + '\n')
    expect((await runCli(dir, roster, ['next', 'Back-End', '--item', 'TASK-9'])).stdout).toBe('Jonathan\tKimi\tBack-End\n')
    expect((await runCli(dir, roster, ['next', 'Back-End-4 (junior)', '--item', 'TASK-10'])).stdout).toBe('Nils\tOllama\tBack-End-4 (junior)\n')
  })

  it('pins every launcher run-log name to the watcher derivation', async () => {
    const root = join(process.cwd(), '..')
    const watcher = await readFile(join(root, 'scripts', 'signal-watch.mts'), 'utf8')
    expect(watcher).toContain("state.replace(/^OVER_TO_/, '').toLowerCase()}-runs.log")
    for (const provider of ['codex', 'kimi', 'gemini']) {
      const launcher = await readFile(join(root, 'scripts', `start-${provider}-signal-watch.sh`), 'utf8')
      expect(launcher).toContain(`RUN_LOG="$STATE_DIR/${provider}-runs.log"`)
    }
  })
})
