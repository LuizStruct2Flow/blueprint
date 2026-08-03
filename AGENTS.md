# Agent Coordination Protocol

Canonical rules for how the team agents — **Codex, Claude Code, Gemini, and
GitHub Copilot** — coordinate in this repo. The live state is the slim baton in
[AGENT_SIGNAL.md](AGENT_SIGNAL.md) (the "radio over" file); **this file is the
protocol** (how the radio works). `CLAUDE.md` points here rather than duplicating
it.

Watch every agent live in one place: `bash scripts/agent-activity.sh --daemon`,
then `tail -f logs/agent-activity.log`. One tail-able
`[Persona - Backing agent]` feed (mic changes + each agent's actual work) written
to `logs/agent-activity.log`. `--stop` ends it; `--status` reports whether it runs.

## On wake — minimum read

At the start of every session or after any "wake" prompt, read before doing
substantive work:

- `AGENT_SIGNAL.md` — current holder, state, and handoff task.
- `AGENTS.md` (this file) — the coordination protocol.
- `CLAUDE.md` — shared project rules and delivery process.
- `docs/config/*.md` — stable product, acceptance, and findings context.
- `docs/doing/*.md` — active bugs, backlog items, and plans.
- `docs/waiting-acceptance/*.md` — pushed work awaiting founder acceptance.

The Claude Code prompt the founder talks to **directly** is the **Orchestrator** —
the persona named in the `Orchestrator` row of your gitignored `AGENT_ROSTER.md`
(template: [AGENT_ROSTER.example.md](AGENT_ROSTER.example.md)). **Read the name
from that row rather than assuming it**; `bash scripts/agent-activity.sh --whoami`
prints it. Rosters are per-engineer, so no name written here would be right for
everyone. On wake it
**adopts that persona** (its `Holder` value) and **ensures the live activity feed
is running** — `bash scripts/agent-activity.sh --daemon` — which cleans the log and
streams to `logs/agent-activity.log` (see [Watching it live](#watching-it-live));
watch it with `tail -f`, it does not open a terminal for you. A kernel `flock` makes
concurrent starts a no-op. **Spawned, non-primary personas must not start it** —
they adopt their own assigned persona and participate. See `CLAUDE.md` §"On wake".

## The mic (radio-over)

Before substantive work, **read the signal first** and confirm the mic is
available:

- proceed if `State = IDLE`
- proceed if `State = OVER_TO_<your agent>`
- proceed if `Holder = <your agent>`
- otherwise stop and report that another actor has the mic

After confirming the mic is available, claim it by updating:

- `Holder` — the **persona** that owns the mic: a `Name` cell from
  your `AGENT_ROSTER.md` (template:
  [AGENT_ROSTER.example.md](AGENT_ROSTER.example.md)), or `User`. Use the
  persona name, NOT the bare backing-agent type — that is what lets multiple
  sessions on the same backing agent (e.g. several Claude Code personas) coexist
  without colliding. Each session acts only when `Holder` is its own persona.
- `State` — `ACTIVE` while working, `OVER_TO_<NAME>` when handing off to a specific
  persona (e.g. `OVER_TO_KATHRIN`, `OVER_TO_CHRISTIAN`), `OVER_TO_USER`, or `IDLE`
- **A handback to the BACKING-AGENT type — `OVER_TO_CLAUDE`, `OVER_TO_CODEX` —
  is valid, not a defect.** It means "I am done, route this": the Orchestrator
  picks it up and dispatches to the right persona, which is its job. A dispatched
  agent often has no reason to know which persona should get the work next, and
  guessing would be worse than handing back. Founder decision, 2026-08-02 —
  recorded because the alternative reading (that a non-persona handback is a
  roster bug, BUG-010's class) is plausible enough that it was raised once and
  would be raised again.
- `Task` — one short sentence naming the current work
- `Last update` — absolute date

Keep `AGENT_SIGNAL.md` **slim**: the four-row baton above only. History lives in
`git log -p AGENT_SIGNAL.md`; per-slice decisions live in the relevant
`docs/doing/PLAN-*.md`.

### Rules

- **ACTIVE-on-claim — claiming the mic means setting `State = ACTIVE` (founder direction
 ).** The moment an agent takes the mic — whether the state was
  `OVER_TO_<you>`, `IDLE`, or you are picking up open work — it **must** flip
  `State` to `ACTIVE` (and set `Holder` to itself) *before* doing the work, not
  after. Leaving the state at `OVER_TO_<you>` while you work hides that the work
  has started, so others can't tell the mic is in use versus merely handed to
  you. `ACTIVE` = "in use right now"; flip back to `OVER_TO_<target>` only when
  you hand off.
- The `ACTIVE` state locks WHO IS COORDINATING THE SIGNAL, not WHO MAY EDIT
  FILES. While another agent is `ACTIVE`:
  - **Always allowed**: investigative / read-only work (Read, Grep, log
    lookups, AWS API queries), planning work (drafting `PLAN-*.md`, designing
    approaches), and writing prompts for subagents.
  - **Allowed in parallel**: implementation work on files outside the active
    holder's declared `Task` scope. Surface what you did in your next signal
    flip — don't silently land changes mid-handoff.
  - **Blocked**: edits to files that overlap with the active holder's declared
    `Task` scope, unless the founder explicitly interrupts or the signal is
    clearly stale.
- If the state is `OVER_TO_CODEX`, `OVER_TO_CLAUDE`, `OVER_TO_GEMINI`, or
  `OVER_TO_COPILOT`, that agent may proceed directly with its review/fix without
  waiting for the founder to ask again.
- When handing off, update the state to the target actor and include `OVER` in
  the state value, e.g. `OVER_TO_CODEX`.
- Use `OVER_TO_USER` when founder acceptance, rejection, or product direction is
  needed.
- Before flipping to `OVER_TO_USER`, walk [docs/DoD.md](docs/DoD.md) §A–§G. If
  `ls docs/waiting-acceptance/` doesn't show the artefacts the `Task` field
  claims are waiting, the handoff is not done.

**Agents stay active after a handoff** — after flipping the state to
`OVER_TO_CODEX`, `OVER_TO_GEMINI`, `OVER_TO_COPILOT`, or `OVER_TO_USER`, an agent
does NOT go silent waiting for a prompt. It keeps re-reading `AGENT_SIGNAL.md`
until the state advances (e.g. `OVER_TO_CLAUDE`), then claims the mic and
continues. Stop only when there's genuinely nothing to do (signal `IDLE`, no open
plans, all bugs in `done/`).

## Four-eyes cross-provider review (mandatory before push)

**Every change is reviewed by a DIFFERENT backing provider than the one that wrote
it, before it is pushed.** Claude Code and Codex (and Gemini / Copilot) cross-check
each other — no provider both writes and blesses-for-push the same code. The loop:

1. **Provider A implements and commits** its slice (`Holder` = an A persona).
2. A **flips the mic to a Provider-B persona** (`OVER_TO_<B>`), naming the
   commit(s) to review.
3. **B reviews.** The reviewer's job is **both** code correctness **and** ensuring
   the change honors the **blueprint rules and the DoD** (`docs/DoD.md` §A–§H:
   co-located tests, coverage tiers, lint/format, two-commit reproducer for
   bug-class fixes, doc-sync, etc.). A change that is "correct" but violates a
   blueprint/DoD rule is **not** clean.
4. If B needs **no changes** → **B is the only one allowed to `push`.**
5. If B needs changes → **B makes the changes itself, commits, documents the
   reasons** (commit message / plan file), and **flips back to A for review**.
6. Repeat: each round the reviewer either pushes (zero changes) or becomes the new
   writer (made changes) and hands back. **Push happens only from a clean
   cross-provider review.**

**Invariant:** the last agent to write/commit always hands to the OTHER provider;
only a reviewer who needed zero changes pushes. Every line is seen by both
providers before it reaches the remote.

**Git-hand for sandboxed providers.** If a provider's sandbox cannot run `git`
(e.g. Codex `workspace-write` blocks `.git`), the orchestrator (Claude Code
primary) acts as the git-hand — committing / pushing on that provider's behalf
with explicit attribution (`Co-Authored-By` + persona name in the message). The
**review alternation is preserved exactly**: the provider that did NOT write the
code is the one whose clean review authorizes the push.

## Reactivity — three mechanisms (preferred order)

1. **`Monitor`-based mtime poll (push-style, preferred).** Spawn a persistent
   `Monitor` task at the start of any session where the signal is non-IDLE. The
   script polls `AGENT_SIGNAL.md`'s mtime every 2 s and emits one stdout line per
   change — each line arrives as a task notification that wakes the session
   asynchronously, even between turns. Exact command:

   ```bash
   cd <project-root>
   # RC-6: `stat -f %m` is macOS syntax; on GNU it means "filesystem status" and
   # `%m` is invalid, printing a block to stdout while exiting 1. Probe once.
   if stat -c %Y . >/dev/null 2>&1; then mt(){ stat -c %Y "$1"; }; else mt(){ stat -f %m "$1"; }; fi
   last=$(mt AGENT_SIGNAL.md)
   while true; do
     sleep 2
     new=$(stat -f %m AGENT_SIGNAL.md 2>/dev/null)
     if [ -n "$new" ] && [ "$new" != "$last" ]; then
       last=$new
       holder=$(grep '^| Holder ' AGENT_SIGNAL.md | head -1 | sed 's/^| Holder *| //; s/ *|$//')
       state=$(grep '^| State ' AGENT_SIGNAL.md | head -1 | sed 's/^| State *| //; s/ *|$//')
       echo "[signal-change] Holder=$holder State=$state"
     fi
   done
   ```

   Invoke via the `Monitor` tool with `persistent: true`, `timeout_ms: 3600000`
   (1 h — the tool's hard max), description `"AGENT_SIGNAL.md state-line change
   watcher (Holder + State)"`. Latency ~2 s, zero token cost between events,
   self-noise tolerable (fires on own writes too — just re-read and continue).

   **1-hour cliff.** The Monitor tool caps `timeout_ms` at 3 600 000 (1 h). The
   watcher dies silently at that point. Respawn it at the top of a new turn if
   (a) state is non-IDLE and (b) the previous event hasn't arrived within ~45 min.
   If unsure whether the old one is alive, it's cheaper to respawn than miss a
   handoff.

2. **`ScheduleWakeup` polling (fallback for `/loop` mode).** Every 15–30 min the
   agent wakes, re-reads the signal, and either resumes (if state advanced) or
   reschedules. Costs tokens per poll. Use when Monitor isn't available.

3. **Turn-triggered read (passive fallback).** Always re-read the signal at the
   start of every founder turn. Zero cost between turns, but only reacts when the
   founder next sends a message.

Default to (1). If the founder says "stop polling" / "just wait for my next
message", cancel via `TaskStop` and rely on (3).

## Dispatching Codex (signal-driven, not a direct CLI call)

Claude Code does **not** invoke `codex` directly. Codex is woken by a
signal-driven dispatcher that watches `AGENT_SIGNAL.md` and runs the real Codex
CLI whenever the mic flips to `OVER_TO_CODEX`. Three pieces:

1. **The dispatcher (start once, leave running).** Launch
   `scripts/start-codex-signal-watch.sh` (delegates to
   `scripts/codex-signal-watch.sh`) via the **`Monitor` tool with
   `persistent: true`** so it survives in the background and streams run markers
   back as notifications:

   ```
   Monitor (persistent): cd <repo> && bash scripts/start-codex-signal-watch.sh 2>&1
   ```

   It polls every 2 s; on each poll where `State = OVER_TO_CODEX` with a
   `Holder|State|Task` key it hasn't fired yet, it runs `codex exec` with the
   verbatim `Task` field wrapped in the radio-over preamble. **Trigger is
   state-based:** starting the dispatcher while the signal is already
   `OVER_TO_CODEX` fires it on the first poll — no re-flip needed.

2. **Trigger Codex by flipping the signal, never by calling `codex`.** Write the
   prompt into `Task` **first**, then set `State -> OVER_TO_CODEX` **last**. The
   dispatcher polls every 2s and fires on the `State` edit, so flipping first
   dispatches the *previous* round's Task — a real agent run against work that
   is already finished. **The dispatcher must already be running before you
   flip** — otherwise the trigger fires into the void (the #1 mistake).

   **The supported way to hand off is `scripts/signal-set.sh`**, which composes
   the whole baton and moves it into place in one atomic write:

   ```sh
   scripts/signal-set.sh --holder Jesko --state OVER_TO_CODEX --task-file prompt.md
   ```

   There is then no window in which the new `State` sits beside the previous
   round's `Task`, at any pause length. Hand-editing the two rows still works
   and the watcher additionally waits for the signal to stop changing
   (`AGENT_SIGNAL_SETTLE`, default 6s) — but that is a **mitigation, not a
   boundary**: pause longer than the settle value between the two edits and the
   stale Task is dispatched anyway. `tests/signal-dispatch/` case #5
   demonstrates that limit deliberately rather than describing it.

   This exists because the rule was written down here and in HANDOVER and then
   violated twice in one session by its own author — a rule you must remember
   at the moment you are busy is the wrong kind of fix (the A-22 lesson). The
   first attempt refused any `Task` byte-identical to the last dispatched one;
   four-eyes rejected it, correctly, because task text is not a round identity,
   identical instructions can legitimately recur, and that block lasted the
   whole life of the watcher. Pinned by `tests/signal-dispatch/` (CI, ~80s).

3. **Where output lands.** `logs/state/codex-runs.log` (full run log),
   `logs/state/codex-last-message.md` (final message), `logs/state/signal.log`
   (trigger log). Codex flips the signal back to
   `Holder=Claude Code / State=OVER_TO_CLAUDE` itself. Keep a signal-change
   `Monitor` (mechanism 1) armed so Claude Code wakes on the flip-back.

**Codex binary discovery** (in `start-codex-signal-watch.sh`): `$CODEX_BIN`, then
`codex` on `PATH`, then `~/.vscode/extensions/*/bin/*/codex`. Set
`CODEX_BIN=/path/to/codex` to override. **Common failure modes:** dispatcher not
running when the signal flips; calling `codex` directly (bypasses the protocol);
binary not found; wrong log path (it is `logs/state/` inside the project, not `~/`).

## Dispatching Gemini (signal-driven)

Mirror of the Codex dispatcher, for Gemini. `scripts/start-gemini-signal-watch.sh`
(via the shared `codex-signal-watch.sh` poller with `--state OVER_TO_GEMINI`) runs
the headless Gemini CLI on each flip to `OVER_TO_GEMINI`. Use the headless CLI, not
the interactive IDE agent (it stalls): `GOOGLE_GENAI_USE_GCA=true gemini
--skip-trust --yolo --prompt "..."`. Output lands in `logs/state/gemini-runs.log`
and `logs/state/gemini-last-message.md`. **Caveat:** instruct Gemini to edit
ONLY the `Holder`/`State`/`Task` fields on hand-back — it has flattened the whole
signal table before; keep a git copy to restore.

## GitHub Copilot (notify-only)

`GitHub Copilot` is a recognized team agent handed the mic via `AGENT_SIGNAL.md`
like the others. To hand off, set `Holder = GitHub Copilot` + `State =
OVER_TO_COPILOT` with a one-line `Task`.

Unlike Codex/Gemini there is **no autonomous Copilot dispatcher**:
`scripts/start-copilot-signal-watch.sh` is **notify-only** — it echoes signal
changes and, on `OVER_TO_COPILOT`, prints the `Task` so a human operator (driving
Copilot in the IDE) picks it up. It does not invoke any Copilot CLI. Copilot then
does the work and flips the mic back per the rules above.

## Watching it live

**First agent to wake ENSURES the feed is running:** run
`bash scripts/agent-activity.sh --daemon`. It is idempotent — a kernel `flock`,
not a pidfile — so concurrent wakes cannot produce a second feed, and it returns
immediately. `--stop` stops it; `--status` reports whether it is up.

> **BUG-001:** the old guard was a pidfile + `kill -0` check, which is TOCTOU-racy
> and whose EXIT trap unlinked the shared lock. Concurrent wakes all won, each
> spawning immortal `tail -F` followers. Do not reintroduce "just run the script"
> as the wake step — spawned personas must not start it at all.

On start it:

1. **cleans old entries** — truncates `logs/agent-activity.log` so it can't
   explode across sessions (fresh log per session),
2. **streams** a single `[Agent]`-prefixed feed of each agent's **actual work
   output**, so you don't switch prompts:
   - `[Claude Code]` — text + tool calls from the live session transcript
     (`~/.claude/projects/.../<session>.jsonl`, via jq; private thinking excluded),
   - `[CODEX]` / `[GEMINI]` — full run output from their dispatch logs
     (`logs/state/{codex,gemini}-runs.log`),
   - mic/state changes from `AGENT_SIGNAL.md`.
   Copilot is notify-only (it runs in the IDE; no log to tail).

- `scripts/start-all-watchers.sh` — starts the autonomous dispatchers (Codex,
  Gemini) **and** the notify-only watcher (Copilot) in the background. Start
  individual watchers by name when you don't want a specific dispatcher up.
