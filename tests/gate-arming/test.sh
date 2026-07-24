#!/bin/bash
# tests/gate-arming/test.sh
#
# A-22: the pre-push gate must ARM ITSELF in a fresh clone.
#
# The defect: `core.hooksPath` is repo-local config. `scripts/new-project.sh`
# sets it at bootstrap, so a BOOTSTRAPPED project is gated — but a CLONE never
# runs bootstrap, so `.githooks/pre-push` is present, correct, tested, and
# completely inert. CLAUDE.md and AGENTS.md claim a `postinstall` auto-wires it;
# there is no root package.json, so nothing does.
#
# This is not hypothetical: in this repo core.hooksPath was UNSET and the first
# push of 12 commits went out COMPLETELY UNGATED, while the gate was being run
# by hand and reported green.
#
# Fix shape (agreed with the redcare stream in the agent-exchange room, P-13):
# an idempotent `arm_gate` invoked from paths that ALREADY run on every wake —
# the activity feed and the `blueprint` sync CLI — so arming is code on an
# existing path rather than an instruction someone must remember.
#
# Run from the blueprint repo root:
#   bash tests/gate-arming/test.sh
#
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

# A clone-shaped fixture: real repo content, but core.hooksPath never set —
# exactly what `git clone` gives you.
mk_clone(){
  local d="$1"
  mkdir -p "$d/.githooks" "$d/scripts/lib" "$d/logs"
  # Copy the SHIPPED artefacts straight out of HEAD — so this still tests what
  # is committed, not the working tree — but skip the full archive+commit dance.
  # core.hooksPath is settable on an empty repo, so no commit is needed, and
  # building six full fixtures cost ~9s of a 30s gate budget.
  git -C "$ROOT" show HEAD:.githooks/pre-push        >"$d/.githooks/pre-push"
  git -C "$ROOT" show HEAD:scripts/agent-activity.sh >"$d/scripts/agent-activity.sh"
  git -C "$ROOT" show HEAD:scripts/blueprint         >"$d/scripts/blueprint"
  git -C "$ROOT" show HEAD:scripts/lib/gate.sh       >"$d/scripts/lib/gate.sh" 2>/dev/null || true
  git -C "$ROOT" show HEAD:AGENT_ROSTER.example.md   >"$d/AGENT_ROSTER.example.md" 2>/dev/null || true
  chmod +x "$d/.githooks/pre-push" "$d/scripts/agent-activity.sh" "$d/scripts/blueprint" 2>/dev/null
  printf '# Agent Signal\n\n| Field | Value |\n|---|---|\n| Holder | S |\n| State | ACTIVE |\n| Task | fixture |\n' \
    >"$d/AGENT_SIGNAL.md"
  ( cd "$d" && git init -q . ) >/dev/null 2>&1
  # Guarantee the clone-shaped precondition: core.hooksPath never set.
  ( cd "$d" && git config --unset core.hooksPath 2>/dev/null || true )
}

hookspath(){ git -C "$1" config --get core.hooksPath 2>/dev/null; }

# ===========================================================================
# 1. THE REPRODUCER — a clone is ungated, and the feed arms it.
# ===========================================================================
C="$WORK/c1"; mk_clone "$C"
[ -z "$(hookspath "$C")" ] && pass "precondition: a clone has core.hooksPath UNSET (the defect)" \
                           || fail "fixture wrong: clone already armed"
( cd "$C" && HOME="$WORK/h1" bash scripts/agent-activity.sh --status ) >"$WORK/o1" 2>&1
if [ "$(hookspath "$C")" = ".githooks" ]; then
  fail "#1 --status armed the gate; arming must not be a side effect of asking whether the feed runs"
else pass "#1 --status does NOT arm (asking a question must not change config)"; fi

C="$WORK/c2"; mk_clone "$C"
( cd "$C" && HOME="$WORK/h2" bash scripts/agent-activity.sh --daemon ) >"$WORK/o2" 2>&1
( cd "$C" && HOME="$WORK/h2" bash scripts/agent-activity.sh --stop ) >/dev/null 2>&1
if [ "$(hookspath "$C")" = ".githooks" ]; then
  pass "#2 the feed arms an unarmed clone (A-22 reproducer)"
else fail "#2 A-22: a clone stayed UNGATED after the feed ran — core.hooksPath='$(hookspath "$C")'"; fi

