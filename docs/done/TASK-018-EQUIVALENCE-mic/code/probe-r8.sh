#!/usr/bin/env bash
# How provokable is Codex R8's gap, and at what appender rate?
#
# The shell suite drives the race with a full `bash signal-set.sh` per flip
# (~30 ms), so the competing appender runs at ~33 Hz against a gap of a few
# microseconds. This measures what a DIRECT appender — one `printf >>`, which is
# exactly signal-set.sh's contribution to the journal — reaches instead.
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
MARKS="${1:-30}"
MODE="${2:-mutant}"

W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
mkdir -p "$W/docs/doing" "$W/logs/state"
printf '# HANDOVER\n' > "$W/docs/doing/HANDOVER.md"
: > "$W/logs/state/signal-history.log"
git -C "$W" init -q
git -C "$W" config user.email t@example.invalid
git -C "$W" config user.name t
git -C "$W" add -A >/dev/null 2>&1
git -C "$W" commit -qm base >/dev/null 2>&1

cp -R "$ROOT/scripts" "$W/scripts"
ln -sf "$W/scripts/session-resume.sh" "$W/resume-link.sh"
cp "$W/scripts/session-resume.sh" "$W/scripts/resume.sh"
mv "$W/scripts/resume.sh" "$W/scripts/resume.sh"
ln -sf "$W/scripts/resume.sh" "$W/scripts/resume.sh"
if [ "$MODE" = mutant ]; then
  MUT_FROM='  printf '"'"'%s\n'"'"' "$roll" >>"$JOURNAL"' \
  MUT_TO='  printf '"'"'%s\n'"'"' "$roll" | while IFS= read -r __l; do printf '"'"'%s\n'"'"' "$__l" >>"$JOURNAL"; done' \
    perl -0pi -e 's/\Q$ENV{MUT_FROM}\E/$ENV{MUT_TO}/' "$W/scripts/resume.sh"
  grep -q 'while IFS= read -r __l' "$W/scripts/resume.sh" || { echo "mutation failed"; exit 3; }
fi

J="$W/logs/state/signal-history.log"
STOP="$W/stop"
(
  i=0
  while [ ! -f "$STOP" ]; do
    printf '[2026-08-06T10:00:00Z] Holder=Flipper State=ACTIVE Task=flip %s\n' "$i" >> "$J"
    i=$((i + 1))
  done
) &
flip=$!

start="$(date +%s.%N)"
i=0
while [ "$i" -lt "$MARKS" ]; do
  AGENT_SIGNAL_FILE= AGENT_STATE_HOME= bash "$W/scripts/resume.sh" --root "$W" --mark >/dev/null 2>&1
  i=$((i + 1))
done
end="$(date +%s.%N)"
: > "$STOP"
wait "$flip" 2>/dev/null

lines="$(wc -l < "$J")"
orphans="$(awk '
  /^\[[^]]*\] <\/[0-9a-f]+>/ { gap = 1; next }
  /^\[[^]]*\] <[0-9a-f]+> /  { gap = 0; next }
  gap                        { print }
' "$J" | grep -c . || true)"
elapsed="$(awk -v a="$start" -v b="$end" 'BEGIN{printf "%.2f", b-a}')"
rate="$(awk -v l="$lines" -v e="$elapsed" 'BEGIN{printf "%.0f", l/e}')"
echo "mode=$MODE marks=$MARKS elapsed=${elapsed}s journal_lines=$lines appender_rate=${rate}/s orphans=$orphans"
echo "--- first orphan with context (proof the detector is not lying) ---"
grep -n -E '^\[[^]]*\] </[0-9a-f]+>' "$J" | head -40 | while IFS=: read -r n _; do
  nxt="$(sed -n "$((n + 1))p" "$J")"
  case "$nxt" in
    '['*'] <'[0-9a-f]*'> '*) : ;;
    *) sed -n "$((n - 1)),$((n + 3))p" "$J"; echo '   ^^^ a close marker whose NEXT line is not the open marker'; break ;;
  esac
done
