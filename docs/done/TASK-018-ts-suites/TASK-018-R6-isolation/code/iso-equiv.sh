#!/bin/bash
# TASK-018 / R6 NEGATIVE PROOF for the ISOLATION group.
#
# Adapted from .scratch/elias-equiv.sh (Christian). Same three guarantees, and
# they are the whole point:
#
#   * `sub` is a LITERAL substitution that EXITS NON-ZERO when its target text is
#     absent. A mutant that does not apply produces "everything green", which
#     reads identically to "nothing covers this".
#   * `build_tree` rsyncs the live working tree (the ports are uncommitted) and
#     gives the copy its OWN one-commit history, so "what did this mutant do" is
#     answerable as `git status --porcelain` + any commit it made — asked of the
#     tree's own git, never of a hand-written list of files.
#   * A mutant that changed nothing, and a run that FAILS with an empty red set,
#     are both refused a verdict.
#
# WHAT IS DIFFERENT FROM elias-equiv. That harness compares shell-vs-port verdict
# SETS. This one asks the narrower R6 question: for each `it(...)` in a spec, is
# there a perturbation that turns it red? So there is one implementation per run
# and the recorded output is the OBSERVED RED SET of full `it()` titles — never a
# predicted one, and never collapsed to the leading `#N` token, because that
# collapse IS the assertion-GROUP reporting this run exists to replace.
#
# Usage:
#   bash .scratch/iso-equiv.sh --list
#   bash .scratch/iso-equiv.sh <mutant> [...]
#   bash .scratch/iso-equiv.sh --all
set -u

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
OUT="${ISO_OUT:-$SRC/.scratch/iso-equiv-out}"

# Run vitest FROM tests/, never the repo root: there is no config there and
# npx would then fetch an unpinned vitest, which reads as a pass. AGENT_PERSONA
# is unset because the harness refuses to run with it set (BUG-046) — a persona
# labels the feed, not the runner.
run_vitest() { # $1 = tree, $2 = suite, rest = vitest args
  local tree="$1" suite="$2"
  shift 2
  ( cd "$tree/tests" && unset AGENT_PERSONA && exec npx vitest run "$suite" "$@" )
}
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

GI_REL="tests/git-isolation/git-isolation.ts"
EN_REL="tests/env-namespace/env-namespace.ts"
SD_REL="tests/state-dir/state-dir.ts"
DL_REL="tests/doc-links/doc-links.ts"
LD_REL="tests/lifecycle-docs/lifecycle-docs.ts"
CS_REL="tests/commit-subjects/commit-subjects.ts"
PC_HELPER="tests/helpers/proc-cwd.sh"
SDL_REL="scripts/lib/state-dir.sh"

# ===========================================================================
# MUTANTS. `apply_<name> TREE`; `SUITE_<name>` names the suite to run.
# `CONTROL_<name>=1` marks a tree that is deliberately NOT a defect.
# `PREENV_<name>` is exported into the vitest process — needed only where the
# defect is an INHERITED variable, which by construction cannot be injected into
# a file.
# ===========================================================================

# --- git-isolation ---------------------------------------------------------
SUITE_GI1="git-isolation"
apply_GI1() { # BUG-014 VERBATIM — an execution anchor loses its unset line, so
  # its fixture's commit lands in the repository GIT_DIR points at.
  sub "$1/tests/marker-merge/test.sh" 'unset GIT_DIR' '# unset GIT_DIR'
}

SUITE_GI2="git-isolation"
apply_GI2() { # layer one of the fix is gone — the hook stops stripping at source.
  sub "$1/.githooks/pre-push" 'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY' \
                              '# unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY'
}

SUITE_GI3="git-isolation"
apply_GI3() { # a real suite gains a second runner that drives git nakedly.
  printf '#!/bin/sh\ngit init -q "$1"\n' > "$1/tests/marker-merge/naked-extra.sh"
}

SUITE_GI4="git-isolation"
apply_GI4() { # THE BUG-047 DEFECT VERBATIM — discovery narrows back to the one
  # spelling `git init`, so `git -C … init` and the bootstrap arm both vanish.
  sub "$1/$GI_REL" \
    'const DRIVES_GIT = /(^|[^A-Za-z0-9_./-])(git|new-project\.sh)([ \t]|$)/m' \
    'const DRIVES_GIT = /git init/m'
}

SUITE_GI5="git-isolation"
apply_GI5() { # THE OTHER HALF OF BUG-047 — comments stop being stripped, so
  # membership of a safety control is decided by what prose SAYS.
  sub "$1/$GI_REL" "    .map((line) => line.replace(/#.*/, ''))$NL" ''
}

SUITE_GI6="git-isolation"
apply_GI6() { # the unset predicate accepts any mention of the variable, so a
  # commented-out unset counts as a defence.
  sub "$1/$GI_REL" 'const UNSETS_GIT_DIR = /unset(?:[ \t]+[A-Z_]+)*[ \t]+GIT_DIR/' \
                   'const UNSETS_GIT_DIR = /GIT_DIR/'
}

SUITE_GI7="git-isolation"
apply_GI7() { # a hook that is not there is shrugged at instead of failing closed.
  sub "$1/$GI_REL" "  } catch {$NL    return false$NL  }" "  } catch {$NL    return true$NL  }"
}

SUITE_GI8="git-isolation"
apply_GI8() { # the glob narrows to test.sh, so a SECOND runner in a suite folder
  # (staleness/drift-integration.sh is a real one) is free to corrupt a repo.
  sub "$1/$GI_REL" "      if (!name.endsWith('.sh')) continue" \
                   "      if (name !== 'test.sh') continue"
}

