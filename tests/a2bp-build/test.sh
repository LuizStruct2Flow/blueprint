#!/bin/bash
# tests/a2bp-build/test.sh
#
# Building an a2bp request commit against a fetched blueprint base.
#
# The case that matters most is #2: an unrelated base entry must SURVIVE into
# the request tree. The plan's build populates an isolated index with
# `update-index --cacheinfo`, and if that index is not first seeded with
# `read-tree <base>` the resulting tree contains only the target paths — so the
# request would propose DELETING the entire blueprint except the files it
# changes. That defect survived ten plan reviews because "build the new tree
# from the base tree with the target entries replaced" reads as though it
# describes itself.
#
# Plan: docs/doing/PLAN-A2BP-PR.md §6.
# Run from the blueprint repo root:  bash tests/a2bp-build/test.sh
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

fail() { echo "FAIL: $*"; FAILED=1; }
pass() { echo "  ok — $*"; }

for lib in request.sh request-build.sh; do
  if [ ! -r "$ROOT/scripts/lib/$lib" ]; then
    echo "FAIL: scripts/lib/$lib is missing"
    exit 1
  fi
done
# shellcheck source=../../scripts/lib/request.sh
. "$ROOT/scripts/lib/request.sh"
# shellcheck source=../../scripts/lib/request-build.sh
. "$ROOT/scripts/lib/request-build.sh"

# --- a stand-in blueprint with several files, only one of which is targeted --
UP="$WORK/upstream"
mkdir -p "$UP"
(
  cd "$UP"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  mkdir -p docs scripts/lib
  printf 'the DoD\n'            > docs/DoD.md
  printf 'security recipe\n'    > docs/SECURITY.md
  printf 'unrelated helper\n'   > scripts/lib/state-dir.sh
  printf '# readme\n'           > README.md
  git add -A
  git -c commit.gpgsign=false commit -q -m base
) 2>/dev/null
BASE=$(git -C "$UP" rev-parse HEAD)

# --- scratch bare clone, as the CLI will build one --------------------------
new_bare() {
  local d="$WORK/bare$RANDOM"
  bp_request_hermetic git init -q --bare --object-format=sha1 "$d"
  bp_request_transport_env git -C "$d" fetch -q --depth 1 "$UP" main
  printf '%s' "$d"
}

spec() { # $1=path $2=mode $3=content
  local f="$WORK/spec$RANDOM"
  printf '%s' "$3" > "$f"
  printf '%s:%s:%s' "$1" "$2" "$f"
}

# ===========================================================================
# 1. A request builds, and its commit sits on the captured base.
# ===========================================================================
BARE=$(new_bare)
S1=$(spec docs/DoD.md 100644 "the DoD, improved")
C1=$(bp_build_request "$BARE" "$BASE" "a2bp/acme/test1" "acme" "$S1")
if [ -z "$C1" ]; then
  fail "#1 build produced no commit"
elif [ "$(bp_request_hermetic git -C "$BARE" rev-parse "$C1^")" != "$BASE" ]; then
  fail "#1 the commit's parent is not the captured base"
else
  pass "#1 a request commit is built on the fetched base"
fi

# ===========================================================================
# 2. THE ONE THAT MATTERS. Files the request does not touch must survive.
#    Without `read-tree <base>` seeding the index, the tree would hold only
#    docs/DoD.md and the request would propose deleting everything else.
# ===========================================================================
if [ -z "$C1" ]; then
  # Not a skip. If the build refused, the property this case exists to prove is
  # untested, and an untested property must read as a failure — a silent skip
  # here is how a suite reports green while its most important case never ran.
  fail "#2 NOT EXERCISED — no commit was built, so nothing verified that unrelated files survive"
else
  survivors=0
  for f in docs/SECURITY.md scripts/lib/state-dir.sh README.md; do
    if bp_request_hermetic git -C "$BARE" cat-file -e "$C1:$f" 2>/dev/null; then
      survivors=$((survivors+1))
    else
      fail "#2 '$f' is ABSENT from the request tree — the index was not seeded from the base, so this request would delete it"
    fi
  done
  changed=$(bp_request_hermetic git -C "$BARE" diff --name-only "$BASE" "$C1" | wc -l | tr -d ' ')
  if [ "$survivors" -eq 3 ] && [ "$changed" -eq 1 ]; then
    pass "#2 unrelated base entries survive; the diff touches exactly 1 path"
  elif [ "$changed" -ne 1 ]; then
    fail "#2 the diff touches $changed paths, expected 1 — unrelated files are being modified or deleted"
  fi
fi

