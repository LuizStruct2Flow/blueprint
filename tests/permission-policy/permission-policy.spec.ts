/**
 * BUG-110 — an irreversible action must be gated behind `ask`, never `allow`.
 *
 * `Bash(aws codepipeline put-approval-result *)` sat in the `allow` array with
 * nothing in `ask` or `deny` overriding it, so an agent could approve a
 * production deployment with no confirmation. A manual approval action exists
 * to put a human in the loop, and the editor's permission prompt is where that
 * human actually stands — so while the pattern is auto-approved, the gate
 * approves itself.
 *
 * Asserted against this repo's OWN settings.json rather than a fixture,
 * because the defect was a value in the shipped file and a fixture would have
 * happily passed over it. Parsed as JSON rather than grepped, so the pattern
 * appearing in a comment or an unrelated key cannot satisfy it.
 *
 * Matched on the substring `put-approval-result` rather than the exact entry:
 * derived projects have already drifted on the spacing (storm2flow spells it
 * `put-approval-result*`, without the space before the paren), and a test that
 * only recognises one spelling would go quietly green on the other.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT } from '../harness/index.js'

const APPROVAL = 'put-approval-result'

type Permissions = { allow?: string[]; ask?: string[]; deny?: string[] }

async function permissions(): Promise<Permissions> {
  const raw = await readFile(join(REPO_ROOT, '.claude/settings.json'), 'utf8')
  return (JSON.parse(raw) as { permissions?: Permissions }).permissions ?? {}
}

describe('BUG-110 — approving a deployment is a decision, not a default', () => {
  it('#1 no put-approval-result pattern is auto-approved in `allow`', async () => {
    const p = await permissions()
    const offenders = (p.allow ?? []).filter((e) => e.includes(APPROVAL))
    expect(
      offenders,
      'a deployment approval in `allow` means the agent approves production with '
        + 'no prompt — the prompt IS the human approval step for a manual gate',
    ).toEqual([])
  })

  it('#2 the pattern is present in `ask`, so the agent can still approve — after being asked', async () => {
    const p = await permissions()
    const asked = (p.ask ?? []).filter((e) => e.includes(APPROVAL))
    expect(
      asked.length,
      'the entry must be MOVED to `ask`, not deleted: approving from the editor '
        + 'is the point, it just has to be confirmed. Saw ask='
        + JSON.stringify(p.ask ?? []),
    ).toBeGreaterThan(0)
  })

  it('#3 the same pattern is never in two buckets at once', async () => {
    const p = await permissions()
    const where = (['allow', 'ask', 'deny'] as const).filter((b) =>
      (p[b] ?? []).some((e) => e.includes(APPROVAL)),
    )
    expect(
      where,
      `a pattern in more than one bucket makes the effective decision depend on `
        + `precedence nobody reads. Found in: ${where.join(', ')}`,
    ).toEqual(['ask'])
  })
})
