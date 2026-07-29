# HANDOVER — canonical always-current resume doc

> **Single canonical resume doc (DoD §10).** Overwritten to reflect CURRENT
> state. On **wake**: read this FIRST, then `AGENT_SIGNAL.md`, `CLAUDE.md`,
> `MEMORY.md`. On **sleep**: make every section current, then confirm "ready to sleep".
>
> **Last updated: 2026-07-29.** **A-07 is DELIVERED and pushed** —
> `origin/main` at `e605476`, nothing unpushed, Codex four-eyes CLEAN on round
> 7. `doing/` holds no in-flight work. Everything now sits in
> `waiting-acceptance/` behind the founder; start at its **INDEX.md**. Open
> audit findings led by **A-03** then A-08. One loose end remains: the
> half-finished agent-exchange timestamp switch (§3a) — founder's call.

## 0. STATUS

- **Blueprint self-audit + BUG-001: PUSHED, awaiting acceptance.** `origin/main`
  is at `32adcf3`. Delivered: **BUG-001** (fork-bomb process leak in the activity
  feed — a host was pegged at load 175 for 2.7 days by ~17,400 leaked processes),
  **BUG-002** (linkedin-watcher contamination in a generic file), **BUG-003**
  (the security gate could not tell a scanner *failure* from a scanner
  *finding*), plus audit findings **A-01, A-05, A-09 (BOTH halves), A-12, A-14,
  A-15, A-22, A-27, A-36**. A-09 was the live cross-project log contamination (a
  redcare Codex verdict bled into this feed) — dispatcher/state-dir half fixed via
  the shared `scripts/lib/state-dir.sh`, SonarQube-key half fixed by adding
  `sonar-project.properties` to bootstrap TARGETS. All pushed, four-eyes CLEAN.
- **One commit PUSHED-PENDING:** `205f6f7` `test(R12a)` — bound-test copies the
  whole `scripts/lib/` instead of a named file (ported from redcare). Committed,
  **NOT pushed, NOT four-eyes reviewed.** Test-only. Either hand to Codex + push,
  or fold into the next review batch.
- **Artefacts awaiting acceptance:** `docs/waiting-acceptance/` — `BUGS.md`,
  `PLAN-BUG-001.md`, and the Codex review records (BUG-001, A-05/A-27, the
  A-22 R2–R8 set, and `CODEX-REVIEW-A09-SONAR.md`). Do **not** promote to `done/`
  without an explicit founder acceptance signal.
- **Register of everything found:** `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md`
  (35 findings, ranked). It stays in `doing/` until the open ones are closed.

## 1. RESUME — live state + immediate action

- **A-07 DELIVERED, pushed `e605476`.** `blueprint a2bp` was a bare `cp` — the
  vector that put BUG-002 and A-09 into the blueprint. Now: placeholder
  restoration by positional diff against the blueprint's own copy; **every**
  staged line scanned (no exemption — an exemption list was the one place a
  misattribution could leak); staging round-trip verified; and ONE shared
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
- **IMMEDIATE NEXT ACTION — founder acceptance.** Nothing is in flight. Start at
  `docs/waiting-acceptance/INDEX.md`: one row per work item, what it delivered,
  where the evidence is. **A-22 is explicitly NOT accepted** (Jesko's caveat: a
  human who clones and pushes without ever running the feed or drift is still
  ungated). After acceptance, the next audit finding is **A-03**, then A-08.
- **LOOSE END — agent-exchange timestamp switch is HALF DONE (see §3a).** The
  board was being converted UTC→Berlin local (`+02:00`). 15/16 headers
  converted, **uncommitted**; 1 header + the README format line remain. The
  permissions blocker that stalled it was stood down by the founder on
  2026-07-27. Finish or revert — founder's call.
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
- **Then, in the founder-agreed "guard the pipe" order:**
  - **A-07** — `blueprint a2bp` copies a project's file into the blueprint with a
    bare `cp`: no reverse-substitution of the project name, no contamination
    scan. This is the vector that created BUG-002; fixing it stops the next one.
  - **A-03** — `gitleaks protect --staged` scans the *index*, which is empty at
    pre-push time. Empirically confirmed: a real gate run reports
    "0 commits scanned, ~0 bytes" then passes. Use
    `gitleaks detect --log-opts="$remote_sha..$local_sha"`.
  - **A-08** — `LWA_FEED_*` env vars in `scripts/log-activity.sh`: BUG-002's
    contamination in env-var-namespace form, still present.
  - **A-09** — DONE. Dispatcher/state-dir half pushed `1a876c8`; sonar-key half
    fixed and in four-eyes (both halves now closed).

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

### 3a. agent-exchange timestamp switch — HALF DONE, uncommitted

- **Repo:** `../../agent-exchange` (local, no git remote — both streams share the
  working tree). Board file: `EXCHANGE.md`.
- **What's underway:** founder asked to switch the board from **UTC (`Z`)** to
  **Berlin local (`+02:00`, CEST)**. Berlin in July is **UTC+2** (CEST), not +1.
- **State:** 15 of 16 `### ` header timestamps converted to `+02:00`
  (**uncommitted** working-tree changes). **Remaining:** (1) the last header
  `### 2026-07-24T08:45Z — Sylvia@redcare` → `10:45+02:00`; (2) the `README.md`
  header-format spec still says `<UTC>` — change it to the local convention.
  Then commit. The last committed exchange message is `e14b897` (my A-09 reply).
- **How to convert:** `date -u` on this box IS correct UTC; add 2h for the header.
  Do it via the **Edit tool** (founder rejected a `perl -i` one-liner — wanted
  transparent per-line edits, not an interpreter).
- **Decision owed:** finish the switch, or revert all 15 back to `Z` for
  consistency. Founder's call.

### 3b. PERMISSIONS BLOCKER (this is why 3a stalled)

- **Symptom:** every edit to `../../agent-exchange/EXCHANGE.md` prompts, even
  after running `/permissions`.
- **Root cause (evidenced, not inferred):** the permission matcher does **not**
  resolve relative `../` for paths OUTSIDE the project tree. The committed
  `.claude/settings.json` has `Edit(../../agent-exchange/**)` (relative) — it
  never matches, so edits fall through to a prompt. Only the **absolute
  double-slash** form works for out-of-tree paths (cf. `Read(//Users/**/**)`).
- **Founder constraint:** wants **relative paths ONLY**, no absolute paths in the
  config. That is in direct conflict with prompt-free out-of-tree edits here.
  **Undecided** — two options on the table:
  - **(A)** put `//home/luiz/dev/agent-exchange/**` in the **gitignored**
    `.claude/settings.local.json` (absolute, but per-machine, never shared).
  - **(B)** stay relative-only and accept a prompt on every exchange edit.
- **⚠ Regression I introduced:** to honour "relative only" I changed
  `.claude/settings.local.json`'s `Read(//home/luiz/.vscode/**)` →
  `Read(../../../.vscode/**)`. By the same root cause that relative form likely
  **breaks the vscode read permission**. If VSCode file reads start prompting,
  revert that one line back to `Read(//home/luiz/.vscode/**)`.
  (`settings.local.json` is gitignored — safe to edit freely.)

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
