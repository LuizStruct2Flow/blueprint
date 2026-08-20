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

**WIP: TASK-012 (reopened) and TASK-014 (promoted).** BUG-027, BUG-028,
BUG-029 and BUG-031 were all accepted by the founder on 2026-08-19.
BUG-031's move to `done/` is on PR #54 — once it merges, `waiting-acceptance/`
is empty.

**TASK-012 was reopened by the founder on 2026-08-19, the day it was filed.**
Read Part 3 of [`TASK-012-strip-test.md`](../waiting-acceptance/TASK-012-strip-test.md) before acting on
anything the first two parts concluded. In short: the spike measured whether
orchestration comes **off** and inferred something about whether another
orchestrator can go **on**. Only detach was tested — nothing was ever attached.

- **Still true:** orchestration detaches cleanly (one hard coupling, §7G; one
  suite; three doc links), the ~14% measurement, `feed.sh`/`log-activity.sh` are
  observability and not orchestration, and **BUG-028** — a fresh bootstrap cannot
  pass its own gate. That last one is the most valuable thing the spike produced
  and is entirely independent of ruflo.
- **Withdrawn:** *ruflo — do not adopt*. It rested on Q1 alone, and Q1's finding
  (ruflo cannot observe a `codex exec` **we** launched) holds only while we keep
  our own dispatcher. An orchestrator that owns the dispatch sees it by
  construction. **There is no verdict on ruflo right now.**
- **Retired:** the brief's *"evaluate on the lite path only"* constraint. Filling
  the socket means *being* the orchestrator, which is the full CLI; the lite path
  is an add-on by construction and could never answer the question.

**Feed work is still worth doing** — that part of the old note stands, and for a
firmer reason than before: `feed.sh` and `log-activity.sh` are the observability
lane, which survives either answer. What is **not** settled is whether we keep
orchestrating in-house; that is **TASK-014**, the attachment trial.

### The three things that cost the most on 2026-08-19

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

1. **BUG-030** — the baton contamination above. `tests/git-isolation` and
   `tests/state-dir` both exist and neither caught it.
2. **TASK-013** — the gate is 357.8 s and `bootstrap-gate` alone is **50.6%**,
   because it runs a complete second gate inside the first. The measurement is
   done; the report names what is *not* worth optimising (the bottom 28 stages
   total 8.5 s) and the trap in the obvious fix. Read it before touching timing.
3. **TASK-014 — promoted, and it is the biggest item on this list.** The
   attachment trial TASK-012's revalidation is waiting on: bootstrap a throwaway,
   install the **full** ruflo CLI, mount the lifecycle and the DoD gate on top,
   push one real work item through. Deletion proved the seam opens; only
   construction proves something fits it. **Do not pre-specify the seam.** The
   row lists two soft blockers (§7G leaving the core gate, `drift`/`pull` learning
   the profile) and they are now the trial's first *output*, not its precondition
   — deciding their shape before anything is plugged in is exactly the mistake
   TASK-012 made. **This is a real spike and will raise its own bug numbers**;
   it is not an afternoon.
4. **BUG-027's three unfixed findings**, no longer gated on TASK-012 (the feed is
   the observability lane and survives either answer):
   `BP_ROSTER_LOOKUP_TIMEOUT=0` hangs indefinitely (GNU `timeout 0` means *no*
   timeout), a killed lookup's partial stdout is accepted and persisted as a
   persona name, and `agent-activity.sh` sources `roster.sh` into the
   **supervisor's** own shell unguarded.

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
