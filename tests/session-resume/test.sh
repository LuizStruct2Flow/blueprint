#!/bin/bash
# tests/session-resume/test.sh
#
# FEATURE-003 — a woken session must be able to DERIVE where it is, and an
# INCOMPLETE replay must be LOUD.
#
# The load-bearing requirement is not that the report is useful. It is that a
# replay which cannot see everything says so. The activity feed is truncated on
# every daemon start (scripts/agent-activity.sh) and trimmed on rotation
# (scripts/lib/feed.sh), so a missing window is NORMAL — and a short replay that
# reads like a quiet one is precisely the failure this feature exists to
# prevent. That is the same defect BUG-018 shipped (a refusal that returned 0,
# so a caller read "sync succeeded" while nothing was pulled) and the same one
# BUG-004 shipped (a tracked hook that was never armed, indistinguishable from a
# gate that passed).
#
# So every case below asserts BOTH halves: the warning text a human reads, and a
# non-zero exit a script can branch on. A warning printed beside exit 0 is the
# BUG-018 shape and is not accepted here.
#
# Ordering is POSITIONAL, never by timestamp. The feed writes HH:MM:SS with no
# date, and this host's clock jumped BACKWARDS during 2026-08-03 — entries
# stamped 19:47 sit earlier in the file than entries stamped 14:39. Case #4
# pins that.
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
# 1. THE REPRODUCER. A marker is written, the feed is then truncated (exactly
#    what `agent-activity.sh --daemon` does on every start), and resume runs.
#    It MUST warn and MUST exit non-zero. A naive implementation reads the
#    journal, finds the events, prints a tidy report and returns 0 — which is
#    the whole failure: the tool-level detail is gone and nothing said so.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
journal "$p" "Holder=Jesko State=OVER_TO_CODEX Task=review the plan"
: >"$p/logs/agent-activity.log"          # the daemon restarted
out="$(resume "$p")"
rc="$(resume_rc "$p")"
if ! printf '%s' "$out" | grep -qi 'feed'; then
  fail "#1 a truncated feed produced no warning about the feed: [$out]"
elif ! printf '%s' "$out" | grep -q '⚠'; then
  fail "#1 the incomplete replay was not marked as a warning: [$out]"
elif [ "$rc" = "0" ]; then
  fail "#1 warned about an incomplete replay but still exited 0 — the BUG-018 shape"
else
  pass "#1 a truncated feed warns AND exits non-zero (rc=$rc)"
fi

# ===========================================================================
# 1b. THE CONVERSE. An intact feed must NOT warn and must exit 0. Without this,
#     "always warn" passes #1 — and a tool that cries wolf on every wake gets
#     muted, which leaves the session exactly as blind as having no tool.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
journal "$p" "Holder=Jesko State=OVER_TO_CODEX Task=review the plan"
printf '10:05:00 [Jesko - Codex] working\n' >>"$p/logs/agent-activity.log"
out="$(resume "$p")"
rc="$(resume_rc "$p")"
if printf '%s' "$out" | grep -q '⚠'; then
  fail "#1b an intact feed produced a warning — the tool cries wolf: [$out]"
elif [ "$rc" != "0" ]; then
  fail "#1b an intact, complete replay exited $rc instead of 0"
else
  pass "#1b an intact feed is silent and exits 0 (so #1 is not 'always warn')"
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
# CODEX ROUND 1 — three demonstrated FALSE CLEANS. Each produced a tidy replay,
# no warning and exit 0 against a genuinely untrusted window. A completeness
# check that can be satisfied by an unrelated line is worse than no check at
# all, because it is trusted.
#
# The first version asked only `grep -q "<$open_id>" "$FEED"`. That proves the
# id OCCURS somewhere in whatever file $FEED points at. It proves nothing about
# which feed, or about the window.
# ===========================================================================

# 11. UNRELATED MENTION. A feed line that merely names the id — a dispatch task
#     quoting it, for instance — is not the probe. The match must be the probe's
#     full prefix, as a fixed string.
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
: >"$p/logs/agent-activity.log"                      # the real probe is gone
mid="$(grep -oE '<[0-9a-f]+>' "$p/logs/state/signal-history.log" | tail -1)"
printf '10:05:00 [Jesko - Codex] investigating marker %s in the journal\n' "$mid" \
  >>"$p/logs/agent-activity.log"
