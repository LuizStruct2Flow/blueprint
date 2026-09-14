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
| **BUG-077** | **`scripts/lib/feed.sh:37` locates the activity feed with `git rev-parse --show-toplevel` — the idiom banned everywhere else for a hazard that applies here identically.** The ban exists because **git exports `GIT_DIR` into every hook**, and the gate runs the suites from a hook, so a fixture's git environment silently redirects the resolution (BUG-014's mechanism, A-09's consequence). `tests/state-dir` #6c enforced it — and its scope is *state-dir consumers*, which `feed.sh` is not. The scope was never wrong, it was just narrower than the hazard. **The concrete consequence is already documented:** it is the mechanism behind the split-feed finding in the root-split review — after a `scaffolding/` move the supervisor writes one feed while the gate and the subagent hooks write another, because this line answers a different question than the physical-script walk does. **Found by method, and specifically by the method a mutant cannot reach.** The equivalence comparison ran 19 trees through both `#6c` and its TypeScript port and diffed verdicts: 12 agreed, 7 disagreed (every one shell PASS → port FAIL, which is the widening working), and **2 passed under BOTH** — `lib/feed.sh` and `lib/gate.sh`. A mutation of either implementation would have shown nothing, because both are faithfully out of scope. Only comparing them against a population that included the un-covered cases surfaced it. **Fix is a rule question, not a line edit:** the ban should be scoped to the hazard (anything resolving a path that a hook's exported git environment can redirect) rather than to a subsystem, and then `feed.sh` follows from the rule instead of being named by it. Check `lib/gate.sh` in the same pass. | S2 | **FIXED — landed `4c3c5a2`, pushed 2026-09-12** | Run `grep -rn 'rev-parse --show-toplevel' scripts .githooks` — every hit must carry an inline `bp-allow-toplevel: <why>` justification, and none may remain in `scripts/lib/feed.sh` or `scripts/lib/gate.sh`. Then `tests/node_modules/.bin/vitest run --root "$PWD/tests" forbidden-idiom` must pass. The suite is proven able to fail: restoring the idiom in either file turns it red, naming the file and line. | Found 2026-09-11 by Christian (Senior Architect) during the Stage A equivalence comparison; rowed by Eto (Orchestrator). He declined to widen the rule inside the port, correctly — a port that changes the rule it is being compared against cannot be shown equivalent to anything. **Re-open trigger: before TASK-021 Stage B**, because the split-feed failure it causes is invisible (two feeds, both written, neither empty) and Stage B is what triggers it. **FIXED 2026-09-11 by Christian (Senior Architect).** Promoted from `backlog/` on its own re-open trigger — TASK-021 Stage B is next. |


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
