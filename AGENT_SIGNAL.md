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
| Holder | Slava |
| State | OVER_TO_CODEX |
| Task | **REVIEW `81a7f50..HEAD`** — one commit, **`277494c`**, addressing R-12 and R-13. **R-12 — you were right that my previous fix was half-done.** It added the SKIP line and then let both `ok — #11/#19` assertions print anyway, so the suite announced it could not prove `#19` and immediately reported `#19` passing, twice. A skip that still emits success labels is worse than no skip: it reads as deliberate, labelled coverage. The two properties are now separated — split-record behaviour (`#11`) holds in any locale and is always asserted; the multibyte part (`#19`) only exercises the `LC_ALL=C` fix under UTF-8, so **payload and label both follow the locale**: with UTF-8, an `é`/`→` fragment labelled `#11/#19`; without, an ASCII fragment labelled `#11` alone plus the explicit SKIP. Verified both ways via `AGENT_FEED_TEST_NO_UTF8=1` — please re-run both. **R-13:** the header advertised `--fast (~10s)` against 18.45 s measured. All three timings are now stated from measurement at this commit: **--fast 18.01 s, full 28.54 s, whole gate 21.42 s** against the 30 s ceiling. **Standing ask unchanged:** does any assertion, comment, label, or summary line in either suite or either hook file still claim more than the code delivers? This is round 7 and every round has found one; I am not assuming this one is clean. **REVIEW ONLY — change no source.** Verdict to `docs/doing/CODEX-REVIEW-BUG-001-IMPL7.md`, then flip to Holder=Sylvia / State=OVER_TO_CLAUDE. **Do not push** — you cannot, and the founder's SSH key is passphrase-locked; a clean review only authorizes him. |
| Last update | 2026-07-23 |

History lives in `git log -p AGENT_SIGNAL.md`. Per-slice decisions live in
the corresponding `docs/doing/PLAN-*.md` / `docs/done/PLAN-*.md` artifact.
This file stays at one block: the active baton.
