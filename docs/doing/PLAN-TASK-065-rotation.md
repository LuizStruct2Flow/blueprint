# PLAN — TASK-065: provider rotation in code

**Status: DRAFT v1, for three-provider review** (Codex, Kimi, Claude), per
[`AGENTS.md`](../../AGENTS.md) §"Who does the work". Written by Christian
(Architect-1, Claude). Nothing is implemented. Row:
[TASK-065](BACKLOG.md).

The row owns four things: (a) rotation state that survives a session, (b) a
selector the Orchestrator calls instead of choosing, (c) honest quota
detection, and (d) the one-provider collision with four-eyes. Its next-step
gate comes first: find out what each CLI actually reports when it runs out,
before designing around a guess. §1 clears that gate from real artefacts.
§2 onward is the design.

---

## 1. The gate: what each CLI actually says when it runs out

Every claim below is quoted from a file on this machine, with its path. Paths
under `logs/state/` are the blueprint's main checkout unless marked
*storm2flow*. Nothing was predicted and no quota was spent: the only commands
run were `--help`.

### Kimi (`kimi` 2.0.2): observed five times

```
error: failed to run prompt: provider.auth_error: 403 You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends. To continue now, purchase extra usage or upgrade your plan: https://www.kimi.com/membership/subscription?tab=quota
See log: /home/luiz/.kimi-code/logs/kimi-code.log
[…] kimi FAILED (exit 1) — see …/kimi-last-message.md for the last message
```

| When (UTC) | Where in the run | `logs/state/kimi-runs.log` |
|---|---|---|
| 2026-09-21 13:05:42 | at start, 3 s | 3358–3360 |
| 2026-09-22 18:59:44 | mid-run, 8 min in | 9836–9838 |
| 2026-09-22 19:19:22 | at start, 3 s (still out 20 min later) | 9844–9846 |
| 2026-09-23 09:54:46 | mid-run, about 20 min in (the BUG-150 incident) | 12784–12786 |
| 2026-09-23 17:19:16 | mid-run, about 24 min in | 16397–16399 |

- **A structured copy exists per session**:
  `~/.kimi-code/sessions/wd_blueprint_59950644d11c/session_9d13e940-…/agents/main/wire.jsonl`
  records `turn.ended` with `"error":{"code":"provider.auth_error", …
  "details":{"statusCode":403}, "retryable":false}`. The session's own
  `logs/kimi-code.log` has `WARN llm request failed … statusCode=403`.
- **The log the CLI points at is empty of it.** `~/.kimi-code/logs/kimi-code.log`,
  named by the `See log:` line, records nothing about any of the five.
- **The code and the status say "auth", and it is not auth.** A classifier
  keyed on `403` or `auth_error` would record a quota refusal as a broken
  login. Only the text says quota.
- **No reset time is given**, only "when the current 5-hour window ends". The
  window was already open when the refusal came, so it ends within 5 hours of
  the refusal. That bound comes from Kimi's own words.
- **Usage query: none.** `kimi --help` lists export, fork, provider, session,
  acp, web, rc, login, doctor, vis, install-desktop, migrate and upgrade.
  `kimi provider --help` lists add, remove, list and catalog.

### Codex (`codex-cli` 0.154.0): three different refusals, one of them quota

**Quota**, never yet observed in the blueprint's run log. It was observed twice
from storm2flow, which uses the same account on this machine:

```
⚠ You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase mo
[2026-09-24T12:08:27Z] codex exec FAILED (exit 1) — see …/codex-runs.log
```

*storm2flow* `logs/state/codex-runs.log:2570–2572`, and the same text at
`:2292–2294` (2026-09-22 20:04:47Z). The run log truncates the line; the full
message is in the session rollout,
`~/.codex/sessions/2026/09/24/rollout-2026-09-24T13-59-01-01a0d348-….jsonl`:
`task_complete.error = {"message":"You've hit your usage limit. … or try again
at Sep 26th, 2026 6:29 PM.","codex_error_info":"usage_limit_exceeded"}`. The
last `token_count` event before it has `secondary.used_percent: 100.0`,
`window_minutes: 10080`, so it was the **weekly** window.

