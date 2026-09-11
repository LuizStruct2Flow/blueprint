#!/usr/bin/env bash
# .scratch/equiv/mut.sh MUTANT_ROOT SUITE MUTANT_ID
#
# Inject ONE defect into a mutant root. Each id names the defect and the
# assertion(s) that exist to catch it; the driver runs BOTH implementations over
# the result and compares which checks go red.
#
# ANCHORS COME FROM QUOTED HEREDOCS AND TRAVEL THROUGH THE ENVIRONMENT. They are
# literal shell source — full of `/`, `$`, `[`, `'` and `\` — and the first
# version escaped them twice, once for bash and once for perl. Six mutants
# silently matched nothing and the comparison reported them as "neither
# implementation covers this defect". A FABRICATED finding is worse than a
# missing one, so the escaping is removed rather than corrected, and every
# substitution is verified to have changed the file.
set -u
M="${1:?mutant root}"
SUITE="${2:?suite}"
ID="${3:?mutant id}"

SS="$M/scripts/signal-set.sh"
WM="$M/scripts/wait-mic.sh"
SR="$M/scripts/session-resume.sh"
CW="$M/scripts/codex-signal-watch.sh"

FROM=""
TO=""
frm() { FROM="$(cat)"; }
to()  { TO="$(cat)"; }

sub() {  # sub FILE   — applies $FROM -> $TO
  local file="$1" before
  before="$(cat "$file")"
  MUT_FROM="$FROM" MUT_TO="$TO" perl -0pi -e 's/\Q$ENV{MUT_FROM}\E/$ENV{MUT_TO}/' "$file"
  if [ "$before" = "$(cat "$file")" ]; then
    echo "MUTANT-DID-NOT-APPLY: $SUITE/$ID did not change $file" >&2
    exit 3
  fi
}

case "$SUITE/$ID" in

# ═══ negative controls ═══════════════════════════════════════════════════════
# A control must leave BOTH implementations green. The healthy tree proves the
# comparison is not red for an unrelated reason; the commented-out defect and the
# benign lookalike prove neither implementation is matching TEXT rather than
# BEHAVIOUR — which is exactly how tests/git-isolation:118 chose its population
# by grepping comments (BUG-047).
*/c0-healthy) : ;;

*/c1-defect-in-a-comment)
  cat >> "$SS" <<'EOF'

# A DEFECT, DISARMED. `if false && printf ... >> "$JOURNAL"` would swallow a
# failed journal append, which is BUG-023 exactly. It is prose here. A suite that
# greps rather than executes goes red on this line; both implementations must not.
EOF
  ;;

*/c2-benign-lookalike)
  cat >> "$SR" <<'EOF'

# Benign lookalike: this comment says `git checkout -- .` and `stash push` and
# last_trigger_key and NR>n and `head -1` without being any of them.
EOF
  ;;

# ═══ signal-set ══════════════════════════════════════════════════════════════
signal-set/m1-refuse-pipes)
  # The original defect: the first dispatch ever published with this tool was
  # REFUSED for containing a pipe — in a question about whether refusing a pipe
  # was correct.
  frm <<'EOF'
TASK="$(printf '%s' "$TASK" | sed 's/|/\\|/g')"
EOF
  to <<'EOF'
case "$TASK" in *"|"*) die "refusing a Task containing a pipe" ;; esac
EOF
  sub "$SS" ;;

signal-set/m2-escape-processing-over-the-value)
  # THE `awk -v` BUG in its general form: run escape-sequence processing over the
  # value and the escaping applied a moment earlier is silently undone, which
  # truncated the instruction at exactly the point it was explaining pipes.
  frm <<'EOF'
TASK="$(printf '%s' "$TASK" | tr '\n\r' '  ' | LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  to <<'EOF'
TASK="$(printf '%b' "$TASK" | tr '\n\r' '  ' | LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  sub "$SS" ;;

signal-set/m3-normalise-only-one-input-path)
  # `--task-file` normalised newlines and `--task` did not: one input path
  # validated, the other not, which is how a guard grows a hole.
  frm <<'EOF'
TASK="$(printf '%s' "$TASK" | tr '\n\r' '  ' | LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  to <<'EOF'
TASK="$(printf '%s' "$TASK" | LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  sub "$SS" ;;

