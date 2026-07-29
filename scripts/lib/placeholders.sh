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
#
# ONE PASS over both tokens (A-07 R6-F1). Replacing UPPER and then feeding the
# result to a lowercase pass is a pipeline, and a pipeline re-scans its own
# output: for a project legitimately named `x{{PROJECT_NAME}}y`, the bytes the
# first pass emitted were re-interpreted by the second —
#
#   input     {{PROJECT_NAME_UPPER}}
#   expected  X{{PROJECT_NAME}}Y
#   two-pass  Xx{{PROJECT_NAME}}yY      ← emitted data became input
#
# which contradicted this library's whole claim that replacement bytes are
# never re-scanned. So the scan finds the EARLIEST of either token, emits its
# replacement into the output, and continues from after the token in the
# remaining INPUT. Emitted bytes are appended and never examined again.
#
# The two tokens can never match at the same index (one needs `}}` where the
# other has `_U`), so "earliest wins" is unambiguous.
bp_substitute_line() {
  local s="$1" nm="$2" up="$3"
  local TL='{{PROJECT_NAME}}' TU='{{PROJECT_NAME_UPPER}}'
  local out="" pre_l="" pre_u="" has_l has_u
  while [ -n "$s" ]; do
    case "$s" in *"$TU"*) pre_u=${s%%"$TU"*}; has_u=1 ;; *) has_u=0 ;; esac
    case "$s" in *"$TL"*) pre_l=${s%%"$TL"*}; has_l=1 ;; *) has_l=0 ;; esac
    if [ "$has_u" -eq 0 ] && [ "$has_l" -eq 0 ]; then
      out="$out$s"
      break
    fi
    if [ "$has_u" -eq 1 ] && { [ "$has_l" -eq 0 ] || [ ${#pre_u} -lt ${#pre_l} ]; }; then
      out="$out$pre_u$up"
      s=${s#*"$TU"}
    else
      out="$out$pre_l$nm"
      s=${s#*"$TL"}
    fi
  done
  printf '%s' "$out"
}

# bp_validate_project_name NAME → 0 if substitutable, 1 otherwise (message on
# stderr).
#
# The supported contract, stated rather than assumed (A-07 R6-F1/R6-F2). The
# substitution, the diff alignment and the contamination scan are all
# LINE-ORIENTED, so a project directory whose name contains a newline cannot
# be represented in any of them. Such a name is legal on the filesystem, so
# it is refused explicitly instead of being silently mangled — command
# substitution used to strip it, which is the same silent truncation this
# whole finding is about.
bp_validate_project_name() {
  case "$1" in
    '')
      echo "error: project name is empty — cannot substitute" >&2
      return 1
      ;;
    *$'\n'*)
      # $'\n', never "$(printf '\n')" — command substitution strips trailing
      # newlines, so that form collapses to the empty string and the pattern
      # `*""*` matches EVERY name. It did, and every substitution refused.
      echo "error: project directory name contains a newline; blueprint sync is line-oriented and cannot represent it" >&2
      return 1
      ;;
  esac
  return 0
}

# bp_contains_nul FILE → 0 if the file contains a NUL byte.
# Streams; never loads the file.
bp_contains_nul() {
  ! tr -d '\0' < "$1" | cmp -s - "$1"
}

# bp_substitute_stream FILE NAME → substituted content on stdout.
# Returns non-zero (without writing) if FILE cannot be handled safely.
#
# BINARY IS REFUSED, NOT MANGLED (A-07 R6-F2). Shell variables cannot hold a
# NUL byte, so any bash-based rewrite silently discards binary content and
# everything after it — `printf 'A\0{{PROJECT_NAME}}\0Z'` came back as a lone
# `A`. The previous `sed` path preserved those bytes, so routing pull and
# drift through here would have let `pull` TRUNCATE an existing managed file.
# Blueprint-managed files are text by construction (markdown, shell, json,
# yml), so the honest fix is to state that and fail closed on the exception —
# silent truncation is never an acceptable unsupported-mode behaviour.
#
# STREAMS LINE BY LINE, no `mapfile`. Reading the whole file into an array and
# rebuilding shell strings made pull/drift's memory proportional to file size
# where `sed` had been O(1); a shared primitive on the pull path should not
# carry that.
#
# A missing final newline is preserved: a line-oriented rewrite must not
# append one the author never wrote.
bp_substitute_stream() {
  local src="$1" nm="$2"

  bp_validate_project_name "$nm" || return 1

  if [ -s "$src" ] && bp_contains_nul "$src"; then
    echo "error: $src contains NUL bytes; blueprint-managed files must be text" >&2
    return 2
  fi

  local up
  up=$(bp_placeholder_upper "$nm")

  local final_nl=1
  if [ -s "$src" ] && [ "$(tail -c1 "$src" | wc -l)" -eq 0 ]; then
    final_nl=0
  fi

  # `|| [ -n "$l" ]` catches a final line with no newline. Emitting the
  # separator BEFORE each subsequent line (rather than after each line) is
  # what lets the last one stay unterminated without a lookahead.
  local l first=1
  while IFS= read -r l || [ -n "$l" ]; do
    [ "$first" -eq 1 ] || printf '\n'
    first=0
    bp_substitute_line "$l" "$nm" "$up"
  done < "$src"
  [ "$first" -eq 1 ] || [ "$final_nl" -eq 0 ] || printf '\n'
}

# bp_substitute_in_place FILE NAME
# The file is only replaced if substitution succeeded — a refused file (binary,
# unrepresentable name) is left exactly as it was rather than half-written.
bp_substitute_in_place() {
  local f="$1" nm="$2" tmp rc=0
  tmp=$(mktemp)
  bp_substitute_stream "$f" "$nm" > "$tmp" || rc=$?
  if [ "$rc" -ne 0 ]; then
    rm -f "$tmp"
    return "$rc"
  fi
  mv "$tmp" "$f"
}
