# PLAN — BUG-151: a roster tier must not resolve to a model the provider refuses

**Status:** implemented. Cross-provider plan review (Alexey/Codex,
Slava/Kimi, §2.1) returned APPROVE WITH CHANGES on both sides, with no
disagreement between the two reviews; every amendment is folded into the
mechanism this document now describes, and into
`scripts/start-codex-signal-watch.mts` and
`tests/codex-model-retry/codex-model-retry.spec.ts` on disk.

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

## 2.1 Plan review (Alexey/Codex, Slava/Kimi) — APPROVE WITH CHANGES

Both reviewers agreed on five amendments to §2's Option A, checked
independently against the code. All five are folded into the mechanism
below, which is what `scripts/start-codex-signal-watch.mts` now implements
(the `AGENT_WAKE_COMMAND` block from "THE MODEL AND EFFORT" through the
final status report):

1. **Remembered refusals, invalidated on `models_cache.json` change.**
   `classifyOutput` returns `ok` for any exit-0 dispatch with no memory of
   what failed on the way there, so a successful rank+1 fallback erases the
   fact that rank N was refused — the next dispatch re-pays the same ~3s
   round trip, and with the measured within-session cache instability a
   refused slug can hold a top rank for many dispatches in a row. Built as
   `$STATE_DIR/codex-refused-slugs.json`, `{cache_sig, refused: {slug:
   feedLine}}`, keyed to the Codex cache file's own `mtime:size`
   (`stat -c '%Y:%s'`) so a cache refresh forgets every remembered refusal
   rather than misapplying one to a different model. jq or the file missing
   degrades to "no memory" — fail-open, the same policy the rest of this
   file already uses for a missing lib. This is in scope, not deferred: it
   is the mechanism that turns a repeated dead 3s round trip into one.
2. **One ranked-list snapshot per dispatch, bounding the retries; loud
   failure if the resolved slug is absent.** The bug row itself measured the
   rank→slug mapping reshuffling WITHIN a session (`frontier-2` = `gpt-6-
   luna`, then `gpt-6-sol`, then `gpt-5.6-sol`, minutes apart) — a retry that
   re-reads `bp_roster_codex_models` per iteration could skip a rank, revisit
   a refused one, or walk off a list that moved under it. `CODEX_RANKED` is
   read ONCE, right after the roster's own resolution; the loop's bound is
   this snapshot's length (`RETRY_TOTAL`), never a re-read. If the just-
   resolved `REQUESTED_MODEL` is not even ON this snapshot (the roster's own
   read and this one landed on two different cache instants), the dispatch
   is refused loudly (exit 8, same code the file already uses for a refused
   dispatch) rather than silently walking a list the resolved slug never
   belonged to.
3. **Fallback visible in the run log AND the feed; a deterministic effort
   policy.** `FEED_LABEL` is resolved once pre-dispatch and corrected only
   post-run, so mid-run it still attributes work to the model that was just
   refused — relabelling mid-run was rejected as the fix; instead every
   fallback and every skip gets its own `feed_append` line (visible under
   whatever label is currently showing), plus a `[roster] falling back to
   rank N: <slug> effort=<e>` line in `RUN_LOG`. Effort: the fallback slug
   keeps the originally-requested effort if it supports it, else its own
   FIRST listed supported level in the CLI cache's own order — never an
   invented rank of our own, stated in one place so a silent effort change
   is never a surprise.
4. **Fake-CLI fidelity in the reproducer.** A live refusal was captured
   2026-09-25 (`codex exec --json -m gpt-6-luna ...`) as a **STDOUT** `--json`
   event `{"type":"error","message":"<escaped JSON string carrying
   status:400 and the exact 'is not supported' text>"}` — never the
   pre-filtered `⚠`-prefixed line `codex-feed-filter.sh` derives from it, and
   never on stderr. `tests/codex-model-retry`'s `STUB_CODEX` reproduces that
   exact wire shape, with `--output-last-message` left unwritten on refusal
   (matching BUG-143: a dead run never touches it). Two cases the review
   asked for beyond the happy-path retry: an UNRELATED failure (a capacity-
   shaped message, not the 400 refusal shape) proves the loop never retries
   on it — one dispatch attempt, reported FAILED exactly as before this fix
   — and a remembered refusal (point 1) is proved to be skipped WITHOUT
   reaching the CLI a second time, by counting stub invocations.