signal-set/m3c-collapse-repeated-spaces)
  # Rewrote indentation inside snippets, aligned columns, and quoted arguments
  # whose repeated spaces are deliberate.
  frm <<'EOF'
LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  to <<'EOF'
LC_ALL=C sed 's/  */ /g; s/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  sub "$SS" ;;

signal-set/m3e-no-boundary-trim)
  # The documented boundary policy simply not applied.
  frm <<'EOF'
 | LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  to <<'EOF'
)"
EOF
  sub "$SS" ;;

signal-set/m3d-mangle-tabs)
  # Interior tabs are the author's and Markdown renders them in a cell.
  frm <<'EOF'
LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  to <<'EOF'
LC_ALL=C sed 's/\t/ /g; s/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  sub "$SS" ;;

signal-set/m3h-exceed-the-documented-contract)
  # Trim Unicode whitespace, which the script documents as NOT SUPPORTED. The case
  # exists so that adding Unicode handling is a VISIBLE contract change rather
  # than a surprise — BUG-043 was this trim differing by the publisher's LANG.
  frm <<'EOF'
LC_ALL=C sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  to <<'EOF'
LC_ALL=C sed 's/^\xc2\xa0*//; s/\xc2\xa0*$//; s/^[[:space:]]*//; s/[[:space:]]*$//')"
EOF
  sub "$SS" ;;

signal-set/m4-rewrite-the-whole-file)
  # Only the baton rows are the publisher's; the surrounding prose is
  # project-owned. Dropping awk's passthrough eats it.
  frm <<'EOF'
  { print }
EOF
  to <<'EOF'
  { }
EOF
  sub "$SS" ;;

signal-set/m5-publish-without-a-task)
  # A refused publish must leave the previous baton intact. Accepting the refusal
  # case turns "refused" into "half-written".
  frm <<'EOF'
[ -n "$TASK" ] || die "--task or --task-file is required"
EOF
  to <<'EOF'
[ -n "$TASK" ] || TASK="(none)"
EOF
  sub "$SS" ;;

signal-set/m6-swallow-the-failed-journal-append)
  # BUG-023 EXACTLY: the append used to end `2>/dev/null || true`, which was right
  # while the journal was a backstop and wrong the moment FEATURE-003 made it the
  # replay's source.
  frm <<'EOF'
if ! printf '[%s] Holder=%s State=%s Task=%s\n' \
EOF
  to <<'EOF'
if false && printf '[%s] Holder=%s State=%s Task=%s\n' \
EOF
  sub "$SS" ;;

# ═══ wait-mic ════════════════════════════════════════════════════════════════
wait-mic/w1-compare-rendered-rows)
  # Jesko S1: the waiter compared rendered rows, so re-aligning the table fired it
  # while Holder and State were byte-identical. BUG-010's lesson, reintroduced in
  # the file whose whole job is reading that table.
  frm <<'EOF'
