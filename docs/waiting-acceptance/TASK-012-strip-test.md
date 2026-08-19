# TASK-012 — the strip test: is orchestration separable?

Run 2026-08-18 by Philipp (Infrastructure-1). Method was **deletion, not
construction** — bootstrap a project, remove the orchestration layer, run the
gate, and let the failures be the coupling map. Building a `MANAGED_FILES`
profile first would have presumed the seam exists.

## Verdict: separable-with-work

**One irreducible coupling, and it is not the one the file list predicts.**

Three bootstraps into throwaway dirs: a control, a strip, and a seam measurement.
Because `pipe_stage` exits on the first failing stage, the gate reports only one
failure per run — so all 39 suite runners were also driven individually, and the
DoD stages directly, since they are sourced functions rather than suites.

## The control is not healthy — a finding in its own right

**A freshly bootstrapped struct2flow project cannot pass its own pre-push gate.**
`EXIT=1` at 70 s. Six of 39 suites fail on day one, before anything is stripped.

| Suite | Cause |
|---|---|
| `doc-links` | `docs/config/BLUEPRINT-AUDIT-2026-07-23.md` ships, but its 10 `../done/**` targets are `export-ignore`d. An 11th in `HANDOVER.md`. |
| `bootstrap-contents`, `bootstrap-identity`, `template-source` | All drive the real `new-project.sh` against the project *as* a blueprint; `templates/` is `export-ignore`d, so they fail on a missing template. |
| `drift-in-blueprint` | No `.blueprint-root` downstream — the blueprint-self path is untestable there. |
| `pull-exec-bit` | Reports itself **vacuous**: placeholders are already substituted downstream. |

