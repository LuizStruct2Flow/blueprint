/**
 * tests/manifest/manifest.ts — the coverage control, as inspectable functions.
 *
 * BUG-005 / Codex F1 — make the coverage policy a CONTROL instead of a slogan.
 *
 * The 30 s pre-push ceiling was removed because it had become a coverage policy:
 * a suite that outgrew the budget got demoted to CI-only, and the gate carried
 * on printing "all checks passed" over less. The rule that replaced it — that
 * coverage is decided on risk, never on the clock — was claimed to be enforced
 * by `pipe_skip`, because a skip must carry a reason. That was false: a suite
 * simply OMITTED from `.githooks/pre-push-project` never reaches `pipe_skip` at
 * all, so deleting a `pipe_stage` block is a one-line silent coverage cut and
 * the pipeline still renders PASSED. `signal-dispatch` was the live proof.
 *
 * The questions a filesystem derivation cannot answer about itself, which is
 * everything this module checks:
 *
 *   - does every runner on disk actually get RUN, by the gate and by CI?
 *   - does the export boundary BEHAVE the way `.gitattributes` declares?
 *   - do bootstrap and pull deliver the same thing?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MODULE AND NOT ONLY A SPEC (TASK-018).
 *
 * `inspect()` takes the root it inspects and the runner it spawns with, so the
 * same code answers for three trees: this repo (manifest.spec.ts), a synthetic
 * perturbed tree (the fixture cases, which are what make each assertion
 * provably able to fail — R6), and a freshly BOOTSTRAPPED project
 * (tests/bootstrap-gate #6, which is the only case speaking for downstream).
 *
 * It used to be one shell file that all three drove as a subprocess. That
 * worked because a shell file is executable anywhere; a spec is not, and
 * bootstrap-gate would otherwise have had to `npm ci` inside a fixture on every
 * push. A module import costs nothing and the fixture cases come free with it.
 *
 * ---------------------------------------------------------------------------
 * BUG-051 — THE DEFECT THAT RETURNS THROUGH A DOOR THE CONTROL CANNOT SEE.
 *
 * Every assertion here used to be anchored on `*.sh`, so the whole control had
 * one shape of blind spot, and it was exactly the shape of the TypeScript
 * migration: move a suite to TS, delete its `.sh`, and nothing failed — no
 * discovery error, because no shell file remained to find.
 *
 * A RUNNER is therefore a `*.sh` OR a `*.spec.ts`, everywhere, including both
 * directions of the export boundary. Discovery lives in `scripts/lib/suites.sh`
 * and THIS FILE DOES NOT KEEP A COPY OF IT — it shells out to that library.
 * `scripts/run-ts-suites.sh` once grew a verbatim copy of the same parse, under
 * a comment claiming to be the thing that could not drift, and it had already
 * drifted. A control that discovers suites its own way is asserting something
 * about its own `find`, not about what runs.
 *
 * A TS suite is not invoked the way a shell suite is. One `vitest run` covers
 * the whole tree (PLAN-TASK-018 §7.3), so there is no per-suite command to grep
 * for. Nor does the hook run vitest itself: it sources `scripts/run-ts-suites.sh`
 * and calls into it. So the invocation proof is a CHAIN, and every link is
 * checked:
 *
 *     the spec exists   AND   the hook reaches the bridge it sources
 *                       AND   the bridge runs vitest with no path filter
 *                       AND   the vitest config's include actually covers it
 *
 * Break any link and #4 fails: delete the spec (1), delete the stage from the
 * hook or delete the bridge (2), give the bridge's run a positional path (3),
 * narrow the include glob (4). What is deliberately NOT accepted is "a spec
 * exists somewhere" — that would be a nothing-assertion in a new costume.
 *
 * ---------------------------------------------------------------------------
 * MIGRATION IS REPLACEMENT, NOT ACCUMULATION.
 *
 * There used to be a RETIRED-SHELL-RUNNERS table: a suite could keep a `*.sh`
 * the gate no longer invoked, provided a row named the mutant that proved its
 * spec equivalent. The table is gone with tests/SUITES.md. The rule is now the
 * simple one: **every runner on disk is invoked.** A suite migrating to
 * TypeScript deletes its shell runner in the same change that adds its spec,
 * having run the mutant first (R6).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PORT LOST, STATED RATHER THAN QUIETLY DROPPED.
 *
 * The shell version's #9 asserted, BY EXECUTION, that this control invokes no
 * Node toolchain: it re-ran itself with node/npm/npx/tsc/vitest replaced by
 * shims that exit 127, and failed if any was touched or if the poisoned run
 * disagreed. It existed because tests/manifest governs its own migration — a
 * checkout part-way through TASK-018, or a host with no toolchain, still had to
 * get a truthful answer out of its own coverage control.
 *
 * That property cannot survive the port. A vitest spec IS a Node toolchain, and
 * no wording makes it survive. It is a REAL reduction and it is recorded here
 * rather than argued away.
 *
 * What stands in its place is fail-closed rather than fail-quiet, and it lives
 * in `scripts/run-ts-suites.sh`: with no `npx`, or with `tests/node_modules`
 * absent, the bridge calls `pipe_stage … false` and BLOCKS the push instead of
 * `pipe_skip`ping it. So a toolchain-less checkout gets no answer and cannot
 * push, rather than a wrong answer it believes. That is the safe direction to
 * be wrong in, and it is weaker than what #9 gave. `tests/ts-bridge` asserts
 * the blocking behaviour.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** One check's verdict. `ok: false` carries the message the operator reads. */
export interface CheckResult {
  readonly id: string
  readonly ok: boolean
  readonly message: string
}

