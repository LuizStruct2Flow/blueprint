# Agent Roster

The team. Each member is a **persona** with a fixed **name**, a **role**, and the
**backing agent** that powers it. The persona name is what goes in
`AGENT_SIGNAL.md`'s `Holder` field and in `OVER_TO_<NAME>` handoffs — so two
sessions backed by the same agent type (e.g. two Claude Code sessions) stay
distinguishable. This prevents the same-type collision where two "Claude Code"
sessions both answer `OVER_TO_CLAUDE` and fight over the mic.

**This roster is the DEFAULT for a new project — change it to fit your team.**
Each team configures its own constellation from the agents it has access to and
the credits / quota those agents carry. There is no fixed team. Edit the members
below: rename personas, add or drop roles, and pick each one's backing agent
(`Claude Code`, `Codex`, `Gemini`, or `GitHub Copilot`) to match what you have.

## Members (default)

| Role | Name | Backing agent |
|---|---|---|
| Orchestrator | Sylvia | Claude Code |
| PO | Klaus | Claude Code |
| BA | Kathrin | Codex |
| Senior Architect | Christian | Claude Code |
| Architect | Slava | Codex |
| UX | Nicole | Claude Code |
| Front-End-1 | Yannik | Claude Code |
| Front-End-2 | Alex | Codex |
| Back-End-1 | Matthias | Claude Code |
| Back-End-2 | Andreas | Codex |
| QA-1 | Vitali | Claude Code |
| QA-2 | Jesko | Codex |
| Security-1 | Markus | Claude Code |
| Infrastructure-1 | Philipp | Claude Code |
| Infrastructure-2 | Elias | Codex |

Default backing-agent totals: **9 Claude Code, 6 Codex.** This default uses only
Claude Code + Codex. **Gemini and GitHub Copilot are fully supported** (see
[AGENTS.md](AGENTS.md)) but aren't in the default roster, because on many setups
those are free-tier accounts with limited credits (Gemini throttles on quota;
GitHub Copilot may have no headless CLI to dispatch). If you have paid Gemini /
Copilot, give them personas.

**Sylvia (Orchestrator) is the operator's primary, human-facing session** — the
Claude Code prompt the founder talks to and wakes. Sylvia is always the
orchestrator: she dispatches the Codex (and Gemini) personas, hands off to / spawns
the other Claude personas, integrates their work, and owns coordination. The other
personas are launched by Sylvia or by the founder as needed.

## How identity works on the signal

- **`Holder` = persona name** (e.g. `Holder | Sylvia`), never the bare
  backing-agent type. Handoffs use `OVER_TO_<NAME>` (e.g. `OVER_TO_KATHRIN`,
  `OVER_TO_CHRISTIAN`).
- **Each session knows its own persona** (assigned on wake) and acts ONLY when the
  mic is for it — `Holder = <me>` or `State = OVER_TO_<ME>`. It ignores handoffs
  meant for other personas, even ones on the same backing agent. This is what lets
  multiple same-backing personas coexist without colliding.
- **ACTIVE-on-claim applies**: on claiming the mic, set `State = ACTIVE` and `Holder = <your
  persona>` before working (see [AGENTS.md](AGENTS.md)).

## Dispatch (backing agent → how the persona is launched)

- **Claude Code** personas: interactive sessions. Each watches the signal and
  self-activates when the mic is for its persona.
- **Codex / Gemini** personas: launched by their dispatcher
  (`start-codex-signal-watch.sh` / `start-gemini-signal-watch.sh`). The dispatch
  task names the persona/role for the run.
- **GitHub Copilot** personas: notify-only unless a headless Copilot CLI is
  installed — a human operator drives Copilot in the IDE (see AGENTS.md).

**Optional enhancement (not wired by default):** make the dispatchers roster-aware
— fire on `OVER_TO_<persona>` (resolved to the backing agent via this table) and
inject the persona + role into the run preamble, so `OVER_TO_SLAVA` launches Codex
acting as the Architect. Until then, route Codex/Gemini personas via
`OVER_TO_CODEX` / `OVER_TO_GEMINI` with the target persona named in `Holder`/`Task`.

## Live team feed

`scripts/agent-activity.sh` streams one tail-able `[Persona - Backing Agent]` feed
(every agent's mic moves + Codex/Gemini run output + the orchestrator's session
output). The first agent to wake starts it; it cleans its log and opens a tail
terminal. `scripts/team-kickoff.sh` runs a round-robin kick-off where each persona
presents itself and hands the mic to the next — a quick way to confirm the roster
and the coordination loop after editing this file.
