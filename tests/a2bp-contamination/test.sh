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
# Provenance lives in the blueprint's own copy: these are the placeholder
# lines that `pull` substituted into the project in the first place. Without
# them there is nothing to reverse TO, and the guard correctly fails closed
# instead of guessing — that is case #8.
cat >"$FAKE_BP/$CARRIER" <<'EOF'
# Mocks
Generic guidance for the {{PROJECT_NAME}} project.
Environment override: {{PROJECT_NAME_UPPER}}_HOME
EOF
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
#
#    Driven with --force on purpose. The only observable proof that reverse-
#    substitution was skipped is the project name surviving verbatim — and the
#    scan (correctly) blocks on exactly that. --force isolates the exemption
#    from the scan so this case tests one behaviour, not two. Compare with #1,
#    where the same input on a NON-exempt file comes out as {{PROJECT_NAME}}:
#    that differential is the whole assertion.
# ===========================================================================
setup
mkdir -p "$PROJ/scripts" "$FAKE_BP/scripts"
printf 'SENTINEL\n' > "$FAKE_BP/scripts/new-project.sh"
cat >"$PROJ/scripts/new-project.sh" <<'EOF'
#!/bin/bash
# Bootstrap. Mentions acme-flow only as example text in a comment.
sed -e "s/{{PROJECT_NAME}}/${proj}/g" "$f"
EOF
rc=$(run_a2bp --force scripts/new-project.sh)
if grep -q '^SENTINEL' "$FAKE_BP/scripts/new-project.sh"; then
  fail "#6 scripts/new-project.sh was not copied even under --force (exit $rc)"
elif ! grep -q 'acme-flow' "$FAKE_BP/scripts/new-project.sh"; then
  fail "#6 scripts/new-project.sh WAS reverse-substituted — the pull-side _should_substitute exemption is not mirrored on the a2bp side; back-propagating the CLI would corrupt it"
elif ! grep -q '{{PROJECT_NAME}}' "$FAKE_BP/scripts/new-project.sh"; then
  fail "#6 the file's own {{PROJECT_NAME}} code token was mangled"
else
  pass "#6 substitution-implementing files are exempt from reverse-substitution (matches _should_substitute on the pull side)"
fi

# ===========================================================================
# 7. F1 (Codex four-eyes) — a one-word project name must not corrupt prose.
#    The first implementation ran a global `sed s/${proj_name}/{{PROJECT_NAME}}/g`
#    and called it "the exact inverse". For a project legitimately named
#    `blueprint`, every occurrence of the word "blueprint" in generic prose was
#    silently rewritten — and copied through with no finding at all.
#    Provenance-based reversal + the baseline exemption is the fix; this case
#    pins both halves.
# ===========================================================================
WORD_PROJ="$WORK/blueprint"
mkdir -p "$WORD_PROJ/docs/mocks" "$FAKE_BP/docs/mocks"
cat >"$FAKE_BP/$CARRIER" <<'EOF'
# Mocks
The blueprint documentation explains blueprint sync.
EOF
cat >"$WORD_PROJ/$CARRIER" <<'EOF'
# Mocks
The blueprint documentation explains blueprint sync.
A new generic line about mockups.
EOF
cat >"$WORD_PROJ/.blueprint-source" <<EOF
blueprint_source = $FAKE_BP
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
( cd "$WORD_PROJ" && "$BLUEPRINT_BIN" a2bp "$CARRIER" ) >"$WORK/out" 2>&1
rc=$?
if [ "$rc" -ne 0 ]; then
  fail "#7 a2bp rejected a one-word-named project's generic prose (exit $rc) — F1 came back as a false BLOCK; see $WORK/out"
elif grep -q '{{PROJECT_NAME}}' "$FAKE_BP/$CARRIER"; then
  fail "#7 CORRUPTION: the word 'blueprint' in generic prose was rewritten to {{PROJECT_NAME}} — this is Codex F1, the global-sed inverse"
