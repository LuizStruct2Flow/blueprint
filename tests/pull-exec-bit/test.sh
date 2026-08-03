#!/bin/bash
# tests/pull-exec-bit/test.sh
#
# BUG-008 — `blueprint pull` strips the executable bit, so a pulled hook is
# ARMED but never runs.
#
# `bp_substitute_in_place` writes to a `mktemp` (mode 600) and `mv`s it into
# place. `mv` carries the temp's mode onto the destination, so a 755 file comes
# out 600. Affects any managed file that is both executable and
# placeholder-bearing — verified: `.githooks/pre-push` (the gate itself),
# `scripts/start-codex-signal-watch.sh`, `scripts/start-gemini-signal-watch.sh`.
#
# Silent and severe: `core.hooksPath` is set, so the gate LOOKS armed, but git
# skips a non-executable hook without a word. BUG-004's failure mode through a
# different door.
#
# **This bug was already "fixed" once, and shipped broken.** The 2026-07-30 fix
# added `_bp_sync_exec_bit` to all four write paths — but every one of them
# calls `substitute_placeholders` on the very next line, and the primitive does
# its OWN mktemp+mv. The chmod was undone by the next statement. The repair
# addressed the callers and left the primitive, and nothing caught it because
# there was no regression test. That absence is why this file exists, and it
# tests the PRIMITIVE, not the call sites.
#
# Run from the blueprint repo root:  bash tests/pull-exec-bit/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/placeholders.sh"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
[ -f "$LIB" ] || { echo "FAIL: missing $LIB"; exit 1; }

mode_of(){ stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null; }

# ===========================================================================
# 1. THE REPRODUCER — the PRIMITIVE must preserve the destination's mode.
#    Tested here rather than at a call site, because the previous fix repaired
#    the call sites and left this, and the call sites then undid it.
# ===========================================================================
f="$TMP/exec-file.sh"
printf '#!/bin/sh\n# {{PROJECT_NAME}}\necho hi\n' >"$f"
chmod 755 "$f"
before="$(mode_of "$f")"

( . "$LIB"; bp_substitute_in_place "$f" demo-project ) >/dev/null 2>&1
after="$(mode_of "$f")"

if [ "$before" != "755" ]; then
  fail "#1 fixture did not start at 755 (got $before) — the assertion would be meaningless"
elif [ "$after" != "755" ]; then
  fail "#1 bp_substitute_in_place changed the mode $before -> $after; an executable hook becomes unrunnable and git skips it silently"
else
  pass "#1 the substitution primitive preserves 755 on an executable file"
fi

# ===========================================================================
# 2. It must still have SUBSTITUTED. A fix that preserves the mode by not
#    writing the file would pass #1 and break everything else.
# ===========================================================================
if grep -q '{{PROJECT_NAME}}' "$f"; then
  fail "#2 the placeholder was not substituted — the mode was preserved by not doing the work"
elif grep -q 'demo-project' "$f"; then
  pass "#2 the placeholder was substituted (the mode fix did not skip the write)"
else
  fail "#2 the file contains neither the placeholder nor the substitution: $(cat "$f")"
fi

# ===========================================================================
# 3. A NON-executable file stays non-executable. Preserving the mode must mean
#    preserving it, not forcing everything to 755.
# ===========================================================================
g="$TMP/plain.md"
printf '# {{PROJECT_NAME}}\n' >"$g"
chmod 644 "$g"
( . "$LIB"; bp_substitute_in_place "$g" demo-project ) >/dev/null 2>&1
gm="$(mode_of "$g")"
[ "$gm" = "644" ] \
  && pass "#3 a 644 file stays 644 (the mode is preserved, not forced)" \
  || fail "#3 a plain file's mode changed 644 -> $gm"

# ===========================================================================
# 4. A REFUSED substitution must leave the file untouched — content AND mode.
#    The original design promised "a refused file is left exactly as it was
#    rather than half-written"; the mode is part of "as it was".
# ===========================================================================
h="$TMP/refused.sh"
printf '#!/bin/sh\n{{PROJECT_NAME}}\n' >"$h"
chmod 700 "$h"
sum_before="$(cksum <"$h")"
# An unrepresentable project name is what bp_substitute_stream refuses.
( . "$LIB"; bp_substitute_in_place "$h" "$(printf 'bad\nname')" ) >/dev/null 2>&1
hm="$(mode_of "$h")"
sum_after="$(cksum <"$h")"
if [ "$sum_before" != "$sum_after" ]; then
  fail "#4 a refused substitution modified the file's CONTENT"
