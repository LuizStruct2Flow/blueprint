# PLAN — BUG-147: port the sourced DoD gate whole, then widen project-owned specs

**Status:** design complete; ready to implement. No port or BUG-147 fix is part
of this document.

**Founder decisions, 2026-09-22:**

1. `scripts/lib/dod-gate.sh` is ported whole under TASK-067 before BUG-147
   changes its extension rule. There is no in-place shell exception and no
   function-by-function migration. TASK-067 may admit a second migration form,
   but only under both ceilings: the inventory re-renders the blessed adapter
   from its parsed ordered `(function, subcommand)` pairs and requires whole-file
   byte equality, exactly as `isValidShim` does for executable shims; and a
   sourced adapter is legal only for a library that a still-shell caller
   sources, never for an executable. This ceiling lands in `CLAUDE.md` with the
   port.
2. The CI note-position change is accepted. Note text and note order stay
   identical, but CI's unbuffered output prints the notes after the Node child
   finishes instead of at their original call sites. This is a known deviation,
   recorded here and in the port commit body rather than hidden by the
   differential comparison.

Both independent Architect reviews agree on Option C. Their requested
amendments are incorporated below; implementation does not reopen the boundary.

## Decision

Move all DoD policy and stage logic into one
`scripts/lib/dod-gate.mts` CLI, with one subcommand per compatibility function,
and
leave `scripts/lib/dod-gate.sh` as a small **sourced adapter** that defines the
same shell functions and forwards each call to the CLI.

The adapter is not another home for the implementation. It may only:

1. locate the adjacent tracked `.mts` target through `BP_CODE_ROOT`;
2. invoke one named subcommand with the caller's arguments and environment;
3. replay structured stage notes through the caller's existing `pipe_note`;
4. return the child's exit status unchanged; and
5. fail loudly when Node or the target is unavailable.

This is the smallest boundary that moves the file's logic whole while keeping
the two source callers intact. It requires one narrow addition to TASK-067's
inventory rule: besides the exact two-line executable shim, recognise this
file-specific, mechanically generated sourced-adapter form. That is a rule
refinement, not an exemption for shell domain logic. The inventory parses only
the ordered forwarding pairs, constrains both token kinds, re-renders the whole
blessed adapter from those pairs, and requires byte equality. It must reject
extra commands, an untracked/missing target, malformed names, or any byte not
produced by the renderer.

The checker does **not** decide whether a syntactically valid function maps to
the semantically correct subcommand: it has no independent authority for that
claim. `tests/dod-gate` proves each sourced API behaviorally. Generalising this
validator beyond `dod-gate.sh` is a separate reviewed change when a second
sourced-library migration actually exists.

Do **not** edit `.githooks/pre-push-project` to call Node directly. That file is
legacy shell too; changing its managed region would trigger its own whole-file
port, and it is itself sourced by `.githooks/pre-push`. That path expands this
573-line port into the gate entry/renderer boundary and the marker-aware,
project-owned region for no product benefit.

## 1. Measured surface at the current tip

### Source and tests

- `scripts/lib/dod-gate.sh` is **573 lines** and defines **8 functions**.
- There are **2 production source sites**:
  `.githooks/pre-push-project:447-470` and
  `.github/workflows/security.yml:217-250`.
- There are **4 production stage entry points**:
  `dod_stage_rows`, `dod_stage_bugtests`, `dod_stage_signal` and
  `dod_stage_judgement`.
- A fifth function, `dod_items_in_push`, is called from outside the file by
  `tests/dod-gate`; the other three are internal today.
- `tests/dod-gate` has **57 `it(` call sites** and currently collects **64
  cases**, measured with `vitest list`; parameterised loops explain the
  difference. The port's green-count check uses the collected-case count.
  Branch `storm2flow/bug147` adds
  `#11c` and `#11d`; its own commit record reports **66 cases** after those
  two are present.
- `tests/vitest.config.ts` and prose in `tests/dod-gate/dod-gate.spec.ts` name
  `dod-gate.sh` as the location of the extension rule. Once that file is only an
  adapter, both references must point to the resolved implementation in the
  bridge-awareness preparation commit.
