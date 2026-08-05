# Acceptance — Jesko (QA-2) — 2026-07-29

**Scope:** every one of the nine rows in `INDEX.md`.  
**Method:** acceptance testing of delivered behaviour, not description review.
Every verdict below rests on commands executed in this pass. Promotion to
`done/` remains the founder's decision.

## Verdict summary

| Index row | Verdict |
|---|---|
| BUG-001 — fork-bomb process leak | **ACCEPT** |
| BUG-003 — scanner failure vs scanner finding | **ACCEPT** |
| A-01 / A-12 / A-14 — roster, host paths, Git identity | **ACCEPT** |
| A-05 / A-27 — bootstrap leaks | **ACCEPT** |
| A-22 — gate arming | **REJECT** |
| A-09 — cross-project log contamination | **ACCEPT** |
| BUG-002 — linkedin-watcher name in a generic file | **ACCEPT** |
| A-03 — secret gate | **ACCEPT** |
| A-07 — a2bp contamination guard | **ACCEPT** |

## Test baseline

The handoff said `origin/main=3ff29d2` and nothing was unpushed. I executed:

```text
$ git rev-parse HEAD
36e4cc0c28cffeecdf2a72c32df8e1865c0ab0fb
$ git rev-parse origin/main
3ff29d2519c57161cc03d5531f3923586e8adb27
$ git status --short
 M AGENT_SIGNAL.md
```

`36e4cc0` is a local documentation-only commit recording the founder's explicit
PDF deferral. The executable delivered state is `3ff29d2`; the extra commit
does not change any tested implementation. The signal modification is this QA
session's required mic claim.

I ran all relevant shipped behavioural suites in isolated temporary fixtures:

```text
a2bp-contamination    0
agent-activity-bound  0
bootstrap-contents    0
bootstrap-identity    0
gate-arming           0
pre-push-scanners     0
pre-push-secrets      0
signal-dispatch       0
signal-set            0
state-dir             0
```

## BUG-001 — ACCEPT

Executed:

```text
$ bash tests/agent-activity-bound/test.sh
ok — #1 50 concurrent starts → exactly 1 supervisor
ok — #15 one resident process; no follow-by-name tails
ok — #6 concurrent stop/start converges to exactly one supervisor
ok — #13 stale state after SIGKILL reports not running
ok — #4 lock released by SIGKILL; restart yields exactly one supervisor
ok — #2 process count independent of transcript count
      (40→80 files: 1 supervisor, 0 tails)
PASS: BUG-001 — one instance, bounded process set, byte-correct reads.
```

This attacks the original leak conditions: concurrent starts, growing
transcript count, stop/start races, and an unclean supervisor death. The
delivered feed remains one supervisor with no `tail -F` population.

## BUG-003 — ACCEPT

Executed the real hook earlier in the A-03 setup with real Semgrep. Semgrep
could not write its settings in this sandbox. The hook retried once, exposed
the traceback, and returned:

```text
❌ semgrep could not complete (exit 1) — the SAST gate did NOT run.
   This is a TOOL failure, not a clean scan, so the push is blocked.
error: failed to push some refs
```

Executed the full classification matrix:

```text
$ bash tests/pre-push-scanners/test.sh
ok — semgrep JSON finding → blocks, rule shown
ok — semgrep crash (exit 2) → blocks as a tool failure, NOT as a finding
ok — R-3: semgrep exit 1 with no JSON → tool failure, not a finding
ok — valid JSON + 0 results + exit 1 → tool failure, not clean
ok — gitleaks exit 1 → blocks as a secret, output shown
ok — gitleaks exit 2 → blocks as a tool failure, output shown
PASS: BUG-003 — scanner failures and scanner findings are distinguished.
```

Both a real scanner failure and the finding/failure matrix fail closed and are
labelled differently.

## A-01 / A-12 / A-14 — ACCEPT

I bootstrapped a real project with an environment-only identity:

```text
$ GIT_AUTHOR_NAME='Jesko QA' \
  GIT_AUTHOR_EMAIL='jesko-qa@example.invalid' \
  GIT_COMMITTER_NAME='Jesko QA' \
  GIT_COMMITTER_EMAIL='jesko-qa@example.invalid' \
  bash scripts/new-project.sh qa-derived /tmp/.../qa-derived
```

Then executed:

