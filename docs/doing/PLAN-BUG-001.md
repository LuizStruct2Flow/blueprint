# PLAN-BUG-001 — `agent-activity.sh` unbounded process leak (fork-bomb class)

**Status:** **REVISION 2** — rewritten after Codex/Slava withheld consensus on
revision 1. Implementation still NOT authorized (CLAUDE.md §"Major Bug Process"
step 3). **Severity:** CRITICAL. **Reported:** 2026-07-23 (founder diagnosis).

**What changed in rev 2:** the fix design was replaced, not patched. Rev 1
proposed a bounded *pool of `tail -F` processes*; Codex showed that design loses
product data and that its lock/teardown/sweep mechanisms contradict each other.
Rev 2 removes the mechanism instead of hardening it: **one supervisor process
that tracks a byte offset per file**. Every one of Codex's five
implementation-blocking holes is answered below by *deleting* the thing that had
the hole. A-06 (a second, independent defect in the same file, found after rev
1) is now folded in.

---

## 0. Why this is a *major* bug

- Burns the founder's machine: **load 175 on a 32-thread box for 2.7 days** at
  zero application load, ~24 cores pegged.
- Lives in a **blueprint-managed** file that CLAUDE.md tells *every waking
  agent* to execute — the protocol itself is the multiplier (RC-5).
- Has already propagated to every derived project (§6).
- Rev 1 was itself a §"Quality is non-negotiable" violation: three overlapping
  guards (pool cap + idle expiry + timeout) compensating for each other is the
  exact patch-stack shape CLAUDE.md warns about. Rev 2 has one mechanism.

## 1. Root cause analysis

Line references are to `scripts/agent-activity.sh` at `227f897`.

### RC-1 — Single-instance guard is TOCTOU-racy (lines 30–37)

N agents waking together all evaluate line 30 before any reaches line 36 → N
live feeds. Once ≥2 exist, both install `trap 'rm -f "$pidfile"' EXIT`; the
first to die unlinks the lock **while the other still runs**, so the gate
reopens permanently. PID reuse over multi-day sessions makes `kill -0`
unreliable.

> **Correction to the founder's diagnosis, confirmed by Codex:** a *losing*
> racer exits at line 32 **before** the trap is installed at line 37, so it
> never unlinks anything; `bash -n` doesn't execute traps either. Self-erasure
> requires the TOCTOU race to have already produced ≥2 trap-installing winners.
> This narrows the trigger without weakening the conclusion.

### RC-2 — One immortal `tail -F` per transcript, per instance, never reaped (lines 148–184)

`tail -F` follows by name and retries forever; a finished subagent's transcript
goes idle but is never deleted, so the tail never exits. There is **no in-run
retirement at all** — the only `reap_subtree` for these sits in an `EXIT` trap
that RC-3 shows never fires. `.subagent-seen` is destructively re-seeded at line
157, so it is per-instance *and* clobbers concurrent instances: every instance
spawns its own tail for the same transcripts. That is the multiplicative shape
behind the observed **4,357 + 4,357** tails on two files.

> Codex correction adopted: say "50 permanent tail/shell **pipelines**", not "50
> `jq` processes" — `jq` is invoked per record and is not resident while idle.

### RC-3 — Teardown depends on EXIT traps of a process that never exits

The body ends in `wait` (line 193) and blocks forever, so EXIT never fires. The
main trap only removes the pidfile — it does **not** kill children, so
`kill -TERM <mainpid>` orphans the whole subtree. Ctrl-C appears to work only
because the terminal signals the foreground *process group*; a detached agent
invocation gets no such delivery. Under `SIGKILL` — what recovery at this scale
requires — traps cannot run by definition, so **recovery guarantees orphans**.

### RC-4 — inotify exhaustion turns the leak into a CPU fire

Host `fs.inotify.max_user_instances = 128` (verified). Each `tail -F` consumes
one instance; past the limit GNU `tail` silently degrades to
`---disable-inotify` **1-second stat polling**. Thousands of pollers ⇒ the
observed ~2,400 % CPU.

> Labelled **host evidence**, per Codex: the process counts, CPU attribution and
> inotify value are observations from the founder's machine, not facts
> reproducible from this repository.

### RC-5 — Invocation frequency is the multiplier

CLAUDE.md §"On wake" tells the orchestrator to run the script every wake, and
`.claude/settings.json` allow-lists it so it never prompts. Correct **only if**
the script is a true no-op when already running — which RC-1 breaks.

### RC-6 — (NEW, A-06) The change-detector fires forever on Linux

Line 60: `cur=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)`.
On GNU coreutils `stat -f %m` is invalid **but still prints a multi-line
filesystem block to stdout** and exits 1 — and `$(a || b)` captures **both**
outputs. `cur` is therefore a blob containing live `Free:`/`Available:` block
counters, which change constantly, so `[ "$cur" != "$last" ]` is true on nearly
every poll. Reproduced on this host; it is the cause of the duplicate
`[User] IDLE` lines observed during the 2026-07-23 wake. Same broken idiom in
`scripts/start-copilot-signal-watch.sh:15,18` and dead code at
`scripts/codex-signal-watch.sh:56-58`.