- The file is in `scripts/shell-inventory.json` as legacy shell and is shipped
  to derived projects by `git archive HEAD`; a committed adjacent `.mts` file
  will ship and become managed automatically unless export-ignored.

### Functions and callers

| Function | Role | Calls outside this file | Caller-shell effects today |
|---|---|---|---|
| `_dg_need_parser` | private guard | none | Reads the source-time parser function and `_dg_subject_lib`; prints to stdout; returns 0/1. |
| `dod_items_in_push` | helper | `tests/dod-gate` directly; both row/test stages indirectly | Runs `git log`, suppresses its stderr, pipes subjects through `commit_subject_item`, sorts unique IDs; returns the pipeline status. Writes `_dg_range` and `_dg_subject` globals. |
| `dod_find_row` | helper | none | Reads lifecycle Markdown and `findings.md`; prints one state or nothing; returns 0/1. Writes `_dg_type`, `_dg_num`, `_dg_state`, `_dg_f`. |
| `dod_stage_rows` | production stage | pre-push hook and CI workflow | Calls `pipe_note` for cancelled/out-of-`doing` rows, so it deliberately mutates the parent renderer's current-stage note. All diagnostics are stdout; verdict is 0/1. Writes `_dg_*` scratch globals. |
| `dod_test_roots` | helper | none | Reads `project_config_paths.md`; prints roots or a refusal; temporarily sets globbing off with `set -f` and restores it with `set +f`; writes `_dg_*` globals. |
| `dod_stage_bugtests` | production stage | pre-push hook and CI workflow | Calls `pipe_note` for skipped roots and parked bugs; stdout carries all other diagnostics; external-tool stderr is suppressed or folded into captured output; verdict is 0/1. Writes many `_dg_*` globals. |
| `dod_stage_signal` | production stage | pre-push hook | Sources `state-dir.sh` and `roster.sh` into the caller, defaults/assigns `BP_CODE_ROOT`, assigns `BP_STATE_ROOT`, and therefore adds their functions plus `_dg_*` scratch values to the caller. Prints to stdout; returns 0/1. |
| `dod_stage_judgement` | production stage | pre-push hook | Calls `pipe_note` once, prints the judgement reminder to stdout, and returns 0. |

There is also source-time mutation before any function runs:
`_dg_subject_lib` is assigned and `commit-subject.sh` is sourced into the
caller's process. None of the tree's callers consumes `_dg_*`, the sourced
helper functions or the shell-option toggle after the call. `BP_STATE_ROOT` is
different: `feed_append` reads it at call time when `_pipe_line` records a
stage. The current pipeline resolves the same root before the DoD block, so the
assignment appears inert, but the differential must prove that with alternate
state-root inputs and feed effects before the port may remove it. The state that
**is** contractual and must remain is:

- the caller's cwd and environment are the stage inputs;
- `BP_CODE_ROOT`, `AGENT_SIGNAL_FILE`, `AGENT_STATE_HOME`, roster overrides and
  Git state still select the same files;
- stdout/stderr and exit status still flow into the caller's stage invocation;
- `pipe_note` still annotates the current parent `pipe_stage` result;
- `AGENT_FEED_TAG` and all `_PIPE_*` counters remain owned by the parent; and
- one failed stage still makes `pipe_stage` finish and exit fail-closed.

### What the two production callers do

**Local pre-push.** `.githooks/pre-push-project` is sourced by
`.githooks/pre-push` after `pipeline.sh` and `pipe_init`. It then sources
`dod-gate.sh`, gets the outgoing ranges from `push_log_opts`, changes
`AGENT_FEED_TAG` to `DoD-Gate`, and passes four wrapper functions to
`pipe_stage`. The renderer buffers each stage's combined stdout/stderr, owns
the count/timing/fail-closed exit, and stores passing-stage notes in its own
process. It restores the tag to `GATE` afterwards.

**CI.** The push-only workflow step computes one `RANGE`, checks commit
subjects first, exports `BP_CODE_ROOT=.`, sources `pipeline.sh` and
`dod-gate.sh`, then calls only `dod_stage_rows` and `dod_stage_bugtests` under
`|| rc=1`. Both run even when the first fails, and the step exits with the
aggregate status. CI sources `pipeline.sh` because those stages may call
`pipe_note`; it does not initialise a rendered pipeline.

