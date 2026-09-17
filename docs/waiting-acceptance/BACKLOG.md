# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-022** | **Anchor the rules in mechanisms, and shrink what agents must remember.** Founder direction, 2026-09-10: *"I think we should rely in automation and not in agents having all rules in their context and being disciplinated on applying these rules… the md files will be used for documentation, and we will anchor the controls in the ci and development lifecycle."* Triggered by a cross-review of `docs/way-of-working.md` in which two reviewers independently found its strongest untold story was that **controls are required to be checkable and are repeatedly caught lying** — a framing the founder rejected as pitched, while accepting the evidence behind it. Artefacts: [`TASK-022-anchor-rules/PLAN-TASK-022.md`](TASK-022-anchor-rules/PLAN-TASK-022.md), the rule-enforcement audit in the same folder, refreshed 2026-09-17 at the founder's request: `TASK-022-rule-enforcement.{csv,xlsx}` holds all 373 rules, `-removed-from-md` the 27 rules no longer in any .md, `-summary` the counts old vs now (the 2026-09-10 version was deleted with stage 1 and is in history at `dc225c9`), and the talk at [`../talk-enforcing-agentic-quality.md`](../talk-enforcing-agentic-quality.md). **Partly landed:** `34d5d00` fixed the trunk rule contradicting itself across CLAUDE.md and DoD §6 — TASK-019 made `main` the trunk and deleted the section two other rules still pointed at — and reframed the landing table on the axis that was wrong all along: **the contributor, not the repo.** Stage 1 of the revised plan (the deletions) was committed 2026-09-17; stages 2 (CI anchors), 3 (SessionStart hook) and 4 (tell derived projects) are open. | S2 | Process | **Pushed 2026-09-17**, CI green on `8f56ba6` (run 35209754799). **What to test:** `wc -l CLAUDE.md docs/DoD.md` reads about 344 and 253 (were 1,318 and 916), and no rule you still want is gone. A push to main whose earlier commit breaks a subject, row or BUG-test rule turns CI red. Starting Claude Code, including from a subdirectory, shows a session-start report with the feed and a drift verdict (`drift: UNKNOWN` when offline). **Reviews:** Alexey (Codex) on the plan; Jesko (Codex) on stages 2 and 3, each real finding fixed (force-push refusal, hook paths relative to the cwd). **Known limits:** a declared test root under tests/ fails the BUG-test check; CI after a history rewrite checks the tip only. **Next-step gate:** the plan's inventory of which rules are prose-only versus mechanically enforced. This session produced eight instances of `docs/config/findings.md` F-002 — checks inferring a property from a proxy satisfiable without it — which is direct evidence for the plan's premise and should be folded in before the rest is sequenced. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.


*(Empty.)*
