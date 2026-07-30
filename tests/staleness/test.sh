#!/bin/bash
# tests/staleness/test.sh
#
# `blueprint drift` reporting that the local blueprint checkout is behind its
# remote, and offering a fast-forward only when one is genuinely safe.
#
# Every row of PLAN-A2BP-PR.md §3b.1 is a case here. The rows exist because this
# code READS AND WRITES A REPOSITORY THAT IS NOT THE ONE THE OPERATOR IS IN —
# the same shape as the direct write the PR plan removes from a2bp. It is
# acceptable only while it stays fast-forward-only, clean-tree-only, and never
# automatic, so each of those bounds is asserted rather than assumed.
#
# Uses local file:// remotes: real git, no network.
# Run from the blueprint repo root:  bash tests/staleness/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# --fast omits only the deliberate-hang case (#8), which costs a real wall-clock
# timeout and cannot be made cheaper without ceasing to test a timeout. It runs
# in full in CI. Nothing else is skipped: the offer bounds are the security-
# relevant half and they are cheap.
FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/staleness.sh"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*"; FAILED=1; }
pass() { echo "  ok — $*"; }

if [ ! -r "$LIB" ]; then
  echo "FAIL: scripts/lib/staleness.sh is missing"
  exit 1
fi
# shellcheck source=../../scripts/lib/staleness.sh
. "$LIB"

field() { printf '%s\n' "$1" | grep "^$2=" | cut -d= -f2-; }

# --- an upstream, and a clone that can fall behind it ------------------------
UP="$WORK/up"
mkdir -p "$UP"
(
  cd "$UP"
  git init -q -b main .
  git config user.email t@local; git config user.name t
  printf 'one\n' > f.txt
  git add -A && git -c commit.gpgsign=false commit -q -m one
) 2>/dev/null

fresh_clone() { # $1=dest
  git clone -q "$UP" "$1" 2>/dev/null
  git -C "$1" config user.email t@local
  git -C "$1" config user.name t
}

advance_upstream() { # $1=n commits
  local i
  for i in $(seq 1 "$1"); do
    printf 'more %s\n' "$i" >> "$UP/f.txt"
    git -C "$UP" add -A
    git -C "$UP" -c commit.gpgsign=false commit -q -m "up$i"
  done
}

# ===========================================================================
# 1. In sync — nothing to report, nothing to offer.
# ===========================================================================
C="$WORK/c1"; fresh_clone "$C"
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" status)" != "current" ]; then
  fail "#1 an up-to-date checkout reported '$(field "$out" status)'"
elif [ "$(field "$out" offer)" != "no" ]; then
  fail "#1 offered a fast-forward with nothing to fast-forward to"
else
  pass "#1 an up-to-date checkout is 'current' and offers nothing"
fi

# ===========================================================================
# 2. Behind, clean, on the tracked branch — the ONE case that may offer.
# ===========================================================================
C="$WORK/c2"; fresh_clone "$C"
advance_upstream 4
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" status)" != "behind" ]; then
  fail "#2 a checkout 4 commits behind reported '$(field "$out" status)'"
elif [ "$(field "$out" offer)" != "ff" ]; then
  fail "#2 no fast-forward offered on a clean, behind, on-branch checkout (blocker=$(field "$out" blocker))"
elif [ "$(field "$out" verified)" != "no" ]; then
  fail "#2 expected verified=no — a fresh clone has not fetched the new commits, so ancestry cannot be proved locally"
else
  pass "#2 clean + behind + on-branch offers a fast-forward, marked unverified"
fi

# The same checkout once the objects ARE present: now ancestry is provable and
# the commit count is real. Both paths must offer; only the wording differs.
git -C "$C" fetch -q origin main
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" offer)" != "ff" ] || [ "$(field "$out" verified)" != "yes" ]; then
  fail "#2c after fetching, expected a verified offer (offer=$(field "$out" offer) verified=$(field "$out" verified))"
elif [ "$(field "$out" count)" != "4" ]; then
  fail "#2c count is '$(field "$out" count)', expected 4"
else
  pass "#2c with the objects present the relation is verified and counted (4 behind)"
fi

# And the offer, when accepted, actually works and is a true fast-forward.
before=$(git -C "$C" rev-parse HEAD)
if ! bp_staleness_fast_forward "$C" main origin >/dev/null 2>&1; then
  fail "#2b the fast-forward failed"
elif [ "$(git -C "$C" rev-parse HEAD)" != "$(git -C "$UP" rev-parse HEAD)" ]; then
  fail "#2b the fast-forward did not land on the remote tip"
