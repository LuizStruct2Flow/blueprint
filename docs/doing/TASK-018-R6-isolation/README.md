# TASK-018 R6 — negative proof for the ISOLATION group

Suites: `tests/git-isolation`, `tests/env-namespace`, `tests/state-dir`,
`tests/proc-cwd`, plus the four ported suites that belonged to no reviewed group
— `tests/commit-msg-gate`, `tests/commit-subjects`, `tests/doc-links`,
`tests/lifecycle-docs`.

## What this answers, and why it is not the same question the specs answered

Each spec already carries an EQUIVALENCE RECORD: shell-vs-port verdict SETS,
compared over perturbed trees. Three independent reviews of other groups refused
certification anyway, for one reason — Alex put it exactly: *"the recorded mutant
set is assertion-GROUP coverage, not assertion coverage."* Agreeing on `#3` does
not say which of eleven `#3` cases can be made red.

So this run asks the narrower question, one `it()` at a time:

> For each case the runner actually runs, is there a perturbation **observed** to
> turn it red?

**Result: 136 / 136.** The denominator is the runner's own output, not a grep.

## Reproduce

```bash
bash code/iso-titles.sh    > outputs/iso-titles.txt    # the denominator
bash code/iso-equiv.sh --all > outputs/iso-matrix.txt  # 88 trees, 88 runs
bash code/iso-gap-compute.sh > outputs/gap.txt         # the difference
```

`iso-equiv.sh` is adapted from `.scratch/elias-equiv.sh` (Christian) and keeps
its three guarantees: a literal `sub` that exits non-zero when its target text is
absent, a `build_tree` whose copy has its own git history, and a CHANGED-NOTHING
guard asked of that git rather than of a list of files a mutant is "allowed" to
touch.

**The denominator comes from `vitest --reporter=verbose`, not from `grep "it("`.**
A grep cannot see an `it.each` table: `git-isolation` has one over three anchors
and `commit-msg-gate` several. Counting those as one case each would have hidden
21 of the 136 — and the anchor table is where the only per-anchor evidence lives.

## Four apparatus defects this run hit, three of them the traps by name

1. **A mutant that applies, changes the file, and is unreachable.** `PC3` first
   injected its fail-open into the helper's "no mechanism" tail. This host has
   `lsof`, so that line never runs: the tree was defective nowhere and the run
   PASSED. Moved above the `lsof` arm, it turns exactly `#4` red.
2. **`git add -A` cannot see sixteen files.** The real repo TRACKS sixteen paths
   that `.gitignore` also names; tracked beats ignored there, and not in a fresh
   `git init`. Without `-f` they never enter the baseline, so `git status
   --porcelain` reports CHANGED NOTHING over a rewritten file — and three of the
   sixteen (`CLAUDE.md`, `docs/DoD.md`, `AGENTS.md`) are the SUBJECTS of
   `doc-links` and `lifecycle-docs`. Reported by the gate group; `build_tree`
   now uses `add -A -f`. Regenerate the list with
   `git ls-files -i -c --exclude-standard`.
3. **A one-commit baseline is not a neutral tree.** `lifecycle-docs`'s REAL TREE
   case reads `git log --format=%s` in the tree the spec runs in and asserts >50
   subjects as its own non-vacuity floor. Over the one-commit baseline it went
   red on a PRISTINE copy — a harness artefact that would have been reported as a
   finding. `seed_history` replays the real subjects as empty commits;
   `$SRC/.git` is still not copied.

4. **`sort -u` is not a set operation under a UTF-8 locale.** glibc collation
   ignores `#` at the primary level, so `#2 names no item: BUG: no number` and
   `#2 names no item: BUG#: no number` sorted as ONE string and the inventory
   read 22 where the runner ran 23 — with `uniq -d` finding nothing, because it
   compares bytes. It corrupted BOTH sides: the denominator, and the red sets the
   numerator is built from. `LC_ALL=C` on every `sort` here. Same class as
   BUG-043, and it would have hidden a case from the audit written to find hidden
   cases.

A fifth was caught by the harness rather than by review: `env VAR=x run_vitest`
execs a PROGRAM, and `run_vitest` is a shell function, so the run happened
nowhere. It surfaced as FAILED-WITH-AN-EMPTY-RED-SET, which is refused a verdict.

## Findings — assertions whose own failure was never observed

### F1. `proc-cwd` `#1`, `#3`, `#5` (first block) — red only by scenario ABORT

