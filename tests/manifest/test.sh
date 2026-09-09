#!/bin/bash
# tests/manifest/test.sh
#
# BUG-005 / Codex F1 — make the tier policy a CONTROL instead of a slogan.
#
# The 30 s pre-push ceiling was removed because it had become a coverage policy:
# a suite that outgrew the budget got demoted to CI-only, and the gate carried on
# printing "all checks passed" over less. I replaced it with the rule "coverage
# is decided on risk, never on the clock" and claimed `pipe_skip` enforced it,
# because a skip must carry a reason.
#
# **That was false.** A suite simply OMITTED from .githooks/pre-push-project
# never reaches `pipe_skip` at all — deleting a `pipe_stage` block is a one-line
# silent skip and the pipeline still renders PASSED. `signal-dispatch` was the
# live proof: the gate could not report an exclusion it did not know about.
#
# So the membership claim is asserted against the FILESYSTEM here, not against a
# reviewer's memory:
#
#   - every suite that exists is classified,
#   - every classified suite exists,
#   - every `pre-push` suite is actually invoked by the gate,
#   - every suite declares a PARALLELISM CLASS,
#   - every rationale is present, and none of them argues from the clock.
#
# That last one is the point. A slow suite that matters is a suite to make
# faster: signal-dispatch went 125.4 s → 75.0 s with every assertion intact once
# someone looked at WHY it was slow instead of where to put it.
#
# ---------------------------------------------------------------------------
# BUG-051 / TASK-018 — THE SAME DEFECT, THROUGH A DOOR THIS FILE COULD NOT SEE.
#
# Every assertion below used to be anchored on `*.sh`. #1 discovered suites with
# `find tests -name '*.sh'`, #2b counted runners the same way, #4 and #5 required
# a literal `bash tests/<suite>/<file>.sh`. So the whole control had one shape of
# blind spot, and it was exactly the shape of the migration about to happen:
#
#     migrate a suite to TypeScript, delete its .sh, delete its SUITES.md row,
#     and NOTHING FAILS.
#
# No unclassified-suite error, because no shell file remained to discover. No
# missing-invocation error, because no row remained to check. That is BUG-005
# itself — a silent coverage cut that leaves the gate printing PASSED — walking
# back in through the one entrance the guard was not watching (PLAN-TASK-018
# §7.1). A runner is now a `*.sh` OR a `*.spec.ts`, everywhere, including the
# two directions of the export boundary.
#
# A TS suite is not invoked the way a shell suite is. One `vitest run` covers the
# whole tree (PLAN-TASK-018 §7.3 — per-suite lines come back via
# `pipe_stage_report`, not via 42 node startups), so there is no per-suite
# command to grep for. Nor does the hook run vitest itself: it sources
# `scripts/run-ts-suites.sh` and calls into it, because that file also reads the
# expected suite list out of tests/SUITES.md and injects one stage per suite. So
# the invocation proof is a CHAIN, and every link is checked:
#
#     the spec exists   AND   the hook reaches the bridge it sources
#                       AND   the bridge runs vitest with no path filter
#                       AND   vitest.config.ts's include actually covers it
#
# Break any link and #4 fails: delete the spec (1), delete the stage from the
# hook or delete the bridge (2), give the bridge's run a positional path (3),
# narrow the include glob (4). What is deliberately NOT accepted is "a spec
# exists somewhere" — that would be the same nothing-assertion in a new costume.
#
# ---------------------------------------------------------------------------
# THIS FILE MUST NOT DEPEND ON NODE.
#
# tests/manifest is itself a shell suite, and it is the control that governs its
# own migration. A project part-way through TASK-018 — or on a host with no
# toolchain installed yet — must still get a truthful answer out of it. So every
# TS-shaped requirement below is reached only when a `*.spec.ts` actually exists,
# and #9 asserts BOTH halves of that by execution: it re-runs this whole file
# with `node`, `npm`, `npx`, `tsc` and `vitest` replaced by shims that record the
# call and exit 127. If any of them is touched, or the poisoned run does not
# agree with this one, #9 fails.
#
# Run from the blueprint repo root:  bash tests/manifest/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$ROOT/tests/SUITES.md"
GATE="$ROOT/.githooks/pre-push-project"
HOOK="$ROOT/.githooks/pre-push"
CI="$ROOT/.github/workflows/security.yml"
VITEST_CFG="$ROOT/vitest.config.ts"
PKG="$ROOT/package.json"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

# BUG-014 — the gate runs this suite with GIT_DIR exported, and every git call
# below (#2b's archive, #4b's history query) would then read whatever that names
# rather than this repo. Hoisted to the top because it used to sit inside #2b's
# `if IN_BLUEPRINT` block, which left it unset for a derived project — where #4b
# now runs git too.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

[ -f "$MANIFEST" ] || { echo "FAIL: tests/SUITES.md is missing — the tier policy has no control"; exit 1; }

# THE TABLE PARSE LIVES IN scripts/lib/suites.sh, AND THIS FILE DOES NOT KEEP
# A COPY OF IT.
#
# It used to. `scripts/run-ts-suites.sh` then grew a verbatim copy of the same
# awk, under a comment claiming to be the thing that could not drift — and it
# had already drifted, taking field 2 only while this file gated the parallelism
# class on fields 6 and 7. Two parsers of one table is the shape
# `scripts/lib/commit-subject.sh` and `scripts/lib/roster.sh` exist to refuse,
# and a control asserting a rule from its own private copy of that rule is
# asserting less than it appears to.
#
# Sourced by absolute path and REQUIRED. A missing parser must not degrade to an
# empty parse: every assertion below passes trivially against no rows, which is
# precisely the vacuity #7 exists to catch — but it would catch it one step too
# late and blame the manifest rather than the missing file.
. "$ROOT/scripts/lib/suites.sh" 2>/dev/null || true
if ! command -v bp_suite_rows >/dev/null 2>&1 || ! command -v bp_retired_rows >/dev/null 2>&1; then
  echo "FAIL: scripts/lib/suites.sh did not load — tests/SUITES.md has no parser, so every"
  echo "      assertion here would pass over zero rows. Run: blueprint pull scripts/lib/suites.sh"
  exit 1
fi

# ROOT-bound aliases, not second definitions: one function, curried. They cannot
# drift from the shared parse because they contain none of it.
rows(){ bp_suite_rows "$ROOT"; }
retired_rows(){ bp_retired_rows "$ROOT"; }

RETIRED=" $(retired_rows | cut -f1 | tr '\n' ' ')"
is_retired(){ case "$RETIRED" in *" $1 "*) return 0 ;; esac; return 1; }

# live_cmds FILE... — the files with COMMENT LINES REMOVED.
#
# Codex R2-F1b: membership was checked with an unanchored `grep` for the path,
# so commenting out an invocation kept the control green while the suite stopped
# running. Reproduced: `sed -i '/tests\/pipeline/s/^/#/' .githooks/pre-push*`
# left the manifest passing "every pre-push/both suite is invoked by the gate".
# Strip comments first, then require an anchored `bash tests/<suite>/<file>.sh`
# command rather than arbitrary text containing the path.
live_cmds(){ sed 's/#.*//' "$@" 2>/dev/null; }

# clocky TEXT — true when a rationale argues from cost instead of from risk.
# Shared by #6 (tier rationale) and #8 (parallelism rationale), because the two
# fields fail the same way: "it is slow" is not a tier and it is not a
# parallelism class either.
clocky(){
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' \
    | grep -qE 'too slow|does not fit|doesn.t fit|ceiling|time budget|budget|fits in|no room|too expensive|costs? (only )?[0-9]|[0-9]+ ?s(ec|econds)? (to|for) run'
}

# --- runners ---------------------------------------------------------------
# A RUNNER is a shell file or a spec file. Everything that discovers, counts or
# ships a suite goes through these, so the two kinds cannot drift apart the way
# `#1` (any *.sh) and `#2` (literally `test.sh`) already had.
find_runners(){ find "$@" -type f \( -name '*.sh' -o -name '*.spec.ts' \) 2>/dev/null; }