elif ! grep -q 'The blueprint documentation explains blueprint sync.' "$FAKE_BP/$CARRIER"; then
  fail "#7 the unchanged prose line did not survive intact: $(cat "$FAKE_BP/$CARRIER")"
elif ! grep -q 'A new generic line' "$FAKE_BP/$CARRIER"; then
  fail "#7 the newly added generic line was not copied"
else
  pass "#7 a one-word project name does not corrupt prose, and does not false-block it either (F1)"
fi

# ===========================================================================
# 8. F1 — an EDITED line carrying the project name must block, not be guessed.
#    Provenance only exists for lines that match the blueprint's copy. For
#    anything the operator changed, the tool must refuse rather than assume.
# ===========================================================================
setup
printf '# Mocks\nState lives under the {{PROJECT_NAME}} home.\n' > "$FAKE_BP/$CARRIER"
printf '# Mocks\nState lives under the acme-flow home, newly reworded.\n' > "$PROJ/$CARRIER"
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -eq 0 ]; then
  fail "#8 an edited line still carrying the literal project name was copied — the tool guessed instead of failing closed"
elif grep -q 'acme-flow' "$FAKE_BP/$CARRIER"; then
  fail "#8 blueprint copy was modified despite the block — the project name reached the blueprint"
elif ! grep -q '{{PROJECT_NAME}}' "$FAKE_BP/$CARRIER"; then
  fail "#8 the blueprint's original placeholder line was lost"
else
  pass "#8 an edited line carrying the project name blocks for explicit operator resolution (F1)"
fi

# ===========================================================================
# 9. F1 — a project name containing regex metacharacters must be safe.
#    The old code interpolated the name straight into a sed pattern, so a
#    legal directory name like `acme.flow` matched `acmeXflow` too.
# ===========================================================================
RX_PROJ="$WORK/acme.flow"
mkdir -p "$RX_PROJ/docs/mocks"
printf '# Mocks\nGeneric line mentioning acmeXflow which is unrelated.\n' > "$FAKE_BP/$CARRIER"
printf '# Mocks\nGeneric line mentioning acmeXflow which is unrelated.\n' > "$RX_PROJ/$CARRIER"
cat >"$RX_PROJ/.blueprint-source" <<EOF
blueprint_source = $FAKE_BP
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
( cd "$RX_PROJ" && "$BLUEPRINT_BIN" a2bp "$CARRIER" ) >"$WORK/out" 2>&1
rc=$?
if grep -q '{{PROJECT_NAME}}' "$FAKE_BP/$CARRIER"; then
  fail "#9 'acmeXflow' was treated as a match for project 'acme.flow' — the name is being compiled as a regex"
elif [ "$rc" -ne 0 ] && grep -q 'acmeXflow' "$WORK/out"; then
  fail "#9 unrelated text 'acmeXflow' was reported as the project name — unescaped regex metacharacter"
else
  pass "#9 a project name with regex metacharacters is treated as data, not a pattern (F1)"
fi

# ===========================================================================
# 10. F2 — the Markdown/prose exception must work through the REAL a2bp path.
#     It keyed off the extension of the scanned file, but a2bp scans an
#     extensionless mktemp staging copy — so `is_prose` was always false in
#     production while the unit tests, calling the helper directly with a real
#     .md path, stayed green. That gap is exactly why this case drives the CLI.
# ===========================================================================
setup
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Dispatcher output lands in `~/.{{PROJECT_NAME}}/codex-runs.log` by convention.
EOF
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#10 legitimate Markdown documenting ~/.{{PROJECT_NAME}} was BLOCKED — the prose exception is dead in the real a2bp path (Codex F2); see $WORK/out"
elif bp_untouched; then
  fail "#10 the Markdown file was not copied"
else
  pass "#10 the prose exception survives the staged-temp-file path (F2)"
fi

