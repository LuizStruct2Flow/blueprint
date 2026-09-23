// scripts/contamination-push-scan.mts — TASK-079 (TASK-062-16), audit row C168.
//
// THE FINDING THIS CLOSES. C168 was written as if `.githooks/pre-push` had a
// contamination call site that needed extending. It has none: measured, there
// is no push-time contamination scan at all — `contamination_scan`
// (scripts/lib/contamination.sh) runs only from `scripts/blueprint`'s a2bp
// path. The ABSENCE of a push-time call site is the finding. The founder chose
// the CI-only route (docs/doing/PLAN-TASK-062.md §"Founder decisions" #3,
// 2026-09-22): "The existing checker scans the pushed diff, with no duplicated
// patterns and no port. Contamination on main is caught before released
// moves."
//
// REUSE, NOT A FORK. Every contamination pattern lives in
// scripts/lib/contamination.sh and nowhere else. This script extracts the
// ADDED lines of each file a push touches and hands them to the real
// `contamination_scan` — sourced, not copied. A line blocked here is blocked
// by the same regex a2bp would apply, including the `a2bp-allow:
// <justification>` suppression, which works unchanged because it sits on the
// added line itself.
//
// TWO THINGS THE CALLER MUST KNOW:
//
//   1. BLUEPRINT-ONLY BY CONSTRUCTION. The job runs the scan only where
//      `.blueprint-root` exists. Contamination PUBLISHES from the blueprint's
//      `released` branch; a derived project's push publishes nothing (a2bp's
//      own scan is the project's pre-publication stop), and scanning a
//      project's whole diff would block its own files for naming their own
//      project. In a checkout without `.blueprint-root` this script announces
//      the skip and exits 0 — an announced skip, never a silent green
//      (BUG-004's lesson).
//
//   2. THE RESIDUAL-NAME CLASS HAS NO OPERAND HERE. contamination_scan's third
//      BLOCK class flags a project's name that survived reverse-substitution —
//      meaningful on the a2bp path, where the name is the project's own. On a
//      push to the blueprint there is no reverse-substitution and no single
//      project name to scan for (the repo's own basename is "blueprint", a
//      word its docs use constantly — measured unusable as a pattern). So in
//      blueprint mode this script demotes exactly that class to a printed
//      notice. The host-path and foreign-dot-dir classes — the BUG-002 and
//      A-09 shapes — stand unfiltered. The filter keys on the checker's own
//      reason string; no pattern is duplicated to do it.
//
// WHAT CI-ONLY DOES NOT PROTECT. A contaminated push still LANDS on main; this
// scan detects it after the push, and the `release` job's needs-list is what
// keeps it from advancing `released` — the boundary every downstream project
// pulls from. Detection before publication, never prevention of the push.
//
// Usage:
//   node scripts/contamination-push-scan.mts --range BASE..AFTER [--repo DIR]
//   node scripts/contamination-push-scan.mts --before B --after A [--repo DIR]
//
// --before/--after carries the push-event semantics (new branch, rollback,
// rewritten history) so the workflow stays a thin caller and this script stays
// driveable exactly the way the job drives it. Exit 1 on any BLOCK finding.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CONTAMINATION_LIB = join(HERE, 'lib', 'contamination.sh')

/** The reason prefix contamination_scan prints for its residual-name class. */
const NAME_CLASS_REASON = 'project name survived reverse-substitution'

interface Finding {
  readonly file: string
  /** One raw `lineno|CLASS|reason|text` line from contamination_scan. */
  readonly line: string
}

interface Options {
  readonly range?: string
  readonly before?: string
  readonly after?: string
  readonly repo?: string
}

function usage(): never {
  console.error(
    'usage: node scripts/contamination-push-scan.mts --range A..B [--repo DIR]\n' +
      '       node scripts/contamination-push-scan.mts --before B --after A [--repo DIR]',
  )
  process.exit(2)
}

function parseArgs(argv: string[]): Options {
  const opts: { range?: string; before?: string; after?: string; repo?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const value = argv[i + 1]
    if (value === undefined) usage()
    switch (key) {
      case '--range':
        opts.range = value
        break
      case '--before':
        opts.before = value
        break
      case '--after':
        opts.after = value
        break
      case '--repo':
        opts.repo = value
        break
      default:
        usage()
    }
    i++
  }
  if (opts.range === undefined && (opts.before === undefined || opts.after === undefined)) usage()
  return opts
}

function git(repo: string, args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (err) {
    const e = err as { status?: number; stdout?: string }
    return { code: e.status ?? 127, out: typeof e.stdout === 'string' ? e.stdout : '' }
  }
}

