// scripts/signal-watch.mts — TASK-067 port of scripts/signal-watch.sh (BUG-144),
// the repo's first whole-file shell-to-TypeScript migration. scripts/signal-watch.sh
// is now the fixed two-line shim CLAUDE.md's "Shell to TypeScript, organically"
// requires; this file carries the whole implementation.
//
// Watch AGENT_SIGNAL.md and run a wake command when the mic flips to a given
// state. Provider-agnostic (TASK-063): Codex, Gemini and Kimi each `exec` this
// same engine with their own `--state OVER_TO_<NAME>`, so it is named for what
// it does — signal-watch — rather than for the first consumer it had.
//
// Example:
//   scripts/signal-watch.sh --once -- printf 'wake\n'
//
// Or configure a real client command:
//   AGENT_WAKE_COMMAND='codex --cwd /path/to/repo wake' \
//     scripts/signal-watch.sh
//
// The command receives AGENT_SIGNAL_HOLDER, AGENT_SIGNAL_STATE, and
// AGENT_SIGNAL_TASK in its environment. Every trigger is also appended to
// the project's state dir (<repo>/logs/state/signal.log; see scripts/lib/state-dir.sh).

import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function usage(): string {
  return `Usage: scripts/signal-watch.sh [options] [-- command ...]

Options:
  --file PATH       Signal file to watch (default: ./AGENT_SIGNAL.md)
  --state STATE     State that triggers the command (default: OVER_TO_CODEX)
  --poll SECONDS    Poll interval in seconds (default: 2)
  --log PATH        Trigger log path (default: <repo>/logs/state/signal.log)
  --once            Exit after the first trigger
  -h, --help        Show this help

If no command is passed after --, AGENT_WAKE_COMMAND is executed with sh -c
(CODEX_WAKE_COMMAND is still honoured as a back-compat alias — see below).
If neither is provided, the watcher only writes the trigger log line.
`
}

// Anchored to THIS FILE's location, never to cwd or to git's idea of the
// repository. Both alternatives are wrong in ways that reopen A-09:
//
//   * `git rev-parse --show-toplevel` answers about the CALLER's environment.
//     Git exports GIT_DIR to every hook (BUG-014), and the gate runs from a
//     pre-push hook, so a dispatcher launched under one resolves whatever that
//     variable names — Codex reproduced the feed landing on <repo>/logs/state
//     while the launcher landed on <repo>/scripts/logs/state.
//   * `pwd` answers about wherever the operator happened to be standing.
//
// Either can resolve a DIFFERENT CHECKOUT, and the launcher then sources that
// tree's lib/state-dir.sh — so an old copy of the derivation silently wins and
// the feed and dispatcher stop rendezvousing.
//
// The shell version needed a hand-rolled 40-hop symlink walk here (see
// scripts/start-codex-signal-watch.sh, still shell) because BASH_SOURCE is not
// resolved through symlinks and `readlink -f` is a GNU extension absent on
// BSD/older macOS. Node's `fs.realpathSync` does both jobs natively — it
// follows an arbitrary symlink chain AND throws (ELOOP) on a cycle — so there
// is no portability gap to hand-roll a walk for. That is the whole reason this
// block is three lines instead of twenty-five, not a shortcut taken here.
// --- physical script root (A-09 / BUG-020, ported) ---
const _bpRoot = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))))
// --- end physical script root ---
const BP_CODE_ROOT = _bpRoot

function trim(value: string): string {
  return value.trim()
}

