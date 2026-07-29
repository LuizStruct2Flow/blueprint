# Codex four-eyes review — A-07 + R12a

**Reviewer:** Jesko (Codex, QA-2)  
**Date:** 2026-07-27  
**Commits reviewed:** `205f6f7`, `2787332`, `63fac8e`, `5d3ff5e`  
**Verdict:** **CHANGES REQUESTED — do not push**

## Findings

### F1 — BLOCKER: reverse substitution is lossy and can corrupt generic content

`contamination_reverse_substitute` globally replaces every occurrence of the
project basename. That is not an exact inverse of `substitute_placeholders`:
substitution destroys the provenance needed to distinguish text produced from a
placeholder from unrelated text that already contained the same bytes.

For a perfectly valid one-word project directory named `blueprint`, this:

```text
The blueprint documentation explains blueprint sync.
```

becomes:

```text
The {{PROJECT_NAME}} documentation explains {{PROJECT_NAME}} sync.
```

The guard then copies the corrupted staging file without a finding. `--force`
cannot preserve intentional occurrences because replacement happens before the
scan and is unconditional. Common names such as `app`, `agent`, `flow`, `docs`,
or `blueprint` make the blast radius large. Project names containing regular
expression metacharacters also make the unescaped `sed` pattern unsafe.

The fix needs a non-lossy policy. Do not claim or implement a global textual
inverse where none exists. One safe shape is to reverse only occurrences whose
placeholder provenance can be established from the existing blueprint copy,
then block residual project-name occurrences for explicit operator resolution.
If provenance cannot be established reliably, fail closed and require the
operator to put the placeholder in the project change explicitly.

Add regression coverage for:

- a one-word/common-name project whose generic prose uses that word;
- regex-significant legal local directory names;
- an intentional project-name occurrence that must remain literal;
- the normal generated lowercase and uppercase placeholder cases.

### F2 — HIGH: the Markdown/prose exception is dead in the real `a2bp` path

`contamination_scan` decides whether content is prose from the extension of its
first argument. `cmd_a2bp` passes the extensionless path returned by `mktemp`,
not the managed filename. Therefore `is_prose` is always false in production.

Concrete reproduction of the bytes actually scanned:

```text
1|BLOCK|literal per-project state dir (...)|~/.{{PROJECT_NAME}}
scan_rc=1
```

This contradicts the commit's calibration claim and blocks legitimate Markdown
that documents `~/.{{PROJECT_NAME}}`. Pass the logical managed path separately
from the content path (or pass an explicit content kind), and pin the real
`cmd_a2bp` path with a regression test.

### F3 — MEDIUM: the requested edge-case evidence is incomplete

The seven-case fixture does not cover the requested multi-file partial failure,
multi-digit suppression line numbers, filenames with spaces, or no-final-newline
preservation. The implementation appears to handle arrays and partial exit
status correctly by inspection, and the `|N|` suppression encoding avoids the
obvious `1`/`11` collision, but these are high-value boundary claims and should
be executable before this guard is trusted as the only write-path defence.

## Checks run

- `bash tests/a2bp-contamination/test.sh` — PASS (7 current cases)
- `bash -n scripts/blueprint scripts/lib/contamination.sh tests/a2bp-contamination/test.sh` — PASS
- `git diff --check` — PASS
- targeted common-name reverse-substitution reproduction — FAILS safely expected
  behaviour; unrelated prose is rewritten
- targeted extensionless staged-Markdown scan — confirms false BLOCK

## Non-A-07 commits

`205f6f7` (R12a whole-`scripts/lib/` fixture copy) is reasonable by inspection,
but the batch cannot be authorized while A-07 has blockers. `2787332` is a
handover checkpoint only.

## Round 2 — re-review of `d3e21a2`

**Date:** 2026-07-27
**Commits reviewed:** `205f6f7`, `2787332`, `63fac8e`, `5d3ff5e`, `d3e21a2`
**Verdict:** **CHANGES REQUESTED — do not push**

### R2-F1 — BLOCKER: line-content lookup is not provenance when forward forms collide

The global textual inverse is gone, but `_rev[substituted_line]=blueprint_line`
still discards occurrence identity. Two distinct upstream lines can produce the
same project bytes. In that case the first placeholder-bearing line owns the map
key and every matching project line is rewritten, including a legitimate
literal line that never came from a placeholder.

