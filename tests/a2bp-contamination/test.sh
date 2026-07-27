#!/bin/bash
# tests/a2bp-contamination/test.sh
#
# A-07 regression fixture — `blueprint a2bp` must not launder a project's
# specifics into the generic blueprint.
#
# The defect: cmd_a2bp copied a project file into the blueprint with a bare
# `cp`. Two consequences, both observed in the wild:
#
#   1. NO REVERSE-SUBSTITUTION. `blueprint pull` substitutes {{PROJECT_NAME}}
#      into the project's copy; a2bp copied that substituted text straight
#      back, so one project's name was baked into the generic file and fanned
#      out to every OTHER project on their next pull. This is exactly how
#      BUG-002 put `~/.linkedin-watcher-agent` into scripts/agent-activity.sh.
#
#   2. NO CONTAMINATION SCAN. Host home paths, foreign project state dirs and
#      operator emails rode along silently — the A-01 / A-09 / A-14 shapes.
#      A file carrying `$HOME/.acme-flow` was copied in with zero warning.
#
# Fix shape: one shared helper (scripts/lib/contamination.sh) providing the
# exact inverse of the CLI's substitute_placeholders, plus a scan that BLOCKS
# the copy. Shared lib rather than inline code so new-project.sh and the gate
# can reuse the same patterns — the scripts/lib/state-dir.sh precedent (A-09).
#
# Two-commit pattern (CLAUDE.md §"Team Workflow"): this file FAILS on the
# parent commit (bare `cp`, no helper) and PASSES on the fix commit.
#
# Run from the blueprint repo root:  bash tests/a2bp-contamination/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BLUEPRINT_BIN="$ROOT/scripts/blueprint"
CARRIER="docs/mocks/README.md"   # a real MANAGED_FILES entry, low-stakes content
FAILED=0

fail() { echo "FAIL: $*"; FAILED=1; }
pass() { echo "  ok — $*"; }

if [ ! -x "$BLUEPRINT_BIN" ]; then
  echo "FAIL: $BLUEPRINT_BIN not executable"
  exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM

# The project directory's BASENAME is the project name the CLI derives, so it
# has to be a real name rather than mktemp's random one.
PROJ="$WORK/acme-flow"
FAKE_BP="$WORK/blueprint"

# Build a project + a stand-in blueprint. The stand-in only needs the target
# path to exist — a2bp writes into $BLUEPRINT_ROOT/$f — so this stays cheap
# (no `git archive` of the real tree).
setup() {
  rm -rf "$PROJ" "$FAKE_BP"
  mkdir -p "$PROJ/$(dirname "$CARRIER")" "$FAKE_BP/$(dirname "$CARRIER")"
  printf 'SENTINEL — blueprint copy untouched\n' > "$FAKE_BP/$CARRIER"
  cat >"$PROJ/.blueprint-source" <<EOF
blueprint_source = $FAKE_BP
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
}

# Run a2bp inside the project; capture combined output and exit code.
run_a2bp() {
  ( cd "$PROJ" && "$BLUEPRINT_BIN" a2bp "$@" ) >"$WORK/out" 2>&1
  echo $?
}

bp_copy() { cat "$FAKE_BP/$CARRIER"; }
bp_untouched() { grep -q '^SENTINEL' "$FAKE_BP/$CARRIER"; }

# ===========================================================================
# 1. THE REPRODUCER — reverse-substitution.
#    The project's copy has the project name where the blueprint carries a
#    placeholder. a2bp must put the placeholder BACK, or this project's name
#    fans out to every other project on their next pull (BUG-002's mechanism).
# ===========================================================================
setup
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Generic guidance for the acme-flow project.
Environment override: ACME_FLOW_HOME
EOF
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#1 a2bp exited $rc on a legitimately generic file — see $WORK/out"
elif bp_untouched; then
  fail "#1 a2bp did not copy the file at all"
else
  if bp_copy | grep -q 'acme-flow'; then
    fail "#1 the project name 'acme-flow' survived into the blueprint copy — no reverse-substitution (this IS BUG-002's mechanism)"
  elif ! bp_copy | grep -q '{{PROJECT_NAME}}'; then
    fail "#1 blueprint copy has no {{PROJECT_NAME}} token — the name was not restored to a placeholder"
  else
    pass "#1 lowercase project name reverse-substituted to {{PROJECT_NAME}}"
  fi

  if bp_copy | grep -q 'ACME_FLOW_HOME'; then
    fail "#1b the UPPER-cased project name 'ACME_FLOW' survived — reverse-substitution missed the {{PROJECT_NAME_UPPER}} form (BUG-002 was literally LINKEDIN_WATCHER_AGENT_HOME)"
  elif bp_copy | grep -q '{{PROJECT_NAME_UPPER}}_HOME'; then
    pass "#1b UPPER-cased project name reverse-substituted to {{PROJECT_NAME_UPPER}}"
  else
    fail "#1b expected {{PROJECT_NAME_UPPER}}_HOME in the blueprint copy; got: $(bp_copy | tr '\n' ' ')"
  fi
fi

