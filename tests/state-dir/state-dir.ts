/**
 * tests/state-dir/state-dir.ts — A-09's static half.
 *
 * THE DEFECT. The activity feed derived `~/.<repo-basename>` at runtime, but the
 * Codex/Gemini dispatchers hardcoded a literal, never-substituted bootstrap
 * placeholder as their state dir. So EVERY blueprint-derived checkout's
 * dispatcher wrote into that one shared directory, and any feed pointed there saw
 * every other project's Codex output interleaved. Not hypothetical: a redcare
 * acceptance verdict surfaced live in this project's feed.
 *
 * The fix is ONE mechanism — `scripts/lib/state-dir.sh` — sourced by the feed AND
 * every dispatcher, never two implementations that agree when a substitution
 * happens to line up.
 *
 * WHAT IS HERE AND WHAT IS NOT. The checks below read source text: which files
 * source the helper, whether a state path is built anywhere else, whether the
 * duplicated root-resolution block has drifted. The BEHAVIOURAL half — run the
 * real launcher through an out-of-tree symlink under a hostile GIT_DIR and see
 * where the bytes land — lives in the spec, because no amount of reading source
 * can answer it. The spec says so where the two meet: #5b is a cheap first line
 * that fails fast and names the file, and #8/#9 are the actual boundary.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The three dispatchers that must rendezvous with the feed on one directory. */
export const DISPATCHERS = [
  'scripts/start-codex-signal-watch.sh',
  'scripts/codex-signal-watch.sh',
  'scripts/start-gemini-signal-watch.sh',
] as const

/** Every consumer of the shared derivation — the feed plus the dispatchers. */
export const CONSUMERS = ['scripts/agent-activity.sh', ...DISPATCHERS] as const

/**
 * Artefact FILENAMES, with their extensions.
 *
 * Matching the bare token `last-message` also matched codex's
 * `--output-last-message` FLAG, whose value was correctly derived — and a guard
 * that flags the flag teaches people to ignore it. The artefacts are files, so
 * they are matched as files.
 */
const ARTEFACT = /runs\.log|signal\.log|last-message\.md/
/** A variable whose value came from the shared helper. */
const DERIVED = /STATE_DIR|state_dir|LOG_FILE|agent_state_dir/
/** An assignment to the state-dir variable. */
const STATE_ASSIGN = /^[ \t]*(?:STATE_DIR|state_dir|LOG_FILE)=/
/**
 * An operator passing an explicit path on the command line is the same
 * sanctioned override as `AGENT_STATE_HOME`, so `LOG_FILE="$2"` inside argument
 * parsing is not a reconstruction. Kept deliberately narrow — only a bare
 * positional — because anything looser is a hole: a reconstruction has to build
 * the path from parts, and it cannot do that with `"$2"` alone.
 */
const POSITIONAL_OVERRIDE = /="\$\d"$/

export interface StateDirScan {
  /** #3 — dispatchers that build a state/log path from the literal placeholder. */
  readonly literalPlaceholder: readonly string[]
  /** #3 — did any dispatcher name a run/signal/last-message path at all? */
  readonly sawAnyLogPath: boolean
  /** #4 — consumers that do NOT source the shared helper. */
  readonly notSourcingHelper: readonly string[]
  /** #5b — consumers building a state path outside the helper, tagged (A)/(B). */
  readonly structural: readonly string[]
  /** #7 — how many consumers carry the physical-root block. */
  readonly rootBlockCount: number
  /** #7 — consumers whose block differs from the first one found. */
  readonly rootBlockDrifted: readonly string[]
  /** #7 — consumers with no physical-root block at all. */
  readonly rootBlockMissing: readonly string[]
  /** #10 — consumers depending on GNU `readlink -f`. */
  readonly gnuReadlink: readonly string[]
  /** #10e — consumers missing the hop-exhaustion guard. */
  readonly noHopGuard: readonly string[]
  /** Consumers that are simply absent — every check above skips them. */
  readonly missing: readonly string[]
  /**
   * #3's own half of that: a DISPATCHER that is not there.
   *
   * Reported separately because the shell control failed #3 on it — "dispatcher
   * X not found — cannot assert on it" — rather than folding it into the
   * consumer-wide count. Keeping the two apart is what made the ported #3's
   * verdict match the retiring one on a tree with a deleted dispatcher; the
   * first version routed it to `missing` alone and disagreed there.
   */
  readonly missingDispatchers: readonly string[]
}

const stripComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/#.*/, ''))
    .join('\n')

/**
 * Strip comments AND the usage heredoc.
 *
 * Both are documentation, not code paths: `--log PATH (default:
 * <repo>/logs/state/signal.log)` legitimately names an artefact to a human and
 * derives nothing. Mixing their correctness in here would mean the structural
 * rule fires on prose and gets ignored.
 */
