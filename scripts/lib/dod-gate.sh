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

# dod_items_in_push RANGE_LIST
#   Prints one normalised item id per line (BUG-19, TASK-1) for every commit in
#   the outgoing range whose subject starts with <TYPE>#<n>:. Merge, revert and
#   root commits carry no item by design and are simply absent.
dod_items_in_push() {
  for _dg_range in $1; do
    git log --format='%s' "$_dg_range" 2>/dev/null
  done \
    | sed -n 's/^\(BUG\|FEATURE\|TASK\)#\([0-9][0-9]*\):.*/\1-\2/p' \
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
  for _dg_state in backlog doing waiting-acceptance done; do
    for _dg_f in "docs/$_dg_state/BUGS.md" "docs/$_dg_state/BACKLOG.md" "docs/$_dg_state/CHANGES.md"; do
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
dod_stage_bugtests() {
  _dg_items="$(dod_items_in_push "$1")"
  _dg_bugs="$(printf '%s\n' "$_dg_items" | sed -n 's/^BUG-//p')"
  if [ -z "$_dg_bugs" ]; then
    echo "no BUG items in this push"
    return 0
  fi
  _dg_untested=""
  for _dg_n in $_dg_bugs; do
    _dg_n="$(printf '%s' "$_dg_n" | sed 's/^0*//')"
    grep -rqE "BUG-0*${_dg_n}\b" tests/ 2>/dev/null || _dg_untested="$_dg_untested BUG-$_dg_n"
  done
  if [ -n "$_dg_untested" ]; then
    echo "No test under tests/ names:$_dg_untested"
    echo ""
    echo "DoD §2 — every bug fix carries a regression test that references the"
    echo "bug number, so 'it is fixed' is checkable later by something other"
    echo "than trust."
    return 1
  fi
  printf 'regression tests found for: %s\n' "$(printf '%s' "$_dg_bugs" | tr '\n' ' ' | sed 's/[0-9][0-9]*/BUG-&/g')"
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
  if [ -f scripts/lib/state-dir.sh ]; then
    # shellcheck source=scripts/lib/state-dir.sh
    . ./scripts/lib/state-dir.sh
    _dg_sig="$(agent_signal_file "$(pwd)" 2>/dev/null)"
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
