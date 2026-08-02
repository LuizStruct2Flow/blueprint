# shellcheck shell=sh
# scripts/lib/pipeline.sh — render a sequence of gate stages as a pipeline.
#
# FEATURE-002. The pre-push gate ran ~18 stages as loose `→ doing X...` echoes
# with one ✅ at the end. Two problems, and only one of them is cosmetic:
#
#   1. You could not see what had run, what it cost, or where it stopped.
#   2. **A gate that did not run printed nothing — which looks exactly like a
#      gate that passed.** On 2026-08-02 something wiped `core.hooksPath` and a
#      push went out completely ungated, indistinguishable from a gated one
#      (BUG-004, new evidence). A distinctive banner inverts that: no banner
#      means no gate, and a human sees it immediately.
#
# POSIX sh on purpose — `.githooks/pre-push` is `#!/bin/sh`, which is dash on
# Ubuntu. No arrays, no bashisms; per-stage state accumulates in a temp file.
#
# ---------------------------------------------------------------------------
# THE INVARIANT: FAIL CLOSED.
#
# This file decides whether a push is allowed. Every failure mode must block:
# a stage exiting non-zero, a stage killed by a signal, a missing tool, and a
# bug in this renderer itself. `pipe_stage` therefore EXITS on failure rather
# than returning a status the caller might drop — a forgotten `||` in one of 18
# call sites would otherwise fail open silently, which is the exact class of
# defect this repo keeps paying for. `pipe_stage_soft` exists for the rare
# genuinely-optional stage and is deliberately noisier to write.
# ---------------------------------------------------------------------------
#
# There is deliberately NO per-stage background process for a ticking timer.
# BUG-001 reached ~17,400 unreaped processes on this host from exactly that
# shape of "just one small helper per item". The running line is static and the
# duration prints on completion; that is worth the loss of a spinner.
#
# Usage:
#   . scripts/lib/pipeline.sh
#   pipe_init "pre-push gate" "blueprint · 2 commits · 257ac1d"
#   pipe_stage "secret scan · gitleaks" run_gitleaks
#   pipe_skip  "IaC synth" "no infrastructure/ directory"
#   pipe_finish            # prints the summary; returns 0 pass / 1 fail

# The shared feed appender, so gate results land in logs/agent-activity.log
# alongside every other agent's work rather than only in the terminal that
# happened to run the push. Optional by design — see _pipe_feed.
# shellcheck source=scripts/lib/feed.sh
if [ -r "${_PIPE_LIBDIR:-scripts/lib}/feed.sh" ]; then
  . "${_PIPE_LIBDIR:-scripts/lib}/feed.sh"
fi

# --- state ------------------------------------------------------------------
_PIPE_DIR=""
_PIPE_TITLE=""
_PIPE_T0=""
_PIPE_N=0

# `date +%s%N` is GNU; macOS/BSD date has no %N and prints a literal "N".
# Probe once, then commit to the form that works — the same discipline the feed
# applies to `stat` (A-06), where a bad fallback produced a plausible-looking
# blob instead of a number.
if [ "$(date +%s%N 2>/dev/null | tail -c 4)" != "%N" ] && \
   [ "$(date +%N 2>/dev/null)" != "N" ]; then
  _pipe_now(){ echo $(( $(date +%s%N) / 1000000 )); }   # milliseconds
else
  _pipe_now(){ echo $(( $(date +%s) * 1000 )); }        # seconds, ms-scaled
fi

_pipe_dur(){ # ms -> "1.2s"
  _d=$1
  echo "$(( _d / 1000 )).$(( (_d % 1000) / 100 ))s"
}

# Colour and cursor control only on a real terminal. Piped output (CI logs, a
# `| tee`, an agent capturing the push) must stay plain — an escape-sequence
# soup in a CI log is worse than no rendering at all.
if [ -t 1 ]; then
  _PIPE_TTY=1
  _C_DIM='[2m'; _C_OK='[32m'; _C_BAD='[31m'; _C_WARN='[33m'; _C_OFF='[0m'
  _PIPE_CLR='[K'
