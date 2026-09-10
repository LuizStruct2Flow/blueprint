/**
 * tests/harness/canary.ts — prove the real repository was not touched.
 *
 * THIS IS THE CHECK THAT CATCHES WHAT SELF-CONCURRENCY MISSES, and that is not
 * a theoretical claim. Both Codex reviewers independently proposed "run each
 * suite twice concurrently with itself" as THE isolation check. Vitali then ran
 * it and found the counter-example: `pipeline` PASSES self-concurrency while its
 * hazard survives, because both copies pin AGENT_FEED_LOG and therefore both
 * avoid the shared target. `template-source` likewise passes self-concurrency
 * while carrying the live-baton hole (BUG-046).
 *
 * Self-concurrency cannot see "concurrent with a DIFFERENT writer of a shared
 * target" — and every gate stage is such a writer, via pipeline.sh's
 * `feed_append "[GATE] ..."`. So the two checks are complementary and the plan
 * requires both. A harness offering only the first would believe it had
 * isolation it did not have, which is this repo's signature failure committed
 * by the control built to prevent it.
 *
 * Precedent in-tree: tests/pipeline:283-288 already does exactly this for the
 * real activity log, as an escape canary. This generalises it.
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Files that a correctly isolated scenario must leave byte-identical. */
export interface CanaryTarget {
  label: string
  path: string
}

interface Snapshot {
  target: CanaryTarget
  /** null = the file did not exist. That is a legitimate state to preserve. */
  content: string | null
  size: number | null
}

/**
 * The real state a fixture must never touch.
 *
 * The baton is the coordination primitive the whole team reads; BUG-030/046
 * saw a suite reset it to the bootstrap default mid-review, which reads as a
 * fresh checkout rather than as damage. The feed and its journal are the
 * durable record of what happened.
 */
export function realStateTargets(repoRoot: string): CanaryTarget[] {
  return [
    { label: 'live baton', path: join(repoRoot, 'logs/state/signal.md') },
    {
      label: 'baton journal',
      path: join(repoRoot, 'logs/state/signal-history.log'),
    },
    { label: 'activity feed', path: join(repoRoot, 'logs/agent-activity.log') },
    { label: 'git config', path: join(repoRoot, '.git/config') },
  ]
}

async function snapshotOne(target: CanaryTarget): Promise<Snapshot> {
  try {
    const s = await stat(target.path)
    return {
      target,
      content: await readFile(target.path, 'utf8'),
      size: s.size,
    }
  } catch {
    return { target, content: null, size: null }
  }
}

export class RealStateCanary {
  private constructor(private readonly before: Snapshot[]) {}

  static async capture(targets: CanaryTarget[]): Promise<RealStateCanary> {
    return new RealStateCanary(await Promise.all(targets.map(snapshotOne)))
  }

  /**
   * Throw if any watched file changed.
   *
   * THE ACTIVITY FEED IS THE ONE PARTIAL CHECK HERE, AND THIS IS ITS EXACT
   * SCOPE. The feed is append-only, and a live `agent-activity.sh --daemon` the
   * developer is running appends to it during a test run, so a byte comparison
   * would go red for an innocent reason. That leaves two checks and one hole:
   *
   *   CAUGHT      a rewrite or a truncation — what was captured is no longer a
   *               prefix of what is there now.
   *   CAUGHT      an append CARRYING this scenario's token, which is what
   *               AGENT_FEED_TAG and AGENT_PERSONA put on the lines of the two
   *               dominant writers (scenarioEnv in index.ts names them, and
   *               names the writers they do not reach).
   *   NOT CAUGHT  an append carrying no token. An append leaves the captured
   *               content intact as a prefix, so the prefix check passes by
   *               construction, and there is no token for the token check to
   *               find. Nothing here sees it.
   *
   * That third row read "caught only by the prefix check" until Codex pointed
   * out that the prefix check passes on EVERY append — a claim of coverage
   * inside the commit whose purpose was to retract a claim of coverage, which
   * is this repo's signature failure committed twice in the same place.
   *
   * It is stated rather than closed because closing it means ATTRIBUTING an
   * append, and the feed carries nothing to attribute by: a concurrent daemon's
   * line and a fixture's leaked line are the same bytes, written by the same
   * user, at the same moment. Forbidding new bytes outright would fail honest
   * runs, and a check that goes red for innocent reasons gets muted, which
   * leaves less coverage than admitting the gap. harness.spec.ts pins this
   * behaviour with a case, so the limit cannot quietly drift away from the
   * prose again in either direction.
   */
  async assertUnchanged(escapeToken?: string): Promise<void> {
    const problems: string[] = []

    for (const before of this.before) {
      const after = await snapshotOne(before.target)

      if (before.content === null && after.content === null) continue

      if (before.content === null && after.content !== null) {
        problems.push(
          `${before.target.label} was CREATED by the fixture (${before.target.path})`,
        )
        continue
      }

      if (before.content !== null && after.content === null) {
        problems.push(
          `${before.target.label} was DELETED by the fixture (${before.target.path})`,
        )
        continue
      }

      const isAppendOnly = before.target.label === 'activity feed'
      if (isAppendOnly) {
        if (!after.content!.startsWith(before.content!)) {
          problems.push(
            `${before.target.label} was rewritten or truncated, not appended to ` +
              `(${before.target.path})`,
          )
        }
        if (escapeToken && after.content!.includes(escapeToken)) {
          problems.push(
            `${before.target.label} contains this scenario's unique escape token ` +
              `(${before.target.path})`,
          )
        }
        continue
      }

      if (after.content !== before.content) {
        problems.push(
          `${before.target.label} CHANGED (${before.target.path})`,
        )
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `The scenario mutated real state outside its fixture:\n  - ` +
          problems.join('\n  - ') +
          `\n\nThis is the BUG-030 / BUG-046 / BUG-047 class. A fixture must ` +
          `own everything it writes.`,
      )
    }
  }

  /**
   * A unique token that must never appear in a real log.
   *
   * This is the half of the escape canary that survives a parallel gate: the
   * token is unique per scenario, so a sibling stage writing to the same file
   * cannot cause a false positive. The count-based half cannot make that claim.
   *
   * A TOKEN NOTHING EMITS DETECTS NOTHING. For a while this one was minted,
   * handed to every scenario and searched for, while no fixture had any way to
   * produce it — a check over a case that could not arise, which is this repo's
   * signature defect wearing the uniform of the control that exists to catch
   * it. What closes that is on the emitting side: scenarioEnv (index.ts) sets
   * AGENT_FEED_TAG and AGENT_PERSONA to the token, so the two dominant feed
   * writers — the gate pipeline and the activity supervisor — label every line
   * they emit with it. The comment there says what is and is not covered.
   *
   * Unique per RUN, never a literal, and BUG-050 is why: tests/pipeline once
   * searched for the fixed string `canary-must-not-escape`, an agent WROTE
   * ABOUT the check in the feed, and the canary went permanently red accusing
   * the suite of the pollution it was reading in its own prose.
   */
  static escapeToken(scenario: string): string {
    return `canary-must-not-escape-${scenario}-${process.pid}-${Date.now()}`
  }
}
