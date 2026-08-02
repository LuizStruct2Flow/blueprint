#!/bin/bash
# tests/a2bp-inputs/test.sh
#
# Config validation and input validation for `blueprint a2bp` — the two things
# that decide WHERE a request is filed and WHICH bytes go into it.
#
# a2bp is the only write path from a derived project into the generic blueprint,
# and it is how BUG-002 and A-09 both got in. The contamination guard checks what
# the content says; this checks that the content came from the file the operator
# named, and that the request is going to the repository they meant.
#
# Plan: docs/doing/PLAN-A2BP-PR.md §5.1, §8.
# Run from the blueprint repo root:  bash tests/a2bp-inputs/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers. Git exports GIT_DIR to every hook,
# the pre-push gate runs this suite, and the fixtures below use `git init` inside
# a `cd`ed subshell. With GIT_DIR set, `cd` protects nothing: the fixture's
# commits and config writes land in the REAL repository. This suite must be safe
# run from anywhere, so it strips them itself rather than trusting its caller.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY


ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*"; FAILED=1; BLOCK=1; }
pass() { echo "  ok — $*"; }

# For blocks that assert several things and report once. Guarding that report
# with the GLOBAL failure flag is a trap: an unrelated earlier failure then
# suppresses the line entirely, so the block reads as neither passed nor failed
# and its result is silently unknown. BLOCK is reset per block instead.
block() { BLOCK=0; }
block_pass() { [ "$BLOCK" -eq 0 ] && pass "$*"; }

for lib in request.sh request-config.sh request-inputs.sh; do
  if [ ! -r "$ROOT/scripts/lib/$lib" ]; then
    echo "FAIL: scripts/lib/$lib is missing"
    exit 1
  fi
done
# shellcheck source=../../scripts/lib/request.sh
. "$ROOT/scripts/lib/request.sh"
# shellcheck source=../../scripts/lib/request-config.sh
. "$ROOT/scripts/lib/request-config.sh"
# shellcheck source=../../scripts/lib/request-inputs.sh
. "$ROOT/scripts/lib/request-inputs.sh"

# ===========================================================================
# PART 1 — configuration (§8)
# ===========================================================================

CFG="$WORK/cfg"

write_cfg() { printf '%s\n' "$@" > "$CFG"; }

# --- 1. A version 1 config must REFUSE, not guess a destination. ------------
# This is the case that matters most in the whole file: every project in
# existence has a version 1 config, so this path runs for all of them first.
write_cfg "blueprint_source = /somewhere" "bootstrap_sha    = abc"
if bp_config_load "$CFG" >/dev/null 2>&1; then
  fail "#1 a version 1 config was ACCEPTED — a2bp would push to a guessed remote"
elif ! bp_config_load "$CFG" 2>&1 | grep -q "config_version   = 2"; then
  fail "#1 refused without printing the exact lines to add"
elif ! bp_config_load "$CFG" 2>&1 | grep -qi "not recoverable\|not a recoverable"; then
  fail "#1 refused without saying why inference is not offered"
else
  pass "#1 a version 1 config refuses and prints the exact lines to add"
fi

# --- 1b. And it emits NO remote at all. -------------------------------------
# The property is about the emitted value, not the prose: the refusal text
# legitimately contains the word "inferred" while explaining why it refuses to
# infer, so grepping the message tests the wording rather than the behaviour.
# What must hold is that a v1 config yields no BP_CFG_REMOTE for any caller to
# eval, so there is nothing to push to even if the exit status were ignored.
if bp_config_load "$CFG" 2>/dev/null | grep -q "^BP_CFG_REMOTE="; then
  fail "#1b a version 1 config still emitted BP_CFG_REMOTE — a caller ignoring the exit status would push somewhere"
else
  pass "#1b a version 1 config emits no remote for any caller to use"
fi

# --- 2. A well-formed v2 config loads. --------------------------------------
write_cfg "config_version   = 2" \
          "blueprint_remote = git@github.com:Owner/bp.git" \
          "blueprint_branch = main"
out=$(bp_config_load "$CFG" 2>&1)
if [ $? -ne 0 ]; then
  fail "#2 a valid v2 config was refused: $out"
else
  eval "$out"
  if [ "$BP_CFG_REMOTE" != "git@github.com:Owner/bp.git" ] || [ "$BP_CFG_BRANCH" != "main" ]; then
    fail "#2 parsed remote='$BP_CFG_REMOTE' branch='$BP_CFG_BRANCH'"
  else
    pass "#2 a valid v2 config yields the declared remote and branch"
  fi
fi