Minimal reproduction against the current helper:

```text
blueprint: {{PROJECT_NAME}}
blueprint: acme-flow
project:   acme-flow
project:   acme-flow
result:    {{PROJECT_NAME}}
result:    {{PROJECT_NAME}}
```

The second line is corrupted. This is the same information-loss problem as R1,
at line granularity instead of substring granularity. It can occur naturally in
prose/examples, especially for a common project name. The current case #7 has no
placeholder-bearing line, so it does not exercise the collision.

`--force` cannot recover the literal occurrence: reversal happens before the
scan and is unconditional, so force copies the corrupted staging bytes. Force
should waive findings, not make an ambiguous transform irreversible.

Provenance must retain occurrence/alignment information (for example, align the
project with the fully substituted blueprint copy and only reverse an unchanged
occurrence whose corresponding upstream occurrence bears a placeholder). If an
occurrence cannot be attributed uniquely, leave its bytes alone and make the
residual-name finding/explicit operator resolution handle it.

### R2-F2 — HIGH: the baseline exemption is an unbounded content set

`_base[line]=1` exempts every occurrence of a line if the same bytes occur
anywhere once in the upstream file. It does not prove that this occurrence was
already present. A project can duplicate or relocate a risky upstream line and
the new occurrence bypasses every check, including host-home paths and residual
project names. Location can also change semantics: bytes that were quoted prose
or inert data upstream can become executable or operative after relocation.

An attacker who already controls the blueprint needs no bypass, but that does
not make the rule sound: an ordinary project edit can introduce a new occurrence
of an existing risky line, and the guard explicitly promises to police what the
back-propagation introduces. Exemption should be occurrence-aware (alignment or
at least a consumed multiset), and should not blanket-exempt a relocated line
from all finding classes.

### R2-F3 — non-blocking checks

- Threading the logical managed path fixes the dead production branch from R1.
  The `.md` rule remains correctly narrow for its stated purpose:
  `~/.{{PROJECT_NAME}}` documents the runtime convention in Markdown, while the
  identical literal in a script remains blocked. Real-CLI cases #10 and #11 pin
  both sides.
- The changed `contamination_scan` signature has one production caller and its
  optional defaults preserve direct helper use. `pull`, `drift`, and bootstrap
  do not call it. No signature regression found in those paths.
- The requested partial multi-file, multi-digit suppression, bare-marker, and
  no-final-newline cases are now executable and pass. I agree that managed
  filenames containing spaces are unreachable under the current exact
  `MANAGED_FILES` validation.
- The file header at `scripts/lib/contamination.sh:24-26` still calls reversal
  “the exact inverse” and “always safe”, contradicting the corrected design and
  this reproduction. Update it with the eventual fix.

### Round 2 checks run

- `bash tests/a2bp-contamination/test.sh` — PASS (16 assertions)
- `bash -n scripts/blueprint scripts/lib/contamination.sh tests/a2bp-contamination/test.sh` — PASS
- `git diff --check` — PASS
- targeted placeholder/literal same-line collision — reproduces corruption:
  two `acme-flow` project lines become two `{{PROJECT_NAME}}` lines
- call-site review for `contamination_scan`,
  `contamination_reverse_substitute`, `_should_substitute`, pull, drift, and
  bootstrap — no signature break found

`205f6f7` remains reasonable by inspection and
`bash tests/agent-activity-bound/test.sh` passes in this review, but this batch
is not clean while R2-F1/R2-F2 remain.

## Round 3 — re-review of `4ac7b01`

**Date:** 2026-07-27
**Commits reviewed:** `205f6f7`, `2787332`, `63fac8e`, `5d3ff5e`, `d3e21a2`, `4ac7b01`
**Verdict:** **CHANGES REQUESTED — do not push**

### R3-F1 — BLOCKER: an LCS match still does not prove occurrence provenance

The implementation now retains the occurrence chosen by `diff`, but the claim
that an unchanged diff record “proves” that the project occurrence came from
that upstream occurrence is false when equal lines can be inserted, deleted, or
moved. `diff` computes a sequence alignment from bytes; it has no edit history.

Concrete reproduction against `contamination_stage`:

```text
blueprint: HEAD
blueprint: {{PROJECT_NAME}}
blueprint: TAIL

project:   HEAD
project:   acme-flow             # newly inserted literal
project:   edited-placeholder    # the former placeholder line was edited
project:   TAIL
```