**Consequence beyond noise:** every spurious "change" re-emits a feed line,
which grows the log, which drives `log-activity.sh` rotation churn.

## 2. Affected files

| File | Change |
|---|---|
| `scripts/agent-activity.sh` | The rewrite (RC-1…RC-4, RC-6). |
| `scripts/start-copilot-signal-watch.sh` | RC-6 — same broken `stat` idiom. |
| `scripts/codex-signal-watch.sh` | RC-6 — delete the dead mtime code. |
| `tests/agent-activity-bound/test.sh` | **New** — regression test (§4). |
| `.githooks/pre-push-project` | **New** — wire the blueprint's shell tests into a gate (A-15: they currently run nowhere). |
| `CLAUDE.md` §"On wake", `AGENTS.md` | C-5 lifecycle wording + the false "opens a Terminal" claim (A-18). |
| `docs/way-of-working.md` | Concern #9 slide — deck must move in the same commit (CLAUDE.md pitch-surface rule). |

## 3. Fix approach (REVISED)

### The core idea

**Replace every `tail -F` with one supervisor that tracks a byte offset per
file.** The supervisor already knows which file it read, so attribution is free
— no `==> file <==` banner parsing, no process per transcript, and a quiet
agent is never evicted because nothing is ever evicted. An idle file costs one
`stat` per tick.

Per tick, for each watched path:

- `stat` size + inode. Inode changed → rotated/replaced, reset offset to 0.
  Size < offset → truncated, reset to 0. Size > offset → read the delta with
  `tail -c +$((offset+1))`, a **short-lived process that exits within the
  tick**. Advance the offset.
- Emit the delta's lines labelled with that path's persona.

Watched set: `AGENT_SIGNAL.md`, `$state_dir/{codex,gemini}-runs.log`, the newest
Claude transcript, and recent subagent transcripts. **Total resident processes:
one.** Zero inotify instances, so RC-4 cannot recur.

### F-1' — `flock`, with explicit FD hygiene (fixes RC-1; answers Codex hole 1)

```sh
exec 9>"$log_dir/.agent-activity.lock"
flock -n 9 || { echo "[agent-activity] already running — leaving it."; exit 0; }
```

Race-free and auto-released on death **including SIGKILL**. Delete the pidfile,
the `kill -0` check, and the unlink trap entirely.

> **Codex hole 1 — lock inheritance — is answered structurally.** Rev 1 kept a
> fleet of children that could inherit FD 9 and hold the lock past the leader's
> death. Rev 2 has **no long-lived children**: the only subprocesses are
> `tail -c`/`stat` invocations that exit within the tick. Belt and braces: every
> spawned helper gets `9>&-`, and the test suite asserts the lock is acquirable
> immediately after `kill -9` of the leader.

### F-2' — Explicit CLI contract (fixes RC-3; answers Codex hole 3)

Rev 1 never said whether start was foreground or daemonized. It does now:

| Invocation | Behaviour |
|---|---|
| `agent-activity.sh` | **Foreground.** Streams to stdout, tees to the log. Ctrl-C stops. What a human runs. |
| `agent-activity.sh --daemon` | Detaches via `setsid`, records pid, returns **immediately**. Idempotent — a second call is a no-op via flock. What an agent runs on wake. |
| `agent-activity.sh --stop` | TERM the recorded pid, wait, KILL if it doesn't exit. |
| `agent-activity.sh --status` | Print running/not + pid; exit 0/1. |

`setsid` is invoked explicitly for `--daemon` only, so there is no ambiguity
about whether a caller can `wait` on it. Tests assert each mode's caller
semantics.

### F-3' — Ordinary single-process teardown (answers Codex hole 2)

No `kill 0`. The supervisor traps `INT TERM`, sets a flag, breaks the loop,
runs cleanup **with traps disabled** (`trap - INT TERM EXIT`), and exits with a
deterministic status. With no long-lived children there is no subtree to reap —
Codex's objection is removed rather than mitigated.

### F-4' — No orphan sweep (answers Codex holes 4 and 5)

Rev 1 proposed `pkill -f`-style sweeping; Codex correctly called command-line
matching an unsafe ownership boundary. **Rev 2 deletes the sweep.** With one
process and no children there is nothing to orphan, and `flock` self-releases on
SIGKILL, so a restart needs no cleanup. Nothing in the fix ever kills a process
it did not directly spawn.

Codex hole 5 is likewise moot: the SIGKILL test now asserts *"the lock is free
and a restart yields exactly one supervisor"*, not *"zero tails exist"*.

### F-5' — Portable `stat` (fixes RC-6)

Probe once at startup, then call only the correct form:

```sh
if stat -c %Y . >/dev/null 2>&1; then mtime(){ stat -c %Y "$1"; }; size(){ stat -c %s "$1"; }; inode(){ stat -c %i "$1"; }
else                                  mtime(){ stat -f %m "$1"; }; size(){ stat -f %z "$1"; }; inode(){ stat -f %i "$1"; }; fi
```

