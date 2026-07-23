# Codex / Slava review — A-01, A-12, A-14 and workflow pins

**Date:** 2026-07-23  
**Verdict:** **CHANGES REQUIRED — do not commit or push this tree yet.**

The roster split is structurally sound: `AGENT_ROSTER.example.md` is the
managed tracked template, `AGENT_ROSTER.md` is ignored, bootstrap seeds the
personal copy, and the feed falls back to the example on a fresh clone. The
workflow actions are pinned, the edited shell parses, the committed settings
JSON parses, and `git diff --check` is clean.

## Blocking findings

### 1. A-01 is incomplete: committed settings still contain host/session paths

`.claude/settings.json` still adds:

- `/home/luiz/.local/share/semgrep-venv/bin/pip`
- `/tmp/claude-1000/-home-luiz-dev-struct2flow-blueprint/.../semgrep.txt`

Both are machine-specific permission artefacts and violate the same rule as the
path moved to `settings.local.json`. The pre-push host-path guard will reject the
first one. The second is worse than a host path alone: it is a transient
Claude-session scratch path that cannot be useful to another clone. Move both
permissions to `settings.local.json` or remove them. Review the other newly
added one-off scanner/recovery permissions and retain in the shared file only
commands intentionally supported for every operator.

### 2. A-14's missing-identity recovery instructions cannot work

`new-project.sh` checks Git identity only after it creates and populates the
target and runs `git init`. On failure it tells the operator they may set an
identity repo-locally and “then re-run”, but the next invocation exits at the
earlier “Target already exists” guard. This leaves a half-bootstrapped directory
and no supported recovery path.

Validate the inherited identity before creating the target (preferred), or make
the post-failure recovery contract truthful and resumable. Add shell regression
coverage for:

1. inherited global identity succeeds and is the initial commit author;
2. missing identity fails before leaving a target directory (or resumes
   deliberately);
3. no founder identity is written to local config.

### 3. `STACK_DEFAULTS.md` contradicts the new A-14 behavior

After correctly explaining inheritance, the section still ends:

> Use repo-local ... The `new-project.sh` bootstrap script should set this
> automatically once

The script now deliberately never sets an identity. Rewrite the stale ending so
the documented contract is singular.

### 4. The audit artefact contradicts its own updated status

`BLUEPRINT-AUDIT-2026-07-23.md` still says near the top and in §4 that nothing
except A-01 was fixed, while §3b says A-12 and A-14 are done and the current
review scope also includes pinned workflows/scanner verification. Reconcile the
status language before committing the audit as the canonical register. Since
this review found A-01 incomplete, its status must not claim the finding is
closed yet.

## Re-review scope

After the blockers are corrected, rerun:

- `git diff --check`;
- `bash -n` on the three edited scripts;
- JSON validation and the host-path guard;
- fresh-bootstrap tests with and without inherited Git identity;
- `blueprint files`, `drift`, `pull`, and `a2bp` smoke tests for the renamed
  roster template;
- the full pre-push gate without `--no-verify`.

Per the four-eyes rule, Claude becomes the writer for any correction and must
hand the resulting commit(s) back to a different provider for clean review.
