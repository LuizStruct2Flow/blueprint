# TASK-018 — equivalence record and mutant catalogue for the signal / mic suites

**Five suites — `signal-set`, `wait-mic`, `session-resume`, `signal-dispatch`,
`baton-durability` — ported to TypeScript, and the port PROVEN faithful by
running both implementations over the same inputs and diffing their verdicts
mechanically.** Not by reading them side by side.

Ported by Matthias (Back-End-1) on 2026-09-11. Each spec's docblock points here
rather than restating any of it.

**This is a work-item folder and not a document, because the mutant catalogue has
to be TRACKED.** [PLAN-TASK-018.md](../PLAN-TASK-018.md) §5 requires it: *"Tracked
as a mutant catalog, not oral history. A suite that cannot fail on the defect it
exists for is theatre."* The first version of this lived in `.scratch/`, which is
gitignored AND `export-ignore`d — so the one artefact the rule names would have
vanished at the next checkout. [`code/`](code/) is the catalogue;
[`outputs/`](outputs/) is what it produced. The whole folder travels through
`doing/` → `waiting-acceptance/` → `done/` with the port.

---

## 1. Why the method is this and not review

"Ported faithfully" is a claim about behaviour, and reading two implementations
side by side checks the claim against the reader's attention rather than against
execution. This repo's own history says what that is worth:
`a2bp-contamination`'s headline assertion was dead for months and printed its
failure 28 times while exiting 0, and every review of it passed.

So each assertion is treated as a claim of the form *"defect D makes this check
go red"*, and the claim is tested by INJECTING D and running both
implementations:

| verdict | meaning |
|---|---|
| **agree** | both reached the same red set — faithful on that defect |
| **shell-only-red** | the port is LOOSER. A regression; fix the port |
| **port-only-red** | the port is STRICTER. Justify it by naming the defect, or it is a false positive |
| **both-green** | neither covers the injected defect. A real finding, and the class mutation testing structurally cannot find on its own |

[`code/build.sh`](code/build.sh) materialises a mutant root holding BOTH
implementations of one suite, [`code/mut.sh`](code/mut.sh) injects one defect, and
[`code/run.py`](code/run.py) runs both and compares. Run it as:

```bash
python3 docs/doing/TASK-018-EQUIVALENCE-mic/code/run.py [suite ...]
```

**A mutant root points both implementations at ITSELF, with nothing to configure.**
`tests/<suite>/test.sh` resolves `ROOT` from `dirname $0/../..`, and a spec
resolves `REPO_ROOT` the same way from `import.meta.url` — so placing both at
`<mutant>/tests/<suite>/` aims both at the mutant. No flag, no environment
variable, nothing to get wrong in the one place a mistake would invalidate the
whole exercise.

### Two traps hit on the way, both worth recording

**A mutation that matches nothing reads as a finding.** The first `mut.sh`
interpolated each anchor into a `perl -0pi -e` program, escaping it twice — once
for the shell, once for perl. Six mutants silently matched nothing, so both
implementations stayed green and the run reported them as *"neither
implementation covers this defect"*. A FABRICATED finding is worse than a missing
one. The escaping is gone rather than corrected: anchors come from quoted
heredocs and travel through the environment, and `sub` FAILS LOUDLY when a
substitution changes no bytes.

**A mutant can be repaired by the code it was injected into.** `b1`'s first form
set `SIGNAL_FILE="$ROOT/AGENT_SIGNAL.md"` at the watcher's startup, and both
implementations stayed green — because `refresh_signal_file()` re-resolves on
every tick and, seeing a different answer, MOVED the watcher back onto the
correct path. The BUG-019 migration fix silently repairing the BUG-019 defect.
True and useful, and not the historical state: before the split
`agent_signal_file` itself answered the tracked file, so startup, every refresh
and `signal-set.sh` all pointed there. Mutating the DERIVATION reddens `#1` and
`#2` in both.

---

## 2. The population

Per suite: three negative controls plus one mutant per distinct defect class
named by an assertion.

The controls are not ceremony. `c0-healthy` proves the comparison is not red for
an unrelated reason. `c1-defect-in-a-comment` appends the BUG-023 defect as PROSE
and `c2-benign-lookalike` appends a comment naming `git checkout -- .`,
`stash push`, `last_trigger_key`, `NR>n` and `head -1` — both must stay green in
both implementations, because an implementation that greps rather than executes
goes red on them. Not hypothetical: `tests/git-isolation:118` chose its
population by grepping COMMENTS, which is how BUG-047 survived.