# The runner inventory is taken ONCE and answered from memory. Six assertions
# ask "does this suite have a shell runner / a spec?" for every row, and a
# `find` per question turned a 5 s control into a 19 s one — the exact pressure
# that talked someone into demoting a suite last time (BUG-005). The lists are
# space-delimited with sentinel spaces so a `case` match cannot see `a2bp-e2e`
# inside `a2bp-e2e-extra`.
_dirs_with(){
  find "$ROOT/tests" -mindepth 2 -type f -name "$1" 2>/dev/null \
    | sed -e "s#^$ROOT/tests/##" -e 's#/.*##' | sort -u | tr '\n' ' '
}
SUITES_WITH_SH=" $(_dirs_with '*.sh')"
SUITES_WITH_TS=" $(_dirs_with '*.spec.ts')"
has_sh_runner(){ case "$SUITES_WITH_SH" in *" $1 "*) return 0 ;; esac; return 1; }
has_ts_runner(){ case "$SUITES_WITH_TS" in *" $1 "*) return 0 ;; esac; return 1; }

# Row suite names, likewise parsed once — #1 asked the parser per runner file.
ROW_SUITES=" $(rows | cut -f1 | tr '\n' ' ')"
row_exists(){ case "$ROW_SUITES" in *" $1 "*) return 0 ;; esac; return 1; }

TS_PRESENT=0
[ "$SUITES_WITH_TS" = " " ] || TS_PRESENT=1

# TS_REQUIRED — set the moment any TS-shaped requirement is consulted. #9
# asserts it stays 0 while no spec exists on disk, which is the "a project
# mid-migration is never blindsided" property stated as something checkable
# rather than something intended.
TS_REQUIRED=0

# _classify_cmds — reads command text on stdin, prints one line per invocation
# of the vitest runner:
#
#   BLANKET vitest   a run over the whole tree: no positional path argument
#   BLANKET npm      ditto, reached through `npm test` / `npm run test`
#   ARGS <words>     a run NARROWED to those paths — proves nothing about a
#                    suite it does not name
#
# The distinction is the whole assertion. `vitest run tests/pipeline` in the gate
# must not be readable as "every suite is invoked".
_classify_cmds(){
  awk '
    {
      verb = 0; kind = ""
      for (i = 1; i <= NF; i++) {
        if (verb) break
        if ($i == "vitest" && $(i+1) == "run")                       { verb = i + 1; kind = "vitest" }
        else if ($i == "npm" && $(i+1) == "test")                    { verb = i + 1; kind = "npm" }
        else if ($i == "npm" && $(i+1) == "run" && $(i+2) == "test") { verb = i + 2; kind = "npm" }
      }
      if (!verb) next
      args = ""
      for (i = verb + 1; i <= NF; i++) {
        if ($i == "--") continue
        if (substr($i, 1, 1) == "-") continue
        args = args " " $i
      }
      if (args == "") print "BLANKET " kind
      else print "ARGS" args
    }'
}

# --- FOLLOWING A SOURCED BRIDGE -------------------------------------------
#
# The gate does not run vitest itself. `.githooks/pre-push-project` sources
# `scripts/run-ts-suites.sh` and calls `ts_suites_stage`, and the actual
# `npx vitest run` lives in there — because that file also reads the expected
# suite list out of tests/SUITES.md and injects one `pipe_stage_report` per
# suite, so `bootstrap-gate` #3's >=25-stage guard and the slowest-stage SLO
# keep meaning something (PLAN-TASK-018 §7.3). Inlining it would put a jq
# pipeline in the hook and a second parser of this table.
#
# So "the gate's live commands" now means the hook PLUS the files it sources —
# but only the ones it genuinely reaches. A sourced file that merely DEFINES a
# function is not running anything, and that is precisely the case where text
# appears without executing. A bridge therefore counts only when all three hold:
#
#   1. the hook sources it by a literal relative path,
#   2. the file EXISTS (an absent bridge is `pipe_skip`ped at runtime, and a
#      skip carries a reason but is still not running — it must FAIL a blocking
#      suite, not pass it),
#   3. the hook CALLS a function the file defines.
#
# Nothing here is specific to `run-ts-suites.sh`: the bridge is discovered, not
# named, so the pipeline agent can rename or split it and this keeps working.
# Only ONE hop is followed. A bridge that sources a second bridge fails closed —
# no blanket run is found and #4 says so — which is the right direction to be
# wrong in, and the fix is to extend this walk.
#
# Pulling `pipeline.sh` and `dod-gate.sh` into the scan set is harmless because
# `live_cmds` deletes comments first: every `vitest` and `bash tests/…` string
# in those files is prose, and prose is gone before any of this runs.
_defined_funcs(){
  sed 's/#.*//' "$1" 2>/dev/null \
    | sed -n 's/^[[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]*()[[:space:]]*{.*/\1/p'
}

# _live_bridges FILE... — absolute paths of the bridges those files reach.
_live_bridges(){
  _lb_text="$(live_cmds "$@")"
  printf '%s\n' "$_lb_text" \
    | grep -oE '(^|[[:space:]])(\.|source)[[:space:]]+"?(\$ROOT/)?\.?/?[A-Za-z0-9_][A-Za-z0-9_./-]*' \
    | sed -E -e 's/.*[[:space:]](\.|source)[[:space:]]+//' -e 's/^"//' -e 's#^\$ROOT/##' -e 's#^\./##' \
    | sort -u \
    | while IFS= read -r _p; do
        [ -n "$_p" ] || continue
        [ -f "$ROOT/$_p" ] || continue
        for _fn in $(_defined_funcs "$ROOT/$_p"); do
          if printf '%s\n' "$_lb_text" | grep -qE "(^|[^A-Za-z0-9_./-])${_fn}([[:space:]]|\$)"; then
            printf '%s\n' "$ROOT/$_p"
            break
          fi
        done
      done
}

# _deep_cmds FILE... — those files' live commands, plus every bridge they reach.
_deep_cmds(){
  live_cmds "$@"
  while IFS= read -r _b; do
    [ -n "$_b" ] || continue
    live_cmds "$_b"
  done <<EOF
$(_live_bridges "$@")
EOF
}

# _blanket_of TEXT — is there a whole-tree vitest run anywhere in this text?
#
# Takes assembled text rather than filenames, so a bridge's contents are judged
# by exactly the rule the hook's are, and a path-filtered run ANYWHERE in the
# chain is still refused. Shell metacharacters become line breaks first, so
# `pipe_stage "x" npm test || { … }` is classified as the `npm test` it is, and
# a stray `}` is not read as a path filter.
_blanket_of(){
  _bo="$(printf '%s\n' "$1" | tr '|&;(){}' '\n\n\n\n\n\n\n' | _classify_cmds)"
  printf '%s\n' "$_bo" | grep -q '^BLANKET vitest' && return 0
  if printf '%s\n' "$_bo" | grep -q '^BLANKET npm'; then
    _npm_test_script | _classify_cmds | grep -q '^BLANKET vitest' && return 0
  fi
  return 1
}

