/**
 * tests/a2bp-e2e/a2bp-e2e.spec.ts — `blueprint a2bp` end to end, in TypeScript
 * (TASK-018).
 *
 * Against a real local remote. NO NETWORK, NO gh.
 *
 * The layered suites prove each part; this proves the assembly, and the single
 * most important assertion in the whole feature lives here: THE BLUEPRINT'S
 * WORKING TREE IS NEVER TOUCHED. That is the entire point of the change — a2bp
 * used to `cp` straight into it, which is how BUG-002 and A-09 fanned out to
 * every project. Every other property here is a detail by comparison.
 *
 * TWO DELIBERATE STRENGTHENINGS OVER THE SHELL SUITE, both about isolation:
 *
 *   1. EVERY CASE RUNS WITH gh GENUINELY ABSENT. The shell suite built a
 *      gh-free PATH for case #1 and then ran #3–#11 with the AMBIENT one. On a
 *      host with `gh` installed (this one) those cases therefore invoked the real
 *      `gh` binary — which rejects the fixture's path-shaped slug on argument
 *      validation, verified, so nothing left the machine — and reached the
 *      PR-CREATE-FAILURE branch rather than the missing-gh one. That is Codex F1
 *      exactly, fixed for #1 and left standing for the rest: #3's own comment
 *      says "still no gh, so still no PR" while gh was present and running. Here
 *      the gh-free PATH is used everywhere, so that comment becomes true and no
 *      host binary outside the fixture is reached for at all. No assertion
 *      changes: every case either never reaches the PR step, or expects the
 *      operational-failure status that the missing-gh path returns.
 *   2. #10 SCANS THIS SCENARIO'S OWN TMPDIR, not the shared one. The shell
 *      version scanned `${TMPDIR:-/tmp}` for `a2bp.*` newer than a fixture file —
 *      a machine-wide read that any other suite's debris could falsify, and the
 *      very cross-suite hazard BUG-049 describes. The harness pins TMPDIR per
 *      scenario, so the same question is asked of a directory this case owns.
 *
 * EQUIVALENCE RECORD (R6): `BP_SUBJECT_ROOT` points both implementations at one
 * perturbed copy of the blueprint. The catalogue is docs/doing/TASK-018-EQUIVALENCE-a2bp/ — 14 of 14
 * assertions here have a mutant that was RUN and OBSERVED to turn them red,
 * including #2: `E8` makes `bp_file_push` push the request to `main` as well,
 * and that is the only kind of defect the headline invariant can see.
 *
 * #12 IS NEW (BUG-108). The immediate pre-push base re-check was watched by
 * nothing in either implementation: replacing `bp_file_remote_tip` with
 * `return 0` left all six shell suites and every TS case green, because an
 * empty tip reads as "the blueprint did not move". `E9` is that mutant and #12
 * is its witness.
 *
 * STRENGTHENING #2, MEASURED. The shell suite's #10 scans the SHARED $TMPDIR,
 * so running two mutant trees at once turned it red for eleven mutants that
 * touch no scratch code at all. This spec scans the scenario's own pinned
 * TMPDIR and did not move. That is BUG-049's cross-suite hazard observed rather
 * than argued.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type RunResult, type Scenario } from '../harness/index.js'

const SUBJECT_ROOT = process.env.BP_SUBJECT_ROOT ?? REPO_ROOT
const CLI = join(SUBJECT_ROOT, 'scripts/blueprint')

/** Exit statuses under test (must match request-file.sh). */
const RC = { OK: 0, PENDING: 3, BLOCKED: 4, FAILED: 5, NOTHING: 6 } as const

interface E2E {
  readonly remote: string
  readonly bpWork: string
  readonly proj: string
  readonly noGhPath: string
  run(args: string[]): Promise<RunResult>
  git(args: string[]): Promise<RunResult>
  /**
   * A ref's sha on the remote, with the FIXTURE'S OWN command checked.
   *
   * Reading `stdout` without the status is fail-open in one direction and flaky
   * in the other: `expect(after).toBe(before)` over two empty strings holds, so
   * two transient failures would make "main did not move" pass over nothing,
   * while one produces a false red. One such false red was observed while running
   * this suite against a mutant under load, which is how this got written. Same
   * rule the repo already states for pushes — "never trust a push's exit code
   * through a pipe" — applied to the fixture's own reads.
   */
  sha(ref: string): Promise<string>
  /** Every a2bp/** ref on the remote. `**`, not `*` — see below. */
  requestRefs(): Promise<string[]>
  allRefs(): Promise<string[]>
}

