# TASK-018 — equivalence record and mutant catalogue for the six a2bp suites

**`a2bp-build`, `a2bp-contamination`, `a2bp-e2e`, `a2bp-inputs`,
`a2bp-pr-filing`, `a2bp-request` — ported to TypeScript, and every one of their
112 assertions given an OBSERVED mutant that turns it red.** Not a predicted
one; each entry below was produced by injecting a defect into a copy of this
repository and running both implementations over it.

Closed by the a2bp-group pass on 2026-09-11, and RE-closed the same day after
cross-provider review (Andreas, Back-End-2/Codex) refused certification: five of
those mutants were not the defect the assertion they redden NAMES, and three
product behaviours had no witness in either implementation. Both are closed in
§4 — F-2 and F-3 — with an observed red set per fix, not a predicted one. Each
spec's docblock points here rather than restating any of it.

**This is a work-item folder, not a document, because the catalogue has to be
TRACKED.** [PLAN-TASK-018.md](../PLAN-TASK-018.md) §5: *"Tracked as a mutant
catalog, not oral history. A suite that cannot fail on the defect it exists for
is theatre."* [`code/`](code/) is the catalogue; [`outputs/`](outputs/) is what
it produced. The whole folder travels with the port.

---

## 1. The question this answers, and the one it does not

Three independent cross-provider reviews of other groups refused certification
for the same reason: assertions with **no mutant that turns them red**. Not
missing coverage — missing *negative proof*. An assertion nobody has ever seen
fail is indistinguishable from an assertion that cannot fail, and this repo has
shipped the second kind: `a2bp-contamination`'s headline invariant was dead for
months, printed its failure 28 times, and exited 0 (BUG-048).

So the method is:

1. enumerate every assertion id in each `*.spec.ts`;
2. enumerate every id an existing recorded mutant is OBSERVED to turn red;
3. the gap is (1) minus (2), and every id in it gets a perturbation that is
   built, RUN, and whose red set is recorded.

It does **not** answer "is every product behaviour covered". Two of the findings
in §4 are exactly that other question leaking through: a mutant that turns
nothing red says no assertion anywhere watches that line.

## 2. How to run it

```bash
bash docs/waiting-acceptance/TASK-018-EQUIVALENCE-a2bp/code/equiv.sh --check      # do the literals still match?
bash docs/waiting-acceptance/TASK-018-EQUIVALENCE-a2bp/code/equiv.sh --all        # every tree (~2 h)
bash docs/waiting-acceptance/TASK-018-EQUIVALENCE-a2bp/code/equiv.sh C24 K14      # two of them
bash docs/waiting-acceptance/TASK-018-EQUIVALENCE-a2bp/code/diff-audit.sh C28     # what did it CHANGE?
python3 docs/waiting-acceptance/TASK-018-EQUIVALENCE-a2bp/code/gap.py outputs/*.txt
```

`equiv.sh` builds one perturbed copy of the repo per mutant, runs all six
retiring `test.sh` runners AND all six specs over it, and prints the two red
sets side by side. `gap.py` subtracts what was observed from what is declared.

**Run vitest from `tests/`, never the repo root** — there is no config there and
`npx` fetches an unpinned vitest, which reads as a silent pass.
[`code/vitest.sh`](code/vitest.sh) is the only entry point that does it.

## 3. The guards, and why each one exists