# The `test` script out of package.json, without Node. If this cannot be parsed
# the result is empty, which classifies as "not a blanket run" — fail closed.
_npm_test_script(){
  [ -f "$PKG" ] || return 0
  tr -d '\n' < "$PKG" \
    | sed -e 's/.*"scripts"[^{]*{//' -e 's/}.*//' \
    | tr ',' '\n' \
    | sed -n -e 's/.*"test"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

# Link 4 of the chain: the configured include must actually reach
# tests/<suite>/<file>.spec.ts. Narrowing this glob is a coverage cut that would
# otherwise leave every other link intact and every assertion green.
_include_ok(){
  [ -f "$VITEST_CFG" ] || return 1
  tr -d ' \n' < "$VITEST_CFG" \
    | grep -qE "include:\[[^]]*[\"']tests/\*\*/\*\.spec\.ts[\"']"
}

# ===========================================================================
# 1. EVERY SUITE ON DISK IS CLASSIFIED.
#    This is the assertion that closes F1: an omission is now a failure rather
#    than an absence nobody can see.
# ===========================================================================
# Codex R2-F1a: discovery used to recognise only `tests/*/test.sh`, so renaming
# a runner — or adding `tests/unclassified/check.sh` — made a suite INVISIBLE to
# the control while it still passed. Ordinary refactoring was enough; no lying
# in the manifest required. Classify by DIRECTORY and consider every runner
# under tests/, so the convention itself is enforced rather than assumed.
#
# TASK-018 widened "runner" from *.sh to *.sh OR *.spec.ts. Without that, the
# migration's own first step — add the spec, delete the shell file — deleted the
# suite from this control's field of view (§7.1). The spec is discovered by
# EXTENSION, not by the `<suite>.spec.ts` naming convention, so a misnamed spec
# is still classified rather than silently exempt.
missing=""
for f in $(find_runners "$ROOT/tests" | sort); do
  rel="${f#"$ROOT"/tests/}"
  dir="${rel%%/*}"
  if [ "$dir" = "$rel" ]; then
    # A runner sitting directly in tests/ belongs to no suite at all.
    missing="$missing $rel(top-level)"
    continue
  fi
  # SHARED HELPERS ARE NOT SUITES. CLAUDE.md §"Test directory layout" puts
  # shared helpers/mocks/fixtures in tests/helpers/ (or tests/__helpers__/)
  # precisely because they serve several suites and belong to none. They carry
  # no assertions and the gate never invokes them, so a manifest row would be a
  # row about nothing — and #4/#5 would then demand the gate and CI "invoke" a
  # file that is only ever sourced.
  #
  # This is a narrowing of the control, so it is deliberately literal — only
  # these two names, never a prefix match — and #1b below stops the directory
  # becoming a place where dead code accumulates unnoticed.
  #
  # tests/harness/ is NOT on this list on purpose. It holds the TypeScript
  # fixture API, which is `.ts` and not `.spec.ts`, so nothing there is
  # discovered as a runner today. If a `harness.spec.ts` ever appears it is a
  # suite of real assertions and gets a row like any other — widening the
  # exemption instead would put the isolation contract's own tests in the one
  # place this file does not look.
  case "$dir" in helpers|__helpers__) continue ;; esac
  row_exists "$dir" || \
    case " $missing " in *" $dir "*) ;; *) missing="$missing $dir" ;; esac
done
if [ -n "$missing" ]; then
  fail "#1 runners (*.sh or *.spec.ts) exist under tests/ whose suite is not classified:$missing"
else
  pass "#1 every suite directory containing a runner (*.sh or *.spec.ts) is classified"
fi

# #1b — the compensating control for the helpers exemption above. A helper is
# exempt from classification because it is sourced rather than run, so the thing
# to assert is that it IS sourced: an unreferenced file there is dead code that
# no tier, no gate stage and no CI job would ever have complained about.
orphans=""
for f in $(find "$ROOT/tests/helpers" "$ROOT/tests/__helpers__" -type f -name '*.sh' 2>/dev/null | sort); do
  base="$(basename "$f")"
  grep -rqF "helpers/$base" "$ROOT/tests" --include='*.sh' --exclude-dir=helpers --exclude-dir=__helpers__ 2>/dev/null \
    || orphans="$orphans $base"
done
if [ -n "$orphans" ]; then
  fail "#1b shared helpers that no suite sources:$orphans — exempt from classification, so nothing else would catch them"
else
  pass "#1b every shared helper is sourced by at least one suite"
fi

# ===========================================================================
# 2. EVERY CLASSIFIED SUITE EXISTS — a manifest that names ghosts would let a
#    deleted suite look covered.
# ===========================================================================
# A `blueprint`-tier suite drives machinery that exists ONLY here —
# new-project.sh, templates/, .blueprint-root. It is export-ignore'd, so in a
# DERIVED project it is legitimately absent and this manifest still ships and
# still runs. `.blueprint-root` is the same positive marker `drift` uses.
IN_BLUEPRINT=0
[ -f "$ROOT/.blueprint-root" ] && IN_BLUEPRINT=1

# BUG-051, second half. This check used to be `[ -f "$ROOT/tests/$s/test.sh" ]`
# — the literal filename
# #1 had already stopped trusting, one assertion further down the same file. A
# suite whose only runner is `drift-integration.sh` (staleness ships one) or a
# `.spec.ts` was a GHOST by this test while being perfectly real. It passed only
# because staleness happens to keep a test.sh as well.
ghosts=""
while IFS="$(printf '\t')" read -r s t risk rat pcls prat; do
  [ -n "$s" ] || continue
  if has_sh_runner "$s" || has_ts_runner "$s"; then continue; fi
  if [ "$t" = "blueprint" ] && [ "$IN_BLUEPRINT" -eq 0 ]; then continue; fi
  ghosts="$ghosts $s"
done <<EOF
$(rows)
EOF
if [ -n "$ghosts" ]; then
  fail "#2 tests/SUITES.md classifies suites with no runner on disk:$ghosts"
else
  pass "#2 every classified suite has a runner on disk"
fi

