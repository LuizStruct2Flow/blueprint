# Codex review — A-03, dispatch guard, and missed README

Date: 2026-07-29  
Reviewer: Jesko (Codex, QA-2)  
Verdict: **CHANGES-REQUESTED**

## Delivery state

This is not a clean pre-push review of all three items.

- **A-03 is already pushed** as `1c4dd4c` (`origin/main` at review time). The
  findings below therefore describe a defect already on the remote and require
  a follow-up commit; they cannot block the original push.
- The A-07 review closure was pushed while the README change it relied on was
  only in the working tree. The missing README correction now exists in local
  commit `41a85e1`, after the false closure had already been reported.
- The dispatch guard is local commit `5b2d1fa`, not pushed at review time.

## Findings

### F1 — HIGH — A-03 new-branch scans can exclude commits being newly disclosed

`.githooks/pre-push` scans a new branch with:

```text
<local_sha> --not --remotes
```

That subtracts commits reachable from **every configured remote**, not commits
already present at the destination being pushed. A commit that exists on a
private remote but is being pushed for the first time to a public/new remote is
therefore excluded from the secret scan. This violates the gate's actual
boundary: “what am I about to publish to this destination?”

Reproduced in a temporary repository by putting the only commit at
`refs/remotes/private/main`:

```text
all-reachable=1
new-branch-current-selector=0
new-public-origin-selector=1
```

The existing case #3 proves only that the all-zero SHA is not passed to Git; it
does not cover the multi-remote disclosure boundary.

Use the hook's destination argument (`$1`, remote name) to subtract only that
remote's tracking refs when possible, or conservatively scan all history
reachable from the new ref. Add a regression with a commit present on a second
remote and a new branch pushed to the target remote.

Other attacked shapes:

- Force-push `remote_sha..local_sha` correctly selects commits reachable from
  local but not the old remote tip, including divergent history.
- Multiple ref lines are all read and scanned. Shared commits may be scanned
  more than once; that is inefficiency, not a miss.
- Reading stdin once at the top does not starve current downstream steps;
  nothing else consumes stdin. Keeping the captured input is the right shape.
- An annotated tag that ultimately names a commit is handled by `git log`.
  Exotic tags of non-commit objects can fail closed as a tool error, which is
  acceptable.
- The no-stdin `--all` fallback is safe but unbounded. On a large history it
  can exceed the documented 30-second local gate ceiling. The direct/manual
  invocation contract needs either an explicit full-scan exception to that
  ceiling or a bounded, documented alternative; do not silently skip.

### F2 — HIGH — dispatch guard permanently blocks a legitimate identical rerun

The implementation says an identical legitimate re-dispatch costs “at most one
poll interval.” It does not. After a skip it assigns `last_trigger_key="$key"`;
future polls see the same key and return before reconsidering. Even without
that assignment, `last_dispatched_task` remains identical. The task is blocked
for the lifetime of the watcher unless somebody changes the Task bytes or
restarts the process.

Persisting `last_dispatched_task` across the ACTIVE hand-back is necessary to
catch the reported wrong-order edit, but task text is not a round identity.
Identical instructions can legitimately recur. The protocol should carry an
atomic/monotonic dispatch identity (round/generation), or the writer should
publish a single atomic signal-file replacement containing Task and State.
A time delay does not disambiguate stale from intentionally repeated text.

Add a test with two completed rounds whose Task text is intentionally identical;
both must dispatch, while the intermediate wrong-order State flip must not.
The current suite passes because case #2 changes `task-one` to `task-TWO`, so it
does not test the claimed identical-rerun behavior.

The in-memory value also disappears on watcher restart, so the guard does not
cover a wrong-order flip across a restart. That is another reason to model a
round explicitly rather than infer it from task bytes.

### F3 — MEDIUM — pushed-state documentation still says A-03 is next

`docs/doing/BUGS.md` says there is “nothing in flight” and that A-03 is next,
while `1c4dd4c` marks A-03 fixed/awaiting acceptance and is already on
`origin/main`. The pushed item has not been reconciled into
`docs/waiting-acceptance/`, so the lifecycle record contradicts the remote.

Reconcile the audit item and acceptance index/artifact with the true pushed
state when making the F1 follow-up. The correction must explicitly state that
the first A-03 fix was pushed before this review found the multi-remote hole.

## Process judgement — the missed README

A pre-push warning for tracked modified-but-unstaged files is a useful backstop,
and it would have exposed this exact root-level README omission. It is not the
primary fix: repositories often contain legitimate unrelated working-tree
changes, so a generic warning is easy to normalize or cannot safely decide
which files belong to the claim.

The mechanism that should have caught this is a **snapshot-based review
handoff**:

1. The writer names the exact commit(s) being reviewed and records
   `git status --short`.
2. Any tracked modification in the claimed scope blocks the handoff until it is
   committed or explicitly excluded.
3. The reviewer reviews the named commit diff (`git show` /
   `base..commit`), not an uncommitted working tree, and compares the claimed
   file list/doc-sync list to that diff.
4. Before push, emit a prominent warning for any tracked modification outside
   the commit; fail only when policy can identify it as claimed-scope material.

R6 read the working tree and therefore verified bytes that were not in the
commit it blessed. The four-eyes protocol needs the commit snapshot to be the
review object. A pre-push warning complements that rule but cannot replace it.

## Verification performed

- `bash tests/pre-push-secrets/test.sh` — pass (6 current cases).
- `bash tests/signal-dispatch/test.sh` — pass (current cases; missing identical
  rerun case described in F2).
- `bash -n` on both changed scripts and both suites — pass.
- `git diff --check` and `git diff origin/main..HEAD --check` — pass.
- Temporary Git graph reproduced F1 exactly.

Because F1 is already pushed and F2 affects the unpushed guard, the combined
verdict is **CHANGES-REQUESTED. Do not push `41a85e1` / `5b2d1fa` as the clean
reviewed continuation until the other provider fixes these findings and hands
the resulting commit(s) back for cross-provider review.**
