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

---

# Review round 2

Date: 2026-07-29  
Reviewer: Slava (Codex)  
Reviewed commits: `41a85e1`, `5b2d1fa`, `d6ae7f1`  
Handoff status: only `AGENT_SIGNAL.md` modified; baton is out of scope  
Verdict: **CHANGES-REQUESTED**

## Closed from round 1

- The missed README contract change is present in named commit `41a85e1`.
- The byte-identical-Task guard and its false “one poll interval” claim are
  gone. The new regression does prove two legitimate identical rounds fire.
- The lifecycle documents now say explicitly that `1c4dd4c` was pushed before
  the review that found its multi-remote hole.

## R2-F1 — HIGH — destination tracking refs are not a trustworthy exclusion set

`--remotes=<destination>` is a namespace selector for
`refs/remotes/<destination>/*`; it does not ask the destination which commits
it actually has and it does not interpret an unusual fetch refspec.

The safe failure directions are only partial:

- absent refs, stale-behind refs, and fetches stored outside
  `refs/remotes/<destination>/*` cause an over-scan;
- a stale-ahead, manually created, or refspec-repurposed ref inside that
  namespace causes an **under-scan**, because its reachable commits are
  subtracted even though the destination need not contain them.

Checking that `remote.<name>.url` exists proves only that the name is configured;
it does not make the local tracking namespace authoritative. The pre-push input
provides the old SHA for each updated destination ref, but provides no complete,
server-authenticated “all other refs” set for a new branch. Therefore the
security-safe selector for a new destination ref is the same conservative
fallback already used for a bare URL: scan all history reachable from the local
SHA. It may over-scan, but it cannot omit outgoing commits on the strength of
local cache state. Add a regression with a phantom
`refs/remotes/origin/*` ref and prove it is not subtracted.

## R2-F2 — HIGH — the settle window reduces the race but does not close it

The code and docs acknowledge the decisive counterexample: if the writer pauses
longer than `AGENT_SIGNAL_SETTLE` after flipping State first, the watcher
dispatches the stale Task. Six seconds is not a publication boundary and there
is no measured upper bound on a human/tool doing two edits. The default is
therefore not defensible as a correctness guard; increasing it only trades more
latency for a smaller race.

There is a second mismatch between claim and implementation. The watcher does
not wait for “the signal to stop changing”; it waits for the parsed
`Holder|State|Task` key to remain equal. Changes to `Last update`, formatting,
or any other file content do not restart the window. `last_mtime` is updated
but never participates in dispatch. A non-target transition clears
`pending_key` when sampled, which is safe, but a brief transition entirely
between polls is invisible and leaves the old candidate age intact.

Clearing `pending_key` on an observed non-target state does not itself open a
gap; it correctly separates rounds. The gap is inference from sampled,
non-atomic state. Fix the publication boundary rather than tuning the delay:
for example, add a round/generation written with the handoff and dispatch each
generation once, or make the supported handoff path atomically replace the
complete signal and trigger on that publication. Tests must include a pause
longer than the configured settle value after State-first publication. Until
then the suite demonstrates the happy timing case, not the promised invariant.

## R2-F3 — MEDIUM — DoD F.1 excludes untracked omissions and permits ambiguity

The commit-as-review-object rule is correct and would have prevented the README
false closure. Two phrases should be tightened:

- `git status --short` reports untracked files too, but the blocking sentence
  says only “tracked modification”. A newly created, required in-scope test or
  document can be omitted just as a tracked README was. Make **any in-scope
  status entry** block.
- “committed or explicitly named as out of scope” can be read as allowing an
  overlapping modification to be declared away. Require it to be included in
  the named review commit set, or narrow the claimed scope so the entry truly
  does not overlap.

This need not block legitimate stacked work: unrelated entries remain allowed
when explicitly listed, and the writer can define a precise review scope. The
rule should prevent overlap, not require a globally clean tree.

## Verification

- Reviewed `git show` / `1c4dd4c..d6ae7f1` for the three named commits, not
  uncommitted source.
- `bash tests/pre-push-secrets/test.sh` — pass, 8 cases.
- `bash tests/signal-dispatch/test.sh` — pass, 4 cases.
- Shell syntax checks and `git diff --check 1c4dd4c..d6ae7f1` — pass.
- Worktree before this review edit: only `AGENT_SIGNAL.md` modified.

The current tests pass, but they do not exercise the two undercutting cases
above. Do not push. The last writer must fix R2-F1/R2-F2/R2-F3, commit, and hand
the resulting commit set back to the other provider for a clean review.
