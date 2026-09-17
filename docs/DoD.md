# Definition of Done (DoD)

The quality bar and handoff contract for every agent on a struct2flow project.
§1–§6 are the rules, and §7 is what you walk before flipping the mic. A rule
marked *judgement* is checked by no mechanism, and nothing claims it is.

Project-specific extensions live in `project_config_dod.md`. This file is the
generic protocol, and a pull replaces it whole.

## §1 Lifecycle (parked + three founder-gated states)

```
docs/backlog/  →  docs/doing/  →  docs/waiting-acceptance/  →  docs/done/
                               (landed on main, CI green)    (founder accepts)
```

| State | What lives here | How items leave |
|---|---|---|
| `backlog/` | **Parked** work. Every row carries `KEEP`, `DEFER` (with its re-open trigger) or `OBSOLETE`. | **Promotion** into `doing/`, or **cancellation**: delete the row and leave a one-line pointer in `docs/config/findings.md`. |
| `doing/` | Active work: `BUGS.md` and `BACKLOG.md` rows, `PLAN-*.md`, multi-file item folders, `HANDOVER.md`. | Its work is on `main` and CI is green. A plan with open slices stays, with its shipped slices marked DONE. |
| `waiting-acceptance/` | Landed work awaiting the founder's acceptance test. | The founder accepts it ("BUG-0XX is done", "accept item Y"). |
| `done/` | Founder-accepted work: the record of what was delivered, not merely merged. | Items don't leave. |

- **Reopen:** a rejected acceptance, a regression or a rework request moves the
  row back to `doing/` in the same turn.
- `backlog/` is not a graveyard: a row with neither a trigger nor `OBSOLETE` is
  groomed out.
- `waiting-acceptance/` is the only path into `done/`, and only the founder's
  acceptance moves anything there.
- **Someday / maybe** lives in `backlog/`; work starting this session or the next
  lives in `doing/`. A founder-led grooming pass moves items between them.
- **An item that needs more than one file gets a folder** named for it
  (`BUG-XXX-<slug>`, `SPIKE-XX-<NAME>`), and the folder travels with the row.
  Spike and prototype code never lives under production `src/`: a promoted arm is
  re-implemented there, not moved.

## §1b Work intake — the path every change takes

1. **All work refers to a backlog item** — a `TASK-`, `FEATURE-` or `BUG-` number
   with a row, including a defect found mid-session. A cancelled item's pointer
   in `docs/config/findings.md` is its record. *Checked by the gate.*
2. **A new item's row lands in `doing/` with its first work commit.** There is no
   separate filing or promotion commit (founder, 2026-09-16).
3. **One item per commit.** The subject starts with the item (`BUG#20:`,
   `FEATURE#3:`, `TASK#1:`), which `.githooks/commit-msg` enforces. A commit
   serving two items is two commits; the hook reads only the subject, so that
   part is yours. The body says *why*, since the diff already says what.
4. **Cross-provider review for major bugs, core-path changes and new features**
   (founder, 2026-09-17). An agent of the other provider reviews the named
   commits (§7F). Other items need no review. *Judgement.*

   **A finding becomes work only if it is real and practical:** it was observed
   (in a real run, project or incident), or it sits on a core path with a trigger
   someone would realistically hit. Anything else is one "known limit" line on
   the item and costs nothing more: no reproducer, no mutant, no re-review. The
   implementer applies this filter to every finding; a reviewer's "push after
   these fixes" is input, not an order (founder, 2026-09-16).
5. **All gates green** (§4). No `--no-verify`, no "CI will catch it".
6. **Land it.** A maintainer pushes to `main`: trunk-based, no branches. An
   external contribution, such as a derived project asking the blueprint for a
   change, is a pull request, which `blueprint a2bp` files; there, landing is
   the merge.
7. **Landing moves the row to `waiting-acceptance/`**, once CI is green and never
   before the push. Confirmed moves ride in the next ordinary work commit or
   lifecycle pass; there is no separate commit per item.
