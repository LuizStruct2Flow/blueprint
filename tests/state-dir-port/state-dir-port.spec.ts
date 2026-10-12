/**
 * tests/state-dir-port/state-dir-port.spec.ts — TASK-092 slice 2: the old-vs-new
 * differential of scripts/lib/state-dir.sh against scripts/lib/state-dir.mts.
 *
 * Every case runs the SAME call through both implementations in a child process
 * whose five state variables (and GIT_DIR) are set explicitly, never inherited:
 * the harness exports BP_STATE_ROOT_CEILING, AGENT_STATE_HOME and
 * AGENT_SIGNAL_FILE to every child, so an unstated variable would silently
 * compare two runs against the harness's values. stdout, stderr and the exit
 * code must be byte-equal.
 *
 * Lives in the tree while both files exist; slice 3 deletes the shell file and
 * this suite with it (nothing is left to differ from).
 *
 * Parallelism class: mockable (every case owns its fixture tree).
 */
import { describe, it, expect } from 'vitest'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const LIB = join(REPO_ROOT, 'scripts', 'lib', 'state-dir.sh')
const MTS = join(REPO_ROOT, 'scripts', 'lib', 'state-dir.mts')

const FNS: Record<string, string> = {
  bp_state_root: 'bp-state-root',
  agent_state_dir: 'agent-state-dir',
  agent_state_dir_for: 'agent-state-dir-for',
  agent_signal_file: 'agent-signal-file',
  agent_signal_file_for: 'agent-signal-file-for',
  agent_signal_journal: 'agent-signal-journal',
  agent_signal_journal_for: 'agent-signal-journal-for',
}
const VARS = ['BP_CODE_ROOT', 'BP_STATE_ROOT', 'BP_STATE_ROOT_CEILING', 'AGENT_STATE_HOME', 'AGENT_SIGNAL_FILE', 'GIT_DIR']

type Env = Record<string, string | undefined>
let compared = 0

/** Run old and new with exactly `env` set (undefined = unset), assert equality. */
async function same(s: Scenario, label: string, env: Env, cwd: string, fn: string, args: string[]) {
  const set = Object.entries(env).flatMap(([k, v]) => (v === undefined ? [] : [`${k}=${v}`]))
  const scrub = VARS.flatMap((v) => ['-u', v])
  const oldR = await s.run(
    'env',
    [...scrub, ...set, 'sh', '-c', 'lib=$1; shift; . "$lib"; ' + fn + ' "$@"', 'sh', LIB, ...args],
    { cwd },
  )
  const newR = await s.run('env', [...scrub, ...set, 'node', MTS, FNS[fn] ?? fn, ...args], { cwd })
  const tag = `${label}: ${fn} ${JSON.stringify(args)} env=${JSON.stringify(env)}`
  expect({ code: newR.code, stdout: newR.stdout, stderr: newR.stderr }, tag).toEqual({
    code: oldR.code,
    stdout: oldR.stdout,
    stderr: oldR.stderr,
  })
  compared++
}

const mk = (p: string) => mkdirSync(p, { recursive: true })

