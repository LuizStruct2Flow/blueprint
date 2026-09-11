/**
 * tests/ts-bridge/ts-bridge.spec.ts — BUG-055: the vitest bridge could not run
 * under a real `git push`, and when it failed it said NOTHING.
 *
 * Parallelism hazard: none. Each case builds its own fixture project and its own
 * stub `npx` inside its own scenario workspace. No real vitest is invoked from
 * inside these cases — which is the point, and also the subject of the honest
 * limits section below.
 *
 * TWO DEFECTS in `scripts/run-ts-suites.sh`, found because a push was refused with
 * no explanation and the gate's own log simply stopped mid-list:
 *
 *   1. git exports GIT_DIR when it invokes a hook. The TS harness refuses to run
 *      any scenario while that variable is present (`tests/harness/env.ts`,
 *      `assertProcessEnvClean`) and that refusal is CORRECT — it is the
 *      BUG-046/BUG-047 guard. Together those two facts meant every TS suite failed
 *      under a push and passed by hand. The shell suites have scrubbed git's
 *      environment since BUG-014; the TS path never got the equivalent.
 *   2. The runner was invoked as `( … ) >/dev/null 2>&1` with `_ts_rc=$?` on the
 *      following line, inside a hook that runs `set -e`. The assignment is
 *      unreachable on the only path where it matters, so a failing runner killed
 *      the hook before any stage printed: no stage line, no summary, no error. A
 *      broken run and a missing one were indistinguishable, which is BUG-005 in
 *      the stage built to report BUG-005.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS SPEC CAN AND CANNOT PROVE — read this before trusting it.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a TypeScript spec, run BY vitest, testing the shell bridge whose job is
 * to run vitest. The circularity is real and it is not resolved by being careful.
 *
 * WHAT IT PROVES, and the coverage here is essentially complete in CONTENT.
 * Every case drives a COPY of `scripts/run-ts-suites.sh` inside a fixture project,
 * against a STUB `npx`. So each assertion is about the bridge's logic over inputs
 * this spec constructs, and none of them depends on the real bridge being correct
 * — only on vitest currently working well enough to execute this file. The
 * environment scrub, the rendering, the survival of a non-zero declared-suites
 * status, and the visibility of a failing runner are all genuinely pinned.
 *
 * WHAT IT CANNOT PROVE, stated as three specific properties rather than a vague
 * caveat:
 *
 *   (a) THAT A REGRESSION OF BUG-055 WOULD BE REPORTED. If the real bridge dies
 *       silently again, this spec does not run at all — so it produces no red
 *       case. The failure mode BUG-055 actually had (an absence, not an error) is
 *       precisely the one an absent test cannot report.
 *   (b) THAT THE BRIDGE CAN START VITEST IN THIS REPO. The `npx`-missing and
 *       `tests/node_modules`-missing guards BLOCK rather than skip, which is the
 *       right shape; but if either misfired, the specs would not run and this file
 *       could not say so.
 *   (c) THE NO-TOOLCHAIN PROPERTY. `tests/manifest`'s retiring shell version
 *       re-ran itself with node/npm/npx/tsc/vitest poisoned and asserted it
 *       invoked none of them, so a project with no toolchain still got a truthful
 *       answer out of its own coverage control. No vitest spec can assert that
 *       about itself. Its migration recorded the same loss, in the same words.
 *
 * THE PARTIAL MITIGATION THAT DOES EXIST, and it is worth knowing about because it
 * shrinks (a) considerably. `tests/bootstrap-gate` #2/#3 bootstraps a project and
 * runs its ENTIRE pre-push gate as a subprocess, then asserts the gate reported at
 * least 25 stages. A bridge that died silently inside that inner gate would
 * truncate the stage list and turn that case red. So a silent bridge death IS
 * observable from outside — by an outer vitest run watching an inner gate. What
 * remains unobservable is only a failure that takes down the OUTER run too.
 *
 * THE RESIDUE IS TASK-023, NOT AN INVENTION HERE. Closing (a) and (c) properly
 * needs an assertion executed by something that is not vitest. That is already
 * rowed and founder-pending as TASK-023, and it is deliberately NOT worked around
 * here: inventing a second runner kind on one agent's authority is how a test
 * stack acquires the exemption R5 spent a day removing.
 *
 * WHERE THE §3.3 LINE FALLS. `scripts/run-ts-suites.sh` is sourced by
 * `.githooks/pre-push-project`, on the shell side of the boundary
 * TASK-018-TARGET §3.3 draws — and it has to be, for exactly §3.3's reason: it is
 * the code that discovers `npx` and `tests/node_modules` are absent, which is a
 * report a TypeScript program cannot make about its own missing toolchain. It is
 * not ported. The suite is.
 *
 * ONE IMPROVEMENT OVER THE SHELL VERSION WORTH NAMING, because it deletes a whole
 * bug class. #1c cross-checks the scrub against the harness's own `FORBIDDEN_ENV`.
 * The shell suite did that by `sed`-parsing `tests/harness/env.ts`, and BUG-063 is
 * what happened when the declaration changed shape: the pattern matched nothing,
 * the case failed as "could not read", and it took the push gate with it. Here the
 * list is IMPORTED. A parser that can go stale is replaced by a reference that
 * cannot, and the mirrored "skip 'inert'" rule the shell had to restate is gone
 * with it.
 *
 * The shell version also keyed #1c on `.blueprint-root`, on the premise that
 * `tests/harness/` is blueprint-tier and does not ship. That premise is stale:
 * `.gitattributes` carries no `tests/harness/ export-ignore` line, so the harness
 * DOES ship and the case would have run downstream anyway. The keying was
 * disarming a check that needed no disarming. Dropped, not ported.
 *
 * EQUIVALENCE RECORD (R6). The retiring `tests/ts-bridge/test.sh` and this spec
 * were run over the healthy repo plus one mutant of `scripts/run-ts-suites.sh` per
 * assertion, and the per-case verdict sets diffed mechanically. Table in the
 * migration report.
 *
 * Two deliberate divergences, both this spec being stronger:
 *
 *   * BUG-080 — `grep demo` is satisfied by `pipe_batch_end`'s "declared but
 *     never reported: demo" refusal, so the shell suite's #1b and #2c pass with
 *     per-suite reporting DELETED. Asserted here on a rendered stage line.
 *   * The `| floor` requirement had NO case at all. The bridge's own comment
 *     records that it was "caught by running the bridge rather than by reading
 *     it", and then nothing pinned it; #1e does.
 *
 * MUTATION RECIPE (R6), each applied to `scripts/run-ts-suites.sh`:
 *
 *   M1  delete the `for _v in $(env | sed …); do unset "$_v"; done` scrub
 *       Red: #1, #1c.
 *   M2  scrub GIT_* only (the first fix, which left AGENT_* inherited and made
 *       the real push fail again, identically and just as silently)
 *       Red: #1, #1c.
 *   M3  restore `( … ) >/dev/null 2>&1` with `_ts_rc=$?` on the next line
 *       Red: #2, #2b, #2c.
 *   M4  drop the `|| _ts_declrc=$?` guard on the declared-suites call
 *       Red: #1d.
 *   M5  delete the `if [ "$_ts_rc" -ne 0 ]` reporting block
 *       Red: #2b.
 *   M6  drop `pipe_stage_report` (report nothing per suite)
 *       Red: #1b, #1d, #1e, #2c — but ONLY since those stopped grepping for the
 *       bare suite name. That is BUG-080: `pipe_batch_end` refuses the batch with
 *       "declared but never reported: demo", so a name grep is satisfied by the
 *       message saying the suite was NEVER reported. Survives the shell suite.
 *   M7  remove the `| floor` from the duration jq (durations render 0.0s)
 *       Red: #1e.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'
import { FORBIDDEN_ENV } from '../harness/env.js'

/**
 * A RENDERED STAGE LINE for `demo`, not merely the word "demo".
 *
 * BUG-080, and it is the reason this constant exists rather than a bare
 * `toContain('demo')`. When `pipe_stage_report` is deleted from the bridge,
 * `pipe_batch_end` refuses the batch with `declared but never reported: demo` —
 * a message that CONTAINS the suite name. So an assertion that greps for the
 * name is satisfied by the error saying the suite was never reported, which is
 * the exact opposite of the property. Measured: that mutant survives the
 * retiring shell suite's #1b and #2c.
 *
 * `pipeline.sh` renders a result as `│ ✓ <label>  <dur>` / `│ ✗ <label> …`, so a
 * status marker immediately before the name is what distinguishes a reported
 * stage from a complaint about a missing one.
 */