5. **The all-refused case driven through the real launcher, not an extracted
   wake body.** A bug in how the retry loop's own exit status reaches
   `signal-watch.mts`'s `recordDispatchOutcome` (e.g. a loop that swallows
   the final non-zero exit) would classify total exhaustion as `ok` — exit 0
   maps to `ok` unconditionally in `rotation.mts:216` — and nothing that
   runs the extracted `AGENT_WAKE_COMMAND` string in isolation would catch
   that, because the seam under test is what happens AFTER the wake command
   returns. `tests/codex-model-retry`'s exhaustion case runs the actual
   launcher shim end to end (`bash start-codex-signal-watch.sh --poll 1
   --once`, the same shape `tests/scratch-tmpdir-dispatch` already proves
   TMPDIR with) and reads `logs/state/rotation.log` afterward for
   `"class":"persona"` — proving the existing, UNMODIFIED classifier still
   fires off the real run-log slice the retry loop produced.

**BUG-143 preservation, stated explicitly per the review.** The retry loop
wraps the exact block that carries BUG-143's exit-status fix
(`CODEX_STATUS_FILE`, written immediately after every `codex exec` exits,
inside the loop body — not just the last attempt) and the honest
`--output-last-message` in-progress marker (stamped once, before the loop,
unchanged). Every one of N attempts gets its own status-file write; the
dash/pipefail-loss fix BUG-143 built is exercised on every iteration, not
bypassed by looping around it.

**No disagreement, nothing deferred.** Both reviewers reached the same five
points independently and found no daylight between them; point 1 (remembered
refusals) was flagged as the largest new mechanism and an efficiency
property rather than a correctness one, but "the plan should decide
explicitly, not leave it implicit" — decided here: in scope, built.

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

**So the fix, concretely, touches one already-ported file plus tests —
implemented, per the founder's "fix them all" for `docs/doing/`:**

1. **Reproducer (red before the fix, proven by reverting the launcher to
   `HEAD` and re-running).** `tests/codex-model-retry/codex-model-retry.spec.ts`,
   in the shape `tests/scratch-tmpdir-dispatch` already proves out — a real
   git-shaped fixture and the ACTUAL launcher shim run end to end
   (`bash start-codex-signal-watch.sh --poll 1 --once`), never an extracted
   wake body in isolation (review point 5). `STUB_CODEX` reproduces the
   live wire shape captured 2026-09-25 (review point 4). Four cases:
   - a refused rank 1 (`m1`) and rank 2 (`m2`) both fall back, the dispatch
     completes on rank 3 (`m3`), and `RUN_LOG` shows both fallback lines;
   - an unrelated, capacity-shaped failure triggers exactly one dispatch
     attempt, never a retry;
   - every rank refused: the dispatch FAILS loudly (bounded — the run does
     not hang) and `logs/state/rotation.log` shows `"class":"persona"`,
     recorded by the pre-existing, unmodified classifier via
     `signal-watch.mts`'s generic `recordDispatchOutcome`;
   - a remembered refusal (same `models_cache.json`, same account) is
     skipped on a SECOND dispatch without reaching the stub CLI at all,
     proven by counting stub invocations.

   All four were run against the unfixed `HEAD` version of
   `start-codex-signal-watch.mts` first: three failed exactly as the bug
   predicts (single dead dispatch, no fallback, no persisted refusal), and
   the "unrelated failure" case passed unchanged in both versions — a
   sanity check that it is not a tautology, since single-shot behaviour on
   a non-refusal failure was never what this bug changes.
2. **Fix.** The bounded retry loop, the ranked-list snapshot, the
   remembered-refusal cache and the exhaustion report, all inside
   `AGENT_WAKE_COMMAND` in `scripts/start-codex-signal-watch.mts` — the
   block from "THE MODEL AND EFFORT" through the final status report. One
   file, no shell port, as §2.1 details.
3. **Proof.** All four reproducer cases go green against the fixed launcher;
   the existing `tests/codex-dispatch-status`, `tests/codex-persona-label`,
   `tests/codex-session`, `tests/roster-models`, `tests/dispatch-identity`
   and `tests/scratch-tmpdir-dispatch` suites (56 tests across all seven
   files) stay green unmodified — none of their fixtures carries a Codex
   Model cell, so the retry path they never touched before still does not
   touch them.

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
