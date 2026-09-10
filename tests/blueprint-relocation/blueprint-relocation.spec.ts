/**
 * tests/blueprint-relocation/blueprint-relocation.spec.ts — TASK-021 Stage A′.
 *
 * Parallelism class: serial-global (every case owns a scenario workspace; none
 * touches the real checkout).
 *
 * WHAT THIS SUITE IS FOR, because "the tests pass" proves almost nothing here.
 *
 * The blueprint is being restructured so that everything a project receives
 * moves under `scaffolding/`. A derived project runs its OWN copy of
 * `scripts/blueprint`, frozen at the commit it last pulled. A frozen copy that
 * does not know about `scaffolding/` runs `git archive HEAD tests` against a
 * root that no longer has `tests`; `bp_expand_managed_dirs` fails closed inside
 * `read_blueprint_source`, which BOTH `drift` and `pull` go through. So `drift`
 * dies at every wake and `blueprint pull scripts/blueprint` — the obvious
 * recovery — dies before it can copy anything. Three projects, three manual
 * `cp`s, no tool saying why: BUG-028's shape, self-inflicted.
 *
 * The blueprint has NOT moved yet. So every case here builds a fixture
 * blueprint in the shape the real one will have, and asserts against that. The
 * flat cases are here for the same reason: this ships to every project today,
 * and "identical while the tree is flat" is half of what makes it safe.
 *
 * THE FOUR SHAPES, and why the half-moved ones are the point. A tree-level
 * probe (`[ -d "$BLUEPRINT_ROOT/scaffolding" ]`) would answer #1 and #2 and get
 * #3 and #4 wrong — which does not merely lose a case, it forces the whole
 * restructure to land as ONE atomic ~185-file commit, red at every intermediate
 * point. Per-path resolution is what buys green, pushable slices, and #3/#4 are
 * the only thing standing between that property and a silent regression to the
 * coarse probe.
 *
 * MUTATION RECIPE (TASK-018-RULES R6). Each mutant below was APPLIED and the
 * suite RUN; the red set is what was observed, not what was expected.
 *
 *   Mutant A: revert `bp_blueprint_path` to a bare `"$BLUEPRINT_ROOT/$1"`.
 *     Red: #2 #3 #4 #5 #6 #7. Every blueprint-side file resolves to a path that
 *     does not exist, so the whole fixture reports missing-in-blueprint.
 *   Mutant B: `bp_expand_managed_dirs` queries only `"${f%/}"` again.
 *     Red: #2 #4 #5 #6 #7 #8 — each dying with `expanded to nothing` and rc=1,
 *     which IS the downstream failure this stage exists to prevent. #3 stays
 *     green because its `tests/` half never moved.
 *   Mutant C: emit the archive listing WITHOUT stripping `scaffolding/`.
 *     Red: #6 only, and that is worth knowing. The leaked prefix makes the
 *     project side of the comparison miss (`+ scaffolding/tests/…`), so the
 *     corrupted substitution never gets reached — #6's coordinate check is the
 *     only thing standing between this and a silently wrong managed set.
 *   Mutant D: replace the per-path resolver with the coarse
 *     `[ -d "$BLUEPRINT_ROOT/scaffolding" ]` probe.
 *     Red: #3 #4 #6. #1 #2 #5 #7 #8 stay green — the coarse probe is correct
 *     for a fully-flat and a fully-moved tree and wrong for every state in
 *     between, which is exactly the argument that it forces an atomic Stage B.
 *     These three cases are the only thing that keeps the resolver per-path.
 *   Mutant F: hand `bp_should_substitute` the blueprint-side path
 *     (`local f="scaffolding/$1"` in `substituted_blueprint_copy`) — BUG-029
 *     R2-S2's shape.
 *     Red: #1 #2 #3 #4 #5. The `tests/*` exemption stops matching, the suite
 *     file gets `{{PROJECT_NAME}}` substituted on the blueprint side only, and
 *     it reports drifted with no pull able to fix it.
 *
 * The a2bp half of TASK-021 lives in tests/a2bp-build #9a–#9f, next to the
 * request builder it constrains. Its mutant (make `bp_base_path` return its
 * argument unchanged) turns #9a #9b #9d #9e red.
 */

import { describe, it, expect } from 'vitest'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

const CLI = join(REPO_ROOT, 'scripts/blueprint')

async function git(s: Scenario, cwd: string, args: string[]) {
  return s.run('git', args, { cwd })
}

