#!/bin/sh
# scripts/lib/dod-gate.sh — the DoD handoff checklist as pipeline stages.
# Sourced by .githooks/pre-push-project. Not executed.
#
# WHY THIS EXISTS
#
# docs/DoD.md §7 is a checklist you WALK. Walking it is remembering, and this
# repo has rejected remembering five times over. But the deeper reason is the
# FEATURE-002 argument, which the founder extended to the DoD:
#
#   "a gate that does not run prints NOTHING, which looks exactly like a gate
#    that passed"
#
# So the DoD steps print. Their value is not only that they check — it is that
# their ABSENCE is visible in the feed. The stage COUNT is the checksum: if a
# run reports fewer stages than usual, a step was skipped, and `pipe_skip`
# requires a reason so a legitimate skip announces itself.
#
# WHAT MADE THIS POSSIBLE
#
# TASK-002. Until every commit subject started with its backlog item, the gate
# had no way to know which items a push served, so it could not check the DoD
# against them. `.githooks/pre-push` already computes the outgoing commit range
# for the secret scan; the item list falls out of it.
#
# WHAT IS DELIBERATELY *NOT* HERE
#
# §D (docs in sync), §F (cross-provider review) and §H (self-audit) need
# judgement. A stage that asks "did you do it?" and accepts "yes" is theatre:
# it produces a green that LOOKS like verification while checking nothing. That
# failure mode is not hypothetical — on 2026-08-03 a fixture-isolation guard
# passed while watching a file that could not change, and a commit message
# asserted a CLAUDE.md edit that had not been made. Both were greens standing
# in for work.
#
# Those steps are PRINTED as a reminder stage instead. Visibility is not
# enforcement, and saying so is the point.

# TASK-039 — subjects are parsed by scripts/lib/commit-subject.sh, the library
# the commit-msg hook uses. This file used to carry its own sed pattern, which
# accepted subjects the hook refuses: two definitions of one rule.
_dg_subject_lib="${BP_CODE_ROOT:-.}/scripts/lib/commit-subject.sh"
if [ -r "$_dg_subject_lib" ]; then
  # shellcheck source=scripts/lib/commit-subject.sh
  . "$_dg_subject_lib"
fi

# _dg_need_parser → fails, saying why, when commit-subject.sh did not load.
#
# BUG-040 is why this is loud. When the item list came back empty (BSD sed on
# macOS), every stage built on it passed over nothing and the gate printed
# PASSED. A missing parser would produce the same empty list.
_dg_need_parser() {
  command -v commit_subject_item >/dev/null 2>&1 && return 0
  echo "cannot read $_dg_subject_lib, so this push's items are unknown."
  echo "Run: blueprint pull scripts/lib/commit-subject.sh"
  return 1
}

# dod_items_in_push RANGE_LIST
#   Prints one normalised item id per line (BUG-19, TASK-1) for every commit in
#   the outgoing range whose subject names an item under the commit-msg rule.
#   Merge, revert and root commits carry no item by design and are absent.
dod_items_in_push() {
  for _dg_range in $1; do
    git log --format='%s' "$_dg_range" 2>/dev/null
  done \
    | while IFS= read -r _dg_subject; do commit_subject_item "$_dg_subject"; done \
    | sort -u
}

# dod_find_row ITEM  →  prints the lifecycle folder holding its row, or nothing.
#
# Numeric, not textual: commits say BUG#19 and rows say **BUG-019**, so a string
# compare would silently match nothing and every check above it would pass
# vacuously. Zero-padding is stripped from both sides.
dod_find_row() {
  _dg_type="${1%%-*}"
  _dg_num="${1##*-}"
  _dg_num="$(printf '%s' "$_dg_num" | sed 's/^0*//')"
  for _dg_state in backlog doing waiting-acceptance "done"; do
    for _dg_f in "docs/$_dg_state/BUGS.md" "docs/$_dg_state/BACKLOG.md"; do
      [ -f "$_dg_f" ] || continue
      if grep -qE "^\| \*\*${_dg_type}-0*${_dg_num}\*\*" "$_dg_f"; then
        printf '%s\n' "$_dg_state"
        return 0
      fi
    done
  done
  return 1
}

