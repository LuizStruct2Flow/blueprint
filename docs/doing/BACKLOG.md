# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-065** | **Provider load balancing, in code rather than in an agent's memory.** Founder rule, 2026-09-20, now written as protocol in `AGENTS.md` §"Who does the work": plan review goes to all three providers seeking consensus, code-writing round-robins across providers with quota, a provider at zero quota leaves the rotation until it returns, and only Claude orchestrates, commits and pushes. **The rule is stated. It is not enforced, and prose is the weak form** — this is precisely the shape TASK-062 exists to convert, and the failure mode is specific and predictable: the cheapest provider for the Orchestrator to reach is the one it is already running on, so left to convenience every dispatch lands on Claude, two subscriptions pay for nothing, and the four-eyes reviewer has no second blind spot to offer. **What this owns:** (a) rotation state that survives a session — which provider is next, held where agent state lives (`logs/state/`, per BUG-020), not in a session's head; (b) a selector the Orchestrator calls instead of choosing, so the choice is a command and not a judgement; (c) **quota detection, which is the hard part and must not be faked** — each CLI signals exhaustion differently and none was designed to be asked, so the honest first version reads a provider's own refusal from a failed dispatch rather than predicting a limit, and records the provider as out until something proves it back. A predicted quota is a guess standing in for a fact, which is `findings.md` F-002 again; (d) the collision the protocol names — when the rotation shrinks to one provider, four-eyes cannot be satisfied, and the answer is to hold and tell the founder, never to let a provider review itself. **Prior art to reuse, not reinvent:** the rotation is per-checkout agent state exactly like the baton, and `scripts/signal-set.sh` is the worked example of one writer publishing atomically so no reader samples a half-written value. **Known unknown:** whether `kimi`, `codex` or `gemini` expose any quota or usage query at all was not established — establish it before designing around its absence. | S2 | KEEP | Founder, 2026-09-20: *"no matter what kind of work I want a load balancing between the providers as long as they have quota"*. **Next-step gate:** find out what each CLI actually reports on exhaustion before building the selector around an assumption. Re-open the moment a dispatch is routed by convenience rather than by rotation — which, until this lands, is every dispatch. |
| **TASK-064** | **`CLAUDE.md` sent tooling workspaces to a system temp dir, where an agent cannot clean up after itself.** The §"Running commands" rule carved out "a tooling workspace that a tool will walk (a scratch clone, a worktree)" and told it to go *outside any git tree*, via `mktemp -d`. **Both halves were wrong, and the contradiction was already in the repo:** `.gitignore`'s own comment on `.scratch/` says it is *"Kept INSIDE the repo so the work is visible next to the code that prompted it, rather than hidden in a system temp dir"*. **(i) Nothing walks `.scratch/`.** Measured rather than assumed: the pre-push semgrep step scans `.` with no `.semgrepignore`, and a probe file planted in `.scratch/` appeared in neither `.paths.scanned` (198 files) nor `.results` — semgrep honours `.gitignore`. `gitleaks protect --staged` sees only the index, and `blueprint files` is `git archive`, so an untracked workspace is invisible to it by construction. **(ii) `/tmp` is exactly where cleanup fails.** `rm -rf .scratch/*` and `rm -rf .scratch` are allowed commands in `.claude/settings.json`; `rm -rf /tmp/...` is not. So an agent obeying the rule creates a workspace it is then refused permission to remove. **Observed, not hypothetical:** on 2026-09-20 a TASK-063 dispatcher fixture went to `mktemp -d`, its `rm -rf` was denied, and the founder deleted `/tmp/kimi-dispatch-test.1loGW5` by hand — the orchestrator had quoted the old rule into the brief, so the agent did as it was told. **This family has bitten before:** BUG-049 found 23 leaked blueprint archives totalling 133 MB in `$TMPDIR`, because debris outside the project accumulates where nobody looks. **Fix:** everything temporary goes in `.scratch/`, workspaces included, created with `mktemp -d -p .scratch` — scoped to what an AGENT creates, explicitly not to the suites' own fixture roots, which answer to TASK-018's isolation contract. The rule now carries the measurement and the permission asymmetry, so the carve-out is not re-derived from first principles by the next reader. | S3 | KEEP | Founder, 2026-09-20: *"the temporary files should be written inside of the project boundaries"* and *"this was the idea of the .scratch folder"*. **Re-open if** a scanner, suite or gate stage is ever found walking `.scratch/` — the rule's first claim is empirical and a tooling change could falsify it. |
| **TASK-063** | **Integrate Kimi as a third watcher-backed provider.** The founder added seven Kimi personas to `AGENT_ROSTER.example.md` on 2026-09-20 (BA-2 Joan, Architect-1 Slava, Front-End-3 Adam, Back-End-3 Jonathan, QA-3 Vijay, Security-2 Florian, Infrastructure-3 Thomas) plus a `Kimi models, best first:` line, and asked for the integration. The `Backing agent` column is free text by design, so the roster PARSED from the start — what was missing was everything downstream. **(a) Model resolution — DONE.** `bp_roster_claude_order` was Claude-only (it grepped a literal prefix) and `bp_roster_model_for_name` had `case "$backing"` arms for `Claude Code` and `Codex` alone. Replaced by `bp_roster_model_order <src> <provider>` plus a `Kimi` arm: the tier indexes the roster's own ranked line, and the supported efforts are read from `${KIMI_HOME:-~/.kimi-code}/config.toml` — the provider's own list, per the Codex precedent, never a hardcoded default. **Every row of the shipped template now resolves**, verified by resolving all 22 against the example roster rather than by suite alone. **(b) Dispatcher + feed** — `scripts/start-kimi-signal-watch.sh` on the shared provider-agnostic poller with `--state OVER_TO_KIMI`, plus the `[KIMI]` arm in `scripts/agent-activity.sh`, so a Kimi run is visible in the one feed instead of silent. **(c) `scripts/claude-agents.sh` needed nothing** — it already filters on `[ "$backing" = "Claude Code" ]`, so no Claude subagent file is generated for a Kimi persona. **The one thing that shaped the design: Kimi's efforts are `low` / `high` / `max` — there is no `medium`.** Six roster cells said `medium`; the founder chose `high` (2026-09-20) over mapping `medium`→`high` in code, because a cell naming an effort the provider does not have is `findings.md` F-002's shape — a value standing in for something it does not imply. Resolution refuses such a cell rather than substituting. **Three things were found by measuring rather than by reading docs, and each would have shipped as a plausible wrong answer:** (i) `kimi-for-coding-highspeed` carries no `support_efforts` key at all, so tier `frontier-3` refuses with a message naming the persona instead of running at an invented setting; (ii) **kimi 2.0.2 refuses `--prompt` combined with `--auto` or `--yolo`** — prompt mode has nobody to ask and already never interrupts, so a dispatcher "hardened" with `--auto` errors on every dispatch. `--help` does not say this; the first dispatch attempt did, and `AGENTS.md` now records it so the next person does not re-add the flag; (iii) BUG-006's `env-namespace` guard flagged `KIMI_HOME` until `KIMI_` joined `CODEX_`/`GEMINI_` in the allowed prefixes — a vendor namespace, which is what that list is for, not the project-specific namespaces (`LWA_`, `REDCARE_`) the rule exists to stop. **Ripples carried in the same commit** (CLAUDE.blueprint.md §deck rule): `AGENTS.md` §"Dispatching Kimi" + the mic-state lists + four-eyes review, the deck's persona-team slides, `README.md`, `CLAUDE.md`, `AGENT_ROSTER.example.md`, `docs/A2BP_PLAYBOOK.md` row F, and the seeds in `templates/`. **Known limit, not a defect:** inside the blueprint the dispatch preamble reaches Kimi with a literal `{{PROJECT_NAME}}`, because that placeholder is substituted at bootstrap and the blueprint is nobody's derived project. Vijay flagged it unprompted mid-dispatch and reasoned around it. It costs a sentence of agent attention per run here and nothing at all downstream, so it is recorded rather than worked. **Prior art:** FEATURE-007 argued the three-tier roster and named K3 as the middle tier; its guardrail stands and is not re-argued here — a cheap cross-provider reviewer with no measured find-rate is theatre, and the row closes rather than being defended. | S2 | KEEP | Founder, 2026-09-20: *"i added kimi to the roster, please add a new task to integrate kimi"*, and *"it should be also added to the templates"*. **Next-step gate:** lands when the real-dispatch evidence is in — a suite alone is not acceptance for a dispatcher (the founder rejected TASK-059 twice on exactly that). Then `waiting-acceptance/`. |

