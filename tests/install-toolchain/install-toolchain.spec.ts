/**
 * tests/install-toolchain/install-toolchain.spec.ts — scripts/install-toolchain.sh.
 *
 * Parallelism class: mockable. Every case owns a scenario workspace and HOME;
 * `node` is a shim reporting a chosen version; nothing is installed and nothing
 * reaches the network.
 *
 * TASK-027 (a2bp request PR #67 from linkedin-watcher-agent, upstream U3).
 * `check` REPORTED NODE OK ON A NODE THAT CANNOT RUN THE HARNESS. The installer
 * restated the requirement as `NODE_MIN_MAJOR="18"` while tests/package.json
 * declares `"node": "^20.19.0 || >=22.12.0"`, a floor that is a security
 * requirement (vitest 4.1.11 is the first release clear of GHSA-82fw-gwwq-j7x9).
 * Reproduced on main by Jesko (QA-2, Codex): a Node 20.0.0 shim passed `check`.
 * A restated requirement is a copy that drifts; the installer reads
 * `engines.node` from the manifest npm itself enforces.
 *
 * A MAJOR-ONLY COMPARISON IS NOT A FIX. Raising the constant to 20 still passes
 * 20.0.0 and 22.0.0, which the range rejects. #1 pins those versions, and 21.x,
 * which sits between the two alternatives.
 *
 * #5 IS THIS REPO'S ADDITION TO THE REQUEST. The request's evaluator treated
 * every caret as "same major", which is npm's rule only above major 0: `^0.10.0`
 * means `>=0.10.0 <0.11.0`, and `^0.0.3` means `=0.0.3`. Jesko's review asked
 * for exact zero-major semantics or a fail-closed refusal; the evaluator
 * implements npm's rule, and #5 is red for both the pre-fix script and the
 * request as filed.
 *
 * HOW THE VERSION IS FAKED. The shim answers `node --version` itself and runs
 * every other invocation through the real node with a preload that overrides
 * `process.version` and `process.versions.node`, so the script's own Node code
 * runs for real and sees the chosen version, however it asks.
 *
 * MUTATION RECORD (R6) — OBSERVED, each mutant applied alone to
 * scripts/install-toolchain.sh on a copy of the tree outside any git tree, this
 * suite run, the file restored. (The request's own header admitted its sets were
 * derived by reading; these were run.)
 *   Pre-fix script (NODE_MIN_MAJOR=18)                    → #1 #2 #3 #4 #5
 *   A  compare the major only                            → #1 #2 #5
 *   B  "cannot tell" counts as a pass                     → #3 #4
 *   C  the range hard-coded instead of read              → #2 #3 #4 #5
 *   D  the caret as filed ("same major")                 → #5
 *   E  no up-front check that every comparator is known  → #4
 *   B FIRST LEFT #4 GREEN, and that is how E exists. The evaluator stopped at the
 *   first failing comparator, so `20 - 22` on Node 24 failed the bare `20` and
 *   never reached `-`: #4 passed as "unsupported" rather than as
 *   "uninterpretable". The evaluator now checks every comparator's form before
 *   evaluating any, and #4 requires the UNVERIFIED verdict.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const SCRIPT = 'scripts/install-toolchain.sh'

/** A PATH whose `node` claims to be `version`. */
async function fakeNode(s: Scenario, version: string): Promise<string> {
  const preload = await s.fs.write(
    `preload-${version}.cjs`,
    `Object.defineProperty(process, 'version', { value: 'v${version}' })\n` +
      `Object.defineProperty(process.versions, 'node', { value: '${version}' })\n`,
  )
  const shims = await s.shimDir(`shims-${version}`)
  await shims.add(
    'node',
    `if [ "$1" = "--version" ]; then echo "v${version}"; exit 0; fi\n` +
      `exec "${process.execPath}" --require "${preload}" "$@"`,
  )
  return shims.path()
}

/** The one line `check` prints about node, or '' if it printed none. */
function nodeLine(output: string): string {
  return output.split('\n').find((l) => /^\s+[✓✗] node\b/.test(l)) ?? ''
}

async function check(s: Scenario, version: string, script = join(REPO_ROOT, SCRIPT)) {
  const r = await s.run('bash', [script, 'check'], {
    cwd: s.workspace.root,
    env: { PATH: await fakeNode(s, version) },
  })
  return { code: r.code, output: r.output, line: nodeLine(r.output) }
}

