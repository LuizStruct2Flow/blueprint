# Bugs — pushed to main, awaiting founder acceptance

Fixed and pushed; awaiting the founder's explicit acceptance signal before they
move to `docs/done/BUGS.md`. Claude does NOT auto-promote to `done/`. If a
regression is found, the row moves back to `docs/doing/BUGS.md`.

See [README.md](README.md) for the lifecycle.

**"What to test" is a column here, not a separate index.** There used to be an
`INDEX.md` holding the same membership plus per-item test instructions. It
drifted — 5 rows listed against 14 real ones, so nine fixes were invisible to
the only person who can accept them — and the first repair was a test to hold
the two files in step. That is the wrong repair: two records of one fact drift
by construction, and a guard only tells you afterwards. One record cannot
disagree with itself.

**Put the acceptance command in the CHAT, not only in this column.** BUG-022
shipped with `scripts/accept-bug-022.sh` and a pointer in its row, and the
founder still had no idea how to accept it — because this column lives in a file
he would have to open first. Klaus and Alexis both said acceptance instructions
belong where the decision happens.

| # | Bug | Severity | Status | What to test | Detail |
|---|---|---|---|---|---|
| **BUG-027** | The activity feed goes dark for the whole duration of any Claude-persona work | S2 | Fixed | `bash scripts/agent-activity.sh --daemon`, then `tail -f logs/agent-activity.log` in a second terminal, then ask the orchestrator to dispatch any Claude persona. **Lines tagged `[<Persona> - Claude Code]` must appear while the persona is still working** — not only when it finishes. Before the fix the feed showed nothing at all for the entire run. Automated: `bash tests/subagent-feed/test.sh`. | Two verified causes. **(1)** `project_jsonl:296` filters `.isSidechain != true`; every assistant record in a subagent transcript has `isSidechain: true`, so the projection drops 100% of them. The filter is correct for the MAIN transcript and exactly wrong for a subagent's own — one function, two files with opposite requirements. **(2)** `log-activity.sh:63` treats `.subagent_type` as the persona; it is `general-purpose`, so every label and every `.subagent-map` row is the same string. **Impact:** 28 tool calls over 4 minutes produced two lines, and the founder watched work happen in the UI while the feed stayed blank. **It punishes the rule it serves** — delegating to a Claude persona buys a blackout, so working solo keeps the feed live. **THREE FINDINGS LEFT UNFIXED, deliberately** (Elias R3, Infrastructure-2/Codex). (a) `BP_ROSTER_LOOKUP_TIMEOUT=0` disables the bound — GNU `timeout 0` means *no* timeout, so the knob added to prevent hanging has a value that guarantees it. (b) A lookup killed mid-write has its **partial stdout accepted as a persona**: a poisoned lib emitted `Eli` then hung, and the hook logged `[Eli - Claude Code]` and persisted it — a stable false identity rather than a graceful fallback, because the timeout's exit status is lost inside command substitution. (c) `agent-activity.sh` sources `roster.sh` into the **supervisor's own shell**, so a poisoned lib hangs `--whoami` and the feed daemon — Elias reproduced it and said explicitly it should not block this landing, since the daemon exists to run that lookup and guarding it needs a different design from the hook's one-shot. **Landed with these open because the blackout itself is fixed and each round of repair was producing the next finding** — the fix rate had stopped exceeding the discovery rate.  |
| **BUG-028** | A freshly bootstrapped project cannot pass its own pre-push gate | S1 | Fixed | `bash tests/bootstrap-gate/test.sh` — bootstraps a throwaway project and runs **that project's** whole pre-push gate. Expect PASS with 42 real stages, drift-clean, no unsubstituted placeholders. On the parent commit it fails with five drifted files. | Found by the TASK-012 strip test, which needed a healthy control and did not get one: `EXIT=1` at 70 s on a zero-second-old bootstrap. **Root cause of five of the six: `.githooks/pre-push-project` ships downstream.** `MANAGED_FILES` excludes it explicitly (*"project guards, never synced"*) and `new-project.sh` tells the operator to copy the `.example` — but `.gitattributes` never `export-ignore`s it, so `git archive` carries the blueprint's own 34 KB guard into every derived project. **Every derived project's gate is the blueprint's self-test suite**, including `bootstrap-contents`, `bootstrap-identity`, `template-source` and `drift-in-blueprint` — four suites that test blueprint-only machinery and cannot pass anywhere else. The sixth, `pull-exec-bit`, reports itself **vacuous** downstream because placeholders are already substituted. Separately, `blueprint drift` reports **5 drifted files on a zero-second-old bootstrap** — files carrying `{{PROJECT_NAME}}` in prose that are missing from the substitution targets. **Same shape as A-22 and BUG-004**: the gate looks armed and is measuring the wrong thing, and nobody notices because the failure arrives on someone else's machine.  |

*(Empty.)*

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
