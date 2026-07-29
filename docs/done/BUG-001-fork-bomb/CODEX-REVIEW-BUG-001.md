# Codex / Slava review — BUG-001 consensus and blueprint audit

**Date:** 2026-07-23  
**Scope:** review only; no implementation or source-file changes.  
**Verdict:** **DISAGREE with the plan as written; implementation is not yet
authorized.** The diagnosis is substantially correct, but F-2/F-4 have
implementation-blocking lifecycle holes and F-3 can silently lose active-agent
output. Revise the plan before implementation.

## 1. BUG-001 RCA review

### What is correct

- **RC-1 is correct.** The pidfile check is a TOCTOU race; after two winners
  install the EXIT trap, either winner can unlink shared state while the other
  remains live. PID reuse is also an identity problem.
- The plan's correction to the founder diagnosis is **correct**: a losing racer
  exits before line 37 and therefore never installs/runs the EXIT trap.
  `bash -n` parses the file and does not execute the trap. Self-erasure requires
  at least two processes to have passed the race and installed traps.
- **RC-2 is correct in substance.** Each newly discovered subagent transcript
  gets a permanent `tail -F` pipeline, and no normal in-run retirement exists.
  `.subagent-seen` and `.subagent-tails` are shared, destructively reinitialized
  per feed instance, so duplicate instances multiply watchers.
- **RC-3 and RC-5 are correct.** Normal operation ends in an indefinite `wait`;
  the top-level trap removes only the pidfile, not children; repeated wake
  invocation makes a broken idempotency claim a multiplier.
- **RC-4 is plausible and matches GNU tail behavior**, but the exact host
  inotify value, process counts and CPU causal attribution are observations not
  reproducible from this repository. Keep them explicitly labelled host
  evidence rather than repository-proven facts.

### Corrections / overstatements

- RC-2's “50 permanent `tail` + 50 `jq`-spawning `while` loops” should say 50
  permanent tail/shell pipelines. `jq` is invoked per input record; it is not
  itself a permanently resident process while the transcript is idle.
- F-3 says its three layers are “each independently sufficient to keep the
  count constant.” That is false. Idle expiry and a 30-minute timeout bound
  lifetime, not concurrency: a burst can create arbitrarily many watchers
  within either window. Only the pool cap bounds instantaneous count.
- The proposed pool loses product data. Reaping the oldest of eight tails can
  drop an agent that is still active but quiet. Idle mtime is not proof of
  completion (an agent may reason or wait for a tool for over ten minutes).
  Worse, the path remains in `.subagent-seen`, so later writes do not reattach.
  The timeout has the same permanent-loss failure after 30 minutes.

### Implementation-blocking holes

1. **Flock inheritance defeats SIGKILL recovery unless designed explicitly.**
   `exec 9>...; flock -n 9` leaves FD 9 inheritable. Forked feed children can
   retain the locked open file description. If the leader is `SIGKILL`ed but
   children survive, the lock can remain held; the next invocation loses flock
   and therefore never reaches F-4's “after winning flock” sweep. The plan must
   specify and test lock ownership/FD closure in every child, or use a dedicated
   supervisor whose death and descendant cleanup have defined semantics.
2. **`trap 'kill 0' INT TERM EXIT` is unsafe as written.** `kill 0` targets the
   current process group, including the shell executing the trap. On TERM/EXIT
   it can retrigger traps, interrupt cleanup, and make exit status nondeterministic.
   Cleanup must disable traps first and signal enumerated child PGIDs/PIDs, or
   a supervisor must trap TERM, forward it once, wait/reap, then exit. Do not
   use the same self-signalling body for EXIT.
3. **`setsid` caller semantics are unspecified.** util-linux `setsid` may fork
   when invoked by a process-group leader unless `--fork`/`--wait` behavior is
   deliberately selected. A caller waiting on the original process may observe
   success while the feed continues detached. The CLI contract must say whether
   start is foreground, daemonized, or a quick idempotent launcher, and tests
   must assert it.
4. **F-4 command-line matching is not a safe ownership boundary.** Exact
   repository transcript paths distinguish normal repos, but can still match a
   user's independent `tail` of the same file; `pgrep/pkill -f` also has quoting,
   path-space, truncation, and PID-reuse hazards. Cleanup should act only on
   process identity recorded by this repo (PGID plus start-time/nonce, validated
   against `/proc` where available), not arbitrary commands mentioning a path.
   A cross-platform fallback should fail closed, not broaden to global `pkill`.
5. The SIGKILL test acceptance “startup sweep leaves 0 orphans” conflicts with
   a restarted healthy feed, which should own some tails. Assert zero **stale
   fixture-owned** processes and a bounded healthy new group instead.

## 2. Consensus answers

### C-1 — bounded pool versus multiplexing

