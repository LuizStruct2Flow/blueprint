# Bugs — user-accepted (delivered)

The source of truth for **what has actually been delivered** — not what has been
merged. A row lands here only on an explicit acceptance signal.

> **Acceptance authority for this class of work is delegated to QA-2** (founder
> decision 2026-07-29, scope and limits in `project_config_dod.md` §"Acceptance
> authority"). These are agent-protocol and repo-infrastructure defects whose
> delivered behaviour is validated by running commands and reading exit codes,
> not by a human clicking. Verdicts carry executed evidence; the 2026-07-29
> pass rejected A-22 by reproducing the gap live.

| # | Bug | Severity | Status | Plan |
|---|---|---|---|---|
| BUG-001 | `scripts/agent-activity.sh` leaks processes without bound (fork-bomb class). Race-prone single-instance guard + one never-exiting `tail -F` per subagent transcript **per instance** + teardown that only runs via EXIT traps of a process that never exits. Observed on a founder host: **17,432** live script instances, **8,715** `tail` processes, load avg **175** on a 32-thread box for **2.7 days** at zero application load — inotify instance exhaustion (`max_user_instances=128`) flipped every `tail -F` into 1 s poll-spin. | **CRITICAL** | Plan written — awaiting multi-AI consensus (CLAUDE.md §"Major Bug Process" step 3) **ACCEPTED 2026-07-24 by Jesko (QA-2), acceptance delegated by the founder** — see `ACCEPTANCE-JESKO-2026-07-24.md`. | [BUG-001-fork-bomb/PLAN-BUG-001.md](BUG-001-fork-bomb/PLAN-BUG-001.md) |
| BUG-002 | **Blueprint contamination** — `scripts/agent-activity.sh` hardcoded a project-specific state dir (`~/.linkedin-watcher-agent`) in a blueprint-managed generic file, so every derived project read another project's Codex/Gemini run logs and the `[CODEX]`/`[GEMINI]` feed lines silently never appeared. Rejected once on 2026-07-24 (the **Gemini** half still wrote a literal `$HOME/.{{PROJECT_NAME}}/`); root cause was A-09. | **HIGH** | Fixed with A-09 — feed and all dispatchers derive one per-project state dir via `scripts/lib/state-dir.sh`. **ACCEPTED 2026-07-29 by Jesko (QA-2)** — see [ACCEPTANCE-JESKO-2026-07-29.md](ACCEPTANCE-JESKO-2026-07-29.md). | [A-09-state-dir/](A-09-state-dir/) |
| BUG-003 | **The pre-push security gate could not tell a scanner FAILURE from a scanner FINDING.** `semgrep … \|\| { echo "found a WARNING+ finding"; exit 1; }` treated every non-zero exit as a finding, but semgrep exits 1 for findings and **≥2 for a fatal error** — and `--quiet` suppressed the reason entirely. Observed on this repo: identical back-to-back runs alternating exit 0 and exit 2 with zero output, in both bash and sh, while the same command outside the hook always passed. `gitleaks` had the same conflation. Dangerous in both directions: a broken scanner reported as a vulnerability teaches operators to shrug off the gate, and that shrug is what carries over to a real finding. | **HIGH** | Fixed — exit 1 reports+prints the finding; exit ≥2 retries once (semgrep only) then fails closed with "the SAST gate did NOT run". Regression: `tests/pre-push-scanners/test.sh` (15 assertions, verified failing against the pre-fix hook). **ACCEPTED 2026-07-24 by Jesko (QA-2), acceptance delegated by the founder** — see `ACCEPTANCE-JESKO-2026-07-24.md`. | — |
