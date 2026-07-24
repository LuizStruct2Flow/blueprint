# Acceptance — Jesko round 2 (2026-07-24)

**Role:** Jesko (QA-2)  
**Question:** Does the delivered software do what was promised, to a user?  
**Tested revision:** local `HEAD` `0527cc1540b2d22f689efb70ff655a78e267de7c`

## Verdicts

| Finding | Verdict |
|---|---|
| A-01 — committed settings are host-agnostic | **ACCEPT** |
| A-05 — bootstrap ships tracked template content only | **ACCEPT** |
| A-12 — roster follows the `.env` model | **ACCEPT** |
| A-14 — bootstrap inherits Git identity | **ACCEPT** |
| A-15 — shell suites execute in gates | **ACCEPT** |
| A-27 — all five project configs stay private | **ACCEPT** |
| A-36 — GitHub Actions are SHA-pinned | **ACCEPT** |

## Evidence run

### A-01 — ACCEPT

- `.claude/settings.json` is tracked.
- Ran the same specific-host matcher used by `.githooks/pre-push`:
  `/(Users|home)/[A-Za-z0-9_.-]+/`. It returned no matches.
- The remaining `/Users/**/**` and `/home/**/**` entries are generic wildcard
  rules, not `/home/<user>/` or `/Users/<user>/` host paths, and do not match
  the guard.
- Ran `.githooks/pre-push`. It reached the security stages but stopped before
  the host-path stage because Semgrep could not write
  `~/.semgrep/settings*.yml` in this read-only Codex sandbox. The hook correctly
  classified that as a tool failure and failed closed. This is not an A-01
  failure: the committed settings contain no host identity, and the hook's
  exact host-path assertion is clean.

### A-05 — ACCEPT

Ran `bash tests/bootstrap-contents/test.sh`. The suite creates a real committed
mini-blueprint, plants an untracked fake `.env` containing a fake `SONAR_TOKEN`,
plants `logs/`, a personal roster, and a tracked
`docs/doing/PLAN-BUG-999.md`, then runs the shipped bootstrap.

Observed:

- `.env` did not reach the derived working tree.
- `logs/agent-activity.log` did not reach it.
- The tracked blueprint work item was absent from both working tree and initial
  commit.
- Lifecycle structure and templates still shipped.
- Core blueprint content and tests still shipped.

The suite passed. Its history assertion tests the genuine old history leak
(the tracked work item), not the old tautological “`.env` is not committed”
claim.

### A-12 — ACCEPT

The same real bootstrap fixture proved:

- tracked `AGENT_ROSTER.example.md` shipped;
- gitignored `AGENT_ROSTER.md` was seeded;
- the seeded file was byte-identical to the example;
- the planted operator-specific `AGENT_ROSTER.md` was not inherited.

Also ran `git check-ignore -v AGENT_ROSTER.md`; `.gitignore` owns the ignore.

### A-14 — ACCEPT

Ran `bash tests/bootstrap-identity/test.sh`.

Observed:

- bootstrap contains no command that writes `user.name` or `user.email`;
- with global and system Git config hidden, missing identity failed with the
  promised legible message before the target existed;
- with only `GIT_AUTHOR_*` and `GIT_COMMITTER_*` environment variables, the
  bootstrap succeeded;
- the initial commit used that exact author;
- the derived repo had no local `user.*` configuration;
- bootstrap printed the identity it used.

The suite passed.

### A-15 — ACCEPT

- Ran `.githooks/pre-push-project` directly. It executed and passed the marker
  merge, agent-activity fast suite, scanner-classification suite,
  bootstrap-content suite, and bootstrap-identity suite.
- Ran `sh -n` on both hook files; both parse.
- Inspected the executable GitHub workflow gate:
  `.github/workflows/security.yml` has a `shell-tests` job on pushes and pull
  requests. It runs the full agent-activity suite plus marker merge, bootstrap
  identity, bootstrap contents, and scanner tests.
- The local generic pre-push hook sources `.githooks/pre-push-project`; the
  current checkout has `core.hooksPath=.githooks`.

Thus regressions in the sync CLI or bootstrap are exercised both before push
in an armed checkout and after push in the mandatory CI job; they cannot remain
green.

### A-27 — ACCEPT

- `git check-ignore -v` identified `.gitignore` rules for
  `project_config_overview.md`, `project_config_paths.md`,
  `project_config_dod.md`, `project_config_security.md`, and
  `project_config_infra.md`.
- All five remain tracked template inputs in the blueprint itself, as intended;
  a derived repo starts with a new index, so those ignore rules keep all five
  out of its first commit.
- The A-05 bootstrap fixture also verified that tracked-but-ignored template
  material still reaches the derived working tree, preserving the “fill these
  locally, do not publish them” workflow.

### A-36 — ACCEPT

Ran:

```sh
rg -n '^[[:space:]]*uses:' .github/workflows
```

Every `uses:` reference is pinned to a 40-character commit SHA:
`actions/checkout@d234...` and `gitleaks/gitleaks-action@e0c4...`. No mutable
action tag remains.

## A-22 caveat

I reproduced A-22 by cloning this repository to a temporary directory:
`git config --local --get core.hooksPath` returned unset. A-22 is therefore
still open and should remain first in the queue.

It does **not** require rejecting these seven:

- A-01 is a clean committed artifact plus an executable guard.
- A-05/A-12/A-14/A-27 are bootstrap behavior, and bootstrap itself wires
  `.githooks` in the derived project.
- A-15 has two independently present gates: the locally armed pre-push project
  guard and GitHub Actions on every push/PR.
- A-36 is the integrity of the workflow references themselves.

A-22 weakens *when* a fresh blueprint clone blocks a bad change (before rather
than after push), but it is a separate delivery promise. Acceptance here must
not be read as acceptance of A-22.

## Test-environment note

The dispatch context said `origin/main` was `0527cc1`. Local `HEAD` is exactly
that revision, but the local remote-tracking ref had advanced to `3590549` by
the time of testing. No fetch, source edit, commit, or push was performed.
