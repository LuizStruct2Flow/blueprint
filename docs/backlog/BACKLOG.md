# Backlog — parked features, polish, reliability, strategy

See [README.md](README.md) for the lifecycle and categories (KEEP / DEFER /
OBSOLETE). One row per parked item; multi-file plans get their own folder
in this directory and a one-line pointer here.

**One table, not one per source.** Parked audit findings used to sit in a second
table below this one with its own column schema, which made "what is parked?"
two questions instead of one. They are rows like any other now — where an item
came from belongs in its text, not in its own table.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **A-04** | `scripts/start-all-watchers.sh` still ships. The 2026-07-23 audit flagged it as starting watchers the roster may not back. | S1 | KEEP | The next time the watcher set changes — or delete the script if nothing dispatches through it. |
| **A-13** | `.gitignore` is **not** in `MANAGED_FILES`, but its PUBLIC-PUBLISHING PRIVACY BLOCK says not to edit between the blueprint markers "because they'd come back on next sync". Nothing syncs it, so the instruction describes a mechanism that does not exist — and a derived project's privacy block silently never updates. | S2 | KEEP | When `docs/PUBLISHING.md` is next touched, or immediately if any project reports CLAUDE.md/AGENTS.md reaching a public remote. |
| **A-16** | `scripts/sonar.sh:30` and `sonar-api.sh:25` run `eval "$(grep -E '^SONAR_…' .env)"`. A config file becomes a code-execution surface, in a step agents run unattended. The grep constrains the KEY, not the value. | S3 | KEEP | When the Sonar wiring is next touched, or immediately if `.env` ever gains a non-founder writer. |
| **A-17** | `.githooks/pre-push` uses `ls infra/**/*.tf` under `#!/bin/sh` — no globstar, so `infra/envs/prod/main.tf` never matches and **the IaC gate silently skips**. A gate that skips looks exactly like a gate that passed (the BUG-004 lesson). | S3 | KEEP | The moment this repo or a derived project actually has an `infra/` tree. Until then nothing is being skipped in practice. |
| **A-25** | `scripts/build-deck.sh:32` runs `npx -y @marp-team/marp-cli@latest` — unpinned remote code on every deck rebuild, in an agent-automated step, bypassing the pin-and-scan doctrine the blueprint enforces elsewhere (and which A-36 already applied to GitHub Actions). | S4 | KEEP | When the deck build is next touched, or immediately if the supply-chain posture is audited. |
| **TASK-004** | Nothing asserts that every lib SOURCED by a managed script is itself in `MANAGED_FILES`. That is exactly BUG-015 (six libs the CLI needed never shipped, so `a2bp` died in every derived project) — fixed by adding the six, but the next forgotten one is unguarded. Noticed while adding `scripts/lib/branch-guard.sh` under TASK-003. | S2 | KEEP | The next time a lib is added under `scripts/lib/`, or immediately if a derived project reports a missing-source abort. |
| **FEATURE-004** | **`agents` — one `sh` script, machine-wide, "who is running where".** A shortcut-invoked command printing one line per dispatcher per project: project, backing agent, persona, mic state, uptime, ALIVE/DEAD. **Realtime is `watch -n2 agents`** — no daemon, no TUI, no redraw loop to maintain. Ships on PATH the same way `blueprint` does, so there is no new install step. **Discovery is the whole design problem, and the process table is the wrong answer**: `pgrep` matches the checking shell's own command line (redcare's incident, three separate wrong checks) and cannot tell one checkout's watcher from another's — it would have shown two `codex-signal-watch.sh` lines on 2026-08-05 with no way to know they were fighting over one baton. Instead each dispatcher drops a **pointer** in a machine-wide registry (`~/.local/state/struct2flow/watchers/`) carrying project path, state, agent, persona and start time, and liveness reuses the **same `flock` oracle** BUG-022 already ships. A free lock IS the dead-watcher signal, so the view is self-cleaning. | S2 | KEEP | Founder asked 2026-08-05 after two watchers double-dispatched TASK-008 — one orphaned at `ppid 1` for 3h42m, invisible because nothing enumerates watchers across projects. |
| **TASK-009** | **Reshape the process per the PO + BA flow reviews — APPROVED by the founder 2026-08-05, pending sequencing.** Five changes, kept as ONE item because they came from one review, land together and are reviewed together: (1) `Origin:` becomes a row FIELD so a defect found mid-session can start in `doing/` instead of taking a `backlog/` round trip it never needed; (2) cross-provider review attaches to a **landing**, not to every item in it — depth scales with risk, existence does not; (3) a **WIP limit** on `doing/` replaces per-promotion approval, so work-in-progress is capped mechanically rather than by the founder being the gate; (4) **three flow metrics**, so "is this working?" has an answer that is not opinion; (5) **one ceremony cut left** — drop the `§D·F·H judgement` stage, which verifies nothing while inflating the stage count that IS the gate's checksum. *(The other cut, shrinking `HANDOVER.md`, was done separately as **TASK-010** when the founder ruled on it directly.)* Klaus and Alexis reached (1)–(3) independently. | S2 | KEEP | Approved; waiting only on capacity. Sequence after BUG-021/022 and FEATURE-003, which are already in flight. |
| **A-40** | **`ps` cannot see `Monitor` processes from the agent's own shell, so no `ps`-based liveness check for them can work.** Proven 2026-08-07: `ps -eo args --width 400 \| grep -F "MIC:"` returned nothing while two mic monitors were demonstrably alive and emitting seconds later. An earlier `ps` sweep *did* show the exchange-board monitor, which is what made the check look sound — one visible watcher generalised into a rule. **Cost when believed:** a monitor was declared dead, a duplicate was armed on top of the live one, and a `ps` liveness check was proposed for the wake protocol that would have reported dead every time. Recorded because the wrong conclusion was reached from a real command with real output, which is the hardest kind to catch. | S3 | KEEP | Before anything adds a process-table check for a harness-managed task. FEATURE-005 removes the need for one. |
| **TASK-011** | **DoD §1b rule 2 does not say which of two readings it means, and both are defensible.** *"Promote it to `doing/` BEFORE starting"* plus rule 6's branch+PR landing leaves open whether the promotion must LAND on `main` first (two PRs, two gate runs per item) or is the first commit on the work branch (one PR, but `main` shows the item in `backlog/` while it is being worked). **Alexis ruled: the one-PR form**, with the ordering made explicit rather than left to inference — promotion is a separate first commit, no implementation in it, both travel through the same PR. Her reasoning: rule 7 already presumes `doing/` membership while a PR is open, and *"`main` represents landed repository state; it cannot simultaneously provide a real-time view of every unmerged branch"*. The wording she supplied says so plainly instead of letting the rule imply `main` is a live work board. **She also noted the rules never established the expensive two-PR workflow anywhere** — so the strict reading was never actually written down, only available. | S3 | KEEP | Fold into DoD §1b when the intake rules are next edited — TASK-009 already reshapes that section, so this belongs with it rather than as a separate pass. |
| **TASK-012** | **Should the blueprint adopt [ruflo](https://github.com/ruvnet/ruflo), and in which form?** Not *how to use it* — that presumes the answer. **Why now:** 2026-08-18 produced four commits of feed plumbing and seven cross-provider review findings, none of which is why anyone would use this blueprint. The differentiator is the four-state lifecycle, the DoD gates, the cross-provider review rule and the `a2bp` sync model; the feed is infrastructure, and infrastructure is what you buy rather than debug. Founder asked whether an off-the-shelf answer exists, which is ladder rung 1 — *does this need to exist at all* — and nobody had asked it about the feed. **THREE QUESTIONS DECIDE IT, and none needs a commitment to answer.** (1) Does its observability capture a **`codex exec` dispatch**, or only Claude agents? Ruflo advertises 5 providers with failover, but that is MODEL ROUTING — our reviews run a different *harness* (`codex exec`, own sandbox, own context), and that is where the findings come from. If it cannot see the Codex half, it replaces the half of our feed that already works. (2) Does the **lite plugin path** (`/plugin install ruflo-core@ruflo`, *"slash commands only, zero workspace files"*) stay out of `CLAUDE.md`? The full CLI writes to `CLAUDE.md`, `.claude/` and `.claude-flow/` — and `CLAUDE.md` is a `MANAGED_FILES` entry that `blueprint pull` owns, so the full path collides head-on with the sync model. (3) Does the dashboard **replace** `tail -f logs/agent-activity.log`, or sit beside it as a second record — the failure mode this repo has fixed three times (TASK-005, the lifecycle triggers, the forwarding notes)? **Evaluate on the lite path only**; the full one adds Node + TypeScript + Rust and a daemon to a repo that is POSIX `sh`, `jq` and `awk`. **Exit criterion is a recommendation with evidence, not a migration.** **Method and sequencing below** — a `MANAGED_FILES` profile rather than a thin fork, and a no-orchestration bootstrap run FIRST, because it answers whether the differentiator is separable at all and cannot be invalidated by whatever ruflo turns out to do. Compare against [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) as the narrower alternative — 12 hook types, but Claude-only and its subagent handling is the bookend approach BUG-027 just replaced. | S2 | KEEP | Founder, 2026-08-18. **Blocks nothing, but should be answered before more feed hardening lands** — if the feed is going to be replaced, BUG-027's residue and FEATURE-004 are work we would throw away. |
| **AUDIT-TRIAGE** | ~12 doc-consistency findings from the 2026-07-23 audit have **no disposition record at all**: A-10, A-11, A-19–A-21, A-23, A-26, A-28, A-29, A-31–A-35. They are not claimed fixed and not claimed open — nobody has read the docs they cite since the audit. Carried as a row rather than a footnote because a footnote is not tracked, and this needs a decision. | — | KEEP | A grooming session. **Its trigger has fired:** `README.md` names "when `doing/` empties out" as a typical grooming cadence, and `doing/` emptied on 2026-08-03. |

## FEATURE-004 — three things to settle before building it

1. **It must not undo BUG-020.** That bug moved agent state INTO the project
   deliberately. The registry holds **pointers only** — disposable and
   rebuildable, never authoritative. Delete it and nothing breaks; you lose the
   cross-project view until watchers re-register. Authority stays in each
   project's own `logs/state/`.
2. **Print the bootstrap gap in the OUTPUT, not the docs.** A watcher started
   before the registry existed never registers, so the view is incomplete until
   every watcher has been restarted once. That is exactly the hole that hid the
   3h42m orphan, and a dashboard which silently omits what it cannot see is a
   confident lie — worse than no dashboard.
3. **Reap on sight, or offer to.** An entry whose lock nobody holds is a dead
   watcher. Showing it as DEAD is the minimum; `agents --reap` costs nothing.

**Related gap, worth its own row when someone picks this up:** the watchers have
no `--status` / `--stop`, which the feed has had all along. That is why the
orphan went unnoticed and why stopping it meant reading `ps` output by eye. A
per-project `--status` is a prerequisite for the machine-wide view being
trustworthy anyway.

**And a distinction the stop path must preserve.** `dead` should mean
*unexpectedly* gone. A watcher killed deliberately leaves its lock file behind,
so the next session is greeted by a warning about a watcher nobody wanted — the
false alarm the `none` state exists to prevent. A clean `--stop` should REMOVE
the lock (state returns to `none`); only a crash should leave it (`dead`). Found
on 2026-08-05 while shutting down for the night, and worked around by hand with
`rm`.

## TASK-012 — how to run it, and why not a fork

**The method is a `MANAGED_FILES` profile, not a second repo.** The founder's
instinct was a thin blueprint with orchestration stripped out, as the spike's
vehicle. The separation is right and the fork is not: two blueprints is one fact
recorded twice, and it drifts — the same defect as `INDEX.md` (TASK-005), the
lifecycle triggers when the PR rule landed, and the forwarding notes removed on
2026-08-18. At repo scale it would be the worst instance yet, because nothing
would fail when they diverged.

`MANAGED_FILES` and `new-project.sh` already decide what reaches a derived
project, so "thin" is a profile in the one blueprint.

**THE DELIVERABLE IS FALSIFIABLE: bootstrap a project with orchestration OFF and
see whether the lifecycle, the gates and the sync still hold together alone.**
That is worth doing whatever ruflo turns out to be, because it answers the
question underneath this one — **is the differentiator separable at all?**

- If a no-orchestration bootstrap is coherent, the blueprint is a product with a
  plug-in orchestration socket, and ruflo is a candidate to fill it.
- If it is not, **the orchestration IS the product**, and adopting ruflo means
  adopting a different product rather than a component.

**Do this BEFORE evaluating ruflo.** It needs no third party, it cannot be
invalidated by what ruflo turns out to do, and stripping first would risk
deleting the half of the feed that works — the Codex half — on the strength of a
capability nobody has verified yet.

### The measurement, taken 2026-08-18

| | files | lines |
|---|---|---|
| orchestration — baton, watchers, feed, roster | 18 | 3,150 |
| core — DoD, gates, sync CLI, concern recipes | 18 | 5,892 |

Plus **9 of 37 test suites** are orchestration (3,463 lines), measured on a branch
missing `wait-mic` and `subagent-feed` — so the real figure is higher. Roughly
**40% of the repo**, and effectively all of 2026-08-18.

That number is the argument for asking the question, not for any particular
answer to it.

## Where these came from

The five `A-NN` rows were parked on 2026-08-03, when an `lcm` pass asked whether
the 2026-07-23 audit had been fully addressed. It had not. Each was **verified
still live against the tree**, not inferred from the register — the register
itself records findings in three different states at once and cannot be trusted
as a status source.

The register lives at
[`../config/BLUEPRINT-AUDIT-2026-07-23.md`](../config/BLUEPRINT-AUDIT-2026-07-23.md).
It is a reference record, not a work item: it spans done, waiting and open
findings simultaneously, so it cannot sit in one lifecycle folder.

`A-NN` is a **finding ID, not a work item** — see `../doing/BUGS.md`. Promoting
any row above means giving it a `BUG-`/`FEATURE-` number first.
