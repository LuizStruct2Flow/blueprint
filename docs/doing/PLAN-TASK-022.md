# PLAN — TASK-022: anchor the rules in mechanisms, and shrink what agents must remember

**Founder direction, 2026-09-10, in their words:**

> *"I think we should rely in automation and not in agents having all rules in
> their context and being disciplinated on applying these rules."*
>
> *"the bottom line will be we'll have less 'context and memory', the md files
> will be used for documentation, and we will anchor the controls in the ci and
> development lifecycle."*

**Status: plan, not started.**

---

## 1. What triggered it, because the evidence is the argument

The founder asked for a cross-review of `docs/way-of-working.md`. Two reviewers
(Sylvia/Claude, Kathrin/Codex) independently concluded its strongest untold story
was that *controls are required to be checkable and are repeatedly caught lying.*
Kathrin proposed pitching it as **"we test whether the gates are lying, and our
process routinely catches them lying."**

The founder rejected that line as false:

> *"this is not true, if I don't push back, nobody does... For instance we have
> the rule related to always printing code coverage after commit, I'vent seen any
> coverage reports for ages."*

**They were right, and verified:**

- The gate's only coverage stages are `backend/` and `frontend/`. **Neither
  directory exists in this repo.** Every push prints
  `skipped · no backend/ directory`.
- `tests/vitest.config.ts` has **no coverage configuration at all** — the word
  appears once, in a comment about a glob.

So the rule *"run and report test coverage before every commit/push"* has been
vacuous for the blueprint's entire existence, and it is getting worse: there is
now real TypeScript logic (the harness, the bridge, soon the internals) and none
of it is measured. **BUG-005's shape inside the coverage rule.** It was found by
the founder, not by any control.

### The same audit, one level up

`scripts/lib/dod-gate.sh` has **four stages for the DoD's eight §1b rules**, and
the fourth announces that it verifies nothing:

```
✓ §1b·1 every item has a backlog row
✓ §2   every BUG has a regression test
✓ §7G  the live baton is well-formed
✓ §D·F·H judgement — printed, not verified
```

So **cross-provider review — rule 4 of 8, and the thing the deck advertises as
the differentiator — has no mechanism.** Nor does doc-sync. Nor does
"one item per commit", which `CLAUDE.md` concedes "the hook cannot check".

**The pattern is unambiguous.** Mechanised rules held: `.githooks/commit-msg`
rejects a malformed subject; `scripts/no-chain-guard.sh` blocks chained commands;
`tests/manifest` catches an unclassified suite; §1b·1 caught a missing BUG-053
row during this very sequence. Prose-only rules decayed silently, every one.

`no-chain-guard.sh`'s own header states the thesis: it exists *"because the rule
above lived here for weeks while an agent broke it through an entire session
believing it was complying."*

---

## 2. The test for whether a rule should exist

**Can it fail?** If nothing can make it fail, it is not a rule — it is a wish
with good intentions.

---

## 3. Automating a rule creates a new control, and a new control needs a mutant

**This is the guard-rail on the whole task, and without it TASK-022 makes things
worse.**

Every defect catalogued this week was a control asserting something untrue: a
DoD stage enforcing nothing, a scanner aimed at absent languages, an assertion
that printed its own failure 28 times and exited 0, an assertion passing
vacuously for years about a file the project did not have.

Mechanise forty rules without proving each can fail and we replace decaying prose
with **lying automation** — strictly worse, because prose nobody follows is
visibly ignored while a green check is actively trusted.

**So TASK-018's R6 applies to mechanisms, not only to tests:** every new control
ships with a recorded way to make it fail, and that mutant is run once.

---

## 4. The anchor is chosen per rule, not defaulted to CI

Three layers, different properties. Picking wrongly makes a rule
unenforceable-in-practice even though a check exists.

| Layer | Property | Example | Use when |
|---|---|---|---|
| **PreToolUse hook** | **prevents** — the mistake cannot be made | `no-chain-guard.sh` | the violation is cheap to detect and expensive to undo |
| **commit-msg / pre-commit** | blocks at the commit boundary | `.githooks/commit-msg` | the rule is about a commit's shape, and CI could only report it after a rewrite is needed |
| **pre-push gate** | blocks before work leaves the machine | `tests/manifest`, DoD stages | the rule needs the whole tree, and fast feedback matters |
| **CI** | backstop, and the only layer a developer cannot skip | scanners, full suites | the local gate may skip it (missing tool), or it is too slow to block on |

