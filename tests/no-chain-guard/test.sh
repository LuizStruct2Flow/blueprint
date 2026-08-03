#!/bin/bash
# tests/no-chain-guard/test.sh
#
# FEATURE — the PreToolUse guard that enforces CLAUDE.md §"Running commands —
# one per call". Codex F5: it shipped with no coverage at all, and F4 (it failed
# OPEN on malformed input and missing jq, contradicting its own stated contract)
# is exactly the contradiction a small table-driven suite catches immediately.
#
# The guard is an ENFORCEMENT control, so the properties that matter are the
# refusals, not the happy path:
#
#   - a chained command is blocked (&&, ||, ;)
#   - a pipe is NOT blocked — a pipeline is one operation whose filter cannot
#     run without its producer, which is the dependency test the rule states
#   - a non-Bash tool passes, but only after its identity was parsed
#   - anything it cannot parse FAILS CLOSED, including missing jq
#
# That last one is the whole reason this file exists. A guard that evaporates
# when something is already wrong is worse than no guard, because it is trusted.
#
# Run from the blueprint repo root:  bash tests/no-chain-guard/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUARD="$ROOT/scripts/no-chain-guard.sh"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$GUARD" ] || { echo "FAIL: missing $GUARD"; exit 1; }

# run_guard <payload> → exit code (stderr discarded)
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
run_guard(){ printf '%s' "$1" | bash "$GUARD" >/dev/null 2>&1; echo $?; }
bash_payload(){ printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(printf '%s' "$1" | jq -R .)"; }

command -v jq >/dev/null 2>&1 || { echo "FAIL: jq required"; exit 1; }

# ===========================================================================
# 1. CHAINED COMMANDS ARE BLOCKED — the reason the hook exists.
# ===========================================================================
blocked_all=1
while IFS= read -r c; do
  [ -n "$c" ] || continue
  rc=$(run_guard "$(bash_payload "$c")")
  [ "$rc" = "2" ] || { fail "#1 not blocked (rc=$rc): $c"; blocked_all=0; }
done <<'CASES'
echo a && echo b
echo a || echo b
echo a; echo b
cd /tmp && rm -rf x
git add . && git commit -m x
CASES
[ "$blocked_all" = "1" ] && pass "#1 &&, || and ; are all blocked"

# ===========================================================================
# 2. PIPES ARE ALLOWED. A pipeline is one operation, and blocking it would
#    make ordinary work inexpressible — which is how a guard gets removed.
# ===========================================================================
piped_ok=1
while IFS= read -r c; do
  [ -n "$c" ] || continue
  rc=$(run_guard "$(bash_payload "$c")")
  [ "$rc" = "0" ] || { fail "#2 a pipe was blocked (rc=$rc): $c"; piped_ok=0; }
done <<'CASES'
grep -n foo file | head -5
git log --oneline | wc -l
cat x | jq -r .a | sort
CASES
[ "$piped_ok" = "1" ] && pass "#2 pipes pass unblocked"

# ===========================================================================
# 3. A PLAIN COMMAND passes.
# ===========================================================================
rc=$(run_guard "$(bash_payload 'git -C /somewhere status --short')")
[ "$rc" = "0" ] \
  && pass "#3 a single plain command passes" \
  || fail "#3 a plain command was blocked (rc=$rc)"

# ===========================================================================
# 4. FAIL CLOSED (Codex F4) — every unparseable input must BLOCK, not allow.
#    Reproductions from the review: both of these returned 0 before the fix.
# ===========================================================================
rc=$(run_guard '{bad json')
[ "$rc" = "2" ] \
  && pass "#4 malformed JSON fails closed" \
  || fail "#4 malformed JSON returned $rc — the guard evaporates exactly when something is already wrong"

rc=$(run_guard '')
[ "$rc" = "2" ] \
  && pass "#4 an empty payload fails closed" \
  || fail "#4 an empty payload returned $rc"

rc=$(run_guard '{"tool_input":{"command":"a && b"}}')
[ "$rc" = "2" ] \
  && pass "#4 a payload with no tool_name fails closed" \
  || fail "#4 a payload with no tool_name returned $rc"

rc=$(run_guard '{"tool_name":"Bash","tool_input":{}}')
[ "$rc" = "2" ] \
  && pass "#4 a Bash payload with no command fails closed" \
  || fail "#4 a Bash payload with no command returned $rc"

# Missing jq. PATH=/nonexistent was WRONG (Codex R2-F4): it removes `cat` too,
# so the guard's own `cat` failed, the payload came back empty, and it blocked
# at the EMPTY-PAYLOAD check — never reaching the missing-jq branch at all.
# Deleting that branch entirely left this case green. Two lessons, both pinned
# below: build a PATH that has the utilities and lacks only jq, and assert the
# CAUSE, because otherwise one fail-closed branch impersonates another.
BASH_BIN="$(command -v bash)"
nojq="$TMP/nojq"; mkdir -p "$nojq"
for u in cat printf sed grep; do
  src="$(command -v "$u" 2>/dev/null)"
  [ -n "$src" ] && ln -sf "$src" "$nojq/$u"
done
if PATH="$nojq" command -v jq >/dev/null 2>&1; then
  fail "#4 could not build a jq-free PATH — the missing-jq case would be vacuous"
else
  out=$(printf '%s' "$(bash_payload 'echo ok && rm -rf target')" | PATH="$nojq" "$BASH_BIN" "$GUARD" 2>&1 >/dev/null)
  rc=$(printf '%s' "$(bash_payload 'echo ok && rm -rf target')" | PATH="$nojq" "$BASH_BIN" "$GUARD" >/dev/null 2>&1; echo $?)
  if [ "$rc" != "2" ]; then
    fail "#4 with jq absent a CHAINED command returned $rc"
  elif ! printf '%s' "$out" | grep -q 'jq is not on PATH'; then
    fail "#4 it blocked, but via the WRONG branch — the message must name the missing jq, or another fail-closed path is impersonating this one. Got: $out"
  else
    pass "#4 missing jq fails closed, and for the stated reason (was exit 0 — a chained command sailed through)"
  fi
fi

# --- Codex R2-F3: schema-invalid JSON must not pass. `jq -r` renders a number
# as text, so these produced plausible strings and reached exit 0.
rc=$(run_guard '{"tool_name":7,"tool_input":{"command":"a && b"}}')
[ "$rc" = "2" ] \
  && pass "#4 a non-string tool_name fails closed" \
  || fail "#4 tool_name as a NUMBER returned $rc — a schema-invalid payload crossed an enforcement boundary"

rc=$(run_guard '{"tool_name":"Bash","tool_input":{"command":7}}')
[ "$rc" = "2" ] \
  && pass "#4 a non-string command fails closed" \
  || fail "#4 command as a NUMBER returned $rc"

# ===========================================================================
# 5. A NON-BASH tool passes — but only because its identity PARSED. "I cannot
#    tell what tool this is" is not "this is not Bash", which is why #4 blocks
#    an absent tool_name rather than treating it as non-Bash.
# ===========================================================================
rc=$(run_guard '{"tool_name":"Read","tool_input":{"file_path":"/x; y && z"}}')
[ "$rc" = "0" ] \
  && pass "#5 a non-Bash tool passes even with operators in its arguments" \
  || fail "#5 a Read call was blocked (rc=$rc) — the guard is out of its scope"

# ===========================================================================
# 6. THE DOCUMENTED FALSE POSITIVE is pinned, not wished away. Operators inside
#    quoted text DO trip it. Pinning it keeps the documented workaround honest:
#    if this ever stops matching, CLAUDE.md's advice becomes wrong.
# ===========================================================================
rc=$(run_guard "$(bash_payload 'git commit -m "fix: a; b"')")
[ "$rc" = "2" ] \
  && pass "#6 quoted prose containing ; is blocked (documented; workaround is .scratch/ + git commit -F)" \
  || fail "#6 quoted prose was NOT blocked (rc=$rc) — CLAUDE.md documents a limitation that no longer exists"

# ===========================================================================
# 7. THE HOOK IS ACTUALLY WIRED. Every assertion above tests a script that
#    nothing may be invoking — which is the A-15 defect this repo has had once.
# ===========================================================================
cfg="$ROOT/.claude/settings.json"
if [ ! -f "$cfg" ]; then
  fail "#7 .claude/settings.json not found"
elif jq -e '.hooks.PreToolUse[]?.hooks[]?.command | select(test("no-chain-guard"))' "$cfg" >/dev/null 2>&1; then
  pass "#7 the guard is wired as a PreToolUse hook in settings.json"
else
  fail "#7 the guard is not referenced by any PreToolUse hook — it runs nowhere"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the no-chain guard blocks chains, permits pipes, and fails closed."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