**Disagree with F-3. Prefer a single supervisor that multiplexes files by
tracking an offset per transcript and reading appended bytes itself.** This
keeps attribution because the supervisor already knows which file it is
reading; it needs no `tail` filename banners. It also avoids one process per
transcript and never evicts a quiet active agent. Rotation/truncation can be
handled by inode/size checks. If a per-file pool is retained, eight must be a
configurable resource limit with a queue and later reattachment, never
“reap oldest and mark forever seen.” Ten-minute idle expiry and 30-minute hard
timeout are not valid completion signals.

### C-2 — `setsid` plus `kill 0`

**Disagree as written.** A dedicated process group is useful, but self-re-exec
and caller/wait semantics must be explicit, and `kill 0` must not be used
unchanged in INT, TERM and EXIT traps. Prefer one supervisor that records child
PIDs/PGIDs, disables traps during cleanup, TERM-waits-KILLs only owned children,
and removes identity state last.

### C-3 — startup sweep

**No: transcript-path matching plus current-PGID exclusion is insufficient.**
It protects other normal repository paths but not an unrelated observer of the
same transcript, stale/reused PGIDs, path parsing, or lock inheritance. Use
repo-scoped recorded identities with a start-time/nonce and strict validation.
Never use global `pkill -f`.

### C-4 — canonical repository

**`struct2flow/blueprint` is canonical.** This repository says so in
`docs/DoD.md` §11, README's sync model, and `scripts/blueprint`; the latter's
`MANAGED_FILES` is explicitly the source of truth. The plan supplies no
repository evidence that `redcare/rdc-agenticcoding-blueprint` supersedes it.
Fix and cross-provider-review here first, then propagate with `blueprint pull`
and reconcile drift per derived repo.

### C-5 — feed on every wake

**Do not require execution on every wake.** Make the primary-session protocol:
“ensure the machine/repo-scoped feed is running; start it if absent; stop it
explicitly at session end.” A race-free idempotent launcher remains required,
so repeated calls are harmless, but needless every-wake spawning should not be
the prescribed lifecycle. Spawned personas must not start it.

## 3. Generic-template contamination

### Confirmed project-specific runtime contamination

- **BUG-002 is confirmed and complete for this exact identifier class.**
  `scripts/agent-activity.sh:8,9,16,26` is the only non-teaching occurrence of
  `linkedin-watcher`/`LINKEDIN_WATCHER` in executable generic files. It hardcodes
  both the environment variable and `~/.linkedin-watcher-agent`, while the
  Codex/Gemini launchers correctly use `~/.{{PROJECT_NAME}}`.
- The proposed replacement `~/.struct2flow/<project>` would itself diverge from
  the launcher contract. Choose one canonical state-dir API and use it in all
  three scripts, e.g. `AGENT_STATE_HOME` defaulting to
  `$HOME/.{{PROJECT_NAME}}`; document migration/backward compatibility.
- `scripts/new-project.sh:128-129` hardcodes the founder's git identity into
  every derived repository. That is personal/organization contamination with
  behavioral effect. Bootstrap should preserve existing Git configuration or
  accept explicit author options; it must not silently write
  `Luiz Scheidegger <luiz@struct2flow.com>` into each repo.

The worked-example references requested by the founder are not findings.
Blueprint branding/author material (`LICENSE`, deck author/footer,
`STACK_DEFAULTS.md` identity example) may be intentional publishing identity,
but because the entire tree is copied they should be explicitly classified as
blueprint-only or parameterized; they must not silently become a derived
project's metadata.

### Placeholders bootstrap does not fill

`new-project.sh` substitutes only `{{PROJECT_NAME}}` in a fixed `TARGETS` list
and `{{YYYY-MM-DD}}` in two files. It does **not** perform or enforce a final
unresolved-token audit.

Actionable omissions:

- `scripts/start-gemini-signal-watch.sh` contains `{{PROJECT_NAME}}` but is not
  in `TARGETS`; a new project's Gemini state/log path and prompt remain literal.
- `sonar-project.properties` contains `{{PROJECT_NAME}}` but is not in
  `TARGETS`; Sonar key/name remain literal.
- `README.md` is not in `TARGETS` and retains `{{PROJECT_NAME}}`,
  `{{NAME}}`, `{{REPO_PATH}}`, and `{{YYYY-MM-DD}}`. More fundamentally,
  a derived repo receives the blueprint's own README rather than a project
  README template.
- `scripts/blueprint` contains `{{PROJECT_NAME}}` and
  `{{PROJECT_NAME_UPPER}}` intentionally as substitution-engine source and
  correctly excludes itself; these are not unresolved runtime placeholders.
- `docs/doing/HANDOVER.md` has many human-fill template tokens. Replacing only
  its date leaves it claiming to be the canonical current resume document while
  entirely stubbed. Bootstrap should either generate a minimally truthful
  handover or explicitly block first handoff until it is completed.
- `project_config_security.md` and `project_config_infra.md` contain many
  choice/example tokens intentionally requiring owner decisions. Those are
  templates, not mechanically derivable values, but bootstrap should report
  them as required setup rather than imply placeholder substitution is
  complete.

