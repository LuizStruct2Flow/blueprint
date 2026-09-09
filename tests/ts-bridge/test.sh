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
printf 'GIT_DIR=[%s]\n' "\${GIT_DIR:-}" > "$TMP/seen-env"
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

run_bridge(){ # runs the stage in a fixture, with GIT_DIR deliberately set
  ( cd "$W"
    export PATH="$W/bin:$PATH"
    export GIT_DIR="$W/.git-decoy"
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

if [ ! -f "$TMP/seen-env" ]; then
  fail "#1 BUG-055: the runner was never invoked at all — output was: $(cat "$TMP/out")"
elif grep -q 'GIT_DIR=\[\]' "$TMP/seen-env"; then
  pass "#1 BUG-055: the runner is invoked with GIT_DIR scrubbed, so the harness guard does not refuse under a real push"
else
  fail "#1 BUG-055: the runner inherited $(grep GIT_DIR "$TMP/seen-env") — under a real 'git push' git sets GIT_DIR, the harness refuses every scenario, and the whole TS stage fails while passing by hand"
fi

# The stage must also actually RENDER, not merely run.
if grep -q 'demo' "$TMP/out"; then
  pass "#1b BUG-055: the declared suite renders as its own stage"
else
  fail "#1b BUG-055: the suite ran but produced no stage line: $(cat "$TMP/out")"
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
