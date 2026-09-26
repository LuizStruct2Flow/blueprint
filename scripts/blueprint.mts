// scripts/blueprint.mts — TASK-081 whole-file port of scripts/blueprint (the
// struct2flow sync CLI), grown one slice at a time on branch task081-port.
// docs/doing/PLAN-TASK-081-blueprint-port.md is the plan; CLAUDE.md
// "Shell to TypeScript, organically" is the migration rule this follows.
//
// scripts/blueprint (the shell CLI) is UNTOUCHED until slice 5 squashes this
// branch into the port commit that turns it into the two-line shim — every
// suite on this branch still runs the shell CLI, and this file is not wired
// to anything yet. Differential rows in tests/blueprint-port compare the two
// directly, subcommand family by subcommand family, as each slice lands.
//
// SLICE 1 (this commit) — the skeleton: dispatch, `help`, `files`, colours,
// `die`, `run()` with the errexit-context rule, `unchecked`/`capture`,
// command-not-found 127/126 mapping, the shell-lib bridge, logical `PWD`, and
// the general signal machinery (record, defer to a child's exit, `shield`,
// the interruptible-wait `freeze`, and serialisation of repeated signals).
// `drift`, `pull`, `a2bp` and `prs` are placeholders here — each later slice
// replaces one placeholder with its port; none of this file's existing
// exports change shape to do it.
//
// THE PLACEHOLDER HOLE (plan §9 D, decided: Option 1). `bp_should_substitute`
// (scripts/lib/placeholders.sh) exempts `*scripts/blueprint` from project-name
// substitution, and that pattern does not match this file's name — so a pull
// or drift comparison substitutes scripts/blueprint.mts like any ordinary
// managed file. The fix adopted is that THIS FILE NEVER SPELLS THE TOKEN, in
// code or comment, so substituting a file with no token is the identity and
// the missing exemption does no harm. Anywhere the shell said the literal
// token, this file says "the project-name placeholder" instead.
// tests/blueprint-port pins this with a grep case.

import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs'
import { constants as osConstants } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AsyncLocalStorage } from 'node:async_hooks'

// --- help text ---------------------------------------------------------
//
// Ported from the shell's header comment (scripts/blueprint:2-40) verbatim,
// stripped of its `#` comment leaders exactly as cmd_help's own
// `sed 's/^# //; s/^#//'` would. A CONSTANT, not read from `$0` — the shim is
// two lines and carries none of this text (plan §2 rule 6).
const HELP_LINES: readonly string[] = [
  '',
  'blueprint — sync CLI for struct2flow projects.',
  '',
  'Subcommands:',
  '  blueprint drift             Show which blueprint-managed files in this project',
  "                              have drifted from the blueprint HEAD, and what's",
  '                              changed in the blueprint since this project was',
  '                              last synced.',
  '  blueprint pull [FILE...]    Pull blueprint-managed files forward into this',
  '                              project. Interactive per file unless --yes.',
  "                              With no FILE, pulls every file that's drifted.",
  '  blueprint a2bp FILE [...]   Apply-to-blueprint: file a REQUEST that this',
  "                              project's version of FILE(s) be adopted upstream",
  '                              — a branch plus a pull request against the',
  "                              blueprint's remote. It writes into no working",
  '                              tree and cannot land anything. The blueprint',
  '                              owner implements it: merging as-is, adapting, or',
  '                              rewriting. FILE may be one the blueprint does not',
  '                              ship, or a new one; the request says so. Add',
  '                              --dry-run to see the diff without filing.',
  '  blueprint prs               List open a2bp requests, plus pushed branches',
  '                              with no PR.',
  '  blueprint files             List the blueprint-managed files (source of truth).',
  '  blueprint help              This message.',
  '',
  '`drift` and `pull` read the blueprint by its ADDRESS — blueprint_remote and',
  'blueprint_branch in .blueprint-source (config_version 2). Every run refreshes a',
  'per-machine cache of that remote and compares against the tip it just fetched,',
  'so a report never describes whatever a local folder happens to hold',
  '(TASK-025). An unreachable remote exits 5, never with a report. To compare',
  'against a local checkout instead — offline, or to preview an unpushed',
  'blueprint change — export BLUEPRINT_ROOT=<checkout>, and the report says so.',
  '`a2bp` and `prs` talk to the same remote. All commands except `files` and',
  '`help` must run from inside a struct2flow project.',
  '',
  'The per-machine `blueprint` command runs the CLI of the project you stand in.',
  'The toolchain installer writes it, once per machine:',
  '  bash scripts/install-toolchain.sh',
  'It names no checkout, so moving the blueprint cannot break it (TASK-025).',
]
export const HELP_TEXT: string = `${HELP_LINES.join('\n')}\n`

