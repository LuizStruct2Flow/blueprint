#!/bin/bash
# tests/env-namespace/test.sh
#
# BUG-006 — a project-specific env-var namespace in a MANAGED script.
#
# scripts/log-activity.sh keyed its knobs on `LWA_FEED_MAX_LINES` /
# `LWA_FEED_KEEP_LINES` / `LWA_FEED_LABEL`. `LWA` is one project's initials, and
# that file ships to every project, so every derived project inherited
# configuration named after somebody else's repo. Same class as BUG-002 (a
# hardcoded state dir), BUG-009 (a project's monitor row in the seed template)
# and BUG-010 (a fleet's persona names in a managed script): **a specific thing
# baked into a file that travels**.
#
# The generic guard is what this file is for. Fixing three variable names would
# leave the next one to be found by hand, and this repo has now found four of
# them by hand.
#
# Run from the blueprint repo root:  bash tests/env-namespace/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/scripts/blueprint"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

# ===========================================================================
# 1. NO MANAGED FILE DEFINES A NON-GENERIC ENV NAMESPACE.
#
#    Derived from MANAGED_FILES rather than a hand-listed set, so a file added
#    tomorrow is covered without anyone remembering this test exists.
#
#    The rule: an env var a managed file READS or SETS must start with an
#    approved generic prefix. Anything else is a name that means something to
#    one project and nothing to the rest.
# ===========================================================================
ALLOWED_PREFIXES='AGENT_|BP_|BLUEPRINT_|GIT_|SIGNAL_|CODEX_|GEMINI_|CLAUDE_|SONAR_|GITHUB_|GH_|OSV_|SEMGREP_|GITLEAKS_|HOME|PATH|TMPDIR|PWD|SHELL|USER|LANG|LC_|EDITOR|NO_COLOR|TERM|CI'

managed=$(bash "$CLI" files 2>/dev/null | sed 's/^ *//')
[ -n "$managed" ] || { echo "FAIL: could not list MANAGED_FILES"; exit 1; }

checked=0
offenders=""
for rel in $managed; do
  f="$ROOT/$rel"
  [ -f "$f" ] || continue
  case "$rel" in *.sh|*/blueprint) ;; *) continue ;; esac
  checked=$((checked+1))
  # Assignments and ${...} reads of ALL-CAPS names, comments stripped so an
  # incident record quoting an old name is not a finding.
  # ONLY externally-settable knobs — names read with a default, i.e.
  # ${NAME:-...} or ${NAME:=...}. That is what "an env namespace that ships"
  # means. My first version matched every ALL-CAPS token and flagged ROOT,
  # TICK, C_BOLD and forty other INTERNAL variables, which are not
  # configuration and cannot be set by a derived project. A guard that reports
  # sixty false positives gets deleted, not obeyed.
  names=$(sed 's/#.*//' "$f" \
    | grep -oE '\$\{[A-Z][A-Z0-9_]{3,}:[-=]' \
    | sed 's/^\${//; s/:[-=]$//' | sort -u)
  for n in $names; do
    printf '%s' "$n" | grep -qE "^($ALLOWED_PREFIXES)" && continue
    offenders="$offenders $rel:$n"
  done
done

if [ "$checked" -lt 5 ]; then
  fail "#1 only $checked managed scripts scanned — discovery is broken, so this proved nothing"
elif [ -n "$offenders" ]; then
  fail "#1 managed scripts define env vars outside the generic namespaces — these ship to every project:$offenders"
  echo "        Rename to an AGENT_/BP_/BLUEPRINT_ prefix, or add the prefix here"
  echo "        deliberately if it is genuinely generic."
else
  pass "#1 all $checked managed scripts keep to generic env namespaces"
fi

# ===========================================================================
# 2. THE SPECIFIC REGRESSION — no LWA_ name is READ as a primary source.
#    Back-compat fallbacks are allowed (a project that set the old name must
#    not silently lose its config), but the generic name must come first.
# ===========================================================================
bad=""
for rel in $managed; do
  f="$ROOT/$rel"
  [ -f "$f" ] || continue
  case "$rel" in *.sh|*/blueprint) ;; *) continue ;; esac
  # A primary read looks like ${LWA_X:-default}; a fallback looks like
  # ${AGENT_X:-${LWA_X:-default}} — the latter has AGENT_ to its left.
  while IFS= read -r line; do
    printf '%s' "$line" | grep -q 'LWA_' || continue
    printf '%s' "$line" | grep -qE '(AGENT_[A-Z_]+:-\$\{LWA_|:=\$\{LWA_)' && continue
    bad="$bad $rel"
  done < <(sed 's/#.*//' "$f")
done
if [ -n "$bad" ]; then
  fail "#2 a managed script still reads an LWA_ name as its PRIMARY source:$(printf '%s' "$bad" | tr ' ' '\n' | sort -u | tr '\n' ' ')"
else
  pass "#2 no managed script reads an LWA_ name except as a back-compat fallback"
fi

# ===========================================================================
# 3. THE ROTATION IS NOT DUPLICATED. log-activity.sh had its own copy of
#    "append then trim", which is how the inode-preserving detail drifts: a
#    `mv`-based rotate in one copy orphans the feed supervisor's open handle
#    while the other stays correct. One appender.
# ===========================================================================
la="$ROOT/scripts/log-activity.sh"
if [ ! -f "$la" ]; then
  fail "#3 scripts/log-activity.sh not found"
elif ! grep -q 'lib/feed.sh' "$la"; then
  fail "#3 log-activity.sh does not source the shared appender — it has its own copy of the rotation"
elif sed 's/#.*//' "$la" | grep -qE 'tail -n .*>.*\.rot\.|wc -l < ?"?\$log'; then
  fail "#3 log-activity.sh still contains its own rotation logic"
else
  pass "#3 log-activity.sh routes through the one shared appender"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-006 — managed scripts carry no project-specific env namespace."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
