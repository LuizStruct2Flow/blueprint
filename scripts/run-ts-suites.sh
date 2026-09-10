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
# THE DECLARATION COMES FROM THE FILESYSTEM, NOT FROM VITEST.
#
# This is the load-bearing detail, and Philipp stated the residual risk plainly
# when building the API: if the expected set were derived from the runner's own
# output, every guard would reduce to trusting the runner. A suite silently
# dropped from vitest's include glob would then vanish with the gate still
# green — BUG-005 exactly, and the same door TASK-018 §7.1 closed in the
# manifest.
#
# It used to come from tests/SUITES.md. TASK-020 deleted that table (R1: a
# second description of a test is a copy that drifts), and the expected set is
# now the `*.spec.ts` files on disk, via `scripts/lib/suites.sh`. That is not a
# weaker source, it is the same property from a better one: `find` consults no
# vitest config, no include glob and no reporter, so the runner cannot edit what
# it is being checked against. The filesystem owns the list, vitest reports
# against it, and a declared suite that does not report FAILS BY NAME.
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
  # TASK-020: the harness manifest lives UNDER tests/, which is a managed
  # directory no derived project owns a copy of — so the toolchain travels by
  # both propagation paths or by neither, and it can never clobber a project's
  # own root package.json.
  [ -f "${1:-.}/tests/vitest.config.ts" ] || return 1
  [ -n "$(find "${1:-.}/tests" -type f -name '*.spec.ts' -print -quit 2>/dev/null)" ]
}

# ts_declared_suites ROOT — the suite names that own a *.spec.ts.
#
# Delegates to scripts/lib/suites.sh. This function used to carry its own copy
# of the suite lookup, under a comment claiming "two parsers of one table drift,
# and this file exists to be the thing that cannot" — while being the second
# parser. Vitali (QA-1) caught it, and it was already drifting. The rule did not
# change when the source did: a second `find` here would be a second answer to
# "what are the suites", which is the whole hazard.
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

  # THE LIST IS THE CONTRACT, NOT THE STATUS — and `|| true` is load-bearing.
  #
  # scripts/lib/suites.sh says of bp_suites_with_spec: "a final suite without a
  # spec made this return 1 with a perfectly good list on stdout. Harmless to
  # the one caller that reads it through `$( )`." That reasons about the VALUE
  # and forgets the caller runs under `set -e`, where a non-zero status is fatal
  # no matter how good the list is. The gate died on this line: entered the
  # stage, passed the npx check, and vanished — no stage, no skip, no summary,
  # push refused with nothing printed. Emptiness is judged below, where it can
  # be reported.
  _ts_declrc=0
  _ts_expect="$(ts_declared_suites "$_ts_root")" || _ts_declrc=$?
  if [ -z "$_ts_expect" ]; then
    pipe_skip "vitest · TASK-018" "no suite under tests/ owns a *.spec.ts"
    return 0
  fi

  _ts_json="$(mktemp)"
  _ts_out="$(mktemp)"
  # No positional path filter, deliberately: tests/manifest #4 proves the gate
  # runs vitest BLANKET, because a path-filtered run is how a suite silently
  # stops being executed. Narrowing this breaks that assertion by design.
  #
  # BUG-055 — KEEP THE STATUS AND THE OUTPUT.
  #
  # This was `( … ) >/dev/null 2>&1` followed by `_ts_rc=$?`, under a hook that
  # runs `set -e`. That makes the assignment UNREACHABLE on the only path where
  # it matters: a failing runner would kill the hook before its status could be
  # read. `pipe_batch_end` below exists to reconcile that status and could never
  # receive it, and the per-suite note said "see the vitest output above" while
  # the output went to /dev/null.
  #
  # This was not what broke the push — that was the declared-suites status
  # above — but it is why finding it took eight attempts: every failure in this
  # stage rendered as an absence, and an absence names nothing.
  #
  # ENV SCRUB: HARDENING, NOT THE FIX. Stated plainly because the first draft of
  # this comment claimed otherwise. git does NOT export GIT_DIR to a pre-push
  # hook (measured: it exports GIT_EDITOR, GIT_EXEC_PATH, GIT_PREFIX and
  # nothing else), so the harness's assertProcessEnvClean was never firing here.
  # The scrub stays because any caller that DOES hold a git or agent variable —
  # a nested gate, a dispatcher, a future hook — would otherwise hit that guard
  # and fail in the same unreadable way, and because every shell suite has
  # scrubbed since BUG-014. It is a defence with a real threat and no cost, not
  # a diagnosis.
  #
  # By PREFIX rather than by list: FORBIDDEN_ENV is fifteen names, all GIT_* or
  # AGENT_*, and restating them here would be a second copy that drifts. This
  # file already made that mistake once — `ts_declared_suites` carried a
  # duplicate of the manifest parse under a comment claiming it could not drift.
  # `cd` into tests/, not into the repo root: that is where the harness manifest
  # and node_modules live (TASK-020), so it is vitest's root and npx's lookup
  # start. The include glob in tests/vitest.config.ts is root-relative to match.
  if (
    cd "$_ts_root/tests" || exit 1
    for _v in $(env | sed -nE 's/^((GIT|AGENT)_[A-Za-z0-9_]*)=.*/\1/p'); do
      unset "$_v"
    done
    # TWO reporters, deliberately. `json` feeds pipe_stage_report below;
    # `default` is the only thing that tells a human WHICH assertion failed.
    # With json alone the captured output is a path to a file this function
    # deletes seconds later — BUG-055 fixed the silence and left the
    # uselessness, which cost three ~200s re-runs to notice.
    npx vitest run --reporter=default --reporter=json --outputFile="$_ts_json"
  ) >"$_ts_out" 2>&1
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