// --- colours: [ -t 1 ] becomes isatty(1) --------------------------------
const isTTY = process.stdout.isTTY === true
function colour(code: string): string {
  return isTTY ? `\x1b[${code}m` : ''
}
export const C_RED = colour('31')
export const C_GREEN = colour('32')
export const C_YELLOW = colour('33')
export const C_BLUE = colour('34')
export const C_BOLD = colour('1')
export const C_DIM = colour('2')
export const C_RESET = colour('0')

// --- die ------------------------------------------------------------------
// `echo "${C_RED}error:${C_RESET} $*" >&2; exit 1`, verbatim.
export function die(message: string): never {
  process.stderr.write(`${C_RED}error:${C_RESET} ${message}\n`)
  return process.exit(1)
}

// --- TEMPLATE_FILES, verbatim from scripts/blueprint:104-124 ---------------
export const TEMPLATE_FILES: readonly string[] = [
  'project_config_overview.md',
  'project_config_paths.md',
  'project_config_dod.md',
  'project_config_security.md',
  'project_config_infra.md',
  'sonar-project.properties',
  'docs/doing/HANDOVER.md',
  'docs/backlog/BACKLOG.md',
  'docs/backlog/BUGS.md',
  'AGENT_ROSTER.md',
  'README.md',
  '.gitignore',
  '.gitattributes',
]

// --- logical PWD and the CLI's own directory (plan §2 rule 6) --------------
//
// Bash's $PWD is a LOGICAL path — it survives a `cd` through a symlink
// unmangled, unlike `process.cwd()`, which Node always resolves physically.
// The shim exports the bash process's own $PWD before exec'ing node, so this
// reads that value, never `process.cwd()`.
export function logicalPwd(): string {
  return process.env.PWD ?? process.cwd()
}

// The CLI's own directory, resolved against logicalPwd() — never
// `import.meta.dirname`, which realpaths. Mirrors
// `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd` under the shim's `exec`, where
// argv[1] is exactly the shim's own path (relative or absolute, as invoked).
export function cliDir(): string {
  const argv1 = process.argv[1] ?? join(logicalPwd(), 'scripts', 'blueprint.mts')
  const abs = argv1.startsWith('/') ? argv1 : resolve(logicalPwd(), argv1)
  return dirname(abs)
}

export function libDir(): string {
  return join(cliDir(), 'lib')
}

// cliName — process.argv[1] without its .mts suffix, matching bash's $0 for
// the shim (the shim always execs with argv[1] = "<its own dirname>/blueprint.mts").
function cliName(): string {
  const argv1 = process.argv[1] ?? 'scripts/blueprint'
  return argv1.endsWith('.mts') ? argv1.slice(0, -4) : argv1
}

// --- errexit context: `set -euo pipefail` becomes a call-context property --
//
// Plan §2 rule 4. Bash's `-e` is not a global switch in practice: it is
// ignored inside a condition (`if f`, `f && …`, `! f`) and, without
// `inherit_errexit` (never set here), inside every `$( )`. `run()` below
// rejects on a non-zero status only while this context reads "on"; a site
// that calls a PORTED FUNCTION the way bash calls it inside one of those
// contexts wraps the call in `unchecked()` or `capture()` instead of calling
// it bare.
interface ErrexitFrame {
  readonly enabled: boolean
}
const errexitStorage = new AsyncLocalStorage<ErrexitFrame>()

export function errexitEnabled(): boolean {
  return errexitStorage.getStore()?.enabled ?? true
}

