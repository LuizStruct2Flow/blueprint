<!-- session-marker: dfffa1ea -->

# HANDOVER — what a waking agent needs to TAKE OVER

**Founder rule, 2026-08-05:** *"the file should only contain the data needed for
the next agents that will take something over that is open / wip, all other
things should be documented in the tasks/bugs || commits || md files."*

So this file is **not** a status report and **not** a history. It went from 530
lines to this because it kept narrating things that already have a home:

| If you want to know… | Read |
|---|---|
| what is open, and what to test | the four `docs/<state>/` folders |
| what changed and why | `git log` — commit bodies carry the reasoning |
| what a fix taught | the item's own row in `done/BUGS.md` |
| the rules | `CLAUDE.md`, `docs/DoD.md` |
| host quirks, standing founder decisions | `project_config_overview.md` |

**Anything derivable from a command does not belong here.** If you catch
yourself writing "N items are in `doing/`", delete it — `ls` already said so,
and it cannot go stale the way this file has, three times in one day.

---

## 0. ON A DIFFERENT MACHINE — read this before anything else

Handover written 2026-08-20 for a fresh checkout (founder moving to a Mac). The
work is all on `main`. **What does not travel is the per-checkout state**, and
three of the four items below will stop you within the first five minutes.

**1. There is no live baton, and the gate fails closed without one.**
`logs/state/signal.md` is untracked by design (BUG-019). DoD **§7G** requires it
and returns 1 when absent, so **your first `git push` fails the gate** with
`no live baton at … — seed it with scripts/signal-set.sh`. Seed it first:

```
bash scripts/signal-set.sh --holder <your-orchestrator-name> --state ACTIVE --task 'picking up after the 2026-08-20 handover'
```

**2. There is no roster.** `AGENT_ROSTER.md` is gitignored and per-engineer.

```
cp AGENT_ROSTER.example.md AGENT_ROSTER.md
```

The shipped template carries the same names as the machine this handover was
written on for every persona in the grooming plan — Klaus, Christian, Vitali,
Markus, Philipp — **except the Orchestrator, which is `Sylvia` in the template
and was `Eto` here.** So attributions in the plan resolve, and yours is whatever
you edit that cell to. `bash scripts/agent-activity.sh --whoami` prints it.

**3. The hook is NOT armed on a fresh clone.** `core.hooksPath` is repo-*local*
config, so cloning never gets it — this is BUG-004 and A-22, and a push of 12
commits once went out completely ungated this way. It is armed automatically by
`arm_gate`, which both `bash scripts/agent-activity.sh --daemon` and
`blueprint drift` call on every run, and both report the state rather than arming
silently. Verify with `git config --get core.hooksPath`.

**4. Expect roughly half your pushes to silently not happen — BUG-032.** The
gate runs ~361 s while git holds the remote connection idle, and the push then
dies of SIGPIPE: **exit 141, completely empty output, no `To github.com:` line,
and the ref absent from the remote.** A re-run is *not* a reliable workaround —
it appeared to be one for five occurrences and then failed twice consecutively.
Two things make this survivable:

```
GIT_SSH_COMMAND="ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30" git push -u origin <branch>
git ls-remote origin <branch>     # the ONLY authority on whether it landed
```

The keepalive is 5/5 against 5 failures in 7 without it — **but the causation is
not established** (see the BUG-032 note below), and **it is persisted nowhere**:
no `ServerAliveInterval` in `~/.ssh/config`, `core.sshCommand` unset. Your Mac
starts equally exposed.

Never trust a push's exit code through a pipe — `git push … | tail` reports
`tail`'s status, which is why this looked like "reports success" for a day.

**Also, if you intend to run the full gate:** `brew bundle` installs gitleaks,
semgrep, osv-scanner and trivy. Without them those stages `pipe_skip` rather than
fail, so an unprepared machine gets a green gate that checked less — the exact
shape BUG-035 is about.

---

## 1. START HERE

```bash
bash scripts/session-resume.sh
```

It derives the git state, the four lifecycle folders, the live baton and the
journal events since the last handoff marker. It holds nothing, so it cannot go
stale the way this file has. **Exit 9** means the report is incomplete or the
snapshot untrusted, and the warning says which — do not read a short replay as a
quiet one. Roll the window at the next handoff with `--mark`; if the tree is
untrusted, `--rollback` stashes (never `checkout --`).

Two things it does NOT do, so you do not go looking:

- **It does not read the activity feed.** A probe into that feed existed,
  survived six review rounds, and was deleted — it guarded a file the tool never
  reads and fired on every wake. Do not re-add one; the post-mortem is in
  [`../done/PLAN-FEATURE-003-session-snapshot.md`](../done/PLAN-FEATURE-003-session-snapshot.md) §8b.
- **It does not detect tampering**, only loss. Silence means nothing was lost by
  itself, not that nobody rewrote the record.

**WIP: nothing is half-done. `doing/` holds no rows.** TASK-012 and TASK-014 are
accepted and in `done/`. The whole ruflo question is closed: **adopt nothing** —
it allocates agent slots and defers execution to Claude Code, which this repo
already has.