# --- §1b rule 1 / §7C — every item in this push has a backlog row ------------
#
# FAILS when a row does not exist anywhere: that is work with no item, which is
# the rule. It only NOTES a row sitting outside doing/, because the expected
# folder legitimately varies — an acceptance push moves rows to done/, and a
# reopen moves them back. Folder placement is what `lcm` reconciles; existence
# is what this gate can assert without guessing intent.
dod_stage_rows() {
  _dg_need_parser || return 1
  _dg_items="$(dod_items_in_push "$1")"
  if [ -z "$_dg_items" ]; then
    echo "no item-bearing commits in this push (merge/revert/root only)"
    return 0
  fi
  _dg_missing=""
  _dg_elsewhere=""
  for _dg_i in $_dg_items; do
    _dg_where="$(dod_find_row "$_dg_i")" || { _dg_missing="$_dg_missing $_dg_i"; continue; }
    [ "$_dg_where" = doing ] || _dg_elsewhere="$_dg_elsewhere $_dg_i($_dg_where)"
  done
  [ -n "$_dg_elsewhere" ] && pipe_note "rows outside doing/:$_dg_elsewhere"
  if [ -n "$_dg_missing" ]; then
    echo "These items have NO backlog row anywhere:$_dg_missing"
    echo ""
    echo "DoD §1b rule 1 — all work refers to a backlog item. If this work has"
    echo "no item, it is not ready to push: add a row under docs/backlog/,"
    echo "promote it to docs/doing/, and reference it."
    return 1
  fi
  printf 'items: %s\n' "$(printf '%s' "$_dg_items" | tr '\n' ' ')"
}

