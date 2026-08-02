#!/bin/bash
# tests/pipeline/test.sh
#
# FEATURE-002 — the pre-push gate renders as a pipeline.
#
# Most of this file is about ONE property, and it is not the rendering:
#
#   **FAIL CLOSED.** scripts/lib/pipeline.sh decides whether a push is allowed.
#   If a stage fails and the renderer lets it through, every gate in this repo
#   silently stops guarding anything — and it would look exactly like a passing
#   gate, which is the failure mode that made BUG-004 expensive. So the failure
#   paths get more assertions than the happy path: non-zero exit, death by
#   signal, a missing binary, and a failure in the LAST stage (an off-by-one in
#   the summary is the obvious way to lose one).
#
# The rendering assertions exist mainly to protect the second reason this
# feature exists: a gate that did not run prints nothing, which is
# indistinguishable from a gate that passed. The banner is what makes absence
# visible, so "the banner is present and says PASSED/FAILED" is load-bearing.
#
# Run from the blueprint repo root:  bash tests/pipeline/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/pipeline.sh"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ ! -f "$LIB" ]; then
  echo "FAIL: #0 scripts/lib/pipeline.sh is missing"
  exit 1
fi

# Run a snippet in a real `sh` (dash on Ubuntu), never bash — the hook is
# #!/bin/sh, and a bashism here would pass in the test and break in the gate.
#
# AGENT_FEED_LOG is pinned to a temp file for EVERY case. Without it these
# fixtures append their fake stages ("boom", "noisy") to the real
# logs/agent-activity.log — observed: one gate run injected ten bogus [GATE]
# lines into the founder's live feed. A test that writes into the production
# log is the same contamination class as BUG-002, and it is worse here because
# the log is what someone reads to find out what actually happened.
# Cases that assert ON the feed override this with their own path.
run_sh(){
  printf '%s\n' "$1" >"$TMP/s.sh"
  AGENT_FEED_LOG="${AGENT_FEED_LOG:-$TMP/feed.isolated.log}" sh "$TMP/s.sh" >"$TMP/out" 2>&1
  echo $?
}

# ===========================================================================
# 1. A PASSING pipeline exits 0 and says PASSED.
# ===========================================================================
rc=$(run_sh ". '$LIB'; pipe_init 'gate' 'test'; pipe_stage 'a' true; pipe_stage 'b' true; pipe_finish")
if [ "$rc" = "0" ] && grep -q "PASSED" "$TMP/out"; then
  pass "#1 all-green pipeline exits 0 and renders PASSED"
else
  fail "#1 all-green pipeline gave rc=$rc, output:"; sed 's/^/        /' "$TMP/out"
fi

