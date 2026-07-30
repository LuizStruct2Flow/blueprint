# HANDOVER — canonical always-current resume doc

> **Single canonical resume doc (DoD §10).** Overwritten to reflect CURRENT
> state. On **wake**: read this FIRST, then `AGENT_SIGNAL.md`, `CLAUDE.md`,
> `MEMORY.md`. On **sleep**: make every section current, then confirm "ready to sleep".
>
> **Last updated: 2026-07-30 (end of session).** `origin/main` is at **`271e0bd`**.
>
> **Read this first: there are two ID namespaces and only one is a work item.**
> `BUG-XXX` / `FEATURE-XXX` are the lifecycle IDs — what the commit convention,
> the regression-test naming rule and the lifecycle folders key off. `A-NN` is a
> **finding** from the 2026-07-23 audit, in the same category as a Codex finding
> ID. Findings were being used as work items (folder names, `BUGS.md` rows) and
> then extended with fresh numbers for unrelated new bugs; live items were
> renumbered on 2026-07-30:
>
> | Was | Now |
> |---|---|
> | `A-22` | **BUG-004** — fresh clone is ungated |
> | `A-38` + `A-39` | **BUG-005** — pre-push gate at its 30 s ceiling |
> | `A-08` | **BUG-006** — `LWA_FEED_*` env-var contamination |
> | the a2bp request flow | **FEATURE-001** — in `waiting-acceptance/` |
>
> `done/`, the audit register and the Codex review documents keep their `A-NN`
> IDs: the reviews argue about findings by name, so renaming would break the trail
> they exist to be. An `A-NN` reference anywhere is a citation of history.
>
> **TWO THINGS NEED A FOUNDER DECISION, NOT CODE: BUG-004 and BUG-005** (§1).
> **FEATURE-001 is in `waiting-acceptance/`** awaiting your testing. Next after
> the decisions: **BUG-006**.

## 0. STATUS

- **Blueprint self-audit + BUG-001: PUSHED and ACCEPTED.** (That batch ended at
  `b89e7a4`; `origin/main` is now `271e0bd`.) Delivered: **BUG-001** (fork-bomb process leak in the activity
  feed — a host was pegged at load 175 for 2.7 days by ~17,400 leaked processes),
  **BUG-002** (linkedin-watcher contamination in a generic file), **BUG-003**
  (the security gate could not tell a scanner *failure* from a scanner
  *finding*), plus audit findings **A-01, A-05, A-09 (BOTH halves), A-12, A-14,
  A-15, A-22, A-27, A-36**. A-09 was the live cross-project log contamination (a
  redcare Codex verdict bled into this feed) — dispatcher/state-dir half fixed via
  the shared `scripts/lib/state-dir.sh`, SonarQube-key half fixed by adding
  `sonar-project.properties` to bootstrap TARGETS. All pushed, four-eyes CLEAN.
- **`205f6f7` (R12a) is PUSHED** — it went out in the A-07 batch and four-eyes
  found no regression in it. Its lesson (a fixture must copy the whole
  `scripts/lib/`, never a named file) proved itself immediately: it is what made
  `tests/gate-arming` catch an `exit 1` that would have silently re-opened A-22.
