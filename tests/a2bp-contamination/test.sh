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

# BUG-014 — never inherit git's repo pointers. Git exports GIT_DIR to every hook,
# the pre-push gate runs this suite, and the fixtures below use `git init` inside
# a `cd`ed subshell. With GIT_DIR set, `cd` protects nothing: the fixture's
# commits and config writes land in the REAL repository. This suite must be safe
# run from anywhere, so it strips them itself rather than trusting its caller.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY


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

# BUG-011 — a `gh` shim, so a2bp can reach a REAL "filed" state in this fixture.
#
# The remote here is a local bare repo, so `gh pr create` against it is
# impossible by construction. That used to be invisible: the pr-create failure
# branch returned 3, this suite maps 3 to 0 ("filed"), and 27 cases silently
# read "the PR step failed" as "the request was filed" — the very defect
# BUG-011 describes, fooling the test suite that was supposed to guard this path.
#
# Now that a failed pr-create correctly returns 5, the fixture has to supply a
# gh that can succeed. Shimming it is also more honest: these cases ask "did the
# contamination guard let this content through?", and that question should not
# depend on whether GitHub is reachable from the test host.
GH_SHIM="$(mktemp -d)"
cat >"$GH_SHIM/gh" <<'SH'
#!/bin/sh
case "$1 $2" in
  "pr list")   exit 0 ;;                                   # no existing PR
  # A REALISTIC PR URL. Real `gh pr create` prints .../<owner>/<repo>/pull/<n>,
  # and a2bp now requires that shape before it will report a request as
  # filed (Codex R2-F1: a zero exit with unusable output is not evidence).
  # The old fake, ".../pr/1", was not a URL gh would ever emit.
  "pr create") echo "https://example.invalid/acme/blueprint/pull/1"; exit 0 ;;
esac
exit 0
SH
chmod +x "$GH_SHIM/gh"
trap 'rm -rf "$WORK"' EXIT INT TERM

# The project directory's BASENAME is the project name the CLI derives, so it
# has to be a real name rather than mktemp's random one.
PROJ="$WORK/acme-flow"
FAKE_BP="$WORK/blueprint"
FAKE_REMOTE="$WORK/blueprint-remote.git"

# Build a project + a stand-in blueprint, now with the remote a2bp files
# against.
#
# a2bp used to `cp` into $BLUEPRINT_ROOT/$f, so "what did a2bp produce?" was
# simply "read that file". It now pushes a request branch to a remote and never
# writes into the blueprint at all, so the same question is answered by reading
# the pushed branch — and "the blueprint is untouched" became an assertion worth
# making rather than a precondition. The guard's behaviour is unchanged; only
# where its output lands has moved, which is why every case below still reads
# the same.
setup() {
  rm -rf "$PROJ"
  mkdir -p "$PROJ/$(dirname "$CARRIER")" "$FAKE_BP/$(dirname "$CARRIER")"

  # The git repositories are created ONCE and then reused. Re-initialising them
  # per case cost ~0.35s each across ~15 calls and took this suite from 2.3s to
  # 6.0s — a third of the whole 30s pre-push budget, spent re-creating fixtures
  # that only ever needed their contents reset. What each case actually needs is
  # a clean project, a known blueprint file, and no leftover request branches.
  if [ ! -d "$FAKE_REMOTE" ]; then
    git init -q --bare -b main "$FAKE_REMOTE"
    (
      cd "$FAKE_BP"
      git init -q -b main .
      git config user.email t@local
      git config user.name t
      git remote add origin "$FAKE_REMOTE"
      # BUG-029 — `tests/` is a managed DIRECTORY and expanding it to nothing is
      # a hard failure by design, so a stand-in blueprint has to ship suites for
      # `pull` to run against it at all (#24 drives a real pull). Committed once
      # here; the reset branch below only clears docs/ and scripts/.
      mkdir -p tests/fixture
      printf 'echo fixture\n' > tests/fixture/test.sh
      git add -A tests
      git -c commit.gpgsign=false commit -q -m "fixture suites"
    ) 2>/dev/null
  else
    # Drop request branches from previous cases so a stale one cannot be
    # mistaken for this case's output.
    git -C "$FAKE_REMOTE" for-each-ref --format='%(refname)' 'refs/heads/a2bp/**' \
      | while IFS= read -r r; do [ -n "$r" ] && git -C "$FAKE_REMOTE" update-ref -d "$r"; done
    rm -rf "${FAKE_BP:?}/docs" "${FAKE_BP:?}/scripts"
    mkdir -p "$FAKE_BP/$(dirname "$CARRIER")"
  fi
  printf 'SENTINEL — blueprint copy untouched\n' > "$FAKE_BP/$CARRIER"

  cat >"$PROJ/.blueprint-source" <<EOF
config_version   = 2
blueprint_source = $FAKE_BP
blueprint_remote = $FAKE_REMOTE
blueprint_branch = main
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
}

# `**`, not `*`: for-each-ref matches with WM_PATHNAME, so a single `*` does not
# cross '/' and would silently match nothing against a2bp/<project>/<digest>.
req_ref() {
  git -C "$FAKE_REMOTE" for-each-ref --format='%(refname:short)' 'refs/heads/a2bp/**' | head -1
}

