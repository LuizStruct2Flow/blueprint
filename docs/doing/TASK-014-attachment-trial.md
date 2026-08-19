# TASK-014 — the attachment trial: does a foreign orchestrator fit the socket?

Run 2026-08-19 by Eto (Orchestrator). Method is **construction**, the inverse of
TASK-012 Part 1's deletion: bootstrap a project, install the full ruflo CLI, and
let the failures be the coupling map.

## Verdict: the socket is real. On ruflo, **no verdict** — see Part 2.

> **Part 1's disqualifier was withdrawn the same day.** It rested on the
> baton's `Holder` row being a requirement; the founder corrected that the
> names are a mechanism for forcing delegation to fresh specialized agents,
> and anonymous workers serve that just as well. Read Part 2 before acting on
> anything below it. The socket finding, the two couplings, and every
> measurement of what the install writes are unaffected — none of them rested
> on that premise.

Two findings, and they are independent:

1. **The seam holds.** A freshly bootstrapped project passes its own gate, and
   still passes with the full ruflo CLI installed alongside — 44 stages, 175.9 s
   against a 170.9 s baseline. Roughly 5 s of overhead and not one failure.
   TASK-012's downgraded claim is now upgraded on the attach side too: something
   *can* be plugged in without breaking the lifecycle.
2. **Ruflo is not the something.** Not for the reason Part 2 gave — that
   objection dissolved correctly — but because **the baton and a ruflo swarm
   answer different questions.** The baton asks *who holds the mic, on what, and
   who do they hand to*. Ruflo coordinates anonymous workers over a task queue.
   There is no field in either its files or its CLI that answers the first two.

~~**DO NOT ADOPT ruflo**, now on measured grounds.~~ **Withdrawn — see Part 2.**
**Keep the socket** — that finding stands, and the two couplings blocking it
are now precisely characterised.

## The control is healthy this time

Part 1's most valuable finding was that it never got a healthy control: `EXIT=1`
at 70 s, six of 39 suites failing on a zero-second-old bootstrap (**BUG-028**).

That is fixed and it holds. The bootstrap for this trial:

```
PASSED · 44 stages · 14 skipped · 170.9s · slowest: signal-dispatch 31.1s
```

Every number below is measured against a green baseline rather than against six
known failures.

## Q1 — can ruflo's state satisfy DoD §7G? No. Not one of the three rows.

§7G's contract is narrow: resolve the baton path, require `Holder`, `State`,
`Task`. That narrowness is why it looked mappable.

**The coupling reproduces exactly.** On the stripped project:

```
no live baton at …/trial-b/logs/state/signal.md — seed it with scripts/signal-set.sh
=== §7G exit: 1 ===
```

**An adapter makes it green, and the green is vacuous.** Twenty lines reading
ruflo's `swarm-activity.json` produce a well-formed baton and `§7G exit: 0` —
with two of three rows invented, because ruflo has no field for them:

| Row | Source in ruflo | Honest value |
|---|---|---|
| `State` | `swarm.coordination_active` | looked real — **see below** |
| `Holder` | none — swarm sessions are anonymous, there is no roster | invented constant |
| `Task` | none — `sessions.state` is an opaque blob, `tasks_completed` a counter | invented string |

**And the one row that looked real is not.** A swarm was initialised
successfully (`swarm-1787170221571-0126x3`) and a background daemon started with
seven workers, one of which had already executed:

```
| map | ✓ | idle | 1 | 100% | 23s ago |
```

`swarm status` reported `Elapsed Time: 24s`. Meanwhile the state the adapter
reads was **unchanged from install time**:

```json
"swarm": { "active": false, "agent_count": 0, "coordination_active": false }
```

and the `sessions` table was empty. **Ruflo's on-disk state does not track its
own swarm.** A file-reading adapter reports `IDLE` while a swarm is live — worse
than no adapter, because it is confidently wrong.

The live status *is* available from the CLI, so a CLI-reading adapter is
possible. It would cost an `npx` invocation per gate run and parse formatted
ASCII tables — and it still yields no `Holder` and no `Task`, because those
tables carry worker names and counts.

**So the answer is neither of the two the row anticipated.** §7G does not need
moving, and it does not need a `pipe_skip`. It is the place where an ontology
mismatch became visible, and it did its job: **it failed closed rather than
passing over a coordination model it could not describe.**

## A second hard coupling, not in Part 1's residue list

The stripped gate does not even reach §7G. It fails earlier, in `tests/state-dir`:

```
FAIL: #7 only 1 consumer(s) carry the block — expected at least 4 (vacuous)
FAIL: #8 the launcher resolved its root from the SYMLINK's directory
FAIL: #10b the resolver returned '', expected … — chain not followed
```

`tests/state-dir` is classified **`both`** in `SUITES.md` — *"guards a mechanism
every project shares"*, i.e. a core guard, not orchestration. But its assertions
sample and execute the orchestration files: #7 counts consumers carrying the
physical-root block, #8/#9 launch `codex-signal-watch.sh` through an out-of-tree
symlink, #10b/#10d `sed` into it.

