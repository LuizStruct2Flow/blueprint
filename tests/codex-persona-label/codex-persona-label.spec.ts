/**
 * tests/codex-persona-label/codex-persona-label.spec.ts — BUG-021.
 *
 * Codex output reaches the feed as a bare `[CODEX]`, never `[Persona - Codex]`.
 * Measured 2026-08-05: 11 bare vs 2 labelled here, 103 vs 5 in one derived
 * project, and 0 vs 237 in the project that fixed it.
 *
 * THE ROOT CAUSE IS STRUCTURAL, which is why the obvious patch is wrong.
 * `scripts/agent-activity.sh` pumps `codex-runs.log` under a label bound ONCE at
 * daemon start, while the persona is a PER-DISPATCH fact. No string chosen
 * inside the feed can be right, because the feed does not know — and cannot know
 * — who holds the mic for a given line. Only the launcher does, at the moment it
 * dispatches.
 *
 * So the label has to be built where the knowledge is, from the SAME roster
 * lookup the feed uses. `persona_label` lived inside `agent-activity.sh` as a
 * local function, so the launcher could not reuse it and would have had to copy
 * it — two copies of a rule are two rules. This suite pins the shared function
 * AND the two callers.
 *
 * WHY SO MANY CHECKS ARE SOURCE CHECKS, AND WHAT THAT COSTS. #3, #4, #4b and #5
 * assert what the launcher and the feed SAY, not what they do. That is a real
 * limit and it is deliberate: the behavioural half of #3/#4 needs a live Codex
 * dispatch, which needs a Codex. What stands in its place is
 * `tests/subagent-feed`, which drives a real supervisor over a real transcript
 * and asserts the rendered label end to end. So the mechanism is proven
 * behaviourally there and pinned structurally here.
 *
 * EQUIVALENCE RECORD (R6, and this migration's own evidence).
 *
 * "Ported" is a claim, so it was measured rather than reviewed. Eleven trees —
 * one per check carrying exactly the defect that check exists to catch, plus the
 * healthy control — were built once and BOTH implementations were run over each:
 * the retiring `tests/codex-persona-label/test.sh`, copied into the tree, and
 * this spec with `BP_SPEC_ROOT` pointed at it. The per-id verdict sets were
 * compared mechanically. They agreed on all eleven inputs.
 *
 * The negative controls matter as much as the mutants and are listed with them:
 * a defect that is COMMENTED OUT must not be caught (both implementations strip
 * or tolerate comments), and a benign lookalike — `gemini-runs.log` pumped under
 * a static label — must not trip #4, which is about `codex-runs.log` alone.
 *
 * MUTATION RECIPE (R6) — each observed red, not predicted. See
 * `.scratch/equiv-codex-persona-label.sh` for the population as run.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { REPO_ROOT, scenario, type Scenario } from '../harness/index.js'

/**
 * The tree under test.
 *
 * REPO_ROOT for an ordinary run. `BP_SPEC_ROOT` repoints it at a perturbed copy,
 * which is how the equivalence driver runs THIS spec and the retiring shell
 * suite over the same bytes. It selects the SUBJECT, never the sandbox: HOME,
 * TMPDIR and every AGENT_* variable still come from `scenario()`, so there is no
 * path here that escapes R3.
 */
const SUBJECT = process.env.BP_SPEC_ROOT ?? REPO_ROOT

const LAUNCHER = join(SUBJECT, 'scripts', 'start-codex-signal-watch.sh')
const FEED = join(SUBJECT, 'scripts', 'agent-activity.sh')
const ROSTER_LIB = join(SUBJECT, 'scripts', 'lib', 'roster.sh')

/**
 * Read a script for a source check, with comments stripped.
 *
 * Stripping is not cosmetic. Both of these files NAME the anti-patterns they
 * forbid, in prose, so a check that cannot tell an explanation from a call would
 * force the explanation to be deleted to stay green — removing the one place a
 * future reader learns why. The shell suite greps the raw file and gets away
 * with it only because its patterns happen not to collide; matching its
 * behaviour exactly would import that luck, so this is deliberately STRICTER and
 * the equivalence record says so.
 */