const STAGE_LINE = /[✓✗]\s+demo\s/

describe('BUG-055 — the vitest bridge scrubs git’s environment and reports its own failures', () => {
  it('#0 the fixture declares a suite that owns a spec', async () => {
    await scenario('tsbridge-0', async (s) => {
      // Without this the cases below assert nothing about a real declared
      // suite.
      //
      // CORRECTED BY MEASUREMENT (R6 second pass). This comment used to say they
      // would "pass vacuously — `ts_suites_stage` skips outright when no suite
      // owns a spec, and a skip is green". They do not: a mutant blinding the
      // spec discovery turns #1, #1b, #1c, #1e, #2, #2b and #2c RED. The fixture
      // claim this case makes is true and the case is non-vacuous; the stated
      // consequence of its absence was not.
      const f = await fixture(s)

      const r = await s.run(
        'sh',
        [
          await s.fs.write(
            'declared.sh',
            `. ${JSON.stringify(join(f.dir, 'scripts/lib/suites.sh'))}\n` +
              `bp_suites_with_spec ${JSON.stringify(f.dir)}\n`,
          ),
        ],
        { cwd: f.dir },
      )

      expect(r.stdout.trim().split('\n').filter(Boolean), r.output).toEqual(['demo'])
    })
  })

  it('#1/#1c the runner sees no GIT_* or AGENT_* variable, and none from the harness’s own forbidden set', async () => {
    await scenario('tsbridge-1', async (s) => {
      // The harness refuses every scenario while any of these is set, so without
      // the scrub the whole TS stage fails under a real push while passing by
      // hand. #1c is asserted on the same run: it is a property of the same
      // recorded environment, and a second bridge invocation would prove nothing
      // more.
      const f = await fixture(s)
      await f.npx(0)

      const r = await f.runBridge()

      const seen = await f.seenEnv()
      expect(seen, `the runner was never invoked at all\n${r.output}`).not.toBeNull()
      expect(
        seen?.names ?? [],
        'the runner inherited these — the harness refuses every scenario while any is set',
      ).toEqual([])

      // #1c — the scrub must cover the harness's ENTIRE forbidden set, not a
      // remembered subset. IMPORTED rather than parsed: BUG-063 was a `sed` range
      // that stopped matching after a legal refactor, so the check began passing
      // over nothing and then failed as "could not read", taking the push with it.
      expect(FORBIDDEN_ENV.length, 'the harness declares no forbidden names — #1c would be vacuous').toBeGreaterThan(
        0,
      )
      for (const name of FORBIDDEN_ENV) {
        expect(seen?.names ?? [], `${name} reached the runner`).not.toContain(name)
      }
      // And every name in that set IS in the namespace the bridge scrubs by
      // prefix. The bridge deliberately does not restate the list (a second copy
      // drifts); this is what makes the prefix sufficient rather than assumed.
      for (const name of FORBIDDEN_ENV) {
        expect(name, `${name} is outside the GIT_*/AGENT_* prefixes the bridge scrubs`).toMatch(
          /^(GIT|AGENT)_/,
        )
      }
    })
  })

  it('#1b the declared suite renders as its own stage', async () => {
    await scenario('tsbridge-1b', async (s) => {
      // The stage must actually RENDER, not merely run: `bootstrap-gate` #3 counts
      // stages as its non-vacuity guard, and the SLO's slowest-stage line has to
      // name something actionable. "slowest: vitest 200s" names nothing.
      const f = await fixture(s)
      await f.npx(0)

      const r = await f.runBridge()

      expect(r.output, `the suite ran but produced no stage line\n${r.output}`).toMatch(STAGE_LINE)
    })
  })

  it('#1e a stage duration renders as a real number, not 0.0s', async () => {
    await scenario('tsbridge-1e', async (s) => {
      // `| floor` in the duration jq is REQUIRED, not tidiness: vitest reports
      // endTime as a float, so the subtraction yields a float,
      // `pipe_stage_report` rejects a non-integer, and the guard substitutes 0 —
      // every stage rendering 0.0s while the SLO's slowest-stage line named
      // nothing. The stub reports fractional times for exactly that reason.
      const f = await fixture(s)
      await f.npx(0)

      const r = await f.runBridge()

      // The stub reports ~1399.9 ms of suite time. Floored that is 1399 ms and
      // renders "1.3s"; coerced to 0 by the non-integer guard it renders "0.0s".
      // The magnitude is chosen so the two are DISTINGUISHABLE — an 80 ms
      // duration renders 0.0s either way, which is how the first version of this
      // case failed to test anything (measured, not reasoned).
      expect(r.output, `the duration collapsed to zero\n${r.output}`).not.toMatch(/demo\s+0\.0s/)
      expect(r.output, `no non-zero duration rendered at all\n${r.output}`).toMatch(/demo\s+1\.\ds/)
    })
  })

  it('#1d a non-zero declared-suites status does not abort the stage under set -e', async () => {
    await scenario('tsbridge-1d', async (s) => {
      // THE DEFECT ITSELF. `bp_suites_with_spec` returned 1 with a correct
      // four-suite list, the caller's unprotected `_ts_expect="$(…)"` inherited
      // that status, and `set -e` destroyed the hook between two statements — no
      // stage, no skip, no summary, no error, and a push refused with nothing to
      // read. Eight pushes to find, because the failure rendered as an absence.
      //
      // The status is INJECTED rather than coaxed out of the manifest parser.
      // Reproducing it through the fixture depends on which suite happens to sort
      // last and on internals of `bp_suites_with_spec`, so it would silently stop
      // reproducing the moment either changed and the case would go green while
      // guarding nothing. What the bridge must survive is a non-zero status from
      // that call, whatever produces it.
      //
      // The assertion is deliberately about the CONSEQUENCE (the stage still
      // reports) rather than about how the status is masked, so a future rewrite
      // of the masking cannot pass this by accident.
      const f = await fixture(s)
      await f.npx(0)

      const r = await f.runBridge({
        inject: `ts_declared_suites(){ printf 'demo\\n'; return 1; }\n`,
      })

      expect(
        r.output,
        `the stage did not survive a non-zero declared-suites status — the exact silent death that refused the push\n${r.output}`,
      ).toMatch(STAGE_LINE)
    })
  })

  it('#2/#2b/#2c a failing runner is visible, names the failure, and still reaches per-suite reporting', async () => {
    await scenario('tsbridge-2', async (s) => {
      // The half that cost the diagnosis. Under `set -e` the old form aborted the
      // caller before the status could be read, so the gate's output simply
      // stopped and the push was refused with nothing to go on.
      //
      // NOT wrapped in a tolerant construct. A `|| true` around the invocation
      // would put the whole thing in a tested context, which disables `set -e` for
      // everything inside it — and `set -e` is the mechanism under test. Written
      // that way first, and this case then passed against the unfixed bridge, i.e.
      // asserted nothing. Here the driver runs as its own process and its status
      // is simply read afterwards.
      const f = await fixture(s)
      await f.npx(1)

      const r = await f.runBridge()

      expect(
        r.output.trim(),
        'the runner failed and the bridge printed NOTHING — a broken run is indistinguishable from a stage that does not exist',
      ).not.toBe('')
      // #2b — the output must NAME the runner failure and its status.
      expect(r.output, `the run failed but nothing said so\n${r.output}`).toMatch(/vitest failed/i)
      // #2c — the stage must still REACH its reconciliation. Under the old form
      // `set -e` aborted at the failing subshell, so `pipe_batch_end` never ran
      // and the gate stopped printing — which is how this presented: a refused
      // push with the stage list truncated mid-way and no error anywhere.
      expect(
        r.output,
        `the bridge aborted before reporting any suite — the silent truncation that made a refused push unexplainable\n${r.output}`,
      ).toMatch(STAGE_LINE)
    })
  })
})