# Run a2bp in DIR; capture combined output and exit code.
#
# Three things happen around the call, and they are what let all 27 cases below
# stay written the way they were:
#
#   BEFORE — whatever the case wrote into $FAKE_BP/$CARRIER is committed and
#   pushed as the base. Cases author the blueprint's side by writing that file,
#   and that is still how they express it; it just has to reach the remote now,
#   because the guard aligns against the FETCHED base rather than a local
#   checkout.
#
#   AFTER — main is checked. Nothing a2bp does may move the branch every project
#   pulls from. This used to be a precondition of the design ("it writes into
#   the blueprint, so make sure it wrote the right thing"); it is now the
#   headline invariant, so it is asserted on every single run rather than in the
#   cases that happened to think of it.
#
#   THEN — the request branch's content is materialised back into
#   $FAKE_BP/$CARRIER. After that file means "what this request PROPOSES the
#   blueprint should become", which is exactly what every assertion below was
#   already asking of it. A blocked run pushes no branch, so the SENTINEL
#   survives and the "blueprint copy untouched" checks keep working unchanged.
run_a2bp_in() {
  local dir="$1"; shift
  (
    cd "$FAKE_BP" || exit 1
    git add -A
    git -c commit.gpgsign=false commit -q -m base --allow-empty
    git push -q -f origin main
  ) 2>/dev/null

  local main_before refs_before
  main_before=$(git -C "$FAKE_REMOTE" rev-parse main)
  # Branches from earlier cases persist on the remote (not every case calls
  # setup). Materialising "the first a2bp/* branch" therefore replayed a STALE
  # request's content into $FAKE_BP and made unrelated cases fail on a diff they
  # never produced. Only a branch this run created counts.
  refs_before=$(git -C "$FAKE_REMOTE" for-each-ref --format='%(refname)' 'refs/heads/a2bp/**' | LC_ALL=C sort)

  ( cd "$dir" && PATH="$GH_SHIM:$PATH" "$BLUEPRINT_BIN" a2bp "$@" ) >"$WORK/out" 2>&1
  local rc=$?
  # a2bp returns 3 (decision-pending) when a request IS filed — non-zero on
  # purpose, so no script can read "filed" as "landed". Every case here asks a
  # different question: did the contamination guard let this content through?
  # Mapping the filed status onto 0 keeps each case expressing that question
  # instead of restating a2bp's status table 27 times.
  [ "$rc" -eq 3 ] && rc=0

  if [ "$(git -C "$FAKE_REMOTE" rev-parse main)" != "$main_before" ]; then
    fail "a2bp MOVED THE BLUEPRINT'S MAIN BRANCH — a request must never land"
  fi

  local refs_after new_ref
  refs_after=$(git -C "$FAKE_REMOTE" for-each-ref --format='%(refname)' 'refs/heads/a2bp/**' | LC_ALL=C sort)
  new_ref=$(comm -13 <(printf '%s\n' "$refs_before") <(printf '%s\n' "$refs_after") | head -1)

  if [ -n "$new_ref" ]; then
    # Materialise EVERY path the request proposes, not just $CARRIER — some
    # cases file other files (scripts/new-project.sh) and would otherwise assert
    # against a copy that was never updated.
    local p
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      mkdir -p "$FAKE_BP/$(dirname "$p")"
      git -C "$FAKE_REMOTE" show "$new_ref:$p" > "$FAKE_BP/$p" 2>/dev/null || true
    done < <(git -C "$FAKE_REMOTE" diff --name-only main "$new_ref" 2>/dev/null)
  fi
  echo $rc
}

run_a2bp() { run_a2bp_in "$PROJ" "$@"; }

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
# The last line is load-bearing. Reverse-substitution with NO other change
# produces content byte-identical to the base — which is a no-op request, and
# a2bp now correctly refuses to file one. Without a genuine change alongside,
# no branch is pushed and the restored bytes are unobservable, so this case
# would assert nothing at all.
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Generic guidance for the acme-flow project.
Environment override: ACME_FLOW_HOME
A genuinely new generic line.
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
# 5. --force IS GONE, and its removal is refused loudly rather than ignored.
#
#    THIS EXPECTATION IS INVERTED, deliberately. --force existed to waive the
#    guard and copy anyway, which was a coherent thing to want while a2bp landed
#    bytes in the blueprint: detection is heuristic, so an override had to exist
#    or a false positive would block real work permanently.
#
#    A request is read by a person before anything lands, so there is nothing
#    left for a waiver to buy — the reviewer IS the override. A finding now has
#    exactly two answers: fix it, or mark the line with a justified
#    `a2bp-allow: <why>`. If the guard is wrong, that is a bug in
#    contamination.sh and gets fixed as one.
#
#    Silently ignoring the flag would be the worst outcome: an operator who
#    passes --force believes the guard was waived, and would read a block as a
#    tool malfunction.
# ===========================================================================
setup
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Run the tool from /home/someuser/sources/thing before review.
EOF
rc=$(run_a2bp --force "$CARRIER")
if [ "$rc" -eq 0 ]; then
  fail "#5 --force still waived the guard and filed the request"
