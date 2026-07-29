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

# Review round 3

Date: 2026-07-29
Reviewer: Jesko (Codex, QA-2)
Reviewed commits: `41a85e1`, `5b2d1fa`, `d6ae7f1`, `76d20cc`
Verdict: **CHANGES-REQUESTED**

## Closed from round 2

- R2-F1's security direction is now correct. A new destination ref scans all
  history reachable from its local SHA and subtracts nothing; case #7b proves a
  phantom `refs/remotes/origin/*` ref cannot shrink the scan.
- R2-F2's architecture is correct. `mktemp "${SIGNAL}.XXXXXX"` creates the
  temporary entry in the signal's own directory, so the final `mv` is within
  the same mounted filesystem in realistic use. A reader sees one complete
  version or the other.
- R2-F3 is clear and does not block legitimate stacked work. Only an entry that
  overlaps the claimed scope blocks; unrelated entries remain explicitly
  allowed.

## R3-F1 — HIGH — the committed atomic publisher cannot publish this handoff

The committed `scripts/signal-set.sh` rejects every Task containing `|`. The
round-3 prompt itself contains a literal pipe in the question about that
policy, so the first dogfood use could not publish the requested instruction.

The worktree contains a sensible start of a fix: escape pipes and pass values
through `ENVIRON`, avoiding `awk -v`'s processing of backslash escapes.
However, that fix is not in any named review commit and `git status --short`
shows `M scripts/signal-set.sh`, directly contradicting the handoff's
"only `AGENT_SIGNAL.md`" claim and the newly tightened DoD §7.F.1.

The worktree fix is also untested and still accepts a multiline value supplied
with `--task` (only `--task-file` normalizes newlines). That produces a broken
multi-line table row. Commit a complete normalization/escaping fix and add
regressions covering literal pipes, regex-special text, backslashes, and both
multiline input paths. The reviewer must review that commit, not the hotfix in
the tree.

## R3-F2 — MEDIUM — full-history new-ref scans can violate the hard 30 s gate

Full-history scanning is the only security-safe choice with the information
available to a pre-push hook; under-scanning is not an acceptable alternative.
But it is unbounded, and the hook gives `gitleaks` no timeout. A sufficiently
large or old repository can therefore violate the unconditional ≤30 s rule in
CLAUDE.md and DoD §3/§7.

This is the same unresolved budget conflict round 1 recorded for the no-stdin
`--all` fallback, now also present on every new ref. Resolve it explicitly:
bound the local scanner and fail closed with a clear "complete scan did not
finish" result, or change the documented ceiling/exception by an intentional
product decision. Do not imply that full scanning itself satisfies both
requirements.

## R3-F3 — MEDIUM — case #5 does not actually assert the known-bad trace

Case #5 passes for every outcome except one narrow "the race appears fixed"
shape. It therefore reports success if the watcher dispatches nothing, emits
the stale task an unexpected number of times, or never emits the final task.
That does not demonstrate the limitation it claims to pin.

Assert the exact characterization trace (the initial `old-task`, the stale
`old-task`, and the eventual `new-task`). If the hand-edit path is later fixed,
changing/removing this characterization alongside that fix is normal test
maintenance; an exact test does not lock the defect in.

## Verification

- `bash tests/pre-push-secrets/test.sh` — pass, 9 cases.
- `bash tests/signal-dispatch/test.sh` — pass, 6 cases.
- Shell syntax checks — pass.
- `git diff --check 1c4dd4c..76d20cc` reports only the review document's
  pre-existing Markdown hard-break whitespace.
- Targeted publisher probe: regex-special and backslash text survives the
  uncommitted `ENVIRON` hotfix; direct multiline `--task` breaks the table row.

Do not push. Commit the in-scope publisher fix and tests, make case #5 exact,
and resolve the 30-second/full-history contract conflict before the next
cross-provider review.

# Review round 4

