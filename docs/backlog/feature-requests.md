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
| `FR-storm2flow-claude-md-imports` | storm2flow | 2026-09-15 | Make `CLAUDE.md` `@`-import the `project_config_*.md` files, so project rules moved out of `CLAUDE.md` stay in agent context | OPEN |
| `FR-storm2flow-dod-test-roots` | storm2flow | 2026-09-15 | Let a project declare where its regression tests live for the DoD bug-test stage, and stop a blueprint suite vouching for a project bug with the same number | OPEN |
| `FR-storm2flow-refused-pull-sha` | storm2flow | 2026-09-15 | A full pull that refused any file must not advance `bootstrap_sha` | OPEN |
| `FR-storm2flow-prepush-layout` | storm2flow | 2026-09-15 | Drop the bootstrap-time "adjust these paths" instruction from the managed `.githooks/pre-push`, and detect `infrastructure/` as well as `infra/` | OPEN |
| `FR-storm2flow-osv-threshold` | storm2flow | 2026-09-15 | Make the osv-scanner threshold agree between the hook, CI and `docs/DoD.md` §6.2 | OPEN |
| `FR-storm2flow-settings-project-layer` | storm2flow | 2026-09-15 | Give a project a tracked, pull-safe place for its own `.claude/settings.json` permission rules | OPEN |

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

---

## `FR-storm2flow-claude-md-imports`

**Request.** Have the blueprint's `CLAUDE.md` load the project config files with
`@` imports (for example `@project_config_overview.md`) instead of only naming
them in prose, so their content is in every agent session without anyone
remembering to read it.

**Evidence** (blueprint `dbed972`):

- `CLAUDE.md:3-5` says project overrides live in three `project_config_*.md`
  files: "Read those alongside this file." Nothing loads them.
- `CLAUDE.md:908-910` names five such files, so the two lists already disagree.
- `CLAUDE.md` is whole-file managed (`scripts/blueprint:101`) with no marker
  lines, so a pull replaces it. Project rules have to move out of it, and today
  they leave agent context when they do.

**a2bp-able?** Only in form. `CLAUDE.md` is managed, but storm2flow's copy still
carries project content, so an a2bp would propose its whole file rather than the
import lines.

**Why it matters.** storm2flow's next compliance slice moves its project rules
out of `CLAUDE.md`, and without imports those rules stop reaching its agents.

---

## `FR-storm2flow-dod-test-roots`

**Request.** Give the DoD gate's bug-test stage a separate, project-declared list
of test roots (for example `BP_TEST_ROOTS`, defaulting to `$BP_CODE_ROOT/tests`,
declared in `project_config_paths.md`). Scope the match so a blueprint suite that
names a bug number cannot count as the regression test for a project bug with the
same number. Please do **not** make `BP_CODE_ROOT` configurable for this: other
machinery resolves from it.

**Evidence** (blueprint `dbed972`):

- `scripts/lib/dod-gate.sh:154` searches only `"${BP_CODE_ROOT:-.}/tests/"`.
- `BP_CODE_ROOT` is chosen by requiring `scripts/lib/pipeline.sh` under it
  (`.githooks/pre-push:83-103`), and `dod-gate.sh:187-189` sources
  `state-dir.sh` from it. Pointing it at project tests would break both.
- The blueprint's `tests/` mentions 109 distinct BUG numbers, and at least 97
  of them are also storm2flow bug numbers. Each of those would pass without a
  storm2flow test, and every other storm2flow bug would fail with one.