SUITE_GI9="git-isolation"
apply_GI9() { # an anchor's runner is DELETED with no spec in its place — the
  # silent coverage cut #1's absent-runner branch exists to surface. BOTH files
  # go: deleting only `test.sh` is the legitimate RETIREMENT the branch is
  # written to accept, and a first run of this mutant did exactly that and
  # passed, correctly.
  rm -f "$1/tests/gate-arming/test.sh" "$1/tests/gate-arming/gate-arming.spec.ts"
}

SUITE_GI13="git-isolation"
apply_GI13() { # the THIRD anchor loses its unset line. One mutant per anchor,
  # because `it.each` makes each anchor its own case and a red on one says
  # nothing about the others.
  sub "$1/tests/commit-subjects/test.sh" 'unset GIT_DIR' '# unset GIT_DIR'
}

SUITE_GI12="git-isolation"
apply_GI12() { # the unset predicate is satisfied by ANY file, so a suite that
  # never defends itself is never named — the finding half of #3 goes silent.
  sub "$1/$GI_REL" 'const UNSETS_GIT_DIR = /unset(?:[ \t]+[A-Z_]+)*[ \t]+GIT_DIR/' \
                   'const UNSETS_GIT_DIR = /(?:)/'
}

SUITE_GI10="git-isolation"; CONTROL_GI10=1
apply_GI10() { :; } # NEGATIVE CONTROL — the healthy tree.

SUITE_GI11="git-isolation"
apply_GI11() { # the anchor LIST stops being intersected with disk, so the
  # population half of #3 can no longer bite.
  sub "$1/$GI_REL" "export const DECLARED_ANCHORS = ['marker-merge', 'gate-arming', 'commit-subjects'] as const" \
                   "export const DECLARED_ANCHORS = [] as const"
}

# --- proc-cwd --------------------------------------------------------------
SUITE_PC1="proc-cwd"
apply_PC1() { # BUG-036 VERBATIM — the lookup answers nothing on every host. This
  # is the mutant the spec's own header records having run.
  sub "$1/$PC_HELPER" "bp_proc_cwd() {$NL" "bp_proc_cwd() {${NL}  return 0$NL"
}

SUITE_PC2="proc-cwd"
apply_PC2() { # the availability probe says NO on a host that has procfs — the
  # suites that must refuse to run vacuously would now refuse always.
  sub "$1/$PC_HELPER" "bp_proc_cwd_available() {$NL" \
                      "bp_proc_cwd_available() {${NL}  return 1$NL"
}

SUITE_PC3="proc-cwd"
apply_PC3() { # THE FAIL-OPEN — "cannot determine" becomes the CALLER's cwd
  # instead of empty. Live pids still resolve through procfs, so this is visible
  # only on the dead-pid path, which is the one callers turn into "mine".
  #
  # INJECTED AFTER THE PROCFS ARM, NOT AT THE TAIL. The first version put it in
  # the "no mechanism" fallback at the bottom and the mutant PASSED — this host
  # has lsof, so that line is unreachable and the tree was defective nowhere.
  # Exactly trap #2: a mutant that applies, changes the file, and cannot be
  # observed.
  sub "$1/$PC_HELPER" '  if command -v lsof >/dev/null 2>&1; then' \
                      "  pwd${NL}  return 0${NL}  if command -v lsof >/dev/null 2>&1; then"
}

SUITE_PC4="proc-cwd"
apply_PC4() { # an empty pid becomes an ERROR rather than a no-op, so every
  # caller under `set -e` dies on a pid it has not started yet.
  sub "$1/$PC_HELPER" '  [ -n "${_bpc_pid:-}" ] || return 0' \
                      '  [ -n "${_bpc_pid:-}" ] || return 1'
}

SUITE_PC5="proc-cwd"
PREENV_PC5=1
apply_PC5() { # BUG-047's MECHANISM AT THE HARNESS SEAM — GIT_DIR stops being a
  # declared variable, so it is neither scrubbed from a child nor refused in the
  # test process, and the ambient value reaches every fixture. The variable has
  # to be SET for the defect to be observable at all, which is why this mutant
  # carries a PREENV: a scrub cannot be caught scrubbing nothing.
  sub "$1/tests/harness/env.ts" "  GIT_DIR: 'path',$NL" ''
  # AND the belt-and-braces afterEach that names GIT_DIR explicitly. Removing
  # only the declaration left EVERY case red — the global afterEach fired on all
  # ten — which is assertion-GROUP noise rather than negative proof for #6. Both
  # halves are one defect ("the harness stops noticing the variable"), and with
  # both gone the red set is what #6 itself observes.
  sub "$1/tests/harness/index.ts" \
    "afterEach(() => {$NL  expect($NL    process.env.GIT_DIR," \
    "afterEach(() => {$NL  expect($NL    undefined,"
  git -C "$1" init -q --bare "$1/victim.git"
}
PREENV_VAL_PC5() { printf 'GIT_DIR=%s/victim.git\n' "$1"; }

SUITE_PC6="proc-cwd"
apply_PC6() { # the baton handed to children stops being the one the scenario
  # itself reads — a fixture's flips land in a file nothing asserts on.
  sub "$1/tests/harness/index.ts" '    AGENT_SIGNAL_FILE: s.signalFile,' \
                                  '    AGENT_SIGNAL_FILE: join(s.home, "signal.md"),'
}