## TASK-012 — how to run it, and why not a fork

**The method is a `MANAGED_FILES` profile, not a second repo.** The founder's
instinct was a thin blueprint with orchestration stripped out, as the spike's
vehicle. The separation is right and the fork is not: two blueprints is one fact
recorded twice, and it drifts — the same defect as `INDEX.md` (TASK-005), the
lifecycle triggers when the PR rule landed, and the forwarding notes removed on
2026-08-18. At repo scale it would be the worst instance yet, because nothing
would fail when they diverged.

`MANAGED_FILES` and `new-project.sh` already decide what reaches a derived
project, so "thin" is a profile in the one blueprint.

**THE DELIVERABLE IS FALSIFIABLE: bootstrap a project with orchestration OFF and
see whether the lifecycle, the gates and the sync still hold together alone.**
That is worth doing whatever ruflo turns out to be, because it answers the
question underneath this one — **is the differentiator separable at all?**

- If a no-orchestration bootstrap is coherent, the blueprint is a product with a
  plug-in orchestration socket, and ruflo is a candidate to fill it.
- If it is not, **the orchestration IS the product**, and adopting ruflo means
  adopting a different product rather than a component.

**Do this BEFORE evaluating ruflo.** It needs no third party, it cannot be
invalidated by what ruflo turns out to do, and stripping first would risk
deleting the half of the feed that works — the Codex half — on the strength of a
capability nobody has verified yet.

### The measurement, taken 2026-08-18

| | files | lines |
|---|---|---|
| orchestration — baton, watchers, feed, roster | 18 | 3,150 |
| core — DoD, gates, sync CLI, concern recipes | 18 | 5,892 |

Plus **9 of 37 test suites** are orchestration (3,463 lines), measured on a branch
missing `wait-mic` and `subagent-feed` — so the real figure is higher. Roughly
**40% of the repo**, and effectively all of 2026-08-18.

That number is the argument for asking the question, not for any particular
answer to it.