# ===========================================================================
# 3. Determinism: the same inputs rebuild to the same SHA. This is what makes
#    exact-tip retry adoption possible; without it the retry always refuses.
# ===========================================================================
BARE2=$(new_bare)
S1b=$(spec docs/DoD.md 100644 "the DoD, improved")
C1b=$(bp_build_request "$BARE2" "$BASE" "a2bp/acme/test1" "acme" "$S1b")
# Emptiness is checked FIRST and separately: two failed builds both yield "",
# and "" = "" would report determinism as proven by two absences.
if [ -z "$C1" ] || [ -z "$C1b" ]; then
  fail "#3 NOT EXERCISED — a build produced no commit, so no two SHAs were compared"
elif [ "$C1" != "$C1b" ]; then
  fail "#3 rebuilding the same request gave a different SHA ($C1 vs $C1b) — retry adoption would never match"
else
  pass "#3 an identical request rebuilds to an identical SHA, in a fresh clone"
fi

# ===========================================================================
# 3b. THE REGRESSION. Determinism ACROSS A ONE-SECOND BOUNDARY.
#
# Cases #3 and #4 rebuild back-to-back, so both commits land in the same second
# — and that made them blind to the actual defect: bp_request_hermetic unsets
# GIT_AUTHOR_DATE/GIT_COMMITTER_DATE, so dates set on its command line were
# stripped and commit-tree fell back to the WALL CLOCK. Two fast runs agreed;
# the flow broke under the pre-push gate, where the runs were slow enough to
# straddle a second.
#
# `sleep 1.1` is the whole point of this case. It is the only assertion here
# that costs wall-clock, and removing it removes the regression's only witness.
# ===========================================================================
BARE_T=$(new_bare)
S_T=$(spec docs/DoD.md 100644 "the DoD, improved")
C_T1=$(bp_build_request "$BARE_T" "$BASE" "a2bp/acme/tsec" "acme" "$S_T")
sleep 1.1
BARE_T2=$(new_bare)
S_T2=$(spec docs/DoD.md 100644 "the DoD, improved")
C_T2=$(bp_build_request "$BARE_T2" "$BASE" "a2bp/acme/tsec" "acme" "$S_T2")
if [ -z "$C_T1" ] || [ -z "$C_T2" ]; then
  fail "#3b NOT EXERCISED — a build produced no commit"
elif [ "$C_T1" != "$C_T2" ]; then
  fail "#3b builds one second apart gave different SHAs ($C_T1 vs $C_T2) — the commit date is coming from the wall clock, so retry adoption refuses its own request"
else
  d1=$(bp_request_hermetic git -C "$BARE_T" show -s --format='%ct' "$C_T1")
  dbase=$(bp_request_hermetic git -C "$BARE_T" show -s --format='%ct' "$BASE")
  if [ "$d1" != "$dbase" ]; then
    fail "#3b the commit date is $d1, not the base's $dbase — it is not being taken from the base"
  else
    pass "#3b builds a second apart are identical; the date comes from the base, not the clock"
  fi
fi

# ===========================================================================
# 4. Determinism under HOSTILE ambient config. Every one of these would leak
#    into the commit if construction used a working tree or an unscrubbed env.
# ===========================================================================
BARE3=$(new_bare)
S1c=$(spec docs/DoD.md 100644 "the DoD, improved")
C1c=$(
  GIT_CONFIG_COUNT=2 \
  GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=true \
  GIT_CONFIG_KEY_1=commit.gpgsign GIT_CONFIG_VALUE_1=true \
  GIT_AUTHOR_NAME="Somebody Else" GIT_AUTHOR_EMAIL="else@example.com" \
  GIT_AUTHOR_DATE="2020-01-01T00:00:00Z" GIT_COMMITTER_DATE="2020-01-01T00:00:00Z" \
  LC_ALL=en_US.UTF-8 \
  bp_build_request "$BARE3" "$BASE" "a2bp/acme/test1" "acme" "$S1c"
)
if [ -z "$C1c" ] || [ -z "$C1" ]; then
  fail "#4 NOT EXERCISED — a build produced no commit under hostile config"
elif [ "$C1c" != "$C1" ]; then
  fail "#4 hostile config/env changed the commit SHA ($C1c vs $C1) — the scrub is not holding"
else
  pass "#4 hostile autocrlf, signing, author identity, dates and locale do not change the SHA"
fi

# ===========================================================================
# 5. Multiple files in one request, and mode is carried.
# ===========================================================================
BARE4=$(new_bare)
C2=$(bp_build_request "$BARE4" "$BASE" "a2bp/acme/test2" "acme" \
       "$(spec docs/DoD.md 100644 one)" "$(spec scripts/lib/state-dir.sh 100755 two)")