Strip the layer and the suite does not skip — it **fails as vacuous, by design**.
That is the anti-vacuity control working exactly as intended, and it is why this
one cannot be waved through: suppressing it defeats the control it embodies.

**Different shape from §7G.** §7G is an orchestration *assertion* in the core
gate. This is a core *guard whose sample population is the orchestration layer*.

*Caveat, stated because it matters:* the strip set used here is a reconstruction
of Part 1's from its prose, not the identical set. Whether Part 1 hit this and
omitted it, or stripped differently, cannot be determined from its report — only
that its residue list does not mention it.

## Q2 — does adoption create the second record? Yes.

Nothing ruflo installed references `logs/agent-activity.log`. It keeps its own:
`.claude-flow/logs/`, `.swarm/memory.db`, `ruvector.db`.

So the two-records-of-one-fact defect Part 2 **rejected ruflo for** is a defect
adoption *creates*, not one declining avoids. `feed.sh` and `log-activity.sh`
are the observability lane and correctly stay; ruflo brings a parallel one that
neither reads nor is read by ours.

## Q3 — the `CLAUDE.md` collision does not reproduce. Four other writes do.

Part 2's headline blocker was that the full CLI writes `CLAUDE.md`, a
`MANAGED_FILES` entry `blueprint pull` owns. **It does not.** The project
`CLAUDE.md` is byte-identical before and after (`18974cee…`) — it is the
installer's reported "Skipped: 1 (already exist)".

What it actually writes:

| Target | What | Assessment |
|---|---|---|
| `~/.claude/CLAUDE.md` | **created** — 4 lines telling the agent to use ruflo MCP tools | **machine-global from a project-local install.** Caught only because `HOME` was sandboxed for this trial |
| `.claude/settings.json` | merged: +4 `allow`, +3 env vars | **deny and ask untouched, hooks byte-identical, the no-chain guard intact** — genuinely good hygiene |
| `.gitignore` | +4 lines, commented, appended | polite |
| repo root | `ruvector.db`, `.swarm/`, `.mcp.json`, `.agents/` untracked and un-ignored | the project must gitignore them itself |

### The security finding

Among the four allowlist entries it granted itself:

```
Bash(node .claude/*)
```

`.claude/` is gitignored in this blueprint, and ruflo had just written 110 files
into it. **The install grants execute permission over a directory it controls
whose contents never appear in a git diff.** That runs directly against
CLAUDE.md §"Running commands — one per call, chains only when dependent": *"an
allowlist is only worth the granularity it is actually consulted at."*

### The honesty finding

The installer printed:

```
[INFO] Hooks: 7 hook types enabled in settings.json
```

The file carries **three** hook entries and is byte-identical to pre-install —
it enabled **zero**. An operator reading that summary would believe seven hooks
are active. This repo has a specific reason to care: **BUG-027 was exactly a
case of believing hooks fired when they did not.**

## Q4 — who invokes the gate? Unchanged.

Ruflo's hooks are Claude Code tool-level events (`PreToolUse`, `SubagentStart`,
`SubagentStop`). The gate is still invoked by `git push` → `.githooks/pre-push`,
and the DoD stages receive their inputs unchanged. The coexistence gate is green
at +5 s. **No conflict here at all** — this was the cheapest of the four
worries.

## What was NOT determined

- **No work item was pushed through with ruflo actually orchestrating.** That
  requires agents executing, which is a billable LLM path; the trial ran with a
  sandboxed `HOME` and no credentials **by design** — CLAUDE.md §"Cost is a main
  concern" forbids wiring a billable path into a trial without an explicit
  budget decision. What was exercised is the gate, the lifecycle checks, the
  state surfaces and the daemon.
- **Whether `~/.claude/CLAUDE.md` is appended-to or overwritten** when one
  already exists. This machine had none.
- **Whether `swarm status` has a `--json` mode**, which would lower the cost of
  a CLI-reading adapter.

## Housekeeping

The trial started a background daemon (7 workers). It was stopped and verified
gone — `pgrep -af 'ruflo|claude-flow'` returns nothing. Workspace is
`/tmp/t014-XzIC8I`, outside any git tree, disposable.

## Follow-ups this raises

1. **`tests/state-dir`'s vacuity coupling** — a core guard that cannot survive
   the strip, and must not be suppressed to make it. Needs its own item.
2. **§7G's real fix is now knowable** and it is neither of the two proposed: the
   stage should assert the baton **only when the project declares it has one**,
   so a no-baton project skips honestly rather than an adapter inventing rows to
   satisfy it. The declaration is the thing `drift`/`pull` need to understand
   too — the profile Part 1 asked for.
3. **The socket stays open.** An orchestrator that models named accountability
   could fill it. Ruflo's model is anonymous workers over a task queue, and that
   is the mismatch — not its Codex support, and not its file hygiene, which is
   better than Part 2 assumed.


---

# Part 2 — the verdict is withdrawn (2026-08-19, same day)

**Founder correction, on reading the report:**

