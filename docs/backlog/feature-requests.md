# Feature requests

Requests filed **from derived projects** that are not yet a file change: a
capability the blueprint does not have, a defect someone can describe but has
not fixed, a rule they want changed without proposing the wording.

**A request that IS a file change goes through `blueprint a2bp`, not here.**
Since TASK-037, `a2bp` carries any file, including ones the blueprint does not
ship (`templates/`, this repo's own lifecycle docs) and new ones. It stages the
file on a request branch, runs the contamination guard over every staged line,
marks a file outside `MANAGED_FILES` as not shipped, and opens a pull request.
Opening such a PR by hand with plain `git` and `gh` skips that guard.

**Codes, not numbers.** A request is identified by a code,
`FR-<project>-<slug>`, chosen by the requester. It is deliberately not a
`BUG-`/`FEATURE-`/`TASK-` number: a derived project cannot see which numbers
the blueprint has in flight, so it must not pick one. The blueprint owner
assigns a real item number when a request is promoted into `doing/`. The row
stays here with that number as its status, and the request's own section is
deleted, because the promoted item now carries it.

**Status** is one of `OPEN` (awaiting the owner), `PROMOTED <ITEM>` (moved into
the lifecycle as that item) or `DECLINED` (with a one-line reason). Requests are
triaged in the owner's grooming pass, like everything else in `backlog/`.

| Code | From | Filed | Request | Status |
|---|---|---|---|---|
| `FR-www-qa2-standing-delegation` | struct2flow-www | 2026-09-14 | Remove the standing "acceptance delegated to QA-2" rule from the template and the blueprint's own docs | PROMOTED TASK-034 |
| `FR-www-a2bp-feature-requests` | struct2flow-www | 2026-09-14 | Let derived projects raise requests `blueprint a2bp` could not carry, without opening PRs by hand | PROMOTED TASK-037 |
| `FR-storm2flow-dod-test-roots` | storm2flow | 2026-09-15 | Let a project declare where its regression tests live for the DoD bug-test stage, and stop a blueprint suite vouching for a project bug with the same number | PROMOTED TASK-039 |
| `FR-storm2flow-refused-pull-sha` | storm2flow | 2026-09-15 | A full pull that refused any file must not advance `bootstrap_sha` | PROMOTED BUG-122 |
| `FR-storm2flow-prepush-layout` | storm2flow | 2026-09-15 | Drop the bootstrap-time "adjust these paths" instruction from the managed `.githooks/pre-push`, and detect `infrastructure/` as well as `infra/` | PROMOTED TASK-040 |
| `FR-storm2flow-osv-threshold` | storm2flow | 2026-09-15 | Make the osv-scanner threshold agree between the hook, CI and `docs/DoD.md` §6.2 (founder: MEDIUM+) | PROMOTED TASK-041 |
| `FR-storm2flow-settings-project-layer` | storm2flow | 2026-09-15 | Give a project a tracked, pull-safe place for its own `.claude/settings.json` permission rules (founder: a project file merged in) | PROMOTED TASK-042 |
| `FR-storm2flow-claude-md-imports` | storm2flow | 2026-09-15 | Make `CLAUDE.md` `@`-import the `project_config_*.md` files, so project rules moved out of `CLAUDE.md` stay in agent context | PROMOTED TASK-043 |
| `FR-storm2flow-declared-ci` | storm2flow | 2026-09-15 | Let a project declare its CI so suites that assume `.github/workflows/security.yml` check the declared pipeline or skip visibly (storm2flow runs AWS CodePipeline) | PROMOTED TASK-044 |

The two struct2flow-www requests were filed together in pull request #72 on the
blueprint repository, which holds their original text. The six storm2flow
requests were pushed on the branch `fr/storm2flow/2026-09-15` without a pull
request; their text now lives in the promoted items.
