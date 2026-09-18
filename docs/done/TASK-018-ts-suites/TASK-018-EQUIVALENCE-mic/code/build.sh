#!/usr/bin/env bash
# .scratch/equiv/build.sh MUTANT_ROOT SUITE
#
# Materialise a self-contained copy of the blueprint at MUTANT_ROOT, holding
# both implementations of one suite, so a MUTATION of the subject scripts can be
# run through each and their verdicts compared.
#
# Both implementations resolve the tree they test from their OWN location:
#   tests/<suite>/test.sh   ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
#   tests/<suite>/*.spec.ts REPO_ROOT = resolve(dirname(import.meta.url), '..', '..')
# so placing both at MUTANT_ROOT/tests/<suite>/ points both at MUTANT_ROOT with
# no flag and no environment variable to get wrong.
set -u
M="${1:?mutant root}"
SUITE="${2:?suite}"
SRC="$(cd "$(dirname "$0")/../../../.." && pwd)"

mkdir -p "$M/tests"
cp -R "$SRC/scripts" "$M/scripts"
cp "$SRC/AGENT_SIGNAL.md" "$M/AGENT_SIGNAL.md"
# bp_state_root() walks up looking for .blueprint-root / .blueprint-source / .git.
# The marker keeps the walk inside the mutant instead of escaping to the real repo.
touch "$M/.blueprint-root"

cp -R "$SRC/tests/harness" "$M/tests/harness"
cp -R "$SRC/tests/helpers" "$M/tests/helpers"
cp "$SRC/tests/package.json" "$SRC/tests/tsconfig.json" "$SRC/tests/vitest.config.ts" "$M/tests/"
# Symlinked, not copied: 200 MB per mutant is how BUG-049 happened.
ln -s "$SRC/tests/node_modules" "$M/tests/node_modules"

mkdir -p "$M/tests/$SUITE"
cp "$SRC/tests/$SUITE/test.sh" "$M/tests/$SUITE/test.sh"
cp "$SRC/tests/$SUITE/$SUITE.spec.ts" "$M/tests/$SUITE/$SUITE.spec.ts"