rc="$(resume_rc "$p")"
out="$(resume "$p")"
if [ "$rc" = "0" ]; then
  fail "#11 a line merely MENTIONING $mid was accepted as proof the window is intact — false clean"
elif ! printf '%s' "$out" | grep -q '⚠'; then
  fail "#11 the truncated feed produced no warning: [$out]"
else
  pass "#11 an unrelated mention of the id is not the probe (Codex R1-1)"
fi

# 12. THE WRONG FEED. $AGENT_FEED_LOG can point somewhere else entirely — a
#     stale feed, another checkout's. A probe found in the wrong file proves
#     nothing about this window, so the marker records WHICH feed it was written
#     to and the reader refuses to be satisfied by another.
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
cp "$p/logs/agent-activity.log" "$WORK/stale-feed.log"
: >"$p/logs/agent-activity.log"
rc="$(AGENT_FEED_LOG="$WORK/stale-feed.log" bash "$RESUME" --root "$p" >/dev/null 2>&1; echo "$?")"
out="$(AGENT_FEED_LOG="$WORK/stale-feed.log" bash "$RESUME" --root "$p" 2>&1)"
if [ "$rc" = "0" ]; then
  fail "#12 a probe found in a DIFFERENT feed was accepted as proof — false clean"
elif ! printf '%s' "$out" | grep -qi 'marked against'; then
  fail "#12 the feed mismatch was not named: [$out]"
else
  pass "#12 a probe in the wrong feed proves nothing (Codex R1-3)"
fi

# 13. TRIMMED FEED. Rotation drops what precedes the probe. That is not fatal —
#     what follows the marker is what this window is — but it IS lost detail and
#     must be said, with the count, rather than passed over in silence.
p="$(fixture)"
printf '10:00:00 [x] older activity\n10:00:01 [x] older activity\n10:00:02 [x] older activity\n' \
  >>"$p/logs/agent-activity.log"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
tail -1 "$p/logs/agent-activity.log" >"$WORK/trim" && cp "$WORK/trim" "$p/logs/agent-activity.log"
rc="$(resume_rc "$p")"
out="$(resume "$p")"
if [ "$rc" = "0" ]; then
  fail "#13 a feed trimmed back to the probe reported clean — false clean"
elif ! printf '%s' "$out" | grep -qi 'trimmed'; then
  fail "#13 the trim was not reported: [$out]"
else
  pass "#13 a trimmed feed is reported with the count of lost lines (Codex R1-2)"
fi

# 14. NOISE CONTROL. A branch switch routinely brings in a HANDOVER committed
#     under an EARLIER marker. That must be distinguishable from prose written
#     by something that never marked at all — same severity, very different
#     advice, and the tool gets muted if it cannot tell them apart.
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
old="$(grep -oE '<[0-9a-f]+>' "$p/logs/state/signal-history.log" | tail -1 | tr -d '<>')"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
sed -i "s/session-marker: [0-9a-f]*/session-marker: $old/" "$p/docs/doing/HANDOVER.md"
out="$(resume "$p")"
if ! printf '%s' "$out" | grep -qi 'older snapshot id'; then
  fail "#14 a known PAST id was reported as an unbacked claim: [$out]"
elif ! printf '%s' "$out" | grep -q -- '--mark'; then
  fail "#14 the warning does not name the one-command fix: [$out]"
else
  sed -i 's/session-marker: [0-9a-f]*/session-marker: cafebabe/' "$p/docs/doing/HANDOVER.md"
  out="$(resume "$p")"
  if ! printf '%s' "$out" | grep -qi 'appears NOWHERE'; then
    fail "#14 an id from no known mark was not distinguished from an older one: [$out]"
  else
    pass "#14 an older id and an unbacked id get different, accurate advice"
  fi
fi

# ===========================================================================
# CODEX ROUND 2 — two more false cleans, and two FALSE ALARMS. The false alarms
# matter as much: a tool that warns on a healthy feed gets muted, and then the
# false-clean findings stop mattering because nobody reads the output.
# ===========================================================================

