// TASK-065 — persistent provider rotation and dispatch outcome state.
// The JSONL journal is append-only: one O_APPEND write owns one complete event.

import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type Availability = 'in' | 'out' | 'unproven'
type OutcomeClass = 'quota' | 'persona' | 'transient' | 'ok' | 'unknown'

interface OutcomeEvent {
  readonly ev: 'outcome'
  readonly at: string
  readonly persona: string
  readonly provider: string
  readonly class: OutcomeClass
  readonly evidence: string
  readonly source: string
  readonly until?: string
}

interface RetryEvent {
  readonly ev: 'retry'
  readonly at: string
  readonly provider?: string
  readonly persona?: string
  readonly reason: string
}

interface AssignEvent {
  readonly ev: 'assign'
  readonly at: string
  readonly item: string
  readonly family: string
  readonly persona: string
  readonly provider: string
  readonly how: 'rotation' | 'item' | 'review' | 'override' | 'reassign'
  readonly reason?: string
}

interface SkipEvent {
  readonly ev: 'skip'
  readonly at: string
  readonly item: string
  readonly persona: string
  readonly reason: string
}

export type RotationEvent = OutcomeEvent | RetryEvent | AssignEvent | SkipEvent

interface AvailabilityDetail {
  state: Availability
  since?: string
  reason?: string
  source?: string
  until?: string
}

export interface RotationState {
  providers: Record<string, AvailabilityDetail>
  personas: Record<string, AvailabilityDetail>
  familyPointers: Record<string, string>
  itemProviders: Record<string, string>
}

const CODE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const STATE_DIR_LIB = join(CODE_ROOT, 'scripts/lib/state-dir.sh')

function stateDir(): string {
  const result = spawnSync(
    'sh',
    ['-c', '. "$1"; BP_STATE_ROOT="$(bp_state_root)" || exit 9; agent_state_dir', 'sh', STATE_DIR_LIB],
    { encoding: 'utf8', env: { ...process.env, BP_CODE_ROOT: CODE_ROOT }, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  if (result.status !== 0) process.exit(9)
  return result.stdout.trim()
}

function rotationLog(): string {
  return join(stateDir(), 'rotation.log')
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function readEvents(path: string, report: (message: string) => void = (message) => process.stderr.write(`${message}\n`)): RotationEvent[] {
  if (!existsSync(path)) return []
  const content = readFileSync(path, 'utf8')
  const complete = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n').slice(0, -1)
  const events: RotationEvent[] = []
  complete.forEach((line, index) => {
    if (line === '') return
    try {
      events.push(JSON.parse(line) as RotationEvent)
    } catch {
      report(`rotation: malformed complete record at ${path} line ${index + 1}; skipped`)
    }
  })
  return events
}

export function appendEvent(path: string, event: RotationEvent): void {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' })
}

function detail(state: Availability, event: OutcomeEvent | RetryEvent): AvailabilityDetail {
  const result: AvailabilityDetail = { state, since: event.at }
  if ('evidence' in event) {
    result.reason = event.evidence
    result.source = event.source
    if (event.until !== undefined) result.until = event.until
  } else {
    result.reason = event.reason
  }
  return result
}

export function foldEvents(events: readonly RotationEvent[], now: Date = new Date()): RotationState {
  const state: RotationState = { providers: {}, personas: {}, familyPointers: {}, itemProviders: {} }
  for (const event of events) {
    if (event.ev === 'outcome') {
      if (event.class === 'quota') state.providers[event.provider] = detail('out', event)
      if (event.class === 'persona') state.personas[event.persona] = detail('out', event)
      if (event.class === 'ok') {
        state.providers[event.provider] = detail('in', event)
        state.personas[event.persona] = detail('in', event)
      }
    } else if (event.ev === 'retry') {
      if (event.provider !== undefined) state.providers[event.provider] = detail('unproven', event)
      if (event.persona !== undefined) state.personas[event.persona] = detail('unproven', event)
    } else if (event.ev === 'assign') {
      state.familyPointers[event.family] = event.provider
      if (event.how !== 'review') state.itemProviders[event.item] = event.provider
    }
  }
  for (const value of Object.values(state.providers)) {
    if (value.state === 'out' && value.until !== undefined && Date.parse(value.until) <= now.getTime()) {
      value.state = 'unproven'
    }
  }
  return state
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

function required(value: string | undefined, message: string): string {
  if (value !== undefined && value !== '') return value
  process.stderr.write(`rotation: ${message}\n`)
  process.exit(2)
}

function record(args: readonly string[]): void {
  const persona = required(args[0], 'record needs a persona')
  const output = required(option(args, '--output'), 'record needs --output <file>')
  const exitText = required(option(args, '--exit'), 'record needs --exit <n>')
  const exitCode = Number(exitText)
  if (!Number.isInteger(exitCode)) required(undefined, '--exit must be an integer')
  const provider = process.env.AGENT_PROVIDER || persona
  const content = readFileSync(output, 'utf8')
  const lines = content.trimEnd().split('\n')
  const classification: OutcomeClass = exitCode === 0 ? 'ok' : 'unknown'
  const evidence = lines.at(-1) ?? ''
  appendEvent(rotationLog(), {
    ev: 'outcome', at: isoNow(), persona, provider, class: classification,
    evidence, source: `${output}@0`,
  })
  process.stdout.write(`${classification}\n`)
}

function retry(args: readonly string[]): void {
  const target = required(args[0], 'retry needs a provider or persona')
  const reason = required(option(args, '--reason'), 'retry needs --reason <text>')
  const events = readEvents(rotationLog())
  const knownPersona = events.some((event) => event.ev === 'outcome' && event.persona === target)
  const base = { ev: 'retry' as const, at: isoNow(), reason }
  appendEvent(rotationLog(), knownPersona ? { ...base, persona: target } : { ...base, provider: target })
}

function main(args: readonly string[]): void {
  const command = args[0]
  if (command === 'record') record(args.slice(1))
  else if (command === 'retry') retry(args.slice(1))
  else {
    process.stderr.write('Usage: node scripts/rotation.mts <record|retry> ...\n')
    process.exit(2)
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