/** A copy of the script under a root whose tests/package.json this case controls. */
async function copyWithManifest(s: Scenario, tag: string, manifest: string | null): Promise<string> {
  const script = await s.fs.write(
    `${tag}/scripts/install-toolchain.sh`,
    await readFile(join(REPO_ROOT, SCRIPT), 'utf8'),
    { mode: 0o755 },
  )
  if (manifest !== null) await s.fs.write(`${tag}/tests/package.json`, manifest)
  return script
}

const engines = (range: string) => JSON.stringify({ engines: { node: range } })

describe('TASK-027 — check derives the Node requirement from tests/package.json', () => {
  it('#1 a Node inside the old major floor but outside the harness range is REJECTED', async () => {
    await scenario('install-toolchain-1', async (s) => {
      for (const v of ['20.0.0', '22.0.0', '21.7.3', '18.20.4']) {
        const r = await check(s, v)
        expect(r.line, `check accepted node v${v}:\n${r.output}`).toMatch(/✗ node/)
        expect(r.line).toContain(`v${v}`)
        expect(r.code, `a rejected node did not fail check:\n${r.output}`).toBe(1)
      }
      for (const v of ['20.19.0', '22.12.0', '24.1.0']) {
        const r = await check(s, v)
        expect(r.line, `check rejected node v${v}:\n${r.output}`).toMatch(/✓ node v/)
      }
    })
  })

  it('#2 the range is READ from the manifest, not restated in the script', async () => {
    await scenario('install-toolchain-2', async (s) => {
      const script = await copyWithManifest(s, 'root', engines('>=99.0.0'))
      const r = await check(s, '24.1.0', script)
      expect(r.line, `a manifest demanding node 99 was ignored:\n${r.output}`).toMatch(/✗ node/)
      expect(r.output).toContain('>=99.0.0')
      expect(r.code).toBe(1)
    })
  })

  it('#3 a missing tests/package.json is reported, never replaced by a default floor', async () => {
    await scenario('install-toolchain-3', async (s) => {
      const r = await check(s, '24.1.0', await copyWithManifest(s, 'root', null))
      expect(r.line, `no manifest, yet node was declared fit:\n${r.output}`).toMatch(/✗ node/)
      expect(r.output).toContain('tests/package.json')
      expect(r.code).toBe(1)
    })
  })

  it('#4 a range this script cannot interpret is reported, never guessed at', async () => {
    await scenario('install-toolchain-4', async (s) => {
      const script = await copyWithManifest(s, 'root', engines('20 - 22'))
      const r = await check(s, '24.1.0', script)
      expect(r.line, `an uninterpretable range was accepted:\n${r.output}`).toMatch(/✗ node/)
      // The VERDICT, not merely a rejection. Node 24 also fails the bare `20`,
      // and an evaluator that short-circuits on it never parses `-`, so it
      // rejected this range as "unsupported" without ever finding it
      // uninterpretable — and a mutant passing every uninterpretable range left
      // this case green. Observed on the request as filed.
      expect(r.line, `the range was judged, not refused as uninterpretable:\n${r.output}`).toMatch(/UNVERIFIED/)
      expect(r.output).toContain('20 - 22')
      expect(r.code).toBe(1)
    })
  })

  it('#5 a zero-major caret follows npm: ^0.10.0 stops at 0.11, ^0.0.3 is exactly 0.0.3', async () => {
    await scenario('install-toolchain-5', async (s) => {
      const minor = await copyWithManifest(s, 'minor', engines('^0.10.0'))
      const inMinor = await check(s, '0.10.5', minor)
      expect(inMinor.line, `^0.10.0 rejected 0.10.5:\n${inMinor.output}`).toMatch(/✓ node v/)
      const pastMinor = await check(s, '0.11.0', minor)
      expect(pastMinor.line, `^0.10.0 accepted 0.11.0 — a caret below major 1 is not "same major":\n${pastMinor.output}`).toMatch(
        /✗ node/,
      )

      const patch = await copyWithManifest(s, 'patch', engines('^0.0.3'))
      const exact = await check(s, '0.0.3', patch)
      expect(exact.line, `^0.0.3 rejected 0.0.3:\n${exact.output}`).toMatch(/✓ node v/)
      const pastPatch = await check(s, '0.0.4', patch)
      expect(pastPatch.line, `^0.0.3 accepted 0.0.4:\n${pastPatch.output}`).toMatch(/✗ node/)
    })
  })
})
