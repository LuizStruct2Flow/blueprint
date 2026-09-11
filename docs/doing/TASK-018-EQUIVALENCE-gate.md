# TASK-018 — equivalence record for the gate / hooks suites

**Six suites — `pipeline`, `pre-push-scanners`, `pre-push-secrets`,
`gate-arming`, `no-chain-guard`, `ts-bridge` — ported to TypeScript, and the port
PROVEN faithful by running both implementations over the same inputs and diffing
their verdicts mechanically.** Not by reading them side by side.

Ported by Vitali (QA-1) on 2026-09-11. Every spec's docblock points here rather
than restating the table; this file holds the populations, the verdicts and the
residue, and it is deleted when the shell runners are retired.

The method is the one Matthias set out in
[TASK-018-EQUIVALENCE-mic/](TASK-018-EQUIVALENCE-mic/) §1 and is not restated
here. Its four verdicts are used unchanged: **agree**, **shell-only-red** (the
port is looser — a regression), **port-only-red** (the port is stricter — justify
it or it is a false positive), **both-green** (neither covers the injected defect
— a real finding, and the class mutation testing cannot find on its own).

---

## 1. Where the §3.3 line was drawn

TASK-018-TARGET §3.3 rules that **the pre-push hook's shell ENTRY POINT stays
shell permanently**: if the gate were TypeScript and `npm ci` had not run there
would be no gate in exactly the state where one is most wanted, and a TypeScript
gate cannot report its own absence.

That exempts a SUBJECT, never a SUITE. The line drawn here, per file:

| file | ported? | why |
|---|---|---|
| `.githooks/pre-push` | **no — §3.3** | the entry point itself. Driven byte-for-byte by `pre-push-scanners` and `pre-push-secrets` under `/bin/sh`, in a fixture repo, with shim scanners. |
| `scripts/lib/pipeline.sh` | no (open) | a library the entry point sources. TARGET §6 leaves `pipeline.sh → package.json` open for the founder; either way today's subject is the shell renderer. |
| `scripts/lib/gate.sh`, `scripts/lib/feed.sh` | no | sourced by `agent-activity.sh` and `blueprint`, both shell, and what they manipulate is `git config` and a log file. |
| `scripts/no-chain-guard.sh` | no | a Claude Code PreToolUse hook — an external harness invokes it by path with a shell-command contract. |
| `scripts/run-ts-suites.sh` | no — §3.3's own reason | it is the code that DISCOVERS `npx` and `tests/node_modules` are absent. A TypeScript program cannot report its own missing toolchain. |
| all six `tests/<suite>/test.sh` | **yes** | the suites are the migration. Six `*.spec.ts` written; no shell runner deleted (retirement is the coordinator's single central pass). |

**Nothing was left unported on the grounds that its subject is shell.** That
reading would defeat the ruling, and it is the error this group was most at risk
of. Equally, nothing was ported that §3.3 protects.

---

## 2. The populations and the verdicts

59 perturbed trees. One mutant per assertion group, injecting the defect that
assertion exists to catch, plus the healthy baseline as a negative control in
every population. Both implementations over every tree; per-case red SETS
compared (case ids normalised to their numeric base, raw sets printed on any
disagreement).

Driver: `.scratch/vitali-equiv.py`. One tree is built with `rsync`, committed, and
then patched/amended/restored per mutant — so `git show HEAD:<file>` sees the
mutant too, which `gate-arming`'s fixture depends on. It is scratch deliberately:
it exists to produce this table once, which is what R6 asks for and no more.

### `no-chain-guard` — 8 trees, 7 agree, 1 port-only-red

| tree | shell red | port red | verdict |
|---|---|---|---|
| baseline | – | – | agree |
| drop-semicolon-and-or | #1, #6 | #1, #6 | agree |
| block-pipes-too | #2 | #2 | agree |
| **empty-payload-allowed** | – | **#4** | **port-only-red — BUG-081** |
| missing-jq-fails-open | #4 | #4 | agree |
| untyped-tool-name | #4 | #4 | agree |
| untyped-command | #4 | #4 | agree |
| never-inspect-bash | #1, #4, #6 | #1, #4, #6 | agree |

### `pipeline` — 15 trees, 12 agree, 3 port-only-red

| tree | shell red | port red | verdict |
|---|---|---|---|
| baseline | – | – | agree |
| **stage-exits-zero** | #2,#4,#5,#6,#14,#20 | + **#16** | **port-only-red — stricter** |
| equivalent-finish-returns-zero | – | – | agree (equivalent mutant) |
| **no-halt-after-failure** | – | **#3** | **port-only-red — BUG-080 (1)** |
| leak-passing-output | #8 | #8 | agree |
| swallow-failing-output | #7 | #7 | agree |
| force-colour-only | – | – | agree (**both-green — BUG-083**) |
| **real-escape-bytes** | – | **#9b** | **port-only-red — BUG-083 pin** |
| real-escape-bytes-and-tty | #9 | #9 | agree |
| skip-counts-as-failure | #11, #15, #16 | #11, #15, #16 | agree |
| leak-temp-dirs | #12 | #12 | agree |
| slo-blocks-the-push | #20 | #20 | agree |
| slo-warns-always | #20 | #20 | agree |
| rotation-replaces-inode | #18 | #18 | agree |
| colour-into-the-feed | #17 | #17 | agree |

### `gate-arming` — 11 trees, 11 agree

| tree | shell red | port red | verdict |
|---|---|---|---|
| baseline | – | – | agree |
| clobber-foreign-hookspath | #5 | #5 | agree |
| arm-without-a-hook | #6 | #6 | agree |
| silent-when-already-armed | #4 | #4 | agree |
| fail-caller-outside-repo | #8 | #8 | agree |
| silent-write-failure | #9 | #9 | agree |
| keepalive-clobbers | #10 | #10 | agree |
| keepalive-restates | #10 | #10 | agree |
| feed-never-arms | #2, #3 | #2, #3 | agree |
| cli-never-arms | #7 | #7 | agree |
| status-arms-as-side-effect | #1 | #1 | agree |

### `pre-push-scanners` — 9 trees, 9 agree

| tree | shell red | port red | verdict |
|---|---|---|---|
| baseline | – | – | agree |
| no-results-schema-check | R2-1b | R2-1b | agree |
| trust-zero-results-on-error-exit | #3, #4, R2-1a | #3, #4, R2-1a | agree |
| no-retry | #3, #4 | #3, #4 | agree |
| retry-with-same-args | #4 | #4 | agree |
| hide-semgrep-diagnostic | #3 | #3 | agree |
| hide-the-rule-id | #2 | #2 | agree |
| gitleaks-toolfail-as-finding | #6 | #6 | agree |
| hide-gitleaks-finding-output | #5 | #5 | agree |

### `pre-push-secrets` — 9 trees, 9 agree

| tree | shell red | port red | verdict |
|---|---|---|---|
| baseline | – | – | agree |
| scan-the-index-again (A-03 itself) | #1,#2,#3,#5,#6,#7,#8,#9,#10 | same | agree |
| unresolvable-zero-range | #3 | #3 | agree |
| scan-deletions-too | #4 | #4 | agree |
| skip-when-no-refs | #6 | #6 | agree |
| subtract-every-remote | #7, #8 | #7, #8 | agree |
| timeout-is-not-distinct | #9, #10 | #9, #10 | agree |
| budget-per-ref | #10 | #10 | agree |
| unbounded-without-timeout | #11 | #11 | agree |

### `ts-bridge` — 7 trees, 5 agree, 2 port-only-red

| tree | shell red | port red | verdict |
|---|---|---|---|
| baseline | – | – | agree |
| no-env-scrub | #1 | #1 (+#1c) | agree |
| scrub-git-only | #1 | #1 (+#1c) | agree |
| silent-runner-failure | #2b | #2b | agree |
| set-e-death-on-declared-suites | #1d | #1d | agree |
| **no-floor-on-duration** | – | **#1e** | **port-only-red — new coverage** |
| **no-per-suite-report** | – | **#1b,#1d,#1e,#2,#2b,#2c** | **port-only-red — BUG-080 (2)** |

### Fixture- and observation-level perturbations

Four claims are about the FIXTURE or the OBSERVATION rather than the subject, so
no subject mutant can reach them. Perturbed where the claim lives
(`.scratch/vitali-verify-nonvacuity.py`, which patches, runs and restores in one
process); each must turn the NAMED case red, and each does:

| claim | perturbation | result |
|---|---|---|
| `pre-push-scanners` #0 — the osv-scanner shim wins PATH | delete the shim | #0 red |
| `pipeline` #19c — the guard reads the path `feed.sh` resolves | append `/no-such-file` | #19c red |
| `pipeline` #19c — a feed resolving to nothing is refused | resolve to `''` | #19c red |
| `pipeline` #19b — the detector is proven, not assumed | make the `[GATE]` counter return 0 | #19b red |

---

## 2b. R6 second pass — per-ASSERTION negative proof

**The population in §2 is one mutant per assertion GROUP.** That proves a CASE
can fail; it does not prove that each named assertion INSIDE a case can. Alex
(Codex, cross-provider review, 2026-09-11) refused to certify the six ports for
retirement on exactly that reading of R6 — a case carrying four claims has a
recorded red proof for the case and none for the individual claims — and listed
fourteen assertions with no targeted proof.

19 further perturbed trees, one defect per named assertion, same driver
(`.scratch/vitali-equiv.py --r6`), raw log `.scratch/markus-r6-final.out`.
**24 trees, 3 disagreements, 2 mutants with an EMPTY port red set** — computed
by the run, not transcribed.

Three controls, each present because its absence has already produced a
fabricated finding in this migration:

- **A missing anchor is fatal.** A substitution matching nothing yields "both
  green", which reads identically to "neither implementation covers this".
  `.scratch/markus-r6-anchors.py` resolves every literal before the sweep runs.
- **"This mutant changed nothing" is asked of the TREE'S OWN GIT**, never of a
  list of files a mutant is allowed to touch — such a list encodes its own
  answer. Plus a byte comparison against what `apply_edits` saved, because the
  tree's git is *blind* to the sixteen files this repo tracks and its
  `.gitignore` also names (`git ls-files -i -c --exclude-standard`): a fresh `git init`
  honours the ignore file, so `.claude/settings.json` mutated invisibly.
  `build_tree` now stages with `add -A -f` for the same reason. **No verdict
  below changed when `-f` was added**; the defect was in what the CONTROL could
  see, not in what the trees did.
- **The port's failure MESSAGE is recorded, not just the case id.** `#16`
  carries four claims and `#14` five, so "`#16` went red" cannot say which. Each
  row below names the assertion the port itself printed.

| named assertion | mutant — the defect injected | shell red | port red | the assertion the port named |
|---|---|---|---|---|
| `pipeline` #0 | **delete** `scripts/lib/pipeline.sh` | #0 | #0,#1,#7,#9b,#10,#11,#12,#14,#15,#16,#17,#19c,#20 | `promise rejected ENOENT` — the `stat(LIB)` claim |
| `pipeline` #1 PASSED text<br>(and #14's PASSED limb) | rename the TERMINAL verdict `PASSED`→`DONE`. Deliberately NOT the feed's own `PASSED · …` line, which is a separate string and is what #16 claim 3 reads | #1,#14 | #1,#14 | `expected … to contain 'PASSED'`, printed once for each |
| `pipeline` #10 | move the banner out of `pipe_init` into `pipe_finish`'s PASSING branch | #10 | #10 | `no banner on the failing path` |
| `pipeline` #13 | rewrite **every** `lib/pipeline.sh` mention in `.githooks/pre-push` | #13 | #13 | `.githooks/pre-push does not source scripts/lib/pipeline.sh` |
| **`pipeline` #13** | delete only the `. scripts/lib/pipeline.sh` LINE, keep the comments | – | – | **both-green — FINDING 1** |
| `pipeline` #14 passing limb | refuse to start when `mktemp` fails instead of degrading | #14,#15 | #14,#15 | `no-scratch-dir pass path broke` |
| `pipeline` #14 non-vacuity limb | drop the `no scratch dir` banner text | – | #14 | `mktemp did not fail — the unbuffered path was never exercised` (**port-only-red**) |
| `pipeline` #14 rendering limb | discard unbuffered stage output | #14 | #14 | `unbuffered failure output was lost entirely` |
| **`pipeline` #16 claim 1** | stop feeding a stage RESULT (`_pipe_line ok`) | – | – | **both-green — FINDING 2** |
| `pipeline` #16 claim 2 | stop feeding a SKIP | #16 | #16 | `skipped stage missing from the feed` |
| `pipeline` #16 claim 3 | stop feeding the VERDICT | #16 | #16 | `no verdict line in the feed` |
| `pipeline` #16 claim 4 | drop `— PUSH BLOCKED` from the failed-verdict feed line | #16 | #16 | `a blocked push is not identifiable in the feed` |
| `no-chain-guard` #5 | inspect EVERY tool, not only Bash | #5 | #5 | `a Read call was blocked — the guard is out of its scope` |
| `no-chain-guard` #7 | point the PreToolUse hook at a different script | #7 | #7 | `the guard is referenced by no PreToolUse hook — it runs nowhere` |
| `gate-arming` #1b | make `--stop` arm as a side effect | #1b | #1b | `--stop armed the gate` |
| `gate-arming` #10 installation | announce the keepalive, write no config | #10,#10b | #10,#10b | `core.sshCommand was left without a keepalive` |
| `gate-arming` #10d | return 1 outside a repo | #10d | #10d | `returned 1 outside a repo` |
| `pre-push-scanners` #1 | make the `clean` class unreachable | #0,#1,#4,#4b | #0,#1,#4,#4b | `clean scanners should pass` |
| `ts-bridge` #0 | blind the spec discovery (`*.spec.ts` → `*.spec.tsx`) | #0 | #0,#1,#1b,#1c,#1e,#2,#2b,#2c | `expected [] to deeply equal [ 'demo' ]` |

**Seventeen of the nineteen named assertions now have a recorded defect that
turns them red.** Two do not, and both are recorded as findings rather than
engineered around — neither assertion was weakened, and neither is fixed here,
because changing an assertion while proving the port against its predecessor
makes the port unprovable against it.

### The two assertions no mutant could turn red

**FINDING 1 — `pipeline` #13 cannot tell sourcing from mentioning.** It asserts
`readFile('.githooks/pre-push').toContain('lib/pipeline.sh')`. Deleting the
actual `. scripts/lib/pipeline.sh` invocation leaves five comment mentions in
that file, and the case stays green in BOTH implementations. The shell's #13 is
a `grep -q 'lib/pipeline.sh'` over the same file, so this is a **faithful port
of a hole, not a port regression** — BUG-080's exact shape (`grep demo` satisfied
by "declared but never reported: demo"), in a file the §2 population never
mutated.

