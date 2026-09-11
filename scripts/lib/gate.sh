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

# arm_gate PROJECT_ROOT
# Reports the gate state ALWAYS (founder's call: explicit, not silent — a whole
# session was spent believing the gate was armed when it was not). Arms only
# when core.hooksPath is UNSET. Never fails the caller.
#
# THE ROOT IS REQUIRED (BUG-077). It used to default to `git rev-parse
# --show-toplevel`, which answers about the CALLER's exported git environment —
# and git exports GIT_DIR into every hook, while the gate runs the suites from
# one. This function WRITES git config at the root it resolves, so a redirected
# answer arms (or fails to arm) somebody else's repository: BUG-014's mechanism
# with A-22's consequence, which is the pair this helper exists to prevent.
#
# Both callers already pass an explicit root, so the default was dead code that
# existed only to be wrong. Removed rather than repaired, for the reason
# state-dir.sh gives about its own positional root: a tolerant signature lets a
# stale call site keep resolving somewhere plausible.
arm_gate() {
  _ag_root="${1:-}"
  # One guard, and it SPEAKS. "Reports the gate state ALWAYS" (above) has to hold
  # on the failure paths too, or a call that could not arm is indistinguishable
  # from a call that never happened — which is the BUG-004 injury itself. This also
  # covers rev-parse exiting 0 with empty output: unlikely, but it must not reach
  # the path concatenation below.
  if [ -z "$_ag_root" ]; then
    echo "  ⚠ gate: arm_gate needs an explicit project root — nothing to arm."
    echo "     Pass the root you already resolved; it is never inferred from the"
    echo "     git environment, which a hook can redirect (BUG-077)."
    return 0
  fi
  if [ ! -d "$_ag_root" ]; then
    echo "  ⚠ gate: '$_ag_root' is not a directory — nothing to arm"
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

# arm_push_keepalive ROOT — keep the push connection alive across a long gate.
#
# BUG-032. git opens the SSH connection, THEN runs pre-push, THEN transfers on
# that same connection. This gate takes ~380 s, comfortably past the remote's
# idle timeout, so the connection is dead before the transfer starts: the gate
# prints PASSED and the push fails with "Connection to github.com closed by
# remote host" — or, worse, with nothing at all. Measured on 2026-09-09: the
# message appeared mid-gate on consecutive pushes and vanished the moment a
# keepalive was passed by hand.
#
# It is armed here rather than documented because it is repo-LOCAL config and a
# clone therefore starts without it — the identical trap as core.hooksPath
# above, whose lesson (BUG-004, A-22) is that a setting the operator must
# remember is a setting that is absent when it matters. Every push in this
# session needed GIT_SSH_COMMAND passed explicitly, which is exactly the
# "remembered at the moment the author is busy" shape CLAUDE.md rejects.
#
# Same non-clobber rule as the gate: a deliberate core.sshCommand belongs to
# whoever set it. We warn and leave it, because silently rewriting another
# tool's transport is worse than a slow push.
#
# The root is REQUIRED, for the same reason arm_gate's is (BUG-077): this
# function writes repo-local git config, and a root inferred from the caller's
# git environment is a root a hook can redirect.
arm_push_keepalive() {
  _ak_root="${1:-}"
  [ -n "$_ak_root" ] || return 0
  git -C "$_ak_root" rev-parse --git-dir >/dev/null 2>&1 || return 0

  _ak_cur="$(git -C "$_ak_root" config --get core.sshCommand 2>/dev/null || true)"
  case "$_ak_cur" in
    *ServerAliveInterval*) return 0 ;;
    "") ;;
    *)
      echo "  ⚠ push: core.sshCommand is set and carries no ServerAliveInterval —"
      echo "     leaving it alone. A gate longer than the remote's idle timeout can"
      echo "     kill the push after a green run (BUG-032)."
      return 0
      ;;
  esac

  # 20 s is well inside every common idle timeout, and 30 missed probes before
  # giving up means a genuinely dead link still fails rather than hanging.
  if git -C "$_ak_root" config --local core.sshCommand \
       'ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30' 2>/dev/null; then
    echo "  ✓ push: keepalive armed (core.sshCommand, BUG-032)"
  fi
  return 0
}
