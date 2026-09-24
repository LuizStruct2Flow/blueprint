# PLAN — BUG-151: a roster tier must not resolve to a model the provider refuses

**Status:** design only. No implementation is part of this document. Whether
and when to port `scripts/lib/roster.sh` / `scripts/start-codex-signal-watch.sh`
is the founder's call (TASK-067 precedent: BUG-147, founder ruled "port it").

## What was measured

- `bp_roster_model_for_name` (`scripts/lib/roster.sh:460-516`) turns a roster
  cell `<tier>:<effort>` into a model name. `tier` must match `frontier` or
  `frontier-N` (`case` guard at line 481-485) — **there is no path today for a
  cell to name a literal model slug.** That option from the brief is closed:
  the parser does not already allow it, so there is nothing to propose as a
  one-line `AGENT_ROSTER.md` edit in that form.
- For `Codex`, the ranked list is `bp_roster_codex_models`
  (`roster.sh:430-437`): it reads `${CODEX_HOME:-~/.codex}/models_cache.json`,
  keeps entries with `visibility == "list"`, and sorts by the CLI's own
  `priority` field. `frontier-N` shifts N off that sorted list and takes the
  next slug. Nothing about `visibility: "list"` means "usable by this
  subscription" — it means "the CLI is willing to advertise it," which is a
  different claim.
- `Claude` and `Kimi` get an explicit "best first" line in `AGENT_ROSTER.md`
  because neither has an equivalent external ranked source: Claude Code
  resolves a family alias itself, and Kimi's `config.toml` has no priority
  field (comment at `roster.sh:391-406` states this). Codex is the one
  provider with a machine-supplied ordered list, which is why it alone gets
  no roster line — declaring a second, hand-maintained list for it would be
  a duplicate source of truth for exactly the data the CLI already ranks.
  That design choice is sound; what it did not anticipate is a ranked-but-
  unusable entry.
- Today's cache, read live:
  ```
  gpt-6-astra   prio=1
  gpt-6-sol     prio=2
  gpt-6-luna    prio=3   <- frontier-2, what Elias resolved to
  gpt-5.6-sol   prio=4   <- frontier-3
  gpt-5.6-terra prio=7   <- frontier-4, ran clean all day yesterday
  gpt-5.6-luna  prio=8   <- frontier-5
  gpt-5.5       prio=12  <- frontier-6
  ```
  `logs/state/codex-runs.log:2840-2845`: `frontier-2:medium` requested
  `gpt-6-luna`, and `codex exec` refused in 3s: `"The 'gpt-6-luna' model is
  not supported when using Codex with ..."`. The line immediately before it
  (`:2838`) shows `gpt-5.6-sol effort=high` finishing a real turn cleanly on
  2026-09-22, and `gpt-5.6-terra` has dozens of clean `requested`/`actual`
  pairs through 2026-09-21/22. So the three new `gpt-6-*` slugs at
  priorities 1-3 are the suspect ones; the `5.6-*` family at priority ≥4 is
  the one with a track record on this subscription today. This is not
  proven for `gpt-6-astra`/`gpt-6-sol` specifically (only `-luna` was hit
  live) — same error class is likely, not confirmed, for `frontier` and
  `frontier-1`.
- `start-codex-signal-watch.sh:174-180` takes whatever `bp_roster_model_for_name`
  returns and passes it straight to `codex exec -m <slug> -c
  model_reasoning_effort=<effort>`. No usability check happens anywhere
  between the roster resolving a rank and the CLI refusing it.

## 1. Cheap unblock (no code change)

The parser does not support naming a model outright, so the only lever
available today is **which rank a cell asks for**. `AGENT_ROSTER.md` is the
founder's own gitignored file — this is a proposal, not an edit I am making.

Every Codex persona currently on `frontier-2:medium` (Kathrin/BA-2,
Alex/Front-End-2, Andreas/Back-End-2, Jesko/QA-2, Elias/Infrastructure-2)
resolves to `gpt-6-luna`, the confirmed-broken slug. Propose bumping those
five cells to `frontier-4:medium` (lands on `gpt-5.6-terra`, the slug with
the longest clean track record — safer than `frontier-3`'s single data
point). Architect-2 (`frontier-1:high`) and Security-2 (`frontier:high`)
resolve to `gpt-6-sol`/`gpt-6-astra`, untested but same suspect family;
propose bumping both to `frontier-4:high` too, for the same reason.

