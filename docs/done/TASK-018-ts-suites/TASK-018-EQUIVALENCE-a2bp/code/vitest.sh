#!/bin/bash
# Elias / TASK-018 — run vitest from tests/ (never the repo root: there is no
# config there and npx would fetch an unpinned vitest, which reads as a pass).
# $1 = repo root to run in; the rest are vitest args.
set -eu
ROOT="${1:?repo root}"
shift
cd "$ROOT/tests"
# NOT AGENT_PERSONA: the harness refuses to run with it set in the test process
# (assertProcessEnvClean / BUG-046). Personas label the feed, not the runner.
unset AGENT_PERSONA
exec npx vitest run "$@"