| suite | trees | mutants |
|---|---|---|
| `signal-set` | 13 | refuse pipes · escape processing over the value · normalise only one input path · collapse repeated spaces · no boundary trim · mangle tabs · exceed the documented Unicode contract · rewrite the whole file · publish without a Task · swallow the failed journal append |
| `wait-mic` | 10 | compare rendered rows · an empty reading is a handoff · wake on the Task too · accept a partial reading · reject a rejoinable pipe · whitelist the State · never exit |
| `session-resume` | 13 | cry wolf on a healthy resume · warn and exit zero · take the first marker · order by timestamp · a missing marker is silent · rollback discards · report nothing · `--mark` does not stamp HANDOVER · stamp before the read-back · roll the window in two appends |
| `signal-dispatch` | 6 | no settle window · Task text is a round identity · the settle window never expires |
| `baton-durability` | 10 | watch the tracked file · journal derived from the root · seed written to the canonical path · resolve the baton once at startup · re-resolve past an explicit pin · clear the trigger key on a move · live rows in the tracked file |

---

## 3. The agreement table

Raw per-tree records in [`outputs/`](outputs/).

| suite | trees | agree | to explain |
|---|---|---|---|
| `signal-set` | 13 | 13 | — |
| `wait-mic` | 10 | 10 | — |
| `session-resume` | 13 | 12 | 1 · `s13`, PORT-ONLY-RED (BUG-079) |
| `signal-dispatch` | 6 | 6 | — |
| `baton-durability` | 10 | 9 | 1 · `b3`, PORT-ONLY-RED (BUG-084) |
| **total** | **52** | **50** | **2, both the port being stronger** |

**No SHELL-ONLY-RED anywhere.** There is no mutant in the population that the
shell suite catches and the port does not, which is the direction that would mean
a regression.

Multi-check red sets agree too, which is the part a reading could not have
established:

- `wait-mic/w1-compare-rendered-rows` reddens `#6, #8, #9, #10, #11, #13` in both;
- `signal-dispatch/d3-the-settle-window-never-expires` reddens all six in both;
- `session-resume/s9` reddens `#1, #2, #9, #11` in both, and `s4` reddens `#1, #3, #4`;
- `signal-set/m3e-no-boundary-trim` reddens `#3e, #3f, #3g` in both and leaves
  `#3h` green in both — the documented-Unicode-contract case correctly declining
  to move.

### One disagreement found and fixed BEFORE landing

`signal-set/m4-rewrite-the-whole-file` was PORT-ONLY-RED on the first run: the
shell suite reddened `#4`, the port reddened `#4` **and** `#6`. The port asserted
`toContain('\n| Holder | NEW |\n')` — a claim about the row's NEIGHBOUR rather
than about the row — where the shell asserted the line-anchored
`grep -q '^| Holder | NEW |$'`. A mutant that ate the surrounding prose therefore
tripped an unrelated case. Fixed by anchoring on the line in both `#4` and `#6`.

Worth recording for what it demonstrates: this was the port being stricter on an
axis nobody had DECIDED to be strict about, it would have read as a mysterious
cross-case failure the first time anyone edited the publisher's output, and no
amount of side-by-side reading was going to surface it.

---

## 4. The two real findings

Both are cases that were **green over the defect they exist to catch**, and
neither was reachable by reading. Both have bug rows in
[`../BUGS.md`](../BUGS.md).

### BUG-079 — Codex R8's fix never worked, and `#13` could not see that

`session-resume.sh --mark` rolled the replay window with
`printf '%s\n' "$roll"` on a two-line string, under a comment asserting *"a
single small `printf` to a file opened O_APPEND is one write(), and no other
appender can interleave inside it"*. **The premise is false: bash's `printf`
builtin flushes at every newline**, so strace shows two `write()` calls and the
gap Codex R8 identified was still open.

Measured both ways by [`code/probe-single-write.sh`](code/probe-single-write.sh)
and [`code/probe-r8.sh`](code/probe-r8.sh): `echo`, `printf '%s\n%s\n'` and even
coreutils `/usr/bin/printf` all split the same way, and only a heredoc fed to
`cat` is one write; with a competing appender at ~170 kHz over 60 marks, **36
events landed between a close marker and the next open in the UNMODIFIED script,
0 after the fix.**

