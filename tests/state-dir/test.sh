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

# BUG-014 — never inherit git's repo pointers.
#
# Sharpened by this suite in particular: case #6 sets GIT_DIR ON PURPOSE, to
# prove a script's root anchor ignores it. That deliberate export must never
# leak to the `git init` that builds the decoy, or the fixture lands in the real
# repository — which is precisely BUG-014, committed by the test written to
# police its neighbours. The gate caught exactly that. The export is scoped to
# the one command being probed; everything else runs with these unset.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

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
# and that is structural.
#
# HONEST LIMIT, because the previous version of this comment over-claimed and
# Codex broke it a second time: this is still a heuristic over source text. He
# defeated it again by putting the bad directory in an unlisted variable and
# building `codex-runs` and `.log` separately — no complete artefact name, no
# listed assignment. The variable-name list is the weak point and cannot be
# closed by adding names.
#
# **#8/#9 below are the real boundary.** They run the actual launcher and check
# where the bytes land, which no spelling can evade. #5b is kept as a cheap
# first line that fails fast and points at the file, not as a proof.
#
# The two rules:
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
# #6 used to extract a single-line `ROOT="$(...)"` and eval it. The anchor is a
# multi-line block now, and rebuilding that extraction would be a third way of
# asserting the same property. The GIT_DIR hostility it existed for is folded
# into the behavioural test below (#8), which runs the REAL launcher with
# GIT_DIR pointed at a decoy — an end-to-end assertion rather than a re-implemented
# formula. #6b is kept: it proves the decoy environment is genuinely hostile, so
# a green #8 cannot be green by accident.
hostile2="$(mktemp -d)"
mkdir -p "$hostile2/decoy"
GIT_DIR="$hostile2/decoy/.git" git init -q "$hostile2/decoy" 2>/dev/null || git init -q "$hostile2/decoy" 2>/dev/null
old_got="$(
  cd "$ROOT/scripts" || exit 1
  GIT_DIR="$hostile2/decoy/.git"; export GIT_DIR
  git rev-parse --show-toplevel 2>/dev/null || pwd
)"
if [ "$old_got" = "$ROOT" ]; then
  fail "#6b the pre-fix anchor also resolved correctly — the decoy is not hostile, so #8 could pass by accident"
else
  pass "#6b the pre-fix anchor DOES break in the decoy env ('$old_got') — #8 is testing something real"
fi
export BP_DECOY_GIT_DIR="$hostile2/decoy/.git"

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

# ===========================================================================
# 7. The physical-root block is byte-identical in every consumer.
#
#    It has to be duplicated: it is the code that FINDS scripts/lib/, so it
#    cannot itself live in scripts/lib/. Duplication that cannot be removed is
#    pinned instead, or the four copies drift and A-09 comes back through
#    whichever one was forgotten.
# ===========================================================================
sig=""
n=0
for f in scripts/agent-activity.sh $DISPATCHERS; do
  [ -f "$ROOT/$f" ] || continue
  blk="$(sed -n '/^_bp_self=/,/^_bp_root=/p' "$ROOT/$f")"
  if [ -z "$blk" ]; then
    fail "#7 $f has no physical-root block — it anchors some other way"
    continue
  fi
  n=$((n + 1))
  if [ -z "$sig" ]; then sig="$blk"
  elif [ "$blk" != "$sig" ]; then
    fail "#7 $f's physical-root block has drifted from the others"
  fi
done
[ "$n" -ge 4 ] || fail "#7 only $n consumer(s) carry the block — expected at least 4 (vacuous)"
[ "$n" -ge 4 ] && pass "#7 all $n physical-root blocks are byte-identical"

# ===========================================================================
# 8/9. BEHAVIOURAL — run the REAL launcher, through an OUT-OF-TREE SYMLINK,
#      and see where state actually lands.
#
#      Codex broke the previous fix (`dirname "$0"`) with exactly this: an
#      out-of-tree symlink made the watcher try to source
#      /tmp/scripts/lib/state-dir.sh. He also observed, correctly, that the
#      grep-based guard in #5b is heuristic and that a behavioural launcher
#      test is the stronger boundary. This is that test — it does not care how
#      the path is spelled, only where the bytes end up.
#
#      It covers both remaining findings at once:
#        * symlink-safe resolution (the script is invoked through a link)
#        * dispatch-time derivation (state must land under the FIXTURE repo,
#          which did not exist when this suite started)
# ===========================================================================
WORK="$(mktemp -d)"
LINKS="$(mktemp -d)"
mkdir -p "$WORK/scripts/lib"
cp "$ROOT/scripts/start-codex-signal-watch.sh" \
   "$ROOT/scripts/codex-signal-watch.sh" \
   "$ROOT/scripts/codex-feed-filter.sh" "$WORK/scripts/" 2>/dev/null
cp "$ROOT/scripts/lib/state-dir.sh" "$WORK/scripts/lib/"

cat > "$WORK/AGENT_SIGNAL.md" <<'SIG'
| Field | Value |
|---|---|
| Holder | Jesko |
| State | OVER_TO_CODEX |
| Task | behavioural fixture |
SIG

# Stub codex: proves it ran by touching a file at an absolute path.
#
# It used to echo a marker and #9b looked for it in the run log — which failed,
# because the launcher pipes codex's stdout through codex-feed-filter.sh, whose
# job is to keep only JSON events. The marker was correctly discarded. A side
# effect the transport cannot swallow is the honest signal.
cat > "$WORK/stub-codex" <<'STUB'
#!/usr/bin/env bash
: > "$STUB_MARKER"
STUB
chmod +x "$WORK/stub-codex"

ln -s "$WORK/scripts/start-codex-signal-watch.sh" "$LINKS/launch-via-symlink.sh"

STUB_MARKER="$WORK/stub-ran"
export STUB_MARKER
# Both hostilities at once, because that is how they arrive in practice: the
# script is reached through an out-of-tree symlink AND git's repo pointer names
# a different repository (the pre-push hook exports exactly that). #6b has
# already proved the decoy defeats the old anchor.
out="$(
  CODEX_BIN="$WORK/stub-codex" \
  GIT_DIR="${BP_DECOY_GIT_DIR:-}" \
  AGENT_SIGNAL_SETTLE=0 \
  timeout 25 bash "$LINKS/launch-via-symlink.sh" --poll 1 --once 2>&1
)" || true

# The symptom Codex reported, asserted by name: a wrong root shows up as the
# launcher reaching outside the tree for the helper it must source.
case "$out" in
  *"$LINKS/scripts"*|*"No such file or directory"*)
    fail "#8 the launcher resolved its root from the SYMLINK's directory: $out" ;;
  *)
    pass "#8 the launcher invoked through an out-of-tree symlink still finds its own tree" ;;
esac

if [ -f "$WORK/logs/state/codex-runs.log" ]; then
  pass "#9 state landed under the fixture repo — the derivation ran at dispatch, not at launch"
else
  fail "#9 no run log under $WORK/logs/state — dispatch-time derivation did not happen. Output: $out"
fi

# Non-vacuity: if the stub never ran, #9 would be asserting nothing.
if [ -f "$STUB_MARKER" ]; then
  pass "#9b the dispatch really executed (the stub left its marker)"
else
  fail "#9b the stub never ran, so #9 proves nothing about a real dispatch. Output: $out"
fi

rm -rf "$WORK" "$LINKS"

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: A-09 — feed and dispatchers rendezvous on one per-project state dir."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
