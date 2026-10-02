/**
 * tests/helpers/shim.ts — BUG-144 commit 0, imports switched in TASK-081
 * slice 0, moved to a shipping module in the same slice's fix-before-push.
 *
 * The two-line shim `scripts/shell-inventory-check.mts` enforces for a
 * migrated file (TASK-067): `tests/state-dir` and `tests/watcher-liveness`
 * use it to tell a migrated consumer from a legacy one and read the right
 * file.
 *
 * IMPORTED, NOT DUPLICATED — FROM A FILE THAT SHIPS. TASK-081 slice 0 first
 * imported `shimStem`/`shimContent`/`shimTargetPath`/`isValidShim` from
 * `scripts/shell-inventory-check.mts` itself, once that file gained an
 * entry-point guard and exported them. That typechecked here, in the
 * blueprint, but `scripts/shell-inventory-check.mts` is `export-ignore`d
 * (blueprint-only enforcement machinery, AGENTS.md "Shell to TypeScript,
 * organically") while this file ships to every derived project — so a fresh
 * bootstrap never has the module this file imported, and its typecheck (and
 * tests/bootstrap-gate's release check) went red. The helpers live in
 * `scripts/lib/shim.mts` instead, which ships like any other `scripts/lib/`
 * module; both this file and the checker import the one definition from
 * there, and neither needs the other's shipping status.
 */

import { readFileSync } from 'node:fs'
import { shimStem, shimContent, shimTargetPath, isValidShim } from '../../scripts/lib/shim.mts'

export { shimStem, shimContent, shimTargetPath, isValidShim }

function readFileOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    // Absence is the probed state: the caller compares against undefined.
    return undefined
  }
}

/** What kind of source a static check is looking at. */
export type ConsumerKind = 'shell' | 'ts'

export interface ResolvedConsumer {
  /** The path a check should report — the shim's target when migrated, `rel` otherwise. */
  readonly rel: string
  readonly source: string
  readonly kind: ConsumerKind
}

/**
 * resolveConsumer — the source text a static check should read for `rel`:
 * its own (kind 'shell'), or its shim target's (kind 'ts') when `rel` is a
 * valid, tracked shim. `undefined` when `rel` itself is not there at all —
 * callers keep treating that as "missing", exactly as before this file
 * existed.
 *
 * WHY A KIND, NOT JUST A REDIRECT. A shell-only property — the physical-root
 * symlink walk, dependence on GNU `readlink -f`, the 40-hop cycle guard — has
 * no shell text to find in a `.mts`: Node resolves its own physical location
 * natively (`fs.realpathSync`, which also refuses a cycle on its own, no hop
 * counter needed), so those checks do not apply to a 'ts' consumer the same
 * way a plain "redirect and keep checking" would assume. Callers branch on
 * `kind` for exactly the checks where the property's SHAPE changed, and reuse
 * the shell-era logic unchanged everywhere the underlying property is still a
 * plain substring or presence check (sourcing `lib/state-dir.sh`, naming a
 * `signal.log` artefact) — a `.mts` that reaches the shared shell helper
 * across a process boundary still spells that path out in its own source.
 */
export function resolveConsumer(root: string, rel: string): ResolvedConsumer | undefined {
  return resolveConsumerOpts(root, rel, {})
}

/**
 * BUG-152 commit 1 — the same follow for a SOURCED ADAPTER (the shape
 * scripts/lib/dod-gate.sh has since BUG-147 and scripts/lib/gate.sh gains in
 * BUG-152's port): the shell file stays, but the logic it forwarded lives in
 * the `.mts` its bridge path names, so a static check that keeps reading the
 * adapter tests nothing.
 *
 * OPT-IN, NOT DEFAULT — and deliberately so. Unlike a shim, an adapter keeps
 * its function-name tail in shell, and most resolveConsumer callers check
 * properties (a sourced path, an exec bit, a physical-root block) whose
 * expected text still lives in the adapter itself. Only a check that guards
 * the LOGIC — tests/forbidden-idiom — wants the target. Callers that follow
 * must say so.
 *
 * THE TABLE IS THE CLOSED LIST of adapters the blueprint recognises
 * (scripts/shell-inventory-check.mts is the byte-equality authority for what
 * a valid adapter IS; this table only maps path → target for checks that
 * read source text). A third adapter earns a row here and in the checker
 * together, never one alone.
 */
const SOURCED_ADAPTER_TARGETS: Readonly<Record<string, string>> = {
  'scripts/lib/dod-gate.sh': 'scripts/lib/dod-gate.mts',
  'scripts/lib/gate.sh': 'scripts/lib/gate.mts',
}

export function resolveConsumerOpts(
  root: string,
  rel: string,
  opts: { readonly followSourcedAdapters?: boolean },
): ResolvedConsumer | undefined {
  const own = readFileOrUndefined(`${root}/${rel}`)
  if (own === undefined) return undefined
  if (isValidShim(root, rel)) {
    const target = shimTargetPath(rel)
    const targetSource = readFileOrUndefined(`${root}/${target}`)
    if (targetSource !== undefined) return { rel: target, source: targetSource, kind: 'ts' }
  }
  if (opts.followSourcedAdapters === true) {
    const adapterTarget = SOURCED_ADAPTER_TARGETS[rel]
    if (adapterTarget !== undefined) {
      const targetSource = readFileOrUndefined(`${root}/${adapterTarget}`)
      if (targetSource !== undefined) return { rel: adapterTarget, source: targetSource, kind: 'ts' }
    }
  }
  return { rel, source: own, kind: 'shell' }
}
