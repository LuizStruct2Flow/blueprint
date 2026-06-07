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
last=$(stat -f %m "$signal_file" 2>/dev/null || stat -c %Y "$signal_file" 2>/dev/null)
while true; do
  sleep 2
  new=$(stat -f %m "$signal_file" 2>/dev/null || stat -c %Y "$signal_file" 2>/dev/null)
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
