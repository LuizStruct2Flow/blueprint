#!/bin/sh
# scripts/wait-mic.sh — block until the mic moves, print it, EXIT.
#
# FEATURE-005. Arm it as a BACKGROUND task and let it notify you:
#
#   sh scripts/wait-mic.sh logs/state/signal.md      (Bash, run_in_background)
#
# WHY THIS EXISTS. The mic used to be watched by an always-on `Monitor`, and a
# dead one is indistinguishable from a quiet one. Two died in a single session
# and the founder noticed before the agent did. A-40 then established that `ps`
# cannot see those processes at all, so there is no liveness check to fall back
# on — silence is simply not evidence of anything.
#
# A waiter that EXITS turns three separate things into events the harness
# reports: the baton moved, the waiter crashed, the harness stopped it. A
# long-lived watcher only ever gives you the first. It also cannot be rate-limited
# into silence, because it emits once — 30 flips in one day is what muted the
# Monitor.
#
# WHAT THIS DOES NOT DO — narrow claim, and Alexey (Architect) required it stated
# rather than implied. It does NOT eliminate blindness. It must be RE-ARMED after
# every event, and forgetting to is silent. What would close that is a
# supervisor, and this repo has none. The gap is NARROWED, not closed: the exit
# notification and the need to re-arm arrive together, which is better than a
# death nobody is told about, and less than a guarantee.
#
# WHY POLLING AND NOT A KERNEL WAIT. The first design used inotify through Python
# ctypes — ~40 lines, and it needed a DIRECTORY watch because signal-set.sh
# publishes by atomic rename, so a watch on the inode goes deaf after one publish.
# The founder then required the system be OS-agnostic or Linux-based, which made
# it indefensible: inotify is Linux-only, `inotifywait` is not installed, and the
# Brewfile is macOS-only — a Linux-only dependency shipped through a macOS-only
# package manager. The property that mattered was never "do not poll", it was
# "exit is an event". A 1s sleep buys that on any POSIX box, and the rename
# subtlety disappears because content is compared rather than inodes watched.
#
# Exit: 0 the mic moved (its new value is on stdout) · 2 usage.
set -u

SIGNAL="${1:-}"
if [ -z "$SIGNAL" ]; then
  echo "usage: wait-mic.sh <path-to-signal.md>" >&2
  exit 2
fi

# Holder and State ONLY, and their VALUES — not the rendered rows.
#
# The first version compared `grep` output, so any reformatting of those lines
# read as a mic move: re-align the table, pad a column, and the agent re-arms on
# a handoff that never happened. Jesko reproduced it (S1). That is the BUG-010
# lesson exactly — a parser that matched literal single spaces failed on a
# padded table, and a miss was indistinguishable from "no roster".
#
# `Task` is excluded on purpose: it is payload, it changes on flips that do not
# move the mic, and waking on it re-arms for nothing.
#
# A value containing an escaped `\|` truncates at the pipe. Harmless here and not
# worth machinery: the truncation is STABLE across reads, so it cannot produce a
# spurious change — which is the only property this comparison owes.
mic() {
  awk -F'|' '
    /^\| *Holder *\|/ { h = $3 }
    /^\| *State *\|/  { s = $3 }
    END {
      gsub(/^[ \t]+|[ \t]+$/, "", h)
      gsub(/^[ \t]+|[ \t]+$/, "", s)
      if (h != "" || s != "") printf "Holder=%s State=%s", h, s
    }
  ' "$SIGNAL" 2>/dev/null
}

# An EMPTY read is "cannot see the mic", never "the mic moved".
#
# Deleting the baton used to exit 0 and print an empty MIC — a phantom handoff,
# which is worse than the blindness this replaces: silence is merely uninformed,
# but a false handoff makes the agent act. A baton that is absent, unreadable or
# malformed is simply not a handoff, so keep waiting.
#
# The converse IS a real event and fires: an empty `prev` becoming a real value
# is a fresh checkout seeding its baton, and that is the mic moving.
prev="$(mic)"
while :; do
  cur="$(mic)"
  if [ -n "$cur" ] && [ "$cur" != "$prev" ]; then
    break
  fi
  sleep 1
done

printf 'MIC: %s\n' "$cur"