# --- §7B — every BUG in this push has a regression test naming it ------------
#
# §2: "Reference the bug number in the test name." A bug fix with no test that
# names it is the one thing §7B can check mechanically. FEATURE and TASK items
# are not required to have one, so they are not checked — asserting a rule that
# does not exist would train people to ignore the stage.
#
# TASK-039 — WHERE IT LOOKS. The roots come from project_config_paths.md:
#
#   - BP_TEST_ROOTS: `backend/src frontend/e2e`
#
# space-separated, relative to the project root. Undeclared, the root is
# `$BP_CODE_ROOT/tests`, which is what the blueprint needs.
#
# WHAT IT NEVER COUNTS, and the containment is SYMMETRIC (Alexey finding 1).
# `docs/` holds the bug's own backlog row, `.git` holds commit text, and
# `scripts/` and `.githooks/` are blueprint-managed code naming blueprint bug
# numbers. Outside the blueprint, so is `$BP_CODE_ROOT/tests`: its suites name
# the BLUEPRINT's numbers, and storm2flow had about 97 bugs passing on them.
#
# A root is refused when it IS one of those, CONTAINS one, or sits INSIDE one.
# The first version refused only the first two, so `tests/shipped`, `docs/doing`
# and a symlink resolving into `tests/` all certified project bugs on blueprint
# material. Declaring a directory is not evidence of who wrote it.
#
# THE ONE EXCEPTION IS DEPTH, and it is a founder decision (2026-09-16) resolving
# Alexey finding 3. A runner sitting DIRECTLY in `tests/` is the project's own,
# because the blueprint ships none there — only package.json, tsconfig.json,
# vitest.config.ts and package-lock.json. So the shipped `tests/` is searched
# SHALLOW: depth 1, runner files only. That restores CLAUDE.md's snapshot layout
# (`tests/*.snap.test.ts`) without opening the suites one level down, which is
# where every shipped suite lives. `tests/e2e` therefore still does not count.
#
# THE RULE RESTS ON A FACT ABOUT THIS REPO, so the fact is asserted rather than
# assumed: tests/dod-gate #14 fails the blueprint's own push if a runner ever
# lands directly at `tests/`. Provenance would be the stronger answer, but the
# shipped set is not knowable at gate time — `blueprint files` prints `tests/`
# unexpanded, the expansion lives in `read_blueprint_source` which FETCHES the
# remote, and `.gitattributes` names only the suites that do NOT ship. A pre-push
# gate cannot depend on the network. Depth is the property that is local.
#
# THE DECLARATION IS A LITERAL LIST (Alexey finding 2). Globs are refused rather
# than expanded, a second declaration is refused rather than silently first-wins,
# and a malformed line is refused rather than falling back to the default — the
# fallback searched the blueprint's own `tests/`, which is the dangerous
# direction. Roots must also resolve INSIDE the project, which is what stops
# `../outside`, an absolute path and an outward symlink.
dod_test_roots() {
  _dg_cfg="project_config_paths.md"
  if [ ! -f "$_dg_cfg" ]; then
    printf '%s\n' "${BP_CODE_ROOT:-.}/tests"
    return 0
  fi
  _dg_count="$(grep -c '^- BP_TEST_ROOTS:' "$_dg_cfg" 2>/dev/null || true)"
  [ -n "$_dg_count" ] || _dg_count=0
  if [ "$_dg_count" -eq 0 ]; then
    printf '%s\n' "${BP_CODE_ROOT:-.}/tests"
    return 0
  fi
  if [ "$_dg_count" -gt 1 ]; then
    echo "project_config_paths.md declares BP_TEST_ROOTS $_dg_count times (more than one)."
    echo "Keep exactly one declaration — the gate will not guess which is current."
    return 1
  fi
  _dg_decl="$(sed -n 's/^- BP_TEST_ROOTS: `\([^`]*\)`[[:space:]]*$/\1/p' "$_dg_cfg")"
  if [ -z "$(printf '%s' "$_dg_decl" | tr -d '[:space:]')" ]; then
    echo "the BP_TEST_ROOTS declaration in project_config_paths.md is malformed."
    echo "Expected one backtick-quoted, space-separated list of directories:"
    echo '  - BP_TEST_ROOTS: `backend/src frontend/e2e`'
    echo "Refusing rather than defaulting to tests/, which holds the blueprint's suites."
    return 1
  fi
  case "$_dg_decl" in
    *'*'*|*'?'*|*'['*|*']'*)
      echo "BP_TEST_ROOTS contains a glob metacharacter: $_dg_decl"
      echo "Roots are literal paths. A glob expands to whatever is on disk, which"
      echo "is how docs/ and scripts/ became searchable."
      return 1 ;;
  esac
  # -f as well as the refusal above: splitting is wanted here, expansion never is.
  set -f
  for _dg_word in $_dg_decl; do printf '%s\n' "$_dg_word"; done
  set +f
}