# 15. IMPERSONATION. The feed carries dispatch task text verbatim, so a task
#     quoting a probe line IS a probe line to any content check. Authentication
#     is by RECORDED POSITION: the marker says where the probe landed, and a
#     later copy cannot answer for that line.
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
mid="$(grep -oE '<[0-9a-f]+>' "$p/logs/state/signal-history.log" | tail -1)"
: >"$p/logs/agent-activity.log"                          # the genuine probe is gone
printf '10:05:00 [x] noise\n10:05:01 [Jesko] quoting: [RESUME] snapshot %s head=abc1234\n' "$mid" \
  >>"$p/logs/agent-activity.log"
rc="$(resume_rc "$p")"
out="$(resume "$p")"
if [ "$rc" = "0" ]; then
  fail "#15 a COPY of the probe text was accepted as the probe — false clean"
elif ! printf '%s' "$out" | grep -qi 'copy\|recorded position'; then
  fail "#15 the impersonation was not named: [$out]"
else
  pass "#15 the probe is authenticated by recorded position, not by its text (Codex R2-1)"
fi

# 16. AN OLDER MARKER, with no feed provenance. Falling back to a content-only
#     check here silently restores the exact behaviour the provenance fields
#     were added to remove. An upgrade path that gives back the old bug is worse
#     than one that refuses.
p="$(fixture)"
printf '[2026-08-06T10:00:00Z] <0badc0de> head=abc1234\n' >>"$p/logs/state/signal-history.log"
printf '10:05:00 [RESUME] snapshot <0badc0de> head=abc1234\n' >>"$p/logs/agent-activity.log"
printf '<!-- session-marker: 0badc0de -->\n' >>"$p/docs/doing/HANDOVER.md"
rc="$(resume_rc "$p")"
out="$(resume "$p")"
if [ "$rc" = "0" ]; then
  fail "#16 a marker with no feed provenance passed unchecked — false clean on the upgrade path"
elif ! printf '%s' "$out" | grep -qi 'older version\|no feed provenance'; then
  fail "#16 the unverifiable marker was not named as such: [$out]"
else
  pass "#16 a pre-provenance marker refuses rather than reverting to the old check (Codex R2-2)"
fi

# 17. FALSE ALARM — a feed path containing a SPACE. Nothing is wrong with this
#     feed; it simply could not round-trip through a space-separated marker
#     field. An intact window warned.
p="$(fixture)"
mkdir -p "$WORK/feed dir"
spacefeed="$WORK/feed dir/agent-activity.log"
: >"$spacefeed"
AGENT_FEED_LOG="$spacefeed" bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
printf '10:05:00 [x] still alive\n' >>"$spacefeed"
rc="$(AGENT_FEED_LOG="$spacefeed" bash "$RESUME" --root "$p" >/dev/null 2>&1; echo "$?")"
out="$(AGENT_FEED_LOG="$spacefeed" bash "$RESUME" --root "$p" 2>&1)"
if [ "$rc" != "0" ]; then
  fail "#17 a healthy feed under a path with a space exited $rc — false alarm: [$out]"
else
  pass "#17 a feed path containing a space round-trips (Codex R2-3)"
fi

# 18. FALSE ALARM — a RELATIVE $AGENT_FEED_LOG. It was recorded relative to the
#     marking process's cwd and read back relative to the data root, so a
#     perfectly healthy feed compared unequal to itself.
p="$(fixture)"
(
  cd "$p" || exit 1
  AGENT_FEED_LOG="logs/agent-activity.log" bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
  printf '10:05:00 [x] still alive\n' >>"$p/logs/agent-activity.log"
)
rc="$(cd "$p" && AGENT_FEED_LOG="logs/agent-activity.log" bash "$RESUME" --root "$p" >/dev/null 2>&1; echo "$?")"
out="$(cd "$p" && AGENT_FEED_LOG="logs/agent-activity.log" bash "$RESUME" --root "$p" 2>&1)"
if [ "$rc" != "0" ]; then
  fail "#18 a healthy feed named relatively exited $rc — false alarm: [$out]"
else
  pass "#18 a relative AGENT_FEED_LOG resolves identically on both sides (Codex R2-4)"
fi

# ===========================================================================
# CODEX ROUND 3.
# ===========================================================================

