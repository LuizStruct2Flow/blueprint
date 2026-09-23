# findings.md — cross-provider review findings tracked over time

Findings raised by a review (Codex, Gemini, a scanner, a human) that do **not**
get a row in `BUGS.md` — either because they were investigated and did not hold,
or because they are accepted risk with a documented re-open trigger.

**A finding that is silently dropped looks identical to one that got missed**,
and the next review raises it again. Every finding leaves a row here — most of
all the ones that turned out to be wrong.

---

## F-001 — `run-ts-suites.sh`'s failure report aborts the gate

**Raised by** Codex, 2026-09-10, against `scripts/run-ts-suites.sh:165,173`.
Two mechanisms: a zero-match `grep` returns 1, and >40 matching lines may
SIGPIPE `grep` to 141. Under the hook's `set -e` plus `pipefail`, either kills
the function before the per-suite reports and `pipe_batch_end`, truncating the
outer gate and its summary.

**Verdict: DOES NOT HOLD.** The abort requires `pipefail`, which is set nowhere
on the path. Investigated by Vitali (QA-1) on `task-018-ts-test-harness`.

**Evidence.** Every shell option on the whole sourced chain:

    $ grep -n '^[[:space:]]*set -\|pipefail' \
        scripts/lib/suites.sh scripts/lib/pipeline.sh \
        .githooks/pre-push .githooks/pre-push-project scripts/run-ts-suites.sh
    .githooks/pre-push:26:set -e
    scripts/lib/pipeline.sh:446:  set -f      # restored at :449
    scripts/lib/pipeline.sh:448:  set --      # positional args, not an option

`/bin/sh` is dash. `.githooks/pre-push` sources `pre-push-project` into the same
shell and calls `ts_suites_stage` at `:886`, which sits inside the
`BLUEPRINT:BEGIN`/`:END` region (lines 2-890) — so a derived project's own
`set -o pipefail`, which can only go *below* the end marker, runs after the
bridge has already finished. Without `pipefail` the pipeline reports `head`'s
status, which is 0.

**Measured through the real bridge**, stubbed `npx` exiting 1:

| npx output | gate output | per-suite stage | summary |
|---|---|---|---|
| 0 matching lines | 23 lines | rendered | rendered |
| 500 matching lines | 63 lines | rendered | rendered |

**Counterfactual, same fixture with `pipefail` added:** 0 matches collapses to a
single line with no stages and no summary — mechanism #1 is real *given* the
precondition. 500 matches still renders, because they fit the 64 KB pipe buffer.
Reaching 141 needed ~1.6 MB of matching output, so mechanism #2 needs `pipefail`
*and* a very large match volume.

Repro: `.scratch/bug-grep/real.sh`, run with and without `PIPEFAIL=1`.

**Hardened anyway** (TASK-018, deliberately not a bug row): a `|| true` on that
pipeline. The argument is ownership, not defect — `run-ts-suites.sh` is a
sourced library and does not own its caller's shell options, and this file has
twice been burned by reasoning about what its caller does rather than what it
could do. No regression test: a case asserting the absence of `pipefail` in a
managed file that nobody proposes to change can never go red, which is the shape
TASK-018-RULES R7 forbids.

**Re-open if** a caller of `ts_suites_stage` is added outside the managed region
of `.githooks/pre-push-project`, or if any gate file on that chain adopts
`pipefail`.

---

## F-002 — the recurring shape: a check that infers a property from a proxy that is satisfiable without it

**Raised by** Eto (Orchestrator), 2026-09-10, from eight instances found within one
week. Not a bug row: there is no single site to fix. It is a claim about how
checks in this repo get written, recorded so the sixth instance is recognised as
the sixth rather than investigated as a novelty.

**The instances**, each already rowed on its own:

| Item | The check | What it actually tested | What it was read as |
|---|---|---|---|
| BUG-004 | the hook file exists | a file exists | the hook runs |
| A-22 | `core.hooksPath` unexamined | nothing | the gate is armed |
| BUG-035 | semgrep exits 0 | a JS/TS ruleset found no JS/TS | the OWASP top-10 are covered |
| BUG-066 | `grep` the hook's text for `bash tests/<suite>/…` | the text mentions the suite | the suite is invoked |
| BUG-067 | `feed_is_running` after `setsid` | the lock is held **by anyone** | my child started |
| BUG-068 | `console.warn` emitted the note | a string was written to a buffer | the operator sees it |
| — (found 2026-09-11) | `grep -rqE 'BUG-0*NN\b' tests/` | the pattern is absent **or the file looks binary** | no test names this bug |
| BUG-144 (round 3) | `tests/mic-recovery` writing AGENT_ROSTER.md beside the fixture baton and asserting against it | the recovery works against a roster placed next to the baton | the recovery works against the roster's real location (the repo root, two directories away from the real baton) |

