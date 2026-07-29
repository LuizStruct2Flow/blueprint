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
