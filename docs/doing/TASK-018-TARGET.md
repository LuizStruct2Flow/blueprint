# TASK-018 — the agreed target, and where the tree still differs from it

**Written 2026-09-10 to hand the design to the session working on evo-x2.**

The founder agreed the rules and the structure in a long session on
`macbook-pro`, then moved development to evo-x2 (Linux, 32 native cores, ~3×
faster on this suite). The evo-x2 session has since done more implementation
than that session did — all six blueprint-tier suites are migrated — **but it
implemented against a target it was never told.** This file is that target.

Read `TASK-018-RULES.md` first (the seven rules). This file says what the tree
should look like, what it looks like now, and why the differences matter.

---

## 1. The two things the founder flagged as wrong, by name

On seeing the tree on evo-x2, the founder said: *"it still works in serial tests
and also the tests are not colocated."* Both are correct and both are open.

### 1.1 Tests must be CO-LOCATED with what they test

**Now:** every spec lives in `tests/<suite>/<suite>.spec.ts`, a parallel tree.
TASK-020 moved the TS config *further* into `tests/` (`tests/package.json`,
`tests/tsconfig.json`, `tests/vitest.config.ts`), i.e. away from co-location.

**Target:** a spec sits **beside the file it tests**. `signal-set.ts` and
`signal-set.spec.ts` in the same directory.

**This is not a preference.** `CLAUDE.md` §"Test directory layout" has always
required it — *"Unit and integration tests are co-located with the source file
they test, not stashed in a separate `tests/` mirror"* — and the `tests/<suite>/`
layout has been violating the repo's own rule the whole time. The migration is
the moment to stop, because moving a spec twice costs more than placing it once.

**Cross-cutting tests sit with their primary subject.** `bootstrap-gate` tests
bootstrapping, so it belongs with the bootstrap code. Nothing needs a special
home.

### 1.2 Tests run in PARALLEL — there is no serial category

**Now:** `tests/vitest.config.ts` has `fileParallelism: false`.

**Target:** `true`, with **no escape hatch** — no `describe.sequential`, no
per-suite marker, nothing.

**The reasoning, because it is counter-intuitive and was argued out.** The first
version of that config was serial, with a comment saying parallel-safety must be
"earned per suite". The founder took the opposite position and was right: every
case that *looked* like it needed serial execution turned out to be **a test
reading something it does not own** — a machine-wide `ps` scan, a global
`$TMPDIR` sweep, the real activity log. Those are bugs in the test, not a
category of test. R3's sandbox removes the need.

So a "run this one alone" marker would only ever be used to keep an unisolated
test green, and **a declared exemption is exactly how the complexity returns** —
we spent a day building a manifest to police exemptions before concluding the
better move was to have none.

**Consequence accepted explicitly:** a test that cannot run alongside its
siblings is not finished. It does not get a marker.

**Measured, not assumed:** 41 tests, 4.44 s serial vs **2.07 s parallel** on
evo-x2; 17.2 s vs 5.79 s on the Mac.

---

## 2. The directory structure — agreed, not started

```
docs/  AGENT_ROSTER.md  logs/     ← this repo's OWN state, like any project
scaffolding/                      ← everything a project RECEIVES
forge/                            ← bootstrap, sync, a2bp, templates. NEVER ships
```

**Two buckets, not three.** An earlier draft proposed a third for "this repo's
own project state". The founder killed it: *"all derived projects will also have
docs, agent_roster and logs"* — those are not blueprint-internal, they are what
every project has. So the blueprint's own state sits **at the root, exactly where
a derived project's does**, and `scaffolding/` holds the *template* of that
shape. The distinction is **structure vs content**: the lifecycle folders and
their READMEs ship; this repo's own `BUGS.md` rows do not (which is what
`.gitattributes` already does).

**`forge/` names a function.** It is where scaffolding is made and maintained —
the one thing only a blueprint does. Chosen over `factory/` and `internal/`
because it says what happens there rather than what it is not.