Never rely on the `||` chain's combined stdout. Same fix in the copilot watcher.

### Rejected alternative (recorded, per Codex C-1)

A single multiplexed `tail -n0 -F f1 f2 … fN` bounds processes at 1 but requires
parsing `==> file <==` banners to attribute interleaved lines — brittle, and
per-persona attribution is the feed's entire product value. Offset tracking gets
the same process bound with exact attribution and no banner parsing.

## 4. Tests

`tests/agent-activity-bound/test.sh`, named
`BUG-001: agent-activity.sh holds one instance with a bounded process set`,
following `tests/marker-merge/test.sh` (exit 0 = pass). Two-commit pattern:
`test(BUG-001): minimal reproducer (failing)` → `fix(BUG-001): …`, reproducer
**verified failing on the parent commit** before push.

Assertions — Codex's rev-1 list in full, plus the rev-2 design's own risks:

1. **Concurrency** — 50 concurrent invocations → exactly **1** survivor.
2. **Process bound** — 40 subagent transcripts, then 40 more → resident process
   count stays **1** and does not grow.
3. **Quiet-but-active transcript** (Codex) — a transcript idle 15 min then
   written again **still emits**. This is the assertion rev 1 would have failed.
4. **Lock released after leader `kill -9`** (Codex hole 1) — lock immediately
   acquirable; restart yields exactly one supervisor.
5. **Caller semantics** (Codex hole 3) — `--daemon` returns promptly;
   foreground does not; `--stop` leaves zero processes; `--status` is accurate.
6. **Concurrent `--stop`/start** (Codex) — no wedged lock, no double start.
7. **Paths containing spaces** (Codex) — no word-splitting.
8. **Rotation + truncation** — inode change and shrink both reset the offset;
   no missed or duplicated lines.
9. **RC-6 regression** — a signal file whose mtime does *not* change emits
   **exactly one** line, not one per tick. Fails on the parent commit.

Hygiene: fixtures run against a temp `HOME`/repo root; every kill is scoped to
the fixture's own pid. The suite must **never** `pkill -f agent-activity`
globally — that would kill a founder's real feed.

## 5. Rollback

Single-file, self-contained, no migration. Rollback = `git revert` of the two
commits. On-disk state is only `logs/.agent-activity.lock` / `.pid` under
gitignored `logs/`; the reverted script ignores them. Blast radius of a bad fix
is "the feed doesn't stream" — the feed is read-only observability and no agent
depends on it for correctness.

**Interim mitigation until this lands:** do not run the feed on wake. Strays:
`pkill -9 -f 'scripts/agent-activity.sh'` (verified effective 2026-07-23).

## 6. Propagation

All four derived copies exist and have drifted, so propagation is a per-project
`blueprint pull` + review, not a copy:

| Project | Drift | Note |
|---|---|---|
| `redcare/rdc-agenticcoding-blueprint` | 13 lines | Has BUG-001 in full; **already fixed BUG-002 better than we proposed** (`AGENT_ACTIVITY_HOME` + repo-basename default) — adopt that upward. |
| `redcare/greenwashing-detection-agent` | 33 lines | |
| `struct2flow/storm2flow` | 120 lines | |
| `struct2flow/linkedin-watcher-agent` | 112 lines | |

## 7. Answers to Codex's C-questions

- **C-1** — **Agreed, rev 1 was wrong.** Offset-tracking supervisor adopted; the
  pool is gone, so "reap oldest / mark forever seen" and the invalid
  idle/timeout completion signals are gone with it.
- **C-2** — **Agreed.** No `kill 0`. `setsid` only under `--daemon`, with the
  caller contract stated in F-2' and asserted by tests.
- **C-3** — **Agreed.** The sweep is deleted, not hardened. Nothing kills a
  process it did not spawn.
- **C-4** — **Accepted:** `struct2flow/blueprint` is canonical. Noting the
  tension: `rdc-agenticcoding-blueprint` holds the better version of this very
  file (§6), so the BUG-002 fix should travel up from there even though the
  BUG-001 fix lands here first.
- **C-5** — **Agreed.** The wake protocol becomes *"ensure the feed is
  running"* (`--daemon`, idempotent), not *"run the feed"*. Spawned personas
  must not start it. CLAUDE.md + AGENTS.md updated in the same commit.

## 8. Open question for round 2

**Q-1.** The offset reader spawns one short-lived `tail -c +N` per *changed*
file per tick. Under a burst (many subagents writing simultaneously) that is a
handful of sequential short-lived processes per tick — bounded and
self-exiting, but not literally one process. Is that acceptable, or do you want
the read done without any subprocess (bash `read` with a manual skip loop is
O(bytes) and worse; `dd bs=1 skip=N` is slower still)? My position: `tail -c +N`
is correct — it exits, consumes no inotify instance, and the count is bounded by
the number of files that changed in one tick.
