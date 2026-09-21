// scripts/shell-inventory-check.mts — TASK-067 §5: the enforcement half of
// "shell to TypeScript, organically" (docs/doing/PLAN-TASK-067-shell-to-typescript.md).
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
// (every other shell file, recorded by git blob sha). Reading the TREE (via
// `git ls-files -s`), not the push range — the same check runs identically in
// CI (a fresh checkout with no push range at all) and locally.
//
// It refuses three things:
//   - a shell file present in the tree that is in NEITHER list (a new .sh);
//   - a `legacy` file whose recorded blob no longer matches the tree, UNLESS
//     the new content is the exact two-line shim
//     (`#!/usr/bin/env bash` / `exec node "$(dirname "$0")/<basename>.mts" "$@"`)
//     — the only changed shell TASK-067's whole-file granularity accepts;
//   - a `legacy` row whose file no longer exists in the tree at all (removing
//     a row is a deliberate edit to this inventory, not a side effect of
//     deleting or renaming the file it describes).
//
// The file list comes from STDIN, one repo-relative path per line — the
// caller (scripts/run-ts-suites.sh's ts_shell_inventory) pipes `sh_lint_files`
// straight in, so "a shell file" has exactly one definition in this repo.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

interface Inventory {
  exempt: string[]
  legacy: Record<string, string>
}

function readInventory(root: string): Inventory {
  const raw = readFileSync(`${root}/scripts/shell-inventory.json`, 'utf8')
  return JSON.parse(raw) as Inventory
}

function readFileList(): string[] {
  return readFileSync(0, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// blobHash — the blob sha git has recorded for `path` right now (index/HEAD of
// a clean checkout), or undefined if git does not track it. Deliberately NOT
// `git hash-object`: that would hash an uncommitted edit in the working tree,
// and this check reads the TREE, the same thing CI's fresh checkout sees.
function blobHash(root: string, path: string): string | undefined {
  let out: string
  try {
    out = execFileSync('git', ['-C', root, 'ls-files', '-s', '--', path], {
      encoding: 'utf8',
    })
  } catch {
    return undefined
  }
  const line = out.trim()
  if (line === '') return undefined
  const sha = line.split(/\s+/)[1]
  return sha
}

function shimContent(path: string): string {
  const base = path.split('/').pop() ?? path
  const stem = base.endsWith('.sh') ? base.slice(0, -3) : base
  return `#!/usr/bin/env bash\nexec node "$(dirname "$0")/${stem}.mts" "$@"\n`
}

function readFileOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

// checkTrackedFile — the verdict for one file the tree currently has, or
// undefined when it is fine (exempt, or an unchanged/shimmed legacy file).
function checkTrackedFile(root: string, inventory: Inventory, file: string): string | undefined {
  if (inventory.exempt.includes(file)) return undefined
  const recorded = inventory.legacy[file]
  if (recorded === undefined) {
    return (
      `NEW: ${file} is a shell file tracked in scripts/ or .githooks/ but is in ` +
      `neither list of scripts/shell-inventory.json. New code is TypeScript ` +
      `(PLAN-TASK-067 rule 1) — add a .mts file instead, or if this really must ` +
      `be shell, get it into the closed exempt list first.`
    )
  }
  if (blobHash(root, file) === recorded) return undefined
  if (readFileOrUndefined(`${root}/${file}`) === shimContent(file)) return undefined
  return (
    `CHANGED: ${file} no longer matches its recorded blob (${recorded}) and is ` +
    `not the exact two-line shim. A legacy shell file is either unchanged or ` +
    `migrated whole, behind a shim (PLAN-TASK-067 "the rule, as it will be written").`
  )
}

// checkGoneRows — legacy rows whose file the tree no longer has at all.
function checkGoneRows(inventory: Inventory, files: Set<string>): string[] {
  return Object.keys(inventory.legacy)
    .filter((file) => !inventory.exempt.includes(file) && !files.has(file))
    .map(
      (file) =>
        `GONE: ${file} has a row in scripts/shell-inventory.json but is no longer ` +
        `a tracked shell file. Remove its row in the same commit that removes or ` +
        `fully migrates it.`,
    )
}

function main(): number {
  const root = process.argv[2] ?? '.'
  const inventory = readInventory(root)
  const files = new Set(readFileList())

  const problems = [
    ...[...files].map((file) => checkTrackedFile(root, inventory, file)).filter((p) => p !== undefined),
    ...checkGoneRows(inventory, files),
  ]

  if (problems.length > 0) {
    for (const problem of problems) console.error(`❌ ${problem}`)
    return 1
  }
  console.log(
    `✓ shell inventory: ${Object.keys(inventory.legacy).length} legacy file(s), ` +
      `${inventory.exempt.length} exempt`,
  )
  return 0
}

process.exit(main())
