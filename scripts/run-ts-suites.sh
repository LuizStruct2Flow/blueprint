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

# ts_scrubbed CMD... — run CMD in a subshell with the population the TypeScript
# harness refuses removed: every GIT_*, AGENT_* and BP_* name, and BLUEPRINT_ROOT.
#
# BUG-117 — THIS IS THE ONE SCRUB, and both execution modes go through it: the
# gate's stage below, and the ts-tests step in .github/workflows/security.yml,
# which sources this file. That step used to run `npx vitest run` directly, so it
# inherited the runner's environment — GitHub-hosted runners export
# AGENT_TOOLSDIRECTORY — and the harness refused 697 of 770 tests on CI while the
# gate stayed green. A second copy of the unset population in the workflow would
# have been a second scrub to drift; tests/ts-bridge #3 executes the workflow's
# own step to prove it reaches this one.
#
# By PREFIX rather than by list, for the reason the stage's comment gives: the
# harness forbids every undeclared GIT_* / AGENT_* name (isForbiddenAmbient), and
# restating that here would be a copy that drifts. BLUEPRINT_ROOT is the one
# declared hazard outside the prefixes; tests/ts-bridge #1c imports
# UNPREFIXED_FORBIDDEN to pin that the two agree.
ts_scrubbed(){
  ( _ts_scrub_env; exec "$@" )
}

# _ts_scrub_env — the scrub itself, for a subshell that runs more than one
# command under it: sh_lint lists files with git and then starts ShellCheck, and
# both must see the scrubbed environment. It unsets in the CURRENT shell, so call
# it inside a subshell.
_ts_scrub_env(){
  for _v in $(env | sed -nE 's/^((GIT|AGENT|BP)_[A-Za-z0-9_]*)=.*/\1/p'); do
    unset "$_v"
  done
  unset BLUEPRINT_ROOT
}

# --- TASK-033: ShellCheck ----------------------------------------------------
#
# The shipped scripts carried `# shellcheck` directives as if they were linted,
# and nothing installed ShellCheck or ran it. Measured on 2026-09-15 with
# ShellCheck 0.10.0: 25 warnings across the 45 scripts this derives, 0 errors.
# They were fixed or disabled with a reason before this stage existed.
#
# THE SEVERITY IS WARNING. A warning is ShellCheck saying a script probably
# misbehaves: an unused or misspelt variable, a brace or `done` parsed as
# something else, a masked return value. Info and style are advice about idiom
# (266 of those in the same scripts). A stage that fails on advice is one people
# learn to route around, and ERROR alone would have passed all 25 real findings.
# Never lower it to make the stage pass; fix the finding, or disable it inline
# with a reason.
#
# ShellCheck is required on every machine that pushes (founder decision,
# 2026-09-15). scripts/install-toolchain.sh installs it on macOS and Linux.

# sh_lint_files [ROOT] — the scripts to lint, one repo-relative path per line.
#
# DERIVED, never listed: every file git TRACKS under scripts/ or .githooks/ that
# is shell by extension (.sh) or by shebang (sh, bash, dash). Tracked, because an
# untracked file ships nowhere. Those two directories, because they are the
# shipped scripts; tests/ holds fixtures and ShellCheck cannot lint heredocs
# inside TypeScript anyway. Returns 1 only when git cannot list the tree, so a
# broken listing cannot read as "nothing to lint".
#
# The shebang test is an `if`, not `grep && printf`. The hook runs under `set -e`,
# and a loop whose LAST file is not shell would otherwise end with grep's 1 and
# kill the listing before `return 0`. The stage then reported "cannot list" for
# a healthy tree. tests/ts-bridge #6d found it with a text file sorting last;
# this repo was passing only because its last tracked script is a .sh.
sh_lint_files(){
  _slf_root="${1:-.}"
  _slf_tracked="$(git -C "$_slf_root" -c core.quotePath=false ls-files -- scripts .githooks)" || return 1
  printf '%s\n' "$_slf_tracked" | while IFS= read -r _slf; do
    case "$_slf" in
      '') ;;
      *.sh) printf '%s\n' "$_slf" ;;
      *)
        if head -n 1 "$_slf_root/$_slf" 2>/dev/null | grep -Eq '^#!.*[/ ](sh|bash|dash)([[:space:]]|$)'; then
          printf '%s\n' "$_slf"
        fi
        ;;
    esac
  done
  return 0
}

# sh_lint [ROOT] — THE ONE LINT COMMAND. The gate's stage below and the shell
# lint step in .github/workflows/security.yml both call it, and tests/ts-bridge
# #6d and #7 execute both. Listing and linting run under one scrub, so an
# exported GIT_DIR cannot point `git ls-files` at another repository.
sh_lint(){
  (
    _ts_scrub_env
    cd "${1:-.}" || exit 1
    if ! _sl_list="$(sh_lint_files .)"; then
      echo "cannot list the tracked files under scripts/ and .githooks/ (not a git work tree?)"
      exit 1
    fi
    if [ -z "$_sl_list" ]; then
      echo "no tracked shell scripts under scripts/ or .githooks/, so there is nothing to lint"
      exit 0
    fi
    set --
    while IFS= read -r _sl_f; do
      set -- "$@" "$_sl_f"
    done <<EOF
$_sl_list
EOF
    exec shellcheck --severity=warning -- "$@"
  )
}