**The shape.** Each check tests a **proxy** for the property it is trusted to
establish, and in each case the proxy is satisfiable **without** the property. The
gap is never visible at the call site, because the proxy's name reads like the
property: `feed_is_running`, `suite absent`, a green SAST stage.

**The part that makes it expensive is the direction of failure.** In all six, the
unknown case resolves toward **pass**. A guard that cannot tell says "fine". So
the failure is not merely undetected — it is actively vouched for, with the full
credibility of a green gate. `BUG-066` is the extreme: a push landed with 47 of 51
stages skipped and the gate printed `PASSED`.

**Two questions that would have caught all eight**, and they are cheap enough to
ask every time a check is written:

1. **What else satisfies this predicate?** If anything other than the property
   does, it is a proxy, and the check is worth exactly the strength of the
   correlation.
2. **Which way does it fail when the answer is unknown?** A control must fail
   toward *blocked*. If "I could not tell" and "it is fine" produce the same
   output, there is no control — CLAUDE.md §"Pre-push tolerance" already says this
   about coverage, and the same sentence applies to every guard in the tree.

**Not a rule proposal yet.** Per §"The blueprint is derived, not designed", this
wants to prove itself before it becomes doctrine — the honest test is whether the
next few guards written after this entry avoid the shape. Recorded now because
six instances in a week is the evidence, and it will be harder to reconstruct
later.

**The sixth landed the same day, while the fifth was being fixed**, and it is the
first one found by someone *looking* for the shape rather than tripping over it.
BUG-068's canary reports a legitimate concurrent mic flip instead of failing on
it. The report was a `console.warn` — and `run-ts-suites.sh` captures vitest's
output to a temp file it deletes unless `rc != 0`. The witnessed verdict is a
**pass**. So on exactly the run where the note matters, it was being thrown away.
"A warning was emitted" read as "the operator sees it", failing toward *we
reported it*. Caught before landing, by asking question 1 of a report path rather
than of a guard — which is the wider reading: **this applies to anything that
vouches, not only to things that block.**

**Instance eight inverts the direction, and that is why it belongs here.** A
literal NUL byte got into `tests/a2bp-request/a2bp-request.spec.ts` (found by
Andreas, Back-End-2, during the a2bp port). `grep` classifies a file containing NUL
as binary and prints **nothing at all** — no match, no error, and an exit status
indistinguishable from "the pattern is not there". DoD §2's check is
`grep -rqE "BUG-0*NN\b" tests/`, so it would have reported the bug **untested with
its test sitting in the file**.

Every earlier instance fails toward *pass*. This one fails toward a confident false
**negative** — the gate does not crash, it produces a specific, plausible,
actionable, wrong answer. That reads as the gate working, which makes it harder to
catch than a silent pass, not easier. So the shape is not "guards are too
permissive"; it is **a check whose failure mode is indistinguishable from its
working mode**, and permissiveness was only ever the most common way that happens.

Cheap to close where it matters: `grep -a` treats binary as text. Worth doing in
the DoD gate regardless of whether a NUL ever recurs, because the cost is one flag
and the failure is unfalsifiable from the output.

**Re-open / promote when** the BUG-066 and BUG-067 fixes are both in and someone
can say whether the two questions would have been enough. At that point it belongs
in CLAUDE.md, not here — six instances is past the point where the blueprint's
"prove it downstream first" rule is asking for more evidence rather than for
someone to write it down.

---

## F-003 — the bridge's only non-vitest assertion is gone, and the loss is accepted

**Closes TASK-023**, which sat in `docs/backlog/BACKLOG.md` as `KEEP` from
2026-09-10. Accepted by the founder on **2026-09-16**, deciding TASK-047
(*"migrate the tests to be spec driven ts tests, we don't need exceptions"*):
accept the loss on the record rather than keep a rule with a silent exception.