# ===========================================================================
# 2. Contamination — a host home path must BLOCK the copy.
#    Same rule the repo already enforces on .claude/settings.json
#    (.githooks/pre-push host-path guard, added for A-01) — a2bp is the other
#    door into the same tree and was unguarded.
# ===========================================================================
setup
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Run the tool from /home/someuser/sources/thing before review.
EOF
rc=$(run_a2bp "$CARRIER")
if ! bp_untouched; then
  fail "#2 a host path (/home/someuser/...) was copied into the blueprint — contamination scan absent or not blocking"
elif [ "$rc" -eq 0 ]; then
  fail "#2 a2bp rejected the copy but still exited 0 — a blocked back-propagation must fail loudly (BUG-003's lesson: never report a refusal as success)"
else
  grep -q '/home/someuser' "$WORK/out" \
    && pass "#2 host path blocks the copy, exits non-zero, and the offending line is named" \
    || fail "#2 rejected but the output does not quote the offending line — the operator cannot act on it"
fi

# ===========================================================================
# 3. Contamination — a foreign per-project state dir must BLOCK the copy.
#    This is the exact shape Fable verified live on A-07 ($HOME/.acme-flow
#    copied in with zero warning) and the shape A-09 spent 8 review rounds on.
# ===========================================================================
setup
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
State is kept under $HOME/.other-project/state for now.
EOF
rc=$(run_a2bp "$CARRIER")
if ! bp_untouched; then
  fail "#3 a literal per-project state dir (\$HOME/.other-project) was copied into the blueprint — this is the A-09 contamination re-entering"
elif [ "$rc" -eq 0 ]; then
  fail "#3 rejected the copy but exited 0"
else
  pass "#3 literal per-project state dir blocks the copy"
fi

# ===========================================================================
# 4. A genuinely generic change must still copy.
#    Guards the fix from the opposite failure: a scan so eager that nobody can
#    back-propagate anything is a scan that gets bypassed by habit.
# ===========================================================================
setup
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks

Design mockups and throwaway prototypes live here. Keep spike code out of
production `src/` trees — see CLAUDE.md §"Work-item folder rule".
Well-known tool dirs such as ~/.config and ~/.local/bin are fine to mention.
EOF
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#4 a clean generic file was rejected (exit $rc) — false positive; see $WORK/out"
elif bp_untouched; then
  fail "#4 a clean generic file was not copied"
else
  pass "#4 clean generic content still back-propagates (no over-blocking)"
fi

# ===========================================================================
# 5. --force is the documented escape hatch, and it must be LOUD.
#    Contamination detection is heuristic, so an override has to exist; a
#    silent override would just restore the old behaviour under a new name.
# ===========================================================================
setup
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Run the tool from /home/someuser/sources/thing before review.
EOF
rc=$(run_a2bp --force "$CARRIER")
if grep -q 'reject.*--force' "$WORK/out"; then
  fail "#5 --force was parsed as a FILENAME, not a flag — the escape hatch does not exist"
elif bp_untouched; then
  fail "#5 --force did not copy — the escape hatch is missing (exit $rc)"
elif ! grep -q '/home/someuser' "$WORK/out"; then
  # A warning that doesn't say WHAT it waved through is not a warning. Assert
  # the finding itself is echoed, not merely the word "force" (an earlier
  # draft of this test passed on the CLI's own "reject --force" line).
  fail "#5 --force copied without naming the contamination it let through — a silent override is the unguarded bare cp under a new name"
else
  pass "#5 --force copies but names the contamination it waved through"
fi

# ===========================================================================
# 6. Files that implement the substitution must NOT be reverse-substituted.
#    scripts/blueprint and scripts/new-project.sh carry the placeholder tokens
#    as code; the CLI already exempts them on the pull side via
#    _should_substitute. The a2bp side must honour the SAME exemption, or
#    back-propagating the CLI corrupts the CLI.
# ===========================================================================
setup
mkdir -p "$PROJ/scripts" "$FAKE_BP/scripts"
printf 'SENTINEL\n' > "$FAKE_BP/scripts/new-project.sh"
cat >"$PROJ/scripts/new-project.sh" <<'EOF'
#!/bin/bash
# Bootstrap. Mentions acme-flow only as example text in a comment.
sed -e "s/{{PROJECT_NAME}}/${proj}/g" "$f"
EOF
rc=$(run_a2bp scripts/new-project.sh)
if [ "$rc" -ne 0 ]; then
  fail "#6 a2bp exited $rc on scripts/new-project.sh — see $WORK/out"
elif grep -q '^SENTINEL' "$FAKE_BP/scripts/new-project.sh"; then
  fail "#6 scripts/new-project.sh was not copied"
elif grep -q 'acme-flow' "$FAKE_BP/scripts/new-project.sh"; then
  pass "#6 substitution-implementing files are exempt from reverse-substitution (matches _should_substitute on the pull side)"
else
  fail "#6 scripts/new-project.sh WAS reverse-substituted — the pull-side _should_substitute exemption is not mirrored on the a2bp side; back-propagating the CLI would corrupt it"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: a2bp reverse-substitutes and refuses to launder project specifics."
  exit 0
fi
echo "FAILED: a2bp contamination guard (A-07) is not holding."
exit 1
