# Codex four-eyes re-review — A-22 round 3

**Range reviewed:** `1eaf6d9..7b3b51f` plus the requested A-37 sanity check  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-24  
**Verdict:** **CHANGES REQUIRED — do not push**

## Blocking finding

### R6 — A-37 incorrectly says required checks cannot gate a direct push

`10d98bd` correctly establishes the important facts: the local hook is advisory,
`main` is currently unprotected, and the existing push-triggered workflow runs
only after a commit has landed on `main`.

The conclusion at `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md` §4c is nevertheless
too broad:

> GitHub's required-status-checks enforce at merge time; turning them on for
> direct pushes to `main` blocks the trunk-based flow outright, because a check
> cannot have passed on a sha that has not been pushed yet.

GitHub documents required checks as blocking both merges **and pushes** to a
protected branch. It also documents a direct-push path: an exact commit that is
up to date and has passed the required checks can be pushed to the protected
branch without checking a new merge commit. In this repository, the current
workflow listens to `pull_request` and pushes to `main` only, so no check can run
for an unpushed local SHA; but that is a property of the present workflow, not a
limit of required checks. A workflow triggered on a temporary staging branch
could validate the exact SHA, after which that same SHA could be pushed directly
to protected `main`.

That path still violates this repository's stricter “no branches” rule, so the
founder's trade-off is real. But option 2 is incomplete when it says “Protected
`main` + short-lived PRs” is the only enforcing alternative, and the categorical
claim that required checks enforce only at merge time is false. Revise §4c to
include both enforcing variants:

1. short-lived PRs; or
2. stage the exact SHA on another ref, wait for required checks, then directly
   push that already-green SHA to protected `main`.

Official references:

- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>
- <https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks>

## Requested verification

- **`#8` genuinely pins both legs independently.** A temporary mutant that
  silenced only the warning produced `FAIL-output`; a second mutant that kept
  the warning but returned 7 produced `FAIL-status rc=7`. These are distinct
  failure paths and neither assertion is vacuous.
- **The new no-work-tree warning does not add noise to either feed mode.**
  `scripts/agent-activity.sh` invokes `arm_gate "$repo_root"` for `--daemon` and
  foreground operation; `repo_root` is derived from the script location and is
  nonempty. The new branch is therefore not entered. `scripts/blueprint`
  likewise passes either `git rev-parse --show-toplevel` or `pwd`, always as an
  explicit nonempty argument. Outside a work tree those callers retain the
  pre-existing “pre-push missing / not executable” warning; R4 adds no new
  caller noise.
- **R5 was the only documentation defect introduced by the `1eaf6d9`
  A-22 correction.** The duplicate A-07 pointer is gone and one substantive
  A-07 bullet remains. The audit and `HANDOVER.md` otherwise consistently
  describe A-22 as fixed-awaiting-acceptance and preserve the human-clone gap.
  R6 belongs to the later, separately requested A-37 commit.
- `bash -n` passes for `gate.sh`, the suite, and both production callers.
- The unmodified gate-arming suite passes all 11 cases and self-reports 2 s.

Because this review found a documentation correction, Codex does not authorize
or perform the push. Under the four-eyes rule, the writer should correct A-37,
commit it, and hand the new commit back for clean cross-provider review.