**The reset time Codex stated was wrong.** The next storm2flow dispatch, at
12:31:07Z (23 minutes later), ran a full turn. Its rollout
(`rollout-2026-09-24T14-31-08-01a0d365-….jsonl`) shows the primary and
secondary counters at `0.0` and a new weekly `resets_at` a week out. **Why it
came back is not established.** The rollout still reads `plan_type: "plus"`
and `credits.balance: "0"`. What is established is that a stated reset time is
not proof of anything, in either direction.

**A model refusal** (BUG-151), `logs/state/codex-runs.log:2844–2846`,
2026-09-23 10:14:21Z:

```
⚠ {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account."}}
[2026-09-23T10:14:21Z] codex exec FAILED (exit 1) — see …/codex-runs.log
```

(The run log truncates this line too; the full text is in rollout
`2026-09-23/rollout-2026-09-23T12-14-19-01a0cdc2-….jsonl`.) This is **not**
quota. The account is fine, and other Codex models ran the same day.

**Capacity**, `logs/state/codex-runs.log:2682–2684`, 2026-09-22 16:40:54Z:
`⚠ Selected model is at capacity. Please try a different model.`, recorded in
the rollout as `codex_error_info: "server_overloaded"`. It was transient: the
retry 30 s later ran (`:2686`).

**Usage query: none as a command** (`codex --help` has doctor, not usage).
**But Codex reports usage passively.** Every `token_count` event in every
rollout carries the server's own `rate_limits`: `primary` (300-minute window)
and `secondary` (10,080-minute window), each with `used_percent` and
`resets_at`, plus `plan_type`. This is the only provider that exposes a usage
figure at all. It is a server-reported fact, but only as fresh as the last
Codex run, and the `resets_at` above was contradicted within the hour.

### Gemini (`gemini-cli`): observed once

`logs/state/gemini-runs.log`, 2026-09-22 09:09:59Z:

```
TerminalQuotaError: You have exhausted your daily quota on this model.
  cause: { code: 429, message: '… Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash\nPlease retry in 997.965142ms.' }
[2026-09-22T09:09:59Z] gemini FAILED (exit 1) — see …/gemini-last-message.md
```

- **The retry hint is wrong for this error**: "retry in 997 ms" on a daily cap.
  The CLI's own classifier calls it `TerminalQuotaError`, which is the text to
  trust.
- The same run also shows a transient `fetch failed … Retrying with backoff`,
  which the CLI retries by itself. It is not a refusal.
- **Usage query: none** in `gemini --help`.

### Claude Code: observed once, in a subagent

