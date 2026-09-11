#!/bin/bash
# TASK-018 / R6 — NEGATIVE PROOF for the six a2bp suites.
#
# Adapted from .scratch/elias-equiv.sh (Christian's pass, commit 5a58a59). The
# method and every guard are his; what changes is the mutant population and the
# verdict extraction, which here has to name a SUITE as well as a case id —
# `#1` exists in five of these six suites, so an un-prefixed id is ambiguous.
#
# Usage:
#   bash .scratch/a2bp-equiv.sh <mutant> [<mutant> ...]
#   bash .scratch/a2bp-equiv.sh --all
#   bash .scratch/a2bp-equiv.sh --list
#   bash .scratch/a2bp-equiv.sh --out FILE --all
#
# THE THREE TRAPS THIS INHERITS ITS DEFENCES FROM:
#   1. a mutant that does not apply produces AGREE-pass, which reads exactly
#      like "neither implementation covers this". `sub` is a LITERAL
#      substitution that exits non-zero when its target is absent, and
#      `run_one` refuses to report a verdict for a mutant that did not apply.
#   2. a mutant that changed nothing is the same failure one level up. The
#      question is asked of THE TREE'S OWN GIT (`status --porcelain` plus its
#      commit count), never of a hand-written list of files a mutant is
#      "allowed" to touch — such a list encodes the answer it is checking.
#   3. the totals are computed by the run, not transcribed. A run containing a
#      non-verdict FAILS and says the matrix is invalid.
set -u

# The repo root, from THIS file's tracked location (docs/doing/<folder>/code).
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
OUT="${AAB_OUT:-$SRC/.scratch/aab-equiv}"
mkdir -p "$OUT"

NL=$'\n'

# sub FILE OLD NEW [all] — literal replacement, refused if OLD is not there.
sub() {
  python3 - "$@" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
every = len(sys.argv) > 4
text = open(path).read()
if old not in text:
    sys.exit("MUTANT-DID-NOT-APPLY: %r absent from %s" % (old[:70], path))
open(path, 'w').write(text.replace(old, new) if every else text.replace(old, new, 1))
PY
}

REQ="scripts/lib/request.sh"
BLD="scripts/lib/request-build.sh"
INP="scripts/lib/request-inputs.sh"
CFG="scripts/lib/request-config.sh"
FIL="scripts/lib/request-file.sh"
CON="scripts/lib/contamination.sh"
PLA="scripts/lib/placeholders.sh"
CLI="scripts/blueprint"
SPEC_CON="tests/a2bp-contamination/a2bp-contamination.spec.ts"

SUITES="a2bp-build a2bp-contamination a2bp-e2e a2bp-inputs a2bp-pr-filing a2bp-request"

# ===========================================================================
# MUTANTS — `apply_<name> TREE`. `CONTROL_<name>=1` marks a tree that is
# deliberately NOT a defect, so the harness does not demand it change a file.
# ===========================================================================

# --- a2bp-request / scripts/lib/request.sh ---------------------------------
apply_K1() { # the key stops being a pure function of its inputs
  sub "$1/$REQ" "    bp_request_frame \"v3\"$NL" "    bp_request_frame \"v3\"${NL}    bp_request_frame \"\$RANDOM\$RANDOM\"$NL"
}

apply_K2() { # the branch component stops binding into the key
  sub "$1/$REQ" "    bp_request_frame \"\$branch\"$NL" ""
}

apply_K3() { # file CONTENT loses its length frame — adjacent content can collide
  sub "$1/$REQ" "  printf '%s ' \"\$len\"$NL  cat \"\$f\"" "  cat \"\$f\""
}

apply_K4() { # header components become newline-DELIMITED instead of framed
  sub "$1/$REQ" "  printf '%s %s' \"\$len\" \"\$bytes\"" "  printf '%s\\n' \"\$bytes\""
}

apply_K5() { # the digest is dropped from the ref
  sub "$1/$REQ" 'candidate="a2bp/${project}/${digest}"' 'candidate="a2bp/${project}"'
}

apply_K6() { # check-ref-format is never consulted — any name composes into a ref
  sub "$1/$REQ" '  if ! git check-ref-format --branch "$candidate" >/dev/null 2>&1; then' \
                '  if false; then'
}

apply_K7() { # the '/' rule is gone; check-ref-format alone would allow a/b
  sub "$1/$REQ" "    */*)  echo \"bp_request_ref: project name '\$project' contains '/'" \
                "    @@NEVER@@)  echo \"bp_request_ref: project name '\$project' contains '/'"
}

apply_K8() { # a stricter-than-git invented rule: a component-final dot refused
  sub "$1/$REQ" "  candidate=\"a2bp/\${project}/\${digest}\"" \
                "  case \"\$project\" in *.) echo \"bp_request_ref: trailing dot\" >&2; return 1 ;; esac${NL}  candidate=\"a2bp/\${project}/\${digest}\""
}

apply_K9() { # the git floor is raised past every plausible host
  sub "$1/$REQ" '[ "$minor" -ge 32 ]' '[ "$minor" -ge 999 ]'
}

apply_K10() { # the scrub stops removing config injection
  sub "$1/$REQ" "      -u GIT_CONFIG -u GIT_CONFIG_COUNT \\
      -u GIT_AUTHOR_DATE" "      -u GIT_AUTHOR_DATE"
}