SUITE_PC7="proc-cwd"
PREENV_PC7=1
apply_PC7() { # BUG-036's OWN MECHANISM — the workspace root stops being
  # resolved, so every path derived from it carries a symlinked prefix and
  # compares unequal to what a real process reports. Reproduced on Linux by
  # pointing TMPDIR at a symlink, which is what /var/folders is on macOS.
  sub "$1/tests/harness/workspace.ts" '  const base = await realpath(tmpdir())' \
                                      '  const base = tmpdir()'
  mkdir -p "$1/tmpreal"
  ln -sfn "$1/tmpreal" "$1/tmplink"
}
PREENV_VAL_PC7() { printf 'TMPDIR=%s/tmplink\n' "$1"; }

SUITE_PC8="proc-cwd"; CONTROL_PC8=1
apply_PC8() { :; } # NEGATIVE CONTROL.

# --- env-namespace ---------------------------------------------------------
SUITE_EN1="env-namespace"
apply_EN1() { # the namespace check admits everything — BUG-006 walks straight in.
  sub "$1/$EN_REL" '  /^(AGENT_|BP_|BLUEPRINT_|GIT_|SIGNAL_|CODEX_' '  /^(|AGENT_|BP_|BLUEPRINT_|GIT_|SIGNAL_|CODEX_'
}

SUITE_EN2="env-namespace"
apply_EN2() { # the extractor stops requiring a DEFAULT, so every ALL-CAPS token
  # is treated as configuration — sixty false positives, which is the shape the
  # file's own header says gets a guard deleted rather than obeyed.
  sub "$1/$EN_REL" '/\$\{([A-Z][A-Z0-9_]{3,}):[-=]/g' '/([A-Z][A-Z0-9_]{3,})/g'
}

SUITE_EN3="env-namespace"
apply_EN3() { # comments stop being stripped, so an INCIDENT RECORD naming the
  # old variable is reported as a live namespace.
  sub "$1/$EN_REL" "    .map((line) => line.replace(/#.*/, ''))$NL" ''
}

SUITE_EN4="env-namespace"
apply_EN4() { # the back-compat exemption goes — a project that set the old name
  # can no longer be carried forward at all.
  sub "$1/$EN_REL" '    if (/(AGENT_[A-Z_]+:-\$\{LWA_|:=\$\{LWA_)/.test(line)) continue' \
                   '    if (false) continue'
}

SUITE_EN5="env-namespace"
apply_EN5() { # the LWA_ primary-read check is blind — the original regression
  # ships again.
  sub "$1/$EN_REL" "export function readsLwaAsPrimary(source: string): boolean {$NL" \
                   "export function readsLwaAsPrimary(source: string): boolean {${NL}  return false$NL"
}

SUITE_EN6="env-namespace"
apply_EN6() { # the rotation check always passes — a second copy of the appender
  # is invisible.
  sub "$1/$EN_REL" "export async function checkRotationIsShared(root: string): Promise<string | null> {$NL" \
                   "export async function checkRotationIsShared(root: string): Promise<string | null> {${NL}  return null$NL"
}

SUITE_EN7="env-namespace"
apply_EN7() { # the population is judged over nothing — `checked` stays 0 while
  # the scan still reports "all clean". BUG-005's vacuity, exactly.
  sub "$1/$EN_REL" '    if (!isScannedManagedFile(rel)) continue' '    continue'
}

SUITE_EN8="env-namespace"
apply_EN8() { # THE REAL REPOSITORY carries the defect: a managed script that
  # travels grows a project-specific knob.
  sub "$1/scripts/log-activity.sh" '#!/usr/bin/env bash' \
                                   "#!/usr/bin/env bash${NL}: \"\${LWA_FEED_MAX_LINES:=2000}\""
}

SUITE_EN10="env-namespace"
apply_EN10() { # the non-vacuity NUMBER stops measuring the population, so
  # "discovery found nothing" and "all clean" become indistinguishable — which
  # is the exact distinction the floor case exists to draw.
  sub "$1/$EN_REL" '    checked++' '    checked += 100'
}

SUITE_EN9="env-namespace"; CONTROL_EN9=1
apply_EN9() { :; } # NEGATIVE CONTROL.

# --- doc-links -------------------------------------------------------------
SUITE_DL1="doc-links"
apply_DL1() { # the resolve check always succeeds — every broken link resolves.
  sub "$1/$DL_REL" '        await stat(resolve(dirname(file), target))' '        void target'
}

SUITE_DL2="doc-links"
apply_DL2() { # fenced blocks stop being stripped, so EXAMPLES are checked as
  # links — the shape that makes a guard noisy enough to be ignored.
  sub "$1/$DL_REL" "    if (inFence) continue$NL" ''
}

SUITE_DL3="doc-links"
apply_DL3() { # inline code spans stop being stripped — prose ABOUT a link is
  # reported as a link.
  sub "$1/$DL_REL" "    out.push(line.replace(/\`[^\`]*\`/g, ''))" '    out.push(line)'
}

SUITE_DL4="doc-links"
apply_DL4() { # http/mailto/autolink targets are treated as filesystem paths.
  sub "$1/$DL_REL" "      if (/^(https?|mailto:|<)/.test(raw) || raw.startsWith('http')) continue" \
                   '      if (false) continue'
}

SUITE_DL5="doc-links"
apply_DL5() { # the anchor SUFFIX stops being dropped, so `x.md#sec` never
  # resolves and every anchored link is reported.
  sub "$1/$DL_REL" "      const withoutAnchor = raw.split('#')[0] ?? ''" \
                   '      const withoutAnchor = raw'
}