function body(source: string): string {
  const lines = source.split('\n')
  const out: string[] = []
  let inUsage = false
  for (const line of lines) {
    if (line.includes("<<'USAGE'")) {
      inUsage = true
      continue
    }
    if (inUsage) {
      if (line === 'USAGE') inUsage = false
      continue
    }
    out.push(line.replace(/#.*/, ''))
  }
  return out.join('\n')
}

/** The extracted `_bp_self=` … `_bp_root=` block, or null when absent. */
export function physicalRootBlock(source: string): string | null {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => l.startsWith('_bp_self='))
  if (start === -1) return null
  const end = lines.findIndex((l, i) => i >= start && l.startsWith('_bp_root='))
  if (end === -1) return null
  return lines.slice(start, end + 1).join('\n')
}

/**
 * #5b — the STRUCTURAL guard, and it is not a `$HOME` blocklist.
 *
 * The first version grepped for `$HOME` shapes. Codex broke it in one pass with
 * two lines that reintroduce the bug and match no pattern — one using braces,
 * one naming no artefact near `$HOME` — and widening the regex to catch those
 * invites the next two spellings. A blocklist of ways to spell a bad path can
 * never be complete, and every widening step made the guard fire on legitimate
 * uses (`$HOME/.claude/projects`, `$HOME/.nvm`).
 *
 * So it asserts the REQUIREMENT instead of enumerating violations. Two rules:
 *
 *   A. a line naming a state artefact must root it in a helper-derived variable;
 *   B. an assignment to the state-dir variable must call `agent_state_dir`.
 *
 * Any reconstruction — `$HOME`, `${HOME}`, `printf`, a hardcoded absolute path, a
 * spelling nobody has thought of — fails one of these, because it has to name an
 * artefact or set the dir, and both routes are checked.
 *
 * HONEST LIMIT, because the previous version of this comment over-claimed and
 * Codex broke it a second time: this is still a heuristic over source text. He
 * defeated it again by putting the bad directory in an unlisted variable and
 * building `codex-runs` and `.log` separately — no complete artefact name, no
 * listed assignment. The variable-name list is the weak point and cannot be
 * closed by adding names. **The spec's #8/#9 are the real boundary**; this is a
 * cheap first line that fails fast and points at the file, not a proof.
 */
export function structuralViolations(rel: string, source: string): string[] {
  const found: string[] = []
  const code = body(source)
  const lines = code.split('\n')

  if (lines.some((l) => ARTEFACT.test(l) && !DERIVED.test(l))) found.push(`${rel}(A)`)
  if (
    lines.some(
      (l) => STATE_ASSIGN.test(l) && !POSITIONAL_OVERRIDE.test(l) && !l.includes('agent_state_dir'),
    )
  ) {
    found.push(`${rel}(B)`)
  }
  return found
}

/** Names a run/signal/last-message artefact anywhere — #3's non-vacuity target. */
const NAMES_ARTEFACT = /runs\.log|signal\.log|last-message/
/** A line that BUILDS a state or log path, as opposed to mentioning one. */
const BUILDS_STATE_PATH = /runs\.log|signal\.log|last-message|mkdir/

/**
 * #3 — no dispatcher builds a state/log path from the literal placeholder.
 *
 * Both conditions must hold ON THE SAME LINE: the placeholder appears in prose
 * elsewhere legitimately (`scripts/lib/state-dir.sh`'s own header quotes the
 * defective path as the incident record), so a file-level match would fire on
 * every file that documents the bug.
 */
function scanDispatcherPaths(sources: ReadonlyMap<string, string>): {
  literalPlaceholder: string[]
  sawAnyLogPath: boolean
} {
  const literalPlaceholder = new Set<string>()
  let sawAnyLogPath = false

  for (const rel of DISPATCHERS) {
    const source = sources.get(rel)
    if (source === undefined) continue
    if (NAMES_ARTEFACT.test(source)) sawAnyLogPath = true
    for (const line of source.split('\n')) {
      if (line.includes('{{PROJECT_NAME}}') && BUILDS_STATE_PATH.test(line)) {
        literalPlaceholder.add(rel)
      }
    }
  }

  return {
    literalPlaceholder: [...literalPlaceholder].sort((a, b) => a.localeCompare(b)),
    sawAnyLogPath,
  }
}

/** #7 — the physical-root block, byte-compared across every consumer that has one. */
function scanRootBlocks(sources: ReadonlyMap<string, string>): {
  rootBlockCount: number
  rootBlockDrifted: string[]
  rootBlockMissing: string[]
} {
  const rootBlockDrifted: string[] = []
  const rootBlockMissing: string[] = []
  let signature: string | null = null
  let rootBlockCount = 0

  for (const rel of CONSUMERS) {
    const source = sources.get(rel)
    if (source === undefined) continue

    const block = physicalRootBlock(source)
    if (block === null) {
      rootBlockMissing.push(rel)
      continue
    }
    rootBlockCount++
    // It HAS to be duplicated: it is the code that FINDS scripts/lib/, so it
    // cannot itself live in scripts/lib/. Duplication that cannot be removed is
    // pinned instead, or the four copies drift and A-09 comes back through
    // whichever one was forgotten.
    if (signature === null) signature = block
    else if (block !== signature) rootBlockDrifted.push(rel)
  }

  return { rootBlockCount, rootBlockDrifted, rootBlockMissing }
}

export async function scanStateDir(root: string): Promise<StateDirScan> {
  const sources = new Map<string, string>()
  const missing: string[] = []

  for (const rel of CONSUMERS) {
    try {
      sources.set(rel, await readFile(join(root, rel), 'utf8'))
    } catch {
      missing.push(rel)
    }
  }

  const notSourcingHelper: string[] = []
  const structural: string[] = []
  const gnuReadlink: string[] = []
  const noHopGuard: string[] = []

  for (const [rel, source] of sources) {
    if (!source.includes('lib/state-dir.sh')) notSourcingHelper.push(rel)
    structural.push(...structuralViolations(rel, source))
    if (/readlink -f/.test(stripComments(source))) gnuReadlink.push(rel)
    if (!source.includes('exceeds 40 hops')) noHopGuard.push(rel)
  }

  return {
    ...scanDispatcherPaths(sources),
    ...scanRootBlocks(sources),
    missingDispatchers: DISPATCHERS.filter((rel) => !sources.has(rel)),
    notSourcingHelper,
    structural,
    gnuReadlink,
    noHopGuard,
    missing,
  }
}
