# PLAN-BUG-019 — the coordination baton is a tracked file

**Status: CONSENSUS REACHED 2026-08-03 — option (a). Implementation authorized,
not yet started.** Per CLAUDE.md §"Major Bug Process": this touches the
persona-coordination protocol, which is the mechanism the whole team runs on, so
a direction was agreed before any code was written.

### The consensus, and what Codex added to it

He agreed with option (a) and with the reasoning on the crux I said I held
weakly: mic flips are **local operational events**, so losing their cross-machine
git history is acceptable, while durable decisions belong in tracked plan and
review documents. He went further than I did on one point — the append-only local
journal is **more accurate** than `git log` was, because it records transitions
that were never committed, and today's `git log` silently omits those.

Two refinements of his that are part of the agreement and must survive into the
implementation:

1. **`signal-set.sh` becomes the sole supported writer**, with the Codex/Gemini
   dispatch preambles and every other caller routed through it. Direct row
   editing becomes unsupported *and mechanically guarded* — not merely
   discouraged, which is the shape this repo has rejected four times.
2. **If journalling direct edits is still wanted, watcher-based journalling is a
   BACKSTOP only — never a second authoritative write path.** Two writers that
   agree by coincidence is the A-09 shape, and this plan must not reintroduce it
   one layer up.

---

## 1. Root cause

`AGENT_SIGNAL.md` is a **tracked** file that holds **live runtime state**.

Those two properties are individually fine and jointly a defect. Git owns the
content of tracked files in the working tree, so `git switch`, `git checkout
<file>`, `git stash`, `git rebase` and `git merge` all rewrite it — correctly,
by their own contract — including while another agent is mid-dispatch.

**Reproduced live, not inferred.** I dispatched Codex, then ran
`git checkout AGENT_SIGNAL.md` from another branch. The baton reverted to
`Holder=Eto State=OVER_TO_USER`, and Codex refused to proceed, correctly:

> *"I stopped because the baton changed before I could claim it… Under the
> radio-over protocol, I cannot overwrite that."*

The dispatch was lost **silently**. Nothing failed, no error surfaced; the
watcher simply had nothing to claim. That silence is the severity: a dispatched
agent that dies loudly costs minutes, one that dies quietly costs the session.

### Why it got worse today

This was rare until PR #3 made branch operations constant. Every fix is now a
branch, and the baton lives in the working tree those branches rewrite. The
frequency changed by an order of magnitude while the mechanism stayed the same.

### The mechanism, precisely

`scripts/codex-signal-watch.sh:133` builds a trigger key from
`Holder|State|Task` and dispatches when it settles for `AGENT_SIGNAL_SETTLE`
seconds. A branch operation rewrites all three fields at once, which:

* produces a **new key** → `pending_key` resets, `pending_since` restarts;
* usually restores `State` to something that is not `TARGET_STATE` → the early
  return at `:141` clears the pending state entirely.

So the reverted content is not merely stale — it actively **cancels** the
in-flight settle window. The watcher is behaving exactly as designed.

---

## 2. What the file is actually doing — two jobs in one artefact

| Role | Lifetime | Who reads it | Needs to be tracked? |
|---|---|---|---|
| **Live mic state** (Holder / State / Task) | seconds–minutes, many flips/session | the watchers, every persona | **no** — it is per-checkout runtime state |
| **Hand-off history** (`git log -p`) | permanent | humans, post-mortems | yes, or an equivalent durable store |
| **Protocol documentation** (the header prose) | permanent | every agent on wake | yes |

Conflating the first row with the other two is the bug. Nothing needs live mic
state to be under version control; it is tracked because the file it lives in
also carries documentation.

**This repo already solved the identical problem once.** `AGENT_ROSTER.md` is
per-engineer live state, so it is gitignored, and the tracked artefact is
`AGENT_ROSTER.example.md` — a template you copy once. The precedent is in
CLAUDE.md §"Agent Coordination" and it is the same shape.

---

## 3. Options

### (a) Untrack the live signal, keep a tracked template — **recommended**

* `AGENT_SIGNAL.md` **stays tracked** and keeps the protocol prose, but the
  `Current Signal` table becomes a pointer to the live file.
