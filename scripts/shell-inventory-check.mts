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
  root: string,
  base: Inventory,
  effectiveExempt: Set<string>,
  file: string,
): string | undefined {
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
  return (
    `CHANGED: ${file} no longer matches its BASE-recorded blob (${recorded}) and is ` +
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

  const problems = [
    ...checkTamper(baseInv, head),
    ...checkRemovedRows(root, baseInv, head, files),
    ...[...files]
      .map((file) => checkTrackedFile(root, baseInv, effectiveExempt, file))
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