# ===========================================================================
# 2. Explicit by founder decision: the gate state is REPORTED, not silent.
#    A whole session was spent believing the gate was armed when it was not,
#    so "armed" must be visible rather than something you have to go check.
# ===========================================================================
grep -qi 'gate' "$WORK/o2" && pass "#3 arming is reported in the feed output" \
                           || { fail "#3 gate arming was silent — the founder asked for it to be explicit"; tail -3 "$WORK/o2"; }

# #2 above already proves the FEED calls arm_gate. The boundary cases below
# exercise arm_gate directly instead of paying a full daemon start/stop cycle
# each (~1.5s apiece, and the whole gate has a 30s ceiling). Composition:
# "the feed calls arm_gate" + "arm_gate behaves" covers the integration.
C="$WORK/c3"; mk_clone "$C"
( cd "$C" && git config core.hooksPath .githooks )
( cd "$C" && . scripts/lib/gate.sh && arm_gate "$C" ) >"$WORK/o3" 2>&1
if grep -qi 'gate' "$WORK/o3"; then pass "#4 already-armed state is confirmed explicitly, not silently assumed"
else fail "#4 an already-armed gate reported nothing — 'explicit' must mean every run, not only on change"; fi

# ===========================================================================
# 3. Do NOT clobber a deliberate foreign hooksPath (redcare's leg #2).
#    Someone using husky or a shared hooks dir must not have their git config
#    silently rewritten by our feed.
# ===========================================================================
C="$WORK/c4"; mk_clone "$C"
( cd "$C" && mkdir -p .other-hooks && git config core.hooksPath .other-hooks )
( cd "$C" && . scripts/lib/gate.sh && arm_gate "$C" ) >"$WORK/o4" 2>&1
if [ "$(hookspath "$C")" = ".other-hooks" ]; then
  grep -qi 'warn\|not armed\|foreign\|leaving' "$WORK/o4" \
    && pass "#5 foreign hooksPath preserved AND warned about" \
    || fail "#5 foreign hooksPath preserved but silently — the operator must be told the gate is not ours"
else fail "#5 CLOBBERED a deliberate foreign core.hooksPath ('$(hookspath "$C")') — silent config overwrite"; fi

# ===========================================================================
# 4. Never point core.hooksPath at a directory that cannot gate.
# ===========================================================================
C="$WORK/c5"; mk_clone "$C"
( cd "$C" && rm -f .githooks/pre-push )
( cd "$C" && . scripts/lib/gate.sh && arm_gate "$C" ) >"$WORK/o5" 2>&1
[ -z "$(hookspath "$C")" ] && pass "#6 does not arm when .githooks/pre-push is missing" \
                           || fail "#6 armed a hooks dir with no pre-push — a dangling, non-gating hooksPath"

# ===========================================================================
# 5. The second call site: the blueprint CLI (founder's call — a derived
#    project's non-orchestrator sessions run `blueprint drift` at wake but are
#    told NOT to start the feed, so the CLI is the only covering path there).
# ===========================================================================
C="$WORK/c6"; mk_clone "$C"
( cd "$C" && HOME="$WORK/h6" bash scripts/blueprint drift ) >"$WORK/o6" 2>&1
if [ "$(hookspath "$C")" = ".githooks" ]; then
  pass "#7 the blueprint CLI also arms an unarmed clone"
else fail "#7 blueprint CLI left the clone UNGATED — core.hooksPath='$(hookspath "$C")'"; fi

# ===========================================================================
# 6. Robustness: must never break its caller.
# ===========================================================================
D="$WORK/notarepo"; mkdir -p "$D/scripts" "$D/.githooks" "$D/logs"
cp "$ROOT/scripts/agent-activity.sh" "$D/scripts/"
cp "$ROOT/.githooks/pre-push" "$D/.githooks/" 2>/dev/null
printf '# S\n\n| Field | Value |\n|---|---|\n| Holder | S |\n| State | ACTIVE |\n| Task | t |\n' >"$D/AGENT_SIGNAL.md"
if ( cd "$D" && HOME="$WORK/h7" timeout 20 bash scripts/agent-activity.sh --status ) >/dev/null 2>&1; [ $? -le 1 ]; then
  pass "#8 outside a git repo the feed still runs (arming degrades, does not throw)"
else fail "#8 the feed broke outside a git work tree"; fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-22 — the gate arms itself on paths that already run."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
