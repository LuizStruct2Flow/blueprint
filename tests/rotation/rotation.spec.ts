import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const ROTATION_URL = pathToFileURL(join(process.cwd(), '..', 'scripts', 'rotation.mts')).href

async function subject(): Promise<any> {
  return import(ROTATION_URL)
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
})
