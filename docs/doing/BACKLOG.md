# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-084** | **One instruction file for every provider: consolidate the agent protocol into `AGENTS.md`.** Founder, 2026-09-25. Checked the same day: Claude Code reads `AGENTS.md` natively since v2.1.277, but a `CLAUDE.md` takes precedence unless it imports `@AGENTS.md`; Codex and Kimi read `AGENTS.md`; Gemini reads `GEMINI.md` unless `contextFileName` points it elsewhere. Today Claude reads `CLAUDE.md` and the others read `AGENTS.md`, which here is the coordination protocol, not the general rules, so the providers work from different instructions. **This unifies what agents READ; it enforces nothing** (TASK-083 does that). **The design questions a plan must settle:** `AGENTS.md` already exists here with another role; `CLAUDE.md` pulls in `project_config_*.md` with `@` imports that other tools may not follow; both files are managed and reach every derived project on pull, so the migration must not break a project mid-pull; and `CLAUDE.blueprint.md` and `claude.internal.md` need a home. | S3 | KEEP | **Scheduled by the founder 2026-09-27** ("do 81 and after it 84"); started 2026-09-29 after TASK-081 was released. Plan first: `PLAN-TASK-084-agents-md.md`, drafted by Christian (Claude), reviewed by all three providers before any file moves. **Plan reviewed 2026-09-29** (all three APPROVE-WITH-CHANGES) and revised with the founder's decisions: the protocol merges into `AGENT_SIGNAL.md`, no hard gate between slices on sentinel checks, and scope is the four autonomous CLI providers (Copilot outside). **Slice 1 is committed; next-step gate:** cross-provider review and push, then slice 2 after `released` advances. **Re-open when** the founder schedules it, or when a provider is found working from instructions another provider never sees. |

**All 6 slices landed on `main`.** Slice 5, the port commit: `scripts/blueprint`
became the shim (`b2de45e`), corrected same-day by `3ef85dc` (hold the shim
back until `scripts/blueprint.mts` itself lands, per §7's own rule). Slice 6,
the closure as a fixed point (§7/§8 row 6): reproducer `71227f6`
(`managed-references` #6, red on today's one-hop `bpCliLibs`), fix `265ff25`
(`bpCliLibs` walks a lib's own text for a `.sh`/`.mts` it names too, repeating
to a fixed point — the BUG-152 prerequisite). Codex's slice-6 review found
that lexical order was safe only for a same-stem pair and that only the CLI
pair had refusal hold-back; its follow-up makes the closure dependency-first
at every depth and propagates a refused or explicitly missing dependency to
its depender, while keeping incidental textual mentions out of the hard-edge
graph — **at the time, only for the files `cmdPull` reaches when the CLI
itself is one of the selected paths (`files.some(namesCli)`); the row
originally stated the guarantee without that qualifier.** Full suite (75
files / 1377 tests), typecheck, and the release tier (`bootstrap-gate`,
`a2bp-e2e`) all green before that follow-up. Claude's first re-review fixed
full-pull ordering for present dependencies (`2a7d720`, `4247967`); Codex's
round-2 review then found that an explicitly named dependency absent from the
archive was still never attempted on a full pull, and fixed that in `1d6c2a3`,
`8e81cf9`. Vitali's round-2 review then found the qualifier itself was the
remaining gap: the whole closure/hold-back block ran only inside
`if (files.some(namesCli))`, so once a project's CLI is already
byte-identical to the blueprint's (the steady state after any project has
been ported once) a full or named pull selects no CLI file, `namesCli` is
false throughout, and a lib that gained a dependency on something absent or
refused landed with no check, no skip line, exit 0. Fixed by seeding the same
fixed point (`bpLibClosureFromSeeds`, factored out of `bpCliLibClosure`) from
whatever `scripts/lib/*` files a pull already selected — full or named — and
running the reorder/hold-back unconditionally, not only when the CLI is
selected; `bpCliLibClosure` itself is now that seeding plus a call into the
same function, so there is still one scanner. The guarantee now genuinely
holds at every depth, on every pull, with no `namesCli` qualifier left.
Cross-provider re-review and the affected/full checks are pending before push.
This item does not move to `waiting-acceptance/` until that review and the push
land. |

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