## 2. Boundary options, priced

### Option A — one `.mts` executable per stage

The callers would invoke four targets such as `dod-rows.mts` and
`dod-bugtests.mts`. The local caller could keep each target under its existing
`pipe_stage`; CI could invoke the two it needs and aggregate statuses.

Cost:

- four entry files and four bootstraps for one cohesive policy;
- shared item parsing, lifecycle lookup and root validation need a fifth module;
- direct helper behavior (`dod_items_in_push`) needs another test interface;
- four Node startups still occur, so it is not faster than subcommands; and
- either caller changes (triggering the `pre-push-project` port cascade) or a
  sourced adapter still has to define the old functions.

Reject: more files and interfaces with no boundary or runtime advantage.

### Option B — one CLI with subcommands, callers invoke it directly

`dod-gate.mts rows "$RANGE"`, `bugtests`, `signal`, and `judgement` give each
stage its own process, output, and exit status. The existing four
`pipe_stage` calls remain distinct, so stage count and feed visibility survive.
CI invokes `rows` and `bugtests` and keeps its `rc` aggregation.

Cost:

- `.githooks/pre-push-project` must change to replace sourcing/function calls;
- TASK-067 then requires that entire 531-line sourced hook to migrate;
- its two-line exec shim cannot be sourced by `.githooks/pre-push`, causing the
  same boundary problem one level up; and
- the managed `BLUEPRINT:BEGIN/END` region plus the project's byte-preserved
  region need a new cross-process design.

Reject: the CLI shape is right, but direct callers make the port recursively
larger.

### Option C — one CLI behind a strict sourced adapter (**recommended**)

Keep both production callers byte-identical. The adapter defines the current
function names and forwards to one CLI. `pipe_stage` therefore still runs a
shell function in the parent and still owns the stage lifecycle. The Node child
owns only the stage's decision.

Cost:

- TASK-067's checker and test helper need a second exact migration form for a
  sourced library;
- the adapter is larger than the ordinary two-line exec shim because shell
  cannot receive function definitions back from a child process;
- four local stages mean four Node startups. Measured on the official Node 22
  baseline, a representative `.mts` startup is about **37 ms**, or about
  **0.15 s** across four stages against a **142 s** gate run. Keep the four
  visible stages; do not collapse them to save this settled cost;
- `pipe_note` needs an explicit side channel; and
- a targeted pull of only `dod-gate.sh` can momentarily install an adapter
  without its target, so the adapter must refuse with the exact command to pull
  `scripts/lib/dod-gate.mts`.

Accept: it contains the exception to the source ABI, moves every policy branch
to TypeScript, and does not force unrelated gate/marker architecture into this
bug.

### Option D — port the DoD library, project hook and renderer as one boundary

This would let TypeScript own stages, notes, counts and output natively, with a
single executable shim only at `.githooks/pre-push`.

Cost: it pulls `pre-push-project`, `pipeline.sh`, the parent hook integration,
batch-result injection, feed logging, marker merge and the derived project's
custom guard tail into one port. It is no longer BUG-147's prerequisite; it is a
gate rewrite with a much larger differential surface.

Reject now. Reconsider only when `pipeline.sh` itself needs a change.

## 3. Recommended CLI and adapter contract

### CLI

One `scripts/lib/dod-gate.mts` supports:

| Subcommand | Shell compatibility function | Arguments |
|---|---|---|
| `rows` | `dod_stage_rows` | one range-list string |
| `bugtests` | `dod_stage_bugtests` | one range-list string |
| `signal` | `dod_stage_signal` | none |
| `judgement` | `dod_stage_judgement` | none |
| `items` | `dod_items_in_push` | one range-list string |
| `find-row` | `dod_find_row` | one normalised item |
| `test-roots` | `dod_test_roots` | none |

`_dg_need_parser` becomes an internal TypeScript guard, not an exported
subcommand. Unknown subcommands and wrong arity fail loudly. Normal stage
verdicts remain 0/1. Usage errors, helper failures and uncaught/internal errors
must print a loud `internal error`/usage diagnostic and exit 2 (or another
documented status greater than 1), never 1: status 1 is reserved for a DoD
policy verdict. The adapter returns the status unchanged.