**FINDING 2 — `pipeline` #16's first feed claim is satisfied by the verdict
line.** It asserts `/\[.*\].*alpha/` against the feed. Deleting the per-stage
`_pipe_feed "✓ $2  $3"` leaves the feed as, verbatim
(`.scratch/markus-r6-why16.sh` reproduces it):

```
[GATE] ── pre-push gate · x ──
[GATE] – beta  skipped · not here
[GATE] PASSED · 1 stages · 1 skipped · 0.0s · slowest: alpha 0.0s
```

`pipe_finish`'s slowest-stage annotation carries the stage NAME into the verdict
line, so a pattern looking for the name in any `[TAG]` line matches even with
per-stage feeding entirely removed. Both implementations stay green. Claims 2, 3
and 4 of the same case are each falsifiable; only claim 1 is not. The shell
suite's `#16 each stage result is appended to the activity feed` has the
identical hole — again a faithful port.

### The three disagreements, all abort-vs-continue or port-stricter

- **`r6-renderer-absent`** and **`r6-spec-discovery-blind`**: the shell runner
  `exit 1`s immediately after its own #0, so it reports one red id where the
  port reports every case it went on to run. Not narrower coverage — a different
  failure policy, and the port's is the informative one.
- **`r6-unbuffered-mode-unannounced`**: port-only-red. The port's #14 carries an
  explicit non-vacuity control (`toContain('no scratch dir')`) that proves
  `mktemp` really failed; the shell's #14 has none, so a fixture that silently
  stopped removing `mktemp` would leave it asserting #1 again under a longer
  PATH. New coverage, same class as `ts-bridge` #1e.

