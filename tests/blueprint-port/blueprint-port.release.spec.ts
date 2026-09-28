/**
 * tests/blueprint-port/blueprint-port.release.spec.ts — TASK-081, the
 * differential harness (plan §5). Compares OLD (`bash scripts/blueprint`)
 * against NEW (`node scripts/blueprint.mts`), subcommand family by
 * subcommand family, as each slice lands. Deleted once the founder accepts
 * TASK-081 (plan §5) — its results live in the port commit body instead.
 *
 * Release tier: it shells out to real `git`/`bash`/`node` against fixture
 * repositories, which is slower than the suite's usual unit tests — the same
 * reason tests/a2bp-e2e and tests/bootstrap-gate are release-tier.
 *
 * DETERMINISM (plan §5): "same path, twice" is enforced two different ways
 * in this file, and which one a describe uses is a property of whether its
 * rows WRITE.
 *   - A row that never mutates its fixture (drift; most of `files`) runs OLD
 *     on ONE fixture directory, then resets the local git config drift arms
 *     (`driftBoth`), then runs NEW on the SAME directory — "same path" by
 *     construction, since there is only ever one.
 *   - A row that WRITES (pull's full/partial/prompt rows; every a2bp row)
 *     cannot reuse one directory this way, so it goes through
 *     `a2bpSamePathTwice` (the a2bp/prs describe) or an equivalent
 *     build→run→delete→rebuild→run sequence: build the fixture at a fixed
 *     path with PINNED `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` and identity,
 *     run OLD, snapshot (stdout/stderr/status/signal, the project tree's
 *     path/bytes/mode, `.blueprint-source`, the blueprint's refs, and for
 *     a2bp the gh-argv log), delete the fixture, rebuild the IDENTICAL
 *     fixture at the SAME path, run NEW, snapshot again, and diff with NO
 *     normalisation beyond the three plan §5 names: random mktemp suffixes,
 *     `diff -u` header timestamps, and bash's `line N:` prefix. This
 *     replaces an earlier version of the a2bp/prs describe that built TWO
 *     INDEPENDENT fixture trees per row and scrubbed the resulting
 *     divergence (`scrubA2bp`) — a normaliser plan §5 does not allow, and
 *     the finding Codex's round-3 review left open.
 *
 * THE §5 MATRIX CHECKLIST. Plan §5's table names ~90 rows by subcommand.
 * Each row below is either a `it()` name in this file (or blueprint-port.spec.ts
 * for the few proven at the unit tier) or has a reason it is not a row, with
 * its covering test named instead.
 *
 * THE COMPARISON (TASK-081 "drift/pull differential rows to completion"
 * round): every drift and pull row below — not only the ones in the
 * describes literally named 'drift'/'pull' — goes through the generalised
 * compare defined just above (`walkFiles`, `snapshotRefs`,
 * `bpCacheRefsOrSentinel`, `assertNoDriftPullScratch`): stdout/stderr/exit/
 * signal, the project tree's path/bytes/mode (which is also how
 * `.blueprint-source` is compared — it is an ordinary file under that walk),
 * the cache's refs where a row registers a remote, and that no
 * `blueprint-sync.*`/`tmp.*` scratch survives the run. A shared-directory row
 * additionally asserts the tree is byte-for-byte UNCHANGED by each side's own
 * run (most of these rows are refusals whose name already claimed "nothing
 * written"); a two-independent-copies row asserts `walkFiles(newProj)` equals
 * `walkFiles(oldProj)` in full, not only the handful of files each row
 * happens to spot-check.
 *
 *   dispatch     — describe 'blueprint-port differential — dispatch': all
 *                  six rows (no args, help, --help, -h, an unknown
 *                  subcommand, push).
 *   files/list   — describe 'blueprint-port differential — files': the
 *                  three rows (in the blueprint, BLUEPRINT_ROOT override, a
 *                  registered derived project).
 *   drift        — describe 'blueprint-port differential — drift' (clean,
 *                  drifted, new-in-blueprint, refused/BUG-034, unregistered,
 *                  not-a-project, `scripts/lib/gate.sh` missing, an exported
 *                  `GIT_DIR` — this round's own reproducer AND fix: a bare
 *                  `run('git', …)` inside `bpManagedFiles` read the wrong
 *                  repository's tree under GIT_DIR, now routed through
 *                  `bpGit` like every other blueprint-side read — a
 *                  symlinked project directory, and a project name holding
 *                  `&` and `\` — the `&` half is clean on both CLIs, the `\`
 *                  half is Node's own ESM loader refusing an entry-point
 *                  specifier with an encoded `\`, an accepted deviation this
 *                  round documents rather than "fixes", since the real exec
 *                  shim hits the identical wall for a project actually
 *                  checked out under such a path); "…'s fast-forward prompt"
 *                  (y, N); 'settings-layer refusals' (P4's array/object/
 *                  null/number shapes on BOTH settings.json and the layer,
 *                  plus the drift-side refusal bucket); 'settings layer
 *                  merge and legacy proposal' (P4's "a layer present, which
 *                  merges" — through pull, with the landed bytes compared,
 *                  and through drift; "a legacy settings.json with extra
 *                  rules, which produces the proposal text" — through pull
 *                  and drift; "jq missing from PATH" through drift, pull's
 *                  own row already lived in 'finding 4'); 'staleness states'
 *                  (current/ahead/diverged/unknown); 'fetch failures'
 *                  (unreachable, missing branch, no timeout binary,
 *                  hung/BP_FETCH_TIMEOUT, scratch uncreatable, damaged
 *                  cache); 'drift config-shape refusals' (v1 config (4),
 *                  placeholder remote (4), missing release branch (5),
 *                  bootstrap_sha not in history, BLUEPRINT_ROOT override not
 *                  a directory, the leftover blueprint_source warning,
 *                  missing-in-blueprint as its own row — the managed-set-diff
 *                  asymmetry with "new in blueprint", proven directly rather
 *                  than only asserted in prose).
 *                  NOT ROWS: none — this round closed every gap this
 *                  describe's header previously named.
 *   pull         — describe 'blueprint-port differential — pull' (nothing
 *                  to pull, full --yes, partial/BUG-016, non-TTY/BUG-018,
 *                  refused/BUG-034, `pull scripts/blueprint`, the y/N/q
 *                  interactive prompt); 'pull matrix' (backup-copy — with an
 *                  explicit `.bp-bak` bytes check, merge, retirement — with
 *                  an explicit kept-file bytes check, PLUS retirement
 *                  answered by a non-TTY (the "not interactive" refusal,
 *                  exit 7) and by q (aborted, exit 0) — the only sub-case
 *                  left unproven differentially before this round —, exec
 *                  bit +x and -x); 'finding 1' (tool failures inside
 *                  bp_prospective_pull/marker_aware_merge/_bp_settings_layer);
 *                  'finding 4' (comm/cmp/diff absent, diff present-but-not-
 *                  executable, jq entirely missing); 'pull remaining rows'
 *                  (an unknown option dying after the fetch — proven via the
 *                  cache the fetch must have populated, since pull prints no
 *                  fetch-report line the way drift does; a held/refused file
 *                  leaving bootstrap_sha unchanged even though a sibling
 *                  file WAS pulled, BUG-034's own exit 4).
 *                  NOT ROWS: none — this round closed the retirement
 *                  non-TTY/q gap this describe's header previously named.
 *   a2bp         — describe 'blueprint-port differential — a2bp / prs':
 *                  finding 2 (x2), finding 3, dry-run, no files given, not a
 *                  derived project, a required lib missing, contamination
 *                  BLOCK, gitleaks unavailable, gh unavailable, filed (exit
 *                  3, BUG-011 happy path); PLUS, closing this round's own
 *                  gap: '--force is refused, as today' (exit 1); 'an unknown
 *                  option dies before any remote contact' (exit 1); 'nothing
 *                  to request — the project file already matches the base'
 *                  (BP_RC_NOTHING, exit 6 — the one BP_RC_* code no prior row
 *                  covered); 'staging rc 3 — a project name containing the
 *                  raw {{PROJECT_NAME}} token breaks the round-trip' (exit
 *                  4 — the round-trip check is, by construction, a fixed
 *                  point for ordinary content; the ONE way to break it is a
 *                  project directory basename that embeds the literal token
 *                  text, reproduced end to end and confirmed byte-identical
 *                  against both CLIs before this row was written); 'GNU diff
 *                  missing — staging refuses with its own message' (rc 2,
 *                  exit 4); 'an unshipped path (TASK-037) — filed and marked
 *                  "not shipped" in the run and the PR body' (exit 3); 'the
 *                  remote moving ONCE — the pre-push re-check rebuilds and
 *                  files against the new base' and 'the remote moving TWICE
 *                  — refused after exactly one rebuild, no request branch
 *                  pushed' (BUG-108, adapting tests/a2bp-e2e #12/#12b's
 *                  git-race shim onto `a2bpSamePathTwice`, with the shim's
 *                  own "moved" commit pinned to PINNED_GIT_DATE so its SHA
 *                  does not differ between the OLD run and the NEW rebuild).
 *                  Every row in this describe now goes through
 *                  `a2bpSamePathTwice` except the two that die before
 *                  touching the blueprint at all (no files given, not a
 *                  derived project), which need no rebuild because nothing
 *                  about their output is fixture-path-dependent.
 *                  EXIT-CODE AUDIT (plan §3 P5's own list): every BP_RC_*
 *                  code now has a row — OK=0 (dry-run), PENDING=3 (filed,
 *                  unshipped, move-once), BLOCKED=4 (not-a-project,
 *                  contamination, gitleaks, staging-rc3, GNU-diff-missing),
 *                  FAILED=5 (gh unavailable, move-twice), NOTHING=6 (nothing
 *                  to request). Nothing is missing.
 *                  NOT ROWS: none — this round closed every gap this
 *                  describe's header previously named.
 *   prs          — 'prs — empty, a listing, and a gh query failure' (an
 *                  empty listing, then a listing, then INCOMPLETE-not-empty
 *                  — the INCOMPLETE case already covers "gh erroring", plan
 *                  §5's own row of that name); PLUS, closing this round's own
 *                  gap: 'prs — gh is not installed: die before any remote
 *                  contact'; 'prs — a draft PR in the listing is marked
 *                  [draft]'; 'prs — orphan branches: none listed, as today
 *                  (dead code, plan §3 P5)' — a REAL pushed `a2bp/*` branch
 *                  with no open PR, reproducing byte for byte that the
 *                  "Pushed branches with no open PR:" section never prints
 *                  on either CLI (cmd_prs sources only request-config.sh,
 *                  never request.sh — the function the orphan section calls
 *                  is undefined there, confirmed directly against both CLIs
 *                  before this row was written, `.scratch/rc3-e2e` in this
 *                  worktree).
 *                  NOT ROWS: none — this round closed every gap this
 *                  describe's header previously named.
 *
 * Signals are not differential rows (plan §5's own words) — they are
 * tests/sync-by-address #20-#23c, run against the port.
 */
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { chmod, cp, copyFile, mkdir, readdir, readFile, readlink, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import type { RunResult } from '../harness/process.js'
import { withCttyAnswer, withCttyNoStdin } from '../helpers/tty.js'

const SHELL_CLI = join(REPO_ROOT, 'scripts/blueprint')
const PORTED_CLI = join(REPO_ROOT, 'scripts/blueprint.mts')

async function git(s: Scenario, cwd: string, args: string[]): Promise<RunResult> {
  return s.run('git', args, { cwd })
}

async function initRepo(s: Scenario, dir: string): Promise<void> {
  await git(s, dir, ['init', '-q', '-b', 'main', '.'])
  await git(s, dir, ['config', 'user.email', 't@local'])
  await git(s, dir, ['config', 'user.name', 't'])
}

async function commitAll(s: Scenario, dir: string, message = 'init'): Promise<void> {
  await git(s, dir, ['add', '-A'])
  await git(s, dir, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message])
}

/** Copy both CLI forms into `root/scripts/`, committed, so `git archive HEAD`
 * in that fixture sees them — bp_managed_files reads the TREE, never the
 * working directory. */