`~/.claude/projects/-home-luiz-dev-struct2flow-blueprint/9e58c7ad-…/subagents/agent-a210d1718528c8228.jsonl`:
the agent's final message is `You've hit your session limit · resets 4:30pm
(Europe/Berlin)`. The record carries `apiErrorStatus: 429`, `error:
"rate_limit"`, and `quotaLimits: {status: "rejected", rateLimitType:
"five_hour", resetsAt: 1789569000}` (2026-09-16 14:30Z).

- **Claude personas are Agent-tool subagents, not watcher dispatches**, so
  there is no run log and no watcher to read the refusal. The Orchestrator sees
  it as the subagent's result.
- **When Claude is out, the Orchestrator is out too**, because they share the
  account. Recording it is for the record. Nobody is left to act on it until
  the window ends.
- **Usage query: none** in `claude --help`. (Whether the interactive `/usage`
  command could be scripted was not checked.)

### What the evidence decides

1. **Exit status cannot tell quota apart from anything else.** Every quota
   refusal, the model refusal, the capacity error and any crash all exit 1.
   Only the provider's text distinguishes them.
2. **A refusal can arrive mid-run.** Three of Kimi's five came 8 to 24 minutes
   into real work. Quota detection is therefore also a question of what happens
   to the item in flight (§5, decision D1).
3. **Stated reset times are hints, not facts.** Kimi states none, Gemini's is
   wrong for its own error, and Codex's was contradicted 23 minutes later. The
   only proof that a provider is back is a dispatch that succeeds.
4. **The run logs quote refusals in successful runs.** `kimi-runs.log:3733`,
   `:3818–3819`, `:3950–3951` and `:8576` are agents discussing the Kimi 403 in
   runs that exited 0. A classifier that matched text anywhere would mark a
   provider out because an agent read a bug report. Matching therefore needs
   exit ≠ 0 **and** the CLI's own line shape (anchored at the start of the
   line; the agent's quotes are indented or mid-sentence).
5. **Quota belongs to the account, and accounts are shared between
   checkouts.** Codex's and Kimi's refusals were observed from storm2flow and
   from the blueprint, on one machine. This is decision D2.
6. **Only Codex exposes a usage figure, and only passively.** The row forbids
   predicting quota. v1 does not act on `used_percent` (§7).

---

## 2. Rotation state: an append-only event log

**File:** `logs/state/rotation.log`, resolved through `scripts/lib/state-dir.sh`
exactly as the baton is (BUG-019/BUG-020). It is untracked, per-checkout,
JSON Lines, and has one writer: `scripts/rotation.mts`.

**Why an event log, not a published snapshot.** `scripts/signal-set.sh` has two
halves. The baton half publishes a whole value by rename, which is correct
because every publish replaces the value outright. Rotation state is modified,
not replaced, and it is modified from two places: the watcher recording a
refusal and the Orchestrator assigning an item. A modify-then-rename has lost
updates when those two land together, and closing that needs a lock (Node has
no `flock`). signal-set.sh's other half is its journal, which is exactly this
problem already solved. Each record is **one `write` with `O_APPEND`**, readers
fold the whole log, and two writers cannot interleave within a record
(signal-set.sh's journal docblock states the same rule, and
`session-resume.sh --mark` relies on it). The history comes for free: "why is
Kimi out" is answered by the line that put it there.

**Events** (one JSON object per line):

| `ev` | Fields | Written by |
|---|---|---|
| `assign` | `item`, `family`, `persona`, `provider`, `how` (`rotation`\|`item`\|`review`\|`override`\|`reassign`), `reason?` | `next`, `review`, `assign` |
| `outcome` | `persona`, `provider`, `class` (`quota`\|`persona`\|`transient`\|`ok`\|`unknown`), `evidence` (the matched line), `source` (`path@offset`), `until?` | the watcher; `record` by hand |
| `retry` | `provider` or `persona`, `reason` | `retry` |
| `skip` | `item`, `persona`, `reason` | `next --skip` |

**Reading the log is a fold, and it fails loudly.** A final line with no
trailing newline is a write still in progress. It is ignored and not reported.
A malformed complete line is reported on stderr with its line number and
skipped, never silently dropped (CLAUDE.md §"Observability"). There is no
compaction: a few lines per item is a few thousand a year. *ponytail: no
rotation of the log; add one if it passes about 1 MB.*

**Derived state:**

- **Provider:** `in` by default. A `quota` outcome makes it `out` until its
  `until`. After `until`, or after a `retry`, it is `unproven`. **Only an `ok`
  outcome makes it `in`.** A stated reset time never does (§1, point 3).
- **Persona:** the same machine, driven by `persona`-class outcomes (model
  refused, roster could not resolve). It has no `until`. It stays out until a
  `retry` and then a successful dispatch, because nothing about a persona's
  broken cell heals with time.
- **Family pointer:** the provider of the family's last `assign`.
- **Item provider:** the provider of the item's last non-`review` `assign`.

---

## 3. The selector: `scripts/rotation.mts`

A single CLI, `node scripts/rotation.mts <command>`, in TypeScript under
`scripts/tsconfig.json`. **No shell file is written.** It reads the roster by
calling `bp_roster_rows` from `scripts/lib/roster.sh` in a subprocess, which is
the same bridge `scripts/signal-watch.mts` already uses for
`bp_roster_name_for_role`. It resolves the state directory the same way.

**Role family** is the Role cell with a trailing `-N` removed. That is the
regex `scripts/team-kickoff.sh:57` already applies (`s/-[0-9]\+$//`), so
`QA-2` becomes `QA`, and `Back-End-4 (junior)` stays itself, a family of one.
Juniors therefore never enter the frontier rotation, which is what the
founder's "simple tasks only" rule (2026-09-23) needs, and no code has to know
the word "junior". **Provider** is the `Backing agent` cell verbatim. No
mapping table is needed.

**Order within a family** is roster row order. The next pick is the first
eligible persona after the family pointer, wrapping around. Eligible means the
persona and its provider are both `in` or `unproven`, and the persona is not
skipped for this item.

