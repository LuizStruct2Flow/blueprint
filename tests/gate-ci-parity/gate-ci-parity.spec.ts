/**
 * TASK-078 — the local gate / CI backstop contract.
 *
 * Git does not record whether a local hook ran. The useful property is therefore
 * narrower and observable: every local stage that the repository relies on as a
 * bypass backstop has a real CI counterpart, and every CI job in that contract
 * gates the `released` branch. Unknown local stages fail closed until somebody
 * either gives them a counterpart or records them as an explicit residual.
 *
 * This is deliberately directional. CI may be stricter than the local gate — it
 * currently adds Semgrep's p/javascript and p/typescript packs — but it may not
 * omit a pack the local SAST stage runs. That preserves the stronger CI scan
 * without pretending the two commands are byte-identical.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDocument } from 'yaml'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../harness/index.js'

interface GateFiles {
  readonly hook: string
  readonly projectHook: string
  readonly bridge: string
  readonly workflow: string
}

interface ParityReport {
  readonly stages: readonly string[]
  readonly covered: readonly string[]
  readonly residual: readonly string[]
  readonly dormant: readonly string[]
  readonly problems: readonly string[]
}

interface Counterpart {
  readonly stage: RegExp
  readonly job: string
  readonly evidence: readonly string[]
}

const COUNTERPARTS: readonly Counterpart[] = [
  { stage: /^secret scan · gitleaks$/, job: 'secret-scan', evidence: ['gitleaks/gitleaks-action'] },
  { stage: /^SAST · semgrep /, job: 'sast', evidence: ['semgrep scan', 'scripts/semgrep-verdict.sh'] },
  { stage: /^SCA · osv-scanner$/, job: 'sca', evidence: ['osv-scanner scan source'] },
  { stage: /^shellcheck · TASK-033$/, job: 'ts-tests', evidence: ['sh_lint .'] },
  { stage: /^shell-inventory · TASK-067$/, job: 'ts-tests', evidence: ['ts_shell_inventory .'] },
  { stage: /^typecheck · TASK-031$/, job: 'ts-tests', evidence: ['ts_typecheck .'] },
  { stage: /^docs · TASK-053$/, job: 'ts-tests', evidence: ['ts_scrubbed npx vitest run'] },
  { stage: /^vitest · TASK-018$/, job: 'ts-tests', evidence: ['ts_scrubbed npx vitest run'] },
  { stage: /^§1b·1 every item has a backlog row$/, job: 'commit-subjects', evidence: ['dod_stage_rows'] },
  { stage: /^§2 every BUG has a regression test$/, job: 'commit-subjects', evidence: ['dod_stage_bugtests'] },
]

/**
 * Measured local-only stages. Keeping the list here is intentional: adding a
 * fourth residual is a reviewed policy change, not something a new stage can do
 * silently. The DoD names the same three beside the narrower CI claim.
 */
const RESIDUALS: readonly RegExp[] = [
  /^settings\.json host-path guard$/,
  /^§7G the live baton is well-formed$/,
  /^§D·F·H judgement — printed, not verified$/,
]

/** Dormant in this blueprint because it has no backend/, frontend/ or IaC tree. */
const DORMANT: readonly RegExp[] = [/^backend · /, /^frontend · /, /^IaC (?:synth|validate|lint) · /]

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** Comment-only lines cannot turn a described stage into a live one. */
function shellCode(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

export function localStageLabels(files: Pick<GateFiles, 'hook' | 'projectHook' | 'bridge'>): string[] {
  const found = new Set<string>()
  for (const text of [files.hook, files.projectHook, files.bridge]) {
    for (const match of shellCode(text).matchAll(/\bpipe_stage[ \t]+"([^"]+)"/g)) {
      if (match[1]) found.add(match[1])
    }
  }
  return [...found].sort()
}

function workflowJobs(text: string): { jobs: Record<string, unknown>; problems: string[] } {
  const parsed = parseDocument(text)
  if (parsed.errors.length > 0) {
    return {
      jobs: {},
      problems: parsed.errors.map((error) => `security workflow does not parse: ${error.message}`),
    }
  }
  const root = asRecord(parsed.toJS())
  const jobs = asRecord(root?.jobs)
  if (!jobs) return { jobs: {}, problems: ['security workflow has no jobs mapping'] }
  return { jobs, problems: [] }
}

function jobText(jobs: Record<string, unknown>, name: string): string {
  const job = jobs[name]
  return job === undefined ? '' : JSON.stringify(job)
}