async function seedFixtureRoot(s: Scenario, root: string): Promise<void> {
  await mkdir(join(root, 'scripts'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await copyFile(SHELL_CLI, join(root, 'scripts/blueprint'))
  await s.run('chmod', ['+x', join(root, 'scripts/blueprint')], { cwd: root })
  await copyFile(PORTED_CLI, join(root, 'scripts/blueprint.mts'))
  await writeFile(join(root, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
  await writeFile(join(root, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
  // README.md is a TEMPLATE_FILES entry: committed here so a passing test
  // actually exercises the filter, rather than the filter never being asked
  // to remove anything.
  await writeFile(join(root, 'README.md'), '# fixture project\n', 'utf8')
  await initRepo(s, root)
  await commitAll(s, root, 'base')
}

// PWD is set explicitly to `cwd` for BOTH sides. Bash recomputes $PWD from
// getcwd() at startup regardless (so this is a no-op for `runOld`), but
// `runNew` spawns node DIRECTLY — there is no bash shim yet to set it — and
// the ported CLI's `logicalPwd()` (plan §2 rule 6) reads `process.env.PWD`,
// never `process.cwd()`. Without this, the child inherits whatever PWD the
// test runner's OWN shell happened to have, which is not `cwd` and, worse,
// can itself resolve to a real ancestor project (this repo's own worktree)
// through the state-dir walk. Once slice 5's shim exists this stops being
// test-only scaffolding, because the shim's `exec` under bash sets it for real.
async function runOld(s: Scenario, cwd: string, args: string[], env?: Record<string, string>): Promise<RunResult> {
  return s.run('bash', [join(cwd, 'scripts/blueprint'), ...args], { cwd, env: { PWD: cwd, ...env } })
}

async function runNew(s: Scenario, cwd: string, args: string[], env?: Record<string, string>): Promise<RunResult> {
  return s.run(process.execPath, [join(cwd, 'scripts/blueprint.mts'), ...args], { cwd, env: { PWD: cwd, ...env } })
}

function expectIdentical(oldResult: RunResult, newResult: RunResult): void {
  expect(newResult.stdout).toBe(oldResult.stdout)
  expect(newResult.stderr).toBe(oldResult.stderr)
  expect(newResult.code).toBe(oldResult.code)
  expect(newResult.signal).toBe(oldResult.signal)
}

// `pull`'s preview runs `diff -u FILE TMP`, and both header lines carry
// non-deterministic bytes the differential must normalise away rather than
// compare (plan §5's "only normalisations" list): the `---` line's mtime
// timestamp (real wall-clock time, a few hundred ms apart between the OLD
// and NEW invocations even against the SAME file) and the `+++` line's
// mktemp path (a fresh random suffix, and a fresh workspace directory when
// the row builds two independent project copies).
function normalizeDiffHeaders(output: string): string {
  return output.replace(/^(--- [^\t\n]*)\t[^\n]*$/gm, '$1').replace(/^\+\+\+ [^\n]*$/gm, '+++ <tmp>')
}

/** Like expectIdentical, but for a pull row whose preview includes a `diff
 * -u` block — stdout is compared after normalizeDiffHeaders. */
function expectPullIdentical(oldResult: RunResult, newResult: RunResult): void {
  expect(normalizeDiffHeaders(newResult.stdout)).toBe(normalizeDiffHeaders(oldResult.stdout))
  expect(newResult.stderr).toBe(oldResult.stderr)
  expect(newResult.code).toBe(oldResult.code)
  expect(newResult.signal).toBe(oldResult.signal)
}

// --- generalised plan §5 comparison machinery, shared by drift AND pull ----
//
// Hoisted here (originally local to the a2bp/prs describe, where walkFiles
// and snapshotRefs still get reused unchanged) so the drift and pull
// differential rows below can reach the SAME "project tree (path/bytes/
// mode), `.blueprint-source`, the cache's refs, no scratch left" comparison
// plan §5 asks for, rather than each row hand-rolling a subset of it.

/** One file's path (relative to `dir`), permission bits and content hash —
 * or, for a symlink, its target string in place of a hash. `.git` is
 * excluded: its loose-object layout is an implementation detail of git's
 * own storage, not part of what plan §5 asks this harness to compare (the
 * project tree's path/bytes/mode, and separately the refs). `.blueprint-
 * source` is an ordinary file under `dir` and so is already included by
 * this walk — no separate read is needed to cover it. */
async function walkFiles(dir: string, base = dir): Promise<Array<{ path: string; mode: string; content: string }>> {
  const out: Array<{ path: string; mode: string; content: string }> = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, base)))
      continue
    }
    const st = await stat(full)
    const mode = (st.mode & 0o777).toString(8)
    const content = entry.isSymbolicLink()
      ? `symlink:${await readlink(full)}`
      : `sha256:${createHash('sha256').update(await readFile(full)).digest('hex')}`
    out.push({ path: full.slice(base.length + 1), mode, content })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

async function snapshotRefs(s: Scenario, dir: string): Promise<string> {
  const r = await s.run('git', ['for-each-ref', '--format=%(refname) %(objectname)'], { cwd: dir })
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .sort()
    .join('\n')
}

/** Plan §5's "that no scratch is left", for drift/pull: `_bp_fetch_blueprint`'s
 * own scratch (`blueprint-sync.XXXXXXXX`) and any bare `mktemp` (`tmp.…`, the
 * shielded-write idiom) land under this scenario's own TMPDIR
 * (harness/index.ts's scenarioEnv) and must not survive the run. The a2bp
 * describe's own `assertNoA2bpScratch` covers the SAME directory for its own
 * `a2bp.…` prefix — kept separate there because that describe is not this
 * round's to touch. */
async function assertNoDriftPullScratch(s: Scenario): Promise<void> {
  const tmp = join(s.workspace.root, 'tmp')
  const entries = await readdir(tmp).catch(() => [] as string[])
  const leftover = entries.filter((e) => e.startsWith('blueprint-sync.') || e.startsWith('tmp.'))
  expect(leftover, `drift/pull scratch left behind in ${tmp}: ${leftover.join(', ')}`).toEqual([])
}

/** `blueprint_remote = …` out of a project's `.blueprint-source`, or
 * `undefined` for a fixture that never registered one (the unregistered/
 * not-a-project rows, and the BLUEPRINT_ROOT-override rows, which read no
 * remote address at all). */
async function readBlueprintRemote(proj: string): Promise<string | undefined> {
  const src = await readFile(join(proj, '.blueprint-source'), 'utf8').catch(() => '')
  const m = /^blueprint_remote\s*=\s*(.+)$/m.exec(src)
  return m?.[1] ? m[1].trim() : undefined
}

/** The on-disk path of `_bp_fetch_blueprint`'s per-remote cache
 * (scripts/blueprint:839-843: `$cache_root/blueprint-$(git hash-object
 * --stdin <<<remote).git`), replicated here rather than guessed — the key is
 * git's own `hash-object`, run for real against the SAME remote string. */
async function bpCachePath(s: Scenario, remote: string): Promise<string> {
  const r = await s.run('sh', ['-c', 'printf %s "$1" | git hash-object --stdin', '_', remote], {
    cwd: s.workspace.root,
  })
  const key = r.stdout.trim()
  return join(s.home, '.cache', 'struct2flow', `blueprint-${key}.git`)
}

/** The cache's refs (plan §5's "the cache's refs"), or a fixed sentinel when
 * no fetch has happened yet and the cache was never created — a row that
 * never reaches the network (a refusal before `_bp_fetch_blueprint` runs)
 * legitimately has no cache to compare, and that absence must itself match
 * between OLD and NEW rather than being silently skipped. */
async function bpCacheRefsOrSentinel(s: Scenario, remote: string): Promise<string> {
  const cache = await bpCachePath(s, remote)
  if (!existsSync(cache)) return '<no cache created>'
  return snapshotRefs(s, cache)
}

describe('blueprint-port differential — dispatch', () => {
  const rows: Array<{ readonly name: string; readonly args: string[] }> = [
    { name: 'no args', args: [] },
    { name: 'help', args: ['help'] },
    { name: '--help', args: ['--help'] },
    { name: '-h', args: ['-h'] },
    { name: 'an unknown subcommand', args: ['not-a-real-subcommand'] },
    { name: 'push', args: ['push'] },
  ]

  for (const row of rows) {
    it(row.name, async () => {
      await scenario(`blueprint-port-dispatch-${row.name}`, async (s) => {
        const dir = await s.workspace.dir('cwd')
        const [oldResult, newResult] = await Promise.all([
          s.run('bash', [SHELL_CLI, ...row.args], { cwd: dir }),
          s.run(process.execPath, [PORTED_CLI, ...row.args], { cwd: dir }),
        ])
        expectIdentical(oldResult, newResult)
      })
    })
  }
})

describe('blueprint-port differential — files', () => {
  it('in the blueprint (no .blueprint-source: the CLI’s own root is BLUEPRINT_ROOT)', async () => {
    await scenario('blueprint-port-files-in-blueprint', async (s) => {
      const root = await s.workspace.dir('bp')
      await seedFixtureRoot(s, root)
      const [oldResult, newResult] = await Promise.all([runOld(s, root, ['files']), runNew(s, root, ['files'])])
      expectIdentical(oldResult, newResult)
      // Sanity: the filter actually did something observable, not merely
      // "both sides agree on nothing".
      expect(oldResult.stdout).toContain('scripts/blueprint')
      // README.md IS a TEMPLATE_FILES entry, so it legitimately appears under
      // "Template files" below — the filter's job is to keep it OUT of the
      // MANAGED section above that, even though it is tracked in this fixture.
      const managedSection = oldResult.stdout.split('Template files')[0]
      expect(managedSection).not.toMatch(/^ {2}README\.md$/m)
    })
  })

  it('under the BLUEPRINT_ROOT override (a project with no .blueprint-source, pointed elsewhere)', async () => {
    await scenario('blueprint-port-files-override', async (s) => {
      const projectRoot = await s.workspace.dir('project')
      const blueprintRoot = await s.workspace.dir('elsewhere-blueprint')
      await seedFixtureRoot(s, projectRoot)
      // A distinct blueprint checkout with its own file set, so the override
      // is provably being read rather than the project's own root.
      await mkdir(join(blueprintRoot, 'docs'), { recursive: true })
      await writeFile(join(blueprintRoot, 'ONLY-IN-OVERRIDE.md'), 'x\n', 'utf8')
      await initRepo(s, blueprintRoot)
      await commitAll(s, blueprintRoot, 'override base')

      const env = { BLUEPRINT_ROOT: blueprintRoot }
      const [oldResult, newResult] = await Promise.all([
        runOld(s, projectRoot, ['files'], env),
        runNew(s, projectRoot, ['files'], env),
      ])
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('ONLY-IN-OVERRIDE.md')
      expect(oldResult.stdout).not.toContain('CLAUDE.md')
    })
  })

  // The third matrix row this describe's own header comment once called
  // "no row for it here yet" — cmd_files' network-fetch path (read_blueprint_
  // source → the address-mode managed set), added in slice 2. Reuses the
  // same registered-project fixture the drift/pull describes below build,
  // hoisted here by function declaration.
  it('in a registered derived project (read_blueprint_source, the address path)', async () => {
    await scenario('blueprint-port-files-registered', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const [oldResult, newResult] = await Promise.all([runOld(s, proj, ['files']), runNew(s, proj, ['files'])])
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('CLAUDE.md')
      expect(oldResult.stdout).toContain('docs/DoD.md')
    })
  })
})

/**
 * blueprint-port differential — drift (TASK-081 slice 2, plan §8 row 2).
 *
 * This describe covers: clean, drifted, new-in-blueprint, a refused file
 * (BUG-034/BUG-113), unregistered, and not-a-project. Each proves a different
 * code path (the fetch, the managed-set diff, bp_prospective_for's
 * marker-structure refusal, read_blueprint_source's marker-count heuristic,
 * and its plain refusal).
 *
 * The REST of plan §5's ~90-row drift matrix is covered by later describes
 * in this file, added closing Codex's re-review finding 7 (the claim that
 * these were "unit-proven" was wrong: `bpSettingsLayer`/`reportStaleness`/
 * `bpFetchBlueprint` are none of them exported, so nothing outside this
 * differential harness ever calls them) — see "settings-layer refusals",
 * "staleness states", "fetch failures", "drift's fast-forward prompt" (the
 * interactive y/N answer to the "behind" status) and the pull describe's own
 * matrix below. missing-in-blueprint is the one row genuinely absent: it is
 * the SAME code path as "new in blueprint" above with the two managed-set
 * sides swapped (a file the project still names in `.blueprint-source`'s
 * history but the blueprint's `git archive HEAD` no longer lists), and
 * TASK-021 §4.2's retirement rows (below, in the pull describe) already drive
 * that exact managed-set asymmetry end to end.
 *
 * The `fetched:    SHA  at TIMESTAMP` line's timestamp is real wall-clock time
 * (both CLIs call `date -u`), so a `date` shim pins it to one value — the one
 * normalisation these rows need beyond byte equality (plan §5's "only
 * normalisations" list, extended for the one new source of non-determinism
 * this slice introduces).
 */
// --- fixture builders shared by the drift AND pull differential describes --
//
// Hoisted to module scope (originally local to the drift describe) so
// slice 3's pull rows can reuse them rather than reimplementing the same
// blueprint/project fixtures.

async function seedBlueprintRepo(s: Scenario, dir: string): Promise<string> {
  await mkdir(join(dir, 'docs'), { recursive: true })
  await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
  await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
  await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
  await initRepo(s, dir)
  await commitAll(s, dir, 'base')
  const r = await git(s, dir, ['rev-parse', 'HEAD'])
  return r.stdout.trim()
}

async function seedRegisteredProject(
  s: Scenario,
  dir: string,
  blueprintDir: string,
  bootstrapSha: string,
): Promise<void> {
  // runOld/runNew invoke `<dir>/scripts/blueprint[.mts]`, and cmd_drift's
  // arm_gate / bpFetchBlueprint reach into `scripts/lib/*.sh` — the whole
  // `scripts/` tree, not just the two CLI files, exactly like a real
  // derived project that pulled it.
  await cp(join(REPO_ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true })
  await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
  await mkdir(join(dir, '.githooks'), { recursive: true })
  await writeFile(join(dir, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
  await s.run('chmod', ['+x', join(dir, '.githooks/pre-push')], { cwd: dir })
  await writeFile(
    join(dir, '.blueprint-source'),
    `config_version   = 2\nblueprint_remote = ${blueprintDir}\nblueprint_branch = main\nbootstrap_sha    = ${bootstrapSha}\nbootstrap_date   = 2026-01-01\n`,
    'utf8',
  )
  await initRepo(s, dir)
  await commitAll(s, dir, 'init')
}

// For the unregistered/not-a-project rows: ONLY the CLI files and its libs
// — never the whole `scripts/` tree, which also carries
// scripts/install-toolchain.sh and scripts/agent-activity.sh. Those are two
// of read_blueprint_source's own UNREGISTERED_MARKERS, so copying them
// unconditionally would push every such fixture over the "3 marker files"
// threshold regardless of what the test actually means to seed.
async function seedCliOnly(s: Scenario, dir: string): Promise<void> {
  await mkdir(join(dir, 'scripts/lib'), { recursive: true })
  await copyFile(SHELL_CLI, join(dir, 'scripts/blueprint'))
  await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
  await copyFile(PORTED_CLI, join(dir, 'scripts/blueprint.mts'))
  await cp(join(REPO_ROOT, 'scripts/lib'), join(dir, 'scripts/lib'), { recursive: true })
}

async function dateShimEnv(s: Scenario): Promise<Record<string, string>> {
  const shims = await s.shimDir('shims')
  await shims.add('date', 'echo 2026-01-01T00:00:00Z')
  return { PATH: shims.path() }
}

// --- fault-injection PATH shims, shared by the finding-2/finding-1 rows below.
//
// Each shim is BUILT ONCE PER SIDE (a fresh shimDir per OLD/NEW run) so the
// two runs never share a mutable directory — the same reason the pull
// describe above builds two independent project copies rather than reusing
// one, for any row that actually writes.

async function realBinPath(s: Scenario, name: string): Promise<string> {
  const r = await s.run('sh', ['-c', `command -v ${name}`], { cwd: s.workspace.root })
  expect(r.stdout.trim(), `no ${name} on PATH — cannot build a passthrough shim`).not.toBe('')
  return r.stdout.trim()
}

/** A PATH shim for `bin` that fails only when some WHOLE argv element
 * exactly equals one of `verbs` — never a substring match, so a path or
 * file name that merely CONTAINS a verb (e.g. a file called "show.md") does
 * not trip it — and otherwise execs the real binary untouched. Same idiom as
 * tests/gate-arming #9's `core.hooksPath` shim. */
async function verbFailShim(s: Scenario, tag: string, bin: string, verbs: string[]): Promise<string> {
  const real = await realBinPath(s, bin)
  const shims = await s.shimDir(tag)
  const cases = verbs.map((v) => `    ${JSON.stringify(v)}) exit 1 ;;`).join('\n')
  await shims.add(bin, `for a in "$@"; do\n  case "$a" in\n${cases}\n  esac\ndone\nexec ${JSON.stringify(real)} "$@"\n`)
  return shims.path()
}

/** A PATH shim for `bin` that fails only when some argv element CONTAINS the
 * fixed string `needle` — for a jq PROGRAM argument that is one whole
 * multi-line string, where the text that tells one jq call apart from
 * another is buried inside it rather than being the whole argument. `needle`
 * must carry no shell glob metacharacter (`*?[`); every needle used below is
 * a plain jq keyword. */
async function substringFailShim(s: Scenario, tag: string, bin: string, needle: string): Promise<string> {
  expect(needle, 'needle must be glob-metacharacter-free — this helper does no escaping').not.toMatch(/[*?[]/)
  const real = await realBinPath(s, bin)
  const shims = await s.shimDir(tag)
  // The needle is QUOTED inside the pattern (`*"needle"*`) — an unquoted
  // space in a case pattern is a bash SYNTAX ERROR (confirmed directly: a
  // bare `*def uniq*)` pattern fails the whole script to parse), which would
  // break the shim for EVERY invocation rather than the one it targets.
  await shims.add(bin, `for a in "$@"; do\n  case "$a" in\n    *${JSON.stringify(needle)}*) exit 1 ;;\n  esac\ndone\nexec ${JSON.stringify(real)} "$@"\n`)
  return shims.path()
}

describe('blueprint-port differential — drift', () => {
  // ONE project directory for both CLIs — run OLD, capture its report, then
  // reset the gate/keepalive config it armed (so NEW sees the same "was
  // unset" starting state) and run NEW. This is the same directory rather
  // than one-per-side because `drift`'s own report prints `project: <cwd>`,
  // and two distinct fixture directories can never agree on that line.
  // Plan §5's full comparison, generalised for drift's ONE-shared-directory
  // shape: drift never writes to the project tree, so `treeBefore` and the
  // tree read back after EACH side's run must all three be identical —
  // asserted explicitly rather than assumed, which is what would actually
  // catch a port that (wrongly) touched a project file. The cache is shared
  // too (same remote, same cache key on both sides), so its refs after OLD
  // must equal its refs after NEW.
  async function driftBoth(
    s: Scenario,
    proj: string,
    env: Record<string, string>,
  ): Promise<{ readonly oldResult: RunResult; readonly newResult: RunResult }> {
    const remote = await readBlueprintRemote(proj)
    const treeBefore = await walkFiles(proj)

    const oldResult = await runOld(s, proj, ['drift'], env)
    expect(await walkFiles(proj), 'drift (OLD) must never write to the project tree').toEqual(treeBefore)
    await assertNoDriftPullScratch(s)
    const cacheAfterOld = remote ? await bpCacheRefsOrSentinel(s, remote) : undefined

    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})

    const newResult = await runNew(s, proj, ['drift'], env)
    expect(await walkFiles(proj), 'drift (NEW) must never write to the project tree').toEqual(treeBefore)
    await assertNoDriftPullScratch(s)
    if (remote) {
      const cacheAfterNew = await bpCacheRefsOrSentinel(s, remote)
      expect(cacheAfterNew, "the cache's refs must match between OLD and NEW").toBe(cacheAfterOld)
    }

    return { oldResult, newResult }
  }

  it('clean — a registered project fully synced', async () => {
    await scenario('blueprint-port-drift-clean', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // Fully synced: copy the blueprint's managed files into the project and
      // commit, so nothing is drifted or missing.
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'sync')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('✓ All blueprint-managed files match the blueprint HEAD.')
      expect(oldResult.code).toBe(0)
    })
  })

  it('drifted — a project file differs from the blueprint HEAD', async () => {
    await scenario('blueprint-port-drift-drifted', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await mkdir(join(proj, 'docs'), { recursive: true })
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nan older, edited copy\n', 'utf8')
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'partial sync')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Drifted (project ≠ blueprint HEAD): 1')
      expect(oldResult.stdout).toContain('~ CLAUDE.md')
    })
  })

  it('new in blueprint — a managed file the project never pulled', async () => {
    await scenario('blueprint-port-drift-new', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('New in blueprint (not in this project): 2')
      expect(oldResult.stdout).toContain('+ CLAUDE.md')
      expect(oldResult.stdout).toContain('+ docs/DoD.md')
    })
  })

  it('refused — invalid marker structure in the project copy (BUG-034)', async () => {
    await scenario('blueprint-port-drift-refused', async (s) => {
      const bp = await s.workspace.dir('bp')
      // Give the blueprint's CLAUDE.md a well-formed marker region.
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content\n<!-- BLUEPRINT:END -->\nkeep\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // An END with no open region: bp_marker_structure reports "bad …".
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n<!-- BLUEPRINT:END -->\nbroken\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'broken markers')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 1')
      expect(oldResult.stdout).toContain("this project's markers are invalid")
    })
  })

  it('unregistered — three or more struct2flow marker files but no .blueprint-source', async () => {
    await scenario('blueprint-port-drift-unregistered', async (s) => {
      const proj = await s.workspace.dir('proj')
      await seedCliOnly(s, proj)
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
      await writeFile(join(proj, 'AGENTS.md'), '# AGENTS\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await writeFile(join(proj, 'docs/DoD.md'), '# DoD\n', 'utf8')
      const env = await dateShimEnv(s)
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stderr).toContain('NEVER REGISTERED with blueprint sync')
      expect(oldResult.code).toBe(1)
    })
  })

  it('not a project — no .blueprint-source and fewer than three marker files', async () => {
    await scenario('blueprint-port-drift-not-a-project', async (s) => {
      const proj = await s.workspace.dir('proj')
      await seedCliOnly(s, proj)
      const { oldResult, newResult } = await driftBoth(s, proj, {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.stderr).toContain('not a struct2flow project')
      expect(oldResult.code).toBe(1)
    })
  })

  /**
   * TASK-081 "drift/pull differential rows to completion" round — the four
   * rows the plan §5 header comment named as gaps in this describe ("NOT
   * ROWS … each a real gap in this file"): `scripts/lib/gate.sh` missing, an
   * exported `GIT_DIR`, a symlinked project directory, and a project name
   * holding `&`/`\`.
   */

  it('scripts/lib/gate.sh missing — refuses to report drift (TASK-029)', async () => {
    await scenario('blueprint-port-drift-gate-missing', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await rm(join(proj, 'scripts/lib/gate.sh'))
      await commitAll(s, proj, 'sync, minus gate.sh')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).not.toBe(0)
      expect(oldResult.stdout).toContain('gate: scripts/lib/gate.sh is missing — the pre-push gate is NOT armed')
      expect(oldResult.stderr).toContain('refusing to report drift without scripts/lib/gate.sh')
    })
  })

  it('an exported GIT_DIR does not redirect drift to another repository (BUG-077)', async () => {
    await scenario('blueprint-port-drift-git-dir', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'sync')

      const remote = await readBlueprintRemote(proj)
      const treeBefore = await walkFiles(proj)

      // A FRESH decoy repo PER SIDE — same reason verbFailShim rebuilds its
      // shim per side (this file's own comment on that helper): a GIT_DIR
      // pointed at one carrying state from the OLD run would make the NEW
      // run's report ("already armed" vs "was unset") a fixture artefact of
      // shared mutable state, not a genuine OLD-vs-NEW difference. `_bp_
      // project_root`/`bp_state_root` never ask git (BUG-077's own fix, a
      // pure filesystem walk) — this row's job is to prove the CLI's
      // observable behaviour is identical under an exported GIT_DIR, not to
      // assert where gate.sh's OWN `git -C` config calls land (shared,
      // unported shell, identical on both sides either way).
      const decoyOld = await s.workspace.dir('decoy-old')
      await initRepo(s, decoyOld)
      await commitAll(s, decoyOld, 'decoy base')
      const envOld = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1', GIT_DIR: join(decoyOld, '.git') }
      const oldResult = await runOld(s, proj, ['drift'], envOld)
      expect(await walkFiles(proj), 'GIT_DIR (OLD) must never write to the project tree').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      const cacheAfterOld = remote ? await bpCacheRefsOrSentinel(s, remote) : undefined

      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})

      const decoyNew = await s.workspace.dir('decoy-new')
      await initRepo(s, decoyNew)
      await commitAll(s, decoyNew, 'decoy base')
      const envNew = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1', GIT_DIR: join(decoyNew, '.git') }
      const newResult = await runNew(s, proj, ['drift'], envNew)
      expect(await walkFiles(proj), 'GIT_DIR (NEW) must never write to the project tree').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      if (remote) {
        const cacheAfterNew = await bpCacheRefsOrSentinel(s, remote)
        expect(cacheAfterNew, "the cache's refs must match between OLD and NEW").toBe(cacheAfterOld)
      }

      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('✓ All blueprint-managed files match the blueprint HEAD.')
    })
  })

  it('a symlinked project directory — run from the symlink', async () => {
    await scenario('blueprint-port-drift-symlink', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const real = await s.workspace.dir('real-proj')
      await seedRegisteredProject(s, real, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(real, 'CLAUDE.md'))
      await mkdir(join(real, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(real, 'docs/DoD.md'))
      await commitAll(s, real, 'sync')
      // logicalPwd()/`$(pwd)` are what the CLI actually reads (both runOld and
      // runNew inject PWD=cwd — see this file's own runOld/runNew comment), so
      // running with `proj` itself set to the SYMLINK exercises the CLI as an
      // operator standing inside it genuinely would, not merely a resolved
      // physical path that happens to be reachable through one.
      const symProj = join(s.workspace.root, 'proj-link')
      await symlink(real, symProj)
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, symProj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('✓ All blueprint-managed files match the blueprint HEAD.')
      expect(oldResult.stdout).toContain(`project:    ${symProj}`)
    })
  })

  /**
   * A project name holding `&` and `\` exercises placeholder substitution
   * (scripts/lib/placeholders.sh's own header documents the sed/bash `${//}`
   * bugs these two characters used to trigger). `&` alone is clean on both
   * CLIs (verified while building this row). `\` is not: the project
   * directory is the CLI's own ancestor (`scripts/blueprint.mts` lives
   * inside it), and NODE'S OWN ESM LOADER refuses an entry-point specifier
   * whose resolved path contains an encoded `\`
   * (`ERR_INVALID_MODULE_SPECIFIER: … must not include encoded "/" or "\"
   * characters`) — enforced by Node before a single line of blueprint.mts
   * runs. This is a PLATFORM CONSTRAINT of the port's own design (plan §2
   * rule 1, "one file … run via `node`"), not a fixture artefact: the real
   * shim (`exec node "$(dirname "$0")/blueprint.mts" "$@"`) hits the
   * identical failure for a project actually checked out under such a path.
   * ACCEPTED DEVIATION, extending plan §6's list: a project directory name
   * containing a literal `\` cannot run the ported CLI at all, though the
   * shell CLI runs it normally. Documented here rather than fixed, because
   * there is no `node <path>` invocation shape that accepts this path —
   * `bp_substitute_stream`'s own literal split-and-join (which this row
   * still exercises, for the CONTENT half — the `&` in the name) is not
   * what fails.
   */
  it('a project name holding & and \\ — exercises placeholder substitution, and Node’s own ESM limit on \\', async () => {
    await scenario('blueprint-port-drift-name-chars', async (s) => {
      const projName = 'a&b\\c'
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nproject={{PROJECT_NAME}}\nupper={{PROJECT_NAME_UPPER}}\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir(projName)
      await seedRegisteredProject(s, proj, bp, sha)
      // Hand-computed correct substitution: bp_placeholder_upper is
      // `tr 'a-z-' 'A-Z_'`, which leaves `&` and `\` untouched.
      await writeFile(join(proj, 'CLAUDE.md'), `# CLAUDE\nproject=${projName}\nupper=A&B\\C\n`, 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'sync')
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }

      // OLD: the shell CLI substitutes correctly and reports clean — proof
      // that the CONTENT-level substitution (the `&`/`\` literal split-and-
      // join this row means to exercise) is correct.
      const oldResult = await runOld(s, proj, ['drift'], env)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('✓ All blueprint-managed files match the blueprint HEAD.')

      // NEW: Node refuses to even load scripts/blueprint.mts from inside a
      // `\`-bearing ancestor directory — the accepted deviation above.
      const newResult = await runNew(s, proj, ['drift'], env)
      expect(newResult.code).not.toBe(0)
      expect(newResult.stderr).toContain('ERR_INVALID_MODULE_SPECIFIER')
      await assertNoDriftPullScratch(s)
    })
  })
})

/**
 * blueprint-port differential — drift's fast-forward prompt (plan §5's
 * "drift … the fast-forward prompt y/N" row).
 *
 * Only reachable under the BLUEPRINT_ROOT override (report_staleness's own
 * doc comment: "runs only where drift compares against a LOCAL checkout"),
 * with a clean, on-branch, behind-but-not-diverged local checkout — the exact
 * shape tests/staleness's own `driftFixture` builds. `BP_NO_PROMPT` is
 * deliberately NOT set here (unlike every drift row above): those rows exist
 * to prove the prompt is SUPPRESSED; these prove what happens when it fires.
 */
