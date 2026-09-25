// scripts/lib/shim.mts — the two-line exec-shim helpers TASK-067's migration
// rule enforces (CLAUDE.md "Shell to TypeScript, organically"): what a valid
// shim's content looks like, where its `.mts` target lives, and whether a
// tracked file actually is one.
//
// SHIPS, UNLIKE scripts/shell-inventory-check.mts. That checker is
// export-ignore'd (blueprint-only enforcement machinery), but the shim SHAPE
// it enforces is not blueprint-only knowledge — tests/helpers/shim.ts, which
// ships to every derived project, needs the same shimStem/shimContent/
// shimTargetPath/isValidShim to tell a migrated consumer from a legacy one
// (tests/state-dir, tests/watcher-liveness). TASK-081 slice 0 first landed
// these as exports of the export-ignore'd checker with tests/helpers/shim.ts
// importing across that boundary, which typechecks in the blueprint (both
// files present) but fails in a fresh bootstrap, where the checker never
// arrives (BUG found before push). One definition, in a file both a shipping
// test helper and the blueprint-only checker can import without either
// depending on the other's shipping status.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// blobHash — the blob sha git has recorded for `path` right now (index/HEAD of
// a clean checkout), or undefined if git does not track it. Deliberately NOT
// `git hash-object`: that would hash an uncommitted edit in the working tree,
// and this check reads the TREE, the same thing CI's fresh checkout sees.
export function blobHash(root: string, path: string): string | undefined {
  let out: string
  try {
    out = execFileSync('git', ['-C', root, 'ls-files', '-s', '--', path], {
      encoding: 'utf8',
    })
  } catch {
    // git refusing leaves the file unrecorded, which the caller reports
    // as CHANGED. Never a pass.
    return undefined
  }
  const line = out.trim()
  if (line === '') return undefined
  return line.split(/\s+/)[1]
}

// isTracked — is `path` in git's index right now? Used for the shim TARGET,
// which readFileOrUndefined alone cannot prove is not just some untracked
// scratch file sitting on disk.
export function isTracked(root: string, path: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', path], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    // --error-unmatch exits non-zero for an untracked path. That exit code is the answer.
    return false
  }
}

export function shimStem(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.endsWith('.sh') ? base.slice(0, -3) : base
}

export function shimContent(path: string): string {
  return `#!/usr/bin/env bash\nexec node "$(dirname "$0")/${shimStem(path)}.mts" "$@"\n`
}

// shimTargetPath — where the shim's own text says its .mts lives: beside it,
// same directory as `path`.
export function shimTargetPath(path: string): string {
  const idx = path.lastIndexOf('/')
  const dir = idx === -1 ? '' : path.slice(0, idx + 1)
  return `${dir}${shimStem(path)}.mts`
}

export function readFileOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    // Absence is the probed state: the caller compares against undefined.
    return undefined
  }
}

// isValidShim — the content matches the exact two-line shim AND its target
// .mts is both present and TRACKED. A shim whose target does not exist (or
// exists only as an untracked scratch file) is not a migration.
export function isValidShim(root: string, path: string): boolean {
  if (readFileOrUndefined(`${root}/${path}`) !== shimContent(path)) return false
  const target = shimTargetPath(path)
  return isTracked(root, target) && readFileOrUndefined(`${root}/${target}`) !== undefined
}