The forward-substituted upstream has `acme-flow` at line 2, so `diff` aligns
the newly inserted literal with it. The staged result is:

```text
HEAD
{{PROJECT_NAME}}                 # newly inserted literal was corrupted
edited-placeholder
TAIL
```

The alignment file marks project lines 1, 2, and 4 as upstream. Thus the same
false attribution both rewrites the inserted line and exempts it from scanning.
`--force` does not help: it copies the already-corrupted stage.

This is the same information-theoretic limit as R1/R2: neither content nor a
content-derived LCS can recover edit provenance. Position is evidence only
while surrounding edits leave the match unambiguous. The implementation must
fail closed on ambiguous equal-line alignment, or use a representation that
actually carries stable provenance. Add this exact insert-plus-edit
reproducer.

### R3-F2 — BLOCKER: `%L` makes the final incomplete record unparsable here

GNU diff documents `%L` as preserving whether a line has its trailing newline.
For a final line without a newline, the emitted tagged record is itself
unterminated. The loop:

```bash
while IFS= read -r rec; do
```

does not execute for that final unterminated record. Reproduction with both
files containing one incomplete line:

```text
blueprint: {{PROJECT_NAME}}   (no final newline)
project:   acme-flow          (no final newline)
staged:    acme-flow          (no final newline)
alignment: empty
```

So case #15 proves only byte preservation of an unrelated unchanged line; it
does not prove placeholder restoration or exemption on an incomplete line.
In the real CLI, the residual project-name scan then blocks the ordinary
round-trip. Add incomplete-line cases for placeholder restoration and
alignment/exemption. A record protocol must delimit records independently of
the input line ending (or explicitly handle the final failed `read`).

There is a second consequence: if an incomplete record is followed in the
formatted stream by another record from the other side, the tags/contents can
concatenate and corrupt both counter updates. Do not use input newlines as the
alignment protocol delimiter while also asking `%L` to preserve their absence.

### R3-F3 — HIGH: `diff` capability/runtime failure is silently treated as “no alignment”

The three `--*-line-format` switches are GNU extensions, not POSIX. The GNU
implementation supports them (including old GNU diffutils releases), so a
macOS installation that really is GNU diffutils 2.8.1 has the required
feature. That does not make the current call portable or fail closed:

```bash
done < <(diff ... 2>/dev/null || true)
```

suppresses an unsupported-option error, an I/O error, or any other execution
failure and turns it into an empty alignment. That can produce false blocks;
with `--force`, or content not caught by the heuristics, it can copy
unrestored project-specific bytes. Probe the required capability or capture
and validate the exit status separately from normal `diff` status 1. Do not
describe a GNU-only primitive as portable without pinning the runtime contract.

### R3 boundary/path checks

- Empty project file, entirely new file, and blueprint longer than project:
  counter/array handling is sound by inspection.
- CRLF: `mapfile -t` retains `\r`, `%L` retains CRLF, and a targeted
  three-line placeholder/tag reproduction restored byte-correctly.
- Lines whose content begins `=`, `-`, or `+` are safe from tag confusion:
  the format prepends its own tag, and the parser consumes only that byte.
- The two counters are otherwise correctly 1-based for complete records.
- `_should_substitute` remains symmetric at the `pull`/`a2bp` call sites.
  `pull`, `drift`, and bootstrap have no new signature break; the helper is in
  `MANAGED_FILES`, and bootstrap archives tracked `HEAD`.
- `--force` only waives scan findings, as documented, but it cannot repair
  either staging defect above and therefore can make their corruption land.

### Round 3 checks run

- `bash tests/a2bp-contamination/test.sh` — PASS (19 current assertions)
- `bash tests/agent-activity-bound/test.sh` — PASS
- `bash -n scripts/blueprint scripts/lib/contamination.sh tests/a2bp-contamination/test.sh` — PASS
- `git diff --check` — PASS
- targeted insert-equal-to-old-line plus edit-original reproduction —
  **corrupts the inserted literal into `{{PROJECT_NAME}}`**
- targeted one-line placeholder with no final newline — **not restored;
  alignment file empty**
- targeted CRLF plus leading `=`, `-`, `+` lines — restores correctly with
  alignment `1,2,3`

The R2 collision and duplicated-line fixtures are valuable and pass, but they
exercise only the alignment choices GNU `diff` happens to make for those
layouts. They do not establish provenance for the adversarial layouts above.

