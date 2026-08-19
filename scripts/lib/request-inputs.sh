#!/bin/bash
# scripts/lib/request-inputs.sh — validate the files a request is built from.
#
# This decides which bytes leave the operator's machine, so every rule here is
# about a path resolving to something other than what was typed. `a2bp` is the
# only write path from a project into the generic blueprint and is how BUG-002
# and A-09 both got in; the contamination guard checks the CONTENT, and this
# checks that the content came from where the operator said.
#
# Plan: docs/doing/PLAN-A2BP-PR.md §5.1.
#
# shellcheck shell=bash

# --- bp_inputs_canonicalise PATH ---------------------------------------------
# Resolve `.` and `..` and collapse duplicate separators, TEXTUALLY — without
# consulting the filesystem, so symlinks are not followed here. Following them
# would resolve a path to a location the operator never named, which is the
# thing the symlink check below exists to catch; canonicalising through them
# would launder exactly that case before it could be seen.
#
# Emits a project-relative path, or fails if the result escapes the root.
bp_inputs_canonicalise() {
  local path="$1" part out=""

  case "$path" in
    /*) echo "bp_inputs: '$path' is absolute; give a project-relative path" >&2
        return 1 ;;
  esac

  local IFS='/'
  # shellcheck disable=SC2086
  set -- $path
  for part in "$@"; do
    case "$part" in
      ''|'.') continue ;;
      '..')
        if [ -z "$out" ]; then
          # Refused rather than clamped. Clamping would silently turn
          # `../../etc/passwd` into `etc/passwd` — a different file that might
          # well exist, quietly filed instead of the refusal the operator needs.
          echo "bp_inputs: '$path' escapes the project root" >&2
          return 1
        fi
        case "$out" in
          */*) out=${out%/*} ;;   # pop one component
          *)   out="" ;;          # popped the last one; back at the root
        esac
        continue ;;
      *) if [ -z "$out" ]; then out="$part"; else out="$out/$part"; fi ;;
    esac
  done

  if [ -z "$out" ]; then
    echo "bp_inputs: '$path' does not name a file" >&2
    return 1
  fi
  printf '%s' "$out"
}

# --- bp_inputs_mode PATH -----------------------------------------------------
# 100755 if executable by anyone, else 100644. Git records only that bit.
bp_inputs_mode() {
  if [ -x "$1" ]; then printf '100755'; else printf '100644'; fi
}

# --- _bp_inputs_under_managed_dir CANON MANAGED_LIST_FILE --------------------
# BUG-029 — a managed entry ending in `/` names a DIRECTORY, and every file the
# blueprint ships under it is managed.
#
# The exact-match test above cannot see those. `cmd_a2bp` is the one command
# that never calls `read_blueprint_source` — it works against the fetched REMOTE
# base rather than a local checkout, deliberately — so it has no HEAD to expand
# the directory from and validates against the raw MANAGED_FILES list. Without
# this, `a2bp tests/pipeline/test.sh` is refused as unmanaged, i.e. no suite
# could ever be back-propagated.
#
# Prefix, and the trailing `/` is what makes it a safe one: `tests/` matches
# `tests/pipeline/test.sh` and not the sibling `testsuite/test.sh`. This is a
# MEMBERSHIP test only — whether the path really exists in the base is checked
# after the fetch by bp_build_validate_base, and whether it exists HERE is
# checked below, which is what refuses a suite this project does not have.
_bp_inputs_under_managed_dir() {
  local canon="$1" managed="$2" d
  while IFS= read -r d; do
    # `if`, not `[ … ] && return 0`: a trailing `&&` list that fails is the last
    # command of the loop body, so under `set -e` this would abort anywhere but
    # the `if !` condition it happens to be called from today.
    case "$d" in
      */) if [ "${canon#"$d"}" != "$canon" ]; then return 0; fi ;;
    esac
  done < "$managed"
  return 1
}