apply_K11() { # transport scrubs the credential variables it must keep
  sub "$1/$REQ" "bp_request_transport_env() {${NL}  env -u GIT_DIR" \
                "bp_request_transport_env() {${NL}  env -u GIT_SSH_COMMAND -u GIT_DIR"
}

# --- a2bp-inputs / request-config.sh + request-inputs.sh -------------------
apply_I1() { # an absent config_version is treated as the current one
  sub "$1/$CFG" '  if [ -z "$version" ]; then' '  if false; then'
  sub "$1/$CFG" "  version=\$(bp_config_field \"\$file\" config_version)" \
                "  version=\$(bp_config_field \"\$file\" config_version)${NL}  [ -n \"\$version\" ] || version=2"
}

apply_I2() { # the remote is emitted from the wrong field
  sub "$1/$CFG" '  remote=$(bp_config_field "$file" blueprint_remote)' \
                '  remote=$(bp_config_field "$file" blueprint_source)'
}

apply_I3() { # an absent branch defaults to something other than main
  sub "$1/$CFG" '[ -n "$branch" ] || branch="main"' '[ -n "$branch" ] || branch="master"'
}

apply_I4() { # a FUTURE config_version is accepted
  sub "$1/$CFG" '  if [ "$version" -gt "$BP_CONFIG_VERSION_SUPPORTED" ]; then' '  if false; then'
}

apply_I5() { # a non-numeric config_version is no longer rejected
  sub "$1/$CFG" "    ''|*[!0-9]*)" "    @@NEVER@@)"
}

apply_I6() { # the bootstrap placeholder is accepted as a push destination
  sub "$1/$CFG" '    FILL-ME-IN|FILL_ME_IN|' '    @@NEVER@@|'
}

apply_I7() { # the spec list is neither sorted nor de-duplicated
  sub "$1/$INP" "  printf '%s' \"\$accepted\" | LC_ALL=C sort -u" \
                "  printf '%s' \"\$accepted\""
}

apply_I8() { # the executable bit is lost
  sub "$1/$INP" '  if [ -x "$1" ]; then printf '"'"'100755'"'"'; else printf '"'"'100644'"'"'; fi' \
                "  printf '100644'"
}

apply_I9() { # `..` is CLAMPED at the root instead of refused
  sub "$1/$INP" "        if [ -z \"\$out\" ]; then${NL}          # Refused rather than clamped." \
                "        if false; then${NL}          # Refused rather than clamped."
}

apply_I10() { # a symlink at the target is followed instead of refused
  sub "$1/$INP" '    if [ -L "$root/$canon" ]; then' '    if false; then'
}

apply_I11() { # MANAGED_FILES membership stops being checked
  sub "$1/$INP" '    if ! grep -qxF -- "$canon" "$managed" && ! _bp_inputs_under_managed_dir "$canon" "$managed"; then' \
                '    if false; then'
}

apply_I12() { # a directory is refused by the WRONG rule — the message is generic
  sub "$1/$INP" "    if [ -d \"\$root/\$canon\" ]; then${NL}      echo \"bp_inputs: '\$canon' is a directory\" >&2${NL}      rc=1; continue${NL}    fi$NL" ""
}

apply_I13() { # an absent path is refused by the wrong rule
  sub "$1/$INP" "    if [ ! -e \"\$root/\$canon\" ]; then${NL}      echo \"bp_inputs: '\$canon' does not exist in this project\" >&2${NL}      rc=1; continue${NL}    fi$NL" ""
}

apply_I14() { # one bad path no longer fails the whole call — a PARTIAL request
  sub "$1/$INP" '  [ "$rc" -eq 0 ] || return 1' '  :'
}

apply_I15() { # "nothing to request" loses its own distinct status
  sub "$1/$INP" "    echo \"Nothing to request: every file given is already identical to the blueprint.\" >&2${NL}    return 2" \
                "    echo \"Nothing to request: every file given is already identical to the blueprint.\" >&2${NL}    return 1"
}

apply_I16() { # nothing is ever dropped as a no-op
  sub "$1/$INP" '    if [ -n "$base_entry" ]; then' '    if false; then'
}

apply_I17() { # a MODE-ONLY change is dropped as "identical to the blueprint"
  sub "$1/$INP" '      if [ "$base_mode" = "$mode" ] && \' '      if true && \'
}

apply_I18() { # "identical to the blueprint" is asked at the ROOT coordinate
  sub "$1/$INP" '    tpath=$(bp_base_path "$bare" "$base" "$path")' '    tpath="$path"'
}

# --- a2bp-pr-filing --------------------------------------------------------
apply_F1() { # BUG-011 verbatim — a bare .[0] renders an empty list as "null"
  sub "$1/$FIL" "--jq '.[0] // empty | \"\\(.state)\\t\\(.url)\"'" \
                "--jq '.[0] | \"\\(.state)\\t\\(.url)\"'"
}

apply_F2() { # the state is no longer reported alongside the url
  sub "$1/$FIL" '--json state,url' '--json url'
}

apply_F3() { # a CLOSED PR is invisible, so a decided request is re-filed
  sub "$1/$FIL" '--state all' '--state open'
}