# sh_lint_stage [ROOT] — the gate's shell lint stage. It BLOCKS when ShellCheck
# is missing, and prints how to install it: a skip would be a green gate over a
# lint that never ran, the rule the typecheck stage applies to a missing compiler.
sh_lint_stage(){
  _sl_root="${1:-$(pwd)}"
  if ! command -v shellcheck >/dev/null 2>&1; then
    echo "❌ ShellCheck is not installed, so the shell scripts cannot be linted."
    echo "   Install it, then push again:"
    echo ""
    echo "       bash scripts/install-toolchain.sh"
    echo ""
    echo "   (macOS: it runs brew install shellcheck. Linux: it installs a pinned release into ~/.local/bin.)"
    pipe_stage "shellcheck · TASK-033" false
    return 1
  fi
  pipe_stage "shellcheck · TASK-033" sh_lint "$_sl_root"
}

# ts_typecheck [ROOT] — TASK-031. `tsc --noEmit -p ROOT/tests` with the PINNED
# compiler, started through ts_scrubbed.
#
# THIS IS THE ONE TYPECHECK COMMAND. The gate's stage below calls it, and so does
# the typecheck step in .github/workflows/security.yml, which sources this file:
# BUG-117's lesson applied before the two modes could diverge, not after.
# tests/ts-bridge #4d and #5 execute both to prove it.
#
# WHY IT EXISTS: vitest strips types without checking them, so a green suite set
# says nothing about types. Two tsc errors sat on main until BUG-119, and
# tests/tsconfig.json's exactOptionalPropertyTypes was enforced by nobody.
#
# The binary PATH, not `npx tsc`: npx answers a missing local compiler by
# fetching one, which is an unpinned package installed mid-push (see the vitest
# stage's tests/node_modules guard). The path is resolved BEFORE the scrub, so
# the scrub cannot remove anything the path depends on.
ts_typecheck(){
  ts_scrubbed "${1:-.}/tests/node_modules/.bin/tsc" --noEmit -p "${1:-.}/tests"
}