**Beware the terminology inversion.** Today `blueprint`-tier means *does not
ship*. In the target, `scaffolding` is what ships and `forge` is what does not.
Every existing comment, `.gitattributes` line and bug row uses the old sense, so
**the rename must be total or it will be worse than either**.

**The founder chose the symmetric shape** (both buckets move, nothing at root
except this repo's own state), knowing the cost: bootstrap grows a path-mapping
step, since `scaffolding/scripts/x` must land at `scripts/x` downstream. That
changes `git archive`, every `MANAGED_FILES` entry, and the `a2bp`/`drift`/`pull`
path handling **together**. `bootstrap-gate` is the suite that proves the strip
is correct, which makes it the riskiest one — appropriately, since it is the only
one speaking for downstream.

**Where the harness lives:** `scaffolding/`. Derived projects run scaffolding
tests, so they need it. `forge/` imports it from there — the factory using its
own product. The dependency runs one way only.

---

## 3. The internals migrate to TypeScript too — not just the tests

**Founder, explicitly:** *"I want also the blueprint internals to be migrated to
ts."*

This is the part most likely to be missed, and it changes how tests should be
written **right now**.

### 3.1 It resolves the mocking question in the founder's favour

The founder asked why we sandbox real dependencies instead of mocking them. The
answer *while the product is shell* is that the external dependencies **are the
subject** — every bug found on 2026-09-09 was "the real tool behaves differently
than you assumed" (`git init` returning 0 while creating no `.git`; BSD `sed`
rejecting `\|`; `/proc` absent). Mocking is the technique that conceals exactly
that class.

**Once the internals are TypeScript, that inverts.** `pull`, `drift`, `a2bp`,
placeholder substitution and the gate renderer become functions, most tests
become pure logic, and **mocking becomes the right default** with the sandbox
shrinking to a thin boundary. R3 is already written in that shape.

### 3.2 Therefore: migrate COMPONENT BY COMPONENT, not "tests then internals"

**This is the sequencing decision, and it is the most important line in this
file.**

Porting a test faithfully against a shell script and *then* rewriting that
script in TypeScript means **writing the test twice** — and the first version is
the slow spawn-a-subprocess kind. Measured on evo-x2:

| | shell | faithful TS port |
|---|---|---|
| `pull-exec-bit` | 0.17 s | 0.16 s (parity) |
| `drift-in-blueprint` | 0.83 s | **1.44 s (1.7× slower)** |
| `proc-cwd` (rewritten against logic, not scripts) | — | **0.027 s** |

`proc-cwd` is the tell: two orders of magnitude, because it tests *logic* rather
than driving a script. `drift-in-blueprint` is slower and will stay slower until
the `blueprint` CLI itself is TypeScript.

**So one slice = one component:** port the script to TypeScript, write its spec
against the TypeScript, retire the shell script and its shell suite **together**,
run the mutant once. One pass, and the test lands in the fast form.

**Order by risk, easiest first:** `state-dir`, `commit-subject`, `placeholders`,
`suites`, `signal-set` (small, mostly pure) → `pipeline` → the `blueprint` CLI
(`drift`/`pull`/`a2bp`, biggest surface) → `new-project` → **`agent-activity`
last**. That daemon holds a `flock`, which has no native Node equivalent, and
BUG-001 was a fork bomb that ran for 2.7 days. Go slowly there.

### 3.3 One thing stays shell permanently

**The pre-push hook's entry point.** If the gate is TypeScript and `npm ci`
failed, you have *no gate* — precisely the state where you most want one. A thin
shell entry that fails loudly on a missing toolchain is the right shape.

---

## 4. `SUITES.md` and most of `tests/manifest` are meant to DISAPPEAR

**Founder:** *"we don't have to document any tests, they should be self
documenting - they are bdd tests."*

That is a bigger simplification than it sounds, and the reason is structural.
**`tests/manifest` exists to compensate for shell's lack of test discovery.** Its
two central assertions — `#4` "every suite is invoked by the gate" and `#5`
"every suite runs in CI" — exist because a shell suite needs explicit per-suite
wiring in *two* files and deleting one line is a silent coverage cut.

