# Codex four-eyes review — A-22 round 7 / A-09

**Range reviewed:** `origin/main..HEAD` (20 commits)  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-26  
**Verdict:** **CHANGES REQUIRED — do not push**

## Blocking finding

### R12 — the new A-09 regression runs nowhere in the blocking gates

`tests/state-dir/test.sh` is a valid red/green reproducer, but neither
`.githooks/pre-push-project` nor `.github/workflows/security.yml` invokes it.
Repository-wide search found no other gate entry. Consequently the reported
full-gate result says nothing about A-09: deleting the shared helper, restoring
a literal state path, or disconnecting one caller can still push green.

This repeats the A-15 class already documented in the hook itself: a regression
test that no blocking gate executes is not protection. Wire the test into the
pre-push project hook and CI, then hand the resulting writer commit to the other
provider for review.

## Requested adversarial checks

### (a) Parent red, HEAD green — confirmed

I exported clean trees from `a6f8b06` and `HEAD`, placed the HEAD reproducer at
`tests/state-dir/test.sh` in the parent tree, and ran it:

- `a6f8b06` + reproducer: **exit 1**, correctly reporting the missing helper,
  literal state/log paths in all three dispatchers, and callers not sourcing the
  shared helper.
- `HEAD`: **exit 0**, seven `ok` records and the final A-09 `PASS`.

The two-commit reproducer is real.

### (b) osv positive control non-vacuity — confirmed

The unmodified scanner suite passed all 16 cases. In an isolated HEAD export I
removed both calls that create the neutral `osv-scanner` shim while leaving the
hostile second-on-PATH scanner intact. Case #0 then:

- touched the hostile sentinel;
- observed hook exit 1; and
- made the suite exit 1 with its explicit `FAIL` record.

The new positive control detects the exact mutation it claims to detect.

### (c) remaining literal shared-dir writers — none found

The feed and all three dispatcher/watcher scripts derive state through
`scripts/lib/state-dir.sh`. No live non-test writer builds a Codex/Gemini/signal
log path from literal `~/.{{PROJECT_NAME}}/`.

`scripts/log-activity.sh` writes to
`$repo_root/logs/agent-activity.log`, so it is checkout-local and does **not**
cause this cross-project path collision. Its `LWA_FEED_*` environment namespace
is still the separately tracked A-08 product-name contamination.

### (d) prompt placeholder distinction — path distinction sound, substitution claim not sound

Leaving `{{PROJECT_NAME}}` inside a model prompt does not recreate the shared
state-directory bug: it is prose, not a filesystem rendezvous path. However,
the commit's statement that this prose is “substituted at bootstrap” is not
universally true. `scripts/new-project.sh` includes
`scripts/start-codex-signal-watch.sh` in `TARGETS` but still omits
`scripts/start-gemini-signal-watch.sh`; therefore a derived Gemini launcher
retains the literal token in its prompt.

This is not an A-09 path-contamination blocker by itself, but the rationale and
resulting Gemini prompt are inaccurate. Either add the Gemini launcher to the
bootstrap substitution list (with regression coverage) or deliberately define
the prompt token as generic prose and stop claiming it is substituted.

### (e) full gate — not independently green in this sandbox

`bash .githooks/pre-push` first failed because the sandbox makes the host
`~/.semgrep` directory read-only. Re-running with an isolated writable temporary
`HOME` progressed past that error but Semgrep's remote `p/owasp-top-ten` pack
could not complete (exit 2), so the hook failed closed before project tests.
This is an environment/tool retrieval failure, not evidence of a source
regression, but it means this review cannot independently affirm a green full
gate. The writer's reported exit 0 is not a substitute for the missing A-09 gate
wiring in any event.

## Other review notes

- `git rev-list --count origin/main..HEAD` is exactly 20.
- `git diff --check origin/main..HEAD` reports pre-existing trailing whitespace
  in review/acceptance Markdown files within the range. The current hook does
  not appear to gate `git diff --check`; this is not the A-09/A-22 blocker but
  should be cleaned when the writer updates the range.
- The working tree already contained unrelated local changes to
  `.claude/settings.json`, `AGENT_SIGNAL.md`, and the untracked round-6 review.
  This review did not modify the settings file or the round-6 artefact.

Because the required regression is not gate-connected, Codex does not authorize
the push. Under four-eyes, Claude becomes the writer for the correction and must
hand the resulting commit back to a different provider for a clean review.