- Smaller, same file: `dod_items_in_push` (`dod-gate.sh:58-64`) parses subjects
  with its own `sed` pattern rather than `scripts/lib/commit-subject.sh`, and
  reads only the `BUG#n:` form. A project whose history uses another form (as
  storm2flow's does) needs both read during its transition.

**a2bp-able?** No: storm2flow has no version of this change to propose.

**Why it matters.** storm2flow's regression tests live in `backend/src`,
`frontend/src`, `frontend/e2e` and `infrastructure/test`, so today the stage
cannot find them and would trust unrelated blueprint suites instead.

---

## `FR-storm2flow-refused-pull-sha`

**Request.** When a full `blueprint pull` refuses any file, leave `bootstrap_sha`
unchanged, as a partial pull already does, and say which files held it back.

**Evidence** (blueprint `dbed972`): `scripts/blueprint:1718-1748` advances
`bootstrap_sha` whenever at least one file was pulled and no paths were named. A
refused file sets `refused_guard` (`:1711`), which only changes the exit status
to 4 (`:1764-1766`). The comment at `:1726` defines `bootstrap_sha` as "synced UP
TO this commit", which is not true while a file is refused.

**a2bp-able?** No: storm2flow has no version of this change to propose.

**Why it matters.** storm2flow reads `bootstrap_sha` to know how far behind it is,
and a refused file would make a stale project look current.

---

## `FR-storm2flow-prepush-layout`

**Request.** Two changes to the managed `.githooks/pre-push`:

1. Remove the instruction to edit it at bootstrap. The file has no marker lines,
   so a pull replaces it and a project's edits are lost.
2. Detect the IaC directory as `infrastructure/` as well as `infra/`, or read it
   from project config.

**Evidence** (blueprint `dbed972`):

- `.githooks/pre-push:528-529`: "Adjust these paths / commands to match your
  project's workspaces", then "edit this block during bootstrap to reflect your
  layout."
- `.githooks/pre-push:613` runs the IaC stages only when `infra/` exists; any
  other name gets the skip at `:641`.
- Partial relief already landed in `e8c2988` (TASK#26): the skip messages
  (`:542-547`) send a differently laid-out project to its own stages below the
  end marker in `.githooks/pre-push-project`. That gives a pull-safe home, but
  the instruction at `:528-529` still says to edit the managed hook instead.

**a2bp-able?** Not usefully: storm2flow has no generic version of the hook to
propose.

**Why it matters.** storm2flow's CDK app lives in `infrastructure/`, so the shared
hook skips its IaC synth stage.

---

## `FR-storm2flow-osv-threshold`

**Request.** Make the dependency-vulnerability threshold the same in the hook, CI
and the DoD. Which way is the owner's call.

**Evidence** (blueprint `dbed972`):

- `.githooks/pre-push:448,500,509` blocks MEDIUM+ (CVSS >= 4.0).
- `.github/workflows/security.yml:7,98` blocks MEDIUM+.
- `docs/DoD.md:486-487` (§6.2) requires zero `HIGH`+ CVEs and tracks lower ones.

**a2bp-able?** No: this is a policy decision, not a file storm2flow has.

**Why it matters.** storm2flow is working down its dependency findings and needs
to know which threshold the gate will hold it to.

---

## `FR-storm2flow-settings-project-layer`

**Request.** Give a project a tracked, pull-safe place for its own Claude Code
permission rules, so pulling the generic allowlist does not delete them. Two
possible shapes: pull merges the `permissions` arrays (blueprint entries plus
the project's), or the CLI merges in a tracked project fragment.

**Evidence** (blueprint `dbed972`):

- `.claude/settings.json` is whole-file managed (`scripts/blueprint:272-274`).
  JSON has no comment lines, so it cannot carry markers, and every pull copies
  the whole file.
- The only documented home for other entries is `.claude/settings.local.json`,
  which is gitignored and per-machine (`docs/DoD.md:312-314`,
  `scripts/blueprint:272-273`). That fits host-specific entries, not rules a
  whole team shares.
- storm2flow's tracked `settings.json` has 124 `permissions.allow` entries. 89
  are not among the blueprint's 182, and 71 of those 89 are AWS CLI commands
  (mostly reads: CloudWatch Logs, Lambda, ECS, Cognito, DynamoDB, CodePipeline).

**a2bp-able?** No: the entries are storm2flow's own, and the fix belongs in pull.

**Why it matters.** A pull would delete the rules storm2flow's agents use to read
production logs and state before asking the founder, which its diagnosis runbook
depends on.
