# Bugs — active (being implemented)

Bugs currently being worked. Pushed bugs move to
`docs/waiting-acceptance/BUGS.md`; founder-accepted bugs move to
`docs/done/BUGS.md`. See [README.md](README.md) for the lifecycle.

**Keep rows to one line.** Link out for the detail. A row that grows into a
paragraph belongs in a `PLAN-*.md` or a work-item folder — a table cell
holding half a page is unreadable, which is how this file stopped being
useful once already.

## Two namespaces, and only one of them is a work item

**`BUG-XXX` / `FEATURE-XXX` / `TASK-XXX` are the lifecycle IDs.** They are what the
commit convention, the regression-test naming rule and these lifecycle folders
key off (CLAUDE.md §"Bug Management", §"Team Workflow").

**`A-NN` is not a work item.** Those are findings from one audit — the
2026-07-23 contamination sweep in
[BLUEPRINT-AUDIT-2026-07-23.md](../config/BLUEPRINT-AUDIT-2026-07-23.md) — in the same
category as a Codex finding ID. A finding is a *claim that something is wrong*;
it becomes work when it gets a `BUG-`/`FEATURE-` number and a row here.

They were being used as though they were work items — folder names, rows in this
table, gate comments — and then extended with new numbers (A-38, A-39) for
findings that had nothing to do with that audit. Live items were renumbered on
2026-07-30. The audit document and everything in `done/` keep their `A-NN` IDs as
historical provenance, because the Codex review documents argue about findings by
those names and renaming them would break the trail they exist to be.