# ===========================================================================
# 2. FAIL CLOSED — a non-zero stage must exit non-zero. The whole point.
# ===========================================================================
rc=$(run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'a' true; pipe_stage 'boom' false; pipe_stage 'c' true; pipe_finish")
[ "$rc" != "0" ] \
  && pass "#2 a failing stage exits non-zero (fail closed)" \
  || fail "#2 a failing stage exited 0 — THE GATE IS OPEN"

# ===========================================================================
# 3. A failing stage STOPS the run. If later stages still execute, a gate that
#    reported failure could still have run destructive work after it.
# ===========================================================================
rc=$(run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'boom' false; pipe_stage 'after' echo REACHED_AFTER_FAILURE; pipe_finish")
if grep -q "REACHED_AFTER_FAILURE" "$TMP/out"; then
  fail "#3 execution continued past a failed stage"
else
  pass "#3 a failed stage halts the pipeline"
fi

# ===========================================================================
# 4. FAIL CLOSED on the LAST stage — the off-by-one that a summary loop invites.
# ===========================================================================
rc=$(run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'a' true; pipe_stage 'last' false; pipe_finish")
[ "$rc" != "0" ] \
  && pass "#4 a failure in the final stage still exits non-zero" \
  || fail "#4 a final-stage failure exited 0 — off-by-one in the summary"

# ===========================================================================
# 5. FAIL CLOSED on a signal. A stage killed by the OOM killer or a timeout
#    must not read as success.
# ===========================================================================
rc=$(run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'killed' sh -c 'kill -9 \$\$'; pipe_finish")
[ "$rc" != "0" ] \
  && pass "#5 a stage killed by a signal fails the gate" \
  || fail "#5 a signal-killed stage exited 0 — the gate is open"

# ===========================================================================
# 6. FAIL CLOSED on a missing binary — the "tool not installed" case, which is
#    how a scanner silently stops scanning.
# ===========================================================================
rc=$(run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'nope' definitely-not-a-real-binary-xyz; pipe_finish")
[ "$rc" != "0" ] \
  && pass "#6 a missing binary fails the gate" \
  || fail "#6 a missing binary exited 0 — the gate is open"

# ===========================================================================
# 7. A failing stage PRINTS its captured output. Buffering must not swallow the
#    diagnosis — otherwise the pipeline is prettier and strictly less useful.
# ===========================================================================
run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'noisy' sh -c 'echo UNIQUE_DIAGNOSTIC_STRING; exit 3'; pipe_finish" >/dev/null
grep -q "UNIQUE_DIAGNOSTIC_STRING" "$TMP/out" \
  && pass "#7 a failing stage's output is shown" \
  || fail "#7 the failing stage's output was swallowed by the buffer"

# ===========================================================================
# 8. A PASSING stage's output is NOT shown — that is what makes it a summary.
# ===========================================================================
run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'quiet' sh -c 'echo CHATTY_TOOL_NOISE'; pipe_finish" >/dev/null
grep -q "CHATTY_TOOL_NOISE" "$TMP/out" \
  && fail "#8 a passing stage's output leaked into the summary" \
  || pass "#8 a passing stage's output stays buffered"

# ===========================================================================
# 9. NON-TTY output is plain. These tests capture stdout, so they are already
#    the non-TTY path — assert no ANSI escapes reach a CI log or a pipe.
# ===========================================================================
run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'a' true; pipe_finish" >/dev/null
if LC_ALL=C grep -q "$(printf '\033')" "$TMP/out"; then
  fail "#9 ANSI escapes present in non-TTY output — CI logs would be soup"
else
  pass "#9 non-TTY output is free of ANSI escape sequences"
fi

# ===========================================================================
# 10. The BANNER is present on both paths. This is the anti-BUG-004 property:
#     no banner must mean "the gate did not run", so the banner cannot be
#     conditional on success.
# ===========================================================================
run_sh ". '$LIB'; pipe_init 'pre-push gate'; pipe_stage 'a' true; pipe_finish" >/dev/null
ok_banner=$(grep -c "pre-push gate" "$TMP/out")
run_sh ". '$LIB'; pipe_init 'pre-push gate'; pipe_stage 'a' false; pipe_finish" >/dev/null
bad_banner=$(grep -c "pre-push gate" "$TMP/out")
if [ "$ok_banner" -ge 1 ] && [ "$bad_banner" -ge 1 ]; then
  pass "#10 the banner renders on both the passing and failing paths"
else
  fail "#10 banner missing (pass=$ok_banner fail=$bad_banner) — absence would be ambiguous"
fi

# ===========================================================================
# 11. pipe_skip records but does not fail. A skipped stage is normal (no
#     backend/, no IaC) and must not block, but must be VISIBLE — an invisible
#     skip is how "94% coverage over 9% of the code" happens.
# ===========================================================================
rc=$(run_sh ". '$LIB'; pipe_init 'gate'; pipe_skip 'IaC synth' 'no infrastructure/'; pipe_finish")
if [ "$rc" = "0" ] && grep -q "IaC synth" "$TMP/out" && grep -q "skipped" "$TMP/out"; then
  pass "#11 a skip is visible in the render and does not fail the gate"
else
  fail "#11 skip handling wrong (rc=$rc)"; sed 's/^/        /' "$TMP/out"
fi

# ===========================================================================
# 12. No temp directories leak. pipe_init mktemp's per run; the gate runs on
#     every push, so a leak here is unbounded growth in /tmp.
# ===========================================================================
before=$(find /tmp -maxdepth 1 -name 'tmp.*' 2>/dev/null | wc -l)
i=0; while [ $i -lt 5 ]; do
  run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'a' true; pipe_finish" >/dev/null
  i=$((i+1))
done
after=$(find /tmp -maxdepth 1 -name 'tmp.*' 2>/dev/null | wc -l)
[ "$after" -le "$before" ] \
  && pass "#12 no temp directories leaked across 5 runs" \
  || fail "#12 temp dirs leaked: $before -> $after"

# ===========================================================================
# 14. NO SCRATCH DIR — the renderer must still run and still FAIL CLOSED.
#     /tmp full, mounted noexec, or coreutils off PATH must not stop the gate.
#     "Could not create a temp dir" is a terrible reason to block a push and a
#     far worse one to allow one. Simulated by making mktemp fail.
# ===========================================================================
mkdir -p "$TMP/nobin"
printf '#!/bin/sh\nexit 1\n' >"$TMP/nobin/mktemp"; chmod +x "$TMP/nobin/mktemp"

rc=$(PATH="$TMP/nobin:$PATH" run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'a' true; pipe_finish")
[ "$rc" = "0" ] && grep -q "PASSED" "$TMP/out" \
  && pass "#14 with no scratch dir the pipeline still runs and reports PASSED" \
  || fail "#14 no-scratch-dir pass path broke (rc=$rc)"

rc=$(PATH="$TMP/nobin:$PATH" run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'boom' false; pipe_finish")
[ "$rc" != "0" ] \
  && pass "#14 with no scratch dir a failing stage STILL fails the gate" \
  || fail "#14 THE GATE IS OPEN when no scratch dir is available"

# Unbuffered mode must still surface the failing stage's output — it streams
# rather than being replayed, but it must not vanish.
PATH="$TMP/nobin:$PATH" run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'noisy' sh -c 'echo STREAMED_DIAGNOSTIC; exit 1'; pipe_finish" >/dev/null
grep -q "STREAMED_DIAGNOSTIC" "$TMP/out" \
  && pass "#14 unbuffered mode still shows the failing stage's output" \
  || fail "#14 unbuffered failure output was lost entirely"

# ===========================================================================
# 15. The summary tally must be right without a scratch dir. Counting via the
#     filesystem is how a tally silently reads zero and a failure disappears
#     from the summary line.
# ===========================================================================
PATH="$TMP/nobin:$PATH" run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'a' true; pipe_skip 's' 'why'; pipe_stage 'b' false; pipe_finish" >/dev/null
if grep -qE '1 passed · 1 failed · 1 skipped' "$TMP/out"; then
  pass "#15 the tally is correct with no scratch dir"
else
  fail "#15 tally wrong with no scratch dir:"; grep '╰─' "$TMP/out" | sed 's/^/        /'
fi

# ===========================================================================
# 16. GATE RESULTS REACH THE ACTIVITY FEED.
#     The terminal render scrolls away and never existed at all for anyone who
#     was not watching that shell — including an agent asked later "did that
#     push actually get gated?". logs/agent-activity.log is the durable answer,
#     and it is the same stream every other agent writes to.
# ===========================================================================
FEEDLOG="$TMP/feed.log"
: >"$FEEDLOG"
AGENT_FEED_LOG="$FEEDLOG" run_sh ". '$ROOT/scripts/lib/feed.sh'; . '$LIB'; pipe_init 'pre-push gate' 'x'; pipe_stage 'alpha' true; pipe_skip 'beta' 'not here'; pipe_finish" >/dev/null

if grep -q '\[GATE\].*alpha' "$FEEDLOG" && grep -q '\[GATE\].*beta' "$FEEDLOG"; then
  pass "#16 each stage result is appended to the activity feed"
else
  fail "#16 stage results missing from the feed:"; sed 's/^/        /' "$FEEDLOG"
fi

grep -qE '\[GATE\] PASSED' "$FEEDLOG" \
  && pass "#16 the verdict is appended to the feed" \
  || fail "#16 no verdict line in the feed"

# A blocked push must be unmistakable in the log — this is the line someone
# greps for after the fact.
: >"$FEEDLOG"
AGENT_FEED_LOG="$FEEDLOG" run_sh ". '$ROOT/scripts/lib/feed.sh'; . '$LIB'; pipe_init 'pre-push gate'; pipe_stage 'boom' false; pipe_finish" >/dev/null
grep -q 'PUSH BLOCKED' "$FEEDLOG" \
  && pass "#16 a failing gate says PUSH BLOCKED in the feed" \
  || fail "#16 a blocked push is not identifiable in the feed"

# ===========================================================================
# 17. The feed must stay PLAIN. It is tailed and grepped; ANSI escapes in it
#     are the same defect as escapes in a CI log, and they break grep patterns
#     that look anchored but are not.
# ===========================================================================
if LC_ALL=C grep -q "$(printf '\033')" "$FEEDLOG"; then
  fail "#17 ANSI escapes leaked into the activity feed"
else
  pass "#17 feed lines are plain text"
fi

# ===========================================================================
# 18. Rotation must PRESERVE THE INODE. scripts/agent-activity.sh tracks this
#     file by offset on an open handle, so a rotation that replaces the inode
#     leaves the supervisor writing into an unlinked file — the feed would
#     silently stop updating, which is the worst failure a log can have.
# ===========================================================================
: >"$FEEDLOG"
i=0; while [ $i -lt 60 ]; do echo "filler line $i" >>"$FEEDLOG"; i=$((i+1)); done
ino_before=$(stat -c %i "$FEEDLOG" 2>/dev/null || stat -f %i "$FEEDLOG")
AGENT_FEED_LOG="$FEEDLOG" AGENT_FEED_MAX_LINES=20 AGENT_FEED_KEEP_LINES=10 \
  run_sh ". '$ROOT/scripts/lib/feed.sh'; feed_append 'trigger rotation'" >/dev/null
ino_after=$(stat -c %i "$FEEDLOG" 2>/dev/null || stat -f %i "$FEEDLOG")
lines_after=$(wc -l <"$FEEDLOG")
if [ "$ino_before" = "$ino_after" ] && [ "$lines_after" -le 20 ]; then
  pass "#18 rotation trims the feed and preserves the inode"
else
  fail "#18 rotation broke: inode $ino_before -> $ino_after, $lines_after lines"
fi

# ===========================================================================
# 19. THIS SUITE MUST NOT WRITE TO THE REAL FEED.
#     Non-vacuity guard on the isolation above: if run_sh ever stops pinning
#     AGENT_FEED_LOG, every case here starts appending fake stages to the live
#     logs/agent-activity.log, and nothing else would notice.
# ===========================================================================
if [ -f "$ROOT/logs/agent-activity.log" ]; then
  real_before=$(grep -c '\[GATE\]' "$ROOT/logs/agent-activity.log" 2>/dev/null || echo 0)
  run_sh ". '$LIB'; pipe_init 'gate'; pipe_stage 'canary-must-not-escape' true; pipe_finish" >/dev/null
  real_after=$(grep -c '\[GATE\]' "$ROOT/logs/agent-activity.log" 2>/dev/null || echo 0)
  if [ "$real_before" = "$real_after" ] \
     && ! grep -q 'canary-must-not-escape' "$ROOT/logs/agent-activity.log" 2>/dev/null; then
    pass "#19 the suite writes no [GATE] lines into the real activity feed"
  else
    fail "#19 this suite is polluting logs/agent-activity.log ($real_before -> $real_after)"
  fi
else
  pass "#19 no real feed present to pollute"
fi

# ===========================================================================
# 13. The gate actually USES the renderer. Assertions 1-12 could all pass while
#     .githooks/ ignored the library entirely.
# ===========================================================================
for f in .githooks/pre-push .githooks/pre-push-project; do
  [ -f "$ROOT/$f" ] || { fail "#13 $f not found"; continue; }
  grep -q 'lib/pipeline.sh' "$ROOT/$f" \
    && pass "#13 $f sources the pipeline renderer" \
    || fail "#13 $f does not source scripts/lib/pipeline.sh"
done

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: FEATURE-002 — the gate renders as a pipeline and fails closed."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
