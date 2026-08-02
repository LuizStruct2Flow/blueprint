# Review request — BUG-005 (pre-push ceiling removed) + the signal-dispatch question

**Requested by:** Eto (Orchestrator, Claude Code) · 2026-08-02
**Reviewer:** a Codex persona (Alexey — Architect, or Jesko — QA-2)
**Record your review in:** `docs/doing/CODEX-REVIEW-BUG-005.md`
**Commits under review:** `62d2791` (BUG-005), and its dependencies
`d1f1887` + `61a50a3` (FEATURE-002, the pipeline renderer the decision leans on)

---

## What changed, and why you are being asked

The pre-push gate had a **hard 30 s wall-clock ceiling**. The founder removed it:

> "I don't need this 30 seconds ceiling, as long as I see that the gates are
> working and doing what they need to do."

The argument I made, and which you should attack:

**The ceiling had stopped being a performance budget and had become a coverage
policy — silently.** When a suite outgrew the budget the cheapest response was
to demote it to CI-only, and the gate carried on printing "all checks passed"
over a smaller set. Every exclusion below was made on the clock, and each was
documented as regrettable *at the time it was made*:

| Suite | Was | Stated reason |
|---|---|---|
| `a2bp-contamination` (41 assertions) | CI-only | grew 2.3 s → 6.0 s. Guards the door **BUG-002** and **A-09** came through. Removal recorded as "a REDUCTION in what blocks a push". |
| `staleness/test.sh` | CI-only | "a forced choice, not a preference" |
| `signal-set` | CI-only | costs **0.2 s**; excluded by a "keep only fast, push-critical suites" rule that existed only because the gate sat at 27.6 s of 30 s |
| `agent-activity-bound` | `--fast` | dropped the race / fault-injection cases guarding **BUG-001** (~24 of 32 threads pegged for 2.7 days) |
| `pre-push-secrets` | `--fast` | dropped the cases proving the scan fails **CLOSED** when it cannot finish |
| `roster` | `--fast` | dropped the live-supervisor case — the half of BUG-010 the founder actually hit |
| `drift-integration` | 2 of 5 cases | budget |

All are restored. **19 → 22 stages, 32.5 s → 63.8 s.**

The ceiling is replaced by a rule rather than deleted: **coverage is decided on
risk, never on the clock** (`CLAUDE.md` §"Pre-push tolerance", `docs/DoD.md`
§3.7). Never demote a suite to fit a budget; a skip must state a reason and the
reason may not be the clock (`pipe_skip` requires one, so a silent skip is not
expressible); and the gate reports its total **and its slowest stage** every run.

---

## Question 1 — is removing the ceiling right, and is the replacement rule real?

Specifically:

1. **Is "coverage is decided on risk, never on the clock" enforceable, or is it
   a slogan?** The old rule had a number, which is what made it checkable — and
   also what made it bite. Mine has `pipe_skip` requiring a reason string, a DoD
   checklist item, and per-run timing visibility. Is that enough to stop the
   gate drifting to five minutes, or have I traded a rule that worked badly for
   one that will not work at all?
2. **Does 63.8 s change developer behaviour?** The honest risk is `--no-verify`.
   A gate people bypass is worse than a fast gate with gaps, and I may have
   optimised for the wrong failure. Is there a threshold at which you would
   argue for a *soft* warning (loud, non-blocking) rather than nothing?
3. **Is anything in the restored set actually not worth blocking a push?** I
   restored everything that was cut on the clock, on the principle that each was
   a budget decision rather than a risk one. That is an argument from provenance,
   not from merit — check the merit.
4. **Reproduce the numbers.** `sh .githooks/pre-push origin <url> </dev/null`.
   I measured 63.8 s with `agent-activity-bound` at 29.5 s.

## Question 2 — `tests/signal-dispatch/` at 125.4 s

This is the one exclusion I did **not** make for the founder, and the one the
founder explicitly wants your view on.

- It costs **125.4 s** — roughly **2× every other stage combined**.
- It guards the Codex/Gemini dispatcher watcher — *the mechanism that is
  dispatching you right now*.
- I left it in CI and argued that is a **risk** call, not a clock one: the
  dispatcher is not on the push path, so a regression cannot corrupt a commit.

Attack that:

1. **Is "not on the push path" the right test?** A broken dispatcher does not
   corrupt a commit, but it silently stops the multi-agent protocol — and this
   repo's history says silent failures are the expensive ones (BUG-010,
   BUG-004, the `null` PR in BUG-011). Does "cannot corrupt a commit" understate
   the blast radius?
2. **Is it the same reasoning that produced BUG-005?** I excluded a suite partly
   because it is slow, then wrote a rationale for why that is fine. That is
   structurally identical to the pattern I just spent a commit criticising. Tell
   me if I have reproduced the defect while claiming to fix it.
3. **Is 125 s reducible?** If the cost is sleeps waiting on a 2 s-poll watcher,
   a tick override (the pattern `AGENT_FEED_TICK` uses, already at 0.25 s in
   another suite) might cut it by an order of magnitude and make the question
   moot. That would be the best outcome — check whether the suite's time is
   *inherent* (negative assertions, which cannot be polled for) or merely
   *unoptimised*.

---

## Ground rules

- **Verify against the code, not this document.** Where I assert a number, a
  reason, or a history, check it. Previous rounds found that roughly half of my
  claims outran what the code proved.
- Findings as `F1/F2/…` with severity, file:line, and a concrete failure
  scenario or reproduction.
- If you disagree with the founder's decision itself, say so plainly — it is a
  decision, not a constraint on your analysis.
- **Do not push.** Record the review, flip the mic back to `OVER_TO_ETO`.
