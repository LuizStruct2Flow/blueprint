#!/bin/sh
# scripts/run-ts-suites.sh — run the TypeScript suites as ONE vitest process,
# and render them as one pipeline stage per suite.
#
# WHY THIS EXISTS. TASK-018 has two requirements that pull against each other:
#
#   - Parallelism is the point. Forty-two separate `vitest run` invocations means
#     forty-two Node startups and discards it entirely.
#   - The gate must still list every suite. `bootstrap-gate` #3 requires a
#     derived project's gate to pass >= 25 stages as an explicit non-vacuity
#     guard, and the SLO's slowest-stage line has to name something actionable —
#     `slowest: vitest 200s` names nothing (PLAN-TASK-018 §7.3).
#
# So one process runs, and its per-file results are injected as individual
# stages through pipeline.sh's batch API.
#
# THE DECLARATION COMES FROM tests/SUITES.md, NOT FROM VITEST.
#
# This is the load-bearing detail, and Philipp stated the residual risk plainly
# when building the API: if the expected set were derived from the runner's own
# output, every guard would reduce to trusting the runner. A suite silently
# dropped from vitest's include glob would then vanish with the gate still
# green — BUG-005 exactly, and the same door TASK-018 §7.1 just closed in the
# manifest. The manifest owns the list; vitest reports against it; a declared
# suite that does not report FAILS BY NAME.
#
# Usage (from .githooks/pre-push-project, with pipeline.sh already sourced):
#   . scripts/run-ts-suites.sh
#   ts_suites_stage
#
# Exit: 0 when every declared suite reported success, non-zero otherwise. The
# caller does not need to inspect it — failures land in the pipeline tally.

# ts_suites_present — is there anything to run at all?
#
# A project mid-migration, or one that has not installed the toolchain, must get
# a truthful skip rather than a failure. Mirrors tests/manifest's own no-Node
# property: the shell half of this repo keeps working with zero TS present.
ts_suites_present(){
  [ -f "${1:-.}/vitest.config.ts" ] || return 1
  [ -n "$(find "${1:-.}/tests" -type f -name '*.spec.ts' -print -quit 2>/dev/null)" ]
}

# ts_declared_suites ROOT — the suite names that own a *.spec.ts.
#
# Delegates to scripts/lib/suites.sh. This function used to carry its own copy
# of the manifest table parse, under a comment claiming "two parsers of one
# table drift, and this file exists to be the thing that cannot" — while being
# the second parser. Vitali (QA-1) caught it, and it was already drifting: the
# manifest's copy emits six fields and gates the parallelism class on the last
# two, while this one read field 2 and would have accepted a legacy four-column
# row the manifest rejects.
ts_declared_suites(){
  _tsd_root="${1:-.}"
  if [ -r "$_tsd_root/scripts/lib/suites.sh" ]; then
    # shellcheck source=scripts/lib/suites.sh
    . "$_tsd_root/scripts/lib/suites.sh"
    bp_suites_with_spec "$_tsd_root"
  fi
}

