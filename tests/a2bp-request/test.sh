#!/bin/bash
# tests/a2bp-request/test.sh
#
# The identity half of the a2bp feature-request flow: the length-framed request
# key, ref validation, and the git-version floor.
#
# Why framing rather than delimiters: every component of the key is attacker- or
# accident-influenced. A remote URL, a branch name, a project directory name and
# file content can all contain whatever character a delimiter scheme chose. A
# byte count cannot be forged by content, and these cases prove it.
#
# Plan: docs/doing/PLAN-A2BP-PR.md §4.
# Run from the blueprint repo root:  bash tests/a2bp-request/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/request.sh"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*"; FAILED=1; }
pass() { echo "  ok — $*"; }

if [ ! -r "$LIB" ]; then
  echo "FAIL: scripts/lib/request.sh is missing — the request identity primitive does not exist"
  exit 1
fi
# shellcheck source=../../scripts/lib/request.sh
. "$LIB"

# spec helper: write content to a file and emit a <path>:<mode>:<file> spec
spec() { # $1=path $2=mode $3=content
  local f
  f="$WORK/c$(printf '%s' "$1$2$3" | cksum | cut -d' ' -f1)"
  printf '%s' "$3" > "$f"
  printf '%s:%s:%s' "$1" "$2" "$f"
}

R="git@github.com:Owner/bp.git"
B="main"
S="0123456789abcdef0123456789abcdef01234567"
P="acme-flow"

# ===========================================================================
# 1. Determinism: the same inputs give the same key, twice.
# ===========================================================================
k1=$(bp_request_key "$R" "$B" "$S" "$P" "$(spec docs/DoD.md 100644 hello)")
k2=$(bp_request_key "$R" "$B" "$S" "$P" "$(spec docs/DoD.md 100644 hello)")
if [ -z "$k1" ]; then
  fail "#1 key is empty"
elif [ "$k1" != "$k2" ]; then
  fail "#1 the same inputs produced two keys: $k1 vs $k2"
elif [ "${#k1}" -ne 64 ]; then
  fail "#1 expected a 64-char SHA-256 hex digest, got ${#k1} chars"
else
  pass "#1 identical inputs produce one 64-char key"
fi

# ===========================================================================
# 2. Every component participates. Change one, the key changes.
# ===========================================================================
base=$(bp_request_key "$R" "$B" "$S" "$P" "$(spec docs/DoD.md 100644 hello)")
declare -A variants=(
  [remote]="$(bp_request_key 'git@github.com:Other/bp.git' "$B" "$S" "$P" "$(spec docs/DoD.md 100644 hello)")"
  [branch]="$(bp_request_key "$R" 'release' "$S" "$P" "$(spec docs/DoD.md 100644 hello)")"
  [base_sha]="$(bp_request_key "$R" "$B" 'ffffffffffffffffffffffffffffffffffffffff' "$P" "$(spec docs/DoD.md 100644 hello)")"
  [project]="$(bp_request_key "$R" "$B" "$S" 'other-project' "$(spec docs/DoD.md 100644 hello)")"
  [path]="$(bp_request_key "$R" "$B" "$S" "$P" "$(spec docs/SECURITY.md 100644 hello)")"
  [mode]="$(bp_request_key "$R" "$B" "$S" "$P" "$(spec docs/DoD.md 100755 hello)")"
  [content]="$(bp_request_key "$R" "$B" "$S" "$P" "$(spec docs/DoD.md 100644 goodbye)")"
)
for name in "${!variants[@]}"; do
  if [ "${variants[$name]}" = "$base" ]; then
    fail "#2 changing '$name' did not change the key — that component is not in it"
  fi
done
[ "$FAILED" -eq 0 ] && pass "#2 remote, branch, base, project, path, mode and content all bind"

# ===========================================================================
# 3. THE FRAMING CASE. Without length-prefixing, "ab"+"c" and "a"+"bc" hash the
#    same. This is the entire reason the key is framed rather than delimited.
# ===========================================================================
kA=$(bp_request_key "$R" "$B" "$S" "$P" "$(spec a 100644 ab)" "$(spec b 100644 c)")
kB=$(bp_request_key "$R" "$B" "$S" "$P" "$(spec a 100644 a)" "$(spec b 100644 bc)")
if [ "$kA" = "$kB" ]; then
  fail "#3 'ab'+'c' collided with 'a'+'bc' — the key is concatenating without framing"
else
  pass "#3 content boundaries are framed; adjacent-content collision is impossible"
fi

# Same shape one level up: a project name whose bytes could run into the next
# component.
kC=$(bp_request_key "$R" "$B" "$S" "ab" "$(spec x 100644 z)")
kD=$(bp_request_key "$R" "$B" "$S" "a" "$(spec x 100644 z)")
if [ "$kC" = "$kD" ]; then
  fail "#3b project-name boundary is not framed"
else
  pass "#3b header components are framed too, not newline-delimited"
fi

# ===========================================================================
# 4. A component containing a NEWLINE must not break framing — this is what
#    defeated the earlier newline-delimited header design.
# ===========================================================================
kE=$(bp_request_key "$R" "$(printf 'main\nevil')" "$S" "$P" "$(spec x 100644 z)")
kF=$(bp_request_key "$R" "main" "$S" "$P" "$(spec x 100644 z)")
if [ "$kE" = "$kF" ]; then
  fail "#4 a newline inside a component collided with the plain component"
elif [ -z "$kE" ]; then
  fail "#4 a newline-bearing component produced no key"
