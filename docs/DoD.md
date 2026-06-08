# Definition of Done (DoD)

Canonical quality bar + handoff contract for Claude Code + Codex. This
document is the single source of truth for "is this work done?" — if any
item below is unchecked, the work is **not done** and the mic does **not**
flip to `OVER_TO_USER`.

CLAUDE.md is the longer reference manual; this file is the operational
checklist you read before every handoff. Both agents are bound by it.

> **Read order:** §1–§7 are the rules grouped by concern. §8 is the
> step-by-step checklist you walk before every handoff — it points back
> at the rule sections, so you can read them in any order but you walk
> §8 last.

> **Project-specific extensions live in `project_config_dod.md`** at the
> repo root. Anything in this file is generic struct2flow agent protocol;
> anything project-specific (sync list, visual / layout rules, localization,
> head guards, deploy-target names) belongs in that file. Both files together
> define DoD for this repo.

---

## §1 Lifecycle (parked + three founder-gated states)

```
docs/backlog/  →  docs/doing/  →  docs/waiting-acceptance/  →  docs/done/
              (promote)        (push to main)              (founder explicitly accepts)
```

| State | What lives here | How items leave |
|---|---|---|
| `backlog/` | **Parked** work. Bugs, features, plans, decision records that exist but are not active. Every item carries a state: `KEEP` (will be pulled), `DEFER` (re-open trigger documented), or `OBSOLETE` (audit trail before deletion). | **Promotion** (move row / `PLAN-*.md` / folder into `doing/`) or **cancellation** (delete + one-line pointer in `docs/config/findings.md`). |
| `doing/` | Active work being implemented. `BUGS.md` rows, `PLAN-*.md` files, `HANDOVER.md`, `CHANGES.md` rows for non-bug changes in flight. | The push to `main` that ships the fix/feature. |
| `waiting-acceptance/` | Pushed to `main`, awaiting founder acceptance testing. Bug rows in `BUGS.md`, behavior changes in `CHANGES.md`. | Founder says "BUG-0XX is done" / "accept item Y" / "it worked". |
| `done/` | Founder-accepted, fully delivered work. | Items don't leave; this is the source of truth for "what we have delivered". |

**Reopen path**: if the founder rejects acceptance, finds a regression, or
asks for rework → move the row back from `waiting-acceptance/` to `doing/`
in the same handoff turn.

**Four folders, each with a non-optional rule**:
- `backlog/` is **not** a graveyard — every parked row carries an explicit
  re-open trigger or an OBSOLETE marker. Rows without one get groomed out
  at the next grooming pass.
- `doing/` is not a graveyard either — if it's pushed, move it.
- `waiting-acceptance/` is the only path into `done/`. Never promote
  straight from `doing/` to `done/` (and never from `backlog/`).
- `done/` is founder-only — agents never auto-promote.

**`backlog/` vs `doing/` — when to use which.** A thought of the shape
"someday / maybe / depends on X" lives in `backlog/`. Work you're starting
this session or the next lives in `doing/`. Movement between them happens
in an explicit **grooming pass** — a founder-led session that triages
parked items and pulls a handful into `doing/` (see storm2flow's
`PLAN-BACKLOG-GROOMING-YYYY-MM-DD.md` precedent for the format).

## §2 Bug management

Every bug — minor or major — follows this:

1. **Sequential numbering**: `BUG-001`, `BUG-002`, … Don't reuse numbers.
2. **Row in `docs/{state}/BUGS.md`** matching the lifecycle (§1).
   The bug exists in exactly **one** of the three BUGS.md files at any
   time. After pushing the fix, move it; don't leave a copy in `doing/`.
3. **Numbered regression test** with the bug number in the test name:
   ```js
   it('BUG-007: <one-line summary>', () => { … })
   ```
4. **No recurring bugs**: if it's fixed, it stays fixed. A bug coming
   back means the regression test was wrong, not "oh well, refile it".

**Minor vs major**:
- **Minor bug** (cosmetic, clearly scoped, low-impact) → fix directly
  per the normal team workflow.
