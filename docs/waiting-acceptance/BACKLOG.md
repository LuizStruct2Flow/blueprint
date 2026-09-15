# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-038** | **Remove `CHANGES.md` from the lifecycle: `BACKLOG.md` and `BUGS.md` are the only record files in each state.** No `CHANGES.md` has ever existed in any lifecycle folder, and every task and feature row has travelled through `BACKLOG.md` (TASK-025..033 are in `waiting-acceptance/BACKLOG.md` today). But the rules still send non-defect changes there, and they contradict themselves: `docs/DoD.md` §7C line 661 moves backlog rows to `waiting-acceptance/BACKLOG.md`, and lines 669-673 send forward features to `waiting-acceptance/CHANGES.md`; `docs/waiting-acceptance/README.md` says it is created on first use (12-15) and that only BACKLOG.md and BUGS.md belong (17-20). An agent following the text files features where nobody looks. **Stated in:** `CLAUDE.md:288`, `docs/DoD.md:34-35` and `:663-673`, `docs/waiting-acceptance/README.md:12-15`, `docs/done/README.md:7-8`; read by `scripts/lib/dod-gate.sh:76` and `tests/lifecycle-docs/lifecycle-docs.ts:62` (with `.spec.ts` cases around 207-220 and a `tests/dod-gate` comment at 114). **Do:** drop CHANGES.md everywhere live; keep the rule that a defect is a `BUG-XXX` row, reworded as "never a backlog row"; update the deck lifecycle slide if it names it. Dated records (`docs/done/TASK-018-*`, `docs/doing/TASK-022-rule-enforcement.csv`) stay as history. | S3 | Lifecycle / docs | **Pushed 2026-09-15** (`a006606`, `1622afe`). **What to test:** `git grep -n -i changes.md` must hit only dated records, the handover and this row. `docs/DoD.md` §7C must send tasks, features and behaviour changes to `BACKLOG.md`, and defects to `BUGS.md`, never to a backlog row. **The founder waived the cross-provider review for this item.** **Re-open if** a rule, gate or test sends work to a `CHANGES.md` again. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.


*(Empty.)*