elif ! git -C "$C" merge-base --is-ancestor "$before" HEAD; then
  fail "#2b the previous HEAD is no longer an ancestor — that was not a fast-forward"
else
  pass "#2b the fast-forward lands on the remote tip with the old HEAD still an ancestor"
fi

# ===========================================================================
# 3. DIRTY. Untracked files count: a fast-forward that needs to write where an
#    untracked file sits fails halfway, and halfway in someone else's repo is
#    the worst outcome available.
# ===========================================================================
C="$WORK/c3"; fresh_clone "$C"; advance_upstream 1
printf 'uncommitted\n' >> "$C/f.txt"
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" offer)" != "no" ] || [ "$(field "$out" blocker)" != "dirty" ]; then
  fail "#3 a dirty tree was offered a fast-forward (blocker=$(field "$out" blocker))"
elif [ "$(field "$out" status)" != "behind" ]; then
  fail "#3 dirtiness suppressed the staleness REPORT as well as the offer — the warning is the point"
else
  pass "#3 a modified tree still gets the warning, but no offer"
fi

C="$WORK/c3b"; fresh_clone "$C"; advance_upstream 1
printf 'x\n' > "$C/untracked.txt"
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" blocker)" != "dirty" ]; then
  fail "#3b an UNTRACKED file did not block the offer (blocker=$(field "$out" blocker))"
else
  pass "#3b an untracked file blocks the offer too"
fi

# ===========================================================================
# 4. DETACHED HEAD and WRONG BRANCH — the operator is mid-something.
# ===========================================================================
C="$WORK/c4"; fresh_clone "$C"; advance_upstream 1
git -C "$C" checkout -q --detach HEAD
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" blocker)" != "detached" ] || [ "$(field "$out" offer)" != "no" ]; then
  fail "#4 a detached HEAD was offered a fast-forward (blocker=$(field "$out" blocker))"
else
  pass "#4 a detached HEAD is reported and never offered"
fi

C="$WORK/c4b"; fresh_clone "$C"; advance_upstream 1
git -C "$C" checkout -q -b side
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" blocker)" != "wrong-branch" ] || [ "$(field "$out" offer)" != "no" ]; then
  fail "#4b a checkout on another branch was offered a fast-forward (blocker=$(field "$out" blocker))"
else
  pass "#4b a checkout on a different branch is never fast-forwarded onto"
fi

# ===========================================================================
# 5. DIVERGED — local has commits the remote does not. A merge or rebase
#    decision, not a prompt.
# ===========================================================================
C="$WORK/c5"; fresh_clone "$C"
advance_upstream 1
printf 'local only\n' > "$C/local.txt"
git -C "$C" add -A
git -C "$C" -c commit.gpgsign=false commit -q -m local
git -C "$C" fetch -q origin main
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" status)" != "diverged" ]; then
  fail "#5 divergence reported as '$(field "$out" status)'"
elif [ "$(field "$out" offer)" != "no" ]; then
  fail "#5 DIVERGED WAS OFFERED A FAST-FORWARD — this would silently discard or block local commits"
else
  pass "#5 a diverged checkout is named as such and never offered"
fi

# ===========================================================================
# 6. AHEAD — local is in front. Not stale, and not something to fast-forward.
# ===========================================================================
C="$WORK/c6"; fresh_clone "$C"
printf 'ahead\n' > "$C/a.txt"
git -C "$C" add -A
git -C "$C" -c commit.gpgsign=false commit -q -m ahead
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" status)" != "ahead" ] || [ "$(field "$out" offer)" != "no" ]; then
  fail "#6 an ahead checkout reported status=$(field "$out" status) offer=$(field "$out" offer)"
else
  pass "#6 an ahead checkout is 'ahead', not 'behind', and offers nothing"
fi

# ===========================================================================
# 7. UNKNOWN, never "current". Every failure to reach the remote must report
#    ignorance. Reporting "current" because the probe failed is the single
#    worst outcome here: it is the false reassurance the whole feature exists
#    to remove.
# ===========================================================================
C="$WORK/c7"; fresh_clone "$C"
git -C "$C" remote set-url origin "$WORK/does-not-exist"
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" status)" != "unknown" ]; then
  fail "#7 an unreachable remote reported '$(field "$out" status)' — must be unknown"
elif [ "$(field "$out" blocker)" != "unreachable" ]; then
  fail "#7 blocker is '$(field "$out" blocker)', expected unreachable"
else
  pass "#7 an unreachable remote is 'unknown', never 'current'"
fi