apply_F4() { # the pr-create failure branch claims the request was filed
  sub "$1/$CLI" "    # 3 as \"the request is in\" has been told something false. A pushed branch
    # with no PR is an operational failure, which is exactly what 5 means.
    return \"\$BP_RC_FAILED\"" "    return \"\$BP_RC_PENDING\""
}

apply_F5() { # the missing-gh path claims the request was filed
  sub "$1/$CLI" "    # opened; returning 3 contradicted it in the one field a script can read.
    return \"\$BP_RC_FAILED\"" "    return \"\$BP_RC_PENDING\""
}

apply_F6() { # a zero-exit gh with no usable URL is read as filed
  sub "$1/$CLI" "      echo \"  \${C_DIM}The branch is pushed. Open a PR from \$ref against \$BP_CFG_BRANCH.\${C_RESET}\"
      return \"\$BP_RC_FAILED\" ;;" \
                "      echo \"  \${C_DIM}The branch is pushed. Open a PR from \$ref against \$BP_CFG_BRANCH.\${C_RESET}\"
      return \"\$BP_RC_PENDING\" ;;"
}

apply_F7() { # the caller's literal-"null" guard is gone
  sub "$1/$CLI" '     && [ "$existing" != "null	null" ] && [ "${existing%%	*}" != "null" ]; then' \
                '     ; then'
}

# --- a2bp-build ------------------------------------------------------------
apply_B1() { # the commit is a root commit, not a child of the fetched base
  sub "$1/$BLD" '      commit-tree "$tree" -p "$base") || return 1' \
                '      commit-tree "$tree") || return 1'
}

apply_B2() { # THE DEFECT — the index is not seeded from the base
  sub "$1/$BLD" '  if ! GIT_INDEX_FILE="$idx" bp_request_hermetic git -C "$bare" read-tree "$base"; then' \
                '  if false; then'
}

apply_B3() { # the date comes from the WALL CLOCK again (the request.sh trap)
  sub "$1/$BLD" '      GIT_AUTHOR_DATE="$basedate" GIT_COMMITTER_DATE="$basedate" \' '      \'
}

apply_B4() { # the commit stops being built in a scrubbed environment
  sub "$1/$BLD" "  commit=\$(printf '%s' \"\$msg\" | \\
    bp_request_hermetic env \\" "  commit=\$(printf '%s' \"\$msg\" | \\
    env \\"
}

apply_B5() { # only the first spec in a multi-file request is written
  sub "$1/$BLD" "    GIT_INDEX_FILE=\"\$idx\" bp_request_hermetic git -C \"\$bare\" \\
      update-index --add --cacheinfo \"\$mode,\$blob,\$tpath\" || return 1${NL}  done" \
                "    GIT_INDEX_FILE=\"\$idx\" bp_request_hermetic git -C \"\$bare\" \\
      update-index --add --cacheinfo \"\$mode,\$blob,\$tpath\" || return 1${NL}    break${NL}  done"
}

apply_B6() { # a DIRECTORY at the target path is accepted
  sub "$1/$BLD" "        tree/*)$NL" "        @@NEVER@@)$NL"
}

apply_B7() { # an ordinary existing blob is refused
  sub "$1/$BLD" '        blob/100644|blob/100755) : ;;' '        blob/100644|blob/100755) echo "  refused" >&2; rc=1 ;;'
}

apply_B8() { # the non-directory-parent walk is gone
  sub "$1/$BLD" "      parent=\$(dirname \"\$tpath\")${NL}      while" "      parent=\".\"${NL}      while"
}

apply_B9() { # the post-build assertion is disarmed
  sub "$1/$BLD" "bp_build_assert() {$NL" "bp_build_assert() {${NL}  return 0$NL"
}

apply_B10() { # a creation is never placed under scaffolding/ — the last arm is gone
  sub "$1/$REQ" '  elif bp_request_hermetic git -C "$bare" cat-file -e "$base:scaffolding" 2>/dev/null; then' \
                '  elif false; then'
}

apply_B11() { # a project-relative path never resolves to the scaffolding copy
  sub "$1/$REQ" '  if bp_request_hermetic git -C "$bare" cat-file -e "$base:scaffolding/$path" 2>/dev/null; then' \
                '  if false; then'
}

apply_B12() { # the coordinate is decided per TREE, not per PATH
  sub "$1/$REQ" '  elif bp_request_hermetic git -C "$bare" cat-file -e "$base:$path" 2>/dev/null; then' \
                '  elif false; then'
}

apply_B13() { # every path is prefixed with scaffolding/, flat base or not
  sub "$1/$REQ" "bp_base_path() {${NL}  local bare=\"\$1\" base=\"\$2\" path=\"\$3\"" \
                "bp_base_path() {${NL}  local bare=\"\$1\" base=\"\$2\" path=\"\$3\"${NL}  printf 'scaffolding/%s' \"\$path\"; return 0"
}

apply_B14() { # the built commit is written at the ROOT coordinate
  sub "$1/$BLD" "    tpath=\$(bp_base_path \"\$bare\" \"\$base\" \"\$path\")

    # --no-filters is the point" "    tpath=\"\$path\"

    # --no-filters is the point"
}

apply_B15() { # the contamination guard aligns against the ROOT coordinate
  sub "$1/$FIL" "  local bare=\"\$1\" base=\"\$2\" path=\"\$3\" out=\"\$4\" tpath${NL}  tpath=\$(bp_base_path \"\$bare\" \"\$base\" \"\$path\")" \
                "  local bare=\"\$1\" base=\"\$2\" path=\"\$3\" out=\"\$4\" tpath${NL}  tpath=\"\$path\""
}

# --- a2bp-contamination ----------------------------------------------------
apply_C0() { # THE SUITE'S OWN HEADLINE INVARIANT is disarmed (BUG-048's shape).
  # A test-side mutant on purpose: #0 exists to prove the helper's main-moved
  # assertion can still fire, so the only thing that can falsify it is removing
  # that assertion.
  sub "$1/$SPEC_CON" "    expect(
      mainAfter,
      'a2bp MOVED THE BLUEPRINT\\'S MAIN BRANCH — a request must never land',
    ).toBe(mainBefore)" "    void mainAfter"
}

