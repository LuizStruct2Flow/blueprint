# PLAN — BUG-151: a roster tier must not resolve to a model the provider refuses

**Status:** design only. No implementation is part of this document.

**Refreshed 2026-09-25 against two things that changed since the first
draft.** (1) The founder said "Fix them all" for everything in
`docs/doing/`, which settles the open cost question this plan used to punt
on: a port, where one is actually needed, happens, no separate ask required.
(2) `scripts/start-codex-signal-watch.sh` (TASK-083) is now the two-line
exec shim required by `CLAUDE.md` §"Shell to TypeScript, organically"; its
whole implementation, including the wake command this bug's fix touches, is
`scripts/start-codex-signal-watch.mts`. Re-reading the fix against that file
changes the recommendation below: **the fix does not need to touch
`scripts/lib/roster.sh` at all**, so the whole-file-migration trigger never
fires for it. See §3.

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

**Re-measured live 2026-09-25** (one `codex exec -m <slug> --sandbox
read-only "reply with just: ok"` per candidate, `~/.codex/models_cache.json`
read directly beforehand): the cache is the *same shape* as the original
measurement — `gpt-6-astra`(1) `gpt-6-sol`(2) `gpt-6-luna`(3)
`gpt-5.6-sol`(4) `gpt-5.6-terra`(7) `gpt-5.6-luna`(8) `gpt-5.5`(12), plus a
`hide`-visibility `gpt-reserve` at priority 3 that never enters the ranked
list. Probed: `gpt-6-astra` **usable**, `gpt-6-sol` **REFUSED** (same 400
`"is not supported when using Codex with a ChatGPT account"`),
`gpt-6-luna` **REFUSED** (identical to the bug row's original capture),
`gpt-5.6-sol` **usable**. So the failure is still live today, on the same
two slugs, two days after the row was opened — this is not a transient
blip. `AGENT_ROSTER.md` (read only, not edited) still has every Codex
persona on the `frontier-3` stopgap the founder applied 2026-09-23; today
that resolves to `gpt-5.6-sol` (priority 4, rank index 3), which the probe
above confirms is still usable. **The stopgap still holds, but it is still
luck, not a fix** — exactly the row's own point, restated: the SAME cell
named a refused model on 2026-09-23 within the same session.

**Correction to the brief's framing of Option C: it is already built, not
a design proposal.** `scripts/rotation.mts:237` (landed by `ce41f99`,
"TASK#65: classify provider refusals from owned diagnostics") already
classifies a Codex line matching `⚠ {"type":"error","status":400,...is not
supported when using Codex` — the exact shape `scripts/codex-feed-filter.sh`
produces from the refusal JSON this bug reproduces — as outcome class
`persona`, and `classifyOutcome`'s `persona` class marks that persona `out`
in `logs/state/rotation.log` with no cooldown expiry (`withCooldown` called
with no `hours`, `rotation.mts:236`). That marking is not launcher-specific
plumbing either: `scripts/signal-watch.mts:225-260` calls `rotation.mts
record` generically, after **every** dispatch on **every** provider, already
wired for Codex today. So "record the refusal, let the persona leave the
rotation with a stated reason" (the brief's Option C, and TASK-065(c)) is
live in production right now for exactly this error — it needs no new
outcome class, and nothing in this plan proposes adding one. What it does
NOT do — because recording happens after the dispatch has already failed —
is retry within the same dispatch, which is the actual outage: today a
persona hits a refused rank, the dispatch dies, and the persona gets marked
`out` only after the fact. Option A (below) is what closes that gap; C's job
is done.

## 1. Cheap unblock — already applied, still holding

This was proposed in the earlier draft of this plan and the founder applied
it 2026-09-23, in his own gitignored `AGENT_ROSTER.md`: every Codex persona
moved off `frontier-2`. §"What was measured" above confirms it is still
correct today — `frontier-3` resolves to `gpt-5.6-sol`, probed usable
2026-09-25. Nothing to propose here now; it is done and re-verified, not an
open action.

It is still what the bug row itself says it is: **a rank pin, not a fix.**
The cache reshuffled once already inside the session that applied it
(`frontier-3` meant `gpt-5.6-terra` when chosen, `gpt-5.6-luna` minutes
later); it can do that again at any time, silently, and nothing but a human
re-reading the cache would catch it before the next dead dispatch. That is
exactly the gap §2 closes.

## 2. The real fix

Three options, as named in the BUG-151 row.

**A — verify usability at resolution, fall to the next rank.** Before a
launcher trusts a resolved model, actually exercise it (or catch the CLI's
own refusal) and retry the next rank down on that specific failure class.
This is the only option that removes the failure mode itself: a listed-but-
unusable entry stops mattering because nothing downstream ever commits to it
blindly. Cost: this is a retry loop, not a one-line check — there is no
cheap dry-run for "will the account accept this model," so the practical
version catches the live 400 from `codex exec`, logs which rank was skipped
and why, and re-dispatches at rank+1 (bounded, so a genuinely exhausted list
fails loudly instead of looping, and its last failure still flows into the
existing generic record path — see the `persona`-class correction above).

**Touches one file, and it needs no shell port.** The retry loop is entirely
expressible inside `AGENT_WAKE_COMMAND`, the embedded dispatch script in
`scripts/start-codex-signal-watch.mts` (TASK-083 already made this file the
whole implementation; `scripts/start-codex-signal-watch.sh` is the fixed
two-line shim per `CLAUDE.md` §"Shell to TypeScript, organically", so
editing the `.mts` string is not editing a legacy `.sh` file). The data the
retry needs — the full ranked Codex list with each slug's supported
efforts — is already exposed, unchanged, by `bp_roster_codex_models`
(`scripts/lib/roster.sh:430-437`), which the wake command already sources
(line 141, for the feed label). **The loop only ever CALLS that function; it
never edits `roster.sh`**, so TASK-067's whole-file-migration trigger ("a
shell file you must change is migrated first") never fires — nothing about
Option A requires a change to `roster.sh`, only a read of a function that
already returns exactly the ranked `slug<TAB>levels` list the retry walks.
Mechanically: on the refusal shape `codex-feed-filter.sh` already emits
(`⚠ {"type":"error","status":400,...is not supported when using Codex`),
find the just-tried slug's line in `bp_roster_codex_models`'s output, move
to the next line, re-dispatch with that slug (its own supported efforts if
the roster cell's requested effort isn't among them — worth stating
explicitly once written, since silently changing effort is its own kind of
surprise), log the skip to `RUN_LOG` for visibility, and repeat up to a
small bound (e.g. the list length) so an entirely exhausted list fails
loudly — at which point the existing generic `rotation.mts record` call in
`scripts/signal-watch.mts` classifies the failure as `persona` exactly as it
does today, no new code needed there either.

**B — declare Codex's list explicitly in the roster, like Claude/Kimi.**
Symmetric with the other two providers, but it trades a dynamic-but-
sometimes-wrong source for a static one that goes stale the same way
`frontier-2` just did, except silently — nothing re-derives it from the CLI,
so a new model never appears and a retired one never disappears until a
human edits the roster. This does not fix the actual defect (an unverified
rank can still name an unusable model); it just moves where the wrong
assumption lives. Not recommended.

**C — record the refusal, let the provider leave the rotation with a stated
reason.** As the correction above establishes, this is not a design option
to build — `rotation.mts`'s `persona` class (`ce41f99`, TASK-065) already
matches this exact Codex refusal shape, and `signal-watch.mts` already
records it generically for every provider on every dispatch. On its own
(i.e. before Option A exists) it makes the failure visible and stops repeat
dispatches from re-paying the same 3-second round trip against an already-
known-bad rank, but it does not retry within the dispatch that hit the
refusal — that dispatch still dies. It is what already runs today as A's
exhaustion path, unmodified.

**Recommendation: A. C is already built and needs nothing further.**
Verify-and-fall-back is the only option that stops a rank from ever being
trusted blindly, which is the root cause stated in the bug row itself
("nothing checks that the rank the roster lands on is usable here"). B is
rejected — it re-creates the staleness problem this bug is about, just moved
to a file nothing refreshes. The exhaustion path A needs already exists and
is already wired, so the only new code is the bounded retry itself.

## 3. Cost: does this touch a legacy shell file?

**No, on a re-read against what TASK-083 and TASK-065 already shipped —
reversing what the first draft of this plan said.**

- `scripts/start-codex-signal-watch.sh` — already ported (TASK-083). It is
  now the fixed two-line exec shim
  (`scripts/shell-inventory.json` records it as the shim, its `.mts` target
  tracked separately); the fix edits `scripts/start-codex-signal-watch.mts`,
  which is already TypeScript. No port to do.
- `scripts/lib/roster.sh` — still legacy shell
  (`scripts/shell-inventory.json:33`, 517 lines), and still not on the
  closed exception list. But §2's Option A calls exactly one function on it,
  `bp_roster_codex_models`, unchanged — a read, not an edit. TASK-067's
  trigger is explicit: *"a shell file you must **change** is migrated
  first"* (`CLAUDE.md` §"Shell to TypeScript, organically"). Nothing in this
  fix changes `roster.sh`, so the trigger does not fire. Checked every
  current caller to be sure none of them forces a change either: all four
  `start-*-signal-watch.mts` launchers (codex, kimi, gemini, and the fourth)
  already source it the same read-only way (`. "$ROOT/scripts/lib/roster.sh"`
  inside their own embedded wake commands), `rotation.mts:105-109` already
  calls into it through a `bash -c` one-liner rather than sourcing it
  directly, and the two callers that remain plain shell
  (`scripts/agent-activity.sh`, `scripts/team-kickoff.sh`) are untouched by
  this bug. None of them needs `roster.sh` to grow, shrink, or change
  behaviour for BUG-151.

**So the fix, concretely, touches one already-ported file plus tests:**

1. **Reproducer (red).** A new spec alongside
   `tests/codex-dispatch-status/` and `tests/roster-models/`, using the same
   harness both already use: `extractWakeCommand` /
   `unescapeTsShellText` (`tests/helpers/wake-command.ts`) to pull the live
   `AGENT_WAKE_COMMAND` string out of `start-codex-signal-watch.mts`, a fake
   `CODEX_BIN` standing in for the CLI, and a fake `CODEX_HOME` pointing at a
   small `models_cache.json` built the way `tests/roster-models` already
   builds one. Two cases: (a) rank 0 refused (fake `codex` exits non-zero
   with the `{"type":"error","status":400,...is not supported...}` shape on
   that slug, succeeds on rank 1) proves the dispatch still completes and
   `RUN_LOG` shows both the skipped rank and the one actually used; (b)
   every rank refused proves the launcher fails loudly (bounded, no hang)
   and that the *existing, unmodified* `persona` classification in
   `rotation.mts:237` still fires on the final failure, via
   `scripts/signal-watch.mts`'s existing generic record call — nothing new
   to assert there beyond "it still works," since Option C needed no
   change. Both are red today: the current launcher has no retry, so a
   rank-0 refusal is a dead dispatch full stop.
2. **Fix.** Add the bounded retry loop to `AGENT_WAKE_COMMAND` in
   `scripts/start-codex-signal-watch.mts` (the block currently around
   lines 169-204, where `bp_roster_model_for_name`'s result is turned into
   `-m`/`-c model_reasoning_effort=`), as described in §2. One file, no
   shell port.
3. **Proof.** Both reproducer cases from step 1 go green; existing
   `tests/codex-dispatch-status`, `tests/codex-persona-label`,
   `tests/roster-models` and `tests/dispatch-identity` stay green
   unmodified (the retry only wraps the existing dispatch, it does not
   change how the wake command resolves identity, labels, or the
   exit-status pattern BUG-143 fixed).

**Not in scope for BUG-151, flagged for plan review rather than assumed:**
paying down `scripts/lib/roster.sh`'s legacy-shell status generally. The
founder's "fix them all" settles *whether a port happens when one is
needed* — it does not manufacture a need this fix does not have. If the
team wants `roster.sh` ported anyway as standing shell-debt paydown (BUG-147
sourced-adapter shape, and `scripts/shell-inventory-check.mts` extended to
recognise a second sourced adapter, per `CLAUDE.md`'s "a second sourced
library earns its own reviewed extension of the checker"), that is a
517-line, founder-level decision independent of this bug, and belongs in its
own TASK row rather than bundled into BUG-151's diff.