async function setup(s: Scenario): Promise<E2E> {
  // --- a PATH on which `gh` is genuinely absent ----------------------------
  //
  // `command -v gh` must FAIL, so a shim is useless — a shim is found.
  //
  // The first attempt at this (in the shell suite) removed every PATH DIRECTORY
  // containing a gh binary. That passed on a host where gh lives alone in
  // ~/.local/bin and exploded in CI with exit 127, because there gh shares
  // /usr/bin with git, sed and everything else — so it deleted the entire
  // toolchain. A symlink farm of every executable EXCEPT gh is deterministic on
  // any host: the toolchain is complete, and the one binary under test is
  // genuinely absent.
  const noGhDir = await s.workspace.dir('nogh-bin')
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
        '    [ "$n" = gh ] && continue\n' +
        '    [ -e "$2/$n" ] || ln -s "$exe" "$2/$n" 2>/dev/null\n' +
        '  done\n' +
        'done\n' +
        'exit 0',
      '_',
      process.env.PATH ?? '',
      noGhDir,
    ],
    { cwd: s.workspace.root },
  )
  expect(farm.code, farm.output).toBe(0)

  // Non-vacuity, both directions. The shell suite learned the second one from
  // CI: without it a 127 would be mistaken for the behaviour under test.
  const hidden = await s.run('sh', ['-c', 'command -v gh'], {
    cwd: s.workspace.root,
    env: { PATH: noGhDir },
  })
  expect(hidden.code, 'could not construct a gh-free PATH; the no-gh cases would be vacuous').not.toBe(0)
  const usable = await s.run('git', ['--version'], {
    cwd: s.workspace.root,
    env: { PATH: noGhDir },
  })
  expect(usable.code, 'the gh-free PATH cannot run git; the no-gh cases would test nothing').toBe(0)

  // --- the blueprint remote (bare) and a working checkout of it ------------
  const bp = await s.gitRepo('bp-work')
  await s.fs.write('bp-work/CLAUDE.md', '# CLAUDE\noriginal line\n')
  await s.fs.write('bp-work/docs/DoD.md', '# DoD\noriginal dod\n')
  await s.fs.write('bp-work/docs/SECURITY.md', '# Security\noriginal sec\n')
  await bp.commitAll('base')

  const remote = s.workspace.path('bp-remote.git')
  const initBare = await s.run('git', ['init', '-q', '--bare', '-b', 'main', remote], {
    cwd: s.workspace.root,
  })
  expect(initBare.code, initBare.output).toBe(0)
  await bp.git(['remote', 'add', 'origin', remote])
  const push = await bp.git(['push', '-q', 'origin', 'main'])
  expect(push.code, push.output).toBe(0)

  const headR = await bp.git(['rev-parse', 'HEAD'])

  // --- a derived project ---------------------------------------------------
  const projRepo = await s.gitRepo('acme-flow')
  await s.fs.write('acme-flow/CLAUDE.md', '# CLAUDE\noriginal line\n')
  await s.fs.write('acme-flow/docs/DoD.md', '# DoD\nIMPROVED dod\n')
  await s.fs.write('acme-flow/docs/SECURITY.md', '# Security\noriginal sec\n')
  await s.fs.write(
    'acme-flow/.blueprint-source',
    [
      'config_version   = 2',
      `blueprint_source = ${bp.dir}`,
      `blueprint_remote = ${remote}`,
      'blueprint_branch = main',
      `bootstrap_sha    = ${headR.stdout.trim()}`,
      '',
    ].join('\n'),
  )
  await projRepo.commitAll('init')

  const git = (args: string[]): Promise<RunResult> =>
    s.run('git', ['-C', remote, ...args], { cwd: s.workspace.root })

  return {
    remote,
    bpWork: bp.dir,
    proj: projRepo.dir,
    noGhPath: noGhDir,
    run: (args) => s.run(CLI, args, { cwd: projRepo.dir, env: { PATH: noGhDir } }),
    git,
    async sha(ref) {
      const r = await git(['rev-parse', ref])
      expect(r.code, `the fixture could not read ${ref} on its own remote\n${r.output}`).toBe(0)
      const value = r.stdout.trim()
      expect(value, `rev-parse ${ref} succeeded but printed nothing`).toMatch(/^[0-9a-f]{7,}$/)
      return value
    },
    async requestRefs() {
      // `**`, not `*`. for-each-ref matches patterns with WM_PATHNAME, so a
      // single `*` does not cross '/' and 'refs/heads/a2bp/*' silently matches
      // NOTHING against a2bp/<project>/<digest>. ls-remote uses different
      // (tail-matching) semantics and does match — which is why cmd_prs's glob
      // is correct and the first version of this one was not.
      const r = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/a2bp/**'])
      return r.stdout.split('\n').filter(Boolean)
    },
    async allRefs() {
      const r = await git(['for-each-ref', '--format=%(refname)'])
      return r.stdout.split('\n').filter(Boolean).sort()
    },
  }
}

describe('a2bp files requests and cannot write into the blueprint', () => {
  it('#1 with no gh: the branch is pushed, no PR is claimed, and the exit code says operational failure (BUG-011)', async () => {
    await scenario('a2bp-e2e-1', async (s) => {
      // gh is HIDDEN for real here, not merely assumed absent. The shell suite's
      // comment used to claim "gh is absent in this fixture" while doing nothing
      // to make it so; on a host with gh installed the case passed because real
      // gh failed against the local bare remote and reached a DIFFERENT branch.
      // It therefore never exercised the no-gh path it named (Codex F1).
      //
      // The branch is pushed and NO PR is opened. That is RC_FAILED (5), not
      // decision-pending (3) — changed with BUG-011. CLAUDE.md defines 3 as
      // "filed and awaiting a decision", and with no PR there is nothing for
      // anyone to decide on: a script reading 3 concludes a reviewer has the
      // request when nobody does.
      const e = await setup(s)
      const r = await e.run(['a2bp', 'docs/DoD.md'])

      expect(r.code, `expected operational-failure with no gh present\n${r.output}`).toBe(RC.FAILED)
      expect(
        r.output,
        'exit was right but via the WRONG branch — this case must exercise the missing-gh path, not a failed pr-create (Codex F1)',
      ).toContain('gh is not installed')
    })
  })

  it("#1b the request branch carries the project's version of the file", async () => {
    await scenario('a2bp-e2e-1b', async (s) => {
      const e = await setup(s)
      await e.run(['a2bp', 'docs/DoD.md'])

      const refs = await e.requestRefs()
      expect(refs, 'no a2bp/* branch reached the remote').not.toHaveLength(0)
      const shown = await e.git(['show', `${refs[0]}:docs/DoD.md`])
      expect(shown.stdout, 'the pushed branch does not carry the project content').toBe(
        await s.fs.read('acme-flow/docs/DoD.md'),
      )
    })
  })

  it("#2 the blueprint's working tree AND main are untouched — nothing landed", async () => {
    await scenario('a2bp-e2e-2', async (s) => {
      // THE ONE THAT MATTERS. a2bp cannot land anything, by construction.
      const e = await setup(s)
      const mainBefore = await e.sha('main')
      await e.run(['a2bp', 'docs/DoD.md'])

      expect(
        await s.fs.read('bp-work/docs/DoD.md'),
        'THE BLUEPRINT WORKING TREE WAS MODIFIED — a2bp still writes directly',
      ).toBe('# DoD\noriginal dod\n')
      const status = await s.run('git', ['-C', e.bpWork, 'status', '--porcelain'], {
        cwd: s.workspace.root,
      })
      expect(
        status.stdout.trim(),
        'the blueprint checkout has uncommitted changes — something wrote into it',
      ).toBe('')
      const mainAfter = await e.sha('main')
      expect(
        mainAfter,
        "the remote's main branch moved — a request must not land on main",
      ).toBe(mainBefore)
    })
  })

  it("#2b the request's diff against main touches exactly the requested file", async () => {
    await scenario('a2bp-e2e-2b', async (s) => {
      const e = await setup(s)
      await e.run(['a2bp', 'docs/DoD.md'])
      const refs = await e.requestRefs()
      expect(refs, 'no request branch to diff').not.toHaveLength(0)

      const changed = await e.git(['diff', '--name-only', 'main', refs[0] as string])
      expect(changed.stdout.split('\n').filter(Boolean)).toEqual(['docs/DoD.md'])
    })
  })

  it('#3 an identical re-run adopts its own branch; the tip does not move', async () => {
    await scenario('a2bp-e2e-3', async (s) => {
      // The ordinary retry after a network error, and it only works because the
      // build is byte-reproducible.
      const e = await setup(s)
      await e.run(['a2bp', 'docs/DoD.md'])
      const refs = await e.requestRefs()
      expect(refs).not.toHaveLength(0)
      const ref = refs[0] as string

      const before = await e.sha(ref)
      const r = await e.run(['a2bp', 'docs/DoD.md'])
      const after = await e.sha(ref)

      expect(
        after,
        're-running moved the branch tip — a request already under review would be rewritten',
      ).toBe(before)
      expect(r.code, `re-running gave the wrong status\n${r.output}`).toBe(RC.FAILED)
      expect(
        r.output.toLowerCase(),
        're-running did not report adopting the existing branch',
      ).toContain('adopting')
    })
  })

  it('#4 a differing remote tip is refused and never force-pushed', async () => {
    await scenario('a2bp-e2e-4', async (s) => {
      const e = await setup(s)
      await e.run(['a2bp', 'docs/DoD.md'])
      const refs = await e.requestRefs()
      expect(refs).not.toHaveLength(0)
      const ref = refs[0] as string

      // Tampered with plumbing directly on the bare remote — no checkout
      // involved. Pointing the request branch at main is enough: what the CLI
      // must detect is simply "the tip is not the commit I built", and going
      // through a working tree to produce that only adds ways for the fixture
      // itself to fail.
      const mainSha = await e.sha('main')
      await e.git(['update-ref', `refs/heads/${ref}`, mainSha])
      const tampered = await e.sha(ref)

      const r = await e.run(['a2bp', 'docs/DoD.md'])
      const now = await e.sha(ref)

      expect(
        now,
        'THE CLI FORCE-PUSHED over a differing tip — a request under review would be destroyed',
      ).toBe(tampered)
      expect(r.code, 'a differing remote tip was reported as success').not.toBe(0)
      expect(r.output, `refused, but without naming the reason\n${r.output}`).toMatch(
        /different tip|Refusing to force-push/i,
      )
    })
  })

  it('#5 a file identical to the blueprint refuses with its own status', async () => {
    await scenario('a2bp-e2e-5', async (s) => {
      // NOTHING TO REQUEST gets its own status. An empty PR costs a reviewer the
      // same attention as a real one.
      //
      // THE "NO BRANCH WAS PUSHED" HALF IS REWRITTEN, and BUG-048 names why: the
      // shell version built its grep pattern from the command's own output —
      // `grep -o 'a2bp/[^ ]*' | head -1` plus a literal `x`. On a no-op there is
      // no such text in the output, so the pattern degenerated to `x` and the
      // check asked whether any ref name contains the letter x. Comparing the
      // whole ref set before and after asks the actual question and cannot
      // degenerate, because it derives nothing from the output under test.
      const e = await setup(s)
      const refsBefore = await e.allRefs()
      const r = await e.run(['a2bp', 'docs/SECURITY.md'])

      expect(r.code, `an unchanged file gave the wrong status\n${r.output}`).toBe(RC.NOTHING)
      expect(await e.allRefs(), 'a branch was pushed for a no-op request').toEqual(refsBefore)
    })
  })

  it('#6 --dry-run shows the request and pushes nothing', async () => {
    await scenario('a2bp-e2e-6', async (s) => {
      const e = await setup(s)
      await s.fs.write('acme-flow/docs/SECURITY.md', '# Security\nIMPROVED sec\n')

      const before = await e.allRefs()
      const r = await e.run(['a2bp', '--dry-run', 'docs/SECURITY.md'])
      const after = await e.allRefs()

      expect(after, '--dry-run pushed something').toEqual(before)
      expect(r.code, `--dry-run gave the wrong status\n${r.output}`).toBe(RC.OK)
      expect(r.output, '--dry-run did not show the diff').toContain('docs/SECURITY.md')
    })
  })

  it('#7 an unmanaged file is blocked before anything is pushed', async () => {
    await scenario('a2bp-e2e-7', async (s) => {
      const e = await setup(s)
      await s.fs.write('acme-flow/project_config_dod.md', 'private\n')

      const before = await e.allRefs()
      const r = await e.run(['a2bp', 'project_config_dod.md'])
      const after = await e.allRefs()

      expect(r.code, `an unmanaged file gave the wrong status\n${r.output}`).toBe(RC.BLOCKED)
      expect(after, 'an unmanaged file still reached the remote').toEqual(before)
    })
  })

  it('#8 contamination blocks the whole request; nothing is pushed', async () => {
    await scenario('a2bp-e2e-8', async (s) => {
      // A partial request is not a smaller request, it is a different one filed
      // under a branch name that claims to describe what was asked for.
      const e = await setup(s)
      await s.fs.write('acme-flow/docs/SECURITY.md', '# Security\nIMPROVED sec\n')
      await s.fs.write(
        'acme-flow/CLAUDE.md',
        '# CLAUDE\nsee /home/someone/dev/acme-flow/secret for details\n',
      )

      const before = await e.allRefs()
      const r = await e.run(['a2bp', 'CLAUDE.md', 'docs/SECURITY.md'])
      const after = await e.allRefs()

      expect(r.code, `contamination gave the wrong status\n${r.output}`).toBe(RC.BLOCKED)
      expect(after, 'A CONTAMINATED REQUEST WAS PUSHED').toEqual(before)
      expect(r.output.toUpperCase(), 'blocked without reporting a finding').toContain('BLOCK')
    })
  })

  it("#9 'blueprint push' is refused, naming what replaced it", async () => {
    await scenario('a2bp-e2e-9', async (s) => {
      const e = await setup(s)
      const r = await e.run(['push', 'CLAUDE.md'])
      expect(r.code, "'blueprint push' still succeeds").not.toBe(0)
      expect(r.output, 'the removal does not name the replacement').toContain('blueprint a2bp')
    })
  })

  it('#10 no scratch directories leak across a whole sequence of runs', async () => {
    await scenario('a2bp-e2e-10', async (s) => {
      // The build clones into the system temp dir on every run, including every
      // failure path. The harness pins TMPDIR into this scenario's workspace, so
      // this asks the question of a directory this case OWNS — unlike the shell
      // version, which scanned the shared $TMPDIR and could be falsified (or
      // poisoned) by any other suite. That shared scan is itself the BUG-049
      // cross-suite hazard.
      const e = await setup(s)
      await s.fs.write('acme-flow/project_config_dod.md', 'private\n')

      // One run per exit path the suite exercises elsewhere: filed-but-no-PR,
      // adopted, nothing-to-request, dry-run, blocked-unmanaged.
      await e.run(['a2bp', 'docs/DoD.md'])
      await e.run(['a2bp', 'docs/DoD.md'])
      await e.run(['a2bp', 'docs/SECURITY.md'])
      await e.run(['a2bp', '--dry-run', 'docs/DoD.md'])
      await e.run(['a2bp', 'project_config_dod.md'])

      const leaked = await s.run(
        'find',
        [s.workspace.path('tmp'), '-maxdepth', '1', '-name', 'a2bp.*'],
        { cwd: s.workspace.root },
      )
      expect(
        leaked.stdout.split('\n').filter(Boolean),
        'scratch directories were left behind in this scenario TMPDIR',
      ).toEqual([])
    })
  })

  it('#11 a version 1 config refuses with the exact lines to add', async () => {
    await scenario('a2bp-e2e-11', async (s) => {
      // The state every existing project is in.
      const e = await setup(s)
      await s.fs.write(
        'acme-flow/.blueprint-source',
        `blueprint_source = ${e.bpWork}\nbootstrap_sha = x\n`,
      )

      const r = await e.run(['a2bp', 'docs/SECURITY.md'])
      expect(r.code, 'a version 1 config was accepted').not.toBe(0)
      expect(r.output, 'refused without printing the lines to add').toContain(
        'config_version   = 2',
      )
    })
  })

  it('#12 BUG-108: a blueprint that moves DURING the build is re-checked, and the request is rebuilt', async () => {
    await scenario('a2bp-e2e-12', async (s) => {
      // THE PRE-PUSH BASE RE-CHECK, WATCHED FOR THE FIRST TIME. Checking one ref
      // and pushing another are not atomic; `cmd_a2bp` narrows that window by
      // asking the remote for its tip again immediately before the push. Nothing
      // asserted it: replacing `bp_file_remote_tip` with `return 0` left all 115
      // TS cases and all six shell suites green, because an empty tip is read as
      // "do not rebuild" and the request is then filed against a base that has
      // already been superseded.
      //
      // THE WINDOW IS DRIVEN, NOT SIMULATED. A `git` wrapper in front of the
      // gh-free PATH advances the remote's main immediately after the FIRST
      // fetch completes — which is exactly the race: the base is fetched, the
      // blueprint moves, the re-check must notice before the push. Hanging the
      // move off the fetch rather than off the re-check's own `ls-remote` is
      // what makes this a witness: a defect that never asks for the tip still
      // faces a moved blueprint, and is caught building on the stale one.
      //
      // Everything stays inside the scenario: the "remote" is a bare repo in the
      // workspace and the wrapper forwards to the real git by absolute path.
      const e = await setup(s)

      const which = await s.run('sh', ['-c', 'command -v git'], {
        cwd: s.workspace.root,
        env: { PATH: e.noGhPath },
      })
      expect(which.code, 'could not resolve git on the gh-free PATH').toBe(0)
      const realGit = which.stdout.trim()

      const stamp = s.workspace.path('blueprint-moved.stamp')
      const shims = await s.shimDir('git-race')
      await shims.add(
        'git',
        [
          `fetching=0`,
          `for a in "$@"; do`,
          `  [ "$a" = fetch ] && fetching=1`,
          `done`,
          `"${realGit}" "$@"`,
          `rc=$?`,
          // Once. A second move would make the CLI report "the blueprint moved
          // again" and refuse, which is a different case.
          `if [ "$fetching" = 1 ] && [ ! -e "${stamp}" ]; then`,
          `  : > "${stamp}"`,
          `  t=$("${realGit}" -C "${e.remote}" rev-parse 'main^{tree}')`,
          `  c=$("${realGit}" -C "${e.remote}" -c user.email=e@l -c user.name=E \\`,
          `        -c commit.gpgsign=false commit-tree "$t" -p main -m 'the blueprint moved')`,
          `  "${realGit}" -C "${e.remote}" update-ref refs/heads/main "$c"`,
          `fi`,
          `exit $rc`,
        ].join('\n'),
      )

      const before = await e.sha('main')
      const r = await s.run(CLI, ['a2bp', 'docs/DoD.md'], {
        cwd: e.proj,
        env: { PATH: `${shims.dir}:${e.noGhPath}` },
      })
      const after = await e.sha('main')

      expect(after, 'the fixture never moved main — this case would be vacuous').not.toBe(before)
      expect(
        r.output,
        'the blueprint moved during the build and the re-check did not report it',
      ).toContain('The blueprint moved while this request was being built')

      const refs = await e.requestRefs()
      expect(refs, `no request branch was filed\n${r.output}`).not.toHaveLength(0)
      const parent = await e.git(['rev-parse', `${refs[0] as string}^`])
      expect(parent.code, parent.output).toBe(0)
      expect(
        parent.stdout.trim(),
        'the request was filed against a SUPERSEDED base — the pre-push re-check did not rebuild it',
      ).toBe(after)
    })
  })
})