| Command | Does | Exit |
|---|---|---|
| `next <family> --item <ID> [--skip <persona>=<reason>]…` | Returns the author for this item in this family. The item already has a provider → that family's persona on the same provider (`how: item`), because the whole item runs on one provider. Otherwise → the next eligible persona by rotation. It is idempotent: asking again returns the same answer and writes nothing. | 0; **3** the family has no eligible persona (a roster gap, or everyone out); **5** the item's provider is out (D1) |
| `review <family> --item <ID> [--author <persona>]` | Returns the next eligible persona in `family` **whose provider differs from the item's author provider**. `--author` is used only when the log has no author for the item. | 0; **3** as above; **4** four-eyes cannot be satisfied |
| `assign <persona> --item <ID> --reason <text>` | A founder override, and also how the hand rotation in `HANDOVER.md` is seeded. The reason is mandatory, so an override is visible. | 0 |
| `record <persona> (--run-log <f> --from <offset> \| --output <f> --exit <n>)` | Classifies a finished dispatch (§4) and appends an `outcome`. The watcher calls it; the Orchestrator calls it by hand for Claude subagents and Ollama juniors. | 0 |
| `retry <provider\|persona> --reason <text>` | Makes an `out` provider or persona `unproven` now, for example when the founder has bought credits. It does **not** make it `in`. | 0 |
| `coverage [<family>]` | The report. For each family: its personas by provider, each one's state (with the since time, the reason and the evidence source), the next pick, and a warning where the family has fewer than two available providers. | 0 |

**Output.** `next` and `review` print one line, `persona<TAB>provider<TAB>family`,
on stdout. Every explanation goes to stderr: why a persona was skipped, which
provider is out and on what evidence, and "this dispatch is the probe" when the
pick is `unproven`. A script reads stdout. A human reads both.

**It never spills across roles.** Exit 3 names the family and what it has.
Example: `Back-End: Matthias (Claude Code) out [quota …], Andreas (Codex) out
[…], Jonathan (Kimi) out […] — hold, or tell the founder the role is short.`
No flag lets it return a persona from another family. That is (d)'s first half.

**It never lets a provider review itself.** Exit 4:
`four-eyes cannot be satisfied for TASK-065: author provider Claude Code is the
only one with an eligible QA persona — hold the push and tell the founder; a
waiver is the founder's` (AGENTS.md §"Two things this collides with"). No flag
bypasses it. A founder waiver is recorded as an `assign --reason`, by the
founder's instruction. That is (d)'s second half.

**Plan review needs no command.** "All three providers" is `coverage
Architect`, which lists who is available. How to proceed with two of three is
the protocol's decision, not the tool's (§7).

**Capability skips** ("routed only work it can verify", AGENTS.md) are
`--skip Andreas="sandbox cannot build fixture git repos"`. They are written as
`skip` events, so the gap is recorded rather than habitual, which is what
AGENTS.md asks for.

---

## 4. Refusal detection: reading the provider's own words

### The classifier

`record` takes one dispatch's output and returns a class. It is a table of
patterns, each quoted from §1, each with the provider it was observed on and a
cooldown taken from the provider's own words:

| Class | Pattern (anchored at line start unless noted) | Cooldown `until` | Seen on |
|---|---|---|---|
| `quota` | `error: failed to run prompt: provider.auth_error: 403 You've reached your 5-hour usage limit` | refusal + 5 h | Kimi |
| `quota` | `⚠ You've hit your usage limit` | refusal + 5 h (see note) | Codex |
| `quota` | `TerminalQuotaError: You have exhausted your daily quota` (anywhere in the line) | refusal + 24 h | Gemini |
| `quota` | `You've hit your session limit` | refusal + 5 h | Claude |
| `persona` | `⚠ {"type":"error","status":400,…"is not supported when using Codex` | none | Codex (BUG-151) |
| `persona` | the launcher's own `— dispatch refused` roster line (exit 8) | none | all launchers |
| `transient` | `⚠ Selected model is at capacity` | none; nothing goes out | Codex |
| `ok` | the launcher's `finished` line, exit 0 | — | all |
| `unknown` | any other exit ≠ 0 | none; nothing goes out | — |

**Rules:**

- **Nothing but `quota` or `persona` takes anything out.** An `unknown`
  failure is recorded, shown in `coverage` with its source, and changes no
  state. Marking a provider out on an unrecognised failure would be the guess
  the row forbids.