Why nothing noticed is the more useful half: `#13` drove the race with a full
`bash signal-set.sh` per flip — about 33 Hz against a gap of microseconds — so
the mutant that reverts the fix left BOTH implementations green. The case
asserted a race it could not provoke.

Fixed in `scripts/session-resume.sh` and in the port's `#13`, whose appender is
now the one `printf >>` that `signal-set.sh` actually contributes, issued
directly. The shell runner keeps its slow flipper, which is why `s13` is
PORT-ONLY-RED.

### BUG-084 — `baton-durability` #5 samples for 6 ms against a 32 ms publication

`#5` (Codex F4) proves first creation is atomic: that a poller can never read the
default `Holder=Nobody` seed at the canonical path. Its sampler is
`for _ in $(seq 1 400)`, and every iteration short-circuits on `[ -f "$abaton" ]`
while the file does not exist yet — so the loop is **bounded by an iteration
count rather than by the subject** and finishes before `signal-set.sh` has got
going. [`code/probe-f4-sampler.sh`](code/probe-f4-sampler.sh), with the defect
injected:

```
sampler: ran 0.006s, 0 of 400 iterations saw a file at all
publisher: took 0.032s
mode=mutant verdict=MISSED the seed
```

The case would pass with the seed sitting at the canonical path for a full
second. The port's sampler loops `while (!publisher.exited)` — bounded by the
SUBJECT — which is why `b3` is PORT-ONLY-RED.

---

## 5. What neither implementation covers

Recorded rather than quietly left out. None of these is closed by this port.

1. **`wait-mic` #3 — "a neighbouring file changing is not a handoff" — has no
   mutant.** The defect it guards is a waiter keyed on the DIRECTORY rather than
   on the baton's content, and `wait-mic.sh` has no directory watch to break:
   injecting one means writing a different script, not perturbing this one. So #3
   is a case whose ability to fail is asserted by construction and not by
   execution, in both implementations. Cheap to close if the waiter ever regains
   an inotify path — which is how it started, and why the case exists.

2. **No mutant reaches `signal-set` #1's "not truncated at the pipe" clause
   separately from its "escaped" clause.** `m1` and `m2` between them redden #1
   and #2, but the specific historical failure — the cell surviving escaping and
   then being cut at the pipe by `awk -v` — is reached only through #2's mutant.
   The clause is covered as part of a pair rather than on its own.

3. **`baton-durability` #2 has no mutant that reddens it alone.** It goes red
   with `b1`, which is the derivation defect, and under the current design no
   perturbation of the SCRIPTS can make `git switch` rewrite an untracked baton.
   #2 asserts a property of the DESIGN rather than of any code path, which is
   worth knowing about a case that reads like a behavioural one.

4. **The equivalence run's own canary is aimed at the MUTANT, not the real repo.**
   A spec inside a mutant root computes `REPO_ROOT` as the mutant, so
   `RealStateCanary` watches the mutant's (absent) baton, journal and feed. A
   fixture that leaked into the OPERATOR's live state during these 52 runs would
   not have been caught by the canary — only by the same specs run over the real
   tree, which is how they actually execute. Stated because "the canary was
   watching" would be false for these runs specifically.

---

## 6. Did `signal-dispatch` keep its timing shape?

Yes, and the shape is the point rather than the number. What took it from 125.4 s
to ~33 s was **every wait expressed in settle units, and each watcher stopped as
soon as its assertion was decidable** — not a shorter timeout. Both survive:

- `tests/harness/watcher.ts` holds a long-lived subject as a HANDLE, so a case
  ends when it can decide rather than when a `timeout` fires. The old `run_watch`
  started an infinite watcher under `timeout N` and discarded the status, which
  is why six bounds summed to exactly the runtime.
- `SETTLE` stays an INTEGER 2 seconds, for the reason the shell header records:
  the watcher compares `date +%s`, so a sub-second settle straddles a second
  boundary and dispatches a stale Task on ~40% of runs, independent of load.
- `AGENT_SIGNAL_SETTLE` and `AGENT_WAIT_MIC_POLL` are now declared `'opaque'` in
  `tests/harness/env.ts` and therefore SCRUBBED, so an operator with either set
  in their shell cannot silently change what a timing test measures.

Measured, same host, same session (healthy tree, `c0` rows in
[`outputs/`](outputs/)):