### One doc correction, measured

`ts-bridge.spec.ts` #0's comment says that without it "the cases below pass
vacuously: `ts_suites_stage` skips outright when no suite owns a spec, and a skip
is green." Measured under `r6-spec-discovery-blind`, they do not: #1, #1b, #1c,
#1e, #2, #2b and #2c all go RED. #0 is non-vacuous and the fixture claim it makes
is true; the stated CONSEQUENCE of its absence is not.

---

## 3. Every divergence, and why each is the port being right

**No shell-only-red anywhere.** The port is nowhere looser. Six substantive
divergences, all port-only-red:

1. **`no-chain-guard` #4 / empty-payload — BUG-081.** `jq` on empty input exits 0
   with no output, so deleting the dedicated empty-payload branch still blocks two
   branches later with the same exit code. The shell case asserted only the code.
   Each fail-closed branch now asserts its own MESSAGE — which is the rule the
   shell suite's own header states, and applied to the missing-jq case alone.
2. **`pipeline` #16 / stage-exits-zero.** The port asserts a failing gate exits
   non-zero as part of #16; the shell's #16 asserted only the feed line. Stricter
   and deliberate.
3. **`pipeline` #3 — BUG-080 (1).** Its evidence was stdout from a stage that, once
   the halt was removed, RAN AND PASSED — so the buffer #8 asserts swallowed
   exactly the evidence #3 looked for. Now a filesystem side effect.
4. **`pipeline` #9b — BUG-083.** New case pinning a product defect. Goes red the
   day the escapes are restored, which is the point.
5. **`ts-bridge` #1e.** The `| floor` requirement had no case at all. The bridge's
   own comment records it was "caught by running the bridge rather than by reading
   it", and then nothing pinned it.
