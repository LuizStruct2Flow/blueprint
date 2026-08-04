# Codex re-review round 2 — PR #7 and PR #8

**Reviewer:** Alexey (Codex, Architect)  
**Date:** 2026-08-03  
**Scope:** PR #7 `fix/bug-011-a2bp-pr-filing` at `3547d13`; PR #8
`chore/no-chain-guard` at `dbc1238`  
**Verdict:** **CHANGES REQUESTED on both PRs. DO NOT PUSH. DO NOT MERGE.**

The production fixes for the five round-one findings are mostly sound, but one
unhandled success-shaped response still violates BUG-011, one valid JSON shape
still fails open, and two regressions are green after deleting the behavior they
claim to pin.

## Findings

### F1 — HIGH — PR #7 trusts a successful `gh pr create` with no usable URL

**Location:** `scripts/blueprint:1181-1205` at `3547d13`; unpinned by
`tests/a2bp-pr-filing/test.sh` and `tests/a2bp-e2e/test.sh`.

The missing-`gh` branch and the nonzero `gh pr create` branch now correctly
return `BP_RC_FAILED`. There is still a third no-PR path: any `gh pr create`
invocation that exits zero but prints an empty string, `null`, a warning, or
otherwise non-URL output is accepted unconditionally. Lines 1195 and 1205 then
print `request filed` and return `BP_RC_PENDING`, although no usable PR was
established.

This is the same boundary already defended for `bp_file_existing_pr`: success
status is not enough when the output is the evidence the caller relies on. A
shimmed `gh` whose `pr list` emits `[]` and whose `pr create` runs `exit 0`
reaches this path. Require and test a usable PR URL before returning pending
(at minimum nonempty and non-`null`; preferably the expected GitHub PR URL
shape).

### F2 — MEDIUM — PR #7's fault injection does not prove the BSD probe exists

**Location:** `tests/pull-exec-bit/test.sh:150-177` at `3547d13`.

The production `bp_copy_mode` fix is fail-closed and the caller preserves the
original on failure. However, the injected `stat` shim always exits 1 for both
calls and records nothing. The suite therefore proves only the final
both-methods-failed behavior; it does not prove that both `stat -c` and
`stat -f` were attempted.

**Mutation reproduction:** remove
`|| m=$(stat -f '%Lp' "$src" 2>/dev/null)` from the exported commit and run
`bash tests/pull-exec-bit/test.sh`. The suite still prints PASS. Make the shim
record its arguments and assert both forms, or make `-c` fail and `-f` return a
mode so the BSD fallback is required for the test to pass. Pin the final
fallback `chmod` failure separately if that branch is part of the claim.

### F3 — HIGH — PR #8 accepts schema-invalid JSON as a non-Bash/plain command

**Location:** `scripts/no-chain-guard.sh:76-92` at `dbc1238`; unpinned by
`tests/no-chain-guard/test.sh:83-120`.

The guard now rejects malformed JSON and absent fields, but it does not validate
field types. `jq -r` converts JSON numbers to text, so invalid identities and
commands can reach exit 0 without a valid hook payload having been parsed.

**Reproduction:** 

```text
printf '%s' '{"tool_name":7,"tool_input":{"command":"a && b"}}' |
  bash scripts/no-chain-guard.sh
# rc=0

printf '%s' '{"tool_name":"Bash","tool_input":{"command":7}}' |
  bash scripts/no-chain-guard.sh
# rc=0
```

Validate `tool_name | type == "string"` before the non-Bash pass and validate
the Bash command as a nonempty string. This is an enforcement boundary, so a
schema-invalid but syntactically valid JSON payload must fail closed.

### F4 — MEDIUM — PR #8's missing-`jq` regression reaches the wrong branch

**Location:** `tests/no-chain-guard/test.sh:106-110` at `dbc1238`.

`PATH=/nonexistent` removes both `jq` **and `cat`**. The guard's line 70 hides
the failed `cat` with `|| true`, obtains an empty payload, and blocks at line 71.
It never exercises the missing-`jq` check at lines 73-74. The visible
`printf: write error: Broken pipe` is additional evidence that the consumer
exited before consuming the supplied payload.

**Mutation reproduction:** delete lines 73-74 from an exported copy and point
the test at it. `tests/no-chain-guard/test.sh` still prints
`ok — #4 missing jq fails closed` and exits 0. Construct a PATH containing the
required reader/shell utilities but not `jq` (or inject a failing `jq` shim),
and assert the named missing-`jq` stderr cause rather than only the shared exit
code. The same cause assertion would stop one fail-closed branch from
impersonating another.

## Round-one finding disposition

- **Round-1 F1:** **partially closed.** `NO_GH_PATH` is genuinely gh-free: it
  removes every PATH directory containing an executable `gh`, then independently
  requires `command -v gh` to fail; case #1 also pins the branch-specific
  message. The original branch is fixed. Round-2 F1 is the remaining third path.
- **Round-1 F2:** **production fix closed; regression incomplete.** Every normal
  copy method must now actually succeed, and the caller removes the temp and
  leaves the original untouched. Round-2 F2 refutes the claim that the injection
  proves both probe branches.
- **Round-1 F3:** **closed.** The temp is created in the destination directory;
  stream, mode-copy, and `mv` failure paths all attempt cleanup. If the directory
  is not writable, `mktemp` fails before creating debris and the function returns
  nonzero without touching the destination. I found no ordinary return path
  that abandons an existing temp. An untrappable termination or a concurrent
  permission change can still defeat cleanup, as with any shell best-effort
  cleanup, but does not invalidate the claimed normal failure handling.
- **Round-1 F4:** **partially closed.** Empty input, malformed JSON, absent fields,
  and the actual missing-`jq` production path block with exit 2. `die_closed`
  itself always reaches explicit `exit 2` even if writing stderr fails. Round-2
  F3 shows syntactically valid but schema-invalid payloads still reach exit 0;
  round-2 F4 shows the missing-`jq` test does not exercise its named cause.
- **Round-1 F5:** **closed for wiring, incomplete for behavior.** The suite is in
  the manifest, pre-push gate, CI, and committed settings wiring. Chains, pipes,
  plain commands, non-Bash passthrough, known quoted-prose behavior, and the five
  advertised fail-closed outcomes are represented. The materially unpinned
  properties are field types and branch-specific failure causes (round-2 F3/F4).

## Checks run

- Reviewed exact commit objects and diffs, not the unrelated current branch.
- Exported `3547d13`: `a2bp-pr-filing`, `a2bp-e2e`, and `pull-exec-bit` pass.
- Exported `dbc1238`: `no-chain-guard` passes, with a broken-pipe diagnostic in
  its alleged missing-`jq` case.
- Mutation: removed the BSD `stat -f` fallback; `pull-exec-bit` still passes.
- Mutation: removed the missing-`jq` production check; `no-chain-guard` still
  passes.
- Direct typed-schema probes above reproduce two exit-0 fail-open paths.
- No push and no merge performed.
