# Waiting acceptance — currently empty

Nothing is waiting here. The 2026-07-29 QA pass dispositioned everything:

- **Eight items ACCEPTED** and promoted to [`../done/`](../done/) — BUG-001,
  BUG-002, BUG-003, A-01/A-12/A-14, A-05/A-27, A-09, A-03, A-07. Each work-item
  folder travelled with its row, so the Codex review trail sits beside the
  thing it reviewed.
- **A-22 REJECTED** and reopened into [`../doing/A-22-gate-arming/`](../doing/A-22-gate-arming/).

The verdicts and their evidence are in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).

## Why A-22 was rejected — worth reading even if you skip the rest

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