else
  _PIPE_TTY=0
  _C_DIM=''; _C_OK=''; _C_BAD=''; _C_WARN=''; _C_OFF=''
  _PIPE_CLR=''
fi

# --- lifecycle --------------------------------------------------------------
pipe_init(){
  _PIPE_TITLE="${1:-pipeline}"
  _PIPE_SUB="${2:-}"
  _PIPE_T0="$(_pipe_now)"
  _PIPE_N=0; _PIPE_OK=0; _PIPE_BAD=0; _PIPE_SKIP=0
  _PIPE_SLOW_MS=0; _PIPE_SLOW_LABEL=""

  # Buffering needs a scratch dir. If we cannot get one — /tmp full, mounted
  # noexec, coreutils not on PATH — the gate must still RUN and still fail
  # closed. It degrades to streaming each stage's output instead of refusing to
  # start, because "the gate could not create a temp dir" is a terrible reason
  # to block a push, and an even worse reason to allow one.
  _PIPE_DIR=""
  _PIPE_BUF=0
  if _d="$(mktemp -d 2>/dev/null)" && [ -d "$_d" ]; then
    _PIPE_DIR="$_d"; _PIPE_BUF=1
    trap '_pipe_cleanup' EXIT INT TERM
  fi

  printf '\n%s╭─ %s %s%s\n' "$_C_DIM" "$_PIPE_TITLE" "${_PIPE_SUB:+· $_PIPE_SUB }" "$_C_OFF"
  [ "$_PIPE_BUF" = "0" ] && printf '%s│  (no scratch dir — stage output streams unbuffered)%s\n' \
    "$_C_WARN" "$_C_OFF"
  _pipe_feed "── $_PIPE_TITLE ${_PIPE_SUB:+· $_PIPE_SUB} ──"
  return 0
}

_pipe_cleanup(){ [ -n "${_PIPE_DIR:-}" ] && rm -rf "$_PIPE_DIR" 2>/dev/null; return 0; }

# Counters live in shell variables, not a file. The summary must be correct even
# when there is no scratch dir, and a tally that depends on the filesystem is a
# tally that can silently read zero.
# _pipe_record STATUS
_pipe_record(){
  case "$1" in
    ok)   _PIPE_OK=$((   _PIPE_OK   + 1 )) ;;
    bad)  _PIPE_BAD=$((  _PIPE_BAD  + 1 )) ;;
    skip) _PIPE_SKIP=$(( _PIPE_SKIP + 1 )) ;;
  esac
  _PIPE_N=$(( _PIPE_N + 1 ))
}

_pipe_line(){ # STATUS LABEL RIGHT
  case "$1" in
    ok)   printf '%s│%s %s✓%s %-46s %s%s%s\n' "$_C_DIM" "$_C_OFF" "$_C_OK"  "$_C_OFF" "$2" "$_C_DIM" "$3" "$_C_OFF" ;;
    bad)  printf '%s│%s %s✗%s %-46s %s%s%s\n' "$_C_DIM" "$_C_OFF" "$_C_BAD" "$_C_OFF" "$2" "$_C_BAD" "$3" "$_C_OFF" ;;
    skip) printf '%s│%s %s–%s %-46s %s%s%s\n' "$_C_DIM" "$_C_OFF" "$_C_WARN" "$_C_OFF" "$2" "$_C_DIM" "$3" "$_C_OFF" ;;
  esac
  # …and the same result to the activity feed, PLAIN. The terminal render is
  # ephemeral — it scrolls away, and it is gone entirely for anyone who was not
  # watching that shell. The feed is the durable record of what the gate did,
  # and it is what an agent reads back when asked "did that push get gated?".
  # Never with colour: logs/agent-activity.log is tailed and grepped, and escape
  # sequences in it are the same mistake as escapes in a CI log.
  case "$1" in
    ok)   _pipe_feed "✓ $2  $3" ;;
    bad)  _pipe_feed "✗ $2  $3" ;;
    skip) _pipe_feed "– $2  $3" ;;
  esac
}

