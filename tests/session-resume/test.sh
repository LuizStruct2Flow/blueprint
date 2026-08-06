#!/bin/bash
# tests/session-resume/test.sh
#
# FEATURE-003 — a woken session must be able to DERIVE where it is, and an
# INCOMPLETE replay must be LOUD.
#
# Every case that can be wrong asserts BOTH halves: the text a human reads, and a
# non-zero exit a script can branch on. A warning printed beside exit 0 is the
# BUG-018 shape (a refusal that returned 0, so a caller read "sync succeeded"
# while nothing had been pulled) and is not accepted here.
#
# WHAT "INCOMPLETE" CAN MEAN, which is less than it sounds. Events are replayed
# from logs/state/signal-history.log, which is append-only and which nothing
# truncates. So a replay cannot be silently short, and "incomplete" reduces to
# two states: NO MARKER (#5), or the prose and the journal DISAGREE (#2, #11).
#
# This suite used to be twice this size, and the other half guarded a probe
# written into the activity feed. That probe is gone: the replay never read the
# feed, and the feed is truncated on every daemon start — so the probe's warning
# fired on the ordinary path, which is noise, and noise gets muted. #1 now
# asserts the opposite of what it once did.
#
# Ordering is POSITIONAL, never by timestamp. This host's clock jumped BACKWARDS
# during 2026-08-03 — entries stamped 19:47 sit earlier in the file than entries
# stamped 14:39. Case #4 pins that.
#
# Run from the blueprint repo root:  bash tests/session-resume/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESUME="$ROOT/scripts/session-resume.sh"
FAILED=0

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -f "$RESUME" ] || { echo "FAIL: missing $RESUME"; exit 1; }

# BUG-014 — git exports these to every hook, and a fixture that inherits them
# does its `git init` and its commits in the REAL repository. The suite that
# proved the gate arms is what disarmed it on 2026-08-02.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY
# The dispatch watcher exports these into everything it launches, so a fixture
# can silently read and write the LIVE baton. That is how a fixture dispatched
# the real Codex against a test task on 2026-08-03.
unset AGENT_SIGNAL_FILE AGENT_STATE_HOME AGENT_FEED_LOG

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

n=0
# fixture — a throwaway project tree with a git history, the four lifecycle
# folders, a baton, a journal and a feed. Prints its path.
fixture(){
  n=$((n + 1))
  d="$WORK/p$n"
  mkdir -p "$d/docs/backlog" "$d/docs/doing" "$d/docs/waiting-acceptance" \
           "$d/docs/done" "$d/logs/state"

  printf '| # | Item |\n|---|---|\n| **TASK-100** | parked |\n| **BUG-101** | parked |\n' \
    >"$d/docs/backlog/BACKLOG.md"
  printf '| # | Item |\n|---|---|\n| **FEATURE-003** | building |\n' \
    >"$d/docs/doing/BACKLOG.md"
  printf '| # | Item |\n|---|---|\n| **TASK-008** | landed |\n' \
    >"$d/docs/waiting-acceptance/BACKLOG.md"
  printf '| # | Bug |\n|---|---|\n| **BUG-001** | accepted |\n' \
    >"$d/docs/done/BUGS.md"
  printf '# HANDOVER\n\nWIP prose.\n' >"$d/docs/doing/HANDOVER.md"

  printf '| Field | Value |\n|---|---|\n| Holder | Eto |\n| State | ACTIVE |\n| Task | fixture task |\n| Last update | 2026-08-06 |\n' \
    >"$d/logs/state/signal.md"
  : >"$d/logs/state/signal-history.log"
  : >"$d/logs/agent-activity.log"

  (
    cd "$d" || exit 1
    git init -q . >/dev/null 2>&1
    git config user.email 'fixture@example.invalid'
    git config user.name 'Fixture'
    git config commit.gpgsign false
    git add -A >/dev/null 2>&1
    git commit -qm 'TASK#0: fixture base' >/dev/null 2>&1
  )
  printf '%s' "$d"
}

# journal EVENT... — append ordinary baton flips to the durable journal.
journal(){
  d="$1"; shift
  for line in "$@"; do
    printf '[2026-08-06T10:00:00Z] %s\n' "$line" >>"$d/logs/state/signal-history.log"
  done
}

