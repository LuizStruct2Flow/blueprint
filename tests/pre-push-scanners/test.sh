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

# Run the hook in the fixture with shims first on PATH.
run_hook(){ ( cd "$FIX" && PATH="$FIX/bin:$PATH" sh .githooks/pre-push ) >"$WORK/out" 2>&1; echo $?; }
saw(){ grep -qF -- "$1" "$WORK/out"; }

# ===========================================================================
# 1. Both scanners clean → the gate passes.
# ===========================================================================
mk_shim gitleaks 0; mk_shim semgrep 0
rc="$(run_hook)"
[ "$rc" -eq 0 ] && pass "clean scanners → gate passes" \
                || { fail "clean scanners should pass, got exit $rc"; tail -5 "$WORK/out"; }

# ===========================================================================
# 2. semgrep exit 1 → blocks, labelled a FINDING, and shows it.
# ===========================================================================
mk_shim gitleaks 0; mk_shim semgrep 1
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "found a WARNING+ finding" && ! saw "could not complete"; then
  saw "SIMULATED-FINDING" && pass "semgrep exit 1 → blocks as a finding, output shown" \
                          || fail "semgrep exit 1 blocked but did not show the finding (--quiet regression)"
else fail "semgrep exit 1 must block AND be labelled a finding (rc=$rc)"; fi
[ "$(calls_of semgrep)" -eq 1 ] && pass "semgrep exit 1 is not retried" \
                                || fail "a real finding was retried $(calls_of semgrep) times"

# ===========================================================================
# 3. semgrep exit 2 twice → blocks as a TOOL FAILURE, never as a finding,
#    and retries exactly once. THIS IS THE REGRESSION: the old hook printed
#    "found a WARNING+ finding" here.
# ===========================================================================
mk_shim gitleaks 0; mk_shim semgrep "2 2"
rc="$(run_hook)"
if [ "$rc" -ne 0 ] && saw "did NOT run" && ! saw "found a WARNING+ finding"; then
  pass "semgrep exit 2 → blocks as a tool failure, NOT as a finding"
else
  fail "semgrep tool error must not be reported as a security finding (rc=$rc)"
  grep -E "❌|⚠" "$WORK/out" | head -3
fi
[ "$(calls_of semgrep)" -eq 2 ] && pass "semgrep tool error retried exactly once" \
                                || fail "expected exactly 2 semgrep calls (1 + 1 retry), got $(calls_of semgrep)"
# The captured scanner output must be surfaced, otherwise the failure is
# undiagnosable — which is what --quiet was doing before.
saw "shim semgrep call" && pass "tool-failure path exposes the scanner's own output" \
                        || { fail "tool-failure path hid the diagnostic output"; tail -6 "$WORK/out"; }

# ===========================================================================
# 4. semgrep exit 2 then 0 → retries once and passes (transient recovery).
# ===========================================================================
mk_shim gitleaks 0; mk_shim semgrep "2 0"
rc="$(run_hook)"
if [ "$rc" -eq 0 ] && saw "retrying once"; then pass "transient semgrep failure recovers on retry"
else fail "a transient semgrep failure should retry and pass (rc=$rc)"; fi
[ "$(calls_of semgrep)" -eq 2 ] && pass "transient recovery uses exactly one retry" \
                                || fail "expected 2 semgrep calls, got $(calls_of semgrep)"

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
