# PLAN-BUG-001 — `agent-activity.sh` unbounded process leak (fork-bomb class)

**Status:** **REVISION 5 — CONSENSUS REACHED (round 5). IMPLEMENTATION AUTHORIZED**
per CLAUDE.md §"Major Bug Process" step 3, after 5 review rounds. **Severity:** CRITICAL.
**Reported:** 2026-07-23 (founder diagnosis).

**Consensus history:**

| Round | Codex verdict | What it changed |
|---|---|---|
| 1 | **Disagree** — 5 implementation-blocking holes | Rev 1's bounded `tail -F` pool replaced wholesale by the offset supervisor (rev 2). Codex also caught a false claim of mine ("each layer independently sufficient"). |
| 2 | **No consensus yet** — architecture **accepted**, 3 defects in the new design | Rev 3: bounded snapshot-range reads, newline-boundary advancement, fail-closed daemon identity. |
| 3 | **No consensus** — architecture accepted; **1** blocker | Codex found that rev 3's `delta=$(…)` strips trailing newlines, so the newline-boundary rule fails on the *ordinary* case: one appended `one\n` emits nothing and never advances. Rev 4: the bounded range goes to a temp file and `k` is computed byte-preservingly; pipeline success = bytes captured, not exit status. |
| 4 | **No consensus** — architecture accepted; **1** blocker | Founder authorized an extra round rather than self-declaring consensus. Codex confirmed the R3 fix landed, then found that `awk length($0)` counts **characters** in a multibyte locale while every other quantity is **bytes** — a non-ASCII trailing fragment advances the offset *into* an incomplete record. Rev 5: `LC_ALL=C awk`, plus test #19. |
| 5 | **CONSENSUS — IMPLEMENT** | *"I have no architectural objection."* One documentation nit (foreground row said "tees"), applied. **Implementation authorized** per CLAUDE.md §"Major Bug Process" step 3. |

**What changed in rev 3:** the architecture is unchanged and endorsed — Codex
asked for no return to a tail pool, process-group teardown, or orphan sweep.
Three details of the *new* design were still able to duplicate output, lose a
record, or signal an unrelated process:

1. `stat`-then-`tail` was **not atomic** → bounded read of exactly the snapshot
   range (§3).
2. A record split across appends would be **consumed half-written and lost** →
   the offset now advances only to the last complete newline (§3).