# ===========================================================================
# 2b. THE EXPORT BOUNDARY, BOTH DIRECTIONS (BUG-028).
#
#     A tier is a claim about WHERE a suite runs, and "blueprint only" is such
#     a claim — but it was enforced by nothing at all. `tests/bootstrap-*`,
#     `tests/template-source`, `tests/drift-in-blueprint` and
#     `tests/pull-exec-bit` all shipped to every derived project, wired into its
#     gate by `.githooks/pre-push-project`, testing machinery that cannot exist
#     there. Five of the six day-one failures. Nobody saw it because the
#     failure happens on someone else's machine, after the blueprint's own gate
#     has gone green over the same suites passing at home.
#
#     Asserted against a REAL `git archive`, the way template-source is: the
#     export BEHAVIOUR is what matters, and a rule that is present but not
#     taking effect is exactly the failure mode being guarded. `git check-attr`
#     was tried first and is unusable here — it reports `unspecified` for a
#     directory pattern like `templates/` even though `git archive` genuinely
#     drops it, so it would have called a correct boundary broken.
#
#     The archive is taken of HEAD — the tree that is about to be pushed.
#     It used to be taken of the WORKING TREE, on the argument that HEAD cannot
#     answer for a boundary the author has written and not yet committed. That
#     is true and it is the wrong trade: at pre-push time the change IS already
#     committed, so the working-tree view guarded a case the gate cannot see and
#     opened one it can — an uncommitted fix turns the gate green, the author
#     pushes the commit without it, and the boundary ships broken with a green
#     gate behind it. HEAD fails CLOSED in that case: it reports the boundary as
#     it will actually ship, and the fix is to commit.
#
#     A suite SHIPS when its RUNNERS ship, not when its directory does. `grep
#     "^tests/<suite>/"` matched any file at all, so export-ignoring
#     `tests/foo/test.sh` while leaving a sibling README reported the boundary
#     healthy — while the derived project received a suite directory with no
#     runner and `.githooks/pre-push-project`'s own `if [ -f tests/foo/test.sh ]`
#     guard skipped it in silence. That is this repo's recurring defect class,
#     inside the control written to prevent it. Runners are discovered by
#     extension rather than by name, the same way #1 discovers suites, because
#     `tests/staleness/` already ships two of them — and, since TASK-018,
#     because a `.spec.ts` that fails to ship is the identical hollow suite with
#     a different file extension.
#
#     The reverse direction matters as much: a suite that is NOT blueprint-tier
#     must actually reach derived projects. Export-ignoring one is a silent
#     coverage cut for every project but this one — the BUG-005 defect, hidden
#     one level further down.
#
#     `tests/bootstrap-gate` asserts the consequence end-to-end (the archive
#     really does produce a project whose gate passes). This one names the file.
#
#     ---------------------------------------------------------------------
#     TASK-018 PHASE 1 — "SHIPPED" AND "RUNNABLE" ARE NO LONGER THE SAME WORD.
#
#     "every runner must ship" was exactly right while a runner was always a
#     `*.sh`, because a shell file is executable by any recipient. It stops
#     being right the moment a suite has two runner kinds and only one of them
#     is executable downstream. Phase 1 migrates the six `blueprint`-tier
#     suites, and `.gitattributes` holds the whole TS toolchain back — so
#     `tests/proc-cwd` legitimately ships its `test.sh`, which a derived project
#     CAN run, while withholding its `.spec.ts`, which it cannot: no harness, no
#     `vitest.config.ts`, no `package.json` to install a runner from.
#
#     Under the old rule that reads as `proc-cwd(1/2 runners)` — a correct
#     boundary reported as broken, which is the failure mode that gets a control
#     switched off. The invariant that actually holds in both phases is:
#
#         a shipping suite ships AT LEAST ONE runner the recipient can execute,
#         AND ships NO runner the recipient cannot.
#
#     Both halves are load-bearing and the second is the one that keeps the old
#     strength: a suite shipping ONLY a `.spec.ts` in phase 1 is the hollow case
#     exactly as before — the derived gate's `if [ -f … ]` guard skips it in
#     silence and the push stays green over a suite that is not there. And "every
#     runner must ship" survives intact WITHIN each kind: a suite withholding one
#     of two shell runners is still hollow, and once the toolchain ships, a
#     withheld spec is hollow too. What changed is that the toolchain's own
#     export state, not the file extension, decides which kind counts.
#
#     `TS_SHIPS` is therefore derived from the archive rather than declared, so
#     the rule re-reads itself at phase 2 with nothing to remember. #2c below is
#     what makes that transition all-or-nothing.
# ===========================================================================
if [ "$IN_BLUEPRINT" -eq 1 ]; then
  # (GIT_DIR and friends are scrubbed at the top of this file — BUG-014.)
  _listing="$(mktemp)"
  _runners="$(mktemp)"
  ( cd "$ROOT" && git archive --format=tar HEAD 2>/dev/null | tar -t 2>/dev/null ) >"$_listing"
  ( cd "$ROOT" && find_runners tests | sort ) >"$_runners"

  if [ ! -s "$_listing" ]; then
    fail "#2b could not archive HEAD — the export boundary is unverified, not verified"
  else
    _ships(){ grep -qxF "$1" "$_listing"; }

    # CAN A DERIVED PROJECT EXECUTE A `.spec.ts`? Derived from the archive, not
    # declared, so phase 2 flips it by deleting export-ignore lines and this
    # file needs no edit. All four parts are required: the three root files AND
    # the harness, because a spec whose fixture API is absent is as unrunnable
    # as one with no vitest at all.
    TS_SHIPS=1
    for _f in package.json tsconfig.json vitest.config.ts; do
      _ships "$_f" || TS_SHIPS=0
    done
    grep -q '^tests/harness/' "$_listing" || TS_SHIPS=0

    SPECS_SHIP=0
    grep -q '^tests/.*\.spec\.ts$' "$_listing" && SPECS_SHIP=1

    shipped_bp=""
    withheld=""
    hollow=""
    unrunnable=""
    tsonly=""
    while IFS="$(printf '\t')" read -r s t risk rat pcls prat; do
      [ -n "$s" ] || continue
      [ -d "$ROOT/tests/$s" ] || continue
      # Runners counted BY KIND, because only one kind's executability depends
      # on the phase. A directory that arrives without a runner the recipient
      # can execute is worse than an absent one: the derived gate skips it
      # silently and the push stays green over a suite that no longer exists.
      _sh_tot=0
      _sh_got=0
      _ts_tot=0
      _ts_got=0
      for _r in $(grep "^tests/$s/" "$_runners"); do
        case "$_r" in
          *.spec.ts)
            _ts_tot=$((_ts_tot + 1))
            grep -qxF "$_r" "$_listing" && _ts_got=$((_ts_got + 1)) ;;
          *)
            _sh_tot=$((_sh_tot + 1))
            grep -qxF "$_r" "$_listing" && _sh_got=$((_sh_got + 1)) ;;
        esac
      done
      _tot=$((_sh_tot + _ts_tot))
      if grep -q "^tests/$s/" "$_listing"; then _any=1; else _any=0; fi

      if [ "$t" = "blueprint" ]; then
        # Nothing at all may ship — not the runners, not a stray fixture.
        [ "$_any" -eq 1 ] && shipped_bp="$shipped_bp $s"
        continue
      fi

      # (i) NEVER ship a runner the recipient cannot execute. In phase 1 that is
      #     every spec: it would arrive with no vitest, no config and no harness.
      if [ "$TS_SHIPS" -eq 0 ] && [ "$_ts_got" -gt 0 ]; then
        unrunnable="$unrunnable $s($_ts_got spec)"
        continue
      fi
      # (ii) Within each EXECUTABLE kind, every runner still has to arrive —
      #      this is the original hollow-suite detection, unweakened.
      if [ "$_sh_got" -lt "$_sh_tot" ]; then
        hollow="$hollow $s($_sh_got/$_sh_tot shell)"
        continue
      fi
      if [ "$TS_SHIPS" -eq 1 ] && [ "$_ts_got" -lt "$_ts_tot" ]; then
        hollow="$hollow $s($_ts_got/$_ts_tot spec)"
        continue
      fi
      # (iii) AT LEAST ONE executable runner must arrive.
      _runnable="$_sh_got"
      [ "$TS_SHIPS" -eq 1 ] && _runnable=$((_sh_got + _ts_got))
      [ "$_runnable" -gt 0 ] && continue

      if [ "$_ts_tot" -gt 0 ] && [ "$_sh_tot" -eq 0 ]; then
        # TypeScript-only, in a phase where TypeScript does not ship. Named
        # separately because "export-ignore'd" would send the reader to
        # .gitattributes when the answer is the tier, or a retained shell runner.
        tsonly="$tsonly $s"
      elif [ "$_any" -eq 0 ]; then
        withheld="$withheld $s"
      else
        hollow="$hollow $s(0/$_tot runners)"
      fi
    done <<EOF