- **Major bug** (affects a core USP path defined in
  `project_config_dod.md`, or has already had a failed fix attempt) →
  **plan first**, do NOT jump to implementation. Create
  `docs/doing/PLAN-BUG-XXX.md` with root cause analysis, affected files,
  fix approach, tests needed, rollback strategy. **Wait for Codex +
  Claude Code consensus** before implementing.

## §3 Test coverage (non-negotiable)

The shipped code is only as good as the tests that gate it.

1. **Every bug fix has a regression test** (unit / integration / E2E).
   The bug number is in the test name (§2.3).
2. **Two-commit pattern** for product/runtime bug fixes:
   - `test(BUG-XXX): minimal reproducer (failing)`
   - `fix(BUG-XXX): <fix>`

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
   | Minimal reproducer | sibling of the `*.test.{js,ts}` it reproduces | pre-push |
   | Unit | `*.test.{js,ts}` | pre-push |
   | Integration / wire | `*.integration.test.{js,ts,jsx,tsx}` | pre-push |
   | Data snapshot | `*.snap.test.{js,ts}` | pre-push |
   | Pixel snapshot | project-defined | manual + CI pipeline |
   | E2E / acceptance | project-defined | CI pipeline |

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
7. **Pre-push gate must complete in ≤30 s** wall-clock. Slower tests
   live in a `npm run test:slow`-style target or the CI pipeline. If a
   test category outgrows the budget, the answer is to move it out of
   pre-push, not to weaken the ceiling.

## §4 Pre-push gate (fail-fast)

The shared pre-push hook at `.githooks/pre-push` enforces (in order, per
struct2flow convention — the project's exact targets are wired in
`project_config_dod.md`):

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
   `.claude/settings.local.json` (gitignored). Three drift cycles in a row
   landed `~/.ssh`, `~/sources/`, and `~/Library/Containers/...` in the
   shared settings via Claude Code's auto-allowlist; this guard prevents
   the fourth.
6. Project-specific guards (loaded from
   `.githooks/pre-push-project` if it exists — placeholder guards,
   placeholder-injection checks, asset invariants, release-notes guard, etc.)

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

- [ ] **Secret scan clean** — `gitleaks protect --staged` passed in
      pre-push. No `--no-verify` shortcut. If a secret was *ever*
      committed, it's been rotated, not just unstaged.
- [ ] **SAST clean** — Semgrep + lint security plugins ran clean
      (or every suppression has a justification comment naming the
      threat-model entry that makes it safe).
- [ ] **SCA clean** — `osv-scanner` reports zero `HIGH`+ CVEs in
      project lockfiles. New CVEs below `HIGH` tracked in
      `docs/config/findings.md` with a planned upgrade date.
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
- A dep upgrade that introduces a new `HIGH`+ CVE without an
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
- [ ] **`HANDOVER.md` current** — per §10. A fresh prompt reading
      only `HANDOVER.md` + `AGENT_SIGNAL.md` + `CLAUDE.md` + `MEMORY.md`
      can resume.

For every push that **changes a blueprint-level concern** (this repo:
blueprint only):

- [ ] **Deck updated in the same commit** — `docs/way-of-working.md`
      reflects the new concern count, principle, or recipe. PDF
      regenerated (`scripts/build-deck.sh`).
- [ ] **Per-concern recipe doc updated** — if the change touched
      Observability, Security, IaC, Documentation, or Cost, the
      corresponding `docs/<CONCERN>.md` matches.
- [ ] **README concern table matches** — if the change added,
      removed, or renamed a concern, the README table reflects the
      new shape.

What you don't ship:
- A user-facing change without the matching external sync-list entry.
- A doc that quotes a flag, route, or feature that no longer exists.
- A new data class collected without a privacy clause.
- A blueprint-level concern change with the deck left at the old
  count (it self-violated twice this week — this gate is the third-
  time backstop).

The §7 handoff checklist §D pulls these boxes in for any push that
modifies tracked code or docs.

