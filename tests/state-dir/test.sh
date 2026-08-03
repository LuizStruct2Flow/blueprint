#!/bin/bash
# tests/state-dir/test.sh
#
# A-09: the activity feed and the dispatchers must rendezvous on ONE state dir.
#
# The defect: the feed derived `~/.<repo-basename>` at runtime, but the
# Codex/Gemini dispatchers hardcoded the literal `~/.{{PROJECT_NAME}}/` — an
# unsubstituted bootstrap placeholder. So every blueprint-derived checkout's
# dispatcher wrote into the SAME shared directory, and a feed pointed there saw
# other projects' Codex output interleaved. This is not hypothetical: a redcare
# BUG-013 acceptance verdict surfaced live in this project's feed.
#
# Fix shape: a single derivation in scripts/lib/state-dir.sh, sourced by the feed
# AND every dispatcher — one mechanism, never two that agree only by coincidence.
#
# Run from the blueprint repo root:  bash tests/state-dir/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HELPER="$ROOT/scripts/lib/state-dir.sh"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

DISPATCHERS="scripts/start-codex-signal-watch.sh scripts/codex-signal-watch.sh scripts/start-gemini-signal-watch.sh"

# ===========================================================================
# 1. THE REPRODUCER — two different projects must get two different state dirs.
#    Under the literal placeholder both collapse to ~/.{{PROJECT_NAME}}/, which
#    IS the contamination. The helper must derive from the repo name so they
#    diverge. (On the parent commit the helper does not exist and this is red.)
# ===========================================================================
if [ ! -f "$HELPER" ]; then
  fail "#1 scripts/lib/state-dir.sh is missing — the shared derivation does not exist"