6. **`ts-bridge` #1b/#2c — BUG-080 (2).** `grep demo` is satisfied by
   `pipe_batch_end`'s `declared but never reported: demo` refusal, so deleting
   per-suite reporting left both green. Now asserted on a rendered result marker.

### The both-green tree, which is the finding a mutant sweep exists for

`pipeline` / **force-colour-only**: forcing `[ -t 1 ]` true changes nothing
detectable, because **`scripts/lib/pipeline.sh` contains no ESC byte at all**
(BUG-083). #9 and #17 assert that no ANSI escape leaks from a path that emits
none. Verified on a real pty: the gate prints `[2m╭─ gate [0m` and `[32m✓[0m` as
literal text. Only `real-escape-bytes-and-tty` — restoring the bytes AND forcing
the branch — turns #9 red.

---

## 4. Deliberate divergences that are not defects

- **`pipeline` #12** counted `/tmp/tmp.*` machine-wide; the port counts inside the
  scenario's own pinned `TMPDIR`. Same property, deterministic, parallel-safe.
  The old form went red twice in one sweep under mutants touching no temp-dir code
  (BUG-081).
- **`gate-arming` #9** removed write permission from `.git` and then SKIPPED
  ITSELF as root. R7 forbids a skipped test, and covering less in a root CI
  container than on a laptop is the BUG-005 shape. The port injects a `git` shim
  that fails only the `config --local core.hooksPath` write, so the case runs for
  every uid.
- **`pre-push-secrets` `--fast`** is gone. Both budget cases always run. The flag
  existed to fit a 30 s ceiling that no longer exists, and a conditionally-absent
  case is a skipped one (R7).
- **`ts-bridge` #1c** cross-checked the env scrub by `sed`-parsing
  `tests/harness/env.ts` — BUG-063's exact mechanism. The port IMPORTS
  `FORBIDDEN_ENV`. Its `.blueprint-root` keying is also dropped: the premise
  ("`tests/harness/` is blueprint-tier and does not ship") is stale — there is no
  `tests/harness/ export-ignore` line, so the harness ships and the case would
  have run downstream anyway.
- **`pipeline` #17** is its own case rather than an extra assertion inside #16.
  Sharing one made the verdicts inseparable and produced a false divergence.
- **`pipeline` #19** is three cases: #19a (the path is ASKED of `feed.sh`), #19b
  (the detector fires), #19c (the run neither wrote to nor created the real feed).
  The shell's `[ -f ]` disarm switch was deleted earlier the same day; that was
  necessary and not sufficient, because the count comparison still read `0 -> 0`
  over an unbound path.

---

## 5. What `ts-bridge` cannot prove, and why no second runner was invented

`ts-bridge.spec.ts` is a TypeScript spec, run BY vitest, testing the shell bridge
whose job is to run vitest. The full statement is in that file's docblock; the
summary:

**Proved.** Every case drives a COPY of `scripts/run-ts-suites.sh` in a fixture
project against a STUB `npx`, so the environment scrub, the rendering, the
survival of a non-zero declared-suites status and the visibility of a failing
runner are genuinely pinned. Coverage is complete in CONTENT.

**Not provable from inside vitest.** (a) That a regression of BUG-055 would be
REPORTED — a silently-dead bridge means the spec does not run, and an absent test
reports nothing; BUG-055's actual presentation was an absence. (b) That the bridge
can start vitest in this repo at all. (c) The no-toolchain property — `manifest`'s
retiring shell version re-ran itself with node/npm/npx/tsc/vitest poisoned; no
vitest spec can assert that about itself.

**The mitigation that shrinks (a) considerably:** `tests/bootstrap-gate` #2/#3
bootstraps a project, runs its ENTIRE gate as a subprocess and asserts ≥ 25
stages. A bridge dying silently inside that inner gate truncates the stage list
and turns that case red. So a silent bridge death IS observable from outside — by
an outer vitest run watching an inner gate. Only a failure that takes down the
OUTER run too is invisible.

**The residue is TASK-023**, already rowed and founder-pending. It is deliberately
not worked around: inventing a second runner kind on one agent's authority is how
a test stack acquires the exemption R5 spent a day removing.

---

## 6. State of the six suites

81 cases, all green. 13.06 s serial, **7.02 s with `--fileParallelism`** — all six
are R5-ready with no marker and no escape hatch. `tsc --noEmit` is clean for these
six files.

**No shell runner was deleted and no gate wiring was touched.** Retirement is one
consolidated central pass: four whole-file clobbers happened on 2026-09-11 from
stale reads, and every retirement edits the same hook. All six are ready.
