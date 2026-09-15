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
 *
 * TASK-025 COMMIT 4 — THE PER-MACHINE `blueprint` COMMAND (#34–#38, #37b).
 * ~/.local/bin/blueprint was hand-written and exec'd a checkout path, so moving
 * the blueprint (TASK-021 Stage B) would break every project on the machine from
 * a file no commit can fix. The installer writes a command that names no
 * checkout, owns it by byte-exact equality, and replaces a foreign one only on
 * --replace-blueprint-command, validated in the project it will serve.
 * PLAN-TASK-025 §8.1, §9.2.
 *
 * MUTATION RECORD — OBSERVED, each mutant alone on a copy of the tree outside any
 * git tree (.scratch/c025/mutants7.py). #37b is one case of many runs, so the
 * sub-run that failed first is named.
 *   Installer at the parent commit            → #34 #35 #36 #37 #37b #38
 *   M34a body execs "$ROOT/scripts/blueprint" → #34 #35 #37 #37b
 *   M34b installed after the OS branch        → #34 #35 #36 #37 #38
 *   M35a no scaffolding/ candidate            → #34 #35 #37b
 *   M35b exit 0 when no CLI is found          → #34 #35 #37b
 *   M36  rewrite unconditionally              → #36
 *   M37a overwrite anything                   → #37 (a)
 *   M37b write through the path, no temp      → #37 (a)
 *   M37c the marker line means "ours"         → #37 (c)
 *   K1   check mode drops the ⚠ line          → #37 (a) check
 *   R1   rm the target before preparing       → #37b (a): no backup
 *   R2   the body straight onto the target    → #37b (a)
 *   R3   swap before validating               → #37b (a): the backup is the new body
 *   R4   validate in $ROOT (revision 5)       → #37b (c) project without a CLI
 *   R5   skip the migrated-project test       → #37b (c) blueprint_source present
 *   R6   ignore --project                     → #37b (a2)
 *   R7   EXIT trap only, no signal handler    → #37b (d) INT to the installer alone
 *   R8   the resuming `trap … EXIT INT TERM`  → #37b (d) group INT
 *   M38  no shadow check                      → #38
 * WHERE THE PLAN'S PREDICTION WAS NOT WHAT RAN: R1 was predicted red in every
 * (c) and (d) run and R3 in the validation runs. Both go red earlier, at (a),
 * because the backup no longer holds the old wrapper, so the later runs are not
 * reached. R8 was not in the plan's catalogue. The plan predicted R7's run
 * exactly.
 *
 * On the CLI side (set7b, the same copy): dropping scripts/lib/signals.sh from
 * MANAGED_FILES reddens bootstrap-contents #0 (BUG-015). Not sourcing it
 * reddens 36 of sync-by-address's 41 cases, since drift and pull then refuse.
 */

import { describe, it, expect, vi } from 'vitest'
import { closeSync, constants, existsSync, openSync, writeSync } from 'node:fs'
import { cp, lstat, readFile, readdir, readlink, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
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

// --- TASK-025 commit 4: the per-machine `blueprint` command (PLAN §8.1) -------

/** PLAN-TASK-025 §8.1's body, verbatim. The second copy is the point: the case pins the plan's bytes. */
const BODY = [
  '#!/usr/bin/env bash',
  '# struct2flow-blueprint-command v1: written by scripts/install-toolchain.sh (TASK-025).',
  "# Runs THIS project's own blueprint CLI. The blueprint is read by its address,",
  '# so no checkout path belongs in this file. Edit the installer, not this copy.',
  'for c in ./scripts/blueprint ./scaffolding/scripts/blueprint; do',
  '  [ -x "$c" ] && exec "$c" "$@"',
  'done',
  'echo "blueprint: no scripts/blueprint in $PWD. Run from a project root," >&2',
  'echo "  or fetch the CLI once with: BLUEPRINT_ROOT=<checkout> bash <checkout>/scripts/blueprint pull scripts/blueprint" >&2',
  'exit 1',
  '',
].join('\n')

const FOREIGN = [
  'was not written by this installer, so it is left alone.',
  "  If it runs a checkout's scripts/blueprint, TASK-021 Stage B will break it.",
  '  Once every project has the address-reading CLI, replace it with:',
  '  bash scripts/install-toolchain.sh --replace-blueprint-command',
]

const stubText = (word: string) => `#!/usr/bin/env bash\necho ${word}\n`

async function stub(s: Scenario, rel: string, word: string): Promise<string> {
  return s.fs.write(rel, stubText(word), { mode: 0o755 })
}

/** One machine: an installer root (with a working CLI that prints ROOT), and a HOME. */
interface Machine {
  tag: string
  root: string
  installer: string
  home: string
  bin: string
  target: string
  targetRel: string
  path: string
}

async function machine(s: Scenario, tag: string, base: string): Promise<Machine> {
  const installer = await s.fs.write(`bp-${tag}/${SCRIPT}`, await readFile(join(REPO_ROOT, SCRIPT), 'utf8'), {
    mode: 0o755,
  })
  await s.fs.write(
    `bp-${tag}/scripts/lib/signals.sh`,
    await readFile(join(REPO_ROOT, 'scripts/lib/signals.sh'), 'utf8'),
  )
  await stub(s, `bp-${tag}/scripts/blueprint`, 'ROOT')
  await s.fs.write(`home-${tag}/.keep`, '')
  const home = s.workspace.path(`home-${tag}`)
  const bin = join(home, '.local/bin')
  return {
    tag,
    root: s.workspace.path(`bp-${tag}`),
    installer,
    home,
    bin,
    target: join(bin, 'blueprint'),
    targetRel: `home-${tag}/.local/bin/blueprint`,
    // No curl and no brew, so a plain install stops at the installer's own check
    // on either OS before any download; no blueprint, so the operator's real one
    // can never answer.
    path: base,
  }
}

function install(s: Scenario, m: Machine, args: string[], o: { cwd?: string; path?: string } = {}) {
  return s.run('bash', [m.installer, ...args], {
    cwd: o.cwd ?? s.workspace.root,
    env: { HOME: m.home, PATH: o.path ?? m.path },
  })
}

/** What the command at the target prints, run from `cwd`. */
async function prints(s: Scenario, m: Machine, cwd: string) {
  const r = await s.run(m.target, ['help'], { cwd, env: { HOME: m.home, PATH: m.path } })
  return r.stdout.trim()
}

async function dotNames(m: Machine, prefix: string) {
  return (await readdir(m.bin)).filter((n) => n.startsWith(prefix))
}

const baseline = (s: Scenario) => s.pathWithout(['curl', 'brew', 'blueprint'])

describe('TASK-025 — the installer writes the per-machine blueprint command', () => {
  it('#34 the command is written, exact, executable, names no checkout, and runs the project CLI', async () => {
    await scenario('install-toolchain-34', async (s) => {
      const base = await baseline(s)
      const m = await machine(s, 'a', base)
      const r = await install(s, m, [])

      const st = await lstat(m.target).catch(() => null)
      expect(st?.isFile(), `no command written:\n${r.output}`).toBe(true)
      expect((st?.mode ?? 0) & 0o777).toBe(0o755)
      const written = await readFile(m.target, 'utf8')
      expect(written, 'the command is not §8.1’s body').toBe(BODY)
      expect(written).not.toContain(m.root)
      expect(r.output).toContain(`✓ blueprint command installed (${m.target})`)

      await s.fs.write('proj/scripts/blueprint', '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$PWD/args"\n', {
        mode: 0o755,
      })
      const proj = s.workspace.path('proj')
      const ran = await s.run('sh', ['-c', 'blueprint drift'], {
        cwd: proj,
        env: { HOME: m.home, PATH: `${m.bin}:${base}` },
      })
      expect(ran.code, ran.output).toBe(0)
      expect(await readFile(join(proj, 'args'), 'utf8')).toBe('drift\n')
    })
  })

  it('#35 layouts: scaffolding/scripts/blueprint runs; with neither, exit 1 and the message', async () => {
    await scenario('install-toolchain-35', async (s) => {
      const m = await machine(s, 'a', await baseline(s))
      await install(s, m, [])

      await stub(s, 'scaf/scaffolding/scripts/blueprint', 'SCAFFOLD')
      const scaf = await s.run(m.target, [], { cwd: s.workspace.path('scaf'), env: { HOME: m.home, PATH: m.path } })
      expect(scaf.code, scaf.output).toBe(0)
      expect(scaf.stdout.trim()).toBe('SCAFFOLD')

      await s.fs.write('none/.keep', '')
      const none = await s.run(m.target, ['drift'], { cwd: s.workspace.path('none'), env: { HOME: m.home, PATH: m.path } })
      expect(none.code, none.output).toBe(1)
      expect(none.stderr).toContain('blueprint: no scripts/blueprint in ')
      expect(none.stderr).toContain(
        'or fetch the CLI once with: BLUEPRINT_ROOT=<checkout> bash <checkout>/scripts/blueprint pull scripts/blueprint',
      )
    })
  })

  it('#36 idempotent: a second install does not rewrite the command', async () => {
    await scenario('install-toolchain-36', async (s) => {
      const m = await machine(s, 'a', await baseline(s))
      await install(s, m, [])
      const touched = await s.run('touch', ['-d', '@0', m.target], { cwd: s.workspace.root })
      expect(touched.code, touched.output).toBe(0)
      const again = await install(s, m, [])
      expect((await stat(m.target)).mtimeMs, `the command was rewritten:\n${again.output}`).toBe(0)
      expect(again.output).toContain('✓ blueprint command already present')
    })
  })

  it('#37 never overwrites what it did not write: a wrapper, a symlink, a marked but edited body', async () => {
    await scenario('install-toolchain-37', async (s) => {
      const base = await baseline(s)

      // (a) today's hand-written wrapper
      const a = await machine(s, 'a', base)
      const wrapper = `#!/usr/bin/env bash\nexec ${a.root}/scripts/blueprint "$@"\n`
      await s.fs.write(a.targetRel, wrapper, { mode: 0o755 })
      const ra = await install(s, a, [])
      expect(await readFile(a.target, 'utf8'), `(a) the wrapper was overwritten:\n${ra.output}`).toBe(wrapper)
      expect(ra.output).toContain(`⚠ ${a.target} ${FOREIGN[0]}`)
      for (const line of FOREIGN.slice(1)) expect(ra.output).toContain(line)
      const ca = await install(s, a, ['check'])
      expect(ca.output, '(a) check did not report the foreign command').toContain(`⚠ ${a.target} ${FOREIGN[0]}`)

      // (b) a symlink into a checkout: never followed, never replaced
      const b = await machine(s, 'b', base)
      await s.fs.write(`home-b/.local/bin/.keep`, '')
      const linked = join(b.root, 'scripts/blueprint')
      const ln = await s.run('ln', ['-s', linked, b.target], { cwd: s.workspace.root })
      expect(ln.code, ln.output).toBe(0)
      const rb = await install(s, b, [])
      expect((await lstat(b.target)).isSymbolicLink(), `(b) the link was replaced:\n${rb.output}`).toBe(true)
      expect(await readlink(b.target)).toBe(linked)
      expect(await readFile(linked, 'utf8'), '(b) the checkout CLI was written through the link').toBe(stubText('ROOT'))
      expect(rb.output).toContain(`⚠ ${b.target} ${FOREIGN[0]}`)

      // (c) the marker proves nothing: the body plus one edited line is foreign
      const c = await machine(s, 'c', base)
      const edited = `${BODY}# hand-edited\n`
      await s.fs.write(c.targetRel, edited, { mode: 0o755 })
      const rc = await install(s, c, [])
      expect(await readFile(c.target, 'utf8'), `(c) a marked, edited body was overwritten:\n${rc.output}`).toBe(edited)
      for (const line of FOREIGN.slice(1)) expect(rc.output).toContain(line)
      const cc = await install(s, c, ['check'])
      expect(cc.output).toContain(`⚠ ${c.target} ${FOREIGN[0]}`)
    })
  })

  it('#37b --replace-blueprint-command: the approved swap, and every failure before it leaves the old command', async () => {
    await scenario('install-toolchain-37b', async (s) => {
      const base = await baseline(s)

      /** A machine whose target is a wrapper around a checkout printing OLD, and a project printing NEW. */
      async function fixture(tag: string, o: { link?: boolean; noCli?: boolean; legacy?: boolean } = {}) {
        const m = await machine(s, tag, base)
        const old = await stub(s, `old-${tag}/scripts/blueprint`, 'OLD')
        const wrapper = `#!/usr/bin/env bash\nexec ${old} "$@"\n`
        if (o.link) {
          await s.fs.write(`home-${tag}/.local/bin/.keep`, '')
          const ln = await s.run('ln', ['-s', old, m.target], { cwd: s.workspace.root })
          expect(ln.code, ln.output).toBe(0)
        } else {
          await s.fs.write(m.targetRel, wrapper, { mode: 0o755 })
        }
        await s.fs.write(
          `proj-${tag}/.blueprint-source`,
          'config_version = 2\n' +
            (o.legacy ? `blueprint_source = ${old}\n` : '') +
            'blueprint_remote = /nowhere.git\nblueprint_branch = main\nblueprint_release_branch = released\n',
        )
        if (!o.noCli) await stub(s, `proj-${tag}/scripts/blueprint`, 'NEW')
        return { m, old, wrapper, proj: s.workspace.path(`proj-${tag}`) }
      }

      async function intact(f: Awaited<ReturnType<typeof fixture>>, what: string, output: string) {
        expect(await readFile(f.m.target, 'utf8'), `${what}: the old command changed:\n${output}`).toBe(f.wrapper)
        expect(await prints(s, f.m, f.proj), `${what}: the old command no longer runs`).toBe('OLD')
        expect(await dotNames(f.m, '.blueprint.new.'), `${what}: a temp file was left`).toEqual([])
      }

      async function replaced(f: Awaited<ReturnType<typeof fixture>>, what: string, r: { code: number | null; output: string }) {
        expect(r.code, `${what}:\n${r.output}`).toBe(0)
        expect(await readFile(f.m.target, 'utf8'), `${what}: the target is not the body`).toBe(BODY)
        expect(await prints(s, f.m, f.proj), `${what}: the new command does not run the project CLI`).toBe('NEW')
        const backups = await dotNames(f.m, '.blueprint-replaced.')
        expect(backups, `${what}: expected exactly one backup`).toHaveLength(1)
        expect(await dotNames(f.m, '.blueprint.new.'), `${what}: a temp file was left`).toEqual([])
        expect(r.output).toContain(`✓ blueprint command replaced (${f.m.target})`)
        const backup = join(f.m.bin, backups[0] ?? '', 'blueprint')
        expect(r.output).toContain(`restore it with: mv ${backup} ${f.m.target}`)
        return backup
      }

      // (a) from the project
      const a = await fixture('a')
      const backupA = await replaced(a, '(a)', await install(s, a.m, ['--replace-blueprint-command'], { cwd: a.proj }))
      expect(await readFile(backupA, 'utf8'), '(a) the backup is not the old wrapper').toBe(a.wrapper)

      // (a2) from the installer's root, naming the project
      const a2 = await fixture('a2')
      const r2 = await install(s, a2.m, ['--replace-blueprint-command', `--project=${a2.proj}`], { cwd: a2.m.root })
      const backupA2 = await replaced(a2, '(a2)', r2)
      expect(await readFile(backupA2, 'utf8')).toBe(a2.wrapper)

      // (b) a symlink target is replaced as a link; what it pointed at is untouched
      const b = await fixture('b', { link: true })
      const backupB = await replaced(b, '(b)', await install(s, b.m, ['--replace-blueprint-command'], { cwd: b.proj }))
      expect((await lstat(b.m.target)).isFile()).toBe(true)
      expect((await lstat(backupB)).isSymbolicLink(), '(b) the backup is not the link').toBe(true)
      expect(await readlink(backupB)).toBe(b.old)
      expect(await readFile(b.old, 'utf8'), '(b) the checkout CLI was written through the link').toBe(stubText('OLD'))

      // (c) injected failures, one tool per run
      for (const tool of ['chmod', 'cp', 'mv']) {
        const f = await fixture(`fail-${tool}`)
        const shims = await s.shimDir(`shim-fail-${tool}`)
        await shims.add(tool, 'exit 1')
        const r = await install(s, f.m, ['--replace-blueprint-command'], { cwd: f.proj, path: `${shims.dir}:${base}` })
        expect(r.code, `(c) ${tool} failing still exited 0:\n${r.output}`).not.toBe(0)
        await intact(f, `(c) ${tool} failing`, r.output)
      }

      // (c) validation failing, the installer root keeping its working ROOT CLI in every run
      const noCli = await fixture('no-cli', { noCli: true })
      const rn = await install(s, noCli.m, ['--replace-blueprint-command'], { cwd: noCli.proj })
      expect(rn.code, `(c) a project without scripts/blueprint was accepted:\n${rn.output}`).not.toBe(0)
      await intact(noCli, '(c) no project CLI', rn.output)

      const legacy = await fixture('legacy', { legacy: true })
      const rl = await install(s, legacy.m, ['--replace-blueprint-command'], { cwd: legacy.proj })
      expect(rl.code, `(c) a project still carrying blueprint_source was accepted:\n${rl.output}`).not.toBe(0)
      expect(rl.output).toContain(`✗ ${legacy.proj} is not a migrated project`)
      await intact(legacy, '(c) blueprint_source present', rl.output)

      const atRoot = await fixture('at-root')
      const rr = await install(s, atRoot.m, ['--replace-blueprint-command'], { cwd: atRoot.m.root })
      expect(rr.code, `(c) the installer root was validated as the project:\n${rr.output}`).not.toBe(0)
      await intact(atRoot, '(c) from the root without --project', rr.output)

      // (d) interrupted before the swap: a cp that blocks, and INT/TERM to the group and to the installer alone
      const runs: Array<[Sig, 'group' | 'alone']> = [
        ['SIGINT', 'group'],
        ['SIGTERM', 'group'],
        ['SIGINT', 'alone'],
        ['SIGTERM', 'alone'],
      ]
      for (const [sig, to] of runs) {
        const tag = `${sig.toLowerCase()}-${to}`
        const f = await fixture(tag)
        const blocker = await seam(s, tag, 'cp')
        const { child, done } = start(s, f.m.installer, ['--replace-blueprint-command'], f.proj, {
          HOME: f.m.home,
          PATH: `${blocker.dir}:${base}`,
        })
        await reached(blocker)
        process.kill(to === 'group' ? -(child.pid ?? 0) : (child.pid ?? 0), sig)
        release(blocker)
        const d = await done
        expect(diedOf(d, sig), `(d) ${sig} to the ${to} did not end the installer\n${show(d)}`).toBe(true)
        await intact(f, `(d) ${sig} to the ${to}`, show(d))
      }
    })
  })

  it('#38 a blueprint earlier on PATH is named', async () => {
    await scenario('install-toolchain-38', async (s) => {
      const base = await baseline(s)
      const m = await machine(s, 'a', base)
      const other = await stub(s, 'other/blueprint', 'OTHER')
      const r = await install(s, m, [], { path: `${s.workspace.path('other')}:${m.bin}:${base}` })
      expect(r.output).toContain(`⚠ blueprint resolves to ${other} first on PATH, not ${m.target}.`)
    })
  })
})

// --- TASK-029: U7 of a2bp request PR #69 (linkedin-watcher-agent) -------------
//
// The request made a SYMLINKED CLI load its lib/ from its physical path, and
// made drift refuse to report without its helpers. The symlink rewrite is not
// ported: commit 4 replaced the symlinked command with one that execs the
// project's own scripts/blueprint. What U7 proved still has to hold for that
// command, so its two assertions travel here. #U7a: the installed command is
// the project's CLI, byte for byte in what it reports. #U7b: a CLI missing its
// lib/ never produces a report, and says the gate is not armed (A-22).

async function gitOk(s: Scenario, cwd: string, args: string[]) {
  const r = await s.run('git', args, { cwd })
  expect(r.code, `git ${args.join(' ')} failed in ${cwd}:\n${r.output}`).toBe(0)
  return r.stdout.trim()
}

async function repo(s: Scenario, dir: string) {
  await gitOk(s, dir, ['init', '-q', '-b', 'main', '.'])
  await gitOk(s, dir, ['config', 'user.email', 't@local'])
  await gitOk(s, dir, ['config', 'user.name', 't'])
  await gitOk(s, dir, ['config', 'commit.gpgsign', 'false'])
  await gitOk(s, dir, ['add', '-A'])
  await gitOk(s, dir, ['commit', '-q', '-m', 'init'])
  return gitOk(s, dir, ['rev-parse', 'HEAD'])
}

/** A fixture blueprint remote with a `released` branch. */
async function releasedRemote(s: Scenario) {
  await s.fs.write('remote/CLAUDE.md', '# CLAUDE\nfor {{PROJECT_NAME}}\n')
  await s.fs.write('remote/docs/DoD.md', '# DoD\nowner {{PROJECT_NAME}}\n')
  await s.fs.write('remote/tests/fixture/test.sh', 'echo fixture\n')
  const dir = s.workspace.path('remote')
  const head = await repo(s, dir)
  await gitOk(s, dir, ['branch', 'released'])
  return { dir, head }
}

/**
 * A migrated project named `proj` (§7.2 steps 4–7) with a copy of this tree's
 * CLI. `lib` says how much of scripts/lib/ it has. Its DoD differs from the
 * remote's, so a real report has a drifted line to show.
 */
async function migrated(s: Scenario, tag: string, remote: { dir: string; head: string }, lib: 'all' | 'none' | 'no-gate') {
  const rel = `${tag}/proj`
  await s.fs.write(`${rel}/CLAUDE.md`, '# CLAUDE\nfor proj\n')
  await s.fs.write(`${rel}/docs/DoD.md`, '# DoD\nowner proj\nedited here\n')
  await s.fs.write(`${rel}/tests/fixture/test.sh`, 'echo fixture\n')
  await s.fs.write(`${rel}/.githooks/pre-push`, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  await s.fs.write(
    `${rel}/.blueprint-source`,
    [
      'config_version           = 2',
      `blueprint_remote         = ${remote.dir}`,
      'blueprint_branch         = main',
      'blueprint_release_branch = released',
      `bootstrap_sha            = ${remote.head}`,
      'bootstrap_date           = 2026-01-01',
      '',
    ].join('\n'),
  )
  const proj = s.workspace.path(rel)
  const scripts = join(REPO_ROOT, 'scripts')
  await cp(scripts, join(proj, 'scripts'), {
    recursive: true,
    filter: (p) =>
      lib === 'all' ||
      (lib === 'none' ? !p.startsWith(join(scripts, 'lib')) : p !== join(scripts, 'lib', 'gate.sh')),
  })
  await repo(s, proj)
  return proj
}

/** The one part of a drift report that differs between two honest runs. */
const untimed = (out: string) => out.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g, '<time>')

describe('TASK-029 — U7 (PR #69): the installed command is the project CLI, and an incomplete CLI never reports', () => {
  it('#U7a from a migrated project, the installed command reports exactly what the project CLI reports', async () => {
    await scenario('install-toolchain-u7a', async (s) => {
      const base = await baseline(s)
      const m = await machine(s, 'a', base)
      await install(s, m, [])
      const proj = await migrated(s, 'a', await releasedRemote(s), 'all')
      const env = { HOME: m.home, PATH: base }
      const direct = join(proj, 'scripts/blueprint')

      // Warm-up: the first run arms the gate and fills the cache, and says so.
      // Both compared runs then start from the same state.
      const warm = await s.run(direct, ['drift'], { cwd: proj, env })
      expect(warm.code, warm.output).toBe(0)

      const viaDirect = await s.run(direct, ['drift'], { cwd: proj, env })
      const viaCommand = await s.run(m.target, ['drift'], { cwd: proj, env })

      // NON-VACUITY: a real report, from the address, with the gate line and a
      // drifted file — or "identical" would hold for two runs that did nothing.
      expect(viaDirect.stdout).toContain('(released)')
      expect(viaDirect.stdout).toContain('gate:')
      expect(viaDirect.stdout).toMatch(/~ +docs\/DoD\.md/)

      expect(untimed(viaCommand.stdout), `the installed command's report differs\n${viaCommand.output}`).toBe(
        untimed(viaDirect.stdout),
      )
      expect(untimed(viaCommand.stderr)).toBe(untimed(viaDirect.stderr))
      expect(viaCommand.code).toBe(viaDirect.code)
    })
  })
})

// --- the seam pattern (tests/sync-by-address), for #37b (d) -------------------
// Copied, not imported: that file is a spec, and importing it would register its
// cases here; tests/harness is not this task's to extend.

interface Seam {
  dir: string
  marker: string
  fifo: string
}

/** A `tool` shim that blocks the first time it runs, then behaves as the real tool. */
async function seam(s: Scenario, name: string, tool: string): Promise<Seam> {
  const dirName = `seam-${name}`
  const shims = await s.shimDir(dirName)
  const marker = s.workspace.path(dirName, 'reached')
  const fifo = s.workspace.path(dirName, 'release.fifo')
  const mk = await s.run('mkfifo', [fifo], { cwd: s.workspace.root })
  expect(mk.code, `mkfifo failed, so the seam would not block:\n${mk.output}`).toBe(0)
  const found = await s.run('sh', ['-c', `command -v ${tool}`], { cwd: s.workspace.root })
  const real = found.stdout.trim()
  expect(real, `no real ${tool} to hand over to`).not.toBe('')
  await shims.add(
    tool,
    `if [ ! -e '${marker}' ]; then\n` +
      `  exec 3<>'${fifo}'\n` +
      `  : > '${marker}'\n` +
      `  read -r _ <&3\n` +
      `  exec 3<&-\n` +
      `fi\n` +
      `exec '${real}' "$@"`,
  )
  return { dir: shims.dir, marker, fifo }
}

async function reached(seam: Seam) {
  await vi.waitFor(
    () => {
      if (!existsSync(seam.marker)) throw new Error(`the seam was never reached: ${seam.marker}`)
    },
    { timeout: 60_000, interval: 10 },
  )
}

function release(seam: Seam) {
  let fd: number
  try {
    fd = openSync(seam.fifo, constants.O_WRONLY | constants.O_NONBLOCK)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENXIO') return
    throw err
  }
  try {
    writeSync(fd, 'go\n')
  } catch (err) {
    // A group signal kills the shim, the fifo's only reader, and it can die
    // between our open and this write. It needed no release.
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') throw err
  } finally {
    closeSync(fd)
  }
}

interface Done {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

function start(s: Scenario, script: string, args: string[], cwd: string, env: Record<string, string>) {
  const child: ChildProcess = s.background('bash', [script, ...args], { cwd, env })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (d: Buffer) => {
    stdout += d.toString('utf8')
  })
  child.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString('utf8')
  })
  const done = new Promise<Done>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, done }
}

type Sig = 'SIGINT' | 'SIGTERM'

const diedOf = (d: Done, sig: Sig) => d.signal === sig || d.code === (sig === 'SIGINT' ? 130 : 143)

const show = (d: Done) => `code=${d.code} signal=${d.signal}\n${d.stdout}${d.stderr}`