else
  # Source in a subshell so nothing leaks; HOME is pinned so the assertion is
  # exact rather than host-dependent.
  a="$( HOME=/h AGENT_STATE_HOME= ; . "$HELPER"; agent_state_dir /tmp/x/proj-A )"
  b="$( HOME=/h AGENT_STATE_HOME= ; . "$HELPER"; agent_state_dir /tmp/x/proj-B )"

  # A-09's property is DISTINCTNESS, not a particular path. This used to assert
  # the literal `/h/.proj-A`, which pinned the implementation rather than the
  # guarantee — and so failed when BUG-020 moved the dir INSIDE the project even
  # though the anti-collision property was untouched. Assert what A-09 actually
  # promises, plus BUG-020's location.
  [ "$a" = "/tmp/x/proj-A/logs/state" ] || fail "#1 proj-A derived '$a', expected it under the project (BUG-020)"
  [ "$b" = "/tmp/x/proj-B/logs/state" ] || fail "#1 proj-B derived '$b', expected it under the project (BUG-020)"
  case "$a" in
    /h/*) fail "#1 the state dir is still under \$HOME — deleting the project would not delete its state (BUG-020)" ;;
  esac
  if [ "$a" != "$b" ]; then
    pass "#1 two projects derive two distinct state dirs (no shared-dir collision)"
  else
    fail "#1 two projects collapsed to the SAME state dir ('$a') — the A-09 contamination"
  fi
fi

# ===========================================================================
# 2. $AGENT_STATE_HOME override is honored (feed precedence preserved).
# ===========================================================================
if [ -f "$HELPER" ]; then
  o="$( HOME=/h AGENT_STATE_HOME=/explicit/dir ; . "$HELPER"; agent_state_dir /tmp/x/proj-A )"
  [ "$o" = "/explicit/dir" ] \
    && pass "#2 AGENT_STATE_HOME overrides the derived dir (matches the feed)" \
    || fail "#2 AGENT_STATE_HOME ignored — derived '$o', expected /explicit/dir"
fi

# ===========================================================================
# 3. No dispatcher hardcodes the literal placeholder in a state/log PATH.
#    Non-vacuity guard: first prove the grep target exists at all, so a renamed
#    file cannot make "zero literal hits" pass by finding nothing to scan.
# ===========================================================================
saw_any_logpath=0
literal_found=0
for d in $DISPATCHERS; do
  [ -f "$ROOT/$d" ] || { fail "#3 dispatcher $d not found — cannot assert on it"; continue; }
  grep -Eq 'runs\.log|signal\.log|last-message' "$ROOT/$d" && saw_any_logpath=1
  # A literal {{PROJECT_NAME}} on any line that builds a state/log path.
  if grep -En '\{\{PROJECT_NAME\}\}' "$ROOT/$d" \
       | grep -Eq 'runs\.log|signal\.log|last-message|mkdir'; then
    fail "#3 $d still builds a state/log path from the literal {{PROJECT_NAME}}"
    literal_found=1
  fi
done
if [ "$saw_any_logpath" -ne 1 ]; then
  fail "#3 found no run/signal/last-message path in any dispatcher — grep target vanished (vacuous)"
elif [ "$literal_found" -eq 0 ]; then
  pass "#3 dispatchers build their state/log paths without the literal placeholder"
fi

# ===========================================================================
# 4. Both the feed AND the dispatchers actually SOURCE the shared helper —
#    the guarantee is 'one mechanism', so prove every side is wired to it.
# ===========================================================================
for f in scripts/agent-activity.sh $DISPATCHERS; do
  [ -f "$ROOT/$f" ] || { fail "#4 $f not found"; continue; }
  grep -q 'lib/state-dir.sh' "$ROOT/$f" \
    && pass "#4 $f sources the shared state-dir helper" \
    || fail "#4 $f does not source scripts/lib/state-dir.sh — it has its own copy of the rule"
done

# ===========================================================================
# 5. BUG-020 — the state dir is INSIDE the project, and nothing reaches $HOME
#    to find it.
#
#    A-09 made the feed and the dispatchers AGREE on a path; it never asked
#    whether that path belonged outside the project. Two consequences this pins:
#    deleting the project must delete its state (it did not — a project
#    bootstrapped at the same path later inherited the old records), and no
#    out-of-project directory grant should be needed for ordinary operation.
#
#    Asserted on the DERIVATION and on every consumer, because a single script
#    quietly rebuilding a $HOME path would restore the split without failing
#    anything else.
# ===========================================================================
if [ -f "$HELPER" ]; then
  d="$( HOME=/h AGENT_STATE_HOME= ; . "$HELPER"; agent_state_dir /tmp/x/proj-C )"
  case "$d" in
    /tmp/x/proj-C/*) pass "#5 the state dir resolves inside the project" ;;
    *) fail "#5 the state dir resolved OUTSIDE the project: $d" ;;
  esac

  # The override must still work — an operator pointing several checkouts at one
  # dir is a deliberate choice A-09 supports and this must not remove.
  o="$( HOME=/h AGENT_STATE_HOME=/explicit ; . "$HELPER"; agent_state_dir /tmp/x/proj-C )"
  [ "$o" = "/explicit" ] \
    && pass "#5 AGENT_STATE_HOME still overrides (the deliberate shared-dir case)" \
    || fail "#5 AGENT_STATE_HOME no longer overrides — got '$o'"
fi

# --- #5b: STRUCTURAL guard, not a $HOME blocklist -----------------------------
#
# The first version of this test grepped for `$HOME` shapes. Codex broke it in
# one pass with two lines that reintroduce the bug and match no pattern:
#
#     RUN_LOG="${HOME}/.$(basename "$repo_root")/codex-runs.log"
#     STATE_DIR="$(printf "%s/.%s" "$HOME" "$(basename "$repo_root")")"
#
# The first uses braces, the second names no artefact near $HOME. Widening the
# regex to catch those invites the next two spellings — a blocklist of ways to
# spell a bad path can never be complete, and every widening step made the guard
# fire on legitimate uses ($HOME/.claude/projects, $HOME/.nvm, $HOME/.vscode).
#
# So assert the REQUIREMENT instead of enumerating its violations. A-09's actual
# rule is "every consumer derives its state paths from the one shared helper",
# and that is structural:
#
#   A. A line naming a state artefact must root it in a helper-derived variable.
#   B. An assignment to the state-dir variable must call agent_state_dir.
#
# Any reconstruction — $HOME, ${HOME}, printf, a hardcoded absolute path, a new
# spelling nobody has thought of — fails one of these, because it has to name an
# artefact or set the dir, and both routes are checked.
# Artefact FILENAMES, with their extensions. Matching the bare token
# `last-message` also matched codex's `--output-last-message` FLAG, whose value
# was correctly derived — a guard that flags the flag teaches people to ignore
# it. The artefacts are files, so match them as files.
ART='runs\.log|signal\.log|last-message\.md'
DERIVED='STATE_DIR|state_dir|LOG_FILE|agent_state_dir'

# An operator passing an explicit path on the command line is the same
# sanctioned override as AGENT_STATE_HOME, so `LOG_FILE="$2"` inside argument
# parsing is not a reconstruction. Kept deliberately narrow — only a bare
# positional — because anything looser is a hole: a reconstruction has to build
# the path from parts, and it cannot do that with `"$2"` alone.
OVERRIDE='=\"\$[0-9]\"$'

structural=""
for f in scripts/agent-activity.sh $DISPATCHERS; do
  [ -f "$ROOT/$f" ] || continue
  # Strip comments AND the usage heredoc. Both are documentation, not code
  # paths: `--log PATH (default: <repo>/logs/state/signal.log)` legitimately
  # names an artefact to a human and derives nothing. Their correctness is
  # Codex's MEDIUM #3 (stale text pointing at the old location), which is a
  # real concern but a different one — mixing it in here would mean the
  # structural rule fires on prose and gets ignored.
  body="$(sed -e "/<<'USAGE'/,/^USAGE$/d" -e 's/#.*//' "$ROOT/$f")"

  # (A) every artefact-naming line is rooted in a derived variable
  if printf '%s\n' "$body" | grep -E "$ART" | grep -qvE "$DERIVED"; then
    structural="$structural $f(A)"
  fi

  # (B) every state-dir assignment comes from the helper
  if printf '%s\n' "$body" | grep -E '^[[:space:]]*(STATE_DIR|state_dir|LOG_FILE)=' \
       | grep -vE "$OVERRIDE" | grep -qv 'agent_state_dir'; then
    structural="$structural $f(B)"
  fi