dod_stage_bugtests() {
  _dg_need_parser || return 1
  _dg_items="$(dod_items_in_push "$1")"
  _dg_bugs="$(printf '%s\n' "$_dg_items" | sed -n 's/^BUG-//p')"
  if [ -z "$_dg_bugs" ]; then
    echo "no BUG items in this push"
    return 0
  fi

  # A refused declaration stops the stage. It does NOT fall back to a default:
  # the project meant to say where its tests are, and guessing would search the
  # blueprint's own suites.
  if ! _dg_rootlist="$(dod_test_roots 2>&1)"; then
    printf '%s\n' "$_dg_rootlist"
    echo ""
    echo "DoD §2 — the gate cannot tell where this project's tests live, so it"
    echo "cannot check that every BUG in this push has one."
    return 1
  fi

  # Never evidence of a project test, in EITHER direction of containment.
  _dg_proj="$(pwd -P)"
  _dg_tab="$(printf '\t')"
  _dg_never="$(cd -P docs 2>/dev/null && pwd)
$(cd -P .git 2>/dev/null && pwd)
$(cd -P scripts 2>/dev/null && pwd)
$(cd -P .githooks 2>/dev/null && pwd)"
  # The blueprint's own tests/ is its own regression suite and is searched whole.
  # Anywhere else it is the SHIPPED directory: its top level is the project's
  # (founder rule), everything below it is the blueprint's.
  _dg_shipped=""
  [ -f .blueprint-root ] || _dg_shipped="$(cd -P "${BP_CODE_ROOT:-.}/tests" 2>/dev/null && pwd)"

  _dg_plan=""
  _dg_searched=""
  _dg_skipped=""
  while IFS= read -r _dg_r; do
    [ -n "$_dg_r" ] || continue
    # cd -P resolves symlinks, so a root is judged by the directory it REACHES.
    if ! _dg_rp="$(cd -P "$_dg_r" 2>/dev/null && pwd)"; then
      _dg_skipped="$_dg_skipped $_dg_r(not a directory)"
      continue
    fi
    case "$_dg_rp/" in
      "$_dg_proj"/*) ;;
      *) _dg_skipped="$_dg_skipped $_dg_r(outside the project)"; continue ;;
    esac
    _dg_why=""
    _dg_mode="full"
    if [ -n "$_dg_shipped" ]; then
      if [ "$_dg_rp" = "$_dg_shipped" ]; then
        _dg_mode="shallow"
      else
        case "$_dg_rp/" in
          "$_dg_shipped"/*) _dg_why="inside tests/" ;;
        esac
        case "$_dg_shipped/" in
          "$_dg_rp"/*) _dg_why="contains tests/" ;;
        esac
      fi
    fi
    if [ -z "$_dg_why" ]; then
      while IFS= read -r _dg_x; do
        [ -n "$_dg_x" ] || continue
        if [ "$_dg_rp" = "$_dg_x" ]; then
          _dg_why="is ${_dg_x##*/}/"
          break
        fi
        case "$_dg_x/" in
          "$_dg_rp"/*) _dg_why="contains ${_dg_x##*/}/"; break ;;
        esac
        case "$_dg_rp/" in
          "$_dg_x"/*) _dg_why="inside ${_dg_x##*/}/"; break ;;
        esac
      done <<EOF
$_dg_never
EOF
    fi
    if [ -n "$_dg_why" ]; then
      _dg_skipped="$_dg_skipped $_dg_r($_dg_why)"
      continue
    fi
    _dg_plan="$_dg_plan$_dg_r$_dg_tab$_dg_mode
"
    if [ "$_dg_mode" = shallow ]; then
      _dg_searched="$_dg_searched $_dg_r(top level only)"
    else
      _dg_searched="$_dg_searched $_dg_r"
    fi
  done <<EOF
$_dg_rootlist
EOF
  if [ -n "$_dg_skipped" ]; then pipe_note "not searched:$_dg_skipped"; fi

  _dg_untested=""
  _dg_parked=""
  _dg_tested=""
  for _dg_n in $_dg_bugs; do
    _dg_n="$(printf '%s' "$_dg_n" | sed 's/^0*//')"
    # A bug PARKED in backlog/ has no fix yet, so it can have no regression
    # test — the test arrives with the fix. Demanding one here would make
    # FILING a bug impossible, which trains people not to file them.
    if [ "$(dod_find_row "BUG-$_dg_n" 2>/dev/null)" = backlog ]; then
      _dg_parked="$_dg_parked BUG-$_dg_n"
      continue
    fi
    # -a is load-bearing, not tidiness. A file containing a NUL byte is
    # classified BINARY by grep, which then prints NOTHING for it: no match,
    # no error, and an exit status identical to "the pattern is absent". One
    # got into tests/a2bp-request/a2bp-request.spec.ts on 2026-09-11, and this
    # check would have reported the bug UNTESTED with its test sitting in the
    # file -- a specific, plausible, wrong answer that reads as the gate
    # working. docs/config/findings.md F-002, instance 8.
    # BUG-066: the default root lives under the CODE root, which is not the
    # project root once TASK-021 moves the code under scaffolding/. The `docs/`
    # paths above stay cwd-relative on purpose — those are the PROJECT's own
    # lifecycle files and do not move.
    _dg_hit=""
    while IFS="$_dg_tab" read -r _dg_r _dg_mode; do
      [ -n "$_dg_r" ] || continue
      if [ "$_dg_mode" = shallow ]; then
        # -maxdepth 1 IS the guarantee. One level down is where every shipped
        # suite lives, so this must never become a recursive search.
        if [ -n "$(find "$_dg_r" -maxdepth 1 -type f \
                     \( -name '*.spec.ts' -o -name '*.spec.js' \
                        -o -name '*.test.ts' -o -name '*.test.js' -o -name '*.sh' \) \
                     -exec grep -laE "BUG-0*${_dg_n}\b" {} + 2>/dev/null | head -n 1)" ]; then
          _dg_hit=1
          break
        fi
      elif grep -raqE "BUG-0*${_dg_n}\b" "$_dg_r" 2>/dev/null; then
        _dg_hit=1
        break
      fi
    done <<EOF
