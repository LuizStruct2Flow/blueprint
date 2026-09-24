#!/bin/sh
# scripts/lib/dod-gate.sh — GENERATED sourced adapter. DO NOT HAND-EDIT.
#
# TASK-067 / BUG-147: the DoD gate's policy lives in scripts/lib/dod-gate.mts
# now (PLAN-BUG-147-dod-gate-port.md, "Option C"). This file is the
# small, mechanically re-renderable bridge that keeps both production callers
# (.githooks/pre-push-project and .github/workflows/security.yml) byte-
# identical: it defines the same shell function names the old shell library
# did and forwards each call to the matching `dod-gate.mts` subcommand.
#
# scripts/shell-inventory-check.mts re-renders this exact file from the
# (function, subcommand) pairs below and requires whole-file byte equality —
# see CLAUDE.md "Shell to TypeScript, organically" for the ceiling this form
# is admitted under. Regenerating it by hand risks drifting from that
# renderer; treat the pairs as the source of truth.
#
# Sourced, not executed — same contract the old dod-gate.sh carried.

_dg_bridge_mts="${BP_CODE_ROOT:-.}/scripts/lib/dod-gate.mts"

# _dg_call SUBCOMMAND [ARGS...] — invokes the CLI, replays any notes it wrote
# to a private DOD_GATE_NOTE_DIR through the caller's own pipe_note (or prints
# them as `note: …` when no pipe_note is defined), and returns the CLI's exit
# status unchanged.
_dg_call() {
  if [ ! -f "$_dg_bridge_mts" ]; then
    echo "cannot find $_dg_bridge_mts — run: blueprint pull scripts/lib/dod-gate.mts" >&2
    return 2
  fi
  _dg_notedir="$(mktemp -d)" || { echo "internal error: cannot create a note directory" >&2; return 2; }
  DOD_GATE_NOTE_DIR="$_dg_notedir" node "$_dg_bridge_mts" "$@"
  _dg_rc=$?
  if [ -f "$_dg_notedir/count" ]; then
    _dg_count="$(cat "$_dg_notedir/count")"
    _dg_i=1
    while [ "$_dg_i" -le "$_dg_count" ]; do
      if command -v pipe_note >/dev/null 2>&1; then
        pipe_note "$(cat "$_dg_notedir/note.$_dg_i")"
      else
        printf 'note: %s\n' "$(cat "$_dg_notedir/note.$_dg_i")"
      fi
      _dg_i=$((_dg_i + 1))
    done
  fi
  rm -rf "$_dg_notedir"
  return "$_dg_rc"
}

dod_items_in_push() { _dg_call items "$1"; }
dod_stage_rows() { _dg_call rows "$1"; }
dod_stage_bugtests() { _dg_call bugtests "$1"; }
dod_stage_signal() { _dg_call signal; }
dod_stage_judgement() { _dg_call judgement; }