apply_C1() { # no reverse-substitution at all — the project's bytes go up verbatim
  sub "$1/$CON" "contamination_stage() {${NL}  local pf=\"\$1\" bpf=\"\$2\" proj_name=\"\$3\" staged_out=\"\$4\"$NL" \
                "contamination_stage() {${NL}  local pf=\"\$1\" bpf=\"\$2\" proj_name=\"\$3\" staged_out=\"\$4\"${NL}  cat \"\$pf\" > \"\$staged_out\"; return 0$NL"
}

apply_C2() { # the host-home-path class stops blocking
  sub "$1/$CON" "    printf '%s|BLOCK|host home path (belongs in a gitignored local config)|%s\\n' \"\$ln\" \"\$text\"${NL}    blocked=1" \
                "    :"
}

apply_C3() { # the per-project state-dir class stops blocking
  sub "$1/$CON" "    printf '%s|BLOCK|literal per-project state dir (derive it via scripts/lib/state-dir.sh)|%s\\n' \\
      \"\$ln\" \"\$text\"${NL}    blocked=1" "    :"
}

apply_C4() { # EVERYTHING blocks — the guard over-blocks clean generic content
  sub "$1/$CON" "  local blocked=0$NL" "  local blocked=1$NL"
}

apply_C5() { # --force comes back and waives the guard
  sub "$1/$CLI" "      --force)
        die \"--force is gone." "      --force)
        : \"ignored\" \"--force is gone."
}

apply_C6() { # files that IMPLEMENT the substitution are no longer exempt
  sub "$1/$PLA" "    *scripts/lib/placeholders.sh|*scripts/lib/contamination.sh) return 1 ;;$NL" ""
}

apply_C7() { # the residual-project-name class stops blocking
  sub "$1/$CON" "    printf '%s|BLOCK|project name survived reverse-substitution — write {{PROJECT_NAME}} explicitly if it belongs|%s\\n' \"\$ln\" \"\$text\"${NL}    blocked=1" \
                "    :"
}

apply_C8() { # the project name is compiled as a REGEX, not escaped as data
  sub "$1/$CON" "  name_rx=\$(printf '%s' \"\$proj_name\" \\
            | sed -e 's/[][\\.^\$*+?(){}|\\\\/]/\\\\&/g' -e 's/[-_]/[-_]?/g')" \
                "  name_rx=\$(printf '%s' \"\$proj_name\" | sed -e 's/[-_]/[-_]?/g')"
}

apply_C9() { # the scan keys the prose/script split off the TEMP path (Codex F2)
  sub "$1/$CON" '  local logical="${3:-$1}"' '  local logical="$1"'
}

apply_C10() { # the prose exception is granted to EVERY file, scripts included
  sub "$1/$CON" '  case "$logical" in *.md) is_prose=1 ;; esac' '  is_prose=1'
}

apply_C11() { # one contaminated file no longer refuses the WHOLE request
  sub "$1/$CLI" "  if [ \"\$blocked\" -gt 0 ]; then${NL}    echo${NL}    echo \"\${C_RED}✗ \$blocked file(s) blocked — nothing filed.\${C_RESET}\"${NL}    return \"\$BP_RC_BLOCKED\"${NL}  fi" \
                "  if false; then${NL}    return \"\$BP_RC_BLOCKED\"${NL}  fi"
}

apply_C12() { # suppression is by PREFIX, so line 1 suppresses line 11
  sub "$1/$CON" '  _skip() { case "$suppressed" in *"|$1|"*) return 0 ;; esac; return 1; }' \
                '  _skip() { case "$suppressed" in *"|$1"*) return 0 ;; esac; return 1; }'
}

apply_C13() { # a BARE a2bp-allow marker suppresses — the justification is optional
  sub "$1/$CON" "grep -nE 'a2bp-allow:[[:space:]]*[^[:space:]]' \"\$f\"" \
                "grep -nE 'a2bp-allow:' \"\$f\""
}

apply_C14() { # a missing final newline is invented by the staging rewrite
  sub "$1/$CON" '    if [ "$i" -eq "$n" ] && [ "$final_nl" -eq 0 ]; then' '    if false; then'
}