elif [ "$hm" != "700" ]; then
  fail "#4 a refused substitution changed the mode 700 -> $hm"
else
  pass "#4 a refused substitution leaves content and mode exactly as they were"
fi

# ===========================================================================
# 5. THE REAL FILES. Non-vacuity plus the actual exposure: the managed files
#    that are both executable and placeholder-bearing are the ones this bug
#    disarms, and `.githooks/pre-push` is the gate itself.
# ===========================================================================
checked=0; broke=0
for rel in .githooks/pre-push scripts/start-codex-signal-watch.sh scripts/start-gemini-signal-watch.sh; do
  src="$ROOT/$rel"
  [ -f "$src" ] || continue
  grep -q '{{PROJECT_NAME}}' "$src" 2>/dev/null || continue
  [ -x "$src" ] || continue
  checked=$((checked+1))
  cp -p "$src" "$TMP/real"
  ( . "$LIB"; bp_substitute_in_place "$TMP/real" demo-project ) >/dev/null 2>&1
  m="$(mode_of "$TMP/real")"
  case "$m" in
    *7*|*5*|*1*) : ;;
    *) fail "#5 $rel came out non-executable ($m) — the gate would be armed but skipped"; broke=1 ;;
  esac
done
if [ "$checked" -eq 0 ]; then
  fail "#5 no executable placeholder-bearing managed file found — this suite is vacuous"
elif [ "$broke" -eq 0 ]; then
  # Guarded on `broke`: the first version printed this "ok" line even after
  # reporting three failures above it, which is the shape of a summary that
  # reassures while the detail contradicts it.
  pass "#5 all $checked executable placeholder-bearing managed files stay executable"
fi

# ===========================================================================
# 6. FAULT INJECTION — mode copy FAILS, so the file must be left ALONE.
#    (Codex F2.) bp_copy_mode used to return success when both probes failed
#    and to discard the fallback chmod's status, so the caller went on to
#    install the 600 temp and silently disabled the hook again — BUG-008
#    reintroduced through the error path of its own fix.
#
#    "Never fatal" is the wrong instinct here: aborting ONE file replacement
#    leaves a working executable in place; continuing destroys it.
# ===========================================================================
inj="$TMP/inj"; mkdir -p "$inj"
printf '#!/bin/sh\nexit 1\n' >"$inj/chmod"; chmod +x "$inj/chmod"
printf '#!/bin/sh\nexit 1\n' >"$inj/stat";  chmod +x "$inj/stat"

k="$TMP/faulty.sh"
printf '#!/bin/sh\n# {{PROJECT_NAME}}\n' >"$k"
chmod 755 "$k"
k_before="$(cat "$k")"

( PATH="$inj:$PATH"; . "$LIB"; bp_substitute_in_place "$k" demo-project ) >/dev/null 2>&1
k_rc=$?
k_mode="$(mode_of "$k")"

if [ "$k_rc" -eq 0 ]; then
  fail "#6 mode copy failed but bp_substitute_in_place reported success"
elif [ "$k_mode" != "755" ]; then
  fail "#6 mode copy failed and the file was replaced anyway (now $k_mode) — the hook is silently disabled"
elif [ "$(cat "$k")" != "$k_before" ]; then
  fail "#6 mode copy failed and the CONTENT was replaced anyway"
else
  pass "#6 when the mode cannot be preserved, the original is left untouched and the call fails"
fi

# No temp debris beside the destination.
leftover=$(find "$TMP" -maxdepth 1 -name '.bp-subst.*' 2>/dev/null | wc -l | tr -d ' ')
[ "$leftover" = "0" ] \
  && pass "#6 no .bp-subst temp files leaked on the failure path" \
  || fail "#6 $leftover temp file(s) left beside the destination"

# ===========================================================================
# 7. The temp is created BESIDE the destination, not in $TMPDIR (Codex F3).
#    A bare mktemp lands in /tmp; if that is another filesystem, `mv` degrades
#    to copy-then-unlink and is NOT atomic — the very property the comment
#    claimed. Asserted on the source, since observing the rename is racy.
# ===========================================================================
if grep -q 'mktemp "\$dir/' "$LIB"; then
  pass "#7 the temp is created in the destination's directory (atomic rename)"
else
  fail "#7 bp_substitute_in_place still uses a bare mktemp — mv may cross filesystems and lose atomicity"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-008 — pull preserves the executable bit; an armed hook actually runs."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
