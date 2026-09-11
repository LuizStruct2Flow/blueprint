/**
 * tests/pre-push-scanners/pre-push-scanners.spec.ts — BUG-003: the pre-push
 * security gate must distinguish "the scanner found something" from "the scanner
 * could not run".
 *
 * Parallelism hazard: none. Each case builds its own fixture repo and its own
 * shim directory inside its own scenario workspace; no real scanner is invoked
 * and no network is touched.
 *
 * THE DEFECT. `semgrep … || { echo "found a WARNING+ finding"; exit 1; }` treated
 * EVERY non-zero exit as a finding. semgrep exits 1 for findings and >= 2 for a
 * fatal error, and `--quiet` suppressed the reason entirely. Observed on this
 * repo: identical back-to-back runs alternating exit 0 and exit 2 with zero
 * output, in both bash and sh, while the same command outside the hook always
 * passed. gitleaks had the same conflation.
 *
 * WHY IT MATTERS IN BOTH DIRECTIONS. A broken scanner reported as a vulnerability
 * teaches operators to shrug off the gate, and that shrug is what carries over to
 * a real finding. A gate that cries wolf is a gate people learn to bypass.
 *
 * WHERE THE §3.3 LINE FALLS — AND THIS SUITE IS WHERE IT MATTERS MOST.
 * TASK-018-TARGET §3.3 rules that the pre-push hook's shell ENTRY POINT stays
 * shell permanently: if the gate were TypeScript and `npm ci` had not run, there
 * would be no gate in precisely the state where one is most wanted, and a
 * TypeScript gate cannot report its own absence. `.githooks/pre-push` is that
 * entry point and IS NOT BEING PORTED. What is ported is the suite that tests it.
 * So every case below runs the REAL hook — copied byte-for-byte into the fixture
 * — under `/bin/sh`, with shim scanners on PATH. Nothing here reimplements a
 * stage in TypeScript, and nothing here skips a case on the grounds that its
 * subject is shell.
 *
 * (`tests/osv-severity` is the one place a stage's LOGIC is lifted out of this
 * hook and driven directly. That is a different question — what the severity
 * policy decides once a scan has run — and it is deliberately not duplicated
 * here, where the question is whether the scanners run at all and cannot be
 * evaded by PATH manipulation.)
 *
 * EQUIVALENCE RECORD (R6). The retiring `tests/pre-push-scanners/test.sh` and this
 * spec were run over the healthy repo plus one mutant of `.githooks/pre-push` per
 * assertion group, and the per-case verdict sets diffed mechanically. Table in the
 * migration report.
 *
 * MUTATION RECIPE (R6), each applied to `.githooks/pre-push`:
 *
 *   M1  `_st_semgrep` classifies by EXIT CODE again (rc=1 -> finding, else ok)
 *       Red: #3, R-3, R2-1a, R2-1b. This is BUG-003 restored.
 *   M2  drop the retry entirely
 *       Red: #3-retry-count, #4, #4b.
 *   M3  the retry keeps `--jobs` at its default
 *       Red: #4b.
 *   M4  `.results` length read with `// 0` instead of a schema check
 *       Red: R2-1b.
 *   M5  a non-zero semgrep exit with zero results is accepted as clean
 *       Red: R2-1a.
 *   M6  the tool-failure branch suppresses the scanner's stderr
 *       Red: #3-diagnostic.
 *   M7  `_st_gitleaks` treats rc >= 2 as a finding
 *       Red: #6.
 *   M8  `_st_gitleaks` retries
 *       Red: #6-no-retry.
 *   M9  the gitleaks finding branch hides the scanner's output
 *       Red: #5.
 *   M10 the semgrep finding branch stops printing the rule id
 *       Red: #2.
 *   M11 remove the osv-scanner shim from the fixture (a FIXTURE mutant, not a
 *       hook one — it is the only way to prove the isolation claim #0 makes)
 *       Red: #0.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

/**
 * The shim-directory handle, derived from the harness rather than re-declared.
 *
 * `tests/harness/index.ts` does not re-export `ShimDir`, and adding a second
 * declaration of it here would be a copy that drifts — the thing R1 deletes.
 * Deriving it from the method's own return type cannot drift by construction.
 */
