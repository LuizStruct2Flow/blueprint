# Codex / Slava review — BUG-001 implementation round 6

**Date:** 2026-07-23
**Reviewed range:** `bde02e5..81a7f50`
**Verdict:** **CHANGES REQUIRED — do not push.**

R-10 is fixed in the project hook. Its policy description now matches the
actual fast/full split, includes foreground mode among the CI additions, and
its measured timing is credible here.

R-11 is fixed. Case #17 now claims exactly what it observes: unaided delivery
without a successor or force-flush, exactly once, followed by evidence that the
offset advanced. It explicitly disclaims next-tick latency.

R-12 is only partly fixed. The forced prerequisite-absence path does emit an
explicit skip and qualifies the final PASS, but it then reports the skipped case
as successful twice:

```text
SKIP — #19 multibyte case: no UTF-8 locale; the LC_ALL=C fix is UNPROVEN here
ok — #11/#19 incomplete multibyte record withheld
ok — #11/#19 completed multibyte record emitted exactly once, intact
...
PASS (with 1 case(s) SKIPPED ...)
```

Those `#11/#19` success labels still claim proof for #19 on the host the suite
has just said cannot provide it. The implementation comment immediately above
them says “Reporting `ok` here would be a proof the host cannot give,” which is
exactly what the output does. On the no-UTF-8 path, label those assertions as
#11 only (or do not execute/report #19); reserve #19 success labels for the
multibyte-locale path. The qualified final line does not retract the two earlier
success reports.

## R-13 — the suite's fast timing claim is stale

`tests/agent-activity-bound/test.sh` still advertises:

```text
bash tests/agent-activity-bound/test.sh --fast   # pre-push subset (~10s)
```

The same run measured **18.45 s** here, consistent with the corrected project
hook's `~19 s` statement. The suite and hook therefore contradict each other,
and the suite understates its own cost by nearly half. Update the suite's usage
comment from the current measurement.

Apart from those two items, I found no further assertion, comment, or summary
line in either shell suite, `.githooks/pre-push`, or
`.githooks/pre-push-project` that overclaims the behavior it checks.

## Verification

- `git diff --check bde02e5..HEAD` — clean.
- `bash -n` on both suites and both hook files — clean.
- `bash tests/agent-activity-bound/test.sh --fast` — green, **18.45 s**.
- `AGENT_FEED_TEST_NO_UTF8=1 bash tests/agent-activity-bound/test.sh --fast` —
  exits 0 and produces the contradictory SKIP plus two `#11/#19` success lines
  quoted above.
- `bash tests/agent-activity-bound/test.sh` — 33/33 green, **28.68 s**.
- `bash tests/pre-push-scanners/test.sh` — 11/11 green.

Per the four-eyes rule, commit `81a7f50` is not authorized for push. Correct
R-12's remaining success-label contradiction and R-13's timing claim, commit,
and hand the writer commit back to Codex.