**What is gone.** `tests/ts-bridge/test.sh`, retired in `da73f36` along with its
`ts-bridge · BUG-055` stage in `.githooks/pre-push-project` and its CI job. It
was the only assertion about the vitest bridge **not executed by the vitest that
bridge starts**. Two properties went with it, and neither could survive a port,
which is why this is a decision and not a migration:

- **A silently dead bridge now produces no red case.** If the bridge stops
  running, the spec that would report it does not run either. That is the exact
  failure mode BUG-055 had — an absence, not an error.
- **The no-toolchain property is unassertable.** `tests/manifest`'s retired #9
  re-ran the control with `node`, `npm`, `npx`, `tsc` and `vitest` poisoned, so
  the thing checking whether the toolchain ships did not depend on it. A vitest
  spec cannot make that claim about itself.

**What stands in its place, stated as weaker.** Its assertions live on in
`tests/ts-bridge/ts-bridge.spec.ts` (#0, #1/#1c, #1b, #1d, #1e, #2/#2b/#2c, with
a measured equivalence record), and `scripts/run-ts-suites.sh` BLOCKS rather than
skips when `npx` or `tests/node_modules` is absent — so a toolchain-less checkout
gets no answer and no push instead of a wrong answer it believes. That makes the
absence loud; it does not prove independence.

**The partial mitigation that remains:** `tests/bootstrap-gate` #2/#3 runs a
bootstrapped project's entire gate as a subprocess and requires >= 25 stages, so
a bridge dying silently inside that inner gate still truncates the stage list and
turns a case red. What is unobservable is a failure that takes the outer run down
too.

**Re-open when** an assertion about the toolchain's own shipping boundary is
needed again — that is the condition TASK-023 named, and it is now a deliberate
gap rather than an oversight. Restoring it means accepting a second runner kind,
which is a founder decision, not an agent's.

---

## F-004 — A-13 (the privacy block never updates) is absorbed by TASK-048

**Cancelled as a backlog row, 2026-09-16**, and pointed here so it is not raised
a third time. A-13 recorded that `.gitignore` is **not** in `MANAGED_FILES` while
its privacy block told the reader not to edit between the blueprint markers
"because they'd come back on next sync" — an instruction describing a mechanism
that does not exist, so a derived project's privacy block silently never updated.

**Where it went: TASK-048**, which covers the same ground and more. That work
removes the six methodology files from the block, replaces the block's comment
rather than deleting it, updates `docs/PUBLISHING.md` in the same commit, and —
the part A-13 was actually about — ships the instruction that **existing**
projects must run themselves, because a blueprint edit to a seeded-not-managed
file reaches new projects only.

**Not a verdict on the finding.** A-13 was right, and its mechanism claim is
still true: nothing syncs `.gitignore`. It is cancelled because two live records
of one fact drift, which is the reason `INDEX.md` went (TASK-005) and the reason
this register exists at all.

**Re-open when** `.gitignore` becomes managed, or when a project reports its
privacy block diverging from the blueprint's in a way TASK-048's instruction did
not fix.

---

## F-005 — eight review-found bugs and TASK-024 cancelled as known limits

**Cancelled 2026-09-16, founder-approved** (TASK-058), under docs/DoD.md §1b rule 4:
a finding becomes work only if it is real and practical. Each is recorded here
as a known limit, not a verdict that the observation was wrong.

- **BUG-069** — the DoD gate's baton check reads Holder, State and Task, while its comment says four rows (`Last update` is not checked).
- **BUG-070** — the DoD stages pass silently when the push range is empty; a real `git push` always supplies ref lines.
- **BUG-087** — `tests/git-isolation`'s `new-project.sh` pattern misses path-qualified calls; no suite remains that could contain one.
- **BUG-091** — a same-size roster edit within the same second is not seen by a running feed (whole-second mtime).
- **BUG-092** — nothing renders the label the Codex launcher actually prints; the spec greps the launcher source.
- **BUG-094** — four `agent-activity-bound` assertions cannot fail on the defect they are named for; they are pinned.
- **BUG-101** — assertions in `proc-cwd` and `commit-msg-gate` without their own negative proof remain pinned, not fixed.
- **BUG-108** — an unreachable remote skips a2bp's immediate pre-push base re-check; the push itself fails right after.
- **TASK-024** — the procedure/skills layer. It was blocked on TASK-021 and is process about process, which the founder judged the circle to stop.

**Re-open when** one of these is observed causing a wrong result in real use
(a wrong gate verdict, a lost feed line, a wrong a2bp base), not when a review
re-derives it.
