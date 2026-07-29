#!/bin/bash
# scripts/lib/placeholders.sh — THE forward substitution for {{PROJECT_NAME}}.
#
# WHY THIS IS ONE PRIMITIVE (A-07 R5-F1)
#
# "Meaning under substitution" is only a meaningful phrase if there is exactly
# one substitution semantics. There were three, and they disagreed:
#
#   scripts/blueprint substitute_placeholders    sed -e "s/{{PROJECT_NAME}}/${name}/g"
#   scripts/blueprint substituted_blueprint_copy the same sed
#   contamination.sh  _contamination_subst_file  bash ${line//token/$name}
#
# a2bp's round-trip check — the load-bearing safety property since R4 — used
# the bash form to verify what the sed form would later produce. For a project
# directory legitimately named `foo\bar` those differ, and the check passed
# while production substitution produced different bytes.
#
# Both were wrong, in different ways. Measured on this host:
#
#   name       bash ${//}              sed                  correct
#   foo\bar    foo\bar                 foobar               foo\bar
#   a&b        a{{PROJECT_NAME}}b      a{{PROJECT_NAME}}b   a&b
#   x/y        x/y                     sed: unknown option  x/y
#
# `&` means "the whole match" in a sed replacement, and bash 5.2 gave `&` the
# same meaning in `${var//pat/repl}` — so `pull` itself has been silently
# mangling any project whose name contains `&` or `\`, independent of a2bp.
# Directory names may legally contain both.
#
# So substitution is done by literal split-and-join: the project name is DATA
# and is never handed to anything that could interpret it — not as a regex,
# not as a replacement template. One primitive, used by pull, by drift's
# comparison, and by a2bp's verifier, so the three cannot drift apart again.
#
# shellcheck shell=bash

# bp_placeholder_upper NAME → the {{PROJECT_NAME_UPPER}} form.
bp_placeholder_upper() {
  printf '%s' "$1" | tr 'a-z-' 'A-Z_'
}

# bp_replace_literal STRING FIND REPLACE → stdout, no trailing newline.
# Every occurrence of FIND is replaced by REPLACE, both treated as literal
# bytes. `${s%%"$find"*}` and `${s#*"$find"}` with FIND quoted are literal
# operations, and REPLACE is only ever concatenated — never re-scanned.
bp_replace_literal() {
  local s="$1" find="$2" repl="$3" out="" pre
  [ -n "$find" ] || { printf '%s' "$s"; return 0; }
  while [ -n "$s" ]; do
    case "$s" in
      *"$find"*)
        pre=${s%%"$find"*}
        out="$out$pre$repl"
        s=${s#*"$find"}
        ;;
      *)
        out="$out$s"
        s=""
        ;;
    esac
  done
  printf '%s' "$out"
}

# bp_substitute_line LINE NAME UPPER → stdout, no trailing newline.
# UPPER first: {{PROJECT_NAME}} is a proper prefix-free token, but doing the
# longer token first keeps the two independent regardless.
bp_substitute_line() {
  local l="$1" nm="$2" up="$3"
  l=$(bp_replace_literal "$l" '{{PROJECT_NAME_UPPER}}' "$up")
  l=$(bp_replace_literal "$l" '{{PROJECT_NAME}}' "$nm")
  printf '%s' "$l"
}

# bp_substitute_stream FILE NAME → substituted content on stdout.
# A missing final newline is preserved: a line-oriented rewrite must not
# append one the author never wrote.
bp_substitute_stream() {
  local src="$1" nm="$2"
  local up
  up=$(bp_placeholder_upper "$nm")

  local final_nl=1
  if [ -s "$src" ] && [ "$(tail -c1 "$src" | wc -l)" -eq 0 ]; then
    final_nl=0
  fi

  local -a ls
  mapfile -t ls < "$src"
  local i n l
  n=${#ls[@]}
  for (( i=1; i<=n; i++ )); do
    l=$(bp_substitute_line "${ls[$(( i - 1 ))]}" "$nm" "$up")
    if [ "$i" -eq "$n" ] && [ "$final_nl" -eq 0 ]; then
      printf '%s' "$l"
    else
      printf '%s\n' "$l"
    fi
  done
}

# bp_substitute_in_place FILE NAME
bp_substitute_in_place() {
  local f="$1" nm="$2" tmp
  tmp=$(mktemp)
  bp_substitute_stream "$f" "$nm" > "$tmp"
  mv "$tmp" "$f"
}