/** A process runner. `scenario.run` satisfies it; nothing else is accepted. */
export type Runner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number },
) => Promise<{ code: number | null; stdout: string; output: string }>

/**
 * The toolchain files a `.spec.ts` needs in order to be executable at all.
 *
 * DECLARED ONCE, read by both #2b and #2c. It used to be two hand-written
 * lists and BUG-061 walked straight through the gap between them:
 * package-lock.json was in neither list nor the export-ignore block, so it
 * shipped ALONE to every derived project while both checks printed "phase 1 is
 * whole". An AND over a remembered subset cannot see a file it does not know
 * about — so the partial-ship tally in #2c, not this list, is what closes the
 * class.
 */
const TS_TOOLCHAIN = [
  'tests/package.json',
  'tests/package-lock.json',
  'tests/tsconfig.json',
  'tests/vitest.config.ts',
] as const

/** Regex-safe form of a suite name, which may legitimately contain `.` or `-`. */
const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function readOr(path: string, fallback = ''): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return fallback
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * The files with COMMENT LINES REMOVED.
 *
 * Codex R2-F1b: membership was checked with an unanchored grep for the path, so
 * commenting out an invocation kept the control green while the suite stopped
 * running. Reproduced: `sed -i '/tests\/pipeline/s/^/#/' .githooks/pre-push*`
 * left the manifest passing "every suite is invoked by the gate". Strip
 * comments first, then require an anchored command rather than arbitrary text
 * containing the path.
 */
export function liveCmds(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/#.*/, ''))
    .join('\n')
}

/** Shell function definitions in one file's live text. */
function definedFuncs(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const m = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*\([ \t]*\)[ \t]*\{/.exec(line)
    if (m?.[1]) out.push(m[1])
  }
  return out
}

/**
 * The bridges a set of files genuinely REACHES.
 *
 * The gate does not run vitest itself: `.githooks/pre-push-project` sources
 * `scripts/run-ts-suites.sh` and calls `ts_suites_stage`, and the actual
 * `npx vitest run` lives in there — because that file also declares the
 * expected suite list to the pipeline and injects one `pipe_stage_report` per
 * suite, so `bootstrap-gate` #3's >=25-stage guard and the slowest-stage SLO
 * keep meaning something (PLAN-TASK-018 §7.3).
 *
 * So "the gate's live commands" means the hook PLUS the files it sources — but
 * only the ones it genuinely reaches. A sourced file that merely DEFINES a
 * function is not running anything, and that is precisely the case where text
 * appears without executing. A bridge therefore counts only when all three
 * hold: the hook sources it by a literal relative path, the file EXISTS (an
 * absent bridge is `pipe_skip`ped at runtime, and a skip carries a reason but
 * is still not running), and the hook CALLS a function the file defines.
 *
 * Nothing here is specific to `run-ts-suites.sh`: the bridge is discovered, not
 * named. Only ONE hop is followed. A bridge that sources a second bridge fails
 * closed — no blanket run is found and #4 says so — which is the right
 * direction to be wrong in, and the fix is to extend this walk.
 */
export async function liveBridges(root: string, text: string): Promise<string[]> {
  // BUG-074 — THE SHELL VERSION COULD ONLY SEE AN INDENTED `source` LINE.
  //
  // It found candidates with a grep and then stripped the verb with
  // `s/.*[[:space:]](\.|source)[[:space:]]+//`, which requires whitespace
  // BEFORE the dot. A bridge sourced at column 0 — ordinary shell — came out of
  // that sed as the literal `. ./scripts/run-ts-suites.sh`, failed its `[ -f ]`
  // test and was never discovered. #4 then failed for the wrong reason (fail
  // closed) and #2c's ships-⟺-managed check silently skipped that bridge
  // entirely (fail OPEN, which is the half that matters). Every source line in
  // this repo's hooks happens to be indented, which is the only reason it
  // stayed latent. Anchoring on the match itself removes the class.
  const found = new Set<string>()
  const src = /(^|[ \t])(\.|source)[ \t]+"?(\$ROOT\/)?\.?\/?([A-Za-z0-9_][A-Za-z0-9_./-]*)/gm
  const candidates = new Set<string>()
  for (const m of text.matchAll(src)) if (m[4]) candidates.add(m[4])

  for (const rel of [...candidates].sort()) {
    const abs = join(root, rel)
    if (!(await exists(abs))) continue
    const body = liveCmds(await readOr(abs))
    for (const fn of definedFuncs(body)) {
      if (new RegExp(`(^|[^A-Za-z0-9_./-])${rx(fn)}([ \t]|$)`, 'm').test(text)) {
        found.add(abs)
        break
      }
    }
  }
  return [...found].sort()
}

/** Those files' live commands, plus every bridge they reach. */
export async function deepCmds(root: string, files: string[]): Promise<string> {
  const own = liveCmds((await Promise.all(files.map((f) => readOr(f)))).join('\n'))
  const bridges = await liveBridges(root, own)
  const bodies = await Promise.all(bridges.map((b) => readOr(b)))
  return [own, ...bodies.map(liveCmds)].join('\n')
}

/**
 * One line per invocation of the vitest runner:
 *
 *   BLANKET vitest   a run over the whole tree: no positional path argument
 *   BLANKET npm      ditto, reached through `npm test` / `npm run test`
 *   ARGS <words>     a run NARROWED to those paths — proves nothing about a
 *                    suite it does not name
 *
 * The distinction is the whole assertion. `vitest run pipeline` in the gate
 * must not be readable as "every suite is invoked".
 */
