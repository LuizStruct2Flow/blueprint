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
| **BUG-008** | `blueprint pull` strips the executable bit, so a pulled hook is armed but never runs | S1 | **REOPENED 2026-07-31 — the fix does not hold. Reproduced end-to-end at HEAD `8abb406`** | The marker-aware merge writes to a `mktemp` (mode 600) and `mv`s it into place; `mv` carries the temp's mode onto the destination. **Silent and severe:** `core.hooksPath` is set, so the gate looks armed, but git skips a non-executable hook without a word — BUG-004's failure mode through a different door. The 2026-07-30 fix added `_bp_sync_exec_bit` to all four write paths — **but every one of them calls `substitute_placeholders` on the very next line, and `bp_substitute_in_place` ([lib/placeholders.sh:190-199](../../scripts/lib/placeholders.sh#L190-L199)) does its OWN `mktemp`(600) + `mv`.** The chmod is undone by the next statement, so the fix repaired the caller and left the primitive. Affects any managed file that is both executable and placeholder-bearing, minus the `_should_substitute` exemptions (`scripts/blueprint`, `scripts/new-project.sh`): **`.githooks/pre-push`** — the gate itself — plus `scripts/start-codex-signal-watch.sh` and `scripts/start-gemini-signal-watch.sh`, all three verified 775 + placeholder-bearing. **Reproducer:** a temp project with a 755 `.githooks/pre-push`, then `blueprint pull --yes .githooks/pre-push` → **600, not executable**. Surfaced by the linkedin-watcher-agent session, which verified the primitive and call order but explicitly flagged the end-to-end path as unconfirmed; confirmed here. Mitigation that masked it: `gate.sh` refuses to arm on a non-executable hook, and `cp` onto an existing file preserves that file's mode, so a project already at 755 via a different path looks healthy. Fix direction: preserve the destination mode inside `bp_substitute_in_place` (`chmod --reference` before the `mv`) — repair the primitive, not the four call sites, since `mktemp`+`mv` mode loss resurfaces wherever else the pattern is used. **The missing regression test is why this shipped as "fixed".** |
| **BUG-009** | `project_config_*.md` are simultaneously this repo's own config AND the seed template, so blueprint-specific content propagates to every new project | S2 | Mitigated 2026-07-30, structure unfixed | A hard-coded wake-time Monitor row for the agent-exchange board sat in `project_config_paths.md` — including a rationale describing an incident that happened in *this* stream — and was seeded verbatim into linkedin-watcher-agent. Same class as BUG-002: one project's specifics in a file that travels. **Mitigation:** the Monitors table now ships empty with guidance, and this stream's own row moved to `HANDOVER.md` (project-owned, never synced). **Structural fix not done:** the template and this repo's own config are still the same file, so the next concrete thing written there propagates again. Real fix is a separate template source (e.g. `templates/project_config_*.md`) that `new-project.sh` seeds from, letting this repo keep its own live config. |
| **BUG-006** | `LWA_FEED_*` env-var namespace in `scripts/log-activity.sh` — BUG-002's contamination in env-var form | S3 | **FIXED 2026-08-03 — in an open PR, not yet on `main`** | Same class as BUG-002: a name specific to one project baked into a generic script. Detail in [BLUEPRINT-AUDIT-2026-07-23.md](BLUEPRINT-AUDIT-2026-07-23.md). Was `A-08`. **FIX.** `log-activity.sh` now routes through `scripts/lib/feed.sh` — the shared appender — instead of carrying its own copy of "append then rotate" keyed on `LWA_FEED_*`. Two defects in one: the namespace was one project's initials in a file that ships everywhere, and the duplicated rotation is exactly where the inode-preserving trim drifts — a `mv`-based rotate in one copy would orphan the feed supervisor's open handle while the other stayed correct. **No back-compat alias**: keeping `LWA_` would preserve the very string the bug is about, and these were undocumented knobs whose defaults are unchanged. **The guard is generic** — [`tests/env-namespace/`](../../tests/env-namespace/test.sh) derives its file list from `MANAGED_FILES` and fails on any externally-settable knob outside the approved prefixes. It immediately found two more that I had introduced myself in the BUG-010 rewrite (`KICKOFF_CLAIM_PAUSE`, `KICKOFF_HANDOFF_PAUSE`) plus `FOREGROUND`, all now `AGENT_`-prefixed. Fixing three names would have left the next one to be found by hand, and this repo has found four of this class by hand already (BUG-002, 006, 009, 010). |
| **BUG-011** | `blueprint a2bp` pushes the branch, opens no PR, prints a green ✓ and exits 3 ("filed") | S1 | Found 2026-07-31 from linkedin-watcher-agent, root-caused + reproduced here, not fixed | `bp_file_existing_pr` ([lib/request-file.sh:115-120](../../scripts/lib/request-file.sh#L115-L120)) runs `gh pr list … --jq '.[0] \| "\(.state)\t\(.url)"'`. On an empty list `.[0]` is `null`, and jq interpolates that as the **literal string** `null`, so the function prints `null\tnull` instead of nothing — verified: `echo '[]' \| jq -r '.[0] \| "\(.state)\t\(.url)"'` → `null^Inull`. The caller ([scripts/blueprint:1116](../../scripts/blueprint#L1116)) guards with `[ -n "$existing" ] && [ "$existing" != "<tab>" ]` — it anticipated empty fields but not the `null` literal — so a non-existent PR passes as an existing one, falls to the `*)` branch, prints `✓ request already open: null` and returns `BP_RC_PENDING` (3). **Worse than a silent failure: the exit code asserts filed while nothing was filed**, which is precisely what CLAUDE.md forbids ("no script may read 'PR opened' as 'the blueprint has this'"). It breaks the only sanctioned path for improvements to reach the blueprint. Hit both of that session's requests; the branches and commits were correct, only the PR step failed, and both PRs were opened by hand ([#1](https://github.com/LuizStruct2Flow/blueprint/pull/1), [#2](https://github.com/LuizStruct2Flow/blueprint/pull/2)). Fix direction: treat `null`/empty as "no PR"; only return 3 once a PR URL is actually in hand; branch-pushed-but-no-PR is exit 5 (operational failure), never 3. **Folded in 2026-08-02 (founder decision) — the trust half of the same defect.** Filing a request needs push access to the blueprint remote, and in the same-owner setup every agent authenticates as the owner: verified `enforce_admins: false`, `restrictions: null`, effective permission **admin**, so branch protection's PR requirement does not apply to the identity the agents present. A derived project's agent that runs plain `git push` reaches `main` directly — evidenced by every push this session printing `remote: Bypassed rule violations for refs/heads/main`. So "a2bp cannot write into the blueprint" was an overclaim: the discipline is a convention `a2bp` implements, not a boundary the repository enforces. This bug is what makes it bite today — the branch is pushed, the PR never opens, and exit 3 reports "filed", so the review step is skipped while success is asserted. **Not fixable with repository settings**: no ruleset can distinguish a derived project's agent from the owner while both present the same credential; it needs a separate narrower credential (or a fork), which is independent of `enforce_admins` and so does NOT cost trunk-based development. **Founder decision 2026-08-02: accept the model, document it honestly** — done in CLAUDE.md, README.md, docs/A2BP_PLAYBOOK.md and project_config_paths.md §"Back-propagation trust boundary". The code fix for the `null` PR remains open. |


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
