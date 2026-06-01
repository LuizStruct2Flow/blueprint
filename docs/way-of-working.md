---
marp: true
theme: default
paginate: true
size: 16:9
header: 'struct2flow — way of working'
footer: 'Luiz Scheidegger · luiz@struct2flow.com'
style: |
  section { font-size: 26px; }
  section.lead { text-align: center; }
  section.lead h1 { font-size: 64px; }
  section.lead h2 { font-size: 36px; color: #555; }
  h1 { color: #1a1a1a; }
  h2 { color: #333; }
  blockquote { font-style: italic; color: #444; border-left: 4px solid #888; padding-left: 16px; }
  table { font-size: 22px; }
  code { background: #f3f3f3; padding: 2px 6px; border-radius: 3px; }
  pre { font-size: 20px; }
---

<!-- _class: lead -->

# Way of Working

## How struct2flow builds software

Luiz Scheidegger · 2026

---

# Why this deck

How I ship software, across five concerns:

1. **Architecture** — DDD + Clean + Hexagonal
2. **Lifecycle** — four states, founder-gated
3. **Quality** — Definition of Done, non-negotiable
4. **Observability (MALT)** — Monitoring · Alerting · Logging · Tracing
5. **Security** — current posture and roadmap

Everything below is **enforced by tooling**, not memos.
The rules live in code (hooks, scripts, gates) — not in slides.

---

<!-- _class: lead -->

# The thesis

> Quality of working software equals
> **how fast you can find and fix errors.**

The difference between good and bad systems
is the **speed-to-fix differential**.

Every section that follows is a way of compressing that gap.

---

# 1 · Architecture

**Default for every struct2flow project:**

- **Domain-Driven Design + Clean Code + Clean Architecture**
- **Hexagonal (ports & adapters)** whenever non-trivial external integration exists
- **Layering:** `domain → application → ports → adapters` — dependencies point inward only
- Override allowed for thin CRUD or one-shot scripts — state why in one sentence

> *Source of truth:* `STACK_DEFAULTS.md` § Architecture

---

# 1 · Architecture — why this default

- **Domain stays pure and testable** — no framework imports in the core
- **Adapter swaps are bounded** — DynamoDB → Mongo, REST → GraphQL, sync → event-driven
- **Infrastructure pushed to the edges** — core survives stack changes
- **Coverage thresholds bite where it counts** — domain + application layers

The point isn't dogma. It's that the *most expensive layer to get wrong*
(the domain) is the *easiest to keep clean* — if you keep frameworks out of it.

---

# 2 · Lifecycle — four founder-gated states

```
backlog/  →  doing/  →  waiting-acceptance/  →  done/
          promote     push to main          founder accepts
```

| State | What lives here |
|---|---|
| `backlog/` | Parked work — every row marked `KEEP` / `DEFER` / `OBSOLETE` |
| `doing/` | Active. Bugs, plans, in-flight work |
| `waiting-acceptance/` | Pushed to main, awaiting founder test |
| `done/` | Founder-accepted. Source of truth for *delivered* |

---

# 2 · Lifecycle — the rules that matter

- **`backlog/` is not a graveyard** — every parked row carries an explicit re-open trigger or `OBSOLETE` marker
- **`waiting-acceptance/` is the only path into `done/`** — never skip
- **`done/` is founder-only** — agents never auto-promote
- **Reopen path:** rejected acceptance → row goes back to `doing/`
- **Grooming pass:** founder-led session pulls parked items into `doing/`

> The lifecycle answers **"what has been delivered?"** —
> not "what has been merged?" Those are different questions.

---

# 3 · Quality — Definition of Done

`docs/DoD.md` is the canonical handoff gate. Eight checklist sections.

**Non-optional rules:**

- **Two-commit pattern** — reproducer test (failing) → fix
- **Coverage thresholds** — greenfield ≥90%, brownfield ≥70% (ratcheted)
- **ESLint + Prettier** — both blocking, independent gates
- **Pre-push ≤30 s** wall-clock — slower tests go to CI
- **Snapshots are approval-based** — CI never runs with `-u`

---

# 3 · Quality — the two-commit pattern

Every product/runtime bug fix lands as **two** commits, in this order:

1. `test(BUG-XXX): minimal reproducer (failing)`
2. `fix(BUG-XXX): <fix>`

The reproducer **must fail** on the parent commit.
Verified by stash-test-restore — `git log` proves it.

> "I added a regression test" is only credible when `git log`
> shows the test failing before the fix.

This single rule kills the "I'll write the test later" anti-pattern at source.

---

# 3 · Quality — the pre-push gate

The shared `.githooks/pre-push` hook **blocks the push** if any step fails:

1. Build (e.g. `tsc` — catches missing imports)
2. Lint (`--max-warnings` ratcheted; never loosen)
3. **Prettier `--check`** — fails on any unformatted file
4. Tests + **coverage gate** (project's threshold)
5. Project-specific guards (placeholder, asset, release-notes…)

Same hook, every project. No "I'll skip pre-push just this once."

---

# 4 · Observability — MALT

**M**onitoring · **A**lerting · **L**ogging · **T**racing —
a first-class concern, not an afterthought.

> *Since quality is non-negotiable, the quality of the working software
> is fundamental. The difference between good and bad systems is how
> quickly we can find and fix errors — the speed-to-fix differential.*

Four non-negotiable capabilities per project →

---

# 4 · Observability — the four capabilities

1. **Every error path is captured.**
   No silent swallowing. No `try/catch` that returns success. If it broke, it logs.

2. **Every captured error is agent-queryable** without human ferrying.
   Documented retrieval path; agent uses it *before* asking the founder.

3. **Every shipped capability is alertable** in production.
   Threshold + destination declared in `project_config_dod.md`.

4. **The agent diagnoses first.**
   Humans pinged only when the agent is genuinely stuck.

---

# 4 · Observability — recipes per stack

`docs/OBSERVABILITY.md` — concrete patterns per runtime:

- **Recipe A — AWS / serverless** (CloudWatch JSON logs, EMF metrics, X-Ray tracing)
- **Recipe B — desktop / CLI** (structured local logs, `--diagnose` flag)
- **Recipe C — third-party hosted** (Sentry / Datadog wiring)

Each recipe delivers the same four capabilities — they just differ in plumbing.

**Worked example in production:** storm2flow's MALT pattern (`FEATURE-006`).

---

# 4 · Observability — wired into the DoD

For every new user-facing route, command, or job — `DoD.md` §6.1 requires:

- [ ] **Error capture** — structured boundaries; no silent swallowing
- [ ] **Agent-readable retrieval path** — one command gets the data
- [ ] **Alert** — threshold + destination per `project_config_dod.md`
- [ ] **Runbook link** if the alert can wake someone up

> A feature without observability is not a feature done.

---

# 5 · Security — four non-negotiable capabilities

> *Quality of working software degrades to zero
> the moment something is exploited in production.*

Same principle as MALT, applied at a different timescale:

1. **No secrets in code or git history.**
   `gitleaks` blocks the push; leaked secrets get rotated, not unstaged.

2. **Static analysis catches OWASP top-10** at commit time.
   Semgrep + lint security plugins, pre-push, with justified suppressions only.

3. **Deps and infra are scanned continuously.**
   `osv-scanner` per push; `trivy config` before deploy; nightly CVE watcher.

4. **The agent fixes findings autonomously.** Same diagnosis-first pattern as MALT.

---

# 5 · Security — recipes per stack

`docs/SECURITY.md` — same recipe-per-stack model as `OBSERVABILITY.md`:

- **Recipe A — AWS / serverless**
  gitleaks + Semgrep + osv-scanner in pre-push;
  trivy config + ZAP baseline in CI; nightly active scan + new-CVE watcher.

- **Recipe B — Local app / desktop / CLI**
  Same SAST + SCA + secret-scan. Signed releases instead of DAST
  (no remote surface to scan).

- **Recipe C — Containerized service**
  Above plus `trivy image` (blocks vulnerable base images) and ZAP
  against the service's HTTP surface.

Threat model + thresholds per project: `project_config_security.md`.

---

# The agent layer — radio-over

Codex + Claude Code coordinate through a single file: `AGENT_SIGNAL.md`.

- **One mic at a time** — state: `IDLE` / `ACTIVE` / `OVER_TO_*`
- **Read-only and out-of-scope work** allowed in parallel
- **Reactivity:** `Monitor`-based mtime poll, ~2 s latency, zero token cost between events
- **Codex dispatched by flipping the signal**, not by direct CLI call
- **`HANDOVER.md`** lets a fresh prompt resume cold

> Two AI engineers on the same repo, **without overwrites or duplicate work.**

---

# What this gets you

| If you are… | What you get |
|---|---|
| **A customer** | Software that ships fast *and* is observable when it breaks. Speed-to-fix is the differential. |
| **An investor / partner** | An operational moat — repeatable, auditable, agent-native dev practice. |
| **A collaborator** | A clear bar at every gate. No tribal knowledge. The hooks tell you the rules. |
| **The founder** | The same discipline applied to every project, with the boring parts automated. |

---

# The compounding effect

Each rule is small. The compounding is the point:

- **Hexagonal** keeps the domain pure → tests stay cheap.
- **Cheap tests** make the **90% coverage bar** affordable.
- **High coverage** + **two-commit pattern** means regressions are caught at commit, not in prod.
- **MALT** means the ones that *do* reach prod are diagnosed by the agent in minutes.
- **Lifecycle gates** mean "done" actually means delivered, not merged.

The output is a system where **speed-to-fix shrinks every week.**

---

# Where to read more

- `README.md` — what's in the blueprint, how to spawn a project
- `CLAUDE.md` — long-form agent protocol
- `docs/DoD.md` — Definition of Done (the handoff gate)
- `STACK_DEFAULTS.md` — architecture + stack defaults
- `docs/OBSERVABILITY.md` — MALT recipes per runtime
- `project_config_*.md` — per-project overrides

All open source at:
**github.com/LuizStruct2Flow/blueprint**

---

<!-- _class: lead -->

# Thank you

**Luiz Scheidegger**
luiz@struct2flow.com

Questions?
