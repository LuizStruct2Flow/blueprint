# Acceptance — Jesko (QA-2) — 2026-07-24

Scope: user-facing acceptance of BUG-001, BUG-002, and BUG-003. This was not a
code review. I ran the delivered software and regression suites from the
current checkout. I did not change source and did not push.

## Verdicts

| Bug | Verdict | User-facing reason |
|---|---|---|
| BUG-001 | **ACCEPT** | The feed starts, streams, stays at one supervisor with no `tail -F`, stops cleanly, detects SIGKILL, and restarts. |
| BUG-002 | **REJECT** | A derived project aligns the feed with its Codex dispatcher, but its Gemini dispatcher still writes to literal `~/.{{PROJECT_NAME}}`; the promised Codex + Gemini isolation is therefore incomplete. Accept BUG-002 together with A-09. |
| BUG-003 | **ACCEPT** | Findings and scanner failures are distinguished, and incomplete scans fail closed. |

## BUG-001 — ACCEPT

Manual test in an isolated archive and isolated `AGENT_STATE_HOME`:

- `--daemon` returned and `--status` reported one live supervisor.
- Appending `BUG001-QA-CODEX-LINE` to
  `$AGENT_STATE_HOME/codex-runs.log` produced exactly one matching `[CODEX]`
  record in `logs/agent-activity.log`.
- While running, the scoped supervisor count was exactly 1.
- A corrected executable-based process probe found **zero actual `tail -F`
  processes host-wide**. (An initial text search falsely counted its own `awk`
  command; that result was discarded.)
- After `kill -KILL <supervisor>`, `--status` returned 1 and reported
  `not running`.
- A subsequent `--daemon` started a different PID; `--stop` stopped it,
  subsequent `--status` reported `not running`, and the scoped supervisor count
  was zero.

The shipped regression `tests/agent-activity-bound/test.sh` also passed all
reported cases. In particular, its executable-aware checks demonstrated:

- 50 concurrent starts converge to one supervisor;
- 40 then 80 transcript files retain one supervisor and zero tails;
- quiet files are not evicted, and truncation/rotation/partial UTF-8 records
  resume correctly;
- concurrent stop/start converges;
- SIGKILL releases the lock and permits restart;
- stale or incomplete identity state fails closed rather than signalling an
  unrelated PID.

This disproves the original unbounded process-growth behavior from the user's
point of view.

## BUG-002 — REJECT

I bootstrapped a real throwaway project:

```text
scripts/new-project.sh testqa /tmp/.../testqa
```

using an isolated `HOME`. Results:

- The derived feed resolved `repo_root` to the throwaway project and
  `state_dir` to the project-specific `$HOME/.testqa`.
- The old `LINKEDIN_WATCHER_AGENT_HOME` and
  `~/.linkedin-watcher-agent` contamination is absent (only a historical
  comment contains the name).
- The derived Codex launcher writes `$HOME/.testqa/codex-runs.log`, matching
  the feed.
- The derived Gemini launcher still creates and writes
  `$HOME/.{{PROJECT_NAME}}/{gemini-runs.log,gemini-last-message.md,signal.log}`.
  It also retains `{{PROJECT_NAME}}` in its prompt.

Therefore a `testqa` user's Gemini output is not read by the default feed.
Although this is the known A-09 limitation, it crosses BUG-002's explicit
promise that the feed's Codex **and Gemini** lines come from the derived
project's own dispatcher state. Treating A-09 as separate would accept a
feature that remains observably broken for one supported dispatcher, so BUG-002
should return to `docs/doing/` and be accepted together with A-09.

`tests/bootstrap-contents/test.sh` and
`tests/bootstrap-identity/test.sh` both passed, but neither contradicts this
manual result: they test bootstrap content hygiene and identity, not Gemini
state-path alignment.

## BUG-003 — ACCEPT

The real `.githooks/pre-push` was run. On this sandbox, real Semgrep crashed
with an `OSError` while trying to write its settings. The gate:

- retried single-job once;
- printed Semgrep's actual traceback;
- reported `semgrep could not complete ... the SAST gate did NOT run`;
- explicitly classified it as a **TOOL failure**, not a finding;
- exited 1, blocking the push.

That is the most important fail-closed user behavior and it worked with the
real scanner.

`tests/pre-push-scanners/test.sh` also passed its shimmed matrix:

- clean scanners pass;
- Semgrep JSON findings block and show the rule without retry;
- Semgrep exit 2 crash blocks as a tool failure and retries once;
- no-JSON exit 1 blocks as a tool failure;
- valid JSON with zero results plus exit 1 blocks as incomplete;
- invalid/non-array result schemas do not fail open;
- a transient failure can recover on the one single-job retry;
- Gitleaks exit 1 is reported as a secret finding;
- Gitleaks exit 2 is reported as a tool failure and blocks.

The regression output currently contains more cases than the
`docs/waiting-acceptance/BUGS.md` row's stale phrase “11 assertions”; this is a
documentation count mismatch, not an acceptance failure. The behavioral
promise is exercised directly and passes.
