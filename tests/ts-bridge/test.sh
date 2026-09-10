#!/bin/bash
# tests/ts-bridge/test.sh
#
# BUG-055 — the vitest bridge could not run under a real `git push`, and when
# it failed it said NOTHING.
#
# Two defects in scripts/run-ts-suites.sh, found because a push was refused
# with no explanation and the gate's own log simply stopped mid-list.
#
#   1. git exports GIT_DIR when it invokes a hook. The TS harness refuses to
#      run any scenario while that variable is present (tests/harness/env.ts,
#      assertProcessEnvClean) and that refusal is CORRECT -- it is the
#      BUG-046/BUG-047 guard. Together those two facts meant every TS suite
#      failed under a push and passed by hand. The shell suites have scrubbed
#      git's environment since BUG-014; the TS path never got the equivalent.
#
#   2. The runner was invoked as `( ... ) >/dev/null 2>&1` with `_ts_rc=$?` on
#      the following line, inside a hook that runs `set -e`. The assignment is
#      unreachable on the only path where it matters, so a failing runner
#      killed the hook before any stage printed: no stage line, no summary, no
#      error. A broken run and a missing one were indistinguishable, which is
#      BUG-005 in the stage built to report BUG-005.
#
# Both cases use a STUBBED npx. The point is not to re-run vitest -- the specs
# do that -- but to pin what the bridge does with the environment it is handed
# and with a runner that fails. A stub also keeps this suite hermetic and fast.
#
# Run from the blueprint repo root:  bash tests/ts-bridge/test.sh
# Exit codes: 0 = pass; non-zero = fail.

set -u

# BUG-014 — never inherit git's repo pointers.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAILED=0
fail(){ echo "FAIL: $*"; FAILED=1; }
pass(){ echo "  ok — $*"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# --- a fixture project the bridge will accept -------------------------------
# It needs: a vitest.config.ts, one suite dir holding a *.spec.ts, a SUITES.md
# row the manifest parser accepts, and the two libs the bridge sources.
W="$TMP/proj"
mkdir -p "$W/tests/demo" "$W/scripts/lib" "$W/bin"
cp "$ROOT/scripts/lib/pipeline.sh" "$ROOT/scripts/lib/suites.sh" "$W/scripts/lib/"
cp "$ROOT/scripts/run-ts-suites.sh" "$W/scripts/"
: > "$W/vitest.config.ts"
: > "$W/tests/demo/demo.spec.ts"
sed -n '1,/^|---/p' "$ROOT/tests/SUITES.md" > "$W/tests/SUITES.md"
printf '| `demo` | both | fixture | fixture | parallel-safe | fixture |\n' \
  >> "$W/tests/SUITES.md"
# THE LAST ROW OWNS NO SPEC, AND THAT IS THE WHOLE POINT.
#
# bp_suites_with_spec ends its loop on `[ -n "$(find … *.spec.ts)" ]`, so the
# LAST classified row decides the function's exit status. A final row without a
# spec makes it return 1 while printing a perfectly correct list — the case
# scripts/lib/suites.sh calls "harmless to the one caller that reads it through
# `$( )`". Under `set -e` it is fatal to exactly that caller.
#
# The first version of this fixture had `demo` last, so the function returned 0
# and every case here passed while the real gate died on the real manifest.
# A fixture that cannot produce the failing input is not a fixture for it.
mkdir -p "$W/tests/nospec"
: > "$W/tests/nospec/test.sh"
printf '| `nospec` | both | fixture | fixture | parallel-safe | fixture |\n' \
  >> "$W/tests/SUITES.md"

if [ -z "$( cd "$W" && . ./scripts/lib/suites.sh && bp_suites_with_spec "$W" )" ]; then
  fail "#0 the fixture declares no suite — the cases below would pass vacuously"
  echo FAILED; exit 1
fi
pass "#0 the fixture declares a suite that owns a spec"


# A stub npx that RECORDS the git environment it was handed, then reports one
# passing suite in vitest's JSON shape.
make_npx(){ # $1 = exit code the stub returns
  cat > "$W/bin/npx" <<STUB
#!/bin/sh
env | sed -nE 's/^((GIT|AGENT)_[A-Za-z0-9_]*)=.*/\1/p' | sort > "$TMP/seen-env"
printf 'ran\n' >> "$TMP/seen-env"
echo "stub npx: pretending to be vitest"
for a in "\$@"; do
  case "\$a" in
    --outputFile=*) out="\${a#--outputFile=}" ;;
  esac
done
[ -n "\${out:-}" ] && cat > "\$out" <<'JSON'
{"testResults":[{"name":"/tests/demo/demo.spec.ts","status":"passed","startTime":100,"endTime":180}]}
JSON
exit $1
STUB
  chmod +x "$W/bin/npx"
}