For `rows`, `bugtests` and `items`, the range-list argument is one string whose
contents are split on shell IFS whitespace exactly as the current unquoted
`for _dg_range in $1` does. `push_log_opts` emits one range per line, so a
multi-ref push must still traverse each range independently. Item ordering and
deduplication must retain the current ambient-locale behavior of `sort -u`;
Node's default code-unit `.sort()` is not an equivalent replacement. The
implementation may keep `sort -u` as an explicit child with the inherited
locale, or must prove byte-identical ordering and uniqueness under the pinned
locale corpus.

The CLI imports only `node:` builtins. It must not copy the rules in these
still-shell libraries:

- Commit-subject parsing remains in `scripts/lib/commit-subject.sh`. Invoke it
  across one explicit `sh -c '. "$1"; …'` process for the complete subject
  stream, not one shell per commit.
- Baton-path and roster lookup remain in `state-dir.sh` and `roster.sh`, also
  through an explicit shell child with `BP_CODE_ROOT`, state/roster overrides
  and arguments passed through. Do not source them into the adapter.

Everything else in `dod-gate.sh` moves: range traversal, lifecycle lookup,
test-root validation, realpath containment, file walking, title matching,
messages and stage decisions.

### Notes, output and exit status

The adapter creates one private note directory for a forwarded call and passes
it as `DOD_GATE_NOTE_DIR`. Note records are **file-framed**, not delimited in a
single shell-readable stream: the CLI writes a decimal count plus one numbered
payload file per note; each file is one complete payload, written with no added
trailing newline. The adapter invokes Node without capturing stdout/stderr,
saves `rc=$?` immediately, reads records `1..count` in numeric order, calls the
parent's `pipe_note` once per record, removes the directory, and returns the
saved status. This framing preserves embedded newlines and two or more notes in
one stage without depending on a newline or NUL delimiter that POSIX `read`
cannot consume portably. The sourced body is POSIX (`/bin/sh` callers include
dash), installs no trap in its parent, and never uses `local` or `[[`.

If `pipe_note` is not defined, the adapter prints each record as `note: …`;
a sourced library remains usable outside the renderer. Failure to create or
read the private record set is a loud internal failure with status greater than
1, never a run with notes silently disabled. A partially written record set is
invalid and must not be interpreted as a policy verdict.

All ordinary text stays on the same stdout/stderr stream as today. Direct CLI
invocation without an adapter prints notes visibly as `note: …` on stdout.
Under a buffered real `pipe_stage`, replay is byte-identical because
`pipe_note` concatenates payloads with no separator. A failing buffered stage
does not render its notes in either implementation; the port must not change
that behavior.

The accepted deviation is only the unbuffered path used by CI: note text and
relative note order are preserved, but notes move from their call sites to the
end of that stage's child output. The differential corpus records this as an
allow-listed positional delta, and the port commit body names it. No FIFO or
background reader is permitted; `pipeline.sh` explicitly avoids per-stage
background processes.

This protocol is covered by a real rendered-pipeline test. The existing
`tests/dod-gate` stub deliberately discards `pipe_note`, so it cannot prove this
boundary.

### Exact sourced-adapter enforcement

Before the port, extend `scripts/shell-inventory-check.mts` with a source-bridge
validator that is file-specific to `scripts/lib/dod-gate.sh` and accepts only
the generated adapter form plus a tracked adjacent `.mts` target. It parses the
ordered pairs with function tokens constrained to
`^[A-Za-z_][A-Za-z0-9_]*$` and subcommands to `^[a-z][a-z0-9-]*$`, re-renders
the canonical whole file, and compares bytes. The bridge body and note protocol
are fixed; only the target stem and parsed ordered pair list are renderer
inputs. Keep the base-vs-HEAD anti-self-authorisation model:

- a legacy row may disappear only when its file is gone, an exact exec shim, or
  an exact source bridge;
- once the migration is itself BASE, the bridge remains recognised without a
  legacy row (the BUG-145 requirement);
- no pushed inventory row can bless an arbitrary bridge or grow the exempt
  list; and
