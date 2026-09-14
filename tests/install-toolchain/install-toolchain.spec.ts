/**
 * tests/install-toolchain/install-toolchain.spec.ts — TASK-005 (upstream U3).
 *
 * Parallelism class: mockable (each case owns a scenario workspace; `node` is a
 * shim that reports a chosen version, nothing is installed, no network).
 *
 * `install-toolchain.sh check` REPORTED NODE OK ON A NODE THAT CANNOT RUN THE
 * HARNESS. It restated the requirement as `NODE_MIN_MAJOR="18"` while
 * tests/package.json declares `"node": "^20.19.0 || >=22.12.0"` — a floor that
 * is a security requirement (vitest 4.1.11 is the first release clear of
 * GHSA-82fw-gwwq-j7x9), not a preference. So Node 20.0 passed `check` and then
 * could not `npm ci` the harness. A restated requirement is a copy that drifts;
 * the fix reads `engines.node` from the manifest npm itself enforces.
 *
 * A MAJOR-ONLY COMPARISON IS NOT A FIX. Raising the constant to 20 still passes
 * 20.0.0 and 22.0.0, both of which the range rejects — #1 pins those exact
 * versions for that reason, and 21.x, which sits between the two alternatives.
 *
 * HOW THE VERSION IS FAKED. The shim answers `node --version` itself and runs
 * every other invocation through the real node with a preload that overrides
 * `process.version` / `process.versions.node`. So the script's own Node code
 * runs for real and sees the chosen version, whichever way it asks.
 *
 * MUTATION RECIPE (TASK-018-RULES R6) for scripts/install-toolchain.sh. The red
 * sets are DERIVED by reading, not yet observed by applying each mutant — the
 * pre-fix script (all four red) is the only mutant actually run:
 *   Mutant A: compare the major only (`parseInt(...) >= 20`).  Red: #1.
 *   Mutant B: on an unreadable manifest, fall back to accepting any node.  Red: #3.
 *   Mutant C: hard-code the range instead of reading the manifest.  Red: #2.
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

/** A copy of the script under a root whose tests/package.json we control. */
async function copyWithManifest(s: Scenario, manifest: string | null): Promise<string> {
  const script = await s.fs.write(
    'root/scripts/install-toolchain.sh',
    await readFile(join(REPO_ROOT, SCRIPT), 'utf8'),
    { mode: 0o755 },
  )
  if (manifest !== null) await s.fs.write('root/tests/package.json', manifest)
  return script
}

describe('TASK-005 (U3) — check derives the Node requirement from tests/package.json', () => {
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
      const script = await copyWithManifest(
        s,
        JSON.stringify({ engines: { node: '>=99.0.0' } }),
      )
      const r = await check(s, '24.1.0', script)
      expect(r.line, `a manifest demanding node 99 was ignored:\n${r.output}`).toMatch(/✗ node/)
      expect(r.output).toContain('>=99.0.0')
      expect(r.code).toBe(1)
    })
  })

  it('#3 a missing tests/package.json is reported, never replaced by a default floor', async () => {
    await scenario('install-toolchain-3', async (s) => {
      const r = await check(s, '24.1.0', await copyWithManifest(s, null))
      expect(r.line, `no manifest, yet node was declared fit:\n${r.output}`).toMatch(/✗ node/)
      expect(r.output).toContain('tests/package.json')
      expect(r.code).toBe(1)
    })
  })

  it('#4 a range this script cannot interpret is reported, never guessed at', async () => {
    await scenario('install-toolchain-4', async (s) => {
      const script = await copyWithManifest(
        s,
        JSON.stringify({ engines: { node: '20 - 22' } }),
      )
      const r = await check(s, '24.1.0', script)
      expect(r.line, `an uninterpretable range was accepted:\n${r.output}`).toMatch(/✗ node/)
      expect(r.output).toContain('20 - 22')
      expect(r.code).toBe(1)
    })
  })
})