**Vitest discovers by glob. There is no per-suite invocation to forget.** So
those assertions are not satisfied by the migration, they are *dissolved* by it.
With folders holding the export boundary (§2), `#2b` and `#2c` go the same way.

The rest follows: **risk and rationale** belong in the `describe` name, next to
the code that proves them — a table restating them is a second copy that drifts,
which happened twice in one afternoon while building the thing this deletes.
**Parallelism class** becomes `describe.concurrent`/`sequential`… except R5 says
there is no serial category, so it becomes nothing at all.

**Two residues, and neither is documentation:**

1. **The mutation recipe** (R6) — "delete this block and case #1 goes red" is a
   claim about code that *isn't there*, which a spec cannot self-document. It
   belongs in a script that runs the mutants.
2. **A vitest run where every test is skipped exits 0.** That is BUG-005
   surviving into the new stack, and the answer is one line of runner config
   (R7), not a manifest.

**TASK-020 went the other way** — it derives the suite set from the filesystem
and keeps the manifest as the authority. That is a reasonable *interim* step and
it is strictly better than the hand-maintained table, but the target is that the
file stops existing.

---

## 5. Status: four of the seven rules are not yet true

| Rule | State on `8b7dc46` |
|---|---|
| R1 BDD specs in TS, self-documenting | **partial** — 8 specs exist; `tests/SUITES.md` still load-bearing |
| R2 `scaffolding/`+`forge/`, co-located | **NOT STARTED** — §1.1, §2 |
| R3 mock by default, sandbox otherwise | **done** — `tests/harness/`, with its own escape tests |
| R4 no fixed waits | **partial** — harness polls; remaining shell suites sleep |
| R5 parallel, no serial category | **NOT DONE** — `fileParallelism: false`, §1.2 |
| R6 provably able to fail | **partial** — mutants for the migrated suites, not the rest |
| R7 skipped/empty fails the build | **NOT STARTED** |

**Do not read a rule/tree disagreement as a defect.** These are the target. The
previous handover stated them in the present tense and the founder correctly
found the tree contradicting them.

---

## 6. Two decisions still open for the founder

- **`pipeline.sh` → `package.json`.** The founder asked why the gate needs a
  bespoke shell renderer. Answer given: right idiom, wrong substitute —
  `package.json` is a task runner, `pipeline.sh` is a *reporter*, and most of
  what it renders is not npm (gitleaks, semgrep, osv-scanner, IaC, the DoD
  stages, 40 shell suites). Recommended sequencing it **after** phase 1 rather
  than rebuilding the reporter while those suites still depend on it. **Not
  decided.**
- **Whether `both`-tier suites ever become TypeScript.** Phase 1 deliberately
  does not answer it. If the answer is no, the blueprint permanently runs two
  test stacks — a real cost, to be chosen rather than drifted into. Note this is
  *unblocked*: every derived project is a Node/TypeScript project
  (`STACK_DEFAULTS.md:32,39,55`; `CLAUDE.md` already prescribes
  `vitest.config.ts`), so shipping TS downstream costs nothing. **The blueprint
  is the outlier** — it prescribes vitest to everyone while testing itself in
  shell.

---

## 7. Traps recorded because they each cost real time

- **`~/.local/bin` is in `.profile`, which a NON-LOGIN shell does not source.**
  `install-toolchain.sh check` reports `gitleaks`/`semgrep`/`osv-scanner` MISSING
  over SSH or from a dispatched agent while they are present interactively.
  Anything automated must export it.
- **Put the persona NAME in a dispatch description** (BUG-052). The feed resolves
  the persona from the description text: `"Vitali isolation audit"` labels
  correctly, `"QA-1 isolation audit"` does not. 1510 of 2489 feed lines in one
  session read `[general-purpose - Claude Code]` because of this.
- **`git fetch <bundle> "refs/heads/*:refs/heads/*"` acts as a MIRROR** and
  prunes local refs the bundle does not carry. It deleted `main` on the evo-x2
  checkout once. Fetch bundle branches **by name**.
- **Never trust a push's exit code through a pipe.** `git push … | tail` reports
  `tail`'s status. `git ls-remote origin <branch>` is the only authority.
