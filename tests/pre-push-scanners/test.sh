#!/bin/bash
# tests/pre-push-scanners/test.sh
#
# BUG-003: the pre-push security gate must distinguish "the scanner found
#          something" from "the scanner could not run".
#
# The defect: `semgrep … || { echo "found a WARNING+ finding"; exit 1; }` treats
# EVERY non-zero exit as a finding. semgrep exits 1 for findings and >=2 for a
# fatal error, and `--quiet` suppressed the reason entirely. Observed on this
# repo: identical back-to-back runs alternating exit 0 and exit 2 with zero
# output, in both bash and sh, while the same command outside the hook always
# passed. gitleaks had the same conflation.
#
# Why it matters in BOTH directions: a broken scanner reported as a
# vulnerability teaches operators to shrug off the gate, and that shrug is what
# carries over to a real finding. A gate that cries wolf is a gate people learn
# to bypass.
#
# The hook is driven in an isolated fixture with shim scanners on PATH, so every
# exit-code path is deterministic rather than waiting for the flake to recur.
#
# Runs in the blocking pre-push gate (~0.2s) and in CI.
#
# Run from the blueprint repo root:
#   bash tests/pre-push-scanners/test.sh
#
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.githooks/pre-push"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$HOOK" ] || { echo "FAIL: missing $HOOK"; exit 1; }

# --- fixture: a repo the hook can run in and exit quickly ---------------------
# No backend/ or frontend/, no pre-push-project, no IaC — so the hook reaches the
# scanner section, then falls straight through. Shims make the scanners instant.
FIX="$WORK/repo"
mkdir -p "$FIX/.githooks" "$FIX/.claude" "$FIX/bin"
cp "$HOOK" "$FIX/.githooks/pre-push"
printf '{\n  "permissions": {\n    "allow": []\n  }\n}\n' >"$FIX/.claude/settings.json"
( cd "$FIX" && git init -q . ) 2>/dev/null

CALLS="$WORK/calls"

# Write a shim that exits with the codes in $2 (space-separated, one per call)
# and records each invocation, so "retried exactly once" is verifiable.
mk_shim(){ # $1=name  $2="code code ..."
  local name="$1" codes="$2"
  cat >"$FIX/bin/$name" <<EOF
#!/bin/sh
n=\$(cat "$CALLS.$name" 2>/dev/null || echo 0)
n=\$((n+1)); echo "\$n" >"$CALLS.$name"
set -- $codes
eval "code=\\\${\$n:-\\\${$#}}"
echo "shim $name call \$n exiting \$code"
[ "\$code" = "1" ] && echo "SIMULATED-FINDING"
exit "\$code"
EOF
  chmod +x "$FIX/bin/$name"
  rm -f "$CALLS.$name"
}
calls_of(){ cat "$CALLS.$1" 2>/dev/null || echo 0; }

# JSON-emitting semgrep shim — the hook now classifies from semgrep's --json
# output, not its exit code. $@ = modes played in call order (last repeats):
#   clean   → {results:[],errors:[]}, exit 0
#   finding → {results:[{check_id:demo.rule,...}]}, exit 1   (block: results present)
#   crash2  → valid JSON but exit 2 + stderr diag             (incomplete: retry)
#   oserror → traceback on stderr, NO json, exit 1           (incomplete: crashed)
mk_sg(){
  {
    printf '#!/bin/sh\n'
    printf 'n=$(cat "%s.semgrep" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" >"%s.semgrep"\n' "$CALLS" "$CALLS"
    printf 'set -- %s\n' "$*"
    printf 'eval "mode=\\${$n:-\\${%s}}"\n' "$#"
    cat <<'SH'
case "$mode" in
  clean)   printf '{"version":"1","results":[],"errors":[]}\n'; exit 0 ;;
  finding) printf '{"version":"1","results":[{"check_id":"demo.rule","path":"x.py","start":{"line":7}}],"errors":[]}\n'; exit 1 ;;
  crash2)  echo "SEMGREP-CRASH-DIAG (simulated io_uring)" >&2; printf '{"version":"1","results":[],"errors":[{"level":"error"}]}\n'; exit 2 ;;
  err1json) echo "SEMGREP-CRASH-DIAG (error, exit 1, valid JSON)" >&2; printf '{"version":"1","results":[],"errors":[{"level":"error"}]}\n'; exit 1 ;;
  badschema) printf '{"version":"1","results":"not-an-array"}\n'; exit 0 ;;
  oserror) echo "Traceback (most recent call last):" >&2; echo "PermissionError: settings.yml" >&2; exit 1 ;;