if [ -z "$C2" ]; then
  fail "#5 multi-file build failed"
elif [ "$(bp_request_hermetic git -C "$BARE4" diff --name-only "$BASE" "$C2" | wc -l | tr -d ' ')" -ne 2 ]; then
  fail "#5 expected exactly 2 changed paths"
elif [ "$(bp_request_hermetic git -C "$BARE4" ls-tree "$C2" -- scripts/lib/state-dir.sh | awk '{print $1}')" != "100755" ]; then
  fail "#5 the 100755 mode was not carried into the tree"
else
  pass "#5 a multi-file request changes exactly its paths and carries modes"
fi

# ===========================================================================
# 6. Creating a file absent from the base.
# ===========================================================================
BARE5=$(new_bare)
C3=$(bp_build_request "$BARE5" "$BASE" "a2bp/acme/test3" "acme" \
       "$(spec docs/NEWFILE.md 100644 brand-new)")
if [ -z "$C3" ]; then
  fail "#6 could not create a file absent from the base"
elif [ "$(bp_request_hermetic git -C "$BARE5" show "$C3:docs/NEWFILE.md")" != "brand-new" ]; then
  fail "#6 the created file has wrong content"
elif ! bp_request_hermetic git -C "$BARE5" cat-file -e "$C3:README.md" 2>/dev/null; then
  fail "#6 creating a file lost unrelated entries"
else
  pass "#6 a file absent from the base is created without disturbing the rest"
fi

# ===========================================================================
# 7. Base validation refuses what cannot be represented.
# ===========================================================================
BARE6=$(new_bare)
if bp_build_validate_base "$BARE6" "$BASE" docs 2>/dev/null; then
  fail "#7 a DIRECTORY at the target path was accepted"
elif ! bp_build_validate_base "$BARE6" "$BASE" docs 2>&1 | grep -qi "DIRECTORY"; then
  fail "#7 refused, but did not say a directory was in the way"
else
  pass "#7 a directory at the target path is refused, naming the reason"
fi

if ! bp_build_validate_base "$BARE6" "$BASE" docs/DoD.md docs/NEWFILE.md 2>/dev/null; then
  fail "#7b an ordinary existing file and a clean creation were refused"
else
  pass "#7b an existing regular file and a creatable path both pass"
fi

if bp_build_validate_base "$BARE6" "$BASE" README.md/nested.md 2>/dev/null; then
  fail "#7c a path whose parent is a FILE was accepted"
else
  pass "#7c a path blocked by a non-directory parent is refused"
fi

# ===========================================================================
# 8. The assertion catches a mis-seeded tree. Built by hand from an EMPTY index
#    — exactly what the missing read-tree would have produced.
# ===========================================================================
BARE7=$(new_bare)
CF="$WORK/mis"; printf 'mis-seeded\n' > "$CF"
BAD_IDX="$BARE7/bad-index"; rm -f "$BAD_IDX"
BLOB=$(bp_request_hermetic git -C "$BARE7" hash-object -w --no-filters --stdin < "$CF")
GIT_INDEX_FILE="$BAD_IDX" bp_request_hermetic git -C "$BARE7" update-index --add --cacheinfo "100644,$BLOB,docs/DoD.md"
BAD_TREE=$(GIT_INDEX_FILE="$BAD_IDX" bp_request_hermetic git -C "$BARE7" write-tree)
# The identity must be supplied explicitly: the hermetic env scrubs global
# config, so commit-tree has no user.email to fall back on. That the fixture
# needs this is itself evidence the scrub is working.
BAD_COMMIT=$(printf 'mis-seeded\n' | \
  GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@local \
  GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@local \
  bp_request_hermetic git -C "$BARE7" commit-tree "$BAD_TREE" -p "$BASE")

if bp_build_assert "$BARE7" "$BASE" "$BAD_COMMIT" "docs/DoD.md:100644:$CF" 2>/dev/null; then
  fail "#8 the assertion PASSED a tree built from an unseeded index — it would not have caught the deletion defect"
elif ! bp_build_assert "$BARE7" "$BASE" "$BAD_COMMIT" "docs/DoD.md:100644:$CF" 2>&1 | grep -qi "different set of paths"; then
  fail "#8 refused, but not for the changed-path-set reason"
else
  pass "#8 the assertion catches an unseeded index — the defect that survived ten plan reviews"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: request commits are deterministic, minimal, and assert their own diff."
  exit 0
fi
echo "FAILED: a2bp request build."
exit 1
