# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

## Two namespaces, and only one of them is a work item

**`BUG-XXX` / `FEATURE-XXX` / `TASK-XXX` are the lifecycle IDs.** They are what the
commit convention, the regression-test naming rule and these lifecycle folders
key off (CLAUDE.md §"Bug Management", §"Team Workflow").

**`A-NN` is not a work item.** Those are findings from one audit — the
2026-07-23 contamination sweep in
[BLUEPRINT-AUDIT-2026-07-23.md](../config/BLUEPRINT-AUDIT-2026-07-23.md) — in the same
category as a Codex finding ID. A finding is a *claim that something is wrong*;
it becomes work when it gets a `BUG-`/`FEATURE-` number and a row here.

They were being used as though they were work items — folder names, rows in this
table, gate comments — and then extended with new numbers (A-38, A-39) for
findings that had nothing to do with that audit. Live items were renumbered on
2026-07-30. The audit document and everything in `done/` keep their `A-NN` IDs as
historical provenance, because the Codex review documents argue about findings by
those names and renaming them would break the trail they exist to be.

**Rule going forward:** an `A-NN` reference is a citation of history. If you are
about to work on something, give it a `BUG-`/`FEATURE-` number first.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| **BUG-027** | The activity feed goes dark for the whole duration of any Claude-persona work | S2 | Fixing | Two verified causes. **(1)** `project_jsonl:296` filters `.isSidechain != true`; every assistant record in a subagent transcript has `isSidechain: true`, so the projection drops 100% of them. The filter is correct for the MAIN transcript and exactly wrong for a subagent's own — one function, two files with opposite requirements. **(2)** `log-activity.sh:63` treats `.subagent_type` as the persona; it is `general-purpose`, so every label and every `.subagent-map` row is the same string. **Impact:** 28 tool calls over 4 minutes produced two lines, and the founder watched work happen in the UI while the feed stayed blank. **It punishes the rule it serves** — delegating to a Claude persona buys a blackout, so working solo keeps the feed live. |
| **BUG-028** | A freshly bootstrapped project cannot pass its own pre-push gate | S1 | Fixing | Found by the TASK-012 strip test, which needed a healthy control and did not get one: `EXIT=1` at 70 s on a zero-second-old bootstrap. **Root cause of five of the six: `.githooks/pre-push-project` ships downstream.** `MANAGED_FILES` excludes it explicitly (*"project guards, never synced"*) and `new-project.sh` tells the operator to copy the `.example` — but `.gitattributes` never `export-ignore`s it, so `git archive` carries the blueprint's own 34 KB guard into every derived project. **Every derived project's gate is the blueprint's self-test suite**, including `bootstrap-contents`, `bootstrap-identity`, `template-source` and `drift-in-blueprint` — four suites that test blueprint-only machinery and cannot pass anywhere else. The sixth, `pull-exec-bit`, reports itself **vacuous** downstream because placeholders are already substituted. Separately, `blueprint drift` reports **5 drifted files on a zero-second-old bootstrap** — files carrying `{{PROJECT_NAME}}` in prose that are missing from the substitution targets. **Same shape as A-22 and BUG-004**: the gate looks armed and is measuring the wrong thing, and nobody notices because the failure arrives on someone else's machine. |


**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