- **Exit ≠ 0 is required for every refusal class.** This is what makes the
  quoted-in-a-successful-run lines in §1 point 4 harmless. The class is
  decided from the launcher's own final status line (`… finished` or
  `… FAILED (exit N)`) inside the slice. If there is no status line, the class
  is `unknown`.
- **Codex's cooldown is 5 h and deliberately not the stated time.** The stated
  time is truncated in the run log, and when it was read in full it was wrong
  by two days (§1). Both Codex and Claude report a 300-minute primary window
  in their own records. A probe after 5 h that meets the weekly limit costs
  one refusal of about 3 s, and puts the provider out again. *ponytail: one
  number per pattern; a per-window parse is possible from the rollout's
  `rate_limits`, but only worth it if a 5 h probe cadence proves wasteful.*
- **A cooldown is not a claim that the provider is back.** It only decides when
  the next real item may act as the probe. The probe itself is what proves it
  (§2).
- **A pattern not yet seen is not in the table.** Codex's primary-window
  wording, Claude's weekly wording and Kimi's weekly wording (if any) are
  absent until a real artefact shows them. The table grows from logs, with a
  source quote per row. Each unrecognised refusal in the meantime surfaces as
  `unknown`, with its source, which is the prompt to add a row.

### Where the watcher calls it

`scripts/signal-watch.mts` (already TypeScript) gains one step in
`triggerIfNeeded`:

1. Before the wake command runs, record `size(<stateDir>/<p>-runs.log)`. `<p>`
   is the lowercased suffix of the watcher's `--state OVER_TO_<P>`.
2. After it returns, and **before** `recoverStrandedMic`, spawn `node
   scripts/rotation.mts record <holder> --run-log <that file> --from <offset>`.
3. If `rotation.mts` fails, or the run log is missing or has not grown, write
   one line to the watcher's own log (`signal.log`) and continue. A rotation
   bug must never stop the watcher or the mic recovery.

**The byte offset is this dispatch's identity**, and no agent can rewrite it.
That is the property BUG-150 found missing from the baton (§6).

**The run-log path is a convention the watcher shares with the launchers**
(`RUN_LOG="$STATE_DIR/<p>-runs.log"`, in all three launchers' wake strings).
Two places knowing one name is the A-09 shape, so a static test pins it: the
test reads each `start-*-signal-watch.sh`'s bytes and asserts that its
`RUN_LOG` line equals the watcher's derivation (the same technique
`tests/dispatch-identity` uses to pin the `AGENT_PERSONA` bridge in every
launcher). The alternative, launchers exporting the path, edits three legacy
files (§6).