// BUG-001 / RC-6's `stat -f %m f || stat -c %Y f` non-portable-fallback trap
// does not exist here: `fs.statSync` is one call, portable, and never prints a
// multi-line filesystem-status blob to stdout on the wrong platform the way
// coreutils' `stat -f` does. See scripts/signal-watch.sh's comment for the
// incident this replaces.
function fileMtime(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

// read_field FIELD — read one cell from the two-column markdown table
// AGENT_SIGNAL.md / the live baton is. Mirrors the shell version's
// `awk -F'|'` exactly: split on `|`, trim the second and third fields, match
// the field name in the second, return the (trimmed) third on the FIRST match.
function readField(signalFile: string, field: string): string {
  let content: string
  try {
    content = readFileSync(signalFile, 'utf8')
  } catch {
    return ''
  }
  for (const line of content.split('\n')) {
    const parts = line.split('|')
    if (parts.length < 3) continue
    if (trim(parts[1] ?? '') === field) return trim(parts[2] ?? '')
  }
  return ''
}

interface ShFnResult {
  readonly code: number
  readonly stdout: string
}

// Reach scripts/lib/state-dir.sh ACROSS A PROCESS BOUNDARY rather than
// hand-copying its derivation into TypeScript (BUG-144 brief's own hard
// stop — two copies of the state-dir rule is how A-09 broke the feed). One
// mechanism, sourced by every consumer including this one; a `.mts` consumer
// just reaches it through `sh -c` instead of `.`. stderr is INHERITED, not
// captured — the shell functions print their own diagnostics on failure, and
// a shell caller's `$(...)` never captured stderr either, so this keeps that
// visible the same way.
const STATE_DIR_LIB = join(BP_CODE_ROOT, 'scripts/lib/state-dir.sh')
// scripts/lib/roster.sh and scripts/signal-set.sh, reached the same way, for
// the BUG-144 mic-recovery fix below.
const ROSTER_LIB = join(BP_CODE_ROOT, 'scripts/lib/roster.sh')
const SIGNAL_SET = join(BP_CODE_ROOT, 'scripts/signal-set.sh')

function stateDirFn(
  fn: string,
  args: readonly string[],
  envOverrides: Readonly<Record<string, string | undefined>> = {},
): ShFnResult {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  const placeholders = args.map((_, i) => `"$${i + 2}"`).join(' ')
  const r = spawnSync('sh', ['-c', `. "$1"; ${fn} ${placeholders}`, 'sh', STATE_DIR_LIB, ...args], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return { code: r.status ?? 1, stdout: (r.stdout ?? '').trim() }
}

// BP_STATE_ROOT is resolved ONCE, at startup — same contract as the shell
// consumers (state-dir.sh's own docblock: "resolve once per script, at
// initialisation").
const bpStateRootResult = stateDirFn('bp_state_root', [], { BP_CODE_ROOT })
if (bpStateRootResult.code !== 0) process.exit(9)
const BP_STATE_ROOT = bpStateRootResult.stdout

function agentStateDir(): string {
  return stateDirFn('agent_state_dir', [], { BP_STATE_ROOT }).stdout
}

function agentSignalFile(clearOverride: boolean): string {
  return stateDirFn('agent_signal_file', [], {
    BP_STATE_ROOT,
    ...(clearOverride ? { AGENT_SIGNAL_FILE: undefined } : {}),
  }).stdout
}

// tee -a LOG_FILE: write the line to our own stdout AND append it to the
// trigger log.
function teeLine(logFile: string, text: string): void {
  process.stdout.write(`${text}\n`)
  appendFileSync(logFile, `${text}\n`)
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// --- argument parsing --------------------------------------------------------

// Was the path PINNED by an operator, or merely derived? Captured BEFORE any
// export of our own, because triggerIfNeeded's wake dispatch sets
// AGENT_SIGNAL_FILE on the CHILD's environment only (never on our own
// process.env — see triggerIfNeeded), so unlike the shell version there is no
// risk of mistaking our own export for an operator override on the next read.
// The capture stays here anyway because it is still the correct rule: an
// explicit --file or an ambient AGENT_SIGNAL_FILE at startup is a pin.
let signalFileExplicit = Boolean(process.env.AGENT_SIGNAL_FILE)
let signalFile = process.env.AGENT_SIGNAL_FILE || agentSignalFile(false)
let targetState = 'OVER_TO_CODEX'
let pollSeconds = 2
let logFile = `${agentStateDir()}/signal.log`
let once = false
let command: string[] = []

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  switch (arg) {
    case '--file':
      signalFile = argv[++i] ?? ''
      signalFileExplicit = true
      break
    case '--state':
      targetState = argv[++i] ?? targetState
      break
    case '--poll':
      pollSeconds = Number(argv[++i] ?? pollSeconds)
      break
    case '--log':
      logFile = argv[++i] ?? logFile
      break
    case '--once':
      once = true
      break
    case '-h':
    case '--help':
      process.stdout.write(usage())
      process.exit(0)
      break
    case '--':
      command = argv.slice(i + 1)
      i = argv.length
      break
    default:
      process.stderr.write(`Unknown argument: ${arg}\n`)
      process.stderr.write(usage())
      process.exit(2)
  }
}

if (!existsSync(signalFile)) {
  process.stderr.write(`Signal file not found: ${signalFile}\n`)
  process.exit(1)
}

mkdirSync(dirname(logFile), { recursive: true })

// --- settle state -------------------------------------------------------
// A candidate trigger key and when it was first seen. The signal must hold
// still for SETTLE_SECONDS before it is dispatched, so a two-edit write
// (Task then State, or State then Task) fires ONCE on its final content
// rather than mid-write. See triggerIfNeeded. Ported unchanged from
// scripts/signal-watch.sh's own comment, which explains why NOT to refuse a
// repeated Task instead (Codex's first attempt, rejected): identical
// instructions can legitimately recur, and that guard blocked them for the
// watcher's whole life rather than one poll interval, and never covered a
// wrong-order flip across a restart either.
let lastTriggerKey = ''
let pendingKey = ''
let pendingSince = 0
const settleSeconds = Number(process.env.AGENT_SIGNAL_SETTLE ?? '6')
let lastMtime = fileMtime(signalFile)

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

// BUG-144 — a failed dispatch must not strand the mic.
//
// Neither dispatch path reports its outcome usefully to the poller: a `--`
// COMMAND has no status convention at all, and every launcher's own
// AGENT_WAKE_COMMAND already swallows the dispatched CLI's exit code into a
// printed finished/FAILED line (BUG-143) — that status was never meant to
// reach here. The poller does not need it: it already knows exactly which
// Holder/State it just dispatched. If the baton STILL reads that same pair
// once the dispatch call returns, the dispatch ended without handing the mic
// back — quota exhaustion, a crash, or an agent that forgot — observed live
// as a Kimi 403. Fixed ONCE HERE, in the poller, for every provider, rather
// than in each of the three launchers (Orchestrator decision, BUG-144): if
// the baton MOVED — the agent handed back, even mid-dispatch as in BUG-143 —
// this does nothing.
//
// THE ROSTER IS RESOLVED BESIDE THE BATON (`dirname(signalFile)`), not from
// BP_STATE_ROOT — same reasoning as scripts/lib/watcher-lock.sh's lock path
// (its own docblock): BP_STATE_ROOT is this WATCHER's own checkout, and a
// watcher run directly against a fixture baton (as tests/signal-dispatch and
// tests/mic-recovery both do, `--file` pointed elsewhere) would otherwise
// resolve the OPERATOR's real, gitignored AGENT_ROSTER.md — a fixture
// depending on whatever machine happens to run it, exactly the class of bug
// A-09 and BUG-013 are about. A project with the flat layout this repo still
// has keeps AGENT_ROSTER.md beside its baton's directory today, so this is a
// no-op there; it is what keeps a fixture's baton isolated too.
//
// REOPENED 2026-09-22 (observed live): the first fix here only matched the
// dispatched `OVER_TO_<X>` state verbatim, but every well-behaved agent
// claims the mic first — flips State to ACTIVE while keeping the same
// Holder — before doing its actual work. Andreas (Codex) did exactly that,
// then his CLI died on "model at capacity" 16s later, leaving the baton at
// Holder=Andreas State=ACTIVE forever: the dispatch was over (this function
// only runs after the wake command has RETURNED) and nobody was going to
// move it again. So the dispatched Holder still sitting in EITHER the
// dispatched OVER_TO_<X> state OR ACTIVE, once the wake command has
// returned, means the same thing: this dispatch ended without a real
// handback, and the mic is stranded.
//
// This does assume the wake command runs to completion before this function
// is called — true for every launcher today, all of which run in the
// foreground (`spawnSync`, above). A backgrounded, fire-and-forget launcher
// would still be legitimately working when the poller checks and would look
// identical to a stranded ACTIVE — noted in review (Thomas/Kimi) and left as
// a documented constraint rather than a guard, since nothing dispatches that
// way today.
function recoverStrandedMic(dispatchedHolder: string, dispatchedState: string): void {
  if (readField(signalFile, 'Holder') !== dispatchedHolder) return
  const state = readField(signalFile, 'State')
  if (state !== dispatchedState && state !== 'ACTIVE') return

  const rosterRoot = dirname(signalFile)
  const orchestrator = spawnSync(
    'sh',
    ['-c', `. "$1"; bp_roster_name_for_role "$2" Orchestrator`, 'sh', ROSTER_LIB, rosterRoot],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const orchestratorName = (orchestrator.stdout ?? '').trim()
  // bp_roster_name_for_role already explained why on its own stderr
  // (inherited above, via bp_roster_warn) — never crash the watcher over an
  // unresolved label; leaving the mic where it is is still strictly better
  // than a crashed poller watching nothing.
  if (orchestrator.status !== 0 || orchestratorName === '') {
    process.stderr.write(
      `signal-watch: ${dispatchedHolder}'s dispatch ended without handing back the mic, ` +
        'and no Orchestrator could be resolved to hand it to — leaving the mic where it is.\n',
    )
    return
  }

  const task = `${dispatchedHolder}'s dispatch ended without handing back the mic - read the provider run log`
  // AGENT_ROSTER_FILE, for the SAME reason `--file` targets the baton at
  // signalFile rather than signal-set.sh's own derived one: signal-set.sh
  // validates --holder against a roster of its OWN, resolved from its own
  // BP_STATE_ROOT unless told otherwise (its own docblock on this env var).
  // Left unset, that validation would read whichever roster happens to sit
  // beside THIS SCRIPT's checkout — not the one `rosterRoot` above just
  // resolved the orchestrator name FROM — and refuse a name that fixture
  // roster used correctly. One roster for one recovery, not two resolutions
  // of one fact (A-09).
  const result = spawnSync(
    'bash',
    [SIGNAL_SET, '--file', signalFile, '--holder', orchestratorName, '--state', 'OVER_TO_CLAUDE', '--task', task],
    { stdio: 'inherit', env: { ...process.env, AGENT_ROSTER_FILE: rosterRoot } },
  )
  if (result.status !== 0) {
    process.stderr.write(
      `signal-watch: recovering the mic to ${orchestratorName} failed (exit ${result.status ?? 'null'}) — see above.\n`,
    )
  }
}

function triggerIfNeeded(): boolean {
  const holder = readField(signalFile, 'Holder')
  const state = readField(signalFile, 'State')
  const task = readField(signalFile, 'Task')
  const key = `${holder}|${state}|${task}`

  if (state !== targetState) {
    lastTriggerKey = ''
    pendingKey = ''
    pendingSince = 0
    return false
  }

  if (key === lastTriggerKey) return false

  if (key !== pendingKey) {
    pendingKey = key
    pendingSince = nowSeconds()
    return false
  }
  if (nowSeconds() - pendingSince < settleSeconds) return false

  lastTriggerKey = key
  teeLine(logFile, `[${isoNow()}] Holder=${holder} State=${state} Task=${task}`)

  // Built as a FRESH env object for the dispatched child only — never
  // assigned onto process.env. The shell version has to export these into
  // its OWN (persistent) environment, and then goes out of its way to strip
  // AGENT_SIGNAL_FILE back out for refreshSignalFile's later read, precisely
  // because a bash export outlives the statement that made it. A `.mts`
  // process building a new env per spawn has no such leak to plug: nothing
  // here ever sets `process.env.AGENT_SIGNAL_FILE`, so refreshSignalFile
  // never needs to un-pollute anything it did not pollute.
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    AGENT_SIGNAL_HOLDER: holder,
    AGENT_SIGNAL_STATE: state,
    AGENT_SIGNAL_TASK: task,
    AGENT_SIGNAL_FILE: signalFile,
  }

  // TASK-063: renamed from CODEX_WAKE_COMMAND (Codex was the first consumer;
  // Gemini and Kimi now exec this same engine). The generic name is read
  // FIRST — a back-compat fallback must never let the old name win over the
  // new one.
  //
  // `||`, DELIBERATELY NOT `??`. `${A:-${B:-}}` in the shell version treats an
  // EMPTY string as unset, falling through to B — and `||` matches that
  // exactly (JS treats `''` as falsy), while `??` would NOT (it only falls
  // through on `null`/`undefined`, so an explicitly-set-but-empty
  // AGENT_WAKE_COMMAND="" would win over CODEX_WAKE_COMMAND with `??` and
  // silently dispatch nothing). This is the one semantic the brief calls out
  // by name, so it is called out here too.
  const wakeCommand = process.env.AGENT_WAKE_COMMAND || process.env.CODEX_WAKE_COMMAND || ''

  if (command.length > 0) {
    spawnSync(command[0] as string, command.slice(1), { stdio: 'inherit', env: childEnv })
  } else if (wakeCommand !== '') {
    spawnSync('sh', ['-c', wakeCommand], { stdio: 'inherit', env: childEnv })
  }

  recoverStrandedMic(holder, state)

  return true
}

// BUG-019 migration hazard — re-resolve the baton path EVERY TICK.
//
// `signalFile` used to be resolved once at startup, in the shell version, and
// every already-running watcher then kept polling the OLD path after BUG-019
// moved the live baton — a file that no longer changes — and never fired
// again, silently. The answer is not "restart your watchers after upgrading"
// (rejected five times in this repo's history; see the shell comment this
// mirrors), so the baton path is re-derived on every tick instead.
//
// An EXPLICIT path (`--file`, or an ambient AGENT_SIGNAL_FILE at startup) is
// never re-resolved — captured once, in signalFileExplicit, above.
function refreshSignalFile(): void {
  if (signalFileExplicit) return
  const nowFile = agentSignalFile(true)
  if (!nowFile || nowFile === signalFile) return
  teeLine(logFile, `[${isoNow()}] signal path moved: ${signalFile} -> ${nowFile}`)
  signalFile = nowFile
  // Clear the SETTLE state — a half-observed candidate belongs to the old
  // file. KEEP lastTriggerKey: if the baton at the new path carries the same
  // Holder|State|Task as one already dispatched — exactly what a migration
  // that copies the file produces — a cleared key would re-dispatch finished
  // work, which is the defect the settle window exists to prevent, arriving
  // through a different door.
  pendingKey = ''
  pendingSince = 0
  lastMtime = undefined
}

// --- claim the mic state, so its absence is detectable (BUG-022) -------------
//
// Node has no flock syscall, so this cannot hold the lock directly the way
// the shell version does (`flock -n FD` against its own open descriptor, held
// for the process's whole life, released by the kernel on any exit including
// SIGKILL). The LIFELINE PIPE reproduces the same guarantee across a process
// boundary instead: spawn `<flock> -n <lockfile> -c 'echo LOCKED; exec cat'`
// with the child's STDIN a pipe from this process. Wait for `LOCKED` on its
// stdout — the child got the lock. When this process dies, for ANY reason,
// SIGKILL included, the kernel closes every fd it held, including the write
// end of that pipe; `cat` then reads EOF, exits, and `flock` releases the
// lock as it unwinds. No polling, no pids, no cleanup path to get wrong.
// Proven on this host: .scratch/lifeline.mts + .scratch/lifeline-test.sh — a
// second holder is refused, the `flock -n` liveness probe reads a held lock
// as held, and SIGKILL of the first holder releases it within 200ms with no
// orphan left behind.
//
// THE FILE IS NEVER REMOVED (TASK-006, carried over unchanged): its
// persistence is the record that a watcher was EXPECTED on this state, which
// is what lets scripts/agent-activity.sh tell "nobody is listening" and "an
// agent is thinking" apart. See scripts/lib/watcher-lock.sh's own docblock
// for the full reasoning; this file does not re-derive it.
//
// --once is exempt, same as the shell version: a one-shot probe is not a
// listener.
const WATCHER_LOCK_LIB = join(BP_CODE_ROOT, 'scripts/lib/watcher-lock.sh')

async function claimLock(): Promise<void> {
  if (once) return
  if (!existsSync(WATCHER_LOCK_LIB)) return

  // bp_flock_cmd — resolved ACROSS THE SAME PROCESS BOUNDARY as bp_state_root,
  // never re-typed: it is the lib's own macOS keg-only fallback probe
  // (Homebrew's util-linux flock is not on PATH by default), and duplicating
  // that list here is exactly the two-copies-of-one-fact shape A-09 warns
  // against.
  const flockCmd = spawnSync('sh', ['-c', `. "$1"; bp_flock_cmd`, 'sh', WATCHER_LOCK_LIB], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const flock = (flockCmd.stdout ?? '').trim()
  // No flock resolvable on this host: bp_watch_hold's own contract is
  // "proceed unguarded" (`command -v flock >/dev/null 2>&1 || return 0`), not
  // a refusal — mirrored exactly, rather than failing closed where the shell
  // version fails open.
  if (flockCmd.status !== 0 || flock === '') return

  // bp_watch_lock_path — likewise reached across the boundary rather than
  // re-typed, so the "beside the BATON, not the checkout" rule (the whole
  // correctness argument in watcher-lock.sh's docblock, and the exact defect
  // tests/watcher-liveness's mutant W1 encodes) has exactly one definition.
  const lockPathResult = spawnSync(
    'sh',
    ['-c', `. "$1"; bp_watch_lock_path "$2" "$3"`, 'sh', WATCHER_LOCK_LIB, dirname(signalFile), targetState],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const lockPath = (lockPathResult.stdout ?? '').trim()
  if (lockPathResult.status !== 0 || lockPath === '') return
  mkdirSync(dirname(lockPath), { recursive: true })

  const refuse = (): never => {
    process.stderr.write(`signal-watch: another watcher already holds ${targetState} — refusing.\n`)
    process.stderr.write('  Two watchers on one state race the same baton and dispatch twice.\n')
    process.exit(1)
  }

  const lockChild = spawn(flock, ['-n', lockPath, '-c', 'echo LOCKED; exec cat'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const handshake = await new Promise<'locked' | 'refused'>((resolve) => {
    let settled = false
    lockChild.stdout?.once('data', (chunk: Buffer) => {
      if (settled) return
      if (chunk.toString('utf8').startsWith('LOCKED')) {
        settled = true
        resolve('locked')
      }
    })
    lockChild.once('exit', () => {
      if (settled) return
      settled = true
      resolve('refused')
    })
  })

  if (handshake === 'refused') refuse()

  // The lock is held for as long as lockChild lives. If it dies WHILE we are
  // still running — killed out of band, `flock` itself crashing — the lock is
  // lost and dispatching further would be exactly the unguarded race this
  // whole mechanism exists to prevent. Exit loudly rather than continue.
  lockChild.once('exit', (code, signal) => {
    process.stderr.write(
      `signal-watch: the lock-holding process exited unexpectedly ` +
        `(code=${code ?? 'null'} signal=${signal ?? 'null'}) — the lock on ${targetState} is lost. ` +
        `Refusing to keep dispatching unguarded.\n`,
    )
    process.exit(1)
  })
}

// --- main loop ----------------------------------------------------------

// The shell version's `sleep "$POLL_SECONDS"` (:365) is a REAL CHILD PROCESS,
// once per loop iteration — not merely a delay. tests/signal-dispatch relies
// on exactly that: it puts a `sleep` SHIM ahead of the real one on PATH and
// counts invocations to observe "the watcher polled N times" without ever
// sleeping the TEST for a guessed duration (see that spec's own header on why
// a fixed sleep in the test would be unsound). A `setTimeout` here would be
// invisible to that shim and silently break every case built on it — which is
// what a first draft of this port did; caught by actually running the suite
// (the reason this port was reassigned to a provider that can). Spawning the
// real `sleep` binary keeps the exact same externally-observable event this
// script has always produced once per iteration, not a Node-specific
// substitute for it; it is also EXACTLY what the shell version already paid
// (a subprocess per poll), so this is behaviour-identical, not a new cost.
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('sleep', [String(seconds)], { stdio: 'ignore' })
    child.once('exit', () => resolve())
    child.once('error', () => resolve())
  })
}

async function main(): Promise<void> {
  await claimLock()

  for (;;) {
    refreshSignalFile()
    if (existsSync(signalFile) && triggerIfNeeded() && once) {
      process.exit(0)
    }

    await sleep(Math.max(0, pollSeconds))
    const currentMtime = fileMtime(signalFile)
    if (currentMtime !== lastMtime) {
      lastMtime = currentMtime
    }
  }
}

await main()