SUITE_DL6="doc-links"
apply_DL6() { # a link resolves against the DOCS ROOT rather than its own
  # directory — every link in a nested folder breaks.
  sub "$1/$DL_REL" '        await stat(resolve(dirname(file), target))' \
                   '        await stat(resolve(docsDir, target))'
}

SUITE_DL7="doc-links"
apply_DL7() { # the `examined` count is fabricated — the non-vacuity number stops
  # measuring the population.
  sub "$1/$DL_REL" '      examined++' '      examined += 1000'
}

SUITE_DL8="doc-links"
apply_DL8() { # THE REAL TREE carries a broken link, the way every lifecycle move
  # leaves one behind.
  printf '\n[a link that moved](./NO-SUCH-FILE-iso-audit.md)\n' >> "$1/docs/DoD.md"
}

SUITE_DL10="doc-links"
apply_DL10() { # a DIRECTORY target stops resolving. A multi-file work item is a
  # folder and linking to it is the documented form, so this reports every one of
  # them as broken — a guard that calls the convention a defect.
  sub "$1/$DL_REL" '        await stat(resolve(dirname(file), target))' \
                   '        if (!(await stat(resolve(dirname(file), target))).isFile()) throw new Error("x")'
}

SUITE_DL9="doc-links"; CONTROL_DL9=1
apply_DL9() { :; } # NEGATIVE CONTROL.

# --- lifecycle-docs --------------------------------------------------------
SUITE_LD1="lifecycle-docs"
apply_LD1() { # the record-file set narrows, so a row in BACKLOG.md or CHANGES.md
  # stops counting as a record and every such artefact reads as an orphan.
  sub "$1/$LD_REL" "const RECORD_FILES = ['BUGS.md', 'BACKLOG.md', 'CHANGES.md']" \
                   "const RECORD_FILES = ['BUGS.md']"
}

SUITE_LD2="lifecycle-docs"
apply_LD2() { # THE REAL TREE — a bug number with commits and no row anywhere,
  # which is BUG-086's own shape.
  git -C "$1" -c user.email=e@l -c user.name=E -c commit.gpgsign=false \
    commit -q --allow-empty -m "BUG#994: a bug with commits and no row" --no-verify
}

SUITE_LD3="lifecycle-docs"
apply_LD3() { # the rowless-bug scan is blind — BUG-086 is reintroduced.
  sub "$1/$LD_REL" '  const committed = new Set<string>()' \
                   "  const committed = new Set<string>()${NL}  return []"
}

SUITE_LD6="lifecycle-docs"
apply_LD6() { # a MENTION in prose is accepted as a row, so a bug named only in a
  # paragraph reads as recorded — the distinction #6's second case draws.
  sub "$1/$LD_REL" '      const m = /^\| \*\*(BUG-[0-9]+)\*\*/.exec(line)' \
                   '      const m = /(BUG-[0-9]+)/.exec(line)'
}

SUITE_LD4="lifecycle-docs"
apply_LD4() { # THE REAL TREE — an artefact folder whose row did not travel.
  mkdir -p "$1/docs/waiting-acceptance/BUG-993-iso-audit"
  printf '# BUG-993\n' > "$1/docs/waiting-acceptance/BUG-993-iso-audit/PLAN.md"
}

SUITE_LD7="lifecycle-docs"
apply_LD7() { # every artefact is treated as recorded — the orphan half goes
  # blind, which is the state the folders were in when the lcm pass ran by hand.
  sub "$1/$LD_REL" "  const rows = await readOrEmpty(join(docsDir, state, 'BUGS.md'))" \
                   "  return true${NL}  const rows = await readOrEmpty(join(docsDir, state, 'BUGS.md'))"
}

SUITE_LD8="lifecycle-docs"
apply_LD8() { # the ACCEPTANCE write-up stops counting as a record, so a
  # historical item accepted before BUGS.md existed reads as an orphan — which
  # forces either a fabricated row or a weakened check.
  sub "$1/$LD_REL" "    if (!name.startsWith('ACCEPTANCE-') || !name.endsWith('.md')) continue" \
                   '    continue'
}

SUITE_LD9="lifecycle-docs"
apply_LD9() { # a row of nothing but pipes stops being a phantom — a table
  # claiming a parked item that does not exist passes.
  sub "$1/$LD_REL" '      if (/^\|([ \t]*\|)+[ \t]*$/.test(line) && !phantomRows.includes(file)) {' \
                   '      if (false) {'
}

SUITE_LD10="lifecycle-docs"
apply_LD10() { # the phantom-row test swallows the |---|---| SEPARATOR, so every
  # well-formed table in the repository is reported.
  sub "$1/$LD_REL" '      if (/^\|([ \t]*\|)+[ \t]*$/.test(line) && !phantomRows.includes(file)) {' \
                   '      if (/^\|[-| \t]*$/.test(line) && !phantomRows.includes(file)) {'
}

SUITE_LD11="lifecycle-docs"
apply_LD11() { # any "*(Empty" line is called a forwarding note, so the CORRECT
  # form is flagged — a guard that reports the thing it asks for.
  sub "$1/$LD_REL" '        /(BUG|FEATURE|TASK|SPIKE|SLICE)-[0-9]+/.test(line) &&' ''
}

SUITE_LD12="lifecycle-docs"
apply_LD12() { # a state folder with no BUGS.md stops being skipped, so a
  # bootstrapped project with fewer states reports every artefact as an orphan.
  sub "$1/$LD_REL" "    if ((await readOrEmpty(join(docsDir, state, 'BUGS.md'))) === '') continue" \
                   '    if (false) continue'
}