describe("blueprint-port differential — drift's fast-forward prompt", () => {
  /** A registered project whose `.blueprint-source` carries ONLY
   * bootstrap_sha/bootstrap_date (config v1 shape, no blueprint_remote) —
   * report_staleness is only reached via the BLUEPRINT_ROOT override branch
   * of read_blueprint_source, which needs no remote field at all. */
  async function seedOverrideProject(s: Scenario, dir: string, bootstrapSha: string): Promise<void> {
    await cp(join(REPO_ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true })
    await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
    await mkdir(join(dir, '.githooks'), { recursive: true })
    await writeFile(join(dir, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
    await s.run('chmod', ['+x', join(dir, '.githooks/pre-push')], { cwd: dir })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await writeFile(
      join(dir, '.blueprint-source'),
      `bootstrap_sha    = ${bootstrapSha}\nbootstrap_date   = 2026-01-01\n`,
      'utf8',
    )
    await initRepo(s, dir)
    await commitAll(s, dir, 'init')
  }

  /** One shared upstream, cloned to `bp` at its FIRST commit, then advanced
   * once — so a caller that clones `bp` again from the SAME `up` (the "y"
   * row below, which needs two independent `bp` copies because fast-forward
   * mutates one) gets the identical commit OBJECTS, not a second,
   * independently-timestamped near-miss with a different sha. */
  async function seedUpstream(s: Scenario, tag: string): Promise<{ up: string; firstSha: string }> {
    const up = await s.workspace.dir(`${tag}-up`)
    await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await initRepo(s, up)
    await commitAll(s, up, 'base')
    const firstSha = (await git(s, up, ['rev-parse', 'HEAD'])).stdout.trim()
    return { up, firstSha }
  }

  async function cloneBp(s: Scenario, tag: string, up: string): Promise<string> {
    const bp = s.workspace.path(`${tag}-bp`)
    await git(s, s.workspace.root, ['clone', '-q', up, bp])
    await git(s, bp, ['config', 'user.email', 't@local'])
    await git(s, bp, ['config', 'user.name', 't'])
    return bp
  }

  it('y fast-forwards the local checkout to the (shared) remote tip', async () => {
    await scenario('blueprint-port-drift-ff-y', async (s) => {
      const { up, firstSha } = await seedUpstream(s, 'ff-y')
      const oldBp = await cloneBp(s, 'ff-y-old', up)
      const newBp = await cloneBp(s, 'ff-y-new', up)
      // Advance the SHARED upstream exactly once — both clones will later
      // fetch this SAME commit object, not two independently-built ones.
      await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\nmore\n', 'utf8')
      await commitAll(s, up, 'ahead')
      const headSha = (await git(s, up, ['rev-parse', 'HEAD'])).stdout.trim()

      const oldProj = await s.workspace.dir('ff-y-old-proj')
      const newProj = await s.workspace.dir('ff-y-new-proj')
      await seedOverrideProject(s, oldProj, firstSha)
      await seedOverrideProject(s, newProj, firstSha)

      const oldResult = await withCttyAnswer(
        s,
        oldProj,
        `BLUEPRINT_ROOT='${oldBp}' bash '${join(oldProj, 'scripts/blueprint')}' drift`,
        'y\n',
        { PWD: oldProj },
      )
      const newResult = await withCttyAnswer(
        s,
        newProj,
        `BLUEPRINT_ROOT='${newBp}' '${process.execPath}' '${join(newProj, 'scripts/blueprint.mts')}' drift`,
        'y\n',
        { PWD: newProj },
      )
      // Every absolute fixture path differs between the two independent
      // sides (bp AND proj alike — drift's own report prints `project:
      // $(pwd)`), so both are scrubbed to a shared placeholder before
      // comparing rather than only the one this row happens to mutate.
      const scrub = (t: string) =>
        t.split(oldBp).join('<bp>').split(newBp).join('<bp>').split(oldProj).join('<proj>').split(newProj).join('<proj>')
      expect(scrub(newResult.output)).toBe(scrub(oldResult.output))
      expect(oldResult.output).toContain('fast-forward it now?')
      expect(oldResult.output).toContain(`✓ fast-forwarded to ${headSha.slice(0, 7)}`)
      // NON-VACUITY: the LOCAL CHECKOUT actually moved, on both sides, to the
      // SAME shared commit object — not merely "some later commit".
      expect((await git(s, oldBp, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(headSha)
      expect((await git(s, newBp, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(headSha)
    })
  })

  it('N leaves the local checkout untouched', async () => {
    await scenario('blueprint-port-drift-ff-n', async (s) => {
      // No mutation on a decline, so ONE shared bp/proj pair for OLD then NEW
      // is safe — same shape as `driftBoth` above.
      const { up, firstSha } = await seedUpstream(s, 'ff-n')
      const bp = await cloneBp(s, 'ff-n', up)
      await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\nmore\n', 'utf8')
      await commitAll(s, up, 'ahead')
      const proj = await s.workspace.dir('ff-n-proj')
      await seedOverrideProject(s, proj, firstSha)

      const oldResult = await withCttyAnswer(
        s,
        proj,
        `BLUEPRINT_ROOT='${bp}' bash '${join(proj, 'scripts/blueprint')}' drift`,
        'N\n',
        { PWD: proj },
      )
      // Same reset as `driftBoth` above: arm_gate writes core.hooksPath /
      // core.sshCommand into the project's own LOCAL git config, and a
      // second run on the SAME directory would otherwise see them already
      // armed and print a DIFFERENT status line — a divergence the run
      // ORDER would cause, not the CLI under test.
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newResult = await withCttyAnswer(
        s,
        proj,
        `BLUEPRINT_ROOT='${bp}' '${process.execPath}' '${join(proj, 'scripts/blueprint.mts')}' drift`,
        'N\n',
        { PWD: proj },
      )
      expect(newResult.output).toBe(oldResult.output)
      expect(oldResult.output).toContain('fast-forward it now?')
      expect(oldResult.output).toContain('left alone')
      expect((await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(firstSha)
    })
  })
})

/**
 * blueprint-port differential — pull (TASK-081 slice 3, plan §8 row 3).
 *
 * This describe: nothing to pull; a full `--yes` pull that advances
 * bootstrap_sha; a partial named-file pull that does not; the
 * BUG-018/BUG-054 non-TTY refusal (exit 7); a guard refusal (BUG-034, exit
 * 4); `pull scripts/blueprint` against the REAL shell CLI's own lib list
 * (plan §7); and the interactive y/N/q prompt. The REST of plan §5's ~30-row
 * pull family — backup-copy and merge on their own genuine terms (not only
 * as a tool-failure fallback), retirement, and the executable bit in both
 * directions — is the "pull matrix" describe further down this file, and
 * settings-layer refusals reached via `pull` are proven in that describe's
 * own group (closing Codex re-review finding 7).
 *

 * PULL WRITES FILES, unlike drift. A row that actually lands something
 * builds TWO INDEPENDENT project copies (one per CLI) rather than reusing
 * driftBoth's one-directory-then-reset pattern, which only works because
 * drift never mutates. A row that provably writes nothing (nothing-to-pull,
 * the two refusal rows, and the fully-in-sync `scripts/blueprint` row) runs
 * OLD then NEW on the SAME directory, like driftBoth.
 */
describe('blueprint-port differential — pull', () => {
  /** A blueprint with TWO commits, so "the project is one commit behind" and
   * "the project is fully synced" are distinguishable — with one commit the
   * two coincide and a bootstrap_sha assertion would be vacuous (the same
   * mistake pull-behaviour's own fixtureBlueprint calls out). */
  async function seedBlueprintRepoTwoCommits(s: Scenario, dir: string): Promise<{ first: string; head: string }> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
    await initRepo(s, dir)
    await commitAll(s, dir, 'base')
    const first = (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\nsecond commit\n', 'utf8')
    await commitAll(s, dir, 'second')
    const head = (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
    return { first, head }
  }

  /** A project registered against the blueprint's FIRST commit, drifted on
   * CLAUDE.md only (docs/DoD.md stays in sync) — the shape both the
   * full-pull and partial-pull rows need. */
  async function driftedProject(s: Scenario, tag: string, bp: string, firstSha: string): Promise<string> {
    const proj = await s.workspace.dir(tag)
    await seedRegisteredProject(s, proj, bp, firstSha)
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(proj, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await commitAll(s, proj, 'partial sync')
    return proj
  }

  it('nothing to pull — a fully synced project', async () => {
    await scenario('blueprint-port-pull-nothing', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'sync')
      const env = await dateShimEnv(s)
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull'], env)
      expect(await walkFiles(proj), 'nothing-to-pull (OLD) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      const newResult = await runNew(s, proj, ['pull'], env)
      expect(await walkFiles(proj), 'nothing-to-pull (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('✓ Nothing to pull. Project matches blueprint HEAD.')
    })
  })

  it('full --yes — the one drifted managed file is pulled, bootstrap_sha advances', async () => {
    await scenario('blueprint-port-pull-full-yes', async (s) => {
      const bp = await s.workspace.dir('bp')
      const { first, head } = await seedBlueprintRepoTwoCommits(s, bp)
      const oldProj = await driftedProject(s, 'old', bp, first)
      const newProj = await driftedProject(s, 'new', bp, first)
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('✓ Pulled 1 file(s). Review')
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      expect(oldClaude).toBe('# CLAUDE\nfixture\nsecond commit\n')
      const oldSrc = await readFile(join(oldProj, '.blueprint-source'), 'utf8')
      const newSrc = await readFile(join(newProj, '.blueprint-source'), 'utf8')
      expect(newSrc).toBe(oldSrc)
      expect(oldSrc).toContain(`bootstrap_sha    = ${head}`)
      // Plan §5's full tree comparison, not only the two spot-checked files
      // above — every path/byte/mode the pull touched or left alone.
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('partial — one named file pulls, bootstrap_sha stays at the OLD sha (BUG-016)', async () => {
    await scenario('blueprint-port-pull-partial', async (s) => {
      const bp = await s.workspace.dir('bp')
      const { first } = await seedBlueprintRepoTwoCommits(s, bp)
      const oldProj = await driftedProject(s, 'old', bp, first)
      const newProj = await driftedProject(s, 'new', bp, first)
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'CLAUDE.md', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'CLAUDE.md', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('bootstrap_sha left unchanged — this was a partial pull')
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      expect(oldClaude).toBe('# CLAUDE\nfixture\nsecond commit\n')
      const oldSrc = await readFile(join(oldProj, '.blueprint-source'), 'utf8')
      expect(oldSrc).toContain(`bootstrap_sha    = ${first}`)
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('non-TTY without --yes: a controlling terminal, non-interactive stdin — exit 7 (BUG-018/BUG-054)', async () => {
    await scenario('blueprint-port-pull-non-tty', async (s) => {
      const bp = await s.workspace.dir('bp')
      const { first } = await seedBlueprintRepoTwoCommits(s, bp)
      const proj = await s.workspace.dir('proj')
      await driftedProjectInto(s, proj, bp, first)
      const treeBefore = await walkFiles(proj)
      const oldResult = await withCttyNoStdin(s, proj, `bash '${SHELL_CLI}' pull </dev/null 2>&1`, { PWD: proj })
      expect(await walkFiles(proj), 'non-TTY refusal (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await withCttyNoStdin(
        s,
        proj,
        `'${process.execPath}' '${PORTED_CLI}' pull </dev/null 2>&1`,
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'non-TTY refusal (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.code).not.toBe(0)
      expect(oldResult.output).toMatch(/not interactive|no terminal|--yes/i)
      // Nothing written: both runs share ONE directory, so a write in the
      // first run would make the second run see an already-synced project.
      const claudeAfter = await readFile(join(proj, 'CLAUDE.md'), 'utf8')
      expect(claudeAfter).toBe('# CLAUDE\nfixture\n')
    })
  })

  /** driftedProject, but writing into an ALREADY-CREATED directory — the
   * non-TTY row runs OLD then NEW on one shared project (nothing is ever
   * written), so it needs the fixture built once, not the two-copy shape. */
  async function driftedProjectInto(s: Scenario, proj: string, bp: string, firstSha: string): Promise<void> {
    await seedRegisteredProject(s, proj, bp, firstSha)
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(proj, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await commitAll(s, proj, 'partial sync')
  }

  it('refused — invalid marker structure in the project copy: exit 4 (BUG-034)', async () => {
    await scenario('blueprint-port-pull-refused', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content\n<!-- BLUEPRINT:END -->\nkeep\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // An END with no open region: bp_marker_structure reports "bad …", so
      // pull_file refuses it outright — no prompt is ever reached for this
      // file, so OLD then NEW on the SAME directory is safe (nothing else in
      // this fixture drifts, so nothing else is written either).
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n<!-- BLUEPRINT:END -->\nbroken\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'broken markers')
      const env = await dateShimEnv(s)
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull'], env)
      expect(await walkFiles(proj), 'refused (OLD) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      const newResult = await runNew(s, proj, ['pull'], env)
      expect(await walkFiles(proj), 'refused (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain("this project's markers are invalid")
      expect(oldResult.stdout).toContain('Nothing pulled.')
    })
  })

  /**
   * `pull scripts/blueprint` against the REAL shell CLI and its real
   * scripts/lib/*.sh — plan §7's "for a shell scripts/blueprint the output
   * is today's" proof, using the actual file (not a stripped fixture copy)
   * so `_bp_cli_libs`'s grep and `bpCliLibs`'s regex are compared on the
   * bytes that matter.
   *
   * ONE DELIBERATE, DOCUMENTED DIVERGENCE (not yet in plan §6's accepted-
   * deviations list — worth adding there): `cmd_pull`'s `namesCli` treats
   * naming EITHER `scripts/blueprint` OR `scripts/blueprint.mts` as naming
   * BOTH (plan §7, "naming either alone brings both, never one without the
   * other"), and `scripts/blueprint.mts` is itself a real tracked file in
   * THIS repo already (mid-port), so it is part of the blueprint's managed
   * set today, not only after slice 5. The shell CLI has no notion of it at
   * all, so OLD's output can never mention it. `scripts/blueprint.mts` never
   * spells the project-name placeholder token (pinned by a slice 1 test), so
   * substituting it is the identity regardless of the project's name — it
   * reports "same" on both fixture copies, one extra line, asserted
   * explicitly rather than papered over with `expectIdentical`.
   *
   * TWO INDEPENDENT PROJECT COPIES, not one shared directory: several of the
   * REAL scripts/lib/*.sh files DO carry the placeholder token (e.g.
   * request-inputs.sh, state-dir.sh's incident-record quote), and this
   * fixture's project tree is a raw filesystem `cp`, never a real pull — so
   * those libs compare as DRIFTED (the blueprint's copy, substituted with
   * this project's name, differs from the project's still-literal-token raw
   * copy) and DO get pulled. That is correct, substitution-driven behaviour,
   * not a fixture bug — but it means this row mutates, like the full/partial
   * rows above.
   */
  it('pull scripts/blueprint — the real shell CLI and its real libs', async () => {
    await scenario('blueprint-port-pull-cli-libs', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await cp(join(REPO_ROOT, 'scripts'), join(bp, 'scripts'), { recursive: true })
      await s.run('chmod', ['+x', join(bp, 'scripts/blueprint')], { cwd: bp })
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      // SAME leaf name ("proj") under two distinct parents — several of the
      // real libs substitute the project's name (its logical PWD's basename)
      // into their content, and a `old`/`new` leaf mismatch would make that
      // substitution itself the difference this row is trying to rule out.
      const oldProj = await s.workspace.dir('side-old', 'proj')
      const newProj = await s.workspace.dir('side-new', 'proj')
      await seedRegisteredProject(s, oldProj, bp, sha)
      await seedRegisteredProject(s, newProj, bp, sha)
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'scripts/blueprint', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'scripts/blueprint', '--yes'], env)

      expect(oldResult.code).toBe(0)
      expect(newResult.code).toBe(0)
      expect(newResult.stderr).toBe(oldResult.stderr)
      const oldNormalized = normalizeDiffHeaders(oldResult.stdout)
      const newNormalized = normalizeDiffHeaders(newResult.stdout)
      expect(oldNormalized).toContain('scripts/blueprint brings the libs it sources:')
      expect(oldNormalized).not.toContain('scripts/blueprint.mts')
      expect(oldNormalized).toMatch(/ {2}same {2}scripts\/blueprint\n/)
      // NEW's stdout is OLD's, plus exactly one extra "same" line for the
      // .mts sibling it also considers, inserted right after scripts/
      // blueprint's own "same" line (the order `cmdPull` iterates files in).
      const expectedNewNormalized = oldNormalized.replace(
        /( {2}same {2}scripts\/blueprint\n)/,
        '$1  same  scripts/blueprint.mts\n',
      )
      expect(newNormalized).toBe(expectedNewNormalized)
      // Plan §5's tree comparison: the extra "same" line NEW prints is
      // REPORTING-only (§6's own note — blueprint.mts substitutes to the
      // identity), so once the report difference above is accounted for, the
      // two independently-pulled trees must still be byte-identical.
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  /**
   * The interactive `Pull this file? [y/N/q]` prompt itself (plan §5's first
   * remaining row group), under a REAL controlling terminal with a REAL
   * answer on stdin — `withCttyNoStdin` (used by the non-TTY row above)
   * deliberately supplies an EMPTY answer to prove the refusal path; these
   * three rows drive the answer PAST that guard to prove `read`/
   * `readLineFromStdin()` itself, via `withCttyAnswer` (tests/helpers/tty.ts).
   */

  it('interactive prompt — y pulls the file and advances bootstrap_sha', async () => {
    await scenario('blueprint-port-pull-prompt-y', async (s) => {
      // TWO INDEPENDENT project copies (a write happens), but ONE SHARED
      // upstream: `bp` is cloned twice from the SAME `up`, and `up`'s second
      // commit is created exactly ONCE — so the commit object `bp` fast-
      // forwards to (and the sha `pull` reports fetching) is the identical
      // object on both sides, not two independently-timestamped near-misses.
      // (Unlike the pull describe's own two-commit blueprint, which needs no
      // such sharing because nothing here mutates a SEPARATE local checkout —
      // this row's write is the pulled file, and `seedBlueprintRepoTwoCommits`
      // already builds ONE bp both `oldProj`/`newProj` register against.)
      const bp = await s.workspace.dir('prompt-y-bp')
      const { first, head } = await seedBlueprintRepoTwoCommits(s, bp)
      const oldProj = await driftedProject(s, 'prompt-y-old', bp, first)
      const newProj = await driftedProject(s, 'prompt-y-new', bp, first)
      const oldResult = await withCttyAnswer(
        s,
        oldProj,
        `bash '${join(oldProj, 'scripts/blueprint')}' pull`,
        'y\n',
        { PWD: oldProj },
      )
      const newResult = await withCttyAnswer(
        s,
        newProj,
        `'${process.execPath}' '${join(newProj, 'scripts/blueprint.mts')}' pull`,
        'y\n',
        { PWD: newProj },
      )
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.output).toContain('✓ Pulled 1 file(s). Review')
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      expect(oldClaude).toBe('# CLAUDE\nfixture\nsecond commit\n')
      const oldSrc = await readFile(join(oldProj, '.blueprint-source'), 'utf8')
      const newSrc = await readFile(join(newProj, '.blueprint-source'), 'utf8')
      expect(newSrc).toBe(oldSrc)
      expect(oldSrc).toContain(`bootstrap_sha    = ${head}`)
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('interactive prompt — N skips the file, nothing written, bootstrap_sha unchanged', async () => {
    await scenario('blueprint-port-pull-prompt-n', async (s) => {
      // Nothing this answer can ever write (a skip, never a pull), so ONE
      // shared project for OLD then NEW is safe — same shape as the non-TTY
      // row's shared-directory reuse just above.
      const bp = await s.workspace.dir('prompt-n-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prompt-n-proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const treeBefore = await walkFiles(proj)
      const oldResult = await withCttyAnswer(
        s,
        proj,
        `bash '${join(proj, 'scripts/blueprint')}' pull`,
        'N\n',
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'prompt N (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await withCttyAnswer(
        s,
        proj,
        `'${process.execPath}' '${join(proj, 'scripts/blueprint.mts')}' pull`,
        'N\n',
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'prompt N (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.output).toContain('skipped')
      expect(oldResult.output).toContain('Nothing pulled.')
      // NON-VACUITY: both managed files are genuinely NEW here
      // (seedRegisteredProject seeds no CLAUDE.md/docs/DoD.md of its own), so
      // "skipped" means the operator's "N" was HONOURED — neither landed.
      expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(false)
      expect(existsSync(join(proj, 'docs/DoD.md'))).toBe(false)
    })
  })

  it("interactive prompt — q quits: the remaining file, retirement, and bootstrap_sha are all untouched", async () => {
    await scenario('blueprint-port-pull-prompt-q', async (s) => {
      // Two "new" managed files (CLAUDE.md, docs/DoD.md) so `q` at the FIRST
      // file's prompt leaves a SECOND, later file provably unreached — the
      // shape plan §5 asks for ("remaining files untouched"). `q` aborts
      // before any write, so ONE shared project for OLD then NEW is safe.
      const bp = await s.workspace.dir('prompt-q-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prompt-q-proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const treeBefore = await walkFiles(proj)
      const oldResult = await withCttyAnswer(
        s,
        proj,
        `bash '${join(proj, 'scripts/blueprint')}' pull`,
        'q\n',
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'prompt q (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await withCttyAnswer(
        s,
        proj,
        `'${process.execPath}' '${join(proj, 'scripts/blueprint.mts')}' pull`,
        'q\n',
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'prompt q (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.output).toContain('aborted')
      expect(oldResult.output).toContain('Nothing pulled.')
      // NON-VACUITY, the whole point of this row: neither file landed, and
      // the SECOND file's own prompt never even printed — `q` at the first
      // stopped the loop before docs/DoD.md was ever reached.
      expect(oldResult.output).not.toContain('docs/DoD.md')
      expect(existsSync(join(proj, 'CLAUDE.md'))).toBe(false)
      expect(existsSync(join(proj, 'docs/DoD.md'))).toBe(false)
      const src = await readFile(join(proj, '.blueprint-source'), 'utf8')
      expect(src).toContain(`bootstrap_sha    = ${sha}`)
    })
  })
})

/**
 * blueprint-port differential — the remaining pull-mode rows (plan §5's pull
 * matrix, Codex re-review finding 7): a GENUINE backup-copy (`ok:none`, no
 * tool failure — the finding-1 describe below only proves the FALLBACK into
 * backup-copy when `awk` fails, never this branch reached on its own terms),
 * a GENUINE marker-aware merge that succeeds, retirement offered and
 * accepted (`--yes`) alongside an edited copy kept, and the executable bit
 * following the blueprint's own mode in both directions.
 */
describe('blueprint-port differential — pull matrix (backup-copy, merge, retirement, exec bit)', () => {
  it('backup-copy — the blueprint uses markers, the project copy has none', async () => {
    await scenario('blueprint-port-pull-backup-copy', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content v2\n<!-- BLUEPRINT:END -->\nkeep\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, sha)
        // The project's own copy carries NO marker region at all (bs=ok,
        // ps=none) — the backup-copy branch's own condition, reached
        // without any tool ever failing.
        await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nplain, no markers, project-edited\n', 'utf8')
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await commitAll(s, proj, 'unmarked copy')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'CLAUDE.md', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'CLAUDE.md', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('blueprint uses markers')
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      // NON-VACUITY: the project's own edit is gone — backup-copy OVERWRITES,
      // unlike merge, which would have kept "keep" outside the region.
      expect(oldClaude).toBe(await readFile(join(bp, 'CLAUDE.md'), 'utf8'))
      // Codex's named example (plan §5, this round's brief): the backup
      // itself — `.bp-bak` — must exist with the ORIGINAL project bytes, on
      // both sides, asserted explicitly rather than left to the tree
      // comparison below to notice implicitly.
      const oldBak = await readFile(join(oldProj, 'CLAUDE.md.bp-bak'), 'utf8')
      const newBak = await readFile(join(newProj, 'CLAUDE.md.bp-bak'), 'utf8')
      expect(oldBak).toBe('# CLAUDE\nplain, no markers, project-edited\n')
      expect(newBak).toBe(oldBak)
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('merge — both sides carry markers, the managed region updates and the project text outside it survives', async () => {
    await scenario('blueprint-port-pull-merge', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content v2\n<!-- BLUEPRINT:END -->\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, sha)
        await writeFile(
          join(proj, 'CLAUDE.md'),
          '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content v1\n<!-- BLUEPRINT:END -->\nthe project wrote this\n',
          'utf8',
        )
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await commitAll(s, proj, 'marked copy')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', 'CLAUDE.md', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', 'CLAUDE.md', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      expect(oldClaude).toContain('managed content v2')
      // NON-VACUITY: the merge, not a plain overwrite — the project's own
      // text outside the marker region survived.
      expect(oldClaude).toContain('the project wrote this')
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('retirement — an unedited retired file is removed with --yes, an edited one is kept ("yours now")', async () => {
    await scenario('blueprint-port-pull-retirement', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await writeFile(join(bp, 'docs/gone.md'), 'unedited, about to be retired\n', 'utf8')
      await writeFile(join(bp, 'docs/kept.md'), 'about to be retired, but edited\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'one')
      const first = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()
      await git(s, bp, ['rm', '-q', 'docs/gone.md', 'docs/kept.md'])
      await commitAll(s, bp, 'two — stopped shipping both')

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, first)
        await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await writeFile(join(proj, 'docs/gone.md'), 'unedited, about to be retired\n', 'utf8')
        await writeFile(join(proj, 'docs/kept.md'), 'about to be retired, but edited\nand the project added this\n', 'utf8')
        await commitAll(s, proj, 'sync at first, plus the soon-to-retire files')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toMatch(/retired\s+docs\/gone\.md/)
      expect(oldResult.stdout).toMatch(/yours now\s+docs\/kept\.md/)
      expect(existsSync(join(oldProj, 'docs/gone.md'))).toBe(false)
      expect(existsSync(join(newProj, 'docs/gone.md'))).toBe(false)
      expect(existsSync(join(oldProj, 'docs/kept.md'))).toBe(true)
      expect(existsSync(join(newProj, 'docs/kept.md'))).toBe(true)
      // Codex's named example: the KEPT file's bytes, compared explicitly —
      // "yours now" must mean the project's own edited copy survived
      // untouched, on both sides, not merely that the path still exists.
      const oldKept = await readFile(join(oldProj, 'docs/kept.md'), 'utf8')
      const newKept = await readFile(join(newProj, 'docs/kept.md'), 'utf8')
      expect(oldKept).toBe('about to be retired, but edited\nand the project added this\n')
      expect(newKept).toBe(oldKept)
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  /**
   * TASK-081 "drift/pull differential rows to completion" round — plan §5's
   * "retirement answered by a NON-TTY (the refusal path) and by q,
   * differentially (only y exists)". Both reach `_bp_retire` via `cmd_pull`'s
   * "nothing to pull" branch (`echo "✓ Nothing to pull..."; _bp_retire
   * "$auto_yes"` — scripts/blueprint:1578-1581): a project fully synced on
   * every OTHER managed file, with exactly one unedited retirement
   * candidate, so the retirement prompt is the FIRST and only thing pull
   * has left to do. Neither answer ever writes, so OLD then NEW share one
   * project directory, like the pull describe's own refused/non-mutating
   * rows.
   */
  async function seedRetirementCandidate(s: Scenario, tag: string): Promise<{ proj: string }> {
    const bp = await s.workspace.dir(`${tag}-bp`)
    await mkdir(join(bp, 'docs'), { recursive: true })
    await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
    await writeFile(join(bp, 'docs/gone.md'), 'unedited, about to be retired\n', 'utf8')
    await initRepo(s, bp)
    await commitAll(s, bp, 'one')
    const first = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()
    await git(s, bp, ['rm', '-q', 'docs/gone.md'])
    await commitAll(s, bp, 'two — stopped shipping docs/gone.md')

    const proj = await s.workspace.dir(`${tag}-proj`)
    await seedRegisteredProject(s, proj, bp, first)
    await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
    await mkdir(join(proj, 'docs'), { recursive: true })
    await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
    await writeFile(join(proj, 'docs/gone.md'), 'unedited, about to be retired\n', 'utf8')
    await commitAll(s, proj, 'sync at first, plus the soon-to-retire file')
    return { proj }
  }

  it('retirement — a non-TTY without --yes refuses to prompt, nothing retired (exit 7)', async () => {
    await scenario('blueprint-port-pull-retirement-nontty', async (s) => {
      const { proj } = await seedRetirementCandidate(s, 'nontty')
      const treeBefore = await walkFiles(proj)
      const oldResult = await withCttyNoStdin(s, proj, `bash '${SHELL_CLI}' pull </dev/null 2>&1`, { PWD: proj })
      expect(await walkFiles(proj), 'retirement non-TTY (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await withCttyNoStdin(
        s,
        proj,
        `'${process.execPath}' '${PORTED_CLI}' pull </dev/null 2>&1`,
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'retirement non-TTY (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.code).toBe(7)
      expect(oldResult.output).toContain('not interactive')
      expect(oldResult.output).toContain('cannot prompt, so nothing is retired')
      expect(existsSync(join(proj, 'docs/gone.md'))).toBe(true)
    })
  })

  it('retirement — q at the prompt leaves the candidate untouched', async () => {
    await scenario('blueprint-port-pull-retirement-q', async (s) => {
      const { proj } = await seedRetirementCandidate(s, 'retq')
      const treeBefore = await walkFiles(proj)
      const oldResult = await withCttyAnswer(
        s,
        proj,
        `bash '${join(proj, 'scripts/blueprint')}' pull`,
        'q\n',
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'retirement q (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await withCttyAnswer(
        s,
        proj,
        `'${process.execPath}' '${join(proj, 'scripts/blueprint.mts')}' pull`,
        'q\n',
        { PWD: proj },
      )
      expect(await walkFiles(proj), 'retirement q (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expect(normalizeDiffHeaders(newResult.output)).toBe(normalizeDiffHeaders(oldResult.output))
      expect(oldResult.output).toContain('aborted')
      expect(oldResult.code).toBe(0)
      expect(existsSync(join(proj, 'docs/gone.md'))).toBe(true)
    })
  })

  it('exec bit — pull sets +x on a newly-executable managed file and clears it when the blueprint drops it', async () => {
    await scenario('blueprint-port-pull-exec-bit', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      // CLAUDE.md starts executable (unusual, but exercises "+x lands"); a
      // second managed file, scripts/tool.sh, starts executable in the
      // PROJECT and loses its bit in the blueprint's second commit.
      await mkdir(join(bp, 'scripts'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nv1\n', 'utf8')
      await writeFile(join(bp, 'scripts/tool.sh'), '#!/bin/sh\necho v1\n', 'utf8')
      await chmod(join(bp, 'scripts/tool.sh'), 0o755)
      await initRepo(s, bp)
      await commitAll(s, bp, 'one')
      const first = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nv2\n', 'utf8')
      await chmod(join(bp, 'CLAUDE.md'), 0o755)
      await writeFile(join(bp, 'scripts/tool.sh'), '#!/bin/sh\necho v2\n', 'utf8')
      await chmod(join(bp, 'scripts/tool.sh'), 0o644)
      await commitAll(s, bp, 'two — CLAUDE.md gains +x, tool.sh loses it')

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, first)
        await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nv1\n', 'utf8')
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await mkdir(join(proj, 'scripts'), { recursive: true })
        await writeFile(join(proj, 'scripts/tool.sh'), '#!/bin/sh\necho v1\n', 'utf8')
        await chmod(join(proj, 'scripts/tool.sh'), 0o755)
        await commitAll(s, proj, 'sync at first commit')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      const oldClaudeMode = (await stat(join(oldProj, 'CLAUDE.md'))).mode & 0o777
      const newClaudeMode = (await stat(join(newProj, 'CLAUDE.md'))).mode & 0o777
      const oldToolMode = (await stat(join(oldProj, 'scripts/tool.sh'))).mode & 0o777
      const newToolMode = (await stat(join(newProj, 'scripts/tool.sh'))).mode & 0o777
      // The EXACT resulting mode is a umask artefact of how this host's git
      // materialises a substituted blueprint copy — not this row's subject.
      // Byte-for-byte parity between the two CLIs is; the owner exec bit
      // moving in the right direction on each file is the behaviour under
      // test.
      expect(newClaudeMode).toBe(oldClaudeMode)
      expect(newToolMode).toBe(oldToolMode)
      expect(oldClaudeMode & 0o100, 'CLAUDE.md did not gain +x').toBe(0o100)
      expect(oldToolMode & 0o100, "scripts/tool.sh did not lose +x").toBe(0)
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })
})

/**
 * blueprint-port differential — finding 1 (plan §5's required failure rows):
 * `cp`, `awk` and `jq` failing INSIDE bp_prospective_for's own dynamic extent
 * (bp_prospective_pull's `cp`, marker_aware_merge's `awk`, and
 * _bp_settings_layer's merge `jq`) — 1ced574 proved the `unchecked()`
 * mechanism itself with unit tests (a bare call rejects, the wrapped call
 * absorbs and returns the last-command result); these four rows are the
 * TRUE END-TO-END proof plan §5 asks for: a real `drift`/`pull` run, driven
 * by a PATH shim, comparing the shell CLI against the port.
 *
 * Each shim fails the tool for EVERY invocation during the run (not just one
 * call), which is safe here because a plain drift/pull run (no a2bp) reaches
 * `cp`/`awk` NOWHERE ELSE — checked directly against scripts/blueprint and
 * every scripts/lib/*.sh it sources for this file set. The one exception is
 * `cp` in a PULL that actually writes: `_bp_shielded_write` (P2) ALSO runs a
 * `cp -p DEST tmp` to preserve an EXISTING destination's mode before
 * overwriting it — reached for `.blueprint-source` itself once any file is
 * pulled — so a `cp` shim used in a pull row fails only the PLAIN, no-flags
 * form `cp SRC DST` that bp_prospective_pull's own "new"/"copy"/"backup-copy"
 * branches use, passing the `-p` form through untouched.
 */
describe('blueprint-port differential — finding 1 (tool failures inside prospective)', () => {
  async function dateAndToolFailEnv(s: Scenario, tag: string, bin: string): Promise<Record<string, string>> {
    const shims = await s.shimDir(tag)
    await shims.add('date', 'echo 2026-01-01T00:00:00Z')
    await shims.add(bin, 'exit 1\n')
    return { PATH: shims.path() }
  }

  /** Same idea as `dateAndToolFailEnv`, but for `cp` in a row that reaches
   * `_bp_shielded_write`'s OWN unrelated `cp -p` (the pull-writes-something
   * case) — passes any invocation carrying `-p` through to the real `cp`,
   * and fails only the plain two-argument form bp_prospective_pull uses. */
  async function dateAndCpFailUnlessPreserveEnv(s: Scenario, tag: string): Promise<Record<string, string>> {
    const real = await realBinPath(s, 'cp')
    const shims = await s.shimDir(tag)
    await shims.add('date', 'echo 2026-01-01T00:00:00Z')
    await shims.add(
      'cp',
      `for a in "$@"; do\n  case "$a" in\n    -p) exec ${JSON.stringify(real)} "$@" ;;\n  esac\ndone\nexit 1\n`,
    )
    return { PATH: shims.path() }
  }

  it('drift — cp fails inside bp_prospective_pull\'s "copy" mode (none:none, no markers either side)', async () => {
    await scenario('blueprint-port-f1-drift-cp', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // Neither copy carries BLUEPRINT:BEGIN/END markers (seedBlueprintRepo's
      // plain fixture content), so bp_marker_structure reports "none" on
      // both sides and bp_prospective_pull takes the `none:none` branch —
      // the one whose OWN body is a bare `cp`, not `marker_aware_merge`.
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nan older, edited copy\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'partial sync')

      const treeBefore = await walkFiles(proj)
      const oldEnv = { ...(await dateAndToolFailEnv(s, 'old-shims', 'cp')), BP_NO_PROMPT: '1' }
      const oldResult = await runOld(s, proj, ['drift'], oldEnv)
      expect(await walkFiles(proj), 'drift (OLD) must never write to the project tree').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newEnv = { ...(await dateAndToolFailEnv(s, 'new-shims', 'cp')), BP_NO_PROMPT: '1' }
      const newResult = await runNew(s, proj, ['drift'], newEnv)
      expect(await walkFiles(proj), 'drift (NEW) must never write to the project tree').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)

      expectIdentical(oldResult, newResult)
      // NON-VACUITY: a working `cp` here would report both files as cleanly
      // DRIFTED (content differs, comparison succeeds) — the REFUSED bucket
      // below is only reachable because the shimmed `cp` made
      // bp_prospective_for's own return status non-zero for BOTH managed
      // files (docs/DoD.md is unchanged content-wise, but its "copy" branch
      // runs the same failing `cp`), which cmd_drift reads as a refusal
      // regardless of the WHY it's carrying (a stale or empty BP_PP_WHY from
      // this exact hazard — reproduced, not designed).
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 2')
    })
  })

  it('pull — cp fails inside bp_prospective_pull\'s "new" mode, on a file the project never pulled', async () => {
    await scenario('blueprint-port-f1-pull-cp', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const oldProj = await s.workspace.dir('old-proj')
      const newProj = await s.workspace.dir('new-proj')
      await seedRegisteredProject(s, oldProj, bp, sha)
      await seedRegisteredProject(s, newProj, bp, sha)
      // Neither project has CLAUDE.md or docs/DoD.md at all — both are "new
      // in blueprint", so bp_prospective_pull's `[ ! -f "$proj" ]` branch is
      // what's exercised (mode=new, a bare `cp "$bp" "$out"`), never the
      // `none:none` copy branch the drift row above targets.
      const oldEnv = await dateAndCpFailUnlessPreserveEnv(s, 'old-shims')
      const newEnv = await dateAndCpFailUnlessPreserveEnv(s, 'new-shims')
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], oldEnv)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], newEnv)

      expectPullIdentical(oldResult, newResult)
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      // NON-VACUITY, and the genuinely surprising part this row exists to
      // pin: BP_PP_MODE stays "new" (set BEFORE the cp call), so pull_file
      // proceeds to WRITE anyway — from an `$out` mktemp file the failed cp
      // never populated. The write itself (`cat`, not `cp` — P2's shield)
      // succeeds on zero bytes, so pull reports success and installs an
      // EMPTY file rather than failing loudly. Both sides must agree this
      // is what happens, not just that they agree with each other.
      expect(oldClaude).toBe('')
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('pull — awk fails inside marker_aware_merge, falling back to backup-copy silently', async () => {
    await scenario('blueprint-port-f1-pull-awk', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const oldProj = await s.workspace.dir('old-proj')
      const newProj = await s.workspace.dir('new-proj')
      await seedRegisteredProject(s, oldProj, bp, sha)
      await seedRegisteredProject(s, newProj, bp, sha)
      // bp_marker_structure is ITSELF awk-based, so once awk is globally
      // broken it reports neither "none" nor "ok N" for either side — the
      // failed command substitution captures empty stdout. That falls
      // through both the `none:none`/`none:ok*`/`ok*:none` cases (none of
      // which match an empty string) to the wildcard branch, whose own
      // `marker_aware_merge` call fails on the SAME broken awk and the
      // whole thing degrades to `backup-copy`: a bare `cp` overwrite (with a
      // "marker structure mismatch" WHY that is cosmetically wrong — it
      // wasn't a mismatch, awk itself failed — but stays byte-identical
      // between the two CLIs, which is what this row actually proves).
      for (const proj of [oldProj, newProj]) {
        await mkdir(join(proj, 'docs'), { recursive: true })
        await writeFile(join(proj, 'CLAUDE.md'), "# CLAUDE\nthe project's own edit\n", 'utf8')
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await commitAll(s, proj, 'partial sync')
      }
      const oldEnv = await dateAndToolFailEnv(s, 'old-shims', 'awk')
      const newEnv = await dateAndToolFailEnv(s, 'new-shims', 'awk')
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], oldEnv)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], newEnv)

      expectPullIdentical(oldResult, newResult)
      const oldClaude = await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')
      const newClaude = await readFile(join(newProj, 'CLAUDE.md'), 'utf8')
      expect(newClaude).toBe(oldClaude)
      // NON-VACUITY: the fallback landed the BLUEPRINT's content whole,
      // never the project's own edit — the divergence a broken merge would
      // otherwise hide.
      expect(oldClaude).toBe('# CLAUDE\nfixture\n')
      expect(oldClaude).not.toContain('own edit')
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('pull — jq fails inside the settings merge (_bp_settings_layer), refusing the file', async () => {
    await scenario('blueprint-port-f1-pull-jq-merge', async (s) => {
      const settingsJson = (allow: string[]) =>
        `${JSON.stringify({ permissions: { allow, ask: [], deny: [] } }, null, 2)}\n`
      const layer = `${JSON.stringify({ permissions: { allow: ['Bash(aws logs tail *)'] } }, null, 2)}\n`

      async function seedSettingsBlueprint(dir: string): Promise<string> {
        await mkdir(join(dir, 'docs'), { recursive: true })
        await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
        await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
        await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
        await mkdir(join(dir, '.claude'), { recursive: true })
        await writeFile(join(dir, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
        await initRepo(s, dir)
        await commitAll(s, dir, 'base')
        return (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
      }

      const bp = await s.workspace.dir('bp')
      const sha = await seedSettingsBlueprint(bp)
      const oldProj = await s.workspace.dir('old-proj')
      const newProj = await s.workspace.dir('new-proj')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, sha)
        await mkdir(join(proj, 'docs'), { recursive: true })
        await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
        await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
        await mkdir(join(proj, '.claude'), { recursive: true })
        await writeFile(join(proj, '.claude/settings.json'), settingsJson([]), 'utf8')
        await writeFile(join(proj, '.claude/settings.project.json'), layer, 'utf8')
        await commitAll(s, proj, 'layered settings')
      }

      // Fails ONLY jq calls whose PROGRAM ARGUMENT contains "def uniq" — the
      // settings MERGE program (BP_SETTINGS_MERGE) and no other jq call this
      // run makes (bpOneObject's and the shape check's programs contain
      // neither word), so the earlier checks succeed normally and the run
      // reaches exactly the merge step this row means to break.
      const oldPath = await substringFailShim(s, 'old-jq', 'jq', 'def uniq')
      const newPath = await substringFailShim(s, 'new-jq', 'jq', 'def uniq')
      const oldResult = await runOld(s, oldProj, ['pull', '.claude/settings.json'], { PATH: oldPath })
      const newResult = await runNew(s, newProj, ['pull', '.claude/settings.json'], { PATH: newPath })

      expectPullIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('could not be merged')
      // Refused: nothing written, the project's settings.json is untouched.
      const oldSettings = await readFile(join(oldProj, '.claude/settings.json'), 'utf8')
      expect(oldSettings).toBe(settingsJson([]))
      expect(await walkFiles(newProj), 'the two independently-run refusals must leave byte-identical trees').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })
})

/**
 * blueprint-port differential — a needed tool ABSENT on PATH, or present but
 * not executable, during a real `pull` run (plan §5's "command-not-found
 * rows", extended beyond drift/pull's own two named cases to the tools this
 * TASK actually asked for: `comm` and `cmp` in pull's retirement stage,
 * `diff` in pull's preview, and `jq` entirely missing for a project that
 * carries a settings file).
 *
 * `comm`/`cmp`/`diff` are unguarded in the shell (no `command -v` check
 * anywhere near them) — bash's own "command not found"/"Permission denied"
 * diagnostic is what fires, and `s.pathWithout` (TASK-025 H4) is what makes
 * the tool GENUINELY ABSENT rather than merely shadowed by a shim `command
 * -v` would still find. Building the retirement fixture (comm/cmp rows) SURFACED
 * two real divergences in blueprint.mts — see the fix comments at each `run()`
 * call site (comm, cmp, and the `diff -u` preview) — where 'ignore' had
 * swallowed a diagnostic the shell's own unredirected stderr always showed.
 */
describe('blueprint-port differential — finding 4 (tool absence during pull)', () => {
  // Strips the leading "<program>: " prefix bash's own diagnostic carries
  // (measured directly: it is "<script>: line N: " when the failing call is
  // a plain statement, but bash omits the "line N:" part for a call inside a
  // process substitution — `_bp_retire`'s `< <(comm …)`, exactly what the
  // comm/cmp rows below hit — so that middle segment is OPTIONAL). NEW's own
  // message (run()'s `${cliName()}: ${cmd}: ${reason}`) carries the SAME
  // kind of leading "<program>: " prefix with no line number at all, so this
  // strips both sides down to the tool name uniformly rather than only OLD's.
  const stripLinePrefix = (t: string): string => t.replace(/^\S+: (line \d+: )?/gm, '')

  /** A blueprint that SHIPPED `OLD-FILE.md` at its first commit and STOPPED
   * shipping it at its second — the shape `_bp_retire`'s own `comm -23 hist
   * cur` needs to name a retirement candidate at all. The project's own copy
   * is seeded byte-identical to what the blueprint shipped, so a WORKING
   * `cmp` would call it a clean, unedited retire candidate. */
  async function seedRetirementFixture(s: Scenario, tag: string): Promise<{ proj: string }> {
    const bp = await s.workspace.dir(`${tag}-bp`)
    await mkdir(join(bp, 'docs'), { recursive: true })
    await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
    await writeFile(join(bp, 'OLD-FILE.md'), 'todo: retire me\n', 'utf8')
    await initRepo(s, bp)
    await commitAll(s, bp, 'base')
    await rm(join(bp, 'OLD-FILE.md'))
    await commitAll(s, bp, 'retire old file')
    const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

    const proj = await s.workspace.dir(`${tag}-proj`)
    await seedRegisteredProject(s, proj, bp, sha)
    await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
    await mkdir(join(proj, 'docs'), { recursive: true })
    await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
    await writeFile(join(proj, 'OLD-FILE.md'), 'todo: retire me\n', 'utf8')
    await commitAll(s, proj, 'sync')
    return { proj }
  }

  it('comm absent (127) — retirement never enumerates a candidate, on either CLI', async () => {
    await scenario('blueprint-port-f4-retire-no-comm', async (s) => {
      const { proj } = await seedRetirementFixture(s, 'no-comm')
      const path = await s.pathWithout(['comm'])
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'comm-absent (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'comm-absent (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expect(stripLinePrefix(newResult.stderr)).toBe(stripLinePrefix(oldResult.stderr))
      expect(newResult.stdout).toBe(oldResult.stdout)
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.stderr).toContain('comm: command not found')
      expect(oldResult.stdout).toContain('✓ Nothing to pull. Project matches blueprint HEAD.')
      // NON-VACUITY: with a working `comm`, OLD-FILE.md is exactly the
      // retirement candidate this fixture built — an unedited copy of a path
      // the blueprint stopped shipping. `comm` failing means the candidate is
      // never even enumerated (its process substitution feeds an empty loop,
      // silently — bash does not fail the surrounding `while` on it), so the
      // file survives, untouched, on both sides.
      expect(await readFile(join(proj, 'OLD-FILE.md'), 'utf8')).toBe('todo: retire me\n')
    })
  })

  it('cmp absent (127) — every substitutable managed file misreads as binary, refusing the whole pull', async () => {
    await scenario('blueprint-port-f4-retire-no-cmp', async (s) => {
      const { proj } = await seedRetirementFixture(s, 'no-cmp')
      const path = await s.pathWithout(['cmp'])
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'cmp-absent (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'cmp-absent (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      // `cmp` is not only `_bp_retire`'s own call (:1500) — scripts/lib/
      // placeholders.sh:189's `bp_contains_nul` ALSO shells out to it
      // (`tr -d '\0' < "$1" | cmp -s - "$1"`), and BOTH CLIs bridge to that
      // SAME shell library rather than reimplementing it (plan §4: libraries
      // stay shell), so this is a SHARED side effect, not a porting
      // divergence. NON-VACUITY, and the reason this row's title changed
      // from the retirement-only story it started with: with `cmp` missing,
      // `bp_contains_nul` misreports EVERY substitutable file as binary
      // (`!` negates cmp's own 127 into a false "differs"), so CLAUDE.md and
      // docs/DoD.md — both substitutable, and otherwise perfectly in sync —
      // ALSO show up "drifted" with an empty prospective result. That drift
      // reaches the interactive prompt BEFORE retirement's own turn ever
      // comes (retirement runs only when nothing aborted the main loop), so
      // with no TTY the whole pull refuses (exit 7) and `_bp_retire` never
      // executes at all — OLD-FILE.md is neither retired NOR reclassified,
      // simply never reached, on either CLI.
      const stripScratch = (t: string) => t.replace(/blueprint-sync\.[A-Za-z0-9]+/g, 'blueprint-sync.<tmp>')
      const strip = (t: string) => stripScratch(normalizeDiffHeaders(stripLinePrefix(t)))
      expect(strip(newResult.stderr)).toBe(strip(oldResult.stderr))
      expect(strip(newResult.stdout)).toBe(strip(oldResult.stdout))
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(7)
      expect(oldResult.stderr).toContain('cmp: command not found')
      expect(oldResult.stdout).toContain('not interactive')
      expect(oldResult.stdout).not.toContain('yours now')
      expect(oldResult.stdout).not.toContain('OLD-FILE.md')
      expect(await readFile(join(proj, 'OLD-FILE.md'), 'utf8')).toBe('todo: retire me\n')
    })
  })

  /** One drifted managed file (CLAUDE.md), docs/DoD.md in sync — the shape
   * `cmd_pull`'s main loop needs to reach the PREVIEW step at all. */
  async function seedSingleDriftFixture(s: Scenario, tag: string): Promise<string> {
    const bp = await s.workspace.dir(`${tag}-bp`)
    const sha = await seedBlueprintRepo(s, bp)
    const proj = await s.workspace.dir(`${tag}-proj`)
    await seedRegisteredProject(s, proj, bp, sha)
    await mkdir(join(proj, 'docs'), { recursive: true })
    await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\nan older, edited copy\n', 'utf8')
    await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
    await commitAll(s, proj, 'partial sync')
    return proj
  }

  it('diff absent (127) — pull\'s preview, no TTY to prompt (refused, exit 7)', async () => {
    await scenario('blueprint-port-f4-pull-no-diff', async (s) => {
      const proj = await seedSingleDriftFixture(s, 'no-diff')
      const path = await s.pathWithout(['diff'])
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'diff-absent (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'diff-absent (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      const strip = (t: string) => normalizeDiffHeaders(stripLinePrefix(t))
      expect(strip(newResult.stderr)).toBe(strip(oldResult.stderr))
      expect(strip(newResult.stdout)).toBe(strip(oldResult.stdout))
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(7)
      expect(oldResult.stderr).toContain('diff: command not found')
      expect(oldResult.stdout).toContain('not interactive')
    })
  })

  it('diff present but not executable (126) — same shape, Permission denied', async () => {
    await scenario('blueprint-port-f4-pull-diff-noexec', async (s) => {
      const proj = await seedSingleDriftFixture(s, 'diff-noexec')
      const noExecDir = await s.workspace.dir('diff-noexec-bin')
      const diffPath = join(noExecDir, 'diff')
      await writeFile(diffPath, '#!/bin/sh\necho fake\n', 'utf8')
      await chmod(diffPath, 0o644)
      const path = `${noExecDir}:${await s.pathWithout(['diff'])}`
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'diff-noexec (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await runNew(s, proj, ['pull'], { PATH: path })
      expect(await walkFiles(proj), 'diff-noexec (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      // TWO named normalisations here, not one: the usual "line N: " prefix
      // (plan §6.5), plus the tool's own NAME vs the full RESOLVED PATH bash
      // reports for a found-but-non-executable file (measured directly —
      // bash: "<script>: line N: /abs/path/to/diff: Permission denied";
      // Node's spawn EACCES handler, run()'s own code, only ever has argv0,
      // "diff", to name). An accepted, per-row divergence, same shape as the
      // a2bp "finding 3" row's stripLinePrefix — not something run() can fix
      // without duplicating bash's own PATH resolution.
      const strip = (t: string) => stripLinePrefix(t).replace(/\/\S*\/diff\b/g, 'diff')
      expect(strip(newResult.stderr)).toBe(strip(oldResult.stderr))
      expect(normalizeDiffHeaders(newResult.stdout)).toBe(normalizeDiffHeaders(oldResult.stdout))
      expect(newResult.code).toBe(oldResult.code)
      expect(oldResult.code).toBe(7)
      expect(oldResult.stderr).toContain('Permission denied')
      expect(newResult.stderr).toContain('Permission denied')
    })
  })

  it('jq entirely missing — the guarded refusal (BUG-127-shaped), not a raw crash', async () => {
    await scenario('blueprint-port-f4-pull-no-jq', async (s) => {
      const settingsJson = (allow: string[]) =>
        `${JSON.stringify({ permissions: { allow, ask: [], deny: [] } }, null, 2)}\n`

      const bp = await s.workspace.dir('no-jq-bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await mkdir(join(bp, '.claude'), { recursive: true })
      await writeFile(join(bp, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir('no-jq-proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await mkdir(join(proj, '.claude'), { recursive: true })
      await writeFile(join(proj, '.claude/settings.json'), settingsJson([]), 'utf8')
      await commitAll(s, proj, 'has settings')

      const path = await s.pathWithout(['jq'])
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull', '.claude/settings.json'], { PATH: path })
      expect(await walkFiles(proj), 'jq-missing (OLD) must write nothing').toEqual(treeBefore)
      const newResult = await runNew(s, proj, ['pull', '.claude/settings.json'], { PATH: path })
      expect(await walkFiles(proj), 'jq-missing (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain('jq is not on PATH')
      // Refused, not crashed: nothing written, the project's settings.json
      // is untouched.
      const settingsAfter = await readFile(join(proj, '.claude/settings.json'), 'utf8')
      expect(settingsAfter).toBe(settingsJson([]))
    })
  })
})

/**
 * blueprint-port differential — settings-layer refusals (plan §5's "the
 * settings-layer refusals" row group, Codex re-review finding 7).
 *
 * `bpSettingsLayer`/`_bp_settings_layer` is reached identically from `drift`
 * and `pull` — both call `bpProspectiveFor('.claude/settings.json', …)`, which
 * calls it before ever touching `bpProspectivePull` — so each SHAPE is proven
 * once here (via `pull --yes`, the cheapest call that still exercises the
 * whole chain and never writes on a refusal, so OLD then NEW share one
 * project directory like the pull describe's own refused/non-mutating rows).
 * One extra row (the array-layer shape) is run through `drift` too, to prove
 * the SAME refusal reaches drift's own report shape (exit 4 vs pull's, the
 * "Cannot sync" bucket) identically — not every shape twice, since the code
 * path the two subcommands share is exactly what is under test, not two
 * independent implementations of it.
 *
 * Shapes mirror tests/permission-policy's own #12/#12b/#13/#14/#14b/#15,
 * which pin these against the shell CLI alone; ported here as true OLD-vs-NEW
 * differential rows.
 */
describe('blueprint-port differential — settings-layer refusals', () => {
  const settingsJson = (allow: string[]) =>
    `${JSON.stringify({ permissions: { allow, ask: [], deny: [] } }, null, 2)}\n`

  /** A registered project whose `.claude/settings.json` and/or
   * `.claude/settings.project.json` (the layer) are written VERBATIM —
   * `body`/`layerBody` are raw bytes, never JSON.stringify'd, so a shape
   * that is not even one JSON object (a stream, an array, a scalar) can be
   * placed exactly as the permission-policy suite does. */
  async function seedShapeProject(
    s: Scenario,
    dir: string,
    bp: string,
    sha: string,
    opts: { settingsBody?: string | undefined; layerBody?: string | undefined },
  ): Promise<void> {
    await seedRegisteredProject(s, dir, bp, sha)
    await mkdir(join(dir, 'docs'), { recursive: true })
    await copyFile(join(bp, 'CLAUDE.md'), join(dir, 'CLAUDE.md'))
    await copyFile(join(bp, 'docs/DoD.md'), join(dir, 'docs/DoD.md'))
    await mkdir(join(dir, '.claude'), { recursive: true })
    if (opts.settingsBody !== undefined) {
      await writeFile(join(dir, '.claude/settings.json'), opts.settingsBody, 'utf8')
    }
    if (opts.layerBody !== undefined) {
      await writeFile(join(dir, '.claude/settings.project.json'), opts.layerBody, 'utf8')
    }
    await commitAll(s, dir, 'settings fixture')
  }

  const rows: Array<{ name: string; settingsBody?: string; layerBody?: string }> = [
    // The project's OWN settings.json has no layer file to hold its rules —
    // each of these is a SHAPE the "not a single JSON object" / "wrong
    // shape" checks must catch without ever calling it invalid JSON.
    { name: 'settings.json is a two-object JSON stream {}{}', settingsBody: `{}\n{"permissions":{"allow":["x"]}}\n` },
    { name: 'settings.json is a JSON array', settingsBody: '[]\n' },
    { name: 'settings.json is null', settingsBody: 'null\n' },
    { name: 'settings.json is a number', settingsBody: '42\n' },
    // The layer file (.claude/settings.project.json, BP_SETTINGS_LAYER)
    // carries the same shape family, on the OTHER branch of bpSettingsLayer.
    {
      name: 'the layer (.claude/settings.project.json) is a two-object stream',
      settingsBody: settingsJson([]),
      layerBody: `{}\n{"permissions":{"allow":["x"]}}\n`,
    },
    {
      name: 'the layer is a JSON array',
      settingsBody: settingsJson([]),
      layerBody: '[]\n',
    },
    {
      name: 'the layer is null',
      settingsBody: settingsJson([]),
      layerBody: 'null\n',
    },
    // Plan §5's "the numeric `.claude/settings.project.json`" row — the same
    // scalar-shape family as settings.json's own "is a number" row above,
    // now on the LAYER side of bpSettingsLayer's other branch.
    {
      name: 'the layer is a number',
      settingsBody: settingsJson([]),
      layerBody: '42\n',
    },
    // A merge-unsupported shape: a single JSON object, valid shape at the
    // top level, but carrying a key the layer schema does not allow.
    {
      name: 'the layer is one object but holds an unsupported key (hooks)',
      settingsBody: settingsJson([]),
      layerBody: `${JSON.stringify({ hooks: { PreToolUse: [] } }, null, 2)}\n`,
    },
    // No layer at all: the project's settings.json itself carries an
    // unsupported top-level key, with no permission rules of its own to
    // report alongside it — the "unsupported-only" branch of the detail text.
    {
      name: 'settings.json (no layer) carries an unsupported key (otherList)',
      settingsBody: `${JSON.stringify({ permissions: { allow: [], otherList: ['x'] } }, null, 2)}\n`,
    },
  ]

  for (const row of rows) {
    it(`pull refuses — ${row.name}`, async () => {
      await scenario(`blueprint-port-settings-shape-${row.name.replace(/[^a-z0-9]+/gi, '-')}`, async (s) => {
        const bp = await s.workspace.dir('bp')
        await mkdir(join(bp, 'docs'), { recursive: true })
        await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
        await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
        await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
        await mkdir(join(bp, '.claude'), { recursive: true })
        await writeFile(join(bp, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
        await initRepo(s, bp)
        await commitAll(s, bp, 'base')
        const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

        const proj = await s.workspace.dir('proj')
        await seedShapeProject(s, proj, bp, sha, { settingsBody: row.settingsBody, layerBody: row.layerBody })

        // Refusal writes nothing, so OLD then NEW share the same directory
        // (same idiom as the pull-refused / drift-refused rows above).
        const treeBefore = await walkFiles(proj)
        const oldResult = await runOld(s, proj, ['pull', '.claude/settings.json', '--yes'])
        expect(await walkFiles(proj), 'settings-shape refusal (OLD) must write nothing').toEqual(treeBefore)
        const newResult = await runNew(s, proj, ['pull', '.claude/settings.json', '--yes'])
        expect(await walkFiles(proj), 'settings-shape refusal (NEW) must write nothing').toEqual(treeBefore)
        await assertNoDriftPullScratch(s)
        expectPullIdentical(oldResult, newResult)
        expect(oldResult.code, oldResult.output).toBe(4)
        expect(oldResult.stdout, oldResult.output).not.toMatch(/not valid JSON/i)
        if (row.settingsBody !== undefined) {
          const after = await readFile(join(proj, '.claude/settings.json'), 'utf8')
          expect(after, 'a refusal must never overwrite the project file').toBe(row.settingsBody)
        }
      })
    })
  }

  it('drift also refuses the same shape (the array-layer row), in its own report bucket', async () => {
    await scenario('blueprint-port-settings-shape-drift', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await mkdir(join(bp, '.claude'), { recursive: true })
      await writeFile(join(bp, '.claude/settings.json'), settingsJson(['Bash(git status)']), 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const proj = await s.workspace.dir('proj')
      await seedShapeProject(s, proj, bp, sha, { settingsBody: settingsJson([]), layerBody: '[]\n' })
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['drift'], env)
      expect(await walkFiles(proj), 'drift (OLD) must never write to the project tree').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newResult = await runNew(s, proj, ['drift'], env)
      expect(await walkFiles(proj), 'drift (NEW) must never write to the project tree').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 1')
    })
  })
})

/**
 * blueprint-port differential — settings layer merge and legacy proposal
 * (TASK-081 "drift/pull differential rows to completion" round, plan §3 P4's
 * "a layer present, which merges" and "a legacy settings.json with extra
 * rules, which produces the proposal text", plus P4's "jq missing from PATH"
 * proven through `drift` — `pull`'s own jq-missing row already lives in the
 * "finding 4" describe above).
 *
 * `_bp_settings_layer` is reached identically from `drift` and `pull` (both
 * call `bp_prospective_for('.claude/settings.json', …)`), so the SUCCESS and
 * PROPOSAL shapes are each proven once through `pull` — the cheapest call
 * that exercises the whole chain — and once more through `drift`, to prove
 * the same result reaches drift's own report shape (a Drifted/Cannot-sync
 * bucket entry, not a crash or a silent skip).
 */
describe('blueprint-port differential — settings layer merge and legacy proposal', () => {
  const settingsJson = (allow: string[], ask: string[] = [], deny: string[] = []) =>
    `${JSON.stringify({ permissions: { allow, ask, deny } }, null, 2)}\n`

  async function seedSettingsBlueprint(s: Scenario, dir: string, bpSettings: string): Promise<string> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
    await mkdir(join(dir, '.claude'), { recursive: true })
    await writeFile(join(dir, '.claude/settings.json'), bpSettings, 'utf8')
    await initRepo(s, dir)
    await commitAll(s, dir, 'base')
    return (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
  }

  async function seedSettingsProject(
    s: Scenario,
    dir: string,
    bp: string,
    sha: string,
    opts: { settingsBody?: string | undefined; layerBody?: string | undefined },
  ): Promise<void> {
    await seedRegisteredProject(s, dir, bp, sha)
    await mkdir(join(dir, 'docs'), { recursive: true })
    await copyFile(join(bp, 'CLAUDE.md'), join(dir, 'CLAUDE.md'))
    await copyFile(join(bp, 'docs/DoD.md'), join(dir, 'docs/DoD.md'))
    await mkdir(join(dir, '.claude'), { recursive: true })
    if (opts.settingsBody !== undefined) {
      await writeFile(join(dir, '.claude/settings.json'), opts.settingsBody, 'utf8')
    }
    if (opts.layerBody !== undefined) {
      await writeFile(join(dir, '.claude/settings.project.json'), opts.layerBody, 'utf8')
    }
    await commitAll(s, dir, 'settings fixture')
  }

  /** driftBoth's own shape (the 'drift' describe above), reimplemented here
   * because that helper is local to its own describe — same reset-between-
   * sides idiom, same plan §5 comparison. */
  async function driftBoth(
    s: Scenario,
    proj: string,
    env: Record<string, string>,
  ): Promise<{ readonly oldResult: RunResult; readonly newResult: RunResult }> {
    const treeBefore = await walkFiles(proj)
    const oldResult = await runOld(s, proj, ['drift'], env)
    expect(await walkFiles(proj), 'drift (OLD) must never write to the project tree').toEqual(treeBefore)
    await assertNoDriftPullScratch(s)
    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
    const newResult = await runNew(s, proj, ['drift'], env)
    expect(await walkFiles(proj), 'drift (NEW) must never write to the project tree').toEqual(treeBefore)
    await assertNoDriftPullScratch(s)
    return { oldResult, newResult }
  }

  it('a successful merge — the layer merges into the landed settings.json (pull)', async () => {
    await scenario('blueprint-port-settings-merge-pull', async (s) => {
      const bp = await s.workspace.dir('bp')
      const bpSettings = settingsJson(['Bash(git status)'], [], ['Bash(rm -rf /)'])
      const sha = await seedSettingsBlueprint(s, bp, bpSettings)
      const layerBody = `${JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }, null, 2)}\n`

      const oldProj = await s.workspace.dir('merge-old')
      const newProj = await s.workspace.dir('merge-new')
      for (const proj of [oldProj, newProj]) {
        await seedSettingsProject(s, proj, bp, sha, { layerBody })
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      const oldSettings = await readFile(join(oldProj, '.claude/settings.json'), 'utf8')
      const newSettings = await readFile(join(newProj, '.claude/settings.json'), 'utf8')
      expect(newSettings).toBe(oldSettings)
      const merged = JSON.parse(oldSettings) as { permissions: { allow: string[]; deny: string[] } }
      expect(merged.permissions.allow).toEqual(expect.arrayContaining(['Bash(git status)', 'Bash(npm test)']))
      expect(merged.permissions.deny).toEqual(expect.arrayContaining(['Bash(rm -rf /)']))
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })

  it('a successful merge — drift reaches it too, not a refusal (drift)', async () => {
    await scenario('blueprint-port-settings-merge-drift', async (s) => {
      const bp = await s.workspace.dir('bp')
      const bpSettings = settingsJson(['Bash(git status)'])
      const sha = await seedSettingsBlueprint(s, bp, bpSettings)
      const layerBody = `${JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }, null, 2)}\n`
      const proj = await s.workspace.dir('proj')
      // A stale placeholder settings.json (never the merged result), so
      // bp_prospective_for's diff finds a difference and the file lands in
      // the Drifted bucket — proof the merge chain ran to completion rather
      // than being skipped as "missing in project" or refused.
      await seedSettingsProject(s, proj, bp, sha, { settingsBody: settingsJson([]), layerBody })
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Drifted (project ≠ blueprint HEAD): 1')
      expect(oldResult.stdout).toContain('.claude/settings.json')
      expect(oldResult.stdout).not.toContain('Cannot sync')
    })
  })

  it("the legacy-extra-rule proposal — settings.json (no layer) carries rules the blueprint doesn't ship (pull)", async () => {
    await scenario('blueprint-port-settings-proposal-pull', async (s) => {
      const bp = await s.workspace.dir('bp')
      const bpSettings = settingsJson(['Bash(git status)'])
      const sha = await seedSettingsBlueprint(s, bp, bpSettings)
      const proj = await s.workspace.dir('proj')
      await seedSettingsProject(s, proj, bp, sha, {
        settingsBody: settingsJson(['Bash(git status)', 'Bash(npm run build)']),
      })
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull'])
      expect(await walkFiles(proj), 'proposal refusal (OLD) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      const newResult = await runNew(s, proj, ['pull'])
      expect(await walkFiles(proj), 'proposal refusal (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain("this project's settings.json carries permission rules of its own")
      expect(oldResult.stdout).toContain(
        "Save the permission rules that are this project's own as .claude/settings.project.json",
      )
      expect(oldResult.stdout).toContain('Bash(npm run build)')
    })
  })

  it("the legacy-extra-rule proposal — drift reports it under Cannot sync (drift)", async () => {
    await scenario('blueprint-port-settings-proposal-drift', async (s) => {
      const bp = await s.workspace.dir('bp')
      const bpSettings = settingsJson(['Bash(git status)'])
      const sha = await seedSettingsBlueprint(s, bp, bpSettings)
      const proj = await s.workspace.dir('proj')
      await seedSettingsProject(s, proj, bp, sha, {
        settingsBody: settingsJson(['Bash(git status)', 'Bash(npm run build)']),
      })
      const env = { ...(await dateShimEnv(s)), BP_NO_PROMPT: '1' }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 1')
      expect(oldResult.stdout).toContain(".claude/settings.json — this project's settings.json carries permission rules of its own")
    })
  })

  it('jq missing from PATH — drift refuses the file, not a crash (drift)', async () => {
    await scenario('blueprint-port-settings-jq-missing-drift', async (s) => {
      const bp = await s.workspace.dir('bp')
      const bpSettings = settingsJson(['Bash(git status)'])
      const sha = await seedSettingsBlueprint(s, bp, bpSettings)
      const proj = await s.workspace.dir('proj')
      await seedSettingsProject(s, proj, bp, sha, { settingsBody: settingsJson([]) })
      // A fixed `date` (matching every other drift row's determinism) ahead
      // of a jq-less copy of PATH on the SAME PATH string — pathWithout's
      // own directory is a full real-PATH mirror, not a bare shim, so it
      // already carries a real `date`; without pinning it, OLD's and NEW's
      // "fetched: … at …" line could straddle a real second boundary and
      // diverge on nothing but wall-clock timing.
      const shims = await s.shimDir('jq-missing-date')
      await shims.add('date', 'echo 2026-01-01T00:00:00Z')
      const path = `${shims.dir}:${await s.pathWithout(['jq'])}`
      const env = { BP_NO_PROMPT: '1', PATH: path }
      const { oldResult, newResult } = await driftBoth(s, proj, env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Cannot sync — pull refuses these until they are fixed: 1')
      expect(oldResult.stdout).toContain('jq is not on PATH')
    })
  })
})

/**
 * blueprint-port differential — staleness states under the BLUEPRINT_ROOT
 * override (plan §5's "staleness current/behind/ahead/diverged/unknown" row
 * group, Codex re-review finding 7). `reportStaleness`/`bp_staleness_assess`
 * is reached only from drift's own BLUEPRINT_ROOT-override branch (the
 * describe comment above "drift's fast-forward prompt" says so), and that
 * describe already proves "behind" (both the y and N answers to the
 * fast-forward prompt). These four rows are the REMAINING statuses
 * `bp_staleness_assess` can report, none of which ever reach a prompt, so
 * BP_NO_PROMPT is irrelevant to all four and included only for parity with
 * every other override row in this file.
 */
describe('blueprint-port differential — staleness states', () => {
  async function seedUpstream(s: Scenario, tag: string): Promise<{ up: string; sha: string }> {
    const up = await s.workspace.dir(`${tag}-up`)
    await writeFile(join(up, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await initRepo(s, up)
    await commitAll(s, up, 'base')
    const sha = (await git(s, up, ['rev-parse', 'HEAD'])).stdout.trim()
    return { up, sha }
  }

  async function cloneBp(s: Scenario, tag: string, up: string): Promise<string> {
    const bp = s.workspace.path(`${tag}-bp`)
    await git(s, s.workspace.root, ['clone', '-q', up, bp])
    await git(s, bp, ['config', 'user.email', 't@local'])
    await git(s, bp, ['config', 'user.name', 't'])
    return bp
  }

  async function seedOverrideProject(s: Scenario, dir: string, bootstrapSha: string): Promise<void> {
    await cp(join(REPO_ROOT, 'scripts'), join(dir, 'scripts'), { recursive: true })
    await s.run('chmod', ['+x', join(dir, 'scripts/blueprint')], { cwd: dir })
    await mkdir(join(dir, '.githooks'), { recursive: true })
    await writeFile(join(dir, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
    await s.run('chmod', ['+x', join(dir, '.githooks/pre-push')], { cwd: dir })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
    await writeFile(
      join(dir, '.blueprint-source'),
      `bootstrap_sha    = ${bootstrapSha}\nbootstrap_date   = 2026-01-01\n`,
      'utf8',
    )
    await initRepo(s, dir)
    await commitAll(s, dir, 'init')
  }

  async function driftUnderOverride(
    s: Scenario,
    bp: string,
    proj: string,
  ): Promise<{ oldResult: RunResult; newResult: RunResult }> {
    const env = { ...(await dateShimEnv(s)), BLUEPRINT_ROOT: bp, BP_NO_PROMPT: '1' }
    const treeBefore = await walkFiles(proj)
    const oldResult = await runOld(s, proj, ['drift'], env)
    expect(await walkFiles(proj), 'drift (OLD) must never write to the project tree').toEqual(treeBefore)
    await assertNoDriftPullScratch(s)
    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
    const newResult = await runNew(s, proj, ['drift'], env)
    expect(await walkFiles(proj), 'drift (NEW) must never write to the project tree').toEqual(treeBefore)
    await assertNoDriftPullScratch(s)
    return { oldResult, newResult }
  }

  it('current — the local checkout is level with origin/main', async () => {
    await scenario('blueprint-port-staleness-current', async (s) => {
      const { up, sha } = await seedUpstream(s, 'current')
      const bp = await cloneBp(s, 'current', up)
      const proj = await s.workspace.dir('current-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('local checkout is level with origin/main')
    })
  })

  it('ahead — the local checkout has an unpushed commit', async () => {
    await scenario('blueprint-port-staleness-ahead', async (s) => {
      const { up, sha } = await seedUpstream(s, 'ahead')
      const bp = await cloneBp(s, 'ahead', up)
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nlocal-only\n', 'utf8')
      await commitAll(s, bp, 'local ahead commit')
      const proj = await s.workspace.dir('ahead-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('local checkout is ahead of origin/main (unpushed commits)')
    })
  })

  it('diverged — the local checkout and the remote each moved on their own', async () => {
    await scenario('blueprint-port-staleness-diverged', async (s) => {
      const { up, sha } = await seedUpstream(s, 'diverged')
      const bp = await cloneBp(s, 'diverged', up)
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nlocal-only\n', 'utf8')
      await commitAll(s, bp, 'local commit')
      await mkdir(join(up, 'docs'), { recursive: true })
      await writeFile(join(up, 'docs/DoD.md'), '# DoD\nremote-only\n', 'utf8')
      await commitAll(s, up, 'remote commit')
      // bp_staleness_assess can only tell "diverged" from the ordinary,
      // not-yet-fetched shape of "behind" when the remote's commit object is
      // ALREADY present locally (staleness.sh:112-118, `have_remote`) — the
      // exact fixture shape tests/staleness #5 uses.
      await git(s, bp, ['fetch', '-q', 'origin', 'main'])
      const proj = await s.workspace.dir('diverged-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('local checkout has DIVERGED from origin/main')
      expect(oldResult.stdout).toContain('resolve by hand')
    })
  })

  it('unknown — origin is unreachable', async () => {
    await scenario('blueprint-port-staleness-unknown', async (s) => {
      const { up, sha } = await seedUpstream(s, 'unknown')
      const bp = await cloneBp(s, 'unknown', up)
      await git(s, bp, ['remote', 'set-url', 'origin', s.workspace.path('unknown-does-not-exist')])
      const proj = await s.workspace.dir('unknown-proj')
      await seedOverrideProject(s, proj, sha)
      const { oldResult, newResult } = await driftUnderOverride(s, bp, proj)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('? staleness unknown (unreachable)')
    })
  })
})

/**
 * blueprint-port differential — fetch failures (plan §5's "unreachable;
 * hung; missing branch; ... no `timeout`; scratch uncreatable; damaged
 * cache" row groups, Codex re-review finding 7). `bpFetchBlueprint` is pure
 * TypeScript with no shell bridge for the fetch itself (only `bpConfigLoad`
 * bridges), so — unlike settings-layer/staleness above — nothing here is
 * "proven once, shared by drift and pull": each row is its own independent
 * reimplementation risk, tested here via `drift` (plan §5's "at minimum"),
 * on a REGISTERED (address-mode) project — `bpFetchBlueprint` is reached only
 * on that path, never under BLUEPRINT_ROOT (the describe above).
 *
 * Every row is read-only (nothing is ever written on any of these exits), so
 * OLD then NEW run on the SAME registered-project fixture, like the other
 * non-mutating rows in this file. `HOME`/`XDG_CACHE_HOME` are scoped per
 * scenario workspace already (the harness's own env scrub), so OLD and NEW
 * never share a blueprint-sync cache across the two runs.
 *
 * The damaged-cache row below reuses sync-by-address #27a's technique: a
 * WARM cache first (a successful drift, which already exercises this exact
 * fetch machinery end-to-end), then a leftover per-run ref pinned at the
 * tip PLUS the tip's root tree made loose and deleted — a refresh only
 * re-verifies objects no ref already covers, so without the leftover ref
 * git notices the gap on its own and heals the cache instead of reporting
 * it damaged (observed while writing sync-by-address #27a).
 */
describe('blueprint-port differential — fetch failures', () => {
  async function seedFetchBlueprint(s: Scenario, dir: string): Promise<string> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
    await initRepo(s, dir)
    await commitAll(s, dir, 'base')
    return (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
  }

  async function runBoth(
    s: Scenario,
    proj: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<{ oldResult: RunResult; newResult: RunResult }> {
    const treeBefore = await walkFiles(proj)
    const oldResult = await runOld(s, proj, args, env)
    expect(await walkFiles(proj), 'a fetch failure (OLD) must never write to the project tree').toEqual(treeBefore)
    // Same reset `driftBoth` uses above: arm_gate's own git config writes
    // (core.hooksPath, core.sshCommand) into the SHARED project directory,
    // and a second run would otherwise see them already armed and print a
    // different status line — a divergence the run ORDER causes, not drift.
    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
    const newResult = await runNew(s, proj, args, env)
    expect(await walkFiles(proj), 'a fetch failure (NEW) must never write to the project tree').toEqual(treeBefore)
    return { oldResult, newResult }
  }

  it('an unreachable remote exits 5, without ever calling it damaged', async () => {
    await scenario('blueprint-port-fetch-unreachable', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ${s.workspace.path('no-such-remote')}\nblueprint_branch = main\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain('could not read the blueprint')
      expect(oldResult.stderr).toContain('NOT a clean drift report')
      expect(oldResult.stderr).not.toContain('is damaged')
    })
  })

  it("a reachable remote WITHOUT the branch exits 5, naming the branch — not a connection failure", async () => {
    await scenario('blueprint-port-fetch-missing-branch', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ${bp}\nblueprint_branch = nope\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain("no branch 'nope' on that remote")
      expect(oldResult.stderr).not.toMatch(/could not connect|unable to connect/i)
    })
  })

  it("no 'timeout' or 'gtimeout' on PATH: exits 5 before any fetch, no cache created", async () => {
    await scenario('blueprint-port-fetch-no-timeout', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const path = await s.pathWithout(['timeout', 'gtimeout'])
      const cacheRoot = join(s.workspace.path('cache-home'), 'struct2flow')
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {
        PATH: path,
        XDG_CACHE_HOME: s.workspace.path('cache-home'),
      })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain("no 'timeout' or 'gtimeout'")
      expect(existsSync(cacheRoot)).toBe(false)
    })
  })

  it('a HUNG remote is cut off at BP_FETCH_TIMEOUT and exits 5, naming the timeout', async () => {
    await scenario('blueprint-port-fetch-hung', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ssh://git@127.0.0.1/blackhole.git\nblueprint_branch = main\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      // An ssh shim that accepts the connection and never answers — the fetch
      // it is wrapped in is what `timeout` cuts off, not ssh itself refusing.
      const oldShims = await s.shimDir('old-hung')
      await oldShims.add('ssh', 'sleep 999\n')
      const newShims = await s.shimDir('new-hung')
      await newShims.add('ssh', 'sleep 999\n')
      const treeBefore = await walkFiles(proj)
      const began = Date.now()
      const oldResult = await runOld(s, proj, ['drift'], { PATH: oldShims.path(), BP_FETCH_TIMEOUT: '2' })
      expect(await walkFiles(proj), 'a hung fetch (OLD) must never write to the project tree').toEqual(treeBefore)
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newResult = await runNew(s, proj, ['drift'], { PATH: newShims.path(), BP_FETCH_TIMEOUT: '2' })
      expect(await walkFiles(proj), 'a hung fetch (NEW) must never write to the project tree').toEqual(treeBefore)
      const elapsed = Date.now() - began
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain('timed out after 2s')
      expect(elapsed, `a hung remote held both runs for ${elapsed}ms`).toBeLessThan(20_000)
    })
  })

  it('a scratch directory that cannot be created exits 5, with no cache and no project write', async () => {
    await scenario('blueprint-port-fetch-no-scratch', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // A regular file as TMPDIR: `mktemp -d` under it cannot succeed, and
      // unlike a chmod'd directory this holds even when the suite runs as root.
      await writeFile(s.workspace.path('not-a-directory'), 'x\n', 'utf8')
      const cacheRoot = join(s.workspace.path('cache-home'), 'struct2flow')
      const before = await readFile(join(proj, '.blueprint-source'), 'utf8')
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {
        TMPDIR: s.workspace.path('not-a-directory'),
        XDG_CACHE_HOME: s.workspace.path('cache-home'),
      })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain('could not create a scratch directory')
      expect(existsSync(cacheRoot)).toBe(false)
      expect(await readFile(join(proj, '.blueprint-source'), 'utf8')).toBe(before)
    })
  })

  it('a damaged cache exits 5, naming the cache and how to remove it', async () => {
    await scenario('blueprint-port-fetch-damaged-cache', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const cacheHome = s.workspace.path('cache-home')

      // Warm the cache with a successful drift, then damage it exactly as
      // sync-by-address #27a does, then drift again through the SAME cache.
      async function warmThenDamage(runDrift: (env: Record<string, string>) => Promise<RunResult>): Promise<RunResult> {
        const env = { XDG_CACHE_HOME: cacheHome }
        const warm = await runDrift(env)
        expect(warm.code, warm.output).toBe(0)

        const cacheParent = join(cacheHome, 'struct2flow')
        const cacheNames = (await readdir(cacheParent).catch(() => [] as string[])).filter(
          (n) => n.startsWith('blueprint-') && n.endsWith('.git'),
        )
        expect(cacheNames, 'expected exactly one blueprint cache').toHaveLength(1)
        const cache = join(cacheParent, cacheNames[0]!)

        // A leftover per-run ref at the tip is the condition, not decoration:
        // with it present the next refresh trusts the tip and skips
        // connectivity-checking objects it already "has"; without it git
        // would notice the gap on its own and refetch, healing the cache.
        await s.run('git', ['--git-dir', cache, 'update-ref', 'refs/bp-run/blueprint-sync.0', sha], {
          cwd: s.workspace.root,
        })

        // Every packed object loose, so a single deletion can target the
        // tip's root tree specifically.
        const packDir = join(cache, 'objects/pack')
        for (const name of await readdir(packDir).catch(() => [] as string[])) {
          if (!name.endsWith('.pack')) continue
          const moved = s.workspace.path(`loose-${name}`)
          await rename(join(packDir, name), moved)
          const unpack = await s.run(
            'sh',
            ['-c', 'git --git-dir="$1" unpack-objects -q < "$2"', 'sh', cache, moved],
            { cwd: s.workspace.root },
          )
          expect(unpack.code, unpack.output).toBe(0)
        }
        for (const name of await readdir(packDir).catch(() => [] as string[])) {
          if (name.endsWith('.idx') || name.endsWith('.rev')) await rm(join(packDir, name), { force: true })
        }

        const treeR = await s.run('git', ['--git-dir', cache, 'rev-parse', `${sha}^{tree}`], {
          cwd: s.workspace.root,
        })
        expect(treeR.code, treeR.output).toBe(0)
        const tree = treeR.stdout.trim()
        const object = join(cache, 'objects', tree.slice(0, 2), tree.slice(2))
        expect(existsSync(object), 'the tree object is not loose, so deleting it proves nothing').toBe(true)
        await rm(object)

        return runDrift(env)
      }

      const treeBefore = await walkFiles(proj)
      const oldResult = await warmThenDamage((env) => runOld(s, proj, ['drift'], env))
      // drift (successful OR failed) never writes the project tree — proven
      // generically by driftBoth/runBoth elsewhere in this file — so this
      // holds across BOTH the warm call and the damaged one, on both sides.
      expect(await walkFiles(proj), 'warm-then-damage (OLD) must never write to the project tree').toEqual(treeBefore)
      // Same reset `runBoth` uses above, plus resetting the cache directory
      // itself so the NEW side gets its own independent warm-then-damage
      // cycle through the identical cache PATH (same XDG_CACHE_HOME, same
      // remote address), which is what lets a plain expectIdentical compare
      // the two sides byte-for-byte despite the cache path being embedded in
      // the error message.
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      await rm(cacheHome, { recursive: true, force: true })
      const newResult = await warmThenDamage((env) => runNew(s, proj, ['drift'], env))
      expect(await walkFiles(proj), 'warm-then-damage (NEW) must never write to the project tree').toEqual(treeBefore)

      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain(`cache ${join(cacheHome, 'struct2flow')}`)
      expect(oldResult.stderr).toContain('is damaged')
      expect(oldResult.stderr).toContain('remove it (rm -rf')
    })
  })
})

/**
 * blueprint-port differential — a2bp / prs (TASK-081 slice 4, plan §8 row 4).
 *
 * Re-implemented after Codex round-3 review found the original harness did
 * not implement plan §5's "same path, twice" determinism rule: it built TWO
 * INDEPENDENT fixture trees (one per CLI, under `old-*`/`new-*` parent
 * directories) and then papered over the resulting divergence — different
 * absolute paths, different commit SHAs (unpinned author/committer dates),
 * different a2bp request-branch keys (the key hashes in the remote's own
 * absolute path, plan §5's own example) — with `scrubA2bp`, a normaliser
 * plan §5 never allows. `scrubA2bp` is gone; nothing here normalises a path,
 * a SHA or a request key.
 *
 * `a2bpSamePathTwice` is the one comparison helper every row in this
 * describe goes through: build ONE fixture at a fixed root, run OLD,
 * snapshot the project tree, the blueprint tree, the blueprint's refs (what
 * a2bp pushed) and any gh-argv log; DELETE the root; rebuild the IDENTICAL
 * fixture at the SAME path (pinned `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`
 * and identity, so content-derived bytes are the same regardless of which
 * run built them — plan §5's own determinism bullet); run NEW; snapshot
 * again; diff with NO normalisation beyond the three plan §5 names: mktemp
 * suffixes, `diff -u` header timestamps, and bash's `line N:` prefix.
 *
 * `a2bp` WRITES A REAL BRANCH to its (local, filesystem) remote when it gets
 * that far — the snapshot's `bpRefs` field is how that write is compared,
 * rather than reading it off stdout.
 */

const PINNED_GIT_DATE = '2026-01-01T00:00:00Z'

function pinnedGitEnv(): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@local',
    GIT_AUTHOR_DATE: PINNED_GIT_DATE,
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@local',
    GIT_COMMITTER_DATE: PINNED_GIT_DATE,
  }
}

/** Same shape as `commitAll` above, except every commit's author/committer
 * date and identity are pinned rather than left to the wall clock — the
 * precondition plan §5 states for "same path, twice": identical content,
 * built twice, must hash to the identical commit SHA. */
async function commitAllPinned(s: Scenario, dir: string, message = 'init'): Promise<void> {
  await git(s, dir, ['add', '-A'])
  await s.run('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message], {
    cwd: dir,
    env: pinnedGitEnv(),
  })
}

interface A2bpFixture {
  readonly root: string
  readonly bp: string
  readonly proj: string
}

/** Extra fixture shape a handful of the TASK-081 "a2bp/prs last rows" need,
 * beyond the CLAUDE.md-only default: `projDirName` for a project whose
 * directory basename (the value a2bp reverse-substitutes proj_name against)
 * is itself pathological, and `bpExtraFiles`/`bpGitattributes`/`projExtraFiles`
 * for the "unshipped path" row's `templates/`, export-ignored in the base. */
interface A2bpFixtureOptions {
  readonly projDirName?: string
  readonly bpExtraFiles?: Record<string, string>
  readonly bpGitattributes?: string
  readonly projExtraFiles?: Record<string, string>
}

/** Builds `root/bp` (the blueprint remote) and `root/proj` (a registered
 * project, with the real `scripts/` tree so a2bp's own lib-loading runs for
 * real), both with pinned commits. Called twice per row, at the SAME `root`,
 * with the SAME `claudeText` — so the two builds are byte-identical modulo
 * nothing. */
async function buildA2bpFixture(
  s: Scenario,
  root: string,
  claudeText: string,
  fxOpts: A2bpFixtureOptions = {},
): Promise<A2bpFixture> {
  const bp = join(root, 'bp')
  const proj = join(root, fxOpts.projDirName ?? 'proj')

  await mkdir(join(bp, 'docs'), { recursive: true })
  await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
  await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
  await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
  for (const [rel, content] of Object.entries(fxOpts.bpExtraFiles ?? {})) {
    await mkdir(join(bp, dirname(rel)), { recursive: true })
    await writeFile(join(bp, rel), content, 'utf8')
  }
  if (fxOpts.bpGitattributes) await writeFile(join(bp, '.gitattributes'), fxOpts.bpGitattributes, 'utf8')
  await initRepo(s, bp)
  await commitAllPinned(s, bp, 'base')
  const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

  await cp(join(REPO_ROOT, 'scripts'), join(proj, 'scripts'), { recursive: true })
  await s.run('chmod', ['+x', join(proj, 'scripts/blueprint')], { cwd: proj })
  await mkdir(join(proj, '.githooks'), { recursive: true })
  await writeFile(join(proj, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n', 'utf8')
  await s.run('chmod', ['+x', join(proj, '.githooks/pre-push')], { cwd: proj })
  await writeFile(
    join(proj, '.blueprint-source'),
    `config_version   = 2\nblueprint_remote = ${bp}\nblueprint_branch = main\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
    'utf8',
  )
  await initRepo(s, proj)
  await commitAllPinned(s, proj, 'init')
  // a2bp needs a project file that DIFFERS from the blueprint's copy, or
  // every row exercises "nothing to request" (BP_RC_NOTHING) instead of the
  // path it means to prove.
  await writeFile(join(proj, 'CLAUDE.md'), claudeText, 'utf8')
  for (const [rel, content] of Object.entries(fxOpts.projExtraFiles ?? {})) {
    await mkdir(join(proj, dirname(rel)), { recursive: true })
    await writeFile(join(proj, rel), content, 'utf8')
  }
  await commitAllPinned(s, proj, 'edit')

  return { root, bp, proj }
}

interface A2bpSnapshot {
  readonly projTree: Array<{ path: string; mode: string; content: string }>
  readonly bpRefs: string
  readonly blueprintSource: string
  readonly ghLog: string
}

async function snapshotA2bp(s: Scenario, fx: A2bpFixture, ghLogPath?: string): Promise<A2bpSnapshot> {
  return {
    projTree: await walkFiles(fx.proj),
    bpRefs: await snapshotRefs(s, fx.bp),
    blueprintSource: await readFile(join(fx.proj, '.blueprint-source'), 'utf8').catch(() => ''),
    ghLog: ghLogPath ? await readFile(ghLogPath, 'utf8').catch(() => '') : '',
  }
}

/** Plan §5's "that no scratch is left": TMPDIR is this scenario's own `tmp/`
 * (harness/index.ts's scenarioEnv), and a2bp's scratch clone is
 * `a2bp.XXXXXXXXXX` there (plan §5's own named mktemp exception — its
 * SUFFIX is unnormalised-but-ignored by virtue of not existing once the run
 * is done, never by pattern-stripping it out of compared text). */
async function assertNoA2bpScratch(s: Scenario): Promise<void> {
  const tmp = join(s.workspace.root, 'tmp')
  const entries = await readdir(tmp).catch(() => [] as string[])
  const leftover = entries.filter((e) => e.startsWith('a2bp.'))
  expect(leftover, `a2bp scratch left behind in ${tmp}: ${leftover.join(', ')}`).toEqual([])
}

/** Plan §5's own named mktemp exception, applied to compared TEXT rather
 * than left unhandled: a2bp's scratch clone directory name
 * (`a2bp.XXXXXXXXXX`, `mktemp -d`'s random suffix) is printed verbatim in
 * `--dry-run`'s "Full diff" preview line (the `git -C <scratch>/bare diff …`
 * command it shows rather than runs). Everything else on that line —
 * including the workspace root ahead of it, identical under same-path-twice
 * — is compared unnormalised. */
function normalizeA2bpScratch(text: string): string {
  return text.replace(/\ba2bp\.[A-Za-z0-9]+\b/g, 'a2bp.<scratch>')
}

interface A2bpRowOptions {
  readonly claudeText?: string
  /** Built fresh against each side's OWN root/proj, right before that side's
   * run — e.g. a PATH shim or a gh-argv logger. Returning `{}` is fine. */
  readonly env?: (fx: A2bpFixture, side: 'old' | 'new') => Promise<Record<string, string>>
  /** When the row uses a gh shim that logs its own argv, the path that shim
   * writes to (relative to `fx.root`) — snapshotted as part of the compare. */
  readonly ghLogRelPath?: string
  /** Non-default fixture shape (a pathological project directory name, or
   * extra files/`.gitattributes` on the base) — see `A2bpFixtureOptions`. */
  readonly fixture?: A2bpFixtureOptions
}

interface A2bpRowResult {
  readonly oldResult: RunResult
  readonly newResult: RunResult
}

async function a2bpSamePathTwice(s: Scenario, tag: string, args: string[], opts: A2bpRowOptions = {}): Promise<A2bpRowResult> {
  const claudeText = opts.claudeText ?? '# CLAUDE\nfixture\nan improvement worth requesting\n'
  const root = s.workspace.path(tag)

  const fx1 = await buildA2bpFixture(s, root, claudeText, opts.fixture)
  const env1 = opts.env ? await opts.env(fx1, 'old') : {}
  const oldResult = await runOld(s, fx1.proj, ['a2bp', ...args], env1)
  const oldSnapshot = await snapshotA2bp(s, fx1, opts.ghLogRelPath ? join(root, opts.ghLogRelPath) : undefined)
  await assertNoA2bpScratch(s)

  await rm(root, { recursive: true, force: true })

  const fx2 = await buildA2bpFixture(s, root, claudeText, opts.fixture)
  const env2 = opts.env ? await opts.env(fx2, 'new') : {}
  const newResult = await runNew(s, fx2.proj, ['a2bp', ...args], env2)
  const newSnapshot = await snapshotA2bp(s, fx2, opts.ghLogRelPath ? join(root, opts.ghLogRelPath) : undefined)
  await assertNoA2bpScratch(s)

  expect(normalizeA2bpScratch(newResult.stdout)).toBe(normalizeA2bpScratch(oldResult.stdout))
  expect(normalizeA2bpScratch(newResult.stderr)).toBe(normalizeA2bpScratch(oldResult.stderr))
  expect(newResult.code).toBe(oldResult.code)
  expect(newResult.signal).toBe(oldResult.signal)
  expect(newSnapshot).toEqual(oldSnapshot)

  return { oldResult, newResult }
}

/**
 * blueprint-port differential — drift's `.blueprint-source` config-shape
 * refusals (plan §5's "v1 config (4); placeholder remote (4); missing
 * release branch (5)" rows, plus "bootstrap_sha not in history", "override,
 * and override not a directory" and "the leftover blueprint_source
 * warning" — this round's Part 2, closing the gap the 'fetch failures'
 * describe's own header comment left open on the grounds that these share
 * `bp_config_load`'s code path with the six proven rows there: this round's
 * brief asks for the rows explicitly, so they are added rather than left to
 * that argument).
 *
 * All read-only refusals (nothing is ever written), so OLD then NEW share
 * one project directory throughout, like the 'fetch failures' describe's
 * own `runBoth`.
 */
describe('blueprint-port differential — drift config-shape refusals', () => {
  async function seedFetchBlueprint(s: Scenario, dir: string): Promise<string> {
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
    await writeFile(join(dir, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
    await writeFile(join(dir, 'README.md'), '# fixture project\n', 'utf8')
    await initRepo(s, dir)
    await commitAll(s, dir, 'base')
    return (await git(s, dir, ['rev-parse', 'HEAD'])).stdout.trim()
  }

  async function runBoth(
    s: Scenario,
    proj: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<{ oldResult: RunResult; newResult: RunResult }> {
    const treeBefore = await walkFiles(proj)
    const oldResult = await runOld(s, proj, args, env)
    expect(await walkFiles(proj), 'a config-shape refusal (OLD) must never write to the project tree').toEqual(
      treeBefore,
    )
    await assertNoDriftPullScratch(s)
    await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
    await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
    const newResult = await runNew(s, proj, args, env)
    expect(await walkFiles(proj), 'a config-shape refusal (NEW) must never write to the project tree').toEqual(
      treeBefore,
    )
    await assertNoDriftPullScratch(s)
    return { oldResult, newResult }
  }

  it('v1 config (no config_version): exit 4, names the lines to add', async () => {
    await scenario('blueprint-port-drift-config-v1', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // No config_version line at all — the pre-TASK-025 shape.
      await writeFile(
        join(proj, '.blueprint-source'),
        `blueprint_remote = ${bp}\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stderr).toContain('is a version 1 config')
    })
  })

  it('placeholder remote (blueprint_remote still FILL-ME-IN): exit 4, no remote contact', async () => {
    await scenario('blueprint-port-drift-config-placeholder', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = FILL-ME-IN\nblueprint_branch = main\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
      expect(oldResult.stderr).toContain('still has the bootstrap placeholder')
    })
  })

  it("missing release branch (blueprint_release_branch names a branch the remote doesn't have): exit 5", async () => {
    await scenario('blueprint-port-drift-config-missing-release-branch', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ${bp}\nblueprint_branch = main\nblueprint_release_branch = released\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], {})
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(5)
      expect(oldResult.stderr).toContain("no branch 'released' on that remote")
    })
  })

  it('bootstrap_sha not in the fetched history: warned, not fatal', async () => {
    await scenario('blueprint-port-drift-config-sha-not-in-history', async (s) => {
      // TWO UNRELATED repos: the actual fetch target (bp), and a second,
      // independent one (other) whose HEAD sha is recorded as this project's
      // bootstrap_sha — guaranteeing it is not an ancestor of bp's history
      // without relying on any history-rewrite trick.
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      // Distinct content, not just a distinct directory — two commits built
      // from byte-identical trees/messages/authors can hash to the SAME sha
      // (observed directly: `seedFetchBlueprint` run twice in the same
      // second produces two IDENTICAL commit objects), which would make
      // `otherSha` accidentally equal `sha` and this row vacuous.
      const other = await s.workspace.dir('other')
      await mkdir(join(other, 'docs'), { recursive: true })
      await writeFile(join(other, 'CLAUDE.md'), '# CLAUDE\na wholly unrelated repo\n', 'utf8')
      await writeFile(join(other, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(other, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, other)
      await commitAll(s, other, 'unrelated base')
      const otherSha = (await git(s, other, ['rev-parse', 'HEAD'])).stdout.trim()
      expect(otherSha, 'the two fixtures must not accidentally share a commit sha').not.toBe(sha)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ${bp}\nblueprint_branch = main\nbootstrap_sha    = ${otherSha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const env = await dateShimEnv(s)
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain(`bootstrap_sha ${otherSha} is not in`)
      expect(oldResult.stdout).toContain('history.')
    })
  })

  it('BLUEPRINT_ROOT override not a directory: dies before any fetch', async () => {
    await scenario('blueprint-port-drift-override-not-a-directory', async (s) => {
      const proj = await s.workspace.dir('proj')
      await seedCliOnly(s, proj)
      await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
      await mkdir(join(proj, 'docs'), { recursive: true })
      await writeFile(join(proj, 'docs/DoD.md'), '# DoD\n', 'utf8')
      await writeFile(
        join(proj, '.blueprint-source'),
        `bootstrap_sha    = 0000000000000000000000000000000000000000\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const notADir = s.workspace.path('not-a-real-checkout')
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], { BLUEPRINT_ROOT: notADir })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain(`BLUEPRINT_ROOT is '${notADir}', which is not a directory`)
    })
  })

  it('the leftover blueprint_source line: warned once, every run, until deleted', async () => {
    await scenario('blueprint-port-drift-leftover-blueprint-source-line', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedFetchBlueprint(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // TASK-025 — a config still naming the old, no-longer-read field.
      await writeFile(
        join(proj, '.blueprint-source'),
        `config_version   = 2\nblueprint_remote = ${bp}\nblueprint_branch = main\nblueprint_source = ${bp}\nbootstrap_sha    = ${sha}\nbootstrap_date   = 2026-01-01\n`,
        'utf8',
      )
      const env = await dateShimEnv(s)
      const { oldResult, newResult } = await runBoth(s, proj, ['drift'], env)
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stderr).toContain('still has blueprint_source, which is no longer read')
    })
  })

  /** BLUEPRINT_ROOT override, with a REAL local checkout — a committed file
   * then deleted from the WORKING TREE without committing the deletion:
   * `git archive HEAD` (bp_managed_files) still lists it, but
   * bp_blueprint_path resolves straight to the working tree, where it is
   * gone. The exact asymmetry the drift describe's own header names as
   * "the SAME managed-set-diff code path as 'new in blueprint', with the
   * two sides swapped" — proven here as its own row rather than only
   * asserted in prose. */
  it("missing in blueprint — committed at the blueprint's HEAD but absent from its working tree", async () => {
    await scenario('blueprint-port-drift-missing-in-blueprint', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(join(bp, 'CLAUDE.md'), '# CLAUDE\nfixture\n', 'utf8')
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()
      // Committed, then removed from the WORKING TREE only — no commit for
      // the removal, so HEAD (and `git archive HEAD`) still lists it.
      await rm(join(bp, 'docs/DoD.md'))

      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      // seedOverrideProject-equivalent inline: this row's project is judged
      // through BLUEPRINT_ROOT (a local checkout), never the address path,
      // because only a real working tree can be made to disagree with its
      // own HEAD this way.
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await writeFile(join(proj, 'docs/DoD.md'), '# DoD\nfixture\n', 'utf8')
      await commitAll(s, proj, 'sync')

      const env = { ...(await dateShimEnv(s)), BLUEPRINT_ROOT: bp, BP_NO_PROMPT: '1' }
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['drift'], env)
      expect(await walkFiles(proj), 'drift (OLD) must never write to the project tree').toEqual(treeBefore)
      await s.run('git', ['config', '--unset', 'core.hooksPath'], { cwd: proj }).catch(() => {})
      await s.run('git', ['config', '--unset', 'core.sshCommand'], { cwd: proj }).catch(() => {})
      const newResult = await runNew(s, proj, ['drift'], env)
      expect(await walkFiles(proj), 'drift (NEW) must never write to the project tree').toEqual(treeBefore)
      expectIdentical(oldResult, newResult)
      expect(oldResult.stdout).toContain('Listed managed but missing in blueprint: 1')
      expect(oldResult.stdout).toContain('! docs/DoD.md')
      expect(oldResult.stdout).toContain("committed at the blueprint's HEAD but absent from its working tree")
    })
  })
})

/**
 * blueprint-port differential — pull rows plan §5 still names and this file
 * did not yet cover: an unknown option (dies after the fetch, as today) and
 * a HELD file (refused mid-loop) leaving bootstrap_sha untouched alongside a
 * SUCCESSFULLY pulled sibling — `held`'s own bucket in cmd_pull, distinct
 * from the partial-pull row above (a named file, never entering the loop at
 * all) and from the refused row above (nothing else to pull in that
 * fixture).
 */
describe('blueprint-port differential — pull remaining rows', () => {
  it('an unknown option dies after the fetch, same as today', async () => {
    await scenario('blueprint-port-pull-unknown-option', async (s) => {
      const bp = await s.workspace.dir('bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('proj')
      await seedRegisteredProject(s, proj, bp, sha)
      await copyFile(join(bp, 'CLAUDE.md'), join(proj, 'CLAUDE.md'))
      await mkdir(join(proj, 'docs'), { recursive: true })
      await copyFile(join(bp, 'docs/DoD.md'), join(proj, 'docs/DoD.md'))
      await commitAll(s, proj, 'sync')
      const env = await dateShimEnv(s)
      const treeBefore = await walkFiles(proj)
      const oldResult = await runOld(s, proj, ['pull', '--not-a-real-option'], env)
      expect(await walkFiles(proj), 'unknown option (OLD) must write nothing').toEqual(treeBefore)
      // NON-VACUITY: `cmd_pull` calls `read_blueprint_source` (which fetches)
      // BEFORE its own option loop, so the cache is populated even though
      // nothing in the CLI's OWN output says so (unlike drift, pull prints no
      // "blueprint: … fetched: …" report line at all) — checked directly
      // against the cache `read_blueprint_source`'s fetch must have written.
      const remote = await readBlueprintRemote(proj)
      expect(remote, 'the fixture must have registered a remote').toBeDefined()
      expect(await bpCacheRefsOrSentinel(s, remote!), 'the fetch must have run before the option was rejected').not.toBe(
        '<no cache created>',
      )
      const newResult = await runNew(s, proj, ['pull', '--not-a-real-option'], env)
      expect(await walkFiles(proj), 'unknown option (NEW) must write nothing').toEqual(treeBefore)
      await assertNoDriftPullScratch(s)
      expectPullIdentical(oldResult, newResult)
      expect(oldResult.code).not.toBe(0)
      expect(oldResult.output).toContain('unknown option: --not-a-real-option')
    })
  })

  it('a held file (refused mid-loop) leaves bootstrap_sha unchanged, even with a sibling successfully pulled', async () => {
    await scenario('blueprint-port-pull-held-file', async (s) => {
      const bp = await s.workspace.dir('bp')
      await mkdir(join(bp, 'docs'), { recursive: true })
      await writeFile(
        join(bp, 'CLAUDE.md'),
        '# CLAUDE\n<!-- BLUEPRINT:BEGIN -->\nmanaged content\n<!-- BLUEPRINT:END -->\nkeep\n',
        'utf8',
      )
      await writeFile(join(bp, 'docs/DoD.md'), '# DoD\nfixture v2\n', 'utf8')
      await writeFile(join(bp, 'README.md'), '# fixture project\n', 'utf8')
      await initRepo(s, bp)
      await commitAll(s, bp, 'base')
      const sha = (await git(s, bp, ['rev-parse', 'HEAD'])).stdout.trim()

      const oldProj = await s.workspace.dir('old')
      const newProj = await s.workspace.dir('new')
      for (const proj of [oldProj, newProj]) {
        await seedRegisteredProject(s, proj, bp, sha)
        // CLAUDE.md: an END with no open region — REFUSED, held back.
        await writeFile(join(proj, 'CLAUDE.md'), '# CLAUDE\n<!-- BLUEPRINT:END -->\nbroken\n', 'utf8')
        // docs/DoD.md: plain drift — pulls cleanly.
        await mkdir(join(proj, 'docs'), { recursive: true })
        await writeFile(join(proj, 'docs/DoD.md'), '# DoD\nfixture v1\n', 'utf8')
        await commitAll(s, proj, 'one refused, one drifted')
      }
      const env = await dateShimEnv(s)
      const oldResult = await runOld(s, oldProj, ['pull', '--yes'], env)
      const newResult = await runNew(s, newProj, ['pull', '--yes'], env)
      expectPullIdentical(oldResult, newResult)
      // BUG-034's own status: a guard-refused file makes the whole pull
      // return 4, same as a2bp's "a guard refused; nothing done" — even
      // though a SIBLING file did land (checked below).
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain('bootstrap_sha left unchanged — these files were not synced:')
      const oldSrc = await readFile(join(oldProj, '.blueprint-source'), 'utf8')
      expect(oldSrc).toContain(`bootstrap_sha    = ${sha}`)
      // NON-VACUITY: docs/DoD.md — the sibling that was NOT held — actually
      // landed, proving this is the "held" bucket and not merely the refused
      // row's own "nothing at all was pulled" shape.
      expect(await readFile(join(oldProj, 'docs/DoD.md'), 'utf8')).toBe('# DoD\nfixture v2\n')
      expect(await readFile(join(oldProj, 'CLAUDE.md'), 'utf8')).toBe('# CLAUDE\n<!-- BLUEPRINT:END -->\nbroken\n')
      expect(await walkFiles(newProj), 'the two independently-pulled projects must end up byte-identical').toEqual(
        await walkFiles(oldProj),
      )
      await assertNoDriftPullScratch(s)
    })
  })
})

describe('blueprint-port differential — a2bp / prs', () => {
  /** A symlink farm of every executable on PATH EXCEPT `name` (a2bp-e2e's own
   * technique — a shim is useless here, since `command -v` finds it; the
   * binary must be genuinely absent). `Scenario.pathWithout` always lands in
   * the SAME `path-without/` workspace subdirectory, so a second call within
   * one scenario (the "old" build, then the "new" rebuild) collides on its
   * own already-planted symlinks — hence a distinct `dir` per call here,
   * named by `tag` rather than reused. */
  async function pathWithoutBin(s: Scenario, name: string, tag: string): Promise<string> {
    const dir = await s.workspace.dir(tag)
    const farm = await s.run(
      'sh',
      [
        '-c',
        'printf %s "$1" | tr : "\\n" | while IFS= read -r d; do\n' +
          '  [ -d "$d" ] || continue\n' +
          '  for exe in "$d"/*; do\n' +
          '    [ -f "$exe" ] || continue\n' +
          '    [ -x "$exe" ] || continue\n' +
          '    n="${exe##*/}"\n' +
          '    [ "$n" = "$2" ] && continue\n' +
          '    [ -e "$3/$n" ] || ln -s "$exe" "$3/$n" 2>/dev/null\n' +
          '  done\n' +
          'done\n' +
          'exit 0',
        '_',
        process.env.PATH ?? '',
        name,
        dir,
      ],
      { cwd: s.workspace.root },
    )
    expect(farm.code, farm.output).toBe(0)
    return dir
  }

  /** TASK-081 "a2bp/prs last rows" — the "remote moving" technique
   * `tests/a2bp-e2e` #12/#12b prove shell-side, adapted onto
   * `a2bpSamePathTwice`'s same-path-twice fixture: a `git` PATH shim that
   * forwards every invocation to the REAL git, then — once the forwarded
   * call was a `fetch` — advances `fx.bp`'s `main` by one pinned commit.
   * `onceOnly` selects between #12's shape (a stamp file gates the move to
   * once) and #12b's (no stamp — every fetch moves it again, including the
   * one the pre-push re-check's own rebuild triggers). Built fresh per side
   * via `tag`, same rule every other fault-injection shim here follows. */
  async function movingRemoteGitShim(
    s: Scenario,
    fx: A2bpFixture,
    tag: string,
    onceOnly: boolean,
  ): Promise<Awaited<ReturnType<Scenario['shimDir']>>> {
    const real = await realBinPath(s, 'git')
    const shims = await s.shimDir(tag)
    const stamp = join(s.workspace.root, `${tag}.moved.stamp`)
    const guard = onceOnly ? `[ "$fetching" = 1 ] && [ ! -e ${JSON.stringify(stamp)} ]` : '[ "$fetching" = 1 ]'
    const stampLine = onceOnly ? `  : > ${JSON.stringify(stamp)}\n` : ''
    await shims.add(
      'git',
      `fetching=0\n` +
        `for a in "$@"; do\n  [ "$a" = fetch ] && fetching=1\ndone\n` +
        `${JSON.stringify(real)} "$@"\n` +
        `rc=$?\n` +
        `if ${guard}; then\n` +
        stampLine +
        // Pinned author/committer date and identity — plan §5's own "same
        // path, twice" precondition (this file's PINNED_GIT_DATE, already
        // used by commitAllPinned): an unpinned commit-tree here would give
        // the "moved" commit a wall-clock timestamp, so its SHA — and every
        // downstream request SHA the port builds against it — would differ
        // between the OLD run and the NEW rebuild, breaking the compare on
        // grounds that have nothing to do with the port.
        `  t=$(${JSON.stringify(real)} -C ${JSON.stringify(fx.bp)} rev-parse 'main^{tree}')\n` +
        `  c=$(GIT_AUTHOR_NAME=e GIT_AUTHOR_EMAIL=e@l GIT_AUTHOR_DATE=${JSON.stringify(PINNED_GIT_DATE)} GIT_COMMITTER_NAME=e GIT_COMMITTER_EMAIL=e@l GIT_COMMITTER_DATE=${JSON.stringify(PINNED_GIT_DATE)} ${JSON.stringify(real)} -C ${JSON.stringify(fx.bp)} -c commit.gpgsign=false commit-tree "$t" -p main -m 'the blueprint moved')\n` +
        `  ${JSON.stringify(real)} -C ${JSON.stringify(fx.bp)} update-ref refs/heads/main "$c"\n` +
        `fi\n` +
        `exit $rc\n`,
    )
    return shims
  }

  /**
   * Codex review finding 2 (TASK-081, commit 1ced574's body) — a2bp's
   * `bp_file_base_content` call (scripts/blueprint:1944) and its
   * `--no-pager diff --stat` pipeline (:2025) are BARE statements under
   * `set -e`, never an `if`/`||` condition — unlike bp_prospective_for's own
   * three call sites (plan §2 rule 4), a failure here must ABORT the whole
   * run with the failing command's own status, not be silently absorbed.
   * 1ced574 fixed the port to `throw` here instead of wrapping in
   * `unchecked()`; these two rows are the differential proof the review
   * asked for — a `git` PATH shim that fails ONLY the one verb each
   * statement uses (matching argv, never a substring), passing every other
   * git invocation through untouched, so `bp_file_fetch_base`'s own
   * clone/fetch/rev-parse and the later commit-tree build are unaffected.
   */
  it('finding 2 — bp_file_base_content’s bare `git show` failing aborts the whole run', async () => {
    await scenario('blueprint-port-a2bp-f2-base-content', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-f2a', ['CLAUDE.md'], {
        env: async (_fx, side) => ({ PATH: await verbFailShim(s, `f2a-git-${side}`, 'git', ['show']) }),
      })
      // NON-VACUITY: died specifically of the shimmed git's own status, not
      // some unrelated refusal (a2bp's own guard codes are 3/4/5/6 — never 1
      // — so exit 1 here can only be the bare statement's abort).
      expect(oldResult.code).toBe(1)
    })
  })

  it('finding 2 — the bare `git --no-pager diff --stat` pipeline failing aborts the whole run', async () => {
    await scenario('blueprint-port-a2bp-f2-diff-stat', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-f2b', ['CLAUDE.md'], {
        env: async (_fx, side) => ({ PATH: await verbFailShim(s, `f2b-git-${side}`, 'git', ['--stat']) }),
      })
      expect(oldResult.code).toBe(1)
      // The request got as far as building the commit (both sides printed
      // the "Request" header) before the bare diff --stat statement killed it.
      expect(oldResult.stdout).toContain('Request')
      expect(oldResult.stdout).not.toContain('request filed')
    })
  })

  /**
   * Codex review finding 3 — `scripts/lib/placeholders.sh` is not one of
   * a2bp's six required libs (it is sourced separately, plan §9 D), so a
   * project missing it does not hit the "lib is missing" refusal at all.
   * Instead `bpShouldSubstitute` bridges to it directly, and the shell's own
   * call site (`_should_substitute` at scripts/blueprint:1947, no
   * redirection) lets bash's own "command not found" line reach the real
   * stderr when the function is undefined. A path that SHOULD substitute
   * (CLAUDE.md is not in bp_should_substitute's exemption list) is what
   * reaches that call.
   *
   * FIXED, not just observed: `bpShouldSubstitute` used to pass
   * `stderr: 'ignore'`, silently swallowing this diagnostic outright — a
   * real divergence (CLAUDE.md's "no silent swallowing" rule), now
   * `stderr: 'inherit'`. What remains a NAMED, ACCEPTED divergence (plan §6
   * already has one of this shape) is the exact WORDING: the shell's
   * diagnostic is bash's own "scripts/blueprint: line 287: …", naming the
   * CLI's real file and line, while the port's bridge runs the function
   * through a SEPARATE `bash -c` subprocess, whose own diagnostic can only
   * ever read "bash: line 1: …" — a different bash process reporting on
   * itself, not something `run()` synthesizes and could be taught the CLI's
   * shape. Stdout, the exit code and every snapshotted byte are still
   * compared exactly; only this one stderr line is normalised (both sides'
   * "<program>: line N: " prefix stripped before the message) — the one
   * bash-line-number normalisation plan §5/§6 name outright.
   */
  it('finding 3 — scripts/lib/placeholders.sh missing, on a path that substitutes', async () => {
    await scenario('blueprint-port-a2bp-f3-no-placeholders', async (s) => {
      const claudeText = '# CLAUDE\nfixture\nan improvement worth requesting\n'
      const root = s.workspace.path('a2bp-f3')

      const fx1 = await buildA2bpFixture(s, root, claudeText)
      await rm(join(fx1.proj, 'scripts/lib/placeholders.sh'))
      const oldResult = await runOld(s, fx1.proj, ['a2bp', 'CLAUDE.md'])
      const oldSnapshot = await snapshotA2bp(s, fx1)
      await assertNoA2bpScratch(s)

      await rm(root, { recursive: true, force: true })

      const fx2 = await buildA2bpFixture(s, root, claudeText)
      await rm(join(fx2.proj, 'scripts/lib/placeholders.sh'))
      const newResult = await runNew(s, fx2.proj, ['a2bp', 'CLAUDE.md'])
      const newSnapshot = await snapshotA2bp(s, fx2)
      await assertNoA2bpScratch(s)

      expect(newResult.stdout).toBe(oldResult.stdout)
      expect(newResult.code).toBe(oldResult.code)
      expect(newSnapshot).toEqual(oldSnapshot)
      const stripLinePrefix = (t: string) => t.replace(/^\S+: line \d+: /gm, '')
      expect(stripLinePrefix(newResult.stderr)).toBe(stripLinePrefix(oldResult.stderr))
      expect(oldResult.stderr).toContain('bp_should_substitute: command not found')
      expect(newResult.stderr).toContain('bp_should_substitute: command not found')
    })
  })

  it('dry-run — files, base and diff --stat, nothing pushed', async () => {
    await scenario('blueprint-port-a2bp-dry-run', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-dry', ['--dry-run', 'CLAUDE.md'])
      expect(oldResult.code, oldResult.output).toBe(0)
      expect(oldResult.stdout).toContain('--dry-run: nothing pushed')
    })
  })

  it('no files given — usage refusal, no remote contact', async () => {
    await scenario('blueprint-port-a2bp-no-files', async (s) => {
      const dir = await s.workspace.dir('cwd')
      const [oldResult, newResult] = await Promise.all([
        s.run('bash', [SHELL_CLI, 'a2bp'], { cwd: dir }),
        s.run(process.execPath, [PORTED_CLI, 'a2bp'], { cwd: dir }),
      ])
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain('usage: blueprint a2bp')
    })
  })

  it('not a derived project — no .blueprint-source here', async () => {
    await scenario('blueprint-port-a2bp-not-a-project', async (s) => {
      const dir = await s.workspace.dir('cwd')
      await seedCliOnly(s, dir)
      await writeFile(join(dir, 'CLAUDE.md'), '# CLAUDE\n', 'utf8')
      const oldResult = await runOld(s, dir, ['a2bp', 'CLAUDE.md'])
      const newResult = await runNew(s, dir, ['a2bp', 'CLAUDE.md'])
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(4)
    })
  })

  it('a required lib is missing — dies with the exact scripts/lib/<name> message', async () => {
    await scenario('blueprint-port-a2bp-missing-lib', async (s) => {
      const root = await s.workspace.dir('missinglib')
      await mkdir(join(root, 'scripts/lib'), { recursive: true })
      await copyFile(SHELL_CLI, join(root, 'scripts/blueprint'))
      await s.run('chmod', ['+x', join(root, 'scripts/blueprint')], { cwd: root })
      await copyFile(PORTED_CLI, join(root, 'scripts/blueprint.mts'))
      for (const name of await readdir(join(REPO_ROOT, 'scripts/lib'))) {
        if (name === 'request-build.sh') continue
        await copyFile(join(REPO_ROOT, 'scripts/lib', name), join(root, 'scripts/lib', name))
      }
      await writeFile(
        join(root, '.blueprint-source'),
        'config_version   = 2\nblueprint_remote = /nonexistent\nblueprint_branch = main\nbootstrap_sha    = 0000000000000000000000000000000000000000\nbootstrap_date   = 2026-01-01\n',
        'utf8',
      )
      const oldResult = await runOld(s, root, ['a2bp', 'CLAUDE.md'])
      const newResult = await runNew(s, root, ['a2bp', 'CLAUDE.md'])
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain('scripts/lib/request-build.sh is missing')
    })
  })

  it('contamination BLOCK — a host path in the file: nothing filed (exit 4)', async () => {
    await scenario('blueprint-port-a2bp-contamination', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-contam', ['CLAUDE.md'], {
        claudeText: '# CLAUDE\nfixture\nsecret path /home/someuser/private/config\n',
      })
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain('host home path')
      expect(oldResult.stdout).toContain('blocked — nothing filed')
    })
  })

  it('gitleaks unavailable — the secret scan refuses (BUG-127), exit 4', async () => {
    await scenario('blueprint-port-a2bp-no-gitleaks', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-nogl', ['CLAUDE.md'], {
        env: async (_fx, side) => ({ PATH: await pathWithoutBin(s, 'gitleaks', `nogl-${side}`) }),
      })
      expect(oldResult.code).toBe(4)
      expect(oldResult.stderr).toContain('gitleaks is not installed')
    })
  })

  // TASK-081 "drift/pull differential rows to completion" round — this row
  // was seen flaky (green on a bare retry, red standalone). Root cause,
  // measured directly (`vitest run -t "gh unavailable"` in isolation): the
  // row genuinely costs ~5.2s — `a2bpSamePathTwice` builds the FULL fixture
  // TWICE at the same path (git init/commit, a real gitleaks scan, a real
  // push into a bare remote), which is plan §5's own "same path, twice"
  // determinism contract (this file's header comment), not an accident this
  // row could shed — and `pathWithoutBin` on top of that builds a symlink
  // farm over the ENTIRE real PATH, twice (once per side). That total sits
  // close enough to a bare 5000ms default (vitest's own, applied whenever
  // this file runs outside `npm test`'s config-resolving entrypoint — e.g. a
  // `vitest run <file> -t …` invoked directly, which is how the flake was
  // reproduced) that ordinary system-load variance tips it over. The
  // project's OWN testTimeout (320s, tests/vitest.config.ts) already covers
  // this with room to spare; the explicit third argument here is a floor
  // that holds regardless of how the file is invoked, not a raise of the
  // real cost — the fixture-build-twice shape is correct and stays.
  it(
    'gh unavailable — pushed but no PR opened (BUG-011), exit 5',
    async () => {
      await scenario('blueprint-port-a2bp-no-gh', async (s) => {
        const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-nogh', ['CLAUDE.md'], {
          env: async (_fx, side) => ({ PATH: await pathWithoutBin(s, 'gh', `nogh-${side}`) }),
        })
        expect(oldResult.code).toBe(5)
        expect(oldResult.stdout).toContain('gh is not installed')
      })
    },
    30_000,
  )

  it('filed — pushed and a PR opened via a gh shim: exit 3 (BUG-011 happy path)', async () => {
    await scenario('blueprint-port-a2bp-filed', async (s) => {
      const ghScript =
        'printf \'%s\\n\' "$*" >> "$A2BP_GH_LOG"\n' +
        'case "$1 $2" in\n  "pr list") echo "" ;;\n  "pr create") echo "https://github.com/example/repo/pull/1" ;;\n  *) exit 1 ;;\nesac\n'
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-filed', ['CLAUDE.md'], {
        ghLogRelPath: 'gh-argv.log',
        env: async (fx, side) => {
          const shims = await s.shimDir(`filed-gh-${side}`)
          await shims.add('gh', ghScript)
          return { PATH: shims.path(), A2BP_GH_LOG: join(fx.root, 'gh-argv.log') }
        },
      })
      expect(oldResult.code).toBe(3)
      expect(oldResult.stdout).toContain('✓ request filed: https://github.com/example/repo/pull/1')
    })
  })

  // --- TASK-081 "a2bp/prs last rows" (plan §5's remaining a2bp/prs matrix
  // cells) — the eight rows below, plus the exit-code audit in their own
  // comment, close out the a2bp "NOT ROWS" list this file's header used to
  // carry. Every one goes through `a2bpSamePathTwice`, same as the ten above.

  it('--force is refused, as today (the flag is gone, not silently ignored)', async () => {
    await scenario('blueprint-port-a2bp-force', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-force', ['--force', 'CLAUDE.md'])
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain('--force is gone')
    })
  })

  it('an unknown option dies before any remote contact', async () => {
    await scenario('blueprint-port-a2bp-unknown-opt', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-unknown-opt', ['--nope', 'CLAUDE.md'])
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain('unknown option: --nope')
    })
  })

  it('nothing to request — the project file already matches the base (BP_RC_NOTHING, exit 6)', async () => {
    await scenario('blueprint-port-a2bp-nothing', async (s) => {
      // The default `claudeText` (every other row's fixture) is chosen
      // specifically to DIFFER from the blueprint's own copy — see
      // buildA2bpFixture's own comment. This row inverts that on purpose: an
      // IDENTICAL copy is exactly BP_RC_NOTHING's own precondition.
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-nothing', ['CLAUDE.md'], {
        claudeText: '# CLAUDE\nfixture\n',
      })
      expect(oldResult.code).toBe(6)
      expect(oldResult.stdout).toContain('Nothing to request.')
    })
  })

  /**
   * Staging's round-trip check (contamination.sh's `contamination_stage`,
   * scripts/blueprint:1954's rc-3 branch) is, by construction, almost
   * impossible to fail on ordinary content: every RESTORED line is either the
   * project's own byte-identical text (an insert) or a blueprint line whose
   * forward substitution is EXACTLY what got aligned to it — so restoring it
   * and substituting again reproduces that same aligned value, no matter
   * which of several identical-value occurrences the alignment picked. The
   * one gap: `bp_substitute_stream` is a SINGLE PASS, so if the project's own
   * NAME contains the raw token text `{{PROJECT_NAME}}` as a substring, the
   * value it substitutes TO still contains an unresolved token — and the
   * verifier's second pass over the PROJECT's own (already-once-substituted)
   * bytes resolves that leftover token a second time, while the staged
   * side's own second pass does not re-encounter it the same way. Confirmed
   * directly against both CLIs before writing this row (rc=3 on the shell,
   * identical "reject … (staging failed)" / "Round-trip check failed" text
   * and exit 4 on the port, `.scratch/rc3-e2e` in this worktree).
   */
  it('staging rc 3 — a project name containing the raw {{PROJECT_NAME}} token breaks the round-trip', async () => {
    await scenario('blueprint-port-a2bp-stage-rc3', async (s) => {
      const projDirName = 'acme{{PROJECT_NAME}}corp'
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-stage-rc3', ['CLAUDE.md'], {
        claudeText: '# CLAUDE\nHello acme{{PROJECT_NAME}}corp world\n',
        fixture: {
          projDirName,
          bpExtraFiles: { 'CLAUDE.md': '# CLAUDE\nHello {{PROJECT_NAME}} world\n' },
        },
      })
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain('reject')
      expect(oldResult.stdout).toContain('(staging failed)')
      expect(oldResult.stdout).toContain('Round-trip check failed')
    })
  })

  it('GNU diff missing — staging refuses with its own message (rc 2), exit 4', async () => {
    await scenario('blueprint-port-a2bp-nodiff', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-nodiff', ['CLAUDE.md'], {
        env: async (_fx, side) => ({ PATH: await pathWithoutBin(s, 'diff', `nodiff-${side}`) }),
      })
      expect(oldResult.code).toBe(4)
      expect(oldResult.stdout).toContain('(staging failed)')
      expect(oldResult.stdout).toContain('GNU diffutils')
    })
  })

  it('an unshipped path (TASK-037) — filed and marked "not shipped" in the run and the PR body', async () => {
    await scenario('blueprint-port-a2bp-unshipped', async (s) => {
      const ghScript =
        'printf \'%s\\n\' "$*" >> "$A2BP_GH_LOG"\n' +
        'case "$1 $2" in\n  "pr list") echo "" ;;\n  "pr create") echo "https://github.com/example/repo/pull/7" ;;\n  *) exit 1 ;;\nesac\n'
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-unshipped', ['templates/seed.md'], {
        ghLogRelPath: 'gh-argv.log',
        fixture: {
          bpExtraFiles: { 'templates/seed.md': '# Seed\noriginal seed\n' },
          bpGitattributes: 'templates/   export-ignore\n',
          projExtraFiles: { 'templates/seed.md': '# Seed\nIMPROVED seed\n' },
        },
        env: async (fx, side) => {
          const shims = await s.shimDir(`unshipped-gh-${side}`)
          await shims.add('gh', ghScript)
          return { PATH: shims.path(), A2BP_GH_LOG: join(fx.root, 'gh-argv.log') }
        },
      })
      expect(oldResult.code).toBe(3)
      expect(oldResult.stdout).toContain('not shipped')
      expect(oldResult.stdout).toContain('✓ request filed: https://github.com/example/repo/pull/7')
    })
  })

  it('the remote moving ONCE — the pre-push re-check rebuilds and files against the new base (BUG-108)', async () => {
    await scenario('blueprint-port-a2bp-move-once', async (s) => {
      const ghScript =
        'printf \'%s\\n\' "$*" >> "$A2BP_GH_LOG"\n' +
        'case "$1 $2" in\n  "pr list") echo "" ;;\n  "pr create") echo "https://github.com/example/repo/pull/9" ;;\n  *) exit 1 ;;\nesac\n'
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-move-once', ['CLAUDE.md'], {
        ghLogRelPath: 'gh-argv.log',
        env: async (fx, side) => {
          const gitShims = await movingRemoteGitShim(s, fx, `move1-git-${side}`, true)
          const ghShims = await s.shimDir(`move1-gh-${side}`)
          await ghShims.add('gh', ghScript)
          return { PATH: `${ghShims.dir}:${gitShims.path()}`, A2BP_GH_LOG: join(fx.root, 'gh-argv.log') }
        },
      })
      expect(oldResult.code).toBe(3)
      expect(oldResult.stdout).toContain('The blueprint moved while this request was being built — rebuilding once.')
      expect(oldResult.stdout).toContain('✓ request filed: https://github.com/example/repo/pull/9')
    })
  })

  it('the remote moving TWICE — refused after exactly one rebuild, no request branch pushed (BUG-108)', async () => {
    await scenario('blueprint-port-a2bp-move-twice', async (s) => {
      const { oldResult } = await a2bpSamePathTwice(s, 'a2bp-move-twice', ['CLAUDE.md'], {
        env: async (fx, side) => ({ PATH: (await movingRemoteGitShim(s, fx, `move2-git-${side}`, false)).path() }),
      })
      expect(oldResult.code).toBe(5)
      expect(oldResult.stdout).toContain('The blueprint moved again. Re-run when it settles.')
    })
  })

  // Every BP_RC_* code P5 names (plan §3 P5's own list) now has at least one
  // differential row in this describe: OK=0 (dry-run), PENDING=3 (filed,
  // unshipped, move-once), BLOCKED=4 (not-a-project, contamination,
  // gitleaks, staging-rc3, GNU-diff-missing), FAILED=5 (gh unavailable,
  // move-twice), NOTHING=6 (this round's own "nothing to request" row —
  // the one code with no prior row). Nothing is missing.

  it('prs — gh is not installed: die before any remote contact', async () => {
    await scenario('blueprint-port-prs-no-gh', async (s) => {
      const bp = await s.workspace.dir('prs-nogh-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prs-nogh-proj')
      await seedRegisteredProject(s, proj, bp, sha)
      const noGh = await pathWithoutBin(s, 'gh', 'prs-no-gh')
      const oldResult = await runOld(s, proj, ['prs'], { PATH: noGh })
      const newResult = await runNew(s, proj, ['prs'], { PATH: noGh })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(1)
      expect(oldResult.stderr).toContain('gh is not installed — cannot list requests')
    })
  })

  it('prs — a draft PR in the listing is marked [draft]', async () => {
    await scenario('blueprint-port-prs-draft', async (s) => {
      const bp = await s.workspace.dir('prs-draft-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prs-draft-proj')
      await seedRegisteredProject(s, proj, bp, sha)

      const draftGh = await s.shimDir('prs-draft-gh')
      await draftGh.add(
        'gh',
        'case "$1 $2" in\n' +
          '  "pr list") printf \'7\\ta2bp/proj-b/cafef00d\\t2026-02-03T04:05:06Z\\ttrue\\thttps://github.com/example/repo/pull/7\\n\' ;;\n' +
          '  *) exit 1 ;;\n' +
          'esac\n',
      )
      const oldResult = await runOld(s, proj, ['prs'], { PATH: draftGh.path() })
      const newResult = await runNew(s, proj, ['prs'], { PATH: draftGh.path() })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).toContain('#7')
      expect(oldResult.stdout).toContain('[draft]')
    })
  })

  /**
   * plan §3 P5: `cmd_prs` sources only `request-config.sh`, never
   * `request.sh` — so its orphan-branches section (which calls
   * `bp_request_transport_env`, a `request.sh`-only function) hits "command
   * not found" (127), hidden by `2>/dev/null … || true`. The listing NEVER
   * prints, on either CLI, even with a real pushed `a2bp/*` branch on the
   * remote that no PR covers — dead code, reproduced byte for byte rather
   * than "fixed" (this round is a port, not a bug fix; the shell's own
   * comment at scripts/blueprint:2210-2214 already names the follow-up bug).
   */
  it('prs — orphan branches: none listed, as today (dead code, plan §3 P5)', async () => {
    await scenario('blueprint-port-prs-orphans', async (s) => {
      const bp = await s.workspace.dir('prs-orphan-bp')
      const sha = await seedBlueprintRepo(s, bp)
      await git(s, bp, ['branch', 'a2bp/proj-a/deadbeef'])
      const proj = await s.workspace.dir('prs-orphan-proj')
      await seedRegisteredProject(s, proj, bp, sha)

      const emptyGh = await s.shimDir('prs-orphan-gh')
      await emptyGh.add('gh', 'case "$1 $2" in\n  "pr list") echo "" ;;\n  *) exit 1 ;;\nesac\n')
      const oldResult = await runOld(s, proj, ['prs'], { PATH: emptyGh.path() })
      const newResult = await runNew(s, proj, ['prs'], { PATH: emptyGh.path() })
      expectIdentical(oldResult, newResult)
      expect(oldResult.code).toBe(0)
      expect(oldResult.stdout).not.toContain('Pushed branches with no open PR')
    })
  })

  it('prs — empty, a listing, and a gh query failure', async () => {
    await scenario('blueprint-port-prs', async (s) => {
      const bp = await s.workspace.dir('prs-bp')
      const sha = await seedBlueprintRepo(s, bp)
      const proj = await s.workspace.dir('prs-proj')
      await seedRegisteredProject(s, proj, bp, sha)

      const emptyGh = await s.shimDir('prs-empty-gh')
      await emptyGh.add('gh', 'case "$1 $2" in\n  "pr list") echo "" ;;\n  *) exit 1 ;;\nesac\n')
      const emptyOld = await runOld(s, proj, ['prs'], { PATH: emptyGh.path() })
      const emptyNew = await runNew(s, proj, ['prs'], { PATH: emptyGh.path() })
      expectIdentical(emptyOld, emptyNew)
      expect(emptyOld.code).toBe(0)
      expect(emptyOld.stdout).toContain('No open a2bp requests.')

      const listingGh = await s.shimDir('prs-listing-gh')
      await listingGh.add(
        'gh',
        'case "$1 $2" in\n' +
          '  "pr list") printf \'42\\ta2bp/proj-a/deadbeef\\t2026-01-02T03:04:05Z\\tfalse\\thttps://github.com/example/repo/pull/42\\n\' ;;\n' +
          '  *) exit 1 ;;\n' +
          'esac\n',
      )
      const listingOld = await runOld(s, proj, ['prs'], { PATH: listingGh.path() })
      const listingNew = await runNew(s, proj, ['prs'], { PATH: listingGh.path() })
      expectIdentical(listingOld, listingNew)
      expect(listingOld.code).toBe(0)
      expect(listingOld.stdout).toContain('#42')
      expect(listingOld.stdout).toContain('proj-a')

      const failGh = await s.shimDir('prs-fail-gh')
      await failGh.add('gh', 'exit 1\n')
      const failOld = await runOld(s, proj, ['prs'], { PATH: failGh.path() })
      const failNew = await runNew(s, proj, ['prs'], { PATH: failGh.path() })
      expectIdentical(failOld, failNew)
      expect(failOld.code).toBe(1)
      expect(failOld.stdout).toContain('INCOMPLETE, not empty')
    })
  })
})
