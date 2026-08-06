#!/usr/bin/env bash
# scripts/session-resume.sh — where is this session, and how much of it can I see?
#
# FEATURE-003. The founder's connectivity drops sessions constantly, so a woken
# agent has to reconstruct where the work stands. It used to do that by reading
# `HANDOVER.md`, and that file went stale twice in one day — once inside the same
# working session in which it had been rewritten to be true.
#
# WHY THIS DERIVES INSTEAD OF READING A SNAPSHOT
#
# The obvious design is event sourcing's: author a snapshot, replay the events
# after it. Both flow reviewers rejected the authored half independently, and the
# reasoning is the whole shape of this file:
#
#   > An authored HANDOVER.md snapshot is a SECOND BOOKKEEPING SURFACE and will
#   > go stale for the same reason the present one did. Atomic publication only
#   > guarantees a COHERENT stale snapshot; it does not make its claims true.
#
# So this tool holds NOTHING. Every line it prints is read at run time from the
# thing that owns that fact — git for the tree, the four lifecycle folders for
# what is open, the live baton for the mic, the append-only journal for the
# events. None of it can go stale, because none of it is stored.
#
# WHAT SURVIVES OF THE WRITER IS ONE APPEND
#
# `--mark` records that a handoff HAPPENED at a point in the stream. That is an
# event, and no amount of deriving reconstructs an event nobody wrote down. It is
# also immune to the staleness above, because a marker contains no claims.
#
# THE ONE REQUIREMENT THIS STANDS OR FALLS ON
#
# An INCOMPLETE replay must be LOUD. The activity feed is truncated on every
# daemon start and trimmed on rotation, so a lost window is ordinary — and a
# short replay that reads like a quiet one is the failure the whole feature
# exists to prevent. Every warning below therefore comes with a NON-ZERO EXIT, so
# a script can branch on it and not only a human reading prose. BUG-018 is the
# precedent: a guard that printed exactly the right advice and returned 0, so its
# caller read "sync succeeded" while nothing had been pulled.
#
# The founder named this design's hard limit before it was built — "if the
# logging fails, it fails. There is no way around this, isn't?" — and that is
# correct. If the marker append fails, the window is lost. What the design owes
# in return is that the loss ANNOUNCES ITSELF rather than looking like success.
#
# WHAT IT DETECTS, AND WHAT IT CANNOT — the scope, stated because a reader will
# otherwise assume the stronger one.
#
# It detects LOSS: a truncated feed, a rotated one, the wrong feed, a marker with
# no provenance, prose that predates the window. Every one of those happens by
# itself, routinely, which is exactly why they need detecting.
#
# It does NOT detect TAMPERING. Codex demonstrated a clean report built by
# copying the probe to another feed line AND editing `feedline=` in the journal
# to match — two coordinated hand-edits. That is not a hole to be closed here: the
# journal and the feed are local untracked state, and anyone able to edit them can
# equally write a whole marker from nothing, so no check this script performs can
# be stronger than the files it reads. A digest would not help either, since the
# same hand recomputes it.
#
# So the promise is deliberately narrow: SILENCE MEANS NOTHING WAS LOST BY ITSELF.
# It does not mean nobody rewrote the record. Making it mean that needs an
# append-only authenticated log, which is a different feature.
#
# Usage:
#   scripts/session-resume.sh                 # report (read-only)
#   scripts/session-resume.sh --mark          # close the open window, open a new one
#   scripts/session-resume.sh --rollback      # stash uncommitted work, labelled
#   scripts/session-resume.sh --root DIR      # report on another checkout
#
# Exit: 0 report complete and trusted · 9 incomplete or untrusted · 2 usage.
set -u

