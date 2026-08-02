# Waiting acceptance

| Item | Pushed | What to test |
|---|---|---|

_Empty._ Everything pushed up to 2026-08-02 was accepted by the founder that day:
**BUG-005**, **BUG-010**, **FEATURE-001** and **FEATURE-002** are in
[`../done/`](../done/). FEATURE-001's folder — plan, 17 review rounds, the six
defects only implementation found — travelled with it.

---

## A note on the two ID namespaces

`BUG-XXX` / `FEATURE-XXX` are the lifecycle IDs. `A-NN` identifies a **finding**
from the 2026-07-23 audit — a claim that something is wrong, not a work item. Live
items were renumbered on 2026-07-30 (`A-22` → BUG-004, `A-38`/`A-39` → BUG-005,
`A-08` → BUG-006); this file and everything in `done/` keep their `A-NN` IDs,
because the Codex review documents argue about findings by those names. Full rule
in [`../doing/BLUEPRINT-AUDIT-2026-07-23.md`](../doing/BLUEPRINT-AUDIT-2026-07-23.md).

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