mic() {
  awk -F'|' '
EOF
  to <<'EOF'
mic() {
  grep -E '^\| *(Holder|State) *\|' "$SIGNAL" 2>/dev/null
  return
  awk -F'|' '
EOF
  sub "$WM" ;;

wait-mic/w2-an-empty-reading-is-a-handoff)
  # Jesko S1/R2: deleting the baton exited 0 with an empty `MIC:` — a phantom
  # handoff, which is worse than the blindness being replaced, because silence is
  # merely uninformed while a false handoff makes the agent act.
  frm <<'EOF'
  if [ -n "$cur" ] && [ "$cur" != "$prev" ]; then
EOF
  to <<'EOF'
  if [ "$cur" != "$prev" ]; then
EOF
  sub "$WM" ;;

wait-mic/w3-wake-on-the-task-too)
  # Task is PAYLOAD: it changes on flips that do not move the mic, and waking on
  # it re-arms the agent for nothing.
  frm <<'EOF'
    /^\| *State *\|/  { if (NF < 4) bad = 1; s = $3;
EOF
  to <<'EOF'
    /^\| *(State|Task) *\|/  { if (NF < 4) bad = 1; s = s $3;
EOF
  sub "$WM" ;;

wait-mic/w4-accept-a-partial-reading)
  # A reading is ALL-OR-NOTHING. A missing Holder row, or two of them, produced a
  # partial reading that compares unequal to a real one and fires.
  frm <<'EOF'
      if (!bad && nh == 1 && ns == 1 && h != "" && s != "") printf "Holder=%s State=%s", h, s
EOF
  to <<'EOF'
      if (h != "" || s != "") printf "Holder=%s State=%s", h, s
EOF
  sub "$WM" ;;

wait-mic/w5-reject-a-rejoinable-pipe)
  # Christian's finding: refusing the row was the wrong cure for the prefix
  # compare, and it INTRODUCES a missed handoff, because the reading is
  # all-or-nothing — an unreadable Holder blinds State too.
  frm <<'EOF'
    /^\| *Holder *\|/ { if (NF < 4) bad = 1;
EOF
  to <<'EOF'
    /^\| *Holder *\|/ { if (NF != 4) bad = 1;
EOF
  sub "$WM" ;;

wait-mic/w6-whitelist-the-state)
  # READABILITY is this file's business; VALIDITY belongs to the writer, where it
  # fails loudly at the point of the mistake instead of turning into silence three
  # layers away. Failing closed here buys exactly the blindness the feature removes.
  frm <<'EOF'
      if (!bad && nh == 1 && ns == 1 && h != "" && s != "") printf
EOF
  to <<'EOF'
      if (!bad && nh == 1 && ns == 1 && h != "" && s ~ /^(IDLE|ACTIVE|OVER_TO_)/) printf
EOF
  sub "$WM" ;;

wait-mic/w7-never-exit)
  # The whole feature is that STOPPING IS AN EVENT rather than silence: a
  # long-lived watcher's death is indistinguishable from its quiet.
  frm <<'EOF'
    break
EOF
  to <<'EOF'
    :
EOF
  sub "$WM" ;;

# ═══ session-resume ══════════════════════════════════════════════════════════
session-resume/s1-cry-wolf-on-a-healthy-resume)
  # A warning that fires on the ORDINARY path is noise, noise gets muted, and a
  # muted tool detects nothing. That is why the feed probe was deleted: the feed
  # is truncated on every wake.
  frm <<'EOF'
echo "SNAPSHOT"
EOF
  to <<'EOF'
warn "the activity feed was truncated since the last mark"
echo "SNAPSHOT"
EOF
  sub "$SR" ;;

session-resume/s2-warn-and-exit-zero)
  # BUG-018's shape: a refusal that returned 0, so a caller read "sync succeeded"
  # while nothing had been pulled.
  frm <<'EOF'
"$WARNINGS" >&2
  exit 9
EOF
  to <<'EOF'
"$WARNINGS" >&2
  exit 0
EOF
  sub "$SR" ;;

session-resume/s3-take-the-first-marker)
  # A reader that greps for "the marker" and takes the first hit replays the whole
  # day and buries the live window.
  frm <<'EOF'
open_marker_line(){ grep -nE "$OPEN_RE" "$JOURNAL" 2>/dev/null | tail -1; }
EOF
  to <<'EOF'
open_marker_line(){ grep -nE "$OPEN_RE" "$JOURNAL" 2>/dev/null | head -1; }
EOF
  sub "$SR" ;;

session-resume/s4-order-by-timestamp)
  # This host's clock jumped BACKWARDS mid-day — entries stamped 19:47 sit earlier
  # in the file than entries stamped 14:39. "Everything after time T" is wrong
  # twice: it cannot span midnight and it mis-orders whenever the clock jumps.
  frm <<'EOF'
  events="$(awk -v n="$open_no" 'NR>n' "$JOURNAL" 2>/dev/null | grep -vE "$OPEN_RE|$CLOSE_RE")"
EOF
  to <<'EOF'
  _mts="$(printf '%s' "$marker" | sed 's/^[0-9]*:\[//; s/\].*$//')"
  events="$(awk -v n="$open_no" 'NR>n' "$JOURNAL" 2>/dev/null | grep -vE "$OPEN_RE|$CLOSE_RE" | awk -v m="$_mts" '{ t=$1; gsub(/[][]/,"",t); if (t >= m) print }')"
EOF
  sub "$SR" ;;

session-resume/s5-a-missing-marker-is-silent)
  # The most likely case of all: a fresh checkout has no journal, so an empty
  # replay printed in silence is what every first run looks like.
  frm <<'EOF'
  warn "no snapshot marker found in $JOURNAL.