async function initRepo(s: Scenario, dir: string) {
  await git(s, dir, ['init', '-q', '-b', 'main', '.'])
  await git(s, dir, ['config', 'user.email', 't@local'])
  await git(s, dir, ['config', 'user.name', 't'])
  await git(s, dir, ['config', 'commit.gpgsign', 'false'])
}

/**
 * A fixture blueprint whose content sits at the two prefixes independently.
 *
 * `docsAt` and `testsAt` are each '' (root, today's shape) or 'scaffolding/'
 * (after the move). Passing different values is a HALF-MOVED tree, which is the
 * state the blueprint is in for the duration of a sliced Stage B.
 *
 * `tests/fixture/test.sh` carries a literal `{{PROJECT_NAME}}`. That is not
 * decoration — it is case #5's oracle. bp_should_substitute exempts `tests/*`
 * by LEADING COMPONENT, so a caller that starts handing it
 * `scaffolding/tests/…` silently loses the exemption and substitutes every
 * suite in the blueprint (BUG-029's forever-drifted state). A suite file with
 * no placeholder in it cannot tell the difference.
 */
async function fixtureBlueprint(
  s: Scenario,
  root: string,
  docsAt: string,
  testsAt: string,
) {
  await mkdir(join(root, docsAt, 'docs'), { recursive: true })
  await mkdir(join(root, testsAt, 'tests/fixture'), { recursive: true })
  await writeFile(join(root, docsAt, 'CLAUDE.md'), '# CLAUDE\nfor {{PROJECT_NAME}}\n', 'utf8')
  await writeFile(join(root, docsAt, 'docs/DoD.md'), '# DoD\nowner {{PROJECT_NAME}}\nv2\n', 'utf8')
  await writeFile(
    join(root, testsAt, 'tests/fixture/test.sh'),
    'echo {{PROJECT_NAME}}\n',
    'utf8',
  )
  await initRepo(s, root)
  await git(s, root, ['add', '-A'])
  await git(s, root, ['commit', '-q', '-m', 'base'])
}

/**
 * A derived project. Its own tree NEVER moves — that is the whole point of the
 * strip — so this function takes no prefix at all.
 *
 * The project is named `proj` by its directory basename, and its files already
 * carry `proj` where the blueprint carries `{{PROJECT_NAME}}`: that is what a
 * bootstrapped project looks like, and comparing against anything else would
 * make every templated file read as drifted regardless of the resolver.
 */
async function derivedProject(s: Scenario, root: string, blueprintRoot: string) {
  await mkdir(join(root, 'docs'), { recursive: true })
  await mkdir(join(root, 'tests/fixture'), { recursive: true })
  await writeFile(join(root, 'CLAUDE.md'), '# CLAUDE\nfor proj\n', 'utf8')
  await writeFile(join(root, 'docs/DoD.md'), '# DoD\nowner proj\nSTALE\n', 'utf8')
  // Byte-identical to the blueprint's copy, placeholder INCLUDED: a suite file
  // is exempt from substitution, so an unsubstituted project copy is the
  // correct state and drift must report it clean.
  await writeFile(join(root, 'tests/fixture/test.sh'), 'echo {{PROJECT_NAME}}\n', 'utf8')

  await initRepo(s, root)
  const sha = (await git(s, blueprintRoot, ['rev-parse', 'HEAD'])).stdout.trim()
  await writeFile(
    join(root, '.blueprint-source'),
    [
      'config_version   = 2',
      `blueprint_source = ${blueprintRoot}`,
      `bootstrap_sha    = ${sha}`,
      'bootstrap_date   = 2026-01-01',
      '',
    ].join('\n'),
    'utf8',
  )
  await git(s, root, ['add', '-A'])
  await git(s, root, ['commit', '-q', '-m', 'init'])
}

/**
 * Build both fixtures at the given shape and run one CLI command in the project.
 *
 * `tag` names the directories. It is not cosmetic: `workspace.dir()` returns an
 * existing directory rather than a fresh one, so two `shaped()` calls in one
 * case with the same tag write the SECOND shape on top of the first — producing
 * a blueprint that holds both halves and therefore resolves under any resolver
 * at all. #5 passed under a mutant for exactly that reason before this argument
 * existed.
 *
 * The tag is the PARENT directory, not part of the project's own name: the
 * project's basename is what {{PROJECT_NAME}} substitutes to, so renaming it
 * would make every templated file read as drifted for an unrelated reason.
 */