// unchecked(fn) — run `fn` with errexit off for its whole dynamic extent
// (bash: `if fn`, `fn && …`, `! fn`). `fn`'s own `run()` calls see a non-zero
// status as data, never as a rejection.
export function unchecked<T>(fn: () => Promise<T> | T): Promise<T> {
  return errexitStorage.run({ enabled: false }, async () => fn())
}

function stripTrailingNewlines(s: string): string {
  return s.replace(/\n+$/, '')
}

// capture(fn) — the same errexit-off context as unchecked(), for a site that
// calls a function the way bash calls one inside `$( )`: the RESULT also has
// every trailing newline stripped, exactly as command substitution does.
export async function capture(fn: () => Promise<string> | string): Promise<string> {
  const out = await unchecked(fn)
  return stripTrailingNewlines(out)
}

// --- signal machinery (plan §2 rule 7, §3 P1/P2) ----------------------------
//
// Bash only checks a trap BETWEEN commands — a signal that arrives while a
// foreground child runs waits for that child. This is the general rule; P1's
// fetch-wait `freeze` is the one deliberate exception (the single
// interruptible `wait`), and P2's `shield` is a caller-declared critical
// section standing in for bash's subshell that ignores INT/TERM. All three
// share ONE state: the first recorded signal decides, a signal recorded
// while the handler is already running is dropped, and the handler runs
// exactly once before the process dies of that first signal.
export type Signal = 'SIGINT' | 'SIGTERM' | 'SIGHUP'
export type TerminatingHandler = () => Promise<void> | void
type KillFn = (pid: number, signal: NodeJS.Signals) => void

interface SignalState {
  pending: Signal | null
  handlerStarted: boolean
  handlerDone: boolean
  shielded: boolean
  childInFlight: boolean
  handler: TerminatingHandler | null
  kill: KillFn
}

const signalState: SignalState = {
  pending: null,
  handlerStarted: false,
  handlerDone: false,
  shielded: false,
  childInFlight: false,
  handler: null,
  kill: process.kill.bind(process),
}

// installSignals — wires the OS-level listeners. `kill` is a seam
// (scripts/lib/spawn-bounded.mts's own `killFn` pattern): production never
// passes it, so `process.kill` is exactly what always runs; a test injects a
// stub so exercising "the process dies of the signal" does not kill the test
// runner.
export function installSignals(handler: TerminatingHandler, kill: KillFn = process.kill.bind(process)): void {
  signalState.handler = handler
  signalState.kill = kill
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => recordSignal(sig))
  }
}

// recordSignal — the OS-level listener's ENTIRE job: remember the signal,
// never act on it here. Serialisation: the first one recorded decides: a
// later signal, while one is already pending, changes nothing.
export function recordSignal(sig: Signal): void {
  if (signalState.pending === null) signalState.pending = sig
  if (!signalState.childInFlight && !signalState.shielded) {
    // No child in flight and no shield open: this is bash's "between
    // commands" for an otherwise-idle flow, which for an idle event loop is
    // the next turn.
    setImmediate(() => {
      void maybeRunHandler()
    })
  }
}

// isTerminating — true from the instant a signal is recorded, whether or not
// the handler has actually started running yet. This is what `freeze` reads.
export function isTerminating(): boolean {
  return signalState.pending !== null
}

// maybeRunHandler — bash's "check the trap between commands". Called by
// run() after every child exits, by shield() when it closes, and scheduled
// directly by recordSignal() when neither applies. A signal recorded while
// shielded or while a child is in flight waits here for the matching call.
export async function maybeRunHandler(): Promise<void> {
  if (signalState.pending === null) return
  if (signalState.handlerStarted) return
  if (signalState.shielded || signalState.childInFlight) return
  signalState.handlerStarted = true
  const handler = signalState.handler
  if (handler) await handler()
  signalState.handlerDone = true
  dieOfSignal(signalState.pending)
}

// dieOfSignal — remove the listeners, then send the recorded signal to
// ourselves. POSIX delivers an unblocked self-signal before `kill()` returns,
// so nothing after this call runs UNDER THE REAL process.kill. A test's
// stub kill does not terminate the process, which is the point: it lets the
// assertions after this call run.
function dieOfSignal(sig: Signal): void {
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGHUP')
  signalState.kill(process.pid, sig)
}