# ts_suites_stage [ROOT] — the whole thing.
ts_suites_stage(){
  _ts_root="${1:-$(pwd)}"

  if ! ts_suites_present "$_ts_root"; then
    pipe_skip "vitest · TASK-018" "no *.spec.ts on disk yet"
    return 0
  fi

  if ! command -v npx >/dev/null 2>&1; then
    # BLOCK, do not skip. scripts/install-toolchain.sh makes node/npm a blocking
    # capability precisely so a machine without them cannot get a green gate
    # over suites it never ran — the TASK-017 defect. Skipping here would
    # reintroduce it one layer up.
    pipe_stage "vitest · TASK-018" false
    return 1
  fi

  _ts_expect="$(ts_declared_suites "$_ts_root")"
  if [ -z "$_ts_expect" ]; then
    pipe_skip "vitest · TASK-018" "no suite in tests/SUITES.md owns a *.spec.ts"
    return 0
  fi

  _ts_json="$(mktemp)"
  # No positional path filter, deliberately: tests/manifest #4 proves the gate
  # runs vitest BLANKET, because a path-filtered run is how a suite silently
  # stops being executed. Narrowing this breaks that assertion by design.
  _ts_out="$(mktemp)"
  # BUG-055 — SCRUB GIT'S ENVIRONMENT, exactly as every shell suite does.
  #
  # git exports GIT_DIR when it invokes a hook. The harness refuses to run any
  # scenario while it is present (tests/harness/env.ts, assertProcessEnvClean)
  # and that refusal is CORRECT — it is the BUG-046/BUG-047 guard. The two
  # facts together mean the TS suites could never run under a real `git push`:
  # by hand all 41 passed, under a push all 41 failed, and the difference was
  # one inherited variable.
  #
  # The shell suites have handled this since BUG-014 with an `unset` at the top
  # of each file. Doing it here rather than in each spec is the same reasoning
  # as the harness itself: every TS suite routes through this one command, so
  # this is the place it cannot be forgotten.
  #
  # BUG-055 — AND KEEP THE STATUS AND THE OUTPUT.
  #
  # This was `( … ) >/dev/null 2>&1` followed by `_ts_rc=$?`, under a hook that
  # runs `set -e`. That makes the assignment UNREACHABLE on the only path where
  # it matters: a failing vitest killed the hook before its status could be
  # read, so the stage printed nothing at all — no stage line, no summary, no
  # error — and the push was refused with no way to tell a broken run from a
  # missing one. `pipe_batch_end` below exists to reconcile that status, and it
  # could never receive it. The per-suite note already said "see the vitest
  # output above" while the output was going to /dev/null.
  if ( cd "$_ts_root" \
       && unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
       && npx vitest run --reporter=json --outputFile="$_ts_json" ) >"$_ts_out" 2>&1
  then
    _ts_rc=0
  else
    _ts_rc=$?
  fi

  # A failing run must SAY so. Truncated because a full vitest failure dump is
  # long and the gate is already dense; the temp file path is not printed
  # because it is removed below, and a path to a deleted file is worse than no
  # path at all.
  if [ "$_ts_rc" -ne 0 ]; then
    echo "  ── vitest failed (rc=$_ts_rc) ──"
    tail -40 "$_ts_out"
    echo "  ── end vitest output ──"
  fi
  rm -f "$_ts_out"

  # shellcheck disable=SC2086
  pipe_batch_begin "vitest" $_ts_expect

  # One report per DECLARED suite. Read out of vitest's JSON by suite directory
  # rather than by file, so a suite holding several specs still renders as one
  # stage and still matches its manifest row.
  for _s in $_ts_expect; do
    _ms=0
    _rc=1
    _note=""
    if [ -s "$_ts_json" ]; then
      # jq is already a hard dependency of the gate (the semgrep stage blocks
      # without it), so using it here adds nothing new to install.
      # `| floor` is REQUIRED, not tidiness. vitest reports endTime as a float
      # (…884339.4248), so the subtraction yields a float, pipe_stage_report
      # rejects a non-integer, and the guard below would silently substitute 0 —
      # every stage rendering 0.0s while the SLO's slowest-stage line named
      # nothing. Caught by running the bridge rather than by reading it.
      _ms="$(jq -r --arg s "$_s" '
              [ .testResults[]? | select(.name | test("/tests/" + $s + "/")) ]
              | if length == 0 then empty
                else ( map((.endTime // 0) - (.startTime // 0)) | add | floor ) end
            ' "$_ts_json" 2>/dev/null)"
      _rc="$(jq -r --arg s "$_s" '
              [ .testResults[]? | select(.name | test("/tests/" + $s + "/")) ]
              | if length == 0 then 1
                elif any(.status == "failed") then 1
                else 0 end
            ' "$_ts_json" 2>/dev/null)"
    fi
    case "$_ms" in ''|*[!0-9]*) _ms=0 ;; esac
    case "$_rc" in ''|*[!0-9]*) _rc=1 ;; esac
    [ "$_rc" -ne 0 ] && _note="see the vitest output above"
    pipe_stage_report "$_s" "$_ms" "$_rc" "$_note"
  done

  rm -f "$_ts_json"

  # The runner's own status is reconciled against the reports: a non-zero exit
  # with every suite green means vitest died OUTSIDE a suite (a config error, an
  # import failure, a crashed worker), which must not render as a pass.
  pipe_batch_end "$_ts_rc"
}