SUITE_LD13="lifecycle-docs"
apply_LD13() { # the non-vacuity number stops counting, so "examined nothing" and
  # "examined everything and found nothing" become the same verdict.
  sub "$1/$LD_REL" "      checked++$NL" ''
}

SUITE_LD14="lifecycle-docs"
apply_LD14() { # …and the mirror image: the count is non-zero over a tree with
  # nothing in it, so the vacuous pass stops being visible AS vacuous.
  sub "$1/$LD_REL" '  let checked = 0' '  let checked = 1'
}

SUITE_LD5="lifecycle-docs"; CONTROL_LD5=1
apply_LD5() { :; } # NEGATIVE CONTROL.

# --- commit-subjects -------------------------------------------------------
SUITE_CS1="commit-subjects"
apply_CS1() { # THE SHARED RULE IS GONE — the hook and the checker lose their one
  # definition, which is what MUST_TRAVEL exists to prevent.
  rm -f "$1/scripts/lib/commit-subject.sh"
}

SUITE_CS2="commit-subjects"
apply_CS2() { # the rule admits the Conventional-Commits form again — `5fe89e0`'s
  # actual subject passes.
  sub "$1/scripts/lib/commit-subject.sh" 'commit_subject_ok() {' \
                                         "commit_subject_ok() {${NL}  return 0"
}

SUITE_CS4="commit-subjects"
apply_CS4() { # a missing rule library reports a PASS. Its case lives HERE rather
  # than in commit-msg-gate: that suite's own R6 case rewrites the same branch,
  # so the shipped `exit 1` is unobservable there (measured — mutant CM8 applied,
  # changed the hook, and turned nothing red).
  sub "$1/.githooks/commit-msg" "  echo \"  Restore it with: blueprint pull scripts/lib/commit-subject.sh\" >&2${NL}  exit 1" \
                                "  echo \"  Restore it with: blueprint pull scripts/lib/commit-subject.sh\" >&2${NL}  exit 0"
}

SUITE_CS5="commit-subjects"
apply_CS5() { # the merge/revert/fixup exemptions go — git's own generated
  # messages become uncommittable.
  sub "$1/scripts/lib/commit-subject.sh" 'commit_subject_ok() {' \
                                         "commit_subject_ok() {${NL}  return 1"
}

SUITE_CS6="commit-subjects"
apply_CS6() { # the CI checker stops failing closed on no input / an empty range /
  # an unknown mode — "checked nothing" renders as "checked and clean".
  sub "$1/scripts/check-commit-subjects.sh" "set -u${NL}" "set -u${NL}exit 0${NL}"
}

SUITE_CS7="commit-subjects"
apply_CS7() { # the hook grows its OWN copy of the pattern, which is the second
  # definition the whole suite exists to forbid: two rules that pass their own
  # tests while disagreeing about a real commit.
  sub "$1/.githooks/commit-msg" 'if commit_subject_ok "$subject"; then' \
                                "if printf '%s' \"\$subject\" | grep -qE '^(BUG|FEATURE|TASK)#[0-9]+: .+'; then"
}

SUITE_CS3="commit-subjects"; CONTROL_CS3=1
apply_CS3() { :; } # NEGATIVE CONTROL.

# --- commit-msg-gate -------------------------------------------------------
SUITE_CM1="commit-msg-gate"
apply_CM1() { # the hook loses its exec bit — git silently ignores it, which is
  # the BUG-008 shape and the reason #0 is a case at all.
  chmod -x "$1/.githooks/commit-msg"
}

SUITE_CM2="commit-msg-gate"
apply_CM2() { # the hook accepts everything. The first version replaced the bare
  # token `commit_subject_ok`, which left `if true # "$subject"; then` — a SYNTAX
  # ERROR, so the hook rejected everything instead. That is a different defect
  # wearing this one's name, and it showed up as the ACCEPTS cases going red.
  sub "$1/.githooks/commit-msg" 'if commit_subject_ok "$subject"; then' 'if true; then'
}

SUITE_CM4="commit-msg-gate"
apply_CM4() { # the gate stops FAILING CLOSED on an input it cannot read — "could
  # not check" renders as "passed", which is the lesson BUG-018 taught twice.
  sub "$1/.githooks/commit-msg" 'if [ -z "$msg_file" ] || [ ! -r "$msg_file" ]; then' \
                                'if false; then'
}

SUITE_CM5="commit-msg-gate"
apply_CM5() { # an empty message is accepted. It is not redundant with CM4: the
  # no-argument path is defended TWICE and only removing both opens it, which the
  # spec has a case for.
  sub "$1/.githooks/commit-msg" 'if [ -z "$subject" ]; then' 'if false; then'
}

SUITE_CM6="commit-msg-gate"
apply_CM6() { # git's comment template stops being skipped, so the subject the
  # gate judges is the template's first line rather than the author's.
  sub "$1/.githooks/commit-msg" "subject=\"\$(grep -vE '^\\s*#' \"\$msg_file\" | grep -vE '^[[:space:]]*\$' | head -1)\"" \
                                "subject=\"\$(head -1 \"\$msg_file\")\""
}

SUITE_CM7="commit-msg-gate"
apply_CM7() { # the ROOT-COMMIT exemption widens to every commit — the hook
  # checks nothing in any repository that has a HEAD.
  sub "$1/.githooks/commit-msg" 'if ! git rev-parse --verify -q HEAD >/dev/null 2>&1; then' \
                                'if true; then'
}