apply_C15() { # diff capability/runtime failure is swallowed instead of failing closed
  sub "$1/$CON" "  if [ \"\$diff_rc\" -gt 1 ]; then${NL}    rm -f \"\$diff_out\"${NL}    return 2${NL}  fi" \
                "  if [ \"\$diff_rc\" -gt 99 ]; then${NL}    rm -f \"\$diff_out\"${NL}    return 2${NL}  fi"
}

apply_C16() { # the round-trip verification is gone — staging may change meaning
  sub "$1/$CON" "  if ! cmp -s \"\$verify_staged\" \"\$verify_proj\"; then${NL}    rm -f \"\$verify_staged\" \"\$verify_proj\"${NL}    return 3${NL}  fi" \
                "  if false; then${NL}    return 3${NL}  fi"
}

apply_C17() { # R1 verbatim — a global search-and-replace instead of alignment
  sub "$1/$CON" "  local -a bp_lines proj_lines$NL" \
                "  sed \"s/\$proj_name/{{PROJECT_NAME}}/g\" \"\$pf\" > \"\$staged_out\"; return 0${NL}  local -a bp_lines proj_lines$NL"
}

apply_C18() { # the UPPER token is substituted in a second pass that re-scans
  sub "$1/$PLA" "    if [ \"\$has_u\" -eq 1 ] && { [ \"\$has_l\" -eq 0 ] || [ \${#pre_u} -lt \${#pre_l} ]; }; then" \
                "    if [ \"\$has_u\" -eq 1 ]; then"
}

apply_C19() { # an unrepresentable (newline-bearing) project name is silently mangled
  sub "$1/$PLA" "    *\$'\\n'*)" "    @@NEVER@@)"
}

apply_C20() { # NUL-bearing content is silently truncated rather than refused
  sub "$1/$PLA" '  if [ -s "$src" ] && bp_contains_nul "$src"; then' '  if false; then'
}

apply_C21() { # a refused in-place substitution leaves a half-written file
  sub "$1/$PLA" "  bp_substitute_stream \"\$f\" \"\$nm\" > \"\$tmp\" || rc=\$?${NL}  if [ \"\$rc\" -ne 0 ]; then${NL}    rm -f \"\$tmp\"${NL}    return \"\$rc\"${NL}  fi" \
                "  bp_substitute_stream \"\$f\" \"\$nm\" > \"\$tmp\" || rc=\$?${NL}  if [ \"\$rc\" -ne 0 ]; then${NL}    mv \"\$tmp\" \"\$f\"${NL}    return \"\$rc\"${NL}  fi"
}

apply_C22() { # the streaming rewrite stops after the first 100 lines
  sub "$1/$PLA" "  local l first=1${NL}  while IFS= read -r l || [ -n \"\$l\" ]; do" \
                "  local l first=1 _n=0${NL}  while IFS= read -r l || [ -n \"\$l\" ]; do${NL}    _n=\$((_n+1)); [ \"\$_n\" -gt 100 ] && break"
}

apply_C23() { # RETIRED — IT HIT A COMMENT, WHICH IS TRAP 1 ONE LEVEL DOWN.
  # `sub` proves the literal was FOUND; it does not prove the hit was in code.
  # placeholders.sh's own header quotes the line this targeted —
  #   #   local TL='{{PROJECT_NAME}}' TU='{{PROJECT_NAME_UPPER}}'
  # — and the two-space indent of the code line is a substring of the comment's
  # three. So the mutant applied, changed a byte, satisfied the CHANGED-NOTHING
  # guard, and altered nothing that runs: a both-green verdict indistinguishable
  # from "neither implementation covers this". C28 is the same defect, anchored
  # on the preceding line of the FUNCTION so it cannot land in prose.
  echo "C23 is retired in favour of C28 — see the comment" >&2
  return 1
}

apply_C28() { # the UPPER form is not restored — only the lowercase one
  sub "$1/$PLA" "  local s=\"\$1\" nm=\"\$2\" up=\"\$3\"${NL}  local TL='{{PROJECT_NAME}}' TU='{{PROJECT_NAME_UPPER}}'" \
                "  local s=\"\$1\" nm=\"\$2\" up=\"\$3\"${NL}  local TL='{{PROJECT_NAME}}' TU='@@NEVER@@'"
}

# --- a2bp-e2e --------------------------------------------------------------
apply_E1() { # a request branch is never pushed
  sub "$1/$CLI" '  bp_file_push "$bare" "$BP_CFG_REMOTE" "$ref" "$commit" || return "$BP_RC_FAILED"' \
                '  true'
}

apply_E2() { # the identical-tip retry is not adopted — it is refused
  sub "$1/$FIL" '    if [ "$existing" = "$commit" ]; then' '    if false; then'
}

apply_E3() { # a DIFFERING remote tip is force-pushed over
  sub "$1/$FIL" "    echo \"Refusing to force-push. Someone may already be reviewing that request.\" >&2${NL}    return 1" \
                "    bp_request_transport_env git -C \"\$bare\" push -q -f \"\$remote\" \"refs/heads/\$ref:refs/heads/\$ref\" 2>/dev/null${NL}    return 0"
}