done
if [ -n "$structural" ]; then
  fail "#5b a consumer builds a state path outside the shared helper:$structural"
else
  pass "#5b every consumer roots its state paths in agent_state_dir"
fi

# --- #5c: prove #5b actually bites -------------------------------------------
#
# A structural guard can still be vacuous, so it is run against the shapes that
# must fail: the two historical spellings from c284cc1^, and BOTH of Codex's
# bypasses, which is the point of writing the guard structurally in the first
# place. The benign lines must stay clean.
check_bad() { # name, line
  if printf '%s\n' "$2" | grep -E "$ART" | grep -qvE "$DERIVED"; then return 0; fi
  if printf '%s\n' "$2" | grep -E '^[[:space:]]*(STATE_DIR|state_dir|LOG_FILE)=' \
       | grep -vE "$OVERRIDE" | grep -qv 'agent_state_dir'; then return 0; fi
  fail "#5c the guard does NOT catch $1: $2"
  return 1
}
check_ok() { # name, line
  if printf '%s\n' "$2" | grep -E "$ART" | grep -qvE "$DERIVED"; then
    fail "#5c the guard wrongly flags $1: $2"
    return 1
  fi
  return 0
}

vac=0
check_bad "the original literal-placeholder path" \
  'RUN_LOG="$HOME/.{{PROJECT_NAME}}/codex-runs.log"' || vac=1
check_bad "the original derived-basename path" \
  'state_dir="${AGENT_STATE_HOME:-$HOME/.$(basename "$repo_root")}"' || vac=1
check_bad "Codex bypass 1 (braced \$HOME)" \
  'RUN_LOG="${HOME}/.$(basename "$repo_root")/codex-runs.log"' || vac=1
check_bad "Codex bypass 2 (printf, no artefact name)" \
  'STATE_DIR="$(printf "%s/.%s" "$HOME" "$(basename "$repo_root")")"' || vac=1

check_ok "transcript reading" \
  '  proj="$HOME/.claude/projects/$(printf "%s" "$repo_root")"' || vac=1
check_ok "a correct derived assignment" \
  'RUN_LOG="$STATE_DIR/codex-runs.log"' || vac=1