# BUG-019/BUG-020 — resolve the CODE's location from THIS SCRIPT's tree, never
# from cwd and never from `git rev-parse` (an exported GIT_DIR redirects that to
# whatever repository the caller was pointed at). Byte-identical to the block in
# every other state-dir consumer; tests/state-dir/ #7 pins that duplication,
# which cannot be removed because this is the code that FINDS scripts/lib/.
_bp_self="${BASH_SOURCE[0]}"
_bp_hops=0
while [ -L "$_bp_self" ] && [ "$_bp_hops" -lt 40 ]; do
  _bp_dir="$(cd -P "$(dirname "$_bp_self")" && pwd)"
  _bp_self="$(readlink "$_bp_self")"
  case "$_bp_self" in /*) ;; *) _bp_self="$_bp_dir/$_bp_self" ;; esac
  _bp_hops=$((_bp_hops + 1))
done
if [ -L "$_bp_self" ]; then
  echo "FATAL: symlink chain for $_bp_self exceeds 40 hops — cycle?" >&2
  exit 1
fi
_bp_root="$(cd -P "$(dirname "$_bp_self")/.." && pwd)"

. "$_bp_root/scripts/lib/state-dir.sh"

MODE="report"
# The DATA root defaults to this script's own tree and is overridable. Code and
# data are resolved separately on purpose: the libs must come from the checkout
# this script belongs to, while the state being reported on may be another one
# (a fixture, or a second worktree).
DATA_ROOT="$_bp_root"

usage(){ sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root)     DATA_ROOT="${2:-}"; shift 2 ;;
    --mark)     MODE="mark"; shift ;;
    --rollback) MODE="rollback"; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          echo "session-resume: unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -d "$DATA_ROOT" ] || { echo "session-resume: no such --root: $DATA_ROOT" >&2; exit 2; }
DATA_ROOT="$(cd -P "$DATA_ROOT" && pwd)"

SIGNAL="$(agent_signal_file "$DATA_ROOT")"
JOURNAL="$(dirname "$SIGNAL")/signal-history.log"
HANDOVER="$DATA_ROOT/docs/doing/HANDOVER.md"

# ABSOLUTE, canonical, and resolved the SAME WAY on both sides. A relative
# $AGENT_FEED_LOG used to be recorded relative to the marking process's cwd and
# read back relative to $DATA_ROOT, so a perfectly healthy feed compared unequal
# and warned (Codex R2-4).
#
# Canonicalises the directory AND follows a symlinked feed FILE. Doing only the
# directory left two names for one inode — mark through `logs/link.log`, read
# through `logs/real.log`, and a perfectly healthy feed reported a mismatch
# (Codex R3-1).
#
# RETURNS NON-ZERO on an unresolvable chain. Bounding the walk was not enough:
# on a cycle it ran out of hops and returned the still-symlinked path, `--mark`
# wrote a probe into nothing (feed_append is deliberately never fatal) and exited
# 0 with no warning (Codex R4-1). A tool whose whole point is that failure
# announces itself must not have a silent one of its own.
norm_path(){
  _np="$1"
  case "$_np" in /*) ;; *) _np="$PWD/$_np" ;; esac
  _np_hops=0
  while [ "$_np_hops" -lt 40 ]; do
    _np_dir="${_np%/*}"
    [ -n "$_np_dir" ] || _np_dir="/"
    if [ -d "$_np_dir" ]; then
      _np_abs="$(cd -P "$_np_dir" && pwd)"
      case "$_np_abs" in
        /) _np="/${_np##*/}" ;;
        *) _np="$_np_abs/${_np##*/}" ;;
      esac
    fi
    [ -L "$_np" ] || break
    _np_t="$(readlink "$_np")"
    case "$_np_t" in
      /*) _np="$_np_t" ;;
      *)  _np="${_np%/*}/$_np_t" ;;
    esac
    _np_hops=$((_np_hops + 1))
  done
  if [ -L "$_np" ]; then
    printf '%s' "$_np"
    return 1
  fi
  printf '%s' "$_np"
}
if ! FEED="$(norm_path "${AGENT_FEED_LOG:-$DATA_ROOT/logs/agent-activity.log}")"; then
  echo "FATAL: the feed path resolves through a symlink chain that never ends — a cycle." >&2
  echo "  last hop: $FEED" >&2
  echo "  Refusing rather than writing a probe into nothing: a marker whose feed" >&2
  echo "  cannot be written is a window that will read as clean and be empty." >&2
  exit 1
fi

# Markers are POSITIONS in an append-only file, never timestamps. The feed writes
# HH:MM:SS with no date, and this host's clock has moved BACKWARDS mid-day —
# entries stamped 19:47 sitting earlier in the file than entries stamped 14:39.
# "Everything after time T" is therefore wrong twice: it cannot span midnight and
# it mis-orders whenever the clock jumps.
OPEN_RE='^\[[^]]*\] <[0-9a-f][0-9a-f]*> '
CLOSE_RE='^\[[^]]*\] </[0-9a-f][0-9a-f]*>'

# The probe's full prefix, matched as a FIXED STRING. A bare `<id>` match was the
# first version and it was wrong in a way that mattered: any feed line that
# merely MENTIONED the id — a dispatch task quoting it, for instance — read as
# proof the window was intact. Codex demonstrated exactly that.
PROBE_TAG='[RESUME] snapshot'

WARNINGS=0
warn(){ printf '⚠ %s\n' "$1" >&2; WARNINGS=$((WARNINGS + 1)); }

now_utc(){ date -u '+%Y-%m-%dT%H:%M:%SZ'; }

# --- marker reading ----------------------------------------------------------
# The LAST open marker, never the first: a reader that greps for "the marker" and
# takes the first hit replays the whole day and buries the live window.
open_marker_line(){ grep -nE "$OPEN_RE" "$JOURNAL" 2>/dev/null | tail -1; }
marker_id_of(){ printf '%s' "$1" | sed 's/^[0-9]*:\[[^]]*\] <//; s/>.*$//'; }

git_head(){ git -C "$DATA_ROOT" rev-parse --short HEAD 2>/dev/null || printf 'unknown'; }

# ============================================================================
# --mark — the ONE authored write, and it is not prose.
#
# Close the window that is open, then open a new one, then record the new id
# where a reader will look for it. Both journal appends and the HANDOVER id are
# done here so the two records agree by construction; the reader's disagreement
# check exists for the case where one of them was written WITHOUT the other —
# a hand-edit, or an append that failed.
# ============================================================================
if [ "$MODE" = "mark" ]; then
  mkdir -p "$(dirname "$JOURNAL")" 2>/dev/null || true

  # 8 hex characters. Enough to be unambiguous in one project's journal, short
  # enough to read aloud — this is a correlation key, not a security token.
  new_id="$(od -An -N4 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')"
  [ -n "$new_id" ] || new_id="$(printf '%08x' $(( $$ + $(date +%s) )) )"

  head_sha="$(git_head)"

  # A probe into the feed, NOT a second source of truth. Its ABSENCE at read
  # time is the signal — that is how the reader learns the feed was truncated or
  # rotated past this window, without asking a timestamp anything.
  #
  # The probe goes FIRST, before anything touches the journal, because the marker
  # records where the probe landed and because a mark that cannot write its probe
  # must leave NO trace at all.
  AGENT_FEED_LOG="$FEED"; export AGENT_FEED_LOG
  # shellcheck source=scripts/lib/feed.sh
  . "$_bp_root/scripts/lib/feed.sh"
  feed_append "$PROBE_TAG <$new_id> head=$head_sha"

  # WHICH feed, and WHERE IN IT. Presence of the id alone proved far too little
  # — Codex R1 demonstrated three false cleans against it: an unrelated line that
  # merely mentioned the id, a stale $AGENT_FEED_LOG pointing at a different
  # feed that happened to carry an old probe, and a feed trimmed after the
  # marker. Recording the path and the line number turns "the id occurs
  # somewhere" into two checkable facts.
  feed_ref="$FEED"
  case "$FEED" in "$DATA_ROOT"/*) feed_ref="${FEED#"$DATA_ROOT"/}" ;; esac

  # FIND the probe rather than ASSUMING where it landed (Codex R6-2).
  #
  # This used to take `wc -l` after the append and call that the probe's line.
  # That is only true if nothing else wrote in between — and the activity daemon
  # is appending to this very file continuously. Codex measured **7 of 100
  # ordinary marks refusing** because of it: a healthy mark, failing, which is the
  # false-alarm failure mode that gets a tool muted.
  #
  # Searching for the id is race-free by construction. The id is freshly minted,
  # so exactly one line carries it, wherever concurrent writers have pushed it to.
  # It also SUBSUMES the read-back check (Codex R5): if the probe cannot be found,
  # it was never stored — `/dev/null`, a full disk, a read-only file, a FIFO with
  # no reader all land here. `feed_append` is deliberately never fatal, so its
  # return value proves nothing and this is the only honest evidence.
  probe_at="$(grep -nF "$PROBE_TAG <$new_id>" "$FEED" 2>/dev/null | tail -1)"
  feed_line="${probe_at%%:*}"
  if [ -z "$feed_line" ]; then
    echo "FATAL: the probe for <$new_id> could not be read back from $FEED." >&2
    echo "  The feed accepted the write without storing it — /dev/null, a full disk," >&2
    echo "  a read-only file, or an unreadable link are all this shape." >&2
    echo "  NOTHING was written to the journal: opening a window whose probe went" >&2
    echo "  nowhere would make it read as complete forever after." >&2
    exit 1
  fi

  prev="$(open_marker_line)"
  if [ -n "$prev" ]; then
    prev_id="$(marker_id_of "$prev")"
    printf '[%s] </%s>\n' "$(now_utc)" "$prev_id" >>"$JOURNAL"
  fi

  # `feed=` goes LAST and is parsed to end-of-line, because a feed path may
  # legitimately contain spaces and the fields are space-separated. With it in
  # the middle, a healthy feed under a path with a space simply could not round
  # trip, and an intact window warned (Codex R2-3).
  printf '[%s] <%s> head=%s feedline=%s feed=%s\n' \
    "$(now_utc)" "$new_id" "$head_sha" "$feed_line" "$feed_ref" >>"$JOURNAL"

  # THE JOURNAL GETS THE SAME TREATMENT AS THE FEED (Codex R6-1).
  #
  # The feed write was verified and the journal write was not, and that asymmetry
  # had no defence: an unwritable journal let `--mark` exit 0 and stamp a NEW id
  # into HANDOVER.md for a window that was never opened. The next read then sees
  # prose claiming an id the journal has never heard of — the very disagreement
  # this tool reports, manufactured by the tool itself.
  #
  # HANDOVER is written only after this passes, so a refusal leaves both records
  # exactly as they were.
  if ! grep -qF "<$new_id> head=$head_sha" "$JOURNAL" 2>/dev/null; then
    echo "FATAL: the marker for <$new_id> could not be read back from $JOURNAL." >&2
    echo "  The journal is unwritable, full, or on a read-only filesystem." >&2
    echo "  HANDOVER.md was NOT updated: an id in the prose for a window the" >&2
    echo "  journal never recorded is exactly the disagreement this tool exists" >&2
    echo "  to report, and it must not be the one manufacturing it." >&2
    exit 1
  fi

  if [ -f "$HANDOVER" ]; then
    tmp="$(mktemp "${HANDOVER}.XXXXXX")"
    if grep -q 'session-marker:' "$HANDOVER"; then
      sed "s/session-marker: [0-9a-fA-F]*/session-marker: $new_id/" "$HANDOVER" >"$tmp"
    else
      { printf '<!-- session-marker: %s -->\n\n' "$new_id"; cat "$HANDOVER"; } >"$tmp"
    fi
    chmod --reference="$HANDOVER" "$tmp" 2>/dev/null || true
    mv "$tmp" "$HANDOVER"
  else
    warn "no $HANDOVER — the snapshot id has nowhere to live, so nothing can disagree with the journal and the staleness check is inert."
  fi

  echo "session-resume: snapshot <$new_id> opened at $head_sha → $JOURNAL"
  [ "$WARNINGS" -eq 0 ] || exit 9
  exit 0