**The recovered mic's Task names the outcome.** Today it reads "`<holder>'s
dispatch ended without handing back the mic - read the provider run log`".
With the outcome it can read "`… - kimi quota refusal, Kimi out of the
rotation until 18:05Z`". This is a one-string change. It is held for BUG-150's
rewrite of the same function (§6).

---

## 5. Decisions needed

### D1 (founder): the item's provider runs out mid-item. Reassign, or hold?

**Decided 2026-09-24 by the founder: reassign.** Reassign is the default
branch in `next`. `--hold` (exit 5) stays available as an explicit override.

Two founder rules meet here. "The item runs entirely on one provider" and "a
provider at zero quota leaves the rotation" cannot both hold once Kimi refuses
24 minutes into an item.

- **Reassign (recommended).** `next` for that item moves it to the next
  eligible persona in the family, writing `assign how=reassign` with the
  refusal as the reason. The new agent takes over the working tree, which is
  the "take over and finish" brief. **Both real precedents did this.** TASK-077
  went from Jonathan (Kimi, cut off 2026-09-23) to Matthias
  (`HANDOVER.md` §"The rotation"). storm2flow's BUG-212 went from Thomas
  (Kimi) to Elias (Codex) after "the founder chose not to wait for Kimi"
  (*storm2flow* `codex-runs.log:1400`).
- **Hold.** `next` exits 5 and names both options, and the item waits for the
  provider. This keeps the per-item rule literally, and a 5-hour window can
  stall a small item that another provider would finish in 20 minutes.

The design writes both. The default is one branch in `next`, and exit 5
exists either way for an explicit `--hold`.

### D2 (reviewers): whose state is "Kimi is out", the checkout's or the machine's?

§1 point 5: the accounts are shared. storm2flow and the blueprint draw on the
same Codex and Kimi quota.

- **Per-checkout `logs/state/` (recommended).** It invents no new location and
  follows the BUG-019/BUG-020 anchoring. The cost: a sibling checkout learns
  that a provider is out only by paying its own refusal. For a provider already
  out, that measured 3 s (Kimi 13:05:39→42Z, 19:19:19→22Z; Codex 10:14:18→21Z)
  with no work lost. Sharing would not have saved the mid-run refusals, which
  hit whichever checkout was running.
- **Per-machine** (for example `~/.struct2flow/provider-state.log`). Each
  refusal is learned once for every project. It is a new shared location
  outside every repository, which nothing else in the framework has. It is
  written by several projects' watchers. And it is state that `blueprint
  pull` and every project's `.gitignore` cannot see.

---

## 6. What this touches, and whether anything forces a port

| File | Kind | Touched? |
|---|---|---|
| `scripts/rotation.mts` | **new**, TypeScript | written |
| `scripts/signal-watch.mts` | TypeScript | edited: offset capture, the `record` call, and later the Task string |
| `scripts/lib/roster.sh` | legacy shell, 517 lines | **called, not changed** (`bp_roster_rows` in a subprocess) |
| `scripts/lib/state-dir.sh` | legacy shell | **called, not changed** |
| `scripts/start-{codex,kimi,gemini}-signal-watch.sh` | legacy shell (332/310/177 lines) | **not changed**. Their `RUN_LOG` names are pinned by a test that only reads them. |
| `scripts/team-kickoff.sh` | legacy shell | **not changed**. Its suffix regex is mirrored in TS, with a comment and a test pinning `QA-2`→`QA` and `Back-End-4 (junior)` unchanged. |
| `scripts/codex-feed-filter.sh` | legacy shell | **not changed**. It truncates Codex's refusal lines, but the patterns match their prefixes. |
| `scripts/signal-set.sh` | legacy shell | not used. Rotation has its own writer (§2). |

**No whole-file port is forced by this design.** Two alternatives a reviewer
might prefer would force one:

- **Launchers export `RUN_LOG`, or record their own outcome.** That edits three
  launchers, which means porting 819 lines first.
- **A `bp_roster_family` function in `roster.sh`.** That edits it, which means
  a 517-line port. BUG-151 already makes that same port a founder cost decision
  (`PLAN-BUG-151-model-resolution.md` §3). If BUG-151 ports `roster.sh`
  first, the family rule should move into its TS form then, and the mirror in
  `rotation.mts` should be deleted.

**The state-dir bridge is copied, not shared.** `rotation.mts` needs the same
roughly 10-line subprocess call to `state-dir.sh` that `signal-watch.mts` has
(`stateDirFn`). No `.mts` in `scripts/` imports another yet. If BUG-147 lands
a shared TS lib first, use it. Otherwise the copy is two callers of one rule,
not two rules, and it is noted here so a reviewer need not find it.

**BUG-151 (a model refusal)** is the `persona` class. The persona leaves the
rotation with its model and the refusal as the stated reason, instead of
failing every dispatch in silence. It is persona-level, not provider-level:
on 2026-09-23 `gpt-6-luna` was refused while `gpt-5.6-luna` ran on the same
account. This is exactly BUG-151's option C, "the exhaustion path", and it
complements that plan's recommended option A (fall back a rank) rather than
replacing it. When A lands, A's give-up path emits the same 400 line and needs
no new pattern. **Neither blocks the other.**

**BUG-150 (dispatch identity in the watcher).** The recorder does not read the
baton, so BUG-150 cannot break it. It keys on the run-log offset captured
around the spawn, an identity no agent rewrites. That is also a candidate for
BUG-150's own missing identity; its plan should weigh it against its
`signal-history.log` idea. **Ordering:** BUG-150 first. It is S2 on the common
path, it rewrites `recoverStrandedMic`, and TASK-065's only edit near that
function is the Task-string change, which slice 5 makes after BUG-150 lands.
Slices 1 to 4 do not wait for it.

---

## 7. Deliberately not in v1

- **Acting on Codex's `used_percent`.** It is a server fact, not a guess, but
  using it to skip Codex *before* a refusal is prediction by another name, and
  its `resets_at` was contradicted within the hour on 2026-09-24. It could be
  *shown* in `coverage` later. Add it only if someone asks for it.
- **A probe command.** An idle probe spends quota to learn something the next
  real dispatch learns for free. The `unproven` state makes that dispatch the
  probe.
- **What "consensus" means with two of three reviewers.** That is protocol
  (AGENTS.md "Defaults"), not selector logic.
- **Watcher liveness.** A provider can be `in` while its watcher is down.
  `tests/watcher-liveness` and `start-all-watchers.sh` own that.
- **Cross-machine state.** "The other machine does not matter" (founder,
  2026-07-30).

---

## 8. Slices: one commit each, each with its test

Every commit subject is `TASK#65: …`. Suites are discovered from the
filesystem (`scripts/lib/suites.sh`), so a new `tests/<name>/` needs no
registration. None of the new suites builds a git repository, so a
Codex-sandboxed implementer can run them (AGENTS.md "routed only work it can
verify"). The implementer should confirm this at dispatch rather than take it
from here.

1. **The event log.** `scripts/rotation.mts` with the log writer and the fold,
   plus `record --output/--exit` and `retry`. Test: `tests/rotation/` covers
   the fold state machine (`quota`→out→`until` passes→unproven→`ok`→in;
   `retry`; a `persona` outcome with no cooldown). It also covers a torn final
   line ignored silently, a malformed line reported on stderr, and 20
   concurrent `record` processes producing 20 intact lines. **Mutant:**
   letting a cooldown expiry set `in` instead of `unproven` must fail a case.

2. **The classifier.** The pattern table and `record --run-log --from`.
   Test: `tests/rotation/` gets fixtures cut verbatim from the §1 artefacts
   (each carrying its source path in a comment), one per table row, each
   mapping to its class and cooldown. Negatives: a real exit-0 slice that
   quotes the Kimi 403 (`kimi-runs.log` around `:3818`) must be `ok`, and a
   FAILED slice with no known line must be `unknown`, taking nothing out.
   **Mutant:** dropping the exit ≠ 0 requirement must fail the quoted-403 case.

3. **The selector.** `next`, `review`, `assign`, `coverage` and `--skip`.
   Test: a fixture roster via `AGENT_ROSTER_FILE`. Cases: three providers
   rotate in row order and wrap; an out provider is skipped with its reason on
   stderr; a single-provider family (PO) always returns its persona and
   `coverage` says "no rotation"; a family with no one eligible exits 3 **and
   never returns another family's persona although one is available**; `next`
   is idempotent per item; an item's provider carries across families;
   `review` excludes the author's provider; author-provider-only exits 4 with
   the founder wording; `unproven` is selectable and flagged as the probe; a
   junior forms its own family; the D1 default. **Mutant:** removing the
   family filter from candidate selection must fail the no-spill case.

4. **The watcher wiring.** Offset capture and the `record` call in
   `signal-watch.mts`. Test: extend `tests/mic-recovery` (it already drives
   the watcher with a stub wake command). A stub that appends Kimi's 403 and
   `kimi FAILED (exit 1)` to the fixture `kimi-runs.log` must produce a
   `quota` outcome for the dispatched persona. A stub that exits cleanly must
   produce `ok`. A missing or crashing `rotation.mts` must log to `signal.log`
   **and still recover the mic**. Static case: every launcher's `RUN_LOG`
   matches the watcher's derivation.

5. **The protocol moves to the command** (after BUG-150). The recovered-mic
   Task string names the outcome. `AGENTS.md` §"Who does the work" and
   §"Defaults" name `rotation.mts` where they now say "until TASK-065 lands".
   The `HANDOVER.md` §"The rotation" table is replaced by a pointer to
   `node scripts/rotation.mts coverage`, and the Orchestrator seeds the log
   from the last hand table with `assign … --reason "seeded from HANDOVER
   2026-09-22"` (per-checkout state, so not part of the commit). The deck's
   persona-team bullet ([`way-of-working.md`](../way-of-working.md) concern 9)
   gets the same fix in the same commit (`CLAUDE.blueprint.md`). Test:
   `tests/doc-links` over the changed docs, plus the slice-4 recovery case
   asserting the new Task text.

**Rotation for the implementation itself.** TASK-065 is one item, so all five
slices run on one provider. Pick it by the hand rotation in `HANDOVER.md`
(Back-End: Jonathan on Kimi once its quota returns, then Andreas on Codex). The
item's four-eyes reviewer comes from a different provider. Once slice 3 lands,
the tool can make that pick.