export function classifyCmds(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const f = line.split(/[ \t]+/).filter((w) => w !== '')
    let verb = -1
    let kind = ''
    for (let i = 0; i < f.length; i++) {
      if (verb >= 0) break
      if (f[i] === 'vitest' && f[i + 1] === 'run') {
        verb = i + 1
        kind = 'vitest'
      } else if (f[i] === 'npm' && f[i + 1] === 'test') {
        verb = i + 1
        kind = 'npm'
      } else if (f[i] === 'npm' && f[i + 1] === 'run' && f[i + 2] === 'test') {
        verb = i + 2
        kind = 'npm'
      }
    }
    if (verb < 0) continue
    const args: string[] = []
    for (let i = verb + 1; i < f.length; i++) {
      const w = f[i] as string
      if (w === '--' || w.startsWith('-')) continue
      args.push(w)
    }
    out.push(args.length === 0 ? `BLANKET ${kind}` : `ARGS ${args.join(' ')}`)
  }
  return out
}

/**
 * The `test` script out of tests/package.json, WITHOUT Node.
 *
 * Kept as a text parse rather than `JSON.parse` on purpose: the shell version
 * could not use a JSON parser and this must stay verdict-identical to it. If
 * this cannot be parsed the result is empty, which classifies as "not a blanket
 * run" — fail closed.
 */
export function npmTestScript(pkgText: string): string[] {
  const flat = pkgText.replace(/\n/g, '')
  const m = /"scripts"[^{]*\{/.exec(flat)
  if (!m) return []
  const body = flat.slice(m.index + m[0].length).replace(/\}.*/, '')
  const out: string[] = []
  for (const part of body.split(',')) {
    const t = /"test"[ \t]*:[ \t]*"([^"]*)"/.exec(part)
    if (t?.[1]) out.push(t[1])
  }
  return out
}

/** Is there a whole-tree vitest run anywhere in this text? */
export function blanketOf(text: string, pkgText: string): boolean {
  // Shell metacharacters become line breaks first, so
  // `pipe_stage "x" npm test || { … }` is classified as the `npm test` it is,
  // and a stray `}` is not read as a path filter.
  const kinds = classifyCmds(text.replace(/[|&;(){}]/g, '\n'))
  if (kinds.includes('BLANKET vitest')) return true
  if (kinds.some((k) => k === 'BLANKET npm')) {
    const scripts = npmTestScript(pkgText)
    if (classifyCmds(scripts.join('\n')).includes('BLANKET vitest')) return true
  }
  return false
}

/**
 * Link 4 of the chain: the configured include must actually reach the specs.
 *
 * Narrowing this glob is a coverage cut that would otherwise leave every other
 * link intact and every assertion green. The glob is `**\/*.spec.ts` and not
 * `tests/**\/*.spec.ts` because the config sits inside tests/, which is
 * therefore vitest's root (TASK-020).
 */
export function includeOk(cfgText: string): boolean {
  if (cfgText === '') return false
  const flat = cfgText.replace(/[ \n]/g, '')
  return /include:\[[^\]]*["']\*\*\/\*\.spec\.ts["']/.test(flat)
}

/** Lines containing a marker token — `grep -c`, which counts LINES. */
export function markerBalance(text: string, prefix: string): [number, number] {
  const lines = text.split('\n')
  return [
    lines.filter((l) => l.includes(`${prefix}:BEGIN`)).length,
    lines.filter((l) => l.includes(`${prefix}:END`)).length,
  ]
}

/**
 * MANAGED_FILES, read TEXTUALLY out of `scripts/blueprint`.
 *
 * Never by running `blueprint files`: the CLI touches the real repo, and this
 * has to stay an inspection. A textual parse can go stale in silence, and stale
 * here would pass vacuously — so #2c asserts its own non-vacuity first.
 */
export function parseManagedFiles(blueprintText: string): string[] {
  const out: string[] = []
  let inside = false
  for (const line of blueprintText.split('\n')) {
    if (!inside) {
      if (/^MANAGED_FILES=\(/.test(line)) inside = true
      continue
    }
    if (/^\)/.test(line)) break
    const m = /^[ \t]*"([^"]*)"/.exec(line)
    if (m?.[1]) out.push(m[1])
  }
  return out
}

interface Derivation {
  /** suite -> runner paths, relative to root. `''` is the no-suite bucket. */
  readonly runners: Array<{ suite: string; path: string }>
  /** suite -> tier (`blueprint` | `both`). */
  readonly rows: Array<{ suite: string; tier: string }>
  readonly names: string[]
}

/**
 * THE SUITE DERIVATION LIVES IN scripts/lib/suites.sh, AND THIS FILE DOES NOT
 * KEEP A COPY OF IT.
 *
 * Sourced by absolute path and REQUIRED. A missing library must not degrade to
 * an empty derivation: every assertion below passes trivially over zero suites,
 * which is precisely the vacuity #7 exists to catch — but it would catch it one
 * step too late and blame the tree rather than the missing file.
 */
async function derive(root: string, run: Runner): Promise<Derivation | null> {
  const script = [
    'set -u',
    '. "$1/scripts/lib/suites.sh" || exit 1',
    'command -v bp_suite_runners >/dev/null 2>&1 || exit 1',
    'command -v bp_suite_rows >/dev/null 2>&1 || exit 1',
    'echo "--RUNNERS--"',
    'bp_suite_runners "$1"',
    'echo "--ROWS--"',
    'bp_suite_rows "$1"',
  ].join('\n')
  const r = await run('sh', ['-c', script, 'sh', root], { cwd: root })
  if (r.code !== 0) return null

  const [, runnerBlock = '', rowBlock = ''] = r.stdout.split(/^--(?:RUNNERS|ROWS)--$/m)
  const runners = runnerBlock
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => {
      const [suite = '', path = ''] = l.split('\t')
      return { suite, path }
    })
  const rows = rowBlock
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => {
      const [suite = '', tier = ''] = l.split('\t')
      return { suite, tier }
    })
  return { runners, rows, names: rows.map((r) => r.suite) }
}