EOF
  to <<'EOF'
  true "no snapshot marker found in $JOURNAL.
EOF
  sub "$SR" ;;

session-resume/s6-rollback-discards)
  # `checkout --` and `stash push` both clear the tree; only one is reversible when
  # the judgement was wrong — and an untrusted snapshot is LOW CONFIDENCE about the
  # work, which is exactly when destroying it is least defensible.
  frm <<'EOF'
  if git -C "$DATA_ROOT" stash push -u -m "$msg" >/dev/null 2>&1; then
EOF
  to <<'EOF'
  if git -C "$DATA_ROOT" checkout -- . >/dev/null 2>&1 && git -C "$DATA_ROOT" clean -fdq >/dev/null 2>&1; then
EOF
  sub "$SR" ;;

session-resume/s7-report-nothing)
  # NON-VACUITY of the report itself: every warning assertion above passes against
  # a tool that prints nothing else.
  frm <<'EOF'
    printf '  %-12s%s\n' "$(printf '%s' "$row" | tr '[:upper:] ' '[:lower:]-')" "${val:-(none)}"
EOF
  to <<'EOF'
    :
EOF
  sub "$SR" ;;

session-resume/s9-mark-does-not-stamp-the-handover)
  # Without the id in the prose there is nothing for the journal to disagree WITH,
  # so the staleness check is inert.
  frm <<'EOF'
    mv "$tmp" "$HANDOVER"
EOF
  to <<'EOF'
    rm -f "$tmp"
EOF
  sub "$SR" ;;

session-resume/s12-stamp-before-the-read-back)
  # Codex R6-1: `--mark` exited 0 and stamped a NEW id into HANDOVER.md for a
  # window the journal never recorded — the tool manufacturing the exact staleness
  # it exists to detect.
  frm <<'EOF'
  if ! grep -qF "<$new_id> head=$head_sha" "$JOURNAL" 2>/dev/null; then
EOF
  to <<'EOF'
  if false; then
EOF
  sub "$SR" ;;

session-resume/s13-roll-the-window-in-two-appends)
  # Codex R8: with `</old>` and `<new>` reaching the journal as two writes there is
  # a gap, and a mic flip landing in it belongs to NO replay window — after the
  # close of the old and before the open of the new, so no resume will ever show it.
  #
  # THE LITERAL PRE-BUG-079 LINE. It looks like one append and is two, because
  # bash's printf builtin flushes at every newline — which is the whole of BUG-079
  # and the reason the fix is a heredoc fed to `cat`.
  frm <<'XEOF'
  cat >>"$JOURNAL" <<EOF
$roll
EOF
XEOF
  to <<'XEOF'
  printf '%s\n' "$roll" >>"$JOURNAL"
XEOF
  sub "$SR" ;;

# ═══ signal-dispatch ═════════════════════════════════════════════════════════
signal-dispatch/d1-no-settle-window)
  # THE INCIDENT: dispatch on the first sighting, so a mid-write State flip
  # carries the previous round's Task and the agent works on finished work.
  frm <<'EOF'
  if [[ $(( $(date +%s) - pending_since )) -lt "$SETTLE_SECONDS" ]]; then
EOF
  to <<'EOF'
  if false; then
EOF
  sub "$CW" ;;

signal-dispatch/d2-task-text-is-a-round-identity)
  # Codex F2: the first version of this guard refused any Task byte-identical to
  # the last dispatched one, for the whole life of the watcher rather than the
  # "one poll interval" its author claimed.
  frm <<'EOF'
  if [[ "$key" == "$last_trigger_key" ]]; then
    return 1
  fi
EOF
  to <<'EOF'
  if [[ "$key" == "$last_trigger_key" ]]; then
    return 1
  fi
  if [[ -n "$last_dispatched_task" && "$task" == "$last_dispatched_task" ]]; then
    return 1
  fi
EOF
  sub "$CW" ;;

signal-dispatch/d3-the-settle-window-never-expires)
  # A settle window that becomes a permanent stall is a wedged watcher, and a
  # wedged watcher is indistinguishable from a quiet baton.
  frm <<'EOF'
SETTLE_SECONDS="${AGENT_SIGNAL_SETTLE:-6}"
EOF
  to <<'EOF'
SETTLE_SECONDS=100000
EOF
  sub "$CW" ;;

