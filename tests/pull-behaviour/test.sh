#!/bin/bash
# tests/pull-behaviour/test.sh
#
# BUG-016 and BUG-018 — two defects in `blueprint pull`, both reported from
# linkedin-watcher-agent (PR #4) and both reproduced here before fixing.
#
# BUG-016 — a SINGLE-FILE pull advances bootstrap_sha to blueprint HEAD.
#   `blueprint pull docs/DoD.md` updates the recorded sync point as though the
#   whole project had been synced. Every later `drift` then reports "0 commits
#   since sync" while the project is still behind on every other managed file.
#   The lie is durable: nothing else recomputes that number, so the project
#   looks current until someone diffs by hand.
#
# BUG-018 — interactive pull dies on /dev/tty with no TTY.
#   `read -r ans </dev/tty` is unguarded, so in any non-interactive context
#   (CI, a spawned agent, a piped run) pull prints the diff and then crashes
#   with "No such device or address". `drift` already degrades gracefully and
#   is pinned by a test; pull should match rather than differing by accident.
#
# BUG-017 was reported alongside these and does NOT reproduce at HEAD — see
# tests/pull-behaviour/README-BUG-017.md for the evidence.
#
# Run from the blueprint repo root:  bash tests/pull-behaviour/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# --- a minimal blueprint with TWO managed files and two commits -------------
BP="$TMP/bp"
mkdir -p "$BP/docs" "$BP/scripts"
printf '# DoD\nowner {{PROJECT_NAME}}\nversion two\n' >"$BP/docs/DoD.md"
printf '# CLAUDE\nfor {{PROJECT_NAME}}\n'            >"$BP/CLAUDE.md"
cp "$ROOT/scripts/blueprint" "$BP/scripts/blueprint"
cp -r "$ROOT/scripts/lib" "$BP/scripts/lib"
touch "$BP/.blueprint-root"
git -C "$BP" init -q
git -C "$BP" add -A
git -C "$BP" -c user.email=t@l -c user.name=t commit -q -m one
FIRST=$(git -C "$BP" rev-parse HEAD)
printf '# CLAUDE\nfor {{PROJECT_NAME}}\nsecond commit\n' >"$BP/CLAUDE.md"
git -C "$BP" add -A
git -C "$BP" -c user.email=t@l -c user.name=t commit -q -m two
HEADSHA=$(git -C "$BP" rev-parse HEAD)

new_project(){
  local P="$1"
  rm -rf "$P"; mkdir -p "$P/docs"
  printf '# DoD\nowner proj\nOLD\n' >"$P/docs/DoD.md"
  printf '# CLAUDE\nfor proj\n'     >"$P/CLAUDE.md"
  {
    printf 'blueprint_source = %s\n' "$BP"
    printf 'bootstrap_sha    = %s\n' "$FIRST"
    printf 'bootstrap_date   = 2026-01-01\n'
  } >"$P/.blueprint-source"
  git -C "$P" init -q
  git -C "$P" add -A
  git -C "$P" -c user.email=t@l -c user.name=t commit -q -m init
}

sha_of(){ grep '^bootstrap_sha' "$1/.blueprint-source" | cut -d= -f2- | tr -d ' '; }

# ===========================================================================
# 1. BUG-018 — a pull with no TTY must not crash on /dev/tty.
#    It may refuse, it may skip, it may require --yes. It must not die with a
#    device error after already printing the diff.
# ===========================================================================
P="$TMP/p18"
new_project "$P"
out=$( cd "$P" && bash "$BP/scripts/blueprint" pull docs/DoD.md </dev/null 2>&1 )
rc=$?
if printf '%s' "$out" | grep -q '/dev/tty'; then
  fail "#1 pull crashed on /dev/tty with no terminal — it must degrade, as drift already does. Output tail:
$(printf '%s' "$out" | tail -3)"
elif [ "$rc" -ne 0 ] && ! printf '%s' "$out" | grep -qiE 'not interactive|no terminal|--yes'; then
  fail "#1 pull failed with no TTY but never said why (rc=$rc):
$(printf '%s' "$out" | tail -3)"
else
  pass "#1 with no TTY, pull degrades with an actionable message instead of a device error"
fi

# ===========================================================================
# 2. BUG-016 — pulling ONE file must not claim the project is fully synced.
#    The project is still behind on CLAUDE.md, so bootstrap_sha must NOT be
#    blueprint HEAD.
# ===========================================================================
P="$TMP/p16"
new_project "$P"
( cd "$P" && bash "$BP/scripts/blueprint" pull --yes docs/DoD.md ) </dev/null >/dev/null 2>&1
got=$(sha_of "$P")
still_behind=0
diff -q "$P/CLAUDE.md" "$BP/CLAUDE.md" >/dev/null 2>&1 || still_behind=1

if [ "$still_behind" -ne 1 ]; then
  fail "#2 fixture broken — CLAUDE.md is not behind, so the assertion is meaningless"
elif [ "$got" = "$HEADSHA" ]; then
  fail "#2 a single-file pull advanced bootstrap_sha to blueprint HEAD ($HEADSHA) while CLAUDE.md is still behind — every later drift reports 0 commits since sync"
elif [ "$got" = "$FIRST" ]; then
  pass "#2 a single-file pull leaves bootstrap_sha alone; drift still reports the real gap"
else
  fail "#2 bootstrap_sha became an unexpected value: $got"
fi

# ===========================================================================
# 3. A FULL pull (no path arguments) SHOULD advance bootstrap_sha — otherwise
#    the fix for #2 would break the normal sync and leave every project
#    permanently reporting drift it no longer has.
# ===========================================================================
P="$TMP/pfull"
new_project "$P"
( cd "$P" && bash "$BP/scripts/blueprint" pull --yes ) </dev/null >/dev/null 2>&1
got=$(sha_of "$P")
if [ "$got" = "$HEADSHA" ]; then
  pass "#3 a full pull still advances bootstrap_sha to blueprint HEAD"
else
  fail "#3 a full pull did NOT advance bootstrap_sha (got $got, want $HEADSHA) — the #2 fix broke normal syncing"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-016/BUG-018 — pull records only what it synced, and survives no TTY."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