describe('TASK-092 — state-dir.mts is byte-compatible with state-dir.sh', () => {
  it('bp_state_root: every terminator kind, ceiling, symlink, cwd and env case', async () => {
    await scenario('state-dir-port-walk', async (s) => {
      const w = await s.fs.mkdirp('t')
      const roots: Record<string, string> = {}
      for (const [name, marker, kind] of [
        ['bpr', '.blueprint-root', 'file'],
        ['bps', '.blueprint-source', 'file'],
        ['gitd', '.git', 'dir'],
        ['gitf', '.git', 'file'],
      ] as const) {
        roots[name] = join(w, name)
        mk(join(w, name, 'a', 'b'))
        if (kind === 'dir') mk(join(w, name, marker))
        else writeFileSync(join(w, name, marker), 'x\n')
      }
      // a marker that is a DIRECTORY named like a file marker is not a file marker
      mk(join(w, 'decoy', '.blueprint-root', 'deep'))
      // nested repo inside a blueprint root; markerless tree; trailing-space name
      mk(join(w, 'bpr', 'inner', '.git'))
      mk(join(w, 'bare', 'a', 'b'))
      mk(join(w, 'sp ace', '.git'))
      symlinkSync(join(w, 'bpr', 'a', 'b'), join(w, 'link-deep'))
      symlinkSync(join(w, 'bpr'), join(w, 'link-root'))
      symlinkSync(join(w, 'nowhere'), join(w, 'dangling'))

      const codes: Array<[string, string | undefined]> = [
        ['unset', undefined],
        ['empty', ''],
        ['bpr', roots.bpr],
        ['bpr/a/b', join(roots.bpr!, 'a', 'b')],
        ['bpr/a/b/', join(roots.bpr!, 'a', 'b') + '/'],
        ['bps/a/b', join(roots.bps!, 'a', 'b')],
        ['gitd/a/b', join(roots.gitd!, 'a', 'b')],
        ['gitf/a/b', join(roots.gitf!, 'a', 'b')],
        ['nested repo', join(w, 'bpr', 'inner')],
        ['symlinked deep', join(w, 'link-deep')],
        ['symlinked root', join(w, 'link-root')],
        ['symlinked root, deep', join(w, 'link-root', 'a', 'b')],
        ['dangling', join(w, 'dangling')],
        ['nonexistent', join(w, 'nope', 'x')],
        ['decoy dir marker', join(w, 'decoy', '.blueprint-root', 'deep')],
        ['space in name', join(w, 'sp ace')],
        ['relative dot', '.'],
        ['relative a/b', 'a/b'],
        ['markerless + ceiling', join(w, 'bare', 'a', 'b')],
      ]
      const ceilings: Array<[string, string | undefined]> = [
        ['no ceiling', undefined],
        ['empty ceiling', ''],
        ['ceiling at w', w],
        ['ceiling at code root parent', join(w, 'bpr', 'a')],
        ['ceiling at bare', join(w, 'bare')],
        ['ceiling above bare/a/b but misplaced', join(w, 'other')],
        ['ceiling with trailing slash', w + '/'],
      ]
      for (const cwd of [w, join(w, 'bpr', 'a')]) {
        for (const [cn, code] of codes) {
          for (const [kn, ceil] of ceilings) {
            // a markerless walk with no ceiling climbs to `/`; both climb the same
            // way, but keep the corpus off whatever lives above the workspace
            if (cn === 'markerless + ceiling' && ceil === undefined) continue
            await same(s, `${cn} / ${kn}`, { BP_CODE_ROOT: code, BP_STATE_ROOT_CEILING: ceil }, cwd, 'bp_state_root', [])
          }
        }
      }
      // a decoy GIT_DIR cannot move the walk, in either implementation
      await same(s, 'decoy GIT_DIR', { BP_CODE_ROOT: join(roots.bpr!, 'a', 'b'), GIT_DIR: join(roots.gitd!, '.git') }, w, 'bp_state_root', [])
      // bp_state_root takes no arguments in the shell, and extras are ignored
      await same(s, 'extra args', { BP_CODE_ROOT: roots.bpr }, w, 'bp_state_root', ['x', 'y'])
    })
  })

  it('the six path functions: env matrix x arity', async () => {
    await scenario('state-dir-port-fns', async (s) => {
      const w = await s.fs.mkdirp('t')
      const states: Array<string | undefined> = [undefined, '', '/state/root']
      const homes: Array<string | undefined> = [undefined, '', '/h/ome']
      const sigs: Array<string | undefined> = [undefined, '', '/sig/file.md', 'rel/sig.md']
      const argSets: string[][] = [[], ['/r'], ['/r', 'y'], [''], ['a b'], ['/r/']]
      for (const fn of Object.keys(FNS).filter((f) => f !== 'bp_state_root')) {
        for (const bs of states) {
          for (const ah of homes) {
            await Promise.all(
              sigs.flatMap((sf) =>
                argSets.map((args) => same(s, 'matrix', { BP_STATE_ROOT: bs, AGENT_STATE_HOME: ah, AGENT_SIGNAL_FILE: sf }, w, fn, args)),
              ),
            )
          }
        }
      }
    })
  }, 300_000)

  it('the corpus is non-vacuous: it compared a large number of cases', () => {
    // runs after the two cases above in file order
    expect(compared).toBeGreaterThan(1000)
  })
})