[ "$vac" -eq 0 ] \
  && pass "#5c the guard catches all four defect shapes, including both Codex bypasses"

# ===========================================================================
# 6. Codex HIGH — an exported GIT_DIR must not move the resolved root.
#
#    Git exports GIT_DIR to every hook, and the pre-push gate runs the suites,
#    so anything launched from that context inherits it (this is BUG-014's
#    mechanism). A root resolved with `git rev-parse --show-toplevel` then
#    answers about the CALLER's environment rather than the script's own tree:
#    Codex reproduced the feed landing on <repo>/logs/state while the launcher
#    landed on <repo>/scripts/logs/state. Different dirs is A-09 reopened.
#
#    The anchor expression is extracted FROM each script and evaluated, so this
#    tests the shipped code rather than a copy of the formula that could agree
#    with a broken file by coincidence.
# ===========================================================================
ANCHORED="scripts/agent-activity.sh scripts/start-codex-signal-watch.sh scripts/start-gemini-signal-watch.sh"
hostile="$(mktemp -d)"
git init -q "$hostile/decoy" 2>/dev/null

for f in $ANCHORED; do
  [ -f "$ROOT/$f" ] || { fail "#6 $f not found"; continue; }

  # Pull the script's OWN root assignment (repo_root= or ROOT=).
  expr_line="$(grep -m1 -E '^(ROOT|repo_root)="\$\(' "$ROOT/$f")"
  if [ -z "$expr_line" ]; then
    fail "#6 $f has no recognisable root anchor to test"
    continue
  fi

  # Evaluate it the way a hook would: GIT_DIR exported at a decoy repo, and
  # cwd inside scripts/ rather than the repo top.
  # Run the extracted line in a shell whose $0 IS the script under test — the
  # anchor is `dirname "$0"`, so evaluating it in this test's own shell would
  # resolve against the test file and prove nothing. cwd is scripts/ and GIT_DIR
  # points at a decoy repo: the hook environment, reproduced.
  got="$(
    cd "$ROOT/scripts" || exit 1
    GIT_DIR="$hostile/decoy/.git" \
      bash -c "${expr_line%%#*}"'
        printf "%s\n" "${ROOT:-${repo_root:-}}"' "$ROOT/$f"
  )"

  if [ "$got" = "$ROOT" ]; then
    pass "#6 $f anchors to its own tree under an exported GIT_DIR"
  else
    fail "#6 $f resolved '$got' under an exported GIT_DIR, expected '$ROOT' — A-09 reopened"
  fi
done
rm -rf "$hostile"

# Non-vacuity: the OLD anchor must actually fail this, or #6 proves nothing.
old_got="$(
  cd "$ROOT/scripts" || exit 1
  hostile2="$(mktemp -d)"; git init -q "$hostile2/decoy" 2>/dev/null
  GIT_DIR="$hostile2/decoy/.git"; export GIT_DIR
  git rev-parse --show-toplevel 2>/dev/null || pwd
)"
if [ "$old_got" = "$ROOT" ]; then
  fail "#6b the pre-fix anchor also resolved correctly — the hostile env is not hostile, so #6 is vacuous"
else
  pass "#6b the pre-fix anchor DOES break here ('$old_got') — #6 is testing something real"
fi

# #6c — structural sweep. #6 evaluates an extracted `ROOT="$(...)"` line, so it
# cannot reach codex-signal-watch.sh (whose anchor is a function) or any script
# added later. The rule is simple enough to assert directly: nothing on the
# state-dir path may anchor its repo root with `git rev-parse`, because that
# answers about the caller's exported GIT_DIR rather than the script's own tree.
revparse=""
for f in scripts/agent-activity.sh $DISPATCHERS; do
  [ -f "$ROOT/$f" ] || continue
  if sed 's/#.*//' "$ROOT/$f" | grep -q 'rev-parse --show-toplevel'; then
    revparse="$revparse $f"
  fi
done
if [ -n "$revparse" ]; then
  fail "#6c anchors its root with git rev-parse, which an exported GIT_DIR redirects:$revparse"
else
  pass "#6c no state-dir consumer anchors its root with git rev-parse"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-09 — feed and dispatchers rendezvous on one per-project state dir."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
