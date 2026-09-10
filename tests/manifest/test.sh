#!/bin/bash
# tests/manifest/test.sh
#
# BUG-005 / Codex F1 — make the coverage policy a CONTROL instead of a slogan.
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
# ---------------------------------------------------------------------------
# TASK-020 — THE SUITES ARE THE FILESYSTEM. THERE IS NO LONGER A TABLE.
#
# This file used to reconcile the tree against `tests/SUITES.md`: a table naming
# every suite, its tier, its parallelism class and two paragraphs of rationale.
# Five of the assertions below existed only to police that table — every suite
# on disk is listed, every listed suite exists, the tier is one of four legal
# strings, the parallelism class is one of three, no rationale argues from the
# clock — and a sixth policed a table of shell runners declared retired.
#
# TASK-018-RULES R1 deletes the table: "No SUITES.md, no tier table, no
# catalogue of tests. A second description of a test is a copy that drifts."
# It had already drifted twice in one afternoon while being built.
#
# What survives is the half that was never about the table. `scripts/lib/
# suites.sh` derives the suite set from the runners on disk and the tier from
# `.gitattributes`, and this file asks the questions a derivation cannot answer
# by itself:
#
#   - does every runner on disk actually get RUN, by the gate and by CI?
#   - does the export boundary BEHAVE the way `.gitattributes` declares?
#   - do bootstrap and pull deliver the same thing?
#
# Two whole failure classes stopped being expressible rather than being checked
# harder, which is R2's point: a suite cannot be missing from a list that is not
# written down, and a suite cannot be mis-tiered when the tier IS the export
# boundary. What remains checkable is behaviour, and behaviour is what is
# checked here.
#
# ---------------------------------------------------------------------------
# BUG-051 — THE DEFECT THAT RETURNS THROUGH A DOOR THE CONTROL CANNOT SEE.
#
# Every assertion here used to be anchored on `*.sh`, so the whole control had
# one shape of blind spot, and it was exactly the shape of the TypeScript
# migration: move a suite to TS, delete its `.sh`, and nothing failed — no
# discovery error, because no shell file remained to find.
#
# A RUNNER is therefore a `*.sh` OR a `*.spec.ts`, everywhere, including both
# directions of the export boundary. Discovery lives in `scripts/lib/suites.sh`
# so the two kinds cannot drift apart the way `#1` (any `*.sh`) and the old `#2`
# (literally `test.sh`) already had.
#
# A TS suite is not invoked the way a shell suite is. One `vitest run` covers the
# whole tree (PLAN-TASK-018 §7.3 — per-suite lines come back via
# `pipe_stage_report`, not via 42 node startups), so there is no per-suite
# command to grep for. Nor does the hook run vitest itself: it sources
# `scripts/run-ts-suites.sh` and calls into it, because that file also declares
# the expected suite list to the pipeline and injects one stage per suite. So
# the invocation proof is a CHAIN, and every link is checked:
#
#     the spec exists   AND   the hook reaches the bridge it sources
#                       AND   the bridge runs vitest with no path filter
#                       AND   the vitest config's include actually covers it
#
# Break any link and #4 fails: delete the spec (1), delete the stage from the
# hook or delete the bridge (2), give the bridge's run a positional path (3),
# narrow the include glob (4). What is deliberately NOT accepted is "a spec
# exists somewhere" — that would be a nothing-assertion in a new costume.
#
# ---------------------------------------------------------------------------
# MIGRATION IS REPLACEMENT, NOT ACCUMULATION.
#
# There used to be a RETIRED-SHELL-RUNNERS table: a suite could keep a `*.sh`
# the gate no longer invoked, provided a row named the mutant that proved its
# spec equivalent. It existed to make a transitional state legal, and #4b spent
# ninety lines judging whether each declaration held up — because a marker that
# only has to EXIST is a way to switch #4 off one row at a time.
#
# The table is gone with SUITES.md and the six dead runners are deleted. The
# rule is now the simple one: **every runner on disk is invoked.** A suite
# migrating to TypeScript deletes its shell runner in the same change that adds
# its spec, having run the mutant first (R6) — which is what PLAN-TASK-018 §5
# always required. The `.sh` stays in git history for exactly as long as the
# comparison needs it, which is one session.
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
GATE="$ROOT/.githooks/pre-push-project"
HOOK="$ROOT/.githooks/pre-push"
CI="$ROOT/.github/workflows/security.yml"
# TASK-020 — the harness manifest lives UNDER tests/, not at the repo root.
# `tests/` is already a managed directory that no derived project owns a copy
# of, so the toolchain travels by both propagation paths or by neither, and a
# project's own root package.json can never be clobbered by a pull. See #2c.
VITEST_CFG="$ROOT/tests/vitest.config.ts"
PKG="$ROOT/tests/package.json"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