run_bridge(){ # runs the stage with the environment a real hook is handed
  ( cd "$W"
    export PATH="$W/bin:$PATH"
    # Everything git and the gate actually export. The first version of this
    # case set GIT_DIR alone, so it passed a fix that unset four git names and
    # left AGENT_* inherited — and the real push failed again, identically and
    # just as silently. One variable is not a population.
    export GIT_DIR="$W/.git-decoy"
    export GIT_INDEX_FILE="$W/.git-decoy/index"
    export GIT_CONFIG_GLOBAL="$W/.gitconfig-decoy"
    export AGENT_FEED_TAG="GATE"
    export AGENT_SIGNAL_FILE="$W/decoy-signal.md"
    export AGENT_STATE_HOME="$W/decoy-state"
    set -e                      # the hook's own setting — case 2 depends on it
    . ./scripts/lib/pipeline.sh
    pipe_init "ts-bridge fixture" >/dev/null 2>&1 || true
    . ./scripts/run-ts-suites.sh
    ts_suites_stage "$W"
  ) >"$TMP/out" 2>&1
}

# ===========================================================================
# 1. BUG-055 — the runner must NOT inherit git's repo pointers.
# ===========================================================================
make_npx 0
rm -f "$TMP/seen-env"
run_bridge || true

carried="$(grep -E '^(GIT|AGENT)_' "$TMP/seen-env" 2>/dev/null | tr '\n' ' ')"
if [ ! -f "$TMP/seen-env" ]; then
  fail "#1 BUG-055: the runner was never invoked at all — output was: $(cat "$TMP/out")"
elif [ -z "$carried" ]; then
  pass "#1 BUG-055: the runner sees no GIT_* or AGENT_* variable, so the harness guard does not refuse under a real push"
else
  fail "#1 BUG-055: the runner inherited $carried — the harness refuses every scenario while any of these is set, so the whole TS stage fails under a real push while passing by hand"
fi

# The scrub must cover the harness's ENTIRE forbidden set, not a remembered
# subset of it. Read from the harness rather than restated, so this cannot
# drift the way a second copy of the list would.
#
# KEYED ON `.blueprint-root`, NEVER ON THE FILE BEING ABSENT (BUG-053).
# tests/harness/ is a blueprint-tier suite and deliberately does not ship, so
# downstream there is no FORBIDDEN_ENV to read and this assertion is
# not-applicable rather than failed. Absence-keying would be the tempting fix
# and is the wrong one: it would let a blueprint that deleted its own harness
# skip the check in silence, which is BUG-005 with an extra step. The bridge
# itself DOES ship, so every other case here still runs downstream.
#
# Caught by tests/bootstrap-gate — the one suite that speaks for the projects
# downstream — exactly as it caught BUG-053.
if [ ! -f "$ROOT/.blueprint-root" ]; then
  pass "#1c not applicable outside a blueprint — tests/harness/ is blueprint-tier and does not ship, so there is no FORBIDDEN_ENV here to cross-check"
else
# READ FROM THE ENV_KIND TABLE, WHICH IS WHERE THE NAMES LIVE (BUG-063).
# This used to parse a literal `FORBIDDEN_ENV = [ … ]` array. BUG-060 turned
# that array into a DERIVATION over the ENV_KIND table — every GIT_*/AGENT_*
# name whose kind is not 'inert' — and the pattern then matched nothing, so
# this case failed as "could not read", which took the whole suite and the
# push gate with it. The refusal was right: a cross-check that cannot see its
# subject must not report success. The parse is what was stale.
#
# One mirrored rule (skip 'inert') is the price of reading a TypeScript
# declaration from shell. The NAMES still come from the file, which is what
# stops this becoming the second copy BUG-051/053/061 each were.
forbidden="$(sed -n "/^const ENV_KIND = {/,/^} as const/p" "$ROOT/tests/harness/env.ts" \
             | sed -nE "s/^[[:space:]]*((GIT|AGENT)_[A-Z0-9_]*): '([a-z-]+)'.*/\3 \1/p" \
             | grep -v '^inert ' | awk '{print $2}')"
missed=""
for v in $forbidden; do
  grep -qx "$v" "$TMP/seen-env" && missed="$missed $v"
done
if [ -n "$forbidden" ]; then
  if [ -z "$missed" ]; then
    pass "#1c BUG-055: every name in the harness's own FORBIDDEN_ENV is scrubbed before the runner starts"
  else
    fail "#1c BUG-055: these forbidden names reached the runner:$missed"
  fi
