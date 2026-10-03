// scripts/shell-inventory-check.mts — TASK-067 §5: the enforcement half of
// "shell to TypeScript, organically" (docs/done/PLAN-TASK-067-shell-to-typescript.md).
//
// BLUEPRINT-ONLY (like scripts/new-project.sh, scripts/build-deck.sh): this
// file and scripts/shell-inventory.json are export-ignore'd. A derived
// project's own shell is its own decision, and its changes to MANAGED scripts
// reach the blueprint through `a2bp`, where this gate applies (review
// synthesis, "split settled by the Orchestrator").
//
// WHAT IT DOES. scripts/shell-inventory.json lists every shell file
// `sh_lint_files` (scripts/run-ts-suites.sh) sees in this tree, split into two
// sets: `exempt` (the closed list — install-toolchain.sh and the libs it
// sources, no-chain-guard.sh, run-ts-suites.sh; these may change freely
// because they run before any Node exists, or gate Node itself) and `legacy`
// (every other shell file, recorded by git blob sha).
//
// TWO INVENTORIES, NOT ONE — this is the fix for Elias (Codex)'s four-eyes
// finding on 7a060d1/8b5a68b. The first version read scripts/shell-
// inventory.json out of the very tree it was judging, so one commit could
// patch a legacy file AND update its recorded sha (or add a new shell file
// AND a fabricated row for it) and the gate would pass — the exact cheap path
// this gate exists to close.
//
//   BASE  — scripts/shell-inventory.json as it stood at a ref the pushed
//           range cannot edit (see run-ts-suites.sh's ts_shell_inventory_base:
//           locally @{u} or origin/main, in CI `github.event.before`). This is
//           the tamper-proof ground truth.
//   HEAD  — scripts/shell-inventory.json as the working tree has it now (what
//           the push CLAIMS). Compared against BASE only to catch tampering;
//           never trusted on its own for a verdict.
//
// Against BASE, this refuses:
//   - a shell file in the tree that BASE's legacy/exempt does not cover (a
//     new .sh, or one HEAD's json newly claims — self-authorization, see
//     below), UNLESS it is the exact two-line shim with a tracked .mts target:
//     a valid shim is MIGRATED, not new (BUG-145 — after the port push itself
//     becomes BASE, the shim has no row anywhere and must still pass);
//   - a `legacy` file whose blob no longer matches BASE's recorded one,
//     UNLESS the new content is the exact two-line shim AND the shim's
//     target .mts exists and is tracked (a shim pointing at nothing is not a
//     migration — Elias's second finding: a shim with no target passed);
//   - a `legacy` row present in BASE but missing from HEAD (removed), unless
//     the file it named is now gone entirely or is exactly that valid shim —
//     a row may only be removed TOGETHER WITH its migration, never as a bare
//     edit to the json;
//   - a `legacy` row that HEAD ADDS beyond BASE, or a retained row whose
//     value HEAD has changed — either one is the self-authorization path
//     itself, caught before any content check runs.
//   - an `exempt` entry HEAD has that BASE does not — the exempt list may
//     only SHRINK, never grow (a project cannot exempt its way out).
//
// BOOTSTRAP EXCEPTION: if BASE has no scripts/shell-inventory.json at all
// (the commit that first introduces this mechanism, before it has ever been
// pushed), there is nothing yet to tamper with, so HEAD's own json is trusted
// as the initial baseline — exactly as the pre-fix checker always did. Every
// push after that one has a BASE that already carries the file, so this
// exception is single-use by construction.
//
// The file list comes from STDIN, one repo-relative path per line — the
// caller (scripts/run-ts-suites.sh's ts_shell_inventory) pipes `sh_lint_files`
// straight in, so "a shell file" has exactly one definition in this repo.

import { readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { blobHash, isTracked, readFileOrUndefined, isValidShim } from './lib/shim.mts'

interface Inventory {
  exempt: string[]
  legacy: Record<string, string>
}

function readInventoryFromDisk(root: string): Inventory {
  const raw = readFileSync(`${root}/scripts/shell-inventory.json`, 'utf8')
  return JSON.parse(raw) as Inventory
}

// readInventoryAtRef — scripts/shell-inventory.json as git has it at `ref`,
// without checking that ref out. undefined means the file did not exist
// there at all (the bootstrap case above), NOT a refusal by itself.
function readInventoryAtRef(root: string, ref: string): Inventory | undefined {
  let raw: string
  try {
    raw = execFileSync('git', ['-C', root, 'show', `${ref}:scripts/shell-inventory.json`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // the bootstrap case is expected, not an error to surface
    })
  } catch {
    // The ref is verified upstream (ts_shell_inventory_base), so what fails
    // here is the file being absent at BASE: the bootstrap case.
    return undefined
  }
  return JSON.parse(raw) as Inventory
}

function readFileList(): string[] {
  return readFileSync(0, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// --- the sourced-adapter migration form (BUG-147 / BUG-152) ----------------
//
// A sourced library cannot be an ordinary two-line exec shim: its callers
// SOURCE it (scripts/lib/dod-gate.sh from .githooks/pre-push-project and the
// security.yml workflow step; scripts/lib/gate.sh from
// scripts/agent-activity.sh and scripts/blueprint), and a shim execs a child
// process, which cannot hand shell functions back to a caller that sourced
// it. The plans (PLAN-BUG-147 "Option C", BUG-152) admit exactly one second
// migration shape for exactly these files: a generated "sourced adapter"
// whose only variable content is the ordered list of (shell function name,
// CLI subcommand) forwarding pairs at its tail. Everything else — the
// header, the `_call` helper body — is FIXED text, re-rendered here rather
// than trusted from disk.
//
// This is deliberately a TABLE over a CLOSED LIST OF TWO (CLAUDE.md's
// TASK-067 ceiling, landed with the dod-gate port): a third sourced library
// earns its own reviewed extension of this table rather than a generic "any
// sourced adapter" rule this checker has no independent authority to bless.
interface SourcedAdapterPair {
  fn: string
  sub: string
  hasArg: boolean
}

interface SourcedAdapterSpec {
  /** The repo-relative shell path this adapter occupies. */
  readonly path: string
  /** The repo-relative .mts the adapter's bridge resolves. */
  readonly target: string
  /** The fixed generated text through the `_call` helper, ending at the pairs. */
  readonly header: string
  /** The forwarding-line helper name the pairs must call. */
  readonly callName: '_dg_call' | '_gate_call'
  /** One forwarding line per function; anything else fails to parse. */
  readonly pairRe: RegExp
  /** The one authoritative (function, subcommand) list, transcribed from the target .mts's own main() switch. */
  readonly canonicalPairs: readonly SourcedAdapterPair[]
}

const DOD_GATE_ADAPTER: SourcedAdapterSpec = {
  path: 'scripts/lib/dod-gate.sh',
  target: 'scripts/lib/dod-gate.mts',
  callName: '_dg_call',
  header: `#!/bin/sh
# scripts/lib/dod-gate.sh — GENERATED sourced adapter. DO NOT HAND-EDIT.
#
# TASK-067 / BUG-147: the DoD gate's policy lives in scripts/lib/dod-gate.mts
# now (PLAN-BUG-147-dod-gate-port.md, "Option C"). This file is the
# small, mechanically re-renderable bridge that keeps both production callers
# (.githooks/pre-push-project and .github/workflows/security.yml) byte-
# identical: it defines the same shell function names the old shell library
# did and forwards each call to the matching \`dod-gate.mts\` subcommand.
#
# scripts/shell-inventory-check.mts re-renders this exact file from the
# (function, subcommand) pairs below and requires whole-file byte equality —
# see CLAUDE.md "Shell to TypeScript, organically" for the ceiling this form
# is admitted under. Regenerating it by hand risks drifting from that
# renderer; treat the pairs as the source of truth.
#
# Sourced, not executed — same contract the old dod-gate.sh carried.

_dg_bridge_mts="\${BP_CODE_ROOT:-.}/scripts/lib/dod-gate.mts"

# _dg_call SUBCOMMAND [ARGS...] — invokes the CLI, replays any notes it wrote
# to a private DOD_GATE_NOTE_DIR through the caller's own pipe_note (or prints
# them as \`note: …\` when no pipe_note is defined), and returns the CLI's exit
# status unchanged.
_dg_call() {
  if [ ! -f "$_dg_bridge_mts" ]; then
    echo "cannot find $_dg_bridge_mts — run: blueprint pull scripts/lib/dod-gate.mts" >&2
    return 2
  fi
  _dg_notedir="$(mktemp -d)" || { echo "internal error: cannot create a note directory" >&2; return 2; }
  DOD_GATE_NOTE_DIR="$_dg_notedir" node "$_dg_bridge_mts" "$@"
  _dg_rc=$?
  if [ -f "$_dg_notedir/count" ]; then
    _dg_count="$(cat "$_dg_notedir/count")"
    _dg_i=1
    while [ "$_dg_i" -le "$_dg_count" ]; do
      if command -v pipe_note >/dev/null 2>&1; then
        pipe_note "$(cat "$_dg_notedir/note.$_dg_i")"
      else
        printf 'note: %s\\n' "$(cat "$_dg_notedir/note.$_dg_i")"
      fi
      _dg_i=$((_dg_i + 1))
    done
  fi
  rm -rf "$_dg_notedir"
  return "$_dg_rc"
}

`,

  // One forwarding line per function; anything else (an extra command, a
  // malformed name, prose, a blank line) fails to parse, which is refusal —
  // the validity check only accepts a bridge whose RE-RENDER matches byte
  // for byte, so a parse failure alone is already enough to reject it.
  pairRe: /^([A-Za-z_][A-Za-z0-9_]*)\(\) \{ _dg_call ([a-z][a-z0-9-]*)( "\$1")?; \}$/,

  // The one authoritative (function, subcommand) list this bridge may ever
  // forward. BUG-147 round 2 (Codex four-eyes finding): re-rendering from
  // the PARSED pairs and comparing bytes proves nothing on its own — the
  // renderer reproduces whatever shape it is fed, so an appended or
  // redefined pair (e.g. a second `dod_stage_bugtests() { ... }` overriding
  // the real one, which is exactly what shell keeps on a duplicate function
  // name) re-renders byte-identically and a bytes-only check passes it. The
  // authority is dod-gate.mts's OWN declared subcommand switch (its
  // `main()`, case 'rows' | 'bugtests' | 'signal' | 'judgement' | 'items'),
  // transcribed once as this fixed list. Parsed pairs must equal it exactly
  // — same functions, same subcommands, same order, no duplicates and no
  // additions — which closes the whole class: no pair can ever exist that
  // "nothing authoritative vouches for".
  canonicalPairs: [
    { fn: 'dod_items_in_push', sub: 'items', hasArg: true },
    { fn: 'dod_stage_rows', sub: 'rows', hasArg: true },
    { fn: 'dod_stage_bugtests', sub: 'bugtests', hasArg: true },
    { fn: 'dod_stage_signal', sub: 'signal', hasArg: false },
    { fn: 'dod_stage_judgement', sub: 'judgement', hasArg: false },
  ],
}

// BUG-152 — the second (and, per the ceiling above, only other) sourced
// adapter. Same shape as dod-gate's, minus the note protocol: the gate
// functions only echo, so `_gate_call` forwards argv and the exit status
// and nothing else. The authority for canonicalPairs is gate.mts's own
// main() switch (case 'arm-gate' | 'arm-push-keepalive').
const GATE_ADAPTER: SourcedAdapterSpec = {
  path: 'scripts/lib/gate.sh',
  target: 'scripts/lib/gate.mts',
  callName: '_gate_call',
  header: `#!/bin/sh
# scripts/lib/gate.sh — GENERATED sourced adapter. DO NOT HAND-EDIT.
#
# TASK-067 / BUG-152: the gate-arming policy lives in scripts/lib/gate.mts
# now. This file is the small, mechanically re-renderable bridge that keeps
# both production callers (scripts/agent-activity.sh and scripts/blueprint)
# byte-identical: it defines the same shell function names the old shell
# library did and forwards each call to the matching \`gate.mts\` subcommand.
#
# scripts/shell-inventory-check.mts re-renders this exact file from the
# (function, subcommand) pairs below and requires whole-file byte equality —
# see CLAUDE.md "Shell to TypeScript, organically" for the ceiling this form
# is admitted under. Regenerating it by hand risks drifting from that
# renderer; treat the pairs as the source of truth.
#
# Sourced, not executed — same contract the old gate.sh carried.

_gate_bridge_mts="\${BP_CODE_ROOT:-.}/scripts/lib/gate.mts"

# _gate_call SUBCOMMAND [ARGS...] — invokes the CLI and returns the CLI's
# exit status unchanged.
_gate_call() {
  if [ ! -f "$_gate_bridge_mts" ]; then
    echo "cannot find $_gate_bridge_mts — run: blueprint pull scripts/lib/gate.mts" >&2
    return 2
  fi
  node "$_gate_bridge_mts" "$@"
}

`,
  pairRe: /^([A-Za-z_][A-Za-z0-9_]*)\(\) \{ _gate_call ([a-z][a-z0-9-]*)( "\$1")?; \}$/,
  canonicalPairs: [
    { fn: 'arm_gate', sub: 'arm-gate', hasArg: true },
    { fn: 'arm_push_keepalive', sub: 'arm-push-keepalive', hasArg: true },
  ],
}

const SOURCED_ADAPTERS: readonly SourcedAdapterSpec[] = [DOD_GATE_ADAPTER, GATE_ADAPTER]

function sourcedAdapterFor(path: string): SourcedAdapterSpec | undefined {
  return SOURCED_ADAPTERS.find((s) => s.path === path)
}

function renderSourcedAdapter(spec: SourcedAdapterSpec, pairs: readonly SourcedAdapterPair[]): string {
  const lines = pairs.map((p) => `${p.fn}() { ${spec.callName} ${p.sub}${p.hasArg ? ' "$1"' : ''}; }`)
  return spec.header + lines.join('\n') + (lines.length > 0 ? '\n' : '')
}

function parseSourcedAdapterPairs(spec: SourcedAdapterSpec, content: string): SourcedAdapterPair[] | undefined {
  if (!content.startsWith(spec.header)) return undefined
  const tail = content.slice(spec.header.length)
  if (tail.length === 0) return []
  if (!tail.endsWith('\n')) return undefined
  const lines = tail.slice(0, -1).split('\n')
  const pairs: SourcedAdapterPair[] = []
  for (const line of lines) {
    const m = spec.pairRe.exec(line)
    if (!m) return undefined
    const fn = m[1]
    const sub = m[2]
    if (fn === undefined || sub === undefined) return undefined
    pairs.push({ fn, sub, hasArg: m[3] !== undefined })
  }
  return pairs
}

function pairsMatchCanonical(spec: SourcedAdapterSpec, pairs: readonly SourcedAdapterPair[]): boolean {
  if (pairs.length !== spec.canonicalPairs.length) return false
  return pairs.every((p, i) => {
    const c = spec.canonicalPairs[i]
    return c !== undefined && p.fn === c.fn && p.sub === c.sub && p.hasArg === c.hasArg
  })
}

// isValidSourcedAdapter — file-specific to the CLOSED SOURCED_ADAPTERS
// table. Parses the tail into ordered pairs, requires them to equal the
// spec's canonicalPairs exactly (the authoritative check above), and —
// belt and braces — RE-RENDERS the whole file from the parsed pairs and
// requires byte equality against what is actually on disk, the same "trust
// the renderer, not the bytes" shape isValidShim uses for an ordinary exec
// shim. The target .mts must also be present and tracked (BUG-145's shape:
// a bridge pointing at nothing is not a migration).
function isValidSourcedAdapter(root: string, path: string): boolean {
  const spec = sourcedAdapterFor(path)
  if (spec === undefined) return false
  const content = readFileOrUndefined(`${root}/${path}`)
  if (content === undefined) return false
  const pairs = parseSourcedAdapterPairs(spec, content)
  if (pairs === undefined) return false
  if (!pairsMatchCanonical(spec, pairs)) return false
  if (renderSourcedAdapter(spec, pairs) !== content) return false
  return isTracked(root, spec.target) && readFileOrUndefined(`${root}/${spec.target}`) !== undefined
}

// --- TASK-088: the reference-only edit (PLAN-TASK-088-no-shims.md §1.2) -----
//
// A ported script's shell file is DELETED, so a legacy shell caller of it must
// be repointed at the .mts without being ported. The edit is accepted only if
// the file's BASE blob and its HEAD content are the SAME TEXT once each is
// reduced by its own, directional canonicaliser:
//   C_base knows only the shell forms, C_head only the .mts forms, so a BASE
//   form left in (or added to) HEAD stays literal and the comparison fails.
// Rules, in order R3 R5 R4, then the tokens (R1), then R2:
//   R3  a whole line that only sources a table lib (and the shellcheck
//       directive above it) — deleted in BASE, nothing in HEAD.
//   R5  `command -v fn >/dev/null 2>&1 && `  ~  `[ -r "PFX/L.mts" ] && `
//   R4  `fn`  ~  `ENV node "PFX/L.mts" sub` (fn/sub from the lib table)
//   R2  `bash|sh <token>`  ~  `node <token>` (interpreter kept; widenings below)
//   R1  any other reference to a ported path, by path or unique basename.
// PFX is pinned to the prefixes BASE's own R3 lines used. R3/R5 on a lib need
// at least one R4 in HEAD ("coupling").

export interface SourcedLib {
  readonly sh: string
  readonly mts: string
  /** Fixed text in front of every node call in HEAD (the HEAD template's ENV). */
  readonly env: string
  /** shell function -> CLI subcommand, from the .mts's own main() switch. */
  readonly fns: Readonly<Record<string, string>>
}

export const SOURCED_LIBS: readonly SourcedLib[] = [
  {
    sh: 'scripts/lib/gate.sh',
    mts: 'scripts/lib/gate.mts',
    env: '',
    fns: { arm_gate: 'arm-gate', arm_push_keepalive: 'arm-push-keepalive' },
  },
  {
    sh: 'scripts/lib/dod-gate.sh',
    mts: 'scripts/lib/dod-gate.mts',
    env: 'DOD_GATE_NOTE_FILE="${_PIPE_DIR:+$_PIPE_DIR/note.$_PIPE_N}" ',
    fns: {
      dod_items_in_push: 'items',
      dod_stage_rows: 'rows',
      dod_stage_bugtests: 'bugtests',
      dod_stage_signal: 'signal',
      dod_stage_judgement: 'judgement',
    },
  },
]

// D: a shell path P is ported when it is not tracked and its stem's .mts is.
// An extensionless P (scripts/blueprint) additionally had to exist at BASE,
// else every .mts in the tree would make a bare word a token.
interface Ported {
  readonly sh: string
  /** index into PortedSet.mtsList */
  readonly k: number
}
interface PortedSet {
  readonly members: readonly Ported[]
  readonly mtsList: readonly string[]
}
interface RefCtx {
  readonly root: string
  readonly baseRef: string
  ported?: PortedSet
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SENTINEL = /[\u0001\u0002]/
const PH_SPLIT = /\u0001([TU])(\d+)\u0002/
const DIRECTIVE = /^\s*# shellcheck source=\S+\s*$/
const R3_Q = String.raw`"?((?:\$\{?\w+\}?/)?)scripts/lib/([\w-]+)\.sh"?`
const R3_RE = new RegExp(String.raw`^\s*(?:\[ -[rf] ${R3_Q} \] && )?(?:\.|source) ${R3_Q}\s*$`)

function gitList(root: string, args: string[]): string[] {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter((s) => s !== '')
  } catch {
    // an unreadable ref or tree means nothing is ported, which refuses.
    return []
  }
}

function portedSet(root: string, baseRef: string): PortedSet {
  const tracked = new Set(gitList(root, ['ls-files', '-z']))
  const atBase = new Set(gitList(root, ['ls-tree', '-r', '--name-only', '-z', baseRef]))
  const mtsList: string[] = []
  const members: Ported[] = []
  for (const m of [...tracked].sort()) {
    if (!m.endsWith('.mts')) continue
    const stem = m.slice(0, -4)
    const absent = [`${stem}.sh`, ...(atBase.has(stem) ? [stem] : [])].filter((p) => !tracked.has(p))
    if (absent.length === 0) continue
    const k = mtsList.push(m) - 1
    for (const sh of absent) members.push({ sh, k })
  }
  return { members, mtsList }
}

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1)

// tokenRegex — every reference to a ported path: its repo-relative path, or its
// bare basename when exactly one ported .sh has it (an extensionless path has
// no basename form: `blueprint` is a word).
function tokenRegex(d: PortedSet, side: 'base' | 'head'): { re: RegExp; byName: Map<string, number>; byBase: Map<string, number> } | undefined {
  const name = (m: Ported): string => (side === 'base' ? m.sh : (d.mtsList[m.k] ?? ''))
  const byName = new Map<string, number>()
  for (const m of d.members) byName.set(name(m), m.k)
  const shMembers = d.members.filter((m) => m.sh.endsWith('.sh'))
  const count = (f: (m: Ported) => string): Map<string, number> => {
    const c = new Map<string, number>()
    for (const m of shMembers) c.set(f(m), (c.get(f(m)) ?? 0) + 1)
    return c
  }
  const shCount = count((m) => baseName(m.sh))
  const mtsCount = count((m) => baseName(d.mtsList[m.k] ?? ''))
  const byBase = new Map<string, number>()
  for (const m of shMembers) {
    if (shCount.get(baseName(m.sh)) === 1 && mtsCount.get(baseName(d.mtsList[m.k] ?? '')) === 1) {
      byBase.set(baseName(name(m)), m.k)
    }
  }
  if (byName.size === 0) return undefined
  const alt = (keys: Iterable<string>): string =>
    [...keys].sort((a, b) => b.length - a.length).map(esc).join('|')
  const tail = String.raw`(?![-\w]|\.\w)`
  const re = new RegExp(
    String.raw`(?<![-\w])(${alt(byName.keys())})${tail}` +
      (byBase.size > 0 ? String.raw`|(?<![-\w/])(${alt(byBase.keys())})${tail}` : ''),
    'g',
  )
  return { re, byName, byBase }
}

interface Canon {
  lines: string[]
  /** libs whose R3 or R5 was applied (BASE side) */
  coupled: Set<number>
  /** libs whose R4 was applied (HEAD side) */
  resolved: Set<number>
  /** BASE's own R3 prefixes per lib */
  prefixes: Map<number, Set<string>>
}

function canonicalise(
  content: string,
  side: 'base' | 'head',
  d: PortedSet,
  prefixesIn?: Map<number, Set<string>>,
): Canon | undefined {
  if (SENTINEL.test(content)) return undefined
  const tok = tokenRegex(d, side)
  if (tok === undefined) return undefined
  const prefixes = prefixesIn ?? new Map<number, Set<string>>()
  const raw = content.split('\n')
  const libInD = (li: number): boolean => d.members.some((m) => m.sh === SOURCED_LIBS[li]?.sh)
  const r3 = (line: string): { li: number; pfx: string } | undefined => {
    const m = R3_RE.exec(line)
    if (!m) return undefined
    const [, gp, gl, pfx = '', stem] = m
    if (gl !== undefined && (gl !== stem || gp !== pfx)) return undefined
    const li = SOURCED_LIBS.findIndex((l) => l.sh === `scripts/lib/${stem}.sh`)
    return li >= 0 && libInD(li) ? { li, pfx } : undefined
  }
  if (side === 'base') {
    for (const line of raw) {
      const hit = r3(line)
      if (hit) prefixes.set(hit.li, (prefixes.get(hit.li) ?? new Set()).add(hit.pfx))
    }
  }
  const active = [...SOURCED_LIBS.entries()].filter(([li]) => prefixes.has(li))
  const coupled = new Set<number>()
  const resolved = new Set<number>()
  const lines: string[] = []
  for (const line of raw) {
    let l = line
    if (side === 'base') {
      const hit = r3(line)
      if (hit && prefixes.has(hit.li)) {
        coupled.add(hit.li)
        if (lines.length > 0 && DIRECTIVE.test(lines[lines.length - 1] ?? '')) lines.pop()
        continue
      }
    }
    if (!/^\s*#/.test(l)) {
      for (const [li, lib] of active) {
        const fns = Object.keys(lib.fns)
        if (side === 'base') {
          const alt = fns.map(esc).join('|')
          const re = new RegExp(String.raw`command -v (${alt}) >/dev/null 2>&1 && |(?<![\w-])(${alt})(?![\w-])`, 'g')
          l = l.replace(re, (_m, guardFn?: string, fn?: string) => {
            if (guardFn !== undefined) {
              coupled.add(li)
              return `\u0001G${li}\u0002`
            }
            return `\u0001C${li}.${fns.indexOf(fn ?? '')}\u0002`
          })
        } else {
          const pf = [...(prefixes.get(li) ?? [])].map(esc).join('|')
          l = l.replace(new RegExp(String.raw`\[ -r "(?:${pf})${esc(lib.mts)}" \] && `, 'g'), `\u0001G${li}\u0002`)
          fns.forEach((fn, fi) => {
            const re = new RegExp(
              `${esc(lib.env)}node "(?:${pf})${esc(lib.mts)}" ${esc(lib.fns[fn] ?? '')}(?![\\w-])`,
              'g',
            )
            l = l.replace(re, () => {
              resolved.add(li)
              return `\u0001C${li}.${fi}\u0002`
            })
          })
        }
      }
    }
    l = l.replace(tok.re, (_m, p?: string, b?: string) => `\u0001T${p !== undefined ? tok.byName.get(p) : tok.byBase.get(b ?? '')}\u0002`)
    const interp = side === 'base' ? 'bash|sh' : 'node'
    l = l.replace(
      new RegExp(String.raw`(?<![-\w/.])(?:${interp}) (["']?[^\s"'\u0001]*)\u0001T(\d+)\u0002`, 'g'),
      '$1\u0001U$2\u0002',
    )
    lines.push(l)
  }
  return { lines, coupled, resolved, prefixes }
}

// BASE's ⟨P⟩ may become ⟨run P⟩ (adding node is always runnable); ⟨run P⟩ may
// become ⟨P⟩ only when the .mts is executable. Everything else must be equal.
function lineMatches(b: string, h: string, exec: (k: number) => boolean): boolean {
  if (b === h) return true
  const bp = b.split(PH_SPLIT)
  const hp = h.split(PH_SPLIT)
  if (bp.length !== hp.length) return false
  for (let i = 0; i < bp.length; i += 3) {
    if (bp[i] !== hp[i]) return false
    if (i + 2 >= bp.length) break
    const [bk, hk, n] = [bp[i + 1], hp[i + 1], bp[i + 2]]
    if (n !== hp[i + 2]) return false
    if (bk === hk || (bk === 'T' && hk === 'U') || (bk === 'U' && hk === 'T' && exec(Number(n)))) continue
    return false
  }
  return true
}

function isExecutable(root: string, path: string): boolean {
  return gitList(root, ['ls-files', '-s', '-z', '--', path])[0]?.startsWith('100755') ?? false
}

function isReferenceOnlyEdit(ctx: RefCtx, file: string, recordedSha: string): boolean {
  let baseContent: string
  try {
    baseContent = execFileSync('git', ['-C', ctx.root, 'cat-file', 'blob', recordedSha], { encoding: 'utf8' })
  } catch {
    // a blob that cannot be read cannot be compared, which refuses.
    return false
  }
  const headContent = readFileOrUndefined(`${ctx.root}/${file}`)
  if (headContent === undefined) return false
  const d = (ctx.ported ??= portedSet(ctx.root, ctx.baseRef))
  const b = canonicalise(baseContent, 'base', d)
  if (b === undefined) return false
  const h = canonicalise(headContent, 'head', d, b.prefixes)
  if (h === undefined) return false
  for (const li of b.coupled) if (!h.resolved.has(li)) return false
  if (b.lines.length !== h.lines.length) return false
  const exec = (k: number): boolean => isExecutable(ctx.root, d.mtsList[k] ?? '')
  return b.lines.every((l, i) => lineMatches(l, h.lines[i] ?? '', exec))
}

// checkTamper — HEAD's json compared against BASE's. Every problem here is a
// self-authorization attempt: HEAD claiming something about the inventory
// that BASE, which the push cannot edit, does not back up.
function checkTamper(base: Inventory, head: Inventory): string[] {
  const problems: string[] = []

  for (const file of head.exempt) {
    if (!base.exempt.includes(file)) {
      problems.push(
        `EXEMPT-GROWN: ${file} was added to "exempt", which BASE did not have. The ` +
          `exempt list may only shrink — growing it is how a push would exempt its ` +
          `own new shell file from every other check here.`,
      )
    }
  }

  for (const [file, sha] of Object.entries(head.legacy)) {
    const baseSha = base.legacy[file]
    if (baseSha === undefined) {
      problems.push(
        `ROW-ADDED: ${file} is a new row in "legacy" that BASE did not have. A row ` +
          `may only be REMOVED relative to BASE, never added — an added row plus a ` +
          `matching new file is exactly the self-authorization this gate exists to stop.`,
      )
    } else if (baseSha !== sha) {
      problems.push(
        `ROW-CHANGED: ${file}'s recorded blob changed from ${baseSha} to ${sha} in the ` +
          `pushed range itself. A legacy row's sha is BASE's to set, not the push's — ` +
          `changing both the file and its own recorded hash in one commit is exactly ` +
          `the self-authorization this gate exists to stop.`,
      )
    }
  }

  return problems
}

// checkRemovedRows — BASE legacy rows HEAD no longer has. Removing a row is
// legitimate ONLY together with its file disappearing or becoming the valid
// shim; a bare removal (the file is still there, unchanged or edited some
// other way) is refused.
function checkRemovedRows(root: string, base: Inventory, head: Inventory, files: Set<string>): string[] {
  const problems: string[] = []
  for (const file of Object.keys(base.legacy)) {
    if (file in head.legacy) continue // retained — checkTamper already judged it
    if (!files.has(file)) continue // gone entirely — a legitimate removal
    if (isValidShim(root, file)) continue // migrated — a legitimate removal
    if (isValidSourcedAdapter(root, file)) continue // migrated — the sourced-adapter form
    problems.push(
      `ROW-REMOVED-WITHOUT-MIGRATION: ${file}'s row was removed from scripts/shell-` +
        `inventory.json, but the file itself is neither gone nor the exact, tracked ` +
        `shim (or a recognised sourced adapter: scripts/lib/dod-gate.sh, scripts/lib/gate.sh). ` +
        `Remove a row only in the same commit that migrates or deletes its file.`,
    )
  }
  return problems
}

// checkTrackedFile — the verdict for one currently-tracked file, judged
// against BASE (never HEAD's own claims — checkTamper already covers those).
function checkTrackedFile(
  ctx: RefCtx,
  base: Inventory,
  effectiveExempt: Set<string>,
  file: string,
): string | undefined {
  const root = ctx.root
  if (effectiveExempt.has(file)) return undefined
  const recorded = base.legacy[file]
  if (recorded === undefined) {
    // BUG-145: a valid shim is MIGRATED, not new — accept it whether or not
    // any list names it. Once the port push (which removed the legacy row) is
    // itself the BASE, the shim has no row anywhere and would otherwise read
    // as new shell on every subsequent push.
    if (isValidShim(root, file)) return undefined
    if (isValidSourcedAdapter(root, file)) return undefined
    return (
      `NEW: ${file} is a shell file tracked in scripts/ or .githooks/ but BASE's ` +
      `scripts/shell-inventory.json covers it in neither list. New code is TypeScript ` +
      `(PLAN-TASK-067 rule 1) — add a .mts file instead, or if this really must ` +
      `be shell, get it into the closed exempt list first.`
    )
  }
  if (blobHash(root, file) === recorded) return undefined
  if (isValidShim(root, file)) return undefined
  if (isValidSourcedAdapter(root, file)) return undefined
  if (isReferenceOnlyEdit(ctx, file, recorded)) return undefined // TASK-088
  return (
    `CHANGED:${file} no longer matches its BASE-recorded blob (${recorded}) and is ` +
    `not the exact, tracked two-line shim (or a recognised sourced adapter: scripts/lib/dod-gate.sh, ` +
    `scripts/lib/gate.sh). A legacy shell file is either unchanged or migrated whole, ` +
    `behind a shim or that adapter (PLAN-TASK-067 "the rule, as it will be written").`
  )
}

// checkGoneRows — rows BASE and HEAD both still have (not a legitimate
// removal — checkRemovedRows covers those) whose file the tree no longer has.
function checkGoneRows(base: Inventory, head: Inventory, effectiveExempt: Set<string>, files: Set<string>): string[] {
  return Object.keys(base.legacy)
    .filter((file) => file in head.legacy && !effectiveExempt.has(file) && !files.has(file))
    .map(
      (file) =>
        `GONE: ${file} has a row in scripts/shell-inventory.json but is no longer ` +
        `a tracked shell file. Remove its row in the same commit that removes or ` +
        `fully migrates it.`,
    )
}

function main(): number {
  const root = process.argv[2] ?? '.'
  const base = process.argv[3]
  if (!base) {
    console.error(
      '❌ no BASE ref given — refusing to judge scripts/shell-inventory.json against ' +
        'itself. See run-ts-suites.sh\'s ts_shell_inventory_base for how one is resolved.',
    )
    return 1
  }

  const head = readInventoryFromDisk(root)
  // BOOTSTRAP: BASE has no scripts/shell-inventory.json yet (see header) —
  // trust HEAD as its own baseline for this one push only.
  const baseInv = readInventoryAtRef(root, base) ?? head

  const files = new Set(readFileList())
  const effectiveExempt = new Set(head.exempt.filter((file) => baseInv.exempt.includes(file)))

  const ctx: RefCtx = { root, baseRef: base }
  const problems = [
    ...checkTamper(baseInv, head),
    ...checkRemovedRows(root, baseInv, head, files),
    ...[...files]
      .map((file) => checkTrackedFile(ctx, baseInv, effectiveExempt, file))
      .filter((p): p is string => p !== undefined),
    ...checkGoneRows(baseInv, head, effectiveExempt, files),
  ]

  if (problems.length > 0) {
    for (const problem of problems) console.error(`❌ ${problem}`)
    return 1
  }
  console.log(
    `✓ shell inventory (base ${base}): ${Object.keys(baseInv.legacy).length} legacy ` +
      `file(s), ${baseInv.exempt.length} exempt`,
  )
  return 0
}

// TASK-081 §8 slice 0: an entry-point guard, so this module can be imported
// (tests/shell-inventory drives it as a subprocess CLI, not an import, but
// the guard is what makes that safe either way) without running main() and
// exiting the process. Mirrors scripts/rotation.mts's guard: argv[1] may not
// resolve (a wrapper, a different extension) as cleanly as a direct `node
// scripts/shell-inventory-check.mts` invocation, so the endsWith fallback
// covers that without weakening the realpath check for the normal case.
const isEntryPoint =
  process.argv[1] !== undefined &&
  (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) ||
    process.argv[1].endsWith('/shell-inventory-check.mts'))

if (isEntryPoint) process.exit(main())
