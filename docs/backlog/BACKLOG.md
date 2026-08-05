# Backlog — parked features, polish, reliability, strategy

See [README.md](README.md) for the lifecycle and categories (KEEP / DEFER /
OBSOLETE). One row per parked item; multi-file plans get their own folder
in this directory and a one-line pointer here.

**One table, not one per source.** Parked audit findings used to sit in a second
table below this one with its own column schema, which made "what is parked?"
two questions instead of one. They are rows like any other now — where an item
came from belongs in its text, not in its own table.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **A-04** | `scripts/start-all-watchers.sh` still ships. The 2026-07-23 audit flagged it as starting watchers the roster may not back. | S1 | KEEP | The next time the watcher set changes — or delete the script if nothing dispatches through it. |
| **A-13** | `.gitignore` is **not** in `MANAGED_FILES`, but its PUBLIC-PUBLISHING PRIVACY BLOCK says not to edit between the blueprint markers "because they'd come back on next sync". Nothing syncs it, so the instruction describes a mechanism that does not exist — and a derived project's privacy block silently never updates. | S2 | KEEP | When `docs/PUBLISHING.md` is next touched, or immediately if any project reports CLAUDE.md/AGENTS.md reaching a public remote. |
| **A-16** | `scripts/sonar.sh:30` and `sonar-api.sh:25` run `eval "$(grep -E '^SONAR_…' .env)"`. A config file becomes a code-execution surface, in a step agents run unattended. The grep constrains the KEY, not the value. | S3 | KEEP | When the Sonar wiring is next touched, or immediately if `.env` ever gains a non-founder writer. |
| **A-17** | `.githooks/pre-push` uses `ls infra/**/*.tf` under `#!/bin/sh` — no globstar, so `infra/envs/prod/main.tf` never matches and **the IaC gate silently skips**. A gate that skips looks exactly like a gate that passed (the BUG-004 lesson). | S3 | KEEP | The moment this repo or a derived project actually has an `infra/` tree. Until then nothing is being skipped in practice. |
| **A-25** | `scripts/build-deck.sh:32` runs `npx -y @marp-team/marp-cli@latest` — unpinned remote code on every deck rebuild, in an agent-automated step, bypassing the pin-and-scan doctrine the blueprint enforces elsewhere (and which A-36 already applied to GitHub Actions). | S4 | KEEP | When the deck build is next touched, or immediately if the supply-chain posture is audited. |
| **TASK-004** | Nothing asserts that every lib SOURCED by a managed script is itself in `MANAGED_FILES`. That is exactly BUG-015 (six libs the CLI needed never shipped, so `a2bp` died in every derived project) — fixed by adding the six, but the next forgotten one is unguarded. Noticed while adding `scripts/lib/branch-guard.sh` under TASK-003. | S2 | KEEP | The next time a lib is added under `scripts/lib/`, or immediately if a derived project reports a missing-source abort. |
| **FEATURE-003** | HANDOVER as a SNAPSHOT, the logs as the event stream — wake by reading the last snapshot plus everything after it, instead of reconstructing state. Founder-originated (bad connectivity, sessions drop at any moment). Full plan: [PLAN-FEATURE-003-session-snapshot.md](PLAN-FEATURE-003-session-snapshot.md). Two findings already change the naive design: the activity feed is TRUNCATED on every daemon start so it cannot carry the replay window, and the system clock moved BACKWARDS today so no timestamp scan can order it. | — | KEEP | Founder decision to promote. Wants PO + BA flow review first (2026-08-03). |
| **AUDIT-TRIAGE** | ~12 doc-consistency findings from the 2026-07-23 audit have **no disposition record at all**: A-10, A-11, A-19–A-21, A-23, A-26, A-28, A-29, A-31–A-35. They are not claimed fixed and not claimed open — nobody has read the docs they cite since the audit. Carried as a row rather than a footnote because a footnote is not tracked, and this needs a decision. | — | KEEP | A grooming session. **Its trigger has fired:** `README.md` names "when `doing/` empties out" as a typical grooming cadence, and `doing/` emptied on 2026-08-03. |

## Where these came from

The five `A-NN` rows were parked on 2026-08-03, when an `lcm` pass asked whether
the 2026-07-23 audit had been fully addressed. It had not. Each was **verified
still live against the tree**, not inferred from the register — the register
itself records findings in three different states at once and cannot be trusted
as a status source.

The register lives at
[`../config/BLUEPRINT-AUDIT-2026-07-23.md`](../config/BLUEPRINT-AUDIT-2026-07-23.md).
It is a reference record, not a work item: it spans done, waiting and open
findings simultaneously, so it cannot sit in one lifecycle folder.

`A-NN` is a **finding ID, not a work item** — see `../doing/BUGS.md`. Promoting
any row above means giving it a `BUG-`/`FEATURE-` number first.