SUITE_CM8="commit-msg-gate"
apply_CM8() { # a missing rule library reports a PASS — the hook loads no rule and
  # says the subject is fine.
  sub "$1/.githooks/commit-msg" "  echo \"  Restore it with: blueprint pull scripts/lib/commit-subject.sh\" >&2${NL}  exit 1" \
                                "  echo \"  Restore it with: blueprint pull scripts/lib/commit-subject.sh\" >&2${NL}  exit 0"
}

SUITE_CM9="commit-msg-gate"
apply_CM9() { # THE GATE FAILS OPEN ON EVERY PATH. Three edits, and that is the
  # finding rather than sloppiness: the no-argument path is defended THREE times
  # over — the readability guard, the empty-subject guard, and the rule itself
  # refusing "" — so NO single-edit mutant isolates `#3 FAILS CLOSED on a missing
  # argument`, `#3 FAILS CLOSED on an unreadable message file` or `#3 an empty
  # message … is rejected`. Measured one edit at a time first: each of CM4 and
  # CM5 alone turned only `#3 the no-argument path is defended TWICE` red, which
  # is the case written to say exactly this. Same shape as suite-sync #7-bare.
  sub "$1/.githooks/commit-msg" 'if [ -z "$msg_file" ] || [ ! -r "$msg_file" ]; then' 'if false; then'
  sub "$1/.githooks/commit-msg" 'if [ -z "$subject" ]; then' 'if false; then'
  sub "$1/.githooks/commit-msg" 'if commit_subject_ok "$subject"; then' 'if true; then'
}

SUITE_CM10="commit-msg-gate"
apply_CM10() { # FIXTURE PERTURBATION — `#4 … a repo WITHOUT it is ungated`
  # asserts the ABSENCE of enforcement, which is a property of git: no mutation
  # of this repository can make git run a hook that is not wired. So the fixture
  # gains the wiring it exists to lack, and the case must notice.
  sub "$1/tests/commit-msg-gate/commit-msg-gate.spec.ts" \
    "      await s.fs.write(join('repo', 'g.txt'), 'y\\n')${NL}      await s.run('git', ['add', '-A'], { cwd: repo.dir })" \
    "      await s.fs.write(join('repo', 'g.txt'), 'y\\n')${NL}      await s.run('git', ['config', 'core.hooksPath', '.githooks'], { cwd: repo.dir })${NL}      await s.run('git', ['add', '-A'], { cwd: repo.dir })"
}

SUITE_CM11="commit-msg-gate"
apply_CM11() { # the rule rejects EVERYTHING, exemptions included — the gate that
  # blocks every commit, which is how a gate gets turned off for good.
  sub "$1/scripts/lib/commit-subject.sh" 'commit_subject_ok() {' \
                                         "commit_subject_ok() {${NL}  return 1"
}

SUITE_CM12="commit-msg-gate"
apply_CM12() { # the hook stops CHECKING that its rule library is loadable. The
  # R6 case for that branch anchors its own mutation on the refusal message, so
  # removing the guard makes `replaceOnce` throw — which is that helper doing
  # exactly its job: a mutant that silently applies to nothing is a green R6 case
  # proving the opposite of what it claims.
  sub "$1/.githooks/commit-msg" \
    "if [ ! -r \"\$_cs_lib\" ]; then${NL}  echo \"commit-msg: cannot read scripts/lib/commit-subject.sh — refusing.\" >&2${NL}  echo \"  Restore it with: blueprint pull scripts/lib/commit-subject.sh\" >&2${NL}  exit 1${NL}fi${NL}" \
    ''
}

SUITE_CM3="commit-msg-gate"; CONTROL_CM3=1
apply_CM3() { :; } # NEGATIVE CONTROL.

# --- state-dir -------------------------------------------------------------
SUITE_SD1="state-dir"
apply_SD1() { # A-09 VERBATIM — the named seam ignores the root it is handed, so
  # two different projects derive ONE directory.
  sub "$1/$SDL_REL" '  printf '"'"'%s\n'"'"' "${AGENT_STATE_HOME:-$1/logs/state}"' \
                    '  printf '"'"'%s\n'"'"' "${AGENT_STATE_HOME:-/tmp/one-shared-dir}"'
}

SUITE_SD2="state-dir"
apply_SD2() { # the deliberate override stops winning.
  sub "$1/$SDL_REL" '  printf '"'"'%s\n'"'"' "${AGENT_STATE_HOME:-$1/logs/state}"' \
                    '  printf '"'"'%s\n'"'"' "$1/logs/state"'
}

SUITE_SD3="state-dir"
apply_SD3() { # the seam DERIVES FROM NOTHING rather than refusing an empty root
  # — the `/gemini-runs.log` at the filesystem root this lib's header names.
  sub "$1/$SDL_REL" '  [ -n "$1" ] || { echo "agent_state_dir_for: root is empty" >&2; return 2; }' \
                    '  :'
}

SUITE_SD4="state-dir"
apply_SD4() { # the placeholder scan is blind — a dispatcher building its state
  # path from the never-substituted bootstrap literal is invisible.
  sub "$1/$SD_REL" "export async function scanStateDir(root: string): Promise<StateDirScan> {$NL" \
                   "export async function scanStateDir(root: string): Promise<StateDirScan> {${NL}  const _iso = true; void _iso;$NL"
  sub "$1/$SD_REL" 'const ARTEFACT = /runs\.log|signal\.log|last-message\.md/' \
                   'const ARTEFACT = /$^/'
}