esac
SH
  } >"$FIX/bin/semgrep"
  chmod +x "$FIX/bin/semgrep"; rm -f "$CALLS.semgrep"
}

# Run the hook in the fixture with shims first on PATH.
run_hook(){ ( cd "$FIX" && PATH="$FIX/bin:$PATH" sh .githooks/pre-push ) >"$WORK/out" 2>&1; echo $?; }
saw(){ grep -qF -- "$1" "$WORK/out"; }

# ===========================================================================
# 1. Both scanners clean → the gate passes.
# ===========================================================================
mk_shim gitleaks 0; mk_sg clean
rc="$(run_hook)"
[ "$rc" -eq 0 ] && pass "clean scanners → gate passes" \
                || { fail "clean scanners should pass, got exit $rc"; tail -5 "$WORK/out"; }

# ===========================================================================
# 2. JSON results present → blocks as a FINDING and shows the rule.
# ===========================================================================
mk_shim gitleaks 0; mk_sg finding
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "WARNING+ finding" && ! saw "could not complete"; then
  saw "demo.rule" && pass "semgrep JSON finding → blocks, rule shown" \
                  || fail "finding blocked but the rule id was not shown"
else fail "a JSON result must block AND be labelled a finding (rc=$rc)"; fi
[ "$(calls_of semgrep)" -eq 1 ] && pass "a finding is not retried" \
                                || fail "a real finding was retried $(calls_of semgrep) times"

# ===========================================================================
# 3. Scan crashes (exit 2) both times → blocks as a TOOL FAILURE, never a
#    finding, retries exactly once, and surfaces the crash diagnostic.
# ===========================================================================
mk_shim gitleaks 0; mk_sg crash2 crash2
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "did NOT run" && ! saw "WARNING+ finding"; then
  pass "semgrep crash (exit 2) → blocks as a tool failure, NOT as a finding"
else
  fail "semgrep tool error must not be reported as a security finding (rc=$rc)"
  grep -E "❌|⚠" "$WORK/out" | head -3
fi
[ "$(calls_of semgrep)" -eq 2 ] && pass "semgrep crash retried exactly once" \
                                || fail "expected exactly 2 semgrep calls (1 + 1 retry), got $(calls_of semgrep)"
saw "SEMGREP-CRASH-DIAG" && pass "tool-failure path exposes the scanner's own diagnostic" \
                         || { fail "tool-failure path hid the diagnostic output"; tail -6 "$WORK/out"; }

# ===========================================================================
# R-3. semgrep exit 1 with NO valid JSON on stdout — an OSError BEFORE the scan
#      (e.g. an unwritable ~/.semgrep settings dir, observed in review) — must be
#      a TOOL FAILURE, not a finding. The exit-code classifier said "exit 1 =
#      finding", so it reported a crash as a vulnerability. Findings must come
#      from semgrep's JSON `results`, which an OSError never produces.
# ===========================================================================
mk_shim gitleaks 0; mk_sg oserror oserror
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "did NOT run" && ! saw "WARNING+ finding"; then
  pass "R-3: semgrep exit 1 with no JSON → tool failure, not a finding"
else fail "R-3: semgrep OSError (exit 1, no JSON) misclassified as a finding (rc=$rc)"; fi

# ===========================================================================
# 4. semgrep exit 2 then 0 → retries once and passes (transient recovery).
# ===========================================================================
mk_shim gitleaks 0; mk_sg crash2 clean
rc="$(run_hook)"
if [ "$rc" -eq 0 ] && saw "retrying"; then pass "transient semgrep failure recovers on retry"
else fail "a transient semgrep failure should retry and pass (rc=$rc)"; fi
[ "$(calls_of semgrep)" -eq 2 ] && pass "transient recovery uses exactly one retry" \
                                || fail "expected 2 semgrep calls, got $(calls_of semgrep)"