$(rows)
EOF
    if [ -n "$shipped_bp" ]; then
      fail "#2b blueprint-only suites DO ship, so they run in every derived project's gate against machinery that cannot be there:$shipped_bp"
    elif [ -n "$unrunnable" ]; then
      fail "#2b suites ship a *.spec.ts while the TS toolchain does NOT ship, so a derived project receives a runner it cannot execute:$unrunnable"
      echo "        Either export-ignore the spec, or make the phase-2 move whole (see #2c)."
    elif [ -n "$hollow" ]; then
      fail "#2b suites ship WITHOUT their runners, so the derived gate's 'if [ -f tests/<suite>/<runner> ]' guard skips them in silence:$hollow"
    elif [ -n "$tsonly" ]; then
      fail "#2b suites are TypeScript-ONLY while the TS toolchain does not ship, so they reach a derived project with no runner it can execute:$tsonly"
      echo "        Keep a shell runner until phase 2, or re-tier the suite to 'blueprint'."
    elif [ -n "$withheld" ]; then
      fail "#2b suites classified as shipping are export-ignore'd, so every derived project silently loses them:$withheld"
    elif [ "$TS_SHIPS" -eq 1 ]; then
      pass "#2b the export boundary matches the manifest in both directions, runner by runner (HEAD; phase 2 — the TS toolchain ships, so specs count as runners)"
    else
      pass "#2b the export boundary matches the manifest in both directions, runner by runner (HEAD; phase 1 — the TS toolchain does not ship, so every shipping suite keeps an executable shell runner)"
    fi
    if [ -n "$shipped_bp$hollow$withheld$unrunnable$tsonly" ] && \
       ! git -C "$ROOT" diff --quiet HEAD -- .gitattributes 2>/dev/null; then
      echo "        .gitattributes is modified but NOT COMMITTED. This reads HEAD, which"
      echo "        is the tree about to be pushed — commit the boundary and re-run."
    fi

    # =====================================================================
    # 2c. THE PHASE TRANSITION IS ALL-OR-NOTHING.
    #
    #     #2b answers "is each suite coherent?". This answers "do the two
    #     propagation paths agree?", and nothing else in the repo does.
    #
    #     They disagree by construction, and silently:
    #
    #       bootstrap  ships the WHOLE archive (new-project.sh: `git archive
    #                  HEAD`), so package.json and vitest.config.ts reach a NEW
    #                  project the moment they stop being export-ignore'd.
    #       pull       ships MANAGED_FILES only. `tests/` is a managed DIRECTORY
    #                  and expands through `git archive HEAD tests`, so specs and
    #                  tests/harness/ travel with it automatically — but the three
    #                  ROOT files are under no managed directory and travel only
    #                  if someone lists them.
    #
    #     So the half-done move has a precise and invisible victim: an EXISTING
    #     project that pulls receives `*.spec.ts` and `tests/harness/` with no
    #     vitest, no config and no package.json to install one, while a project
    #     bootstrapped the same day is fine. Its gate then carries specs nothing
    #     can execute, and — because `.githooks/pre-push-project` guards each
    #     stage with `if [ -f … ]` — reports PASSED over them. BUG-028's shape
    #     exactly: machinery shipped downstream that the recipient cannot run,
    #     discovered on someone else's machine.
    #
    #     The mirror direction is checked too. Managed-but-not-shipping means
    #     `pull` delivers a toolchain into projects whose specs are export-
    #     ignore'd — dead files, and the same two paths disagreeing the other
    #     way round. Both-or-neither is the only state that is coherent.
    #
    #     NOT checked, deliberately: a toolchain that ships while no spec ships
    #     yet. That is the sane ordering of the phase-2 move — land the runner,
    #     then migrate a suite onto it — and forbidding it would force the
    #     riskier order.
    #
    #     THE SAME CLAIM COVERS THE GATE'S OWN DEPENDENCIES. `.githooks/pre-push`
    #     and `.githooks/pre-push-project` are BOTH managed, so every file they
    #     source has to travel by both paths too, or the hook arrives downstream
    #     with half of itself. THIS FILE IS SCANNED TOO, for the same reason and
    #     because it just acquired one: sourcing `scripts/lib/suites.sh` means a
    #     derived project whose copy of that library never arrives gets a
    #     manifest that refuses to run at all. The failure is quiet and permanent: a hook whose
    #     bridge never arrives takes its `else` branch on every push — a
    #     `pipe_skip` with a reason, which reads as deliberate, forever. This is
    #     checked generically off the same bridge discovery #4 uses, so a new
    #     `. ./scripts/<something>.sh` in the hook is covered the day it lands
    #     rather than the day someone remembers.
    #
    #     Read TEXTUALLY, not by running `blueprint files`: this must stay a
    #     pure text/git-attr inspection (#9), and the CLI touches the real repo.
    #     A textual parse can go stale in silence, and stale here would pass
    #     vacuously in phase 1 — so the parse asserts its own non-vacuity first.
    # =====================================================================
    _mf="$(awk '/^MANAGED_FILES=\(/{f=1;next} f&&/^\)/{exit} f' "$ROOT/scripts/blueprint" 2>/dev/null \
             | sed -n 's/^[[:space:]]*"\([^"]*\)".*/\1/p')"
    _mf_n="$(printf '%s\n' "$_mf" | grep -c .)"
    _managed(){ printf '%s\n' "$_mf" | grep -qxF "$1"; }

    TS_MANAGED=1
    for _f in package.json tsconfig.json vitest.config.ts; do
      _managed "$_f" || TS_MANAGED=0
    done

    # Every file the managed hook sources must travel exactly as the hook does.
    _bridge_split=""
    while IFS= read -r _b; do
      [ -n "$_b" ] || continue
      _rel="${_b#"$ROOT"/}"
      _bs=0
      _bm=0
      grep -qxF "$_rel" "$_listing" && _bs=1
      _managed "$_rel" && _bm=1
      [ "$_bs" -eq "$_bm" ] || _bridge_split="$_bridge_split $_rel(ships=$_bs,managed=$_bm)"
    done <<EOF
$(_live_bridges "$GATE" "$HOOK" "$ROOT/tests/manifest/test.sh")
EOF

    if [ "${_mf_n:-0}" -lt 20 ] || ! _managed 'tests/'; then
      fail "#2c could not read MANAGED_FILES out of scripts/blueprint (parsed ${_mf_n:-0} entries, 'tests/' $(_managed 'tests/' && echo present || echo absent)) — the phase check would pass vacuously, which is the failure mode it exists to prevent"
    elif [ -n "$_bridge_split" ]; then
      fail "#2c the gate sources files whose two propagation paths disagree:$_bridge_split"
      echo "        .githooks/pre-push and .githooks/pre-push-project are managed, so a file"
      echo "        they source must be BOTH shipped and managed, or neither. ships=1,managed=0"
      echo "        means a NEW project gets it and then freezes it forever, while an EXISTING"
      echo "        project that pulls the hook never receives it at all — its gate takes the"
      echo "        'else' branch and pipe_skips that stage on every push, permanently, with a"
      echo "        reason that reads as deliberate. Add the file to MANAGED_FILES, or"
      echo "        export-ignore it so no project is told it should have been there."
    elif [ "$SPECS_SHIP" -eq 1 ] && [ "$TS_SHIPS" -eq 0 ]; then
      fail "#2c *.spec.ts files ship to derived projects while the TS toolchain does not — every recipient gets specs with no runner"
      echo "        Ship package.json, tsconfig.json, vitest.config.ts and tests/harness/,"
      echo "        or export-ignore the specs. Half of the phase-2 move is worse than none."
    elif [ "$TS_SHIPS" -eq 1 ] && [ "$TS_MANAGED" -eq 0 ]; then
      fail "#2c the TS toolchain SHIPS but is not in MANAGED_FILES — bootstrap delivers it, 'blueprint pull' never will"
      echo "        A project bootstrapped today gets package.json/tsconfig.json/vitest.config.ts"
      echo "        and then freezes them forever, while tests/ keeps being pulled forward. That"
      echo "        is BUG-029 with the two paths swapped. Add the three files to MANAGED_FILES."
    elif [ "$TS_SHIPS" -eq 0 ] && [ "$TS_MANAGED" -eq 1 ]; then
      fail "#2c the TS toolchain is in MANAGED_FILES but is export-ignore'd — 'blueprint pull' pushes a toolchain into projects that receive no specs to run with it"
      echo "        The two propagation paths must agree: both, or neither."
    elif [ "$TS_SHIPS" -eq 1 ]; then
      pass "#2c phase 2 is whole — the TS toolchain ships AND is managed, so bootstrap and pull deliver the same thing (checked $_mf_n MANAGED_FILES entries)"
    else
      pass "#2c phase 1 is whole — no spec ships, and the TS toolchain is neither shipped nor managed (checked $_mf_n MANAGED_FILES entries)"
    fi
  fi
  rm -f "$_listing" "$_runners"
fi

# ===========================================================================
# 3. TIER IS ONE OF THE THREE LEGAL VALUES.
# ===========================================================================
badtier=""
while IFS="$(printf '\t')" read -r s t risk rat pcls prat; do
  [ -n "$s" ] || continue
  case "$t" in pre-push|CI|both|blueprint) ;; *) badtier="$badtier $s($t)" ;; esac