- any non-forwarding command or additional function body makes the bridge
  ordinary changed shell and fails the gate.

The repository rule added to `CLAUDE.md` with the port is a ceiling: this form
is admissible only when a still-legacy-shell caller must source the migrated
library. An executable always uses the existing exact two-line exec shim. The
current validator recognises only `dod-gate.sh`; a second sourced library must
earn an explicit extension and review rather than broadening this parser by
analogy. Semantic pair correctness belongs to `tests/dod-gate`, not to an
inventory checker with no authoritative map.

Keep the migration-shape implementation duplicated between the blueprint-only
checker and `tests/helpers/shim.ts`, as TASK-067 currently does for executable
shims. The checker and `tests/shell-inventory` are export-ignored while the test
helper ships to derived projects, so importing the checker would break the
derived suite. Rename/generalise the helper around "shell migrations" and add
cross-cases which feed the same valid and invalid source bridges to both
implementations; drift must make one suite red, never let both pass different
shapes silently. Extracting a shared shipped TypeScript module is optional only
if its runtime/module-resolution cost is proven first; it is not required for
this port.

### Derived projects

A full pull or bootstrap delivers both files because both are in the archive.
The derived project's `.githooks/pre-push-project` stays unchanged, including
its managed markers and every byte below `BLUEPRINT:END`; it continues to source
`dod-gate.sh` and call the same four functions. Project-owned guards therefore
do not move and do not need a migration.

An old or partial checkout with only the adapter fails closed at the first DoD
stage and names `blueprint pull scripts/lib/dod-gate.mts`. Do not let a missing
target turn into four skipped stages or an empty success.

The inverse partial state—`dod-gate.mts` present while the old full shell file
remains—cannot diagnose itself because callers still execute the old shell.
Both files are managed, so detecting that target-without-adapter direction is
`blueprint drift`'s job, not another runtime fallback.

## 4. Port sequence

Every numbered commit below uses BUG-147, but the behavior-changing BUG-147 fix
still stays after the policy-preserving port. That port has only the explicitly
accepted CI note-position deviation and documented removal of shell leakage.

### Preparation commit A — teach the inventory one sourced migration form

1. Add the strict source-bridge parser/validator and its negative matrix to
   `tests/shell-inventory`.
2. Generalise the deliberately duplicated `tests/helpers/shim.ts` resolver so
   fixtures recognise both exact executable shims and exact sourced adapters;
   pin the same corpus against the production checker.
3. Prove against the still-unported tree that:
   - the current legacy `dod-gate.sh` remains accepted;
   - an exact bridge with a tracked target is accepted;
   - missing/untracked/wrong targets fail;
   - one extra shell command fails;
   - malformed tokens, duplicate declarations and any byte not emitted by the
     canonical renderer fail;
   - offering the sourced form for an executable or any file other than the
     reviewed `dod-gate.sh` migration fails; and
   - BASE still prevents a push from authorising its own new bridge.

   Do not add a checker case for a semantically wrong function-to-subcommand
   mapping: no inventory fact says what that mapping should be. The sourced API
   cases in `tests/dod-gate` are the behavioral authority.

### Preparation commit B — make consumers bridge-aware while shell is still live

1. `tests/dod-gate`:
   - copy the resolved `.mts` target whenever its fixture copies
     `dod-gate.sh`;
   - keep driving the sourced API so the adapter itself is exercised;
   - make `#0` inspect the resolved implementation rather than requiring
     `dod_items_in_push` text in the adapter;
   - make `#17` read a typed exported extension policy or assert behavior,
     rather than parsing shell `find -name` syntax;
   - update the two prose references that call `dod-gate.sh` the home of the
     extension rule; and
   - keep all **64 collected cases** (from 57 `it(` sites) green against the
     unported shell.
2. `tests/commit-subjects` copies the resolved target into the CI fixture; its
   hard-coded four-library copy list is otherwise guaranteed to create a
   targetless adapter.
3. Add a pipeline-boundary case that runs a note-producing DoD stage through
   real `pipe_stage` and asserts the note remains on the passing result line,
   stdout remains buffered, the stage count increments once, and failure exits
   closed once. Add a two-note stage so the test proves record framing, payload
   bytes and replay order rather than only the one-note happy path.
