#!/bin/bash
# tests/a2bp-pr-filing/test.sh
#
# BUG-011 — `a2bp` reported a request as FILED when no PR was ever opened.
#
# `bp_file_existing_pr` asks gh for a PR on the request branch:
#
#   gh pr list … --json state,url --jq '.[0] | "\(.state)\t\(.url)"'
#
# On an EMPTY list `.[0]` is null, and jq interpolates null as the literal
# string "null" — so the function printed `null<TAB>null` instead of nothing.
# The caller guarded with `[ -n "$existing" ] && [ "$existing" != "<TAB>" ]`:
# it anticipated empty fields but not the literal. A non-existent PR therefore
# passed as an existing one, fell to the `*)` branch, printed
# `✓ request already open: null`, and returned BP_RC_PENDING (3).
#
# That exit code is the severe part. 3 means "filed, awaiting a decision", and
# CLAUDE.md is explicit that no script may read "PR opened" as "the blueprint
# has this". Here the code ASSERTED filed while nothing was filed — worse than a
# silent failure, because a caller cannot detect it. It broke the only sanctioned
# path for improvements to reach the blueprint, and hit both of the requests that
# session made; the branches and commits were correct, only the PR step failed,
# and both PRs had to be opened by hand.
#
# Run from the blueprint repo root:  bash tests/a2bp-pr-filing/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/request-file.sh"
CLI="$ROOT/scripts/blueprint"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"

[ -f "$LIB" ] || { echo "FAIL: missing $LIB"; exit 1; }

# A gh shim whose `pr list` returns whatever JSON the case needs. jq must be
# real — the defect IS jq's rendering of null, so shimming it would test nothing.
mk_gh(){ # $1 = json for `pr list`
  cat >"$TMP/bin/gh" <<EOF
#!/bin/sh
if [ "\$1" = "pr" ] && [ "\$2" = "list" ]; then
  json='$1'
  # Reproduce gh's own --jq handling: it pipes the JSON through jq with the
  # given filter, which is exactly where the null literal is produced.
  filter=""
  while [ \$# -gt 0 ]; do
    [ "\$1" = "--jq" ] && { shift; filter="\$1"; }
    shift
  done
  printf '%s' "\$json" | jq -r "\$filter"
  exit 0
fi
exit 1
EOF
  chmod +x "$TMP/bin/gh"
}

command -v jq >/dev/null 2>&1 || { echo "FAIL: jq is required for this suite"; exit 1; }

# ===========================================================================
# 1. THE REPRODUCER — no PR exists, so the probe must report NOTHING.
#    Not the string "null", which the caller cannot distinguish from a URL.
# ===========================================================================
mk_gh '[]'
out="$( PATH="$TMP/bin:$PATH"; . "$LIB"; bp_file_existing_pr owner/repo some-ref 2>/dev/null )"
if printf '%s' "$out" | grep -q 'null'; then
  fail "#1 an empty PR list produced the literal 'null' — a non-existent PR reads as an existing one: [$(printf '%s' "$out" | tr '\t' '>')]"
elif [ -n "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
  fail "#1 an empty PR list produced output at all: [$out]"
else
  pass "#1 no PR on the branch produces empty output, not 'null'"
fi

# ===========================================================================
# 2. A REAL PR is still reported — the fix must not blind the probe, which
#    would re-file a request the owner already closed.
# ===========================================================================
mk_gh '[{"state":"OPEN","url":"https://example.com/pr/7"}]'
out="$( PATH="$TMP/bin:$PATH"; . "$LIB"; bp_file_existing_pr owner/repo some-ref 2>/dev/null )"
if printf '%s' "$out" | grep -q 'https://example.com/pr/7'; then
  pass "#2 an existing PR is still reported with its state and url"
else
  fail "#2 an existing PR was NOT reported: [$out]"
fi

# ===========================================================================
# 3. A CLOSED PR is still reported. Re-filing a request the owner declined
#    re-spends the reviewer attention this whole design exists to protect.
# ===========================================================================
mk_gh '[{"state":"CLOSED","url":"https://example.com/pr/8"}]'
out="$( PATH="$TMP/bin:$PATH"; . "$LIB"; bp_file_existing_pr owner/repo some-ref 2>/dev/null )"
printf '%s' "$out" | grep -q 'CLOSED' \
  && pass "#3 a closed PR is still reported, so it is not silently re-filed" \
  || fail "#3 a CLOSED PR was not reported: [$out]"

# ===========================================================================
# 4. THE EXIT-CODE CONTRACT — branch pushed but no PR opened must be 5
#    (operational failure), never 3 (filed, awaiting a decision).
#
#    3 is a PROMISE that a reviewer now has something to look at. Returning it
#    when nothing was filed is the defect that makes this bug worse than a
#    crash: the caller has no way to tell the difference.
# ===========================================================================
if ! grep -q 'BP_RC_FAILED=5' "$LIB"; then
  fail "#4 BP_RC_FAILED is not 5 — the contract this asserts has moved"
else
  # The failure branch of `gh pr create` must not return PENDING.
  block=$(sed -n '/opening the PR failed/,/^  }/p' "$CLI")
  if [ -z "$block" ]; then
    fail "#4 could not locate the pr-create failure branch — assertion would be vacuous"
  elif printf '%s' "$block" | grep -q 'BP_RC_PENDING'; then
    fail "#4 the branch is pushed and the PR failed, yet it returns BP_RC_PENDING (3) — 'filed' asserted while nothing was filed"
  elif printf '%s' "$block" | grep -q 'BP_RC_FAILED'; then
    pass "#4 branch-pushed-but-no-PR returns BP_RC_FAILED (5), not 'filed'"
  else
    fail "#4 the pr-create failure branch returns neither FAILED nor PENDING — unclear contract"
  fi
fi

# ===========================================================================
# 5. The caller must not treat a literal 'null' as an existing PR, even if the
#    probe regresses. Defence in depth: #1 fixes the source, this fixes the
#    consumer, and the bug needed BOTH to be wrong to reach the user.
# ===========================================================================
# Read the WHOLE condition, not its first line: it is a multi-line `if` with a
# trailing backslash, and grepping one line found the part without the check and
# reported a fixed guard as broken.
guard=$(sed -n '/if \[ -n "\$existing" \]/,/; then/p' "$CLI")
if [ -z "$guard" ]; then
  fail "#5 could not find the caller's guard on \$existing — assertion would be vacuous"
elif printf '%s' "$guard" | grep -q 'null'; then
  pass "#5 the caller explicitly rejects a literal 'null' as an existing PR"
else
  fail "#5 the caller's guard does not reject a literal 'null': $guard"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-011 — a2bp reports filed only when a PR actually exists."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
