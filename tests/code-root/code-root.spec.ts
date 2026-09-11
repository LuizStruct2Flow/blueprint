/**
 * tests/code-root/code-root.spec.ts — BUG-066.
 *
 * THE DEFECT. `.githooks/pre-push` resolved a STATE root and never a CODE root.
 * Every path it used was cwd-relative — `scripts/lib/pipeline.sh`,
 * `tests/<suite>/test.sh`, `scripts/run-ts-suites.sh` — which is correct
 * exactly while the code tree sits at the repository root. Measured in a
 * post-move tree: rc=0, `PASSED · 0 stages · 39 skipped`, and a real `git push`
 * accepted with 47 of 51 stages skipped.
 *
 * WHAT THE HOOK NOW ANCHORS ON, and why it is not a proxy. A code root is
 * ranked on BOTH things the gate consumes — the renderer it sources AND the
 * suite tree it runs:
 *
 *   rank 1  `$c/scripts/lib/pipeline.sh` readable AND `$c/tests` a directory
 *   rank 2  renderer only
 *   none    no renderer → the push is REFUSED
 *
 * "The file I source exists here" would be evidence about the renderer used as
 * a claim about the suites — findings.md F-002's shape. Nothing is inferred
 * here: each of the two things is tested directly, and a candidate that has one
 * without the other is ranked below one that has both.
 *
 * Candidates are probed from `pwd` (git guarantees a hook runs at the work-tree
 * root; `pwd` is a syscall, so no exported GIT_DIR can move it — BUG-077),
 * scaffolding-first. Not from `$0`: `core.hooksPath` and a symlinked
 * `.git/hooks` both give the right answer, but a COPIED `.git/hooks/pre-push`
 * gives `<repo>/.git` — a plausible directory with no `tests/` — and git
 * supports that install. `$BASH_SOURCE` is a bashism and this hook is
 * `#!/bin/sh`.
 *
 * #4 and #5 are the reviewer's question answered in code rather than in prose:
 * mid-move, when BOTH `scaffolding/scripts/lib/pipeline.sh` and root
 * `scripts/lib/pipeline.sh` exist, the COMPLETE tree wins — because that is the
 * one that can actually run this gate — and when neither is complete the hook
 * says so out loud instead of passing over nothing.
 *
 * MUTATION RECIPE (R6) — red observed, not predicted. See the commit body.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { scenario, REPO_ROOT, type Scenario } from '../harness/index.js'

/**
 * A stub renderer that reports where it was found and then ENDS the hook.
 *
 * `exit 0` inside a sourced file exits the sourcing shell, so the hook stops
 * the instant it resolves its code root — before it reads stdin, shells out to
 * git, or runs a single stage. That is what makes these cases sub-second and
 * hermetic while still driving the REAL hook rather than an extract of it.
 */
const stub = (label: string) =>
  `# stub renderer for tests/code-root\n` +
  `echo "FOUND=${label}"\n` +
  `echo "BP_CODE_ROOT=$BP_CODE_ROOT"\n` +
  // A CHILD process, so the value it prints proves the export rather than mere
  // assignment — this stub itself is sourced and would see it either way.
  `sh -c 'echo "CHILD_ROOT=$BP_CODE_ROOT"'\n` +
  `exit 0\n`

type Layout = {
  /** directories to create, relative to the tree root */
  dirs?: string[]
  /** renderer stubs to plant: path prefix -> label */
  renderers?: Array<{ at: string; label: string }>
}

/** Build a tree and run the real working-tree `.githooks/pre-push` inside it. */
async function runHook(
  s: Scenario,
  name: string,
  layout: Layout,
): Promise<{ code: number | null; output: string; found: string; codeRoot: string }> {
  const root = await s.workspace.dir(name)

  // The file UNDER TEST is the working tree's, not HEAD's: a spec that read
  // HEAD would go green on a change that has not been made yet.
  const hook = await readFile(join(REPO_ROOT, '.githooks/pre-push'), 'utf8')
  await s.fs.write(`${name}/.githooks/pre-push`, hook, { mode: 0o755 })

  for (const d of layout.dirs ?? []) await s.fs.mkdirp(`${name}/${d}`)
  for (const r of layout.renderers ?? []) {
    const under = r.at === '.' ? name : `${name}/${r.at}`
    await s.fs.write(`${under}/scripts/lib/pipeline.sh`, stub(r.label))
  }

  const res = await s.run('sh', [`${root}/.githooks/pre-push`, 'origin', 'git@example:x.git'], {
    cwd: root,
    timeoutMs: 60_000,
  })
  const found = /FOUND=(\S+)/.exec(res.output)?.[1] ?? ''
  const codeRoot = /BP_CODE_ROOT=(\S*)/.exec(res.output)?.[1] ?? ''
  const childRoot = /CHILD_ROOT=(\S*)/.exec(res.output)?.[1] ?? ''
  return {
    code: res.code,
    output: res.output,
    found,
    codeRoot: codeRoot.replace(root, '<tree>'),
    childRoot: childRoot.replace(root, '<tree>'),
  }
}