async function code(path: string): Promise<string> {
  const raw = await readFile(path, 'utf8').catch(() => '')
  return raw.replace(/^[ \t]*#.*$/gm, '')
}

/**
 * Call a roster-lib function in the tree under test.
 *
 * BASH, NOT `sh`. `bp_roster_backing_for_name` warns on a miss and its key uses
 * `${want// /_}`, which dash rejects as a Bad substitution — so the unrostered
 * case below would run with a shell error on stderr and only happen to produce
 * the right stdout. The lib declares bash; the one caller that runs under `sh`
 * (`scripts/log-activity.sh`) already routes the lookup through `bash -c`.
 */
async function roster(s: Scenario, snippet: string): Promise<string> {
  const r = await s.run('bash', ['-c', `. "${ROSTER_LIB}"; ${snippet}`], {
    cwd: s.workspace.root,
  })
  return r.stdout
}

/**
 * The fixture roster.
 *
 * The `## Members` heading matters: `bp_roster_rows` reads ONLY that table, so
 * an unrelated table elsewhere cannot shadow a real member. A fixture with any
 * other heading resolves nothing — which is what this suite's first draft did,
 * and it looked exactly like the bug it was written to catch.
 *
 * The names are invented rather than taken from anyone's live fleet: a persona
 * literal from a real roster in a test is the BUG-010 contamination class in
 * fixture form.
 */
const FIXTURE_ROSTER = `# Roster

## Members

| Role | Name | Backing agent |
|---|---|---|
| Orchestrator | Jesko | Claude Code |
| QA-2 | Slava | Codex |
`

describe('BUG-021 — Codex output carries the persona that produced it', () => {
  it('#1 bp_roster_label is exposed by the roster lib', async () => {
    await scenario('codex-label-1', async (s) => {
      // `command -v` inside the same shell that sourced the lib. Asserting the
      // FUNCTION rather than a grep for its name: a comment mentioning it, or a
      // definition guarded behind a branch that never runs, both grep clean.
      const r = await s.run(
        'bash',
        ['-c', `. "${ROSTER_LIB}" && command -v bp_roster_label >/dev/null 2>&1`],
        { cwd: s.workspace.root },
      )
      expect(
        r.code,
        'no shared label function — the launcher must copy the feed’s version',
      ).toBe(0)
    })
  })

  it("#2 a Codex persona resolves to 'Slava - Codex'", async () => {
    await scenario('codex-label-2a', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', FIXTURE_ROSTER)

      expect(await roster(s, `bp_roster_label "${dir}" "Slava"`)).toBe('Slava - Codex')
    })
  })

  it('#2 an unrostered name degrades to the bare name', async () => {
    await scenario('codex-label-2b', async (s) => {
      const dir = await s.fs.mkdirp('proj')
      await s.fs.write('proj/AGENT_ROSTER.md', FIXTURE_ROSTER)

      // A feed line with no label at all is worse than an unqualified one, so a
      // miss must still produce the NAME — never a blank and never an error.
      expect(await roster(s, `bp_roster_label "${dir}" "Nobody"`)).toBe('Nobody')
    })
  })

  it('#3 the launcher builds its label from the shared roster lookup', async () => {
    expect(
      await code(LAUNCHER),
      'the launcher does not label its output — the feed cannot do it for it',
    ).toMatch(/bp_roster_label/)
  })

  it('#3 it labels with the holder of the mic AT DISPATCH TIME', async () => {
    expect(
      await code(LAUNCHER),
      'the launcher never reads AGENT_SIGNAL_HOLDER — the label cannot be per-dispatch',
    ).toMatch(/AGENT_SIGNAL_HOLDER/)
  })

  it('#4 the feed no longer stamps a static [CODEX] label', async () => {
    // THE ASSERTION THAT MAKES THE FIX A FIX RATHER THAN AN ADDITION. Leaving
    // the pump in place would double every line, one labelled and one not, which
    // reads as a bug in the new code rather than the old.
    expect(
      await code(FEED),
      'the feed still pumps codex-runs.log under a static [CODEX] label',
    ).not.toMatch(/pump .*codex-runs\.log.*"CODEX"/)
  })

  it('#4 the feed uses the same shared label function', async () => {
    // The feed's own mic-flip line must keep using the shared function, or the
    // two label formats drift apart while both look correct in isolation.
    expect(
      await code(FEED),
      'the feed kept a private label builder — the two formats will drift',
    ).toMatch(/bp_roster_label/)
  })

  it('#4b the roster lib is sourced only if readable', async () => {
    // THE LABEL FAILS OPEN, and that asymmetry is the point. Unlike
    // .githooks/commit-msg, which must refuse when it cannot load its rule, a
    // missing lib here may cost the LABEL and must never cost the DISPATCH.
    // Sourcing it unguarded aborted the whole wake command in any tree without
    // it — tests/state-dir caught that as a dispatch which simply never
    // happened, far worse than a bare label.
    expect(
      await code(LAUNCHER),
      'the launcher sources roster.sh unguarded — a tree without it loses the dispatch',
    ).toMatch(/\[ -r "\$ROOT\/scripts\/lib\/roster\.sh" \]/)
  })

  it('#4b feed_append degrades to a no-op rather than an unbound command', async () => {
    expect(
      await code(LAUNCHER),
      'no fallback for feed_append — the dispatch dies where feed.sh is absent',
    ).toMatch(/feed_append\(\)\{ :; \}/)
  })

  it('#5 the Gemini run log is still merged — its lines are not dropped', async () => {
    // SCOPE DISCIPLINE: fix the one that has a fix. Gemini routes through its own
    // run log and has no launcher doing per-dispatch labelling, so removing ITS
    // pump would silently drop the lines entirely rather than relabel them.
    expect(
      await code(FEED),
      'the Gemini pump was removed too, silently losing its output',
    ).toMatch(/gemini-runs\.log/)
  })
})