---

## §7 Handoff checklist (run BEFORE flipping the mic)

Walk every box. If any is unchecked, finish it; do **not** flip
`State` to `OVER_TO_USER` until they're all green.

### A. Code is shipped (→ §4)
- [ ] All commits pushed to `main`
      (`git log origin/main..HEAD` must be empty)
- [ ] Pre-push hook ran clean (no `--no-verify` shortcut)
- [ ] CI pipeline went green for the latest commit, OR is in flight and
      will go green (state explicitly in the signal)

### B. Tests cover the change (→ §3)
- [ ] Every shipped bug has a `it('BUG-XXX: …')` regression test
- [ ] If two-commit pattern applies: reproducer commit precedes fix
      commit; reproducer was verified failing on the parent
      (stash-test-restore loop)
- [ ] No new tests call a live non-deterministic service in pre-push
      (e.g. live-LLM tests belong in a nightly eval suite)
- [ ] Coverage report run; no surprise regression in coverage
- [ ] Pre-push runtime still ≤30 s
- [ ] If snapshots changed: locally approved + committed; diff
      reviewed; CI was NOT run with `-u`

### C. Lifecycle artefacts moved (→ §1)
- [ ] `doing/BUGS.md` row → moved to `waiting-acceptance/BUGS.md`
      for every shipped bug, with commit SHA(s) named
- [ ] `doing/BACKLOG.md` row → moved to `waiting-acceptance/BACKLOG.md`
      for every shipped backlog item
- [ ] **Defect-shaped change** (founder observed a broken behavior,
      race, regression, UX break — anything that looks/feels like a
      bug from the user's POV) → file as a `BUG-XXX` row in
      `BUGS.md`, not as a `CHANGES.md` row. The founder's mental
      model is "BUGS.md is what I test"; splitting defects across
      two files hides them.
- [ ] **Forward feature** (new slice, new module, founder-direction
      addition with no underlying defect) → row in
      `waiting-acceptance/CHANGES.md` with commit SHA + verification
      path. This file is narrow on purpose; default-to-`BUGS.md` if
      uncertain.
- [ ] `PLAN-*.md` for any completed plan → moved from `doing/` to
      `waiting-acceptance/`. If the plan has open slices, it stays in
      `doing/`; mark shipped slices DONE inline.
- [ ] Anything rejected / regressed → moved back from
      `waiting-acceptance/` to `doing/` (not silently left in flight)

### D. User-facing docs in sync (→ §5) — only if user-facing change
- [ ] Every file in the project's doc-sync list (in
      `project_config_dod.md`) updated in the same commit as the code
- [ ] Project's user-surface rules (localization parity, no internal
      customer references, head invariants, etc.) all green per
      `project_config_dod.md`

### E. Project-specific quality gates — only if applicable
- [ ] Any project-specific gates declared in `project_config_dod.md`
      (visual / layout SVG proofs, accessibility checks, infra cost
      ceilings, security posture reviews, etc.)

### F. Codex review fixes (→ §5) — only if applicable
- [ ] Findings register (`docs/config/findings.md` or equivalent)
      finding block has "Status: Fixed"

### G. Signal + resume doc reflect reality (→ AGENT_SIGNAL.md + HANDOVER.md + §10)
- [ ] `AGENT_SIGNAL.md` `Holder` / `State` / `Task` / `Last update` all
      updated
- [ ] `Task` names **what the next actor needs to do**, not just what
      I did
- [ ] If state is `OVER_TO_USER`, the things the founder needs to test
      are concretely listed (and findable in `waiting-acceptance/`)
- [ ] **`docs/doing/HANDOVER.md` is current (§10).** A fresh prompt
      reading only `HANDOVER.md` + `AGENT_SIGNAL.md` + `CLAUDE.md` +
      `MEMORY.md` can resume with zero other context — including the
      EPHEMERAL state (running monitors, pending pipeline gates) that
      does NOT survive a prompt switch.