else
  pass "#4 a newline inside a component cannot forge a record boundary"
fi

# ===========================================================================
# 5. Ref validation runs on the COMPLETE candidate via git check-ref-format —
#    a project name can be legal alone and invalid once composed.
# ===========================================================================
if ! bp_request_ref "acme-flow" "$k1" >/dev/null 2>&1; then
  fail "#5 an ordinary project name was rejected"
else
  pass "#5 an ordinary project name produces a valid ref"
fi

# These are git's rules, confirmed by asking git rather than recalling them.
# An earlier version of this list included "trailing." — git ACCEPTS a
# component-final dot, because its no-trailing-dot rule applies to the whole ref
# rather than each component. The test expectation was wrong, not the code.
for bad in ".leading" "has..dots" "has~tilde" "has^caret" "has:colon" \
           "has?q" "has*star" "has[bracket" "ends.lock" "at@{brace" \
           "has space" "back\\slash" ""; do
  if bp_request_ref "$bad" "$k1" >/dev/null 2>&1; then
    fail "#5b '$bad' was accepted as a ref component — check-ref-format is not being consulted"
  fi
done
[ "$FAILED" -eq 0 ] && pass "#5b leading dot, .., ~, ^, :, ?, *, [, .lock, @{, space, backslash and empty all refused"

# A slash is LEGAL in a ref, so check-ref-format cannot catch this — the rule
# being violated is ours. `a/b` would give a2bp/a/b/<digest>: an extra namespace
# level git accepts happily and `prs` cannot parse, since it reads the project
# from a fixed position.
if bp_request_ref "a/b" "$k1" >/dev/null 2>&1; then
  fail "#5d a project name containing '/' was accepted — it would add a ref namespace level that prs cannot parse"
elif ! bp_request_ref "a/b" "$k1" 2>&1 | grep -q "single ref component"; then
  fail "#5d refused, but not for the slash reason: $(bp_request_ref 'a/b' "$k1" 2>&1 | head -1)"
else
  pass "#5d a project name with '/' is refused — check-ref-format alone would allow it"
fi

# And the converse, documented so nobody 'fixes' it: git accepts a trailing dot
# mid-ref, so we do too rather than inventing a stricter rule than git's.
if bp_request_ref "trailing." "$k1" >/dev/null 2>&1; then
  pass "#5e a component-final dot is accepted, matching git rather than a stricter invented rule"
else
  fail "#5e 'trailing.' was refused, but git accepts it — we should not be stricter than check-ref-format without a stated reason"
fi

# Refusal must name the reason, not just fail — the operator has to know why.
if bp_request_ref ".leading" "$k1" 2>&1 | grep -qi "not a valid branch name"; then
  pass "#5c a refused ref says why, naming the project"
else
  fail "#5c refusal gave no usable reason: $(bp_request_ref '.leading' "$k1" 2>&1 | head -1)"
fi

# ===========================================================================
# 6. The ref carries the FULL digest. A truncated id is a birthday problem
#    against a namespace that persists.
# ===========================================================================
ref=$(bp_request_ref "acme-flow" "$k1")
if [ "$ref" != "a2bp/acme-flow/$k1" ]; then
  fail "#6 unexpected ref shape: $ref"
elif ! printf '%s' "$ref" | grep -q "$k1"; then
  fail "#6 the ref does not carry the full digest"
else
  pass "#6 the ref carries the full 64-char digest"
fi

# ===========================================================================
# 7. The git-version floor is a number with a reason, and it is enforced.
# ===========================================================================
if [ "$BP_REQUEST_MIN_GIT" != "2.32" ]; then
  fail "#7 expected the documented floor of 2.32, found $BP_REQUEST_MIN_GIT"
elif ! bp_request_check_git_version 2>/dev/null; then
  fail "#7 this host's git was rejected: $(git --version)"
else
  pass "#7 the git floor is 2.32 and this host satisfies it"
fi

# ===========================================================================
# 8. The hermetic wrapper actually scrubs. A hostile ambient config must not
#    change what construction sees.
# ===========================================================================
out=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=true \
      GIT_DIR=/nonexistent GIT_INDEX_FILE=/nonexistent \
      bp_request_hermetic sh -c 'echo "${GIT_DIR:-unset}/${GIT_CONFIG_COUNT:-unset}/${GIT_INDEX_FILE:-unset}/$GIT_CONFIG_GLOBAL/$LC_ALL"')
if [ "$out" != "unset/unset/unset//dev/null/C" ]; then
  fail "#8 hermetic env did not scrub as expected: [$out]"
else
  pass "#8 hermetic env unsets GIT_DIR/GIT_CONFIG_COUNT/GIT_INDEX_FILE and pins config+locale"
fi

# Transport keeps credentials but still refuses redirection.
out=$(GIT_SSH_COMMAND="ssh -i /key" GIT_DIR=/nonexistent GIT_CONFIG_COUNT=1 \
      bp_request_transport_env sh -c 'echo "${GIT_SSH_COMMAND:-unset}|${GIT_DIR:-unset}|${GIT_CONFIG_COUNT:-unset}"')
if [ "$out" != "ssh -i /key|unset|unset" ]; then
  fail "#8b transport env wrong — credentials must survive, redirection must not: [$out]"
else
  pass "#8b transport keeps GIT_SSH_COMMAND and still refuses GIT_DIR / config injection"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: request identity is framed, deterministic, and ref-validated."
  exit 0
fi
echo "FAILED: a2bp request identity."
exit 1