# --- bp_inputs_validate ROOT MANAGED_LIST_FILE PATH... -----------------------
# Prints one `<canonical-path>:<mode>` line per accepted input, sorted byte-wise
# and de-duplicated. Any refusal fails the whole call: a request is filed as one
# unit, so proceeding with a subset would file something the operator did not
# ask for.
#
# MANAGED_LIST_FILE holds one managed path per line — passed as a file rather
# than an array so the check has a single source and cannot drift from the CLI's
# MANAGED_FILES.
bp_inputs_validate() {
  local root="$1" managed="$2"; shift 2
  local raw canon mode rc=0
  local accepted=""

  if [ "$#" -eq 0 ]; then
    echo "bp_inputs: no files given" >&2
    return 1
  fi

  for raw in "$@"; do
    canon=$(bp_inputs_canonicalise "$raw") || { rc=1; continue; }

    # MANAGED_FILES is checked on the CANONICAL form, so `./docs/DoD.md` and
    # `docs/../docs/DoD.md` cannot slip past a check that only matches the
    # literal spelling.
    if ! grep -qxF -- "$canon" "$managed" && ! _bp_inputs_under_managed_dir "$canon" "$managed"; then
      echo "bp_inputs: '$canon' is not a blueprint-managed file." >&2
      echo "  Only files in MANAGED_FILES can be back-propagated; project-specific" >&2
      echo "  content belongs in project_config_*.md. See 'blueprint files'." >&2
      rc=1; continue
    fi

    # -L before -f: `[ -f ]` follows symlinks, so a symlink to a regular file
    # passes it. Filing through one would send bytes from a location the
    # operator did not name, and the PR would show the path they did.
    if [ -L "$root/$canon" ]; then
      echo "bp_inputs: '$canon' is a symlink; refusing to file bytes from wherever it points" >&2
      rc=1; continue
    fi
    if [ ! -e "$root/$canon" ]; then
      echo "bp_inputs: '$canon' does not exist in this project" >&2
      rc=1; continue
    fi
    if [ -d "$root/$canon" ]; then
      echo "bp_inputs: '$canon' is a directory" >&2
      rc=1; continue
    fi
    if [ ! -f "$root/$canon" ]; then
      echo "bp_inputs: '$canon' is not a regular file" >&2
      rc=1; continue
    fi
    if [ ! -r "$root/$canon" ]; then
      echo "bp_inputs: '$canon' is not readable" >&2
      rc=1; continue
    fi

    mode=$(bp_inputs_mode "$root/$canon")
    accepted="${accepted}${canon}:${mode}"$'\n'
  done

  [ "$rc" -eq 0 ] || return 1

  # Sorted and de-duplicated here, once. The request key is a pure function of
  # the spec list, so ordering is a correctness property: the same request typed
  # in a different argument order must produce the same branch, or the two would
  # be filed as unrelated requests.
  printf '%s' "$accepted" | LC_ALL=C sort -u
}

# --- bp_inputs_drop_unchanged BARE BASE SPEC... ------------------------------
# Drops inputs already identical to the base, printing what it dropped, and
# fails when nothing is left.
#
# An empty PR costs a reviewer the same attention as a real one, and reviewer
# attention is the scarce resource this whole design exists to protect — so
# "nothing to request" is a refusal, not a no-op success.
bp_inputs_drop_unchanged() {
  local bare="$1" base="$2"; shift 2
  local spec path mode cfile kept="" dropped=0

  for spec in "$@"; do
    path=${spec%%:*}
    mode=${spec#*:}; mode=${mode%%:*}
    cfile=${spec#*:*:}

    local base_mode base_entry
    base_entry=$(bp_request_hermetic git -C "$bare" ls-tree "$base" -- "$path" 2>/dev/null)
    if [ -n "$base_entry" ]; then
      base_mode=$(printf '%s' "$base_entry" | awk '{print $1}')
      if [ "$base_mode" = "$mode" ] && \
         bp_request_hermetic git -C "$bare" show "$base:$path" 2>/dev/null | cmp -s - "$cfile"; then
        echo "  dropped (identical to the blueprint): $path" >&2
        dropped=$((dropped+1))
        continue
      fi
    fi
    kept="${kept}${spec}"$'\n'
  done

  if [ -z "$kept" ]; then
    echo "Nothing to request: every file given is already identical to the blueprint." >&2
    return 2
  fi
  [ "$dropped" -gt 0 ] && echo "  $dropped file(s) dropped; the rest proceed." >&2
  printf '%s' "$kept"
}