- **ACCEPTED and delivered:** eight items in [`../done/`](../done/), each with
  its review trail in a per-item folder. Verdicts and executed evidence:
  [`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
- **`waiting-acceptance/` holds FEATURE-001** (pushed 2026-07-30, `271e0bd`):
  `blueprint a2bp` no longer writes into the blueprint — it files a branch + PR
  against the blueprint's remote and cannot land anything. That closes the door
  BUG-002 and A-09 both came through, rather than guarding it. Also `blueprint
  prs`, a `drift` staleness warning, `--force` removed, `config_version = 2`.
  Test list, accepted costs and the trust boundary:
  [`../waiting-acceptance/FEATURE-001-a2bp-pr/README.md`](../waiting-acceptance/FEATURE-001-a2bp-pr/README.md).
- **Acceptance authority is DELEGATED to QA-2** for agent-protocol and
  repo-infrastructure work (founder decision 2026-07-29 — "these bugs are hard
  to do the manual validation, I delegate these ones to the machine"). Scope,
  conditions and the stated independence limitation live in
  `project_config_dod.md` §"Acceptance authority". **User-surface work is
  explicitly excluded** and still needs the founder's own eye.
- **Register of everything found:** `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md`
  — findings `A-01`…`A-37`, ranked by severity. It stays in `doing/` until the
  open ones are closed. (The count is stated as a range rather than a number on
  purpose: a hand-maintained total is one more thing to drift, and it had
  already drifted to "35".)

## 1. RESUME — live state + immediate action

- **A-07 DELIVERED, pushed `e605476`.** `blueprint a2bp` was a bare `cp` — the
  vector that put BUG-002 and A-09 into the blueprint. Now: placeholder
  restoration by positional diff against the blueprint's own copy; **every**
  staged line scanned with no alignment-derived exemption (explicit
  `a2bp-allow` and `--force` operator overrides remain); staging round-trip
  verified after forward substitution of both sides; and ONE shared
  substitution primitive (`scripts/lib/placeholders.sh`) used by pull, drift
  and the verifier. 41 assertions in `tests/a2bp-contamination/`, gate-wired.
  **Codex CLEAN on round 7 after six rejections** — full trail in
  `docs/done/A-07-a2bp-guard/CODEX-REVIEW-A07.md`.

  Worth carrying forward: R1–R4 were four escalating attempts to *infer* which
  bytes came from a placeholder, all defeated by the same fact — substitution
  destroys that information. The fix was to stop inferring and make safety not
  depend on the guess. Two of the defects along the way were mine, introduced
  while fixing Codex's; one would have silently reintroduced A-22.
- **A pre-existing `pull` defect fell out of R5:** project names containing `&`
  or `\` were silently mangled by the interpolated `sed` (`&` means "the whole
  match" in a replacement, and bash 5.2 gave `${//}` the same rule). Fixed by
  the shared literal primitive. Unrelated to a2bp; it had been there all along.
- **`205f6f7` (R12a) is pushed** — it went out in the A-07 batch and Codex found
  no regression in it.
- **A-03 DELIVERED, pushed `b89e7a4`, four-eyes CLEAN on round 11.** The secret
  gate had never run: `gitleaks protect --staged` scans an index that is empty
  at pre-push time. Measured with a real secret in the outgoing commit — 0
  commits scanned vs 1 commit and a caught leak. Now scans `remote..local` per
  ref; a **new ref is scanned in full** because nothing local is trustworthy
  enough to subtract (`--not --remotes` and `--not --remotes=<dest>` were both
  tried and rejected in review), bounded by **one per-push deadline** with a
  required `timeout`/`gtimeout` provider, and an unfinished scan blocks as
  INCOMPLETE. Trail:
  `docs/done/A-03-secret-gate/CODEX-REVIEW-A03.md`.

  **The first fix reached `origin` as `1c4dd4c` BEFORE four-eyes, and the
  review then found a real hole in it.** That is the cost of pushing ahead of
  the gate, recorded so it is not repeated.
- **Shipped in the same range:** atomic baton publication
  (`scripts/signal-set.sh`) + the dispatch settle window, and the README
  contract narrowing that had been reported fixed but never committed.
- **FEATURE-001 DELIVERED, pushed `271e0bd` (9 commits).** `blueprint a2bp` filed
  requests instead of writing. Six defects surfaced in implementation that 17
  rounds of plan review had not — including a commit dated from the **wall clock**
  (so retry adoption silently became "always refuse", invisible to any test whose
  two builds finished inside one second — the pre-push gate caught it), a cleanup
  trap reading an out-of-scope `local`, and a contamination case that had been
  passing **vacuously** since it was written. Full list in the folder README.

- **IMMEDIATE NEXT ACTION — TWO DECISIONS, NEITHER NEEDS CODE.**

  **BUG-004 — a fresh clone is ungated.** QA-2 rejected it on 2026-07-29 by
  reproducing the gap rather than restating it: fresh clone, real high-entropy
  token committed, `origin` redirected to a throwaway bare repo, real push
  executed without ever running the feed or drift —
  `real_ungated_push_rc=0`, `secret_commit_reached_destination=yes`.

  **Do not attempt another local mechanism.** That is precisely what the
  rejection rules out: a pre-push hook is repo-local, absent on a clone, and
  defeated by `--no-verify`, so no local hook can make the gate a property of a
  clone. The trade is the founder's — protected-branch required checks (available,
  but a SHA must exist on some ref before it reaches `main`, which conflicts with
  the no-branches rule; costed as **A-37** §4c), or explicit acceptance of the
  residual risk. Options laid out in
  [BUG-004-gate-arming/README.md](BUG-004-gate-arming/README.md).

  **BUG-005 — the gate is at its 30 s ceiling and coverage is being decided by the
  clock.** ~29 s of 30, and `tests/agent-activity-bound --fast` alone is 18.1 s —
  more than every other suite combined. It has already displaced real coverage:
  `tests/a2bp-contamination/` (41 assertions, the A-07 guard) went entirely
  CI-only, `tests/staleness/` is CI-only, `drift-integration --fast` is 2 of 5
  cases. **The obvious fix does not work** — those 18 s are negative assertions
  ("nothing was emitted"), which cannot be polled for, and are already small
  multiples of a 0.25 s tick. The levers are shortening the multiples (weakens the
  assertions) or moving cases to CI; both are coverage judgements. Untouched
  because that suite protects BUG-001 (load 175 for 2.7 days).
- ~~LOOSE END — agent-exchange timestamp switch~~ **DONE.** All 16 headers on
  Berlin local, README format spec updated, committed in `../../agent-exchange`.
- **`docs/way-of-working.pdf` — DEFERRED by founder decision (2026-07-29), not
  a gap to chase.** The PDF is ~6 weeks behind the `.md` (`.md` 2026-07-23,
  `.pdf` 2026-06-15) and `scripts/build-deck.sh` cannot run here — marp-cli
  needs chrome/edge/firefox and none is installed. **The founder will generate
  it from their Mac once the bug work is finished**, deliberately, so it is
  rebuilt once against a settled deck rather than repeatedly against a moving
  one. Do NOT treat the staleness as a doc-sync violation to fix in the
  meantime, and do not re-raise it each session.
- **BUG-004 background** (was audit finding `A-22`; REJECTED 2026-07-29 — see the
  immediate-next-action entry above for current state; this is the history).
  `core.hooksPath` is repo-local config, so it was UNSET in this checkout and
  the gate never ran — including on the push of the first 12 commits, which
  went out **ungated**. The docs blamed a `postinstall` auto-wire that never
  existed (there is no root `package.json`); that claim lived in `CLAUDE.md`
  and the hook header, **not** in `AGENTS.md`. Fixed by `arm_gate`
  (`scripts/lib/gate.sh`) called from the two paths that already run at wake —
  the activity feed and `blueprint drift` — so arming is code on an existing
  path, not an instruction someone must remember. `tests/gate-arming/` (plus
  R11's `osv-scanner` isolation control in `tests/pre-push-scanners`), wired
  into pre-push and CI. **Residual gap:** a human
  who clones and pushes without starting the feed or running drift is still
  ungated; git has no clone hook. Not closable by another LOCAL hook — a pre-push hook is
  advisory by construction. Note the model difference: redcare's "CI = the
  gate" reframe assumes **PR-based** collaboration (required checks gate the
  merge); this repo is **trunk-based**. Note (Slava, R6): required checks DO
  block direct pushes to a protected branch, so enforcement is available here —
  what conflicts is the no-branches rule, since a SHA must exist on some ref for
  checks to run before it reaches `main`. That is a founder trade, not an
  impossibility. **A-37** is the part that holds either way: `security.yml` has
  no configured shared/team failure route — no `if: failure()`, no webhook, no
  declared destination (GitHub's per-user run notifications aside).
- **The founder-agreed "guard the pipe" order, current state:**
  - **A-07** — DONE, pushed, four-eyes CLEAN on round 7.
  - **A-03** — DONE, pushed `b89e7a4`, four-eyes CLEAN on round 11. See §1
    above for the full state; it is not repeated here so this list cannot drift
    away from it again.
  - **BUG-006** (was A-08) — **NEXT.** `LWA_FEED_*` env vars in `scripts/log-activity.sh`:
    BUG-002's contamination in env-var-namespace form, still present.
  - **A-09** — DONE. Dispatcher/state-dir half pushed `1a876c8`; sonar-key half
    fixed and four-eyes clean (both halves closed).

## 2. Project-specific config

- **Activity feed:** `bash scripts/agent-activity.sh --daemon`; watch with
  `tail -f logs/agent-activity.log`; `--stop` / `--status`. One resident process
  tracking a byte offset per file — no `tail -F`, no inotify pressure.
- **Feed ↔ dispatcher state dir (A-09 dispatcher half, FIXED `1a876c8`):** the
  feed and all three dispatchers now derive the SAME `~/.<repo-name>` through
  `scripts/lib/state-dir.sh`, so `[CODEX]`/`[GEMINI]` lines land here without any
  `AGENT_STATE_HOME` override. **Do NOT** relaunch the feed with
  `AGENT_STATE_HOME="$HOME/.{{PROJECT_NAME}}"` — that was the old workaround and
  it re-points the feed at the shared literal dir where other projects interleave.
  If a feed is already running with that override, restart it with
  `env -u AGENT_STATE_HOME bash scripts/agent-activity.sh --daemon`.
- **Scanners:** gitleaks / semgrep / osv-scanner / trivy in `~/.local/bin` (no
  brew on this Ubuntu host). **`jq` is REQUIRED** by the SAST step and fails
  closed without it.
- **semgrep on this host:** the parallel engine dies with
  `io_uring_queue_init: Cannot allocate memory` under `RLIMIT_MEMLOCK=8192 KB`,
  despite ~48 GB free. The gate retries `--jobs 1`, which succeeds. Not a code
  fault — do not "fix" it by weakening the gate.
- **codex CLI must stay ≥0.145.** A 0.144.6 binary reading a 0.145-written
  `~/.codex/models_cache.json` spams `failed to renew cache TTL: missing field
  supports_reasoning_summaries`. Root cause was two installs, with
  `~/.local/bin` shadowing `/usr/local/bin`.

## 3. EPHEMERAL — re-establish

- **Active Monitors — two, both `persistent`, both re-armed on every wake**
  (CLAUDE.md §"On wake" step 3):
  1. **Mic** — `AGENT_SIGNAL.md` `Holder`/`State`, 5s poll, emits on change.
  2. **Exchange board** — `../../agent-exchange/EXCHANGE.md`, 10s poll, emits
     the newest `### ` header on change (`project_config_paths.md` §"Wake-time
     Monitors").

  Added 2026-07-29 after the founder asked "is your monitor working? are you
  also monitoring agent-exchange?" — the answer was no to both. Six Codex
  review rounds had been driven by manual polling and by the founder relaying
  "codex is done". Reactivity is a Monitor, not a habit.
- **Codex dispatcher:** persistent, `scripts/start-codex-signal-watch.sh`. It
  resolves `CODEX_BIN` **once at startup** — if the codex binary is moved or
  re-linked, restart it or every dispatch fails with `codex: not found` (this
  happened once already). **Flip the mic LAST:** the watcher polls every 2s and
  fires on the `State` edit, so writing `State` before the `Task` dispatches
  the previous task's text. That happened on the first A-07 dispatch.
- The feed does not survive a reboot; re-arm it with
  `env -u AGENT_STATE_HOME bash scripts/agent-activity.sh --daemon` (the
  `-u` strips any stale override so it reads its own `~/.blueprint`, per A-09).
- Other sessions may run their own dispatchers (redcare has two). Only ever kill
  watchers scoped to *this* repo's path.

### 3a. agent-exchange board — DONE, nothing owed

- **Repo:** `../../agent-exchange` (local, no git remote — both streams share the
  working tree). Board file: `EXCHANGE.md`.
- **Timestamp switch is COMPLETE and committed.** All 16 `### ` headers are
  Berlin local (`+02:00`), and `README.md`'s format spec now documents the local
  convention with the DST boundary (`+02:00` CEST late Mar–late Oct, `+01:00`
  CET) and the `date '+%Y-%m-%dT%H:%M%:z'` invocation to use — hand-conversion
  is what produced a `+01:00` error this switch had to correct once already.
- **Live board is monitored.** A persistent Monitor watches `EXCHANGE.md` and
  emits on change (see §3 and `project_config_paths.md`), so a message from the
  other stream is not discovered by remembering to look.

### 3b. Permissions — stood down, no longer blocking

- **Status:** the founder stood this down on 2026-07-27 ("the 3rd loose end
  doesn't seem a problem now, you could wake up without needing my
  permissions"). Exchange edits have been prompt-free since. **Nothing owed.**
- **Kept because the root cause is still true and non-obvious:** the permission
  matcher does not resolve relative `../` for paths OUTSIDE the project tree, so
  `Edit(../../agent-exchange/**)` never matches. Only the absolute
  double-slash form works out-of-tree (cf. `Read(//Users/**/**)`). If
  out-of-tree edits start prompting again, that is why.
- **Same reason `.claude/settings.local.json`'s `Read(../../../.vscode/**)` is
  suspect** — it was rewritten from `Read(//home/luiz/.vscode/**)` to honour a
  relative-only preference and by the rule above probably does not match. Revert
  that one line if VSCode reads ever start prompting. (`settings.local.json` is
  gitignored — safe to edit freely.)
- **Convention now in force:** permission rules are **file-scoped**, never a
  wildcard over a verb — `Bash(bash -n scripts/lib/contamination.sh)`, not
  `Bash(bash -n *)`. Founder rejected the latter outright as "permission to do
  anything".

## 4. Parked plans / follow-ups (not active)

- **`backlog/` is empty** — no parked items, so no re-open triggers are owed.
- **Founder-gated:** `waiting-acceptance/` → `done/` needs an explicit
  acceptance signal. Nothing is auto-promoted.
- **Derived-repo sweep not started.** `greenwashing-detection-agent`,
  `storm2flow`, `linkedin-watcher-agent` have drifted (33/120/112 lines) and
  carry the same defects. `rdc-agenticcoding-blueprint` has a verified
  inherited-audit report at its `docs/doing/INHERITED-AUDIT-2026-07-23.md`, and
  already held the better `AGENT_STATE_HOME` pattern that BUG-002 adopted.

## 5. Pointers

- **Baton:** `AGENT_SIGNAL.md`. **Rules:** `CLAUDE.md`. **DoD:** `docs/DoD.md`.
- **Audit register:** `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md`.
- **Decision records:** `docs/waiting-acceptance/` (plan + 16 review rounds).
- **Gotcha:** this repo is both the template *and* a working repo, so its own
  `docs/doing/` content would otherwise ship into every derived project. That is
  what `.gitattributes export-ignore` prevents — keep new work-item files inside
  the lifecycle folders it covers, or they will leak into bootstraps.
- **Worth knowing:** across this work the cross-provider reviewer caught ~14
  real defects, and roughly half were claims of mine that outran what the code
  proved. Treat the four-eyes rule as load-bearing, not ceremony.
