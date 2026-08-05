#!/usr/bin/env bash
# scripts/lib/roster.sh — the one place AGENT_ROSTER.md is parsed.
#
# BUG-010. The roster is the source of truth for who a session IS, and it is
# per-engineer and gitignored: no two fleets share persona names. So every
# reader must resolve identity from the table, keyed by ROLE, and no reader may
# carry a persona name as a literal.
#
# It went wrong in two independent ways, and both are the reason this file
# exists rather than a second grep next to the first:
#
#   1. Nothing read the roster to decide the session's own persona. The feed had
#      `persona="${AGENT_PERSONA:-<a name>}"`, so a rename was invisible and the
#      only working override was exporting AGENT_PERSONA by hand. team-kickoff
#      carried all 15 personas as a literal array — the one script whose job is
#      "confirm the roster after editing it" could not see the roster at all.
#
#   2. The single roster read that DID exist matched `"| $name |"` with literal
#      single spaces, so a column-padded table never matched. Padding is what
#      every markdown formatter emits. Worse, a miss and "no roster" produced
#      identical output, so it failed in silence — which is how it survived.
#
# Hence the three properties below, which are the contract:
#
#   - ROLE is the key, NAME is data. Renaming a cell changes one cell.
#   - Padding is tolerated everywhere. Fields are trimmed, never matched
#     positionally against a fixed-width shape.
#   - A miss WARNS on stderr. Once per distinct key per process, because a
#     warning on every emitted line is noise, and noise gets muted — which
#     leaves you exactly as blind as having no warning at all.
#
# Sourced by scripts/agent-activity.sh and scripts/team-kickoff.sh. This is the
# same "one mechanism, never two that agree only by coincidence" rule that
# scripts/lib/state-dir.sh enforces for the state directory (A-09).
#
# Usage:
#   . scripts/lib/roster.sh
#   bp_roster_file            <repo-root|file>
#   bp_roster_rows            <repo-root|file>            # role<TAB>name<TAB>backing
#   bp_roster_name_for_role   <repo-root|file> <role>
#   bp_roster_backing_for_name <repo-root|file> <name>

# --- warning memo -----------------------------------------------------------
# Deliberately a space-delimited string rather than an associative array: this
# file is sourced by scripts that must stay portable, and the memo is tiny.
_BP_ROSTER_WARNED="${_BP_ROSTER_WARNED:-}"

bp_roster_warn(){
  local key="$1" msg="$2"
  case " $_BP_ROSTER_WARNED " in *" $key "*) return 0 ;; esac
  _BP_ROSTER_WARNED="$_BP_ROSTER_WARNED $key"
  printf '[roster] %s\n' "$msg" >&2
}

# --- which file is the roster ----------------------------------------------
# The live roster is per-engineer and gitignored; the example is the tracked
# template. Prefer the personal copy, fall back to the example so a fresh clone
# still labels personas instead of printing blanks.
bp_roster_file(){
  local src="${1:-.}"
  [ -f "$src" ] && { printf '%s' "$src"; return 0; }
  [ -f "$src/AGENT_ROSTER.md" ] && { printf '%s' "$src/AGENT_ROSTER.md"; return 0; }
  [ -f "$src/AGENT_ROSTER.example.md" ] && { printf '%s' "$src/AGENT_ROSTER.example.md"; return 0; }
  return 1
}

# --- the member rows --------------------------------------------------------
# Emits one `role<TAB>name<TAB>backing` per member. ONLY the Members table is
# read: a roster carries other tables, and parsing every pipe-row would let an
# unrelated one shadow a real member — a silently wrong answer, which is the
# exact failure mode this bug was made of.
bp_roster_rows(){
  local file
  file="$(bp_roster_file "${1:-.}")" || {
    bp_roster_warn "nofile" "no AGENT_ROSTER.md or AGENT_ROSTER.example.md under '${1:-.}'"
    return 1
  }
  awk '
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    # Any heading closes the previous section and opens this one only if it is
    # the Members table.
    /^[[:space:]]*#+[[:space:]]/ {
      in_members = ($0 ~ /^[[:space:]]*#+[[:space:]]*Members/) ? 1 : 0
      next
    }
    !in_members            { next }
    $0 !~ /^[[:space:]]*\|/ { next }
    {
      n = split($0, f, "|")
      if (n < 5) next                       # | role | name | backing | => 5 parts
      role = trim(f[2]); name = trim(f[3]); backing = trim(f[4])
      if (role == "" || name == "")  next
      if (tolower(role) == "role")   next   # header row
      if (role ~ /^[-:[:space:]]+$/) next   # separator row
      print role "\t" name "\t" backing
    }
  ' "$file"
}

# --- role -> name -----------------------------------------------------------
# The primary resolution. `bp_roster_name_for_role . Orchestrator` is how a
# session learns its own identity.
bp_roster_name_for_role(){
  local src="${1:-.}" want="${2:-}" role name
  [ -n "$want" ] || return 1
  while IFS="$(printf '\t')" read -r role name _; do
    if [ "$(printf '%s' "$role" | tr '[:upper:]' '[:lower:]')" \
       = "$(printf '%s' "$want" | tr '[:upper:]' '[:lower:]')" ]; then
      printf '%s' "$name"; return 0
    fi
  done <<EOF
$(bp_roster_rows "$src")
EOF
  bp_roster_warn "role:${want// /_}" \
    "no '$want' row in $(bp_roster_file "$src" 2>/dev/null || echo '<no roster>') — identity unresolved"
  return 1
}

# --- name -> backing agent --------------------------------------------------
# The label half. The Backing agent column is free text by design (Claude Code,
# Codex, Gemini, Copilot, Qwen, …), so this returns it verbatim.
# bp_roster_label SRC NAME → "<Name> - <Backing>", or "<Name>" if unrostered.
#
# THE one way a persona is rendered into the activity feed. It lived inside
# scripts/agent-activity.sh as a local `persona_label`, which meant anything
# outside that file — notably the Codex launcher, the only place that knows who
# holds the mic for a given dispatch — had to copy it. Two copies of a rule are
# two rules: they pass their own tests and disagree in the log (BUG-021).
#
# Degrades to the bare NAME rather than failing. A feed line with no label is
# worse than an unqualified one; bp_roster_backing_for_name already warns once
# per unresolved name, so the miss is reported without being fatal.
bp_roster_label(){
  local src="${1:-.}" name="${2:-}" backing
  [ -n "$name" ] || return 1
  backing="$(bp_roster_backing_for_name "$src" "$name" 2>/dev/null)"
  printf '%s%s' "$name" "${backing:+ - $backing}"
}

bp_roster_backing_for_name(){
  local src="${1:-.}" want="${2:-}" role name backing
  [ -n "$want" ] || return 1
  while IFS="$(printf '\t')" read -r role name backing; do
    if [ "$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" \
       = "$(printf '%s' "$want" | tr '[:upper:]' '[:lower:]')" ]; then
      printf '%s' "$backing"; return 0
    fi
  done <<EOF
$(bp_roster_rows "$src")
EOF
  bp_roster_warn "name:${want// /_}" \
    "'$want' is not on $(bp_roster_file "$src" 2>/dev/null || echo '<no roster>') — labelling without a backing agent"
  return 1
}
