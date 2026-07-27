#!/bin/bash
# scripts/lib/contamination.sh — guards the project → blueprint boundary.
#
# WHY THIS EXISTS (A-07)
#
# `blueprint pull` substitutes {{PROJECT_NAME}} into a project's copy of a
# managed file. `blueprint a2bp` copies that file back. For years it did so
# with a bare `cp`, which means the substituted text — one specific project's
# name, its host paths, its state dirs — was written into the file that every
# OTHER project then pulls. That is not a theoretical hazard; it is the
# mechanism behind two of this repo's worst defects:
#
#   BUG-002  `~/.linkedin-watcher-agent` hardcoded into the generic activity
#            feed, so the [CODEX]/[GEMINI] lines silently never appeared in
#            any derived project.
#   A-09     dispatchers writing a literal `~/.{{PROJECT_NAME}}/`, shared by
#            every checkout — a redcare Codex verdict surfaced live in this
#            repo's feed. Eight four-eyes rounds to close.
#
# Both arrived through a2bp. Guarding the pipe stops the next one at source.
#
# Two primitives, deliberately separate:
#
#   contamination_reverse_substitute  — DETERMINISTIC. The exact inverse of
#       scripts/blueprint's substitute_placeholders. Always safe to apply, so
#       it applies silently.
#   contamination_scan                — HEURISTIC. Catches what no mechanical
#       inverse can know about (host paths, foreign state dirs, operator
#       emails). Because it is heuristic it must be overridable, and every
#       override must be visible — see "BLOCKING vs NOTICE" below.
#
# Sourced by scripts/blueprint. Kept as a shared lib rather than inlined so
# the gate and new-project.sh can reuse the same patterns — the same reason
# scripts/lib/state-dir.sh exists (A-09): one mechanism, never two that agree
# only by coincidence.
#
# shellcheck shell=bash

# --- Per-line suppression -------------------------------------------------
# A line carrying `a2bp-allow: <justification>` is skipped by every check.
# This is the precise tool for a known-benign hit — notably a comment that
# quotes a historical contamination on purpose (scripts/agent-activity.sh
# documents BUG-002's old path by name). `--force` is the blunt instrument:
# it waives the whole file, including findings you never looked at.
#
# CLAUDE.md §Security already sets the standard for suppressions: they carry
# a justification naming why they are safe. Same rule here, enforced — a bare
# marker with no text after it does NOT suppress.
_contamination_suppressed() {
  case "$1" in
    *a2bp-allow:*[!\ ]*) return 0 ;;
  esac
  return 1
}

# --- Well-known dot-directories -------------------------------------------
# Tool and shell dirs that are generic to every machine. Anything ELSE under
# ~/. or $HOME/. is a per-project state dir, which is precisely the BUG-002 /
# A-09 shape: it must be derived at runtime via scripts/lib/state-dir.sh, not
# written literally into a generic file.
#
# Note `{{PROJECT_NAME}}` is deliberately NOT allowlisted. After reverse-
# substitution a project's own `~/.acme-flow` becomes `~/.{{PROJECT_NAME}}` —
# which is A-09 exactly, the literal shared dir every checkout collided on.
# The placeholder makes it look intentional; it is still the defect.
_CONTAMINATION_KNOWN_DOTDIRS="aws bash_history bashrc cache claude codex config
copilot cursor docker gemini git gitconfig gitignore gnupg kube local npm nvm
profile semgrep ssh vscode zshrc"

_contamination_is_known_dotdir() {
  local name="$1" known
  for known in $_CONTAMINATION_KNOWN_DOTDIRS; do
    [ "$name" = "$known" ] && return 0
  done
  return 1
}

# --- Placeholder / infrastructure email domains ---------------------------
# Emails are the one check that stays a NOTICE rather than a block (see
# below). These are the ones not even worth mentioning.
_contamination_is_placeholder_email() {
  case "$1" in
    *@example.com|*@example.org|*@example.net|*@*.example) return 0 ;;
    git@github.com|*@local|noreply@*) return 0 ;;
  esac
  return 1
}