This is a **stopgap, not a fix** — it hardcodes today's cache shape into the
roster, and the next cache refresh can silently invalidate it exactly as it
invalidated `frontier-2` overnight. It restores Codex to the rotation today
without touching any code, which is what the brief asks for as step 1. State
it to the founder as such when proposing it.

## 2. The real fix

Three options, as named in the BUG-151 row.

**A — verify usability at resolution, fall to the next rank.** Before a
launcher trusts a resolved model, actually exercise it (or catch the CLI's
own refusal) and retry the next rank down on that specific failure class.
This is the only option that removes the failure mode itself: a listed-but-
unusable entry stops mattering because nothing downstream ever commits to it
blindly. Cost: this is a retry loop, not a one-line check — there is no
cheap dry-run for "will the account accept this model," so the practical
version catches the live 400 from `codex exec` in the launcher, logs which
rank was skipped and why, and re-dispatches at rank+1 (bounded, so a
genuinely exhausted list fails loudly instead of looping). Touches
`scripts/start-codex-signal-watch.sh` (the retry) and arguably
`scripts/lib/roster.sh` (to expose "give me rank N+1" cleanly rather than
re-deriving it inline).

**B — declare Codex's list explicitly in the roster, like Claude/Kimi.**
Symmetric with the other two providers, but it trades a dynamic-but-
sometimes-wrong source for a static one that goes stale the same way
`frontier-2` just did, except silently — nothing re-derives it from the CLI,
so a new model never appears and a retired one never disappears until a
human edits the roster. This does not fix the actual defect (an unverified
rank can still name an unusable model); it just moves where the wrong
assumption lives. Not recommended.

**C — record the refusal, let the provider leave the rotation with a stated
reason**, the same shape TASK-065(c) plans for quota exhaustion. This makes
the failure visible and stops repeat dispatches from re-paying the same 3-
second round trip, but on its own it does not restore Codex to work today —
it only makes the outage legible instead of silent. It is a good complement
to A (the bounded retry's "give up" path should record this, not just log
and drop), not a substitute for it.

**Recommendation: A, with C as the exhaustion path.** Verify-and-fall-back
is the only option that stops a rank from ever being trusted blindly, which
is the root cause stated in the bug row itself ("nothing checks that the
rank the roster lands on is usable here"). B is rejected — it re-creates the
staleness problem this bug is about, just moved to a file nothing refreshes.
C alone leaves Codex undispatchable until a human intervenes, which is worse
than today's silent failure only in that it fails with a clearer message.

## 3. Cost: does this touch a legacy shell file?

**Yes, on both files the fix needs.**

- `scripts/lib/roster.sh` — `scripts/shell-inventory.json:33`, legacy,
  517 lines, sourced by `scripts/agent-activity.sh`, `scripts/team-kickoff.sh`,
  and all four `start-*-signal-watch.sh` launchers. Not on the closed
  exception list (`CLAUDE.md` §"Shell to TypeScript, organically").
- `scripts/start-codex-signal-watch.sh` — `scripts/shell-inventory.json:46`,
  legacy, 332 lines. Also not exempt.

Under TASK-067, changing either means porting that whole file first, in its
own behaviour-identical commit, before BUG-151's actual change lands — same
shape as BUG-147's `dod-gate.sh` (`PLAN-BUG-147-dod-gate-port.md`),
which the founder ruled on 2026-09-22 with "port it," no exception. That
precedent also suggests the mechanical shape: `dod-gate.sh` is being moved to
a `.mts` CLI with a generated **sourced adapter** left behind, because it is
sourced by shell callers rather than executed directly — `roster.sh` is
sourced the same way (by `agent-activity.sh`, `team-kickoff.sh`, and the
launchers), so the same sourced-adapter pattern is the likely target shape
here too, not a plain two-line exec shim. `start-codex-signal-watch.sh` is
executed directly (never sourced), so it can take the ordinary exec-shim
form once its logic moves to `.mts`.

**I am not starting either port.** Per the brief, this is a report, not a
start: 517 + 332 lines across two files, both sourced/executed by other
live infrastructure, is a founder-level cost decision, same as BUG-147.