**Open on a fresh checkout: read [`PLAN-GROOMING-2026-08-20.md`](../backlog/PLAN-GROOMING-2026-08-20.md) first.**
It is the output of a five-persona grooming pass and it is the only place the
dispositions exist. The rows themselves were **not** yet amended — that is
TASK-016's remaining work, and until it runs three rows in `backlog/` still state
a mechanism that is known to be wrong:

- **BUG-032** says "Mechanism — CONFIRMED by experiment". The *ordering* is
  confirmed (git opens two connections before the hook and holds them idle
  across it). The *causation* is not: gate duration and the keepalive are
  perfectly confounded in the captured data, and both failures were also the two
  longest runs of 25. **Cheap falsification: push over HTTPS**, which opens a
  fresh connection after the hook.
- **BUG-033** names two hypotheses and **both are refuted** — 0 failures in 80
  full-suite runs at load 257, and the detector is provably sensitive. The real
  defect is that #13 discards `--mark`'s exit code.
- **TASK-015**'s "likely shape of the answer" would entrench the bug it
  describes. The declared population already exists (`tests/state-dir/test.sh:37`)
  and is stale now: **six files carry the physical-root block, the guard checks
  four**, leaving `signal-set.sh` — the baton's sole writer — unguarded.

### Standing hazards, learned the expensive way

**1. CI was red all day and nobody noticed, because `--admin` was used to merge
five PRs.** Two independent causes, both landed by this session:

- `scripts/log-activity.sh` ran `set -uo pipefail`, and `pipefail` is not POSIX.
  A `sh` without it does not ignore the option, it **exits 2** — so the hook died
  on line 20. It passed on every developer machine because this host's dash
  0.5.12 accepts `pipefail` and the runner's rejects it. **"My `/bin/sh` is dash
  too" is not evidence about the runner** — that reasoning wasted six local
  experiments before the fix.
- **Every PR title used `BUG-029:` when the enforced form is `BUG#29:`.** The
  title becomes the squash subject and `TASK-002` checks it. Validate before
  opening: `bash scripts/check-commit-subjects.sh --subject "<title>"`.

**Never merge with `--admin`.** `gh pr checks <n>` reporting *"no checks
reported"* means the workflow has not registered **yet**, not that there are
none. Wait for it.

**2. A push can report success and push nothing.** Twice on fresh branches: the
gate ran to completion, printed `PASSED`, launched the CI watcher — and
`git ls-remote origin <branch>` showed nothing. Re-running the identical push
worked. **Verify every push with `git ls-remote`**; the terminal output is
identical to a real push right up to the missing `To github.com:` line. Not yet
rowed — no reproducer, and each attempt costs a 360 s gate.

**3. A test suite reset the live coordination baton mid-review (BUG-030).**
`tests/bootstrap-gate` set `Holder=Nobody / State=IDLE` while a reviewer held the
mic. The reset text is the *bootstrap default*, so it reads as a fresh checkout
rather than as damage. The verdict was recovered from `signal-history.log`.

### Next, in the order worth doing

Full reasoning in [`PLAN-GROOMING-2026-08-20.md`](../backlog/PLAN-GROOMING-2026-08-20.md).
This list is the conclusion, not the argument.

1. **BUG-035 — the SAST gate scans a language this repo does not contain.**
   99 `.md`, 79 `.sh`, zero JS/TS, and `shellcheck` is never invoked. A-16 and
   A-17 are both default shellcheck findings that a human found in July while the
   gate printed a green SAST check on every push since. ~10 lines to fix.
2. **BUG-034 — `blueprint pull` can silently delete project content.**
   `marker_aware_merge` compares marker counts, never order. Core sync verb.
   Reproducer before fix.
3. **BUG-030 — reproduced, and its class fix is a net deletion.** `--file` on the
   seed at `new-project.sh:245`, plus one `unset AGENT_SIGNAL_FILE
   AGENT_STATE_HOME AGENT_FEED_LOG` at the `pipe_stage` boundary, then delete the
   four duplicated per-suite unsets. Retires a class with three prior instances.
4. **The dispatcher trio (BUG-024/025/026).** Cross-provider review — the
   declared differentiator — currently returns a wrong answer with no signal.
5. **The records that state something untrue.** `CLAUDE.md:476` claims the SLO
   warns past 120 s / 45 s when `pipeline.sh:287-288` uses 180 s / 95 s, and that
   file **ships to every derived project**. `SUITES.md` has two rows both claiming
   to be the slowest stage. `docs/config/findings.md` is referenced by 12 files
   including one that ships, and **does not exist** — so the lifecycle's "cancel
   the row, leave a pointer" path terminates nowhere.
