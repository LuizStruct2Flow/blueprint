/**
 * tests/a2bp-inputs/a2bp-inputs.spec.ts — config and input validation for
 * `blueprint a2bp`, in TypeScript (TASK-018).
 *
 * The two things that decide WHERE a request is filed and WHICH bytes go into
 * it. a2bp is the only write path from a derived project into the generic
 * blueprint, and it is how BUG-002 and A-09 both got in. The contamination guard
 * checks what the content says; this checks that the content came from the file
 * the operator named, and that the request is going to the repository they meant.
 *
 * NO NETWORK. Part 3 fetches from a local upstream repository inside the
 * scenario workspace; `bp_request_transport_env` is exercised against a path, not
 * a remote.
 *
 * EQUIVALENCE RECORD (R6): `BP_SUBJECT_ROOT` points both implementations at one
 * perturbed copy of the blueprint. The catalogue is docs/doing/TASK-018-EQUIVALENCE-a2bp/ — 21 of 21
 * assertions here have a mutant that was RUN and OBSERVED to turn them red.
 *
 * #1b NEEDED A MUTANT OF ITS OWN, and the reason is worth keeping: making a v1
 * config parse as v2 does NOT red it, because the empty-remote check then
 * refuses and still emits nothing. What #1b actually forbids is an emission a
 * caller could eval, so `I19` injects the inference this module exists to
 * refuse — the v1 path printing BP_CFG_REMOTE from `blueprint_source`.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type RunResult, type Scenario } from '../harness/index.js'

const SUBJECT_ROOT = process.env.BP_SUBJECT_ROOT ?? REPO_ROOT
const LIBS = ['request.sh', 'request-config.sh', 'request-inputs.sh'].map((l) =>
  join(SUBJECT_ROOT, 'scripts/lib', l),
)
const PREAMBLE = LIBS.map((l) => `. "${l}"`).join('\n')

/** Source the three request libs and run `script` with `args` as $1, $2, … */
function sh(s: Scenario, script: string, args: string[] = []): Promise<RunResult> {
  return s.run('bash', ['-c', `${PREAMBLE}\n${script}`, '_', ...args], {
    cwd: s.workspace.root,
  })
}

/** Call a shell function with every argument positionally quoted. */
function call(s: Scenario, fn: string, args: string[]): Promise<RunResult> {
  const refs = args.map((_, i) => `"\$${i + 1}"`).join(' ')
  return sh(s, `${fn} ${refs}`, args)
}

/** stdout with trailing newlines stripped, as `$( )` would give it. */
const captured = (r: RunResult): string => r.stdout.replace(/\n+$/, '')