# ===========================================================================
# 4b. The retry uses --jobs 1 (io_uring/memlock recovery). A shim that fails
#     UNLESS invoked single-job passes only because the retry drops parallelism
#     — pins the claim, not just "it retried". Mirrors the real failure:
#     semgrep's multi-core engine crashes on io_uring_queue_init under a low
#     RLIMIT_MEMLOCK; --jobs 1 avoids it.
# ===========================================================================
# The shim exits 2 UNLESS it sees `--jobs 1`, so a green gate is reachable only
# if the retry actually dropped to single-job. (The hook hides scanner stdout on
# success by design, so we prove it via the exit code + the hook's own message,
# not the shim's output.)
cat >"$FIX/bin/semgrep" <<'SH'
#!/bin/sh
case " $* " in
  *" --jobs 1 "*) printf '{"version":"1","results":[],"errors":[]}\n'; exit 0 ;;
esac
echo "SEMGREP-CRASH-DIAG (simulated io_uring)" >&2
printf '{"version":"1","results":[],"errors":[{"level":"error"}]}\n'; exit 2
SH
chmod +x "$FIX/bin/semgrep"
mk_shim gitleaks 0
rc="$(run_hook)"
if [ "$rc" -eq 0 ] && saw "retrying single-job"; then
  pass "semgrep retry drops to --jobs 1 and recovers the parallel-engine crash"
else fail "retry did not recover a parallel-only failure via --jobs 1 (rc=$rc)"; fi

# ===========================================================================
# R2-1a. Valid JSON + zero results + NON-ZERO exit is NOT a proven clean scan.
#        exit 1 is not semgrep's clean exit, so "0 results" cannot be trusted —
#        classify as incomplete/tool-failure, never clean. (Codex R2-1.)
# ===========================================================================
mk_shim gitleaks 0; mk_sg err1json err1json
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "did NOT run" && ! saw "WARNING+ finding"; then
  pass "R2-1: valid JSON + 0 results + exit 1 → tool failure, not clean"
else fail "R2-1: exit 1 with 0 results was waved through as clean (rc=$rc)"; fi

# ===========================================================================
# R2-1b. Valid JSON whose `.results` is not an array (wrong schema) must be
#        rejected as incomplete, not silently treated as zero findings — the
#        `|| echo 0` fail-open. Exit 0 here proves it is caught by schema
#        validation, independent of the exit code.
# ===========================================================================
mk_shim gitleaks 0; mk_sg badschema badschema
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "did NOT run" && ! saw "WARNING+ finding"; then
  pass "R2-1: valid JSON with non-array results → tool failure (no fail-open)"
else fail "R2-1: malformed results schema was treated as zero findings (rc=$rc)"; fi

# ===========================================================================
# 5. gitleaks exit 1 → blocks as a SECRET.
# ===========================================================================
mk_shim gitleaks 1; mk_shim semgrep 0
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "found a secret" && ! saw "could not complete"; then
  # Output must be surfaced too. BUG-003's diagnosis was that suppressed
  # diagnostics made the gate untrustworthy, so classification alone is not
  # enough to pin — assert the scanner's own output reaches the operator.
  saw "SIMULATED-FINDING" && pass "gitleaks exit 1 → blocks as a secret, output shown" \
                          || fail "gitleaks exit 1 blocked but hid the scanner output"
else fail "gitleaks exit 1 must block and be labelled a secret (rc=$rc)"; fi

# ===========================================================================
# 6. gitleaks exit 2 → blocks as a TOOL FAILURE, not a secret.
#    NOTE: gitleaks is classified but deliberately NOT retried — its failures
#    are local/deterministic (bad config, unreadable repo), unlike semgrep's
#    registry fetch. Claiming an "identical fix" for both overstated parity.
# ===========================================================================
mk_shim gitleaks 2; mk_shim semgrep 0
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "gitleaks could not complete" && ! saw "found a secret"; then
  saw "shim gitleaks call" && pass "gitleaks exit 2 → blocks as a tool failure, output shown" \
                           || fail "gitleaks tool-failure path hid the diagnostic output"
else fail "gitleaks tool error must not be reported as a secret (rc=$rc)"; fi
[ "$(calls_of gitleaks)" -eq 1 ] && pass "gitleaks is classified but not retried (documented asymmetry)" \
                                 || fail "gitleaks was called $(calls_of gitleaks) times; no retry is intended"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-003 — scanner failures and scanner findings are distinguished."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
