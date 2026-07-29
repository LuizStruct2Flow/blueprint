# HANDOVER — canonical always-current resume doc

> **Single canonical resume doc (DoD §10).** Overwritten to reflect CURRENT
> state. On **wake**: read this FIRST, then `AGENT_SIGNAL.md`, `CLAUDE.md`,
> `MEMORY.md`. On **sleep**: make every section current, then confirm "ready to sleep".
>
> **Last updated: 2026-07-29 (late).** **A-07 DELIVERED and pushed** (four-eyes
> CLEAN on round 7). **A-03 is IN FLIGHT**: its first fix reached `origin` as
> `1c4dd4c` *before* four-eyes, the review then found a real hole in it, and the
> corrective range is **committed but UNPUSHED** pending a clean round. The
> agent-exchange timestamp switch is **done and committed**. `origin/main` is at
> `1c4dd4c`. Next after A-03: **A-08**.

## 0. STATUS

- **Blueprint self-audit + BUG-001: PUSHED, awaiting acceptance.** `origin/main`
  is at **`1c4dd4c`**. Delivered: **BUG-001** (fork-bomb process leak in the activity
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
- **Artefacts awaiting acceptance:** start at
  [`docs/waiting-acceptance/INDEX.md`](../waiting-acceptance/INDEX.md) — one row
  per work item, what it delivered, where the evidence is, and its real
  acceptance state. The Codex review trails now live in per-item folders rather
  than 26 loose files. Do **not** promote to `done/` without an explicit founder
  acceptance signal.
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
  `docs/waiting-acceptance/A-07-a2bp-guard/CODEX-REVIEW-A07.md`.

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
- **IMMEDIATE NEXT ACTION — A-03 is mid-review, committed but UNPUSHED.** The
  secret gate had never run: `gitleaks protect --staged` scans an index that is
  empty at pre-push time. The first fix went to `origin` as `1c4dd4c` **before
  four-eyes**, and the review then found a real hole in it (the new-ref
  selector subtracted every remote, so a commit already on a private mirror was
  skipped on first disclosure to a public one). Six rounds later: a new ref is
  scanned in FULL, bounded by one per-push deadline with a required
  `timeout`/`gtimeout` provider, and an unfinished scan blocks as INCOMPLETE.
  Trail: `docs/doing/A-03-secret-gate/CODEX-REVIEW-A03.md`.
  **Push only after a clean round.** Codex's R6 read: the security
  implementation has converged; remaining items are record accuracy, not design.
- **Also unpushed in the same range:** the dispatch settle window +
  `scripts/signal-set.sh` (atomic baton publication), and the README contract
  narrowing that was reported fixed but never committed.
- **Founder acceptance still owed** on everything in
  `docs/waiting-acceptance/INDEX.md`. **A-22 is explicitly NOT accepted**
  (Jesko's caveat: a human who clones and pushes without ever running the feed
  or drift is still ungated).
- ~~LOOSE END — agent-exchange timestamp switch~~ **DONE.** All 16 headers on
  Berlin local, README format spec updated, committed in `../../agent-exchange`.
- **KNOWN GAP, pre-existing:** `docs/way-of-working.pdf` is ~6 weeks stale
  (`.md` 2026-07-23, `.pdf` 2026-06-15). `scripts/build-deck.sh` exits 1 here —
  marp-cli needs chrome/edge/firefox and none is installed on this host. The
  script reports the failure correctly; it just cannot run. Rebuild it on a
  machine with a browser, or install one.
- **A-22 is FIXED and awaiting acceptance** (was the immediate next action).
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
  - **A-03** — DONE in substance, **corrective range UNPUSHED** pending a clean
    round. See §1 above for the full state; it is not repeated here so this list
    cannot drift away from it again.
  - **A-08** — **NEXT.** `LWA_FEED_*` env vars in `scripts/log-activity.sh`:
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