# Guarded so pipeline.sh still works if feed.sh is absent — a missing log must
# never be the reason a gate cannot render, let alone cannot run.
_pipe_feed(){
  command -v feed_append >/dev/null 2>&1 || return 0
  feed_append "[GATE] $1"
}

# --- the stage runner -------------------------------------------------------
# Buffers the stage's output and shows it ONLY on failure, so a passing gate is
# a clean list and a failing one still gives you everything the tool said.
# pipe_note TEXT — annotate the CURRENT stage so the fact survives buffering.
#
# Buffering hides a passing stage's output, which is what makes the summary a
# summary. But some things a passing stage says are worth keeping: "semgrep
# retried at --jobs 1", "scanned --all, no ref info on stdin". Those are not
# failures and must not look like ones, yet losing them means the gate quietly
# did something different from what you think it did. A note rides along on the
# result line instead. Written to a file, not stdout, because stdout is the
# buffer we are deliberately escaping.
pipe_note(){
  if [ "$_PIPE_BUF" = "1" ]; then printf '%s' "$1" >>"$_PIPE_DIR/note.$_PIPE_N"
  else printf '     note: %s\n' "$1"
  fi
}

_pipe_run(){
  _label="$1"; shift
  [ "$_PIPE_BUF" = "1" ] && { _out="$_PIPE_DIR/out.$_PIPE_N"; : >"$_PIPE_DIR/note.$_PIPE_N"; }

  # The "currently running" indicator. On a TTY it is overwritten in place by
  # the result line; otherwise it is simply not printed, because a non-TTY
  # consumer would just see every stage twice.
  [ "$_PIPE_TTY" = "1" ] && printf '%s│%s %s⠿%s %s…' \
    "$_C_DIM" "$_C_OFF" "$_C_DIM" "$_C_OFF" "$_label"

  _t0="$(_pipe_now)"
  if [ "$_PIPE_BUF" = "1" ]; then
    "$@" >"$_out" 2>&1
  else
    "$@"
  fi
  _rc=$?
  _ms=$(( $(_pipe_now) - _t0 ))

  [ "$_PIPE_TTY" = "1" ] && printf '\r%s' "$_PIPE_CLR"

  _note=""
  [ "$_PIPE_BUF" = "1" ] && _note="$(cat "$_PIPE_DIR/note.$_PIPE_N" 2>/dev/null || true)"

  # Track the slowest stage. With no hard time ceiling (founder decision,
  # BUG-005) the gate has to stay HONEST about its cost instead of enforcing it:
  # naming the single biggest contributor is what turns "the gate feels slow"
  # into a specific, arguable target. The old rule silently spent the budget by
  # demoting coverage to CI; this reports it and demotes nothing.
  if [ "$_ms" -gt "${_PIPE_SLOW_MS:-0}" ]; then
    _PIPE_SLOW_MS="$_ms"; _PIPE_SLOW_LABEL="$_label"
  fi

  if [ "$_rc" -eq 0 ]; then
    _pipe_line ok "$_label" "$(_pipe_dur "$_ms")${_note:+ · $_note}"
    _pipe_record ok
  else
    _pipe_line bad "$_label" "$(_pipe_dur "$_ms") · exit $_rc"
    _pipe_record bad
  fi
  return "$_rc"
}

# pipe_stage LABEL COMMAND [ARGS...] — FAILS CLOSED. A non-zero stage prints the
# captured output, prints the summary, and exits 1. It does not return.
pipe_stage(){
  _lbl="$1"
  if _pipe_run "$@"; then
    return 0
  fi
  # Unbuffered mode already streamed the output; replaying it would duplicate it.
  if [ "$_PIPE_BUF" = "1" ]; then
    printf '\n%s─── output · %s ───%s\n' "$_C_BAD" "$_lbl" "$_C_OFF"
    cat "$_PIPE_DIR/out.$(( _PIPE_N - 1 ))" 2>/dev/null
    printf '%s───%s\n' "$_C_BAD" "$_C_OFF"
  fi
  pipe_finish
  exit 1
}

