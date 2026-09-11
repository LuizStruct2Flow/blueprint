# TASK-018 — the testing rules

**Agreed with the founder, 2026-09-09.** Seven rules. Each one names how it is
enforced, because this repo's own doctrine is that a rule nothing checks is not
a rule (BUG-005).

These govern the blueprint AND every derived project, since the test machinery
ships. They replace CLAUDE.md §"Test Layers" and §"Test directory layout" when
this task lands.

---

## R1 — Tests are BDD specs in TypeScript, and they are the only description of themselves

The `describe` names the bug or behaviour it guards; the `it` names the case.

**No `SUITES.md`, no tier table, no catalogue of tests.** A second description
of a test is a copy that drifts — which happened twice in one afternoon while
building the thing this rule deletes.

*Enforced by: deleting the second copy. Nothing to check.*

---

## R2 — Location determines propagation, and tests sit beside what they test

- `scaffolding/` — everything that ships to derived projects.
- `forge/` — the machinery that creates and syncs projects. Never ships.
- Tests are **co-located** with the code they test, not in a parallel `tests/`
  tree. (CLAUDE.md already required this; the old `tests/<suite>/` layout was
  violating the repo's own rule.)

*Enforced by: the filesystem, plus one `export-ignore` line. A mismatch between
"what ships" and "what is declared to ship" becomes unrepresentable rather than
merely detected — which retires an entire class of reconciliation check.*

---

## R3 — Mock by default. What cannot be mocked runs in a sandbox it cannot escape

Most tests mock their dependencies and are fast. The few that must drive real
git, real processes or the real filesystem get a sandbox: own temp dir, own
`HOME`, own `AGENT_*` variables, own process group. **There is no function a
test can call to get an unsandboxed environment.**

Not "tests should stay in their sandbox" — a test has no way to leave it.

*Why it must be that strong:* BUG-046 and BUG-047 were each ONE missing line in
a test. One overwrote the live coordination baton mid-review, exiting 0. The
other rewrote the real repository's git config and set `core.hooksPath` — the
A-22 failure, produced from inside a test. Both survived months of review, and
the guard meant to catch the second chose which tests to check by grepping their
comments.

*Enforced by: no primitive that bypasses it; the sandbox's own specs, which
deliberately try to escape and must fail; and a canary asserting the real baton,
feed and `.git/config` are byte-unchanged after every test.*

*Trajectory:* as the internals move from shell to TypeScript, more becomes
mockable and the sandbox shrinks to a thin boundary. That is the intended
direction, not a compromise.

---

## R4 — Tests never wait a fixed amount of time

They wait for a condition, or they control the clock.

*Why:* every timing failure found today was a fixed sleep guessing at a
duration — `--daemon` sleeping 0.4s for a lock that lands at 0.6s and reporting
a healthy process as failed; a test sleeping 1.5s against a tick that was taking
10s; two bounds that passed alone and failed under load. None were real defects.

*Enforced by: a lint rule banning bare timers in specs, and `waitFor(condition)`
as the only sanctioned way to wait at the real boundary.*

*Known weakness, stated rather than papered over: a poll bound that is simply
too tight still passes the lint rule. Set bounds from a measurement, not a
guess.*

---

## R5 — Tests run in parallel. There is no serial category

**And no escape hatch, deliberately.** If a "run this one alone" marker exists,
it will be used, and a declared exemption is exactly how complexity returns.

**A test that appears to need serial execution is a bug in that test** — it is
reading or writing something it does not own, which R3 forbids.

*Consequence accepted explicitly: a test that cannot be made isolated is not
finished. It does not get a temporary marker to keep it green.*

*Enforced by: the runner runs concurrent; R3 is what makes that safe.*

*Note: "we ran it twice at once and it passed" is NOT evidence of
parallel-safety. Proven today — a suite passed self-concurrency while its hazard
survived, because both copies avoided the shared target. Isolation is the
evidence; a concurrency smoke test is not.*

---

## R6 — A test that guards a bug must be provably able to fail

For every bug a test exists to catch, there is a recorded way to reintroduce it,
and doing so must turn a **named** test red.

*Why:* a passing test proves nothing about whether it still catches anything.
`a2bp-contamination`'s headline assertion was dead for months — with the defect
injected it printed the failure **28 times and still exited 0**. The DoD gate
enforced nothing on macOS while printing PASSED.

*Enforced by: running the mutant ONCE, at the moment a test replaces something.*

**Deliberately not continuous.** A CI mutation runner is real machinery and real
minutes, and building it now is the kind of thing that gets abandoned
half-finished. Once-at-migration catches the risk we actually have. It decays —
a test can rot later and nothing notices — and the answer to that is to build
the continuous runner *if we observe rot*, not before.

---

## R7 — A skipped or empty test fails the build

*Why:* a test run with everything skipped exits 0. That is BUG-005 in its purest
form — covering nothing while reporting success.

*Enforced by: runner configuration. One line, no ongoing cost.*

*Consequence accepted: a test that only makes sense on one platform cannot be
skipped elsewhere. It either runs everywhere or does not exist. Today supports
this — every macOS defect was found precisely because nothing was skipped on the
unusual platform.*
