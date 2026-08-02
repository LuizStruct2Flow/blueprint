# Bugs — pushed to main, awaiting founder acceptance

Fixed and pushed; awaiting the founder's explicit acceptance signal before they
move to `docs/done/BUGS.md`. Claude does NOT auto-promote to `done/`. If a
regression is found, the row moves back to `docs/doing/BUGS.md`.

See [README.md](README.md) for the lifecycle.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| **BUG-010** | Renaming a persona in `AGENT_ROSTER.md` changed nothing — every surface kept using the shipped example name | S2 | **PUSHED `fda2971` 2026-08-02** — awaiting acceptance | Nothing read the roster to decide who a session IS: the name lived in the scripts. Because the roster is gitignored and per-engineer (no two fleets share names) and both scripts are in `MANAGED_FILES`, one fleet's names were shipping to every derived project as literals — BUG-002's contamination class, in the one file whose purpose is to be per-person. Four sites, each with its own copy of the rule: the feed took the name from `${AGENT_PERSONA:-<literal>}`; `team-kickoff.sh` carried all 15 personas as a literal array, so the one script documented as "confirm the roster after editing it" couldn't see the roster and wrote the example's names into the live baton, undoing the rename it existed to confirm; `persona_label()` did read the roster but matched `"\| $name \|"` on literal single spaces, so a column-padded table never matched — and a miss was indistinguishable from "no roster", so it failed **silently**, which is how it survived; `CLAUDE.md` + `AGENTS.md` named the default Orchestrator as if it were the answer. **Fix:** one parser, [`scripts/lib/roster.sh`](../../scripts/lib/roster.sh), sourced by every reader — the same "one mechanism, never two that agree only by coincidence" rule `lib/state-dir.sh` enforces for A-09. ROLE is the key and name is data (a rename is one cell); fields are trimmed; only the Members table is parsed; a miss warns on stderr once per key per process. Unresolved identity falls back to the **role**, not to a name — `[Orchestrator]` is visibly broken where a plausible name is not. Adds `agent-activity.sh --whoami`, closing the observability gap that let this hide: identity was only observable by reading log lines. **Verified live:** this repo's roster says the Orchestrator is Anna and every surface said Sylvia. Regression: [`tests/roster/test.sh`](../../tests/roster/test.sh), 14 assertions, 0.185 s, in the gate; red on the parent commit (`git worktree` verified, exit 1). Doc-sync in the same commit: deck slide 9, README, AGENTS.md, CLAUDE.md §"On wake" + concern-9 list. |

**Acceptance test for BUG-010:** edit the `Name` cell of any row in your
`AGENT_ROSTER.md`, then run `bash scripts/agent-activity.sh --whoami` and
`bash scripts/team-kickoff.sh --dry-run`. Both must reflect the new name with no
other edit anywhere. Per `project_config_dod.md` §"Acceptance authority" this is
agent-protocol work, so QA-2 may accept it; it is not user-surface.

The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. See [INDEX.md](INDEX.md) for the full disposition,
including the one rejection (A-22, reopened into `doing/` as **BUG-004**).
