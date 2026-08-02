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
| _(none by default — add this project's own)_ | | | |

**This table ships EMPTY on purpose.** It is seeded into every new project, so
anything concrete written here becomes a monitor that every unrelated project
arms for a file it has no reason to care about. A row belonging to one stream had
been sitting here hard-coded — including a rationale describing an incident that
happened in *that* stream — and it propagated verbatim on the next bootstrap.
Same class as BUG-002: one project's specifics baked into a file that travels.

Arm each row with a `Monitor` whose command emits **only on change** — e.g.
compare `cksum` and echo the newest header when it moves. Never a raw tail: an
unfiltered feed is noise, gets muted, and then you have no monitor at all.

### Optional: a cross-stream board

*Only relevant when this project has a peer stream solving similar problems on an
offset schedule.* Two blueprint streams fixing the same bug classes will each
reinvent what the other proved; a shared board is how that stops. **A project
without a peer stream should not have this row** — there is nothing to watch, and
a monitor on a file nobody writes is pure overhead.

If that applies, add something like:

```
| Cross-stream board | <path to the shared board> | 10s | A peer stream posts
  here. Nothing else notifies this session, so without a monitor the board is
  only read when someone remembers to look. |
```

The board itself is deliberately neutral: it belongs to no repository and is
referenced from **no blueprint-managed file**, so streams find it by being told
once, not by inheriting a path.

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

**Filing a request requires push access to the blueprint remote, and that has a
consequence worth stating outright: a derived project is not prevented from
writing to the blueprint. It is only prevented by `a2bp` declining to.** In the
same-owner setup every agent authenticates as the owner, usually with admin
rights and branch protection set to `enforce_admins: false` so the owner keeps
trunk-based development. The PR requirement therefore does not apply to the
identity the agents actually present, and an agent that runs plain `git push`
instead of `a2bp` reaches `main` directly.

**This cannot be closed with repository settings alone.** No ruleset can
distinguish a derived project's agent from the owner while both present the same
credential — the missing thing is identity separation, not configuration.
Closing it needs a *separate, narrower credential* for derived projects (a
fine-grained token or deploy key, ideally with a ruleset confining it to
`a2bp/*` refs) or a fork-and-PR flow. Note this is **independent of the owner's
own `enforce_admins` setting**: a narrower credential for derived projects does
not touch the owner's direct pushes, so it does not cost trunk-based
development.

That step is deliberately not taken while every project is ours. The first
externally-owned project forces it, and these are the things that break:

| Assumption | What breaks when a project is externally owned |
|---|---|
| Push access to the blueprint remote is fine to grant | Direct branch-push to a shared repo is no longer acceptable — this becomes a fork-and-PR flow. |
| The branch's project name is trustworthy | It never was verifiable; it just did not need to be. Provenance has to come from the PR author, not the ref. |
| The contamination guard ran | It runs on the **requester's** machine. An external requester can simply not run it, or run a patched copy. Receiver-side enforcement (required checks on the request branch) becomes necessary rather than optional. |
| A reviewer's judgement can be taken on trust | The review is the only gate that decides what lands. Whose review counts becomes an explicit policy question. |

**Do not treat the current model as a security boundary, and do not write that a
derived project "cannot" write into the blueprint.** It can — see above. What is
true is narrower and worth saying exactly: `a2bp` lands nothing, and a change
still needs a human to merge a PR. The model is a same-owner convenience with a
human review step, strictly better than the unreviewed direct write it replaced,
and strictly weaker than a machine gate. Receiver-enforced guarding is designed
but deliberately unbuilt — build it when a derived project is owned by someone
whose review would not be taken on trust.