resume(){ bash "$RESUME" --root "$1" 2>&1; }
resume_rc(){ bash "$RESUME" --root "$1" >/dev/null 2>&1; echo "$?"; }

# ===========================================================================
# 1. A HEALTHY RESUME IS SILENT AND EXITS 0 — including after the activity feed
#    has been truncated, which `agent-activity.sh --daemon` does on EVERY start,
#    and the daemon starts on every wake.
#
#    This case is the inverse of what it used to assert. The first design wrote a
#    probe into the feed and warned when it was gone, on the reasoning that the
#    feed's loss meant the window's rich detail was lost. Two things were wrong
#    with that, and no amount of hardening would have fixed either:
#
#      * the replay is read from the JOURNAL, which nothing truncates, so the
#        feed was never the data source — only the thing being checked;
#      * the feed is truncated on every wake, so the warning fired on the
#        ORDINARY path. A warning that always fires is noise, noise gets muted,
#        and a muted tool detects nothing.
#
#    So a truncated feed is now correctly a NON-EVENT, and this asserts it.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
journal "$p" "Holder=Jesko State=OVER_TO_CODEX Task=review the plan"
: >"$p/logs/agent-activity.log"          # the daemon restarted, as it always does
out="$(resume "$p")"
rc="$(resume_rc "$p")"
if printf '%s' "$out" | grep -q '⚠'; then
  fail "#1 a healthy resume warned after an ordinary daemon restart — the tool cries wolf: [$out]"
elif [ "$rc" != "0" ]; then
  fail "#1 a healthy, complete replay exited $rc instead of 0"
elif ! printf '%s' "$out" | grep -q 'review the plan'; then
  fail "#1 the journal events were not replayed: [$out]"
else
  pass "#1 a truncated feed is a non-event: silent, exit 0, journal replayed"
fi

# ===========================================================================
# 2. HEADER AND JOURNAL DISAGREE. HANDOVER.md says <Y>, the journal's open
#    marker is <X> — the two were written independently, so one of them is a
#    claim nobody backed. This is the case that went undetected twice on
#    2026-08-05, when HANDOVER.md was rewritten to be true and went stale
#    again inside the same working session.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
sed -i 's/session-marker: [0-9a-f]*/session-marker: deadbeef/' "$p/docs/doing/HANDOVER.md"
out="$(resume "$p")"
rc="$(resume_rc "$p")"
if ! printf '%s' "$out" | grep -q 'deadbeef'; then
  fail "#2 the disagreement did not name the id HANDOVER.md claims: [$out]"
elif ! printf '%s' "$out" | grep -qi 'independently\|disagree\|does not match'; then
  fail "#2 the two markers disagree and nothing said so: [$out]"
elif ! printf '%s' "$out" | grep -qi 'trust'; then
  fail "#2 the warning does not say which source to trust: [$out]"
elif [ "$rc" = "0" ]; then
  fail "#2 an untrusted snapshot exited 0"
else
  pass "#2 a header/journal disagreement is named, adjudicated and exits non-zero"
fi

# ===========================================================================
# 3. TWO SNAPSHOTS — replay starts at the LATER open marker, not the first one.
#    A reader that greps for "the marker" and takes the first hit replays the
#    whole day and buries the live window.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
journal "$p" "Holder=A State=ACTIVE Task=BEFORE-THE-SECOND-SNAPSHOT"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
journal "$p" "Holder=B State=ACTIVE Task=AFTER-THE-SECOND-SNAPSHOT"
printf '10:05:00 [B] working\n' >>"$p/logs/agent-activity.log"
out="$(resume "$p")"
if printf '%s' "$out" | grep -q 'BEFORE-THE-SECOND-SNAPSHOT'; then
  fail "#3 replay reached back past the later marker: [$out]"
elif ! printf '%s' "$out" | grep -q 'AFTER-THE-SECOND-SNAPSHOT'; then
  fail "#3 replay did not include the events in the live window: [$out]"
else
  pass "#3 replay starts at the LATER open marker"
fi

