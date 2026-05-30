# HANDOVER — canonical always-current resume doc

> **Single canonical resume doc (DoD §11).** Overwritten to reflect CURRENT
> state. On **wake**: read this FIRST, then `AGENT_SIGNAL.md`, `CLAUDE.md`,
> `MEMORY.md`. On **sleep**: make every section current, then confirm "ready to sleep".
>
> **Last updated: {{YYYY-MM-DD}}.** {{ONE-LINE SUMMARY OF CURRENT STATE.}}

## 0. STATUS

- **{{CURRENT EPIC OR TRACK}}: {{STATUS}}.** {{One-paragraph summary: what is
  live, what is verified, where the artefacts live.}}
- Other accepted-and-live: {{recent ships, link to `done/CHANGES.md` rows}}.

## 1. RESUME — live state + immediate action

- **{{Immediate next action.}}** {{What the next session should do first.}}
- **{{Active track (this session):}}**
  - {{Sub-step #1 — status}}
  - {{Sub-step #2 — status}}
  - Plan: `docs/doing/{{PLAN-NAME}}.md`.

## 2. {{PROJECT-SPECIFIC CONFIG SECTION (if any)}}

- {{e.g. how the current feature is wired in dev / prod, env vars, infra params.
  Delete this section if not needed for the current track.}}

## 3. EPHEMERAL — re-establish

- **Active Monitors: NONE.** {{Re-arm any persistent monitors after the next push.}}
- {{Any local-only constraints (Docker disk, env quirks, orphan resources).}}

## 4. Parked plans / follow-ups (not active)

- **{{PLAN-NAME}}** — {{one-line status, what's blocking it}}.
- {{Backlog items that need founder gating.}}

## 5. Pointers

- **Baton:** `AGENT_SIGNAL.md`. **Rules:** `CLAUDE.md`. **DoD:** `docs/DoD.md`.
- **Closed work (decision records):** `docs/done/`.
- **{{Pipeline / deploy notes for this project.}}**
- **Gotcha:** {{key non-obvious thing to remember about this codebase.}}