```text
$ rg -n '/(Users|home)/[A-Za-z0-9_.-]+/' \
    /tmp/.../qa-derived/.claude/settings.json
[no output]
host_matcher_rc=1

roster_example_tracked=yes
live_roster_ignored=yes
commit_author=Jesko QA <jesko-qa@example.invalid>
local_user_config=NONE
```

The independent identity suite also passed all five behaviours:

```text
ok — script never writes a git author identity
ok — missing identity fails before any filesystem change
ok — inherited identity is the initial commit author
ok — no repo-local identity written
ok — bootstrap echoes the identity it commits as
PASS: bootstrap inherits git identity and fails safely without one.
```

The committed settings are host-agnostic, the example/live roster split works
in an actual derived repository, and bootstrap used without persisting the
operator identity.

## A-05 / A-27 — ACCEPT

The real derived project contained only the lifecycle templates where the
blueprint currently has its own work:

```text
$ find /tmp/.../qa-derived/docs/doing \
       /tmp/.../qa-derived/docs/waiting-acceptance -type f
.../docs/doing/HANDOVER.md
.../docs/doing/README.md
.../docs/waiting-acceptance/README.md

project_config_overview.md: NOT_TRACKED
project_config_paths.md: NOT_TRACKED
project_config_dod.md: NOT_TRACKED
project_config_security.md: NOT_TRACKED
project_config_infra.md: NOT_TRACKED
```

Thus none of this repository's audit, bug, plan, review, acceptance, or signal
work items shipped. The adversarial fixture additionally planted the old leak
inputs and executed a real bootstrap:

```text
$ bash tests/bootstrap-contents/test.sh
ok — untracked .env did not ship
ok — gitignored logs/ did not ship
ok — tracked blueprint work items excluded (export-ignore)
ok — tracked work items absent from the derived project's git history
ok — .env absent from the derived working tree
PASS: A-05 — bootstrap ships tracked template content only.
```

This proves both requested boundaries: no `.env`, and none of the blueprint's
own work items, including from history.

## A-22 — REJECT

The shipped paths do arm the gate when used:

```text
$ bash tests/gate-arming/test.sh
ok — precondition: a clone has core.hooksPath UNSET (the defect)
ok — #2 the feed arms an unarmed clone (A-22 reproducer)
ok — #5 foreign hooksPath preserved AND warned about
PASS: A-22 — the gate arms itself on paths that already run.
```

The live A-09 feed probe also printed:

```text
✓ gate: armed (core.hooksPath=.githooks)
```

But the standing acceptance boundary is stronger: a human must not be able to
clone and push without ever invoking feed or drift. I created a fresh local
clone, committed a newly generated high-entropy fake GitHub token, redirected
`origin` to a throwaway bare repository, and executed a real push without
running either arming path:

```text
fresh_clone_hooksPath=UNSET
real_ungated_push_rc=0
To /tmp/.../destination.git
 * [new branch] HEAD -> a22-probe
secret_commit_reached_destination=yes
```

The caveat from round 2 therefore still stands exactly. The implemented
self-arming paths are useful, but the promised pre-push gate is not an
always-armed property of a clone. **REJECT.**

## A-09 — ACCEPT

In the real `qa-derived` bootstrap I executed the shared state derivation and
started its actual feed under an isolated home:

```text
derived_state_dir=/tmp/.../.qa-derived
contains_literal_placeholder=no
contains_linkedin_watcher=no
live_feed_probe_matches=1
```

I appended `A09-LIVE-CODEX-PROBE` to that derived state directory's
`codex-runs.log`; the running derived feed emitted it exactly once. The
cross-component suite then executed both-project isolation, override behavior,
and all dispatcher/feed consumers:

```text
$ bash tests/state-dir/test.sh
ok — #1 two projects derive two distinct state dirs
ok — #2 AGENT_STATE_HOME overrides the derived dir
ok — #3 dispatchers build paths without the literal placeholder
ok — #4 agent-activity and all Codex/Gemini launchers source the helper
PASS: A-09 — feed and dispatchers rendezvous on one per-project state dir.
```

The feed reads the derived project's own dispatcher log, not another project's
state.

## BUG-002 — ACCEPT

This is accepted with A-09, as required by the original rejection. In the
actual bootstrapped scripts, the only `linkedin-watcher` occurrence was the
historical BUG-002 comment:

```text
scripts/agent-activity.sh:53:
# (BUG-002: this used to hardcode ~/.linkedin-watcher-agent).
```

No executable path contained that name or the literal placeholder; the real
feed used `/tmp/.../.qa-derived` and consumed the probe exactly once. The
Gemini launcher now shares the same helper, closing the specific half that
failed round 1.