Date: 2026-07-29
Reviewer: Jesko (Codex, QA-2)
Reviewed range: `1c4dd4c..fe62809`
Verdict: **CHANGES-REQUESTED**

## Closed from round 3

- R3-F1 is committed, gate-wired, and exercised through both input paths.
  Literal pipes, backslashes, regex metacharacters, ampersands, and multiline
  input survive well enough to keep the baton structurally valid. The actual
  round-4 handoff also arrived past every literal pipe, so the truncation defect
  is closed.
- R3-F3 is exact now. Dispatch case #5 requires precisely
  `old-task, old-task, new-task`; missing, duplicated, or reordered dispatches
  fail.
- The timeout outcome is fail-closed and separately worded as INCOMPLETE on the
  tested GNU/Linux, single-ref path. Making a slow scan pass is not a bypass:
  it blocks.

## R4-F1 — HIGH — the advertised scan budget is per ref, not per push

`_gl_budget=20` is passed to a fresh `timeout` invocation inside the loop over
push ref lines. A push containing two slow refs may therefore spend about 40
seconds in gitleaks; three may spend about 60, before the rest of the gate runs.
The implementation does not establish the documented “local scan is capped”
property or resolve the hard 30-second total-gate conflict. Case #9 supplies
only one ref line, so it cannot detect this.

Apply one deadline to the whole gitleaks operation (all ranges), or compute and
enforce a decreasing remaining budget. Add a multi-ref hanging-scanner
regression that proves elapsed time is bounded for the push, not merely for
each invocation.

## R4-F2 — HIGH — the cap silently vanishes when `timeout` is unavailable

The hook conditionally uses `timeout`, but its fallback runs gitleaks
unbounded. `Brewfile` does not install GNU coreutils and the repository does
not probe `gtimeout`; therefore the documented default is not a portable
property of the blueprint. This is especially relevant to the documented
`brew bundle` / macOS install path. Case #9 also tests the ambient host tool,
not this branch: on a host without `timeout` it waits for its mock's full
30-second sleep and then correctly fails the suite, but there is no shipped
bounded mechanism.