> I don't care if the agents have a name or not. I have the names only to avoid
> the orchestrator doing all the work, instead of loading fresh and specialized
> agents. If ruflo can work with different agents without naming them, fine.

Part 1's disqualifier is **void**. It argued that ruflo cannot fill the socket
because none of the three baton rows has a source in its state — `Holder` above
all, since a swarm has anonymous workers and no roster. That argument treats the
baton's *schema* as the requirement. It is not. The names are a **mechanism**,
and the requirement underneath them is:

> **Work must be dispatched to fresh, specialized agents rather than absorbed by
> the orchestrator — and it must be observable that this happened.**

Anonymous workers satisfy that requirement as readily as named personas. Arguably
more readily: spawning specialized workers is ruflo's core function, not an
add-on to it.

## This is the third iteration of one error

Worth naming, because the pattern is now the most reliable finding this spike has
produced:

| Stage | Assumed | Should have asked |
|---|---|---|
| the brief | that a coherent no-orchestration bootstrap proves a *socket* | does anything attach? |
| Part 2 (ruflo eval) | that ruflo sits *beside* our orchestration (`lite path only`) | what if it replaces it? |
| **Part 1 of this trial** | **that the baton's `Holder` row is the requirement** | **what is the row FOR?** |

Each stage measured competently and inferred past its evidence. Each was caught
by the founder rather than by the method. **A falsifiable method does not protect
against an unexamined premise** — it only makes the premise's consequences
precise.

## What this changes

**Withdrawn:**

- *"None of the three baton rows has a source"* — true, and no longer a
  disqualifier. `Holder` needs no source because `Holder` is not the requirement.
- *"The baton and a ruflo swarm answer different questions"* — the baton asks a
  narrower question than the requirement does. That is a fact about the baton.
- *"§7G failed closed over a coordination model it could not describe, which is
  it working."* **Reversed.** §7G asserts *our mechanism* is present, not that
  *the project's coordination is healthy*. Under the corrected requirement it is
  enforcing an implementation detail, and the adapter that made it green
  vacuously is evidence of that rather than evidence against ruflo. §7G should
  assert **the project's declared coordination mechanism**, whatever it is.

**Changed in meaning, not withdrawn:**

The staleness finding stands and now matters *more*, for a different reason. With
a swarm initialised and seven workers live, `swarm-activity.json` read
`coordination_active: false` at its install-time timestamp and `sessions` was
empty. Under the old framing that blocked filling a `State` row. Under the
correct requirement it is sharper: **the on-disk state cannot tell you whether
delegation happened.** That is the BUG-027 blackout defect in a new place — work
proceeding while the record says nothing is running.

But it is **not fatal**, because the CLI is truthful where the files are not:

```
| map | ✓ | idle | 1 | 100% | 23s ago |
```

Delegation *is* observable in ruflo. Just not from the files a cheap adapter
would read.

**Unaffected — all of it measured, none of it resting on the void premise:**

- The seam holds: fresh bootstrap green at 170.9 s, still green with the full
  ruflo CLI installed at 175.9 s.
- `tests/state-dir` is a core guard whose sample population is the orchestration
  layer, and fails *vacuous* on the strip.
- The install grants itself `Bash(node .claude/*)` over a gitignored directory it
  had just filled with 110 files.
- It reported "Hooks: 7 hook types enabled" and enabled zero.
- It writes machine-global `~/.claude/CLAUDE.md` from a project-local install.
- Both corrections to TASK-012 Part 2 stand: the project `CLAUDE.md` collision
  does not reproduce, and `.claude/settings.json` is merged rather than clobbered.

## The trial is incomplete against the real criterion

The requirement is *does it delegate to fresh specialized agents, observably*.
**That was never tested** — and it is precisely the half Part 1 recorded as not
determined, for the correct reason: running work through a swarm means agents
executing, which is a billable LLM path, and CLAUDE.md §"Cost is a main concern"
forbids wiring one into a trial without an explicit budget decision.

So the position is:

- **No verdict on ruflo.** Again — but this time the missing evidence is named
  and cheap to specify.
- **The socket is still real.** That finding never depended on the void premise.

## What the completed trial has to measure

1. **Does a work item get decomposed onto multiple workers, or absorbed by one?**
   The founder's actual concern. Measured by worker run-counts before and after a
   real task, not by reading the topology config.
2. **Are the workers fresh and specialized?** ruflo ships 17 agent definitions
   under `.claude/agents/`. Do they receive scoped context, or is one generalist
   doing everything under seven names?
3. **Is the delegation observable without asking the vendor's CLI nicely?** The
   files are stale; the CLI is truthful; the gate needs *something* it can check
   cheaply. This is the §7G replacement question, correctly posed at last.
4. **What does it cost per work item?** Declared cap, per-call spend logged,
   halt-on-cap — the four capabilities in CLAUDE.md §"Cost is a main concern"
   apply to the trial itself, not only to what it evaluates.

**This needs a founder budget decision before it runs.** That is the blocking
item, and it is a decision rather than an engineering step.
