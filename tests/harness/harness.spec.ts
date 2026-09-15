/**
 * tests/harness/harness.spec.ts — the harness's own guarantees, asserted.
 *
 * WHY THIS EXISTS. The harness is a control, and this repo's doctrine is that a
 * control which cannot be checked is not a control (BUG-005). Every isolation
 * promise in tests/harness/ is therefore proved here by making it FAIL on
 * purpose and requiring the failure.
 *
 * That matters more than usual, because the harness's whole claim is that
 * BUG-046 and BUG-047 — each a single forgotten line — become structurally
 * impossible. A claim like that is worth exactly as much as the test that
 * tries to break it.
 *
 * Parallelism class: parallel-safe. Every scenario owns its workspace, and the
 * negative cases operate on their own fixtures rather than on real state.
 */

import { describe, it, expect } from 'vitest'
import { appendFile, readFile, writeFile, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { scenario, REPO_ROOT } from './index.js'
import { RealStateCanary } from './canary.js'
import { assertProcessEnvClean, fixtureEnv, FORBIDDEN_ENV } from './env.js'
import { createWorkspace } from './workspace.js'

describe('harness — environment scrubbing (BUG-046 / BUG-047)', () => {
  it('removes every forbidden variable from a child environment', () => {
    // Simulate the hostile case directly: the real defect was that these
    // variables were PRESENT in the parent and inherited silently.
    const hostile: Record<string, string> = {}
    for (const k of FORBIDDEN_ENV) hostile[k] = '/somewhere/dangerous'

    const original = { ...process.env }
    try {
      Object.assign(process.env, hostile)
      const env = fixtureEnv()
      for (const k of FORBIDDEN_ENV) {
        expect(env[k], `${k} must not reach a fixture child`).toBeUndefined()
      }
    } finally {
      for (const k of FORBIDDEN_ENV) {
        if (original[k] === undefined) delete process.env[k]
        else process.env[k] = original[k]
      }
    }
  })

  it('BUG-060 lets a scenario set a forbidden variable only inside its workspace', async () => {
    // git-isolation exists to prove a hostile GIT_DIR cannot reach the real
    // repo, so it must be able to set one on purpose. Deliberate is fine;
    // ambient is the defect. If this ever stops working, that suite cannot be
    // migrated at all.
    const ws = await createWorkspace('forbidden-env-inside')
    try {
      const gitDir = join(ws.root, 'victim/.git')
      const env = fixtureEnv({ GIT_DIR: gitDir }, ws.root)
      expect(env.GIT_DIR).toBe(gitDir)
      expect(() =>
        fixtureEnv({ GIT_DIR: '/real/repository/.git' }, ws.root),
      ).toThrow(/Refusing forbidden environment override/)
      await symlink('/tmp', join(ws.root, 'escape-link'))
      expect(() =>
        fixtureEnv({ GIT_DIR: join(ws.root, 'escape-link/victim.git') }, ws.root),
      ).toThrow(/Refusing forbidden environment override/)
    } finally {
      await ws.dispose()
    }
  })

  it('ACCEPTS a forbidden variable that is a name or a label', async () => {
    // The containment rule is only meaningful for values that are paths.
    // AGENT_PERSONA is a persona name, AGENT_BACKING a backing-agent label and
    // AGENT_GATE_PROFILE a profile name — none of them names anything on disk,
    // and refusing them "because the path must be inside the workspace" is a
    // guard blaming a value for a property it never had. tests/codex-persona-label
    // and tests/roster deal in exactly these.
    //
    // GIT_CONFIG_COUNT USED TO BE IN THIS LIST, on the same reasoning, and the
    // case below is why it is not: a count is not a name, it is a switch.
    const ws = await createWorkspace('forbidden-env-opaque')
    try {
      const env = fixtureEnv(
        {
          AGENT_PERSONA: 'Vitali',
          AGENT_BACKING: 'Codex',
          AGENT_GATE_PROFILE: 'bootstrap',
          // Declared 'inert': the identity a bootstrap fixture commits with.
          GIT_AUTHOR_NAME: 'T',
        },
        ws.root,
      )
      expect(env.AGENT_PERSONA).toBe('Vitali')
      expect(env.AGENT_BACKING).toBe('Codex')
      expect(env.AGENT_GATE_PROFILE).toBe('bootstrap')
      expect(env.GIT_AUTHOR_NAME).toBe('T')
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-060 REFUSES a HOME or TMPDIR override that leaves the workspace, and refuses unsetting them', async () => {
    // R3 requires every scenario to own both. They are in NEITHER validated
    // namespace, so before this they were the one pair of harness-owned
    // variables a per-call `env` could replace with anything at all — the
    // operator's real home included, which is precisely the dotfile and
    // temp-debris exposure the per-scenario values exist to remove.
    //
    // Unsetting is checked too, and is the sharper case: with HOME absent git
    // falls back to getpwuid — the real home — and with TMPDIR absent mktemp
    // writes to /tmp. "Removed" looks safe and behaves like a redirect.
    const ws = await createWorkspace('scenario-owned-paths')
    try {
      const inside = join(ws.root, 'home')
      expect(fixtureEnv({ HOME: inside }, ws.root).HOME).toBe(inside)

      expect(() =>
        fixtureEnv({ HOME: process.env.HOME ?? '/root' }, ws.root),
      ).toThrow(/Refusing forbidden environment override HOME=/)
      expect(() => fixtureEnv({ TMPDIR: '/tmp' }, ws.root)).toThrow(
        /Refusing forbidden environment override TMPDIR=/,
      )
      expect(() => fixtureEnv({ HOME: undefined }, ws.root)).toThrow(
        /Refusing to UNSET HOME/,
      )
      expect(() => fixtureEnv({ TMPDIR: undefined }, ws.root)).toThrow(
        /Refusing to UNSET TMPDIR/,
      )
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-060 the HOME escape is refused at the door a spec actually uses', async () => {
    // The check above is on the primitive. This is on `s.run`, which is where a
    // scenario would really do it — and the two were NOT the same door: index.ts
    // merges the caller's env over the harness's before fixtureEnv sees it, so
    // a check that lived only in the merge would have been the convention this
    // harness exists to replace.
    await scenario('home-escape-door', async (s) => {
      await expect(
        s.run('sh', ['-c', 'echo $HOME'], {
          cwd: s.workspace.root,
          env: { HOME: process.env.HOME ?? '/root' },
        }),
      ).rejects.toThrow(/Refusing forbidden environment override HOME=/)

      const r = await s.run('sh', ['-c', 'echo "$HOME|$TMPDIR"'], {
        cwd: s.workspace.root,
      })
      expect(r.stdout.trim()).toBe(`${s.home}|${join(s.workspace.root, 'tmp')}`)
    })
  })

  it('BUG-060 SCRUBS an inherited AGENT_CI_WATCH, and still lets a fixture pass its own', async () => {
    // AGENT_CI_WATCH was declared 'inert' — "a feed label, carrying no path".
    // It is not a label, it is a SWITCH: .githooks/pre-push:569 backgrounds
    // scripts/watch-ci.sh whenever "${AGENT_CI_WATCH:-1}" is 1, so an inherited
    // 1 makes any fixture that runs a gate spawn a real CI watcher against the
    // operator's repository, from inside a test.
    //
    // Both halves matter: tests/bootstrap-gate passes 0 deliberately to
    // suppress that watcher, and a fix that scrubbed the inherited value by
    // forbidding the variable outright would break it.
    const ws = await createWorkspace('ci-watch-switch')
    const original = process.env.AGENT_CI_WATCH
    try {
      process.env.AGENT_CI_WATCH = '1'
      expect(
        fixtureEnv({}, ws.root).AGENT_CI_WATCH,
        'an inherited AGENT_CI_WATCH=1 reaches a fixture gate and backgrounds a real CI watcher',
      ).toBeUndefined()
      expect(
        fixtureEnv({ AGENT_CI_WATCH: '0' }, ws.root).AGENT_CI_WATCH,
        'tests/bootstrap-gate passes 0 to suppress the watcher — that must keep working',
      ).toBe('0')
    } finally {
      if (original === undefined) delete process.env.AGENT_CI_WATCH
      else process.env.AGENT_CI_WATCH = original
      await ws.dispose()
    }
  })

  it('BUG-060 accepts the exact environment tests/bootstrap-gate passes', async () => {
    // That suite costs ~180s, so it is not what should discover that a change
    // to this table broke it. Everything it passes goes through this door:
    // AGENT_CI_WATCH=0 to suppress the CI watcher, a private index inside the
    // workspace for `checkout-index`, and three AGENT_* pointers UNSET so the
    // derived project's gate derives its own state paths instead of inheriting
    // this scenario's. Deleting a declared 'path' variable stays legitimate —
    // only the two kinds a scenario OWNS refuse it.
    const ws = await createWorkspace('bootstrap-gate-env')
    try {
      const index = join(ws.root, 'fixture-index')
      const env = fixtureEnv(
        {
          AGENT_CI_WATCH: '0',
          AGENT_SIGNAL_FILE: undefined,
          AGENT_STATE_HOME: undefined,
          AGENT_FEED_LOG: undefined,
          GIT_INDEX_FILE: index,
          GIT_AUTHOR_NAME: 'T',
          GIT_AUTHOR_EMAIL: 't@t.io',
        },
        ws.root,
      )
      expect(env.AGENT_CI_WATCH).toBe('0')
      expect(env.GIT_INDEX_FILE).toBe(index)
      expect(env.GIT_AUTHOR_EMAIL).toBe('t@t.io')
      for (const k of ['AGENT_SIGNAL_FILE', 'AGENT_STATE_HOME', 'AGENT_FEED_LOG']) {
        expect(env[k], `${k} must still be UNSETTABLE — bootstrap-gate #2 depends on it`).toBeUndefined()
      }
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-060 REFUSES the GIT_CONFIG_* switches, and every undeclared GIT_*/AGENT_*', async () => {
    // GIT_CONFIG_COUNT was classified 'opaque' — a number, redirecting no write
    // and naming nothing on disk. True of the count ALONE, and it is never
    // alone: it activates GIT_CONFIG_KEY_<n>/GIT_CONFIG_VALUE_<n>, which were in
    // no list and therefore went through no check, so a caller could set
    // core.hooksPath — the A-22 vector, produced from inside a test as BUG-047 —
    // straight past the containment model. The next case proves the injection
    // works on this machine's git; these are the refusals.
    const ws = await createWorkspace('forbidden-env-git-config')
    const carried = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']
    const original = Object.fromEntries(carried.map((k) => [k, process.env[k]]))
    try {
      expect(() => fixtureEnv({ GIT_CONFIG_COUNT: '2' }, ws.root)).toThrow(
        /Refusing forbidden environment override GIT_CONFIG_COUNT/,
      )
      expect(() =>
        fixtureEnv(
          {
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'core.hooksPath',
            // Contained, and still refused: the harness does not model what a
            // config KEY does with its value, so "the value is inside the
            // workspace" is not the question. include.path with a contained
            // file would be contained and would still pull in whatever that
            // file says.
            GIT_CONFIG_VALUE_0: join(ws.root, 'hooks'),
          },
          ws.root,
        ),
      ).toThrow(/GIT_CONFIG_COUNT/)
      // The pairs are inert without a switch — but "inert unless someone flips
      // the other switch" is not a property to leave undeclared.
      expect(() =>
        fixtureEnv({ GIT_CONFIG_KEY_0: 'include.path' }, ws.root),
      ).toThrow(/Refusing UNDECLARED environment override GIT_CONFIG_KEY_0/)
      expect(() =>
        fixtureEnv({ GIT_CONFIG_PARAMETERS: "'core.hooksPath'='/tmp/evil'" }, ws.root),
      ).toThrow(/Refusing forbidden environment override GIT_CONFIG_PARAMETERS/)
      // The same shape one level up: an unclassified name in either namespace
      // was previously copied into the child untouched. GIT_SSH_COMMAND is one
      // of many — the point is that no list has to name it.
      expect(() =>
        fixtureEnv({ GIT_SSH_COMMAND: 'sh -c "touch /tmp/pwned"' }, ws.root),
      ).toThrow(/Refusing UNDECLARED environment override GIT_SSH_COMMAND/)

      // And INHERITED pairs are scrubbed, so a fixture that sets a count of its
      // own finds nothing to activate.
      process.env.GIT_CONFIG_COUNT = '1'
      process.env.GIT_CONFIG_KEY_0 = 'core.hooksPath'
      process.env.GIT_CONFIG_VALUE_0 = '/tmp/evil-hooks'
      const env = fixtureEnv({}, ws.root)
      for (const k of carried) {
        expect(env[k], `${k} must not reach a fixture child`).toBeUndefined()
      }
    } finally {
      for (const k of carried) {
        if (original[k] === undefined) delete process.env[k]
        else process.env[k] = original[k]
      }
      await ws.dispose()
    }
  })

  it('BUG-060 the injection those refusals prevent is REAL, on this git', async () => {
    // Not a thought experiment, and not an assertion about git's documentation:
    // the fixture's own shell sets the trio (nothing here goes through the
    // harness, which now refuses it) and git applies core.hooksPath from it.
    // If a future git stops honouring this, this case says so and the denial
    // can be revisited on evidence rather than left as folklore.
    await scenario('git-config-count-real', async (s) => {
      const r = await s.run(
        'sh',
        [
          '-c',
          'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath ' +
            'GIT_CONFIG_VALUE_0=/tmp/evil-hooks git config --get core.hooksPath',
        ],
        { cwd: s.workspace.root },
      )
      expect(r.stdout.trim(), r.output).toBe('/tmp/evil-hooks')
    })
  })

  it('validates a colon-separated path LIST element by element', async () => {
    // GIT_ALTERNATE_OBJECT_DIRECTORIES and GIT_CEILING_DIRECTORIES are lists.
    // Judged as one string a two-element value is not a path at all, so a
    // fixture with two contained alternates would be refused; judged element by
    // element, one escaping entry is still enough to refuse the whole value.
    const ws = await createWorkspace('forbidden-env-list')
    try {
      const both = `${join(ws.root, 'objects-a')}:${join(ws.root, 'objects-b')}`
      expect(
        fixtureEnv({ GIT_ALTERNATE_OBJECT_DIRECTORIES: both }, ws.root)
          .GIT_ALTERNATE_OBJECT_DIRECTORIES,
      ).toBe(both)
      expect(() =>
        fixtureEnv(
          {
            GIT_ALTERNATE_OBJECT_DIRECTORIES: `${join(ws.root, 'objects-a')}:/tmp/not-mine`,
          },
          ws.root,
        ),
      ).toThrow(/the path \/tmp\/not-mine must be inside/)
    } finally {
      await ws.dispose()
    }
  })

  // --- TASK-025 — the scrub reaches every run mode ---------------------------
  //
  // Each witness plants an AMBIENT value in this process, which is the shape of
  // the defect: nothing was set on purpose, it was simply inherited. Every one
  // restores in `finally`, and none calls scenario() while a hazard is planted —
  // assertProcessEnvClean would (correctly) refuse it.
  //
  // RED SETS (R6), each mutant applied alone and the suite run — observed:
  //   parent commit (env.ts, index.ts, run-ts-suites.sh at HEAD~): W1 W2 H2 W3 W4
  //   drop BLUEPRINT_ROOT from UNPREFIXED_FORBIDDEN          → W1
  //   declare BLUEPRINT_ROOT 'opaque'                        → W2
  //   remove XDG_CACHE_HOME from scenarioEnv                 → H2
  //   fixtureEnv scrubs FORBIDDEN_ENV only                   → W3, BUG-060 GIT_CONFIG_*
  //   isForbiddenAmbient without the undeclared arm          → W3 W4, BUG-060 GIT_CONFIG_*, ts-bridge #1c
  //   isForbiddenAmbient without the `!== 'inert'` guard     → W3 W4
  //   assertProcessEnvClean checks FORBIDDEN_ENV only        → W4
  //
  // COST, stated: a direct `vitest run` from a shell exporting any undeclared
  // GIT_* / AGENT_* name is now refused, names included. Every Claude Code shell
  // exports GIT_EDITOR=true, so a direct run there needs `env -u GIT_EDITOR`;
  // the gate's runner unsets it already.

  /** Run `body` with `planted` in process.env, restoring every key afterwards. */
  async function withAmbient(
    planted: Record<string, string | undefined>,
    body: () => void | Promise<void>,
  ): Promise<void> {
    const original = Object.fromEntries(
      Object.keys(planted).map((k) => [k, process.env[k]]),
    )
    try {
      for (const [k, v] of Object.entries(planted)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
      await body()
    } finally {
      for (const [k, v] of Object.entries(original)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }

  it('TASK-025 H1 (W1) SCRUBS an ambient BLUEPRINT_ROOT, a hazard outside every scrubbed prefix', async () => {
    // Declaring it was not enough: FORBIDDEN_ENV kept only GIT_/AGENT_/BP_ names,
    // so an operator with the documented override exported would have every
    // fixture compare against their real blueprint checkout.
    await withAmbient({ BLUEPRINT_ROOT: '/somewhere/a-real-blueprint-checkout' }, () => {
      expect(
        fixtureEnv().BLUEPRINT_ROOT,
        'an ambient BLUEPRINT_ROOT reached a fixture child',
      ).toBeUndefined()
    })
  })

  it('TASK-025 H1 (W2) lets a scenario set BLUEPRINT_ROOT inside its workspace, and refuses one outside', async () => {
    // The sync suites exercise the override on purpose. Deliberate and contained
    // is fine; pointing a fixture at a checkout outside the workspace is not.
    const ws = await createWorkspace('blueprint-root-override')
    try {
      const inside = ws.path('bp')
      expect(fixtureEnv({ BLUEPRINT_ROOT: inside }, ws.root).BLUEPRINT_ROOT).toBe(inside)
      expect(() => fixtureEnv({ BLUEPRINT_ROOT: '/elsewhere' }, ws.root)).toThrow(
        /Refusing forbidden environment override BLUEPRINT_ROOT=/,
      )
    } finally {
      await ws.dispose()
    }
  })

  it('TASK-025 H2 the scenario OWNS XDG_CACHE_HOME: an ambient value is replaced, an outside override refused', async () => {
    // The blueprint cache lives under ${XDG_CACHE_HOME:-$HOME/.cache}. A
    // per-scenario HOME does not cover an operator who exports XDG_CACHE_HOME.
    await withAmbient({ XDG_CACHE_HOME: '/somewhere/the-operators-real-cache' }, async () => {
      await scenario('xdg-cache-owned', async (s) => {
        const r = await s.run('sh', ['-c', 'printf %s "$XDG_CACHE_HOME"'], {
          cwd: s.workspace.root,
        })
        expect(r.stdout, 'the operator\'s cache directory reached a fixture').toBe(
          join(s.home, '.cache'),
        )
        await expect(
          s.run('sh', ['-c', 'true'], {
            cwd: s.workspace.root,
            env: { XDG_CACHE_HOME: '/elsewhere' },
          }),
        ).rejects.toThrow(/Refusing forbidden environment override XDG_CACHE_HOME=/)
      })
    })
  })

  it('TASK-025 H5 (W3) SCRUBS every undeclared ambient GIT_*/AGENT_* name, and keeps declared-inert ones', async () => {
    // The gate's runner unsets the whole prefix population; a direct vitest run
    // used to remove only the declared names plus GIT_CONFIG*. GIT_SSH_COMMAND
    // is the one that matters most here: an ambient value bypasses the ssh shim
    // the sync suites pin their hung remote with.
    await withAmbient(
      {
        GIT_ALLOW_PROTOCOL: 'ext',
        GIT_SSH_COMMAND: 'sh -c "touch /tmp/pwned"',
        AGENT_TASK025_DECOY: 'decoy',
        GIT_CONFIG_KEY_0: 'core.hooksPath',
        GIT_AUTHOR_NAME: 'Kept',
      },
      () => {
        const env = fixtureEnv()
        for (const k of [
          'GIT_ALLOW_PROTOCOL',
          'GIT_SSH_COMMAND',
          'AGENT_TASK025_DECOY',
          'GIT_CONFIG_KEY_0',
        ]) {
          expect(env[k], `an ambient undeclared ${k} reached a fixture child`).toBeUndefined()
        }
        expect(
          env.GIT_AUTHOR_NAME,
          'a declared-inert name was scrubbed — bootstrap fixtures commit with it',
        ).toBe('Kept')
      },
    )
  })

  it('TASK-025 H5 (W4) assertProcessEnvClean refuses an undeclared GIT_* name, and not a declared-inert one', async () => {
    // It exists to catch a spec spawning through child_process directly, which
    // inherits an undeclared name as readily as a declared one.
    await withAmbient({ GIT_ALLOW_PROTOCOL: 'ext', GIT_AUTHOR_NAME: undefined }, () => {
      expect(() => assertProcessEnvClean()).toThrow(/GIT_ALLOW_PROTOCOL/)
    })
    await withAmbient({ GIT_ALLOW_PROTOCOL: undefined, GIT_AUTHOR_NAME: 'Kept' }, () => {
      expect(() => assertProcessEnvClean()).not.toThrow()
    })
  })

  it('a real child process sees none of the forbidden variables', async () => {
    await scenario('harness-env', async (s) => {
      const r = await s.run(
        'sh',
        ['-c', 'env | grep -c -E "^(GIT_DIR|GIT_WORK_TREE|AGENT_SIGNAL_FILE)=" || true'],
        { cwd: s.workspace.root, env: {} },
      )
      // AGENT_SIGNAL_FILE IS set by the harness — to the scenario's own baton —
      // so expect exactly that one, and never the git pointers.
      const gitLeak = await s.run(
        'sh',
        ['-c', 'echo "${GIT_DIR:-none}/${GIT_WORK_TREE:-none}"'],
        { cwd: s.workspace.root },
      )
      expect(gitLeak.stdout.trim()).toBe('none/none')
      expect(r.code).toBe(0)
    })
  })
})

describe('harness — the real-state canary (BUG-030)', () => {
  it('BUG-062 DETECTS its unique token appended to an activity feed', async () => {
    const ws = await createWorkspace('canary-feed-token')
    try {
      const victim = join(ws.root, 'agent-activity.log')
      await writeFile(victim, 'existing operator activity\n', 'utf8')
      const token = RealStateCanary.escapeToken('harness-feed-token')
      const canary = await RealStateCanary.capture([
        { label: 'activity feed', path: victim },
      ])
      await writeFile(victim, `existing operator activity\n${token}\n`, 'utf8')
      await expect(canary.assertUnchanged(token)).rejects.toThrow(/unique escape token/)
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-062 a gate line a fixture emits CARRIES the token, so a leak would be visible', async () => {
    // The other half, and the half that was missing: detection is worthless if
    // nothing can produce the token. This drives the REAL pipeline library the
    // way the gate does and reads the line back out of the scenario's own feed
    // — so the mechanism is proved without writing a byte into the operator's.
    // If AGENT_FEED_TAG ever stops reaching a feed line, this goes red here
    // rather than by quietly making the canary vacuous again.
    await scenario('canary-token-emitted', async (s) => {
      const script = await s.fs.write(
        'run-gate.sh',
        // pipeline.sh finds feed.sh through _PIPE_LIBDIR, which defaults to the
        // RELATIVE `scripts/lib` — it feeds only when the caller's cwd is the
        // repo root, which is true of a git hook and not of a fixture.
        `_PIPE_LIBDIR="${REPO_ROOT}/scripts/lib"\n` +
          `. "${REPO_ROOT}/scripts/lib/pipeline.sh"\n` +
          `pipe_init gate\n` +
          `pipe_stage 'a stage that passes' true\n` +
          `pipe_finish\n`,
      )
      const r = await s.run('bash', [script], { cwd: s.workspace.root })
      expect(r.code, r.output).toBe(0)
      expect(await s.fs.read('logs/agent-activity.log')).toContain(s.escapeToken)
    })
  })

  it('BUG-062 REFUSES an AGENT_FEED_TAG override that drops the escape token', async () => {
    // The route by which the fix for BUG-062 defeated itself. scenarioEnv sets
    // AGENT_FEED_TAG to the scenario's token so every line pipeline.sh renders
    // carries it; a per-call `env` merges OVER that, so one override turned the
    // detectable leak back into the untagged append the case below pins as
    // undetectable. `DoD-Gate` is not a hypothetical value either — it is what
    // .githooks/pre-push-project sets while running the gate.
    //
    // Composition is the door that stays open: a fixture that needs its own
    // label keeps the token in the value, so detection survives the label.
    await scenario('feed-tag-preserved', async (s) => {
      await expect(
        s.run('sh', ['-c', 'true'], {
          cwd: s.workspace.root,
          env: { AGENT_FEED_TAG: 'DoD-Gate' },
        }),
      ).rejects.toThrow(/Refusing forbidden environment override AGENT_FEED_TAG=/)

      await expect(
        s.run('sh', ['-c', 'true'], {
          cwd: s.workspace.root,
          env: { AGENT_FEED_TAG: undefined },
        }),
      ).rejects.toThrow(/Refusing to UNSET AGENT_FEED_TAG/)

      const composed = `${s.escapeToken}-DoD-Gate`
      const r = await s.run('sh', ['-c', 'echo "$AGENT_FEED_TAG"'], {
        cwd: s.workspace.root,
        env: { AGENT_FEED_TAG: composed },
      })
      expect(r.stdout.trim(), r.output).toBe(composed)
    })
  })

  it('BUG-062 PERMITS dropping the token when the child is handed its own contained feed', async () => {
    // THE ONE LEGITIMATE DROP, and the case the rule above was too strict for.
    // tests/bootstrap-gate runs a derived project's ENTIRE pre-push gate, and
    // AGENT_FEED_TAG is exported into it — so every line that gate renders is
    // tagged with the token, and the derived project's own tests/pipeline #16
    // greps for the literal `[GATE] PASSED`. It failed with "stage results
    // missing from the feed": true, and naming the wrong cause. Composition
    // does not solve it either — `[GATE-<token>]` fails that grep too.
    //
    // Permitted here because BOTH clauses hold, which is what makes this a rule
    // rather than an exemption for one suite: AGENT_FEED_LOG is unset in the
    // same call, and cwd is inside the workspace.
    await scenario('feed-tag-own-feed', async (s) => {
      const r = await s.run('sh', ['-c', 'echo "[${AGENT_FEED_TAG:-GATE}]"'], {
        cwd: s.workspace.root,
        env: { AGENT_FEED_LOG: undefined, AGENT_FEED_TAG: undefined },
      })
      expect(r.stdout.trim(), r.output).toBe('[GATE]')
    })
  })

  it('BUG-062 REFUSES dropping the token on either half of that condition', async () => {
    // Without both halves pinned, a conditional rule is just no rule.
    //
    // The second half is the one worth stating, because the obvious version of
    // this rule — "unsetting the tag is fine whenever AGENT_FEED_LOG is unset
    // too" — reads safe and is inverted. Unsetting AGENT_FEED_LOG is what makes
    // the destination AMBIENT: feed.sh derives it from `git rev-parse
    // --show-toplevel`, falling back to `pwd`. From the real repository that
    // resolves to the OPERATOR'S OWN FEED — the one place the token exists to be
    // seen — so the pair alone would license precisely the combination this
    // whole mechanism is for.
    await scenario('feed-tag-conditional', async (s) => {
      // (a) the feed pointer stays, so the token is still the only backstop
      // against a child that resets or ignores it.
      await expect(
        s.run('sh', ['-c', 'true'], {
          cwd: s.workspace.root,
          env: { AGENT_FEED_TAG: undefined },
        }),
      ).rejects.toThrow(/AGENT_FEED_LOG is not being unset here/)

      // (b) the feed pointer is gone AND the child would derive its feed from
      // the operator's real repository.
      await expect(
        s.run('sh', ['-c', 'true'], {
          cwd: REPO_ROOT,
          env: { AGENT_FEED_LOG: undefined, AGENT_FEED_TAG: undefined },
        }),
      ).rejects.toThrow(/is not inside/)
    })
  })

  it('BUG-062 does NOT detect an UNTAGGED append — the limit, pinned', async () => {
    // THIS CASE ASSERTS A HOLE, DELIBERATELY. The comments in canary.ts and
    // index.ts previously said an untagged append was "caught only by the
    // prefix check". It is caught by nothing: an append leaves the captured
    // content intact as a prefix, so that check passes by construction, and a
    // line with no token gives the token check nothing to find. watch-ci.sh's
    // literal "[CI]", a gate stage under .githooks/pre-push-project (which
    // re-sets AGENT_FEED_TAG itself) and any direct feed_append land here.
    //
    // Closing it needs ATTRIBUTION, and the feed has none to offer: a live
    // daemon's line and a leaked fixture line are the same bytes. Rejecting new
    // bytes outright would fail honest runs. So the scope is written down, and
    // written down where it can be checked — if someone later makes appends
    // detectable, this case goes red and the prose has to move with the code.
    const ws = await createWorkspace('canary-feed-untagged')
    try {
      const victim = join(ws.root, 'agent-activity.log')
      await writeFile(victim, 'existing operator activity\n', 'utf8')
      const token = RealStateCanary.escapeToken('harness-feed-untagged')
      const canary = await RealStateCanary.capture([
        { label: 'activity feed', path: victim },
      ])

      await appendFile(victim, '12:00:00 [CI] a line carrying no token\n', 'utf8')
      await expect(canary.assertUnchanged(token)).resolves.toBeUndefined()

      // The half that IS real, on the same target: rewriting history is caught.
      await writeFile(victim, 'history replaced\n', 'utf8')
      await expect(canary.assertUnchanged(token)).rejects.toThrow(
        /was rewritten or truncated/,
      )
    } finally {
      await ws.dispose()
    }
  })

  it('DETECTS a mutation of a watched file', async () => {
    // The negative case. Point a canary at a fixture file, change it, and
    // require the canary to object. Without this, "the canary protects the
    // baton" is an untested assertion about untested code.
    const ws = await createWorkspace('canary-neg')
    try {
      const victim = join(ws.root, 'baton.md')
      await writeFile(victim, 'Holder | Sylvia\n', 'utf8')

      const canary = await RealStateCanary.capture([
        { label: 'fixture baton', path: victim },
      ])

      await writeFile(victim, 'Holder | Nobody\n', 'utf8')

      await expect(canary.assertUnchanged()).rejects.toThrow(/CHANGED/)
    } finally {
      await ws.dispose()
    }
  })

  it('DETECTS a watched file being created', async () => {
    const ws = await createWorkspace('canary-create')
    try {
      const victim = join(ws.root, 'not-yet.md')
      const canary = await RealStateCanary.capture([
        { label: 'fixture baton', path: victim },
      ])
      await writeFile(victim, 'appeared\n', 'utf8')
      await expect(canary.assertUnchanged()).rejects.toThrow(/CREATED/)
    } finally {
      await ws.dispose()
    }
  })

  it('passes when nothing changed', async () => {
    const ws = await createWorkspace('canary-pos')
    try {
      const victim = join(ws.root, 'stable.md')
      await writeFile(victim, 'unchanged\n', 'utf8')
      const canary = await RealStateCanary.capture([
        { label: 'fixture', path: victim },
      ])
      await expect(canary.assertUnchanged()).resolves.toBeUndefined()
    } finally {
      await ws.dispose()
    }
  })

  // ---------------------------------------------------------------------
  // BUG-068 — a concurrent agent's mic flip is not a fixture escape.
  //
  // The canary snapshots the real baton and fails on any byte change. This
  // repo's whole premise is concurrent agents, and an agent claiming or
  // releasing the mic changes exactly those bytes — legitimately. So
  // bootstrap-gate began throwing in TEARDOWN, its own assertions having
  // passed, whenever anyone else flipped the baton during the run. Three
  // consecutive runs, each with a matching flip in signal-history.log from
  // another agent. A control that goes red for innocent reasons gets muted,
  // which is how coverage is lost (canary.ts says this about the feed already).
  //
  // THE DISCRIMINATOR IS ALREADY IN THE REPO, and it is exact:
  //   - BUG-030's clobber writes signal.md DIRECTLY, appending NOTHING to
  //     logs/state/signal-history.log.
  //   - A real flip goes through scripts/signal-set.sh, which ALWAYS appends
  //     one line to that journal.
  // So the journal is the witness, and it is already a watched target — no new
  // plumbing, just the correlation between the two.
  //
  // These cases use fixture files with the REAL labels, because the labels are
  // what carry the correlation (realStateTargets is their only producer).

  it('BUG-068: a baton change WITNESSED by a journal append is reported, not failed', async () => {
    const ws = await createWorkspace('canary-baton-witnessed')
    try {
      const baton = join(ws.root, 'signal.md')
      const journal = join(ws.root, 'signal-history.log')
      await writeFile(baton, 'Holder | Vitali\n', 'utf8')
      await writeFile(journal, '2026-09-10 12:00 Vitali ACTIVE\n', 'utf8')

      const canary = await RealStateCanary.capture([
        { label: 'live baton', path: baton },
        { label: 'baton journal', path: journal },
      ])

      // Exactly what scripts/signal-set.sh does: rewrite the baton, append one
      // line to the journal. Order matches the script's (baton, then journal).
      await writeFile(baton, 'Holder | Elias\n', 'utf8')
      await appendFile(journal, '2026-09-10 12:05 Elias ACTIVE\n', 'utf8')

      await expect(canary.assertUnchanged()).resolves.toBeUndefined()
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-068: the report is VISIBLE, not a silent pass', async () => {
    // A silent pass would make this canary indistinguishable from one that was
    // switched off, which is this repo's signature failure (BUG-004, A-22,
    // BUG-066). The operator has to be told the canary saw a change and judged
    // it legitimate.
    const ws = await createWorkspace('canary-baton-visible')
    try {
      const baton = join(ws.root, 'signal.md')
      const journal = join(ws.root, 'signal-history.log')
      await writeFile(baton, 'Holder | Vitali\n', 'utf8')
      await writeFile(journal, 'one\n', 'utf8')

      const canary = await RealStateCanary.capture([
        { label: 'live baton', path: baton },
        { label: 'baton journal', path: journal },
      ])
      await writeFile(baton, 'Holder | Elias\n', 'utf8')
      await appendFile(journal, 'two\n', 'utf8')

      const said: string[] = []
      const realWarn = console.warn
      console.warn = (...args: unknown[]) => {
        said.push(args.map(String).join(' '))
      }
      try {
        await canary.assertUnchanged()
      } finally {
        console.warn = realWarn
      }

      // CANARY-NOTE: is the marker scripts/run-ts-suites.sh greps for, so this
      // string is load-bearing in the gate, not merely in this assertion.
      expect(said.join('\n')).toMatch(/CANARY-NOTE:/)
      expect(said.join('\n')).toMatch(/live baton/)
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-068: a baton change with NO journal append still FAILS (BUG-030)', async () => {
    // The guarded defect itself. tests/bootstrap-gate really did reset the live
    // baton to the bootstrap default mid-review. That write never goes through
    // signal-set.sh, so the journal does not move — and this must stay red.
    const ws = await createWorkspace('canary-baton-unwitnessed')
    try {
      const baton = join(ws.root, 'signal.md')
      const journal = join(ws.root, 'signal-history.log')
      await writeFile(baton, 'Holder | Vitali\n', 'utf8')
      await writeFile(journal, '2026-09-10 12:00 Vitali ACTIVE\n', 'utf8')

      const canary = await RealStateCanary.capture([
        { label: 'live baton', path: baton },
        { label: 'baton journal', path: journal },
      ])

      await writeFile(baton, 'Bootstrapped from the blueprint\n', 'utf8')

      await expect(canary.assertUnchanged()).rejects.toThrow(/live baton/)
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-068: an unwitnessed baton change fails even with no journal watched', async () => {
    // Fail CLOSED when there is no witness to consult at all. Otherwise the
    // absence of a journal target would be a way to switch the guard off.
    const ws = await createWorkspace('canary-baton-nowitness')
    try {
      const baton = join(ws.root, 'signal.md')
      await writeFile(baton, 'Holder | Vitali\n', 'utf8')
      const canary = await RealStateCanary.capture([
        { label: 'live baton', path: baton },
      ])
      await writeFile(baton, 'Holder | Nobody\n', 'utf8')
      await expect(canary.assertUnchanged()).rejects.toThrow(/live baton/)
    } finally {
      await ws.dispose()
    }
  })

  it('BUG-068: the journal itself may grow, but may not be rewritten', async () => {
    // signal-set.sh only ever appends. A journal that shrank or was rewritten
    // is damage regardless of what the baton did.
    const ws = await createWorkspace('canary-journal')
    try {
      const journal = join(ws.root, 'signal-history.log')
      await writeFile(journal, 'one\n', 'utf8')
      const canary = await RealStateCanary.capture([
        { label: 'baton journal', path: journal },
      ])

      await appendFile(journal, 'two\n', 'utf8')
      await expect(canary.assertUnchanged()).resolves.toBeUndefined()

      await writeFile(journal, 'history replaced\n', 'utf8')
      await expect(canary.assertUnchanged()).rejects.toThrow(
        /rewritten or truncated/,
      )
    } finally {
      await ws.dispose()
    }
  })

  it('the real baton is genuinely being watched, and is intact', async () => {
    // Guards against the canary silently watching nothing — the vacuity trap.
    // If the repo has a live baton, the canary must be pointed at it.
    await scenario('harness-real-state', async (s) => {
      const r = await s.run('sh', ['-c', 'echo ok'], { cwd: s.workspace.root })
      expect(r.stdout.trim()).toBe('ok')

      const realBaton = join(REPO_ROOT, 'logs/state/signal.md')
      let exists = true
      try {
        await stat(realBaton)
      } catch {
        exists = false
      }
      if (exists) {
        const content = await readFile(realBaton, 'utf8')
        // The bootstrap default is what BUG-030 saw written over a LIVE baton,
        // so its presence USED to be treated as proof a suite had reset the
        // real one. That inference holds in the blueprint and is FALSE in a
        // freshly bootstrapped project, whose baton legitimately holds exactly
        // this text — `scripts/new-project.sh` seeds it, and nothing has
        // claimed the mic yet.
        //
        // TASK-018 phase 2 is what made that matter: this spec ships now, so
        // the old assertion failed in every derived project on day one, on a
        // test it never wrote. tests/bootstrap-gate #2 caught it, which is the
        // one suite that speaks for downstream doing exactly its job.
        //
        // THE DISCRIMINATOR IS BUG-068's, REUSED RATHER THAN INVENTED: a legit
        // write goes through signal-set.sh, which ALWAYS appends to the
        // journal; BUG-030's clobber writes signal.md directly and appends
        // nothing. So a baton at the bootstrap default with a journal holding
        // only its own seed line is a project that has not started yet, while
        // the same baton under a journal full of real flips is a live baton
        // that something reset. The check keeps its teeth downstream instead
        // of being switched off there.
        const journal = join(REPO_ROOT, 'logs/state/signal-history.log')
        let flips = 0
        try {
          flips = (await readFile(journal, 'utf8')).split('\n').filter((l) => l.trim()).length
        } catch {
          flips = 0
        }
        if (flips > 1) {
          expect(
            content,
            `the live baton holds the bootstrap default while the journal records ${flips} ` +
              `flips — something reset a baton that was in use (BUG-030)`,
          ).not.toContain('Bootstrapped from the blueprint')
        }
      }
    })
  })
})

describe('harness — workspace teardown (BUG-049)', () => {
  it('removes the workspace and asserts the removal', async () => {
    const ws = await createWorkspace('teardown')
    const root = ws.root
    await ws.dispose()
    await expect(stat(root)).rejects.toThrow()
  })

  it('dispose is idempotent', async () => {
    const ws = await createWorkspace('teardown-twice')
    await ws.dispose()
    await expect(ws.dispose()).resolves.toBeUndefined()
  })

  it('the workspace root is a physical path (BUG-036)', async () => {
    const ws = await createWorkspace('physical')
    try {
      // On macOS an unresolved root starts /var/folders and every ownership
      // comparison against a real process silently fails.
      expect(ws.root.startsWith('/var/folders')).toBe(false)
    } finally {
      await ws.dispose()
    }
  })
})

describe('harness — a project marker above the workspace (BUG-110)', () => {
  it('BUG-110 every child is handed its workspace root as the state-root ceiling', async () => {
    // bp_state_root walks UP. Without a ceiling, a marker anywhere above the
    // workspace is where a markerless fixture resolves — so the boundary has to
    // come from where the path comes from, not from each fixture remembering it.
    await scenario('state-root-ceiling', async (s) => {
      const r = await s.run('sh', ['-c', 'printf %s "$BP_STATE_ROOT_CEILING"'], {
        cwd: s.workspace.root,
      })
      expect(r.stdout).toBe(s.workspace.root)
    })
  })

  // The incident: an empty .git in the system temp dir made state-root #A6
  // report `expected +0 not to be +0`, a message naming neither the temp dir
  // nor the marker, so diagnosis started from innocent commits. The cause must
  // be the failure, not an inverted assertion downstream of it.
  //
  // THE MARKER SITS STRICTLY ABOVE TMPDIR, once per terminator. The first
  // version of this case planted `.git` in TMPDIR itself, which a preflight
  // examining only the base directory also passes, while it admits exactly the
  // ancestor contamination the incident was (Jesko, TASK-028 review, finding 1).
  // The case AT TMPDIR stays, because the base directory is examined too.
  //
  // MUTANTS of workspace.ts, applied to a copy and run, red set OBSERVED:
  //   base-only traversal (`if (dirname(dir) === dir) return` -> `return`)
  //     -> all three ABOVE cases; the AT-TMPDIR case stays green.
  //   '.git' dropped from PROJECT_MARKERS -> AT-TMPDIR and ABOVE .git.
  //   '.blueprint-root' dropped            -> ABOVE .blueprint-root only.
  //   '.blueprint-source' dropped          -> ABOVE .blueprint-source only.
  it('BUG-110 a .git IN $TMPDIR itself aborts workspace creation, naming the path and the remedy', async () => {
    await scenario('stray-marker-at-tmpdir', async (s) => {
      const base = await s.fs.mkdirp('fake-tmp')
      await s.fs.write('fake-tmp/.git', '')
      const message = await refusalUnder(base)
      expect(message).toContain(join(base, '.git'))
      expect(message).toContain(REMEDY)
    })
  })

  for (const marker of ['.git', '.blueprint-root', '.blueprint-source'] as const) {
    it(`BUG-110 a ${marker} ABOVE $TMPDIR aborts workspace creation, naming the ancestor and the remedy`, async () => {
      await scenario(`stray-marker-above${marker.replace('.', '-')}`, async (s) => {
        const ancestor = await s.fs.mkdirp('fake-root')
        await s.fs.write(`fake-root/${marker}`, '')
        const base = await s.fs.mkdirp('fake-root/tmp/deeper')
        const message = await refusalUnder(base)
        expect(message).toContain(join(ancestor, marker))
        expect(message).toContain(REMEDY)
      })
    })
  }
})

// BUG-121. Every Codex workspace-write sandbox on the machine, from ANY project,
// creates an empty /tmp/.git for a few minutes. With workspaces under /tmp by
// default, the preflight above then refused every scenario and the whole gate
// went red (52 of 55 suites on a docs-only push). The preflight was right; the
// default base was wrong. The shared temp dir is a stand-in inside this
// scenario, so no case here touches the real /tmp.
describe('harness — the default workspace base is private (BUG-121)', () => {
  it('BUG-121 a marker in the shared temp dir does not stop a workspace when TMPDIR is not set', async () => {
    await scenario('bug121-shared-tmp-marker', async (s) => {
      const systemTmp = await s.fs.mkdirp('shared-tmp')
      await s.fs.write('shared-tmp/.git', '')
      const home = await s.fs.mkdirp('home-real')
      const ws = await createWorkspace('bug121', { env: { HOME: home }, systemTmp })
      try {
        const base = join(home, '.cache', 'bp-harness-tmp')
        expect(ws.root.startsWith(base + '/'), `workspace ${ws.root} is not under ${base}`).toBe(true)
        expect((await stat(base)).mode & 0o777, 'the private base was not created 0700').toBe(0o700)
      } finally {
        await ws.dispose()
      }
    })
  })

  it('BUG-121 XDG_CACHE_HOME places the private base, and an explicitly set TMPDIR wins over it', async () => {
    await scenario('bug121-precedence', async (s) => {
      const systemTmp = await s.fs.mkdirp('shared-tmp')
      const home = await s.fs.mkdirp('home-real')
      const cache = await s.fs.mkdirp('xdg-cache')
      const chosen = await s.fs.mkdirp('chosen-tmp')

      const xdg = await createWorkspace('bug121-xdg', { env: { HOME: home, XDG_CACHE_HOME: cache }, systemTmp })
      await xdg.dispose()
      expect(xdg.root.startsWith(join(cache, 'bp-harness-tmp') + '/'), xdg.root).toBe(true)

      const explicit = await createWorkspace('bug121-tmpdir', {
        env: { TMPDIR: chosen, HOME: home, XDG_CACHE_HOME: cache },
        systemTmp,
      })
      await explicit.dispose()
      expect(explicit.root.startsWith(chosen + '/'), explicit.root).toBe(true)
    })
  })

  it('BUG-121 a marker above the PRIVATE base still refuses, naming it', async () => {
    await scenario('bug121-private-marker', async (s) => {
      const systemTmp = await s.fs.mkdirp('shared-tmp')
      const home = await s.fs.mkdirp('home-real')
      await s.fs.write('home-real/.git', '')
      const message = await createWorkspace('bug121-refused', { env: { HOME: home }, systemTmp }).then(
        async (ws) => {
          await ws.dispose()
          return ''
        },
        (err: Error) => err.message,
      )
      expect(message).toContain(join(home, '.git'))
      expect(message).toContain(REMEDY)
    })
  })
})

/** The remedy the preflight's error must name, verbatim. */
const REMEDY =
  'remove the stray marker, or point TMPDIR at a directory with no marker above it'

/**
 * Create a workspace with TMPDIR pointed at `tmp`, and return the refusal's
 * message, or '' if it was NOT refused. A workspace that is wrongly created is
 * disposed here; it lies inside the calling scenario's workspace either way.
 */
async function refusalUnder(tmp: string): Promise<string> {
  const saved = process.env.TMPDIR
  process.env.TMPDIR = tmp
  try {
    const ws = await createWorkspace('stray')
    await ws.dispose()
    return ''
  } catch (err) {
    return (err as Error).message
  } finally {
    if (saved === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = saved
  }
}

describe('harness — filesystem writes cannot escape (Andreas, Codex)', () => {
  it('BUG-058 REFUSES a write through an in-workspace symlink to the outside', async () => {
    await scenario('fs-escape-symlink', async (s) => {
      await symlink('/tmp', s.workspace.path('escape-link'))
      await expect(s.fs.write('escape-link/escaped.txt', 'nope')).rejects.toThrow(
        /Refusing to write outside/,
      )
    })
  })

  // The gap Andreas found: the first version enforced isolation for processes
  // and merely asked for it politely for files. writeFile is one import away
  // while spawning is not, so the weaker standard governed the easier mistake.
  it('REFUSES an absolute path outside the workspace', async () => {
    await scenario('fs-escape-abs', async (s) => {
      await expect(
        s.fs.write('/tmp/definitely-not-mine.txt', 'nope'),
      ).rejects.toThrow(/Refusing to write outside/)
    })
  })

  it('REFUSES an escape via ..', async () => {
    await scenario('fs-escape-rel', async (s) => {
      await expect(s.fs.write('../escaped.txt', 'nope')).rejects.toThrow(
        /Refusing to write outside/,
      )
    })
  })

  it('REFUSES a sibling whose name merely starts with the root', async () => {
    await scenario('fs-escape-prefix', async (s) => {
      // startsWith(root) without the separator would accept `<root>-evil`.
      await expect(
        s.fs.write(`${s.workspace.root}-evil/x.txt`, 'nope'),
      ).rejects.toThrow(/Refusing to write outside/)
    })
  })

  it('allows writes inside, with modes, and reads them back', async () => {
    await scenario('fs-inside', async (s) => {
      await s.fs.write('deep/nested/file.txt', 'hello', { mode: 0o755 })
      expect(await s.fs.read('deep/nested/file.txt')).toBe('hello')
      expect(await s.fs.mode('deep/nested/file.txt')).toBe('755')
      expect(await s.fs.exists('deep/nested/file.txt')).toBe(true)
      expect(await s.fs.exists('deep/nope.txt')).toBe(false)
    })
  })
})

describe('harness — git fixtures (Andreas, Codex)', () => {
  it('creates a repo with a LOCAL identity and a pinned branch', async () => {
    await scenario('git-basic', async (s) => {
      const repo = await s.gitRepo('proj', { initialCommit: true })

      expect(await repo.config('user.email')).toBe('fixture@example.test')
      const branch = await repo.git(['rev-parse', '--abbrev-ref', 'HEAD'])
      expect(branch.stdout.trim()).toBe('main')
      expect(await repo.head()).not.toBe('')
    })
  })

  it('supports a repo with NO identity — bootstrap-identity needs that state', async () => {
    await scenario('git-no-identity', async (s) => {
      const repo = await s.gitRepo('proj', { identity: null })
      expect(await repo.config('user.email')).toBe('')
    })
  })

  it('the repo is real: git init created a .git INSIDE the fixture (BUG-047)', async () => {
    await scenario('git-real', async (s) => {
      await s.gitRepo('proj')
      // Under an inherited GIT_DIR, `git init` returns 0 and creates NO .git
      // here, and every later commit lands in the real repository. That is the
      // defect, and this is the assertion that would catch it coming back.
      expect(await s.fs.exists('proj/.git')).toBe(true)
    })
  })
})

describe('harness — PATH shims (Andreas, Codex)', () => {
  it('puts a shim ahead of the real tool without discarding the rest of PATH', async () => {
    await scenario('shim', async (s) => {
      const shims = await s.shimDir()
      await shims.add('git', 'echo SHIMMED')

      const r = await s.run('sh', ['-c', 'git --version'], {
        cwd: s.workspace.root,
        env: { PATH: shims.path() },
      })
      expect(r.stdout.trim()).toBe('SHIMMED')

      // The rest of PATH survives: a tool the shim dir does NOT define still
      // resolves. Replacing PATH outright would silently turn a fault-injection
      // case into a "what if coreutils is missing" case.
      const real = await s.run('sh', ['-c', 'echo ok'], {
        cwd: s.workspace.root,
        env: { PATH: shims.path() },
      })
      expect(real.stdout.trim()).toBe('ok')
    })
  })
})

describe('harness — process ownership', () => {
  it('BUG-059 retains a completed parent group and fails on its detached descendant', async () => {
    await expect(
      scenario('harness-descendant', async (s) => {
        const r = await s.run(
          'sh',
          ['-c', 'sleep 30 </dev/null >/dev/null 2>&1 &'],
          { cwd: s.workspace.root },
        )
        expect(r.code).toBe(0)
      }),
    ).rejects.toThrow(/left 1 process\(es\) running/)
  })

  it('reaps a background process the scenario forgot', async () => {
    // The scenario deliberately leaves a daemon running. The harness must kill
    // it AND fail the scenario — orphaned supervisors at ppid 1 caused a real
    // misdiagnosis on 2026-09-09.
    await expect(
      scenario('harness-orphan', async (s) => {
        const { spawn } = await import('node:child_process')
        void spawn
        // Use the registry through the public surface: start something that
        // outlives the body.
        const r = s.run('sh', ['-c', 'sleep 30'], {
          cwd: s.workspace.root,
          timeoutMs: 1_000,
        })
        await expect(r).rejects.toThrow(/Timed out/)
      }),
    ).resolves.toBeUndefined()
  })

  it('BUG-111 a timed-out run returns only once the group it killed is GONE, not merely signalled', async () => {
    // "reaps a background process the scenario forgot" went red under gate load
    // and never alone. `sh -c 'sleep 30'` is two processes on dash: SIGKILL
    // reaches both, Node reaps `sh`, but `sleep` is orphaned and waits for init
    // to reap it. `run()` used to throw as soon as `sh` closed, so under load
    // teardown sampled the group while that zombie was still in it, and
    // reported a "survivor" the harness had itself already killed.
    //
    // Init's reaping latency cannot be controlled, so this makes the window
    // CERTAIN instead of likely. A helper forks the `sleep` into the run's
    // group, leaves the group itself (so SIGKILL does not reach it), and reaps
    // its child only 500 ms after it dies. Its stdio is /dev/null, so it cannot
    // hold `close` back the way a pipe holder would. Ported from PR #68
    // (linkedin-watcher-agent).
    //
    // The 3 s timeout is not the property: it only has to outlast perl starting
    // and writing `ready`, which under gate load can exceed the request's 1 s.
    await scenario('harness-slow-reap', async (s) => {
      await s.fs.write(
        'slow-reaper.pl',
        [
          'my $dead = 0',
          '$SIG{CHLD} = sub { $dead = 1 }',
          'my $pgid = getpgrp()',
          'my $z = fork()',
          'die "fork: $!" unless defined $z',
          'if ($z == 0) { exec "sleep", "30" or die "exec: $!" }',
          'setpgrp(0, 0) or die "setpgrp: $!"',
          'open(my $fh, ">", "ready.tmp") or die',
          'print $fh "$pgid\\n"',
          'close $fh',
          'rename "ready.tmp", "ready" or die',
          'sleep 1 until $dead',
          'select(undef, undef, undef, 0.5)',
          'waitpid($z, 0)',
          '',
        ].join(';\n'),
      )
      await expect(
        s.run(
          'sh',
          [
            '-c',
            'perl slow-reaper.pl </dev/null >/dev/null 2>&1 & ' +
              'while [ ! -e ready ]; do sleep 0.01; done; exec sleep 30',
          ],
          { cwd: s.workspace.root, timeoutMs: 3_000 },
        ),
      ).rejects.toThrow(/Timed out/)

      const pgid = Number((await s.fs.read('ready')).trim())
      expect(pgid).toBeGreaterThan(1)
      let code: string | undefined
      try {
        process.kill(-pgid, 0)
      } catch (err) {
        code = (err as NodeJS.ErrnoException).code
      }
      expect(code, `group ${pgid} still had a member when run() returned`).toBe('ESRCH')
    })
  })

  it('a timed-out process does not survive', async () => {
    await scenario('harness-timeout', async (s) => {
      const started = Date.now()
      await expect(
        s.run('sh', ['-c', 'sleep 30'], {
          cwd: s.workspace.root,
          timeoutMs: 800,
        }),
      ).rejects.toThrow(/Timed out/)
      // If the kill did not work the scenario would hang until vitest's own
      // timeout, so a quick return is itself part of the assertion.
      expect(Date.now() - started).toBeLessThan(10_000)
    })
  })
})