SUITE_SD5="state-dir"
apply_SD5() { # the physical-root block stops being compared, so a consumer whose
  # copy has DRIFTED is not named.
  sub "$1/$SD_REL" "export function physicalRootBlock(source: string): string | null {$NL" \
                   "export function physicalRootBlock(source: string): string | null {${NL}  void source; return 'X'$NL"
}

SUITE_SD6="state-dir"
apply_SD6() { # the structural guard is blind to every defect shape it enumerates.
  sub "$1/$SD_REL" "export function structuralViolations(rel: string, source: string): string[] {$NL" \
                   "export function structuralViolations(rel: string, source: string): string[] {${NL}  void rel; void source; return []$NL"
}

SUITE_SD7="state-dir"
apply_SD7() { # a MISSING consumer is silently skipped rather than reported — the
  # one verdict difference the port's own equivalence run found.
  rm -f "$1/scripts/start-gemini-signal-watch.sh"
}

SUITE_SD9="state-dir"
apply_SD9() { # the non-vacuity flag stops measuring — a dispatcher set that names
  # NO artefact would be judged clean instead of refusing to judge (BUG-005).
  sub "$1/$SD_REL" '    if (NAMES_ARTEFACT.test(source)) sawAnyLogPath = true' \
                   '    sawAnyLogPath = true'
}

SUITE_SD10="state-dir"
apply_SD10() { # a MISSING dispatcher is silently skipped rather than reported —
  # the one verdict difference the port's own equivalence run found and fixed.
  sub "$1/$SD_REL" '    missingDispatchers: DISPATCHERS.filter((rel) => !sources.has(rel)),' \
                   '    missingDispatchers: [],'
}

SUITE_SD11="state-dir"
apply_SD11() { # a consumer that does NOT source the shared helper is invisible,
  # so the two-implementations-that-agree-by-coincidence shape comes back.
  sub "$1/$SD_REL" "    if (!source.includes('lib/state-dir.sh')) notSourcingHelper.push(rel)" \
                   '    void rel'
}

SUITE_SD12="state-dir"
apply_SD12() { # A-09 REOPENED BEHAVIOURALLY — the launcher and the feed derive
  # different directories again, one under scripts/. Injected in the shipped
  # helper, so only the cases that RUN it can see it.
  sub "$1/$SDL_REL" '  printf '"'"'%s\n'"'"' "$BP_STATE_ROOT/logs/state"' \
                    '  printf '"'"'%s\n'"'"' "$BP_STATE_ROOT/scripts/logs/state"'
}

SUITE_SD13="state-dir"
apply_SD13() { # FIXTURE PERTURBATION, not a code defect — the shape M6/Q15 use.
  # #10c asserts that bash refuses a CYCLIC script file, which is a property of
  # the kernel: no mutation of this repository can falsify it. So the fixture's
  # second link is pointed at a real script instead, and the case must notice
  # that what it is holding is no longer a cycle.
  sub "$1/tests/state-dir/state-dir.spec.ts" \
    "await s.run('ln', ['-s', join(cyc, 'a.sh'), join(cyc, 'b.sh')], { cwd: s.workspace.root })" \
    "await s.fs.write(join('cyc', 'b.sh'), '#!/bin/sh\\necho ok\\n')"
}

SUITE_SD14="state-dir"
apply_SD14() { # FIXTURE PERTURBATION for the same reason — #6b asserts that the
  # DECOY is hostile, i.e. that `git rev-parse` under a foreign GIT_DIR really
  # does answer about the caller. Pointing the decoy at the repo itself removes
  # the hostility, and the case exists to notice exactly that.
  sub "$1/tests/state-dir/state-dir.spec.ts" \
    "{ cwd: join(REPO_ROOT, 'scripts'), env: { GIT_DIR: join(decoy.dir, '.git') } }," \
    "{ cwd: join(REPO_ROOT, 'scripts'), env: { GIT_DIR: join(REPO_ROOT, '.git') } },"
}

SUITE_SD8="state-dir"; CONTROL_SD8=1
apply_SD8() { :; } # NEGATIVE CONTROL.

ALL_MUTANTS="GI1 GI2 GI3 GI4 GI5 GI6 GI7 GI8 GI9 GI10 GI11 GI12 GI13 \
PC1 PC2 PC3 PC4 PC5 PC6 PC7 PC8 \
EN1 EN2 EN3 EN4 EN5 EN6 EN7 EN8 EN9 EN10 \
DL1 DL2 DL3 DL4 DL5 DL6 DL7 DL8 DL9 DL10 \
LD1 LD2 LD3 LD4 LD5 LD6 LD7 LD8 LD9 LD10 LD11 LD12 LD13 LD14 \
CS1 CS2 CS3 CS4 CS5 CS6 CS7 CM1 CM2 CM3 CM4 CM5 CM6 CM7 CM8 CM9 CM10 CM11 CM12 \
SD1 SD2 SD3 SD4 SD5 SD6 SD7 SD8 SD9 SD10 SD11 SD12 SD13 SD14"

case "${1:-}" in
  --list) printf '%s\n' $ALL_MUTANTS; exit 0 ;;
  --all)  set -- $ALL_MUTANTS ;;
esac