| suite | shell | TypeScript |
|---|---|---|
| `signal-set` | 0.3 s | 1.2 s |
| `wait-mic` | 17.0 s | 3.7 s |
| `session-resume` | 1.7 s | 3.1 s |
| `signal-dispatch` | 32.3 s | 32.1 s |
| `baton-durability` | 27.0 s | 11.8 s |
| **total** | **78.3 s** | **51.9 s** |

The TypeScript column here is a whole `vitest` process per suite, so it carries
~0.9 s of startup each. Run as one process — which is how the gate runs them
(`scripts/run-ts-suites.sh`) — all five together are **52.7 s for 55 cases**, and
that number will fall again when `fileParallelism` goes to `true` (TASK-018-TARGET
§1.2), which the isolation these specs were written to needs no exception from.

The two suites that got faster did so for different reasons, and only one of them
is about the language: `baton-durability` dropped 27.0 s → 11.8 s because its
cases stop when decidable rather than waiting out a `timeout`, and `wait-mic`
dropped 17.0 s → 3.7 s because its eight negative cases stop after six counted
poll iterations instead of a fixed `timeout 1` each. `signal-dispatch` is flat,
because it was already built that way — which is the point.

### And R4 made three sleeps SOUNDER, not merely faster

The shell suites had waits they could not express as conditions, so they slept.
Every one is now counted in the SUBJECT'S OWN poll iterations, made observable by
a `sleep` shim ahead of the real one on PATH — each of these scripts calls
`sleep` exactly once per loop iteration (`wait-mic.sh:148`,
`codex-signal-watch.sh:343`), and the shim EXECS the real `sleep`, so the subject
is observed rather than altered.

That is strictly stronger than what it replaces, for the reason the sleeps were
never quite sound: **`sleep 2.4` guarantees that 2.4 s passed, not that the
watcher LOOKED at anything during it.** On a stalled host the shell's `quiet()`
could elapse with the watcher having polled zero times, and the negative
assertion would be vacuous — green, while checking nothing. An iteration count
cannot be vacuous, and load cannot shorten it either: N iterations take at least
N·poll seconds by construction, so every bound here is at least the wall-clock
bound it replaces.

The same mechanism removes the one wait that was a genuine RACE rather than a
budget. `wait-mic`'s `sleep 0.5` before each perturbation existed because the
waiter captures its baseline reading at startup, and perturbing first makes it
adopt the new value as its baseline and correctly never fire; "one completed
iteration" is that precondition stated as a fact. `baton-durability` #1's
`sleep 2` inside an 8 s settle window becomes "the watcher has observed the
OVER_TO_CODEX baton", which is what "inside the window" actually requires — and
its overshoot DETECTION is kept, because an iteration count bounds observations
and not wall-clock.

---

## 7. Where `baton-durability` #0 went

`#0` — "the real baton and journal are byte-identical; no fixture reached live
state" — is the one check in this port that MOVES rather than being restated, and
it is worth being explicit because "we deleted the isolation assertion" is the
wrong reading.

`tests/harness/canary.ts` runs exactly that comparison at the end of EVERY
scenario in EVERY suite, over the baton, the journal, the activity feed and
`.git/config`. It also carries the discrimination the shell version could not:
**BUG-068** — a baton change WITH a matching `signal-history.log` append is a
concurrent agent legitimately flipping the mic through `signal-set.sh` and is
REPORTED as a `CANARY-NOTE:`; a baton change with NO append is BUG-030's clobber
and FAILS. Five agents work in this repo at once, so the live baton genuinely
changes under a test run, and the pre-BUG-068 guard could not tell the two apart.

That discrimination is pinned by four cases in `tests/harness/harness.spec.ts`
rather than here, which is where it belongs: the check lives in the harness, so
its non-vacuity proof lives with it. A copy in this suite would be the second
description R1 exists to refuse — and it would be the one that drifts, because it
is not the one that runs.

The same is true of the two `unset` blocks at the head of every one of these
shell suites, each of which was one forgotten line away from being BUG-046 or
BUG-047. They are `tests/harness/env.ts` now, which offers no way to obtain an
environment that carries them.

---

## 8. Retirement

**Not done here, deliberately.** All five shell runners stay on disk and stay
invoked by `.githooks/pre-push-project` and `.github/workflows/security.yml`.
Retirement is one consolidated central pass once every group reports, because
every retirement edits the same two shared files and four whole-file clobbers
happened on 2026-09-11 from agents writing shared files off stale reads.

Running both briefly is also how BUG-079 and BUG-084 were found.

Ready to retire, on this evidence: **all five.**