/** `git archive HEAD | tar -t`, i.e. what a derived project actually receives. */
async function archiveListing(root: string, run: Runner): Promise<string[]> {
  const r = await run(
    'sh',
    ['-c', 'git -C "$1" archive --format=tar HEAD 2>/dev/null | tar -t 2>/dev/null', 'sh', root],
    { cwd: root, timeoutMs: 120_000 },
  )
  return r.stdout.split('\n').filter((l) => l !== '')
}

const ok = (id: string, message: string): CheckResult => ({ id, ok: true, message })
const bad = (id: string, message: string): CheckResult => ({ id, ok: false, message })

/**
 * Run the whole control over one tree.
 *
 * `root` is the tree under inspection; `run` is the sandboxed process runner
 * that reaches it. Returns one verdict per check, in the order the shell
 * version printed them, so a verdict-by-verdict comparison is mechanical.
 */
export async function inspect(root: string, run: Runner): Promise<CheckResult[]> {
  const checks: CheckResult[] = []

  const d = await derive(root, run)
  if (!d) {
    return [
      bad(
        'suites-lib',
        'scripts/lib/suites.sh did not load — there is no suite derivation, so every ' +
          'assertion here would pass over zero suites. Run: blueprint pull scripts/lib/suites.sh',
      ),
    ]
  }

  const gatePath = join(root, '.githooks/pre-push-project')
  const hookPath = join(root, '.githooks/pre-push')
  const ciPath = join(root, '.github/workflows/security.yml')
  const pkgText = await readOr(join(root, 'tests/package.json'))
  const cfgText = await readOr(join(root, 'tests/vitest.config.ts'))

  const suitesWithSh = new Set(
    d.runners.filter((r) => r.suite !== '' && r.path.endsWith('.sh')).map((r) => r.suite),
  )
  const suitesWithTs = new Set(
    d.runners.filter((r) => r.suite !== '' && r.path.endsWith('.spec.ts')).map((r) => r.suite),
  )

  // =========================================================================
  // 1. EVERY RUNNER BELONGS TO A SUITE.
  //
  //    The derivation classifies by DIRECTORY. A runner sitting directly in
  //    `tests/` belongs to no suite at all — nothing invokes it, no export rule
  //    covers it, and it would execute nowhere while looking exactly like a
  //    test. `bp_suite_runners` emits it with an empty suite field rather than
  //    dropping it, which is the only reason this is checkable at all.
  // =========================================================================
  const toplevel = d.runners.filter((r) => r.suite === '' && r.path !== '').map((r) => r.path)
  checks.push(
    toplevel.length > 0
      ? bad(
          '#1',
          `#1 runners sit directly in tests/ and belong to no suite: ${toplevel.join(' ')}\n` +
            '        Move each into tests/<suite>/ — the gate, CI and the export\n' +
            '        boundary all address suites by directory, so a file here runs nowhere.',
        )
      : ok('#1', '#1 every runner (*.sh or *.spec.ts) under tests/ belongs to a suite directory'),
  )

  // #1b — the compensating control for the helpers exemption in the derivation.
  // A helper is exempt from being a suite because it is sourced rather than
  // run, so the thing to assert is that it IS sourced: an unreferenced file
  // there is dead code that no gate stage and no CI job would ever have
  // complained about.
  const helperNames: string[] = []
  for (const dir of ['tests/helpers', 'tests/__helpers__']) {
    let entries: string[]
    try {
      entries = await readdir(join(root, dir))
    } catch {
      continue
    }
    for (const e of entries.sort()) if (e.endsWith('.sh')) helperNames.push(e)
  }
  const shellSources: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name === 'helpers' || e.name === '__helpers__' || e.name === 'node_modules') continue
        await walk(join(dir, e.name))
      } else if (e.name.endsWith('.sh')) {
        shellSources.push(await readOr(join(dir, e.name)))
      }
    }
  }
  await walk(join(root, 'tests'))
  const allShell = shellSources.join('\n')
  const orphans = helperNames.filter((n) => !allShell.includes(`helpers/${n}`))
  checks.push(
    orphans.length > 0
      ? bad(
          '#1b',
          `#1b shared helpers that no suite sources: ${orphans.join(' ')} — exempt from being a suite, so nothing else would catch them`,
        )
      : ok('#1b', '#1b every shared helper is sourced by at least one suite'),
  )

  // A `blueprint`-tier suite drives machinery that exists ONLY here. It is
  // export-ignore'd, so in a DERIVED project it is legitimately absent — and,
  // since the suite set is derived from disk, absent means it never appears in
  // that project's derivation at all. `.blueprint-root` is the same positive
  // marker `drift` uses.
  const inBlueprint = await exists(join(root, '.blueprint-root'))

  if (inBlueprint) {
    checks.push(...(await exportBoundary(root, run, d)))
  }

  // =========================================================================
  // 4. EVERY SUITE IS ACTUALLY INVOKED BY THE GATE.
  //    A tree full of suites the gate never runs would be a more convincing
  //    version of the same silence.
  //
  //    Two runner kinds, two proofs, and a suite mid-migration owes BOTH — a
  //    spec that executes nowhere is dead code wearing the name of a suite,
  //    which is the state `drift-in-blueprint` was found in (running in neither
  //    the gate nor CI).
  //
  //    NO TIER TEST HERE, and none is needed. A `blueprint`-tier suite is
  //    `both` plus "does not ship": it still blocks the push HERE. Downstream
  //    it is not on disk, so it is not in the derivation and there is nothing
  //    to skip.
  // =========================================================================
  const gateCmds = await deepCmds(root, [gatePath, hookPath])
  const hasCi = await exists(ciPath)
  const ciCmds = hasCi ? await deepCmds(root, [ciPath]) : ''

  const tsPresent = suitesWithTs.size > 0
  const gateBlanket = tsPresent && blanketOf(gateCmds, pkgText)
  const ciBlanket = tsPresent && hasCi && blanketOf(ciCmds, pkgText)
  const includeCovers = includeOk(cfgText)

  const shInvoked = (cmds: string, s: string, anchored: boolean) =>
    new RegExp(
      `${anchored ? '(^|[^#A-Za-z0-9_/])' : ''}bash +tests/${rx(s)}/[a-z0-9._-]+\\.sh`,
      'm',
    ).test(cmds)
  const tsNamed = (cmds: string, s: string) =>
    new RegExp(`vitest[^|]*tests/${rx(s)}/[a-zA-Z0-9._-]+\\.spec\\.ts`).test(cmds)
  /** A spec is covered when it is named outright, or reached by the chain. */
  const tsCovered = (cmds: string, s: string, blanket: boolean, noRunner: string) => {
    if (tsNamed(cmds, s)) return ''
    if (!blanket) return noRunner
    if (!includeCovers) return 'tests/vitest.config.ts include no longer covers **/*.spec.ts'
    return ''
  }

  const notrun: string[] = []
  for (const s of d.names) {
    if (suitesWithSh.has(s) && !shInvoked(gateCmds, s, true)) {
      notrun.push(`${s}(shell runner never invoked)`)
    }
    if (suitesWithTs.has(s)) {
      const why = tsCovered(gateCmds, s, gateBlanket, 'no vitest stage in .githooks/pre-push*')
      if (why) notrun.push(`${s}(${why})`)
    }
  }
  checks.push(
    notrun.length > 0
      ? bad(
          '#4',
          `#4 suites the gate never invokes: ${notrun.join(' ')}\n` +
            "        A shell runner is proven by an anchored 'bash tests/<suite>/<file>.sh'.\n" +
            '        A spec is proven by a vitest run with NO path filter — in the hook, or in\n' +
            '        a bridge the hook sources AND calls into — plus an include glob that\n' +
            '        reaches it. A stage naming the spec outright also counts.\n' +
            '        A runner nothing invokes is not retired, it is dead: delete it, or wire it in.',
        )
      : ok('#4', '#4 every suite is invoked by the gate, runner kind by runner kind'),
  )

  // =========================================================================
  // 5. EVERY SUITE IS ACTUALLY IN THE WORKFLOW.
  // =========================================================================
  if (hasCi) {
    const missing: string[] = []
    for (const s of d.names) {
      if (suitesWithSh.has(s) && !shInvoked(ciCmds, s, false)) missing.push(`${s}(shell runner)`)
      if (suitesWithTs.has(s)) {
        const why = tsCovered(ciCmds, s, ciBlanket, 'no vitest step in the workflow')
        if (why) missing.push(`${s}(${why})`)
      }
    }
    checks.push(
      missing.length > 0
        ? bad('#5', `#5 suites absent from the workflow: ${missing.join(' ')}`)
        : ok('#5', '#5 every suite runs in the workflow, runner kind by runner kind'),
    )
  }

  // =========================================================================
  // 7. NON-VACUITY — the derivation must actually be finding suites. Every
  //    assertion above passes trivially over an empty tree, which is precisely
  //    the failure mode this file exists to prevent.
  // =========================================================================
  checks.push(
    d.names.length < 10
      ? bad(
          '#7',
          `#7 derived only ${d.names.length} suites from tests/ — the derivation is broken, so #1-#5 proved nothing`,
        )
      : ok('#7', `#7 derived ${d.names.length} suites from the runners on disk (assertions above are non-vacuous)`),
  )

  // =========================================================================
  // 7b. BUG-052 — THE MARKERS THAT MAKE A MANAGED FILE MERGEABLE ARE BALANCED.
  //
  //     `marker_aware_merge` (scripts/blueprint) refuses to merge unless a
  //     file's BEGIN and END counts are equal, and `pull_file` then falls back
  //     to a WHOLE-FILE COPY — which is exactly the data loss the markers exist
  //     to prevent. It warns and leaves a `.bp-bak`, and nobody reads either.
  //
  //     It counts SUBSTRINGS, so a sentence explaining "put your rows after
  //     BLUEPRINT:END" counts as an END. Both managed marker files in this repo
  //     were in that state and had been for their whole lives, so neither had
  //     ever been marker-merged and every derived project's own gate guards
  //     were replaced on every pull.
  //
  //     `tests/marker-merge` does not catch this: it drives the MECHANISM
  //     against fixture files that satisfy the precondition, and never asks
  //     whether the real managed files do.
  // =========================================================================
  const markerBad: string[] = []
  for (const [rel, abs] of [
    ['.githooks/pre-push-project', gatePath],
    ['.githooks/pre-push', hookPath],
  ] as const) {
    if (!(await exists(abs))) continue
    const [b, e] = markerBalance(await readOr(abs), 'BLUEPRINT')
    if (b === 0 && e === 0) continue
    if (b === e) continue
    markerBad.push(`${rel}(${b} BEGIN/${e} END)`)
  }
  checks.push(
    markerBad.length > 0
      ? bad(
          '#7b',
          `#7b marker counts do not balance, so 'blueprint pull' will NOT merge these files — it falls back to a whole-file copy and destroys the project's own content outside the markers: ${markerBad.join(' ')}\n` +
            '        The counts are of SUBSTRINGS, so prose describing a marker counts as one.\n' +
            "        Say 'the managed region' in sentences and keep the literal token for markers.",
        )
      : ok('#7b', '#7b every marker vocabulary balances, so pull merges these files instead of clobbering them'),
  )

  return checks
}

