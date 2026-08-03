# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

## Two namespaces, and only one of them is a work item

**`BUG-XXX` / `FEATURE-XXX` are the only lifecycle IDs.** They are what the
commit convention, the regression-test naming rule and these lifecycle folders
key off (CLAUDE.md §"Bug Management", §"Team Workflow").

**`A-NN` is not a work item.** Those are findings from one audit — the
2026-07-23 contamination sweep in
[BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md) — in the same
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
| **BUG-018** | Interactive `pull` dies on `/dev/tty` in a non-interactive session, while `drift` handles the same case gracefully | S3 | **REOPENED 2026-08-03 — acceptance REJECTED it.** The no-TTY guard stopped the crash and printed the right advice, then returned **0**, so a caller read "sync succeeded" while nothing was pulled. Re-fixed: a refusal now exits 7. The regression allowed it — its check could not fire when rc was 0 | `blueprint pull <file>` without `--yes` reaches its prompt and aborts with `scripts/blueprint:820: /dev/tty: No such device or address` — after printing the diff, so the operator sees a proposal and then a crash. Any agent session, CI job, or `nohup` run hits this. `drift` already solves exactly this: `tests/staleness/drift-integration.sh` case #1 pins "no TTY: warns, offers a copy-pasteable command, never prompts". `pull` should degrade the same way — detect the absent TTY, print the `--yes` invocation, and exit non-zero without having half-run. Same class as BUG-011's exit-code contract: a command must not report progress it did not make. |


BUG-002 moved to `waiting-acceptance/` on 2026-07-27; its blocker (audit finding
A-09) is fixed and pushed.

**BUG-004 still needs a decision before it needs code.** Do not attempt another
local mechanism — that is exactly what the rejection ruled out. (BUG-005 was
decided on 2026-08-02 and is in `waiting-acceptance/`.)

## Waiting acceptance

**FEATURE-001** — back-propagation becomes a request, not a write — was pushed on
2026-07-30 and sits in
[`../waiting-acceptance/FEATURE-001-a2bp-pr/`](../waiting-acceptance/FEATURE-001-a2bp-pr/)
with its plan and review trail. BUG-005 came out of building it.

Everything else delivered on 2026-07-29 is ACCEPTED and in
[`../done/`](../done/) — eight items, verdicts and evidence in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
