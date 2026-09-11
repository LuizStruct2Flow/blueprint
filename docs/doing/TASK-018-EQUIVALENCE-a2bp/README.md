# TASK-018 — equivalence record and mutant catalogue for the six a2bp suites

**`a2bp-build`, `a2bp-contamination`, `a2bp-e2e`, `a2bp-inputs`,
`a2bp-pr-filing`, `a2bp-request` — ported to TypeScript, and every one of their
109 assertions given an OBSERVED mutant that turns it red.** Not a predicted
one; each entry below was produced by injecting a defect into a copy of this
repository and running both implementations over it.

Closed by the a2bp-group pass on 2026-09-11. Each spec's docblock points here
rather than restating any of it.

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
bash docs/doing/TASK-018-EQUIVALENCE-a2bp/code/equiv.sh --check      # do the literals still match?
bash docs/doing/TASK-018-EQUIVALENCE-a2bp/code/equiv.sh --all        # every tree (~2 h)
bash docs/doing/TASK-018-EQUIVALENCE-a2bp/code/equiv.sh C24 K14      # two of them
bash docs/doing/TASK-018-EQUIVALENCE-a2bp/code/diff-audit.sh C28     # what did it CHANGE?
python3 docs/doing/TASK-018-EQUIVALENCE-a2bp/code/gap.py outputs/*.txt
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

### F-2 — five assertions cannot be falsified BY THE DEFECT THEY NAME

Each of these now has an observed red mutant, so none is dead. But the mutant
that reds it is not the defect in its own title, and that gap is where a reader
would be misled.

| assertion | names | the named defect, injected | what actually reds it |
|---|---|---|---|
| `request:#3` "content boundaries are framed" | length-framing of file content | `K3` — both green | `K12` (content leaves the key entirely) |
| `request:#3b` "header components are framed too, not newline-delimited" | length-framing of headers | `K4` — both green | `K13` (the project component leaves the key) |
| `pr-filing:#2` "reported with its state and url" | `--json state,url` | `F2` — both green | `F9` (the jq filter drops the url) |
| `pr-filing:#3` "a closed PR is still reported" | `--state all` | `F3` — both green | `F8` (the jq filter drops the state) |
| `contamination:#21` "a diff capability/runtime failure fails closed" | the `diff_rc > 1` guard | `C15` — both green | `C24` (that guard AND the residual-name block) |

Two distinct mechanisms:

* **The fixture fixes the value.** `pr-filing`'s `gh` shim reproduces gh's
  `--jq` handling and ignores every other flag, so no mutation of `--json` or
  `--state` can reach it. Same shape for `request:#3`/`#3b`: every existing
  fixture shifts a byte into a field whose next neighbour is constant, so the
  concatenations still differ and the collision framing exists to prevent never
  materialises. The spec already records this at `#3c`, which was added for
  exactly this reason and IS the witness (`K14`, shell PASS / port FAIL).
* **A second guard satisfies the oracle.** `#21` asks "did unrestored project
  bytes reach the blueprint". With `diff` broken the alignment is empty, staging
  passes the bytes through — and the residual-project-name scan blocks them. The
  fail-closed guard `#21` names can be removed and `#21` stays green.

### F-3 — two product behaviours no assertion watches, in EITHER implementation

Both-green, re-confirmed serially in [`outputs/round3-serial.txt`](outputs/round3-serial.txt).

* **`B15` — `bp_file_base_content` aligning at the ROOT coordinate.** Replacing
  `tpath=$(bp_base_path …)` with `tpath="$path"` turns nothing red. Its own
  header says why it matters: after the TASK-021 move, aligning at the root
  hands the contamination guard an EMPTY base for a file that exists, so every
  line reads as new and the staged restore has nothing to align to. No case in
  any of the six suites drives a2bp end to end against a scaffolded base —
  `a2bp-build` tests `bp_base_path` directly and the contamination fixtures are
  flat.
* **`E7` — `cmd_a2bp`'s required-libs guard.** `[ -r "$libdir/$lib" ] || die` →
  `|| continue` turns nothing red. The guard's own comment calls it BUG-003's
  lesson ("a guard that cannot run is not a guard that passed") and nothing
  asserts it. The `FAIL: scripts/lib/$lib is missing` line in the shell runners
  is the SUITE checking its own preconditions, not the CLI's behaviour.

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
| `F4 F5 I2` | `e2e:#3` moves between them | the shell `a2bp-e2e` runs `#3` with the AMBIENT PATH, so the real `gh` runs and it reaches the pr-create-failure branch instead of the missing-gh one. Codex F1, which the port fixed by hiding `gh` for every case. |
| `B3` | shell-only `build:#4` | **a race in both.** With the fixed dates removed, `commit-tree` falls back to the wall clock, so `#4` is red only when its two builds straddle a second. Reproduced serially. `#4` has deterministic proof from `B1`. |
| `K1 I1 I16 I17 B6 B8 C5 C8 C9 C15 C16` | shell-only `e2e:#10` | F-5. Parallelism artefact of the SHELL suite; gone when serial. |

**No port-weaker result.** Every id the shell suite reds under a mutant, the
port reds too, except the two explained rows above — one an artefact of the
shell suite's own shared-TMPDIR scan, one a race both implementations share.

## 6. Totals, computed by the run

From [`outputs/gap-report.txt`](outputs/gap-report.txt), which `gap.py` writes
from the run logs rather than from anyone's count:

```
mutants with a verdict: 98
a2bp-build          17/17
a2bp-contamination  36/36
a2bp-e2e            13/13
a2bp-inputs         21/21
a2bp-pr-filing       7/7
a2bp-request        15/15
TOTAL 109/109 assertions have an observed red mutant
```

109 is the declared count; vitest runs 115, because four `it`s in
`a2bp-contamination` are written inside `for` loops over a metacharacter table
and expand to ten. The two numbers were reconciled against each other rather
than assumed — and checked for the two apparatus defects the other groups hit:
no spec here uses `it.each` (so a `grep`-derived denominator loses nothing), and
`sort -u` over this group's id space collapses nothing under either the ambient
locale or `LC_ALL=C` (109 = 109 = 109).