fi

# ============================================================================
# --rollback — STASH, never discard.
#
# When the snapshot cannot be trusted the instinct is to roll back, and the safe
# form of that is `git stash push`, not `checkout --`. Both clear the tree; only
# one is reversible when the judgement was wrong. An untrusted snapshot is LOW
# CONFIDENCE ABOUT THE WORK, which is exactly when destroying it is least
# defensible.
#
# `-u` includes untracked files (a half-written plan is the commonest casualty)
# and deliberately not `-a`: ignored paths are logs/ and .scratch/, which are
# state rather than work.
# ============================================================================
if [ "$MODE" = "rollback" ]; then
  if ! git -C "$DATA_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    echo "session-resume: $DATA_ROOT is not a git checkout — nothing to roll back." >&2
    exit 2
  fi
  if [ -z "$(git -C "$DATA_ROOT" status --porcelain 2>/dev/null)" ]; then
    echo "session-resume: the tree is clean — nothing to stash."
    exit 0
  fi
  marker="$(open_marker_line)"
  label="untrusted snapshot"
  [ -n "$marker" ] && label="snapshot <$(marker_id_of "$marker")>"
  msg="session-resume: $label at $(git_head) — $(now_utc)"
  if git -C "$DATA_ROOT" stash push -u -m "$msg" >/dev/null 2>&1; then
    echo "session-resume: stashed as \"$msg\""
    echo "  recover with: git -C $DATA_ROOT stash pop"
    exit 0
  fi
  echo "session-resume: git stash push failed — the tree is UNCHANGED." >&2
  echo "  Nothing was discarded. Resolve by hand rather than forcing it." >&2
  exit 1