# ===========================================================================
# 4. THE CLOCK MOVED BACKWARDS between the snapshot and the events. Ordering is
#    POSITIONAL — a marker is a position in an append-only file — so events
#    stamped EARLIER than the marker must still be replayed. Any implementation
#    that filters on "timestamp > marker time" silently drops them, and this
#    host has actually done it.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
printf '[1999-01-01T00:00:00Z] Holder=C State=ACTIVE Task=CLOCK-WENT-BACKWARDS\n' \
  >>"$p/logs/state/signal-history.log"
printf '10:05:00 [C] working\n' >>"$p/logs/agent-activity.log"
out="$(resume "$p")"
if ! printf '%s' "$out" | grep -q 'CLOCK-WENT-BACKWARDS'; then
  fail "#4 an event stamped before the marker was dropped — ordering is by clock, not position: [$out]"
else
  pass "#4 replay is positional, so a backwards clock does not lose events"
fi

# ===========================================================================
# 5. NO MARKER AT ALL — a fresh clone, or a journal that was lost. Resume must
#    SAY SO. Printing an empty replay here is the exact "silence looks like
#    success" failure, and it is the most likely one: a fresh checkout has no
#    journal, so this is what every first run looks like.
# ===========================================================================
p="$(fixture)"
journal "$p" "Holder=D State=ACTIVE Task=orphan event"
out="$(resume "$p")"
rc="$(resume_rc "$p")"
if ! printf '%s' "$out" | grep -qi 'no snapshot marker\|no marker'; then
  fail "#5 a journal with no marker printed no explanation: [$out]"
elif [ "$rc" = "0" ]; then
  fail "#5 nothing is being replayed and resume still exited 0"
else
  pass "#5 a missing marker is stated outright and exits non-zero"
fi

# ===========================================================================
# 6. UNCOMMITTED WORK UNDER AN UNTRUSTED SNAPSHOT IS RECOVERABLE. When the
#    snapshot cannot be trusted the instinct is to roll back, and the safe form
#    of that is `git stash push`, never `checkout --`. Both clear the tree; only
#    one is reversible when the judgement was wrong — and an untrusted snapshot
#    is LOW CONFIDENCE about the work, which is exactly when destroying it is
#    least defensible.
#
#    Asserted BEHAVIOURALLY (the content round-trips), not by grepping the
#    source for forbidden commands, so a future "simplification" to
#    `checkout --` fails here rather than passing a string check.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
printf 'PRECIOUS UNCOMMITTED WORK\n' >"$p/docs/doing/PLAN-WIP.md"
printf 'edited\n' >>"$p/docs/doing/HANDOVER.md"
bash "$RESUME" --root "$p" --rollback >/dev/null 2>&1
stashes="$(cd "$p" && git stash list 2>/dev/null | grep -c .)"
if [ "${stashes:-0}" -lt 1 ]; then
  fail "#6 --rollback left no stash — the uncommitted work is unrecoverable"
else
  ( cd "$p" && git stash pop >/dev/null 2>&1 )
  if [ ! -f "$p/docs/doing/PLAN-WIP.md" ]; then
    fail "#6 the stash did not carry the untracked file back"
  elif ! grep -q 'PRECIOUS UNCOMMITTED WORK' "$p/docs/doing/PLAN-WIP.md"; then
    fail "#6 stashed content did not round-trip byte-for-byte"
  elif ! grep -q 'edited' "$p/docs/doing/HANDOVER.md"; then
    fail "#6 the tracked modification did not round-trip"
  else
    pass "#6 --rollback stashes rather than discards, and the content round-trips"
  fi
fi

# ===========================================================================
# 7. NON-VACUITY OF THE REPORT ITSELF. Every assertion above is about warnings
#    and replay windows; all of them pass against a tool that prints nothing
#    else. The report must actually DERIVE the four things it exists to show,
#    and it must derive them at run time from the thing that owns each one —
#    that is the whole reason the authored snapshot is not being built.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
printf '10:05:00 [x] alive\n' >>"$p/logs/agent-activity.log"
out="$(resume "$p")"
missing=""
printf '%s' "$out" | grep -q 'FEATURE-003'          || missing="$missing doing-items"
printf '%s' "$out" | grep -qi 'branch\|HEAD'        || missing="$missing git"
printf '%s' "$out" | grep -q 'Eto'                  || missing="$missing baton-holder"
printf '%s' "$out" | grep -q 'ACTIVE'               || missing="$missing baton-state"
if [ -n "$missing" ]; then
  fail "#7 the report does not derive:$missing"