apply_E4() { # --dry-run pushes anyway
  sub "$1/$CLI" '  if [ "$dry_run" -eq 1 ]; then
    echo "${C_DIM}--dry-run: nothing pushed. Full diff:${C_RESET}"' \
                '  if false; then
    echo "${C_DIM}--dry-run: nothing pushed. Full diff:${C_RESET}"'
}

apply_E5() { # the scratch bare clone is never removed
  sub "$1/$CLI" "    rm -rf \"\$BP_A2BP_SCRATCH\" 2>/dev/null || \\" "    true || \\"
}

apply_E6() { # `blueprint push` is quietly accepted again
  sub "$1/$CLI" "  push)" "  @@NEVER@@)"
}

apply_E7() { # a missing request library degrades instead of refusing
  sub "$1/$CLI" '    [ -r "$libdir/$lib" ] || die "scripts/lib/$lib is missing — refusing to file a request without it"' \
                '    [ -r "$libdir/$lib" ] || continue'
}

# --- NEGATIVE CONTROLS -----------------------------------------------------
CONTROL_N1=1
apply_N1() { :; }   # the healthy tree. Everything must stay green.

CONTROL_N2=1
apply_N2() { # a benign LOOKALIKE: prose that merely MENTIONS the tokens, and a
  # sibling directory whose name begins with a managed prefix. Every case in all
  # six suites must stay green — a red here is over-matching.
  printf '\n# Mentions {{PROJECT_NAME}} and a2bp-allow and ~/.acme-flow in prose only.\n' \
    >> "$1/$REQ"
  mkdir -p "$1/testsuite-lookalike"
  printf 'echo lookalike\n' > "$1/testsuite-lookalike/test.sh"
}

# ===========================================================================
# ROUND 2 — the thirteen assertions round 1 left with NO observed red mutant.
#
# Round 1 ran 84 trees and covered 96 of the 109 assertions. What is below is
# one mutant per remaining assertion, and three of them exist only because the
# obvious mutant turned out to be EQUIVALENT — the defect was repaired by the
# code it was injected into, or the fixture fixes the value the assertion reads.
# Those are recorded as findings; they are not engineered around.
# ===========================================================================

apply_K12() { # file CONTENT does not reach the key at all (request #2, #3).
  # #3 claims to prove content boundaries are FRAMED, and no unframing mutant
  # can make it red — see K14 and the finding. What it can still witness is
  # content leaving the key entirely, so that is what this injects.
  sub "$1/$REQ" "bp_request_frame_file() {$NL" "bp_request_frame_file() {${NL}  return 0$NL"
}

apply_K13() { # the PROJECT component stops binding into the key (request #3b)
  sub "$1/$REQ" "    bp_request_frame \"\$project\"$NL" ""
}

apply_K14() { # BOTH framing primitives become plain concatenation (request #3c).
  # The byte count is what makes a shifted byte visible across a boundary, and
  # #3c is the only fixture in the suite that can see it leave.
  sub "$1/$REQ" "  printf '%s %s' \"\$len\" \"\$bytes\"" "  printf '%s' \"\$bytes\""
  sub "$1/$REQ" "  printf '%s ' \"\$len\"$NL  cat \"\$f\"" "  cat \"\$f\""
}

apply_K15() { # an ORDINARY project name no longer composes into a valid ref
  sub "$1/$REQ" 'candidate="a2bp/${project}/${digest}"' 'candidate="a2bp/.${project}/${digest}"'
}

apply_B17() { # a scaffolded base resolves to the ROOT coordinate (build #9a).
  # B11 alone was EQUIVALENT: with only the first arm gone, the third arm
  # ("the base has a scaffolding/ at all") answers identically. Trap 2 exactly —
  # the injected defect repaired downstream — so both arms have to go.
  sub "$1/$REQ" '  if bp_request_hermetic git -C "$bare" cat-file -e "$base:scaffolding/$path" 2>/dev/null; then' \
                '  if false; then'
  sub "$1/$REQ" '  elif bp_request_hermetic git -C "$bare" cat-file -e "$base:scaffolding" 2>/dev/null; then' \
                '  elif false; then'
}

apply_I19() { # the v1 refusal path emits an INFERRED remote a caller could eval
  sub "$1/$CFG" "  if [ -z \"\$version\" ]; then$NL" \
                "  if [ -z \"\$version\" ]; then${NL}    printf 'BP_CFG_REMOTE=%q\\n' \"\$(bp_config_field \"\$file\" blueprint_source)\"$NL"
}

apply_F8() { # the PR's state is dropped from the probe's output (pr-filing #3)
  sub "$1/$FIL" "--jq '.[0] // empty | \"\\(.state)\\t\\(.url)\"'" \
                "--jq '.[0] // empty | \"\\(.url)\"'"
}

apply_F9() { # the PR's url is dropped from the probe's output (pr-filing #2)
  sub "$1/$FIL" "--jq '.[0] // empty | \"\\(.state)\\t\\(.url)\"'" \
                "--jq '.[0] // empty | \"\\(.state)\"'"
}

