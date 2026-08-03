# Waiting acceptance

| Item | Pushed | What to test |
|---|---|---|
| [**BUG-004**](BUG-004-gate-arming/) — a fresh clone is ungated | 2026-08-02 | **Both halves closed.** Half A was branch protection; Half B is GitHub **secret-scanning push protection**, now enabled — server-side, so it blocks a pushed secret regardless of whether a local hook ran. Test: try pushing a commit containing a recognisable token and confirm GitHub refuses it. |
| **BUG-006** — one project's env namespace shipped to every project | 2026-08-03 | `LWA_*` variables were baked into managed scripts. Test: `grep -rn 'LWA_' scripts/` returns only back-compat fallbacks, and `bash tests/env-namespace/test.sh` passes. |
| **BUG-008** — a pulled hook came out non-executable | 2026-08-03 | The gate was armed but silently never ran, because git skips a non-executable hook without a word. Test: `blueprint pull .githooks/pre-push` in a derived project, then `ls -l .githooks/pre-push` shows the exec bit. |
| **BUG-009** — the seed template and this repo's own config were the same files | 2026-08-03 | Anything the blueprint wrote about itself propagated to every derived project. Test: `ls templates/` holds the seed `project_config_*.md`; the root copies are this repo's own and are `export-ignore`d. |
| **BUG-011** — `a2bp` reported a request as FILED when no PR was opened | 2026-08-03 | Exit `3` now promises a reviewer has something in front of them; a pushed branch with no PR is `5`. Test: `blueprint a2bp <file>` with `gh` unavailable — it must fail loudly and name the branch, not claim success. |
| **BUG-012** — bootstrap wrote an absolute `blueprint_source` | 2026-08-02 | Fixed by the linkedin-watcher-agent session. Test: bootstrap a project, move either checkout, confirm `drift` still resolves. |
| **BUG-013** — `drift` told every derived project "This IS the blueprint" | 2026-08-02 | The big one. Test: run `bash scripts/blueprint drift` in a derived project — it must report real drift, not "This IS the blueprint". |
| **BUG-014** — a test suite wrote into the repo under test | 2026-08-02 | Test: `git config --get core.hooksPath` still set after a gated push. |
| **BUG-015** — six libs the CLI needs never shipped | 2026-08-02 | Test: `blueprint pull` in a derived project, then confirm `blueprint a2bp --dry-run` runs there at all. |
| **BUG-016** — a partial pull claimed a full sync | 2026-08-03 | `drift` then reported zero commits behind while files were stale — a false "in sync" is invisible until someone diffs by hand. Test: `blueprint pull <one file>`, then `blueprint drift` still reports the remaining commits. |
| **BUG-017** — closed OBSOLETE | 2026-08-03 | No action. Kept as an audit trail with the evidence that made it obsolete; deleted at the next grooming. |
| **BUG-018** — `pull` died where there is no TTY | 2026-08-03 | Test: run `blueprint pull` with stdin closed (`blueprint pull < /dev/null`) — it must degrade rather than abort. |
| **BUG-019** — the coordination baton was a TRACKED file | 2026-08-03 | **Changes how you coordinate.** The live baton is `logs/state/signal.md` (untracked); `AGENT_SIGNAL.md` is the protocol; history is `logs/state/signal-history.log`. Test: dispatch an agent, run `git switch` / `git stash` mid-dispatch, and confirm the dispatch still completes. **Do not hand-edit baton rows** — publish with `scripts/signal-set.sh`. |
| **BUG-020** — agent state lived OUTSIDE the project in `~/.<repo>` | 2026-08-03 | Deleting the project did not delete its state, and a project bootstrapped at the same path inherited the old records. Test: `ls logs/state/` holds the run logs, and nothing writes to `~/.<repo>` any more. |

Earlier work accepted the same day — **BUG-005**, **BUG-010**, **FEATURE-001**,
**FEATURE-002** — is in [`../done/`](../done/).

---

## A note on the two ID namespaces

`BUG-XXX` / `FEATURE-XXX` are the lifecycle IDs. `A-NN` identifies a **finding**
from the 2026-07-23 audit — a claim that something is wrong, not a work item. Live
items were renumbered on 2026-07-30 (`A-22` → BUG-004, `A-38`/`A-39` → BUG-005,
`A-08` → BUG-006); this file and everything in `done/` keep their `A-NN` IDs,
because the Codex review documents argue about findings by those names. Full rule
in [`../config/BLUEPRINT-AUDIT-2026-07-23.md`](../config/BLUEPRINT-AUDIT-2026-07-23.md).

## Previously dispositioned

The 2026-07-29 QA pass dispositioned everything before this:

- **Eight items ACCEPTED** and promoted to [`../done/`](../done/) — BUG-001,
  BUG-002, BUG-003, A-01/A-12/A-14, A-05/A-27, A-09, A-03, A-07. Each work-item
  folder travelled with its row, so the Codex review trail sits beside the
  thing it reviewed.
- **A-22 REJECTED** and reopened as **BUG-004** in
  [`../doing/BUG-004-gate-arming/`](../doing/BUG-004-gate-arming/).

The verdicts and their evidence are in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).

## Why BUG-004 (then A-22) was rejected — worth reading even if you skip the rest

`arm_gate` genuinely works: the feed and `blueprint drift` both arm an unarmed
clone, and `tests/gate-arming/` proves it. But the acceptance boundary was never
"the arming paths work" — it was **"a human must not be able to clone and push
without ever invoking them."** QA-2 tested that directly rather than restating
the caveat: a fresh clone, a newly generated high-entropy token committed,
`origin` redirected to a throwaway bare repo, and a real push executed.

```text
fresh_clone_hooksPath=UNSET
real_ungated_push_rc=0
secret_commit_reached_destination=yes
```

So the secret gate delivered as A-03 is real, **and** it is not a property of a
clone. Both are true. A pre-push hook is advisory by construction — repo-local,
absent on a clone, defeated by `--no-verify` — so this is not closable by
another local hook. Enforcement is server-side, which is available here at the
policy cost set out in **A-37**: required checks do block direct pushes to a
protected branch, but a SHA must exist on some ref for checks to run before it
reaches `main`, and this repo is trunk-based with no branches. That is a
founder trade, not an impossibility.

## How acceptance works on this project

Acceptance for agent-protocol and repo-infrastructure work is **delegated to
QA-2** (founder decision 2026-07-29). Scope, conditions, and the stated
independence limitation are in `project_config_dod.md` §"Acceptance authority".
User-surface work is explicitly excluded and still needs the founder's eye.
