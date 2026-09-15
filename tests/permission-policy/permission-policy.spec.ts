/**
 * tests/permission-policy/permission-policy.spec.ts — BUG-118.
 *
 * Parallelism class: read-only (reads this repo's own .claude/settings.json and
 * mutates nothing, so no scenario workspace).
 *
 * AN IRREVERSIBLE ACTION MUST BE GATED BEHIND `ask`, NEVER `allow`.
 *
 * `Bash(aws codepipeline put-approval-result *)` sat in `allow` with nothing in
 * `ask` or `deny` overriding it, so an agent in any derived project could approve
 * a PRODUCTION deployment with no confirmation. A manual approval action exists
 * to put a human in the loop, and the editor's permission prompt is where that
 * human actually stands — so while the pattern is auto-approved, the gate
 * approves itself. Surfaced from storm2flow as PR #64 (numbered BUG-110 there,
 * which this repo had already allocated).
 *
 * Asserted against this repo's OWN settings.json rather than a fixture, because
 * the defect was a value in the shipped file and a fixture would pass over it.
 * Parsed as JSON rather than grepped, so the pattern appearing in a comment or an
 * unrelated key cannot satisfy it.
 *
 * Matched on the SUBSTRING `put-approval-result`, not the exact entry: derived
 * projects have already drifted on the spacing (storm2flow spells it
 * `put-approval-result*`, no space before the star), and a test that recognises
 * one spelling goes quietly green on the other.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { REPO_ROOT } from '../harness/index.js'

const APPROVAL = 'put-approval-result'
const BUCKETS = ['allow', 'ask', 'deny'] as const

type Permissions = Partial<Record<(typeof BUCKETS)[number], string[]>>

async function permissions(): Promise<Permissions> {
  const raw = await readFile(join(REPO_ROOT, '.claude/settings.json'), 'utf8')
  return (JSON.parse(raw) as { permissions?: Permissions }).permissions ?? {}
}

describe('BUG-118 — approving a deployment is a decision, not a default', () => {
  it('#1 no put-approval-result spelling is auto-approved in `allow`', async () => {
    const p = await permissions()
    expect(
      (p.allow ?? []).filter((e) => e.includes(APPROVAL)),
      'a deployment approval in `allow` means the agent approves production with '
        + 'no prompt — the prompt IS the human approval step for a manual gate',
    ).toEqual([])
  })

  it('#2 the pattern is in `ask`, so the agent can still approve — after being asked', async () => {
    // Non-vacuity for #1: deleting the entry outright would also empty `allow`.
    const p = await permissions()
    expect(
      (p.ask ?? []).filter((e) => e.includes(APPROVAL)).length,
      'the entry must be MOVED to `ask`, not deleted: approving from the editor is '
        + 'the point, it just has to be confirmed',
    ).toBeGreaterThan(0)
  })

  it('#3 the pattern sits in exactly one bucket, and that bucket is `ask`', async () => {
    const p = await permissions()
    const where = BUCKETS.filter((b) => (p[b] ?? []).some((e) => e.includes(APPROVAL)))
    expect(
      where,
      'a pattern in more than one bucket makes the effective decision depend on '
        + 'precedence nobody reads',
    ).toEqual(['ask'])
  })
})
