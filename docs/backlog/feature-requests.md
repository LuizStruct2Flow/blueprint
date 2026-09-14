# Feature requests

Requests filed **from derived projects** for things `blueprint a2bp` cannot
carry: changes to files the blueprint does not ship (`templates/`, this repo's
own lifecycle docs), and capabilities the blueprint does not have yet.

**Codes, not numbers.** A request is identified by a code,
`FR-<project>-<slug>`, chosen by the requester. It is deliberately not a
`BUG-`/`FEATURE-`/`TASK-` number: a derived project cannot see which numbers
the blueprint has in flight, so it must not pick one. The blueprint owner
assigns a real item number when a request is promoted into `doing/`, and the
request's section is then deleted here (the promoted row leaves nothing behind).

**Status** is one of `OPEN` (awaiting the owner), `PROMOTED <ITEM>` (moved into
the lifecycle as that item) or `DECLINED` (with a one-line reason). Requests are
triaged in the owner's grooming pass, like everything else in `backlog/`.

| Code | From | Filed | Request | Status |
|---|---|---|---|---|
| `FR-www-qa2-standing-delegation` | struct2flow-www | 2026-09-14 | Remove the standing "acceptance delegated to QA-2" rule from the template and the blueprint's own docs | OPEN |
| `FR-www-a2bp-feature-requests` | struct2flow-www | 2026-09-14 | Let `blueprint a2bp` file a feature request here, so derived projects stop opening these PRs by hand | OPEN |

---

## `FR-www-qa2-standing-delegation`

**Request.** Remove the standing rule that acceptance of agent-protocol and
repo-infrastructure work is "delegated to QA-2", wherever the blueprint states it
as a rule, and state the founder's actual rule instead.

**The founder's rule** (stated 2026-09-14):

> Final acceptance is the founder's. An agent may suggest a QA pass by an agent
> from the other provider, and run it once agreed, but that verdict becomes
> final acceptance only when the founder explicitly gives permission for that
> item. There is no standing delegation for any class of work.

The 2026-07-29 decision the current text cites ("I delegate these ones") covered
**specific items**. The text generalised it into a class of work.

**Where the standing rule is stated today** (blueprint `fe2e4dc`):

| Location | What it says | a2bp-able? |
|---|---|---|
| `templates/project_config_dod.md:181-203` | §"Acceptance authority — delegated to QA-2 for infrastructure work". Seeded into **every new project's** DoD config, naming this repo's personas (Jesko, Slava, Kathrin), which do not exist in another engineer's roster | No: `templates/` is not managed |
| `docs/done/BUGS.md:6-11` | Header: "Acceptance authority for this class of work is delegated to QA-2" | No: blueprint-only lifecycle doc |
| `docs/waiting-acceptance/README.md:28-33` | "delegated to QA-2 (founder decision 2026-07-29)", pointing at `project_config_dod.md` §"Acceptance authority" | Yes: already filed as a2bp request #71 |

Note the pointer in the README's section is broken in the blueprint too: no root
`project_config_dod.md` here carries an §"Acceptance authority" section; only
the template does.

**Proposed change.** Delete the template section. Replace the `done/BUGS.md`
header claim with the founder's rule. Where the blueprint wants a record of the
2026-07-29 decision, keep it as a history note naming the items it covered, not
as a rule. Dated records (for example `docs/config/BLUEPRINT-AUDIT-2026-07-23.md:37`)
stay as history.

**Why it matters.** A new project bootstrapped today opens with a DoD that says
a persona it does not have may accept its infrastructure work without the
founder. An agent reading it would be following a rule the founder never made
for that project.

---

## `FR-www-a2bp-feature-requests`

**Request.** Give `blueprint a2bp` a way to file a feature request into this
file, so a derived project can raise things `a2bp` cannot carry as file changes
(defects in unmanaged files, missing capabilities) through the same guarded,
request-only door.

**Observed gap.** From struct2flow-www, `blueprint a2bp --dry-run
docs/backlog/BUGS.md` exits 4: "'docs/backlog/BUGS.md' is not a
blueprint-managed file". So there is no guarded path for these requests, and
**this very pull request had to be opened by hand** with `git` and `gh`
(founder-authorized). That is the plain-git route the blueprint's CLAUDE.md
warns derived projects away from, and it skipped the contamination guard.

**Proposed shape.**

- A verb or flag, e.g. `blueprint a2bp --feature-request <code> <body-file>`,
  that appends one table row plus one section to `docs/backlog/feature-requests.md`
  on an `a2bp/<project>/<hash>` branch, runs the same contamination scan over
  the added lines, and opens the PR. Exit statuses as for file requests (`3`
  only when a PR exists).
- **PR title.** CI checks the PR title against the commit-subject rule
  (`.github/workflows/security.yml`, "The PR title becomes the squash-merge
  subject"), which requires a `BUG#`/`FEATURE#`/`TASK#` number. A feature request
  has no number by design, so either the title check needs a sanctioned form for
  requests, or the owner retitles at merge. Today's `a2bp: N file(s) from
  <project>` titles meet the same check.
- `docs/backlog/README.md` documents this file in its index (added in this PR).

**Why it matters.** Derived projects will keep finding defects in files the
blueprint does not ship, since that is exactly what bootstrapping exposes. Without a
request path they either stay silent or route around the guard.