8. **Artefacts travel with their parent item** — plan, reviews, mockups, spike
   code — in the same commit as the row. `tests/lifecycle-docs` #3 fails a push
   that leaves a folder behind.

## §1c Lifecycle management pass (`lcm`)

When the founder says `lcm`, reconcile the folders with reality:

1. Each item sits in the folder for its true state, with its plan or folder
   beside it.
2. The live baton's `Task` claims nothing that `ls docs/waiting-acceptance/`
   does not show.
3. Every `backlog/` row has a re-open trigger or `OBSOLETE`, and `done/` holds
   only founder-accepted work.
4. The lifecycle documents say something true. Do not narrate status the folders
   already answer; where a second record is wanted, a test holds the two together
   (`tests/lifecycle-docs`, `tests/doc-links`).

The pass makes the non-gated moves itself (`doing/`↔`backlog/`, landed work to
`waiting-acceptance/`) and only surfaces the gated ones (acceptance, reopen).

## §2 Bug management

Every bug — minor or major — follows this:

1. **Sequential numbering**: `BUG-001`, `BUG-002`, … Don't reuse numbers.
2. **Row in `docs/{state}/BUGS.md`** matching the lifecycle (§1).
   The bug exists in exactly **one** of the BUGS.md files at any time.
   A defect-shaped change (something the founder would call broken) is a
   `BUG-` row, never a backlog row: `BUGS.md` is what the founder tests.
3. **Numbered regression test** with the bug number in the test name:
   ```js
   it('BUG-007: <one-line summary>', () => { … })
   ```
   The pre-push gate checks this (`§2 every BUG has a regression test`). It
   searches the test roots the project declares in `project_config_paths.md`:

   ```
   - BP_TEST_ROOTS: `backend/src frontend/e2e`
   ```

   The list is literal and relative to the project root, and exactly one
   `BP_TEST_ROOTS` line may exist. With no declaration, the gate searches
   `tests/`. The rules that keep the match honest:
   - **`docs/`, `.git/`, `scripts/` and `.githooks/` never count**, and neither
     does a root that contains one or sits inside one. `docs/` holds the bug's
     own backlog row, so declaring `.` would pass every bug; the other two are
     blueprint-managed code naming *blueprint* bug numbers.
   - **Only a `*.spec.ts` counts**, because that is the only thing the shipped
     `tests/vitest.config.ts` runs (TASK-047). A `*.test.ts` or a `.js` test is
     not evidence: accepting a file the runner never executes would certify a
     bug with a test that cannot fail.
   - **Outside the blueprint, only the TOP LEVEL of `tests/` counts.** A spec
     sitting directly in `tests/` — `tests/own.snap.spec.ts`, the snapshot
     layout — is the project's own, because the blueprint ships none there.
     Everything in a subdirectory is a shipped suite, so `tests/e2e` does
     **not** count in a derived project: put E2E tests in a root of their own
     and declare it.
   - **A root must resolve inside the project.** `../elsewhere`, an absolute
     path outside it, and a symlink pointing away are refused. Roots resolve
     physically, so a symlink is judged by the directory it reaches.
   - **A malformed, duplicated or glob-bearing declaration is refused**, not
     guessed at and not defaulted — defaulting would search the blueprint's
     own suites.

   A parked bug in `backlog/` needs no test yet.
4. **No recurring bugs**: if it's fixed, it stays fixed. A bug coming
   back means the regression test was wrong, not "oh well, refile it".

**Minor vs major**:
- **Minor bug** (cosmetic, clearly scoped, low-impact) → fix directly
  per the normal team workflow.
- **Major bug** (affects a core USP path defined in
  `project_config_overview.md`, or has already had a failed fix attempt) →
  **plan first**, do NOT jump to implementation. Create
  `docs/doing/PLAN-BUG-XXX.md` with root cause analysis, affected files,
  fix approach, tests needed, rollback strategy. **Wait for Codex +
  Claude Code consensus** before implementing.