* Live state moves to `logs/state/signal.md`, untracked. BUG-020 has just made
  `logs/state/` the canonical in-project agent-state dir, so this composes with
  work landing today rather than inventing a location.
* `new-project.sh` seeds the live file on bootstrap, as it already does for
  the roster.

**Cost, stated plainly:** `git log -p AGENT_SIGNAL.md` stops being the history.
That is a real loss and the main thing to weigh. Mitigation: every flip appends
to `logs/state/signal-history.log`, which gives the same forensic record and is
*better* on one axis — it captures flips that were never committed, which today
are invisible to `git log` anyway. It is worse on another: it does not survive a
fresh clone and is not shared between machines.

**Question for review:** is the hand-off history genuinely wanted across clones,
or is it operational data whose value is local and recent? I believe the latter,
but I hold that weakly and it is the crux of the decision.

### (b) Keep it tracked; record dispatch identity separately

The dispatcher writes a round id somewhere untracked; the watcher claims against
that rather than the file content, so a reverted file cannot orphan a live run.

**Why I do not recommend it:** it stops the *symptom* while leaving live state
in a file git rewrites. The baton still flips under an agent's feet — a persona
reading it mid-run still sees the wrong holder. It is a second mechanism layered
over the first, and CLAUDE.md §"Quality is non-negotiable" names that shape
directly ("a third fallback layer to compensate for the second").

### (c) A lock the dispatcher checks before and after

Detects the clobber; does not prevent it. Turns a silent failure into a loud
one, which is a genuine improvement, but leaves the race. **Worth doing as a
backstop under (a) or (b)** — not as the fix.

### (d) `--skip-worktree` / `--assume-unchanged`

Rejected. Both are local index bits that do not survive a clone, are documented
as unsuitable for "files that change", and produce confusing failures on
checkout. This would make the bug rarer and much harder to diagnose.

---

## 4. Affected files

* `AGENT_SIGNAL.md` — the table becomes a pointer to the live file
* `scripts/signal-set.sh` — resolve the live path; append to the history log
* `scripts/codex-signal-watch.sh`, `scripts/start-{codex,gemini,copilot}-signal-watch.sh` — resolve the live path
* `scripts/agent-activity.sh:50`, `scripts/team-kickoff.sh:29` — same
* `scripts/new-project.sh:147,179` — seed the live file
* `.gitignore`, `scripts/blueprint` (`MANAGED_FILES`), `AGENTS.md`, `CLAUDE.md`, `docs/way-of-working.md` §9

**A complication that must be designed for, not discovered.** `signal-set.sh` is
*not* the only writer — the Codex and Gemini dispatch preambles instruct the
agent to *edit the rows directly* (`start-codex-signal-watch.sh:83`,
`start-gemini-signal-watch.sh:77`), and personas edit it by hand. So "append to
a history log on every flip" cannot be implemented in `signal-set.sh` alone. It
needs either a single enforced writer (change the preambles to call the script)
or a watcher that journals observed transitions. **I lean to the former**: one
writer is the same "one mechanism" argument that A-09 and `roster.sh` settled.

## 5. Tests

* **Reproducer (must fail on the parent):** start a watcher against a fixture
  repo, set the target state, run `git checkout <signal>` inside the settle
  window, assert the dispatch **still** fires. Today it does not.
* Branch ops (`switch`, `stash`, `rebase`) do not alter live mic state.
* The history log records a flip made by a direct edit, not just via the script.
* Non-vacuity: prove the fixture watcher dispatches at all in the control case,
  so "no clobber observed" cannot pass by never dispatching.

## 6. Rollback

Single commit, revertable. The live file is untracked, so a revert restores the
tracked table with no merge conflict. Any in-flight dispatch at revert time is
lost once — the same failure this bug describes, bounded to the revert.

## 7. Explicitly ruled out

**Do not fix this with a rule telling agents to remember not to touch the file.**
That shape has been rejected three times in this repo: BUG-004's "flip the mic
last", BUG-014's fixture isolation, and the no-chaining rule that ultimately
needed a PreToolUse hook. A rule you must remember while busy is not a fix. It
is also how *I* caused this bug — I ran `git checkout AGENT_SIGNAL.md` while a
dispatch was live, having written the surrounding protocol myself.