## Round 4 — re-review of `fd57648`

**Date:** 2026-07-27
**Commits reviewed:** `205f6f7`, `2787332`, `63fac8e`, `5d3ff5e`, `d3e21a2`,
`4ac7b01`, `fd57648`
**Verdict:** **CHANGES REQUESTED — do not push**

### R4-F1 — BLOCKER: contiguous neighbours still do not establish provenance

The new rule refuses the exact case #19 layout, but “the line and both
neighbours align contiguously” only proves that `diff` found an unchanged
three-line block. It does not prove which occurrence or edit history produced
that block. The ambiguity survives by moving the edit outside the block:

```text
blueprint: HEAD
blueprint: {{PROJECT_NAME}}
blueprint: TAIL

project:   HEAD
project:   acme-flow             # newly inserted literal
project:   TAIL
project:   edited-placeholder    # former placeholder moved/edited here
```

`diff` aligns project lines 1–3 contiguously with upstream lines 1–3. The guard
therefore rewrites the inserted literal to `{{PROJECT_NAME}}`, marks all three
lines proven, and copies the corrupt attribution successfully. Moving the
edited line before `HEAD`, or duplicating/moving a larger unchanged context
block, is the same defect. Case #19 passes only because its edited line happens
to interrupt one of the two immediate-neighbour checks.

This also disproves the comment that this version “does not guess”. Any finite
clean-context window can be relocated or duplicated as a unit; content-derived
alignment cannot recover edit history. A safe design must either use durable
provenance outside the edited bytes, or leave literal project-name bytes alone
and require explicit placeholders when attribution is not independently
knowable. Add the reproduction above before another clean verdict.

### R4-F2 — BLOCKER: non-placeholder alignment can still launder relocation

Scoping clean-context checks only to placeholder-bearing upstream lines is not
sound because `_proven` is also the complete exemption list for every scan.
An aligned non-placeholder line is byte-identical to *some* upstream line, but
that does not make this occurrence already upstream at this position.

Concrete reproduction:

```text
blueprint: SAFE
blueprint: Historical /home/someuser/state
blueprint: END

project:   Historical /home/someuser/state
project:   SAFE
project:   END
```

GNU `diff` aligns the relocated host-path line with upstream line 2 and the
guard writes project line 1 to the alignment file. `contamination_scan` then
returns 0: the absolute host path bypasses the BLOCK because line 1 is called
known. The same bytes may be inert in one location and operative in another;
R2-F2 explicitly required relocated risky lines to be judged as new. Case #17
tests duplication, but does not pin this pure relocation alignment choice.

Do not use all LCS matches as a scan exemption. Exemption needs occurrence and
position evidence independent of the ambiguous alignment, or at minimum risky
classes must be scanned when their aligned occurrence changed position/context.
Add the reproduction above.

### R4-F3 — newline protocol and boundary checks are clean

- `%l` plus explicit `%c'\012'` gives every diff record its own LF delimiter.
  A literal LF cannot occur inside one input line. Content containing the two
  bytes backslash + `n` has no special meaning to `%l` and does not collide
  with the delimiter.
- A CR-only input is treated as one LF-delimited diff record whose content
  contains CR bytes. A targeted two-CR record restored the placeholder and
  preserved both CR bytes exactly. This is acceptable for the stated
  line-oriented protocol; CRLF behavior was already clean in Round 3.
- Both files empty produce empty staging and alignment outputs. Empty blueprint
  versus non-empty project and empty project versus non-empty blueprint follow
  the ordinary add/delete records; no counter or final-newline defect found.
- Capturing `diff` status separately and accepting only 0/1 fixes R3-F3. The
  real CLI rejects a staging failure before scan/copy, including under force.

### Round 4 checks run

- `bash tests/a2bp-contamination/test.sh` — PASS (21 printed cases / 22 assertions)
- `bash -n scripts/blueprint scripts/lib/contamination.sh tests/a2bp-contamination/test.sh` — PASS
- `git diff --check` — PASS before this review-note edit
- targeted clean-three-line-block plus moved/edited-placeholder reproduction —
  **inserted literal is rewritten and copied**
- targeted pure relocation of an upstream host-path line — **scan returns 0;
  relocated line is exempted**
- targeted CR-only placeholder restoration — byte-exact PASS
- targeted both-empty staging/alignment — PASS

