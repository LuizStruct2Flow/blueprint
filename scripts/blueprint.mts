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
// SLICE 1 — the skeleton: dispatch, `help`, `files`, colours,
// `die`, `run()` with the errexit-context rule, `unchecked`/`capture`,
// command-not-found 127/126 mapping, the shell-lib bridge, logical `PWD`, and
// the general signal machinery (record, defer to a child's exit, `shield`,
// the interruptible-wait `freeze`, and serialisation of repeated signals).
//
// SLICE 2 (this commit) — the read path, `drift` complete: config
// (request-config.sh bridge), the P1 fetch (address-mode git, the cache, the
// BUG-120 gate), history, the staleness report (staleness.sh bridge), the
// managed set (slice 1's, reused), marker structure and the marker-aware
// merge (BUG-034/BUG-112), the P3 one-prospective-result and the P4 settings
// layer, `_bp_is_blueprint_itself` / `_bp_project_root` (state-dir.sh
// bridge) and gate arming (gate.sh bridge, stdout inherited so the bash
// lib's own echo lines are the bytes this process emits — no re-formatting
// seam to drift from them). `pull`, `a2bp` and `prs` remain placeholders.
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
  accessSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
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
// `echo "${C_RED}error:${C_RESET} $*" >&2; exit 1`, verbatim — plus, since
// SLICE 2, the cleanup bash's EXIT trap would have run first (`_bp_sync_
// cleanup`, defined below with the P1 fetch). `bpSyncCleanup` no-ops when
// nothing was ever fetched (every field it reads starts empty), so this is
// exactly as harmless on every pre-fetch die() call as bash's own EXIT trap
// firing on an exit before it had anything to clean up.
export async function die(message: string): Promise<never> {
  process.stderr.write(`${C_RED}error:${C_RESET} ${message}\n`)
  await bpSyncCleanup()
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

async function managedDie(reason: string): Promise<never> {
  process.stderr.write(`${C_RED}error:${C_RESET} the blueprint's managed set could not be derived: ${reason}\n`)
  process.stderr.write(`${C_DIM}  Refusing to continue. Carrying on would sync ZERO files while reporting${C_RESET}\n`)
  process.stderr.write(`${C_DIM}  success — a project would read '✓ everything matches' and be wrong.${C_RESET}\n`)
  await bpSyncCleanup()
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

function printFilesReport(managed: readonly string[]): void {
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

export async function cmdFiles(): Promise<void> {
  const root = resolve(cliDir(), '..')
  if (existsSync(join(root, '.blueprint-source'))) {
    // Same as the shell's `cd "$root" || die ...; read_blueprint_source` —
    // .blueprint-source and every relative path read_blueprint_source touches
    // are read relative to that root.
    process.chdir(root)
    const src = await readBlueprintSource()
    printFilesReport(src.managed)
    return
  }
  const blueprintRoot = process.env.BLUEPRINT_ROOT ?? root
  const managed = await bpManagedFiles(blueprintRoot)
  printFilesReport(managed)
}

// =============================================================================
// SLICE 2 — the read path. `drift` complete (plan §8 row 2).
// =============================================================================

// --- the git-transport env scrub (scripts/lib/request.sh's
// BP_REQUEST_TRANSPORT_UNSET, kept as DATA per plan §3 P1 "the same unset
// list, as data" — not bridged, because the fetch launch must be ONE external
// process (`env`, execing `sh`, execing the fetch) for `child.pid` to name the
// fetch itself, exactly as bash's `$!` must). Every git call on the ADDRESS
// path is scrubbed, not only the fetch: `drift` runs inside hooks, where an
// exported GIT_DIR would override `-C` (BUG-077).
const GIT_TRANSPORT_UNSET: readonly string[] = [
  '-u',
  'GIT_DIR',
  '-u',
  'GIT_WORK_TREE',
  '-u',
  'GIT_INDEX_FILE',
  '-u',
  'GIT_OBJECT_DIRECTORY',
  '-u',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  '-u',
  'GIT_CONFIG',
  '-u',
  'GIT_CONFIG_COUNT',
]

// --- run state (scripts/blueprint:669-670's BP_SYNC_* globals) --------------
// GLOBALS, never locals — matching the shell comment's own reasoning: the
// cleanup (bpSyncCleanup, below) is bash's EXIT trap, and it must see whatever
// the run built regardless of which function frame built it.
interface SyncGlobals {
  mode: 'address' | 'override' | ''
  scratch: string
  cache: string
  ref: string
  child: number | null
  childExit: Promise<{ readonly status: number }> | null
  go: string
  remote: string
  branch: string
  sha: string
  fetchedAt: string
  blueprintRoot: string
}
const SYNC: SyncGlobals = {
  mode: '',
  scratch: '',
  cache: '',
  ref: '',
  child: null,
  childExit: null,
  go: '',
  remote: '',
  branch: '',
  sha: '',
  fetchedAt: '',
  blueprintRoot: '',
}

// _bp_git — git against the blueprint side. Scrubbed on the address path,
// plain otherwise (the override path must work with no network libraries
// present at all — the recovery path, plan TASK-025 §5).
async function bpGit(args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
  if (SYNC.mode === 'address') {
    return run('env', [...GIT_TRANSPORT_UNSET, 'git', ...args], opts)
  }
  return run('git', args, opts)
}

function bpBlueprintPath(f: string): string {
  return `${SYNC.blueprintRoot}/${f}`
}

// --- _bp_sync_cleanup (scripts/blueprint:707-722) — BUG-120 -----------------
//
// This is bash's EXIT trap AND its INT/TERM handler in one: `die()` and
// `managedDie()` above call it before every exit (mirroring the trap firing
// on any exit reason), and it is installed as the real terminating handler
// at the entry point below, replacing slice 1's no-op — so a real signal
// during the fetch (or after) cleans up exactly where bash's trap would.
// No-ops completely when nothing was ever fetched (every field starts empty),
// which is what makes calling it unconditionally, from every exit path, safe.
//
// Part 1 (BUG-120) is synchronous with NO `await` between revoking the GO
// token and sending the TERM — a syscall does not fork, so nothing runs in
// that gap, same as bash's `: >` builtin. Part 2 is bash's `wait`. Part 3 is
// the synchronous tail (`update-ref -d`, `rm -rf`).
async function bpSyncCleanup(): Promise<void> {
  if (SYNC.go) {
    try {
      writeFileSync(SYNC.go, '')
    } catch {
      // Best-effort, matching the shell's `|| true` — a token file that is
      // already gone needs no truncating.
    }
  }
  const pid = SYNC.child
  const exitPromise = SYNC.childExit
  if (pid !== null) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already exited — nothing to signal, matching `kill ... 2>/dev/null || true`.
    }
  }
  if (exitPromise) {
    await exitPromise
  }
  if (SYNC.ref) {
    await unchecked(() =>
      bpGit(['-c', 'gc.auto=0', `--git-dir=${SYNC.cache}`, 'update-ref', '-d', SYNC.ref], {
        stdout: 'ignore',
        stderr: 'ignore',
      }),
    )
  }
  if (SYNC.scratch) {
    await unchecked(() => run('rm', ['-rf', SYNC.scratch], { stdout: 'ignore', stderr: 'ignore' }))
  }
  SYNC.child = null
  SYNC.childExit = null
  SYNC.ref = ''
  SYNC.scratch = ''
  SYNC.go = ''
}

// --- exit 5, "could not read the blueprint" (scripts/blueprint:775-792) ----
async function bpFetchFail(reason: string): Promise<never> {
  process.stderr.write(`${C_RED}error:${C_RESET} could not read the blueprint at ${SYNC.remote} (${SYNC.branch})\n`)
  process.stderr.write(`  ${reason}\n`)
  process.stderr.write('  Nothing was compared. This is NOT a clean drift report.\n')
  process.stderr.write('  Offline? Compare against a local checkout explicitly:\n')
  process.stderr.write('    BLUEPRINT_ROOT=<path to a blueprint checkout> blueprint drift\n')
  await bpSyncCleanup()
  return process.exit(5)
}

async function bpFetchDamaged(): Promise<never> {
  return bpFetchFail(`cache ${SYNC.cache} is damaged — remove it (rm -rf ${SYNC.cache}) and run again`)
}

// --- command -v, natively (plan §2 rule 6) ----------------------------------
function commandExists(cmd: string): boolean {
  const pathEnv = process.env.PATH ?? ''
  for (const dir of pathEnv.split(':')) {
    if (!dir) continue
    const candidate = join(dir, cmd)
    try {
      accessSync(candidate, fsConstants.X_OK)
      return true
    } catch {
      // Not in this PATH entry — keep searching.
    }
  }
  return false
}

function staleTimeoutCmd(): string {
  if (commandExists('timeout')) return 'timeout'
  if (commandExists('gtimeout')) return 'gtimeout'
  return ''
}

// --- bp_config_load bridge (scripts/lib/request-config.sh) -----------------
// The lib prints `BP_CFG_<KEY>=%q<value>` lines for `eval` by a shell caller.
// The snippet evals them itself, inside the bridge's bash, and re-emits the
// four values NUL-separated — so no %q-quoting has to be un-escaped on this
// side of the bridge, and the values that cross it are exactly what the shell
// CLI would have held in BP_CFG_*.
export interface BpConfig {
  readonly version: string
  readonly remote: string
  readonly branch: string
  readonly readBranch: string
}

export async function bpConfigLoad(file: string): Promise<BpConfig | null> {
  const lib = join(libDir(), 'request-config.sh')
  const snippet =
    'out=$(bp_config_load "$2") || exit 1; eval "$out"; ' +
    'printf "%s\\0%s\\0%s\\0%s\\0" "$BP_CFG_VERSION" "$BP_CFG_REMOTE" "$BP_CFG_BRANCH" "$BP_CFG_READ_BRANCH"'
  const r = await unchecked(() =>
    run('bash', ['-c', `. "$1"; ${snippet}`, '_', lib, file], { stdout: 'capture', stderr: 'inherit' }),
  )
  if (r.status !== 0) return null
  const parts = r.stdout.split('\0')
  return { version: parts[0] ?? '', remote: parts[1] ?? '', branch: parts[2] ?? '', readBranch: parts[3] ?? '' }
}

// --- P1: _bp_fetch_blueprint (scripts/blueprint:798-913) --------------------
const BP_FETCH_TIMEOUT = process.env.BP_FETCH_TIMEOUT ?? '30'

async function bpFetchBlueprint(): Promise<void> {
  const libdir = libDir()
  const needed = ['request.sh', 'request-config.sh', 'staleness.sh']
  const missing = needed.filter((l) => !existsSync(join(libdir, l)))
  if (missing.length > 0) {
    const missingStr = missing.map((m) => ` scripts/lib/${m}`).join('')
    process.stderr.write(
      `${C_RED}error:${C_RESET} reading the blueprint needs${missingStr}, which this project does not have.\n`,
    )
    process.stderr.write('  Fetch it once from a local blueprint checkout:\n')
    process.stderr.write(`    BLUEPRINT_ROOT=<path to a blueprint checkout> blueprint pull${missingStr}\n`)
    await bpSyncCleanup()
    process.exit(1)
  }

  const cfg = await bpConfigLoad('.blueprint-source')
  if (!cfg) {
    process.stderr.write('  Or compare against a local checkout: export BLUEPRINT_ROOT=<path to a blueprint checkout>\n')
    await bpSyncCleanup()
    process.exit(4)
  }
  SYNC.remote = cfg.remote
  SYNC.branch = cfg.readBranch

  const tcmd = staleTimeoutCmd()
  if (!tcmd) return bpFetchFail("no 'timeout' or 'gtimeout' on PATH, so the fetch could not be bounded")

  const tmpdir = process.env.TMPDIR ?? '/tmp'
  const scratchR = await unchecked(() =>
    run('mktemp', ['-d', `${tmpdir}/blueprint-sync.XXXXXXXX`], { stdout: 'capture', stderr: 'ignore' }),
  )
  if (scratchR.status !== 0) return bpFetchFail(`could not create a scratch directory under ${tmpdir}`)
  SYNC.scratch = stripTrailingNewlines(scratchR.stdout)

  const cacheRoot = join(process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? '', '.cache'), 'struct2flow')
  const keyR = await unchecked(() =>
    run('env', [...GIT_TRANSPORT_UNSET, 'git', 'hash-object', '--stdin'], {
      stdin: SYNC.remote,
      stdout: 'capture',
      stderr: 'ignore',
    }),
  )
  if (keyR.status !== 0) return bpFetchFail('could not derive a cache key for the remote address')
  SYNC.cache = `${cacheRoot}/blueprint-${stripTrailingNewlines(keyR.stdout)}.git`

  if (!existsSync(SYNC.cache)) {
    const mkdirR = await unchecked(() => run('mkdir', ['-p', cacheRoot], { stdout: 'ignore', stderr: 'ignore' }))
    if (mkdirR.status !== 0) return bpFetchFail(`could not create the cache directory ${cacheRoot}`)
    const tmpR = await unchecked(() =>
      run('mktemp', ['-d', `${cacheRoot}/.bp-cache-init.XXXXXXXX`], { stdout: 'capture', stderr: 'ignore' }),
    )
    if (tmpR.status !== 0) return bpFetchFail(`could not create the cache under ${cacheRoot}`)
    const initTmp = stripTrailingNewlines(tmpR.stdout)
    const initR = await unchecked(() =>
      run('env', [...GIT_TRANSPORT_UNSET, 'git', 'init', '-q', '--bare', initTmp], { stdout: 'ignore', stderr: 'ignore' }),
    )
    if (initR.status !== 0) {
      await unchecked(() => run('rm', ['-rf', initTmp], { stdout: 'ignore', stderr: 'ignore' }))
      return bpFetchFail(`could not initialise the cache under ${cacheRoot}`)
    }
    const mvR = await unchecked(() => run('mv', [initTmp, SYNC.cache], { stdout: 'ignore', stderr: 'ignore' }))
    if (mvR.status !== 0) await unchecked(() => run('rm', ['-rf', initTmp], { stdout: 'ignore', stderr: 'ignore' }))
  }
  // A lost race's temp, this run's or one a killed run left behind.
  await unchecked(() =>
    run('sh', ['-c', 'rm -rf "$1"/.bp-cache-init.*', '_', SYNC.cache], { stdout: 'ignore', stderr: 'ignore' }),
  )
  if (!existsSync(SYNC.cache)) return bpFetchFail(`the cache ${SYNC.cache} could not be created`)

  SYNC.ref = `refs/bp-run/${SYNC.scratch.split('/').pop()}`
  const errFile = `${SYNC.scratch}/fetch.err`
  SYNC.go = `${SYNC.scratch}/go`
  writeFileSync(SYNC.go, 'go\n')

  // ONE EXTERNAL PROCESS (env, execing sh, execing the fetch) — never a
  // function run in the background, whose `$!` would name a forked subshell
  // rather than the fetch (#20b). The gate ("[ -s "$2" ] || exit 1") is
  // BUG-120's fix: TERM has no default disposition to lose until AFTER the
  // first exec, so cleanup revokes the token before it signals.
  const shScript = 'exec 2>"$1"; [ -s "$2" ] || exit 1; shift 2; exec "$@"'
  const child = spawn(
    'env',
    [
      ...GIT_TRANSPORT_UNSET,
      'sh',
      '-c',
      shScript,
      'bp-refresh',
      errFile,
      SYNC.go,
      tcmd,
      BP_FETCH_TIMEOUT,
      'git',
      '-c',
      'gc.auto=0',
      '-c',
      'maintenance.auto=false',
      `--git-dir=${SYNC.cache}`,
      'fetch',
      '-q',
      '--no-tags',
      SYNC.remote,
      `+refs/heads/${SYNC.branch}:${SYNC.ref}`,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  )
  const pid = child.pid
  if (pid === undefined) return bpFetchFail('could not start the fetch')
  SYNC.child = pid
  // The exit promise is made HERE, at spawn, in the same synchronous step —
  // never a fresh `once(child, 'exit')` later, which would wait forever on a
  // child already reaped (plan §3 P1).
  const exitPromise = new Promise<{ status: number }>((resolveExit) => {
    child.once('exit', (code, signal) => {
      resolveExit({ status: signal !== null ? 128 + signalNumber(signal) : code ?? 1 })
    })
    child.once('error', () => resolveExit({ status: 127 }))
  })
  SYNC.childExit = exitPromise

  // The one interruptible wait (plan §2 rule 7's exception): `freeze` never
  // lets a killed fetch read as an ordinary failure once a signal is recorded.
  const result = await freeze(exitPromise)
  SYNC.child = null

  if (result.status !== 0) {
    let cause: string
    if (result.status === 124) {
      cause = `timed out after ${BP_FETCH_TIMEOUT}s`
    } else {
      const errText = existsSync(errFile) ? readFileSync(errFile, 'utf8') : ''
      if (/couldn't find remote ref/.test(errText)) {
        cause = `no branch '${SYNC.branch}' on that remote`
      } else {
        const errLines = errText.split('\n')
        cause = errLines.find((l) => /^(fatal|error):/.test(l)) ?? errLines[0] ?? ''
      }
      if (!cause) cause = `git fetch exited ${result.status}`
    }
    return bpFetchFail(cause)
  }

  const shaR = await unchecked(() =>
    bpGit(['--git-dir', SYNC.cache, 'rev-parse', '-q', '--verify', `${SYNC.ref}^{commit}`], {
      stdout: 'capture',
      stderr: 'ignore',
    }),
  )
  if (shaR.status !== 0) return bpFetchDamaged()
  SYNC.sha = stripTrailingNewlines(shaR.stdout)
  const dateR = await run('date', ['-u', '+%Y-%m-%dT%H:%M:%SZ'], { stdout: 'capture', stderr: 'ignore' })
  SYNC.fetchedAt = stripTrailingNewlines(dateR.stdout)

  const treeDir = `${SYNC.scratch}/tree`
  const cloneR = await unchecked(() =>
    bpGit(['clone', '-q', '--shared', '--no-checkout', SYNC.cache, treeDir], { stdout: 'ignore', stderr: 'ignore' }),
  )
  if (cloneR.status !== 0) return bpFetchDamaged()
  const checkoutR = await unchecked(() =>
    bpGit(['-c', 'gc.auto=0', '-C', treeDir, 'checkout', '-q', '--detach', SYNC.sha], {
      stdout: 'ignore',
      stderr: 'ignore',
    }),
  )
  if (checkoutR.status !== 0) return bpFetchDamaged()
  SYNC.blueprintRoot = treeDir
}

// --- history (scripts/blueprint:923-955) ------------------------------------
function bpHistoryUnreadable(): Promise<never> {
  if (SYNC.mode === 'address') return bpFetchDamaged()
  return die(`could not read the history of ${SYNC.blueprintRoot}`)
}

async function bpReportHistory(bootstrapSha: string, currentSha: string): Promise<void> {
  const where = SYNC.mode === 'address' ? `${SYNC.remote} ${SYNC.branch}` : "the local checkout's"

  const hasCommit = await unchecked(() =>
    bpGit(['-C', SYNC.blueprintRoot, 'cat-file', '-e', `${bootstrapSha}^{commit}`], {
      stdout: 'ignore',
      stderr: 'ignore',
    }),
  )
  let rc: number
  if (hasCommit.status === 0) {
    const anc = await unchecked(() =>
      bpGit(['-C', SYNC.blueprintRoot, 'merge-base', '--is-ancestor', bootstrapSha, currentSha], {
        stdout: 'ignore',
        stderr: 'ignore',
      }),
    )
    rc = anc.status
  } else {
    rc = 1
  }
  if (rc === 1) {
    process.stdout.write(
      `${C_YELLOW}bootstrap_sha ${bootstrapSha} is not in ${where} history.${C_RESET} It was recorded from a commit that is not on that branch (never pushed, rewritten, or not yet released), so commits since sync are unknown.\n\n`,
    )
    return
  }
  if (rc !== 0) {
    await bpHistoryUnreadable()
    return
  }

  const countR = await unchecked(() =>
    bpGit(['-C', SYNC.blueprintRoot, 'rev-list', '--count', `${bootstrapSha}..${currentSha}`], {
      stdout: 'capture',
      stderr: 'ignore',
    }),
  )
  if (countR.status !== 0) {
    await bpHistoryUnreadable()
    return
  }
  const logR = await unchecked(() =>
    bpGit(['-C', SYNC.blueprintRoot, 'log', '--oneline', `${bootstrapSha}..${currentSha}`], {
      stdout: 'capture',
      stderr: 'ignore',
    }),
  )
  if (logR.status !== 0) {
    await bpHistoryUnreadable()
    return
  }
  process.stdout.write(
    `${C_BLUE}Blueprint has ${stripTrailingNewlines(countR.stdout)} commit(s) since this project was last synced:${C_RESET}\n`,
  )
  for (const line of stripTrailingNewlines(logR.stdout).split('\n')) process.stdout.write(`  ${line}\n`)
  process.stdout.write('\n')
}

// --- marker structure & merge (BUG-034 / BUG-112, scripts/blueprint:162-275) -
const BP_MARKER_LEAD = '^[[:space:]]*(#|//|<!--)[[:space:]]*BLUEPRINT:'
const BP_MARKER_TAIL = '([[:space:]]*$|[[:space:]]*-->|[[:space:]]+[^[:alnum:][:space:]_])'
const BP_MARKER_BEGIN_ERE = `${BP_MARKER_LEAD}BEGIN${BP_MARKER_TAIL}`
const BP_MARKER_END_ERE = `${BP_MARKER_LEAD}END${BP_MARKER_TAIL}`

const MARKER_STRUCTURE_AWK = `
  $0 ~ rb { if (open) { why = "BEGIN at line " NR " inside an open region"; exit } open = 1; n++; next }
  $0 ~ re { if (!open) { why = "END at line " NR " with no open region"; exit } open = 0; next }
  END {
    if (why == "" && open) why = "a region opened and never closed"
    if (why != "") print "bad " why
    else if (n == 0) print "none"
    else print "ok " n
  }
`

export async function bpMarkerStructure(file: string): Promise<string> {
  const r = await unchecked(() =>
    run('awk', ['-v', `rb=${BP_MARKER_BEGIN_ERE}`, '-v', `re=${BP_MARKER_END_ERE}`, MARKER_STRUCTURE_AWK, file], {
      stdout: 'capture',
      stderr: 'ignore',
    }),
  )
  return stripTrailingNewlines(r.stdout)
}

async function grepCount(pattern: string, file: string): Promise<number> {
  const r = await unchecked(() => run('grep', ['-cE', pattern, file], { stdout: 'capture', stderr: 'ignore' }))
  const n = Number.parseInt(stripTrailingNewlines(r.stdout), 10)
  return Number.isNaN(n) ? 0 : n
}

const MARKER_MERGE_AWK = `
  function read_bp_inside_regions(   line, region_idx, capture) {
    region_idx = 0
    capture = 0
    while ((getline line < bp_file) > 0) {
      if (line ~ rb) {
        capture = 1
        region_idx++
        bp_inside[region_idx] = ""
        continue
      }
      if (line ~ re) {
        capture = 0
        continue
      }
      if (capture) {
        bp_inside[region_idx] = bp_inside[region_idx] line "\\n"
      }
    }
    close(bp_file)
    bp_n_regions = region_idx
  }
  BEGIN { read_bp_inside_regions() ; cur_region = 0 ; in_inside = 0 }
  $0 ~ rb {
    print
    cur_region++
    printf "%s", bp_inside[cur_region]
    in_inside = 1
    next
  }
  $0 ~ re {
    print
    in_inside = 0
    next
  }
  in_inside { next }
  { print }
`

export async function markerAwareMerge(bpFile: string, projFile: string, outFile: string): Promise<boolean> {
  const bpBegin = await grepCount(BP_MARKER_BEGIN_ERE, bpFile)
  const bpEnd = await grepCount(BP_MARKER_END_ERE, bpFile)
  const projBegin = await grepCount(BP_MARKER_BEGIN_ERE, projFile)
  const projEnd = await grepCount(BP_MARKER_END_ERE, projFile)
  if (bpBegin !== bpEnd || projBegin !== projEnd || bpBegin !== projBegin) return false

  await run(
    'awk',
    ['-v', `bp_file=${bpFile}`, '-v', `rb=${BP_MARKER_BEGIN_ERE}`, '-v', `re=${BP_MARKER_END_ERE}`, MARKER_MERGE_AWK, projFile],
    { stdout: { file: outFile }, stderr: 'ignore' },
  )
  return true
}

// --- placeholder substitution bridge (scripts/lib/placeholders.sh) ---------
async function bpShouldSubstitute(f: string): Promise<boolean> {
  const lib = join(libDir(), 'placeholders.sh')
  const r = await unchecked(() => bashLib(lib, 'bp_should_substitute "$2"', [f], { stderr: 'ignore' }))
  return r.status === 0
}

async function bpSubstituteStream(srcFile: string, projName: string, outFile: string): Promise<boolean> {
  const lib = join(libDir(), 'placeholders.sh')
  const r = await unchecked(() =>
    run('bash', ['-c', '. "$1"; bp_substitute_stream "$2" "$3"', '_', lib, srcFile, projName], {
      stdout: { file: outFile },
      stderr: 'inherit',
    }),
  )
  return r.status === 0
}

function projectNameFromLogicalPwd(): string {
  const pwd = logicalPwd()
  const idx = pwd.lastIndexOf('/')
  return idx === -1 ? pwd : pwd.slice(idx + 1)
}

// substituted_blueprint_copy (scripts/blueprint:311-330) — the blueprint's
// copy of `f`, placeholder-substituted when `f` is not itself exempt. Callers
// remove the result when it differs from the plain blueprint path (a mktemp).
async function substitutedBlueprintCopy(f: string): Promise<string> {
  const bp = bpBlueprintPath(f)
  if (!(await bpShouldSubstitute(f))) return bp
  const tmp = await mktemp()
  await bpSubstituteStream(bp, projectNameFromLogicalPwd(), tmp)
  return tmp
}

// --- P3, BUG-113: bp_prospective_pull (scripts/blueprint:362-409) ----------
export type ProspectiveMode = 'new' | 'copy' | 'merge' | 'backup-copy' | 'refuse'
export interface Prospective {
  readonly mode: ProspectiveMode
  readonly why: string
  readonly detail: string
}

export async function bpProspectivePull(bp: string, proj: string, out: string): Promise<Prospective> {
  const bs = await bpMarkerStructure(bp)
  const projExists = existsSync(proj)
  const ps = projExists ? await bpMarkerStructure(proj) : ''

  if (bs.startsWith('bad')) {
    return { mode: 'refuse', why: `the blueprint copy's markers are invalid — ${bs.slice(4)}`, detail: '' }
  }
  if (ps.startsWith('bad')) {
    return {
      mode: 'refuse',
      why: `this project's markers are invalid — ${ps.slice(4)} (fix them by hand, then pull again)`,
      detail: '',
    }
  }
  if (!projExists) {
    await run('cp', [bp, out])
    return { mode: 'new', why: '', detail: '' }
  }
  if (bs === 'none' && ps === 'none') {
    await run('cp', [bp, out])
    return { mode: 'copy', why: '', detail: '' }
  }
  if (bs === 'none' && ps.startsWith('ok')) {
    return {
      mode: 'refuse',
      why: 'this project has markers but the blueprint copy has none — a pull would strip them',
      detail: '',
    }
  }
  if (bs.startsWith('ok') && ps === 'none') {
    await run('cp', [bp, out])
    return { mode: 'backup-copy', why: "blueprint uses markers, project doesn't", detail: '' }
  }
  // Only ok:ok combinations remain — bad and none have both been handled above.
  if (bs === ps && (await markerAwareMerge(bp, proj, out))) {
    return { mode: 'merge', why: '', detail: '' }
  }
  await run('cp', [bp, out])
  return {
    mode: 'backup-copy',
    why: `marker structure mismatch (${bs.slice(3)} region(s) upstream, ${ps.slice(3)} here)`,
    detail: '',
  }
}

// --- P4, TASK-042: the settings merge (scripts/blueprint:411-581) ----------
const BP_SETTINGS_LAYER = '.claude/settings.project.json'
const BP_SETTINGS_SHAPE = `type == "object"
  and ((keys - ["$schema", "permissions"]) == [])
  and ((.permissions // {}) | type == "object"
       and ((keys - ["allow", "ask", "deny", "additionalDirectories"]) == [])
       and all(.[]; type == "array" and all(.[]; type == "string")))`
const BP_SETTINGS_MERGE = `def uniq: reduce .[] as $x ([]; if any(.[]; . == $x) then . else . + [$x] end);
  (.[0].permissions // {}) as $b | (.[1].permissions // {}) as $p
  | (($b.ask // []) + ($b.deny // [])) as $tight
  | .[0] | .permissions = reduce ("allow", "ask", "deny", "additionalDirectories") as $k ($b;
      if ($b | has($k)) or ($p | has($k)) then
        .[$k] = (($b[$k] // [])
                 + (($p[$k] // []) | if $k == "allow" then map(select(. as $e | any($tight[]; . == $e) | not)) else . end)
                 | uniq)
      else . end)`
const BP_SETTINGS_KEYS = '["allow", "ask", "deny", "additionalDirectories"]'
const BP_SETTINGS_EXTRA = `${BP_SETTINGS_KEYS} as $keys
  | (.[0].permissions // {}) as $b | (.[1].permissions // {}) as $p
  | [ $keys[] | . as $k
      | {key: $k, value: (if ($p[$k] | type) == "array"
                          then ($p[$k] | map(select(type == "string"))) - ($b[$k] // [])
                          else [] end)}
      | select(.value != []) ]
  | if . == [] then null else {permissions: from_entries} end`
const BP_SETTINGS_UNSUPPORTED = `${BP_SETTINGS_KEYS} as $keys
  | (.[0].permissions // {}) as $b | (.[1].permissions // {}) as $p
  | [ ($p | keys_unsorted[] | . as $k
       | select(($keys | index($k)) == null) | select(($b | has($k)) | not) | $k),
      ($keys[] | . as $k | select($p | has($k))
       | select(if ($p[$k] | type) != "array" then true
                else ($p[$k] | any(.[]; type != "string")) end)) ]
  | unique | map("permissions." + .) | join(", ")`

async function bpOneObject(file: string): Promise<boolean> {
  const r = await unchecked(() =>
    run('jq', ['-e', '-s', 'length == 1 and (.[0] | type == "object")', file], { stdout: 'ignore', stderr: 'ignore' }),
  )
  return r.status === 0
}

interface SettingsResult {
  readonly ok: boolean
  readonly why: string
  readonly detail: string
}

async function bpSettingsLayer(bp: string, out: string): Promise<SettingsResult> {
  if (!commandExists('jq')) {
    return {
      ok: false,
      why: "jq is not on PATH, so pull cannot keep this project's permission rules (bash scripts/install-toolchain.sh)",
      detail: '',
    }
  }
  if (!(await bpOneObject(bp))) {
    return {
      ok: false,
      why: "the blueprint's .claude/settings.json is not a single JSON object, so there is nothing safe to land",
      detail: '',
    }
  }
  if (existsSync(BP_SETTINGS_LAYER)) {
    if (!(await bpOneObject(BP_SETTINGS_LAYER))) {
      return {
        ok: false,
        why: `${BP_SETTINGS_LAYER} must be a single JSON object — not several, and not an array, a number or null`,
        detail: '',
      }
    }
    const shapeOk = await unchecked(() =>
      run('jq', ['-e', '-s', `.[0] | (${BP_SETTINGS_SHAPE})`, BP_SETTINGS_LAYER], { stdout: 'ignore', stderr: 'ignore' }),
    )
    if (shapeOk.status !== 0) {
      return {
        ok: false,
        why: `${BP_SETTINGS_LAYER} must be a JSON object holding only permissions.allow, ask, deny and additionalDirectories, each a list of strings`,
        detail: '',
      }
    }
    const merged = await unchecked(() =>
      run('jq', ['-s', BP_SETTINGS_MERGE, bp, BP_SETTINGS_LAYER], { stdout: { file: out }, stderr: 'ignore' }),
    )
    if (merged.status !== 0) {
      return { ok: false, why: `${BP_SETTINGS_LAYER} could not be merged into the blueprint's settings.json`, detail: '' }
    }
    return { ok: true, why: '', detail: '' }
  }
  if (existsSync('.claude/settings.json')) {
    if (!(await bpOneObject('.claude/settings.json'))) {
      return {
        ok: false,
        why: "this project's .claude/settings.json is not a single JSON object, so its own rules cannot be told from the blueprint's",
        detail: '',
      }
    }
    const proposalR = await unchecked(() =>
      run('jq', ['-s', BP_SETTINGS_EXTRA, bp, '.claude/settings.json'], { stdout: 'capture', stderr: 'ignore' }),
    )
    if (proposalR.status !== 0) {
      return {
        ok: false,
        why: "this project's .claude/settings.json could not be read, so its own rules cannot be told from the blueprint's",
        detail: '',
      }
    }
    const proposal = stripTrailingNewlines(proposalR.stdout)
    const unsupportedR = await unchecked(() =>
      run('jq', ['-r', '-s', BP_SETTINGS_UNSUPPORTED, bp, '.claude/settings.json'], { stdout: 'capture', stderr: 'ignore' }),
    )
    const unsupported = unsupportedR.status === 0 ? stripTrailingNewlines(unsupportedR.stdout) : ''
    if (proposal !== 'null' || unsupported !== '') {
      let detail = ''
      if (proposal !== 'null') {
        const indented = proposal
          .split('\n')
          .map((l) => `        ${l}`)
          .join('\n')
        detail = `      Save the permission rules that are this project's own as ${BP_SETTINGS_LAYER},
      then pull again. Delete any the blueprint removed on purpose; if none are
      yours, write {}. A project file carries permission lists and nothing else:
${indented}`
      }
      if (unsupported !== '') {
        detail = `${detail ? `${detail}\n` : ''}      A project file CANNOT carry these, so a pull replaces them with the
      blueprint's: ${unsupported}
      Keep them in .claude/settings.local.json (host-only), or propose them to
      the blueprint; then remove them from settings.json and pull again.`
      }
      return {
        ok: false,
        why: `this project's settings.json carries permission rules of its own, and there is no ${BP_SETTINGS_LAYER} to keep them (run 'blueprint pull .claude/settings.json' to see them)`,
        detail,
      }
    }
  }
  await run('cp', [bp, out])
  return { ok: true, why: '', detail: '' }
}

// bp_prospective_for (scripts/blueprint:583-607) — the ONE answer every
// caller reads (drift here; pull's selection/preview/write in slice 3).
export async function bpProspectiveFor(f: string, out: string): Promise<Prospective> {
  const bp = bpBlueprintPath(f)
  const cmp = await substitutedBlueprintCopy(f)
  try {
    if (f === '.claude/settings.json') {
      const merged = await mktemp()
      try {
        const layer = await bpSettingsLayer(cmp, merged)
        if (layer.ok) return await bpProspectivePull(merged, f, out)
        return { mode: 'refuse', why: layer.why, detail: layer.detail }
      } finally {
        await unchecked(() => run('rm', ['-f', merged], { stdout: 'ignore', stderr: 'ignore' }))
      }
    }
    return await bpProspectivePull(cmp, f, out)
  } finally {
    if (cmp !== bp) await unchecked(() => run('rm', ['-f', cmp], { stdout: 'ignore', stderr: 'ignore' }))
  }
}

// --- staleness report (scripts/lib/staleness.sh bridge) ---------------------
function readLineFromStdin(): string {
  const buf = Buffer.alloc(1)
  let line = ''
  for (;;) {
    let n: number
    try {
      n = readSync(0, buf, 0, 1, null)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EAGAIN') continue
      break
    }
    if (n === 0) break
    const ch = buf.toString('utf8')
    if (ch === '\n') break
    line += ch
  }
  return line
}

async function reportStaleness(root: string, branchOverride?: string): Promise<void> {
  const lib = join(libDir(), 'staleness.sh')
  if (!existsSync(lib)) {
    process.stdout.write(`  ${C_DIM}remote staleness: unknown (scripts/lib/staleness.sh missing)${C_RESET}\n`)
    return
  }
  let branch = branchOverride !== undefined ? branchOverride : process.env.BLUEPRINT_BRANCH ?? ''
  if (!branch) {
    const r = await unchecked(() =>
      run('git', ['-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { stdout: 'capture', stderr: 'ignore' }),
    )
    branch = r.status === 0 ? stripTrailingNewlines(r.stdout) : 'main'
  }

  const assessR = await unchecked(() =>
    run('bash', ['-c', '. "$1"; bp_staleness_assess "$2" "$3"', '_', lib, root, branch], {
      stdout: 'capture',
      stderr: 'ignore',
    }),
  )
  const field = (k: string): string => {
    for (const line of assessR.stdout.split('\n')) {
      if (line.startsWith(`${k}=`)) return line.slice(k.length + 1)
    }
    return ''
  }
  const status = field('status')
  const blocker = field('blocker')
  const offer = field('offer')
  const remote = field('remote')
  const count = field('count')
  const verified = field('verified')

  if (status === 'current') {
    process.stdout.write(`  ${C_GREEN}✓ local checkout is level with ${remote}/${branch}${C_RESET}\n`)
    return
  }
  if (status === 'unknown') {
    process.stdout.write(`  ${C_DIM}? staleness unknown (${blocker}) — cannot confirm the checkout is current${C_RESET}\n`)
    return
  }
  if (status === 'ahead') {
    process.stdout.write(`  ${C_DIM}local checkout is ahead of ${remote}/${branch} (unpushed commits)${C_RESET}\n`)
    return
  }
  if (status === 'diverged') {
    process.stdout.write(`  ${C_YELLOW}⚠ local checkout has DIVERGED from ${remote}/${branch}${C_RESET}\n`)
    process.stdout.write(`  ${C_DIM}    resolve by hand — a merge or rebase is not a prompt${C_RESET}\n`)
    return
  }

  // status === behind
  if (verified === 'yes' && count) {
    process.stdout.write(`  ${C_YELLOW}⚠ local checkout is ${count} commit(s) behind ${remote}/${branch}${C_RESET}\n`)
  } else {
    process.stdout.write(`  ${C_YELLOW}⚠ local checkout is behind ${remote}/${branch}${C_RESET}\n`)
  }

  if (offer !== 'ff') {
    const reasons: Record<string, string> = {
      dirty: 'not offering: uncommitted or untracked changes there',
      detached: 'not offering: that checkout is on a detached HEAD',
      'wrong-branch': `not offering: that checkout is not on ${branch}`,
    }
    process.stdout.write(`  ${C_DIM}    ${reasons[blocker] ?? `not offering (${blocker})`}${C_RESET}\n`)
    return
  }

  if (process.env.BP_NO_PROMPT === '1' || !process.stdin.isTTY) {
    process.stdout.write(`  ${C_DIM}    fast-forward it with: git -C ${root} merge --ff-only${C_RESET}\n`)
    return
  }

  process.stdout.write('      fast-forward it now? [y/N] ')
  const reply = readLineFromStdin()
  if (reply === 'y' || reply === 'Y') {
    const ffR = await unchecked(() =>
      run('bash', ['-c', '. "$1"; bp_staleness_fast_forward "$2" "$3" "$4"', '_', lib, root, branch, remote], {
        stdout: 'ignore',
        stderr: 'ignore',
      }),
    )
    if (ffR.status === 0) {
      const shaR = await run('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { stdout: 'capture', stderr: 'ignore' })
      process.stdout.write(`  ${C_GREEN}✓ fast-forwarded to ${stripTrailingNewlines(shaR.stdout)}${C_RESET}\n`)
    } else {
      process.stdout.write(`  ${C_YELLOW}fast-forward refused — the checkout is untouched${C_RESET}\n`)
    }
  } else {
    process.stdout.write(`  ${C_DIM}    left alone${C_RESET}\n`)
  }
}

// --- _bp_project_root / _bp_is_blueprint_itself (state-dir.sh bridge) ------
async function bpProjectRoot(): Promise<string> {
  const lib = join(libDir(), 'state-dir.sh')
  if (existsSync(lib)) {
    const r = await unchecked(() =>
      run('bash', ['-c', '. "$1"; BP_CODE_ROOT="$2"; bp_state_root 2>/dev/null', '_', lib, logicalPwd()], {
        stdout: 'capture',
        stderr: 'ignore',
      }),
    )
    const root = stripTrailingNewlines(r.stdout)
    if (r.status === 0 && root) {
      const realR = await unchecked(() =>
        run('sh', ['-c', 'cd "$1" 2>/dev/null && pwd -P', '_', root], { stdout: 'capture', stderr: 'ignore' }),
      )
      if (realR.status === 0) return stripTrailingNewlines(realR.stdout)
    }
  }
  const pwdR = await run('sh', ['-c', 'pwd -P'], { stdout: 'capture', stderr: 'ignore' })
  return stripTrailingNewlines(pwdR.stdout)
}

async function bpIsBlueprintItself(): Promise<boolean> {
  const here = await bpProjectRoot()
  return here !== '' && existsSync(join(here, '.blueprint-root'))
}

// --- gate arming (scripts/lib/gate.sh bridge) -------------------------------
// stdout/stderr INHERITED, not captured — the bash lib's own `echo` lines are
// the bytes this process emits, so there is no re-formatting seam for them to
// drift from the shell CLI's.
async function armGate(root: string): Promise<void> {
  const lib = join(libDir(), 'gate.sh')
  if (!existsSync(lib)) {
    process.stdout.write(`  ${C_RED}⚠ gate: scripts/lib/gate.sh is missing — the pre-push gate is NOT armed${C_RESET}\n`)
    return die(
      'refusing to report drift without scripts/lib/gate.sh. Fetch it once with: BLUEPRINT_ROOT=<checkout> bash <checkout>/scripts/blueprint pull scripts/lib/gate.sh',
    )
  }
  await run('bash', ['-c', '. "$1"; arm_gate "$2"', '_', lib, root], { stdout: 'inherit', stderr: 'inherit' })
  await unchecked(() =>
    run(
      'bash',
      ['-c', '. "$1"; command -v arm_push_keepalive >/dev/null 2>&1 && arm_push_keepalive "$2"', '_', lib, root],
      { stdout: 'inherit', stderr: 'inherit' },
    ),
  )
}

// --- read_blueprint_source (scripts/blueprint:978-1034) --------------------
const UNREGISTERED_MARKERS: readonly string[] = [
  'AGENT_SIGNAL.md',
  'AGENTS.md',
  'CLAUDE.md',
  'STACK_DEFAULTS.md',
  'scripts/install-toolchain.sh',
  '.githooks/pre-push',
  'scripts/blueprint',
  'scripts/agent-activity.sh',
  'docs/DoD.md',
]

// `_bp_config_value` (scripts/blueprint:1036-1039) — the first `KEY = value`
// line, trimmed. Pure line parsing, no arrays: reimplemented natively per
// plan §2 rule 3 rather than bridged.
function configValue(file: string, key: string): string {
  if (!existsSync(file)) return ''
  const re = new RegExp(`^[ \\t]*${key}[ \\t]*=`)
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (re.test(line)) return line.slice(line.indexOf('=') + 1).trim()
  }
  return ''
}

export interface BlueprintSource {
  readonly managed: string[]
  readonly bootstrapSha: string
  readonly bootstrapDate: string
}

export async function readBlueprintSource(): Promise<BlueprintSource> {
  if (!existsSync('.blueprint-source')) {
    const markers = UNREGISTERED_MARKERS.filter((m) => existsSync(m)).length
    if (markers >= 3) {
      process.stderr.write(`${C_YELLOW}This looks like a struct2flow project (${markers} marker files), but it was${C_RESET}\n`)
      process.stderr.write(`${C_YELLOW}NEVER REGISTERED with blueprint sync — there is no .blueprint-source.${C_RESET}\n`)
      process.stderr.write('\n')
      process.stderr.write("So 'drift' and 'pull' have never done anything here. Adopt it by creating\n")
      process.stderr.write(`${logicalPwd()}/.blueprint-source with:\n`)
      process.stderr.write('\n')
      process.stderr.write('  config_version   = 2\n')
      process.stderr.write('  blueprint_remote = git@github.com:<owner>/<blueprint>.git\n')
      process.stderr.write('  blueprint_branch = main\n')
      process.stderr.write('  bootstrap_sha    = <blueprint commit you are adopting against>\n')
      const dateR = await run('date', ['+%Y-%m-%d'], { stdout: 'capture', stderr: 'ignore' })
      process.stderr.write(`  bootstrap_date   = ${stripTrailingNewlines(dateR.stdout)}\n`)
      return die('unregistered struct2flow project — see the lines above')
    }
    return die(`no .blueprint-source in ${logicalPwd()} — not a struct2flow project (run from project root)`)
  }

  const bootstrapSha = configValue('.blueprint-source', 'bootstrap_sha')
  const bootstrapDate = configValue('.blueprint-source', 'bootstrap_date')

  if (/^[ \t]*blueprint_source[ \t]*=/m.test(readFileSync('.blueprint-source', 'utf8'))) {
    process.stderr.write(
      `${C_YELLOW}warning:${C_RESET} .blueprint-source still has blueprint_source, which is no longer read. The blueprint is read from blueprint_remote (TASK-025). Delete the blueprint_source line.\n`,
    )
  }

  const rootOverride = process.env.BLUEPRINT_ROOT
  if (rootOverride) {
    if (!existsSync(rootOverride) || !statSync(rootOverride).isDirectory()) {
      return die(`BLUEPRINT_ROOT is '${rootOverride}', which is not a directory. Unset it to read the blueprint from blueprint_remote.`)
    }
    SYNC.mode = 'override'
    SYNC.blueprintRoot = rootOverride
  } else {
    SYNC.mode = 'address'
    await bpFetchBlueprint()
  }

  const managed = await bpManagedFiles(SYNC.blueprintRoot)
  return { managed, bootstrapSha, bootstrapDate }
}

// --- cmd_drift (scripts/blueprint:1302-1437) --------------------------------
export async function cmdDrift(): Promise<number> {
  const projRoot = await bpProjectRoot()
  await armGate(projRoot)

  if (await bpIsBlueprintItself()) {
    process.stdout.write(`${C_BOLD}Blueprint drift check${C_RESET}\n`)
    process.stdout.write(`  project:    ${logicalPwd()}\n`)
    process.stdout.write(`  ${C_GREEN}✓ This IS the blueprint — it is the source of truth, so there is${C_RESET}\n`)
    process.stdout.write(`  ${C_GREEN}  nothing to sync against and no drift to report.${C_RESET}\n`)
    await reportStaleness(projRoot, '')
    process.stdout.write('\n')
    process.stdout.write(`${C_DIM}Derived projects run this to compare themselves against here.${C_RESET}\n`)
    process.stdout.write(`${C_DIM}To see what they would sync: blueprint files${C_RESET}\n`)
    await bpSyncCleanup()
    return 0
  }

  const src = await readBlueprintSource()

  process.stdout.write(`${C_BOLD}Blueprint drift check${C_RESET}\n`)
  process.stdout.write(`  project:    ${logicalPwd()}\n`)

  let currentSha: string
  if (SYNC.mode === 'address') {
    currentSha = SYNC.sha
    process.stdout.write(`  blueprint:  ${SYNC.remote}  (${SYNC.branch})\n`)
    process.stdout.write(`  fetched:    ${currentSha}  at ${SYNC.fetchedAt}\n`)
    process.stdout.write(`  bootstrap:  ${src.bootstrapSha} (${src.bootstrapDate})\n`)
  } else {
    const shaR = await unchecked(() =>
      run('git', ['-C', SYNC.blueprintRoot, 'rev-parse', 'HEAD'], { stdout: 'capture', stderr: 'ignore' }),
    )
    currentSha = shaR.status === 0 ? stripTrailingNewlines(shaR.stdout) : 'no-sha'
    process.stdout.write(
      `  blueprint:  LOCAL CHECKOUT ${SYNC.blueprintRoot} (BLUEPRINT_ROOT override, not the published address)\n`,
    )
    process.stdout.write(`  bootstrap:  ${src.bootstrapSha} (${src.bootstrapDate})\n`)
    process.stdout.write(`  blueprint HEAD: ${currentSha}\n`)
    await reportStaleness(SYNC.blueprintRoot)
  }
  process.stdout.write('\n')

  if (src.bootstrapSha && src.bootstrapSha !== 'no-sha' && currentSha !== 'no-sha' && currentSha !== src.bootstrapSha) {
    await bpReportHistory(src.bootstrapSha, currentSha)
  }

  const drifted: string[] = []
  const missingBlueprint: string[] = []
  const missingProject: string[] = []
  const refused: string[] = []

  for (const f of src.managed) {
    const bp = bpBlueprintPath(f)
    if (!existsSync(bp)) {
      missingBlueprint.push(f)
      continue
    }
    if (!existsSync(f)) {
      missingProject.push(f)
      continue
    }
    const driftOut = await mktemp()
    try {
      const prospective = await bpProspectiveFor(f, driftOut)
      if (prospective.mode === 'refuse') {
        refused.push(`${f} — ${prospective.why}`)
      } else {
        const diffR = await unchecked(() => run('diff', ['-q', driftOut, f], { stdout: 'ignore', stderr: 'ignore' }))
        if (diffR.status !== 0) drifted.push(f)
      }
    } finally {
      await unchecked(() => run('rm', ['-f', driftOut], { stdout: 'ignore', stderr: 'ignore' }))
    }
  }

  if (drifted.length === 0 && missingBlueprint.length === 0 && missingProject.length === 0 && refused.length === 0) {
    process.stdout.write(`${C_GREEN}✓ All blueprint-managed files match the blueprint HEAD.${C_RESET}\n`)
    await bpSyncCleanup()
    return 0
  }

  if (refused.length > 0) {
    process.stdout.write(`${C_RED}Cannot sync — pull refuses these until they are fixed: ${refused.length}${C_RESET}\n`)
    for (const f of refused) process.stdout.write(`  ${C_RED}✗${C_RESET} ${f}\n`)
    process.stdout.write('\n')
  }
  if (drifted.length > 0) {
    process.stdout.write(`${C_YELLOW}Drifted (project ≠ blueprint HEAD): ${drifted.length}${C_RESET}\n`)
    for (const f of drifted) process.stdout.write(`  ${C_YELLOW}~${C_RESET} ${f}\n`)
    process.stdout.write('\n')
  }
  if (missingProject.length > 0) {
    process.stdout.write(`${C_BLUE}New in blueprint (not in this project): ${missingProject.length}${C_RESET}\n`)
    for (const f of missingProject) process.stdout.write(`  ${C_BLUE}+${C_RESET} ${f}\n`)
    process.stdout.write('\n')
  }
  if (missingBlueprint.length > 0) {
    process.stdout.write(`${C_RED}Listed managed but missing in blueprint: ${missingBlueprint.length}${C_RESET}\n`)
    for (const f of missingBlueprint) process.stdout.write(`  ${C_RED}!${C_RESET} ${f}\n`)
    process.stdout.write(`${C_DIM}  (committed at the blueprint's HEAD but absent from its working tree)${C_RESET}\n`)
    process.stdout.write('\n')
  }

  process.stdout.write('Next:\n')
  process.stdout.write(`  ${C_DIM}blueprint pull${C_RESET}             # pull all drifted + new forward\n`)
  process.stdout.write(`  ${C_DIM}blueprint pull <file>${C_RESET}      # pull one file\n`)
  process.stdout.write(`  ${C_DIM}blueprint pull <file> --yes${C_RESET}  # skip the per-file prompt\n`)
  await bpSyncCleanup()
  return 0
}

// --- dispatch ---------------------------------------------------------------
const NOT_YET_PORTED: Readonly<Record<string, number>> = {
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
    case 'drift':
      return await cmdDrift()
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
  // bpSyncCleanup no-ops when nothing was ever fetched, so installing it
  // unconditionally (rather than slice 1's no-op) is correct for every
  // subcommand: a real signal during or after the P1 fetch now cleans up the
  // GO token, the fetch child, the run ref and the scratch directory exactly
  // where bash's EXIT/INT/TERM traps would (plan §3 P1).
  installSignals(bpSyncCleanup)
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    })
}