// beginChild / endChild — run() calls these around every spawn. Exported
// too, so a unit test can simulate "a child is in flight" without actually
// spawning one.
export function beginChild(): void {
  signalState.childInFlight = true
}
export async function endChild(): Promise<void> {
  signalState.childInFlight = false
  await maybeRunHandler()
}

// shield — a critical section: bash's subshell that ignores INT/TERM for the
// P2 write (§3 P2). While `fn` runs, a recorded signal only waits; the
// moment it closes, a recorded signal takes the terminating path — the same
// check run() performs after a child exits.
export async function shield<T>(fn: () => Promise<T>): Promise<T> {
  signalState.shielded = true
  try {
    return await fn()
  } finally {
    signalState.shielded = false
    await maybeRunHandler()
  }
}

// freeze — the one interruptible wait (§3 P1's fetch). If a signal has been
// recorded by the time `p` settles, the result must never reach the caller:
// the terminating handler is about to run (or already has) and the process
// is about to die of that signal, so this returns a promise that stays
// pending forever instead of resolving to a value nobody should act on.
export async function freeze<T>(p: Promise<T>): Promise<T> {
  const result = await p
  if (isTerminating()) return new Promise<T>(() => {})
  return result
}

// Test-only reset. Never called from main().
export function _resetSignalStateForTests(): void {
  signalState.pending = null
  signalState.handlerStarted = false
  signalState.handlerDone = false
  signalState.shielded = false
  signalState.childInFlight = false
  signalState.handler = null
  signalState.kill = process.kill.bind(process)
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGHUP')
}

// --- run(): the one spawn helper (plan §2 rule 4) ---------------------------
export type StdioTarget = 'inherit' | 'ignore' | 'capture' | { readonly file: string }

export interface RunOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly stdin?: 'inherit' | 'ignore' | string
  readonly stdout?: StdioTarget
  readonly stderr?: StdioTarget
}

export interface RunResult {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
}

export class CommandFailedError extends Error {
  readonly result: RunResult
  constructor(cmd: string, result: RunResult) {
    super(`${cmd} exited ${result.status}`)
    this.result = result
  }
}

function signalNumber(sig: NodeJS.Signals): number {
  const table = osConstants.signals as Record<string, number>
  return table[sig] ?? 0
}

// Resolves one child's low-level stdio slot, plus the fd this call opened
// (if any) so run() can close it once the child is done with it — Node never
// closes a caller-supplied fd itself.
function openStdioTarget(target: StdioTarget | undefined, fallback: 'inherit' | 'ignore'): {
  readonly stdio: 'inherit' | 'ignore' | 'pipe' | number
  readonly openedFd?: number
} {
  const t = target ?? fallback
  if (t === 'capture') return { stdio: 'pipe' }
  if (typeof t === 'object') {
    const fd = openSync(t.file, 'w')
    return { stdio: fd, openedFd: fd }
  }
  return { stdio: t }
}