# 19. FALSE ALARM — a SYMLINKED FEED FILE. Marking through `link.log` and reading
#     through `real.log` is one inode under two names. Canonicalising only the
#     directory left them as two values, and a perfectly healthy feed reported a
#     mismatch.
p="$(fixture)"
mv "$p/logs/agent-activity.log" "$p/logs/real.log"
ln -s real.log "$p/logs/agent-activity.log"
AGENT_FEED_LOG="$p/logs/agent-activity.log" bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
printf '10:05:00 [x] still alive\n' >>"$p/logs/real.log"
rc="$(AGENT_FEED_LOG="$p/logs/real.log" bash "$RESUME" --root "$p" >/dev/null 2>&1; echo "$?")"
out="$(AGENT_FEED_LOG="$p/logs/real.log" bash "$RESUME" --root "$p" 2>&1)"
if [ "$rc" != "0" ]; then
  fail "#19 one feed inode under two names reported a mismatch — false alarm: [$out]"
else
  pass "#19 a symlinked feed file resolves to one value on both sides (Codex R3-1)"
fi

# 20. THE SCOPE, PINNED. Silence means nothing was lost BY ITSELF. It does not
#     mean nobody rewrote the record — the journal and feed are local untracked
#     state, so anyone able to edit them can write a whole marker from nothing,
#     and no check here can be stronger than the files it reads.
#
#     What IS guaranteed is that INCONSISTENT corruption is caught. Codex's clean
#     forgery needed TWO coordinated edits — move the probe AND repoint the
#     metadata. #15 pins the first half. This pins the second, so a future change
#     cannot widen the hole from "consistent tampering" to "any stray edit".
#
#     Note what is deliberately NOT asserted: a stray COPY of the probe appended
#     while the genuine one still sits at its recorded line is correctly CLEAN.
#     Nothing was lost, and warning there would be a false alarm.
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1
sed -i 's/feedline=[0-9]*/feedline=999/' "$p/logs/state/signal-history.log"
rc_meta="$(resume_rc "$p")"
if [ "$rc_meta" = "0" ]; then
  fail "#20 position metadata pointing at nothing still produced a clean report"
else
  pass "#20 repointed metadata alone is loud — only CONSISTENT tampering is out of scope"
fi

# ===========================================================================
# CODEX ROUND 4.
#
# 21. A SYMLINK CYCLE must FAIL, not pass quietly. Bounding the walk was not
#     enough: on a cycle it ran out of hops, returned the still-symlinked path,
#     and `--mark` wrote a probe into nothing — feed_append is deliberately never
#     fatal — then exited 0 with no warning. A tool whose entire purpose is that
#     failure announces itself must not have a silent failure of its own, and
#     this one is the worst kind: the marker lands, the probe does not, and the
#     window it opens will read as clean forever after.
# ===========================================================================
p="$(fixture)"
rm -f "$p/logs/agent-activity.log"
ln -s cycle-b.log "$p/logs/cycle-a.log"
ln -s cycle-a.log "$p/logs/cycle-b.log"
rc="$(AGENT_FEED_LOG="$p/logs/cycle-a.log" bash "$RESUME" --root "$p" --mark >/dev/null 2>&1; echo "$?")"
out="$(AGENT_FEED_LOG="$p/logs/cycle-a.log" bash "$RESUME" --root "$p" --mark 2>&1)"
if [ "$rc" = "0" ]; then
  fail "#21 --mark through a symlink CYCLE exited 0 — it opened a window whose probe went nowhere"
elif ! printf '%s' "$out" | grep -qi 'cycle'; then
  fail "#21 the cycle was not named: [$out]"
elif grep -qE '^\[[^]]+\] <[0-9a-f]+>' "$p/logs/state/signal-history.log" 2>/dev/null; then
  fail "#21 it refused but still wrote an open marker — the window exists with no probe"
else
  pass "#21 a symlink cycle refuses before opening a window (Codex R4-1)"
fi