6. **BUG-027's three unfixed findings have no row anywhere** and exist only as
   prose in this file, which is rewritten every wake: `BP_ROSTER_LOOKUP_TIMEOUT=0`
   hangs indefinitely (GNU `timeout 0` means *no* timeout), a killed lookup's
   partial stdout is accepted and persisted as a persona name, and
   `agent-activity.sh` sources `roster.sh` into the supervisor's own shell
   unguarded. **Row them before they vanish.**

Everything else is parked with a trigger.

## 2. LIVE HAZARD — check before dispatching anyone

**A Codex watcher IS running** as of 2026-08-19 — `ppid 1`, up ~2 days, and it
works: it dispatched Andreas three times during BUG-029's review. Check before
starting another, or you get the double-dispatch below:

```bash
ps -eo pid,ppid,etime,args | grep '[s]ignal-watch'
# if none for THIS repo:
setsid bash scripts/start-codex-signal-watch.sh >> logs/state/watcher-boot.log 2>&1 < /dev/null &
```

**"Expect exactly ONE" was wrong advice and is now removed.** That grep matches
every project's watcher on the machine — on 2026-08-19 it returned two, and the
second belonged to a different repo entirely. **Match on the path**, not the
count.

Note it is at `ppid 1` and days old, which is the exact shape the hazard below
describes. It is nonetheless the live one; age alone does not make a watcher
stale.

**A stale watcher will double-dispatch, and the fix cannot see it.** On
2026-08-05 an orphan at `ppid 1` for 3h42m fired alongside a freshly started one:
two Codex agents, same task, same tree. Duplicate metered spend, and it poisoned
the new agent's baseline with failures that were pure concurrency — which it then
reported as "pre-existing".

BUG-022's lock refuses a second watcher **only if the first one took a lock**. A
watcher started before that fix holds nothing and is invisible to the check.
FEATURE-004 (parked) is the real fix; until it exists this is manual.

`ps` **is** valid here — a dispatcher is an ordinary process. It is **not** valid
for Monitors; see §3.

## 3. EPHEMERAL — died with the session, re-establish it

| What | How |
|---|---|
| Activity feed | `bash scripts/agent-activity.sh --daemon`, watch with `tail -f logs/agent-activity.log`. **It truncates the log on start** — restarting destroys any replay window. |
| Mic waiter | `sh scripts/wait-mic.sh logs/state/signal.md` as a **background Bash task**, NOT a `Monitor`. It exits on the first `Holder`/`State` change — **re-arm it as the first thing you do when it fires** |
| Exchange board monitor | persistent `Monitor` on `../../agent-exchange/EXCHANGE.md`, 10s, emit only on change |

**Do not check a Monitor's liveness with `ps` — it cannot see them (A-40).**
Proven 2026-08-07: a grep for the monitor's own emit string returned nothing
while two mic monitors were alive and emitting seconds later. An earlier sweep
*did* show the exchange-board monitor, which is what made the check look sound.
Believing it cost a live monitor being declared dead and a duplicate armed on top
of it. A Monitor's silence is not evidence of anything — the only proof it lives
is an event.

**The mic no longer uses a Monitor for that reason (FEATURE-005).** The waiter
exits on the first change, so the harness reports the baton moving, the waiter
crashing, and the harness stopping it — three events where a Monitor gave one.

**It does not close the gap, and do not write that it does.** It must be re-armed
after every event, and forgetting is silent. What would close it is a supervisor,
which this repo does not have (Alexey, 2026-08-17). The exit notification and the
need to re-arm arrive together, which is better than a death nobody is told
about, and less than a guarantee. **The board monitor is still a `Monitor`** —
same trade-off, not yet worth a second waiter.

### Why the board monitor is declared here

Not in `project_config_paths.md`: that file is simultaneously this repo's config
**and** the template seeded into every new project, so anything concrete written
there propagates. A hard-coded row for this board did exactly that on 2026-07-30
— it landed in linkedin-watcher-agent complete with a rationale describing an
incident that happened *here* (**BUG-009**). This file is project-owned and never
synced, so it is the right home until that overlap is fixed.

A project with **no** peer stream should not arm it: a monitor on a file nobody
writes is pure overhead.

## 4. OPEN FOR THE FOUNDER — the only things blocked on a person

- **Two calls on FEATURE-003**, in its plan §6: marker cadence (§6.2 — `--mark`
  is deliberately not wired into `signal-set.sh`), and whether it ships to every
  project via `MANAGED_FILES` (§6.4 — deliberately not, until it proves itself
  here).
- **A friction found by dogfooding `--mark`:** it writes the snapshot id into
  THIS file, which is tracked, and the blueprint forbids committing on `main` —
  so every handoff leaves an uncommitted change needing a PR to land. The id is
  tracked to enable the prose-disagreement check. Having now paid the cost, the
  check is probably not worth it and untracked state is the honest home.
- **A fresh `git worktree` cannot push:** the DoD `§7G baton is well-formed`
  stage fails because the baton is per-checkout untracked state (BUG-019) and a
  new worktree has none. Seed it with `signal-set.sh` — sharp edge for exactly
  the workflow CLAUDE.md recommends when a concurrent session holds `main`.
