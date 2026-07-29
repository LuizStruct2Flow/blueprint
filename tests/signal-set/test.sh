#!/bin/bash
# tests/signal-set/test.sh
#
# scripts/signal-set.sh publishes the whole baton in one atomic write, so a
# poller can never sample the new State beside the previous round's Task.
#
# Everything here was found by the tool failing on its own first real use. The
# very first dispatch written with it was REFUSED for containing a pipe — in a
# question about whether refusing pipes was correct. The refusal became
# escaping; `awk -v` then silently undid the escaping and truncated the
# instruction at exactly the point it was explaining pipes. A guard whose two
# input paths disagree, or whose escaping is undone downstream, is worse than
# no guard: it reports success.
#
# Run from the blueprint repo root:  bash tests/signal-set/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SETTER="$ROOT/scripts/signal-set.sh"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

[ -x "$SETTER" ] || { echo "FAIL: missing or non-executable $SETTER"; exit 1; }

SIG="$WORK/AGENT_SIGNAL.md"
fresh(){
  printf '# Agent Signal\n\nPreamble stays untouched.\n\n| Field | Value |\n|---|---|\n| Holder | OLD |\n| State | OLD |\n| Task | old task |\n| Last update | 1970-01-01 |\n\nTrailer stays untouched.\n' >"$SIG"
}

# How a reader recovers the cell: strip the row prefix and the trailing
# delimiter. Mirrors the watcher's field parse.
task_cell(){ grep '^| Task |' "$SIG" | sed 's/^| Task | //; s/ |$//'; }
rows(){ grep -c '^| Task |' "$SIG"; }

# ===========================================================================
# 1. A literal pipe must survive as an ESCAPED pipe, not truncate the cell and
#    not be rejected. Refusing means a prompt can never discuss shell
#    pipelines, alternation, or this very rule.
# ===========================================================================
fresh
if ! bash "$SETTER" --file "$SIG" --holder H --state S --task 'discuss a | pipe' >/dev/null 2>&1; then
  fail "#1 a Task containing a pipe was refused outright"
elif [ "$(rows)" -ne 1 ]; then
  fail "#1 the pipe broke the table into $(rows) Task rows"
elif ! task_cell | grep -q 'discuss a \\| pipe'; then
  fail "#1 the pipe was not escaped in the cell: [$(task_cell)]"
elif ! task_cell | grep -q 'pipe$'; then
  fail "#1 the cell was truncated at the pipe: [$(task_cell)]"
else
  pass "#1 a literal pipe is escaped, not refused, and the text survives intact"
fi

# ===========================================================================
# 2. Backslashes and regex-special text must pass through as data. This is the
#    `awk -v` bug: -v runs escape processing over the value, so \| became a raw
#    pipe again. ENVIRON does not.
# ===========================================================================
fresh
bash "$SETTER" --file "$SIG" --holder H --state S \
  --task 'path C:\tmp\new and regex .*+?[]^$ and & ampersand' >/dev/null 2>&1
got="$(task_cell)"
case "$got" in
  *'C:\tmp\new'*) : ;;
  *) fail "#2 backslash sequences were mangled: [$got]" ;;
esac
case "$got" in
  *'.*+?[]^$'*) : ;;
  *) fail "#2 regex-special characters were mangled: [$got]" ;;
esac
case "$got" in
  *'& ampersand'*) pass "#2 backslashes, regex metacharacters and & pass through as data" ;;
  *) fail "#2 '&' was mangled (sed replacement semantics): [$got]" ;;
esac

# ===========================================================================
# 3. BOTH input paths must normalise newlines. --task-file did and --task did
#    not, so a multiline --task produced a broken multi-line table row: one
#    path validated, the other not.
# ===========================================================================
fresh
bash "$SETTER" --file "$SIG" --holder H --state S --task "$(printf 'line one\nline two')" >/dev/null 2>&1
if [ "$(rows)" -ne 1 ]; then
  fail "#3 multiline --task produced $(rows) Task rows — the table is broken"
elif ! task_cell | grep -q 'line one line two'; then
  fail "#3 multiline --task did not collapse to one line: [$(task_cell)]"
else
  pass "#3 multiline --task is normalised to a single cell"
fi

fresh
printf 'from\na file\n' >"$WORK/t.md"
bash "$SETTER" --file "$SIG" --holder H --state S --task-file "$WORK/t.md" >/dev/null 2>&1
if [ "$(rows)" -ne 1 ]; then
  fail "#3b multiline --task-file produced $(rows) Task rows"
elif ! task_cell | grep -q 'from a file'; then
  fail "#3b multiline --task-file did not collapse: [$(task_cell)]"
else
  pass "#3b multiline --task-file is normalised the same way"
fi

# ===========================================================================
# 4. The rest of the file is project-owned prose and must be untouched.
# ===========================================================================
fresh
bash "$SETTER" --file "$SIG" --holder NEW --state NEWSTATE --task 'x' >/dev/null 2>&1
if ! grep -q '^Preamble stays untouched\.$' "$SIG" || ! grep -q '^Trailer stays untouched\.$' "$SIG"; then
  fail "#4 surrounding prose was modified"
elif ! grep -q '^| Holder | NEW |$' "$SIG" || ! grep -q '^| State | NEWSTATE |$' "$SIG"; then
  fail "#4 Holder/State rows were not rewritten"
else
  pass "#4 only the baton rows change; surrounding prose is byte-identical"
fi

# ===========================================================================
# 5. A failed publish must leave the previous baton intact, never half-written.
# ===========================================================================
fresh
before="$(cat "$SIG")"
bash "$SETTER" --file "$SIG" --holder H --state S >/dev/null 2>&1 && \
  fail "#5 publishing with no Task succeeded"
if [ "$(cat "$SIG")" != "$before" ]; then
  fail "#5 a refused publish modified the signal"
else
  pass "#5 a refused publish leaves the previous baton byte-identical"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "PASS: the baton publishes atomically and survives pipes, backslashes and newlines."
  exit 0
fi
echo "FAILED: signal-set.sh is not publishing safely."
exit 1
