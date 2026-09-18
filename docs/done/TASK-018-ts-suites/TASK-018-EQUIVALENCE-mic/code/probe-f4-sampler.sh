#!/usr/bin/env bash
# tests/baton-durability #5 (Codex F4) is GREEN against the defect it exists to
# catch. Why? Its sampler is bounded by 400 ITERATIONS, not by the publication —
# so it can run to completion before signal-set.sh has created anything.
#
# This reproduces the shell case's sampler verbatim and reports how long it ran
# and how many samples saw a file at all.
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
MODE="${1:-mutant}"

W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
cp -R "$ROOT/scripts" "$W/scripts"
touch "$W/.blueprint-root"

if [ "$MODE" = mutant ]; then
  MUT_FROM='  _bp_seed_src="$(mktemp "${SIGNAL}.seed.XXXXXX")"' \
  MUT_TO='  _bp_seed_src="$SIGNAL"' \
    perl -0pi -e 's/\Q$ENV{MUT_FROM}\E/$ENV{MUT_TO}/' "$W/scripts/signal-set.sh"
  grep -q '_bp_seed_src="$SIGNAL"' "$W/scripts/signal-set.sh" || { echo "mutation failed"; exit 3; }
fi

at="$W/at"
mkdir -p "$at/first"
abaton="$at/first/signal.md"

# The shell case's sampler, verbatim, plus instrumentation.
(
  start="$(date +%s.%N)"
  seen=0
  for _ in $(seq 1 400); do
    if [ -f "$abaton" ]; then
      seen=$((seen + 1))
      grep -q 'Holder | Nobody' "$abaton" 2>/dev/null && echo SAW_SEED >> "$at/samples"
      grep -q 'Holder | Atomic' "$abaton" 2>/dev/null && echo SAW_FINAL >> "$at/samples"
    fi
  done
  end="$(date +%s.%N)"
  awk -v a="$start" -v b="$end" -v s="$seen" \
    'BEGIN{ printf "sampler: ran %.3fs, %d of 400 iterations saw a file at all\n", b-a, s }'
) &
sampler=$!

pstart="$(date +%s.%N)"
AGENT_SIGNAL_FILE="$abaton" bash "$W/scripts/signal-set.sh" \
  --holder Atomic --state ACTIVE --task 'first creation is atomic' >/dev/null 2>&1
pend="$(date +%s.%N)"
wait "$sampler" 2>/dev/null

awk -v a="$pstart" -v b="$pend" 'BEGIN{ printf "publisher: took %.3fs\n", b-a }'
echo "mode=$MODE verdict=$(grep -q SAW_SEED "$at/samples" 2>/dev/null && echo 'CAUGHT the seed' || echo 'MISSED the seed')"