async function shaped(
  s: Scenario,
  docsAt: string,
  testsAt: string,
  args: string[] = ['drift'],
  tag = 'a',
) {
  const bp = await s.workspace.dir(tag, 'bp')
  const proj = await s.workspace.dir(tag, 'proj')
  await fixtureBlueprint(s, bp, docsAt, testsAt)
  await derivedProject(s, proj, bp)
  const r = await s.run(CLI, args, { cwd: proj })
  return { bp, proj, r }
}

/**
 * The drift report's per-file lines, split by the marker that says WHICH list
 * they came from. Reading them as one list is a trap: `!`
 * (missing-in-blueprint) is what a mis-resolved path produces, so an assertion
 * that only asks "is this path mentioned?" passes on exactly the failure the
 * suite is for. Verified — mutant A survived #2 and #3 until this was split.
 *
 *   ~  drifted           the blueprint side was FOUND and differs
 *   +  new in blueprint  found, and the project has no copy
 *   !  missing in the blueprint — for these fixtures, mis-resolved
 */
function marked(output: string, mark: '~' | '+' | '!'): string[] {
  return output
    .split('\n')
    .filter((l) => l.trimStart().startsWith(mark + ' '))
    .map((l) => l.trim().slice(2).trim())
}

/** Every path the report mentions, whatever list it came from. */
function allReported(output: string): string[] {
  return [...marked(output, '~'), ...marked(output, '+'), ...marked(output, '!')]
}

/**
 * The three files these fixtures actually contain. The real MANAGED_FILES array
 * has ~69 entries and a fixture blueprint has none of the rest, so they land in
 * the missing-in-blueprint list legitimately and every assertion below is
 * scoped to the files the fixture owns.
 */
const FIXTURE_FILES = ['CLAUDE.md', 'docs/DoD.md', 'tests/fixture/test.sh']

/** Nothing the fixture actually ships may be reported as absent upstream. */
function expectAllResolved(output: string) {
  const missing = marked(output, '!').filter((p) => FIXTURE_FILES.includes(p))
  expect(missing, output).toEqual([])
}

