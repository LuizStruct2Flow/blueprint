# Codex review — BUG-005 round 2

**Reviewer:** Alexey (Codex) · 2026-08-02  
**Commit reviewed:** `37cca7c` (plus the current review-request worktree)  
**Verdict:** CHANGES REQUESTED — do not push

## F1 — MEDIUM — the manifest proves strings exist, not that classified suites execute

**Files:** `tests/manifest/test.sh:58`, `tests/manifest/test.sh:117`,
`tests/manifest/test.sh:138`

The manifest is a useful inventory, but its executable-tier claim is weaker than
the documentation says. Discovery only recognizes `tests/*/test.sh`; another
executable test shape is invisible. More importantly, gate and CI membership are
validated with an unanchored `grep`. A commented-out invocation, documentation,
or dead function containing the expected path satisfies the control even though
the suite never runs.

Concrete reproductions, both against an otherwise exact temporary copy of the
current tree:

```sh
# Comment out the real blocking invocation while preserving its text.
sed -i '/tests\/pipeline\/test\.sh/s/^/#/' \
  .githooks/pre-push .githooks/pre-push-project
bash tests/manifest/test.sh
# PASS, including: "every pre-push/both suite is invoked by the gate"

# Add a failing executable test outside the one recognized filename convention.
mkdir -p tests/unclassified
printf '#!/bin/sh\nexit 1\n' > tests/unclassified/check.sh
bash tests/manifest/test.sh
# PASS, including: "every suite on disk is classified"
```

This does not require lying in `tests/SUITES.md`; ordinary refactoring to a
different runner name is enough. Make the convention itself enforceable (for
example, reject executable shell files below `tests/` that are not a declared
suite entry), and parse actual shell/YAML command nodes or use generated gate/CI
invocation blocks from the manifest. At minimum, strip comments and require an
anchored executable command rather than arbitrary path text.

## F2 — LOW — both SLO thresholds are already breached by the accepted baseline

**Files:** `scripts/lib/pipeline.sh:270`, `scripts/lib/pipeline.sh:271`,
`.githooks/pre-push-project:181`

The SLO is genuinely non-blocking: `pipe_finish` returns zero after warning, and
`tests/pipeline/` case #20 verifies both that property and that an actual stage
failure remains fatal. The thresholds are not useful as regression thresholds,
however. The restored `signal-dispatch` stage alone reproducibly takes about 75
seconds, so it always exceeds the 45-second stage SLO; the reported normal gate
at 142.3 seconds always exceeds the 120-second total SLO. Because the total
branch is checked first, every successful ordinary gate emits an SLO warning.

Concrete reproduction of the stage baseline:

```text
bash tests/signal-dispatch/test.sh  # 75.23s, 74.92s, 74.98s here
```

A warning already firing at introduction cannot distinguish regression from
normal operation and will be trained out. Set thresholds above the measured
baseline with explicit headroom (and ratchet them when optimization lands), or
make the warning point to a tracked optimization item with an owner. Keeping it
non-blocking is the right trade; 120s/45s are not sensible while the accepted
baseline is 142s/75s.

## Timing and assertion audit — clean

`SETTLE=2` is sufficient for the clock-quantization race the revised test is
addressing. A real 0.8-second interval can cross at most one integral-second
boundary, so the watcher's observed elapsed value is at most 1 and remains
strictly below 2 at `scripts/codex-signal-watch.sh:178`. `SETTLE=1` was unsound
for exactly the stated reason. Case #5 is comfortably on the other side: its
six-second pause is three settle units, leaving much more than the truncation and
poll error around a two-second threshold. Whole-second truncation cannot turn
that into a sub-threshold interval.

This is still a settle mitigation, not a publication boundary: an intended
0.8-second writer sleep is a minimum and can overrun under a multi-second
scheduler stall. Case #5 already documents the resulting behavior, and
`scripts/signal-set.sh` is the actual boundary. I do not treat that known limit
as a new defect in this commit, but the wording "sound" should remain scoped to
the integral-clock alignment race rather than all scheduling.

Early-stop did not weaken cases #1, #5, or #6. Each waits for the expected hit
count and then holds the watcher open for two more settle windows (four seconds),
longer than a pending key needs to dispatch. Their final exact-count/exact-trace
checks therefore still observe an extra pending dispatch. Leaving production
settle semantics unchanged was the right trade: changing the watcher to accept
sub-second settle only to accelerate its timing regression suite would test a
different production clock.

## Verification

- `tests/signal-dispatch/test.sh`: three consecutive passes at **75.23s,
  74.92s, and 74.98s**. This independently reproduces the corrected ~75.0s
  number; it does not reproduce or certify the discarded 37.5s result.
- Full gate attempted exactly as requested. It failed closed in Semgrep at
  **1.93s** because this sandbox cannot write `~/.semgrep`; therefore I cannot
  independently certify the claimed 142.3s full-gate number.
- Manifest adversarial copies reproduced both F1 bypasses with exit zero.
- No push performed.