type ShimDirLike = Awaited<ReturnType<Scenario['shimDir']>>

const HOOK = join(REPO_ROOT, '.githooks/pre-push')

describe('BUG-003 — scanner failures and scanner findings are distinguished', () => {
  it('#0 fixture isolation holds: the shims win PATH over a hostile ambient binary', async () => {
    await scenario('scanners-0', async (s) => {
      // POSITIVE CONTROL for the fixture's own isolation (Slava, R11).
      //
      // EVERY executable the hook can discover must be under fixture control, not
      // just the ones a case asserts on. The hook probes gitleaks, semgrep AND
      // osv-scanner; only the first two were shimmed originally, so every case
      // silently ran the real osv-scanner off the ambient PATH — a claim made
      // from inspection and refuted by experiment.
      //
      // Adding the shim only helps if the shim dir actually WINS resolution. So
      // prove it adversarially: plant a HOSTILE osv-scanner LATER on PATH that,
      // if ever reached, records a sentinel and exits 1. A clean run must stay
      // green AND leave the sentinel untouched.
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['clean'])

      const hostile = await s.shimDir('hostile')
      const sentinel = s.workspace.path('osv-hostile-was-called')
      await hostile.add(
        'osv-scanner',
        `: >${JSON.stringify(sentinel)}\necho HOSTILE-OSV-REACHED >&2\nexit 1`,
      )

      // Shim dir first, hostile SECOND, real ambient PATH last.
      const r = await f.runHook({ path: `${f.shims.dir}:${hostile.path()}` })

      expect(r.code, `a hostile ambient osv-scanner decided this run\n${r.output}`).toBe(0)
      expect(
        await s.fs.exists('osv-hostile-was-called'),
        'the hostile binary was reachable — the fixture no longer isolates the SCA probe',
      ).toBe(false)
    })
  })

  it('#1 clean scanners → the gate passes', async () => {
    await scenario('scanners-1', async (s) => {
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['clean'])

      const r = await f.runHook()

      expect(r.code, `clean scanners should pass\n${r.output}`).toBe(0)
    })
  })

  it('#2 a semgrep JSON finding blocks, shows the rule, and is not retried', async () => {
    await scenario('scanners-2', async (s) => {
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['finding'])

      const r = await f.runHook()

      expect(r.code, `a JSON result must block\n${r.output}`).not.toBe(0)
      expect(r.output, 'a finding was not labelled a finding').toContain('WARNING+ finding')
      expect(r.output, 'a finding was labelled a tool failure').not.toContain('could not complete')
      expect(r.output, 'the finding blocked but the rule id was not shown').toContain('demo.rule')
      // A real finding is deterministic. Retrying it doubles the slowest stage in
      // the gate for nothing.
      expect(await f.calls('semgrep'), 'a real finding was retried').toBe(1)
    })
  })

  it('#3 a semgrep crash (exit 2) blocks as a TOOL FAILURE, retries once, and surfaces the diagnostic', async () => {
    await scenario('scanners-3', async (s) => {
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['crash2', 'crash2'])

      const r = await f.runHook()

      expect(r.code, `a semgrep tool error must block\n${r.output}`).not.toBe(0)
      expect(r.output, 'a crash was not reported as a scan that did not run').toContain('did NOT run')
      expect(
        r.output,
        'a semgrep tool error was reported as a security finding — the BUG-003 conflation',
      ).not.toContain('WARNING+ finding')
      expect(await f.calls('semgrep'), 'expected exactly 1 call + 1 retry').toBe(2)
      expect(
        r.output,
        'the tool-failure path hid the scanner’s own diagnostic — which is what made the gate untrustworthy in the first place',
      ).toContain('SEMGREP-CRASH-DIAG')
    })
  })

  it('R-3 semgrep exit 1 with NO valid JSON is a tool failure, not a finding', async () => {
    await scenario('scanners-r3', async (s) => {
      // An OSError BEFORE the scan — an unwritable `~/.semgrep` settings dir,
      // observed in review. The exit-code classifier said "exit 1 = finding", so
      // it reported a crash as a vulnerability. Findings must come from semgrep's
      // JSON `results`, which an OSError never produces.
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['oserror', 'oserror'])

      const r = await f.runHook()

      expect(r.code, r.output).not.toBe(0)
      expect(r.output).toContain('did NOT run')
      expect(r.output, 'an OSError was misclassified as a finding').not.toContain('WARNING+ finding')
    })
  })

  it('#4 a transient semgrep failure retries once and passes', async () => {
    await scenario('scanners-4', async (s) => {
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['crash2', 'clean'])

      const r = await f.runHook()

      expect(r.code, `a transient semgrep failure should recover\n${r.output}`).toBe(0)
      expect(r.output, 'it recovered silently — the operator cannot tell a retry happened').toContain(
        'retrying',
      )
      expect(await f.calls('semgrep'), 'transient recovery must use exactly one retry').toBe(2)
    })
  })

  it('#4b the retry drops to --jobs 1 and recovers a parallel-only crash', async () => {
    await scenario('scanners-4b', async (s) => {
      // Mirrors the real failure: semgrep's multi-core engine crashes on
      // `io_uring_queue_init` under a low RLIMIT_MEMLOCK, and `--jobs 1` avoids
      // it. A shim that fails UNLESS invoked single-job passes only if the retry
      // actually dropped parallelism — which pins the CLAIM, not just "it
      // retried".
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.shims.add(
        'semgrep',
        `case " $* " in\n` +
          `  *" --jobs 1 "*) printf '{"version":"1","results":[],"errors":[]}\\n'; exit 0 ;;\n` +
          `esac\n` +
          `echo "SEMGREP-CRASH-DIAG (simulated io_uring)" >&2\n` +
          `printf '{"version":"1","results":[],"errors":[{"level":"error"}]}\\n'\n` +
          `exit 2`,
      )

      const r = await f.runHook()

      // The hook hides scanner stdout on success by design, so the claim is proven
      // through the exit code plus the hook's own message, not the shim's output.
      expect(r.code, `the retry did not recover a parallel-only failure\n${r.output}`).toBe(0)
      expect(r.output, 'the retry did not drop to single-job').toContain('retrying single-job')
    })
  })

  it('R2-1a valid JSON + zero results + non-zero exit is NOT a proven clean scan', async () => {
    await scenario('scanners-r21a', async (s) => {
      // exit 1 is not semgrep's clean exit, so "0 results" cannot be trusted.
      // Classify as incomplete, never clean (Codex R2-1).
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['err1json', 'err1json'])

      const r = await f.runHook()

      expect(r.code, `exit 1 with 0 results was waved through as clean\n${r.output}`).not.toBe(0)
      expect(r.output).toContain('did NOT run')
      expect(r.output).not.toContain('WARNING+ finding')
    })
  })

  it('R2-1b valid JSON whose .results is not an array is incomplete, not zero findings', async () => {
    await scenario('scanners-r21b', async (s) => {
      // The `|| echo 0` fail-open. Exit 0 here proves it is caught by schema
      // validation, independent of the exit code.
      const f = await fixture(s)
      await f.gitleaks([0])
      await f.semgrep(['badschema', 'badschema'])

      const r = await f.runHook()

      expect(r.code, `a malformed results schema was treated as zero findings\n${r.output}`).not.toBe(0)
      expect(r.output).toContain('did NOT run')
      expect(r.output).not.toContain('WARNING+ finding')
    })
  })

  it('#5 gitleaks exit 1 blocks as a SECRET, with its output shown', async () => {
    await scenario('scanners-5', async (s) => {
      const f = await fixture(s)
      await f.gitleaks([1])
      await f.semgrep(['clean'])

      const r = await f.runHook()

      expect(r.code, `gitleaks exit 1 must block\n${r.output}`).not.toBe(0)
      expect(r.output, 'a secret was not labelled a secret').toContain('found a secret')
      expect(r.output, 'a secret was labelled a tool failure').not.toContain('could not complete')
      // BUG-003's diagnosis was that suppressed diagnostics made the gate
      // untrustworthy, so classification alone is not enough to pin.
      expect(r.output, 'it blocked but hid the scanner output').toContain('SIMULATED-FINDING')
    })
  })

  it('#6 gitleaks exit 2 blocks as a TOOL FAILURE and is NOT retried', async () => {
    await scenario('scanners-6', async (s) => {
      // gitleaks is classified but deliberately NOT retried — its failures are
      // local and deterministic (bad config, unreadable repo), unlike semgrep's
      // registry fetch. Claiming an "identical fix" for both overstated parity.
      const f = await fixture(s)
      await f.gitleaks([2])
      await f.semgrep(['clean'])

      const r = await f.runHook()

      expect(r.code, r.output).not.toBe(0)
      expect(r.output, 'a gitleaks tool error was reported as a secret').not.toContain('found a secret')
      expect(r.output).toContain('gitleaks could not complete')
      expect(r.output, 'the tool-failure path hid the diagnostic output').toContain('shim gitleaks call')
      expect(await f.calls('gitleaks'), 'gitleaks was retried; no retry is intended').toBe(1)
    })
  })
})