The record-protocol and runtime-failure fixes in `fd57648` are good. The batch
is still unsafe because the alignment is being asked to prove occurrence
history that it cannot contain, both for rewriting and for scan exemption.

## Round 5 — re-review of `230eea9`

**Date:** 2026-07-29
**Commits reviewed:** `205f6f7`, `2787332`, `63fac8e`, `5d3ff5e`, `d3e21a2`,
`4ac7b01`, `fd57648`, `5a112bd`, `230eea9`
**Verdict:** **CHANGES REQUESTED — do not push**

The handoff named `5a112bd` as the two-change implementation, but that SHA is
the lifecycle-documentation commit. The unconditional scan and round-trip
changes are in `230eea9`; this review attacks that actual delta.

### R5-F1 — BLOCKER: the verifier does not use `pull`'s substitution semantics

The round-trip assertion is the new load-bearing safety property, but
`_contamination_subst_file` does not call the substitution implementation that
defines meaning in production. It uses Bash parameter replacement, while
`substitute_placeholders` and `substituted_blueprint_copy` use an interpolated
`sed` replacement:

```bash
l=${l//\{\{PROJECT_NAME\}\}/$nm}
sed -e "s/{{PROJECT_NAME}}/${proj_name}/g"
```

Those are not equivalent for legal repository basenames containing replacement
metacharacters. A one-backslash basename is concrete:

```text
project directory: foo\bar
blueprint before:  OLD
project edit:      Name={{PROJECT_NAME}}
```

The real CLI accepts `a2bp` and writes `Name={{PROJECT_NAME}}` upstream. The
verifier says its substituted meaning is `Name=foo\bar`; a subsequent real
`pull` renders it as `Name=foobar`, because `sed` consumes the backslash in the
replacement string. Thus staging passed the asserted check while production
substitution gave different bytes.