describe('BUG-066 — the pre-push hook resolves a CODE root', () => {
  it('#1 a flat tree resolves to the repository root (today, and downstream forever)', async () => {
    await scenario('code-root-1', async (s) => {
      // A derived project never has scaffolding/ — bootstrap strips it — so
      // this case IS the downstream contract. It must be byte-identical to the
      // behaviour before BUG-066, or the fix is a downstream regression.
      const r = await runHook(s, 'flat', {
        dirs: ['tests'],
        renderers: [{ at: '.', label: 'root' }],
      })
      expect(r.found, r.output).toBe('root')
      expect(r.codeRoot, r.output).toBe('<tree>')
    })
  })

  it('#2 a moved tree resolves to scaffolding/ — the whole point', async () => {
    await scenario('code-root-2', async (s) => {
      const r = await runHook(s, 'moved', {
        dirs: ['scaffolding/tests'],
        renderers: [{ at: 'scaffolding', label: 'scaffolding' }],
      })
      expect(r.found, r.output).toBe('scaffolding')
      expect(r.codeRoot, r.output).toBe('<tree>/scaffolding')
    })
  })

  it('#3 two complete trees: the destination wins', async () => {
    await scenario('code-root-3', async (s) => {
      // A copy rather than a `git mv` leaves both halves whole. Both can run
      // the gate, so ordering decides, and the answer that is useful is the one
      // being moved TO — validating the tree nobody is about to delete.
      const r = await runHook(s, 'both', {
        dirs: ['tests', 'scaffolding/tests'],
        renderers: [
          { at: '.', label: 'root' },
          { at: 'scaffolding', label: 'scaffolding' },
        ],
      })
      expect(r.found, r.output).toBe('scaffolding')
    })
  })

  it('#4 mid-move: a COMPLETE root beats a half-built scaffolding/', async () => {
    await scenario('code-root-4', async (s) => {
      // The reviewer's question. `scripts/` has been copied under scaffolding/
      // but `tests/` has not moved yet. Both renderers exist; only the root can
      // actually run the suites, so the root is the right answer and the rank
      // is what produces it. A first-match-wins probe on the renderer alone
      // would pick scaffolding/ here and look for suites that are not there.
      const r = await runHook(s, 'midmove', {
        dirs: ['tests'],
        renderers: [
          { at: '.', label: 'root' },
          { at: 'scaffolding', label: 'scaffolding' },
        ],
      })
      expect(r.found, r.output).toBe('root')
    })
  })

  it('#5 a renderer with no suite tree is used, and SAYS so', async () => {
    await scenario('code-root-5', async (s) => {
      // The other mid-move ordering: tests/ moved first, scripts/ did not.
      // Nothing here can run the gate. Rank 2 keeps the renderer — so the stage
      // guards fail by their own names rather than the hook dying anonymously —
      // but the missing suite tree must be announced, because a short run is
      // exactly the signal the founder watches for.
      const r = await runHook(s, 'split', {
        dirs: ['scaffolding/tests'],
        renderers: [{ at: '.', label: 'root' }],
      })
      expect(r.found, r.output).toBe('root')
      expect(r.output, 'a code root with no tests/ was accepted silently').toMatch(
        /has no tests\/|no tests\//,
      )
    })
  })

  it('#6 no renderer anywhere REFUSES the push and names what it probed', async () => {
    await scenario('code-root-6', async (s) => {
      // The entire row exists because a gate reported success having run
      // nothing. A no-match must therefore block, not skip: rc != 0, no
      // "PASSED", and a message an operator can act on.
      const r = await runHook(s, 'empty', { dirs: ['tests', 'scaffolding/tests'] })

      expect(r.code, `the hook allowed a push with no code root\n${r.output}`).not.toBe(0)
      expect(r.output, 'a gate that cannot find its code must not report success').not.toMatch(
        /PASSED/,
      )
      expect(r.output).toMatch(/no code root/)
      expect(r.output, 'the refusal names neither candidate — nothing to act on').toMatch(
        /scaffolding/,
      )
    })
  })

  it('#7 BP_CODE_ROOT is EXPORTED, absolute, and physical', async () => {
    await scenario('code-root-7', async (s) => {
      // Everything downstream of the source — pipeline.sh's lib dir,
      // pre-push-project's three guards, run-ts-suites' root argument,
      // dod-gate's suite scan — reads this variable. The CHILD process is what
      // proves the export: the stub is sourced and would see a plain assignment
      // just as well. And the absolute, physical form is what stops a bare
      // `scaffolding` reaching a consumer that changes directory —
      // run-ts-suites cds into tests/ before it uses its root.
      const r = await runHook(s, 'exported', {
        dirs: ['scaffolding/tests'],
        renderers: [{ at: 'scaffolding', label: 'scaffolding' }],
      })
      expect(r.codeRoot, r.output).toBe('<tree>/scaffolding')
      expect(r.childRoot, `BP_CODE_ROOT did not reach a child process\n${r.output}`).toBe(
        '<tree>/scaffolding',
      )
    })
  })
})