apply_C24() { # the R3-F3 fail-closed guard AND the residual-name block (contam #21).
  # C15 alone was EQUIVALENT, and instructively so: with `diff` broken the
  # alignment is empty, staging passes the unrestored project bytes through, and
  # the RESIDUAL-NAME SCAN then blocks them. #21's oracle is satisfied by the
  # scan, never by the guard it names. Both have to go before the bytes land.
  sub "$1/$CON" "  if [ \"\$diff_rc\" -gt 1 ]; then${NL}    rm -f \"\$diff_out\"${NL}    return 2${NL}  fi" \
                "  if [ \"\$diff_rc\" -gt 99 ]; then${NL}    rm -f \"\$diff_out\"${NL}    return 2${NL}  fi"
  sub "$1/$CON" "    printf '%s|BLOCK|project name survived reverse-substitution — write {{PROJECT_NAME}} explicitly if it belongs|%s\\n' \"\$ln\" \"\$text\"${NL}    blocked=1" \
                "    :"
}

apply_C25() { # R6-F1 verbatim — two passes, so emitted bytes are re-scanned
  sub "$1/$PLA" "  local out=\"\" pre_l=\"\" pre_u=\"\" has_l has_u$NL" \
                "  local out=\"\" pre_l=\"\" pre_u=\"\" has_l has_u${NL}  s=\$(bp_replace_literal \"\$s\" '{{PROJECT_NAME_UPPER}}' \"\$up\")${NL}  bp_replace_literal \"\$s\" '{{PROJECT_NAME}}' \"\$nm\"${NL}  return 0$NL"
}

apply_C26() { # the name validator refuses every name — too strict, not too lax
  sub "$1/$PLA" "bp_validate_project_name() {$NL" "bp_validate_project_name() {${NL}  return 1$NL"
}

apply_C27() { # R5-F1 verbatim — substitution via sed, so the name is a TEMPLATE
  sub "$1/$PLA" "  local out=\"\" pre_l=\"\" pre_u=\"\" has_l has_u$NL" \
                "  local out=\"\" pre_l=\"\" pre_u=\"\" has_l has_u${NL}  printf '%s' \"\$s\" | sed -e \"s/{{PROJECT_NAME_UPPER}}/\$up/g\" -e \"s/{{PROJECT_NAME}}/\$nm/g\"${NL}  return 0$NL"
}

apply_E8() { # the request branch is pushed to MAIN as well (e2e #2).
  # The headline invariant of the whole feature, and the only thing that can
  # falsify it is a2bp actually landing something.
  sub "$1/$FIL" "  if ! bp_request_transport_env git -C \"\$bare\" \\
       push -q \"\$remote\" \"refs/heads/\$ref:refs/heads/\$ref\" 2>/dev/null; then" \
                "  bp_request_transport_env git -C \"\$bare\" \\
       push -q -f \"\$remote\" \"refs/heads/\$ref:refs/heads/main\" 2>/dev/null
  if ! bp_request_transport_env git -C \"\$bare\" \\
       push -q \"\$remote\" \"refs/heads/\$ref:refs/heads/\$ref\" 2>/dev/null; then"
}

ROUND2="K12 K13 K14 K15 B17 I19 F8 F9 C24 C25 C26 C27 E8 C28"

ALL_MUTANTS="K1 K2 K3 K4 K5 K6 K7 K8 K9 K10 K11 \
I1 I2 I3 I4 I5 I6 I7 I8 I9 I10 I11 I12 I13 I14 I15 I16 I17 I18 \
F1 F2 F3 F4 F5 F6 F7 \
B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 \
C0 C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20 C21 C22 \
E1 E2 E3 E4 E5 E6 E7 N1 N2 $ROUND2"

# --out FILE — publish the matrix ONLY if the run produced a verdict for every
# mutant.
if [ "${1:-}" = "--out" ]; then
  out_file="${2:?--out needs a path}"
  shift 2
  draft="$(mktemp "${TMPDIR:-/tmp}/aab-matrix-XXXXXX")"
  bash "$0" "$@" >"$draft" 2>&1
  rc=$?
  cat "$draft"
  if [ "$rc" -ne 0 ]; then
    printf '*** NOT published to %s (exit %d). Draft kept at %s\n' "$out_file" "$rc" "$draft" >&2
    exit "$rc"
  fi
  mv "$draft" "$out_file"
  exit 0
fi

