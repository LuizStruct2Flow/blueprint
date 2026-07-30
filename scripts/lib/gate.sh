#!/bin/sh
# scripts/lib/gate.sh — shared gate-arming helper. Sourced, not executed.
#
# BUG-004: `core.hooksPath` is repo-LOCAL config. `scripts/new-project.sh` sets it
# at bootstrap, so a bootstrapped project is gated — but a CLONE never runs
# bootstrap, so `.githooks/pre-push` sits there correct, tested, and completely
# inert. CLAUDE.md and the hook header itself claimed a `postinstall` auto-wires
# it; there is no root package.json, so nothing ever did.
#
# That is not hypothetical: in this repo core.hooksPath was UNSET and a push of
# 12 commits went out COMPLETELY UNGATED while the gate was being run by hand
# and reported green.
#
# Fix shape (agreed cross-stream, pattern P-13): arm from paths that ALREADY run
# on every wake, so arming is code on an existing path rather than an
# instruction someone has to remember. Two callers today:
#   - scripts/agent-activity.sh   (the feed — the orchestrator's wake step)
#   - scripts/blueprint           (the sync CLI — `drift` is mandated at wake,
#                                  and spawned personas are told NOT to start
#                                  the feed, so in a derived project this is the
#                                  only covering path for them)
# One mechanism, two callers — never two implementations.

# arm_gate [repo_root]
# Reports the gate state ALWAYS (founder's call: explicit, not silent — a whole
# session was spent believing the gate was armed when it was not). Arms only
# when core.hooksPath is UNSET. Never fails the caller.
arm_gate() {
  _ag_root="${1:-}"
  [ -n "$_ag_root" ] || _ag_root="$(git rev-parse --show-toplevel 2>/dev/null)" || _ag_root=""
  # One guard, and it SPEAKS. "Reports the gate state ALWAYS" (above) has to hold
  # on the failure paths too, or a call that could not arm is indistinguishable
  # from a call that never happened — which is the BUG-004 injury itself. This also
  # covers rev-parse exiting 0 with empty output: unlikely, but it must not reach
  # the path concatenation below.
  if [ -z "$_ag_root" ]; then
    echo "  ⚠ gate: not a git work tree — nothing to arm"
    return 0
  fi

  # Never point core.hooksPath at a directory that cannot gate.
  if [ ! -x "$_ag_root/.githooks/pre-push" ]; then
    echo "  ⚠ gate: .githooks/pre-push missing or not executable — NOT arming"
    return 0
  fi

  _ag_cur="$(git -C "$_ag_root" config --get core.hooksPath 2>/dev/null || true)"

  if [ "$_ag_cur" = ".githooks" ]; then
    echo "  ✓ gate: armed (core.hooksPath=.githooks)"
    return 0
  fi

  if [ -n "$_ag_cur" ]; then
    # Someone deliberately points at husky, a shared hooks dir, or a test rig.
    # Silently rewriting another tool's git config is how you lose trust — warn
    # and leave it, so the operator knows OUR gate is not the one running.
    echo "  ⚠ gate: core.hooksPath is '$_ag_cur', not .githooks — leaving it alone."
    echo "     The struct2flow pre-push gate is NOT active. Run"
    echo "     'git config --local core.hooksPath .githooks' if you want it."
    return 0
  fi

  if git -C "$_ag_root" config --local core.hooksPath .githooks 2>/dev/null; then
    echo "  ✓ gate: ARMED core.hooksPath=.githooks (was unset — a clone is ungated by default, BUG-004)"
  else
    echo "  ⚠ gate: could not set core.hooksPath (read-only config?) — gate NOT active"
  fi
  return 0
}
