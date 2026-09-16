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
| **BUG-132** | **CI's `ts-tests` job runs the suites on a machine the installer never prepared, so a tool the suites need locally is simply absent there: since BUG-127 every real-`gitleaks` a2bp scenario fails in CI and passes on every developer machine.** CI run 35126720424 on `71388b9` is red: `ts-tests` (`.github/workflows/security.yml`) failed 6 of 55 test files, every failure an a2bp scenario (`a2bp-contamination` #1 #1b #2 #4 #6 #7 #7b…, `sync-by-address` #31, …), each saying `bp_inputs: gitleaks is not installed, so nothing has scanned the bytes this request would publish.` **Cause:** BUG-127 made `a2bp` REFUSE without gitleaks, correctly. The suites use whatever gitleaks is on PATH. A developer machine has it — `scripts/install-toolchain.sh` installs it, and the local pre-push gate is green — but `ts-tests` installs only ShellCheck (by `apt`, unpinned, one tool by name) and nothing else from the installer's set. gitleaks reaches CI only through `gitleaks-action` in the separate `secret-scan` job, on another VM. **Same class as BUG-117** (local and CI environments diverge, and each mode is green over its own assumption). **The defect is the mechanism, not the missing name:** a job that installs tools one at a time by name catches only the tools someone remembered, so the next tool a shipped script starts requiring reds CI again, after the push. | S2 | **FIXED — landed `8a792c5`, reproducer `35b02a3`, review fixes `40f4699`/`c3e2044`, pushed 2026-09-16; CI green on `c3e2044` (run 35131958151)** | Look at CI for any push that touches the suites: the `TypeScript regression suites (vitest)` job must run the `Gate toolchain` step (`bash scripts/install-toolchain.sh`) and the a2bp scenarios must pass there, not only locally. Before this, run 35126720424 failed 6 of 55 files with `gitleaks is not installed`. Locally, `tests/ts-bridge` #9 runs the job's provisioning steps offline with every installer tool off PATH and requires `install-toolchain.sh check` to pass; #9b–#9e are red when a provisioning guard is false, the manifest is missing, a step is `if: false`, or a step exits nonzero. **It is an offline wiring check, not a real install:** downloads and package commands are stubbed, and only CI proves the installer really runs (it did on `c3e2044`; the suites job took 16.5 min). **Cross-provider review:** Jesko (Codex) — push after fixes; both S2 findings (guards and exit codes ignored) and the S3 harness-less ShellCheck fallback were closed in `40f4699`. **Known limits:** a tool the suites need that the installer does not declare is still invisible; `pipx install semgrep` is unpinned. | Filed 2026-09-16 by Philipp (Infrastructure-1), diagnosed by Eto (Orchestrator) from the CI run. **Fix shape:** prepare the `ts-tests` machine with `scripts/install-toolchain.sh`, the one script that prepares every developer machine, instead of per-tool steps — so CI's tool set is the installer's by construction. **Reproducer:** execute the job's provisioning steps offline (stubbed fetches) on a machine lacking the installer's tools, then require `install-toolchain.sh check` to pass. Red while the job only installs ShellCheck. |


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