# --- 2b. branch defaults to main only under v2. -----------------------------
write_cfg "config_version   = 2" "blueprint_remote = git@github.com:Owner/bp.git"
out=$(bp_config_load "$CFG" 2>/dev/null)
eval "$out" 2>/dev/null
if [ "${BP_CFG_BRANCH:-}" != "main" ]; then
  fail "#2b absent blueprint_branch did not default to main (got '${BP_CFG_BRANCH:-}')"
else
  pass "#2b an absent branch defaults to main under v2"
fi

# --- 3. An UNKNOWN FUTURE version refuses, naming both numbers. -------------
write_cfg "config_version   = 99" "blueprint_remote = git@github.com:Owner/bp.git"
if bp_config_load "$CFG" >/dev/null 2>&1; then
  fail "#3 config_version 99 was accepted by a CLI that understands 2"
elif ! bp_config_load "$CFG" 2>&1 | grep -q "99"; then
  fail "#3 the refusal does not name the version found"
elif ! bp_config_load "$CFG" 2>&1 | grep -q "up to 2\|up to$"; then
  fail "#3 the refusal does not name the version supported"
else
  pass "#3 a future config_version refuses, naming both numbers"
fi

# --- 4. Empty / missing / malformed fields all refuse. ----------------------
block
write_cfg "config_version   = 2" "blueprint_remote = "
bp_config_load "$CFG" >/dev/null 2>&1 && fail "#4 an empty blueprint_remote was accepted"
write_cfg "config_version   = 2"
bp_config_load "$CFG" >/dev/null 2>&1 && fail "#4 a missing blueprint_remote was accepted"
write_cfg "config_version   = two" "blueprint_remote = x"
bp_config_load "$CFG" >/dev/null 2>&1 && fail "#4 a non-numeric config_version was accepted"
write_cfg "config_version   = 2" "blueprint_remote = x" "blueprint_branch = has space"
bp_config_load "$CFG" >/dev/null 2>&1 && fail "#4 an invalid branch name was accepted"
bp_config_load "$WORK/nope" >/dev/null 2>&1 && fail "#4 a missing config file was accepted"
block_pass "#4 empty/missing remote, non-numeric version, bad branch, missing file all refuse"

# --- 4b. THE BOOTSTRAP PLACEHOLDER. -----------------------------------------
# new-project.sh writes `blueprint_remote = FILL-ME-IN` deliberately rather than
# guessing a remote, so this is the NORMAL state of every freshly bootstrapped
# project — and it is non-empty, so the emptiness check in #4 waves it straight
# through. Unrejected, a2bp would try to push to a repository literally named
# FILL-ME-IN and fail with a transport error naming neither the file nor the
# field. A placeholder that validates is worse than no placeholder.
block
for ph in "FILL-ME-IN" "git@github.com:<owner>/<blueprint>.git"; do
  write_cfg "config_version   = 2" "blueprint_remote = $ph"
  if bp_config_load "$CFG" >/dev/null 2>&1; then
    fail "#4b the bootstrap placeholder '$ph' was accepted as a push destination"
  elif ! bp_config_load "$CFG" 2>&1 | grep -qi "placeholder"; then
    fail "#4b refused '$ph' without saying it is a placeholder"
  fi
done
block_pass "#4b the bootstrap placeholder is refused, naming itself as a placeholder"

# And the value new-project.sh actually writes is the one that gets rejected —
# asserted against the script rather than a copy of the string, so the two
# cannot drift apart into a config that bootstraps unusable and validates fine.
if [ -r "$ROOT/scripts/new-project.sh" ]; then
  bootstrap_remote=$(grep -m1 '^blueprint_remote' "$ROOT/scripts/new-project.sh" | sed 's/^[^=]*=[[:space:]]*//')
  if [ -z "$bootstrap_remote" ]; then
    fail "#4c could not find the blueprint_remote line new-project.sh writes"
  else
    write_cfg "config_version   = 2" "blueprint_remote = $bootstrap_remote"
    if bp_config_load "$CFG" >/dev/null 2>&1; then
      fail "#4c new-project.sh writes '$bootstrap_remote', which bp_config_load ACCEPTS — a fresh project would push to it"
    else
      pass "#4c the exact placeholder new-project.sh writes is the one the validator refuses"
    fi
  fi
fi

# ===========================================================================
# PART 2 — input validation (§5.1)
# ===========================================================================