elif grep -q 'reject.*--force' "$WORK/out"; then
  fail "#5 --force was parsed as a FILENAME rather than refused as a flag"
elif ! grep -q 'a2bp-allow' "$WORK/out"; then
  fail "#5 --force was refused without naming the sanctioned alternative: $(head -3 "$WORK/out")"
elif ! bp_untouched; then
  fail "#5 --force still reached the blueprint"
else
  pass "#5 --force is refused, naming a2bp-allow as the way through (the reviewer is the override now)"
fi

# ===========================================================================
# 6. Files that implement the substitution must NOT be reverse-substituted.
#    scripts/blueprint and scripts/new-project.sh carry the placeholder tokens
#    as code; the CLI already exempts them on the pull side via
#    _should_substitute. The a2bp side must honour the SAME exemption, or
#    back-propagating the CLI corrupts the CLI.
#
#    The only observable proof that reverse-substitution was skipped is the
#    project name surviving verbatim — and the scan (correctly) blocks on exactly
#    that. This used to be isolated with --force; with --force gone, the
#    isolation comes from the SANCTIONED escape, a justified `a2bp-allow` on the
#    one line that carries the name. That is now the only way through a finding,
#    so exercising it here proves the mechanism as well as the exemption.
#    Compare with #1, where the same input on a NON-exempt file comes out as
#    {{PROJECT_NAME}}: that differential is the whole assertion.
# ===========================================================================
setup
mkdir -p "$PROJ/scripts" "$FAKE_BP/scripts"
printf 'SENTINEL\n' > "$FAKE_BP/scripts/new-project.sh"
cat >"$PROJ/scripts/new-project.sh" <<'EOF'
#!/bin/bash
# Bootstrap. Mentions acme-flow only as example text.  a2bp-allow: example text in a comment, not a path
sed -e "s/{{PROJECT_NAME}}/${proj}/g" "$f"
EOF
rc=$(run_a2bp scripts/new-project.sh)
if grep -q '^SENTINEL' "$FAKE_BP/scripts/new-project.sh"; then
  fail "#6 scripts/new-project.sh was not filed (exit $rc) — see $WORK/out"
elif ! grep -q 'acme-flow' "$FAKE_BP/scripts/new-project.sh"; then
  fail "#6 scripts/new-project.sh WAS reverse-substituted — the pull-side _should_substitute exemption is not mirrored on the a2bp side; back-propagating the CLI would corrupt it"
elif ! grep -q '{{PROJECT_NAME}}' "$FAKE_BP/scripts/new-project.sh"; then
  fail "#6 the file's own {{PROJECT_NAME}} code token was mangled"
else
  pass "#6 substitution-implementing files are exempt from reverse-substitution (matches _should_substitute on the pull side)"
fi

# ===========================================================================
# 7. F1 (Codex four-eyes) — a one-word project name must not CORRUPT prose.
#    The first implementation ran a global `sed s/${proj_name}/{{PROJECT_NAME}}/g`
#    and called it "the exact inverse". For a project legitimately named
#    `blueprint`, every occurrence of the word "blueprint" in generic prose was
#    silently rewritten — and copied through with no finding at all. Silent
#    corruption is the defect; that is what this case exists to pin.
#
#    IT ALSO USED TO CLAIM the line was not false-blocked, and that half was
#    passing vacuously. $WORD_PROJ was $WORK/blueprint, which is also $FAKE_BP —
#    the project and the stand-in blueprint were the SAME DIRECTORY, so the
#    second write clobbered the first, a2bp saw identical files, exited early as
#    "same", and never ran the guard at all. The assertion then inspected the
#    project's own file and found what the project had written.
#
#    Separated, the real behaviour appears: the line DOES block. A-07 R4-F2
#    deliberately removed the alignment-derived exemption, because that was the
#    one path by which a misattributed line could wave contamination through —
#    so every staged line is scanned, including lines identical to the base.
#    For a project whose name is a common word, generic prose containing that
#    word therefore blocks and needs an explicit `a2bp-allow`. That is a real
#    ergonomic cost of the R4-F2 decision, now visible instead of hidden.
#
#    So this case pins both halves as they actually are: it BLOCKS rather than
#    corrupting, and under --force the prose survives verbatim.
# ===========================================================================
setup
mkdir -p "$WORK/w"
WORD_PROJ="$WORK/w/blueprint"
rm -rf "$WORD_PROJ"
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
config_version   = 2
blueprint_source = $FAKE_BP
blueprint_remote = $FAKE_REMOTE
blueprint_branch = main
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
rc=$(run_a2bp_in "$WORD_PROJ" "$CARRIER")
if [ "$rc" -eq 0 ]; then
  fail "#7 expected a BLOCK for a project named after a common word; a2bp filed the request instead"
elif ! grep -q 'project name survived reverse-substitution' "$WORK/out"; then
  fail "#7 blocked, but not for the name-collision reason: $(head -5 "$WORK/out")"