## A-03 — ACCEPT

First I ran the full outgoing-range suite:

```text
$ bash tests/pre-push-secrets/test.sh
ok — #1 a secret in the pushed commits blocks the push
ok — #3 a new branch scans its own commits
ok — #7 a new ref is scanned in full — no remote's refs are subtracted
ok — #7b a phantom destination tracking ref does not shrink the scan
ok — #8 a bare-URL destination scans all reachable history
ok — #9 an over-budget scan blocks AS incomplete
ok — #10 one budget bounds the whole push
ok — #11 no timeout provider fails closed
PASS: A-03 — the secret gate scans the pushed commits, not the empty index.
```

Then I used real Gitleaks 8.30.1, a real local bare remote, the real
`.githooks/pre-push`, and a newly generated high-entropy fake GitHub token in a
committed file. A direct redacted scan first confirmed the token was detectable
(`leaks found: 1`, exit 1). The real push produced:

```text
real_push_rc=1
→ Secret scan (gitleaks)...
INF 2 commits scanned.
WRN leaks found: 1
GITLEAKS_RC=1
❌ gitleaks found a secret in the commits you are pushing.
error: failed to push some refs
remote_has_main=no
secret_commit_reached_remote=no
```

The gate really stopped a real push before disclosure.

Trust note: `1c4dd4c` reaching origin before four-eyes, followed by this reviewer
finding a genuine multi-remote under-scan, is a serious process failure and
made the initial delivery untrustworthy. I therefore did not accept A-03 from
the eleven-round paper trail or shim suite alone. The final verdict changes to
ACCEPT only because the corrected final state passed both the adversarial range
matrix (including the exact multi-remote hole) and the independent real-token,
real-Gitleaks, real-push test above. This verdict does not excuse the premature
push.

The co-delivered atomic signal tests also executed cleanly:

```text
PASS: the dispatcher will not fire on a Task nobody has updated.
PASS: the baton publishes atomically and survives pipes, backslashes and newlines.
```

## A-07 — ACCEPT

I cloned the blueprint into a temporary source repository, bootstrapped a real
derived project from it, appended this contamination to a managed file:

```text
A07 REAL CONTAMINATION PROBE: operator path /home/alice/private/work
```

Then executed the derived project's real CLI end to end:

```text
$ ./scripts/blueprint a2bp docs/way-of-working.md
real_a2bp_rc=1
BLOCK docs/way-of-working.md:695 — host home path
reject docs/way-of-working.md (contamination — not copied)
✗ Nothing copied — 1 file(s) blocked by the contamination guard.
source_hash_before=915b655c...
source_hash_after=915b655c...
contaminated_text_in_blueprint=no
blueprint_index_changed=no
```

The real project-to-blueprint write was refused without touching either the
destination file or index. The full 28-case suite also passed, including
ordinary clean back-propagation, staged-line scanning, partial multi-file
failure, exact suppressions, binary refusal, failure-closed staging, and
metacharacter-bearing project names:

```text
$ bash tests/a2bp-contamination/test.sh
ok — #18 with no exemption list, even an untouched upstream risky line is scanned
ok — #18b ordinary edits to clean files still back-propagate
ok — #21 staging failure exits non-zero
ok — #24 pull→a2bp round-trips byte-identically
PASS: a2bp reverse-substitutes and refuses to launder project specifics.
```

The delivered guard blocks a real contaminated back-propagation end to end.

## Overall QA gate

**Eight rows ACCEPT; A-22 REJECT.** No item was promoted to `done/`.
`docs/way-of-working.pdf` was excluded from defect consideration exactly as the
founder directed.

---

## Previously dispositioned

The 2026-07-29 QA pass dispositioned everything before this:

- **Eight items ACCEPTED** and promoted to this folder — BUG-001,
  BUG-002, BUG-003, A-01/A-12/A-14, A-05/A-27, A-09, A-03, A-07. Each work-item
  folder travelled with its row, so the Codex review trail sits beside the
  thing it reviewed.
- **A-22 REJECTED** and reopened as **BUG-004** in
  [`BUG-004-gate-arming/`](BUG-004-gate-arming/).

The verdicts and their evidence are in
this document.

*(Moved here from `waiting-acceptance/INDEX.md` on 2026-08-03 when that file
was dissolved — it is a record of ACCEPTED work, so it belongs beside the
work rather than in the folder for things still waiting.)*
