# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

| # | Bug | Severity | Status | Plan |
|---|---|---|---|---|
| BUG-002 | **Blueprint contamination** — `scripts/agent-activity.sh` hardcodes a *project-specific* state dir in a blueprint-managed generic file: `LINKEDIN_WATCHER_AGENT_HOME` / `~/.linkedin-watcher-agent` (lines 8, 9, 16, 26). Every derived project silently reads/writes another project's state dir for its Codex + Gemini run logs, so the feed shows the wrong project's dispatch output. Violates CLAUDE.md §"What blueprint sync covers" ("if you catch yourself adding a project-specific path to a blueprint-managed file, move it"). Distinct from the *legitimate* prose references to linkedin-watcher as a worked example (`docs/OBSERVABILITY.md:148`, `STACK_DEFAULTS.md:84`, `docs/way-of-working.md:259/269/591`) — those stay. Fix: rename to a generic `AGENT_STATE_HOME` / `~/.struct2flow/<project>` with a back-compat fallback; `new-project.sh` substitutes the project name. | **HIGH** | Found 2026-07-23 (founder). Fix pending — bundle with BUG-001 review sweep. | — |
| BUG-001 | `scripts/agent-activity.sh` leaks processes without bound (fork-bomb class). Race-prone single-instance guard + one never-exiting `tail -F` per subagent transcript **per instance** + teardown that only runs via EXIT traps of a process that never exits. Observed on a founder host: **17,432** live script instances, **8,715** `tail` processes, load avg **175** on a 32-thread box for **2.7 days** at zero application load — inotify instance exhaustion (`max_user_instances=128`) flipped every `tail -F` into 1 s poll-spin. | **CRITICAL** | Plan written — awaiting multi-AI consensus (CLAUDE.md §"Major Bug Process" step 3) | [PLAN-BUG-001.md](PLAN-BUG-001.md) |
