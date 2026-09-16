# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-040** | **The managed `.githooks/pre-push` stops telling projects to edit it, and finds IaC under `infrastructure/` as well as `infra/`.** From storm2flow, `FR-storm2flow-prepush-layout`. `.githooks/pre-push:528-529` says to "edit this block during bootstrap", but the hook has no marker lines, so a pull replaces the whole file and those edits are lost. TASK-026's skip messages (`:542-547`) already point at the pull-safe home below the end marker of `.githooks/pre-push-project`. The IaC stages detect only `infra/` (`:598-641`), so storm2flow's CDK app in `infrastructure/` is skipped. **Do:** replace the instruction with a pointer to `pre-push-project`, and detect `infrastructure/` alongside `infra/` for the CDK, Terraform and Helm recipes, with the skip message naming both. | S3 | Gate | **Pushed 2026-09-16** (`9acffae`, `3682b53`, `6ae87e0`, `2285f22`). **What to test:** in a project whose IaC lives in `infrastructure/`, the pre-push gate must run the CDK, Terraform and Helm stages — even with an empty `infra/` sitting beside it, which used to silence all three. Each stage names the directory it ran in (`IaC synth · cdk · infrastructure`). With neither directory present, the skip says "no infra/ or infrastructure/ directory". The hook no longer tells you to edit it at bootstrap; project stages go after the end marker in `.githooks/pre-push-project`. **Cross-provider review:** Alex (Codex) found the mixed layout silently unchecked; after the fix Alexey ran the real IaC block with recording tools and confirmed a failing second tree still fails the whole stage — **push as is**. From storm2flow's `FR-storm2flow-prepush-layout`. **Re-open if** one directory can hide the other, or a stage runs in the wrong directory. |
| **TASK-041** | **One dependency-vulnerability threshold everywhere: MEDIUM+ (CVSS >= 4.0) blocks.** From storm2flow, `FR-storm2flow-osv-threshold`. The pre-push hook (`.githooks/pre-push:448-517`) and CI (`.github/workflows/security.yml:98-124`) already block MEDIUM+. `docs/DoD.md` §6.2 (`:486-487`, and `:510`) says only zero `HIGH`+ CVEs is required. **Founder decision 2026-09-15: MEDIUM+**, keeping what the two enforcing layers already do. Nothing gets looser. **Do:** correct DoD §6.2 and every other doc that states the SCA threshold (grep SECURITY.md, the deck, the templates' security config) to MEDIUM+ blocking, with lower severities reported. Leave the `trivy config` HIGH+ line alone unless its enforcement also differs. | S3 | Security / docs | **Pushed 2026-09-16** (`d6fa8ca`, root configs `bf8d37c`). **What to test:** `git grep -n "HIGH+" -- docs/DoD.md docs/SECURITY.md project_config_security.md project_config_dod.md templates` must show no osv-scanner or SCA row — every live statement says MEDIUM+ (CVSS >= 4.0), which is what `.githooks/pre-push` and `.github/workflows/security.yml` already enforce. Trivy's HIGH+ lines stay: nothing runs `trivy config` (`git grep -i trivy -- .githooks .github scripts` is empty), so they describe a recipe, not an enforced threshold. **Cross-provider review:** Alex (Codex) — **push as is**; he re-searched the tree and found no conflicting live threshold. From storm2flow's `FR-storm2flow-osv-threshold`; founder decision 2026-09-15: MEDIUM+. **Re-open if** any doc, hook or workflow states a different SCA threshold than the other two. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.


*(Empty.)*
