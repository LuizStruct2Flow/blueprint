# Agent Signal

Shared "radio over" baton for the agent team. `Holder` is a **persona name** from
[AGENT_ROSTER.md](AGENT_ROSTER.md) (e.g. `Sylvia`); the coordination protocol is in
[AGENTS.md](AGENTS.md). On claiming the mic, set `State = ACTIVE` (A2BP).

**Before flipping the mic to `OVER_TO_USER`, walk [docs/DoD.md](docs/DoD.md)
§A–§G.** If `ls docs/waiting-acceptance/` doesn't show the artefacts the
`Task` field claims are waiting, the handoff is not done.

## Current Signal

| Field | Value |
|---|---|
| Holder | Sylvia |
| State | OVER_TO_USER |
| Task | **A-07 DELIVERED — awaiting founder acceptance.** `origin/main` at `e605476`; nothing unpushed. `blueprint a2bp` is guarded: positional-diff placeholder restoration, every staged line scanned (no exemption), round-trip-verified staging, one shared substitution primitive. Codex four-eyes **CLEAN on round 7** after six rejections — record in `docs/waiting-acceptance/A-07-a2bp-guard/`. Also closed a **pre-existing `pull` defect**: project names containing `&` or `\` were silently mangled, independent of a2bp. `205f6f7` (R12a) and the handover checkpoint went out in the same batch. **Waiting on you:** (1) accept or reject A-07 and the seven other items in `docs/waiting-acceptance/INDEX.md` — note A-22 is explicitly NOT accepted, per Jesko's caveat; (2) the agent-exchange timestamp switch is still 15/16 done and UNCOMMITTED — finish or revert, your call. **Known gap, not caused by this work:** `docs/way-of-working.pdf` is ~6 weeks stale (`.md` 2026-07-23, `.pdf` 2026-06-15) and cannot be rebuilt on this host — marp-cli needs a browser that is not installed. **Next in the guard-the-pipe order:** A-03, then A-08. |
| Last update | 2026-07-29 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
