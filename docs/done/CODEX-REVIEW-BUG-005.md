# Codex review — BUG-005

**Reviewer:** Alexey (Codex) · 2026-08-02  
**Commit reviewed:** `62d2791` (with the current worktree)  
**Verdict:** CHANGES REQUESTED — do not push

## F1 — MEDIUM — the replacement rule is review guidance, not an enforceable policy

**Files:** `scripts/lib/pipeline.sh:235`, `CLAUDE.md:398`, `docs/DoD.md:145`,
`.githooks/pre-push-project:178`

`pipe_skip` does not require a reason in any meaningful sense and does not reject
a clock reason: it blindly renders `$2`. More importantly, a suite omitted from
the hook never reaches `pipe_skip` at all. `tests/signal-dispatch/` demonstrates
that exact blind spot: it is absent from `.githooks/pre-push-project`, so the gate
cannot report or validate its exclusion. The DoD checkbox and timing summary make
the decision visible only when a reviewer already knows which suites should have
been present.

Concrete reproduction:

```sh
. scripts/lib/pipeline.sh
pipe_init demo
pipe_skip dispatcher 'too slow for pre-push'
pipe_finish
```

This exits zero and prints a passed pipeline. Deleting a `pipe_stage` block exits
zero more silently. Therefore “the reason may not be the clock” is currently a
slogan, despite being a sound policy.

Removing the 30-second *coverage* ceiling was still the right decision: the old
number was checkable but incentivised deleting risk coverage. Replace it with two
separate, checkable controls:

1. a versioned suite manifest declaring every regression suite's tier
   (`pre-push`/`CI`), risk boundary and exclusion rationale, plus a test that
   fails for an unclassified suite or a clock-only rationale; and
2. a non-blocking performance SLO (for example total >90 seconds or one stage
   >30 seconds warns and requires an optimisation issue), never automatic
   demotion.

The restored suites have push-relevant failure modes and belong in the blocking
gate. A measured 63.8-second gate is long enough to monitor but not, by itself,
a persuasive reason to restore gaps. Local hooks remain bypassable at any
duration; server-side required CI is the boundary for `--no-verify`. My attempted
reproduction of 63.8 seconds was blocked fail-closed after 1.82 seconds because
Semgrep could not write `~/.semgrep` in this sandbox, so I do not certify that
wall-clock number from this environment.

## F2 — HIGH — `signal-dispatch` repeats the clock-driven exclusion, and 125 seconds is test scaffolding

**Files:** `tests/signal-dispatch/test.sh:51`, `tests/signal-dispatch/test.sh:78`,
`tests/signal-dispatch/test.sh:134`, `tests/signal-dispatch/test.sh:183`,
`scripts/codex-signal-watch.sh:131`, `.github/workflows/security.yml:162`

The exclusion reproduces BUG-005's structure. The suite protects the autonomous
handoff path; a regression can silently stop cross-provider review or dispatch an
agent on stale work. “Not on the push path” describes where the watcher runs, not
the consequence of shipping it broken. The current CI comment is even still the
old clock rationale (“does not fit the 30s pre-push ceiling”), so the claimed
risk-only reclassification is not represented in the executable configuration.

The 125-second cost is not inherent. `run_watch` always starts an infinite watcher
under `timeout`, then discards the timeout status. Its six bounds are exactly
`22 + 18 + 26 + 13 + 26 + 20 = 125` seconds. The background writers finish
earlier, but the test cannot advance until each watcher is killed. The watcher
already accepts `--poll`; settle time is also configurable through
`AGENT_SIGNAL_SETTLE`. No assertion requires production-scale seconds. Even case
#5's negative boundary is expressed as the positive exact trace
`old-task/old-task/new-task` after a pause longer than settle.

Concrete reproduction:

```sh
rg 'run_watch [0-9]+' tests/signal-dispatch/test.sh
# 22, 18, 26, 13, 26, 20 — sum: 125
```

Fix the harness before deciding its tier: add a test tick/time-scale (including a
sub-second or injected monotonic settle clock), poll for expected hits, and stop
the watcher as soon as each assertion becomes decidable. Retain only a short
bounded quiet window where absence is genuinely under test. With a roughly 10×
test clock, this suite should be on the pre-push gate unless measured evidence
still shows disproportionate cost. Leaving the unoptimised 125-second version in
CI and calling the omission a risk decision is the same clock-first move BUG-005
was meant to remove.

## Verification notes

- Confirmed commit `62d2791` restores `a2bp-contamination`, `signal-set`, the
  staleness probe, and full (non-`--fast`) activity, secret, roster and drift
  suites in `.githooks/pre-push-project`.
- Confirmed `signal-dispatch` remains CI-only and is not classified by the local
  gate.
- No push performed.
