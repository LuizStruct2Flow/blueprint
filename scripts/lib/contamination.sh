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

# --- contamination_reverse_substitute FILE PROJECT_NAME -------------------
# Prints FILE's content with the project's name restored to the template
# placeholders. Exact mirror of scripts/blueprint's substitute_placeholders,
# including its UPPER-then-lower ordering: the upper form must go first or
# `s/acme-flow/…/` would have already consumed part of `ACME_FLOW` on a
# case-insensitive filesystem convention.
#
# The caller is responsible for the _should_substitute exemption (files that
# IMPLEMENT the substitution carry the tokens as code — reverse-substituting
# scripts/blueprint would corrupt scripts/blueprint).
contamination_reverse_substitute() {
  local f="$1" proj_name="$2" proj_upper
  proj_upper=$(printf '%s' "$proj_name" | tr 'a-z-' 'A-Z_')
  sed \
    -e "s/${proj_upper}/{{PROJECT_NAME_UPPER}}/g" \
    -e "s/${proj_name}/{{PROJECT_NAME}}/g" \
    "$f"
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
contamination_scan() {
  local f="$1" proj_name="$2"
  local blocked=0
  local name_rx suppressed
  # `acme-flow` also appears as AcmeFlow / acme_flow / ACMEflow. Match any
  # separator (or none) between segments, case-insensitively.
  name_rx=$(printf '%s' "$proj_name" | sed 's/[-_]/[-_]?/g')

  # Line numbers carrying a justified a2bp-allow marker, as "|N|N|" for a
  # cheap substring test below.
  suppressed="|$(grep -nE 'a2bp-allow:[[:space:]]*[^[:space:]]' "$f" 2>/dev/null \
                 | cut -d: -f1 | tr '\n' '|')"
  _skip() { case "$suppressed" in *"|$1|"*) return 0 ;; esac; return 1; }

  # Markdown documents the CONVENTION; shell scripts execute a PATH. That
  # distinction decides whether `~/.{{PROJECT_NAME}}` is correct or is the
  # A-09 defect — see the dot-dir pass below.
  local is_prose=0
  case "$f" in *.md) is_prose=1 ;; esac

  local ln text hit name

  # --- BLOCK: absolute host home path ---
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _skip "$ln" && continue
    printf '%s|BLOCK|host home path (belongs in a gitignored local config)|%s\n' "$ln" "$text"
    blocked=1
  done < <(grep -nE '/(Users|home)/[A-Za-z0-9_.-]+/' "$f" 2>/dev/null || true)

  # --- BLOCK: literal per-project state dir ---
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _skip "$ln" && continue
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
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _skip "$ln" && continue
    printf '%s|BLOCK|project name survived reverse-substitution|%s\n' "$ln" "$text"
    blocked=1
  done < <(grep -nEi "(^|[^A-Za-z0-9])${name_rx}([^A-Za-z0-9]|$)" "$f" 2>/dev/null || true)

  # --- NOTICE: real-looking email address ---
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    ln=${hit%%:*}; text=${hit#*:}
    _skip "$ln" && continue
    _contamination_is_placeholder_email "$text" && continue
    printf '%s|NOTICE|operator/personal email %s — generic files should not name an individual|%s\n' \
      "$ln" "$text" "$text"
  done < <(grep -noE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$f" 2>/dev/null || true)

  return $blocked
}
