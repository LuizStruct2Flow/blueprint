<!-- session-marker: e597eb41 -->

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

**WIP: BUG-027**, the subagent feed blackout — fixed and gate-green on
`bug/027-subagent-feed-blackout`, with **three unfixed findings** from the
cross-provider review's third round: `BP_ROSTER_LOOKUP_TIMEOUT=0` hangs
indefinitely (GNU `timeout 0` means *no* timeout), a killed lookup's partial
stdout is accepted and persisted as a persona name, and `agent-activity.sh`
sources `roster.sh` into the **supervisor's** own shell unguarded — the same two
failure modes with the feed daemon as the blast radius.

**Read TASK-012 before fixing them.** If the orchestration layer is going to be
replaced, that is work we would throw away.

Everything else is parked or waiting on the founder.

## 2. LIVE HAZARD — check before dispatching anyone

**No watcher is running.** Stopped deliberately at the end of 2026-08-07, and its
lock removed so the next session is not met by a false dead-watcher warning.
Start one before flipping the mic to Codex, or the dispatch goes nowhere:

```bash
setsid bash scripts/start-codex-signal-watch.sh >> logs/state/watcher-boot.log 2>&1 < /dev/null &
ps -eo pid,ppid,etime,args | grep signal-watch    # expect exactly ONE
```

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