**Rule going forward:** an `A-NN` reference is a citation of history. If you are
about to work on something, give it a `BUG-`/`FEATURE-` number first.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| **BUG-038** | **The feed suites synchronise on "a supervisor is resident", but the property they need is "the supervisor has registered this run log" — and on a slow host those are not the same instant.** `wait_sup` returns as soon as a process matching `--supervise` exists. The feed deliberately does not replay pre-existing content (case #16), so a payload appended between `wait_sup` returning and registration is folded into the baseline and never emitted. The suite then reports "the reader lost the record", which is **indistinguishable from the regression the case exists to catch**. Isolated by single-variable experiment: inserting one `sleep 2` after `wait_sup 1` — the only change — turned #7 from fail to pass. **Fixed** by a `reader_ready` handshake that writes a unique sentinel to the very file the case will use and waits for it to come out the other end, proving liveness AND that this file is registered. Applied to #7/#10/#18/#5f. **#10 and #18 now pass.** A first version of the helper returned a status no caller checked, so a failed handshake silently degraded to the unsynchronised behaviour it exists to prevent — a guard whose failure mode is invisible is not a guard, and every call site now fails loudly. | S2 | OPEN | Found 2026-09-09 while fixing BUG-036. Fixed for #10/#18. Re-open if any new case appends to a run log without a handshake first. |
| **BUG-039** | **`--daemon` returns while the supervisor is resident but not yet pumping, and the first record appended in that window waits 32.6 seconds.** Measured twice on macOS at **32.60s and 32.59s** — a deterministic constant, not load — while every subsequent record lands in 0.25-0.47s, i.e. the tick. Foreground mode has no such delay (timestamped `bash -x` trace shows the payload emitted 3.09s after start, appended at 3s). **This is an operator-facing defect, not only a test problem:** start the feed, do something, and watch half a minute of silence before the first line appears, which reads as a broken feed. The cause is that `cmd_daemon`'s readiness oracle is `feed_is_running`, i.e. the lock — BUG-037 made it poll that oracle correctly, but the oracle answers "resident", not "pumping". **Likely fix:** have the supervisor signal readiness once it has completed its initial scan, and have `--daemon` wait for THAT. It would also let `tests/agent-activity-bound`'s handshake bound drop back to a second or two. **Two cases remain unexplained and are NOT this bug:** #7 (a state dir containing spaces — the handshake never completes even at a 45s bound, so this may be the real word-splitting defect the case was written for, on macOS) and both #5f foreground assertions (the handshake SUCCEEDS, proving the reader is registered and emitting, yet the payload appended immediately after is not found). Raising the bound from 20s to 45s changed no outcome while adding 2m41s to the run, which is the evidence that these two are a different mechanism. | S2 | OPEN | Found 2026-09-09 by measuring append-to-emit latency while fixing BUG-036. Blocks the macOS gate together with the #7 and #5f residue. |
| **BUG-037** | **`agent-activity.sh --daemon` reports "failed to start" and exits 1 while the supervisor it just launched is alive and healthy — and a caller that believes it spawns a second one.** `cmd_daemon` launched the supervisor, slept a fixed `0.4`s, checked `feed_is_running` **once**, and gave up. Measured on macOS the supervisor acquires its `flock` after **~0.6s**, so the check ran before the thing it was checking for. On a faster host startup fits inside 0.4s, which is why a fixed sleep looked correct for months. **This is not a cosmetic exit code.** `cmd_daemon`'s own idempotency guard is `feed_is_running`, so a caller that trusts the failure and retries gets a SECOND supervisor — the unbounded-spawn shape BUG-001 rode to load 175 for 2.7 days, reachable here by an honest retry rather than by a broken guard. It also made `tests/agent-activity-bound` report "could not start a supervisor" for cases #10/#13/#14/#18. **Observed live in this session's very first command:** the wake-time `--daemon` printed `failed to start` while `--status` immediately after reported it running. **Fix:** poll for the lock on the same 5s bound and 0.1s tick `cmd_stop` already uses, rather than guessing a single interval — a timing assumption removed beats a magic number enlarged. | S1 | OPEN | Found 2026-09-09 while fixing BUG-036. Fixed in the same session. Re-open if any launcher regains a fixed-sleep verification. |
| **BUG-036** | **The pre-push gate cannot pass on macOS: three test helpers identify a process's cwd through `/proc`, which does not exist there, so the supervisor count is always 0 and `agent-activity-bound` fails closed.** `tests/agent-activity-bound/test.sh:159` and `tests/subagent-feed/test.sh:49,125` run `readlink -f /proc/$p/cwd`; on macOS that is always empty, the `case` never matches, and cases #1/#6/#7/#13/#14/#15 fail with "0 supervisors" while the feed is in fact running. Verified pre-existing at `c4dc95b` (tip of `main`) in a clean worktree, with the live feed stopped — **`main` is red on any Mac, and no push can be made from one.** The product itself is portable: `scripts/agent-activity.sh:226` branches on `/proc/<pid>/stat` vs BSD `ps -o lstart=`. Only the tests assume Linux, so this is the Brewfile's defect (TASK-017) recurring one layer down — the thing that decides whether work can ship is Linux-only while the thing it tests is not. Second defect in the same file: `test.sh:420` interpolates `$n1→$n2`, and under the `LC_ALL=C` the suite sets, bash absorbs the multibyte arrow into the identifier (`n1\xe2: unbound variable`) — needs `${n1}`. Third: the suite reports "no UTF-8 locale available" and SKIPs #19 on a host where `locale` is `en_US.UTF-8` and `locale -a` lists it, so its own detection is wrong. **Not the fix:** skipping the suite on Darwin — that is a suite silently covering nothing (BUG-005). Port the cwd lookup to a shared helper that uses procfs where present and `lsof -a -p <pid> -d cwd -Fn` on BSD. | S1 | OPEN | Found 2026-09-09 while landing TASK-017, by the gate refusing that push. Blocks every push from macOS. |


**Do not narrate status here.** Which items are where is answered by the
folders: `doing/` is what is being implemented, `waiting-acceptance/` is what is
pushed and untested, `done/` is what the founder accepted. Prose repeating that
becomes a second record of one fact, and on 2026-08-03 every such line in this
file had gone false — including one telling the next session that a decision was
still pending on an item accepted that morning. Resume context belongs in
[HANDOVER.md](HANDOVER.md), which is rewritten to match reality on every wake.