4. Inspect the dynamic consumers named in the brief:
   - `manifest` derives the shipped/managed suite and hook facts;
   - `ts-bridge` runs shell inventory, ShellCheck and scripts typecheck;
   - `pipeline` owns note/render semantics;
   - `marker-merge` owns the unchanged managed/project split in
     `pre-push-project`; and
   - `bootstrap-gate.release` materialises committed HEAD and runs the derived
     gate.

   They contain no additional direct `dod-gate.sh` path copies at the current
   tip, but their dynamic checks must be run; source grep alone cannot certify
   them.

Both preparation commits must pass before any production shell changes. That is
the evidence they weakened no existing rule.

### Port commit — policy-preserving, no test edits

1. Add `scripts/lib/dod-gate.mts` and replace the 573-line shell implementation
   with the exact sourced adapter.
2. Remove `scripts/lib/dod-gate.sh` from the inventory's legacy map; do not add
   it to `exempt`.
3. Update `CLAUDE.md`'s TASK-067 rule with the sourced-library ceiling: exact
   re-rendered adapters are allowed only where a still-shell caller sources the
   migrated file, never for executables. Keep the form file-specific to
   `dod-gate.sh` in this implementation.
4. Change no test and make no BUG-147 extension widening in this commit.
5. Typecheck `scripts/`, ShellCheck the adapter, run the full non-release suite,
   and run `dod-gate`, `commit-subjects`, `shell-inventory`, `manifest`,
   `ts-bridge`, `pipeline` and `marker-merge` explicitly.
6. Commit before `bootstrap-gate.release`: that suite creates its derived tree
   from committed HEAD, so an uncommitted port is invisible to it. Then run the
   release suite and the full derived pre-push gate.
7. After the release, differential and mutant evidence exists, amend only the
   commit message (the tree must remain unchanged) to record: the accepted
   CI-only note-position deviation;
   the 57-site/64-collected-case distinction; the measured ~37 ms startup and
   ~0.15 s four-stage cost; full-suite/release results; differential results;
   and D1-D8 mutant results.

### Differential corpus — old shell versus the committed port

Materialise the port's parent version of `dod-gate.sh` into an isolated fixture
and run the old functions beside the new adapter/CLI over the same trees. Compare
exit code, stdout, stderr, note payloads and file effects. At minimum cover:

- no item commits; BUG/TASK/FEATURE extraction; multiple ranges; an invalid or
  unreadable range (including today's swallowed `git log` error behavior).
  Include whitespace-separated multi-ref input from `push_log_opts`, and pin
  `LC_ALL` for item-order cases (mandatory `C`, plus one installed non-`C`
  locale) so the port proves ambient `sort -u` behavior rather than accidentally
  substituting Node code-unit order;
- cwd different from `BP_CODE_ROOT`, with conflicting sentinel trees swapped in
  both directions. This must preserve the existing split: lifecycle rows,
  `findings.md`, `project_config_paths.md` and `pwd -P` containment use cwd,
  while shipped-library and default-test-root lookup use `BP_CODE_ROOT`;
- rows in each lifecycle state, cancellation, absent row, zero padding, and NUL
  bytes in both lifecycle row files and `docs/config/findings.md`;
- no BUGs, parked/cancelled BUGs, tested/untested/justified BUGs, NUL-bearing
  specs, title-only matching and multiple BUGs;
- absent, malformed, duplicate and globbed `BP_TEST_ROOTS` declarations;
- missing/outside/symlinked/contained roots; shallow shipped `tests/` versus a
  recursive declared root;
- absent/malformed/empty/unrostered/rostered/`Nobody` baton states, with and
  without roster and state overrides;
- judgement output and note;
- buffered and unbuffered `pipe_note` paths, including one passing stage that
  emits two notes. Compare each payload byte-for-byte and in order; allow only
  the founder-approved movement of unbuffered CI notes to the end of the child
  output;
- a failing note-producing stage, proving buffered notes remain unrendered in
  both implementations; and
- missing Node, missing `.mts` target, a helper shell process failing and a
  forced CLI exception. None may be reported as policy status 1.

Allow only the documented removal of caller pollution: `_dg_*`, sourced helper
functions and the temporary glob-option toggle no longer escape the child.
Before allowing removal of the `BP_STATE_ROOT` assignment, run a real pipeline
with alternate state-root inputs and compare feed path/content to prove the
assignment is inert despite `feed_append` reading it at call time. If that proof
fails, preserving the effect is part of the port. Assert that cwd,
`AGENT_FEED_TAG`, `_PIPE_*`, the caller's pre-existing environment and shell
options are otherwise unchanged.

### Mutant — prove the suites execute the port

After the differential is clean, re-run the suite's already recorded **D1-D8**
mutants against the TypeScript port; do not invent a new one:

1. D1 — `itemsInPush` returns nothing; `#8` names the cause and its recorded
   downstream cases fail.
2. D2 — zero-padding normalisation is removed; `#2` and `#4c` fail.
3. D3 — a missing lifecycle row returns success; `#1` fails.
4. D4 — the parked/backlog exemption is removed; `#4c` fails.
5. D5 — any row, rather than specifically a parked row, grants the exemption;
   `#4`/`#4c-promoted` fail.
6. D6 — TASK/FEATURE items are made to require regression tests; `#4b` fails.
7. D7 — absent or malformed batons stop failing; the `#5` absent/rows cases
   fail.
8. D8 — judgement output is silenced; `#6` fails.

Revert each mutant before applying the next and finish with a clean diff. D1 in
particular proves the adapter reaches TypeScript rather than a copied shell path
or stale fixture; the full set proves the existing policy branches survived the
port.

Record the full-suite, differential and mutant evidence in the port commit body,
following BUG-144's precedent.

## 5. BUG-147's reproducer and fix after the port

Do not cherry-pick `58ff781` or `35d902d` whole. They target the shell
implementation and their documentation context predates this port. Translate
their intent into the new boundary:

1. **Reproducer commit, still red.** Port `58ff781`'s two tests:
   - `#11c`: a derived project declares `frontend/src`; a real
     `configLoader.bug216.spec.js` whose `it()` title names BUG-216 must count;
   - `#11d`: README prose and `*.test.js` under that same declared root must not
     count.

   Update `#17` through the typed policy/behavior interface established in the
   preparation commit, not by scraping `.mts` source syntax. The positive must
   fail against the policy-preserving port; the negative must already pass.
2. **Fix commit.** Translate `35d902d` into TypeScript:
   - a root equal to or below `${BP_CODE_ROOT}/tests`, the directory governed by
     the shipped `tests/vitest.config.ts`, remains limited to
     `*.spec.ts`/`*.spec.tsx`;
   - any other accepted project-owned declared root also counts
     `*.spec.js`, `*.spec.jsx`, `*.spec.mjs` and `*.spec.cjs`;
   - `*.test.*`, prose, symlinks and excluded/contained roots still never count;
     and
   - update DoD §2 in the same commit so it no longer claims one TypeScript-only
     rule for project-owned runners.
3. Kill a BUG-147 mutant by removing `.spec.js` from the project-owned set:
   `#11c` and the exact-set guard must turn red while the TS-governed cases stay
   green.
4. When this ships, tell storm2flow's Sylvia to remove its live workaround: the
   forced `.spec.ts` rename and the added TypeScript include in
   `frontend/vite.config.mjs`.

## 6. Risks and split triggers

1. **The sourced adapter becomes a loophole.** Mitigation: exact generated
   bytes re-rendered from constrained pairs, a tracked target,
   BASE-authorised recognition, the executable ceiling, and a file-specific
   first template.
   Split trigger: if validation needs a general shell parser, stop; the boundary
   is no longer small enough.
2. **Notes silently disappear at the process boundary.** This is the highest
   behavior risk because passing stdout is buffered and invisible. The real
   pipeline test and two-record framing case are mandatory;
   `tests/dod-gate`'s no-op stub is not evidence. Unbuffered CI note movement is
   accepted and must be documented, not misreported as identical output.
3. **The port copies a still-shell rule.** Commit-subject, state-dir and roster
   behavior stay across explicit shell process boundaries. Duplicating any of
   them in TypeScript is a review blocker.
4. **Fixture isolation escapes to the real checkout.** Every helper subprocess
   receives fixture `BP_CODE_ROOT`, state, roster and cwd explicitly. Missing
   fixture input must fail, never fall back to this checkout.
5. **Node traversal differs from `find`/`grep`.** Symlink handling, shallow
   depth, binary/NUL files, unreadable entries, locale/order and title regex
   semantics belong in the differential corpus. So does cwd different from
   `BP_CODE_ROOT`; normalising the file's deliberately mixed bases is a
   regression, not cleanup. Shell word-splitting and locale-sensitive `sort -u`
   ordering must also survive.
6. **`sh -e` changes wrapper control flow in CI.** The adapter must explicitly
   save and return statuses; do not depend on ambient `errexit`. Run the actual
   workflow block through `tests/commit-subjects`.
7. **Partial pulls install only half the pair.** Fail closed with the exact
   target-pull instruction. A full pull/bootstrap remains the supported atomic
   delivery; `blueprint drift` owns the silent inverse state. If target
   dependency following becomes a general product need, file it separately; do
   not port the 2,257-line `scripts/blueprint` here.
8. **Runtime cost grows.** The measured startup cost is settled at about 0.15 s
   across four stages on a 142 s gate. Record the final local and CI-shaped
   measurements, but do not collapse four visible stages to optimise it.
9. **The old shell's leaked globals were an undocumented dependency.** Tree
   search finds none. The differential explicitly snapshots public parent state
   and documents the intentional removal rather than pretending byte identity.
   `BP_STATE_ROOT` is removed only after the feed-effect test proves its current
   assignment inert.
10. **The implementation owner must be able to run fixture Git suites.** The
    64-case DoD suite, commit-subject workflow fixture and bootstrap release
    proof create Git repositories. Under the current provider capability rule,
    Codex must not own the port because it cannot verify those suites; design
    review by Codex is still appropriate.
11. **The scope starts pulling `pipeline.sh` or `pre-push-project` into the
    port.** Stop and re-review the boundary. That is Option D, not an incidental
    addition to BUG-147.

## Rollback

Before the behavior-changing BUG-147 fix, rollback is one revert of the port
commit plus its preparation commits in reverse order; the old source callers
never changed. After the fix, revert the BUG-147 fix and reproducer first, then
the port. Never leave the sourced adapter without its `.mts` target or restore
the legacy inventory row to a hash that does not match the restored shell.

## Ready to implement

Execute these commits in order; each commit has one proof obligation:

1. **Preparation A — inventory shape.** Add the file-specific re-render
   validator, duplicated fixture resolver and negative/BASE matrix. Prove the
   current legacy tree still passes, the exact tracked bridge passes, every byte
   outside the renderer fails, and sourced adapters remain unavailable to
   executables and unrelated files.
2. **Preparation B — consumers and boundary tests.** Make fixtures and prose
   resolve the implementation, add real one-note/two-note pipeline coverage,
   and keep all 64 collected DoD cases plus the named dynamic consumers green
   while the production shell is still unported. This proves preparation did
   not weaken an existing rule.
3. **Policy-preserving port.** Add `dod-gate.mts`, replace the shell with the
   exact adapter, remove its legacy inventory row, and add the sourced-library
   ceiling to `CLAUDE.md`; change no test and no BUG-147 behavior. Prove the full
   non-release suite, explicit consumer suites, old-vs-new differential (with
   only the accepted CI note-position delta), `BP_STATE_ROOT` inertness, D1-D8,
   the committed-HEAD release suite and a full derived pre-push gate. Record all
   evidence and the accepted deviation in the commit body.
4. **BUG-147 reproducer.** Add translated `#11c/#11d` only. Prove the real
   project-owned `*.spec.js` positive is red on the policy-preserving port and
   the README/`*.test.js` negatives remain green.
5. **BUG-147 fix.** Widen only accepted project-owned roots, retain the shipped
   `tests/` TypeScript rule, update DoD §2 in the same commit, and kill the
   `.spec.js`-removal mutant. Prove the full suite and derived gate, then hand
   storm2flow the two workaround removals.