# ===========================================================================
# CODEX ROUND 5 — the GENERAL form of #21.
#
# 22. A FEED THAT SWALLOWS THE WRITE. `feed_append` is deliberately never fatal
#     (a logging failure must not block a push), so it returns 0 whether or not
#     a byte landed. Refusing only on the symlink cycle fixed ONE INSTANCE of a
#     class: /dev/null, a full disk, a read-only file, a FIFO with no reader. In
#     every one the marker was written with nothing behind it, and the window it
#     opened would read as CLEAN forever after.
#
#     The guard is therefore the general one: read the probe back at its recorded
#     position, and only then write the journal. A refusal must leave the journal
#     BYTE-IDENTICAL — a close with no matching open is a worse state than never
#     having tried.
# ===========================================================================
p="$(fixture)"
bash "$RESUME" --root "$p" --mark >/dev/null 2>&1          # a real first window
before="$(cksum <"$p/logs/state/signal-history.log")"
rc="$(AGENT_FEED_LOG=/dev/null bash "$RESUME" --root "$p" --mark >/dev/null 2>&1; echo "$?")"
out="$(AGENT_FEED_LOG=/dev/null bash "$RESUME" --root "$p" --mark 2>&1)"
after="$(cksum <"$p/logs/state/signal-history.log")"
if [ "$rc" = "0" ]; then
  fail "#22 --mark into /dev/null exited 0 — it opened a window whose probe went nowhere"
elif [ "$before" != "$after" ]; then
  fail "#22 it refused but still wrote to the journal — a close with no open is worse than nothing"
elif ! printf '%s' "$out" | grep -qi 'could not be read back'; then
  fail "#22 the unwritable feed was not named: [$out]"
else
  pass "#22 a feed that swallows the write refuses and leaves the journal untouched (Codex R5)"
fi

# ===========================================================================
# CODEX ROUND 6 — the same class, from both ends.
# ===========================================================================

# 23. AN UNWRITABLE JOURNAL. The feed write was verified and the journal write
#     was not, and that asymmetry had no defence: --mark exited 0 and stamped a
#     NEW id into HANDOVER.md for a window that was never opened. The next read
#     then reports prose disagreeing with the journal — the exact staleness this
#     tool exists to detect, manufactured by the tool itself.
if [ "$(id -u)" = "0" ]; then
  echo "  -- #23 skipped: running as root, where a read-only file is still writable"
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
    fail "#23 --mark with an unwritable journal exited 0"
  elif [ "$hb" != "$ha" ]; then
    fail "#23 HANDOVER.md was stamped with an id the journal never recorded"
  elif [ "$jb" != "$ja" ]; then
    fail "#23 the journal changed despite being unwritable"
  elif ! printf '%s' "$out" | grep -qi 'could not be read back'; then
    fail "#23 the unwritable journal was not named: [$out]"
  else
    pass "#23 an unwritable journal refuses and leaves HANDOVER untouched (Codex R6-1)"
  fi
fi

# 24. FALSE ALARM UNDER CONCURRENCY. The probe's line was taken as `wc -l` after
#     appending, which is only true if nothing else wrote in between — and the
#     activity daemon appends to this very file continuously. Codex measured 7 of
#     100 ordinary marks REFUSING. Searching for the freshly-minted id instead is
#     race-free by construction: exactly one line carries it, wherever concurrent
#     writers have pushed it to.
#     Reproduced by holding a writer on the feed for the whole run rather than by
#     hoping to land in the window: the old code's gap is between its append and
#     its `wc -l`, so sustained pressure hits it repeatedly. 100 marks, as Codex
#     measured it.
p="$(fixture)"
noise_stop="$WORK/noise.stop"
rm -f "$noise_stop"
(
  i=0
  while [ ! -f "$noise_stop" ]; do
    printf '10:00:00 [noise] concurrent write %s\n' "$i" >>"$p/logs/agent-activity.log"
    i=$((i + 1))
  done
) &
noise_pid=$!
fails=0
i=0
while [ "$i" -lt 100 ]; do
  bash "$RESUME" --root "$p" --mark >/dev/null 2>&1 || fails=$((fails + 1))
  i=$((i + 1))
done
: >"$noise_stop"
wait "$noise_pid" 2>/dev/null
if [ "$fails" -gt 0 ]; then
  fail "#24 $fails of 100 ordinary marks refused while the feed was being appended to — false alarm"
else
  pass "#24 100 marks under sustained concurrent feed writes all succeeded (Codex R6-2)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: FEATURE-003 — resume derives its report, and an incomplete replay is loud."
  exit 0
fi
echo "FAILED: session-resume is not safe to wake on."
exit 1
