# Codex four-eyes re-review — A-22 round 4

**Range reviewed:** `7b3b51f..37759a7`, plus an independent active-doc sweep  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-24  
**Verdict:** **CHANGES REQUIRED — do not push**

## Blocking findings

### R7 — the retracted impossibility claim still appears twice

The substantive §4c option list is now correct: required checks constrain
pushes to protected branches; a latest, already-green SHA may be pushed directly
to the protected branch; and this repository's current workflow cannot produce
that check on a temporary staging ref because its `push` filter names only
`main` (while `pull_request.branches: [main]` filters the PR base).

However, the active audit still makes the retracted categorical claim in two
other places:

1. The A-22 update says the residual gap is “not closable client-side at all”
   and that “on this repo that enforcing layer does not currently exist.”
   The local-hook gap is not closable *by another local hook*, but server-side
   enforcement is available at the workflow/policy cost §4c now explains.
2. §4c's final paragraph says the repo was audited against “a mechanism that
   cannot exist here.” That directly contradicts the corrected option 2 only
   a few paragraphs above. The mechanism can exist; today's no-branches policy
   and workflow triggers do not support it without change.

This is the exact failure mode the round asked me to check: a corrected decision
table coexists with the old conclusion elsewhere in the same active document.

### R8 — “reaches nobody” overstates the detection finding

The underlying A-37 finding is sound and holds under all three options, with an
important distinction:

- Under options 1 and 2, a failing required check already gives synchronous
  enforcement feedback by blocking the merge or push. A separate alert remains
  necessary for failures outside that attempted change path, especially the
  scheduled CVE scan and any post-push rerun.
- Under option 3, alerting is the only automated detection path after a bad
  commit lands, so its absence is more severe.

The workflow has no explicit shared/team failure-routing step, webhook, or
declared alert destination. But “a red security run on `main` currently reaches
nobody” is categorically too strong. GitHub documents configurable web/email
notifications for workflow runs a user triggers, and scheduled-workflow
notifications going to the workflow's designated user. The following clause
already partially acknowledges this with “whatever default email GitHub sends
the pusher,” but delivery depends on notification settings and is not
necessarily email.

State the verified defect as **no configured shared/team alert or transition-edge
failure route**. That preserves the real observability violation without
claiming GitHub has no individual notification channel.

## Scope and repository checks

- `.github/workflows/security.yml` confirms `push.branches: [main]`,
  `pull_request.branches: [main]`, nightly `schedule`, and manual
  `workflow_dispatch`; there is no staging-ref push trigger.
- Independent semantic searches covered `docs/doing/`,
  `docs/waiting-acceptance/`, `docs/config/`, `CLAUDE.md`, `AGENTS.md`, and the
  project-config documents. The two live false restatements above are the
  relevant additional hits. Historical Codex review text correctly records the
  rejected claim and is not stale guidance.
- The requested range notation spans two commits after `7b3b51f`
  (`61f8a96`, `37759a7`), not one. Also, the handoff lists nine A-22/A-37 SHAs
  while calling them ten; `origin/main..HEAD` actually contains twelve commits,
  including three earlier lifecycle/permission commits omitted from the list.
  Resolve the intended push scope and count before the eventual clean-review
  push.

## Official references checked

- GitHub, “About protected branches”
- GitHub, “Troubleshooting required status checks”
- GitHub, “Workflow syntax for GitHub Actions”
- GitHub, “Notifications for workflow runs”

Because this review found documentation corrections, Codex does not authorize
or perform the push. The writer should correct R7 and R8, commit the correction,
and hand the new commit back for clean cross-provider review.