The three cases asserting `pwd -P` equals the workspace path are BUG-036's
regression: on macOS `tmpdir()` is `/var/folders/…`, a symlink to
`/private/var/…`, so an unresolved workspace root compares unequal to every path
a real process reports. `createWorkspace` resolves the base first.

The mutant that removes that resolution (`PC7`, with `TMPDIR` pointed at a
symlink to reproduce the macOS shape on Linux) turns **all ten** proc-cwd cases
red, and every one of them with the *same thrown error*:

```
Error: Refusing forbidden environment override HOME=…/tmplink/proc-cwd-5-…/home:
  the path … must be inside the scenario workspace …
```

`assertOverrideAllowed` realpaths both sides, so a non-physical workspace root
aborts every scenario **before any assertion runs**. These three cases therefore
have no isolable negative proof on this host: their own `expect` was never
observed failing. Not a weakness in the port — a stronger guard one level up
catches the defect first — but it is the R6 evidence they do not have, and it is
recorded rather than engineered around. On macOS, where the symlinked tmpdir is
the default, the same mutant would reach them.

### F2. Three `commit-msg-gate` cases are guarded three times over

`#3 FAILS CLOSED on a missing argument`, `#3 FAILS CLOSED on an unreadable
message file` and `#3 an empty message … is rejected` have **no single-edit
mutant**. Measured one edit at a time: removing the readability guard (`CM4`) and
removing the empty-subject guard (`CM5`) each turn only `#3 the no-argument path
is defended TWICE` red — because the rule itself refuses `""` as a third line of
defence. `CM9` removes all three and the cases go red together.

This is the shape Christian recorded for `suite-sync` `#7-bare`: the case is the
redundantly-guarded one, not the distinguishing one. Worth stating rather than
fixing — redundant defence of a fail-closed path is the correct design.

### F3. Two assertions are about git and the kernel, not about this repository

- `commit-msg-gate` `#4 … a repo WITHOUT it is ungated` asserts the ABSENCE of
  enforcement. No mutation of this repo can make git run an unwired hook.
- `state-dir` `#10c a symlink CYCLE fails non-zero` and `#6b the decoy
  environment is genuinely hostile` assert properties of the kernel's ELOOP and
  of `git rev-parse` under a foreign `GIT_DIR`.

Each is given negative proof by **perturbing the fixture** instead — the shape
`M6` and `Q15` already use in `elias-equiv.sh`: `CM10` wires `core.hooksPath` into
the repo that exists to lack it, `SD13` makes the "cycle" not a cycle, `SD14`
points the decoy at the real repo. Each turns exactly its own case red. The cases
observe what they claim to.

### F4. Two mutants nothing kills — precision that is untested

- **`GI6`** loosens `UNSETS_GIT_DIR` to a bare `/GIT_DIR/`. No case notices,
  because comments are stripped BEFORE the predicate runs, so the false
  positives it would admit (`# unset GIT_DIR`) are already gone. Nothing covers a
  CODE line that merely mentions the variable (`GIT_DIR=x git …`) or the
  documented refusal of `unset -v GIT_DIR`.
- **`CM8`** turns the hook's missing-library `exit 1` into `exit 0`. Its
  commit-msg-gate case rewrites that same branch in its own fixture, so the
  shipped line is unobservable there. `CS4` is the same mutant run against
  `commit-subjects`, whose `#6 the hook FAILS CLOSED when its rule library is
  missing` DOES see it — which is why the mutant is listed under that suite.

Neither is a gap in the 136. Both are recorded because "no mutant kills it" is
information a reviewer cannot recover from a green run.

## Per-suite totals

| Suite | cases | with observed negative proof |
|---|---:|---:|
| git-isolation | 14 | 14 |
| env-namespace | 12 | 12 |
| state-dir | 18 | 18 |
| proc-cwd | 10 | 10 (3 by abort only — F1) |
| commit-msg-gate | 32 | 32 |
| commit-subjects | 23 | 23 |
| doc-links | 13 | 13 |
| lifecycle-docs | 14 | 14 |
| **total** | **136** | **136** |

`outputs/gap.txt` names, per case, which mutants were observed to turn it red.

## `tests/git-isolation`'s dissolution date

Audited as it stands, per instruction. Its port deliberately drops two
magic-number floors and that decision is untouched here. Worth noting what the
audit adds to it: `GI11` empties `DECLARED_ANCHORS` and `#3 THE REAL TREE` goes
red — so the anchor half that REPLACED the floors is itself proven load-bearing,
which is the claim the docblock makes and did not previously demonstrate.