/**
 * #2b and #2c — the export boundary, and the phase transition.
 *
 * Split out only for length; it is called exactly once, from `inspect`, and
 * only inside a blueprint.
 */
async function exportBoundary(
  root: string,
  run: Runner,
  d: Derivation,
): Promise<CheckResult[]> {
  const checks: CheckResult[] = []
  const listing = await archiveListing(root, run)

  if (listing.length === 0) {
    return [bad('#2b', '#2b could not archive HEAD — the export boundary is unverified, not verified')]
  }
  const shipped = new Set(listing)
  const ships = (p: string) => shipped.has(p)
  const shipsUnder = (prefix: string) => listing.some((l) => l.startsWith(prefix))

  // =========================================================================
  // 2b. THE EXPORT BOUNDARY, BOTH DIRECTIONS (BUG-028).
  //
  //     A tier is a claim about WHERE a suite runs, and "blueprint only" is
  //     such a claim — but it was enforced by nothing at all. `tests/bootstrap-*`,
  //     `tests/template-source`, `tests/drift-in-blueprint` and
  //     `tests/pull-exec-bit` all shipped to every derived project, wired into
  //     its gate, testing machinery that cannot exist there. Five of the six
  //     day-one failures. Nobody saw it because the failure happens on someone
  //     else's machine, after the blueprint's own gate has gone green over the
  //     same suites passing at home.
  //
  //     The tier is now DERIVED from `.gitattributes`, and this check is not
  //     thereby tautological: the tier comes from a directory-level line, and
  //     this compares that against a real `git archive`, which is the
  //     BEHAVIOUR. They come apart in both directions — a line that does not
  //     take effect declares a suite blueprint-only while it ships to everyone;
  //     a suite with no line whose files nevertheless do not arrive is a silent
  //     coverage cut for every project but this one.
  //
  //     `git check-attr` was tried first and is unusable here: it reports
  //     `unspecified` for a directory pattern like `templates/` even though
  //     `git archive` genuinely drops it.
  //
  //     The archive is taken of HEAD — the tree that is about to be pushed. It
  //     used to be the WORKING TREE, which guarded a case the gate cannot see
  //     and opened one it can. HEAD fails CLOSED, and the fix is to commit.
  //
  //     "SHIPPED" AND "RUNNABLE" ARE NOT THE SAME WORD. The invariant that
  //     holds in every phase is:
  //
  //         a shipping suite ships AT LEAST ONE runner the recipient can
  //         execute, AND ships NO runner the recipient cannot.
  //
  //     `tsShips` is derived from the archive rather than declared, so the rule
  //     re-reads itself at each phase with nothing to remember.
  // =========================================================================
  const tsShipping: string[] = []
  const tsAbsent: string[] = []
  let tsShips = true
  for (const f of TS_TOOLCHAIN) {
    if (ships(f)) tsShipping.push(f)
    else {
      tsShips = false
      tsAbsent.push(f)
    }
  }
  if (shipsUnder('tests/harness/')) tsShipping.push('tests/harness/')
  else {
    tsShips = false
    tsAbsent.push('tests/harness/')
  }

  const specsShip = listing.some((l) => /^tests\/.*\.spec\.ts$/.test(l))

  // Which harness files exist but do NOT arrive. Both sides are read off the
  // filesystem, so a file added to tests/harness/ tomorrow is covered without
  // anyone remembering to add it anywhere. `tsShips` above is satisfied by ONE
  // harness file; this is what makes "the harness ships" mean the harness
  // rather than a fragment.
  const harnessPartial: string[] = []
  let harnessFiles: string[] = []
  try {
    harnessFiles = (await readdir(join(root, 'tests/harness'))).filter((f) => f.endsWith('.ts'))
  } catch {
    harnessFiles = []
  }
  for (const h of harnessFiles.sort()) {
    const rel = `tests/harness/${h}`
    if (!ships(rel)) harnessPartial.push(rel)
  }

  const shippedBp: string[] = []
  const withheld: string[] = []
  const hollow: string[] = []
  const unrunnable: string[] = []
  const tsonly: string[] = []

  for (const { suite: s, tier } of d.rows) {
    if (s === '') continue
    // Runners counted BY KIND, because only one kind's executability depends on
    // the phase. A directory that arrives without a runner the recipient can
    // execute is worse than an absent one: the derived gate skips it silently
    // and the push stays green over a suite that no longer exists.
    let shTot = 0
    let shGot = 0
    let tsTot = 0
    let tsGot = 0
    for (const r of d.runners.filter((r) => r.suite === s)) {
      if (r.path.endsWith('.spec.ts')) {
        tsTot++
        if (ships(r.path)) tsGot++
      } else {
        shTot++
        if (ships(r.path)) shGot++
      }
    }
    const tot = shTot + tsTot
    const any = shipsUnder(`tests/${s}/`)

    if (tier === 'blueprint') {
      // Nothing at all may ship — not the runners, not a stray fixture.
      if (any) shippedBp.push(s)
      continue
    }
    // (i) NEVER ship a runner the recipient cannot execute.
    if (!tsShips && tsGot > 0) {
      unrunnable.push(`${s}(${tsGot} spec)`)
      continue
    }
    // (ii) Within each EXECUTABLE kind, every runner still has to arrive.
    if (shGot < shTot) {
      hollow.push(`${s}(${shGot}/${shTot} shell)`)
      continue
    }
    if (tsShips && tsGot < tsTot) {
      hollow.push(`${s}(${tsGot}/${tsTot} spec)`)
      continue
    }
    // (iii) AT LEAST ONE executable runner must arrive.
    const runnable = tsShips ? shGot + tsGot : shGot
    if (runnable > 0) continue

    if (tsTot > 0 && shTot === 0) tsonly.push(s)
    else if (!any) withheld.push(s)
    else hollow.push(`${s}(0/${tot} runners)`)
  }

  if (shippedBp.length > 0) {
    checks.push(
      bad(
        '#2b',
        `#2b suites declared blueprint-only by .gitattributes DO ship, so they run in every derived project's gate against machinery that cannot be there: ${shippedBp.join(' ')}`,
      ),
    )
  } else if (unrunnable.length > 0) {
    checks.push(
      bad(
        '#2b',
        `#2b suites ship a *.spec.ts while the TS toolchain does NOT ship, so a derived project receives a runner it cannot execute: ${unrunnable.join(' ')}\n` +
          '        Either export-ignore the spec, or make the phase-2 move whole (see #2c).',
      ),
    )
  } else if (hollow.length > 0) {
    checks.push(
      bad(
        '#2b',
        `#2b suites ship WITHOUT their runners, so the derived gate's 'if [ -f tests/<suite>/<runner> ]' guard skips them in silence: ${hollow.join(' ')}`,
      ),
    )
  } else if (tsonly.length > 0) {
    checks.push(
      bad(
        '#2b',
        `#2b suites are TypeScript-ONLY while the TS toolchain does not ship, so they reach a derived project with no runner it can execute: ${tsonly.join(' ')}\n` +
          '        Keep a shell runner until phase 2, or add \'tests/<suite>/ export-ignore\'\n' +
          '        to make the suite blueprint-only deliberately.',
      ),
    )
  } else if (withheld.length > 0) {
    checks.push(
      bad(
        '#2b',
        `#2b suites that are not declared blueprint-only do not reach the archive, so every derived project silently loses them: ${withheld.join(' ')}`,
      ),
    )
  } else if (tsShips) {
    checks.push(
      ok(
        '#2b',
        '#2b the export boundary matches .gitattributes in both directions, runner by runner (HEAD; phase 2 — the TS toolchain ships, so specs count as runners)',
      ),
    )
  } else {
    checks.push(
      ok(
        '#2b',
        '#2b the export boundary matches .gitattributes in both directions, runner by runner (HEAD; phase 1 — the TS toolchain does not ship, so every shipping suite keeps an executable shell runner)',
      ),
    )
  }

  // =====================================================================
  // 2c. THE PHASE TRANSITION IS ALL-OR-NOTHING.
  //
  //     #2b answers "is each suite coherent?". This answers "do the two
  //     propagation paths agree?", and nothing else in the repo does.
  //
  //       bootstrap  ships the WHOLE archive (new-project.sh: `git archive
  //                  HEAD`).
  //       pull       ships MANAGED_FILES only — and a managed DIRECTORY
  //                  expands through `git archive HEAD <dir>`, so anything
  //                  export-ignore'd under it does not travel either.
  //
  //     The toolchain lives under `tests/`, which is already a managed
  //     directory and which no derived project owns a copy of. Collision is
  //     impossible rather than merely avoided, and ships ⟺ managed holds by
  //     construction for every file under it. What is left to check is that the
  //     construction is still standing.
  //
  //     NOT checked, deliberately: a toolchain that ships while no spec ships
  //     yet — that is the sane ordering of the phase-2 move, and forbidding it
  //     would force the riskier order. (The phase-2 mirror IS checked; see
  //     below.)
  //
  //     THE SAME CLAIM COVERS THE GATE'S OWN DEPENDENCIES. `.githooks/pre-push`
  //     and `.githooks/pre-push-project` are BOTH managed, so every file they
  //     source has to travel by both paths too, or the hook arrives downstream
  //     with half of itself. The failure is quiet and permanent — a hook whose
  //     bridge never arrives takes its `else` branch on every push, a
  //     `pipe_skip` with a reason that reads as deliberate, forever.
  // =====================================================================
  const mf = parseManagedFiles(await readOr(join(root, 'scripts/blueprint')))
  const managed = (p: string) => mf.includes(p)

  // Every toolchain file must sit under a managed directory, or be managed by
  // name. This keeps "ships ⟺ managed" structural: move one back to the repo
  // root and it fails here rather than downstream.
  const tsStray = TS_TOOLCHAIN.filter((f) => !f.startsWith('tests/') && !managed(f))

  // Every file the managed hook sources must travel exactly as the hook does.
  const gateText = liveCmds(
    [
      await readOr(join(root, '.githooks/pre-push-project')),
      await readOr(join(root, '.githooks/pre-push')),
    ].join('\n'),
  )
  const bridgeSplit: string[] = []
  for (const b of await liveBridges(root, gateText)) {
    const rel = b.slice(root.length + 1)
    const bs = ships(rel) ? 1 : 0
    const bm = managed(rel) ? 1 : 0
    if (bs !== bm) bridgeSplit.push(`${rel}(ships=${bs},managed=${bm})`)
  }

  if (mf.length < 20 || !managed('tests/')) {
    checks.push(
      bad(
        '#2c',
        `#2c could not read MANAGED_FILES out of scripts/blueprint (parsed ${mf.length} entries, 'tests/' ${managed('tests/') ? 'present' : 'absent'}) — the phase check would pass vacuously, which is the failure mode it exists to prevent`,
      ),
    )
  } else if (tsStray.length > 0) {
    checks.push(
      bad(
        '#2c',
        `#2c toolchain files live outside the managed 'tests/' directory and are not managed by name: ${tsStray.join(' ')}\n` +
          '        Under tests/ the two propagation paths agree by construction. Outside it\n' +
          '        they diverge silently, and MANAGED_FILES cannot be the fix for a JSON file.',
      ),
    )
  } else if (bridgeSplit.length > 0) {
    checks.push(
      bad(
        '#2c',
        `#2c the gate sources files whose two propagation paths disagree: ${bridgeSplit.join(' ')}\n` +
          '        .githooks/pre-push and .githooks/pre-push-project are managed, so a file\n' +
          '        they source must be BOTH shipped and managed, or neither. ships=1,managed=0\n' +
          '        means a NEW project gets it and then freezes it forever, while an EXISTING\n' +
          '        project that pulls the hook never receives it at all.',
      ),
    )
  } else if (!tsShips && tsShipping.length > 0) {
    checks.push(
      bad(
        '#2c',
        `#2c BUG-073: the TS toolchain ships in PART — ${tsShipping.join(' ')} reach every derived project while ${tsAbsent.join(' ')} do not\n` +
          '        A partial toolchain is worse than none: the recipient gets machinery it\n' +
          "        cannot use, and .github/workflows/security.yml is MANAGED, so its ts-tests\n" +
          "        job runs 'npm ci' in a project holding half a toolchain and goes red on the\n" +
          '        first push, on a job that project never wrote (BUG-061).',
      ),
    )
  } else if (specsShip && !tsShips) {
    checks.push(
      bad(
        '#2c',
        '#2c BUG-073: *.spec.ts files ship to derived projects while the TS toolchain does not — every recipient gets specs with no runner\n' +
          '        Ship tests/package.json, tests/tsconfig.json, tests/vitest.config.ts and\n' +
          '        tests/harness/, or export-ignore the specs. Half of the move is worse than none.',
      ),
    )
  } else if (tsShips && !specsShip) {
    // THE PHASE-2 HALF OF THE SAME CLAIM (BUG-073). Every branch above tests
    // the invariant from the phase-1 side: machinery withheld, or machinery
    // arriving that the recipient cannot use. The mirror image is machinery
    // arriving that the recipient has NOTHING TO USE ON — vitest, a
    // package.json, an `npm ci` in a MANAGED CI job, and not one spec to run.
    //
    // It is deliberately NOT symmetric with the phase-1 pass below: phase 1
    // legitimately has a toolchain that does not ship AND no specs; phase 2 has
    // no legitimate state in which the toolchain ships alone, because the
    // invariant is an IFF — the toolchain ships BECAUSE a shipping suite is
    // TypeScript.
    checks.push(
      bad(
        '#2c',
        '#2c the TS toolchain ships but NO *.spec.ts does — every derived project installs a runner with nothing to run\n' +
          '        The invariant is an IFF: the toolchain ships BECAUSE a shipping suite is\n' +
          "        TypeScript. A toolchain alone means every project pays 'npm ci' in the\n" +
          '        MANAGED ts-tests job, on a green job that executed no test.',
      ),
    )
  } else if (tsShips && harnessPartial.length > 0) {
    // AND THE HARNESS HAS TO ARRIVE WHOLE. `tsShips` is satisfied by one file
    // under tests/harness/ — a one-file proxy for a whole directory, which is
    // exactly the shape BUG-061 walked through. `tests/harness/index.ts` is the
    // ONLY way a spec obtains a fixture, so a single export-ignore of it would
    // leave every shipped spec importing a module that is not there.
    checks.push(
      bad(
        '#2c',
        `#2c the harness ships in PART — every shipped spec imports it, and these files do not arrive: ${harnessPartial.join(' ')}\n` +
          '        tests/harness/index.ts is the only way a spec obtains a fixture. A partial\n' +
          '        harness is a project whose every TypeScript suite dies on an unresolved\n' +
          '        import, while the toolchain still reads as shipping because one file arrived.',
      ),
    )
  } else if (tsShips) {
    checks.push(
      ok(
        '#2c',
        `#2c BUG-073: phase 2 is whole — the TS toolchain ships from under the managed 'tests/' directory, so bootstrap and pull deliver the same thing (checked ${mf.length} MANAGED_FILES entries)`,
      ),
    )
  } else {
    checks.push(
      ok(
        '#2c',
        `#2c phase 1 is whole — no spec ships, and the TS toolchain is export-ignore'd from under the managed 'tests/' directory, so neither path delivers it (checked ${mf.length} MANAGED_FILES entries)`,
      ),
    )
  }

  // THE OPERATOR HINT THE SHELL VERSION PRINTED. This reads HEAD, which is the
  // tree about to be pushed, so a boundary edited and not yet committed looks
  // exactly like a broken one. Only asked when something already failed.
  if (checks.some((c) => !c.ok)) {
    const dirty = await run(
      'git',
      ['-C', root, 'diff', '--quiet', 'HEAD', '--', '.gitattributes'],
      { cwd: root },
    )
    if (dirty.code !== 0) {
      const i = checks.findIndex((c) => !c.ok)
      const c = checks[i] as CheckResult
      checks[i] = bad(
        c.id,
        `${c.message}\n` +
          '        .gitattributes is modified but NOT COMMITTED. This reads HEAD, which\n' +
          '        is the tree about to be pushed — commit the boundary and re-run.',
      )
    }
  }

  return checks
}

/** The failing checks, formatted the way the shell runner printed them. */
export function failures(checks: CheckResult[]): string {
  return checks
    .filter((c) => !c.ok)
    .map((c) => `FAIL: ${c.message}`)
    .join('\n')
}
