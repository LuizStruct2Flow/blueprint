# PLAN-TASK-018-RETIREMENT — the consolidated shell-runner retirement pass

**Status:** EXECUTED 2026-09-11 by Timon (Front-End-1). Written 2026-09-11 by
Klaus (PO) while two cross-provider reviews were still running.

**What was executed, and the two places reality differed from the plan:**

* §3 steps 1-3 landed separately as BUG-109 / BUG-088 before this pass began.
  Steps 4-6 landed as ONE commit, as §3 step 6 requires.
* **35 runners retired, not 36.** `tests/ts-bridge/test.sh` is held back per §7,
  so its runner, its gate stage and its CI line all remain. The CI
  `shell-tests` step was therefore REWRITTEN to that one line rather than
  deleted, which is the one mechanical difference from §5's simulation script.
* **§8's 300_000 was not taken on this document's word**, as §8 itself
  instructs. See the `testTimeout` commit for the re-measured number.
* **§10's ~427 s did not hold on this machine.** See the measured figures
  recorded with the gate run; the DELTA §10 calls the reliable part did.

**Everything below marked MEASURED was run.** Every simulation ran in a
scratchpad copy of this tree (`/tmp/.../scratchpad/retired2`), never in the
repo. No `test.sh`, hook or workflow in this checkout was touched.

---

## 0. The one-paragraph summary

Thirty-six shell runner FILES (not 35 — §2) retire, together with 36
`pipe_stage`/`pipe_skip` pairs in `.githooks/pre-push-project` and one CI step in
`.github/workflows/security.yml`. The retirement is not a pure deletion: a
scratchpad simulation of the finished state fails **six** controls, all of them
green today and all of them red the moment the wave lands. Those six fixes go in
FIRST, each provable on today's tree. Only then is the deletion itself a single
atomic commit — atomic because `tests/manifest` #4/#5 make any half-state red by
construction, which is the property that makes this pass safe to run and trivial
to roll back.

**Measured outcome:** the gate goes from **~796 s to ~427 s** (§10), and
`testTimeout` comes down from `600_000` to `300_000` on a measured
`bootstrap-gate` #2/#3 of **199.6 s**, down from **374.5 s** (§8).

---

## 1. THE SIX BLOCKERS — measured, not reasoned

A copy of this working tree was taken (`rsync`, then `git init` + the real repo's
tracked-file list force-added, so the gitignored-but-tracked files such as
`scripts/new-project.sh` are present), all 36 shell runners deleted, their 36 gate
blocks replaced with retirement comments (no `[ -f ]` guard), the CI shell step
removed, and `tests/helpers/sed-inplace.sh` deleted. The full vitest suite was
then run over that tree.

```
Test Files  7 failed | 43 passed (50)
     Tests  10 failed | 698 passed (708)
```

**Six suites go red for real reasons. Nothing else does.** The seventh,
`bootstrap-gate`, is downstream: its #2/#3 and #6 fail because the six below are
red *inside* the derived project's own gate, and its #3c/#4 are artefacts of the
`tests/node_modules` symlink the simulation used. Fix the six and `bootstrap-gate`
recovers with them.

The first four were found by reading; **B5 and B6 were found only by running the
simulation**, and B6 in particular is unreachable by grepping code.

### B1 — `tests/manifest` #1b orphans a helper that is still alive

```
FAIL: #1b shared helpers that no suite sources: proc-cwd.sh
```

`manifest.ts`'s `walk()` collects **only `*.sh`** files (and skips the `helpers`
directory entirely) when asking "is this helper sourced by anything?". After the
wave, `tests/helpers/proc-cwd.sh`'s only remaining consumers are TypeScript:

- `tests/helpers/feed-fixture.ts:301` — sources the shipped helper and calls
  `bp_proc_cwd_available` / `bp_proc_cwd` (BUG-089's fail-open guard);
- `tests/proc-cwd/proc-cwd.spec.ts:183` — drives the shipped helper directly.

The helper is **not dead**. The check simply cannot see a TypeScript consumer.

**Fix:** widen the scan to `*.ts` as well as `*.sh`, and include the helpers
directory *for `.ts` files only*. Keeping `.sh` files in that directory excluded
preserves the property the exclusion exists for — a helper's own header naming
itself must not satisfy the check.

### B2 — `tests/git-isolation` #3's terminal branch is the same booby trap BUG-088 is about, one level up

```
AssertionError: no shell suites remain under tests/, so this control has nothing
left to check and should be deleted (TASK-018-TARGET §4):
expected [ 'helpers/proc-cwd.sh' ] to deeply equal []
```

The port replaced the two magic-number floors with an explicit assertion for the
end state: when the git-driving population empties, assert that **no `.sh`
remains under `tests/` at all**. But `scanGitIsolation` walks `tests/<dir>/*.sh`,
and `tests/helpers/` is a directory under `tests/`. `proc-cwd.sh` is therefore
*considered*; it does not drive git (MEASURED: neither helper matches
`DRIVES_GIT`), so it is not a *member*; population is zero and the terminal
assertion fires on a file that is alive and correct.

**Fix (recommended, one edit):** state the end state positively instead of as an
empty-directory claim — when the population empties, assert every
`DECLARED_ANCHOR` now owns a `*.spec.ts`. That is non-vacuous, it says the
migration COMPLETED rather than that the directory is empty, and it survives
both a live shell helper and a deliberately-retained runner (§7).

**Alternative the spec's own header prefers:** dissolve `tests/git-isolation/`
entirely. Rejected for this pass — it would take `#2` ("the pre-push hook unsets
GIT_DIR") with it, which is an assertion about a live hook and has nothing to do
with shell suites. Dissolving a control is a founder decision, not a side effect
of a retirement pass.

### B3 — `tests/live-state-canary` #4 reads three files this wave deletes

`live-state-canary.spec.ts:158-162` asserts structurally that three disarm
conjuncts are gone, by `readFile`-ing `tests/baton-durability/test.sh`,
`tests/pipeline/test.sh` and `tests/watcher-liveness/test.sh`. All three are
deleted → ENOENT → red.

**Fix:** the case's subject is deleted with the files, so the case dissolves.
Delete the `it()` and record the dissolution in the spec header, following the
`drift-in-blueprint` precedent (§4). Do NOT make it iterate over "whatever `.sh`
still exist" — that is a vacuous pass wearing the old name.

### B4 — `tests/bootstrap-contents` #3b probes for a deleted runner

`bootstrap-contents.spec.ts:232` lists `'tests/marker-merge/test.sh'` among the
files a derived project must have received.

**Fix:** one token — `'tests/marker-merge/marker-merge.spec.ts'`. The case is a
"did `tests/` arrive downstream" probe; any shipping runner in that suite serves.

### B5 — `tests/state-root` #F's non-vacuity anchors are all shell fixtures

```
AssertionError: #F no longer scans state-dir, whose fixture needs a terminator:
expected [] to include 'state-dir'
```

`state-root.spec.ts` #F scans every `tests/<suite>/test.sh` for a project-shaped
fixture constructor (`mkdir -p "$X/scripts…"`) and asserts each one writes a root
terminator. Its non-vacuity guard names four anchors — `state-dir`,
`watcher-liveness`, `agent-activity-bound`, `subagent-feed` — all four of which
are shell runners this wave deletes. `inScope` is then empty and all four
assertions fail.

The case's own code already states the end condition, in the `catch` on the
`readFile`: *"TypeScript suites use the harness, which owns isolation."* With no
`.sh` left, every suite takes that branch and the scan has nothing to scan.

**Fix:** the case dissolves with its subject. Delete the `it()` and record why in
the spec header, same as B3. Do NOT weaken the anchor list to keep it green —
that converts a real non-vacuity guard into a vacuous pass, which is the exact
trade §"Pre-push tolerance" exists to refuse.

### B6 — eight `docs/` links point at deleted runners

```
FAIL doc-links THE REAL TREE — every relative link under docs/ resolves
  docs/DoD.md            -> ../tests/lifecycle-docs/test.sh   (×2)
  docs/DoD.md            -> ../tests/doc-links/test.sh
  docs/done/BUGS.md      -> ../../tests/roster/test.sh
  docs/done/BUGS.md      -> ../../tests/env-namespace/test.sh
  docs/done/BUGS.md      -> ../../tests/git-isolation/test.sh
  docs/done/BUGS.md      -> ../../tests/codex-persona-label/test.sh
  docs/done/BUGS.md      -> ../../tests/watcher-liveness/test.sh
```

`tests/doc-links` resolves every relative link under `docs/` and blocks the push
on a broken one. **This is the blocker no amount of reading the test tree would
have found** — the references are markdown hrefs in prose, five of them in
`docs/done/BUGS.md`, which is user-accepted history nobody expected this wave to
touch.

**Fix, and it is the drift-proof one rather than the minimal one:** point each
href at the suite DIRECTORY, not at a runner file. Every one of the eight already
*labels* itself with the directory — the visible text is
`tests/lifecycle-docs/` while the href says `../tests/lifecycle-docs/test.sh` —
so the label does not change, and the link stops naming a file that any future
port can move. (Written out rather than shown as markdown on purpose: a link
example inside this plan is a link `tests/doc-links` would try to resolve.)
Editing `docs/done/` is legitimate here: a broken link in accepted history is
still a broken link, and the row's claim ("regression: this suite") stays true.

---

## 2. THE INVENTORY — three things per suite, and how they were told apart

`.githooks/pre-push-project` holds **86 textual occurrences** of
`pipe_stage`/`pipe_skip`. They decompose as:

| kind | count | how it was identified |
|---|---|---|
| `pipe_stage "…"` calls | **40** | `grep -c 'pipe_stage "'` — every one is a call; the four prose mentions say `pipe_stage_report` or "a `pipe_stage` block", with no following quote |
| `pipe_skip "…"` — calls | **38** | `grep -c 'pipe_skip "'` returns 40, but lines 442 and 460 are the `drift-in-blueprint` / `manifest` retirement comments, which quote the string `pipe_skip "suite absent"` |
| prose mentions | **8** | lines 44, 49, 437, 442, 446, 453, 460, 824 |
| **total** | **86** | 40 + 38 + 8 |

Of the 78 calls:

- **72 belong to the retiring shell runners** — 36 `pipe_stage` + 36 `pipe_skip`,
  one matched pair per runner. They were identified NOT by name but by the
  `if [ -f tests/<suite>/<runner>.sh ]; then … pipe_skip "…" "suite absent"; fi`
  block shape: `grep -n 'bash tests/'` in the hook returns exactly 36 distinct
  runner paths, and each sits inside exactly one such block. The
  §5 removal script matches that block regex and reports `36 matched, 0 unmatched`
  against the 36 runners found on disk — the two lists are derived independently
  and reconciled, which is what makes the mapping a check rather than a reading.
- **5 belong to the DoD checklist** (lines 842, 845, 848, 851 + the 857 skip).
  Not suites: they invoke `dod_stage_*` functions from `scripts/lib/dod-gate.sh`.
  **They stay.**
- **1 belongs to the vitest bridge** (line 888's `pipe_skip`, paired with
  `ts_suites_stage` at 887, which is a function call rather than a `pipe_stage`).
  **It stays — it is what runs the replacement.**

**No TypeScript suite has a `pipe_stage` block of its own.** Every TS suite is
rendered by `pipe_stage_report` from inside `scripts/run-ts-suites.sh`. So the
partition is clean: a `pipe_stage` block naming a `tests/**/*.sh` path is
retiring; everything else is not.

### It is 36 runner files, not 35

`grep`ing the tree finds **36** `*.sh` under `tests/<suite>/`, not 35:

- 35 × `tests/<suite>/test.sh`
- 1 × `tests/staleness/drift-integration.sh` — a second runner in the
  `staleness` suite, with its own gate stage (`"staleness probe"`) and its own CI
  line.

`tests/staleness/staleness.spec.ts` ports **both** (`#1`–`#9` from `test.sh`,
`D#1`–`D#5` from `drift-integration.sh`), so both retire. "35 suites" is right;
"35 files" is not, and the gate wiring is per FILE.

Two further files under `tests/*/*.sh` are **helpers, not runners**, and the
`suites.sh` derivation exempts them by name:

- `tests/helpers/proc-cwd.sh` — **STAYS** (B1: live TypeScript consumers).
- `tests/helpers/sed-inplace.sh` — **DELETE**. MEASURED: its only consumers are
  `tests/session-resume/test.sh` and `tests/roster/test.sh`, both retiring.
  Nothing in `*.ts` references it. Leaving it makes #1b red for a real reason.

### The full three-way table

All 36 rows have all three columns present today, verified by cross-referencing
`find tests -name '*.sh'`, `grep -n 'bash tests/' .githooks/pre-push-project`
and `grep -n 'tests/' .github/workflows/security.yml`:

| # | runner file | gate stage label | CI line |
|---|---|---|---|
| 1 | `tests/a2bp-build/test.sh` | `a2bp-build · FEATURE-001` | ✓ |
| 2 | `tests/a2bp-contamination/test.sh` | `a2bp-contamination · A-07` | ✓ |
| 3 | `tests/a2bp-e2e/test.sh` | `a2bp-e2e · FEATURE-001` | ✓ |
| 4 | `tests/a2bp-inputs/test.sh` | `a2bp-inputs · FEATURE-001` | ✓ |
| 5 | `tests/a2bp-pr-filing/test.sh` | `a2bp-pr-filing · BUG-011` | ✓ |
| 6 | `tests/a2bp-request/test.sh` | `a2bp-request · FEATURE-001` | ✓ |
| 7 | `tests/agent-activity-bound/test.sh` | `agent-activity-bound · BUG-001` | ✓ |
| 8 | `tests/baton-durability/test.sh` | `baton-durability · BUG-019` | ✓ |
| 9 | `tests/codex-persona-label/test.sh` | `codex-persona-label · BUG-021` | ✓ |
| 10 | `tests/commit-msg-gate/test.sh` | `commit-msg-gate · TASK-002` | ✓ |
| 11 | `tests/commit-subjects/test.sh` | `commit-subjects · TASK-002` | ✓ |
| 12 | `tests/doc-links/test.sh` | `doc-links` | ✓ |
| 13 | `tests/dod-gate/test.sh` | `dod-gate · TASK-007` | ✓ |
| 14 | `tests/env-namespace/test.sh` | `env-namespace · BUG-006` | ✓ |
| 15 | `tests/gate-arming/test.sh` | `gate-arming · BUG-004` | ✓ |
| 16 | `tests/git-isolation/test.sh` | `git-isolation · BUG-014` | ✓ |
| 17 | `tests/lifecycle-docs/test.sh` | `lifecycle-docs` | ✓ |
| 18 | `tests/marker-merge/test.sh` | `marker-merge` | ✓ |
| 19 | `tests/no-chain-guard/test.sh` | `no-chain-guard` | ✓ |
| 20 | `tests/pipeline/test.sh` | `pipeline · FEATURE-002` | ✓ |
| 21 | `tests/pre-push-scanners/test.sh` | `pre-push-scanners · BUG-003` | ✓ |
| 22 | `tests/pre-push-secrets/test.sh` | `pre-push-secrets · A-03` | ✓ |
| 23 | `tests/proc-cwd/test.sh` | `proc-cwd · BUG-036` | ✓ |
| 24 | `tests/pull-behaviour/test.sh` | `pull-behaviour · BUG-016/018` | ✓ |
| 25 | `tests/roster/test.sh` | `roster · BUG-010` | ✓ |
| 26 | `tests/session-resume/test.sh` | `session-resume · FEATURE-003` | ✓ |
| 27 | `tests/signal-dispatch/test.sh` | `signal-dispatch` | ✓ (`SIGNAL_TEST_SETTLE=3`) |
| 28 | `tests/signal-set/test.sh` | `signal-set` | ✓ |
| 29 | `tests/staleness/test.sh` | `staleness` | ✓ |
| 30 | `tests/staleness/drift-integration.sh` | `staleness probe` | ✓ |
| 31 | `tests/state-dir/test.sh` | `state-dir · A-09` | ✓ |
| 32 | `tests/subagent-feed/test.sh` | `subagent-feed · BUG-027` | ✓ |
| 33 | `tests/suite-sync/test.sh` | `suite-sync · BUG-029` | ✓ |
| 34 | `tests/wait-mic/test.sh` | `wait-mic · FEATURE-005` | ✓ |
| 35 | `tests/watcher-liveness/test.sh` | `watcher-liveness · BUG-022` | ✓ |
| 36 | `tests/ts-bridge/test.sh` | `ts-bridge · BUG-055` | ✓ — **HELD BACK, see §7** |

Rows 1-35 retire in step 6. Row 36 is the one recommendation in this plan that
is a judgement rather than a measurement.

---

## 3. THE ORDER — and why each position is where it is

**The first thing to be clear about: within one commit, deletion order is
physically irrelevant.** The gate runs at `git push`, over the tree as it then
stands. What the order constrains is the sequence of *pushed states*. So the list
below is a sequence of COMMITS, and the rule it satisfies is: **every pushed
state is green, and every commit is independently revertible.**

1. **`tests/manifest` #1b scans `*.ts` as well as `*.sh`** (B1).
   *Why first:* it is the control every later step is checked BY, and it must be
   correct before it is trusted. It is green on today's tree — the helper still
   has shell consumers, so widening the scan changes no verdict — which means it
   can be landed and proven in isolation.

2. **`tests/git-isolation` #3's terminal branch is restated positively** (B2).
   *Why second:* same property — green today (population is 20, so the terminal
   branch is not taken), red the instant the population empties. Landing it
   separately is what makes "the port is retirement-safe" a claim someone
   verified rather than inherited. **BUG-088's row says this port is already
   retirement-safe. MEASURED: it is not** — see §6.

3. **The four remaining pinned references** (B3, B4, B5, B6), one commit:
   `live-state-canary` #4 dissolves, `state-root` #F dissolves,
   `bootstrap-contents` #3b re-points at the spec, and the eight `docs/` links
   re-point at their suite directories.
   *Why third:* all four are the same defect class — something pinned to a shell
   runner FILE that this wave deletes — none is a control the wave is checked by,
   and every one of them is green today and red after. Grouping them is safe
   because none touches `.githooks/pre-push-project`.
   *Why they are not step 6:* a reviewer reading the deletion commit should see
   36 deletions and their wiring, not 36 deletions plus six unrelated spec edits
   whose necessity is invisible without the simulation.

4. **`tests/git-isolation/test.sh` is deleted — FIRST among the runners.**
   *Why here:* MEASURED, this is the only intra-wave ordering constraint that
   exists. Any tree in which `git-isolation/test.sh` is present while an anchor
   runner is absent is RED (§6). Deleting its own runner first makes every
   subsequent deletion unobservable to it. If the wave is one commit this is
   cosmetic; if anything ever splits it, this is the line that saves it.

5. **The three anchors go next** — `commit-subjects`, `marker-merge`,
   `gate-arming`. *Why:* they are the suites `git-isolation` #1 EXECUTES, so they
   are the deletions with the shortest fuse. Doing them immediately after step 4
   keeps the dangerous half of the wave adjacent to the fix that covers it.

6. **The remaining 31 runners, in any order, with their gate blocks, their CI
   lines, and `tests/helpers/sed-inplace.sh` — ALL IN THE SAME COMMIT as steps
   4 and 5.**
   *Why one commit:* `tests/manifest` #4 fails on a runner whose wiring is gone,
   #5 fails on a runner CI no longer invokes, and both fail on wiring whose
   runner is gone. There is no green partial state, so the commit boundary is
   set by the control rather than by preference. It is also what makes §9's
   rollback a single `git revert`.
   *And why one agent:* `.githooks/pre-push-project` is edited 36 times. Four
   whole-file clobbers happened in this tree today from stale reads of shared
   files. One reader, one writer, one pass.

7. **`testTimeout` comes down** (§8). *Why last:* the number is only measurable
   once the nested gate has stopped running both implementations, which is step
   6. Landing it earlier means guessing, which is what the comment in
   `vitest.config.ts` explicitly tells the next reader not to do.

8. **Lifecycle move** — the TASK-018 rows and plan files travel to
   `waiting-acceptance/` once step 6 is on `main` (CLAUDE.md §"Documentation
   Structure"). `docs/waiting-acceptance/PLAN-TASK-018-RETIREMENT.md` travels with them.

---

## 4. NO `[ -f ]` GUARDS — the precedent to copy

`.githooks/pre-push-project` lines 434-443 and 450-461 are the two suites already
retired (`drift-in-blueprint`, `manifest`). Both left a comment and NO guard, and
both say why in the file:

> Leaving a `[ -f … ]` guard here would be worse than deleting it: it would
> `pipe_skip "suite absent"` forever, which reads as a deliberate exclusion
> rather than as a completed migration.

That is BUG-066's shape — a gate that reports over something that does not
exist — and it is why the §5 removal script replaces the whole
`if … then … else … fi` block, not just the `bash …` line. Each of the 36
retirements gets the same two-line comment naming the file that is gone.

**The comment is not optional decoration.** A reader of a 900-line gate file
needs to know a suite was migrated rather than dropped; that is the only thing
distinguishing this pass from the silent one-line coverage cut §"Pre-push
tolerance" exists to prevent.

---

## 5. HOW `tests/manifest` IS THE CHECK, NOT THE OBSTACLE

The manifest derives the suite set from the filesystem and asserts both
directions: every runner invoked by the gate AND by CI, and nothing wired that is
not on disk. That makes it a *reconciler* for exactly this pass:

1. **Before touching anything**, take a scratchpad copy of the tree, apply the
   whole wave to it mechanically, and run `npx vitest run` from that copy's
   `tests/`. That is how §1's six blockers were found — not by reading 36 gate
   blocks, but by letting the controls read them. Two of the six (B5, B6) are
   invisible to any amount of grepping, and B6 lives in prose in
   `docs/done/BUGS.md`. The script that does it is
   `.scratch/klaus-task018/simulate-retirement.py`; it reports
   `runners to retire: 36 / gate stages retired: 36 / CI shell step removed: 1 /
   CI lines still invoking a shell runner: 0`, and a mismatch between the first
   two numbers is a runner whose block the regex did not match — i.e. exactly the
   half-state the manifest would later fail on, caught before any edit.
2. **During the pass**, run `npx vitest run manifest` from `tests/` after the
   edits and before the commit. #4 names the suite whose wiring you missed; #5
   names the one CI still invokes. It names the culprit, so it is a worklist.
3. **After**, the same run is the acceptance evidence.

**Three ways to build the simulation copy WRONG**, each of which produced a page
of red that had nothing to do with the retirement. All three cost a run to
discover, so they are written down rather than re-learned:

- **`git archive HEAD` is not the tree.** It honours `export-ignore`, so the
  eight blueprint-only suites (`bootstrap-*`, `drift-in-blueprint`,
  `pull-exec-bit`, `template-source`, `blueprint-relocation`) and most of `docs/`
  never arrive — `doc-links` then fails for having only 19 links to examine, and
  `bootstrap-gate` is not present at all, which is the one suite the timing
  question is about. Use `rsync -a --exclude=.git/ --exclude=node_modules/
  --exclude=logs/ --exclude=.scratch/`.
- **`git add -A` is not the tracked set.** `scripts/new-project.sh` is
  gitignored AND force-tracked (`.gitignore:111`), as is `templates/`. A plain
  `add -A` in the copy leaves them untracked, every `bootstrap-*` suite fails
  with *"fixture blueprint has no new-project.sh — it is not a blueprint"*, and
  none of it means anything. Force-add the real repo's `git ls-files` output.
- **A symlinked `tests/node_modules` gets committed.** `bootstrap-gate` #4 then
  reports `Listed managed but missing in blueprint: tests/node_modules` and fails
  drift-clean. Add it to the copy's `.git/info/exclude`, or accept #4 as a known
  artefact of the simulation and read the other cases.

The failure mode to refuse: reading a red manifest as friction and reaching for
a `[ -f ]` guard or an exclusion. Every red it produces in this pass is a real
half-state.

---

## 6. VERIFICATION OF THE ORDER — and where the rows are wrong

Run against a `git archive HEAD` copy of this tree, executing the REAL
`tests/git-isolation/test.sh`, never a paraphrase.

**Baseline (untouched copy) — green:**

```
ok — #1 marker-merge / gate-arming / commit-subjects leave the GIT_DIR repo untouched
ok — #2 the pre-push hook unsets GIT_DIR before running anything
ok — #3 all 20 git-driving suites unset GIT_DIR themselves
PASS
```

**`tests/commit-subjects/test.sh` removed — RED immediately:**

```
FAIL: #1 tests/commit-subjects/test.sh not found
FAIL: #3 discovery MISSED suites #1 proves drive git: commit-subjects
```

**Six non-anchor git-driving runners removed (a2bp-build, a2bp-contamination,
a2bp-e2e, a2bp-inputs, baton-durability, dod-gate) — RED on the count:**

```
FAIL: #3 only 14 git-driving suites found — discovery is broken, so this proved nothing
```

### Three corrections to the rows I was told to read

1. **`[ "$_gi_n" -ge 3 ]` NEVER FIRES, and BUG-088 names it as the floor that
   "fails immediately".** It is a word-count of the hardcoded literal
   `GI_ANCHORS="marker-merge gate-arming commit-subjects"`; `_gi_n` is 3 on every
   tree, including an empty one. The conclusion is right and the mechanism is
   wrong: what goes red on the first anchor removal is `#1`'s
   `[ ! -f "$s" ]` and `#3`'s `missing_anchor` check. Both are shown above. The
   ordering constraint stands unchanged; the row points the next reader at a line
   that cannot fail.

2. **Alexey's corrected arithmetic holds.** Population is 20; removing
   `state-dir`, `commit-msg-gate` and `commit-subjects` leaves 17; the count floor
   needs three FURTHER removals to reach 14. Reproduced exactly. The original
   claim of "16, one retirement from red" does not.
   *One nuance both accounts skip:* `git-isolation/test.sh` is itself a member of
   the 20. Removing it is self-terminating — the control ceases to exist — so it
   is correctly excluded from any margin arithmetic, but it should be named as a
   member rather than silently omitted.

3. **The port is NOT retirement-safe, contrary to BUG-088's row.** The row says
   the floors "are replaced by … an explicit assertion when the population
   empties, so the intended end state is reached visibly rather than silently".
   MEASURED: that assertion is itself red at the end state (B2). The row, and the
   port's own header, also repeat the `_gi_n` claim and the
   "retires four of them, leaving 16" arithmetic that Alexey corrected — so the
   correction landed in the bug row but not in the spec's prose, which is the
   drift §"Documentation is a main concern" is about.

   **CLOSED 2026-09-11 (BUG-109).** All three corrections are now in both places:
   the row carries a `MECHANISM CORRECTED` note and the spec header carries the
   measurement per floor. §1's six blockers are fixed on today's tree — 84/84
   green before the wave and 84/84 green over a rebuilt end-state copy — WITHOUT
   any runner, gate stage or CI line being deleted. Steps 1-3 of §3 are therefore
   done; §3 steps 4-8 are untouched and still the retirement pass's own work.

---

## 7. THE TWO DECISIONS

### `tests/proc-cwd` — RETIRES with the rest. Confirmed.

Until today the spec did not cover the runner: it tested the *property* the shell
helper provides via the TS harness, while `tests/helpers/proc-cwd.sh` — sourced
by `agent-activity-bound` and `subagent-feed`, tested by neither — went
uncovered. `proc-cwd.spec.ts` now carries a second `describe` block,
"BUG-036 — the shell helper two live suites depend on", which drives the SHIPPED
helper (`sh -c '. "$1"; bp_proc_cwd "$2"'`) rather than reimplementing it,
including `#1`'s "a cwd mechanism is available on this host" — the assertion that
exists nowhere else in the repository and whose absence made
`agent-activity-bound` #5b pass over zero information.

Confirmed present, and confirmed load-bearing. **The runner retires.**

**One correction to that block's own header**, which says: *"When
`agent-activity-bound` and `subagent-feed` become specs, the helper loses its
last consumer and this block retires with it."* It does not.
`tests/helpers/feed-fixture.ts` — the TypeScript fixture those two ports use —
**sources the same shell helper** (line 301) and depends on
`bp_proc_cwd_available` for BUG-089's fail-open guard. So `proc-cwd.sh` keeps a
live consumer, the `describe` block stays, and B1 exists precisely because the
manifest cannot see that consumer.

### `tests/ts-bridge` — HELD BACK from this pass. Recommended.

**What retiring it costs**, precisely:

- `tests/ts-bridge/test.sh` is the only assertion about the vitest bridge that is
  **not executed by the vitest the bridge starts**. It runs in the gate BEFORE
  the stage it guards, hermetically (~0.1 s, stubbed `npx`).
- The spec states its own limits: it cannot prove (a) that a BUG-055 regression
  would be reported, because a silently-dead bridge means the spec never runs, or
  (c) the no-toolchain property. `bootstrap-gate` #2/#3 partially covers (a) —
  but only for an INNER bridge; a failure that takes down the outer run takes
  `bootstrap-gate` with it.
- The realistic bad outcome is not a green gate — a dead bridge under `set -e`
  refuses the push. It is **diagnosis cost**: BUG-055 took eight attempts to find
  because every failure in that stage rendered as an absence.

**Why hold it back anyway, and this is the governance argument rather than the
engineering one:** the residue is rowed as **TASK-023** and is explicitly
founder-pending, with the reason stated in the row — *"giving up a check is a
founder call, and burying it in a port's commit body is how a capability
disappears without anyone choosing to lose it."* Retiring `ts-bridge/test.sh` in
this pass answers TASK-023's open question by deletion, inside a 36-file commit.
That is the exact thing the row was written to prevent.

**What holding it back costs:** one gate stage, one CI line, one `[ -f ]` block,
~0.1 s. It is NOT a git-driving member, so it does not appear in
`git-isolation`'s population and does not affect §6's arithmetic; it sources no
helper. The migration reports 35/36 with a named residue instead of 36/36 with a
silent one.

**Retire it the moment TASK-023 is decided, either way.** If the founder accepts
the loss, it goes in the same commit that records the acceptance.

---

## 8. THE CEILING — `testTimeout: 600_000`

The comment in `tests/vitest.config.ts` names its own expiry condition:

> 300s -> 600s on 2026-09-11 … `bootstrap-gate` #2/#3 bootstraps a project and
> runs that project's ENTIRE pre-push gate. Until phase 2 that nested gate ran 35
> shell suites; it now runs those AND 35 TypeScript specs … This number comes
> back DOWN when the shell runners retire.

**MEASURED, both sides, same machine, same day:**

| tree | `bootstrap-gate` #2/#3 | nested gate composition |
|---|---|---|
| today | **374,491 ms** | 170.8 s shell suites + 3.3 s scanners + 196.4 s nested vitest |
| retired (simulated) | **199,633 ms** | 0 s shell suites + ~3.3 s scanners + 194.9 s nested vitest |

The shell half of the nested gate is **170.8 s**, summed from the derived
project's own stage lines that `bootstrap-gate` prints on failure (the full list
is in `.scratch/klaus-task018/sum-stages.sh` output — 36 stages, from
`agent-activity-bound 31.4 s` and `signal-dispatch 31.6 s` down to nine stages at
0.0-0.1 s). Removing it is the entire difference, and the two measurements agree
on that to within a second.

**Set `testTimeout: 300_000`.** That is:

- the value the comment itself says was raised, and the reason it names —
  "until phase 2 that nested gate ran 35 shell suites; it now runs those AND 35
  TypeScript specs" — is exactly what step 6 removes;
- 1.5× the measured 199.6 s, on a machine that was running two other vitest
  processes concurrently, so the real headroom is larger;
- still above `bootstrap-gate`'s known flake ceiling (BUG-065 records the same
  case at 51.2 s and 186.8 s on one commit), which is the reason not to go lower.

**Do not take 300_000 on this document's word.** Re-run
`npx vitest run bootstrap-gate` from `tests/` once step 6 has landed, read
#2/#3's own duration, and set the ceiling from that. A number carried forward
from a plan is the thing the existing comment warns the next reader about.

Rewrite the comment as well as the number. The paragraph beginning
"300s -> 600s on 2026-09-11" describes a state that no longer exists, and leaving
it is the drift §"Documentation is a main concern" is about. Say what the ceiling
now covers: one nested gate of ~200 s, whose cost is now almost entirely the
nested vitest run — which is what makes **TASK-013** (the declared bootstrap
profile) the next lever rather than a nice-to-have.

---

## 9. ROLLBACK

**The single command:**

```
git revert <sha-of-the-deletion-commit>
```

One commit, one revert. That is the entire reason §3 step 6 is atomic: the
deletion commit contains the 36 runners, their 36 gate blocks, the CI step and
`sed-inplace.sh` — so reverting it restores a state `tests/manifest` #4/#5 both
pass over. A three-commit wave would have no revertible boundary: revert the
runners alone and the wiring is orphaned; revert the wiring alone and the runners
execute nowhere.

Steps 1-3 and 7 are separate commits and are separately revertible, but should
NOT normally be reverted with it — they are correct on both sides of the wave.

**What the revert does NOT undo:**

1. **Anything a derived project has already pulled.** All three files —
   `.githooks/pre-push-project`, `.github/workflows/security.yml` and `tests/`
   (a managed DIRECTORY) — are in `MANAGED_FILES`. A project that ran
   `blueprint pull` between the push and the revert has the retirement in its own
   tree and its own history. The revert does not reach it; its next
   `blueprint pull` will offer the restoration, and someone must accept it.
2. **`.blueprint-source` bootstrap_sha bumps** already written downstream.
3. **Anything outside git** — CI run history, the live baton, `logs/`.
4. **The lifecycle moves** if §3 step 8 has already run: a revert restores the
   code, not the position of rows in `doing/` vs `waiting-acceptance/`. Move them
   back by hand and say why.
5. **Nothing about `tests/node_modules`** — untouched by the wave either way.

**Do NOT roll back with `git checkout`/`reset`/`stash`.** Other agents share this
tree; `revert` is the only form that is a commit rather than a tree edit.

---

## 10. MEASURED GATE ESTIMATE

Three runs, one machine, one afternoon. Every number below was produced by a
command in `.scratch/klaus-task018/`, not inferred.

| component | today | after | how it was measured |
|---|---|---|---|
| shell suite stages | **170.8 s** | **0 s** | summed from the 36 stage lines the derived project's gate prints (`sum-stages.sh`); total ticked 174.1 s minus 3.3 s of scanners |
| security scanners + guard | 3.3 s | 3.3 s | same stage list |
| DoD checklist stages | 0.0 s | 0.0 s | same stage list |
| **vitest (all TS suites)** | **598.8 s** | **~424 s** | `run-ts.sh` on this tree: 50 files / 708 tests / `598.16 s` reported, `598.80 s` wall. After = 598.8 − (374.5 − 199.6), i.e. the whole saving lands inside `bootstrap-gate` |
| **GATE TOTAL** | **~773 s** | **~427 s** | |

**~796 s → ~427 s. A 46% cut, and it is one suite's saving.**

Three honest caveats:

1. **I did not reproduce the 796 s figure itself** — I did not run the full
   pre-push gate. My components sum to **773 s**, which is the same magnitude and
   is consistent with 796 s on a less contended machine (mine was running two
   other agents' vitest processes throughout). The *delta* is the reliable part;
   the absolutes are inflated.
2. **The "after" vitest number is arithmetic on two measured endpoints**, not a
   single clean run. The direct run over the retired tree reported 601 s — but
   that tree still carries the six blockers, so `bootstrap-gate` failed four
   cases and ran the nested gate more than once. `bootstrap-gate` #2/#3's own
   duration (199.6 s vs 374.5 s) is the measurement that is clean, and it is the
   only place the saving lands.
3. **The remaining ~427 s is dominated by one case.** `bootstrap-gate` #2/#3 is
   ~200 s of a ~427 s gate — 47%. HANDOVER §3 already names **TASK-013** (the
   declared bootstrap profile) as the fix, and after this pass it stops being one
   optimisation among many and becomes *the* one.

### What this pass does NOT buy

The saving is wall-clock, not risk. Every assertion the 36 shell runners made is
claimed to be carried by a spec, and that claim rests on the per-suite
equivalence records written during the port — not on anything this plan
verified. What this plan verified is narrower and worth stating plainly: that the
**controls** (`manifest`, `git-isolation`, `doc-links`, `state-root`,
`live-state-canary`, `bootstrap-contents`) behave correctly over the finished
tree once six of them are fixed. Suite-level equivalence is TASK-018-EQUIVALENCE's
subject, and the two cross-provider reviews still running are its reviewers.

---

## 11. TWO FINDINGS OUTSIDE THIS PASS

Both were turned up by running the current tree, and neither is caused by the
retirement. They are recorded here because they were found here, not because
they belong to this item.

1. **The gate is RED on `main` right now.** `bootstrap-gate` #2/#3 fails on this
   tree, and the cause is inside the nested gate:

   ```
   × #A6 a markerless, non-git tree FAILS LOUDLY and never reaches a real checkout
   AssertionError: expected +0 not to be +0
   ```

   `tests/state-root` #A6 passes in this checkout and fails inside a freshly
   bootstrapped project — `bp_state_root` returns 0 there for a tree that should
   have no root to find, so it *did* reach something. It is deterministic, not a
   flake, and it is **not rowed** in `docs/doing/BUGS.md`. It will block the
   retirement push exactly as it blocks any other. Needs its own bug row and its
   own fix, before or alongside step 6.

2. **Two permission entries name runners that will not exist**:
   `.claude/settings.json:174` (`Bash(bash tests/agent-activity-bound/test.sh)`)
   and `.claude/settings.local.json:5`
   (`Bash(SIGNAL_TEST_SETTLE=3 bash tests/signal-dispatch/test.sh)`). Harmless —
   an allowlist entry for a command nobody can run grants nothing — but it is
   dead config, and §"Code Quality" says to remove dead code. Three comments in
   `scripts/` also cite retiring runners by path
   (`accept-bug-022.sh:18`, `lib/request-file.sh:96`, `agent-activity.sh:545`);
   re-point them at the specs in the same commit as step 3.
