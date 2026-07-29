#!/usr/bin/env bash
# scripts/signal-set.sh — publish the whole baton in ONE atomic write.
#
# WHY THIS EXISTS
#
# `AGENT_SIGNAL.md` is read by a poller and written by agents. Writing it as
# two edits — `Task`, then `State` — means the poller can sample a state that
# never existed as an instruction: the NEW State beside the PREVIOUS round's
# Task. It then dispatches, in earnest, against finished work. That happened
# twice in one session, the second time hours after its author had written the
# "flip the mic last" rule into AGENTS.md.
#
# The watcher gained a settle window, which shrinks the race. Four-eyes was
# right that it does not close it: a writer that pauses longer than the settle
# value still publishes a torn state, and no timeout is a publication boundary.
# The fix belongs on the WRITE side — make a handoff one indivisible
# publication, so there is no torn state to sample in the first place.
#
# Usage:
#   scripts/signal-set.sh --holder Jesko --state OVER_TO_CODEX --task-file t.md
#   scripts/signal-set.sh --holder Sylvia --state ACTIVE --task 'short text'
#
# The file is composed in full and moved into place with `mv`, which is atomic
# within a filesystem. A reader either sees the whole previous baton or the
# whole new one — never a mixture.
set -euo pipefail

SIGNAL="${AGENT_SIGNAL_FILE:-AGENT_SIGNAL.md}"
HOLDER=""
STATE=""
TASK=""
TASK_FILE=""

die() { echo "signal-set: $*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --holder)    HOLDER="${2:-}"; shift 2 ;;
    --state)     STATE="${2:-}"; shift 2 ;;
    --task)      TASK="${2:-}"; shift 2 ;;
    --task-file) TASK_FILE="${2:-}"; shift 2 ;;
    --file)      SIGNAL="${2:-}"; shift 2 ;;
    -h|--help)   sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           die "unknown argument: $1" ;;
  esac
done

[ -n "$HOLDER" ] || die "--holder is required"
[ -n "$STATE" ]  || die "--state is required"
[ -f "$SIGNAL" ] || die "no signal file at $SIGNAL"

if [ -n "$TASK_FILE" ]; then
  [ -f "$TASK_FILE" ] || die "no such --task-file: $TASK_FILE"
  TASK="$(cat "$TASK_FILE")"
fi
[ -n "$TASK" ] || die "--task or --task-file is required"

# Normalise AFTER both input paths converge. Doing it only in the --task-file
# branch left `--task $'a\nb'` producing a broken multi-line table row — one
# input path validated, the other not, which is how a guard grows a hole.
#
# The policy, stated exactly, because the previous comment overclaimed it:
#
#   CR and LF        → a single space. They genuinely break the table row.
#   INTERIOR spaces  → preserved byte-for-byte, including runs. An earlier
#                      version ran `sed 's/  */ /g'` and silently rewrote
#                      indentation inside snippets, aligned columns, and quoted
#                      arguments whose repeated spaces are deliberate.
#   INTERIOR tabs    → preserved as tabs. Markdown renders them in a cell.
#   BOUNDARY space   → TRIMMED, both ends. This is a real edit and is not
#                      "preserving everything horizontal", which is what the
#                      comment used to claim while doing this anyway. It is
#                      deliberate: `--task-file` almost always ends in a
#                      newline, which becomes a trailing space, and leading
#                      indentation of the whole cell carries no meaning in a
#                      one-line table cell. If you need boundary whitespace to
#                      survive, it belongs in the body of the instruction, not
#                      at its edges.
TASK="$(printf '%s' "$TASK" | tr '\n\r' '  ' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"

# A literal `|` would end the table cell early and truncate the instruction.
# ESCAPE it rather than refuse: `\|` renders as a pipe inside a markdown table,
# and refusing means a prompt cannot discuss shell pipelines, alternation, or
# the escaping rule itself. Found by dogfooding — the very first dispatch
# written with this tool was rejected for asking whether refusing was correct.
TASK="$(printf '%s' "$TASK" | sed 's/|/\\|/g')"

TODAY="$(date '+%Y-%m-%d')"
TMP="$(mktemp "${SIGNAL}.XXXXXX")"
trap 'rm -f "$TMP"' EXIT INT TERM

# Rewrite the four baton rows; everything else in the file is passed through
# untouched, so the surrounding prose stays project-owned.
# Values come through ENVIRON, never `awk -v`. `-v` runs escape-sequence
# processing over the value, so the `\|` escaping applied above was silently
# undone and a raw pipe reached the table cell — truncating the instruction at
# exactly the point it was explaining pipes. ENVIRON passes bytes through
# untouched. (Found the hard way: the first dispatch published with this tool
# was truncated by its own escaping.)
SIGNAL_HOLDER="$HOLDER" SIGNAL_STATE="$STATE" SIGNAL_TASK="$TASK" SIGNAL_TODAY="$TODAY" \
awk '
  BEGIN {
    holder = ENVIRON["SIGNAL_HOLDER"]
    state  = ENVIRON["SIGNAL_STATE"]
    task   = ENVIRON["SIGNAL_TASK"]
    today  = ENVIRON["SIGNAL_TODAY"]
  }
  /^\| Holder \|/      { print "| Holder | " holder " |"; next }
  /^\| State \|/       { print "| State | " state " |"; next }
  /^\| Task \|/        { print "| Task | " task " |"; next }
  /^\| Last update \|/ { print "| Last update | " today " |"; next }
  { print }
' "$SIGNAL" > "$TMP"

for _row in "| Holder |" "| State |" "| Task |"; do
  grep -qF "$_row" "$TMP" || die "row '$_row' missing after rewrite — refusing to publish a malformed baton"
done

chmod --reference="$SIGNAL" "$TMP" 2>/dev/null || true
mv "$TMP" "$SIGNAL"
trap - EXIT INT TERM

echo "signal-set: published Holder=$HOLDER State=$STATE (atomic)"
