# HANDOVER — canonical always-current resume doc

> **Single canonical resume doc (DoD §10).** Overwritten to reflect CURRENT
> state. On **wake**: read this FIRST, then `AGENT_SIGNAL.md`, `CLAUDE.md`,
> `MEMORY.md`. On **sleep**: make every section current, then confirm "ready to sleep".
>
> **Last updated: 2026-08-02.** `origin/main` is at **`7bd575f`**.
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
> **FEATURE-001 and BUG-010 are in `waiting-acceptance/`** awaiting your testing.
>
> **Who am I?** Run `bash scripts/agent-activity.sh --whoami`. Do NOT assume a
> name from any doc: the roster is gitignored and per-engineer, so the
> Orchestrator's name differs per fleet. On this machine it is **Anna**. Until
> BUG-010 was fixed (2026-08-02) every surface said Sylvia regardless of what
> the roster said, which is why older documents here say Sylvia — those are
> historical, not authoritative.

## 0. STATUS

- **`origin/main` = `7bd575f`.** Working tree clean, nothing unpushed.
- **A concurrent session is committing to this repo.** BUG-012 (`9bb4f96`,
  `726d299`) landed mid-session from another prompt on the same git identity,
  and a plain `git push origin main` carried it along with BUG-010 — four
  commits pushed where two were intended. Nothing was lost or broken, but the
  claimed scope of a push is not automatically the scope you worked on. Check
  `git log @{u}..` before pushing, and expect BUG-012 in `doing/BUGS.md` to be
  owned by someone else.
- **Branch protection is LIVE on `main`** (applied 2026-07-30 with founder
  approval): four required checks, PR required for non-admins, no force-push, no
  deletion, and `enforce_admins: false` — the last line is what keeps trunk-based
  development for the owner. Verified by probe, not assumed. Undo:
  `gh api -X DELETE repos/LuizStruct2Flow/blueprint/branches/main/protection`.
- **Claude Code trust is set** for all six project dirs (backup:
  `~/.claude.json.bak-trust`). Caveat: a *running* session may rewrite
  `~/.claude.json` on exit, so if a project reverts to untrusted, re-apply after
  closing that session.
- **Acceptance authority is DELEGATED to QA-2** for agent-protocol and
  repo-infrastructure work (founder decision 2026-07-29). Scope, conditions and
  the stated independence limitation: `project_config_dod.md` §"Acceptance
  authority". **User-surface work is excluded** and needs the founder's own eye.
- **Register of audit findings:** `BLUEPRINT-AUDIT-2026-07-23.md` — `A-01`…`A-37`.
  Remember these are FINDINGS, not work items (see the header table).

## 0b. This stream's own wake-time monitors

> Declared HERE, not in `project_config_paths.md`, and that is deliberate.
> That file is simultaneously this repo's project config **and** the template
> seeded into every new project, so anything concrete written there propagates.
> A hard-coded row for the board below did exactly that on 2026-07-30 — it landed
> in linkedin-watcher-agent complete with a rationale describing an incident that
> happened *here*. `HANDOVER.md` is project-owned and never synced, so it is the
> right home until that structural overlap is fixed (**BUG-009**).

| What | Path | Poll | Why |
|---|---|---|---|
| Cross-stream exchange board | `../../agent-exchange/EXCHANGE.md` | 10s | redcare runs a peer blueprint stream on an offset schedule. Nothing else notifies this session when they post, so without a monitor the board is read only when someone remembers to. Emit **only on change**. |

This applies to *this* stream because it has a peer. A project with no peer
stream should not arm it — a monitor on a file nobody writes is pure overhead.

## 1. RESUME — live state + immediate action

### 1a. Blocked on the founder

| Item | What is needed |
|---|---|
| **BUG-004 Half B** | A fresh clone still pushes ungated (Half A does not close it — the admin bypass is what preserves trunk-based). Three levers: accept explicitly; rely on CI detection (already runs on push to `main` — fine for tests, **weak for secrets: this repo is PUBLIC, so a pushed secret is world-readable before gitleaks starts**); or drop the bypass, which ends trunk-based. |
| **BUG-005** | Gate at ~29 s of a hard 30 s ceiling; `tests/agent-activity-bound --fast` alone is 18.1 s. It has already displaced real coverage — `tests/a2bp-contamination/` (41 assertions) is CI-only. The obvious fix does NOT work: those sleeps are negative assertions and cannot be polled for. Shorten the multiples, move cases to CI, or change the ceiling. |
| **FEATURE-001 acceptance** | Cannot be accepted from here — every meaningful test runs FROM a derived project. Pairs with the derived-project work below; same session. |