// ---------------------------------------------------------------------------
// The fixture: a project the bridge will accept.
//
// It needs a `tests/vitest.config.ts`, one suite directory holding a `*.spec.ts`,
// `tests/node_modules`, and the two libs the bridge sources.
//
// THERE IS NO SUITES.md TO BUILD (TASK-020). The bridge's expected set used to
// come from that table and now comes from the filesystem (R1), so the FIXTURE IS
// THE DECLARATION: creating `tests/demo/demo.spec.ts` is what makes `demo` a
// declared suite.
// ---------------------------------------------------------------------------

interface BridgeFixture {
  readonly dir: string
  /** A stub `npx` that records the environment it was handed, then exits `code`. */
  npx(code: number): Promise<void>
  /** The GIT_ / AGENT_ prefixed names the stub saw, or null if it never ran. */
  seenEnv(): Promise<{ names: string[] } | null>
  runBridge(options?: { inject?: string }): Promise<{ code: number | null; output: string }>
}

async function fixture(s: Scenario): Promise<BridgeFixture> {
  const dir = await s.workspace.dir('proj')
  const shims = await s.shimDir('bin')
  const seenPath = s.workspace.path('seen-env')

  for (const lib of ['scripts/lib/pipeline.sh', 'scripts/lib/suites.sh', 'scripts/run-ts-suites.sh']) {
    await s.fs.copyIn(join(REPO_ROOT, lib), `proj/${lib}`)
  }
  await s.fs.write('proj/tests/vitest.config.ts', '')
  await s.fs.write('proj/tests/demo/demo.spec.ts', '')
  // `tests/node_modules` STANDS IN FOR AN INSTALLED PROJECT. The bridge refuses
  // to run when it is absent, because `npx` answers a missing local vitest by
  // FETCHING one from the registry — an unpinned package installed mid-push, past
  // the lockfile that exists to pin it. Every case here is about what the bridge
  // REPORTS once it runs, and npx is stubbed anyway, so without this directory
  // they would all short-circuit on that guard and assert nothing. An empty
  // directory is exactly the right fidelity: it is the condition the guard tests,
  // and this fixture never resolves a real binary.
  await s.fs.mkdirp('proj/tests/node_modules')

  // A SECOND SUITE THAT OWNS NO SPEC, SORTING LAST.
  //
  // `bp_suites_with_spec` used to end its loop on a `find` test, so the LAST suite
  // decided the function's exit status: a final suite without a spec made it
  // return 1 while printing a perfectly correct list — "harmless to the one caller
  // that reads it through `$( )`", except that caller runs under `set -e`, where
  // it was fatal (BUG-055). The first version of this fixture had `demo` alone, so
  // the function returned 0 and every case passed while the real gate died on the
  // real manifest. A fixture that cannot produce the failing input is not a
  // fixture for it. `nospec` sorts after `demo`, which is what puts it last.
  await s.fs.write('proj/tests/nospec/test.sh', '')

  return {
    dir,

    async npx(code: number): Promise<void> {
      // The recording path is HARD-CODED rather than passed through the
      // environment: the bridge unsets every GIT_*/AGENT_* name before invoking
      // the runner, which is the behaviour under test, so a variable is exactly
      // the wrong channel for telling the stub where to write.
      await shims.add(
        'npx',
        `env | sed -nE 's/^((GIT|AGENT)_[A-Za-z0-9_]*)=.*/\\1/p' | sort > ${JSON.stringify(seenPath)}\n` +
          `printf 'ran\\n' >> ${JSON.stringify(seenPath)}\n` +
          `echo "stub npx: pretending to be vitest"\n` +
          `for a in "$@"; do\n` +
          `  case "$a" in --outputFile=*) out="\${a#--outputFile=}" ;; esac\n` +
          `done\n` +
          // Fractional startTime/endTime, as vitest really reports them — that is
          // what #1e exists for.
          `[ -n "\${out:-}" ] && cat > "$out" <<'JSON'\n` +
          `{"testResults":[{"name":"/tests/demo/demo.spec.ts","status":"passed","startTime":100.5,"endTime":1500.4248}]}\n` +
          `JSON\n` +
          `exit ${code}`,
      )
      await s.fs.rm('seen-env')
    },

    async seenEnv() {
      try {
        const lines = (await readFile(seenPath, 'utf8')).split('\n').filter(Boolean)
        return { names: lines.filter((l) => l !== 'ran') }
      } catch {
        return null
      }
    },

    async runBridge(options: { inject?: string } = {}) {
      // The environment a real hook is handed — everything git and the gate
      // actually export. The first version of this case set GIT_DIR alone, so it
      // passed a fix that unset four git names and left AGENT_* inherited, and the
      // real push failed again, identically and just as silently. One variable is
      // not a population.
      //
      // Set INSIDE the driver, not through the scenario env, for two reasons: it
      // is what a hook does, and the harness would otherwise — correctly — refuse
      // to hand a child the very variables this case exists to plant. Every decoy
      // points inside the workspace, so nothing can escape even if the scrub
      // fails, and AGENT_FEED_TAG keeps this scenario's escape token so a leak
      // stays attributable (BUG-062).
      const driver = await s.fs.write(
        'run-bridge.sh',
        `cd ${JSON.stringify(dir)}\n` +
          `PATH=${JSON.stringify(shims.path())}\n` +
          `export PATH\n` +
          `GIT_DIR=${JSON.stringify(join(dir, '.git-decoy'))}\n` +
          `GIT_INDEX_FILE=${JSON.stringify(join(dir, '.git-decoy/index'))}\n` +
          `GIT_CONFIG_GLOBAL=${JSON.stringify(join(dir, '.gitconfig-decoy'))}\n` +
          `AGENT_FEED_TAG=${JSON.stringify(`${s.escapeToken}-GATE`)}\n` +
          `AGENT_SIGNAL_FILE=${JSON.stringify(join(dir, 'decoy-signal.md'))}\n` +
          `AGENT_STATE_HOME=${JSON.stringify(join(dir, 'decoy-state'))}\n` +
          `export GIT_DIR GIT_INDEX_FILE GIT_CONFIG_GLOBAL AGENT_FEED_TAG AGENT_SIGNAL_FILE AGENT_STATE_HOME\n` +
          `set -e\n` +
          `. ./scripts/lib/pipeline.sh\n` +
          `pipe_init 'ts-bridge fixture' >/dev/null 2>&1 || true\n` +
          `. ./scripts/run-ts-suites.sh\n` +
          (options.inject ?? '') +
          `ts_suites_stage ${JSON.stringify(dir)}\n`,
      )
      const r = await s.run('sh', [driver], { cwd: dir, timeoutMs: 120_000 })
      return { code: r.code, output: r.output }
    },
  }
}