// run() — the one place `set -euo pipefail` becomes real. Rejects on a
// non-zero status only while errexit is on (rule 4); maps a missing or
// non-executable command to 127/126 the way bash does, message included,
// in every stderr mode (rule 4's "command not found"); and drives the
// signal machinery's "check between commands" at the one point that IS a
// command boundary — after this child exits.
export async function run(cmd: string, args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
  const stdinMode: 'inherit' | 'ignore' | 'pipe' =
    opts.stdin === undefined || opts.stdin === 'inherit' ? 'inherit' : opts.stdin === 'ignore' ? 'ignore' : 'pipe'
  const out = openStdioTarget(opts.stdout, 'inherit')
  const err = openStdioTarget(opts.stderr, 'inherit')

  beginChild()
  let result: RunResult
  try {
    result = await new Promise<RunResult>((settle, reject) => {
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(cmd, args, {
          cwd: opts.cwd,
          env: opts.env ?? process.env,
          stdio: [stdinMode, out.stdio, err.stdio],
        })
      } catch (spawnErr) {
        reject(spawnErr)
        return
      }

      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      if (typeof opts.stdin === 'string') {
        child.stdin?.end(opts.stdin)
      }

      child.once('error', (spawnErr: NodeJS.ErrnoException) => {
        // Command-not-found / not-executable, in EVERY stderr mode (rule 4):
        // bash reports these through the redirection the failing command
        // itself carried, so 'ignore' prints nothing here either, exactly
        // as `2>/dev/null` would.
        const status = spawnErr.code === 'ENOENT' ? 127 : spawnErr.code === 'EACCES' ? 126 : 1
        if (status === 127 || status === 126) {
          const reason = status === 127 ? 'command not found' : 'Permission denied'
          const message = `${cliName()}: ${cmd}: ${reason}\n`
          if (err.stdio === 'pipe') stderr += message
          else if (err.stdio !== 'ignore') process.stderr.write(message)
        }
        settle({ status, stdout, stderr })
      })

      child.once('close', (code, signal) => {
        const status = signal !== null ? 128 + signalNumber(signal) : code ?? 1
        settle({ status, stdout, stderr })
      })
    })
  } finally {
    if (out.openedFd !== undefined) closeSync(out.openedFd)
    if (err.openedFd !== undefined) closeSync(err.openedFd)
    await endChild()
  }

  if (errexitEnabled() && result.status !== 0) {
    throw new CommandFailedError(cmd, result)
  }
  return result
}

// --- the shell-lib bridge (plan §4) -----------------------------------------
//
// Every request/staleness/gate lib stays shell — each has a still-shell
// caller. `bashLib` is the one crossing: `bash -c '. "$1"; <snippet>' _ LIB
// ARGS…`, bash (not sh) because those libs use arrays. Stdout is captured
// (like `$( )`, trailing newlines stripped); stderr is INHERITED unless the
// caller overrides it — this bridge never swallows a lib's own diagnostics.
export async function bashLib(
  libPath: string,
  snippet: string,
  args: readonly string[] = [],
  opts: Omit<RunOptions, 'stdout' | 'stdin'> = {},
): Promise<{ readonly stdout: string; readonly status: number }> {
  const r = await run('bash', ['-c', `. "$1"; ${snippet}`, '_', libPath, ...args], {
    ...opts,
    stdout: 'capture',
    stderr: opts.stderr ?? 'inherit',
  })
  return { stdout: stripTrailingNewlines(r.stdout), status: r.status }
}

async function mktemp(): Promise<string> {
  const r = await run('mktemp', [], { stdout: 'capture', stderr: 'ignore' })
  return stripTrailingNewlines(r.stdout)
}

// --- bp_managed_files / cmd_files (scripts/blueprint:1066-1132) ------------
//
// Slice 1 covers only the two paths that need no network: standing in the
// blueprint itself (no .blueprint-source at the CLI's own root — the else
// branch below), and the BLUEPRINT_ROOT override of that same root. The
// third row in the matrix, `files` in a registered derived project (which
// calls read_blueprint_source, which fetches — P1), is slice 2's, once the
// fetch machinery lands.
function managedFilterKeeps(line: string): boolean {
  if (line === '' || line.endsWith('/') || line === '.blueprint-root') return false
  return !TEMPLATE_FILES.includes(line)
}

function managedDie(reason: string): never {
  process.stderr.write(`${C_RED}error:${C_RESET} the blueprint's managed set could not be derived: ${reason}\n`)
  process.stderr.write(`${C_DIM}  Refusing to continue. Carrying on would sync ZERO files while reporting${C_RESET}\n`)
  process.stderr.write(`${C_DIM}  success — a project would read '✓ everything matches' and be wrong.${C_RESET}\n`)
  return process.exit(1)
}