### 1b. Derived projects — the big change this session

The founder could not wake linkedin-watcher-agent. Diagnosis went well past the
error message: **three of the four derived projects had never been registered
with blueprint sync at all**, and the fourth pointed at a path from another
machine. So `drift` and `pull` had never done anything in any of them, and every
one was pushing with `core.hooksPath` UNSET — BUG-004 live in production, ×4.

| Project | State now | What is left |
|---|---|---|
| **linkedin-watcher-agent** | **WOKEN.** v2 config, 31 managed files pulled, 5 `project_config_*` seeded, drift CLEAN, gate armed, feed runs. | **23 files uncommitted** — review + commit. **Its gate BLOCKS pushes**: `osv-scanner` finds 7 dev-dependency CVEs (pre-existing; arming the gate is what made them visible). |
| **storm2flow** | v2 config written (its `blueprint_source` was a `/Users/…` path from another machine — every command died on it). Gate armed. | **173 blueprint commits behind.** Not pulled. Missing `STACK_DEFAULTS.md`, `scripts/blueprint`. 2 files dirty. |
| **struct2flow-www** | v2 config written, gate armed. | 7 drifted + **38 files missing**. Not pulled. 1 file dirty. |
| **ai-server-blueprint** | **Untouched — needs a founder decision.** | It has **zero** struct2flow marker files. Adopting it would be a full bootstrap, not a repair. Is it a struct2flow project at all? |

**The checklist, derived from doing linkedin-watcher-agent** (still owed as a
written doc):

1. `.blueprint-source` v2 — `config_version`, `blueprint_source` (this machine),
   `blueprint_remote`, `blueprint_branch`, `bootstrap_sha`, `bootstrap_date`.
2. Commit any uncommitted work FIRST — `pull` overwrites managed files, and a
   local change must be preserved in history rather than silently lost.
3. `blueprint pull --yes`, then **check `.githooks/pre-push` is executable**
   (BUG-008 stripped it; fixed here, but existing projects may already be at 600).
4. Seed `project_config_*.md` (TEMPLATE_FILES — `pull` deliberately skips them)
   with placeholder substitution.
5. `blueprint drift` → expect clean; it arms the gate as a side effect.
6. `bash scripts/agent-activity.sh --daemon` → expect the gate line to say armed.
7. **Run the gate before declaring victory** — it is newly armed and has never
   run in these repos, so it will surface real pre-existing findings.

### 1c. Ready to work on without the founder

- **BUG-011** (S1) — `blueprint a2bp` pushes the branch, opens no PR, prints a
  green ✓ and exits 3 ("filed"). Root-caused and reproduced: `jq` interpolates a
  `null` `.[0]` as the literal string `null`, which the caller's emptiness guard
  does not catch. **The exit code asserts filed while nothing was filed**, which
  breaks the only sanctioned path for improvements to reach the blueprint. The
  smallest high-value item on this list.
- **BUG-008 — REOPENED, and it is S1.** The 2026-07-30 fix does not hold:
  `_bp_sync_exec_bit` was added to all four write paths, but each calls
  `substitute_placeholders` on the very next line and `bp_substitute_in_place`
  does its own `mktemp`(600)+`mv`, undoing the chmod. Repair the PRIMITIVE
  (`chmod --reference` before the `mv`), not the four call sites. Still has no
  regression test — that absence is why it shipped as "fixed".
- **BUG-006** — `LWA_FEED_*` env-var contamination in `scripts/log-activity.sh`.
  Same class as BUG-002. Not started.
- **BUG-009 structural fix** — `project_config_*.md` is both this repo's config
  and the seed template. Mitigated, not fixed; the next concrete thing written
  there propagates again. Real fix: a separate `templates/` source.

**BUG-010 is DONE and pushed (`7311335` test + `fda2971` fix)** — the roster is now the single source
of persona identity, via one parser (`scripts/lib/roster.sh`) that the feed and
`team-kickoff.sh` both read, keyed by role and tolerant of column padding. Row +
acceptance test in `waiting-acceptance/BUGS.md`. Two things worth carrying: the
silent half (a roster miss was indistinguishable from "no roster") is what let it
survive, and `--whoami` exists now because identity had been observable only by
reading log lines.

