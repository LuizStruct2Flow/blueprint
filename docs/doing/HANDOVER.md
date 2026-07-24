# HANDOVER — canonical always-current resume doc

> **Single canonical resume doc (DoD §10).** Overwritten to reflect CURRENT
> state. On **wake**: read this FIRST, then `AGENT_SIGNAL.md`, `CLAUDE.md`,
> `MEMORY.md`. On **sleep**: make every section current, then confirm "ready to sleep".
>
> **Last updated: 2026-07-24.** BUG-001/002/003 + 7 audit findings are fixed,
> reviewed under four-eyes and pushed; awaiting founder acceptance. The audit
> register still has open findings, led by A-22 and A-07.

## 0. STATUS

- **Blueprint self-audit + BUG-001: PUSHED, awaiting acceptance.** `origin/main`
  is at `1c2f1b9`. Delivered: **BUG-001** (fork-bomb process leak in the activity
  feed — a host was pegged at load 175 for 2.7 days by ~17,400 leaked processes),
  **BUG-002** (linkedin-watcher contamination in a generic file), **BUG-003**
  (the security gate could not tell a scanner *failure* from a scanner
  *finding*), plus audit findings **A-01, A-05, A-12, A-14, A-15, A-27, A-36**.
- **Artefacts awaiting acceptance:** `docs/waiting-acceptance/` — `BUGS.md`,
  `PLAN-BUG-001.md`, and 16 Codex review records. Do **not** promote to `done/`
  without an explicit founder acceptance signal.
- **Register of everything found:** `docs/doing/BLUEPRINT-AUDIT-2026-07-23.md`
  (35 findings, ranked). It stays in `doing/` until the open ones are closed.

## 1. RESUME — live state + immediate action

- **Immediate next action: A-22 — the pre-push hook is not armed in a fresh
  clone.** `core.hooksPath` was UNSET in this checkout, so the gate never ran —
  including on the push of the first 12 commits, which went out **ungated**.
  Wired locally now (`git config --local core.hooksPath .githooks`), but any
  other clone has the same gap. CLAUDE.md and AGENTS.md claim a `postinstall`
  auto-wires it; there is no root `package.json`, so nothing does. Either ship
  one or correct the docs. **This gates the value of every other finding — an
  unenforced gate finds nothing.**
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
  - **A-09** — dispatchers write a literal, unsubstituted `~/.{{PROJECT_NAME}}/`.

## 2. Project-specific config

- **Activity feed:** `bash scripts/agent-activity.sh --daemon`; watch with
  `tail -f logs/agent-activity.log`; `--stop` / `--status`. One resident process
  tracking a byte offset per file — no `tail -F`, no inotify pressure.
- **Feed ↔ dispatcher state-dir mismatch (A-09, OPEN):** the feed derives
  `~/.<repo-name>`, the dispatchers still write literal `~/.{{PROJECT_NAME}}/`.
  To see `[CODEX]` lines here, start the feed with
  `AGENT_STATE_HOME="$HOME/.{{PROJECT_NAME}}"`. That literal directory is
  **shared with other projects** — redcare's dispatches interleave in the log.
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

- **Active Monitors:** a persistent Codex dispatcher
  (`scripts/start-codex-signal-watch.sh`). It resolves `CODEX_BIN` **once at
  startup** — if the codex binary is moved or re-linked, restart it or every
  dispatch fails with `codex: not found` (this happened once already).
- The feed does not survive a reboot; re-arm it.
- Other sessions may run their own dispatchers (redcare has two). Only ever kill
  watchers scoped to *this* repo's path.

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