PROJ="$WORK/proj"
mkdir -p "$PROJ/docs" "$PROJ/scripts/lib"
printf 'dod\n'       > "$PROJ/docs/DoD.md"
printf 'sec\n'       > "$PROJ/docs/SECURITY.md"
printf 'helper\n'    > "$PROJ/scripts/lib/state-dir.sh"
chmod +x "$PROJ/scripts/lib/state-dir.sh"
printf 'private\n'   > "$PROJ/project_config_dod.md"

MANAGED="$WORK/managed"
printf '%s\n' docs/DoD.md docs/SECURITY.md scripts/lib/state-dir.sh > "$MANAGED"

# --- 5. The happy path: sorted, de-duplicated, modes detected. -------------
out=$(bp_inputs_validate "$PROJ" "$MANAGED" docs/SECURITY.md docs/DoD.md 2>&1)
expected="docs/DoD.md:100644
docs/SECURITY.md:100644"
if [ "$out" != "$expected" ]; then
  fail "#5 unexpected output:
$out"
else
  pass "#5 inputs come back sorted with modes attached"
fi

out=$(bp_inputs_validate "$PROJ" "$MANAGED" scripts/lib/state-dir.sh 2>&1)
if [ "$out" != "scripts/lib/state-dir.sh:100755" ]; then
  fail "#5b an executable file was not recorded as 100755: $out"
else
  pass "#5b the executable bit becomes 100755"
fi