**Two rules that CI cannot own:**

- *One item per commit* — enforceable only at `commit-msg`; in CI the remedy is
  a history rewrite.
- *Cross-provider review* — in CI the review necessarily happens **after** the
  code is written, so the check can only refuse the push. That may be
  acceptable, but it is a different rule from "review before you finish".

---

## 5. What prose keeps — its job changes, it does not go to zero

Two things a mechanism genuinely cannot do:

1. **The *why*.** A guard with no recorded reason gets "simplified" away. This
   repo has that evidence repeatedly — the comment is what stops the next author
   deleting the check. That is **provenance**, not instructions-for-agents, and
   it belongs next to the mechanism rather than in a document an agent must load.
2. **The honestly-unenforceable.** The DoD's `§D·F·H judgement — printed, not
   verified` stage is the *right* pattern: it declares that it checks nothing
   rather than implying it does. The defect is not that the stage exists — it is
   that three rules hide behind it and nothing else covers them.

**So: rules become mechanisms; prose becomes provenance; anything that can be
neither is explicitly labelled unchecked rather than left to look enforced.**

---

## 6. The work

### Phase 1 — the audit (produces a gap list, changes nothing)

Walk `CLAUDE.md` and `docs/DoD.md` rule by rule. For each, record: the rule, its
anchor layer today (if any), the file:line of its mechanism (if any), and one of
three dispositions — **mechanise**, **delete as aspiration**, or **label
explicitly unchecked**.

Deliverable: a table. Expect it to be uncomfortable; CLAUDE.md is ~1,200 lines
and most of it is currently instruction rather than mechanism.

### Phase 2 — the meta-check, so it cannot regress

**This is the direct answer to the founder's question — *"how can I be sure the
auditors will be spawned?"* — and the answer is that you do not check that they
ran, you check that the enforcement exists.**

Enumerate the rules, enumerate the gate stages and hooks, **fail on a rule with
no anchor.** `tests/manifest`'s pattern applied one level up, and it would have
caught the coverage rule on day one, because "coverage" maps only to two stages
that can never run here.

**The real cost, stated plainly:** this needs the rules **machine-readable**, and
today they are prose. That is the bulk of the work, and it is why Phase 1 comes
first — the audit produces the machine-readable list as a by-product.

**An auditor AGENT is explicitly not the answer.** An agent that must be spawned
has precisely the same failure mode as a rule that must be remembered, and you
cannot tell that it did not run. Where judgement is genuinely required, wire the
**trigger** rather than the intention: `security.yml` already has
`cron: "17 3 * * *"`, so a scheduled job can dispatch a reviewer whether anyone
remembers or not.

### Phase 3 — close the two already named

- **Coverage measured and thresholded for the TypeScript suites.** Config, not an
  agent. Then delete or repoint the two stages that can never run here.
- **Cross-provider review made checkable**, even weakly — e.g. a push touching
  `scripts/` must reference a review artefact. Weak and checkable beats strong
  and imaginary.

### Phase 4 — shrink CLAUDE.md

Only after Phases 1–3. **CLAUDE.md ships to every derived project**, so
shrinking it changes what every project inherits — that is a real change, not
tidying, and it should follow the mechanisms rather than precede them.

---

## 7. Success measures

- Every rule in `CLAUDE.md` and `DoD.md` has a named anchor, or is deleted, or is
  explicitly labelled unchecked. No rule is silently unenforced.
- A rule with no anchor **fails the gate**.
- Every control added by this task has a recorded mutant, run once (§3).
- The coverage rule reports a real number, or does not exist.
- `CLAUDE.md` is materially shorter, and what remains is provenance rather than
  instruction.

---

## 8. What would make this fail

- **Mechanising without mutants** (§3) — replaces decayed prose with trusted
  lies.
- **Defaulting every rule to CI** (§4) — some rules are unenforceable there.
- **Doing Phase 4 first.** Deleting the prose before the mechanisms exist removes
  the only thing currently carrying those rules, however weakly.
- **Building an auditor agent** and believing the problem is solved.
