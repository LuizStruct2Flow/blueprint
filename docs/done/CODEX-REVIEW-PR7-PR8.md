# Codex review — PR #7 and PR #8

**Reviewer:** Alexey (Codex, Architect)  
**Date:** 2026-08-03  
**Scope:** PR #7 `fix/bug-011-a2bp-pr-filing` at `665c14d`; PR #8
`chore/no-chain-guard` at `da67190`  
**Verdict:** **CHANGES REQUESTED on both PRs. DO NOT PUSH. DO NOT MERGE.**

## Findings

### F1 — HIGH — PR #7 still returns “filed” when `gh` is absent

**Location:** `scripts/blueprint:1141-1144`; missed by
`tests/a2bp-e2e/test.sh:77-98` and `tests/a2bp-pr-filing/test.sh:105-129`.

The `gh pr create` failure branch was corrected to `BP_RC_FAILED` (5), but the
earlier `command -v gh` branch still prints “no PR was opened” and returns
`BP_RC_PENDING` (3). Therefore BUG-011 remains on exactly the common path the
new contract calls out: a user without `gh` is told, by exit status, that a PR
exists when none does.

The E2E test says “gh is absent in this fixture”, but it never removes `gh` from
`PATH`. On this host `command -v gh` is `/home/luiz/.local/bin/gh`; the test
passes because real `gh pr create` fails against its local bare remote and
reaches the *other*, fixed branch. The focused suite only greps the block after
“opening the PR failed”, so it also cannot see the no-`gh` return.

**Reproduction:**

```text
$ command -v gh
/home/luiz/.local/bin/gh
$ bash tests/a2bp-e2e/test.sh
... ok — #1 with no gh ... operational failure ...
PASS
$ nl -ba scripts/blueprint | sed -n '1141,1145p'
1141  if ! command -v gh ...
1142    ... no PR was opened.
1144    return "$BP_RC_PENDING"
```

Fix the no-`gh` return to 5 and make the E2E fixture deterministically hide or
shim `gh`; then assert that the intended branch was reached, not merely that
some later GitHub operation failed.

### F2 — HIGH — PR #7’s mode-copy failure path still installs mode 600

**Location:** `scripts/lib/placeholders.sh:199-205,220-229`.

`bp_copy_mode` deliberately returns success when neither mode probe works, and
also discards a failure from the fallback `chmod`. The caller unconditionally
moves the `mktemp` file into place afterward. Thus the exact safety property
BUG-008 needs is not fail-safe: if mode discovery or application fails, the
original executable is replaced by the default-600 temporary file and the hook
is silently disabled again.

The positive tests all run with functioning `chmod`/`stat`; none injects a mode
read/apply failure. `bp_copy_mode` should return nonzero unless one copy method
actually succeeded, and `bp_substitute_in_place` should remove the temporary and
leave the original untouched on that failure. Add a fault-injection regression.

**Concrete failure scenario:** place a shimmed/failing `chmod` and `stat` ahead
of the system tools (or use a filesystem that rejects the chmod). Lines 203-205
return 0 anyway; line 229 then installs the 600 temporary. The comment “Never
fatal” is the unsafe choice here: aborting this one file replacement preserves
the working executable, while continuing destroys it.

### F3 — MEDIUM — PR #7’s atomicity claim is not guaranteed

**Location:** `scripts/lib/placeholders.sh:217-222,229`.

The new rationale says `mv` is atomic, but `tmp=$(mktemp)` normally creates the
temporary under `$TMPDIR`/`/tmp`, not beside the destination. If the repository
and temporary directory are on different filesystems, `mv` falls back to a
copy-and-remove operation and is not atomic; a crash can leave a partial target,
which is the failure the comment claims cannot occur.

Create the temporary in the destination directory (with a collision-safe
template derived from the destination) and clean it on every failure path. This
also makes the final rename genuinely same-filesystem atomic. `cat > "$f"`
would preserve mode but lose atomic replacement, so it is not the better fix.