build_tree() { # $1 = dest
  local dest="$1"
  rsync -a \
    --exclude '.git/' --exclude 'tests/node_modules/' --exclude 'logs/' \
    --exclude '.scratch/' --exclude 'coverage/' \
    "$SRC/" "$dest/"
  ln -s "$SRC/tests/node_modules" "$dest/tests/node_modules"
  git -C "$dest" init -q -b main
  # `-f` IS LOAD-BEARING, and it is an apparatus defect found by measurement
  # rather than by reading (reported by the gate group, 2026-09-11). The real
  # repo TRACKS sixteen files that .gitignore also names — tracked beats ignored
  # there, and not in a fresh `init`. Without `-f` they never enter the baseline,
  # so `git status --porcelain` cannot see a mutation to them and the
  # CHANGED-NOTHING guard reports "changed nothing" over a rewritten file. Three
  # of the sixteen — CLAUDE.md, docs/DoD.md, AGENTS.md — are the actual SUBJECTS
  # of tests/doc-links and tests/lifecycle-docs.
  #   regenerate the list: git ls-files -i -c --exclude-standard
  git -C "$dest" -c user.email=e@l -c user.name=E -c commit.gpgsign=false add -A -f
  git -C "$dest" -c user.email=e@l -c user.name=E -c commit.gpgsign=false \
    commit -q -m "iso equivalence baseline" --no-verify
}

# THE ONE-COMMIT HISTORY IS NOT ENOUGH FOR lifecycle-docs, and finding that out
# is worth recording rather than patching silently: its REAL TREE case reads
# `git log --format=%s` in the tree the spec is running in, and asserts >50
# subjects as its OWN non-vacuity floor. Over a one-commit baseline that case
# went red on a PRISTINE copy — a harness artefact that would have read as a
# finding.
#
# $SRC/.git is NOT copied (Christian's reason holds: several agents commit into
# it and a copy can catch a torn index). The subjects are REPLAYED as empty
# commits instead, which is all the case reads.
seed_history() { # $1 = dest
  local dest="$1" msg
  git -C "$SRC" log --format=%s HEAD | tac | while IFS= read -r msg; do
    git -C "$dest" -c user.email=e@l -c user.name=E -c commit.gpgsign=false \
      commit -q --allow-empty --no-verify -m "$msg"
  done
}

# THE FULL it() TITLE of every red case. vitest's default reporter prints the
# nested path after `×`; keeping only the leading `#N` token would collapse the
# eleven `#3` cases in git-isolation into one, which is the assertion-GROUP
# reporting this run exists to replace.
ts_red() {
  sed -n 's/^[[:space:]]*×[[:space:]]*//p' \
    | sed 's/[[:space:]]*[0-9]*ms$//' \
    | sed 's/.*> //' \
    | LC_ALL=C sort -u
}

TREES=0
RUNS=0
INVALID=""

run_one() { # $1 = mutant
  local m="$1" tree suite rc ctl applied red pre base_commits
  eval "suite=\${SUITE_$m}"
  tree="$(mktemp -d "${TMPDIR:-/tmp}/iso-eq-$m-XXXXXX")"

  build_tree "$tree" >"$OUT/$m.build" 2>&1
  [ "$suite" = "lifecycle-docs" ] && seed_history "$tree" >>"$OUT/$m.build" 2>&1
  base_commits="$(git -C "$tree" rev-list --count HEAD)"

  if ! "apply_$m" "$tree" >>"$OUT/$m.build" 2>&1; then
    printf '%-6s *** MUTANT DID NOT APPLY — see %s\n' "$m" "$OUT/$m.build"
    INVALID="$INVALID $m"
    rm -rf "$tree"
    return 1
  fi

  eval "ctl=\${CONTROL_$m:-0}"
  applied=$(( $(git -C "$tree" status --porcelain | wc -l) \
            + $(git -C "$tree" rev-list --count HEAD) - base_commits ))
  if [ "$ctl" -eq 0 ] && [ "$applied" -eq 0 ]; then
    printf '%-6s *** MUTANT CHANGED NOTHING — verdict would be meaningless\n' "$m"
    INVALID="$INVALID $m"
    rm -rf "$tree"
    return 1
  fi
  TREES=$((TREES+1))

  eval "pre=\${PREENV_$m:-0}"
  if [ "$pre" = "1" ]; then
    # A SUBSHELL EXPORT, not `env VAR=x run_vitest`: `env` execs a PROGRAM and
    # `run_vitest` is a shell function, so that form silently ran nothing and
    # reported a FAILING run with an EMPTY RED SET. The harness refused it a
    # verdict, which is the guard doing its job — but the guard is not a
    # substitute for the call being right.
    ( export $("PREENV_VAL_$m" "$tree")
      run_vitest "$tree" "$suite" --reporter=default ) \
      >"$OUT/$m.$suite.ts" 2>&1
    rc=$?
  else
    run_vitest "$tree" "$suite" --reporter=default \
      >"$OUT/$m.$suite.ts" 2>&1
    rc=$?
  fi
  RUNS=$((RUNS+1))

  red="$(ts_red <"$OUT/$m.$suite.ts")"
  printf '%-6s %-15s %s\n' "$m" "$suite" \
    "$( [ "$rc" -eq 0 ] && echo PASS || echo FAIL )"
  if [ -n "$red" ]; then
    printf '%s\n' "$red" | sed 's/^/         RED: /'
  elif [ "$rc" -ne 0 ]; then
    printf '         *** FAILED WITH AN EMPTY RED SET — see %s\n' "$OUT/$m.$suite.ts"
    INVALID="$INVALID $m"
  fi
  rm -rf "$tree"
}

for m in "$@"; do
  run_one "$m"
done

printf -- '--- totals (computed by this run, not transcribed) ---\n'
printf 'trees=%d runs=%d\n' "$TREES" "$RUNS"
if [ -n "$INVALID" ]; then
  printf '*** INVALID — no usable verdict from:%s\n' "$INVALID"
  exit 1
fi
exit 0
