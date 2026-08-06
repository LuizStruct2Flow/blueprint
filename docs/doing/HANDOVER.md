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

## 1. WIP — the only open item

**FEATURE-003, the reader half.** Promoted 2026-08-05, **not started**. Build
`scripts/session-resume.sh`, which *derives* where a woken session is instead of
reading an authored snapshot. Plan:
[`PLAN-FEATURE-003-session-snapshot.md`](PLAN-FEATURE-003-session-snapshot.md) §4.

Two things the plan states that are easy to lose between reading it and typing:

- **An incomplete replay must be LOUD.** The feed is truncated on every daemon
  start, so a missing marker is normal — and a short replay that reads like a
  quiet one is the failure this whole feature exists to prevent.
- **The writer stays parked.** Only the marker append survives of it. Both flow
  reviewers reached that independently; do not quietly build the snapshot.

Everything else is parked or waiting on the founder — see `docs/backlog/` and
`docs/waiting-acceptance/`.

## 2. LIVE HAZARD — check before dispatching anyone

**No watcher is running.** Stopped deliberately at the end of 2026-08-05. Start
one before flipping the mic to Codex, or the dispatch goes nowhere:
`setsid bash scripts/start-codex-signal-watch.sh >> logs/state/watcher-boot.log 2>&1 < /dev/null &`

**A stale watcher will double-dispatch, and the fix cannot see it.**

On 2026-08-05 a `codex-signal-watch.sh` orphaned at `ppid 1` for 3h42m fired
alongside a freshly started one: two Codex agents, same task, same tree.
Duplicate metered spend, and it poisoned the new agent's test baseline with
failures that were pure concurrency — which it then reported as "pre-existing".

BUG-022's lock refuses a second watcher **only if the first one took a lock**.
Any watcher started before that fix holds nothing and is invisible to the check,
on every checkout, until each is restarted once.

```bash
ps -eo pid,ppid,etime,args | grep signal-watch    # ppid 1 + long age = orphan
```

FEATURE-004 (parked) is the fix. Until it exists this is manual.

## 3. EPHEMERAL — died with the session, re-establish it

**Start with `bash scripts/session-resume.sh`.** It derives the git state, the
four lifecycle folders, the live baton and the journal events since the last
snapshot marker — so it cannot go stale the way this file has. Exit **9** means
the report is INCOMPLETE or the snapshot is UNTRUSTED, and the warnings say
which. Do not read a short replay as a quiet one.

Close the window and open a new one at handoff with `--mark`; if the tree is
untrusted, `--rollback` stashes uncommitted work (never `checkout --`).

> The snapshot id lives in this file, which is TRACKED — deliberately, and
> against the grain of BUG-019. The check it enables is "was the prose written
> without the journal being marked?", and that can only be answered against the
> authored surface. The BUG-019 hazard does not transfer: a checkout that
> rewrites the id produces a loud disagreement warning, not the silent
> nothing-to-claim that bug was about.

| What | How |
|---|---|
| Activity feed | `bash scripts/agent-activity.sh --daemon`, watch with `tail -f logs/agent-activity.log`. **It truncates the log on start** — restarting destroys any replay window. |
| Mic monitor | persistent `Monitor` on `logs/state/signal.md`, emit **only** on `Holder`/`State` change |
| Exchange board monitor | persistent `Monitor` on `../../agent-exchange/EXCHANGE.md`, 10s, emit only on change |

### Why the board monitor is declared here

Not in `project_config_paths.md`: that file is simultaneously this repo's config
**and** the template seeded into every new project, so anything concrete written
there propagates. A hard-coded row for this board did exactly that on 2026-07-30
— it landed in linkedin-watcher-agent complete with a rationale describing an
incident that happened *here* (**BUG-009**). This file is project-owned and never
synced, so it is the right home until that overlap is fixed.

A project with **no** peer stream should not arm it: a monitor on a file nobody
writes is pure overhead.