# BUG-014 — the gate runs this suite with GIT_DIR exported, and every git call
# below (#2b's archive) would then read whatever that names rather than this
# repo. Hoisted to the top because it used to sit inside #2b's `if IN_BLUEPRINT`
# block, which left it unset for a derived project.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

# THE SUITE DERIVATION LIVES IN scripts/lib/suites.sh, AND THIS FILE DOES NOT
# KEEP A COPY OF IT.
#
# It used to keep a copy of the table parse. `scripts/run-ts-suites.sh` then grew
# a verbatim copy of the same awk, under a comment claiming to be the thing that
# could not drift — and it had already drifted. Two readers of one source is the
# shape `scripts/lib/commit-subject.sh` and `scripts/lib/roster.sh` exist to
# refuse, and it is just as true of the filesystem as it was of the table: a
# control that discovers suites its own way is asserting something about its own
# `find`, not about what runs.
#
# Sourced by absolute path and REQUIRED. A missing library must not degrade to
# an empty derivation: every assertion below passes trivially over zero suites,
# which is precisely the vacuity #7 exists to catch — but it would catch it one
# step too late and blame the tree rather than the missing file.
. "$ROOT/scripts/lib/suites.sh" 2>/dev/null || true
if ! command -v bp_suite_runners >/dev/null 2>&1 || ! command -v bp_suite_rows >/dev/null 2>&1; then
  echo "FAIL: scripts/lib/suites.sh did not load — there is no suite derivation, so every"
  echo "      assertion here would pass over zero suites. Run: blueprint pull scripts/lib/suites.sh"
  exit 1
fi

# The runner inventory is taken ONCE and answered from memory. Several
# assertions ask "does this suite have a shell runner / a spec?" for every
# suite, and a `find` per question turned a 5 s control into a 19 s one — the
# exact pressure that talked someone into demoting a suite last time (BUG-005).
# The lists are space-delimited with sentinel spaces so a `case` match cannot
# see `a2bp-e2e` inside `a2bp-e2e-extra`.
RUNNERS="$(bp_suite_runners "$ROOT")"
_runner_suites(){ printf '%s\n' "$RUNNERS" | awk -F'\t' -v pat="$1" '$1 != "" && $2 ~ pat {print $1}' | sort -u; }
# Bracket classes, not backslash escapes: awk reads a -v value as a string
# first, so `\.` there is an unknown escape it warns about and flattens to `.`.
SUITES_WITH_SH=" $(_runner_suites '[.]sh$' | tr '\n' ' ')"
SUITES_WITH_TS=" $(_runner_suites '[.]spec[.]ts$' | tr '\n' ' ')"
has_sh_runner(){ case "$SUITES_WITH_SH" in *" $1 "*) return 0 ;; esac; return 1; }
has_ts_runner(){ case "$SUITES_WITH_TS" in *" $1 "*) return 0 ;; esac; return 1; }

rows(){ bp_suite_rows "$ROOT"; }

TS_PRESENT=0
[ "$SUITES_WITH_TS" = " " ] || TS_PRESENT=1

# TS_REQUIRED — set the moment any TS-shaped requirement is consulted. #9
# asserts it stays 0 while no spec exists on disk, which is the "a project
# mid-migration is never blindsided" property stated as something checkable
# rather than something intended.
TS_REQUIRED=0

# live_cmds FILE... — the files with COMMENT LINES REMOVED.
#
# Codex R2-F1b: membership was checked with an unanchored `grep` for the path,
# so commenting out an invocation kept the control green while the suite stopped
# running. Reproduced: `sed -i '/tests\/pipeline/s/^/#/' .githooks/pre-push*`
# left the manifest passing "every suite is invoked by the gate". Strip comments
# first, then require an anchored `bash tests/<suite>/<file>.sh` command rather
# than arbitrary text containing the path.
live_cmds(){ sed 's/#.*//' "$@" 2>/dev/null; }

# _classify_cmds — reads command text on stdin, prints one line per invocation
# of the vitest runner:
#
#   BLANKET vitest   a run over the whole tree: no positional path argument
#   BLANKET npm      ditto, reached through `npm test` / `npm run test`
#   ARGS <words>     a run NARROWED to those paths — proves nothing about a
#                    suite it does not name
#
# The distinction is the whole assertion. `vitest run pipeline` in the gate must
# not be readable as "every suite is invoked".
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
# `npx vitest run` lives in there — because that file also declares the expected
# suite list to the pipeline and injects one `pipe_stage_report` per suite, so
# `bootstrap-gate` #3's >=25-stage guard and the slowest-stage SLO keep meaning
# something (PLAN-TASK-018 §7.3). Inlining it would put a jq pipeline in the
# hook and a second reader of the suite derivation.
#
# So "the gate's live commands" means the hook PLUS the files it sources — but
# only the ones it genuinely reaches. A sourced file that merely DEFINES a
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
# named. Only ONE hop is followed. A bridge that sources a second bridge fails
# closed — no blanket run is found and #4 says so — which is the right direction
# to be wrong in, and the fix is to extend this walk.
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

