# Agent Coordination Protocol

Canonical rules for how the team agents — **Codex, Claude Code, Gemini, and
GitHub Copilot** — coordinate in this repo. The live state is the slim baton in
[AGENT_SIGNAL.md](AGENT_SIGNAL.md) (the "radio over" file); **this file is the
protocol** (how the radio works). `CLAUDE.md` points here rather than duplicating
it.

Watch every agent live in one place: `bash scripts/agent-activity.sh` streams a
single tail-able `[Agent]` feed (mic changes + Codex/Gemini dispatch detail) to
stdout and `logs/agent-activity.log`.

## On wake — minimum read

At the start of every session or after any "wake" prompt, read before doing
substantive work:

- `AGENT_SIGNAL.md` — current holder, state, and handoff task.
- `AGENTS.md` (this file) — the coordination protocol.
- `CLAUDE.md` — shared project rules and delivery process.
- `docs/config/*.md` — stable product, acceptance, and findings context.
- `docs/doing/*.md` — active bugs, backlog items, and plans.
- `docs/waiting-acceptance/*.md` — pushed work awaiting founder acceptance.

The Claude Code prompt the founder talks to **directly** is the **Orchestrator**
(default persona **Sylvia**, see [AGENT_ROSTER.md](AGENT_ROSTER.md)). On wake it
**adopts that persona** (its `Holder` value) and **starts the live activity feed** —
`bash scripts/agent-activity.sh` — which cleans the log and opens a tail terminal
(see [Watching it live](#watching-it-live)). The feed is idempotent, so later /
spawned agents that run it simply no-op (and they adopt their own assigned persona,
not the Orchestrator's). See `CLAUDE.md` §"On wake" for the exact first-wake steps.

## The mic (radio-over)

Before substantive work, **read the signal first** and confirm the mic is
available:

- proceed if `State = IDLE`
- proceed if `State = OVER_TO_<your agent>`
- proceed if `Holder = <your agent>`
- otherwise stop and report that another actor has the mic

After confirming the mic is available, claim it by updating:

- `Holder` — the **persona** that owns the mic: a name from
  [AGENT_ROSTER.md](AGENT_ROSTER.md) (e.g. `Sylvia`, `Kathrin`), or `User`. Use the
  persona name, NOT the bare backing-agent type — that is what lets multiple
  sessions on the same backing agent (e.g. several Claude Code personas) coexist
  without colliding. Each session acts only when `Holder` is its own persona.
- `State` — `ACTIVE` while working, `OVER_TO_<NAME>` when handing off to a specific
  persona (e.g. `OVER_TO_KATHRIN`, `OVER_TO_CHRISTIAN`), `OVER_TO_USER`, or `IDLE`
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

## Reactivity — three mechanisms (preferred order)

1. **`Monitor`-based mtime poll (push-style, preferred).** Spawn a persistent
   `Monitor` task at the start of any session where the signal is non-IDLE. The
   script polls `AGENT_SIGNAL.md`'s mtime every 2 s and emits one stdout line per
   change — each line arrives as a task notification that wakes the session
   asynchronously, even between turns. Exact command:

   ```bash
   cd <project-root>
   last=$(stat -f %m AGENT_SIGNAL.md 2>/dev/null)
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

2. **Trigger Codex by flipping the signal, never by calling `codex`.** Set
   `State -> OVER_TO_CODEX` and put the actual prompt in the `Task` field. **The
   dispatcher must already be running before you flip** — otherwise the trigger
   fires into the void (the #1 mistake).

3. **Where output lands.** `~/.{{PROJECT_NAME}}/codex-runs.log` (full run log),
   `~/.{{PROJECT_NAME}}/codex-last-message.md` (final message), `~/.{{PROJECT_NAME}}/signal.log`
   (trigger log). Codex flips the signal back to
   `Holder=Claude Code / State=OVER_TO_CLAUDE` itself. Keep a signal-change
   `Monitor` (mechanism 1) armed so Claude Code wakes on the flip-back.

**Codex binary discovery** (in `start-codex-signal-watch.sh`): `$CODEX_BIN`, then
`codex` on `PATH`, then `~/.vscode/extensions/*/bin/*/codex`. Set
`CODEX_BIN=/path/to/codex` to override. **Common failure modes:** dispatcher not
running when the signal flips; calling `codex` directly (bypasses the protocol);
binary not found; wrong log path (it is `~/.{{PROJECT_NAME}}/`, not `~/`).

## Dispatching Gemini (signal-driven)

Mirror of the Codex dispatcher, for Gemini. `scripts/start-gemini-signal-watch.sh`
(via the shared `codex-signal-watch.sh` poller with `--state OVER_TO_GEMINI`) runs
the headless Gemini CLI on each flip to `OVER_TO_GEMINI`. Use the headless CLI, not
the interactive IDE agent (it stalls): `GOOGLE_GENAI_USE_GCA=true gemini
--skip-trust --yolo --prompt "..."`. Output lands in `~/.{{PROJECT_NAME}}/gemini-runs.log`
and `~/.{{PROJECT_NAME}}/gemini-last-message.md`. **Caveat:** instruct Gemini to edit
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

**First agent to wake starts the feed:** run `bash scripts/agent-activity.sh`. It
is idempotent (a pidfile makes later agents no-op), so only the first waking agent
acts. On that first start it:

1. **cleans old entries** — truncates `logs/agent-activity.log` so it can't
   explode across sessions (fresh log per session),
2. **opens a Terminal** window running `tail -f` on the log so the founder watches
   live (skip with `AGENT_FEED_NO_TERM=1` / off-mac),
3. **streams** a single `[Agent]`-prefixed feed of each agent's **actual work
   output**, so you don't switch prompts:
   - `[Claude Code]` — text + tool calls from the live session transcript
     (`~/.claude/projects/.../<session>.jsonl`, via jq; private thinking excluded),
   - `[CODEX]` / `[GEMINI]` — full run output from their dispatch logs
     (`~/.{{PROJECT_NAME}}/{codex,gemini}-runs.log`),
   - mic/state changes from `AGENT_SIGNAL.md`.
   Copilot is notify-only (it runs in the IDE; no log to tail).

- `scripts/start-all-watchers.sh` — starts the autonomous dispatchers (Codex,
  Gemini) **and** the notify-only watcher (Copilot) in the background. Start
  individual watchers by name when you don't want a specific dispatcher up.