// ---------------------------------------------------------------------------
// The fixture: a repo the hook can run in and exit quickly.
//
// No backend/ or frontend/, no pre-push-project, no IaC — so the hook reaches the
// scanner section and then falls straight through. Shims make the scanners
// instant and deterministic rather than waiting for a flake to recur.
// ---------------------------------------------------------------------------

interface ScannerFixture {
  readonly dir: string
  readonly shims: ShimDirLike
  /** A shim whose Nth call exits with `codes[N-1]`; the last code repeats. */
  gitleaks(codes: number[]): Promise<void>
  /** A semgrep shim playing one MODE per call; the last mode repeats. */
  semgrep(modes: SemgrepMode[]): Promise<void>
  /** How many times a shim was invoked. */
  calls(name: string): Promise<number>
  runHook(options?: { path?: string }): Promise<{ code: number | null; output: string }>
}

type SemgrepMode = 'clean' | 'finding' | 'crash2' | 'err1json' | 'badschema' | 'oserror'

async function fixture(s: Scenario): Promise<ScannerFixture> {
  const repo = await s.gitRepo('repo')
  const shims = await s.shimDir('bin')
  const callsDir = await s.workspace.dir('calls')

  await s.fs.copyIn(HOOK, 'repo/.githooks/pre-push')
  await s.fs.chmod('repo/.githooks/pre-push', 0o755)

  // FEATURE-002: the hook sources the pipeline renderer, and a missing renderer
  // fails the push CLOSED — deliberately. Leaving it out of the fixture turns
  // every case into "the hook could not start", which is what happened when this
  // was first wired: seventeen assertions failed for one missing file.
  await s.fs.copyIn(join(REPO_ROOT, 'scripts/lib/pipeline.sh'), 'repo/scripts/lib/pipeline.sh')
  await s.fs.write('repo/.claude/settings.json', '{\n  "permissions": {\n    "allow": []\n  }\n}\n')

  // A NEUTRAL osv-scanner, EMITTING WHAT A CLEAN SCAN ACTUALLY LOOKS LIKE.
  // It used to be a bare `exit 0`, which was faithful while the stage judged
  // osv-scanner by its exit code alone. BUG-045 made the stage read
  // `--format=json` and apply CI's MEDIUM+ threshold, so a scan that prints
  // nothing is now — correctly — a TOOL FAILURE: "trust an empty document" is the
  // fail-open the new stage refuses. This is the shim catching up with the
  // contract, not a weakened assertion.
  await shims.add('osv-scanner', `echo '{"results":[]}'\nexit 0`)

  const counted = (name: string, decide: string): string =>
    `CALLS=${JSON.stringify(join(callsDir, name))}\n` +
    `n=$(cat "$CALLS" 2>/dev/null || echo 0)\n` +
    `n=$((n+1))\n` +
    `echo "$n" >"$CALLS"\n` +
    decide

  return {
    dir: repo.dir,
    shims,

    async gitleaks(codes: number[]): Promise<void> {
      await shims.add(
        'gitleaks',
        counted(
          'gitleaks',
          `case "$n" in\n${pick(codes, (c) => `code=${c}`)}\nesac\n` +
            `echo "shim gitleaks call $n exiting $code"\n` +
            `[ "$code" = "1" ] && echo "SIMULATED-FINDING"\n` +
            `exit "$code"`,
        ),
      )
    },

    async semgrep(modes: SemgrepMode[]): Promise<void> {
      await shims.add(
        'semgrep',
        counted(
          'semgrep',
          `case "$n" in\n${pick(modes, (m) => `mode=${m}`)}\nesac\n` + SEMGREP_MODES,
        ),
      )
    },

    async calls(name: string): Promise<number> {
      try {
        return Number((await readFile(join(callsDir, name), 'utf8')).trim())
      } catch {
        return 0
      }
    },

    async runHook(options: { path?: string } = {}) {
      const r = await s.run('sh', ['.githooks/pre-push'], {
        cwd: repo.dir,
        env: { PATH: options.path ?? shims.path() },
        timeoutMs: 120_000,
      })
      return { code: r.code, output: r.output }
    },
  }
}