# --- contamination_reverse_substitute PROJ_FILE BP_FILE PROJECT_NAME ------
# Prints PROJ_FILE's content with placeholders restored, on a PROVENANCE
# basis: a line is reverted only when it is byte-identical to what
# substitute_placeholders would have produced from a placeholder-bearing line
# in the blueprint's own copy.
#
# WHY NOT A GLOBAL sed (Codex four-eyes F1, and it is a fair hit). The first
# cut of this function ran `s/${proj_name}/{{PROJECT_NAME}}/g` and the commit
# message called it "the exact inverse of substitute_placeholders". It is not,
# and the asymmetry is the whole point:
#
#   forward   replaces `{{PROJECT_NAME}}` — an unambiguous token that never
#             occurs in prose. Lossless by construction.
#   backward  would replace a bare word that absolutely does occur in prose.
#             For a project directory legitimately named `blueprint`, "The
#             blueprint documentation explains blueprint sync." silently
#             became "The {{PROJECT_NAME}} documentation explains
#             {{PROJECT_NAME}} sync." — and the guard then copied the
#             corrupted file with no finding at all.
#
# Substitution destroys the provenance needed to tell "this text came from a
# placeholder" from "this text always said that". The blueprint's own copy is
# where that provenance still exists, so that is what we consult. Names like
# `app`, `flow`, `docs` or `agent` make the blast radius of the naive version
# large, and an unescaped name containing regex metacharacters made it unsafe
# on top. Nothing here builds a regex from the project name.
#
# Lines the operator actually CHANGED are left alone. If such a line contains
# the project name, contamination_scan blocks it and the operator writes
# `{{PROJECT_NAME}}` explicitly. That is deliberate: fail closed and make the
# human resolve the ambiguity, rather than guess and corrupt silently.
#
# No blueprint copy (a brand-new managed file) → no provenance → verbatim
# passthrough, and the scan blocks on any project name. Also fail-closed.
#
# The caller is responsible for the _should_substitute exemption (files that
# IMPLEMENT the substitution carry the tokens as code — reverse-substituting
# scripts/blueprint would corrupt scripts/blueprint).
contamination_reverse_substitute() {
  local pf="$1" bpf="$2" proj_name="$3"
  local proj_upper
  proj_upper=$(printf '%s' "$proj_name" | tr 'a-z-' 'A-Z_')

  if [ ! -f "$bpf" ]; then
    cat "$pf"
    return 0
  fi

  # substituted-form → the original placeholder-bearing blueprint line.
  # Pure bash string replacement, never sed: the project name is DATA here,
  # and must never be compiled as a pattern.
  declare -A _rev
  local bl sub
  while IFS= read -r bl || [ -n "$bl" ]; do
    case "$bl" in
      *'{{PROJECT_NAME}}'*|*'{{PROJECT_NAME_UPPER}}'*) ;;
      *) continue ;;
    esac
    sub=${bl//\{\{PROJECT_NAME_UPPER\}\}/$proj_upper}
    sub=${sub//\{\{PROJECT_NAME\}\}/$proj_name}
    [ -n "${_rev[$sub]+x}" ] || _rev[$sub]=$bl
  done < "$bpf"

  # Stream the project file, preserving a missing final newline exactly.
  local pl out had_nl
  while :; do
    if IFS= read -r pl; then
      had_nl=1
    elif [ -n "$pl" ]; then
      had_nl=0
    else
      break
    fi
    out=$pl
    # Guard the empty key: bash associative arrays reject an empty subscript
    # outright ("bad array subscript"), and a blank line is never a candidate
    # for reversal anyway.
    if [ -n "$pl" ] && [ -n "${_rev[$pl]+x}" ]; then out=${_rev[$pl]}; fi
    if [ "$had_nl" -eq 1 ]; then
      printf '%s\n' "$out"
    else
      printf '%s' "$out"
      break
    fi
  done < "$pf"
}

# --- contamination_scan FILE PROJECT_NAME ---------------------------------
# Prints one finding per line as:  <lineno>|<BLOCK|NOTICE>|<reason>|<text>
# Returns 1 if any BLOCKing finding was printed, 0 otherwise.
#
# BLOCKING vs NOTICE — the split is calibrated, not guessed. Every pattern
# below was run across all 47 blueprint-managed files before being assigned:
#
#   host path        BLOCK   — 0 false positives measured. Same regex the
#                              pre-push .claude/settings.json guard already
#                              uses (A-01), so a2bp and the gate agree.
#   foreign dot dir  BLOCK   — 2 hits, 1 real doc-drift find, 1 historical
#                              comment (now carrying an a2bp-allow marker).
#   residual name    BLOCK   — ~0 by construction: reverse-substitution has
#                              already removed the exact forms, so a residual
#                              is a differently-cased variant it could not see.
#   email            NOTICE  — 11 hits, and the ambiguous one is legitimate
#                              (the founder's address in the pitch deck). A
#                              check that blocks on a legitimate line trains
#                              the operator to reach for --force by reflex,
#                              which costs more than the check is worth.
#
# IMPLEMENTATION NOTE — one grep pass per pattern, never per line. The first
# cut of this function shelled out to grep 3-4 times per LINE; across the 47
# managed files it did not finish in two minutes. Whole-file passes make the
# same scan effectively instant, which is what lets a2bp stay interactive and
# lets the gate afford to run this at all.
#
# ARGUMENTS: CONTENT_FILE PROJECT_NAME [LOGICAL_PATH] [BASELINE_FILE]
#
#   CONTENT_FILE   the bytes to scan — in a2bp this is the STAGED temp copy.
#   LOGICAL_PATH   the managed path those bytes will land at. Kept separate
#                  because the staged copy is an extensionless mktemp name,
#                  and the prose/script split below keys off the extension.
#                  Passing the temp path made the Markdown exception dead in
#                  production while the unit tests — which called this helper
#                  directly with a real .md path — stayed green (Codex F2).
#                  Defaults to CONTENT_FILE.
#   BASELINE_FILE  the blueprint's current copy, if any. See below.
contamination_scan() {
  local f="$1" proj_name="$2"
  local logical="${3:-$1}" baseline="${4:-}"
  local blocked=0
  local name_rx suppressed
  # `acme-flow` also appears as AcmeFlow / acme_flow / ACMEflow. Match any
  # separator (or none) between segments, case-insensitively. The name is
  # escaped first: a directory may legally contain regex metacharacters, and
  # an unescaped `.` would match any character.
  name_rx=$(printf '%s' "$proj_name" \
            | sed -e 's/[][\.^$*+?(){}|\\/]/\\&/g' -e 's/[-_]/[-_]?/g')

  # Line numbers carrying a justified a2bp-allow marker, as "|N|N|" for a
  # cheap substring test below. The delimiters matter: without them line 1
  # would suppress line 11.
  suppressed="|$(grep -nE 'a2bp-allow:[[:space:]]*[^[:space:]]' "$f" 2>/dev/null \
                 | cut -d: -f1 | tr '\n' '|')"
  _skip() { case "$suppressed" in *"|$1|"*) return 0 ;; esac; return 1; }

  # --- Baseline exemption ---
  # A line already present verbatim in the blueprint's own copy is not
  # something this back-propagation is INTRODUCING. The guard polices what you
  # are adding; content already upstream is out of its remit (and if it is
  # genuinely contaminated, blocking a2bp would not fix it — that is a
  # separate cleanup).
  #
  # This is also what makes a one-word project name survivable. For a project
  # named `blueprint`, generic prose containing the word "blueprint" is
  # unchanged from upstream, so it is exempt rather than flagged as a residual
  # project name. Without this the F1 corruption would simply have come back
  # as a false BLOCK on the same lines.
  declare -A _base
  if [ -n "$baseline" ] && [ -f "$baseline" ]; then
    local bl
    while IFS= read -r bl || [ -n "$bl" ]; do
      [ -n "$bl" ] && _base[$bl]=1
    done < "$baseline"
  fi
  # Empty subscripts are rejected by bash associative arrays, and a blank line
  # is never a finding, so treat it as not-known rather than indexing with it.
  _known() { [ -n "$1" ] && [ -n "${_base[$1]+x}" ]; }

  # Markdown documents the CONVENTION; shell scripts execute a PATH. That
  # distinction decides whether `~/.{{PROJECT_NAME}}` is correct or is the
  # A-09 defect — see the dot-dir pass below.
  local is_prose=0
  case "$logical" in *.md) is_prose=1 ;; esac

  local ln text hit name
  # Full lines by number, so the baseline exemption can be applied uniformly —
  # the `grep -o` passes below only yield the matched token, not its line.
  local -a _lines
  mapfile -t _lines < "$f" 2>/dev/null || _lines=()
  _exempt() {
    _skip "$1" && return 0
    _known "${_lines[$(( $1 - 1 ))]-}" && return 0
    return 1
  }

  # --- BLOCK: absolute host home path ---
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _exempt "$ln" && continue
    printf '%s|BLOCK|host home path (belongs in a gitignored local config)|%s\n' "$ln" "$text"
    blocked=1
  done < <(grep -nE '/(Users|home)/[A-Za-z0-9_.-]+/' "$f" 2>/dev/null || true)

  # --- BLOCK: literal per-project state dir ---
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _exempt "$ln" && continue
    name=${text#*/.}
    name=${name%%/*}
    _contamination_is_known_dotdir "$name" && continue
    # `~/.{{PROJECT_NAME}}` is the placeholder, i.e. already genericised. In
    # prose that is the correct way to document a per-project dir, and
    # AGENTS.md/OBSERVABILITY.md legitimately do so — agent_state_dir derives
    # `~/.<repo-basename>`, which in a derived project IS the project name.
    # In a SCRIPT the same string is a literal unsubstituted path, and that is
    # A-09 exactly: every checkout collided on one shared directory.
    if [ "$is_prose" -eq 1 ]; then
      case "$name" in \{\{PROJECT_NAME*) continue ;; esac
    fi
    printf '%s|BLOCK|literal per-project state dir (derive it via scripts/lib/state-dir.sh)|%s\n' \
      "$ln" "$text"
    blocked=1
  done < <(grep -noE '(\$HOME|~)/\.[A-Za-z0-9_{][A-Za-z0-9_.{}-]*' "$f" 2>/dev/null || true)

  # --- BLOCK: project name that survived reverse-substitution ---
  # With provenance-based reversal this is the load-bearing check, not a
  # backstop: any line the operator EDITED keeps its literal project name, and
  # this is what stops it reaching the blueprint. The operator resolves it by
  # writing {{PROJECT_NAME}} explicitly.
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _exempt "$ln" && continue
    printf '%s|BLOCK|project name survived reverse-substitution — write {{PROJECT_NAME}} explicitly if it belongs|%s\n' "$ln" "$text"
    blocked=1
  done < <(grep -nEi "(^|[^A-Za-z0-9])${name_rx}([^A-Za-z0-9]|$)" "$f" 2>/dev/null || true)

  # --- NOTICE: real-looking email address ---
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _exempt "$ln" && continue
    _contamination_is_placeholder_email "$text" && continue
    printf '%s|NOTICE|operator/personal email %s — generic files should not name an individual|%s\n' \
      "$ln" "$text" "$text"
  done < <(grep -noE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$f" 2>/dev/null || true)

  return $blocked
}