elif grep -q 'A new generic line' "$FAKE_BP/$CARRIER"; then
  # bp_untouched looks for the SENTINEL, which this case deliberately replaced
  # with prose — so the leak has to be detected by the request's own new line
  # arriving, not by the sentinel's absence.
  fail "#7 the blocked content reached the blueprint anyway"
else
  pass "#7 a common-word project name blocks its own generic prose, naming the line (R4-F2's cost, made visible)"
fi

# --- 7b. THE HALF THAT MATTERS: no silent corruption. -----------------------
# With the collision marked as benign — the sanctioned escape, and the only one
# now that --force is gone — the request is filed and the staged bytes become
# observable. The prose must be verbatim. A global-sed inverse would have
# rewritten every "blueprint" to {{PROJECT_NAME}} here and shipped it with no
# finding at all, which is the F1 defect. Blocking is an inconvenience; this
# would be corruption.
cat >"$WORD_PROJ/$CARRIER" <<'EOF'
# Mocks
The blueprint documentation explains blueprint sync.  <!-- a2bp-allow: generic prose; the project is merely named after the word -->
A new generic line about mockups.
EOF
rc=$(run_a2bp_in "$WORD_PROJ" "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#7b a marked benign collision did not file (exit $rc) — see $WORK/out"
elif grep -q '{{PROJECT_NAME}}' "$FAKE_BP/$CARRIER"; then
  fail "#7b CORRUPTION: the word 'blueprint' in generic prose was rewritten to {{PROJECT_NAME}} — this is Codex F1, the global-sed inverse"
elif ! grep -q 'The blueprint documentation explains blueprint sync.' "$FAKE_BP/$CARRIER"; then
  fail "#7b the unchanged prose line did not survive intact: $(cat "$FAKE_BP/$CARRIER")"
elif ! grep -q 'A new generic line' "$FAKE_BP/$CARRIER"; then
  fail "#7b the newly added generic line was not filed"
else
  pass "#7b a marked benign collision files with the prose verbatim — no global-sed corruption (F1)"
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
config_version   = 2
blueprint_source = $FAKE_BP
blueprint_remote = $FAKE_REMOTE
blueprint_branch = main
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
rc=$(run_a2bp_in "$RX_PROJ" "$CARRIER")
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
# 12. F3 — multi-file with one contaminated file: NOTHING is filed.
#
#     THIS EXPECTATION IS INVERTED FROM WHAT IT USED TO BE, deliberately. While
#     a2bp copied into a working tree, letting the clean file through and
#     refusing the dirty one was strictly better than refusing both — the
#     operator kept half the work and the blueprint stayed clean.
#
#     A request is not a copy. It is filed as ONE unit, under one branch, with
#     one PR title naming what the operator asked for. Filing the clean subset
#     would file something they did not ask for, described by a title that says
#     they did, and a reviewer would have no way to see what was dropped. So the
#     whole request is refused and nothing is pushed.
#
#     What survives unchanged is the part that always mattered: the contaminated
#     file never reaches the blueprint, and the exit code reports the refusal.
# ===========================================================================
setup
mkdir -p "$PROJ/docs/config" "$FAKE_BP/docs/config"
printf 'SENTINEL2\n' > "$FAKE_BP/docs/config/README.md"
printf '# Mocks\nPerfectly generic guidance.\n' > "$PROJ/$CARRIER"
printf '# Config\nSee /home/someuser/notes for details.\n' > "$PROJ/docs/config/README.md"
rc=$(run_a2bp "$CARRIER" docs/config/README.md)
if [ "$rc" -eq 0 ]; then
  fail "#12 a request containing a contaminated file was FILED — an agent reading only the exit code would never see the refusal"
elif ! grep -q '^SENTINEL2' "$FAKE_BP/docs/config/README.md"; then
  fail "#12 the CONTAMINATED file reached the blueprint"
elif ! bp_untouched; then
  fail "#12 the clean file was filed anyway — a partial request is a DIFFERENT request, filed under a title claiming otherwise"
elif ! grep -q 'someuser/notes' "$WORK/out"; then
  fail "#12 the finding that caused the refusal was not reported"
else
  pass "#12 one contaminated file refuses the WHOLE request; nothing is filed (F3)"
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
# CONTRACT CHANGE at R4. There is no longer an alignment-derived exemption:
# every staged line is scanned. Codex R4-F2 showed that an exemption list is
# the one place a misattributed alignment can actually leak — a relocated
# risky line inherits the pass of the line it aligned to. So the exemption is
# gone, and the cost is exactly this case: an upstream line that would itself
# trip a check now blocks even when untouched.
#
# That is the safe direction (a false BLOCK, never a false PASS) and it is
# overridable per line. It also barely arises in practice: the host-path
# pattern scores zero hits across all 48 managed files, and the two real
# in-tree cases carry a2bp-allow markers.
if [ "$rc" -eq 0 ]; then
  fail "#18 an upstream host-path line passed unchecked — the alignment is still granting scan exemptions, which is the R4-F2 leak path"
elif ! grep -q 'a2bp-allow' "$WORK/out" && ! grep -q 'someuser' "$WORK/out"; then
  fail "#18 blocked, but the output does not name the offending line or the way out"
else
  pass "#18 with no exemption list, even an untouched upstream risky line is scanned (R4-F2)"
fi

# ===========================================================================
# 18b. The other half: an untouched upstream line that is CLEAN must still
#      copy. Removing the exemption must not turn into "block everything".
# ===========================================================================
setup
cat >"$FAKE_BP/$CARRIER" <<'EOF'
# Mocks
Perfectly ordinary upstream guidance.
EOF
cat >"$PROJ/$CARRIER" <<'EOF'
# Mocks
Perfectly ordinary upstream guidance.
A newly added, perfectly generic line.
EOF
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#18b a clean edit to a clean file was blocked (exit $rc) — see $WORK/out"
elif ! grep -q 'newly added' "$FAKE_BP/$CARRIER"; then
  fail "#18b the new generic line was not copied"
else
  pass "#18b ordinary edits to clean files still back-propagate"
fi

# ===========================================================================
# 19. R3-F1 (Codex round 3) — an LCS match is not edit history.
#     Insert a literal `acme-flow` where the old placeholder line was, AND
#     edit the original placeholder line. `diff` aligns the INSERTED literal
#     with the upstream placeholder, so the round-2 code rewrote it to
#     {{PROJECT_NAME}} and exempted it from scanning — both from a tie-break,
#     not from evidence. The guard must refuse the ambiguity instead.
# ===========================================================================
setup
cat >"$FAKE_BP/$CARRIER" <<'EOF'
HEAD
{{PROJECT_NAME}}
TAIL
EOF
cat >"$PROJ/$CARRIER" <<'EOF'
HEAD
acme-flow
edited-placeholder
TAIL
EOF
rc=$(run_a2bp "$CARRIER")
# CONTRACT, narrowly. Codex proved across R1–R4 that no content-derived
# matching recovers edit history, so the alignment WILL sometimes misattribute
# and this fixture is one of those layouts. What is asserted here is the
# narrow invariant Codex agreed this case can legitimately evidence (R5-F2):
#
#   ON THE DEFAULT PATH, the literal project basename does not land upstream.
#
# It is NOT evidence for any broader "no project-specific bytes ever" claim —
# `a2bp-allow` and the NOTICE class both deliberately let things through, and
# case #6 files a host-path-free but name-bearing file through a marked line.
# Reframing this case as proof of the wider contract would have been dishonest;
# scoped to the default path it is sound.
#
# (`--force` used to be the third and widest of those escapes. It is gone —
# §2.2 of the plan: a request is reviewed by a person, so there is nothing for a
# waiver to buy. The narrow claim above is unaffected either way.)
#
# A misattribution here writes {{PROJECT_NAME}} where the operator typed a
# literal `acme-flow`, which is the correct generic content for a blueprint
# file — a literal project name there would BE the contamination.
if grep -q 'acme-flow' "$FAKE_BP/$CARRIER"; then
  fail "#19 the literal project name reached the blueprint — this is the leak the whole guard exists to stop (Codex R3-F1)"
elif grep -q 'edited-placeholder' "$FAKE_BP/$CARRIER"; then
  pass "#19 ambiguous layout copies generic content only; the literal never lands (R3-F1)"
elif [ "$rc" -ne 0 ]; then
  pass "#19 ambiguous layout was refused outright (also acceptable — fails safe)"
else
  fail "#19 nothing was copied yet a2bp exited 0"
fi

# ===========================================================================
# 20. R3-F2 — a file whose FINAL line is incomplete must still align.
#     `%L` preserves the missing newline, so the last record was unterminated
#     and `while read` never saw it: the counters desynchronised and the line
#     was silently left unaligned. Case #15 only proved byte preservation of
#     an unchanged line; this proves restoration on an incomplete final line.
# ===========================================================================
setup
# A preceding line that genuinely CHANGES, so this is a real request rather than
# a no-op — restoration alone produces content identical to the base, which a2bp
# now refuses to file, leaving nothing to inspect. The property under test is
# unaffected: the last line is still incomplete and still carries the name.
printf 'first line\n{{PROJECT_NAME}}' > "$FAKE_BP/$CARRIER"
printf 'first line, edited\nacme-flow'  > "$PROJ/$CARRIER"
rc=$(run_a2bp "$CARRIER")
if [ "$rc" -ne 0 ]; then
  fail "#20 an incomplete final line blocked (exit $rc) — the record protocol is inheriting the input's line endings (Codex R3-F2); see $WORK/out"
elif [ "$(tail -1 "$FAKE_BP/$CARRIER")" != '{{PROJECT_NAME}}' ]; then
  fail "#20 the placeholder was not restored on an incomplete final line: '$(cat "$FAKE_BP/$CARRIER")'"
elif [ "$(tail -c1 "$FAKE_BP/$CARRIER" | wc -l)" -ne 0 ]; then
  fail "#20 a trailing newline was added that the operator never wrote"
else
  pass "#20 an incomplete final line aligns, restores, and stays incomplete (R3-F2)"
fi

# ===========================================================================
# 21. R3-F3 — if `diff` cannot do the alignment, FAIL CLOSED.
#     The GNU --*-line-format switches are extensions. Swallowing an error into
#     an empty alignment reads as "nothing is attributable", and wholly
#     unrestored project bytes then travel upstream.
#
#     This used to be driven with --force, to prove the failure was closed even
#     against the widest escape available. With --force gone the case is simpler
#     and no weaker: there is no longer any flag that could have opened it, and
#     the remaining escape (`a2bp-allow`) is per-line and cannot apply to a
#     staging step that never produced lines to mark.
# ===========================================================================
setup
printf '# Mocks\nGeneric guidance for the {{PROJECT_NAME}} project.\n' > "$FAKE_BP/$CARRIER"
printf '# Mocks\nGeneric guidance for the acme-flow project.\n' > "$PROJ/$CARRIER"
SHIMDIR="$WORK/shim"; mkdir -p "$SHIMDIR"
printf '#!/bin/sh\nexit 2\n' > "$SHIMDIR/diff"; chmod +x "$SHIMDIR/diff"
rc=$(PATH="$SHIMDIR:$PATH" run_a2bp "$CARRIER")
if grep -q 'acme-flow' "$FAKE_BP/$CARRIER"; then
  fail "#21 a broken 'diff' let UNRESTORED project bytes reach the blueprint (Codex R3-F3)"
elif [ "$rc" -eq 0 ]; then
  fail "#21 staging failure exited 0 — a tool that could not run must never read as a clean pass (BUG-003's rule)"
else
  pass "#21 a diff capability/runtime failure fails closed (R3-F3)"
fi

# ===========================================================================
# 22. R5-F1 (Codex round 5) — ONE substitution semantics.
#     The round-trip check is the load-bearing safety property, and it used
#     bash ${//} to verify what pull's sed would later produce. Those differ
#     for legal directory names. Measured on this host:
#
#       name       bash ${//}           sed                  correct
#       foo\bar    foo\bar              foobar               foo\bar
#       a&b        a{{PROJECT_NAME}}b   a{{PROJECT_NAME}}b   a&b
#
#     `&` means "the whole match" in a sed replacement, and bash 5.2 gave it
#     the same meaning — so BOTH were wrong, differently. pull itself has been
#     mangling such names all along, independent of a2bp.
#
#     Drives the real CLI: a2bp must restore the placeholder, and the staged
#     bytes must round-trip through THE primitive back to the project's file.
# ===========================================================================
#     THE SET IS SPLIT, and the split is a real constraint the request flow
#     introduces rather than a test convenience. The branch name carries the
#     project name so a reviewer can see whose request it is, and the plan
#     forbids slugging it into something valid — a slug that differs from the
#     real name destroys exactly the provenance the ref exists to carry. So a
#     project whose basename cannot be a git ref component can file no request
#     at all. `foo\bar` and `x*y` are legal directory names and legal project
#     names for pull, and are NOT legal refs. They must be refused explicitly,
#     naming the reason — which is #22b. Only ref-legal names can round-trip.
for META in 'a&b' 'p.q'; do
  MP="$WORK/$META"
  rm -rf "$MP"
  mkdir -p "$MP/docs/mocks" "$FAKE_BP/docs/mocks"
  printf '# Mocks\nName={{PROJECT_NAME}}\n' > "$FAKE_BP/$CARRIER"
  # The added line is load-bearing. With ONLY the name line, restoring the
  # placeholder makes the staged content byte-identical to the base, a2bp
  # correctly reports "nothing to request", and no branch is pushed — leaving
  # the staged bytes unobservable and this case asserting nothing. A genuine
  # change alongside keeps the restoration visible in a real request.
  printf '# Mocks\nName=%s\nA new generic line.\n' "$META" > "$MP/$CARRIER"
  cat >"$MP/.blueprint-source" <<EOF
config_version   = 2
blueprint_source = $FAKE_BP
blueprint_remote = $FAKE_REMOTE
blueprint_branch = main
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
  rc=$(run_a2bp_in "$MP" "$CARRIER")
  if [ "$rc" -ne 0 ]; then
    fail "#22[$META] a2bp exited $rc for a legal basename containing a substitution metacharacter — see $WORK/out"
  elif grep -qF "$META" "$FAKE_BP/$CARRIER"; then
    fail "#22[$META] the literal project name reached the blueprint — the placeholder was not restored"
  elif ! grep -q '{{PROJECT_NAME}}' "$FAKE_BP/$CARRIER"; then
    fail "#22[$META] placeholder not restored: $(cat "$FAKE_BP/$CARRIER")"
  else
    pass "#22[$META] a ref-legal metacharacter name round-trips through one substitution semantics (R5-F1)"
  fi
done

# --- 22b. A name that cannot be a ref refuses EXPLICITLY. -------------------
# The failure mode being excluded is silence: mangling the name into something
# ref-legal, or failing with a raw git error that names neither the project nor
# the reason. Either would leave the operator guessing why their project alone
# cannot file requests.
for META in 'foo\bar' 'x*y'; do
  MP="$WORK/nr-$RANDOM"
  rm -rf "$MP"; mkdir -p "$MP/$META/docs/mocks"
  printf '# Mocks\nName={{PROJECT_NAME}}\n' > "$FAKE_BP/$CARRIER"
  printf '# Mocks\nName=%s\nA new generic line.\n' "$META" > "$MP/$META/$CARRIER"
  cat >"$MP/$META/.blueprint-source" <<EOF
config_version   = 2
blueprint_source = $FAKE_BP
blueprint_remote = $FAKE_REMOTE
blueprint_branch = main
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
  rc=$(run_a2bp_in "$MP/$META" "$CARRIER")
  if [ "$rc" -eq 0 ]; then
    fail "#22b[$META] a project name that cannot be a ref component filed a request anyway — the name must have been mangled"
  elif ! grep -q "not a valid branch name" "$WORK/out"; then
    fail "#22b[$META] refused without naming the ref reason: $(head -3 "$WORK/out")"
  elif ! grep -qF "$META" "$WORK/out"; then
    fail "#22b[$META] the refusal does not name the project"
  else
    pass "#22b[$META] a name that cannot be a ref component is refused, naming both the name and the reason"
  fi
done

# ===========================================================================
# 23. R5-F1 — the primitive itself must be literal in both directions, and
#     pull must agree with it. This is the assertion that would have caught
#     the divergence: substituting a placeholder with a metacharacter name
#     must yield the name verbatim, not sed's or bash 5.2's interpretation.
# ===========================================================================
# shellcheck source=../../scripts/lib/placeholders.sh
. "$ROOT/scripts/lib/placeholders.sh"
for META in 'foo\bar' 'a&b' 'p.q' 'x*y'; do
  got=$(bp_substitute_line 'Name={{PROJECT_NAME}}' "$META" "$(bp_placeholder_upper "$META")")
  if [ "$got" != "Name=$META" ]; then
    fail "#23[$META] substitution is not literal: got '$got', want 'Name=$META'"
  else
    pass "#23[$META] the project name is substituted as literal data (R5-F1)"
  fi
done

# ===========================================================================
# 24. R5-F1, THE case that actually catches it — pull → a2bp must round-trip.
#     #22 drives a2bp alone, and on the parent commit a2bp used bash ${//} on
#     BOTH sides, so it agreed with itself and passed. The divergence Codex
#     found is between a2bp's verifier and PULL's sed, so the regression has
#     to cross that boundary: pull the file down into a project whose basename
#     carries a metacharacter, then push it straight back untouched. The
#     blueprint must be byte-identical afterwards.
#
#     On the parent, pull's sed writes `foobar` into the project while a2bp
#     expects `foo\bar` — the placeholder cannot be restored and the literal
#     is left behind.
# ===========================================================================
# Ref-legal names only, for the reason given at #22: a name that cannot be a
# ref component never reaches the round-trip, so testing one here would only
# re-assert #22b at the wrong layer. `a&b` still crosses the boundary this case
# exists for — pull's substitution against a2bp's verifier.
for META in 'a&b' 'p.q'; do
  RP="$WORK/rt-$$"
  rm -rf "$RP"
  mkdir -p "$RP"
  MP="$RP/$META"
  mkdir -p "$MP/docs/mocks" "$FAKE_BP/docs/mocks"
  printf '# Mocks\nName={{PROJECT_NAME}}\nUpper={{PROJECT_NAME_UPPER}}\n' > "$FAKE_BP/$CARRIER"
  cp "$FAKE_BP/$CARRIER" "$WORK/bp-original"
  cat >"$MP/.blueprint-source" <<EOF
config_version   = 2
blueprint_source = $FAKE_BP
blueprint_remote = $FAKE_REMOTE
blueprint_branch = main
bootstrap_sha    = test-fixture
bootstrap_date   = test-fixture
EOF
  ( cd "$MP" && "$BLUEPRINT_BIN" pull "$CARRIER" --yes ) >"$WORK/out" 2>&1
  if ! grep -qF "Name=$META" "$MP/$CARRIER" 2>/dev/null; then
    fail "#24[$META] pull did not substitute the name literally: $(sed -n '2p' "$MP/$CARRIER" 2>/dev/null)"
    continue
  fi
  # Under the request flow, agreement between pull and a2bp shows up as a
  # distinct, stronger signal than it used to: the round-trip is DETECTED as a
  # no-op and refused with "nothing to request" (6), instead of quietly filing a
  # request whose diff happens to be empty. Disagreement would show up as a
  # block (4) or as a filed request that changes the file — both caught below.
  rc=$(run_a2bp_in "$MP" "$CARRIER")
  if [ "$rc" -eq 4 ]; then
    fail "#24[$META] a2bp BLOCKED an untouched pull→a2bp round-trip — pull and the verifier disagree on this name (R5-F1); see $WORK/out"
  elif [ "$rc" -ne 6 ]; then
    fail "#24[$META] expected 'nothing to request' (6) for an untouched round-trip, got $rc; see $WORK/out"
  elif ! diff -q "$WORK/bp-original" "$FAKE_BP/$CARRIER" >/dev/null 2>&1; then
    fail "#24[$META] pull→a2bp was not a no-op: $(diff "$WORK/bp-original" "$FAKE_BP/$CARRIER" | head -4)"
  else
    pass "#24[$META] pull→a2bp round-trips byte-identically and is recognised as a no-op (R5-F1)"
  fi
done

# ===========================================================================
# 25. R6-F1 (Codex round 6) — the two tokens must be resolved in ONE pass.
#     Replacing UPPER and then feeding the result to the lowercase pass is a
#     pipeline, and a pipeline re-scans its own output: for a project named
#     `x{{PROJECT_NAME}}y` the bytes emitted by the first pass were
#     re-interpreted by the second, giving Xx{{PROJECT_NAME}}yY instead of
#     X{{PROJECT_NAME}}Y — contradicting the library's own claim that
#     replacement data is never re-scanned.
# ===========================================================================
TOKNAME='x{{PROJECT_NAME}}y'
got=$(bp_substitute_line '{{PROJECT_NAME_UPPER}}' "$TOKNAME" "$(bp_placeholder_upper "$TOKNAME")")
if [ "$got" = 'X{{PROJECT_NAME}}Y' ]; then
  pass "#25 a project name containing the token itself is not re-scanned (R6-F1)"
else
  fail "#25 emitted replacement bytes were re-scanned: got '$got', want 'X{{PROJECT_NAME}}Y'"
fi

# Both tokens on one line must each resolve exactly once.
got=$(bp_substitute_line 'a{{PROJECT_NAME}}b{{PROJECT_NAME_UPPER}}c' 'zz' 'ZZ')
if [ "$got" = 'azzbZZc' ]; then
  pass "#25b both tokens on one line resolve once each, earliest-first (R6-F1)"
else
  fail "#25b one-pass scan mis-ordered the tokens: got '$got', want 'azzbZZc'"
fi

# ===========================================================================
# 26. R6-F1 — a name blueprint sync cannot represent must be REFUSED, not
#     silently altered. A newline-bearing basename is legal on the filesystem;
#     the substitution, the diff alignment and the scan are all line-oriented.
#     It used to be silently truncated by `$(basename ...)`.
# ===========================================================================
if bp_validate_project_name "$(printf 'a\nb')" 2>/dev/null; then
  fail "#26 a newline-bearing project name was accepted — sync cannot represent it and would mangle it silently"
else
  pass "#26 an unrepresentable project name is refused explicitly (R6-F1)"
fi
if bp_validate_project_name 'perfectly-normal' 2>/dev/null; then
  pass "#26b an ordinary project name is accepted"
else
  fail "#26b a normal project name was rejected — the validator is too strict"
fi

# ===========================================================================
# 27. R6-F2 — NUL-bearing content must be REFUSED, never truncated.
#     Shell variables cannot hold NUL, so a bash rewrite silently discards it
#     and everything after: `printf 'A\0{{PROJECT_NAME}}\0Z'` came back as a
#     lone `A`. The old sed path preserved those bytes, so routing pull through
#     the primitive could have TRUNCATED a managed file. Fail closed instead.
# ===========================================================================
NULF="$WORK/nul-input"
printf 'A\0{{PROJECT_NAME}}\0Z' > "$NULF"
if bp_substitute_stream "$NULF" acme-flow >"$WORK/nul-out" 2>/dev/null; then
  fail "#27 a NUL-bearing file was substituted rather than refused — output would be truncated to '$(od -An -c "$WORK/nul-out" | head -1 | tr -s ' ')'"
else
  pass "#27 NUL-bearing content is refused, not silently truncated (R6-F2)"
fi
# And the in-place form must leave the original untouched on refusal.
cp "$NULF" "$WORK/nul-inplace"
bp_substitute_in_place "$WORK/nul-inplace" acme-flow 2>/dev/null || true
if cmp -s "$NULF" "$WORK/nul-inplace"; then
  pass "#27b a refused in-place substitution leaves the file byte-identical (R6-F2)"
else
  fail "#27b the file was modified despite the refusal — half-written output"
fi

# ===========================================================================
# 28. R6-F2 — a large managed file must stream, not be held whole. This is a
#     behavioural floor (it completes, and byte-exactly), not a memory probe.
# ===========================================================================
BIGF="$WORK/big-input"
: > "$BIGF"
i=0
while [ "$i" -lt 4000 ]; do
  echo "line $i mentions {{PROJECT_NAME}} in passing" >> "$BIGF"
  i=$((i+1))
done
if ! bp_substitute_stream "$BIGF" acme-flow > "$WORK/big-out" 2>/dev/null; then
  fail "#28 substitution failed on a 4000-line file"
elif [ "$(grep -c 'acme-flow' "$WORK/big-out")" -ne 4000 ]; then
  fail "#28 large-file substitution lost lines: $(grep -c 'acme-flow' "$WORK/big-out")/4000"
elif grep -q '{{PROJECT_NAME}}' "$WORK/big-out"; then
  fail "#28 large-file substitution left unresolved tokens"
else
  pass "#28 a 4000-line file substitutes completely (R6-F2 streaming)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: a2bp reverse-substitutes and refuses to launder project specifics."
  exit 0
fi
echo "FAILED: a2bp contamination guard (A-07) is not holding."
exit 1
