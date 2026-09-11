/**
 * tests/env-namespace/env-namespace.ts — BUG-006, a project-specific env-var
 * namespace in a file that TRAVELS.
 *
 * `scripts/log-activity.sh` keyed its knobs on `LWA_FEED_MAX_LINES` /
 * `LWA_FEED_KEEP_LINES` / `LWA_FEED_LABEL`. `LWA` is one project's initials, and
 * that file ships to every project, so every derived project inherited
 * configuration named after somebody else's repo. Same class as BUG-002 (a
 * hardcoded state dir), BUG-009 (a project's monitor row in the seed template)
 * and BUG-010 (a fleet's persona names in a managed script): **a specific thing
 * baked into a file that travels**.
 *
 * The GENERIC guard is what this file is for. Fixing three variable names would
 * leave the next one to be found by hand, and this repo has now found four of
 * them by hand.
 *
 * THE POPULATION IS DERIVED FROM `MANAGED_FILES`, not hand-listed, so a file
 * added tomorrow is covered without anyone remembering this test exists. It is
 * passed IN rather than read here, because the authority on that list is
 * `blueprint files` — and its EXIT STATUS is part of the check (see the spec's
 * `#files`): a CLI that dies after printing some of its lines leaves a
 * truncated population, and the scan would then report "all N managed scripts
 * keep to generic namespaces" over a list the CLI never finished. Non-empty is
 * not success (BUG-029 R4).
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Prefixes a managed file may key configuration on.
 *
 * Anchored at the start, exactly as the shell's `grep -E "^($ALLOWED_PREFIXES)"`
 * was — so `CI` also admits `CI_WATCH` and `TERM` also admits `TERMINAL`. That
 * looseness is preserved rather than tightened: this is a namespace check, and
 * a name beginning with a generic prefix is generic.
 */
const ALLOWED_PREFIX =
  /^(AGENT_|BP_|BLUEPRINT_|GIT_|SIGNAL_|CODEX_|GEMINI_|CLAUDE_|SONAR_|GITHUB_|GH_|OSV_|SEMGREP_|GITLEAKS_|HOME|PATH|TMPDIR|PWD|SHELL|USER|LANG|LC_|EDITOR|NO_COLOR|TERM|CI)/

export interface EnvNamespaceScan {
  /** How many managed scripts were scanned. The non-vacuity number. */
  readonly checked: number
  /** `<file>:<NAME>` for each externally-settable knob outside the namespaces. */
  readonly offenders: readonly string[]
  /** Managed scripts still reading an `LWA_` name as their PRIMARY source. */
  readonly lwaPrimary: readonly string[]
  /** Why #3 failed, or null when `log-activity.sh` routes through the appender. */
  readonly rotationCopy: string | null
}

/** Drop `#`-comments the way `sed 's/#.*//'` does — from the first `#` on. */
const stripComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/#.*/, ''))
    .join('\n')

/**
 * Only EXTERNALLY-SETTABLE knobs: names read with a default, `${NAME:-…}` or
 * `${NAME:=…}`. That is what "an env namespace that ships" means.
 *
 * The first version of this matched every ALL-CAPS token and flagged `ROOT`,
 * `TICK`, `C_BOLD` and forty other INTERNAL variables, which are not
 * configuration and cannot be set by a derived project. A guard that reports
 * sixty false positives gets deleted, not obeyed.
 */
export function settableNames(source: string): string[] {
  const names = new Set<string>()
  for (const m of stripComments(source).matchAll(/\$\{([A-Z][A-Z0-9_]{3,}):[-=]/g)) {
    if (m[1]) names.add(m[1])
  }
  return [...names].sort()
}

/**
 * Does this file read an `LWA_` name as a PRIMARY source?
 *
 * Back-compat fallbacks are allowed — a project that set the old name must not
 * silently lose its config — but the generic name must come first. A primary
 * read looks like `${LWA_X:-default}`; a fallback looks like
 * `${AGENT_X:-${LWA_X:-default}}`, which has `AGENT_` to its left.
 */
export function readsLwaAsPrimary(source: string): boolean {
  for (const line of stripComments(source).split('\n')) {
    if (!line.includes('LWA_')) continue
    if (/(AGENT_[A-Z_]+:-\$\{LWA_|:=\$\{LWA_)/.test(line)) continue
    return true
  }
  return false
}

/** Is a managed path one this scan covers — a shell script or the CLI itself? */
export const isScannedManagedFile = (rel: string): boolean =>
  rel.endsWith('.sh') || rel.endsWith('/blueprint')

export async function scanEnvNamespace(
  root: string,
  managed: readonly string[],
): Promise<EnvNamespaceScan> {
  const offenders: string[] = []
  const lwaPrimary: string[] = []
  let checked = 0

  for (const rel of managed) {
    if (!isScannedManagedFile(rel)) continue
    let source: string
    try {
      source = await readFile(join(root, rel), 'utf8')
    } catch {
      // A managed file the project does not have yet is not an offender. The
      // shell version skipped it with `[ -f "$f" ] || continue` for the same
      // reason: MANAGED_FILES is what SHOULD travel, and tests/suite-sync is
      // where "did it" is asked.
      continue
    }

    checked++
    for (const name of settableNames(source)) {
      if (!ALLOWED_PREFIX.test(name)) offenders.push(`${rel}:${name}`)
    }
    if (readsLwaAsPrimary(source)) lwaPrimary.push(rel)
  }

  return {
    checked,
    offenders,
    lwaPrimary: [...new Set(lwaPrimary)].sort(),
    rotationCopy: await checkRotationIsShared(root),
  }
}

/**
 * #3 — the rotation is not duplicated.
 *
 * `log-activity.sh` had its own copy of "append then trim", which is how the
 * inode-preserving detail drifts: a `mv`-based rotate in one copy orphans the
 * feed supervisor's open handle while the other stays correct. One appender.
 */
export async function checkRotationIsShared(root: string): Promise<string | null> {
  const rel = 'scripts/log-activity.sh'
  let source: string
  try {
    source = await readFile(join(root, rel), 'utf8')
  } catch {
    return `${rel} not found`
  }
  if (!source.includes('lib/feed.sh')) {
    return `${rel} does not source the shared appender — it has its own copy of the rotation`
  }
  if (/tail -n .*>.*\.rot\.|wc -l < ?"?\$log/.test(stripComments(source))) {
    return `${rel} still contains its own rotation logic`
  }
  return null
}