/**
 * A `case` body selecting the Nth element, with the LAST one repeating.
 *
 * Generated as a `case` rather than the shell suite's `set -- … ; eval` because
 * the eval form captured `$#` at heredoc-write time, not at shim runtime — which
 * is why that suite needed a separate, uncounted osv-scanner shim to sidestep its
 * own repeat branch. A `case` has no such hazard and reads as what it does.
 */
function pick<T>(values: T[], render: (v: T) => string): string {
  const last = values[values.length - 1]
  if (last === undefined) throw new Error('pick(): needs at least one value')
  const arms = values
    .slice(0, -1)
    .map((v, i) => `  ${i + 1}) ${render(v)} ;;`)
    .join('\n')
  return `${arms}${arms ? '\n' : ''}  *) ${render(last)} ;;`
}

/**
 * The payloads, in the shapes the real tool emits. The hook classifies from
 * semgrep's `--json` output, so the SHAPE is the fixture — an exit code alone
 * cannot express the distinctions R2-1a and R2-1b are about.
 */
const SEMGREP_MODES = `case "$mode" in
  clean)     printf '{"version":"1","results":[],"errors":[]}\\n'; exit 0 ;;
  finding)   printf '{"version":"1","results":[{"check_id":"demo.rule","path":"x.py","start":{"line":7}}],"errors":[]}\\n'; exit 1 ;;
  crash2)    echo "SEMGREP-CRASH-DIAG (simulated io_uring)" >&2; printf '{"version":"1","results":[],"errors":[{"level":"error"}]}\\n'; exit 2 ;;
  err1json)  echo "SEMGREP-CRASH-DIAG (error, exit 1, valid JSON)" >&2; printf '{"version":"1","results":[],"errors":[{"level":"error"}]}\\n'; exit 1 ;;
  badschema) printf '{"version":"1","results":"not-an-array"}\\n'; exit 0 ;;
  oserror)   echo "Traceback (most recent call last):" >&2; echo "PermissionError: settings.yml" >&2; exit 1 ;;
esac`
