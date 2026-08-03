# Agent Signal — the radio-over protocol

**This file is the protocol. It is not the baton.**

The live baton lives at **`logs/state/signal.md`**, which is untracked
per-checkout state. Read it with:

```bash
bash scripts/agent-activity.sh --whoami   # who am I
cat logs/state/signal.md                  # who holds the mic
```

Write it with **`scripts/signal-set.sh`, which is the only supported writer**:

```bash
scripts/signal-set.sh --holder <Persona> --state ACTIVE      --task '...'
scripts/signal-set.sh --holder <Persona> --state OVER_TO_CODEX --task-file .scratch/task.md
```

Do **not** hand-edit the baton rows. One writer publishes the whole baton in a
single atomic `mv`, so a poller can never sample a half-written state — `Task`
from the previous round beside the new `State` was a real defect, twice.

## Why the live state is not in this file

It used to be, and that was a bug (**BUG-019**). A tracked file holding live
runtime state is fine until you notice that git *owns* tracked files in the
working tree: `git switch`, `git checkout <file>`, `git stash` and `git rebase`
all rewrite them — correctly, by their own contract — **including while an agent
is mid-dispatch**.

Reproduced live rather than inferred: a `git checkout AGENT_SIGNAL.md` reverted
the baton while Codex was claiming the mic, and it stopped, correctly — *"the
baton changed before I could claim it."* Nothing failed. The watcher simply had
nothing left to claim. A dispatch that dies loudly costs minutes; one that dies
silently costs the session.

It was rare until every change became a branch + PR. The mechanism never
changed; the frequency changed by an order of magnitude.

This is the same split already used for
[`AGENT_ROSTER.md`](AGENT_ROSTER.example.md): live per-checkout state stays
untracked, the tracked artefact carries what every checkout shares.

## The protocol

`Holder` is a **persona name** from [AGENT_ROSTER.md](AGENT_ROSTER.md) — read
yours with `--whoami`, never assume it, since the roster is per-engineer.
`State` is `IDLE` / `ACTIVE` / `OVER_TO_<NAME>`. On claiming the mic, set
`State = ACTIVE` first. The full protocol is in [AGENTS.md](AGENTS.md).

**Before flipping the mic to `OVER_TO_USER`, walk [docs/DoD.md](docs/DoD.md)
§A–§G.** If `ls docs/waiting-acceptance/` doesn't show the artefacts the `Task`
field claims are waiting, the handoff is not done.

## History

Hand-off history is `logs/state/signal-history.log`, appended by
`signal-set.sh` on every flip.

It used to be `git log -p AGENT_SIGNAL.md`, and losing that was the real cost of
this change — weighed deliberately rather than waved away. Mic flips are local
operational events; the durable decisions they surround belong in
`docs/doing/PLAN-*.md` and the review documents, which are tracked. The journal
is also more accurate in one respect: it records flips that were never
committed, which `git log` could never show.