Inherited from `.scratch/elias-equiv.sh` (Christian's pass, commit 5a58a59),
plus one this group had to add.

| guard | the failure it prevents |
|---|---|
| `sub` is a LITERAL substitution that exits non-zero when its target is absent | a mutant that does not apply produces both-green, which reads exactly like "neither implementation covers this" |
| `run_one` refuses a verdict for a mutant that did not apply | a non-verdict row inside a table read as verdicts |
| CHANGED-NOTHING asked of **the tree's own git** (`status --porcelain` + `rev-list --count`) | a hand-written list of files a mutant "may touch" encodes the answer it is checking |
| `git add -A -f` in `build_tree` | the repo TRACKS sixteen files `.gitignore` also names; a fresh `init` drops them, and the guard above is then blind to any mutant targeting one |
| totals computed by the run | a headline arithmetic a reader cannot audit from the artefact |
| [`diff-audit.sh`](code/diff-audit.sh) | **new here.** `sub` proves the literal was FOUND, not that the hit was in code — see C23 in §4 |

## 4. Findings

Numbered for reference; bug rows are being allocated centrally.

### F-1 — a mutant can apply to a COMMENT (apparatus)

`C23` targeted `  local TL='{{PROJECT_NAME}}' TU='{{PROJECT_NAME_UPPER}}'` in
`scripts/lib/placeholders.sh`. That file's own header quotes the line it
documents:

```
#   local TL='{{PROJECT_NAME}}' TU='{{PROJECT_NAME_UPPER}}'
```

and the code line's two-space indent is a substring of the comment's three. So
`sub` matched the PROSE. The mutant applied, changed a byte, satisfied the
CHANGED-NOTHING guard, and altered nothing that runs — a both-green verdict
indistinguishable from a real finding. `C28` is the same defect anchored on the
preceding line of the function; it reds `contamination:#1 #1b #25 #25b`.

This is trap 1 one level down: *applied* is not *applied to code*. `C23` is kept
in the catalogue as a refusal so nobody re-derives it, and
[`diff-audit.sh`](code/diff-audit.sh) is the control — it prints what each
mutant actually changed. Every both-green mutant in this catalogue was audited
with it.

### F-2 — five assertions could not be falsified BY THE DEFECT THEY NAME (CLOSED)

Each had an observed red mutant, so none was dead. But the mutant that redded it
was not the defect in its own title, and that gap is where a reader would be
misled — a case named for behaviour X, proven only by a mutant of behaviour Y, is
evidence about Y.

Closed on 2026-09-11 after Andreas (Back-End-2, Codex) refused certification over
exactly these five. **Every fix is in a FIXTURE, not in an assertion**: the
titles and the questions they ask are unchanged, so no verdict moved — what
changed is that the fixture can now see the answer.

| assertion | names | before | after — `equiv.sh` run, both implementations |
|---|---|---|---|
| `request:#3` "content boundaries are framed" | length-framing of file content | `K3` both green; red only under `K12` | **`K3` → port `request:#3`, shell green** |
| `request:#3b` "header components are framed too, not newline-delimited" | length-framing of headers | `K4` both green; red only under `K13` | **`K4` → port `request:#3b`, shell green** |
| `pr-filing:#2` "reported with its state and url" | `--json state,url` | `F2` both green; red only under `F9` | **`F2` → port `pr-filing:#2` (+`#3`), shell green** |
| `pr-filing:#3` "a closed PR is still reported" | `--state all` | `F3` both green; red only under `F8` | **`F3` → port `pr-filing:#3`, shell green** |
| `contamination:#21` "a diff capability/runtime failure fails closed" | the `diff_rc > 1` guard | `C15` both green; red only under `C24` | **`C15` → port `contamination:#21`, shell green** |

The two mechanisms that produced the gap, and what each fix does about it:

* **The fixture fixed the value.** `pr-filing`'s `gh` shim reproduced gh's `--jq`
  handling and ignored every other flag, so no mutation of `--json` or `--state`
  could reach it — a fixture that ignores the argument under test asserts on its
  own behaviour. The shim now implements `--state` filtering and `--json` field
  selection the way gh does, so a narrowed query returns an empty list and an
  unasked-for field comes back absent (and jq renders it `null`, which is
  BUG-011's own mechanism).

  Same shape for `request:#3`/`#3b`: every fixture shifted a byte into a field
  whose next neighbour is constant, so the concatenations still differed and the
  collision framing exists to prevent never materialised. Each case now carries a
  second pair in which the shifted bytes BECOME the next record's header
  (`content ""` + `path "1 x"` against `content "3 "` + `path "x"`, which both
  render `3 1 x` unframed) or forge a newline boundary (`project "a\nb"` +
  `path "x"` against `project "a"` + `path "b\nx"`). `#3c` stays as the witness
  for both primitives going at once.
* **A second guard satisfied the oracle.** `#21` asks "did unrestored project
  bytes reach the blueprint". With `diff` broken the alignment is empty, staging
  passes the bytes through — and the residual-project-name scan blocked them, so
  the guard `#21` names could be removed and `#21` stayed green. Its carrier line
  now carries an `a2bp-allow` marker, which is the product's own sanctioned
  override and suppresses every check on that line. That is precisely the
  situation in which the fail-closed `diff` guard is the only thing left, and
  `C15` alone now files the literal project name upstream.

**`K3` and `K4` are port-stricter results**: under both, all six retiring shell
suites stay entirely green.

### F-3 — three product behaviours no assertion watched, in EITHER implementation (CLOSED)

Both-green, re-confirmed serially in [`outputs/round3-serial.txt`](outputs/round3-serial.txt).
**There were three, not two** — the first version of this section said two, and
the third was found by the same method one review later (see BUG-108).

* **`B15` — `bp_file_base_content` aligning at the ROOT coordinate.** Replacing
  `tpath=$(bp_base_path …)` with `tpath="$path"` turned nothing red. Its own
  header says why it matters: after the TASK-021 move, aligning at the root
  hands the contamination guard an EMPTY base for a file that exists, so every
  line reads as new and the staged restore has nothing to align to. No case in
  any of the six suites drove a2bp end to end against a scaffolded base —
  `a2bp-build` tests `bp_base_path` directly and the contamination fixtures were
  flat. **Closed by `contamination:#29`**, which files against a base holding the
  carrier under `scaffolding/` while a root file of the same name is left in
  place — the state DURING the move, and the wrong answer a root-coordinate
  alignment picks up.
* **`E7` — `cmd_a2bp`'s required-libs guard.** `[ -r "$libdir/$lib" ] || die` →
  `|| continue` turned nothing red. The guard's own comment calls it BUG-003's
  lesson ("a guard that cannot run is not a guard that passed") and nothing
  asserted it. The `FAIL: scripts/lib/$lib is missing` line in the shell runners
  is the SUITE checking its own preconditions, not the CLI's behaviour. **Closed
  by `contamination:#30`**, over a `tests/*` path — managed, and NOT substituted,
  so with the refusal downgraded the staging is a plain `cp`,
  `contamination_scan` is simply not a command, `findings` is empty and the
  request is filed with the scan having never run. A control run with the
  complete CLI copy proves the copy reaches the scan at all.
* **`E9` — the immediate pre-push base re-check.** `bp_file_remote_tip` loses
  `git ls-remote`'s exit status through its pipeline, and the caller reads an
  empty tip as "the blueprint did not move". Replacing the function with
  `return 0` left both implementations green, so a request could be filed
  against a superseded base by the one block whose stated purpose is to prevent
  it. **Closed by `e2e:#12`**, which drives the race instead of simulating it: a
  `git` wrapper advances the remote's `main` right after the first fetch returns,
  and the case requires the CLI to report the move and to file a request whose
  PARENT is the new tip. Hanging the move off the FETCH rather than off the
  re-check's own `ls-remote` is what makes it a witness — a defect that never
  asks for the tip still faces a moved blueprint.

### F-4 — one product redundancy (both-green, not a coverage hole)

`B4` removes `bp_request_hermetic` from around `commit-tree`, and nothing goes
red. Correctly: the command already pins everything that can change the commit
object on its own line — `-c core.autocrlf=false -c commit.gpgsign=false -c
i18n.commitEncoding=UTF-8` (command-line `-c` outranks `GIT_CONFIG_KEY_<n>`) and
the identity and dates through the inner `env`. Only `LC_ALL` leaks, and it
cannot change a commit. The scrub is real defence at every OTHER call site; at
this one it is belt over braces.

### F-5 — the shell suite's `a2bp-e2e #10` is falsifiable by any concurrent process

Round 1 ran two trees at a time. The shell `#10` scans the SHARED `${TMPDIR}`
for `a2bp.*`, so a neighbouring tree's scratch made it red for eight mutants
that touch no scratch code at all (`K1 I1 I16 I17 B6 B8 C5 C8 C9 C15 C16`). The
port scans this scenario's OWN pinned TMPDIR and never moved. Re-running `K1`
and `B6` serially ([`outputs/round2-serial.txt`](outputs/round2-serial.txt))
removes the red. This is BUG-049's cross-suite hazard, and the port's
documented strengthening #2 measured rather than asserted.

## 5. Disagreements, and which direction each runs

| mutant(s) | disagreement | reading |
|---|---|---|
| `B1 B2 B7 B13 C1 C17 K9 K15 C26 E8 C28` | port-only `contamination:#1b` | **port stricter.** The `{{PROJECT_NAME_UPPER}}` half of reverse-substitution. Both suites have a `#1b`; only the port's can see it fail. |
| `B13` | port-only `build:#2` | **port stricter** on "unrelated base entries survive". |
| `K14` | port-only `request:#3c` | **port stricter by construction** — `#3c` is a TS-side addition, the only witness that framing has left the key. |
| `K3 K4 F2 F3 C15 B15 E7 E9` | port-only, one assertion each (round 4) | **port stricter, eight times over.** Every witness added to close F-2 and F-3 leaves all six retiring shell suites entirely GREEN. Five of the eight (`K3 K4 F2 F3 C15`) are defects the shell suites could never see; three (`B15 E7 E9`) are behaviours neither implementation watched until now. |
| `F4 F5 I2` | `e2e:#3` moves between them | the shell `a2bp-e2e` runs `#3` with the AMBIENT PATH, so the real `gh` runs and it reaches the pr-create-failure branch instead of the missing-gh one. Codex F1, which the port fixed by hiding `gh` for every case. |
| `B3` | shell-only `build:#4` | **a race in both.** With the fixed dates removed, `commit-tree` falls back to the wall clock, so `#4` is red only when its two builds straddle a second. Reproduced serially. `#4` has deterministic proof from `B1`. |
| `K1 I1 I16 I17 B6 B8 C5 C8 C9 C15 C16` | shell-only `e2e:#10` | F-5. Parallelism artefact of the SHELL suite; gone when serial. |

**No port-weaker result.** Every id the shell suite reds under a mutant, the
port reds too, except the two explained rows above — one an artefact of the
shell suite's own shared-TMPDIR scan, one a race both implementations share.

## 6. Totals, computed by the run

**Three numbers, and two of them were being confused for each other.** The
cross-provider review could not reproduce this section's arithmetic, which is
the same failure `.scratch/equiv-matrix.txt` shipped once already (an
unreproducible 41/45). So each is now printed by the code that knows it, and
they are different questions:

| number | what it answers | who prints it |
|---|---|---|
| **98** catalogue labels | how many mutants EXIST | `equiv.sh` — `catalogue=` on every run, and `--list` |
| **10** requested / **10** trees | what the round-4 invocation asked for, and how many perturbed copies it actually built and gave a verdict | `equiv.sh` — `requested=` / `trees=` |
| **99** unique labels from **114** rows | what the stored outputs contain | `gap.py`, from the logs |

The three reconcile exactly, and the reconciliation is the point. 114 executed
rows are 84 (round 1) + 17 (round 2, serial re-confirmation) + 3 (round 3,
serial) + 10 (round 4); dropping the repeats leaves 99 distinct labels; those 99
are the 98 in the catalogue plus `C23`, retired as comment-only (F-1) and still
present in the older logs. **No tracked artefact supports any larger count** — a
"120 perturbed trees" figure quoted in review appears nowhere in this folder, and
nothing here should be read as claiming it.

A partial run now says so in its own output (`requested=` beside `trees=`), so a
ten-mutant confirmation cannot be mistaken for a full replay.

From [`outputs/gap-report.txt`](outputs/gap-report.txt), which `gap.py` writes
from the run logs rather than from anyone's count:

```
mutants with a verdict: 99 unique label(s) from 114 executed row(s)
a2bp-build          17/17
a2bp-contamination  38/38
a2bp-e2e            14/14
a2bp-inputs         21/21
a2bp-pr-filing       7/7
a2bp-request        15/15
TOTAL 112/112 assertions have an observed red mutant
```

112 is the declared count; vitest runs 118, because four `it`s in
`a2bp-contamination` are written inside `for` loops over a metacharacter table
and expand to ten. The two numbers were reconciled against each other rather
than assumed — and checked for the two apparatus defects the other groups hit:
no spec here uses `it.each` (so a `grep`-derived denominator loses nothing), and
`sort -u` over this group's id space collapses nothing under either the ambient
locale or `LC_ALL=C` (112 = 112 = 112).