else
  pass "#7 the report derives git state, lifecycle contents and the live baton"
fi

# ===========================================================================
# 8. IT HOLDS NOTHING, SO IT CANNOT GO STALE. Change the world without telling
#    the tool, and the next run must already agree with the world. This is the
#    property that made the reader the deliverable and left the authored
#    snapshot parked: a second bookkeeping surface goes stale by construction,
#    and atomic publication only guarantees a COHERENT stale snapshot.
# ===========================================================================
before="$(resume "$p")"
printf '| **BUG-999** | promoted mid-session |\n' >>"$p/docs/doing/BACKLOG.md"
after="$(resume "$p")"
if printf '%s' "$before" | grep -q 'BUG-999'; then
  fail "#8 the report claimed an item that did not exist when it ran"
elif ! printf '%s' "$after" | grep -q 'BUG-999'; then
  fail "#8 an item promoted between runs is invisible — the reader is caching state"
else
  pass "#8 the reader holds nothing: the next run already agrees with the world"
fi

# ===========================================================================
# 9. THE MARKER GOES IN THE DURABLE JOURNAL, NOT THE FEED. The feed is
#    truncated on every daemon start, so a marker kept only there is lost
#    exactly when it is needed. signal-set.sh only ever appends to the journal
#    and nothing truncates it — that is the one durable stream available.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
if ! grep -qE '^\[[^]]+\] <[0-9a-f]+>' "$p/logs/state/signal-history.log"; then
  fail "#9 --mark wrote no open marker into logs/state/signal-history.log"
elif ! grep -q 'session-marker' "$p/docs/doing/HANDOVER.md"; then
  fail "#9 --mark did not record the id in HANDOVER.md, so nothing can disagree with the journal"
else
  bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
  if ! grep -qE '^\[[^]]+\] </[0-9a-f]+>' "$p/logs/state/signal-history.log"; then
    fail "#9 a second --mark did not CLOSE the previous marker — the window has no end"
  else
    pass "#9 markers are paired and durable: open, then close-and-reopen"
  fi
fi

# ===========================================================================
# 10. IT NEVER WRITES INTO THE PROJECT IT REPORTS ON. A read that mutates is a
#     read nobody can run twice, and this one runs on every wake. BUG-014 is
#     the precedent: the suite that proved the gate arms is what disarmed it.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
printf '10:05:00 [x] alive\n' >>"$p/logs/agent-activity.log"
sum_before="$(find "$p" -path "$p/.git" -prune -o -type f -print 2>/dev/null | sort | xargs cksum 2>/dev/null | cksum)"
resume "$p" >/dev/null 2>&1
sum_after="$(find "$p" -path "$p/.git" -prune -o -type f -print 2>/dev/null | sort | xargs cksum 2>/dev/null | cksum)"
if [ "$sum_before" != "$sum_after" ]; then
  fail "#10 a plain resume modified the tree it was reporting on"
else
  pass "#10 reporting is read-only — nothing in the tree changed"
fi

# ===========================================================================
# 11. NOISE CONTROL. A branch switch routinely brings in a HANDOVER committed
#     under an EARLIER marker. That must be distinguishable from prose written
#     by something that never marked at all — same severity, very different
#     advice, and the tool gets muted if it cannot tell them apart.
#
#     Kept from the Codex review (R2). Most of that review's cases went with the
#     feed probe they guarded; this one and #12 outlive it because they are about
#     the journal and the prose, which is all the tool reads now.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
old="$(grep -oE '<[0-9a-f]+>' "$p/logs/state/signal-history.log" | tail -1 | tr -d '<>')"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
sed -i "s/session-marker: [0-9a-f]*/session-marker: $old/" "$p/docs/doing/HANDOVER.md"
out="$(resume "$p")"
if ! printf '%s' "$out" | grep -qi 'older snapshot id'; then
  fail "#11 a known PAST id was reported as an unbacked claim: [$out]"
elif ! printf '%s' "$out" | grep -q -- '--mark'; then
  fail "#11 the warning does not name the one-command fix: [$out]"
