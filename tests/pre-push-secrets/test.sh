#!/bin/bash
# tests/pre-push-secrets/test.sh
#
# A-03: the secret gate must scan WHAT IS BEING PUSHED, not the index.
#
# The defect: the hook ran `gitleaks protect --staged`. `--staged` scans the
# git INDEX, and at pre-push time the index is empty — the commit has already
# been made. Measured against a real gitleaks with a real detectable secret
# committed and about to be pushed:
#
#   gitleaks protect --staged            → 0 commits scanned, ~0 bytes, rc=0
#   gitleaks detect --log-opts=range     → 1 commit scanned, leaks found: 1
#
# So the gate CLAUDE.md §Security describes as "gitleaks blocks the push" was a
# no-op in the normal commit-then-push flow. It could only ever have fired for
# someone who staged a secret and ran `git push` without committing it.
#
# Driven with a shim gitleaks so every path is deterministic and no real secret
# is ever written to disk. The shim asserts on ARGV — which is the whole defect:
# the hook was calling the wrong subcommand against the wrong target.
#
# Run from the blueprint repo root:  bash tests/pre-push-secrets/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers. Git exports GIT_DIR to every hook,
# the pre-push gate runs this suite, and the fixtures below use `git init` inside
# a `cd`ed subshell. With GIT_DIR set, `cd` protects nothing: the fixture's
# commits and config writes land in the REAL repository. This suite must be safe
# run from anywhere, so it strips them itself rather than trusting its caller.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY


# --fast omits ONLY the two cases that deliberately burn time: #9 and #10 hang
# a scanner to prove the budget, costing ~5s of a hard 30s pre-push ceiling
# that the gate had already blown at 30.8s. They run in full in CI.
#
# #11 stays local despite being a "budget" case by topic, because the split is
# by COST and #11's marginal cost is negligible and bounded — it has no
# deliberate sleep and exits at the dependency probe before scanning (the whole
# --fast suite runs in ~1s including it). Not literally zero: a slow box still
# pays process startup, fixture setup and one partial hook invocation. Grouping
# it with the slow cases was inconsistent with the rule stated right here, and
# removed the only local guard on a newly mandatory dependency (Codex R5-F2).
FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.githooks/pre-push"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$HOOK" ] || { echo "FAIL: missing $HOOK"; exit 1; }

# --- fixture: a repo the hook runs in and exits quickly -----------------------
FIX="$WORK/repo"
mkdir -p "$FIX/.githooks" "$FIX/.claude" "$FIX/bin" "$FIX/scripts/lib"
cp "$HOOK" "$FIX/.githooks/pre-push"
# FEATURE-002: the hook sources the pipeline renderer and fails closed without
# it — by design. The fixture must therefore carry it, or every case here fails
# as "the hook could not start" rather than testing the secret scan at all.
cp "$ROOT/scripts/lib/pipeline.sh" "$FIX/scripts/lib/pipeline.sh"
printf '{\n  "permissions": {\n    "allow": []\n  }\n}\n' >"$FIX/.claude/settings.json"
(
  cd "$FIX"
  git init -q .
  git config user.email t@local
  git config user.name t
  printf 'base\n' > README.md
  git add README.md
  git -c commit.gpgsign=false commit -q -m base
  printf 'second\n' >> README.md
  git add README.md
  git -c commit.gpgsign=false commit -q -m second
) 2>/dev/null

BASE=$( cd "$FIX" && git rev-parse HEAD~1 )
HEADSHA=$( cd "$FIX" && git rev-parse HEAD )
ZERO=0000000000000000000000000000000000000000

ARGV="$WORK/gitleaks-argv"

