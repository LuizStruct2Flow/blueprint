#!/usr/bin/env bash
# NOTIFY-ONLY: This watcher only notifies a human/operator when the mic flips to
# GitHub Copilot. It does NOT invoke any Copilot CLI or act as an autonomous
# dispatcher. Operators should claim the mic in AGENT_SIGNAL.md and act manually.
# Lightweight watcher for AGENT_SIGNAL.md that notifies when mic flips to GitHub Copilot
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
signal_file="$repo_root/AGENT_SIGNAL.md"
last=""
echo "Starting Copilot signal watcher (watching $signal_file)"
if [ ! -f "$signal_file" ]; then
  echo "AGENT_SIGNAL.md not found at $signal_file" >&2
  exit 1
fi
# BUG-001 / RC-6: `stat -f %m f || stat -c %Y f` is NOT a portable fallback. On
# GNU coreutils `-f` means "filesystem status", so `%m` is invalid — it prints a
# multi-line block to STDOUT and exits 1, and `$(a || b)` captures BOTH. The
# "mtime" then contained live free-block counters that change on every write, so
# this watcher re-announced [signal-change] every 2s into an unrotated log.
# Probe once, then call only the correct form.
if stat -c %Y . >/dev/null 2>&1; then
  file_mtime(){ stat -c %Y "$1" 2>/dev/null; }
else
  file_mtime(){ stat -f %m "$1" 2>/dev/null; }
fi

last=$(file_mtime "$signal_file")
while true; do
  sleep 2
  new=$(file_mtime "$signal_file")
  if [ -n "$new" ] && [ "$new" != "$last" ]; then
    last=$new
    holder=$(grep '^| Holder ' "$signal_file" | head -1 | sed 's/^| Holder *| //; s/ *|$//') || holder=""
    state=$(grep '^| State ' "$signal_file" | head -1 | sed 's/^| State *| //; s/ *|$//') || state=""
    task=$(grep '^| Task ' "$signal_file" | head -1 | sed 's/^| Task *| //; s/ *|$//') || task=""
    echo "[signal-change] Holder=$holder State=$state"
    if [ "$state" = "OVER_TO_COPILOT" ] || [ "$holder" = "GitHub Copilot" ]; then
      echo "=== Copilot handoff detected ==="
      echo "Task: $task"
      echo "See AGENT_SIGNAL.md to claim the mic and follow docs/DoD.md before acting."
    fi
  fi
done