### F4 — HIGH — PR #8 fails open on malformed hook input and missing `jq`

**Location:** `scripts/no-chain-guard.sh:43-60`.

The stated contract says “Never fail open on a parse problem”, but both parse
operations discard `jq` errors and turn them into empty strings, which exit 0.
The explicit missing-`jq` path also exits 0. This is not just degraded logging:
the hook exists because compound commands can inherit an early allowlist match
and defeat deny rules. Silently disabling that control recreates the condition
the feature claims to prevent.

**Reproduction:**

```text
$ printf '%s' '{bad json' | bash scripts/no-chain-guard.sh; echo $?
0
$ printf '%s' '{"tool_name":"Bash","tool_input":{"command":"echo ok && rm -rf target"}}' \
    | PATH=/nonexistent /bin/bash scripts/no-chain-guard.sh; echo $?
0
```

The same valid payload with normal `PATH` exits 2, and a pipe-only payload exits
0 as intended. Make missing dependencies and invalid/missing Bash payload fields
fail closed with an actionable message. A non-Bash payload may still pass, but
only after its tool identity was parsed successfully.

### F5 — MEDIUM — PR #8 ships an untested enforcement hook

**Location:** `scripts/no-chain-guard.sh:1-89`; no corresponding entry under
`tests/`, `tests/SUITES.md`, `.githooks/pre-push-project`, or CI.

There is no regression coverage for the payload schema, `&&`, `||`, semicolons,
pipes, quoted-content false positives, malformed JSON, empty commands, non-Bash
tools, or missing `jq`. `bash -n` passes, but that cannot prove hook behavior.
F4 is exactly the kind of contradiction a small table-driven shell suite would
have caught. Add the suite to the manifest and an appropriate gate/CI tier.

## Answers to the requested attack points

- PR #7: exit 5 is correct for both missing `gh` and failed `gh pr create`; it
  does not make `a2bp` unusable, because the branch and manual recovery command
  remain available. Exit 3 must remain the stronger promise that a PR exists.
- PR #7: the consumer-side `null` rejection is useful defence in depth, but it
  does not validate the URL and is not a substitute for fixing every no-PR exit.
  F1 is another path that currently reports filed without a PR.
- PR #7: GNU `chmod --reference` before BSD `stat -f '%Lp'` is a sound probe
  order. Pre-setting mode before a same-filesystem rename is preferable to
  `cat >`, but the implementation must fail closed and create the temporary
  beside the destination (F2/F3).
- PR #7: the contamination shim is legitimate isolation of that suite’s actual
  concern. The E2E expectation change is legitimate in principle, but its
  “gh absent” premise is false on this host, so it currently passes for the
  wrong reason (F1).
- PR #8: unconditional semicolon matching creates known false positives, but
  the documented file/script route makes legitimate work expressible. That is
  an acceptable product choice if pinned by tests.
- PR #8: `.scratch/` is ignored by `.gitignore` and absent from `git archive`;
  `.gitattributes` adds a second guard for accidentally tracked content. I did
  not find a third bootstrap/export path that carries it into a derived project.
- PR #8: failing open when `jq` is missing or parsing fails is a real hole, not
  the right availability trade, because the hook’s own rationale is preventing
  permission-pattern and deny-list bypass (F4).

## Checks run

- `git diff --check` for both branches — clean.
- PR #7 exported snapshot: `tests/a2bp-pr-filing`, `tests/pull-exec-bit`, and
  `tests/a2bp-e2e` — all pass; F1 explains why the latter two BUG-011 suites do
  not establish the absent-`gh` contract.
- PR #8 exported snapshot: `bash -n scripts/no-chain-guard.sh` — passes.
- PR #8 direct payload probes — valid chain exits 2; pipe exits 0; malformed
  JSON exits 0; missing `jq` exits 0.
- No push and no merge performed.