fi

# ============================================================================
# report — everything below is DERIVED at run time.
# ============================================================================
printf 'SESSION RESUME · %s · %s\n\n' "${DATA_ROOT##*/}" "$(now_utc)"

# --- git ---------------------------------------------------------------------
echo "GIT"
if git -C "$DATA_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  branch="$(git -C "$DATA_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null)"
  [ -n "$branch" ] || branch="(detached)"
  upstream="$(git -C "$DATA_ROOT" rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)"
  rel=""
  if [ -n "$upstream" ]; then
    counts="$(git -C "$DATA_ROOT" rev-list --left-right --count "$upstream...HEAD" 2>/dev/null || true)"
    behind="$(printf '%s' "$counts" | awk '{print $1+0}')"
    ahead="$(printf '%s' "$counts" | awk '{print $2+0}')"
    if [ "${behind:-0}" -eq 0 ] && [ "${ahead:-0}" -eq 0 ]; then
      rel="level with $upstream"
    else
      rel="$ahead ahead / $behind behind $upstream"
    fi
  else
    rel="no upstream"
  fi
  printf '  branch    %s  (%s)\n' "$branch" "$rel"
  printf '  head      %s\n' "$(git -C "$DATA_ROOT" log -1 --format='%h  %s' 2>/dev/null || echo 'no commits')"
  porcelain="$(git -C "$DATA_ROOT" status --porcelain 2>/dev/null)"
  if [ -z "$porcelain" ]; then
    printf '  tree      clean\n'
  else
    untracked="$(printf '%s\n' "$porcelain" | grep -c '^??')"
    changed="$(printf '%s\n' "$porcelain" | grep -c .)"
    printf '  tree      %s changed, %s untracked — see --rollback (stashes, never discards)\n' \
      "$((changed - untracked))" "$untracked"
  fi
else
  printf '  (not a git checkout)\n'
fi
echo

# --- lifecycle ---------------------------------------------------------------
# Read from the folders themselves, so a row promoted by anyone — this session,
# another agent, the founder by hand — is visible on the next run without anybody
# telling this tool about it.
lifecycle_ids(){
  d="$DATA_ROOT/docs/$1"
  [ -d "$d" ] || return 0
  for f in "$d"/*.md; do
    [ -f "$f" ] || continue
    grep -oE '^\|[[:space:]]*\*\*[A-Z]+-[0-9]+\*\*' "$f" 2>/dev/null
  done | grep -oE '[A-Z]+-[0-9]+' | sort -u
}

echo "LIFECYCLE"
for state in backlog doing waiting-acceptance done; do
  ids="$(lifecycle_ids "$state")"
  count="$(printf '%s' "$ids" | grep -c . || true)"
  list="$(printf '%s' "$ids" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [ "${count:-0}" -gt 8 ]; then
    list="$(printf '%s' "$ids" | head -8 | tr '\n' ' ')+$((count - 8)) more"
  fi
  printf '  %-20s %2s  %s\n' "$state" "${count:-0}" "$list"
done
echo

# --- the live baton ----------------------------------------------------------
echo "BATON"
if [ -f "$SIGNAL" ]; then
  for row in Holder State Task 'Last update'; do
    val="$(grep -m1 "^| $row |" "$SIGNAL" 2>/dev/null | sed "s/^| $row | //; s/ |$//")"
    printf '  %-12s%s\n' "$(printf '%s' "$row" | tr '[:upper:] ' '[:lower:]-')" "${val:-(none)}"
  done
else
  printf '  (no live baton at %s — nobody has taken the mic in this checkout)\n' "$SIGNAL"
fi
echo

# --- the snapshot window -----------------------------------------------------
echo "SNAPSHOT"
marker="$(open_marker_line)"
if [ -z "$marker" ]; then
  printf '  none\n\n'
  warn "no snapshot marker found in $JOURNAL. This is a fresh clone, or the journal was lost — NOTHING is being replayed. Read git log and the lifecycle folders above instead of trusting a short replay."
else
  open_id="$(marker_id_of "$marker")"
  open_no="${marker%%:*}"
  printf '  marker    <%s>\n' "$open_id"
  printf '  opened    %s\n' "$(printf '%s' "$marker" | sed 's/^[0-9]*://')"

  # Closed-and-not-reopened: --mark always writes close-then-open, so the last
  # open marker is never closed. If it is, one of the two appends did not happen.
  if awk -v n="$open_no" 'NR>n' "$JOURNAL" 2>/dev/null | grep -qE "$CLOSE_RE"; then
    warn "snapshot <$open_id> is CLOSED and no later one was opened — the close append landed and the open did not. There is no live window."
  fi

  # The feed probe. Its absence means the window's tool-level detail is gone:
  # `agent-activity.sh --daemon` truncates the log on every start, and
  # scripts/lib/feed.sh trims it on rotation. Both are normal; a silent short
  # replay is not.
  #
  # WHAT THIS PROVES, EXACTLY — stated because the first version overclaimed it
  # and Codex R1 broke it three ways. It proves that THE FEED WE ARE READING is
  # the one this snapshot was marked against, that the probe line written at mark
  # time is still in it, and that nothing was removed from IN FRONT of the probe.
  #
  # It does NOT prove that nothing was removed from AFTER the probe. Nothing
  # records how many lines there should be by now, so that is not derivable — and
  # no mechanism in this repo does it (the daemon truncates the whole file, and
  # lib/feed.sh rotation keeps the TAIL, dropping only what precedes). Saying so
  # is better than a check that implies a guarantee it cannot make.
  mark_line="$(printf '%s' "$marker" | sed -n 's/.* feedline=\([0-9]*\).*/\1/p')"
  mark_feed="$(printf '%s' "$marker" | sed -n 's/.* feed=\(.*\)$/\1/p')"
  case "$mark_feed" in
    ''|/*) ;;
    *) mark_feed="$DATA_ROOT/$mark_feed" ;;
  esac
  [ -z "$mark_feed" ] || mark_feed="$(norm_path "$mark_feed")"

  if [ -z "$mark_feed" ] || [ -z "$mark_line" ]; then
    # A marker written before the provenance fields existed. Falling through to
    # a content-only check here re-created the very false clean those fields were
    # added to close (Codex R2-2) — an upgrade path that silently gives back the
    # old behaviour is worse than one that refuses.
    warn "the marker for <$open_id> carries no feed provenance — it was written by an older version of this tool. Its window cannot be checked at all. Re-run 'session-resume.sh --mark' to open one that can be."
  elif [ "$mark_feed" != "$FEED" ]; then
    warn "this snapshot was marked against $mark_feed but the feed being read is $FEED (\$AGENT_FEED_LOG, or a different checkout). A probe found in the wrong feed proves nothing about this window."
  elif [ ! -f "$FEED" ]; then
    warn "the activity feed ($FEED) does not exist, so the tool-level detail for <$open_id> is GONE. The journal events below are all that survives."
  else
    # AUTHENTICATE BY POSITION, not by text. Matching the probe's wording alone
    # was still forgeable: the feed carries dispatch task text verbatim, so a
    # task that quotes a probe line IS a probe line to a content check — and
    # taking the last match meant the forgery won (Codex R2-1). The marker
    # records WHERE the probe landed, so the question becomes "is the recorded
    # line still the probe?", which a later copy cannot answer for it.
    at_recorded=""
    [ -n "$mark_line" ] && at_recorded="$(sed -n "${mark_line}p" "$FEED" 2>/dev/null)"
    probe_at="$(grep -nF "$PROBE_TAG <$open_id>" "$FEED" 2>/dev/null | head -1)"
    probe_at="${probe_at%%:*}"

    case "$at_recorded" in
      *"$PROBE_TAG <$open_id>"*)
        : ;;                       # the recorded position still holds the probe
      *)
        if [ -z "$probe_at" ]; then
          warn "the activity feed no longer carries the probe for <$open_id> — it was truncated by a daemon restart or trimmed past this window by rotation. The journal events below are ALL that survives; do not read a short replay as a quiet one."
        elif [ "$probe_at" -lt "$mark_line" ] 2>/dev/null; then
          warn "the activity feed has been TRIMMED: the probe for <$open_id> sat at line $mark_line and now sits at line $probe_at, so $((mark_line - probe_at)) line(s) that preceded this window are gone. What follows the probe is intact."
        else
          warn "the feed carries the probe text for <$open_id> at line $probe_at, but the marker recorded line $mark_line and that line is something else. The recorded position no longer holds the probe, so this text is a COPY and proves nothing about the window."
        fi
        ;;
    esac
  fi

  # Header vs journal. Two independent writes that must agree; when they do not,
  # one of them is a claim nobody backed. This is the case that went undetected
  # twice on 2026-08-05.
  if [ ! -f "$HANDOVER" ]; then
    warn "no $HANDOVER, so the journal's marker cannot be corroborated."
  else
    hid="$(grep -m1 -oE 'session-marker: [0-9a-fA-F]+' "$HANDOVER" 2>/dev/null | awk '{print $2}')"
    if [ -z "$hid" ]; then
      warn "HANDOVER.md carries no session marker while the journal's open marker is <$open_id> — the two were written independently. TRUST git and the lifecycle folders above, not the prose."
    elif [ "$hid" != "$open_id" ]; then
      # Two very different situations, and telling them apart is what keeps this
      # warning from being noise. A branch switch routinely brings in a HANDOVER
      # committed under an EARLIER marker — that id is in this journal's history,
      # the prose simply predates the live window, and one command re-syncs it.
      # An id that appears NOWHERE was written by something that never marked,
      # which is the staleness this check exists for.
      if grep -qE "^\[[^]]*\] <$hid> " "$JOURNAL" 2>/dev/null; then
        warn "HANDOVER.md carries the OLDER snapshot id <$hid>; the live window is <$open_id>. The prose predates it — that is what a branch switch looks like. Re-run 'session-resume.sh --mark' to re-sync, and until then trust git and the lifecycle folders above."
      else
        warn "HANDOVER.md says <$hid>, which appears NOWHERE in this journal, while the open marker is <$open_id>. The two were written independently, so one of them is a claim nobody backed. TRUST git and the lifecycle folders above, not the prose."
      fi
    fi
  fi

  events="$(awk -v n="$open_no" 'NR>n' "$JOURNAL" 2>/dev/null | grep -vE "$OPEN_RE|$CLOSE_RE")"
  n_events="$(printf '%s' "$events" | grep -c . || true)"
  printf '  events    %s since the marker\n\n' "${n_events:-0}"

  echo "REPLAY"
  if [ "${n_events:-0}" -eq 0 ]; then
    printf '  (no journal events since the marker)\n'
  else
    printf '%s\n' "$events" | sed 's/^/  /'
  fi
fi

echo
if [ "$WARNINGS" -gt 0 ]; then
  printf 'INCOMPLETE — %s warning(s) above. This report is not a full picture.\n' "$WARNINGS" >&2
  exit 9
fi
exit 0