done <<EOF
$(rows)
EOF
[ -n "$badtier" ] && fail "#3 illegal tier values:$badtier" \
                  || pass "#3 every tier is pre-push, CI, both or blueprint"

# ===========================================================================
# 4. EVERY BLOCKING SUITE IS ACTUALLY INVOKED BY THE GATE.
#    A manifest claiming "pre-push" while the gate never runs it would be a
#    more convincing version of the same silence.
# ===========================================================================
# Two runner kinds, two proofs, and a suite mid-migration owes BOTH — a spec
# that executes nowhere is dead code wearing the name of a suite, which is the
# state `drift-in-blueprint` was found in (running in neither the gate nor CI).
#
# Both proofs read the DEEP command text — the hook plus the bridges it reaches
# — so there is one definition of "what the gate runs" rather than two that
# drift. See §"FOLLOWING A SOURCED BRIDGE" for why a sourced file only counts
# when the hook calls into it.
GATE_CMDS="$(_deep_cmds "$GATE" "$HOOK")"
CI_CMDS=""
[ -f "$CI" ] && CI_CMDS="$(_deep_cmds "$CI")"

_gate_sh_invoked(){
  printf '%s\n' "$GATE_CMDS" | grep -qE "(^|[^#[:alnum:]_/])bash +tests/$1/[a-z0-9._-]+\\.sh"
}
_ci_sh_invoked(){
  printf '%s\n' "$CI_CMDS" | grep -qE "bash +tests/$1/[a-z0-9._-]+\\.sh"
}
# _ts_named_* SUITE — a vitest command that names this suite's spec explicitly.
# Accepted as a standalone proof, since it needs no glob.
_ts_named_gate(){
  printf '%s\n' "$GATE_CMDS" | grep -qE "vitest[^|]*tests/$1/[a-zA-Z0-9._-]+\\.spec\\.ts"
}
_ts_named_ci(){
  printf '%s\n' "$CI_CMDS" | grep -qE "vitest[^|]*tests/$1/[a-zA-Z0-9._-]+\\.spec\\.ts"
}

TS_WHY=""
_ts_covered_gate(){
  TS_REQUIRED=1
  _ts_named_gate "$1" && return 0
  if ! [ "$GATE_BLANKET" = 1 ]; then
    TS_WHY="no vitest stage in .githooks/pre-push*"
    return 1
  fi
  if ! _include_ok; then
    TS_WHY="vitest.config.ts include no longer covers tests/**/*.spec.ts"
    return 1
  fi
  return 0
}
_ts_covered_ci(){
  TS_REQUIRED=1
  _ts_named_ci "$1" && return 0
  if ! [ "$CI_BLANKET" = 1 ]; then
    TS_WHY="no vitest step in the workflow"
    return 1
  fi
  if ! _include_ok; then
    TS_WHY="vitest.config.ts include no longer covers tests/**/*.spec.ts"
    return 1
  fi
  return 0
}

GATE_BLANKET=0
CI_BLANKET=0
if [ "$TS_PRESENT" -eq 1 ]; then
  TS_REQUIRED=1
  _blanket_of "$GATE_CMDS" && GATE_BLANKET=1
  [ -f "$CI" ] && { _blanket_of "$CI_CMDS" && CI_BLANKET=1; }
fi

notrun=""
while IFS="$(printf '\t')" read -r s t risk rat pcls prat; do
  [ -n "$s" ] || continue
  # `blueprint` is `both` plus "does not ship" (see #2b) — it still blocks the
  # push HERE, so it is still required to be invoked by the gate.
  case "$t" in pre-push|both|blueprint) ;; *) continue ;; esac

  _sh=0; _ts=0
  has_sh_runner "$s" && _sh=1
  has_ts_runner "$s" && _ts=1

  if [ $((_sh + _ts)) -eq 0 ]; then
    # No runner here at all — a blueprint-tier suite in a derived project. We
    # cannot know which kind it is, so either proof suffices. #2 has already
    # decided whether that absence is legitimate.
    if _gate_sh_invoked "$s"; then continue; fi
    if [ "$TS_PRESENT" -eq 1 ] && _ts_covered_gate "$s"; then continue; fi
    notrun="$notrun $s"
    continue
  fi

  # A DECLARED retirement is the only reason a shell runner may sit uninvoked.
  # It buys nothing on its own: the suite still has to have a spec, and that
  # spec still has to survive the full chain below — so "lost the shell runner,
  # gained nothing" cannot be written down. #4b judges the declaration itself.
  if [ "$_sh" -eq 1 ] && ! _gate_sh_invoked "$s"; then
    if ! is_retired "$s"; then
      notrun="$notrun $s(shell runner never invoked, and no retirement declared)"
    elif [ "$_ts" -eq 0 ]; then
      notrun="$notrun $s(shell runner retired but the suite has no spec)"
    fi
  fi
  if [ "$_ts" -eq 1 ] && ! _ts_covered_gate "$s"; then
    notrun="$notrun $s($TS_WHY)"
  fi
done <<EOF
$(rows)
EOF
if [ -n "$notrun" ]; then
  fail "#4 declared blocking but the gate never invokes them:$notrun"
  echo "        A shell runner is proven by an anchored 'bash tests/<suite>/<file>.sh'."
  echo "        A spec is proven by a vitest run with NO path filter — in the hook, or in"
  echo "        a bridge the hook sources AND calls into — plus an include glob that"
  echo "        reaches it. A stage naming the spec outright also counts."
else
  pass "#4 every pre-push/both suite is invoked by the gate, runner kind by runner kind"
fi