# ===========================================================================
# 11. F2 — the same string in a SCRIPT must still block. The prose exception
#     must be an extension rule, not a blanket hole.
# ===========================================================================
setup
mkdir -p "$PROJ/scripts" "$FAKE_BP/scripts"
printf 'SENTINEL\n' > "$FAKE_BP/scripts/log-activity.sh"
printf '#!/bin/sh\nstate_dir="$HOME/.{{PROJECT_NAME}}"\n' > "$PROJ/scripts/log-activity.sh"
rc=$(run_a2bp scripts/log-activity.sh)
if [ "$rc" -eq 0 ]; then
  fail "#11 a SCRIPT hardcoding \$HOME/.{{PROJECT_NAME}} was copied — that is the A-09 defect, and the prose exception has become a blanket hole"
else
  pass "#11 the prose exception is extension-scoped; a script hardcoding the literal path still blocks (F2)"
fi

# ===========================================================================
# 12. F3 — multi-file partial failure: the clean file copies, the dirty one is
#     refused, and the overall exit code still reports the refusal.
# ===========================================================================
setup
mkdir -p "$PROJ/docs/config" "$FAKE_BP/docs/config"
printf 'SENTINEL2\n' > "$FAKE_BP/docs/config/README.md"
printf '# Mocks\nPerfectly generic guidance.\n' > "$PROJ/$CARRIER"
printf '# Config\nSee /home/someuser/notes for details.\n' > "$PROJ/docs/config/README.md"
rc=$(run_a2bp "$CARRIER" docs/config/README.md)
if bp_untouched; then
  fail "#12 the CLEAN file was not copied — one bad file aborted the whole run"
elif ! grep -q '^SENTINEL2' "$FAKE_BP/docs/config/README.md"; then
  fail "#12 the CONTAMINATED file was copied"
elif [ "$rc" -eq 0 ]; then
  fail "#12 partial run exited 0 — an agent reading only the exit code would never see the refusal"
else
  pass "#12 partial multi-file run: clean copies, dirty refused, exit code reports it (F3)"
fi

# ===========================================================================
# 13. F3 — suppression must be per-line for multi-digit line numbers. A naive
#     substring test would let line 1's marker suppress line 11.
# ===========================================================================
setup
{
  echo "# Mocks"
  echo "Line 2 mentions /home/someuser/one — a2bp-allow: deliberate fixture line"
  for i in 3 4 5 6 7 8 9 10; do echo "filler line $i"; done
  echo "Line 11 mentions /home/someuser/two with no marker at all"
} > "$PROJ/$CARRIER"
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -eq 0 ]; then
  fail "#13 line 11 was suppressed by line 2's marker — the suppression set is matching substrings, not whole line numbers"
elif ! grep -q 'someuser/two' "$WORK/out"; then
  fail "#13 the unsuppressed line 11 finding was not reported"
elif grep -q 'someuser/one' "$WORK/out"; then
  fail "#13 the a2bp-allow marker on line 2 did not suppress its finding"
else
  pass "#13 suppression is exact per line number, including multi-digit (F3)"
fi

# ===========================================================================
# 14. F3 — a bare a2bp-allow with no justification must NOT suppress.
#     CLAUDE.md §Security requires suppressions to carry a reason; an
#     unenforced requirement is a comment, not a rule.
# ===========================================================================
setup
printf '# Mocks\nSee /home/someuser/x  a2bp-allow:\n' > "$PROJ/$CARRIER"
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -eq 0 ]; then
  fail "#14 a bare 'a2bp-allow:' with no justification suppressed the finding — the justification requirement is not enforced"
else
  pass "#14 a suppression without a justification does not suppress (F3)"
fi

# ===========================================================================
# 15. F3 — a file with no final newline must round-trip byte-exactly.
#     The reversal streams line by line; a naive `printf '%s\n'` per line
#     would silently append a newline the operator never wrote.
# ===========================================================================
setup
printf '# Mocks\nNo trailing newline here.' > "$PROJ/$CARRIER"
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#15 a2bp exited $rc on a file with no final newline"
elif ! diff -q "$PROJ/$CARRIER" "$FAKE_BP/$CARRIER" >/dev/null 2>&1; then
  fail "#15 file with no final newline was not copied byte-exactly: $(diff "$PROJ/$CARRIER" "$FAKE_BP/$CARRIER" | head -5)"
