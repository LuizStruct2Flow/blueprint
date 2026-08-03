# Backlog — parked features, polish, reliability, strategy

See [README.md](README.md) for the lifecycle and categories (KEEP / DEFER /
OBSOLETE). One row per parked item; multi-file plans get their own folder
in this directory and a one-line pointer here.

| # | Item | Category | Re-open trigger / next-step gate |
|---|---|---|---|
| | | | |

## Open findings from the 2026-07-23 blueprint audit

Parked here on 2026-08-03 when an `lcm` pass asked whether the audit was fully
addressed. It was not. These five are **verified still live against the current
tree**, not inferred from the register. Each carries a re-open trigger, per the
`backlog/` rule that this folder is not a graveyard.

The audit register itself moved to [`../config/BLUEPRINT-AUDIT-2026-07-23.md`](../config/BLUEPRINT-AUDIT-2026-07-23.md):
it spans done, waiting and open findings simultaneously, so it is a reference
record rather than a work item that can sit in one lifecycle folder.

| ID | Sev | State | Finding | Re-open trigger |
|---|---|---|---|---|
| **A-04** | S1 | KEEP | `scripts/start-all-watchers.sh` still ships. The audit flagged it as starting watchers the roster may not back. | Pull it into `doing/` the next time the watcher set changes, or delete the script if nothing dispatches through it. |
| **A-13** | S2 | KEEP | `.gitignore` is **not** in `MANAGED_FILES`, but its PUBLIC-PUBLISHING PRIVACY BLOCK tells you not to edit between the blueprint markers "because they'd come back on next sync". Nothing syncs it, so the instruction describes a mechanism that does not exist — and a derived project's privacy block silently never updates. | Re-open when `docs/PUBLISHING.md` is next touched, or immediately if any project reports CLAUDE.md/AGENTS.md reaching a public remote. |
| **A-16** | S3 | KEEP | `scripts/sonar.sh:30` and `sonar-api.sh:25` run `eval "$(grep -E '^SONAR_…' .env)"`. A config file becomes a code-execution surface, in a step agents run unattended. The grep constrains the KEY, not the value. | Re-open when the Sonar wiring is next touched, or immediately if `.env` ever gains a non-founder writer. |
| **A-17** | S3 | KEEP | `.githooks/pre-push:487` uses `ls infra/**/*.tf` under `#!/bin/sh` — no globstar, so `infra/envs/prod/main.tf` never matches and **the IaC gate silently skips**. A gate that skips looks exactly like a gate that passed, which is the BUG-004 lesson. | Re-open the moment this repo or a derived project actually has an `infra/` tree; until then nothing is being skipped in practice. |
| **A-25** | S4 | KEEP | `scripts/build-deck.sh:32` runs `npx -y @marp-team/marp-cli@latest` — unpinned remote code on every deck rebuild, in an agent-automated step, bypassing the pin-and-scan doctrine the blueprint enforces elsewhere (and which A-36 already applied to GitHub Actions). | Re-open when the deck build is next touched, or immediately if the supply-chain posture is audited. |

**Still untriaged, and honestly so:** roughly a dozen doc-consistency findings
(A-10, A-11, A-19–A-21, A-23, A-26, A-28, A-29, A-31–A-35) have no disposition
record and were not verified during this pass. They are not claimed fixed and
not claimed open. Triaging them needs a reading pass over the docs they cite,
which is a grooming session rather than a lifecycle move.