# --- 6. CANONICALISATION happens before the managed-list check and before
#        sorting, so one file named two ways is one request, not two.
# ===========================================================================
out=$(bp_inputs_validate "$PROJ" "$MANAGED" ./docs/DoD.md docs/../docs/DoD.md docs//DoD.md 2>&1)
if [ "$out" != "docs/DoD.md:100644" ]; then
  fail "#6 three spellings of one path did not collapse to one entry:
$out"
else
  pass "#6 './x', 'a/../x' and 'a//x' canonicalise and de-duplicate to one entry"
fi

# Argument ORDER must not change the result — the request key is a pure function
# of this list, so two orderings would otherwise file two unrelated branches for
# the same change.
a=$(bp_inputs_validate "$PROJ" "$MANAGED" docs/DoD.md docs/SECURITY.md 2>&1)
b=$(bp_inputs_validate "$PROJ" "$MANAGED" docs/SECURITY.md docs/DoD.md 2>&1)
if [ "$a" != "$b" ]; then
  fail "#6b argument order changed the spec list — the same change would file two branches"
else
  pass "#6b argument order does not change the spec list"
fi

# --- 7. ESCAPING the project root refuses, and is not clamped. -------------
# Clamping '../../etc/passwd' to 'etc/passwd' would quietly file a different
# file that might well exist, instead of the refusal the operator needs.
block
for bad in ../outside.md ../../etc/passwd docs/../../escape.md /etc/passwd; do
  if bp_inputs_validate "$PROJ" "$MANAGED" "$bad" >/dev/null 2>&1; then
    fail "#7 '$bad' was accepted"
  fi
done
if bp_inputs_canonicalise ../../etc/passwd 2>&1 | grep -q "^etc/passwd"; then
  fail "#7 '../../etc/passwd' was CLAMPED to 'etc/passwd' instead of refused"
fi
block_pass "#7 paths escaping the root are refused, never clamped"

# --- 8. A SYMLINK at the target refuses. -----------------------------------
# `[ -f ]` follows symlinks, so a symlink to a regular file passes the
# regular-file test. Filing through it would send bytes from a location the
# operator never named while the PR displays the path they did.
printf 'SECRET=abc123\n' > "$WORK/elsewhere.env"
ln -sf "$WORK/elsewhere.env" "$PROJ/docs/SECURITY.md.link"
mv "$PROJ/docs/SECURITY.md" "$PROJ/docs/SECURITY.md.real"
ln -sf "$WORK/elsewhere.env" "$PROJ/docs/SECURITY.md"
if bp_inputs_validate "$PROJ" "$MANAGED" docs/SECURITY.md >/dev/null 2>&1; then
  fail "#8 A SYMLINK WAS ACCEPTED — bytes from an unnamed location would be filed"
elif ! bp_inputs_validate "$PROJ" "$MANAGED" docs/SECURITY.md 2>&1 | grep -qi "symlink"; then
  fail "#8 refused, but not for the symlink reason"
else
  pass "#8 a symlink at the target is refused, naming the reason"
fi
rm -f "$PROJ/docs/SECURITY.md" "$PROJ/docs/SECURITY.md.link"
mv "$PROJ/docs/SECURITY.md.real" "$PROJ/docs/SECURITY.md"

# --- 9. Unmanaged, missing, directory, unreadable. -------------------------
if bp_inputs_validate "$PROJ" "$MANAGED" project_config_dod.md >/dev/null 2>&1; then
  fail "#9 an unmanaged project-specific file was accepted for back-propagation"
elif ! bp_inputs_validate "$PROJ" "$MANAGED" project_config_dod.md 2>&1 | grep -q "project_config"; then
  fail "#9 the refusal does not point at project_config_*.md"
else
  pass "#9 an unmanaged file is refused, pointing at project_config_*.md"
fi

printf '%s\n' docs > "$WORK/managed-dir"
if bp_inputs_validate "$PROJ" "$WORK/managed-dir" docs >/dev/null 2>&1; then
  fail "#9b a directory was accepted"
else
  pass "#9b a directory is refused"
fi

printf '%s\n' docs/GONE.md > "$WORK/managed-gone"
if bp_inputs_validate "$PROJ" "$WORK/managed-gone" docs/GONE.md >/dev/null 2>&1; then
  fail "#9c a nonexistent file was accepted"
else
  pass "#9c a nonexistent file is refused"
fi

# --- 10. ANY refusal fails the WHOLE call. --------------------------------
# A request is filed as one unit. Proceeding with the valid subset would file
# something the operator did not ask for, under a branch name that claims to
# describe what they did.
if bp_inputs_validate "$PROJ" "$MANAGED" docs/DoD.md project_config_dod.md >/dev/null 2>&1; then
  fail "#10 a mixed valid/invalid list SUCCEEDED — a partial request would be filed"
else
  pass "#10 one bad path fails the whole call; no partial request"
fi

# ===========================================================================
# PART 3 — no-op detection (§5.1, last two rows)
# ===========================================================================
UP="$WORK/up"
mkdir -p "$UP"
(
  cd "$UP"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  mkdir -p docs
  printf 'dod\n' > docs/DoD.md
  printf 'CHANGED\n' > docs/SECURITY.md
  git add -A && git -c commit.gpgsign=false commit -q -m base
) 2>/dev/null
BARE="$WORK/bare"
bp_request_hermetic git init -q --bare --object-format=sha1 "$BARE"
bp_request_transport_env git -C "$BARE" fetch -q --depth 1 "$UP" main
BASE=$(bp_request_hermetic git -C "$BARE" rev-parse FETCH_HEAD)

# docs/DoD.md is identical to the base; docs/SECURITY.md differs.
S_SAME="docs/DoD.md:100644:$PROJ/docs/DoD.md"
S_DIFF="docs/SECURITY.md:100644:$PROJ/docs/SECURITY.md"

# --- 11. Every input already identical → refuse with a distinct status. ----
# An empty PR costs a reviewer the same attention as a real one, and reviewer
# attention is the scarce resource this whole design protects.
bp_inputs_drop_unchanged "$BARE" "$BASE" "$S_SAME" >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  fail "#11 an all-no-op request succeeded — it would file an empty PR"
elif [ "$rc" -ne 2 ]; then
  fail "#11 expected the distinct status 2 for 'nothing to request', got $rc"
else
  pass "#11 an all-no-op request refuses with its own distinct status"
fi

# --- 12. PARTIAL no-op → drop the unchanged, report it, proceed. -----------
out=$(bp_inputs_drop_unchanged "$BARE" "$BASE" "$S_SAME" "$S_DIFF" 2>"$WORK/err")
rc=$?
if [ "$rc" -ne 0 ]; then
  fail "#12 a partial no-op failed entirely (rc=$rc)"
elif [ "$out" != "$S_DIFF" ]; then
  fail "#12 expected only the changed spec to survive, got: $out"
elif ! grep -q "dropped (identical to the blueprint): docs/DoD.md" "$WORK/err"; then
  fail "#12 the dropped file was not REPORTED — a silent drop files less than the operator asked for"
else
  pass "#12 an unchanged file is dropped, reported by name, and the rest proceed"
fi

# --- 13. A MODE-ONLY change is a real request. ----------------------------
# The mode travels in the request key, so flipping the executable bit is a
# genuine change to propose even when the bytes are identical.
chmod +x "$PROJ/docs/DoD.md"
out=$(bp_inputs_drop_unchanged "$BARE" "$BASE" "docs/DoD.md:100755:$PROJ/docs/DoD.md" 2>/dev/null)
rc=$?
chmod -x "$PROJ/docs/DoD.md"
if [ "$rc" -ne 0 ]; then
  fail "#13 a mode-only change was dropped as a no-op"
else
  pass "#13 a mode-only change survives as a real request"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: a2bp validates its destination and its inputs before anything leaves."
  exit 0
fi
echo "FAILED: a2bp inputs/config."
exit 1