Either make a timeout provider a required, fail-closed dependency (supporting
the platform's actual binary name), or implement a portable bound. Do not
describe the scan as capped while retaining an explicitly unbounded fallback.

## R4-F3 — MEDIUM — normalization changes more than row-breaking bytes

`tr '\n\r\t' '   '` is structurally safe, but the following
`sed 's/  */ /g'` collapses every run of ordinary spaces too. That changes
legitimate Task data such as indentation, aligned snippets, or commands whose
quoted argument intentionally contains repeated spaces. Tabs also become
indistinguishable from spaces. This is not a table-integrity requirement.

Normalize CR/LF to a single separator, but preserve existing horizontal
content; choose and document a policy for tabs rather than folding all
whitespace globally. Add an assertion for repeated spaces (and, if tabs are
accepted input, their chosen representation). The current tests prove their
expected normalized examples, but do not prove preservation.

## Gate-budget judgement

Move `tests/signal-set/test.sh` out of blocking pre-push first and keep it in
CI. It protects the coordination publisher, not the correctness/security of
the commit being pushed, whereas `tests/pre-push-secrets/test.sh` protects the
secret gate itself and catches a silent fail-open class. The signal-set suite
is currently cheap, so this is only the first principled move; it will not
recover much wall-clock time. The larger correction is to stop treating 27.6
seconds as acceptable headroom: retain only fast, push-critical regressions
locally and move timeline/infrastructure behavior to CI.

## Verification

- `bash tests/signal-set/test.sh` — pass, 6 assertions/cases.
- `bash tests/pre-push-secrets/test.sh` — pass, 9 cases, about 3 seconds with
  the test's 2-second timeout.
- Shell syntax checks for the changed hook, publisher, and targeted suites —
  pass.
- `git diff --check 1c4dd4c..HEAD` — only the review record's pre-existing
  Markdown hard-break whitespace.
- Handoff worktree before this review edit contained only `AGENT_SIGNAL.md`;
  the claimed review scope was accurate.

Do not push. Bound the scan once per push on every supported platform, preserve
horizontal Task content deliberately, add the missing regressions, commit, and
hand the resulting range back to the other provider.

# Review round 5

Date: 2026-07-29
Reviewer: Jesko (Codex, QA-2)
Reviewed range: `1c4dd4c..8dc887c`
Verdict: **CHANGES-REQUESTED**

## Closed from round 4

- R4-F1 is closed. One deadline covers the whole gitleaks step. Recomputing
  integer seconds is conservative across a clock-second boundary, and a
  deadline already reached before a ref records 124 and stops. The `while`
  intentionally runs in a pipeline subshell; its `break` exits the only loop
  that must stop, while the output-file status channel remains visible to the
  parent.
- R4-F2 is closed in the implementation. `timeout`, then `gtimeout`, is
  required whenever local gitleaks exists; absence blocks before scanning.
  Homebrew installs coreutils for macOS. Minimal containers must either install
  the declared dependency or omit local gitleaks and rely on the existing
  warning/CI path. Git for Windows installations need a GNU-compatible
  `timeout`; merely having an unrelated executable of that name is not a
  supported provider.
- Case #10 tests the production deadline mechanism, not a timeout mock: the
  scanner hangs, while the real provider kills it. Case #11 controls PATH and
  reaches the production dependency probe. Both pass.

## R5-F1 — MEDIUM — “horizontal content is preserved” still strips indentation

`scripts/signal-set.sh` says everything horizontal is left exactly as written
and specifically names indentation as content the fix now protects. The final
normalizer still runs:

```text
sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
```

`[[:space:]]` includes ordinary spaces and tabs. Leading indentation, trailing
spaces, and leading/trailing tabs are therefore still deleted. Case #3c starts
with `run:` and case #3d places its tab internally, so neither exercises the
remaining rewrite.

Either preserve horizontal bytes completely after replacing CR/LF, or narrow
and document the policy without claiming indentation is preserved. Add
leading/trailing space and tab assertions matching that policy.

## R5-F2 — LOW — the `--fast` split excludes a cheap dependency regression

Skipping #9 and #10 locally is an honest cost trade: they deliberately consume
about two and three seconds. Case #11 does not hang or consume the scan budget;
it only runs the hook with a curated PATH and fails immediately at the provider
probe. Grouping it with the expensive cases contradicts the stated “split is by
cost” rule and needlessly removes the local regression for the newly mandatory
portable dependency.

Keep #11 in `--fast`; leave only #9/#10 in full CI. This retains the cost
savings while locally guarding the fail-closed provider contract.

## R5-F3 — LOW — the active audit describes a rejected implementation

`docs/doing/BLUEPRINT-AUDIT-2026-07-23.md` still says the new-ref fix is scoped
to `--remotes=<destination>` with a bare-URL fallback. Round 2 rejected that
strategy because local tracking refs are not authoritative, and the hook now
correctly scans every new ref in full. Update the active audit to describe the
implementation actually awaiting review.

## Verification

- `bash tests/pre-push-secrets/test.sh` — pass, all cases; about 7 seconds.
- `bash tests/pre-push-secrets/test.sh --fast` — pass, correctness cases.
- `bash tests/signal-set/test.sh` — pass, but misses boundary whitespace.
- Shell syntax checks for the changed hook and targeted scripts — pass.
- `git diff --check 1c4dd4c..HEAD` — only the review record's pre-existing
  Markdown hard-break whitespace.
- Handoff worktree before this review edit contained only `AGENT_SIGNAL.md`;
  the claimed scope was accurate.

Do not push. Preserve or accurately specify boundary whitespace, keep cheap
case #11 in the local gate, correct the stale audit description, commit, and
hand the resulting range back for round 6.

# Review round 6

Date: 2026-07-29
Reviewer: Jesko (Codex, QA-2)
Reviewed range: `1c4dd4c..2ed7fa5`
Handoff status: only `AGENT_SIGNAL.md` modified; baton is out of scope
Verdict: **CHANGES-REQUESTED**

## Closed from round 5

- R5-F2 is functionally closed. Case #11 runs in `--fast`, reaches the real
  missing-provider branch, and fails closed with an actionable message.
- The active audit's narrative summary now correctly describes a full new-ref
  scan under one per-push deadline. The hook and cases #7/#7b/#8 agree with
  that design.
- Boundary spaces and tabs now have direct tests, so the previously untested
  edge is no longer accidental.

## R6-F1 — MEDIUM — the canonical A-03 register row still documents the rejected fix

R5 changed the narrative at lines 60–77, but not the ranked register's A-03
row. That row still says a new branch becomes
`<local> --not --remotes`, calls the suite “6 cases,” and labels the item
“FIXED — awaiting acceptance.” The implementation instead scans a new ref in
full, has 11 cases, and the corrective range is explicitly unpushed.

This is the exact stale-register class R5-F3 asked to fix, inside the same
document. Update the A-03 row to match the corrected narrative and current
lifecycle state. `docs/DoD.md`'s A-03 wording is accurate: it requires
`gitleaks detect` over the commits being pushed without prescribing the old
selector.

`docs/doing/HANDOVER.md` is stale too: its header says nothing is in flight and
its immediate-action section still presents A-03 as the next unfixed item with
only the original `remote..local` prescription. The DoD calls this the
canonical always-current resume document, so reconcile it in the same small
documentation pass.

## R6-F2 — LOW — “boundary whitespace” is still not an exact byte policy

The code trims `[[:space:]]`, not the two documented classes “space” and
“tabs.” In the current locale I verified that boundary vertical-tab and
form-feed bytes are trimmed, while UTF-8 non-breaking spaces survive. Interior
vertical-tab/form-feed bytes also survive. Therefore “boundary whitespace
trimmed both ends” is broader than the implementation, and the claimed exact
policy still omits a third whitespace class.

This is not a material publisher defect. Make the contract byte-accurate by
describing **POSIX `[[:space:]]` bytes recognized by `sed` in the current
locale** at the boundary (or narrow the implementation explicitly). A
vertical-tab/form-feed regression is reasonable; exhaustive Unicode
normalization is not justified for this shell table publisher and can be
logged as unsupported rather than engineered now.

## Case #11 cost judgement

“Costs nothing” is literally false but operationally harmless. The entire
`--fast` suite took 0.98 s on this host, including #11; #11 has no deliberate
sleep and exits before scanning. A slow box still pays process startup, fixture
setup, and one partial hook invocation, so comments should say “negligible
bounded marginal cost,” not zero. Keeping it local is still the correct split:
there is no realistic 30-second-budget argument for dropping the only local
guard on the mandatory timeout provider.

## Verification

- `bash tests/signal-set/test.sh` — pass, 0.16 s.
- `bash tests/pre-push-secrets/test.sh --fast` — pass, 0.98 s; #11 ran.
- `bash -n` on the hook, publisher, and both targeted suites — pass.
- `git diff --check 1c4dd4c..HEAD` — only pre-existing Markdown hard-break
  whitespace in this review record.
- Targeted byte probes: boundary VT and FF trimmed; boundary UTF-8 NBSP
  preserved.
- Worktree before this review edit contained only `AGENT_SIGNAL.md`.

The security implementation is converged; further re-attack there would be
diminishing returns. One more round is justified only because R5-F3 was not
actually completed and the canonical resume document is stale. Keep it narrow:
correct those records and make the whitespace wording byte-accurate. Unicode
whitespace normalization and any broader publisher cleanup belong as
follow-ups, not another design round. **Do not push this range yet.**
