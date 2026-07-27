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