# gitleaks shim. Records its full argv, then decides by SUBCOMMAND:
#   protect  → always "no leaks" (the real behaviour at pre-push time: the
#              index is empty, so it scans nothing and passes)
#   detect   → leak found (exit 1), i.e. the secret IS in the pushed commits
# A hook that still calls `protect` therefore passes; one that calls `detect`
# blocks. That difference is the regression.
mk_gitleaks(){ # $1 = exit code for `detect`
  cat >"$FIX/bin/gitleaks" <<EOF
#!/bin/sh
echo "\$@" >>"$ARGV"
case "\$1" in
  protect) echo "0 commits scanned."; echo "no leaks found"; exit 0 ;;
  detect)  echo "SIMULATED-LEAK in pushed range"; exit $1 ;;
esac
exit 0
EOF
  chmod +x "$FIX/bin/gitleaks"
  : > "$ARGV"
}

# Neutral shims so no ambient binary decides these results (the R11 lesson from
# tests/pre-push-scanners: every executable the hook can discover must be under
# fixture control, not just the ones a case asserts on).
#
# semgrep is NOT a bare `exit 0`: since BUG-003 the hook classifies from
# semgrep's --json output, so a silent exit 0 reads as "did not complete" and
# blocks every case for the wrong reason. It has to emit a valid empty result.
cat >"$FIX/bin/semgrep" <<'EOF'
#!/bin/sh
printf '{"version":"1","results":[],"errors":[]}\n'
exit 0
EOF
chmod +x "$FIX/bin/semgrep"
for t in osv-scanner trivy; do
  printf '#!/bin/sh\nexit 0\n' >"$FIX/bin/$t"
  chmod +x "$FIX/bin/$t"
done

# run_hook <stdin-lines>  → prints exit code
run_hook(){
  local input="$1"
  printf '%s' "$input" | (
    cd "$FIX" && PATH="$FIX/bin:$PATH" sh .githooks/pre-push origin "git@example.com:x/y.git"
  ) >"$WORK/out" 2>&1
  echo $?
}