else
  pass "#15 a file with no final newline round-trips byte-exactly (F3)"
fi

# ===========================================================================
# 16. R2-F1 (Codex round 2) — OCCURRENCE collision must not corrupt a literal.
#     The round-1 fix keyed a map on line CONTENT: substituted-form → upstream
#     line. When the blueprint holds BOTH a `{{PROJECT_NAME}}` line and a
#     literal `acme-flow` line that render to the same bytes, the placeholder
#     line owned the key and EVERY matching project line was rewritten —
#     including the legitimate literal that never came from a placeholder.
#     Positional alignment is what fixes it; this pins that the second
#     occurrence keeps its literal text.
# ===========================================================================
setup
cat >"$FAKE_BP/$CARRIER" <<'EOF'
{{PROJECT_NAME}}
acme-flow
EOF
cat >"$PROJ/$CARRIER" <<'EOF'
acme-flow
acme-flow
EOF
rc=$(run_a2bp "$CARRIER")
got=$(cat "$FAKE_BP/$CARRIER")
want=$(printf '{{PROJECT_NAME}}\nacme-flow\n')
if [ "$got" = "$(printf '{{PROJECT_NAME}}\n{{PROJECT_NAME}}')" ]; then
  fail "#16 CORRUPTION: the literal second occurrence was rewritten to {{PROJECT_NAME}} — provenance is keyed on content, not position (Codex R2-F1)"
elif [ "$got" != "$want" ]; then
  fail "#16 unexpected staged result (exit $rc):$(printf '\n%s' "$got")"
else
  pass "#16 colliding forward forms keep their occurrence identity (R2-F1)"
fi

# ===========================================================================
# 17. R2-F2 — a RELOCATED/duplicated risky line is a NEW occurrence and must
#     face every check. A content-keyed exemption would wave it through just
#     because those bytes appear upstream once — and relocation can turn
#     quoted prose into an operative path.
# ===========================================================================
setup
cat >"$FAKE_BP/$CARRIER" <<'EOF'
# Mocks
Historical note: the old tool wrote to /home/someuser/state.
EOF
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Historical note: the old tool wrote to /home/someuser/state.
Historical note: the old tool wrote to /home/someuser/state.
EOF
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -eq 0 ]; then
  fail "#17 a duplicated host-path line was copied — the exemption is a content set, so a NEW occurrence inherited the old one's pass (Codex R2-F2)"
elif [ "$(grep -c 'someuser' "$FAKE_BP/$CARRIER")" -ne 1 ]; then
  fail "#17 blueprint copy was modified despite the block"
else
  pass "#17 a relocated/duplicated risky line is judged as newly introduced (R2-F2)"
fi

# ===========================================================================
# 18. R2-F2, other half — the untouched upstream occurrence must STILL be
#     exempt. The fix must not become "block everything that was always there".
# ===========================================================================
setup
cat >"$FAKE_BP/$CARRIER" <<'EOF'
# Mocks
Historical note: the old tool wrote to /home/someuser/state.
EOF
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Historical note: the old tool wrote to /home/someuser/state.
A newly added, perfectly generic line.
EOF
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#18 an untouched pre-existing upstream line was blocked (exit $rc) — the guard must police what the copy INTRODUCES; see $WORK/out"
elif ! grep -q 'newly added' "$FAKE_BP/$CARRIER"; then
  fail "#18 the new generic line was not copied"
else
  pass "#18 an unchanged upstream occurrence stays exempt (R2-F2)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: a2bp reverse-substitutes and refuses to launder project specifics."
  exit 0
fi
echo "FAILED: a2bp contamination guard (A-07) is not holding."
exit 1