# The `test` script out of tests/package.json, without Node. If this cannot be
# parsed the result is empty, which classifies as "not a blanket run" — fail
# closed.
_npm_test_script(){
  [ -f "$PKG" ] || return 0
  tr -d '\n' < "$PKG" \
    | sed -e 's/.*"scripts"[^{]*{//' -e 's/}.*//' \
    | tr ',' '\n' \
    | sed -n -e 's/.*"test"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

# Link 4 of the chain: the configured include must actually reach the specs.
# Narrowing this glob is a coverage cut that would otherwise leave every other
# link intact and every assertion green.
#
# The glob is `**/*.spec.ts` and not `tests/**/*.spec.ts` because the config now
# sits inside tests/, which is therefore vitest's root. Both halves moved
# together (TASK-020) — a config under tests/ still carrying the old
# tests-prefixed glob matches nothing at all, and vitest exits saying so.
_include_ok(){
  [ -f "$VITEST_CFG" ] || return 1
  tr -d ' \n' < "$VITEST_CFG" \
    | grep -qE "include:\[[^]]*[\"']\*\*/\*\.spec\.ts[\"']"
}

# ===========================================================================
# 1. EVERY RUNNER BELONGS TO A SUITE.
#
#    The derivation classifies by DIRECTORY: `tests/<suite>/<anything>.sh` or
#    `.spec.ts`. A runner sitting directly in `tests/` belongs to no suite at
#    all — nothing invokes it, no export rule covers it, and it would execute
#    nowhere while looking exactly like a test. `bp_suite_runners` emits it with
#    an empty suite field rather than dropping it, which is the only reason this
#    is checkable at all: a discovery that silently ignores what it does not
#    recognise cannot report it.
# ===========================================================================
toplevel="$(printf '%s\n' "$RUNNERS" | awk -F'\t' '$1 == "" && $2 != "" {print $2}' | tr '\n' ' ')"
if [ -n "${toplevel// /}" ]; then
  fail "#1 runners sit directly in tests/ and belong to no suite: $toplevel"
  echo "        Move each into tests/<suite>/ — the gate, CI and the export"
  echo "        boundary all address suites by directory, so a file here runs nowhere."
else
  pass "#1 every runner (*.sh or *.spec.ts) under tests/ belongs to a suite directory"
fi

# #1b — the compensating control for the helpers exemption in the derivation. A
# helper is exempt from being a suite because it is sourced rather than run, so
# the thing to assert is that it IS sourced: an unreferenced file there is dead
# code that no gate stage and no CI job would ever have complained about.
orphans=""
for f in $(find "$ROOT/tests/helpers" "$ROOT/tests/__helpers__" -type f -name '*.sh' 2>/dev/null | sort); do
  base="$(basename "$f")"
  grep -rqF "helpers/$base" "$ROOT/tests" --include='*.sh' --exclude-dir=helpers --exclude-dir=__helpers__ 2>/dev/null \
    || orphans="$orphans $base"
done
if [ -n "$orphans" ]; then
  fail "#1b shared helpers that no suite sources:$orphans — exempt from being a suite, so nothing else would catch them"
else
  pass "#1b every shared helper is sourced by at least one suite"
fi

# A `blueprint`-tier suite drives machinery that exists ONLY here —
# new-project.sh, templates/, .blueprint-root. It is export-ignore'd, so in a
# DERIVED project it is legitimately absent — and, since the suite set is
# derived from disk, absent means it never appears in that project's derivation
# at all. `.blueprint-root` is the same positive marker `drift` uses.
IN_BLUEPRINT=0
[ -f "$ROOT/.blueprint-root" ] && IN_BLUEPRINT=1

# ===========================================================================
# 2b. THE EXPORT BOUNDARY, BOTH DIRECTIONS (BUG-028).
#
#     A tier is a claim about WHERE a suite runs, and "blueprint only" is such
#     a claim — but it was enforced by nothing at all. `tests/bootstrap-*`,
#     `tests/template-source`, `tests/drift-in-blueprint` and
#     `tests/pull-exec-bit` all shipped to every derived project, wired into its
#     gate by `.githooks/pre-push-project`, testing machinery that cannot exist
#     there. Five of the six day-one failures. Nobody saw it because the failure
#     happens on someone else's machine, after the blueprint's own gate has gone
#     green over the same suites passing at home.
#
#     ---------------------------------------------------------------------
#     TASK-020 — THE TIER IS NOW DERIVED FROM `.gitattributes`, AND THIS CHECK
#     IS NOT THEREBY TAUTOLOGICAL.
#
#     The tier comes from a directory-level `tests/<suite>/  export-ignore`
#     LINE. This compares that against a real `git archive`, which is the
#     BEHAVIOUR. They are two different things and they come apart in both
#     directions:
#
#       - a line that does not take effect — misspelled, shadowed by a later
#         `-export-ignore`, or written for a directory that no longer exists —
#         declares a suite blueprint-only while it ships to everyone;
#       - a suite with no line whose files nevertheless do not arrive — caught
#         by a broad pattern elsewhere in the file, or simply uncommitted —
#         is a silent coverage cut for every project but this one.
#
#     `git check-attr` was tried first and is unusable here: it reports
#     `unspecified` for a directory pattern like `templates/` even though
#     `git archive` genuinely drops it, so it would have called a correct
#     boundary broken.
#
#     The archive is taken of HEAD — the tree that is about to be pushed. It
#     used to be taken of the WORKING TREE, on the argument that HEAD cannot
#     answer for a boundary the author has written and not yet committed. That
#     is true and it is the wrong trade: at pre-push time the change IS already
#     committed, so the working-tree view guarded a case the gate cannot see and
#     opened one it can. HEAD fails CLOSED: it reports the boundary as it will
#     actually ship, and the fix is to commit.
#
#     A suite SHIPS when its RUNNERS ship, not when its directory does. `grep
#     "^tests/<suite>/"` matched any file at all, so export-ignoring
#     `tests/foo/test.sh` while leaving a sibling README reported the boundary
#     healthy — while the derived project received a suite directory with no
#     runner and `.githooks/pre-push-project`'s own `if [ -f tests/foo/test.sh ]`
#     guard skipped it in silence.
#
#     ---------------------------------------------------------------------
#     TASK-018 PHASE 1 — "SHIPPED" AND "RUNNABLE" ARE NOT THE SAME WORD.
#
#     "every runner must ship" was exactly right while a runner was always a
#     `*.sh`, because a shell file is executable by any recipient. It stops
#     being right the moment a suite has two runner kinds and only one of them
#     is executable downstream. Phase 1 migrates the blueprint-tier suites, and
#     `.gitattributes` holds the whole TS toolchain back — so `tests/proc-cwd`
#     legitimately ships its `test.sh`, which a derived project CAN run, while
#     withholding its `.spec.ts`, which it cannot: no harness, no vitest config,
#     no package.json to install a runner from.
#
#     The invariant that holds in both phases is:
#
#         a shipping suite ships AT LEAST ONE runner the recipient can execute,
#         AND ships NO runner the recipient cannot.
#
#     Both halves are load-bearing and the second is the one that keeps the old
#     strength: a suite shipping ONLY a `.spec.ts` in phase 1 is the hollow case
#     exactly as before. And "every runner must ship" survives intact WITHIN
#     each kind. What changed is that the toolchain's own export state, not the
#     file extension, decides which kind counts.
#
#     `TS_SHIPS` is therefore derived from the archive rather than declared, so
#     the rule re-reads itself at phase 2 with nothing to remember. #2c below is
#     what makes that transition all-or-nothing.
# ===========================================================================
if [ "$IN_BLUEPRINT" -eq 1 ]; then
  # (GIT_DIR and friends are scrubbed at the top of this file — BUG-014.)
  _listing="$(mktemp)"
  ( cd "$ROOT" && git archive --format=tar HEAD 2>/dev/null | tar -t 2>/dev/null ) >"$_listing"

  if [ ! -s "$_listing" ]; then
    fail "#2b could not archive HEAD — the export boundary is unverified, not verified"
  else
    _ships(){ grep -qxF "$1" "$_listing"; }

    # CAN A DERIVED PROJECT EXECUTE A `.spec.ts`? Derived from the archive, not
    # declared, so phase 2 flips it by deleting export-ignore lines and this
    # file needs no edit. Every part is required: the root of the toolchain AND
    # the harness, because a spec whose fixture API is absent is as unrunnable
    # as one with no vitest at all, and a lockfile with no package.json is an
    # `npm ci` that dies on ENOENT.
    #
    # THE SET IS DECLARED ONCE, and #2c reads the same variable. It used to be
    # two hand-written lists, and BUG-061 walked straight through the gap
    # between them: package-lock.json was in neither list nor the export-ignore
    # block, so it shipped ALONE to every derived project while both checks
    # printed "phase 1 is whole". An AND over a remembered subset cannot see a
    # file it does not know about — so the partial-ship tally below is what
    # actually closes the class, not the list.
    TS_TOOLCHAIN='tests/package.json tests/package-lock.json tests/tsconfig.json tests/vitest.config.ts'
    TS_SHIPS=1
    ts_shipping=""
    ts_absent=""
    for _f in $TS_TOOLCHAIN; do
      if _ships "$_f"; then ts_shipping="$ts_shipping $_f"; else TS_SHIPS=0; ts_absent="$ts_absent $_f"; fi
    done
    if grep -q '^tests/harness/' "$_listing"; then
      ts_shipping="$ts_shipping tests/harness/"
    else
      TS_SHIPS=0
      ts_absent="$ts_absent tests/harness/"
    fi

    SPECS_SHIP=0
    grep -q '^tests/.*\.spec\.ts$' "$_listing" && SPECS_SHIP=1

    # Which harness files exist but do NOT arrive. Both sides are read off the
    # filesystem — `find` on disk, `git archive` for the boundary — so a file
    # added to tests/harness/ tomorrow is covered without anyone remembering to
    # add it anywhere. TS_SHIPS above is satisfied by ONE harness file; this is
    # what makes "the harness ships" mean the harness rather than a fragment.
    harness_partial=""
    for _h in "$ROOT"/tests/harness/*.ts; do
      [ -e "$_h" ] || continue
      _hrel="tests/harness/$(basename "$_h")"
      _ships "$_hrel" || harness_partial="$harness_partial $_hrel"
    done

    shipped_bp=""
    withheld=""
    hollow=""
    unrunnable=""
    tsonly=""
    while IFS="$(printf '\t')" read -r s t; do
      [ -n "$s" ] || continue
      # Runners counted BY KIND, because only one kind's executability depends
      # on the phase. A directory that arrives without a runner the recipient
      # can execute is worse than an absent one: the derived gate skips it
      # silently and the push stays green over a suite that no longer exists.
      _sh_tot=0
      _sh_got=0
      _ts_tot=0
      _ts_got=0
      for _r in $(printf '%s\n' "$RUNNERS" | awk -F'\t' -v s="$s" '$1 == s {print $2}'); do
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
        # .gitattributes when the answer is a retained shell runner, or a
        # deliberate `tests/<suite>/ export-ignore` line making it blueprint-only.
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
      fail "#2b suites declared blueprint-only by .gitattributes DO ship, so they run in every derived project's gate against machinery that cannot be there:$shipped_bp"
    elif [ -n "$unrunnable" ]; then
      fail "#2b suites ship a *.spec.ts while the TS toolchain does NOT ship, so a derived project receives a runner it cannot execute:$unrunnable"
      echo "        Either export-ignore the spec, or make the phase-2 move whole (see #2c)."
    elif [ -n "$hollow" ]; then
      fail "#2b suites ship WITHOUT their runners, so the derived gate's 'if [ -f tests/<suite>/<runner> ]' guard skips them in silence:$hollow"
    elif [ -n "$tsonly" ]; then
      fail "#2b suites are TypeScript-ONLY while the TS toolchain does not ship, so they reach a derived project with no runner it can execute:$tsonly"
      echo "        Keep a shell runner until phase 2, or add 'tests/<suite>/ export-ignore'"
      echo "        to make the suite blueprint-only deliberately."
    elif [ -n "$withheld" ]; then
      fail "#2b suites that are not declared blueprint-only do not reach the archive, so every derived project silently loses them:$withheld"
    elif [ "$TS_SHIPS" -eq 1 ]; then
      pass "#2b the export boundary matches .gitattributes in both directions, runner by runner (HEAD; phase 2 — the TS toolchain ships, so specs count as runners)"
    else
      pass "#2b the export boundary matches .gitattributes in both directions, runner by runner (HEAD; phase 1 — the TS toolchain does not ship, so every shipping suite keeps an executable shell runner)"
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
    #       bootstrap  ships the WHOLE archive (new-project.sh: `git archive
    #                  HEAD`).
    #       pull       ships MANAGED_FILES only — and a managed DIRECTORY
    #                  expands through `git archive HEAD <dir>`, so anything
    #                  export-ignore'd under it does not travel either.
    #
    #     ---------------------------------------------------------------
    #     TASK-020 CLOSED THE HALF THAT NEEDED A LIST TO REMEMBER.
    #
    #     The toolchain used to live at the repo ROOT: package.json,
    #     package-lock.json, tsconfig.json, vitest.config.ts. Root files are
    #     under no managed directory, so they travelled by bootstrap and NOT by
    #     pull unless someone listed each of them in MANAGED_FILES — and the
    #     half-done move had a precise, invisible victim: an EXISTING project
    #     that pulls received `*.spec.ts` and `tests/harness/` with no vitest,
    #     no config and no package.json to install one, while a project
    #     bootstrapped the same day was fine.
    #
    #     Listing them was never the right fix, and not only because a list goes
    #     stale. `pull_file` has no marker vocabulary for JSON, so it falls to
    #     the legacy whole-file copy — with no `.bp-bak`, which only the
    #     marker-mismatch branches write. Every derived project has its own root
    #     package.json (STACK_DEFAULTS.md), so managing ours would have silently
    #     REPLACED the project's real dependency manifest. Data loss, on the
    #     command every wake runs.
    #
    #     The toolchain therefore lives under `tests/`, which is already a
    #     managed directory and which no derived project owns a copy of.
    #     Collision is impossible rather than merely avoided, and ships ⟺
    #     managed holds by construction for every file under it. What is left to
    #     check is that the construction is still standing: that `tests/` is
    #     genuinely managed, and that no toolchain file has wandered back out
    #     from under it.
    #
    #     NOT checked, deliberately: a toolchain that ships while no spec ships
    #     yet. That is the sane ordering of the phase-2 move — land the runner,
    #     then migrate a suite onto it — and forbidding it would force the
    #     riskier order.
    #
    #     THE SAME CLAIM COVERS THE GATE'S OWN DEPENDENCIES. `.githooks/pre-push`
    #     and `.githooks/pre-push-project` are BOTH managed, so every file they
    #     source has to travel by both paths too, or the hook arrives downstream
    #     with half of itself. THIS FILE IS SCANNED TOO, because it sources
    #     `scripts/lib/suites.sh`: a derived project whose copy never arrives
    #     gets a manifest that refuses to run at all. The failure is quiet and
    #     permanent — a hook whose bridge never arrives takes its `else` branch
    #     on every push, a `pipe_skip` with a reason that reads as deliberate,
    #     forever. Checked generically off the same bridge discovery #4 uses.
    #
    #     Read TEXTUALLY, not by running `blueprint files`: this must stay a
    #     pure text/git-attr inspection (#9), and the CLI touches the real repo.
    #     A textual parse can go stale in silence, and stale here would pass
    #     vacuously — so the parse asserts its own non-vacuity first.
    # =====================================================================
    _mf="$(awk '/^MANAGED_FILES=\(/{f=1;next} f&&/^\)/{exit} f' "$ROOT/scripts/blueprint" 2>/dev/null \
             | sed -n 's/^[[:space:]]*"\([^"]*\)".*/\1/p')"
    _mf_n="$(printf '%s\n' "$_mf" | grep -c .)"
    _managed(){ printf '%s\n' "$_mf" | grep -qxF "$1"; }

    # Every toolchain file must sit under a managed directory, or be managed by
    # name. This is the assertion that keeps "ships ⟺ managed" structural: move
    # one back to the repo root and it fails here rather than downstream.
    ts_stray=""
    for _f in $TS_TOOLCHAIN; do
      case "$_f" in
        tests/*) continue ;;
      esac
      _managed "$_f" || ts_stray="$ts_stray $_f"
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
    elif [ -n "$ts_stray" ]; then
      fail "#2c toolchain files live outside the managed 'tests/' directory and are not managed by name:$ts_stray"
      echo "        Under tests/ the two propagation paths agree by construction. Outside it"
      echo "        they diverge silently, and MANAGED_FILES cannot be the fix for a JSON file:"
      echo "        pull_file has no markers for JSON, falls back to a whole-file copy with no"
      echo "        .bp-bak, and every derived project has its own root package.json."
    elif [ -n "$_bridge_split" ]; then
      fail "#2c the gate sources files whose two propagation paths disagree:$_bridge_split"
      echo "        .githooks/pre-push and .githooks/pre-push-project are managed, so a file"
      echo "        they source must be BOTH shipped and managed, or neither. ships=1,managed=0"
      echo "        means a NEW project gets it and then freezes it forever, while an EXISTING"
      echo "        project that pulls the hook never receives it at all — its gate takes the"
      echo "        'else' branch and pipe_skips that stage on every push, permanently, with a"
      echo "        reason that reads as deliberate. Add the file to MANAGED_FILES, or"
      echo "        export-ignore it so no project is told it should have been there."
    elif [ "$TS_SHIPS" -eq 0 ] && [ -n "$ts_shipping" ]; then
      fail "#2c BUG-073: the TS toolchain ships in PART —$ts_shipping reach every derived project while$ts_absent do not"
      echo "        A partial toolchain is worse than none: the recipient gets machinery it"
      echo "        cannot use, and .github/workflows/security.yml is MANAGED, so its ts-tests"
      echo "        job runs 'npm ci' in a project holding half a toolchain and goes red on the"
      echo "        first push, on a job that project never wrote (BUG-061). Either export-ignore"
      echo "        the shipping half in .gitattributes, or make the phase-2 move whole."
    elif [ "$SPECS_SHIP" -eq 1 ] && [ "$TS_SHIPS" -eq 0 ]; then
      fail "#2c BUG-073: *.spec.ts files ship to derived projects while the TS toolchain does not — every recipient gets specs with no runner"
      echo "        Ship tests/package.json, tests/tsconfig.json, tests/vitest.config.ts and"
      echo "        tests/harness/, or export-ignore the specs. Half of the move is worse than none."
    elif [ "$TS_SHIPS" -eq 1 ] && [ "$SPECS_SHIP" -eq 0 ]; then
      # THE PHASE-2 HALF OF THE SAME CLAIM (BUG-073), and it did not exist until phase 2
      # was reached. Every branch above tests the invariant from the phase-1
      # side: machinery withheld, or machinery arriving that the recipient
      # cannot use. The mirror image is machinery arriving that the recipient
      # has NOTHING TO USE ON — vitest, a package.json, an `npm ci` in a
      # MANAGED CI job, and not one spec to run.
      #
      # It is reachable by an ordinary edit: re-add `tests/**/*.spec.ts` here,
      # or export-ignore the directory of the last shipping TypeScript suite,
      # and without this branch #2c prints "phase 2 is whole" over a toolchain
      # that ships for nothing. That is a check going green for the wrong
      # reason, which is BUG-066's shape and the thing this whole file exists
      # to refuse.
      #
      # It is deliberately NOT symmetric with the phase-1 pass below. Phase 1
      # legitimately has a toolchain that does not ship AND no specs; phase 2
      # has no legitimate state in which the toolchain ships alone, because the
      # invariant is an IFF — the toolchain ships BECAUSE a shipping suite is
      # TypeScript. The one ordering this would wrongly forbid, landing the
      # runner before migrating a suite onto it, is the ordering the comment at
      # the head of #2c already declines to require, and it stopped being
      # available the moment `tests/bug-numbers` shipped.
      fail "#2c the TS toolchain ships but NO *.spec.ts does — every derived project installs a runner with nothing to run"
      echo "        The invariant is an IFF: the toolchain ships BECAUSE a shipping suite is"
      echo "        TypeScript. A toolchain alone means every project pays 'npm ci' in the"
      echo "        MANAGED ts-tests job, on a green job that executed no test — this repo's"
      echo "        signature defect. Either ship a TypeScript suite, or export-ignore the"
      echo "        toolchain again and go back to phase 1 deliberately."
    elif [ "$TS_SHIPS" -eq 1 ] && [ -n "$harness_partial" ]; then
      # AND THE HARNESS HAS TO ARRIVE WHOLE. TS_SHIPS asks `grep -q
      # '^tests/harness/'`, which one file satisfies — a one-file proxy for a
      # whole directory, which is exactly the shape BUG-061 walked through and
      # the shape F-002 counted six times today. `tests/harness/index.ts` is
      # the ONLY way a spec obtains a fixture, so a single `tests/harness/
      # index.ts export-ignore` would leave every shipped spec importing a
      # module that is not there, with TS_SHIPS still 1 and #2c still green.
      #
      # Derived from the filesystem on both sides rather than from a list, for
      # the reason BUG-061 states in its own row: an AND over a remembered
      # subset cannot see a file it does not know about.
      fail "#2c the harness ships in PART — every shipped spec imports it, and these files do not arrive:$harness_partial"
      echo "        tests/harness/index.ts is the only way a spec obtains a fixture. A partial"
      echo "        harness is a project whose every TypeScript suite dies on an unresolved"
      echo "        import, while TS_SHIPS still reads 1 because one harness file arrived."
    elif [ "$TS_SHIPS" -eq 1 ]; then
      pass "#2c BUG-073: phase 2 is whole — the TS toolchain ships from under the managed 'tests/' directory, so bootstrap and pull deliver the same thing (checked $_mf_n MANAGED_FILES entries)"
    else
      pass "#2c phase 1 is whole — no spec ships, and the TS toolchain is export-ignore'd from under the managed 'tests/' directory, so neither path delivers it (checked $_mf_n MANAGED_FILES entries)"
    fi
  fi
  rm -f "$_listing"
fi

# ===========================================================================
# 4. EVERY SUITE IS ACTUALLY INVOKED BY THE GATE.
#    A tree full of suites the gate never runs would be a more convincing
#    version of the same silence.
# ===========================================================================
# Two runner kinds, two proofs, and a suite mid-migration owes BOTH — a spec
# that executes nowhere is dead code wearing the name of a suite, which is the
# state `drift-in-blueprint` was found in (running in neither the gate nor CI).
#
# Both proofs read the DEEP command text — the hook plus the bridges it reaches
# — so there is one definition of "what the gate runs" rather than two that
# drift. See §"FOLLOWING A SOURCED BRIDGE" for why a sourced file only counts
# when the hook calls into it.
#
# NO TIER TEST HERE, and none is needed. A `blueprint`-tier suite is `both` plus
# "does not ship": it still blocks the push HERE, so it is still required to be
# invoked. Downstream it is not on disk, so it is not in the derivation and
# there is nothing to skip — which retires the whole BUG-053 skip, a construct
# that existed only because a shipped TABLE described suites a project had
# correctly never received.
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
    TS_WHY="tests/vitest.config.ts include no longer covers **/*.spec.ts"
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
    TS_WHY="tests/vitest.config.ts include no longer covers **/*.spec.ts"
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
while IFS= read -r s; do
  [ -n "$s" ] || continue
  if has_sh_runner "$s" && ! _gate_sh_invoked "$s"; then
    notrun="$notrun $s(shell runner never invoked)"
  fi
  if has_ts_runner "$s" && ! _ts_covered_gate "$s"; then
    notrun="$notrun $s($TS_WHY)"
  fi
done <<EOF
$(bp_suite_names "$ROOT")
EOF
if [ -n "$notrun" ]; then
  fail "#4 suites the gate never invokes:$notrun"
  echo "        A shell runner is proven by an anchored 'bash tests/<suite>/<file>.sh'."
  echo "        A spec is proven by a vitest run with NO path filter — in the hook, or in"
  echo "        a bridge the hook sources AND calls into — plus an include glob that"
  echo "        reaches it. A stage naming the spec outright also counts."
  echo "        A runner nothing invokes is not retired, it is dead: delete it, or wire it in."
else
  pass "#4 every suite is invoked by the gate, runner kind by runner kind"
fi

# ===========================================================================
# 5. EVERY SUITE IS ACTUALLY IN THE WORKFLOW.
# ===========================================================================
if [ -f "$CI" ]; then
  ci_missing=""
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    if has_sh_runner "$s" && ! _ci_sh_invoked "$s"; then
      ci_missing="$ci_missing $s(shell runner)"
    fi
    if has_ts_runner "$s" && ! _ts_covered_ci "$s"; then
      ci_missing="$ci_missing $s($TS_WHY)"
    fi
  done <<EOF
$(bp_suite_names "$ROOT")
EOF
  if [ -n "$ci_missing" ]; then
    fail "#5 suites absent from the workflow:$ci_missing"
  else
    pass "#5 every suite runs in the workflow, runner kind by runner kind"
  fi
fi

# ===========================================================================
# 7. NON-VACUITY — the derivation must actually be finding suites. Every
#    assertion above passes trivially over an empty tree, which is precisely
#    the failure mode this file exists to prevent.
# ===========================================================================
n="$(bp_suite_names "$ROOT" | grep -c .)"
if [ "${n:-0}" -lt 10 ]; then
  fail "#7 derived only ${n:-0} suites from tests/ — the derivation is broken, so #1-#5 proved nothing"
else
  pass "#7 derived $n suites from the runners on disk (assertions above are non-vacuous)"
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
#     were in that state and had been for their whole lives — tests/SUITES.md at
#     1 BEGIN / 4 END, .githooks/pre-push-project at 1 / 3 — so neither had ever
#     been marker-merged, and every derived project's own gate guards were being
#     replaced on every pull. Found by reading the merge's precondition while
#     adding a marker, which is how I discovered I had just made it worse.
#
#     `tests/marker-merge` does not catch this: it drives the MECHANISM against
#     fixture files that satisfy the precondition, and never asks whether the
#     real managed files do. A control that tests the machine and not the
#     instance.
#
#     tests/SUITES.md is deleted (TASK-020), so the SUITES and
#     RETIRED-SHELL-RUNNERS vocabularies went with it. The hooks remain.
# ===========================================================================
marker_bad=""
for _mf_file in "$GATE" "$HOOK"; do
  [ -f "$_mf_file" ] || continue
  set -- $(bp_marker_balance "$_mf_file" BLUEPRINT)
  [ "$1" -eq 0 ] && [ "$2" -eq 0 ] && continue
  [ "$1" -eq "$2" ] && continue
  marker_bad="$marker_bad ${_mf_file#"$ROOT"/}(${1} BEGIN/${2} END)"
done
if [ -n "$marker_bad" ]; then
  fail "#7b marker counts do not balance, so 'blueprint pull' will NOT merge these files — it falls back to a whole-file copy and destroys the project's own content outside the markers:$marker_bad"
  echo "        The counts are of SUBSTRINGS, so prose describing a marker counts as one."
  echo "        Say 'the managed region' in sentences and keep the literal token for markers."
else
  pass "#7b every marker vocabulary balances, so pull merges these files instead of clobbering them"
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
#        — no vitest config, no package.json, no runner stage. Tracked by
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
  echo "PASS: BUG-005 — every runner (*.sh and *.spec.ts) on disk belongs to a suite, is invoked by the gate and by CI, and the export boundary behaves as .gitattributes declares."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