### 1c-bis. Host / connectivity (2026-08-02, diagnosed not fixed)

The founder's Mac→evo-x2 connection drops repeatedly. It is **not** the Wi-Fi or
the cable (12 kernel NIC events in 2 days). **evo-x2 is dual-homed on two
different routers with two default routes** — `eno1` 192.168.0.97 via
192.168.0.1 (metric 100) and `wlp195s0` 192.168.178.130 via 192.168.178.1
(metric 600). Tailscale logs `portmap: monitor: gateway and self IP changed`
live during a single `netcheck`; 22,194 magicsock events in 3 days, 63
"endpoints changed" per day, and `macbook-air-2` is pinned to the Frankfurt DERP
relay while `imac` gets a direct LAN path. evo-x2's own NAT is friendly
(`UDP: true`, `MappingVariesByDestIP: false`), so the churn — not the NAT — is
what prevents hole-punching. **Fix: drop the second default route**
(netplan + systemd-networkd; `dhcp4-overrides: {use-routes: false}` on
`wlp195s0`, or turn the radio off). Not applied — it needs sudo and it changes
networking underneath a remote session.

### 1d. Waiting on redcare

Posted to the exchange board 2026-07-30 (`b631560`): FEATURE-001, and a request
for their **temp/scratch-folder discipline** and **derived-project permissions**
patterns, which the founder says exist there but are on neither the board nor
`LEARNINGS.md`. Monitor `bysbittjc` is armed on the board and emits only on change.

### 1e. Standing instructions

- **`docs/way-of-working.pdf` — DEFERRED by founder decision (2026-07-29).** The
  PDF is ~6 weeks behind the `.md`, and `scripts/build-deck.sh` cannot run here
  (marp-cli needs a browser; none installed). The founder regenerates it from
  their Mac once the bug work settles. **Do not treat this as a doc-sync
  violation, and do not re-raise it each session.**
- **The other machine does not matter.** Founder, 2026-07-30: "don't care about
  the other machine … I can clone all projects again there." Do not spend effort
  keeping host paths portable.
- **Never wrap a command to avoid a permission prompt.** `blueprint drift` is run
  as one plain command; `(command -v blueprint && … || …) | tail -40` does not
  match the `Bash(blueprint *)` allowlist and routes around the prompt.

### 1f. History worth carrying (not action items)

- **FEATURE-001** (a2bp files a request, cannot write into the blueprint) —
  17 plan-review rounds, then **six defects that only implementation found**,
  including a commit dated from the wall clock and a contamination test that had
  been passing vacuously since it was written. Full list in the folder README.
  That ratio is the useful input when judging how much to trust a plan alone.
- **A-07's real lesson:** four escalating attempts to *infer* which bytes came
  from a placeholder, all defeated by the same fact — substitution destroys that
  information. It closed only when inference was abandoned. Then FEATURE-001
  showed the guard was hardening a door that should not have existed.
- **BUG-004's real lesson:** a tracked hook is not an active hook, and an *armed*
  hook is not an executable one (BUG-008). Every layer of that check has now
  failed silently at least once.

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
     the newest `### ` header on change. Declared in **§0b of this file**, not in
     `project_config_paths.md` — that file is also the seed template, so a
     concrete row there propagates to every new project (BUG-009).

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
- **Derived-repo sweep — STARTED 2026-07-30, see §1b for live state.** It is no
  longer "these projects have drifted by N lines": the measurement that produced
  those numbers was taken by hand, because three of the four had no
  `.blueprint-source` and `drift` had never run in them at all. linkedin-watcher-
  agent is done; storm2flow and struct2flow-www are registered but not pulled;
  ai-server-blueprint needs a founder decision on whether it is a struct2flow
  project at all.
- **redcare's tree is a separate stream, not part of this sweep.**
  `rdc-agenticcoding-blueprint` has a verified inherited-audit report at its
  `docs/doing/INHERITED-AUDIT-2026-07-23.md`, and already held the better
  `AGENT_STATE_HOME` pattern that BUG-002 adopted. Coordinate through the
  exchange board, not by editing their tree.

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