**Root cause of five of the six: `.githooks/pre-push-project` ships to every
derived project.** `MANAGED_FILES` excludes it explicitly ("project guards, never
synced") and `new-project.sh` tells the operator to copy the `.example` — but
`.gitattributes` never `export-ignore`s it, so `git archive` carries the
blueprint's own 34 KB guard downstream. **Every derived project's gate is the
blueprint's self-test suite**, including four suites that test blueprint-only
machinery and cannot pass anywhere else.

`blueprint drift` also reports **5 drifted files on a zero-second-old bootstrap**
— files carrying `{{PROJECT_NAME}}` in prose that are absent from the bootstrap
substitution targets.

Raised as **BUG-028**. Nothing was fixed: these six are the baseline every number
below is measured against.

## Two corrections to the premise

**`lib/feed.sh` and `log-activity.sh` are not orchestration.** They are the shared
activity-log appender **the gate itself writes through** — `watch-ci.sh` sources
`feed.sh` unconditionally, `tests/pipeline` at three call sites, and
`tests/env-namespace` asserts `log-activity.sh` routes through it (BUG-006).
That is the observability lane, not the coordination lane. **Three of the four
new failures came from this single misclassification.**

**The 40% figure does not survive contact with the whole tree.** The set as
actually stripped is 19 files / 3,299 lines plus 10 suites / 3,801 lines — about
**7,100 of 51,100 tracked lines, ~14%**. The earlier number was measured against a
curated 36-file core; the non-test halves agree closely (3,150 vs 3,299), it is
the denominator that differed.

`session-resume.sh` was correctly classified — only `signal-set.sh`, its own
suite and one gate stage consume it. `watcher-lock.sh` and `wait-mic.sh` came out
clean.

## The seam

Measured, not assumed: the strip **plus** reclassifying `feed.sh` and
`log-activity.sh` out of the set, **plus** deleting the 10 now-dead `SUITES.md`
rows. Nothing else.

`pipeline`, `env-namespace` and `manifest` all go green. The residue attributable
to removing orchestration is **exactly one suite and three doc links**.

| Break | Class |
|---|---|
| `tests/manifest` — 10 rows classify suites that no longer exist | reference |
| `tests/doc-links` — 3 links into `AGENTS.md` / `AGENT_ROSTER.example.md` | reference |
| **`tests/dod-gate` #5 + DoD stage §7G** | **hard, irreducible** |

## The one that matters: §7G is an orchestration assertion inside the core gate

`dod_stage_signal` sources `lib/state-dir.sh` to resolve the baton path, then
requires the baton with its `Holder`/`State`/`Task` rows. **It does not check a
lifecycle invariant — it checks that the radio-over mic is well-formed.** Strip
the radio and the stage has nothing to be true about, and it fails *closed*, so
it blocks every push.

The coupling was stated backwards in the brief. It is not that the core needs
`state-dir.sh`; it is that an orchestration check is living in the DoD gate. That
is ~20 lines and a **policy decision** — drop §7G from a no-orchestration
profile, or make it `pipe_skip` when no baton exists — not an engineering
problem. Which is exactly why the verdict is "with work" rather than "separable".

## The unlisted surprise: `drift` has no concept of opting out

In the stripped project, `blueprint drift` reports the 16 removed files as
**"New in blueprint (not in this project) — `blueprint pull` to add them"**, and
`blueprint pull --yes` would restore the entire orchestration layer in one
command.

A no-orchestration project is **permanently drifted against its own source**, and
nagged about it on every wake by the command `CLAUDE.md` mandates at wake. **The
seam un-does itself unless the profile lives in `MANAGED_FILES` and is understood
by `drift` and `pull`.**

That is the strongest argument for TASK-012's own method note: a profile, not a
fork — and a profile the sync CLI can see.

## Is the result usable?

Yes, and this was walked rather than argued. Against the seam project:

- `BUG#1: file the spike probe item` — committed, gate accepted.
- `no item here` — **refused**, with the "add a row under `docs/backlog/`" message.
- Promote `backlog/BUGS.md` → `doing/BUGS.md`, add a `BUG-001` regression test — committed.
- DoD `§1b·1 rows` → `items: BUG-1`, rc=0. `§7B bug tests` → `regression tests found`, rc=0.
- `lifecycle-docs` passed; `manifest` **caught the probe suite as unclassified** — the honesty control still works.
- `blueprint drift`, `pull`, `a2bp` and all six a2bp suites work untouched.
- `§7G baton` → **rc=1**.

**Every gate that enforces the lifecycle survives. The only one that does not is
the one that checks the mic.**

## What this means for the ruflo question

The two outcomes were framed as different decisions, and the answer is the first
one: **the blueprint is a product with a plug-in orchestration socket.** A
third-party orchestrator is a candidate to fill it rather than a replacement for
the product.

Two things must be true before that is actionable, and neither depends on which
orchestrator is chosen:

1. **§7G moves out of the core DoD gate** — or learns to skip when there is no
   baton to check.
2. **`drift`/`pull` learn the profile**, or an opted-out project is permanently
   drifted and one `pull --yes` away from having the layer back.

Both are worth doing regardless of the ruflo answer, which is the property a good
spike result has.


---

# Part 2 — the ruflo evaluation (2026-08-19)

Run by Alexey (Architect, Codex) against the three questions the backlog row
named. **Recommendation: DO NOT ADOPT** — neither ruflo (lite) nor the narrower
alternative. All three answers came back negative and Q1 decides it alone.

## Q1 — does its observability capture a `codex exec` dispatch? No.

It captures Codex **only when ruflo itself spawned it.** Its own README states
the model: *"CLAUDE-FLOW = ORCHESTRATOR (tracks state, stores memory) / CODEX =
EXECUTOR"*. The mechanism is a child process — `dual-mode/orchestrator.ts`
imports `spawn`, defaults `codexCommand ?? 'codex'`, and builds
`codex exec --sandbox workspace-write --skip-git-repo-check`.

That is a **dispatcher, not an observer.** It has no mechanism to see a codex
process it did not launch, and ours it did not launch:
`scripts/start-all-watchers.sh` detaches the watcher stack with `nohup`, and
`start-codex-signal-watch.sh` fires `codex exec` from inside that detached
process. It is not a Claude Code tool call, so no Claude Code hook can observe
it — and ruflo's lite hook set is six Claude-session-internal events
(`PreToolUse`/`PostToolUse` on `Bash` and `Write|Edit|MultiEdit`, `PreCompact`,
`Stop`).

**The "Codex" mentions in the lite plugin are the inverse topology** — ruflo
running *inside* an interactive Codex session, detected via Codex's `turn_id`.
Not ruflo watching our batch dispatch. And none of it is on the lite path: the
marketplace lists 38 plugins, none for Codex. Codex needs
`npx ruflo@latest init --codex`, the full CLI.

So adopting ruflo for Codex visibility means handing it **our dispatcher and our
mic**, not our feed. That is a product replacement, which this spike's
"component swap" verdict does not license.

## Q2 — does the lite path stay out of `CLAUDE.md`? At install yes, at runtime no.

Credit where due: the claim survives inspection at install time. The only
filesystem write found in the lite shim is a dedup marker under `os.tmpdir()`,
not the workspace.

But the shim is a **thin dispatcher to the full CLI** —
`npx --prefer-offline --yes ruflo@latest hooks <subcommand>` — and the hooks it
forwards are `post-edit --update-memory true` and
`session-end --persist-state true --export-metrics true`. Persisted state and
exported metrics land somewhere, and the writer is the full CLI: the one
documented as creating `.claude/`, `.claude-flow/` and `CLAUDE.md`. `CLAUDE.md`
is a `MANAGED_FILES` entry that `blueprint pull` owns, so that collides head-on
with the sync model.

Two further costs. `ruflo-core/.mcp.json` runs `command: node`, making **Node a
hard runtime dependency** of a repo that is POSIX `sh`, `jq` and `awk` — on
every Bash and Edit tool call, with their own note that `npx` "can take 30+s on
a cold runner". And the legacy root `hooks.json` `PreCompact` hook **injects
text telling the agent to read `CLAUDE.md` for "54 available agents" and SPARC
workflows** — false in our repo, injected exactly when context is being
compacted. That file self-describes as `"_legacy_unaudited_shim": true`.

## Q3 — does the dashboard replace `tail -f`? No — a strictly weaker second record.

`ruflo-observability` is **pinned to `@claude-flow/cli` v3.6**, so it is not
available on the lite path at all. Its traces are ruflo's own swarm spans
(`swarm-task` → `agent-spawn`) in an AgentDB namespace; the dashboards are
hosted or a React app. **Nothing there reads `logs/agent-activity.log`**, and
per Q1 nothing there can see our Codex half — so it cannot subsume the first
record. That is the two-records-of-one-fact defect this repo has fixed three
times (TASK-005's `INDEX.md`, the lifecycle triggers, the forwarding notes).

## The narrower alternative — also no

`disler/claude-code-hooks-multi-agent-observability` captures 12 hook types but
handles subagents at **boundaries only** (`SubagentStart` / `SubagentStop`).
That is precisely the bookend approach BUG-027 replaced — the founder watched
work happen in the UI while the feed stayed blank, and the fix was projecting
the subagent's own transcript live. Adopting it re-introduces the fixed defect.
Claude-only, so the Codex half is uncovered by construction, at the price of a
Bun server + SQLite + Vue client on two ports as a second record.

## What could NOT be determined from public sources

- **Where the full CLI actually writes when invoked through the lite shim.** The
  persistence flags are on by default; the CLI's write paths were not traced and
  nothing was installed. All evidence above is source reading.
- **Version stability.** 68k stars, mid-rename from claude-flow, with a
  self-declared unaudited legacy shim at the root.

One question the evaluator listed as unknown is **answered by BUG-027**: Claude
Code `PreToolUse`/`PostToolUse` hooks DO fire inside subagent sessions. The
orchestrator assumed they did not and was wrong; the actual cause of the
blackout was the `isSidechain` filter.

## The bottom line

The half of our feed ruflo cannot see is the half that produces our review
findings. Buying infrastructure is right in principle — but this purchase covers
the working half, leaves the load-bearing half uncovered, and charges Node,
`npx` on every tool call, and a second record for it.

**Both follow-ups Part 1 named remain worth doing regardless** — §7G moving out
of the core DoD gate, and `drift`/`pull` learning the profile.