The sync CLI handles `PROJECT_NAME` substitution on later pulls, but that does
not repair `new-project.sh`'s omitted project-owned template files, and it
cannot fill non-project-name tokens.

## 4. Documentation / behavior inconsistencies

### Critical / operational

1. **Wake read order conflicts.** `AGENTS.md` requires signal → AGENTS →
   CLAUDE → lifecycle docs; `docs/DoD.md` §10 and `HANDOVER.md` require
   HANDOVER first, then signal/CLAUDE/MEMORY. `CLAUDE.md` says adopting the
   orchestrator and starting the feed happen “before anything else.” There is
   no single executable wake order.
2. **Feed UI claim is false.** `AGENTS.md:28,245` and `CLAUDE.md:38` say the
   script opens a Terminal. `scripts/agent-activity.sh:39-41` explicitly says
   auto-open was removed. `AGENT_FEED_NO_TERM` is documented but unused.
3. **Handoff identity contradicts dispatchers.** The protocol requires Holder
   to be a roster persona and handoffs to persona states, but both launchers
   instruct agents to return `Holder=Claude Code`; the Codex launcher also
   permits `ACTIVE`. Those violate the persona invariant and can collide among
   Claude sessions. The dispatcher only triggers generic
   `OVER_TO_CODEX/GEMINI`, while the roster describes persona handoffs.
4. **“Agents stay active after handoff” is not implemented.** `AGENTS.md` says
   agents keep rereading the signal after handoff, but Codex/Gemini CLI runs
   terminate after one task. Reactivation depends on an external dispatcher,
   not the handed-off agent.
5. **Every-wake drift claim is not operationalized.**
   `docs/way-of-working.md:312` says the agent calls `blueprint drift` on every
   wake; neither wake checklist commands it.

### Gate and DoD drift

6. **Documented gate order omits real stages.** DoD §4 and the deck list build
   → lint → format → tests → host-path/project guards, while the actual hook
   runs security scans first and IaC validation after workspace tests. Update
   the canonical order everywhere.
7. **The hook is not universally blocking as advertised.** Security and IaC
   checks are skipped when binaries are missing, relying on an asserted CI
   backstop that is not equivalent to “pre-push enforces” them. Terraform
   validation is also skipped without `.terraform`. The docs/deck should say
   conditional locally + mandatory CI, or the hook should fail closed.
8. **The blueprint's shell regression tests run nowhere.**
   `tests/marker-merge/test.sh` is not invoked by `.githooks/pre-push`;
   there is no active `.githooks/pre-push-project`. The planned BUG-001 test
   would likewise be inert unless explicit wiring is added. This is correctly
   noticed in PLAN-BUG-001 §7.
9. **The 30-second gate ceiling is unverified and structurally doubtful.**
   Network/ruleset-dependent Semgrep plus security scans, two workspaces,
   coverage, and IaC all share the ceiling, but the hook has no timer or budget
   enforcement.
10. **Hook auto-wiring claim is false for ordinary clones.** CLAUDE/AGENTS say
    `postinstall` should wire `core.hooksPath`; this template has no root
    `package.json`, and `new-project.sh` says it runs npm initialization but
    does not do so. Bootstrap wires Git directly, but a later clone has no
    implemented auto-wire path.
11. **DoD test-location rule does not fit this bug.** DoD §3 requires minimal
    reproducers beside `*.test.{js,ts}`, while the plan proposes
    `tests/agent-activity-bound/test.sh` following an existing shell-test
    convention. The DoD needs a shell/tooling-test rule or an explicit
    documented exception.

### Lifecycle / template truthfulness

12. `HANDOVER.md` says “DoD §11” although resume continuity is §10; §11 is
    blueprint sync.
13. `AGENTS.md` says the signal must stay a slim four-row baton, but the actual
    Task cell can contain the entire multi-paragraph dispatch prompt. The
    dispatcher design makes that likely; either define a bounded task pointer
    or stop claiming the baton stays slim.
14. README says bootstrap “substitutes `{{PROJECT_NAME}}` placeholders,” which
    is false for the omissions above. It also says optional npm initialization
    is run, while the script merely prints a message.

## 5. Required plan revision before consensus

Revise PLAN-BUG-001 to:

1. replace per-file immortal tails with an offset-tracking single supervisor,
   or specify lossless queue/reattach semantics;
2. define start/stop/foreground-daemon caller behavior;
3. define lock ownership so no child inherits the singleton lock;
4. replace self-signalling `kill 0` traps with owned-child cleanup;
5. replace command-line orphan sweeping with validated repo-owned identities;
6. correct the F-3 “independently sufficient” claim and test assertions;
7. add tests for lock release after leader SIGKILL, quiet-active transcripts,
   reattachment after expiry/cap, paths with spaces, PID/PGID reuse defense,
   concurrent `--stop`/start, and caller wait semantics;
8. keep implementation blocked until Claude and Codex agree on that revision.