# ===========================================================================
# 4b. A RETIREMENT IS A CLAIM, AND CLAIMS ARE CHECKED.
#
#     #4 accepts a declared retirement. This decides whether the declaration is
#     worth accepting, because a marker that only has to EXIST is a way to
#     switch #4 off one row at a time — and #4 is the assertion that stopped
#     BUG-005.
#
#     Four things are checked, and the third is the one with teeth:
#
#     1. The suite is real and has a spec. (#2 keeps a runner on disk, so this
#        cannot become a route to a suite with nothing at all.)
#     2. The recipe names a concrete change — a backticked token, and any
#        backticked path must actually exist — and names the case ID it turned
#        red. You cannot write "#4c went red" without having watched it.
#     3. THE RECIPE MAY NOT ARGUE FROM THE CLOCK. The founder's reason for
#        retiring these is that running both is slower, and that reason is
#        correct — but it is a consequence, not a justification. "It is slow" is
#        the exact sentence that produced BUG-005, and #6 and #8 already refuse
#        it in the other two rationale fields. A suite stops being run because
#        something else now proves what it proved; never because of what it
#        costs.
#     4. The claim has not gone stale. There is no deadline here — this repo
#        does not gate on calendars, and a date in a table is upkeep that rots.
#        But a retired runner that has been MODIFIED more recently than the spec
#        replacing it is a claim nobody re-proved: someone changed behaviour in
#        a file nothing executes. Answered with git history rather than a
#        recorded baseline, so there is nothing to maintain. The remedies are
#        all good outcomes — delete the dead runner (the intended end state),
#        revert the edit, or carry it into the spec and re-prove it.
# ===========================================================================
ret_n=0
ret_bad=""
ret_stale=""
while IFS="$(printf '\t')" read -r s mut cid; do
  [ -n "$s" ] || continue
  ret_n=$((ret_n + 1))
  row_exists "$s"   || { ret_bad="$ret_bad $s(not a declared suite)"; continue; }
  has_ts_runner "$s" || { ret_bad="$ret_bad $s(no *.spec.ts — retiring the shell runner would leave nothing running)"; continue; }
  has_sh_runner "$s" || { ret_bad="$ret_bad $s(no *.sh on disk — nothing to retire)"; continue; }

  if [ -z "$mut" ] || [ -z "$cid" ]; then
    ret_bad="$ret_bad $s(recipe or case ID empty)"
    continue
  fi
  if clocky "$mut" || clocky "$cid"; then
    ret_bad="$ret_bad $s(argues from cost)"
    continue
  fi
  printf '%s' "$cid" | grep -qE '#[0-9]+[a-z]?' \
    || { ret_bad="$ret_bad $s(names no case ID that went red)"; continue; }
  printf '%s' "$mut" | grep -q '`' \
    || { ret_bad="$ret_bad $s(recipe names no concrete symbol or path)"; continue; }
  # BUG-041's lesson: no GNU-only sed here (`2~2p` would have looked right and
  # matched nothing on macOS). grep -o extracts the backticked tokens directly.
  _badpath=""
  for _tok in $(printf '%s' "$mut" | grep -oE '`[^`]+`' | tr -d '`'); do
    case "$_tok" in
      */*) [ -e "$ROOT/$_tok" ] || _badpath="$_badpath $_tok" ;;
    esac
  done
  [ -n "$_badpath" ] && { ret_bad="$ret_bad $s(recipe names paths that do not exist:$_badpath)"; continue; }

  # 4 — is the equivalence claim still current? Newest commit touching a
  # retired shell runner vs newest touching the specs that replaced it.
  _sh_ts=0
  _spec_ts=0
  for _f in $(find "$ROOT/tests/$s" -maxdepth 1 -type f -name '*.sh' 2>/dev/null | sort); do
    _c="$(git -C "$ROOT" log -1 --format=%ct -- "$_f" 2>/dev/null)"
    case "$_c" in ''|*[!0-9]*) continue ;; esac
    [ "$_c" -gt "$_sh_ts" ] && _sh_ts="$_c"
  done
  for _f in $(find "$ROOT/tests/$s" -maxdepth 1 -type f -name '*.spec.ts' 2>/dev/null | sort); do
    _c="$(git -C "$ROOT" log -1 --format=%ct -- "$_f" 2>/dev/null)"
    case "$_c" in ''|*[!0-9]*) continue ;; esac
    [ "$_c" -gt "$_spec_ts" ] && _spec_ts="$_c"
  done
  # Either side uncommitted (or no git at all) → no history to compare. Silence
  # here is correct: #2b already fails an uncommitted runner at push time.
  if [ "$_sh_ts" -gt 0 ] && [ "$_spec_ts" -gt 0 ] && [ "$_sh_ts" -gt "$_spec_ts" ]; then
    ret_stale="$ret_stale $s"
  fi
done <<EOF
$(retired_rows)
EOF
if [ -n "$ret_bad" ]; then
  fail "#4b retirement declarations that do not hold up:$ret_bad"
  echo "        A retirement must name the mutant that proved the spec equivalent and the"
  echo "        case it turned red (PLAN-TASK-018 §5). A marker that only has to EXIST is a"
  echo "        way to switch #4 off one row at a time."
elif [ -n "$ret_stale" ]; then
  fail "#4b a retired shell runner has been modified more recently than the spec that replaced it, so the equivalence claim under it is stale:$ret_stale"
  echo "        Nobody runs that file. Delete it — that is the intended end state — or revert"
  echo "        the edit, or carry the change into the spec and re-run the mutant."
elif [ "$ret_n" -gt 0 ]; then
  pass "#4b $ret_n shell runner(s) retired, each with a mutation recipe and a live spec (still on disk; the number is meant to reach zero)"
else
  pass "#4b no shell runner is declared retired"
fi

# ===========================================================================
# 5. EVERY CI-TIER SUITE IS ACTUALLY IN THE WORKFLOW.
# ===========================================================================
if [ -f "$CI" ]; then
  ci_missing=""
  while IFS="$(printf '\t')" read -r s t risk rat pcls prat; do
    [ -n "$s" ] || continue
    case "$t" in CI|both|blueprint) ;; *) continue ;; esac

    _sh=0; _ts=0
    has_sh_runner "$s" && _sh=1
    has_ts_runner "$s" && _ts=1

    if [ $((_sh + _ts)) -eq 0 ]; then
      if _ci_sh_invoked "$s"; then continue; fi
      if [ "$TS_PRESENT" -eq 1 ] && _ts_covered_ci "$s"; then continue; fi
      ci_missing="$ci_missing $s"
      continue
    fi

    if [ "$_sh" -eq 1 ] && ! _ci_sh_invoked "$s"; then
      # Same declaration, same conditions (see #4). A retirement is one decision
      # about one suite; it would be incoherent for the gate to honour it and
      # the workflow not to.
      if ! is_retired "$s"; then
        ci_missing="$ci_missing $s(shell runner, and no retirement declared)"
      elif [ "$_ts" -eq 0 ]; then
        ci_missing="$ci_missing $s(shell runner retired but the suite has no spec)"
      fi
    fi
    if [ "$_ts" -eq 1 ] && ! _ts_covered_ci "$s"; then
      ci_missing="$ci_missing $s($TS_WHY)"
    fi
  done <<EOF
$(rows)
EOF
  [ -n "$ci_missing" ] && fail "#5 declared CI but absent from the workflow:$ci_missing" \
                       || pass "#5 every CI/both suite runs in the workflow, runner kind by runner kind"
fi

# ===========================================================================
# 6. NO RATIONALE ARGUES FROM THE CLOCK.
#
#    THE point of this file. Every exclusion that produced BUG-005 was phrased
#    exactly this way — "does not fit the 30s ceiling", "costs ~6s", "too slow
#    for pre-push". Each was written down honestly and none was ever challenged,
#    because nothing checked them.
# ===========================================================================
clocky_rows=""
while IFS="$(printf '\t')" read -r s t risk rat pcls prat; do
  [ -n "$s" ] || continue
  if [ -z "$rat" ]; then
    clocky_rows="$clocky_rows $s(empty)"
  elif clocky "$rat"; then
    clocky_rows="$clocky_rows $s"
  fi
done <<EOF
$(rows)
EOF
if [ -n "$clocky_rows" ]; then
  fail "#6 tier rationale argues from cost, not risk (or is empty):$clocky_rows"
  echo "        A slow suite that matters is a suite to make faster —"
  echo "        signal-dispatch went 125.4s -> 75.0s once someone asked why."
else
  pass "#6 no tier rationale argues from the clock"
fi

# ===========================================================================
# 7. NON-VACUITY — the parser must actually be finding rows. Every assertion
#    above passes trivially against an empty parse, which is precisely the
#    failure mode this file exists to prevent.
# ===========================================================================
n="$(rows | grep -c .)"
# A suite named twice is a parser that has started reading something that is not
# the suite table — the RETIRED-SHELL-RUNNERS rows are the live candidate, since
# they are kept out of `rows` only by having three columns. It is also a real
# hazard on its own: two rows for one suite means two tiers and two parallelism
# classes, and every loop above silently honours whichever it reads last.
dupes="$(rows | cut -f1 | sort | uniq -d | tr '\n' ' ')"
if [ "${n:-0}" -lt 10 ]; then
  fail "#7 parsed only ${n:-0} manifest rows — the parser is broken, so #1-#6 proved nothing"
elif [ -n "${dupes// /}" ]; then
  fail "#7 the same suite is declared more than once:$dupes — two rows means two tiers, and every check above honours whichever it read last"
else
  pass "#7 parsed $n manifest rows, each suite once (assertions above are non-vacuous)"
fi

# ===========================================================================
# 7b. BUG-052 — THE MARKERS THAT MAKE A MANAGED FILE MERGEABLE ARE BALANCED.
#
#     `marker_aware_merge` (scripts/blueprint) refuses to merge unless a file's
#     BEGIN and END counts are equal, and `pull_file` then falls back to a
#     WHOLE-FILE COPY — which is exactly the data loss the markers exist to
#     prevent. It warns and leaves a `.bp-bak`, and nobody reads either.
#
#     It counts SUBSTRINGS, so a sentence explaining "put your rows after
#     BLUEPRINT:END" counts as an END. Both managed marker files in this repo
#     were in that state and had been for their whole lives:
#
#       tests/SUITES.md            1 BEGIN, 4 END
#       .githooks/pre-push-project 1 BEGIN, 3 END
#
#     So neither file has ever been marker-merged. Every derived project's own
#     suite rows and its own gate guards — the two things CLAUDE.md promises are
#     "preserved byte-for-byte" — were being replaced on every pull. Found by
#     reading the merge's precondition while adding a marker of my own, which is
#     how I discovered I had just made it worse.
#
#     `tests/marker-merge` does not catch this: it drives the MECHANISM against
#     fixture files that satisfy the precondition, and never asks whether the
#     real managed files do. A control that tests the machine and not the
#     instance — the same gap as `git-isolation` choosing its population from
#     comments (BUG-047).
#
#     Checked for every marker vocabulary, because the prose trap applies to all
#     of them equally and the SUITES/RETIRED ones are new enough to have no
#     history of being right.
# ===========================================================================
marker_bad=""
for _mf_file in "$MANIFEST" "$GATE" "$HOOK"; do
  [ -f "$_mf_file" ] || continue
  for _voc in BLUEPRINT SUITES RETIRED-SHELL-RUNNERS; do
    set -- $(bp_marker_balance "$_mf_file" "$_voc")
    [ "$1" -eq 0 ] && [ "$2" -eq 0 ] && continue
    [ "$1" -eq "$2" ] && continue
    marker_bad="$marker_bad ${_mf_file#"$ROOT"/}:$_voc($1 BEGIN/$2 END)"
  done
done
if [ -n "$marker_bad" ]; then
  fail "#7b marker counts do not balance, so 'blueprint pull' will NOT merge these files — it falls back to a whole-file copy and destroys the project's own content outside the markers:$marker_bad"
  echo "        The counts are of SUBSTRINGS, so prose describing a marker counts as one."
  echo "        Say 'the managed region' in sentences and keep the literal token for markers."
else
  pass "#7b every marker vocabulary balances, so pull merges these files instead of clobbering them"
fi

# ===========================================================================
# 8. EVERY SUITE DECLARES A PARALLELISM CLASS, AND JUSTIFIES IT FROM THE
#    HAZARD RATHER THAN FROM THE CLOCK.
#
#    TASK-018's requirement is "isolated, independent, deterministic, so they
#    can be parallelized without side effects". Parallelism is therefore a
#    property each suite CLAIMS, exactly as a tier is, and it fails the same way
#    if nothing checks it: a suite that quietly reads the real feed, the real
#    baton, ${TMPDIR} or the process table looks identical to a clean one right
#    up to the moment two of them run at once, at which point the failure is a
#    flake nobody can reproduce and the suite gets deleted rather than fixed.
#
#    So an UNCLASSIFIED suite fails, and the safe default is serial: over-
#    declaring `serial-global` costs wall-clock, under-declaring costs a control.
#    Six rows currently say `unclassified-pending-verification` out loud, which
#    is the honest form of "not audited yet" and is checkable — unlike an empty
#    cell, which is indistinguishable from an oversight.
#
#    The rationale gets the same clock test as #6. "It is slow" was never a tier
#    and it is not a parallelism class either: what belongs here is the name of
#    the shared thing the suite touches, or the measurement that load would move.
# ===========================================================================
badclass=""
noreason=""
clocky_class=""
while IFS="$(printf '\t')" read -r s t risk rat pcls prat; do
  [ -n "$s" ] || continue
  case "$pcls" in
    parallel-safe|serial-timing|serial-global) ;;
    "") badclass="$badclass $s(none)" ; continue ;;
    *)  badclass="$badclass $s($pcls)" ; continue ;;
  esac
  if [ -z "$prat" ]; then
    noreason="$noreason $s"
  elif clocky "$prat"; then
    clocky_class="$clocky_class $s"
  fi
done <<EOF
$(rows)
EOF
if [ -n "$badclass" ]; then
  fail "#8 suites with no legal parallelism class:$badclass"
  echo "        Add a 'Parallelism' cell: parallel-safe | serial-timing | serial-global."
  echo "        When in doubt, serial-global with an 'unclassified-pending-verification'"
  echo "        rationale — defaulting to serial is safe, defaulting to parallel is not."
elif [ -n "$noreason" ]; then
  fail "#8 parallelism class declared with no rationale:$noreason"
elif [ -n "$clocky_class" ]; then
  fail "#8 parallelism rationale argues from cost, not from the hazard:$clocky_class"
  echo "        Name the global it touches, or the measurement load would move."
else
  npar="$(rows | cut -f5 | grep -c 'parallel-safe')"
  pass "#8 every suite declares a parallelism class with a hazard-based rationale ($npar parallel-safe)"
fi

# ===========================================================================
# 9. THIS CONTROL DOES NOT DEPEND ON NODE.
#
#    tests/manifest governs its own migration. If it needed a toolchain to give
#    a truthful answer, then a project with no toolchain — or a checkout part-way
#    through TASK-018 — would get a manifest that fails for a reason unrelated
#    to coverage, and the first thing anyone does with a control that fails for
#    the wrong reason is stop believing it.
#
#    Two halves, both asserted rather than intended:
#
#    (a) With no *.spec.ts on disk, no TS-shaped requirement is consulted at all
#        — no vitest.config.ts, no package.json, no runner stage. Tracked by
#        TS_REQUIRED rather than argued from the source.
#    (b) By EXECUTION: re-run this entire file with node/npm/npx/tsc/vitest
#        replaced by shims that record the call and exit 127. If any is touched,
#        or the poisoned run disagrees with this one, this fails. Reading the
#        source and concluding "it never calls node" is the same kind of claim
#        this file exists because someone made.
# ===========================================================================
if [ "$TS_PRESENT" -eq 0 ] && [ "$TS_REQUIRED" -ne 0 ]; then
  fail "#9a no spec exists under tests/, yet a TS-shaped requirement was consulted"
fi

if [ "${BP_MANIFEST_NO_NODE:-0}" = "1" ]; then
  # The poisoned child. It must not re-spawn itself.
  pass "#9 (child) reached the end of the run with node/npm/npx/tsc/vitest poisoned"
else
  _shim="$(mktemp -d)"
  _mark="$_shim/INVOKED"
  for _t in node npm npx tsc vitest; do
    printf '#!/bin/sh\necho "%s $*" >> "%s"\nexit 127\n' "$_t" "$_mark" > "$_shim/$_t"
    chmod +x "$_shim/$_t"
  done
  _out="$(env "PATH=$_shim:$PATH" BP_MANIFEST_NO_NODE=1 bash "$0" 2>&1)"
  _rc=$?
  if [ -f "$_mark" ]; then
    fail "#9b this file invoked a Node toolchain command — a project with no toolchain, or one part-way through TASK-018, would get a wrong answer from its own coverage control:"
    sed 's/^/          /' "$_mark"
  elif [ "$_rc" -ne 0 ] && [ "$FAILED" -eq 0 ]; then
    fail "#9b the run with node/npm/npx/tsc/vitest poisoned FAILED while this one passed — something below depends on the toolchain:"
    printf '%s\n' "$_out" | sed 's/^/          /'
  elif [ "$_rc" -ne 0 ]; then
    echo "  .. #9b inconclusive — the poisoned run failed, but so did this one. Fix the failures above and re-run."
  else
    if [ "$TS_PRESENT" -eq 1 ]; then
      pass "#9 no Node toolchain was invoked, and the whole file still passes with node/npm/npx/tsc/vitest poisoned (with specs on disk)"
    else
      pass "#9 no Node toolchain was invoked, no TS-shaped requirement was consulted, and the whole file still passes with node/npm/npx/tsc/vitest poisoned"
    fi
  fi
  rm -rf "$_shim"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-005 — every suite is classified and declares a parallelism class, every runner (*.sh and *.spec.ts) is invoked, and nothing is justified by the clock."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