3. `--stop` trusted a **stale pidfile** → the lock is the liveness oracle and
   identity is validated fail-closed (§F-2').

Rev 3 also settles Codex's two non-blocking points: no `tee` process in
foreground, and explicit first-discovery offset semantics.

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

Watched set: `AGENT_SIGNAL.md`, `$state_dir/{codex,gemini}-runs.log`, the newest
Claude transcript, and recent subagent transcripts. **Resident processes: exactly
one.** Zero inotify instances, so RC-4 cannot recur.

#### The per-tick read (revised in rev 3 — Codex R2 blockers 1 & 2)

For each watched path:

1. `stat` size `S` and inode. Inode changed → rotated, reset offset to 0.
   `S` < offset → truncated, reset to 0. `S` == offset → nothing to do.
2. **Read exactly `S - offset` bytes from the snapshot range** — never "read to
   whatever EOF `tail` happens to see" — **into a per-tick temp file, never into
   a shell variable**:

   ```sh
   tmp="$run_dir/.delta"                       # per-tick, same filesystem
   tail -c +$((offset+1)) "$f" 2>/dev/null | head -c $((S - offset)) >"$tmp"
   got=$(wc -c <"$tmp")
   [ "$got" -eq $((S - offset)) ] || continue  # sink short — retry next tick
   ```

   Both helpers are short-lived and exit within the tick; both get `9>&-`.

   > **Why not a shell variable (Codex R3 blocker):** POSIX command substitution
   > **strips every trailing newline**. `delta=$(… )` on a snapshot ending in a
   > complete record silently loses the delimiter that step 3 needs. The minimal
   > failure is devastating and ordinary: append `one\n`, `delta` becomes `one`,
   > `k` is 0, **nothing is emitted and the offset never advances** — the feed
   > stalls on a quiet file until the `MAX_FRAGMENT` force-flush. Rev 3
   > specified exactly this and was wrong. The bytes must never pass through
   > `$()`.
   >
   > **Pipeline success is defined by bytes captured, not exit status.** With
   > `pipefail`, `head -c N` closing after `N` bytes can SIGPIPE `tail` while a
   > concurrent append keeps it writing. That status is **benign**. Success means
   > `got == S - offset`; anything else defers the range to the next tick.

   > **Why (Codex R2 blocker 1):** `tail` alone reads to the EOF it observes
   > *while running*, which may exceed the snapshot `S` if the writer appends
   > mid-read. Advancing to the pre-read `S` would then re-emit those bytes next
   > tick (duplicates); advancing to a re-`stat`ed size would skip bytes a
   > concurrent append added after the read window (loss). Bounding the read to
   > the snapshot range makes the tick's work exactly defined, and any bytes
   > written during the read are simply picked up next tick.

3. **Advance only to the last complete newline**, computed byte-preservingly
   from the temp file — never from a shell variable:

   ```sh
   if [ "$(tail -c 1 "$tmp" | od -An -tx1 | tr -d ' \n')" = "0a" ]; then
     k=$got                                    # range ends on a record boundary
   else
     # LC_ALL=C is load-bearing: awk's length() counts CHARACTERS in a multibyte
     # locale, but every other quantity here (got, offset, S, head -c, tail -c)
     # is BYTES. See the note below — this is not a portability nicety.
     frag=$(LC_ALL=C awk 'END{print length($0)}' "$tmp")  # trailing fragment, bytes
     k=$(( got - frag ))
   fi
   [ "$k" -gt 0 ] && head -c "$k" "$tmp" | emit_lines "$f"
   offset=$(( offset + k ))
   ```

   `k` is the byte offset just past the final `\n`. The trailing fragment is
   *not consumed* and is re-read next tick, when it will be complete. Only `k`
   (an integer) is ever captured by `$()`; the payload stays in the file.

   > **Why `LC_ALL=C` (Codex R4 blocker):** without it, a trailing fragment
   > containing `é` occupies **two** bytes but `length($0)` reports **one**, so
   > `k = got - frag` lands **one byte past** the real newline. The supervisor
   > then emits part of an incomplete record and resumes mid-record next tick —
   > silent corruption, then permanent loss. This is not theoretical for this
   > feed: agent transcripts routinely carry non-ASCII (`→`, `✓`, `🖋`, box
   > drawing, any non-English content), so the defect would fire early and often.
   > Every quantity in this algorithm is a **byte count**; the locale override
   > is what keeps that invariant true.

   > **Why (Codex R2 blocker 2):** a writer can grow the file before finishing
   > the terminating newline of a JSONL record. Consuming that fragment makes
   > `jq` reject it *and* leaves the next tick starting mid-object, so the record
   > is lost permanently. Rev 3 chooses **newline-boundary advancement over a
   > carry buffer**: it needs no per-path pending state, so there is nothing to
   > clear (or forget to clear) on rotation/truncation — Codex asked for an
   > explicitly tested carry policy, and the strongest such policy is holding no
   > carry state at all. The rule covers plain run-log lines identically, so a
   > split line is never emitted as two feed entries.
   >
   > **Bound on the fragment.** A pathological writer that never emits a newline
   > would make the re-read grow without limit. If a fragment exceeds
   > `MAX_FRAGMENT` (default 1 MiB), emit it as-is and advance past it, logging
   > that the line was force-flushed. Loss is bounded and visible rather than
   > unbounded and silent.

4. Emit each complete line labelled with that path's persona.

#### Initial offset on first discovery (Codex R2 non-blocking point 2)

Explicit, because "rotation" and "first sight" are different events:

- **Transcripts and run logs** → offset starts at **current size** (skip
  existing content). This preserves today's `tail -n0` semantics: a feed started
  now must not replay a finished agent's history.
- **`AGENT_SIGNAL.md`** → emit the current mic state **once** at startup, then
  track changes, so the feed opens by showing who holds the baton.

#### Foreground output (Codex R2 non-blocking point 1)

The supervisor writes **both sinks itself** (stdout and the log file). No `tee`
in the pipeline — otherwise the "exactly one resident process" claim is false in
foreground mode. Asserted by the process-count test in both modes.

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
| `agent-activity.sh` | **Foreground.** Streams to stdout and **also writes to the log itself** (no `tee` process — see "Foreground output"). Ctrl-C stops. What a human runs. |
| `agent-activity.sh --daemon` | Detaches via `setsid`, records pid, returns **immediately**. Idempotent — a second call is a no-op via flock. What an agent runs on wake. |
| `agent-activity.sh --stop` | Validate identity **fail-closed**, then TERM, wait, KILL. |
| `agent-activity.sh --status` | Report running/not; a stale identity reports **not running** and is never signalled. |

`setsid` is invoked explicitly for `--daemon` only, so there is no ambiguity
about whether a caller can `wait` on it. Tests assert each mode's caller
semantics.

#### Fail-closed identity for `--stop` / `--status` (revised in rev 3 — Codex R2 blocker 3)

Rev 2 said `--stop` signals the recorded pid. Codex is right that this
reintroduces the unsafe ownership problem rev 2 had just removed from orphan
sweeping: after a supervisor SIGKILL the pidfile survives, and once that pid is
recycled `--stop` would terminate an unrelated process.

**The lock is the liveness oracle, not the pidfile.** `flock` is released by the
kernel on death — including SIGKILL — so:

1. Try `flock -n` on the lock file.
   - **Acquired** → no supervisor is running. The state file is stale by
     definition: remove it, report *not running*, **signal nothing**. Release.
   - **Not acquired** → a supervisor is live; continue.
2. Read `pid` + `nonce` + `start_token` from the state file.
3. **Validate before signalling.** The supervisor writes a random `nonce` at
   startup and its own `start_token` — on Linux, field 22 (`starttime`) of
   `/proc/<pid>/stat`, which together with the pid is unique across reuse; on
   BSD/macOS, `ps -o lstart= -p <pid>`. Re-read that token live and require an
   exact match with the state file.
4. **Any mismatch, missing field, or unreadable process → fail closed:** print
   what could not be verified and **exit non-zero without signalling**. There is
   no fallback to command-line matching — that is exactly the unsafe boundary
   Codex rejected in round 1, and it stays rejected.
5. Only after validation: `TERM`, then poll until the **lock becomes
   acquirable** (the authoritative "it's gone" signal, not a pid check), then
   `KILL` if the grace period expires.

The state file is published and removed **atomically** (write temp + `mv` in the
same directory). `--status` runs steps 1–3 and reports, but never signals.

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
10. **Append-during-read** (Codex R2 blocker 1) — append to a file while a
    deliberately slowed delta read is in progress; assert **every record is
    emitted exactly once** — no duplicate from advancing short, no gap from
    advancing long. Slowing is injected via a test hook around the read helper
    so the race is deterministic rather than timing-dependent.
11. **Split record** (Codex R2 blocker 2) — write one JSONL record in several
    appends, the last supplying the newline. Assert it is emitted **once, only
    after completion**, and never as two fragments. Same assertion for a plain
    run-log line split mid-write.
12. **Fragment bound** — a writer that emits `MAX_FRAGMENT`+ bytes with no
    newline is force-flushed once, with a log line, and the offset advances (no
    unbounded re-read loop).
13. **Stale pidfile** (Codex R2 blocker 3) — `kill -9` the supervisor, leaving
    the state file behind; assert `--status` reports **not running** and
    `--stop` **signals nothing** and exits cleanly.
14. **PID reuse** — hand-craft a state file whose pid belongs to a live
    *unrelated* process with a non-matching `start_token`; assert `--stop`
    **fails closed**, exits non-zero, and that process is still alive
    afterwards. This is the test that would have caught the rev-2 design.
15. **Resident bound is one** (Codex R2 non-blocking point 1) — in **both**
    foreground and `--daemon` mode, assert exactly one long-lived process (no
    `tee`), while short-lived read helpers may come and go.
16. **First-discovery offset** — a pre-existing transcript is **not** replayed;
    `AGENT_SIGNAL.md` emits its current state exactly once at startup.
17. **Single complete record on a quiet file** (Codex R3, deterministic) — a
    quiet file receives exactly **one** newline-terminated record and nothing
    else. Assert it is emitted **on the very next tick** and the offset
    advances by exactly its byte length — **without** a following record and
    **without** the `MAX_FRAGMENT` force-flush. This is the assertion that
    fails against rev 3's `$()` formulation, so it pins the fix directly.
18. **Byte-exactness under a short sink** — if the bounded read captures fewer
    than `S - offset` bytes, the tick emits nothing and advances nothing, and
    the full range is emitted intact on a later tick (no partial consumption).
19. **Non-ASCII split record** (Codex R4, deterministic) — after a complete
    prior record, append an incomplete record whose fragment contains multibyte
    UTF-8 (e.g. `é`, `→`, an emoji). Assert **no byte of the new record is
    emitted or consumed before its newline arrives**, and that once completed it
    is emitted **exactly once**. Run the suite under a UTF-8 locale so the test
    genuinely fails without `LC_ALL=C` — a C-locale-only test run would pass
    vacuously and pin nothing.

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

## 8. Round-2 open question — RESOLVED

**Q-1** (short-lived `tail -c +N` helpers vs. literally one process) was
**answered: accepted.** Codex: *"'One supervisor' should mean one long-lived
process, not zero helper invocations. The helpers exit within a tick and consume
no persistent inotify resources."* Rev 3 adds `head -c` alongside it for the
bounded read, under the same rule.

## 9. Round-3 acceptance condition — how rev 3 meets it

Codex's stated condition: *"Keep the revision-2 architecture. Add bounded
snapshot-range reads, per-file partial-line carry, and fail-closed daemon
identity validation, with the tests above."*

| Required | Rev 3 | Tests |
|---|---|---|
| Bounded snapshot-range reads | §3 step 2 — `tail -c +N \| head -c (S-offset)`, advance to `S` only on success | #10 |
| Per-file partial-line carry | §3 step 3 — **newline-boundary advancement instead of a carry buffer**: no per-path pending state exists, so none can leak across rotation. Plus a `MAX_FRAGMENT` force-flush so a newline-less writer cannot loop | #11, #12 |
| Fail-closed daemon identity | §F-2' — lock is the liveness oracle; pid + nonce + `start_token` validated live; any mismatch exits non-zero **without signalling**; no command-line matching | #13, #14 |
| No `tee` in foreground | §3 — supervisor writes both sinks itself | #15 |
| First-discovery offset stated | §3 — transcripts/run logs start at EOF; `AGENT_SIGNAL.md` emits current state once | #16 |

**One deliberate deviation, flagged rather than buried:** Codex asked for a
"per-file partial-line carry buffer with an explicitly tested clear policy on
rotation/truncation". Rev 3 instead **never advances past a newline**, so there
is no carry buffer to clear — the same guarantee with less state and no
clear-policy bug to test for. If you consider the carry buffer load-bearing for
a reason I have missed, say so and I will switch; otherwise I read this as
satisfying the intent (no split record is ever emitted or lost) by a simpler
mechanism.

## 10. Round-4 outcome and the founder decision

Four consensus rounds have elapsed. **The architecture has been settled since
round 2 and has not been reopened.** Every round since has found exactly one
real, narrowing defect:

| Round | Defect found | Class |
|---|---|---|
| 1 | Bounded `tail -F` pool evicts quiet-but-active agents; flock/SIGKILL recovery self-contradictory; `kill 0` unsafe; command-line orphan sweep unsafe | **Architectural** — design replaced |
| 2 | `stat`-then-read not atomic; split records lost; `--stop` trusts a stale pid | Design detail |
| 3 | `$()` strips trailing newlines → feed stalls on one complete line | Shell semantics |
| 4 | `awk length()` counts characters, not bytes → advances into an incomplete record on any non-ASCII | Shell semantics |

**Codex's round-4 closing position, verbatim:** *"This is a narrow mechanical
correction inside the accepted revision-4 design. I have no architectural
disagreement and no preference-level objection."*

**The case for stopping:** the remaining fix is one token (`LC_ALL=C`), already
applied in rev 5, and the reviewer has stated it has no other objection.

**The case for one more round:** rounds 3 and 4 each found a defect that would
have caused **silent data loss in the feed's ordinary path**, and both were in
code *I* wrote confidently. Neither was architectural — they were exactly the
kind of shell-semantics trap that survives to production. Round 5 costs ~90
seconds. The empirical record is that the marginal round is still paying.

**Recommendation: one final round, then implement regardless of its outcome
unless it raises something architectural.** That bounds the loop — it cannot
regress forever — while keeping the check that has caught six defects to my
zero. If round 5 returns another shell-level nit, apply it and proceed; if it
returns consensus, proceed. Either way implementation begins after round 5.