/** Write a `.blueprint-source`-shaped config out of its lines. */
function cfgLines(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

/**
 * The PART 1 fixture: one config file this scenario rewrites per assertion.
 */
async function withCfg(s: Scenario, ...lines: string[]): Promise<string> {
  return s.fs.write('cfg', cfgLines(...lines))
}

/** A project tree with the managed files the input cases validate against. */
async function project(s: Scenario): Promise<{ proj: string; managed: string }> {
  const proj = await s.workspace.dir('proj')
  await s.fs.write('proj/docs/DoD.md', 'dod\n')
  await s.fs.write('proj/docs/SECURITY.md', 'sec\n')
  await s.fs.write('proj/scripts/lib/state-dir.sh', 'helper\n', { mode: 0o755 })
  await s.fs.write('proj/project_config_dod.md', 'private\n')
  const managed = await s.fs.write(
    'managed',
    'docs/DoD.md\ndocs/SECURITY.md\nscripts/lib/state-dir.sh\n',
  )
  return { proj, managed }
}

describe('a2bp validates its destination and its inputs before anything leaves', () => {
  // =========================================================================
  // PART 1 — configuration (§8)
  // =========================================================================

  it('#1 a version 1 config refuses and prints the exact lines to add', async () => {
    await scenario('a2bp-inputs-1', async (s) => {
      // The case that matters most in the whole file: every project in existence
      // has a version 1 config, so this path runs for all of them first.
      const cfg = await withCfg(s, 'blueprint_source = /somewhere', 'bootstrap_sha    = abc')
      const r = await call(s, 'bp_config_load', [cfg])

      expect(r.code, 'a2bp would push to a guessed remote').not.toBe(0)
      expect(r.output, 'refused without printing the exact lines to add').toContain(
        'config_version   = 2',
      )
      expect(
        r.output.toLowerCase(),
        'refused without saying why inference is not offered',
      ).toMatch(/not recoverable|not a recoverable/)
    })
  })

  it('#1b a version 1 config emits no remote for any caller to use', async () => {
    await scenario('a2bp-inputs-1b', async (s) => {
      // The property is about the emitted value, not the prose: the refusal text
      // legitimately contains the word "inferred" while explaining why it
      // refuses to infer, so grepping the message tests the wording rather than
      // the behaviour. What must hold is that a v1 config yields no
      // BP_CFG_REMOTE for any caller to eval.
      const cfg = await withCfg(s, 'blueprint_source = /somewhere', 'bootstrap_sha    = abc')
      const r = await call(s, 'bp_config_load', [cfg])
      expect(
        r.stdout,
        'a caller ignoring the exit status would push somewhere',
      ).not.toMatch(/^BP_CFG_REMOTE=/m)
    })
  })

  it('#2 a valid v2 config yields the declared remote and branch', async () => {
    await scenario('a2bp-inputs-2', async (s) => {
      const cfg = await withCfg(
        s,
        'config_version   = 2',
        'blueprint_remote = git@github.com:Owner/bp.git',
        'blueprint_branch = main',
      )
      // Evaluated the way the CLI does, so the assertion is on what a caller
      // gets rather than on the text of the emission.
      const r = await sh(
        s,
        'out=$(bp_config_load "$1") || exit 1\neval "$out"\nprintf \'%s|%s\' "$BP_CFG_REMOTE" "$BP_CFG_BRANCH"',
        [cfg],
      )
      expect(r.code, r.output).toBe(0)
      expect(captured(r)).toBe('git@github.com:Owner/bp.git|main')
    })
  })

  it('#2b BUG-082: an absent branch defaults to main under v2, asserted without inheriting #2\'s eval', async () => {
    await scenario('a2bp-inputs-2b', async (s) => {
      const cfg = await withCfg(
        s,
        'config_version   = 2',
        'blueprint_remote = git@github.com:Owner/bp.git',
      )
      const r = await sh(
        s,
        'out=$(bp_config_load "$1" 2>/dev/null)\neval "$out" 2>/dev/null\nprintf \'%s\' "${BP_CFG_BRANCH:-}"',
        [cfg],
      )
      expect(captured(r)).toBe('main')
    })
  })

  it('#3 a future config_version refuses, naming both numbers', async () => {
    await scenario('a2bp-inputs-3', async (s) => {
      const cfg = await withCfg(
        s,
        'config_version   = 99',
        'blueprint_remote = git@github.com:Owner/bp.git',
      )
      const r = await call(s, 'bp_config_load', [cfg])
      expect(r.code, 'config_version 99 was accepted by a CLI that understands 2').not.toBe(0)
      expect(r.output, 'the refusal does not name the version found').toContain('99')
      expect(r.output, 'the refusal does not name the version supported').toMatch(/up to 2|up to$/m)
    })
  })

  it('#4 empty/missing remote, non-numeric version, bad branch, missing file all refuse', async () => {
    await scenario('a2bp-inputs-4', async (s) => {
      // Reported as a set: which of the five is accepted is the diagnosis, and
      // one-at-a-time would report only the first.
      const cases: Array<[string, string[]]> = [
        ['an empty blueprint_remote', ['config_version   = 2', 'blueprint_remote = ']],
        ['a missing blueprint_remote', ['config_version   = 2']],
        ['a non-numeric config_version', ['config_version   = two', 'blueprint_remote = x']],
        [
          'an invalid branch name',
          ['config_version   = 2', 'blueprint_remote = x', 'blueprint_branch = has space'],
        ],
      ]
      const accepted: string[] = []
      for (const [label, lines] of cases) {
        const cfg = await withCfg(s, ...lines)
        const r = await call(s, 'bp_config_load', [cfg])
        if (r.code === 0) accepted.push(label)
      }
      const missing = await call(s, 'bp_config_load', [s.workspace.path('nope')])
      if (missing.code === 0) accepted.push('a missing config file')

      expect(accepted).toEqual([])
    })
  })

  it('#4b the bootstrap placeholder is refused, naming itself as a placeholder', async () => {
    await scenario('a2bp-inputs-4b', async (s) => {
      // new-project.sh writes `blueprint_remote = FILL-ME-IN` deliberately
      // rather than guessing a remote, so this is the NORMAL state of every
      // freshly bootstrapped project — and it is non-empty, so the emptiness
      // check in #4 waves it straight through. Unrejected, a2bp would try to push
      // to a repository literally named FILL-ME-IN and fail with a transport
      // error naming neither the file nor the field. A placeholder that validates
      // is worse than no placeholder.
      const problems: string[] = []
      for (const ph of ['FILL-ME-IN', 'git@github.com:<owner>/<blueprint>.git']) {
        const cfg = await withCfg(s, 'config_version   = 2', `blueprint_remote = ${ph}`)
        const r = await call(s, 'bp_config_load', [cfg])
        if (r.code === 0) problems.push(`'${ph}' was accepted as a push destination`)
        else if (!/placeholder/i.test(r.output)) {
          problems.push(`refused '${ph}' without saying it is a placeholder`)
        }
      }
      expect(problems).toEqual([])
    })
  })

  it('#4c the exact placeholder new-project.sh writes is the one the validator refuses', async () => {
    await scenario('a2bp-inputs-4c', async (s) => {
      // Asserted against the script rather than a copy of the string, so the two
      // cannot drift apart into a config that bootstraps unusable and validates
      // fine.
      const bootstrap = await s.run(
        'bash',
        [
          '-c',
          "grep -m1 '^blueprint_remote' \"$1\" | sed 's/^[^=]*=[[:space:]]*//'",
          '_',
          join(SUBJECT_ROOT, 'scripts/new-project.sh'),
        ],
        { cwd: s.workspace.root },
      )
      const remote = captured(bootstrap)
      expect(remote, 'could not find the blueprint_remote line new-project.sh writes').not.toBe('')

      const cfg = await withCfg(s, 'config_version   = 2', `blueprint_remote = ${remote}`)
      const r = await call(s, 'bp_config_load', [cfg])
      expect(
        r.code,
        `new-project.sh writes '${remote}', which bp_config_load ACCEPTS — a fresh project would push to it`,
      ).not.toBe(0)
    })
  })

  // =========================================================================
  // PART 2 — input validation (§5.1)
  // =========================================================================

  it('#5 inputs come back sorted with modes attached', async () => {
    await scenario('a2bp-inputs-5', async (s) => {
      const { proj, managed } = await project(s)
      const r = await call(s, 'bp_inputs_validate', [
        proj,
        managed,
        'docs/SECURITY.md',
        'docs/DoD.md',
      ])
      expect(captured(r)).toBe('docs/DoD.md:100644\ndocs/SECURITY.md:100644')
    })
  })

  it('#5b the executable bit becomes 100755', async () => {
    await scenario('a2bp-inputs-5b', async (s) => {
      const { proj, managed } = await project(s)
      const r = await call(s, 'bp_inputs_validate', [proj, managed, 'scripts/lib/state-dir.sh'])
      expect(captured(r)).toBe('scripts/lib/state-dir.sh:100755')
    })
  })

  it("#6 './x', 'a/../x' and 'a//x' canonicalise and de-duplicate to one entry", async () => {
    await scenario('a2bp-inputs-6', async (s) => {
      // Canonicalisation happens before the managed-list check and before
      // sorting, so one file named two ways is one request, not two.
      const { proj, managed } = await project(s)
      const r = await call(s, 'bp_inputs_validate', [
        proj,
        managed,
        './docs/DoD.md',
        'docs/../docs/DoD.md',
        'docs//DoD.md',
      ])
      expect(captured(r)).toBe('docs/DoD.md:100644')
    })
  })

  it('#6b argument order does not change the spec list', async () => {
    await scenario('a2bp-inputs-6b', async (s) => {
      // The request key is a pure function of this list, so two orderings would
      // otherwise file two unrelated branches for the same change.
      const { proj, managed } = await project(s)
      const a = await call(s, 'bp_inputs_validate', [
        proj,
        managed,
        'docs/DoD.md',
        'docs/SECURITY.md',
      ])
      const b = await call(s, 'bp_inputs_validate', [
        proj,
        managed,
        'docs/SECURITY.md',
        'docs/DoD.md',
      ])
      expect(captured(a)).toBe(captured(b))
    })
  })

  it('#7 paths escaping the root are refused, never clamped', async () => {
    await scenario('a2bp-inputs-7', async (s) => {
      // Clamping '../../etc/passwd' to 'etc/passwd' would quietly file a
      // different file that might well exist, instead of the refusal the
      // operator needs.
      const { proj, managed } = await project(s)
      const accepted: string[] = []
      for (const bad of [
        '../outside.md',
        '../../etc/passwd',
        'docs/../../escape.md',
        '/etc/passwd',
      ]) {
        const r = await call(s, 'bp_inputs_validate', [proj, managed, bad])
        if (r.code === 0) accepted.push(bad)
      }
      const clamp = await call(s, 'bp_inputs_canonicalise', ['../../etc/passwd'])
      if (/^etc\/passwd/m.test(clamp.output)) accepted.push('CLAMPED ../../etc/passwd')

      expect(accepted).toEqual([])
    })
  })

  it('#8 a symlink at the target is refused, naming the reason', async () => {
    await scenario('a2bp-inputs-8', async (s) => {
      // `[ -f ]` follows symlinks, so a symlink to a regular file passes the
      // regular-file test. Filing through it would send bytes from a location the
      // operator never named while the PR displays the path they did.
      const { proj, managed } = await project(s)
      const elsewhere = await s.fs.write('elsewhere.env', 'SECRET=abc123\n')
      await s.fs.rm('proj/docs/SECURITY.md')
      const link = await s.run('ln', ['-sf', elsewhere, join(proj, 'docs/SECURITY.md')], {
        cwd: s.workspace.root,
      })
      expect(link.code, link.output).toBe(0)

      const r = await call(s, 'bp_inputs_validate', [proj, managed, 'docs/SECURITY.md'])
      expect(r.code, 'A SYMLINK WAS ACCEPTED — bytes from an unnamed location would be filed').not.toBe(0)
      expect(r.output.toLowerCase(), 'refused, but not for the symlink reason').toContain('symlink')
    })
  })

  it('#9 an unmanaged file is refused, pointing at project_config_*.md', async () => {
    await scenario('a2bp-inputs-9', async (s) => {
      const { proj, managed } = await project(s)
      const r = await call(s, 'bp_inputs_validate', [proj, managed, 'project_config_dod.md'])
      expect(r.code, 'an unmanaged project-specific file was accepted for back-propagation').not.toBe(0)
      expect(r.output, 'the refusal does not point at project_config_*.md').toContain(
        'project_config',
      )
    })
  })

  it('#9b a directory is refused', async () => {
    await scenario('a2bp-inputs-9b', async (s) => {
      const { proj } = await project(s)
      const managed = await s.fs.write('managed-dir', 'docs\n')
      const r = await call(s, 'bp_inputs_validate', [proj, managed, 'docs'])
      expect(r.code).not.toBe(0)
    })
  })

  it('#9c a nonexistent file is refused', async () => {
    await scenario('a2bp-inputs-9c', async (s) => {
      const { proj } = await project(s)
      const managed = await s.fs.write('managed-gone', 'docs/GONE.md\n')
      const r = await call(s, 'bp_inputs_validate', [proj, managed, 'docs/GONE.md'])
      expect(r.code).not.toBe(0)
    })
  })

  it('#10 one bad path fails the whole call; no partial request', async () => {
    await scenario('a2bp-inputs-10', async (s) => {
      // A request is filed as one unit. Proceeding with the valid subset would
      // file something the operator did not ask for, under a branch name that
      // claims to describe what they did.
      const { proj, managed } = await project(s)
      const r = await call(s, 'bp_inputs_validate', [
        proj,
        managed,
        'docs/DoD.md',
        'project_config_dod.md',
      ])
      expect(r.code, 'a mixed valid/invalid list SUCCEEDED — a partial request would be filed').not.toBe(0)
    })
  })

  // =========================================================================
  // PART 3 — no-op detection (§5.1, last two rows)
  // =========================================================================

  /**
   * A local upstream and a bare shallow clone of it, as the CLI builds one.
   *
   * docs/DoD.md is identical to the project's copy; docs/SECURITY.md differs.
   */
  async function base(
    s: Scenario,
  ): Promise<{ proj: string; bare: string; sha: string }> {
    const { proj } = await project(s)
    const up = await s.gitRepo('up')
    await s.fs.write('up/docs/DoD.md', 'dod\n')
    await s.fs.write('up/docs/SECURITY.md', 'CHANGED\n')
    await up.commitAll('base')

    const bare = s.workspace.path('bare')
    const init = await sh(s, 'bp_request_hermetic git init -q --bare --object-format=sha1 "$1"', [
      bare,
    ])
    expect(init.code, init.output).toBe(0)
    const fetch = await sh(
      s,
      'bp_request_transport_env git -C "$1" fetch -q --depth 1 "$2" main',
      [bare, up.dir],
    )
    expect(fetch.code, fetch.output).toBe(0)
    const rev = await sh(s, 'bp_request_hermetic git -C "$1" rev-parse FETCH_HEAD', [bare])
    expect(rev.code, rev.output).toBe(0)

    return { proj, bare, sha: captured(rev) }
  }

  it('#11 an all-no-op request refuses with its own distinct status', async () => {
    await scenario('a2bp-inputs-11', async (s) => {
      // An empty PR costs a reviewer the same attention as a real one, and
      // reviewer attention is the scarce resource this whole design protects.
      const { proj, bare, sha } = await base(s)
      const r = await call(s, 'bp_inputs_drop_unchanged', [
        bare,
        sha,
        `docs/DoD.md:100644:${join(proj, 'docs/DoD.md')}`,
      ])
      expect(r.code, 'an all-no-op request succeeded — it would file an empty PR').not.toBe(0)
      expect(r.code, "expected the distinct status 2 for 'nothing to request'").toBe(2)
    })
  })

  it('#12 an unchanged file is dropped, reported by name, and the rest proceed', async () => {
    await scenario('a2bp-inputs-12', async (s) => {
      const { proj, bare, sha } = await base(s)
      const same = `docs/DoD.md:100644:${join(proj, 'docs/DoD.md')}`
      const diff = `docs/SECURITY.md:100644:${join(proj, 'docs/SECURITY.md')}`
      const r = await call(s, 'bp_inputs_drop_unchanged', [bare, sha, same, diff])

      expect(r.code, `a partial no-op failed entirely\n${r.output}`).toBe(0)
      expect(captured(r), 'expected only the changed spec to survive').toBe(diff)
      expect(
        r.stderr,
        'a silent drop files less than the operator asked for',
      ).toContain('dropped (identical to the blueprint): docs/DoD.md')
    })
  })

  it('#13 a mode-only change survives as a real request', async () => {
    await scenario('a2bp-inputs-13', async (s) => {
      // The mode travels in the request key, so flipping the executable bit is a
      // genuine change to propose even when the bytes are identical.
      const { proj, bare, sha } = await base(s)
      await s.fs.chmod('proj/docs/DoD.md', 0o755)
      const r = await call(s, 'bp_inputs_drop_unchanged', [
        bare,
        sha,
        `docs/DoD.md:100755:${join(proj, 'docs/DoD.md')}`,
      ])
      expect(r.code, 'a mode-only change was dropped as a no-op').toBe(0)
    })
  })
})