else
  fail "#1c BUG-055/BUG-063: could not read the forbidden set from tests/harness/env.ts — this check would pass over nothing"
fi
fi

# The stage must also actually RENDER, not merely run.
if grep -q 'demo' "$TMP/out"; then
  pass "#1b BUG-055: the declared suite renders as its own stage"
else
  fail "#1b BUG-055: the suite ran but produced no stage line: $(cat "$TMP/out")"
fi

# ===========================================================================
# 1d. BUG-055 — THE DEFECT ITSELF: a non-zero declared-suites status, under
#     `set -e`, must not kill the caller.
#
#     This is what actually refused the founder's push. bp_suites_with_spec
#     returned 1 with a correct four-suite list, the caller's unprotected
#     `_ts_expect="$(…)"` inherited that status, and `set -e` destroyed the
#     hook between two statements — no stage, no skip, no summary, no error,
#     and a push refused with nothing to read. Eight pushes to find, because
#     the failure rendered as an absence.
#
#     The assertion is deliberately about the CONSEQUENCE (the stage still
#     reports) rather than about how the status is masked, so a future rewrite
#     of the masking cannot pass this by accident.
# ===========================================================================
#     The status is INJECTED rather than coaxed out of the manifest parser.
#     Reproducing it through a fixture manifest depends on which row happens to
#     sort last and on internals of bp_suites_with_spec — so it would silently
#     stop reproducing the moment either changed, and the case would go green
#     while guarding nothing. What the bridge must survive is a non-zero status
#     from that call, whatever produces it. So the case says exactly that.
make_npx 0
rm -f "$TMP/seen-env"
( cd "$W"
  export PATH="$W/bin:$PATH"
  set -e
  . ./scripts/lib/pipeline.sh
  pipe_init "hostile-status fixture" >/dev/null 2>&1 || true
  . ./scripts/run-ts-suites.sh
  # A correct list, and a failing status. Precisely what the real manifest
  # parser handed the gate: rc=1 alongside four valid suite names.
  ts_declared_suites(){ printf 'demo\n'; return 1; }
  ts_suites_stage "$W"
) >"$TMP/out" 2>&1
hostile_rc=$?

if grep -q 'demo' "$TMP/out"; then
  pass "#1d BUG-055: a declared-suites call returning non-zero with a good list does not abort the stage under set -e (rc=$hostile_rc)"
else
  fail "#1d BUG-055: the stage did not survive a non-zero declared-suites status — the exact silent death that refused the push. Output was: [$(cat "$TMP/out")]"
fi

# ===========================================================================
# 2. BUG-055 — a FAILING runner must be visible, not silent.
#
#    This is the half that cost the diagnosis. Under `set -e` the old form
#    aborted the caller before the status could be read, so the gate's output
#    simply stopped and the push was refused with nothing to go on.
# ===========================================================================
make_npx 1
rm -f "$TMP/seen-env"
# NOT `run_bridge || true`. A `|| true` here would put the whole function in a
# tested context, which disables `set -e` for everything inside it — and `set
# -e` is the mechanism under test. Written that way first, and case 2 then
# passed against the unfixed bridge, i.e. asserted nothing.
run_bridge
brc=$?

if [ ! -s "$TMP/out" ]; then
  fail "#2 BUG-055: the runner failed and the bridge printed NOTHING — a broken run is indistinguishable from a stage that does not exist, which is exactly what made this bug cost a session"
else
  pass "#2 BUG-055: a failing runner still produces output rather than silence"
fi

if grep -qi 'vitest failed' "$TMP/out"; then
  pass "#2b BUG-055: the output names the runner failure and its status"
else
  fail "#2b BUG-055: the run failed but nothing said so — got: $(cat "$TMP/out")"
fi

# The stage must still REACH its reconciliation. Under the old form `set -e`
# aborted the caller at the failing subshell, so pipe_batch_end never ran and
# the gate simply stopped printing — which is how this presented: a push
# refused with the stage list truncated mid-way and no error anywhere.
if grep -q 'demo' "$TMP/out"; then
  pass "#2c BUG-055: a failing runner still reaches per-suite reporting (rc=$brc) rather than aborting the gate mid-list"
else
  fail "#2c BUG-055: the bridge aborted before reporting any suite — this is the silent truncation that made a refused push unexplainable: $(cat "$TMP/out")"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: BUG-055 — the vitest bridge scrubs git's environment and reports its own failures."
  exit 0
fi
echo "FAILED: see the FAIL lines above."
exit 1
