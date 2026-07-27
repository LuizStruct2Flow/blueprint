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