$_dg_plan
EOF
    if [ -n "$_dg_hit" ]; then
      _dg_tested="$_dg_tested BUG-$_dg_n"
    else
      _dg_untested="$_dg_untested BUG-$_dg_n"
    fi
  done
  [ -n "$_dg_parked" ] && pipe_note "parked, no fix to test yet:$_dg_parked"
  if [ -n "$_dg_untested" ]; then
    echo "No test under the searched roots names:$_dg_untested"
    echo "  searched:${_dg_searched:- nothing}"
    [ -n "$_dg_skipped" ] && echo "  not searched:$_dg_skipped"
    echo ""
    echo "DoD §2 — every bug fix carries a regression test that references the"
    echo "bug number, so 'it is fixed' is checkable later by something other"
    echo "than trust. Declare where this project's tests live in"
    echo "project_config_paths.md:  - BP_TEST_ROOTS: \`backend/src frontend/e2e\`"
    echo "Outside the blueprint, tests/ holds the blueprint's suites and never counts."
    return 1
  fi
  # Names only what it actually checked. Reporting the parked ones here as
  # "tests found" would be the stage lying about its own coverage.
  if [ -n "$_dg_tested" ]; then
    printf 'regression tests found for:%s\n' "$_dg_tested"
  else
    echo "every BUG in this push is parked — nothing to test yet"
  fi
}

# --- §7G — the live baton is well-formed -------------------------------------
#
# Deliberately narrow. "The signal reflects reality" is mostly judgement, and a
# stage that guessed at it would fail on every push and get trained out. What IS
# checkable: the baton exists and carries its four rows. A malformed baton
# dispatches agents against nonsense, which BUG-019 and the settle-window work
# both came out of.
dod_stage_signal() {
  _dg_sig=""
  if [ -f "${BP_CODE_ROOT:-.}/scripts/lib/state-dir.sh" ]; then
    # shellcheck source=scripts/lib/state-dir.sh
    . "${BP_CODE_ROOT:-.}/scripts/lib/state-dir.sh"
    # BUG-066: the parent hook resolved this already. `pwd` is the fallback for
    # a standalone source, and it is the same claim it always was — git runs
    # hooks from the work-tree root.
    : "${BP_CODE_ROOT:=$(pwd)}"
    BP_STATE_ROOT="$(bp_state_root)" || return 1
    _dg_sig="$(agent_signal_file 2>/dev/null)"
  fi
  if [ -z "$_dg_sig" ] || [ ! -f "$_dg_sig" ]; then
    echo "no live baton at ${_dg_sig:-<unresolved>} — seed it with scripts/signal-set.sh"
    return 1
  fi
  for _dg_row in Holder State Task; do
    grep -qE "^\| $_dg_row \|" "$_dg_sig" || {
      echo "the live baton is missing its '$_dg_row' row: $_dg_sig"
      echo "Publish it with scripts/signal-set.sh — never by hand."
      return 1
    }
  done
  printf 'baton well-formed: %s\n' "${_dg_sig#"$(pwd)/"}"
}

# --- §D / §F / §H — printed, not pretended -----------------------------------
#
# These need judgement. They are listed so that a run which did NOT consider
# them is distinguishable from one that did — the founder watches the feed, and
# a step that never prints cannot be noticed as missing.
dod_stage_judgement() {
  pipe_note "§D docs in sync · §F cross-provider review · §H self-audit — judgement, not checked here"
  echo "These three cannot be verified mechanically and are NOT claimed to be:"
  echo "  §D  user-facing docs match the change"
  echo "  §F  an agent of the OTHER provider reviewed it (DoD §1b rule 4)"
  echo "  §H  self-audit"
  return 0
}