export async function bpManagedFiles(blueprintRoot: string): Promise<string[]> {
  let tarf: string
  let listf: string
  try {
    tarf = await mktemp()
    listf = await mktemp()
  } catch {
    // mktemp itself failed (errexit-on rejection from run()) — die loudly
    // rather than continue with an unusable path, mirroring the shell's
    // `tarf=$(mktemp) || die "..."`.
    return die('cannot create a temp file to list the blueprint archive')
  }
  try {
    await run('git', ['-C', blueprintRoot, 'archive', '--format=tar', 'HEAD'], {
      stdout: { file: tarf },
      stderr: 'ignore',
    })
  } catch {
    // git archive failed (non-zero, caught here instead of at the call site
    // so the scratch files can still be cleaned up before dying loudly).
    await unchecked(() => run('rm', ['-f', tarf, listf]))
    return managedDie(`'git archive HEAD' failed in ${blueprintRoot}`)
  }
  try {
    await run('tar', ['-tf', tarf], { stdout: { file: listf }, stderr: 'ignore' })
  } catch {
    // tar -t failed on the archive just written — clean up the scratch, then
    // die loudly rather than report an empty or partial managed set.
    await unchecked(() => run('rm', ['-f', tarf, listf]))
    return managedDie("the archive could not be listed ('tar -t' failed)")
  }
  const listing = readFileSync(listf, 'utf8')
  await unchecked(() => run('rm', ['-f', tarf, listf]))
  const managed = listing.split('\n').filter(managedFilterKeeps)
  if (managed.length === 0) {
    return managedDie("it ships no files at HEAD: every file is uncommitted, export-ignore'd or project-owned")
  }
  return managed
}

export async function cmdFiles(): Promise<void> {
  const root = resolve(cliDir(), '..')
  if (existsSync(join(root, '.blueprint-source'))) {
    return die(
      "blueprint files: reading a registered project (.blueprint-source) needs the fetch machinery, " +
        'ported in TASK-081 slice 2 — run: bash scripts/blueprint files',
    )
  }
  const blueprintRoot = process.env.BLUEPRINT_ROOT ?? root
  const managed = await bpManagedFiles(blueprintRoot)

  const lines: string[] = []
  lines.push(`${C_BOLD}Blueprint-managed files (synced by 'blueprint pull'):${C_RESET}`)
  for (const f of managed) lines.push(`  ${f}`)
  lines.push('')
  lines.push(`${C_BOLD}Template files (seeded once at bootstrap, then project-owned):${C_RESET}`)
  for (const f of TEMPLATE_FILES) lines.push(`  ${f}`)
  lines.push('')
  lines.push(`${C_DIM}Derived: what 'git archive HEAD' ships from the blueprint, minus the template files.${C_RESET}`)
  process.stdout.write(`${lines.join('\n')}\n`)
}

// --- dispatch ---------------------------------------------------------------
const NOT_YET_PORTED: Readonly<Record<string, number>> = {
  drift: 2,
  pull: 3,
  a2bp: 4,
  prs: 4,
}

export async function main(argv: readonly string[]): Promise<number> {
  const [subcmdRaw, ...rest] = argv
  const subcmd = subcmdRaw ?? 'help'
  void rest
  switch (subcmd) {
    case 'files':
    case 'list':
      await cmdFiles()
      return 0
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP_TEXT)
      return 0
    case 'push':
      return die(
        "'blueprint push' is gone: a2bp files a REQUEST against the blueprint remote, it does not push into " +
          "the blueprint. Use 'blueprint a2bp FILE...'",
      )
    default: {
      const slice = NOT_YET_PORTED[subcmd]
      if (slice !== undefined) {
        return die(
          `blueprint ${subcmd}: not yet ported to scripts/blueprint.mts (TASK-081 slice ${slice}) — ` +
            `run: bash scripts/blueprint ${subcmd}`,
        )
      }
      return die(`unknown subcommand: ${subcmd} (try 'blueprint help')`)
    }
  }
}

// --- entry point (scripts/shell-inventory-check.mts's own guard shape) -----
function safeRealpath(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    // Absent or unreadable: fall back to the raw path, the same degrade
    // shell-inventory-check.mts's own guard already relies on.
    return p
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  (safeRealpath(process.argv[1]) === safeRealpath(fileURLToPath(import.meta.url)) ||
    process.argv[1].endsWith('/scripts/blueprint.mts'))

if (isEntryPoint) {
  installSignals(() => {
    // Slice 1 has no cleanup of its own yet (P1's fetch scratch and P2's
    // shielded write both arrive in later slices) — dying of the recorded
    // signal, with nothing to clean up first, is already correct for every
    // subcommand this slice actually runs.
  })
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    })
}