case "${1:-}" in
  --list) printf '%s\n' $ALL_MUTANTS; exit 0 ;;
  --all)  set -- $ALL_MUTANTS ;;
  # --check applies every mutant to a CHEAP partial copy (the files mutants
  # touch) and reports only whether it applied. It answers "did the literal
  # match" in seconds instead of a 50 s tree per mutant — the single most
  # expensive way to discover a typo.
  --check)
    shift
    [ "$#" -gt 0 ] || set -- $ALL_MUTANTS
    chk_rc=0
    for m in "$@"; do
      t="$(mktemp -d "${TMPDIR:-/tmp}/aab-chk-XXXXXX")"
      mkdir -p "$t/scripts/lib" "$t/tests/a2bp-contamination"
      cp -a "$SRC/scripts/blueprint" "$t/scripts/"
      cp -a "$SRC"/scripts/lib/*.sh "$t/scripts/lib/"
      cp -a "$SRC/$SPEC_CON" "$t/$SPEC_CON"
      if err="$("apply_$m" "$t" 2>&1)"; then
        printf '%-4s ok\n' "$m"
      else
        printf '%-4s *** DID NOT APPLY: %s\n' "$m" "$err"
        chk_rc=1
      fi
      rm -rf "$t"
    done
    exit "$chk_rc" ;;
esac

build_tree() { # $1 = dest
  local dest="$1"
  rsync -a \
    --exclude '.git/' --exclude 'tests/node_modules/' --exclude 'logs/' \
    --exclude '.scratch/' --exclude 'coverage/' \
    "$SRC/" "$dest/"
  ln -s "$SRC/tests/node_modules" "$dest/tests/node_modules"
  git -C "$dest" init -q -b main
  # `-f`: the real repo TRACKS sixteen files that .gitignore also names (tracked
  # beats ignored there, but not in a fresh init), so a plain `add -A` leaves
  # them out of the baseline — and the CHANGED-NOTHING guard below is then blind
  # to any mutant that targets one. Reported by the gate-group agent, who
  # measured it: `git ls-files -i -c --exclude-standard` regenerates the list.
  git -C "$dest" -c user.email=e@l -c user.name=E -c commit.gpgsign=false add -A -f
  git -C "$dest" -c user.email=e@l -c user.name=E -c commit.gpgsign=false \
    commit -q -m "equivalence baseline" --no-verify
}

# `FAIL: #<id> …` from each shell runner, prefixed with its suite.
shell_red() { # $1 = suite, stdin = runner output
  sed -n 's/^FAIL: *//p' | awk -v s="$1" '{print s ":" $1}' | sort -u
}

# Failed `it()` titles from vitest's JSON reporter, prefixed with their suite.
ts_red() { # $1 = json file
  node -e '
    const r = require(process.argv[1]);
    const out = new Set();
    for (const f of r.testResults ?? []) {
      const m = /tests\/([^/]+)\//.exec(f.name ?? "");
      const suite = m ? m[1] : "?";
      for (const a of f.assertionResults ?? [])
        if (a.status === "failed")
          out.add(suite + ":" + (a.title ?? "").trim().split(/\s+/)[0]);
    }
    console.log([...out].sort().join("\n"));
  ' "$1" | sed '/^$/d'
}

TREES=0
INVALID=""

run_one() { # $1 = mutant
  local m="$1" tree s rc_sh=0 rc_one ctl applied json sh_ids ts_ids
  tree="$(mktemp -d "${TMPDIR:-/tmp}/aab-eq-$m-XXXXXX")"

  build_tree "$tree" >"$OUT/$m.build" 2>&1

  if ! "apply_$m" "$tree" >>"$OUT/$m.build" 2>&1; then
    printf '%-4s *** MUTANT DID NOT APPLY — see %s\n' "$m" "$OUT/$m.build"
    INVALID="$INVALID $m"
    rm -rf "$tree"
    return 1
  fi

  eval "ctl=\${CONTROL_$m:-0}"
  applied=$(( $(git -C "$tree" status --porcelain | wc -l) \
            + $(git -C "$tree" rev-list --count HEAD) - 1 ))
  if [ "$ctl" -eq 0 ] && [ "$applied" -eq 0 ]; then
    printf '%-4s *** MUTANT CHANGED NOTHING — verdict would be meaningless\n' "$m"
    INVALID="$INVALID $m"
    rm -rf "$tree"
    return 1
  fi
  TREES=$((TREES+1))

  : >"$OUT/$m.shell"
  : >"$OUT/$m.shell.ids"
  for s in $SUITES; do
    rc_one=0
    ( cd "$tree" && bash "tests/$s/test.sh" ) >"$OUT/$m.$s.shell" 2>&1 || rc_one=1
    [ "$rc_one" -eq 0 ] || rc_sh=1
    cat "$OUT/$m.$s.shell" >>"$OUT/$m.shell"
    shell_red "$s" <"$OUT/$m.$s.shell" >>"$OUT/$m.shell.ids"
  done

  json="$OUT/$m.json"
  rm -f "$json"
  local rc_ts=0
  bash "$(dirname "${BASH_SOURCE[0]}")/vitest.sh" "$tree" a2bp- \
    --reporter=json --outputFile="$json" >"$OUT/$m.ts" 2>&1 || rc_ts=1

  if [ ! -s "$json" ]; then
    printf '%-4s *** NO VITEST JSON — see %s\n' "$m" "$OUT/$m.ts"
    INVALID="$INVALID $m"
    rm -rf "$tree"
    return 1
  fi

  sh_ids="$(sort -u "$OUT/$m.shell.ids" | tr '\n' ' ')"
  ts_ids="$(ts_red "$json" | tr '\n' ' ')"

  printf '%-4s shell=%s [%s]\n     ts=%s [%s]\n' \
    "$m" "$( [ "$rc_sh" -eq 0 ] && echo PASS || echo FAIL )" "${sh_ids% }" \
    "$( [ "$rc_ts" -eq 0 ] && echo PASS || echo FAIL )" "${ts_ids% }"

  rm -rf "$tree"
}

for m in "$@"; do
  run_one "$m"
done

printf -- '--- totals (computed by this run) ---\n'
printf 'trees=%d\n' "$TREES"
if [ -n "$INVALID" ]; then
  printf '*** INVALID MATRIX — no verdict from:%s\n' "$INVALID"
  exit 1
fi
exit 0