function configs(text: string): Set<string> {
  const values = new Set<string>()
  for (const match of text.matchAll(/--config(?:=|\s+)["']?([^\s"'\\]+)/g)) {
    if (match[1]) values.add(match[1])
  }
  return values
}

export function inspectGateCiParity(files: GateFiles): ParityReport {
  const stages = localStageLabels(files)
  const parsed = workflowJobs(files.workflow)
  const problems = [...parsed.problems]
  const covered: string[] = []
  const residual: string[] = []
  const dormant: string[] = []

  for (const stage of stages) {
    const counterpart = COUNTERPARTS.find((candidate) => candidate.stage.test(stage))
    if (counterpart) {
      covered.push(stage)
      const text = jobText(parsed.jobs, counterpart.job)
      if (!text) {
        problems.push(`${stage}: CI job ${counterpart.job} is absent`)
        continue
      }
      for (const evidence of counterpart.evidence) {
        if (!text.includes(evidence)) {
          problems.push(`${stage}: CI job ${counterpart.job} does not run ${evidence}`)
        }
      }
      continue
    }
    if (RESIDUALS.some((pattern) => pattern.test(stage))) {
      residual.push(stage)
      continue
    }
    if (DORMANT.some((pattern) => pattern.test(stage))) {
      dormant.push(stage)
      continue
    }
    problems.push(`${stage}: local gate stage has no CI counterpart or declared residual`)
  }

  const localConfigs = configs(files.hook)
  const ciConfigs = configs(jobText(parsed.jobs, 'sast'))
  if (localConfigs.size === 0) problems.push('local SAST stage declares no Semgrep config')
  for (const config of localConfigs) {
    if (!ciConfigs.has(config)) problems.push(`local Semgrep config ${config} is absent from CI`)
  }

  const release = asRecord(parsed.jobs.release)
  const needs = Array.isArray(release?.needs) ? release.needs.filter((value): value is string => typeof value === 'string') : []
  const requiredJobs = new Set(COUNTERPARTS.map((counterpart) => counterpart.job))
  for (const job of requiredJobs) {
    if (!needs.includes(job)) problems.push(`release job does not need CI counterpart ${job}`)
  }

  return { stages, covered, residual, dormant, problems }
}

const fixture = (): GateFiles => ({
  hook: `
pipe_stage "secret scan · gitleaks" _st_gitleaks
pipe_stage "SAST · semgrep p/owasp-top-ten" _st_semgrep
semgrep scan --config=p/owasp-top-ten .
pipe_stage "SCA · osv-scanner" _st_osv
pipe_stage "settings.json host-path guard" _st_host_paths
`,
  projectHook: `
pipe_stage "§1b·1 every item has a backlog row" _st_rows
pipe_stage "§2 every BUG has a regression test" _st_bugs
pipe_stage "§7G the live baton is well-formed" _st_signal
pipe_stage "§D·F·H judgement — printed, not verified" _st_judgement
`,
  bridge: `
pipe_stage "shellcheck · TASK-033" sh_lint
pipe_stage "shell-inventory · TASK-067" ts_shell_inventory
pipe_stage "typecheck · TASK-031" ts_typecheck
pipe_stage "docs · TASK-053" run_docs
pipe_stage "vitest · TASK-018" run_specs
`,
  workflow: `
on: push
jobs:
  secret-scan:
    steps:
      - uses: gitleaks/gitleaks-action@v3
  sast:
    steps:
      - run: semgrep scan --config p/owasp-top-ten --config p/javascript --config p/typescript && scripts/semgrep-verdict.sh
  sca:
    steps:
      - run: osv-scanner scan source
  commit-subjects:
    steps:
      - run: dod_stage_rows && dod_stage_bugtests
  ts-tests:
    steps:
      - run: sh_lint . && ts_shell_inventory . node && ts_typecheck . && ts_scrubbed npx vitest run
  release:
    needs: [secret-scan, sast, sca, commit-subjects, ts-tests]
    steps:
      - run: git push origin released
`,
})

describe('TASK-078 — a bypass is contained by measured local/CI parity', () => {
  it('the healthy fixture has counterparts while keeping the three residuals visible', () => {
    const report = inspectGateCiParity(fixture())
    expect(report.problems).toEqual([])
    expect(report.covered).toHaveLength(10)
    expect(report.residual).toEqual([
      'settings.json host-path guard',
      '§7G the live baton is well-formed',
      '§D·F·H judgement — printed, not verified',
    ])
  })

  it('TASK-078: a planted local-only stage makes parity fail', () => {
    const files = fixture()
    const report = inspectGateCiParity({
      ...files,
      projectHook: `${files.projectHook}\npipe_stage "local-only · planted" run_it\n`,
    })
    expect(report.problems).toContain(
      'local-only · planted: local gate stage has no CI counterpart or declared residual',
    )
  })

  it('a local Semgrep pack absent from CI fails, while deeper CI-only packs are allowed', () => {
    const files = fixture()
    const missing = inspectGateCiParity({
      ...files,
      hook: files.hook.replace('--config=p/owasp-top-ten', '--config=p/local-policy'),
    })
    expect(missing.problems).toContain('local Semgrep config p/local-policy is absent from CI')

    const healthy = inspectGateCiParity(files)
    expect(healthy.problems).toEqual([])
  })

  it('TASK-078: every local gate stage relied on as a CI backstop has a CI counterpart', async () => {
    const files: GateFiles = {
      hook: await readFile(join(REPO_ROOT, '.githooks/pre-push'), 'utf8'),
      projectHook: await readFile(join(REPO_ROOT, '.githooks/pre-push-project'), 'utf8'),
      bridge: await readFile(join(REPO_ROOT, 'scripts/run-ts-suites.sh'), 'utf8'),
      workflow: await readFile(join(REPO_ROOT, '.github/workflows/security.yml'), 'utf8'),
    }
    const report = inspectGateCiParity(files)

    expect(report.problems, report.problems.join('\n')).toEqual([])
    expect(report.stages).toHaveLength(23)
    expect(report.covered).toHaveLength(10)
    expect(report.residual).toEqual([
      'settings.json host-path guard',
      '§7G the live baton is well-formed',
      '§D·F·H judgement — printed, not verified',
    ])
    expect(report.dormant).toHaveLength(10)
  })
})
