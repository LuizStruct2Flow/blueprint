#!/usr/bin/env bash
# Which spelling of "append two lines" is actually ONE write()?
#
# `printf '%s\n' "$two_line"` is TWO — measured, and it is what
# scripts/session-resume.sh:201 uses while its comment claims one. Find the form
# that makes the claim true.
set -u
L1='[ts] </aaaaaaaa>'
L2='[ts] <bbbbbbbb> head=deadbee'
R="$(printf '%s\n%s' "$L1" "$L2")"

probe() {  # probe LABEL SCRIPT
  local label="$1" script="$2" out st n
  out="$(mktemp)"
  st="$(mktemp)"
  R="$R" L1="$L1" L2="$L2" OUT="$out" strace -f -e trace=write -o "$st" bash -c "$script"
  # ATOMIC means ONE write carrying BOTH lines. Counting writes that merely
  # mention the text is wrong: a heredoc makes bash write the body to a temp file
  # first, which is a write nobody can interleave with the journal.
  n="$(grep -cE 'write\([0-9]+, "\[ts\]' "$st" || true)"
  both="$(grep -cE 'write\([0-9]+, "\[ts\] </aaaaaaaa>\\n\[ts\] <bbbbbbbb>' "$st" || true)"
  printf '%-44s writes-mentioning-text=%s  single-write-carrying-BOTH-lines=%s\n' "$label" "$n" "$both"
  grep -E 'write\([0-9]+, "\[ts\]' "$st" | sed 's/^/      /'
  rm -f "$out" "$st"
}

probe "printf '%s\\n' \"\$R\""              'printf "%s\n" "$R" >> "$OUT"'
probe "printf '%s\\n%s\\n' \"\$L1\" \"\$L2\"" 'printf "%s\n%s\n" "$L1" "$L2" >> "$OUT"'
probe "echo \"\$R\""                        'echo "$R" >> "$OUT"'
probe "command printf (coreutils)"          '/usr/bin/printf "%s\n" "$R" >> "$OUT"'
probe "cat <<EOF"                           'cat >> "$OUT" <<EOF
$R
EOF'
probe "printf | cat"                        'printf "%s\n" "$R" | cat >> "$OUT"'
probe "printf >(subshell) with dd"          'printf "%s\n" "$R" | dd bs=64k status=none >> "$OUT"'
