#!/bin/bash
# Show WHAT a mutant actually changed. `sub` proves its literal was found; it
# does not prove the hit was in executable code. C23's literal also occurs
# inside a COMMENT in placeholders.sh that quotes the very line it targets, so
# the mutant applied, changed a byte, satisfied the CHANGED-NOTHING guard — and
# altered nothing that runs. That reads as an equivalent mutant.
set -u
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
for m in "$@"; do
  t="$(mktemp -d "${TMPDIR:-/tmp}/aab-diff-XXXXXX")"
  mkdir -p "$t/scripts/lib" "$t/tests/a2bp-contamination"
  cp -a "$SRC/scripts/blueprint" "$t/scripts/"
  cp -a "$SRC"/scripts/lib/*.sh "$t/scripts/lib/"
  cp -a "$SRC/tests/a2bp-contamination/a2bp-contamination.spec.ts" "$t/tests/a2bp-contamination/"
  ( . "$(dirname "${BASH_SOURCE[0]}")/equiv.sh" --list >/dev/null 2>&1 ) || true
  # shellcheck disable=SC1090
  SUB_ONLY=1 bash -c "
    NL=\$'\n'
    $(sed -n '/^# sub FILE OLD NEW/,/^}/p' "$(dirname "${BASH_SOURCE[0]}")/equiv.sh")
    REQ=scripts/lib/request.sh; BLD=scripts/lib/request-build.sh
    INP=scripts/lib/request-inputs.sh; CFG=scripts/lib/request-config.sh
    FIL=scripts/lib/request-file.sh; CON=scripts/lib/contamination.sh
    PLA=scripts/lib/placeholders.sh; CLI=scripts/blueprint
    SPEC_CON=tests/a2bp-contamination/a2bp-contamination.spec.ts
    $(sed -n "/^apply_$m() {/,/^}/p" "$(dirname "${BASH_SOURCE[0]}")/equiv.sh")
    apply_$m '$t'
  "
  echo "=== $m"
  diff -u --label "a/scripts" --label "b/scripts" -r "$SRC/scripts" "$t/scripts" 2>/dev/null | grep -E '^[-+][^-+]' | head -20
  diff -u "$SRC/tests/a2bp-contamination/a2bp-contamination.spec.ts" "$t/tests/a2bp-contamination/a2bp-contamination.spec.ts" 2>/dev/null | grep -E '^[-+][^-+]' | head -20
  rm -rf "$t"
done