/** Push-event range semantics, mirroring the commit-subjects job's step. */
function resolveRange(repo: string, opts: Options): string | null {
  if (opts.range !== undefined) return opts.range
  const before = opts.before ?? ''
  const after = opts.after ?? ''
  // All-zeros (or empty) BEFORE means a new branch — the shell original wrote
  // this as the glob `*[!0]*`: "contains a character that is not 0".
  if (!/[^0]/.test(before)) {
    console.log('::warning::new branch push: checking the tip commit only (partial coverage)')
    return `${after}^!`
  }
  const afterInBefore = git(repo, ['merge-base', '--is-ancestor', after, before])
  if (afterInBefore.code === 0) {
    console.log('force push back to an earlier commit: nothing new to scan')
    return null
  }
  const beforeInAfter = git(repo, ['merge-base', '--is-ancestor', before, after])
  if (beforeInAfter.code !== 0) {
    console.log('::warning::force push rewrote history: checking the tip commit only (partial coverage)')
    return `${after}^!`
  }
  return `${before}..${after}`
}

/** Files the push added or modified (renames listed by their new path). */
function changedFiles(repo: string, range: string): string[] {
  const r = git(repo, ['diff', '--name-only', '-z', '--diff-filter=AMR', range])
  if (r.code !== 0) {
    console.error(`::error::git diff --name-only ${range} failed — refusing to scan nothing and call it clean`)
    process.exit(1)
  }
  // With -z a rename emits old\0new. Both entries are harmless to scan: the
  // old path's diff has no added lines, the new path's carries the content.
  return r.out.split('\0').filter((e) => e.length > 0)
}

/** The lines a push ADDED to one file — what the checker judges. */
function addedLines(repo: string, range: string, file: string): string[] {
  const r = git(repo, ['diff', '--unified=0', '--no-color', range, '--', file])
  if (r.code !== 0) {
    console.error(`::error::git diff ${range} -- ${file} failed — refusing to scan nothing and call it clean`)
    process.exit(1)
  }
  return r.out
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
}

/** Run the REAL contamination_scan over content, for logical path `file`. */
function scan(contentFile: string, projName: string, file: string): { code: number; out: string } {
  try {
    const out = execFileSync(
      'bash',
      ['-c', '. "$1" && contamination_scan "$2" "$3" "$4"', 'bash', CONTAMINATION_LIB, contentFile, projName, file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return { code: 0, out }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    const code = e.status ?? 127
    if (code !== 1) {
      // contamination_scan returns only 0 or 1. Anything else means the
      // checker did not run — fail closed rather than report a clean scan.
      console.error(
        `::error::contamination_scan did not run for ${file} (exit ${code}): ${e.stderr ?? ''}`,
      )
      process.exit(1)
    }
    return { code, out: typeof e.stdout === 'string' ? e.stdout : '' }
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  const repo =
    opts.repo ??
    (() => {
      const top = git('.', ['rev-parse', '--show-toplevel'])
      if (top.code !== 0) {
        console.error('::error::not inside a git repository and no --repo given')
        process.exit(1)
      }
      return top.out.trim()
    })()

  if (!existsSync(join(repo, '.blueprint-root'))) {
    console.log(
      '::notice::no .blueprint-root in this checkout — this is a derived project, where a push ' +
        'publishes nothing (a2bp scans at filing time). The contamination push scan runs on the ' +
        "blueprint's own pushes, where `released` is the boundary downstream projects pull from. SKIP.",
    )
    return
  }

  const range = resolveRange(repo, opts)
  if (range === null) return

  // In the blueprint checkout the repo's own name is a word its docs use
  // constantly, and there is no reverse-substitution for a residual to
  // survive — the name class has no operand here (see the header). The host
  // path, foreign dot-dir and email classes still run unfiltered.
  const projName = basename(repo)
  const tmp = mkdtempSync(join(tmpdir(), 'contamination-push-scan-'))
  try {
    const blocked: Finding[] = []
    const notices: Finding[] = []
    const demoted: Finding[] = []
    for (const file of changedFiles(repo, range)) {
      const added = addedLines(repo, range, file)
      if (added.length === 0) continue
      const contentFile = join(tmp, 'added-lines')
      writeFileSync(contentFile, `${added.join('\n')}\n`)
      const r = scan(contentFile, projName, file)
      for (const line of r.out.split('\n')) {
        if (line.trim() === '') continue
        const fields = line.split('|')
        const finding: Finding = { file, line }
        if (fields[2]?.startsWith(NAME_CLASS_REASON)) {
          demoted.push(finding)
        } else if (fields[1] === 'BLOCK') {
          blocked.push(finding)
        } else {
          notices.push(finding)
        }
      }
    }
    for (const f of notices) console.log(`${f.file}: ${f.line}`)
    for (const f of demoted) {
      console.log(`${f.file}: ${f.line}  [demoted: the residual-name class has no operand on a blueprint push]`)
    }
    for (const f of blocked) console.log(`::error::${f.file}: ${f.line}`)
    if (blocked.length > 0) {
      console.log(
        `contamination-push-scan: ${blocked.length} BLOCK finding(s) in ${range}. ` +
          'Move project-specific content out of the managed file, or mark a known-benign line ' +
          '`a2bp-allow: <why it is safe>` — the same override a2bp honours.',
      )
      process.exit(1)
    }
    console.log(`contamination-push-scan: no BLOCK findings in ${range}. PASS.`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main()