# pipe_stage_soft LABEL COMMAND [ARGS...] — records a failure and RETURNS it.
# Only for a stage whose failure genuinely must not block; the caller then owns
# the decision, in writing.
pipe_stage_soft(){ _pipe_run "$@"; }

pipe_skip(){
  _pipe_line skip "$1" "skipped · $2"
  _pipe_record skip
}

# --- summary ----------------------------------------------------------------
pipe_finish(){
  _total=$(( $(_pipe_now) - _PIPE_T0 ))
  _ok="${_PIPE_OK:-0}"; _bad="${_PIPE_BAD:-0}"; _skip="${_PIPE_SKIP:-0}"

  if [ "$_bad" -gt 0 ]; then
    printf '%s╰─ FAILED%s · %s passed · %s failed · %s skipped · %s\n\n' \
      "$_C_BAD" "$_C_OFF" "$_ok" "$_bad" "$_skip" "$(_pipe_dur "$_total")"
    _pipe_feed "FAILED · $_ok passed · $_bad failed · $_skip skipped · $(_pipe_dur "$_total") — PUSH BLOCKED"
    _pipe_cleanup; trap - EXIT INT TERM
    return 1
  fi

  _slow=""
  [ -n "${_PIPE_SLOW_LABEL:-}" ] && \
    _slow=" · slowest: $_PIPE_SLOW_LABEL $(_pipe_dur "${_PIPE_SLOW_MS:-0}")"
  printf '%s╰─ PASSED%s · %s stages · %s skipped · %s%s%s%s\n\n' \
    "$_C_OK" "$_C_OFF" "$_ok" "$_skip" "$(_pipe_dur "$_total")" "$_C_DIM" "$_slow" "$_C_OFF"
  _pipe_feed "PASSED · $_ok stages · $_skip skipped · $(_pipe_dur "$_total")$_slow"

  # --- performance SLO: WARNS, never demotes (BUG-005 / Codex F1) -----------
  #
  # The old 30 s rule blocked, and blocking is exactly what made it dangerous:
  # the cheapest way to satisfy it was to move a suite out of the gate, so a
  # performance limit silently became a coverage limit. This one has no power to
  # change what runs. It says "this got slow, go optimise the named stage" — the
  # response that actually worked, when signal-dispatch went 125.4 s → 75.0 s
  # with every assertion intact.
  #
  # Deliberately never affects the exit status. Overridable per project.
  _slo_total="${AGENT_GATE_SLO_TOTAL_MS:-120000}"   # 120 s whole gate
  _slo_stage="${AGENT_GATE_SLO_STAGE_MS:-45000}"    #  45 s single stage
  if [ "$_total" -gt "$_slo_total" ] 2>/dev/null; then
    printf '%s   ⚠ gate SLO: %s total exceeds %s. Not a failure and nothing is\n' \
      "$_C_WARN" "$(_pipe_dur "$_total")" "$(_pipe_dur "$_slo_total")"
    printf '     demoted — optimise %s, or raise AGENT_GATE_SLO_TOTAL_MS deliberately.%s\n\n' \
      "${_PIPE_SLOW_LABEL:-the slowest stage}" "$_C_OFF"
    _pipe_feed "SLO: total $(_pipe_dur "$_total") over $(_pipe_dur "$_slo_total") — optimise ${_PIPE_SLOW_LABEL:-slowest}, do NOT demote"
  elif [ "${_PIPE_SLOW_MS:-0}" -gt "$_slo_stage" ] 2>/dev/null; then
    printf '%s   ⚠ gate SLO: %s took %s (over %s). Optimise it — do not move it out.%s\n\n' \
      "$_C_WARN" "$_PIPE_SLOW_LABEL" "$(_pipe_dur "$_PIPE_SLOW_MS")" \
      "$(_pipe_dur "$_slo_stage")" "$_C_OFF"
    _pipe_feed "SLO: $_PIPE_SLOW_LABEL $(_pipe_dur "$_PIPE_SLOW_MS") over $(_pipe_dur "$_slo_stage") — optimise, do NOT demote"
  fi
  _pipe_cleanup; trap - EXIT INT TERM
  return 0
}
