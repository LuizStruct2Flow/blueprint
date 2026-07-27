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
#   contamination_stage  — ALIGNMENT-BASED. Restores placeholders only where a
#       positional diff against the blueprint's own copy proves the line came
#       from one. It is NOT an inverse of substitute_placeholders — no such
#       inverse exists, and two review rounds were spent learning that (see
#       the function's own header). Anything it cannot attribute is left
#       untouched for the scan to judge.
#   contamination_scan   — HEURISTIC. Catches what no mechanical transform can
#       know about (host paths, foreign state dirs, operator emails). Because
#       it is heuristic it must be overridable, and every override must be
#       visible — see "BLOCKING vs NOTICE" below.
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

# --- contamination_stage PROJ BP NAME STAGED_OUT ALIGN_OUT ----------------
# Writes to STAGED_OUT the bytes that should land in the blueprint, and to
# ALIGN_OUT the staged line numbers whose provenance is PROVEN (one per line).
#
# WHY ALIGNMENT AND NOT A LOOKUP — two review rounds are compressed here, so
# the next person does not re-derive them:
#
#   R1: a global `s/${proj_name}/{{PROJECT_NAME}}/g` was called "the exact
#       inverse of substitute_placeholders". There is no such inverse. Forward
#       replaces an unambiguous token that never occurs in prose; backward
#       would replace a bare word that does. For a project directory
#       legitimately named `blueprint`, "The blueprint documentation explains
#       blueprint sync." silently became "The {{PROJECT_NAME}} documentation
#       explains {{PROJECT_NAME}} sync.", and the guard copied the corrupted
#       file through with no finding at all.
#
#   R2: the fix keyed a map on line CONTENT — substituted_form → blueprint
#       line. That still discards occurrence identity. If the blueprint holds
#       both `{{PROJECT_NAME}}` and a literal `acme-flow` line, the first one
#       owns the key and EVERY matching project line gets rewritten, including
#       a legitimate literal that never came from a placeholder. Same
#       information loss as R1, at line granularity instead of substring.
#
# So provenance is established POSITIONALLY. We forward-substitute the
# blueprint's copy — reproducing exactly what `pull` handed the project — and
# diff it against the project file. Only a line the diff reports as UNCHANGED
# is attributed to its aligned upstream line, and only then is that upstream
# line's original text (placeholder intact) emitted. Everything the operator
# actually touched passes through byte-for-byte and is left for the scan to
# judge. An occurrence that cannot be attributed uniquely is never guessed at.
#
# The same alignment drives the scan's exemption, which is why it is returned
# rather than kept private: "already upstream" has to mean "this occurrence
# was already upstream at this position", not "these bytes appear upstream
# somewhere". A relocated or duplicated risky line is a NEW occurrence and
# must face every check (R2-F2).
#
# No blueprint copy (a brand-new managed file) → nothing to align against →
# verbatim passthrough with an empty alignment, so the scan judges every line.
# Fail closed.
#
# Nothing here compiles the project name as a regex: the forward substitution
# is bash parameter expansion and the comparison is done by `diff`.
#
# The caller owns the _should_substitute exemption (files that IMPLEMENT the
# substitution carry the tokens as code — restoring placeholders in
# scripts/blueprint would corrupt scripts/blueprint).
contamination_stage() {
  local pf="$1" bpf="$2" proj_name="$3" staged_out="$4" align_out="$5"
  local proj_upper
  proj_upper=$(printf '%s' "$proj_name" | tr 'a-z-' 'A-Z_')

  : > "$align_out"

  if [ ! -f "$bpf" ]; then
    cat "$pf" > "$staged_out"
    return 0
  fi

  # Does the project file end with a newline? The staged copy must match it
  # byte-for-byte; a line-oriented rewrite would otherwise append one the
  # operator never wrote.
  local final_nl=1
  if [ -s "$pf" ] && [ "$(tail -c1 "$pf" | wc -l)" -eq 0 ]; then
    final_nl=0
  fi

  local -a bp_lines proj_lines
  mapfile -t bp_lines < "$bpf"
  mapfile -t proj_lines < "$pf"

  # What `pull` would have produced from the blueprint's copy.
  local bp_sub bl sub
  bp_sub=$(mktemp)
  for bl in ${bp_lines[@]+"${bp_lines[@]}"}; do
    sub=${bl//\{\{PROJECT_NAME_UPPER\}\}/$proj_upper}
    sub=${sub//\{\{PROJECT_NAME\}\}/$proj_name}
    printf '%s\n' "$sub"
  done > "$bp_sub"

  # Positional alignment. The three --*-line-format options emit one record
  # per line in file order: '=' common, '-' only upstream, '+' only in the
  # project. Walking that stream with two counters yields, for every project
  # line, the upstream line it corresponds to (or none).
  declare -A _align
  local rec tag bp_i=0 pj_i=0
  while IFS= read -r rec; do
    tag=${rec:0:1}
    case "$tag" in
      '=') bp_i=$((bp_i+1)); pj_i=$((pj_i+1)); _align[$pj_i]=$bp_i ;;
      '-') bp_i=$((bp_i+1)) ;;
      '+') pj_i=$((pj_i+1)) ;;
    esac
  done < <(diff --unchanged-line-format='=%L' \
                --old-line-format='-%L' \
                --new-line-format='+%L' \
                "$bp_sub" "$pf" 2>/dev/null || true)
  rm -f "$bp_sub"

  # Emit the staged copy plus the proven-provenance line list.
  local i n out
  n=${#proj_lines[@]}
  : > "$staged_out"
  for (( i=1; i<=n; i++ )); do
    if [ -n "${_align[$i]+x}" ]; then
      out=${bp_lines[$(( ${_align[$i]} - 1 ))]}
      printf '%s\n' "$i" >> "$align_out"
    else
      out=${proj_lines[$(( i - 1 ))]}
    fi
    if [ "$i" -eq "$n" ] && [ "$final_nl" -eq 0 ]; then
      printf '%s' "$out" >> "$staged_out"
    else
      printf '%s\n' "$out" >> "$staged_out"
    fi
  done
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
#   ALIGN_FILE     contamination_stage's proven-provenance line list. See below.
contamination_scan() {
  local f="$1" proj_name="$2"
  local logical="${3:-$1}" align_file="${4:-}"
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

  # --- Unchanged-line exemption (OCCURRENCE-aware) ---
  # A line that the positional diff attributed to an upstream line is not
  # something this back-propagation is INTRODUCING — it is already in the
  # blueprint, at that position. The guard polices what you add; existing
  # upstream content is out of its remit (and if it is genuinely contaminated,
  # blocking a2bp would not fix it — that is a separate cleanup).
  #
  # This is also what makes a one-word project name survivable: for a project
  # named `blueprint`, untouched prose containing the word is attributed
  # upstream rather than flagged as a residual project name. Without it, R1's
  # corruption would simply have returned as a false BLOCK on the same lines.
  #
  # It is keyed on LINE NUMBER, not content, and that distinction is the whole
  # of R2-F2. A content set would exempt every occurrence of a risky line just
  # because those bytes appear upstream once — so a project could duplicate or
  # relocate such a line and the new occurrence would bypass every check, even
  # though relocation can turn quoted prose into an operative path.
  declare -A _aligned
  if [ -n "$align_file" ] && [ -f "$align_file" ]; then
    local al
    while IFS= read -r al; do
      [ -n "$al" ] && _aligned[$al]=1
    done < "$align_file"
  fi
  _known() { [ -n "${_aligned[$1]+x}" ]; }

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
    _known "$1" && return 0
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