# ts_typecheck_stage [ROOT] — the gate's typecheck stage. It runs BEFORE the
# vitest batch: it takes seconds, not minutes, and a type error is a reason to
# stop before paying for the suites.
ts_typecheck_stage(){
  _tc_root="${1:-$(pwd)}"

  # SKIP, with a reason, where there is no harness to check. The CI step's
  # hashFiles guard keys on the same file, so the two modes skip together.
  if [ ! -f "$_tc_root/tests/package.json" ]; then
    pipe_skip "typecheck · TASK-031" "no tests/package.json — no TypeScript harness in this project"
    return 0
  fi

  # BLOCK, do not skip, when the harness is there and its compiler is not: the
  # same argument, and the same remedy, as the vitest stage's guard below.
  if [ ! -x "$_tc_root/tests/node_modules/.bin/tsc" ]; then
    echo "❌ The TypeScript typecheck cannot run: tests/node_modules/.bin/tsc is absent."
    echo "   Install the pinned tree once, then push again:"
    echo ""
    echo "       (cd tests && npm ci)"
    echo ""
    pipe_stage "typecheck · TASK-031" false
    return 1
  fi

  pipe_stage "typecheck · TASK-031" ts_typecheck "$_tc_root"
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

  # TASK-018 PHASE 2 — THE SPECS SHIP NOW, so this stage is reached in projects
  # that have never run `npm ci`, and `npx` treats a missing local vitest as an
  # invitation to FETCH ONE.
  #
  # Measured, not assumed (.scratch/probe-npx.sh): in a tree holding
  # package.json, package-lock.json and a spec but no node_modules,
  # `npx vitest run` requests https://registry.npmjs.org/vitest. Offline that is
  # `ENOTCACHED`; ONLINE it silently downloads an unpinned resolution of the very
  # package the lockfile exists to pin, and runs the push gate against something
  # nobody reviewed and osv-scanner never scanned. A gate that installs its own
  # tooling mid-push is worse than one that stops.
  #
  # BLOCK, do not skip — the same argument as the npx check above. Skipping is
  # how a project gets a green gate over suites it never ran (TASK-017, BUG-066),
  # and here it would be green over EVERY TypeScript suite at once.
  if [ ! -d "$_ts_root/tests/node_modules" ]; then
    echo "❌ The TypeScript suites cannot run: tests/node_modules is absent."
    echo "   Install the pinned tree once, then push again:"
    echo ""
    echo "       (cd tests && npm ci)"
    echo ""
    echo "   'npm ci' and not 'npm install': the lockfile is the tree osv-scanner"
    echo "   scans and CI resolves, so anything else runs the gate against a"
    echo "   different set of packages than the one that was reviewed."
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
  # By PREFIX rather than by list: the harness scrubs every declared hazard and
  # every undeclared GIT_*/AGENT_* name (isForbiddenAmbient, tests/harness/env.ts),
  # and restating that here would be a second copy that drifts. This file already
  # made that mistake once — `ts_declared_suites` carried a duplicate of the
  # manifest parse under a comment claiming it could not drift. The one declared
  # hazard OUTSIDE the prefixes, BLUEPRINT_ROOT (TASK-025), is unset by name after
  # the loop; tests/ts-bridge #1c imports UNPREFIXED_FORBIDDEN to pin that the two
  # agree.
  # `cd` into tests/, not into the repo root: that is where the harness manifest
  # and node_modules live (TASK-020), so it is vitest's root and npx's lookup
  # start. The include glob in tests/vitest.config.ts is root-relative to match.
  if (
    cd "$_ts_root/tests" || exit 1
    # BP_ joined the prefix list with BUG-066: .githooks/pre-push exports
    # BP_CODE_ROOT, so without it every spec's fixture children inherit the real
    # checkout's roots and a `${BP_CODE_ROOT:-.}` default silently reads the
    # real tree. Same argument the block above makes about GIT_ and AGENT_.
    # The scrub itself is ts_scrubbed, above — shared with CI (BUG-117).
    # TWO reporters, deliberately. `json` feeds pipe_stage_report below;
    # `default` is the only thing that tells a human WHICH assertion failed.
    # With json alone the captured output is a path to a file this function
    # deletes seconds later — BUG-055 fixed the silence and left the
    # uselessness, which cost three ~200s re-runs to notice.
    ts_scrubbed npx vitest run --reporter=default --reporter=json --outputFile="$_ts_json"
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
    # The FAILURE lines, not the last lines. A nested-gate failure prints its
    # FAIL lines and then dozens of passing cases, so `tail` shows the passing
    # tail and the operator reads "see the FAIL lines above" with none in view.
    # That was the third iteration of one mistake: BUG-055 fixed the silence,
    # the next fix printed a path to a deleted file, the next printed the wrong
    # forty lines. Verify what is printed is USABLE, not merely present.
    #
    # `|| true` is HARDENING, not a fix — there is no defect here today. Under
    # the caller's `set -e` alone, this pipeline reports `head`'s status (0), so
    # neither a zero-match `grep` (rc=1) nor a SIGPIPE'd one (141) can abort
    # anything. It matters because this file is a sourced LIBRARY and does not
    # own its caller's shell options: a future caller that adds `pipefail` — a
    # normal thing for a gate to do — would kill the hook here, taking the
    # remaining stages and the summary with it, and present as "the gate stopped
    # reporting" rather than as anything pointing at this line. This file has
    # twice been burned by reasoning about what its caller DOES instead of what
    # it COULD do (BUG-055, both halves). One token closes that class.
    echo "  ── vitest failed (rc=$_ts_rc) ──"
    grep -nE 'FAIL|AssertionError|✗|×|Error:|not ok' "$_ts_out" | head -40 || true
    echo "  ── last 15 lines ──"
    tail -15 "$_ts_out"
    echo "  ── end vitest output ──"
  fi

  # BUG-068 — SURFACE THE CANARY'S NOTES EVEN WHEN THE RUN PASSED.
  #
  # The real-state canary reports a baton change it judged legitimate (a
  # concurrent agent flipping the mic through signal-set.sh) rather than failing
  # on it. That verdict is a PASS, and on a passing run everything vitest
  # printed goes into $_ts_out and is deleted two lines down — so without this
  # the report would exist only inside the test, which is precisely the silent
  # pass the canary was changed to avoid. `CANARY-NOTE:` is the marker
  # tests/harness/canary.ts emits; the two must move together.
  #
  # TASK-044 — `SKIP-NOTE:` is the same contract for a SKIPPED case
  # (tests/helpers/project-config.ts). vitest's JSON records no skip reason, so
  # without this a case skipped because the project runs another CI would render
  # as a plain pass.
  #
  # TWO greps, and the SKIP notices are UNCAPPED. They shared one `head -20` with
  # the canary notes, so twenty canary notes spent the whole budget and every
  # later skip reason vanished with nothing saying so (Alex, TASK-044 finding 5) —
  # the silence this marker exists to prevent, reintroduced by the cap that was
  # meant to keep the gate readable. A skip is a COVERAGE statement and every one
  # of them prints; a canary note is a repetition of one fact about the baton and
  # keeps its cap.
  grep -F 'SKIP-NOTE:' "$_ts_out" | sed 's/^/  – /' || true
  grep -F 'CANARY-NOTE:' "$_ts_out" | sed 's/^/  ⚠ /' | head -20 || true

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