# ═══ baton-durability ════════════════════════════════════════════════════════
baton-durability/b1-watch-the-tracked-file)
  # THE PARENT-COMMIT STATE: the live baton IS the tracked file, so `git checkout
  # -- AGENT_SIGNAL.md` reverts it and CANCELS the in-flight dispatch.
  #
  # THE DERIVATION IS WHAT MOVES, not the watcher's startup line — and the first
  # version of this mutant got that wrong in an instructive way. Setting
  # `SIGNAL_FILE="$ROOT/AGENT_SIGNAL.md"` at startup left BOTH implementations
  # green, because `refresh_signal_file()` re-resolves on every tick and, seeing a
  # different answer, MOVED the watcher back onto the correct path — the BUG-019
  # migration fix silently REPAIRING the BUG-019 defect. Which is a true and
  # useful thing to know about the watcher, and not the historical state: before
  # the split, `agent_signal_file` itself answered the tracked file, so both the
  # startup resolution and every refresh pointed there, and `signal-set.sh`
  # published there too.
  frm <<'EOF'
  printf '%s\n' "$_asf_d/signal.md"
EOF
  to <<'EOF'
  printf '%s\n' "$(dirname "$(dirname "$_asf_d")")/AGENT_SIGNAL.md"
EOF
  sub "$M/scripts/lib/state-dir.sh" ;;

baton-durability/b2-journal-derived-from-the-root)
  # Two independent derivations of one location is the A-09 defect:
  # tests/signal-set wrote eleven fixture rows into the REAL journal this way.
  frm <<'EOF'
JOURNAL="$(dirname "$SIGNAL")/signal-history.log"
EOF
  to <<'EOF'
JOURNAL="$BP_STATE_ROOT/logs/state/signal-history.log"
EOF
  sub "$SS" ;;

baton-durability/b3-seed-written-to-the-canonical-path)
  # Codex F4: the seed used to be written straight to $SIGNAL and replaced a
  # moment later, so a poller could read a default IDLE baton at the canonical
  # path. "Unlikely" is not the guarantee this script exists to provide.
  frm <<'EOF'
  _bp_seed_src="$(mktemp "${SIGNAL}.seed.XXXXXX")"
EOF
  to <<'EOF'
  _bp_seed_src="$SIGNAL"
EOF
  sub "$SS" ;;

baton-durability/b4-resolve-the-baton-once-at-startup)
  # The migration hazard this PR caused: every already-running watcher kept
  # polling the OLD path and never fired again, silently.
  frm <<'EOF'
refresh_signal_file() {
  [[ "$SIGNAL_FILE_EXPLICIT" -eq 1 ]] && return 0
EOF
  to <<'EOF'
refresh_signal_file() {
  return 0
EOF
  sub "$CW" ;;

baton-durability/b5-re-resolve-past-an-explicit-pin)
  # `--file` means "watch exactly this". A watcher that wandered off the path the
  # operator named would be a worse bug than the one being fixed.
  frm <<'EOF'
  [[ "$SIGNAL_FILE_EXPLICIT" -eq 1 ]] && return 0
EOF
  to <<'EOF'
  :
EOF
  sub "$CW" ;;

baton-durability/b6-clear-the-trigger-key-on-a-move)
  # Codex round-3 HIGH: a migration that COPIES the baton produces an identical
  # Holder|State|Task, and a cleared key makes that look like a brand-new
  # instruction — a duplicate BILL on a metered agent, not a duplicate log line.
  frm <<'EOF'
  last_mtime=""
  # But KEEP last_trigger_key.
EOF
  to <<'EOF'
  last_mtime=""
  last_trigger_key=""
  # But KEEP last_trigger_key.
EOF
  sub "$CW" ;;

baton-durability/b7-live-rows-in-the-tracked-file)
  # The split half-done: prose updated, the live table left behind in a file git
  # rewrites on every branch operation.
  frm <<'EOF'
# Agent Signal
EOF
  to <<'EOF'
# Agent Signal

| Field | Value |
|---|---|
| Holder | Jesko |
| State | OVER_TO_CODEX |
EOF
  sub "$M/AGENT_SIGNAL.md" ;;

*) echo "UNKNOWN-MUTANT: $SUITE/$ID" >&2; exit 4 ;;
esac