## §3 Test coverage (non-negotiable)

The shipped code is only as good as the tests that gate it.

1. **Every bug fix has a regression test** (unit / integration / E2E).
   The bug number is in the test name (§2.3).
2. **Two-commit pattern** for product/runtime bug fixes:
   - `BUG#XX: minimal reproducer (failing)`
   - `BUG#XX: <fix>`

   The reproducer must **fail** on the parent commit. Verify by stashing
   the fix, running the test, restoring the fix — `git log` must show
   the test failing before the fix.

   **Documented exceptions** (call out which in the commit message):
   - Docs-only fixes
   - Test-only refactors with no production change
   - Trivial typo fixes (single-character / single-word source changes)
   - Emergency grouped repairs (each underlying defect's reproducer
     still committed within the branch before its fix)

   Anything else — including "the bug was easy to reason about so I
   just fixed it" — does not qualify.

3. **Determinism is non-negotiable.** Identify the project's
   non-deterministic stages in `project_config_dod.md`; everything
   downstream of them must be tested without invoking the non-deterministic
   layer (use captured fixtures with provenance metadata). Mystery fixtures
   get rejected at PR review.
4. **Test layer matrix** — each project declares its layout in
   `project_config_dod.md`. The minimum struct2flow set:

   | Layer | Path convention | Runs in |
   |---|---|---|
   | Minimal reproducer | sibling of the `*.spec.ts` it reproduces | pre-push |
   | Unit | `*.spec.ts` | pre-push |
   | Integration / wire | `*.integration.spec.ts` | pre-push |
   | Data snapshot | `*.snap.spec.ts` | pre-push |
   | Component (JSX) | `*.spec.tsx` | pre-push |
   | Pixel snapshot | project-defined | manual + CI pipeline |
   | E2E / acceptance | project-defined | CI pipeline |

   **One convention — `*.spec.ts` and `*.spec.tsx` — in `src/` as well as
   `tests/`** (founder, 2026-09-16: *"migrate the tests to be spec driven ts
   tests, we don't need exceptions"*). Every layer above ends in `.spec.ts` or
   `.spec.tsx`, so the files a runner executes and the files the DoD gate counts
   as evidence are one set. That is the whole point: a `*.test.ts` accepted as a
   regression test but never run is a green standing in for a test (TASK-047,
   from Alexey's TASK-039 finding 6).

   **`.tsx` is not an exception to that rule.** It is the same TypeScript spec
   with JSX syntax, and a React project cannot write a component test without
   it — so excluding it would not enforce spec-driven tests, it would only make
   component tests uncountable while they ran perfectly well. Both extensions
   are accepted as evidence, both are discovered, and both are executed; a
   project whose runner covers only one of them has a gap the gate cannot see.

5. **Snapshot tests are approval-based.** A snapshot diff is a *change*,
   not necessarily a *break*. Update locally via the project's approve
   command, commit the updated file, review the diff in PR. **CI never
   runs with `-u` / `--update-snapshots`.**
6. **Coverage report** before every commit/push: know what your change
   adds to (or removes from) coverage before you ship it. Project
   declares its mode in `project_config_dod.md`:
   Coverage is measured over the **whole `src/**` tree**, not a curated
   subset — a high % over a hand-picked slice is theatre (cf. CLAUDE.md
   §"Coverage thresholds"). Thresholds are **tiered + ratcheted**:
   - **Greenfield** — domain / application **≥90%**, adapters **≥80%**,
     CLI entry points **≥75%** (statements + branches, aggregate per layer).
   - **Brownfield** — start each tier at its current true number and
     **ratchet**; new / modified files clear the greenfield bar for
     their layer.
   Exclude only genuinely non-executable / unit-untestable files,
   per-file with a stated reason (`*.d.ts`, pure schema files, bootstrap
   entry points, live-browser drivers) — never a wholesale directory
   exclude — and mirror that set into the SAST tool's coverage
   exclusions. The exact `--coverage` invocation + per-layer globs live
   in `project_config_dod.md`. The pre-push gate fails the push if any
   tier's threshold isn't met.
7. **Expensive suites run in CI, and the tier is in the file name.** There is
   no wall-clock ceiling. A suite named `*.release.spec.ts` runs in CI only
   (TASK-054, founder decision 2026-09-16, reversing BUG-005's "never CI-only").
   CI gates what ships: derived projects pull `released`, which moves only to a
   commit on which every CI job passed. The gate names every release suite it
   skips. **This is enforced, not merely stated:** `tests/manifest/` derives the
   suite set from the runners on disk and fails the push when CI does not run
   every suite, when the gate does not run every non-release suite, or when the
   export boundary does not behave as `.gitattributes` declares. A non-blocking
   SLO warns past 120 s total / 45 s per stage. A ≤30 s ceiling was removed on
   2026-08-02 (BUG-005) after it silently moved a 41-assertion suite out of the
   gate for growing by 3.7 s; the release tier differs because it is visible in
   the file name and checked in CI.

## §4 Pre-push gate (fail-fast)

The shared pre-push hook at `.githooks/pre-push` enforces (in order, per
struct2flow convention — the project's exact targets are wired in
`project_config_dod.md`):

**Text-only pushes (TASK-053).** When every file the push changes ends in `.md`
(root files such as `CLAUDE.md` included), the gate runs gitleaks, the host-path
guard, the four DoD checklist stages and one stage of the document suites
(`doc-links`, `lifecycle-docs`, `bug-numbers`). semgrep, osv-scanner, the
backend, frontend and IaC stages, ShellCheck, the typecheck and the vitest batch
skip with a `text-only push:` reason. An unknown push range, an empty file list
or any other file gives the full gate.

1. Build (e.g. `tsc` — catches missing imports)
2. Lint (`--max-warnings` ratcheted; never loosen)
3. **Formatter check** (`prettier --check` or equivalent — fails if
   any tracked file is unformatted). Auto-format locally with
   `npm run format` before pushing; CI never rewrites files.
4. Tests (unit + integration + data snapshot) + **coverage gate**
   (whole-tree, tiered per §3.6: domain/app ≥90%, adapters ≥80%, CLI
   ≥75%; brownfield ratcheted — the project declares its per-layer
   thresholds in `project_config_dod.md`)
5. **`.claude/settings.json` host-path guard** — fails the push if the
   COMMITTED `settings.json` contains absolute paths under `/Users/<name>/`
   or `/home/<name>/`. Host-specific entries belong in
   `.claude/settings.local.json` (gitignored). Rules the whole team shares
   that are this project's own belong in `.claude/settings.project.json`
   (tracked, never pulled), which `blueprint pull` merges into
   `settings.json`; the guard scans the merged, committed `settings.json`, so
   it covers them too. Three drift cycles in a row
   landed `~/.ssh`, `~/sources/`, and `~/Library/Containers/...` in the
   shared settings via Claude Code's auto-allowlist; this guard prevents
   the fourth.
6. Project-specific guards (loaded from
   `.githooks/pre-push-project` if it exists — placeholder guards,
   placeholder-injection checks, asset invariants, release-notes guard, etc.)
   The file's blueprint-managed region, between its `BLUEPRINT:BEGIN` and
   `BLUEPRINT:END` markers, runs the blueprint's own stages, and its last three
   run in this order:
   - **ShellCheck** (TASK-033): `sh_lint` from `scripts/run-ts-suites.sh` runs
     `shellcheck --severity=warning` over every file git tracks under
     `scripts/` and `.githooks/` that is shell by extension or shebang, through
     the same scrub. CI's ts-tests job runs the same function. ShellCheck is
     required: a missing one blocks the push and names
     `bash scripts/install-toolchain.sh`. A finding is fixed, or disabled inline
     with a reason; the severity is never lowered. The ts-tests job prepares
     its machine with that installer (BUG-132), so a tool the suites need is
     declared there once and reaches CI and every developer machine together.
     `tests/ts-bridge` #9 runs those provisioning steps offline, with downloads
     and package commands stubbed: it checks the wiring (guards, step exit
     codes, the declared tool set), and it is not a real install smoke test.
     semgrep's install is not pinned.
   - **TypeScript typecheck of `tests/`** (TASK-031): `ts_typecheck` from
     `scripts/run-ts-suites.sh`, which runs the pinned
     `tests/node_modules/.bin/tsc --noEmit -p tests` through `ts_scrubbed`,
     the same environment scrub the vitest batch uses. CI's ts-tests job runs
     the same function. A project without `tests/package.json` skips it with
     that reason; a compiler that is not installed blocks the push.
   - **The vitest batch**, one stage per suite.

**Lint warnings are ratcheted** — fix any new warnings before pushing;
never loosen `--max-warnings` without explicit justification.
**ESLint and Prettier are both blocking** — semantic checks
(ESLint) and style checks (Prettier) are independent gates and
neither can be skipped.
**Never use `--no-verify`** unless the founder explicitly asks. After
pushing, watch the project's CI pipeline; if red, fix before moving on.

## §5 Documentation in sync

> **Canonical treatment lives in §6.4 + `docs/DOCUMENTATION.md`.** This
> section is the short-form rule that originated the discipline; §6.4
> is the per-push gate with two tables (External / Internal); the
> recipes doc names mechanisms per project shape.

For any **user-facing** change (new feature, changed behavior, new error
the user can see), the project's **doc-sync list** moves in lockstep with
the code commit.

The struct2flow framework names this rule but each project owns its sync
list. Define it in `project_config_dod.md` under "Doc-sync list". Typical
entries:
- Internal feature catalog (e.g. `docs/config/FEATURES.md`)
- Customer-facing help page (e.g. `frontend/public/help.html`)
- Customer-facing pricing / landing page bullets
- Internal product / strategy doc (e.g. `docs/product-analysis.md`)
- Internal release-notes source of truth (`docs/RELEASE-NOTES.md`)
- Customer-facing in-app release notes (e.g. `frontend/public/release-notes.html`)
- QA acceptance test catalog (e.g. `docs/config/ACCEPTANCE_TESTS.md`)
- Localization files (i18n key sets per language)

**Rule of thumb**: if a user can see / click / read the change, every file
in the project's sync list gets touched in the same commit as the code.
New feature → new entries everywhere. Changed behavior → updated entries
+ a "Changed" / "Improved" release-notes entry. Removed feature → delete
+ a "Removed" / "Sunset" entry (release notes are append-only history).

**Findings sync**: if you fix a Codex review finding tracked in
`docs/config/findings.md` (or the project's equivalent), update the finding
block there with a "Status: Fixed" section — not just the backlog row.

**Project-specific user-surface rules** (localization key parity, no
internal customer references on public pages, standard `<head>` invariants
for static HTML, etc.) live in `project_config_dod.md` §"User-surface
rules". Gate them like tests.

### §5.1 README updates on every push

The repo's top-level `README.md` is part of the doc-sync list **by
default for every struct2flow project**. Treat it as the canonical
entry point a new visitor reads first; if a push changes anything a
visitor would notice, the README moves with the code.

Specifically, before any `git push` to a public remote:

- **New feature or new CLI surface** → README's Quick Start, command
  list, or feature table mentions it.
- **Removed feature / deprecated flag** → README no longer claims
  the feature works.
- **Architecture change** (e.g. layer reorganization, port/adapter
  swap) → README's Architecture / Stack section reflects it.
- **New dependency or runtime requirement** (Node version bump,
  external service, new env var) → README install / setup section
  covers it.
- **Phase / status change** (e.g. SLICE-XX moved waiting-acceptance
  → done) → README "Status" / "Phases" section updates.

Internal-only changes (refactors that don't change the public
surface, dev-tooling tweaks, documentation reorganization) do not
require a README touch — but the founder is the judge. **When in
doubt, update the README**: a stale README is a worse signal than a
slightly over-broad commit. The pre-push checklist in §7 includes
"README updated if user-visible". The reviewer in §7 should refuse
the handoff if the README claim disagrees with the code state.

## §6 Quality is non-negotiable

The product's value is the quality of what it generates. Therefore:

- If a fix "works" but the approach is ugly, brittle, or stitched from
  overlapping fallbacks, it's **not a fix** — it's a deferred
  regression. Stop, find the solution that belongs in the codebase.
- Patch-on-patch stacks are a signal the architecture is being worked
  around, not fixed. When you catch yourself adding a third fallback,
  escalate to clean redesign with Codex + founder alignment.
- Pick the **most evolutionary solution** — the one that composes well
  with existing primitives, survives adjacent changes, and removes
  surface area rather than adding it. Especially on the core USP paths
  named in `project_config_overview.md`.
- Acceptance is not "the test passes" — it is "the founder and the
  customer would show this to someone else." Anything short is
  unfinished work.

When in doubt between quick patch and slower clean rewrite: pick the
clean rewrite. Document why in the plan file and push for team + Codex
alignment before committing.

### §6.1 Observability — speed-to-fix is the quality differential

The quality of working software is measured by how quickly we can find
and fix errors when they happen. The difference between good and bad
systems is the speed-to-fix differential. See CLAUDE.md §"Observability
is a main concern" for the principle and `docs/OBSERVABILITY.md` for the
recipes.

For every new user-facing route, command, or job:

- [ ] **Error capture** — structured error boundaries (level, event,
      correlation id, error.message, error.stack). No silent swallowing,
      no default-value fallbacks that hide failures.
- [ ] **Agent-readable retrieval path** — the project's MALT-equivalent
      pattern is documented and works: the agent can run one command (a
      log-grep, an admin debug route, a `--diagnose` CLI flag) and get
      the last N failures with full context. **No "paste me the log"
      asks to the founder.**
- [ ] **Alert wired** — threshold + destination declared in
      `project_config_dod.md` §"Alerting". A capability live in
      production without an alarm is not done.
- [ ] **Diagnosis runbook** — the agent has tried-and-true diagnosis
      steps for this error class, documented in CLAUDE.md (project
      section), a memory entry, or `docs/diagnosis.md`.

What you don't ship:
- Silent fallbacks that swallow errors with a default value.
- Unstructured log lines that can't be queried by field.
- Errors the user sees but the agent can't.

The §7 handoff checklist §E pulls these boxes in for any push that adds
a new user-facing capability.

### §6.2 Security — secrets out, vulns fixed before deploy

Quality of working software degrades to zero the moment something is
exploited in production. See CLAUDE.md §"Security is a main concern"
for the principle and `docs/SECURITY.md` for the recipes per stack.

For every push:

- [ ] **Secret scan clean** — `gitleaks detect` over the commits being
      pushed passed in pre-push. No `--no-verify` shortcut. If a secret was
      *ever* committed, it's been rotated, not just removed — the commit
      does not have to reach `origin` for the credential to be burned.
      (Not `protect --staged`: that scans the index, which is empty once the
      commit exists, so it scanned nothing at all — A-03.)
- [ ] **SAST clean** — Semgrep + lint security plugins ran clean
      (or every suppression has a justification comment naming the
      threat-model entry that makes it safe).
- [ ] **SCA clean** — `osv-scanner` reports zero `MEDIUM`+ vulnerabilities
      (CVSS >= 4.0) in project dependencies. This is what the pre-push hook
      and CI both block on. Anything below `MEDIUM` is reported, not
      blocking, and tracked in `docs/config/findings.md` with a planned
      upgrade date.
- [ ] **IaC clean** (if the push touches CDK / Terraform / k8s
      manifests) — `trivy config` reports zero `HIGH`+ findings.

For every push that adds a **new public surface** (route, command,
container with ingress):

- [ ] **Threat-model entry exists** — `project_config_security.md`
      §"Trust boundaries" / §"Auth surfaces" / §"Sensitive data
      classes" covers the new surface.
- [ ] **DAST baseline scheduled** — CI ZAP baseline against the
      preview environment is wired and passing (Recipe A / C) OR a
      written justification why no DAST applies (Recipe B).
- [ ] **Findings register reviewed** — every `[SEC]` finding in
      `docs/config/findings.md` is either fixed, deferred with a
      date, or `Status: Accepted` with a sign-off.

What you don't ship:
- Hard-coded secrets, even "just for local dev".
- `// eslint-disable-next-line` / `// nosemgrep` / `# nosec`
  without a justification comment.
- A new public route without a corresponding ZAP baseline run.
- A dep upgrade that introduces a new `MEDIUM`+ CVE without an
  immediate rollback or pin.

The §7 handoff checklist §E pulls these boxes in alongside §6.1's
observability boxes.

### §6.3 Infrastructure as Code — defined, reviewable, reproducible

Quality of working software depends on the environment matching its
definition. See CLAUDE.md §"Infrastructure as Code is a main concern"
for the principle and `docs/INFRASTRUCTURE.md` for the recipes.

For every push that touches `infra/` (CDK / Terraform / Helm):

- [ ] **Synth/plan clean** — `cdk synth` / `terraform validate` /
      `helm lint` succeeds. The pre-push gate (§4) blocks otherwise.
- [ ] **Reviewable diff in the PR** — `cdk diff` / `terraform plan` /
      `helm diff upgrade` output is attached as a PR comment. The
      diff is the review artifact, not the TypeScript / HCL alone.
- [ ] **No out-of-band resources referenced** — no hand-created ARNs
      being imported by string, no "create this in the console first"
      steps assumed.
- [ ] **Environment parity** — change applies cleanly to all declared
      envs (dev / staging / prod) per `project_config_infra.md`, not
      just one.
- [ ] **Cost impact named** — if change adds resources whose monthly
      cost exceeds the threshold in `project_config_infra.md`
      §"Cost ceilings", PR body calls it out and the founder
      approves explicitly before merge.
- [ ] **Drift report from last nightly scan attached** if a relevant
      drift alert is open on a resource the PR touches.

For every push that adds a **new prod resource** (anything
customer-traffic-bearing or state-holding):

- [ ] **Rollback procedure named** — `project_config_infra.md`
      §"Rollback procedure" covers the new resource, including any
      stateful-resource reversal steps.
- [ ] **Deploy traversal documented** — PR shows the dev → staging →
      prod path the change will take. Emergency-fix exceptions land
      in the next `docs/done/INCIDENT-YYYY-MM-DD.md`.

What you don't ship:
- A resource clicked together in the cloud console with "I'll codify
  it later".
- An IaC string literal containing a real secret (use Secrets Manager
  / SSM / Vault).
- A prod apply / deploy from a laptop. Ever.
- An infra change deployed straight to prod without traversing
  dev → staging → prod, unless it's an emergency fix documented as
  such.
- A drift alert left open >24h without either a "codify" or
  "revert + add alarm" PR linked.

The §7 handoff checklist §E pulls these boxes in alongside §6.1's
observability boxes and §6.2's security boxes.

### §6.4 Documentation — internal + external in sync

Working software with stale documentation is software no one trusts.
See CLAUDE.md §"Documentation is a main concern" for the principle and
`docs/DOCUMENTATION.md` for the recipes.

The project's sync list lives in `project_config_dod.md` §"Doc-sync
list" as **two tables**: External (customer-facing) and Internal
(team-facing). Both tables are non-optional.

For every push that includes a **user-facing change** (a customer can
see / click / read it):

- [ ] **External sync clean** — every file in the External table
      touched in the same commit as the code. README, release notes,
      feature page, help article (or index entry), pricing,
      changelog, API docs — whichever rows apply. Same commit, not
      "same PR".
- [ ] **Privacy / TOS check** — if the change adds a new data class
      collected, a new processor, a new region, or material liability
      / pricing terms, the privacy policy / TOS gets the matching
      clause **in the same commit**, with a `legal-reviewed` label
      requested.
- [ ] **Public roadmap moves** — if the project uses one (Recipe C),
      the roadmap status (`backlog/` → `doing/` → `waiting-acceptance/`)
      is reflected publicly in the same week.

For every push that **changes code state** (regardless of user
visibility):

- [ ] **Internal sync clean** — every file in the Internal table
      affected by the change is updated in the same commit.
      `FEATURES.md`, `ACCEPTANCE_TESTS.md`, `findings.md` (with
      `Status: Fixed`), `PLAN-*.md` lifecycle move, threat-model
      entry, ADR (if architectural), runbook (if new alert).
- [ ] **`HANDOVER.md` current** — per §10, which means **WIP, ephemeral
      state and live hazards only**. A fresh prompt reading it plus the
      lifecycle folders and `git log` can resume. If you added anything a
      command already answers, take it back out.

What you don't ship:
- A user-facing change without the matching external sync-list entry.
- A doc that quotes a flag, route, or feature that no longer exists.
- A new data class collected without a privacy clause.

The §7 handoff checklist §D pulls these boxes in for any push that
modifies tracked code or docs.

## §7 Handoff checklist (walk BEFORE flipping the mic)

Shipping is checked by the gate and CI, every item's row and every BUG's test by
the gate's DoD stages, and the folders by `tests/lifecycle-docs`. What remains:

- **D. Docs in sync** — a user-facing change updated the doc-sync list in the
  same commit (§5). *Judgement.*
- **E. Project gates** — every gate `project_config_dod.md` declares for this
  kind of change is met. *Judgement unless the project wired it.*
- **F. Review of a commit, never the working tree** — when §1b rule 4 requires a
  review, the handoff names the exact commits (`git log --oneline <base>..HEAD`)
  and the reviewer reads that diff. `git status --short` goes in the handoff, and
  an in-scope entry, untracked ones included, is committed or the claimed scope
  is narrowed so it does not overlap; it is not declared away. *Judgement.*
- **G. Baton and handover** — the baton is published with
  `scripts/signal-set.sh`, never hand-edited; its `Task` says what the next actor
  does; `docs/doing/HANDOVER.md` is current (§10). *The gate checks the baton is
  well-formed.*
- **H. Self-audit** — for `OVER_TO_USER`, what the founder should test is listed
  concretely; each such item is in `waiting-acceptance/`, or the `Task` says CI
  is still in flight; `git status` shows nothing half-staged. *Judgement.*

## §8 When the DoD is not the gate

Read-only turns need no DoD. An infra-only operation needs no lifecycle artefact
unless it serves an item, but the baton is still updated. Parallel work outside
the mic holder's scope owns the DoD for its own changes.

## §10 Resume continuity — `docs/doing/HANDOVER.md`

A woken prompt has none of the sleeping prompt's memory and none of its background
tasks. `docs/doing/HANDOVER.md` is the bridge: one file, overwritten in place,
kept current as work lands and committed with the work that changes what is open.

It is a take-over brief (founder, 2026-08-05), and it holds only:

1. **WIP** — what someone picking up open work would otherwise get wrong;
2. **Ephemeral state** — running monitors and how to re-arm them, a pipeline gate
   awaiting approval: what died with the session and no command reconstructs;
3. **Live hazards** — a trap still armed, with the command that checks it.

Anything a command answers (folder counts, `git status`, what shipped) does not
belong in it. Reasoning belongs in the commit, and lessons in the item's row.

**On wake**, read `HANDOVER.md` first, then the live baton, and re-establish the
ephemeral state before continuing.