describe('TASK-021 — the CLI resolves against a blueprint that has moved under scaffolding/', () => {
  it('#1 a FLAT blueprint still resolves exactly as it always did', async () => {
    await scenario('blueprint-relocation-1', async (s) => {
      const { r } = await shaped(s, '', '')

      expect(r.code, r.output).toBe(0)
      expect(r.output).not.toContain('expanded to nothing')
      expectAllResolved(r.output)
      // docs/DoD.md differs; CLAUDE.md and the suite file do not.
      expect(marked(r.output, '~'), r.output).toEqual(['docs/DoD.md'])
    })
  })

  it('#2 a blueprint whose content sits under scaffolding/ resolves, instead of dying in the expansion', async () => {
    await scenario('blueprint-relocation-2', async (s) => {
      const { r } = await shaped(s, 'scaffolding/', 'scaffolding/')

      // Without the change this is rc=1 and the run never reaches a report:
      // `git archive HEAD tests` fails, _bp_expand_die fires inside
      // read_blueprint_source, and `pull` — including `pull scripts/blueprint`
      // — dies at the same line.
      expect(r.code, r.output).toBe(0)
      expect(r.output).not.toContain('expanded to nothing')
      // Every fixture file was FOUND on the blueprint side — the assertion that
      // actually separates "resolved" from "resolved to nowhere".
      expectAllResolved(r.output)
      expect(marked(r.output, '~'), r.output).toEqual(['docs/DoD.md'])
    })
  })

  it('#3 a HALF-moved blueprint resolves both halves — docs moved, tests not', async () => {
    await scenario('blueprint-relocation-3', async (s) => {
      const { r } = await shaped(s, 'scaffolding/', '')

      expect(r.code, r.output).toBe(0)
      expect(r.output).not.toContain('expanded to nothing')
      // Both halves found: the moved one at its new coordinate, the unmoved one
      // at its old one. A tree-level probe gets exactly one of these right.
      expectAllResolved(r.output)
      expect(marked(r.output, '~'), r.output).toEqual(['docs/DoD.md'])
    })
  })

  it('#4 a HALF-moved blueprint resolves both halves — tests moved, docs not', async () => {
    await scenario('blueprint-relocation-4', async (s) => {
      const { r } = await shaped(s, '', 'scaffolding/')

      expect(r.code, r.output).toBe(0)
      expect(r.output).not.toContain('expanded to nothing')
      expectAllResolved(r.output)
      expect(marked(r.output, '~'), r.output).toEqual(['docs/DoD.md'])
    })
  })

  it('#5 bp_should_substitute still gets PROJECT-relative paths under both shapes', async () => {
    await scenario('blueprint-relocation-5', async (s) => {
      // The suite file holds a literal {{PROJECT_NAME}} on BOTH sides. It is
      // exempt (`tests/*`), so the two copies are byte-identical and drift must
      // be silent about it. If the expansion leaked `scaffolding/tests/…` into
      // the predicate the exemption stops matching, the blueprint side gets
      // substituted to `echo proj`, and the file reports drifted with no pull
      // able to fix it — BUG-029's forever-drifted state, one directory over.
      const flat = await shaped(s, '', '', ['drift'], 'flat')
      expect(flat.r.code, flat.r.output).toBe(0)
      expectAllResolved(flat.r.output)
      expect(marked(flat.r.output, '~'), flat.r.output).not.toContain('tests/fixture/test.sh')

      const moved = await shaped(s, 'scaffolding/', 'scaffolding/', ['drift'], 'moved')
      expect(moved.r.code, moved.r.output).toBe(0)
      expectAllResolved(moved.r.output)
      expect(marked(moved.r.output, '~'), moved.r.output).not.toContain('tests/fixture/test.sh')
    })
  })

  it('#6 the managed set is reported in project coordinates whatever shape the blueprint is in', async () => {
    await scenario('blueprint-relocation-6', async (s) => {
      const shapes: Array<[string, string, string]> = [
        ['flat', '', ''],
        ['moved', 'scaffolding/', 'scaffolding/'],
        ['half-docs', 'scaffolding/', ''],
        ['half-tests', '', 'scaffolding/'],
      ]
      for (const [tag, docsAt, testsAt] of shapes) {
        const { r } = await shaped(s, docsAt, testsAt, ['drift'], tag)
        expect(r.code, r.output).toBe(0)
        expectAllResolved(r.output)
        // Not one path a project would have to interpret. `scaffolding/` is the
        // blueprint's business and must never reach the project's side of the
        // report — a project has no such directory to pull into.
        for (const p of allReported(r.output)) {
          expect(p, `shape docs='${docsAt}' tests='${testsAt}'`).not.toMatch(/^scaffolding\//)
        }
      }
    })
  })

  it('#7 pull copies the right bytes out of a moved blueprint, substituted', async () => {
    await scenario('blueprint-relocation-7', async (s) => {
      const { proj, r } = await shaped(s, 'scaffolding/', 'scaffolding/', [
        'pull',
        'docs/DoD.md',
        '--yes',
      ])

      expect(r.code, r.output).toBe(0)
      const landed = await readFile(join(proj, 'docs/DoD.md'), 'utf8')
      expect(landed).toContain('v2')
      // Substituted on the way in, exactly as a flat-blueprint pull would.
      expect(landed).toContain('owner proj')
      expect(landed).not.toContain('{{PROJECT_NAME}}')
    })
  })

  it('#8 the CLI still resolves its own blueprint root when it lives under scaffolding/scripts/', async () => {
    await scenario('blueprint-relocation-8', async (s) => {
      // `_bp_resolve_blueprint_root` walks `dirname($0)/..` and verifies the
      // anchors. After the move that lands on `scaffolding/`, not the repo root
      // — and BLUEPRINT_ROOT must be the REPO root or every `git archive HEAD
      // scaffolding/…` below it queries the wrong repository.
      const bp = await s.workspace.dir('bp')
      const proj = await s.workspace.dir('proj')
      await fixtureBlueprint(s, bp, 'scaffolding/', 'scaffolding/')
      await mkdir(join(bp, 'scaffolding/scripts'), { recursive: true })
      await copyFile(CLI, join(bp, 'scaffolding/scripts/blueprint'))
      await s.run('chmod', ['+x', join(bp, 'scaffolding/scripts/blueprint')], { cwd: bp })
      await derivedProject(s, proj, bp)

      // Point .blueprint-source at a path that does not exist, so resolution
      // MUST fall through to "the repo the running CLI lives in".
      await writeFile(
        join(proj, '.blueprint-source'),
        [
          'config_version   = 2',
          'blueprint_source = /nonexistent/blueprint',
          'bootstrap_sha    = no-sha',
          'bootstrap_date   = 2026-01-01',
          '',
        ].join('\n'),
        'utf8',
      )

      const r = await s.run(join(bp, 'scaffolding/scripts/blueprint'), ['drift'], {
        cwd: proj,
      })

      expect(r.code, r.output).toBe(0)
      expect(r.output).toContain(`blueprint:  ${bp}`)
      expect(r.output).not.toContain('expanded to nothing')
    })
  })
})
