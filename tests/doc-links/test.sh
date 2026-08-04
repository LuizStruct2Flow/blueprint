#!/bin/bash
# tests/doc-links/test.sh
#
# Relative links under docs/ must resolve.
#
# WHY THIS EXISTS. Files move through the lifecycle constantly — doing/ ->
# waiting-acceptance/ -> done/ is the normal path, and reference docs get
# relocated on top of that. Every move silently breaks the links pointing at the
# old location, and nothing notices until a reader clicks one.
#
# On 2026-08-03 there were THIRTEEN broken links, all from moves. Two of them
# were in docs/doing/BUGS.md, and one — INDEX.md -> ../doing/BUG-004-gate-arming/
# — had been wrong across TWO relocations. The founder found the pollution by
# opening the file; that is the check this replaces.
#
# Run from the blueprint repo root:  bash tests/doc-links/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

# Extract relative link targets from one file.
#
# INLINE CODE IS STRIPPED FIRST. `[AGENT_ROSTER.md](AGENT_ROSTER.md)` inside
# backticks is a file QUOTING a link — documentation about a link, not a link —
# and the first version of this check reported it. A guard that reports correct
# prose as broken is one people learn to ignore, which is the failure mode this
# repo keeps hitting; strip code spans and fenced blocks so only real links are
# considered.
links_in() {
  sed -e '/^```/,/^```/d' -e 's/`[^`]*`//g' "$1" \
    | grep -oE '\]\([^)#][^)]*\)' \
    | sed 's/^](//; s/)$//'
}

total=0
broken=""
while IFS= read -r md; do
  dir="$(dirname "$md")"
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    case "$target" in http*|mailto:*|'<'*) continue ;; esac
    target="${target%%#*}"          # drop anchors
    [ -n "$target" ] || continue
    total=$((total + 1))
    [ -e "$dir/$target" ] || broken="$broken
  $md -> $target"
  done <<EOF
$(links_in "$md")
EOF
done <<EOF
$(find "$ROOT/docs" -name '*.md' | sort)
EOF

# Non-vacuity: a find or grep that matches nothing would make this pass silently.
if [ "$total" -lt 20 ]; then
  fail "#0 only $total relative link(s) examined — the extractor is probably broken, so a pass proves nothing"
else
  pass "#0 examined $total relative link(s) across docs/"
fi

if [ -n "$broken" ]; then
  fail "#1 broken relative link(s) — a file moved and its references did not:$broken"
else
  pass "#1 every relative link under docs/ resolves"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: docs/ links resolve."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
