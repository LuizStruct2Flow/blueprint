# Project Paths — {{PROJECT_NAME}}

All project-specific paths, hosts, URLs, account IDs, and log locations.
Generic struct2flow paths (`docs/`, `.githooks/`, `scripts/`) are in
CLAUDE.md and the blueprint; everything here is unique to {{PROJECT_NAME}}.

## Repository layout

> Top-level dirs the agents need to know about. Keep one line each.

| Path | What lives here |
|---|---|
| `backend/` | |
| `frontend/` | |
| `infrastructure/` | |
| `scripts/` | Project utility scripts (the agent-protocol scripts come from the blueprint) |
| `docs/` | Project documentation, lifecycle-managed (see CLAUDE.md) |

## Local agent state

> Where the agent dispatchers write logs and artefacts on the founder's
> machine. The blueprint defaults to `~/.{{PROJECT_NAME}}/`. Override here
> only if you want a different location.

- Codex run log: `~/.{{PROJECT_NAME}}/codex-runs.log`
- Codex last message: `~/.{{PROJECT_NAME}}/codex-last-message.md`
- Signal trigger log: `~/.{{PROJECT_NAME}}/signal.log`

## Cloud / infra accounts

> AWS / GCP / Azure account IDs, regions, the names of long-lived
> infra-as-code stacks. Public info only — secrets go in env / SSM, not here.

| Stack / account | ID / name | Notes |
|---|---|---|
| | | |

## Pipelines

> CI/CD pipeline names + how to start / approve / monitor each.

| Pipeline | Purpose | How to trigger | How to approve |
|---|---|---|---|
| | | | |

## Customer-facing URLs

> Production / staging hostnames. Agents reference these in release notes
> and verification steps.

- Production: `https://{{PROD_HOSTNAME}}`
- Staging / dev: `https://{{DEV_HOSTNAME}}`

## External integrations

> Third-party services that the product depends on (analytics, email,
> auth, observability). Name the dashboards / consoles the agents should
> check.

| Service | Purpose | Console / dashboard URL |
|---|---|---|
| | | |

## Wake-time Monitors (this project)

> Armed on every wake by the Orchestrator — see CLAUDE.md §"On wake".
> Paths are relative to the repo root. The generic mic monitor is described
> in CLAUDE.md; this table is for the project-specific ones.

| What | Path | Poll | Why |
|---|---|---|---|
| Cross-stream exchange board | `../../agent-exchange/EXCHANGE.md` | 10s | A second working stream posts here. Nothing notifies this session otherwise, so without a monitor the board is only read when someone remembers to look — which is how the half-finished timestamp switch sat uncommitted for days. |

Arm it with a `Monitor` whose command emits only on change, e.g. compare
`cksum` and echo the newest `### ` header when it moves. Emit on *change*,
never a raw tail — an unfiltered board is noise and gets muted.

## Back-propagation trust boundary (a2bp)

`blueprint a2bp` pushes a branch and opens a pull request against the blueprint's
remote (`blueprint_remote` in `.blueprint-source`). **That is sound only while
every derived project belongs to the same owner as the blueprint.**

The property being relied on is not the push permission — it is that the person
who filed the request and the person who reviews it are accountable to the same
standard. `a2bp` establishes **no trusted source-project identity**. The branch
name carries the project's directory basename, and a directory basename is a
claim, not a credential: nothing prevents a project from naming itself anything,
and nothing verifies that the content came from where the branch says.

Today that does not matter, because everything filing requests is ours. The first
externally-owned project changes it, and these are the things that break:

| Assumption | What breaks when a project is externally owned |
|---|---|
| Push access to the blueprint remote is fine to grant | Direct branch-push to a shared repo is no longer acceptable — this becomes a fork-and-PR flow. |
| The branch's project name is trustworthy | It never was verifiable; it just did not need to be. Provenance has to come from the PR author, not the ref. |
| The contamination guard ran | It runs on the **requester's** machine. An external requester can simply not run it, or run a patched copy. Receiver-side enforcement (required checks on the request branch) becomes necessary rather than optional. |
| A reviewer's judgement can be taken on trust | The review is the only gate that decides what lands. Whose review counts becomes an explicit policy question. |

**Do not treat the current model as a security boundary.** It is a
same-owner convenience with a human review step, which is strictly better than
the unreviewed direct write it replaced, and strictly weaker than a machine gate.
Receiver-enforced guarding is designed but deliberately unbuilt — build it when a
derived project is owned by someone whose review would not be taken on trust.