C="$WORK/c7b"
mkdir -p "$C"
( cd "$C"; git init -q -b main .; git config user.email t@local; git config user.name t
  printf 'x\n' > f; git add -A; git -c commit.gpgsign=false commit -q -m x ) 2>/dev/null
out=$(bp_staleness_assess "$C" main)
if [ "$(field "$out" status)" != "unknown" ] || [ "$(field "$out" blocker)" != "no-remote" ]; then
  fail "#7b a repo with no remote reported status=$(field "$out" status) blocker=$(field "$out" blocker)"
else
  pass "#7b a checkout with no remote is 'unknown/no-remote', not 'current'"
fi

# A missing branch on an otherwise reachable remote is also ignorance.
C="$WORK/c7c"; fresh_clone "$C"
out=$(bp_staleness_assess "$C" no-such-branch)
if [ "$(field "$out" status)" != "unknown" ]; then
  fail "#7c a branch absent from the remote reported '$(field "$out" status)'"
else
  pass "#7c a branch the remote does not have is 'unknown'"
fi

# ===========================================================================
# 8. BOUNDED. This runs at every agent wake, usually with no TTY. A remote that
#    accepts the connection and then says nothing must not stall the wake.
# ===========================================================================
if [ "$FAST" -eq 1 ]; then
  echo "  -- #8 skipped (--fast): the hang case costs a real timeout; CI runs it"
elif [ -z "$(bp_staleness_timeout_cmd)" ]; then
  echo "  -- #8 skipped: no timeout provider on this host"
else
  C="$WORK/c8"; fresh_clone "$C"
  # The remote URL must be one git reaches over ssh, or GIT_SSH_COMMAND is never
  # invoked and the probe answers instantly from the local filesystem — which is
  # how the first version of this case "passed" a hang it never produced.
  git -C "$C" remote set-url origin "ssh://git@127.0.0.1/blackhole.git"
  # The trailing '#' matters. GIT_SSH_COMMAND is run through a shell with the
  # host and remote command appended, so a bare `sleep 60` receives
  # "git@127.0.0.1" as its interval, errors in 100ms, and the case passes
  # against a hang that never happened. Commenting out the appended arguments
  # is what produces a real one.
  start=$(date +%s%N)
  out=$(BP_STALENESS_TIMEOUT=2 GIT_SSH_COMMAND='sleep 60 #' GIT_TERMINAL_PROMPT=0 \
        bp_staleness_assess "$C" main 2>/dev/null)
  elapsed=$(( ($(date +%s%N) - start) / 1000000 ))
  if [ "$elapsed" -lt 1500 ]; then
    # Faster than the budget means the probe never actually blocked, so the
    # bound was not exercised. Assert the LOWER edge too, or this case cannot
    # tell "correctly cut off" from "never hung".
    fail "#8 returned in ${elapsed}ms with a 2s budget — the remote did not hang, so nothing was bounded"
  elif [ "$elapsed" -gt 6000 ]; then
    fail "#8 a hanging remote stalled the probe for ${elapsed}ms — this would hang every agent wake"
  elif [ "$(field "$out" status)" != "unknown" ]; then
    fail "#8 a hanging remote reported '$(field "$out" status)' instead of unknown"
  else
    pass "#8 a genuinely hanging remote is cut off at ${elapsed}ms and reported as unknown"
  fi
fi

# ===========================================================================
# 9. The fast-forward re-checks at write time. assess() read the remote seconds
#    earlier; if it moved to something non-fast-forwardable in between, the
#    checkout must be left exactly as it was.
# ===========================================================================
C="$WORK/c9"; fresh_clone "$C"
advance_upstream 1
out=$(bp_staleness_assess "$C" main)          # says offer=ff
# Now rewrite upstream history so the offer is stale and no longer valid.
git -C "$UP" reset -q --hard HEAD~2
printf 'rewritten\n' > "$UP/f.txt"
git -C "$UP" add -A
git -C "$UP" -c commit.gpgsign=false commit -q -m rewritten
before=$(git -C "$C" rev-parse HEAD)
if bp_staleness_fast_forward "$C" main origin >/dev/null 2>&1; then
  fail "#9 a no-longer-fast-forwardable remote was merged anyway"
elif [ "$(git -C "$C" rev-parse HEAD)" != "$before" ]; then
  fail "#9 the refused fast-forward still moved HEAD — it must leave the checkout untouched"
else
  pass "#9 a stale offer is refused at write time and leaves HEAD where it was"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: staleness reports honestly and only ever offers a safe fast-forward."
  exit 0
fi
echo "FAILED: staleness."
exit 1
