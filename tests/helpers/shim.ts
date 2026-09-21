/**
 * tests/helpers/shim.ts — BUG-144 commit 0.
 *
 * The two-line shim `scripts/shell-inventory-check.mts` enforces for a
 * migrated file (TASK-067), mirrored here so `tests/state-dir` and
 * `tests/watcher-liveness` can tell a migrated consumer from a legacy one and
 * read the right file.
 *
 * DUPLICATED, NOT IMPORTED — deliberately. This commit must not touch
 * anything under scripts/ (the migration itself lands in the NEXT commit),
 * and `scripts/shell-inventory-check.mts` runs `process.exit(main())` at
 * module load with nothing exported, so importing it here would tear down
 * the vitest process rather than hand back a function. The definition below
 * is byte-for-byte `shimStem`/`shimContent`/`shimTargetPath`/`isValidShim`
 * there. `tests/shell-inventory/shell-inventory.spec.ts` already proves the
 * CLI enforces exactly this shape, so the two copies drifting apart shows up
 * as a real migration passing one suite and failing the other — never as a
 * silent pass on both, which is the failure mode a shared helper usually
 * exists to prevent and duplication risks reintroducing. Kept deliberately
 * small so that risk stays visible at a glance.
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export function shimStem(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.endsWith('.sh') ? base.slice(0, -3) : base
}

export function shimContent(path: string): string {
  return `#!/usr/bin/env bash\nexec node "$(dirname "$0")/${shimStem(path)}.mts" "$@"\n`
}

/** Where the shim's own text says its .mts lives: beside it, same directory as `path`. */
export function shimTargetPath(path: string): string {
  const idx = path.lastIndexOf('/')
  const dir = idx === -1 ? '' : path.slice(0, idx + 1)
  return `${dir}${shimStem(path)}.mts`
}

function readFileOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function isTracked(root: string, path: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', path], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

/**
 * isValidShim — the content at `root/rel` is the exact two-line shim AND its
 * target .mts is both present and TRACKED. A shim whose target does not
 * exist, or exists only as an untracked scratch file, is not a migration —
 * same rule as the enforcement gate, so a fixture cannot be fooled by
 * something the gate would refuse.
 */
export function isValidShim(root: string, rel: string): boolean {
  if (readFileOrUndefined(`${root}/${rel}`) !== shimContent(rel)) return false
  const target = shimTargetPath(rel)
  return isTracked(root, target) && readFileOrUndefined(`${root}/${target}`) !== undefined
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
  const own = readFileOrUndefined(`${root}/${rel}`)
  if (own === undefined) return undefined
  if (isValidShim(root, rel)) {
    const target = shimTargetPath(rel)
    const targetSource = readFileOrUndefined(`${root}/${target}`)
    if (targetSource !== undefined) return { rel: target, source: targetSource, kind: 'ts' }
  }
  return { rel, source: own, kind: 'shell' }
}