### H. Self-audit (the cheap step that catches everything)
- [ ] `ls docs/waiting-acceptance/` shows the artefacts the `Task`
      field claims are waiting. If signal claims "BUG-XXX awaits test"
      but the row is still in `doing/`, the handoff is a lie.
- [ ] `git status` is clean (no half-staged changes, no
      build / test artefacts accidentally staged)

---

## §8 When the DoD is NOT the gate

- **Infra-only operations** (deploy, pipeline approve, console fixes):
  no lifecycle artefacts needed unless tied to a tracked bug. Signal
  still must be updated.
- **Investigative / read-only turns** (founder asks a question; you
  answer with no code change): no DoD applies. Signal stays as-is.
- **Mid-handoff parallel work** allowed by CLAUDE.md (edits outside the
  active holder's declared scope): the parallel actor doesn't claim the
  mic, but still owns the DoD for their own changes — they surface them
  in their next signal flip.

## §9 Failure modes this DoD prevents

Add to this list whenever a new failure mode bites — the DoD only
improves if real misses are folded back in.

> This list starts empty per new project. Failures observed across all
> struct2flow projects that motivated a generic rule can be added here in
> abstract form (no project-specific names / IDs). Project-specific
> failure modes go in `project_config_dod.md` §"Failure modes".

---

## §10 Resume continuity — the handover doc + sleep/wake protocol

The founder switches between prompts with **sleep / wake**: one prompt is
put to sleep, another is woken (and back). The woken prompt has **none** of
the sleeping prompt's in-conversation memory and **none** of its running
background tasks. The bridge between prompts is a single canonical resume
doc.

**The canonical resume doc is `docs/doing/HANDOVER.md`** — one file, always
overwritten to reflect the CURRENT state (not dated copies that accumulate
and go stale). It is a first-class DoD artefact, gated by §G.

### Keep it current continuously (not just at handoff)
A prompt can degrade or be put to sleep **at any moment**, so `HANDOVER.md`
must be updated whenever you finish a meaningful unit of work — after a
push, after starting/stopping a monitor, after a pipeline gate, after a
founder decision. Treat it like the signal: stale = lying.

### The sleep-time handover check (run when the founder says "sleep" / before any handoff)
Before going dormant, **verify `HANDOVER.md` lets a cold prompt resume with
zero other context**, then confirm "ready to sleep". It must contain:
1. **Live state** — `main` HEAD vs `origin`; `git status` clean or what's
   uncommitted/held; what just shipped.
2. **Immediate next action** — the single most important thing the waking
   prompt should do first, with the exact command.
3. **EPHEMERAL state that died with the session** — running `Monitor`
   tasks (and how to re-establish them, e.g. the orchestration watcher
   `scripts/start-codex-signal-watch.sh`), and any **pending pipeline
   gate** awaiting manual approval (with the approve command + how to get
   the token). This is the #1 thing a woken prompt misses.
4. **Open threads / priorities** — what's in flight and what's next.
5. **Gotchas** — traps that bit this session.

### The wake side
On "wake" (or any new prompt), **read `HANDOVER.md` first**, then
`AGENT_SIGNAL.md`, `CLAUDE.md`, `MEMORY.md`. Re-establish the ephemeral
state §10.3 names before continuing.

---

## §11 Blueprint sync (struct2flow framework)

This DoD is sourced from the struct2flow **blueprint** at
`~/sources/struct2flow/blueprint/`. The blueprint is the canonical generic
agent protocol; project-specific extensions live in
`project_config_dod.md`. Two sync directions:

- **Pull**: on wake, if the blueprint's `docs/DoD.md` has changed since
  this file was last synced, surface the diff and offer to pull forward.
- **Push (back-propagate)**: when you improve a generic rule in this file
  (anything not project-specific), offer to back-propagate to the
  blueprint so other projects inherit the improvement.

Project-specific edits go in `project_config_dod.md`, not here. If you
catch yourself adding a project-specific incident or path to this file,
move it to `project_config_dod.md` before committing.