# ===========================================================================
# 1. THE REPRODUCER — a secret in a committed-but-unpushed commit must BLOCK.
#    Nothing is staged, which is the normal state when pre-push fires.
# ===========================================================================
mk_gitleaks 1
rc=$(run_hook "refs/heads/main $HEADSHA refs/heads/main $BASE
")
if [ "$rc" -eq 0 ]; then
  fail "#1 the push was ALLOWED with a secret in the pushed range — the gate scanned the index (empty at pre-push time), not the commits (A-03)"
elif ! grep -q 'SIMULATED-LEAK' "$WORK/out"; then
  fail "#1 blocked, but not by the secret scan — see $WORK/out"
else
  pass "#1 a secret in the pushed commits blocks the push (A-03 reproducer)"
fi

# ===========================================================================
# 2. The scan must target the ACTUAL pushed range, not a guess. `remote..local`
#    is what "what am I about to publish" means; anything else either misses
#    commits or re-scans history that is already upstream.
# ===========================================================================
if ! grep -q 'detect' "$ARGV" 2>/dev/null; then
  fail "#2 gitleaks was never invoked with 'detect' — argv was: $(tr '\n' '|' <"$ARGV")"
elif ! grep -q "$BASE" "$ARGV" || ! grep -q "$HEADSHA" "$ARGV"; then
  fail "#2 the scan range does not name remote..local; argv was: $(tr '\n' '|' <"$ARGV")"
else
  pass "#2 the scan is scoped to the range actually being pushed"
fi

# ===========================================================================
# 3. A brand-new branch has remote_sha = 000…0, which is not a resolvable
#    revision. Passing `000..local` to git makes the scan ERROR, and a scan
#    that cannot run must never read as a clean pass (BUG-003's rule).
# ===========================================================================
mk_gitleaks 1
rc=$(run_hook "refs/heads/feat $HEADSHA refs/heads/feat $ZERO
")
if [ "$rc" -eq 0 ]; then
  fail "#3 a new branch pushed its secrets unscanned — the all-zero remote sha was not handled"
elif grep -qE "$ZERO\.\.|\.\.$ZERO" "$ARGV"; then
  fail "#3 an unresolvable 000…0 range was handed to git; argv was: $(tr '\n' '|' <"$ARGV")"
else
  pass "#3 a new branch scans its own commits without an unresolvable range"
fi

# ===========================================================================
# 4. Deleting a remote branch pushes nothing. There is no content to scan, so
#    it must not block — and must not invent a range from an all-zero local sha.
# ===========================================================================
mk_gitleaks 1
rc=$(run_hook "(delete) $ZERO refs/heads/gone $HEADSHA
")
if [ "$rc" -ne 0 ]; then
  fail "#4 a branch DELETION was blocked by the secret scan (exit $rc) — nothing is being published; see $WORK/out"
elif grep -q 'detect' "$ARGV" 2>/dev/null; then
  fail "#4 a deletion triggered a content scan; argv was: $(tr '\n' '|' <"$ARGV")"
else
  pass "#4 a branch deletion is not scanned and does not block"
fi

# ===========================================================================
# 5. BUG-003 discipline must survive: gitleaks exits 1 for a FINDING and >=2
#    when it could not run. A tool failure must block as a tool failure, and
#    must say so — not be reported as a secret.
# ===========================================================================
mk_gitleaks 2
rc=$(run_hook "refs/heads/main $HEADSHA refs/heads/main $BASE
")
if [ "$rc" -eq 0 ]; then
  fail "#5 a gitleaks TOOL FAILURE passed as a clean scan — fail-open on the secret gate"
elif grep -qi 'found a secret' "$WORK/out"; then
  fail "#5 a tool failure was reported as a secret finding — the BUG-003 conflation is back"
elif ! grep -qi 'could not complete\|did NOT run' "$WORK/out"; then
  fail "#5 blocked, but never says the scan could not run; see $WORK/out"
else
  pass "#5 a scanner failure still blocks AS a tool failure, not as a finding (BUG-003)"
fi

# ===========================================================================
# 6. The hook is also run directly — by the DoD gate rehearsal, by CI, and by
#    this repo's own fixtures — with no ref lines on stdin. It must still scan
#    something rather than crash or silently skip.
# ===========================================================================
mk_gitleaks 1
rc=$(run_hook "")
if [ "$rc" -eq 0 ] && ! grep -q 'detect' "$ARGV" 2>/dev/null; then
  fail "#6 with no ref info the secret scan was silently skipped — a hook run by hand must not be a hole"
elif grep -qi 'unbound\|syntax error\|bad substitution' "$WORK/out"; then
  fail "#6 the hook errored with no stdin: $(head -3 "$WORK/out")"
else
  pass "#6 no ref info on stdin degrades safely rather than skipping or crashing"
fi

# ===========================================================================
# 7. F1 (Codex) — "already published" means already on THE DESTINATION, not on
#    any remote you happen to have configured.
#
#    `--not --remotes` subtracts every remote's tracking refs. A commit sitting
#    on a private mirror is still a FIRST DISCLOSURE when it goes to the public
#    remote, and the original fix skipped exactly that commit. Case #3 only
#    proved the all-zero sha never reaches git; it said nothing about which
#    remote is subtracted.
# ===========================================================================
(
  cd "$FIX"
  git remote add origin  https://example.invalid/pub.git  2>/dev/null
  git remote add private https://example.invalid/priv.git 2>/dev/null
  # The commit exists ONLY on the private mirror's tracking ref.
  git update-ref refs/remotes/private/main "$HEADSHA"
) 2>/dev/null

mk_gitleaks 1
rc=$(run_hook "refs/heads/main $HEADSHA refs/heads/main $ZERO
")
if [ "$rc" -eq 0 ]; then
  fail "#7 a commit already on a PRIVATE remote was skipped when first pushed to origin (Codex F1)"
elif grep -qE '\-\-not' "$ARGV"; then
  fail "#7 a new ref subtracted SOMETHING; nothing local is trustworthy enough to subtract. argv: $(tr '\n' '|' <"$ARGV")"
else
  pass "#7 a new ref is scanned in full — no remote's refs are subtracted (Codex F1)"
fi

# ===========================================================================
# 7b. R2-F1 — a PHANTOM tracking ref must not shrink the scan.
#     `--remotes=<destination>` was the second attempt and is still only a
#     namespace selector: it never asks the destination what it has, so a
#     stale-ahead, hand-created or refspec-repurposed ref under
#     refs/remotes/<destination>/ subtracts commits the destination need not
#     contain. That is an UNDER-scan, the one direction that ships secrets.
# ===========================================================================
(
  cd "$FIX"
  # A phantom origin ref claiming the very commit we are about to publish.
  git update-ref refs/remotes/origin/phantom "$HEADSHA"
) 2>/dev/null
mk_gitleaks 1
rc=$(run_hook "refs/heads/main $HEADSHA refs/heads/main $ZERO
")
if [ "$rc" -eq 0 ]; then
  fail "#7b a phantom refs/remotes/origin/* ref caused the outgoing commit to be subtracted — the local tracking namespace was trusted as authoritative (Codex R2-F1)"
else
  pass "#7b a phantom destination tracking ref does not shrink the scan (Codex R2-F1)"
fi

# ===========================================================================
# 8. F1, other half — when the destination is a bare URL rather than a named
#    remote, there are no tracking refs worth trusting. Scan everything
#    reachable rather than subtracting a remote that may not correspond.
# ===========================================================================
mk_gitleaks 1
printf '%s' "refs/heads/main $HEADSHA refs/heads/main $ZERO
" | (
  cd "$FIX" && PATH="$FIX/bin:$PATH" sh .githooks/pre-push \
    "https://example.invalid/direct.git" "https://example.invalid/direct.git"
) >"$WORK/out" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#8 pushing to a bare URL skipped the scan entirely"
elif grep -q '\-\-remotes' "$ARGV"; then
  fail "#8 a bare-URL destination consulted tracking refs. argv: $(tr '\n' '|' <"$ARGV")"
else
  pass "#8 a bare-URL destination scans all reachable history (Codex F1)"
fi

run_budget_cases(){ [ "$FAST" -eq 0 ]; }

if run_budget_cases; then
# ===========================================================================
# 9. R3-F2 — a scan that runs out of budget must BLOCK, distinctly.
#    A new ref is scanned over its whole history, which is unbounded, while the
#    ≤30s gate ceiling is not. Those cannot both hold silently, so the local
#    scan is capped and an unfinished scan blocks — it is not a clean one, and
#    it is not the same thing as a crashed scanner either.
# ===========================================================================
cat >"$FIX/bin/gitleaks" <<EOF
#!/bin/sh
echo "\$@" >>"$ARGV"
case "\$1" in
  detect) sleep 30 ;;
esac
exit 0
EOF
chmod +x "$FIX/bin/gitleaks"
: > "$ARGV"

printf '%s' "refs/heads/main $HEADSHA refs/heads/main $BASE
" | (
  cd "$FIX" && PATH="$FIX/bin:$PATH" GITLEAKS_TIMEOUT_SECONDS=2 \
    sh .githooks/pre-push origin "git@example.com:x/y.git"
) >"$WORK/out" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#9 an unfinished scan passed as clean — the budget cap fails open (Codex R3-F2)"
elif ! grep -qi 'INCOMPLETE\|did not finish' "$WORK/out"; then
  fail "#9 blocked, but does not say the scan was incomplete — indistinguishable from a real finding: $(tail -3 "$WORK/out")"
elif grep -qi 'found a secret' "$WORK/out"; then
  fail "#9 a timeout was reported as a secret finding"
else
  pass "#9 a scan that exceeds its budget blocks AS incomplete, distinctly (Codex R3-F2)"
fi

# ===========================================================================
# 10. R4-F1 — the budget is per PUSH, not per ref.
#     The cap used to be handed to a fresh `timeout` inside the loop, so three
#     slow refs could spend 3× the advertised cap before the rest of the gate
#     even started. Case #9 supplies one ref line and therefore cannot see it.
#     Three hanging refs with a 3s budget must still finish in well under 3×.
# ===========================================================================
cat >"$FIX/bin/gitleaks" <<EOF
#!/bin/sh
echo "\$@" >>"$ARGV"
case "\$1" in
  detect) sleep 30 ;;
esac
exit 0
EOF
chmod +x "$FIX/bin/gitleaks"
: > "$ARGV"

_t0=$(date +%s)
printf '%s' "refs/heads/a $HEADSHA refs/heads/a $BASE
refs/heads/b $HEADSHA refs/heads/b $BASE
refs/heads/c $HEADSHA refs/heads/c $BASE
" | (
  cd "$FIX" && PATH="$FIX/bin:$PATH" GITLEAKS_TIMEOUT_SECONDS=3 \
    sh .githooks/pre-push origin "git@example.com:x/y.git"
) >"$WORK/out" 2>&1
rc=$?
_elapsed=$(( $(date +%s) - _t0 ))

if [ "$rc" -eq 0 ]; then
  fail "#10 three hanging refs passed the gate"
elif [ "$_elapsed" -ge 9 ]; then
  fail "#10 three refs took ${_elapsed}s against a 3s budget — the cap is per-ref, so a multi-ref push multiplies it (Codex R4-F1)"
elif ! grep -qi 'INCOMPLETE\|did not finish' "$WORK/out"; then
  fail "#10 bounded, but does not report the scan as incomplete: $(tail -3 "$WORK/out")"
else
  pass "#10 the budget bounds the whole push (${_elapsed}s for 3 refs on a 3s cap), not each ref (Codex R4-F1)"
fi
else
  echo "  – skipped in --fast (run in CI): #9, #10 — the two cases that deliberately burn ~5s"
fi

# ===========================================================================
# 11. R4-F2 — with no timeout provider the cap does not exist, so the hook must
#     REFUSE rather than run an unbounded scan. The old fallback ran gitleaks
#     unbounded, which is precisely the documented macOS `brew bundle` path:
#     "the scan is capped" was true of Linux boxes and nowhere else.
# ===========================================================================
cat >"$FIX/bin/gitleaks" <<EOF
#!/bin/sh
echo "\$@" >>"$ARGV"
exit 0
EOF
chmod +x "$FIX/bin/gitleaks"
: > "$ARGV"
# A PATH with the fixture's shims but no timeout/gtimeout anywhere.
mkdir -p "$WORK/notimeout"
for t in gitleaks semgrep osv-scanner trivy git sh sed grep cat mktemp tail rm date printf; do
  _src="$(command -v "$t" 2>/dev/null || true)"
  [ -n "$_src" ] && ln -sf "$_src" "$WORK/notimeout/$t" 2>/dev/null
done
ln -sf "$FIX/bin/gitleaks" "$WORK/notimeout/gitleaks" 2>/dev/null
ln -sf "$FIX/bin/semgrep"  "$WORK/notimeout/semgrep" 2>/dev/null

printf '%s' "refs/heads/main $HEADSHA refs/heads/main $BASE
" | (
  cd "$FIX" && PATH="$WORK/notimeout" sh .githooks/pre-push origin "git@example.com:x/y.git"
) >"$WORK/out" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#11 with no timeout available the hook ran the scan unbounded and passed — the cap silently vanished (Codex R4-F2)"
elif ! grep -qi 'timeout\|coreutils' "$WORK/out"; then
  fail "#11 blocked, but never explains that no timeout provider was found: $(tail -3 "$WORK/out")"
else
  pass "#11 no timeout provider fails closed with an actionable message (Codex R4-F2)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-03 — the secret gate scans the pushed commits, not the empty index."
  exit 0
fi
echo "FAILED: A-03 — the secret gate is not scanning what is being pushed."
exit 1