else
  sed -i 's/session-marker: [0-9a-f]*/session-marker: cafebabe/' "$p/docs/doing/HANDOVER.md"
  out="$(resume "$p")"
  if ! printf '%s' "$out" | grep -qi 'appears NOWHERE'; then
    fail "#11 an id from no known mark was not distinguished from an older one: [$out]"
  else
    pass "#11 an older id and an unbacked id get different, accurate advice"
  fi
fi

# ===========================================================================
# 12. AN UNWRITABLE JOURNAL. --mark used to exit 0 and stamp a NEW id into
#     HANDOVER.md for a window the journal never recorded. The next read then
#     reports prose disagreeing with the journal — the exact staleness this tool
#     exists to detect, manufactured by the tool itself.
#
#     Kept from the Codex review (R6-1), and it matters MORE now: the journal is
#     the only thing written, so an unverified write there is the whole failure
#     rather than one of two.
# ===========================================================================
if [ "$(id -u)" = "0" ]; then
  echo "  -- #12skipped: running as root, where a read-only file is still writable"
else
  p="$(fixture)"
  bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
  hb="$(cksum <"$p/docs/doing/HANDOVER.md")"
  jb="$(cksum <"$p/logs/state/signal-history.log")"
  chmod 444 "$p/logs/state/signal-history.log"
  rc="$(bash "$RESUME" --root "$p" --mark >/dev/null 2>&1; echo "$?")"
  out="$(bash "$RESUME" --root "$p" --mark 2>&1)"
  chmod 644 "$p/logs/state/signal-history.log"
  ha="$(cksum <"$p/docs/doing/HANDOVER.md")"
  ja="$(cksum <"$p/logs/state/signal-history.log")"
  if [ "$rc" = "0" ]; then
    fail "#12 --mark with an unwritable journal exited 0"
  elif [ "$hb" != "$ha" ]; then
    fail "#12 HANDOVER.md was stamped with an id the journal never recorded"
  elif [ "$jb" != "$ja" ]; then
    fail "#12 the journal changed despite being unwritable"
  elif ! printf '%s' "$out" | grep -qi 'could not be read back'; then
    fail "#12 the unwritable journal was not named: [$out]"
  else
    pass "#12 an unwritable journal refuses and leaves HANDOVER untouched (Codex R6-1)"
  fi
fi

# ===========================================================================
# 13. THE WINDOW ROLL IS ONE APPEND, NOT TWO.
#
#     `--mark` makes this script a SECOND WRITER to a file `signal-set.sh` also
#     appends to — the A-09 shape one level up. With `</old>` and `<new>` written
#     as two separate appends there is a gap between them, and a mic flip landing
#     in that gap belongs to NO replay window: it is after the close of the old
#     one and before the open of the new one, so no resume will ever show it.
#
#     Found by Codex R8. Silent, and it drops exactly the events this feature
#     exists to preserve.
#
#     The fix is one append rather than a lock: a single small `printf` to an
#     O_APPEND file is one write(), so no other writer can interleave inside it.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
flip_stop="$WORK/flip.stop"
rm -f "$flip_stop"
(
  i=0
  while [ ! -f "$flip_stop" ]; do
    bash "$ROOT/scripts/signal-set.sh" --file "$p/logs/state/signal.md" \
      --holder Flipper --state ACTIVE --task "concurrent flip $i" >/dev/null 2>&1
    i=$((i + 1))
  done
) &
flip_pid=$!
i=0
while [ "$i" -lt 30 ]; do
  bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
  i=$((i + 1))
done
: >"$flip_stop"
wait "$flip_pid" 2>/dev/null

# Any ordinary event sitting between a close and the next open fell into the gap.
orphans="$(awk '
  /^\[[^]]*\] <\/[0-9a-f]+>/ { gap = 1; next }
  /^\[[^]]*\] <[0-9a-f]+> /  { gap = 0; next }
  gap                        { print }
' "$p/logs/state/signal-history.log" 2>/dev/null | grep -c .)"
if [ "${orphans:-0}" -gt 0 ]; then
  fail "#13 $orphans event(s) landed between a window close and the next open — they belong to no replay window (Codex R8)"
else
  pass "#13 the window roll is one append, so no flip can fall between two windows (Codex R8)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: FEATURE-003 — resume derives its report, and an incomplete replay is loud."
  exit 0
fi
echo "FAILED: session-resume is not safe to wake on."
exit 1