This is not a request for another parallel approximation. Make forward
substitution one shared primitive and use that exact primitive for pull,
comparison, and verification, with project names treated as literal data.
Add a real-CLI regression using a basename containing `\` (and cover `&`,
which both current implementations happen to interpret specially rather than
literally). The contract can only say “meaning under substitution” when there
is one substitution semantics.

### R5-F2 — HIGH: contract (1) says “never”, but the interface explicitly leaks

Removing the alignment exemption fixes R4-F2 and is the right direction. It
does not establish the stated contract:

> a2bp never introduces project-specific bytes into the blueprint

`--force` deliberately copies every BLOCK finding, a justified
`a2bp-allow` suppresses every check on its line, email findings are NOTICE-only,
and the scanner recognizes only several heuristic classes. Case #5 itself
proves that `/home/someuser/...` reaches the blueprint under `--force`.
Non-`_should_substitute` files are scanned, which is good, but they have the
same overrides. “Every line is scanned” is therefore not “project-specific
bytes never land.”

State the enforceable contract narrowly: by default, recognized BLOCK classes
cannot land; explicit overrides are loud and auditable. If literal
project-name bytes specifically are intended to be impossible even under
`--force`, enforce that invariant outside the waivable scan. Otherwise the
current absolute claim is contradicted by intentional product behavior.

Case #19's reframing is sound only as a test of the narrower invariant that the
literal project basename does not land on the default path. It is dishonest as
evidence for the present universal “no project-specific bytes” contract,
because that contract is neither what the scanner nor the override interface
implements.

### R5 checks run

- `bash tests/a2bp-contamination/test.sh` — PASS (22 printed cases / 23 assertions)
- `bash -n scripts/blueprint scripts/lib/contamination.sh tests/a2bp-contamination/test.sh` — PASS
- `git diff --check` — PASS before this review-note edit
- real-CLI `foo\bar` basename reproduction — **a2bp accepts; verifier and pull
  disagree (`foo\bar` versus `foobar`)**
- status inspection — staging `2`/`3` is correctly caught under `set -e`;
  `cmd_a2bp` intentionally normalizes either refusal into its aggregate
  non-zero result. No false PASS found in that propagation.

The exemption removal closes the relocation leak from R4-F2, and normal
staging failures now fail closed. The round-trip property is not yet total
because it verifies a different forward operation, and the declared
no-contamination contract remains materially broader than the code.

## Round 6 — re-review of `c8f8987`

**Date:** 2026-07-29
**Commits reviewed:** `205f6f7`, `2787332`, `63fac8e`, `5d3ff5e`, `d3e21a2`,
`4ac7b01`, `fd57648`, `5a112bd`, `230eea9`, `c8f8987`
**Verdict:** **CHANGES REQUESTED — do not push**

R5-F2 is closed: the user-facing and implementation contracts now describe the
actual heuristic guard and its deliberate overrides. R5-F1 is closed for the
reported `&` / `\` replacement-template defect, and case #24 is the correct
cross-boundary reproducer. Two boundaries in the new primitive still prevent a
clean review.

### R6-F1 — HIGH: the two-token pipeline re-scans replacement bytes

`bp_replace_literal` treats its individual replacement literally, but
`bp_substitute_line` is a pipeline: it replaces `{{PROJECT_NAME_UPPER}}`, then
hands the result to the lowercase-token pass. A project name containing the
lowercase token therefore causes bytes inserted by the first pass to be
interpreted by the second pass.

Concrete helper reproduction:

```text
name:     x{{PROJECT_NAME}}y
input:    {{PROJECT_NAME_UPPER}}
expected: X{{PROJECT_NAME}}Y
actual:   Xx{{PROJECT_NAME}}yY
```

That contradicts the library's claim that replacement data is “never
re-scanned” and means the answer to the requested “name containing the token
itself” attack is no. Glob characters and internal newlines survive the helper
probe; empty replacement also works. A trailing-newline basename does not:
each `proj_name=$(basename ...)` command substitution strips trailing newline
bytes before the primitive sees them. Such names are unusual but legal on the
pull/a2bp path (bootstrap's kebab-case validation does not constrain an
existing checkout).

Use a one-pass tokenizer/split that recognizes both source tokens before
emitting either replacement, so emitted data cannot become input. Derive the
basename without command substitution if the supported-name contract is truly
arbitrary filesystem basenames; otherwise validate and state the narrower
contract at the CLI boundary. Add token-bearing and newline-bearing basename
regressions matching that decision.

### R6-F2 — BLOCKER: pull/drift now corrupt NUL-containing managed files

Routing pull and drift through `bp_substitute_stream` changes their previous
stream behavior. Bash variables cannot contain NUL. `mapfile`/the per-line
command substitutions therefore discard binary bytes; this probe:

```bash
printf 'A\0{{PROJECT_NAME}}\0Z' > input
bp_substitute_stream input acme | od -An -tx1
```

emits only `41` (`A`) on this host. The prior `sed` path preserved NUL bytes
around the replacement. Thus an existing managed file with binary-ish content
can be truncated by `pull`, and drift compares against the same corrupted
projection. No managed-file invariant rejects NUL content.

The implementation also `mapfile`s the complete file and repeatedly builds
shell strings, so pull/drift changed from streaming `sed` to memory proportional
to the entire file (with additional copying). That is avoidable and is not a
safe primitive for a very large managed file.

Implement the literal replacement in a byte-safe streaming tool/algorithm,
with replacement passed as data rather than program syntax. Pin NUL
preservation, missing-final-newline preservation, and a reasonably large file.
If binary files are intentionally unsupported instead, fail closed before
writing and document/enforce that managed files are text; silent truncation is
not an acceptable unsupported-mode behavior.

### Existing-path review

- Marker merge still calls substitution only after the same successful merge
  or whole-copy branches; `tests/marker-merge/test.sh` passes.
- `_should_substitute` is unchanged and still exempts only
  `scripts/blueprint` and `scripts/new-project.sh` on pull and a2bp.
- `TEMPLATE_FILES` routing is unchanged.
- Bootstrap still uses its own `sed` loop, but bootstrap names are constrained
  to `[a-z][a-z0-9-]*`, so the R5 replacement metacharacters are unreachable
  there. This is not a newly observed bootstrap regression, though “one
  substitution primitive” should continue to be scoped explicitly to
  pull/drift/a2bp rather than bootstrap.

### Round 6 checks run

- `bash tests/a2bp-contamination/test.sh` — PASS (31 assertions)
- `bash tests/marker-merge/test.sh` — PASS
- `bash tests/bootstrap-contents/test.sh` — PASS
- `bash -n scripts/blueprint scripts/lib/placeholders.sh
  scripts/lib/contamination.sh tests/a2bp-contamination/test.sh` — PASS
- `git diff --check` — PASS before this review-note edit
- literal helper probes — empty, glob characters and internal newline pass;
  token-bearing name fails the upper-token case; trailing newline is stripped
  by basename capture
- binary-ish stream probe — NUL input is truncated (`41` only)

The narrowed contamination contract is now honest, and no marker,
substitution-exemption, template-file, or bootstrap routing regression was
found. The shared primitive still needs to be non-recursive across its two
tokens and must either preserve arbitrary bytes or reject unsupported input
before changing it.

## Round 7 — re-review of `b467271`

**Date:** 2026-07-29
**Commits reviewed:** `205f6f7`, `2787332`, `63fac8e`, `5d3ff5e`, `d3e21a2`,
`4ac7b01`, `fd57648`, `5a112bd`, `230eea9`, `c8f8987`, `b467271`
**Verdict:** **CLEAN — do not push (per handoff instruction)**

Both Round 6 findings are closed.

### R6-F1 closure — the composition is genuinely one-pass

`bp_substitute_line` now chooses the source token with the earliest prefix,
appends that token's replacement, and advances only through the unconsumed
input. Replacement bytes never return to `s`, so a name containing a complete
token or a token fragment cannot create another match. Adjacent lower/upper
tokens resolve in source order; incomplete and overlap-shaped suffixes remain
literal; direct line-helper substitution also handles an empty replacement.
The public stream rejects an empty project name deliberately, which is
consistent with its stated filesystem-basename contract.

`${PWD##*/}` preserves basename bytes without a command-substitution boundary,
and `bp_validate_project_name` correctly uses `$'\n'` to reject the
line-unrepresentable case. The rejection reaches pull, drift, and a2bp through
the shared primitive; it does not silently normalize the name.

### R6-F2 closure — binary refusal and newline preservation are sound

`bp_contains_nul` distinguishes both boundary files correctly:

- an all-NUL file becomes empty on the `tr` side and differs from the source,
  so the predicate reports NUL;
- an empty file compares equal to the empty transformed stream, so it reports
  no NUL.

The preflight occurs before any output from `bp_substitute_stream`.
`bp_substitute_in_place` writes only to a temporary file and moves it over the
target only after a successful stream, so NUL refusal leaves the target
byte-identical.

The line loop preserves empty input, a single unterminated line, a terminated
line, multiple empty lines (including files made only of newlines), and mixed
terminated/unterminated content. Its separator-before-subsequent-line scheme
plus the final-byte check emits exactly the source newline topology. No
whole-file array remains.

### Missing-helper and R12a fixture review

The missing-placeholder-helper stubs cover both substitution entry points used
by the CLI. `drift` reaches `arm_gate` first and then fails loudly at the first
substitution; it cannot report a clean no-op. Any `pull` or a2bp path that needs
forward substitution likewise reaches a stubbed operation (directly or through
the contamination helper) and fails rather than copying unverified output.
Commands and exempt-file paths that require no substitution remain
intentionally usable.

The gate-arming fixture's `git ls-tree` enumeration copies every current
`scripts/lib/` file from `HEAD`, so adding another top-level shared helper no
longer creates a selectively incomplete CLI fixture. The fixture remains
commit-faithful and its positive-control Git configuration check still prevents
vacuous gate assertions. No R12a regression was found.

### Round 7 checks run

- `bash tests/a2bp-contamination/test.sh` — PASS (41 assertions)
- `bash tests/gate-arming/test.sh` — PASS (11 cases)
- `bash tests/marker-merge/test.sh` — PASS
- `bash -n scripts/blueprint scripts/lib/placeholders.sh
  scripts/lib/contamination.sh tests/a2bp-contamination/test.sh
  tests/gate-arming/test.sh` — PASS
- `git diff --check` — PASS before this review-note edit
- custom literal probes — adjacent tokens, incomplete/overlap-shaped tokens,
  token fragments spanning emitted replacement/input, and empty replacement:
  PASS
- custom byte probes — all-NUL detected; empty file not detected as NUL: PASS
- custom stream/cmp matrix — empty, one/two newline-only, single unterminated
  text/token line, and mixed final-newline cases: byte-identical PASS
- isolated missing-helper CLI probe — `files` rc 0; `drift` rc 1 with explicit
  missing-helper error; `core.hooksPath=.githooks` already armed: PASS

No correctness, safety, fixture, or DoD defect was found in `b467271`. Round 7
is clean.
