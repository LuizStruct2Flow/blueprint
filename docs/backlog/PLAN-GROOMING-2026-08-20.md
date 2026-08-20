# Backlog grooming and plan — 2026-08-20

Founder-triggered grooming session. Five personas ran read-only passes over the
20 parked items and the code beneath them: **Klaus** (PO, value), **Christian**
(Senior Architect, dependencies), **Vitali** (QA-1, gate trust), **Philipp**
(Infrastructure-1, reliability), **Markus** (Security-1, the audit rows).
Synthesis and conflict resolution by **Eto** (Orchestrator).

Every claim below was verified against the tree by the persona that made it, and
the headline claims were re-verified independently before landing here.

## The one-line outcome

**The backlog was not the problem. The gate's self-knowledge was.** Three of the
five most valuable findings are not rows at all — they are places where a control
reports something that is not true, which is this repo's own signature failure
(BUG-004, A-22, BUG-005, BUG-031) recurring inside the controls themselves.

## Verdicts — 20 rows in, 11 rows out

| Disposition | Count | Items |
|---|---|---|
| **PROMOTE** | 6 | A-11 (new), SAST-shell (new), BUG-030, dispatcher trio, TASK-004, doc-drift sweep (new) |
| **MERGE** | 9 | A-04/A-13/A-16/A-17/A-25 → hygiene sweep · BUG-024/025/026 → dispatcher trio · TASK-011 → TASK-009 |
| **KEEP** | 4 | BUG-032, BUG-033, TASK-013, FEATURE-004 (narrowed) |
| **OBSOLETE** | 1 | A-40 |
| **AMEND** | 3 | BUG-032, BUG-033, TASK-015 — all three rows state a mechanism that is now known to be wrong |

## Three conflicts between personas, resolved

**1. TASK-015 — Klaus says merge into TASK-013, Christian says it is 80%
independent.** *Christian wins, on evidence.* The row proposes replacing a
hardcoded floor with "a declared population". The population is **already**
declared — `tests/state-dir/test.sh:37`'s `DISPATCHERS=` list — and it is stale
**right now**: six files carry the physical-root block, the guard checks four.
`signal-set.sh` (the baton's sole writer) and `session-resume.sh` are unguarded.
A declared population relocates the staleness. **Discovery (`grep -l
'^_bp_self='`) is correct and smaller, closes a live gap today, and needs no
profile.** Only the `#8`/`#9` dispatcher split waits on anything. Merging the row
would have delayed a live fix behind a design decision.

**2. FEATURE-007 — Eto recommended starting it, Klaus calls it theatre.**
*Klaus wins.* The roster's `Backing agent` column is free text and already
accepts `Qwen`, so editing it changes nothing — only the watcher does. And the
row's own find-rate guardrail on the cheap reviewer is the product-bearing part,
needs no local model, and should be split out. **Downgraded from "start next" to
after the trust work.** Eto's recommendation was made before the security and
gate-trust passes existed and does not survive them.

**3. BUG-030's root cause — Christian says `AGENT_STATE_HOME` unquarantined in
`bootstrap-gate`, Vitali says `AGENT_SIGNAL_FILE` exported by
`codex-signal-watch.sh:250`.** *Vitali wins on precision — he reproduced it* —
but they are the same family and the fixes compose. Complete fix is **both**:
`--file` on the seed (fixes the write) **and** an `AGENT_*` unset at the gate /
stage boundary (fixes the read, which `dod-gate.sh:164` also gets wrong).

## The work, in order

### 1. The SAST gate scans a language this repo does not contain — NEW, S2

`git ls-files`: **99 `.md`, 79 `.sh`, zero JS/TS.** The semgrep stage runs
`p/owasp-top-ten`, and CI adds `p/javascript` and `p/typescript`. **`shellcheck`
is never invoked** — not in the hook, not in CI, not in the `Brewfile`. It
appears only as `# shellcheck disable=` / `source=` directives across 10+ files:
*the codebase is annotated for a linter that has never run.*

**Proof it is live rather than theoretical:** A-16 (`eval` injection) and A-17
(glob scope) are default shellcheck findings. Both were found by a **human audit
in July**. The gate has printed `SAST · semgrep p/owasp-top-ten ✓` on every push
since.

This is BUG-004 / A-22 / BUG-005 — *a gate that skips looks exactly like a gate
that passed* — **occurring inside the security gate**, and it is the most
expensive instance yet because that green check reads as "OWASP top-10 covered"
with maximum credibility.

**Fix:** `shellcheck` in the `Brewfile`, one `pipe_stage` over `scripts/`,
`.githooks/`, `tests/**/*.sh`, using the missing-tool → `pipe_skip` + CI-backstop
idiom every other scanner stage already has, with a ratcheted baseline. ~10
lines. Converts A-16 and A-17 from audit findings into gate findings.

### 2. `blueprint pull` can silently delete project content — NEW BUG, S2

`marker_aware_merge` at `scripts/blueprint:311` compares marker **counts** only:

```sh
if [ "$bp_begin" -ne "$bp_end" ] || [ "$proj_begin" -ne "$proj_end" ] || ...
```

Order is never checked, so `END` before `BEGIN` passes (1 = 1) and reaches the
awk, which captures on `BEGIN` and stops on `END` — while `pull` reports the
project's content preserved. **This is the core sync verb**, and it was buried
inside `AUDIT-TRIAGE`, a row of ~12 findings nobody had dispositioned. Klaus
sampled it at random.

Also live from the same row: **A-10** — the watcher replays the current baton at
startup, an implicit billable replay, which is a direct violation of CLAUDE.md
§Cost capability 4.

**Action:** raise A-11 as its own numbered bug today. Triage the rest of
`AUDIT-TRIAGE` by verifying against the tree — not by giving each finding a
disposition, which only moves them from one unread file to another.

### 3. BUG-030 — reproduced, and the class fix is a net deletion

Vitali reproduced it verbatim against a canary and corroborated the 37-second gap
in the live journal. Four steps:

1. `new-project.sh:245` seeds the baton with `( cd "$TARGET_DIR" && bash scripts/signal-set.sh … )` — no `--file`, no scrubbing.
2. `signal-set.sh` resolves via `agent_signal_file`, which honours `$AGENT_SIGNAL_FILE` **ahead of everything**. The `cd` is inert.
3. `codex-signal-watch.sh:250` **exports** `AGENT_SIGNAL_FILE`.
4. `tests/bootstrap-gate/test.sh:46` and `.githooks/pre-push:46` unset only the `GIT_*` family.

The irony is exact: that suite's own comment says *"With GIT_DIR set, `cd`
protects nothing"* — and the bootstrap protects the live baton with nothing but a
`cd`.

**Why the two existing suites are blind, and this is the reusable part:**
`git-isolation` polices `GIT_*` only — and BUG-019 deliberately moved the baton
*out* of git, so the fix that made it safe from `git checkout` moved it outside
what that suite guards. `state-dir`'s **#2 and #5 assert that `AGENT_STATE_HOME`
must override** — it codifies the override as a feature, so it can never catch a
caller that fails to scrub it.

**Fix:** `--file` on the seed, plus one `unset AGENT_SIGNAL_FILE
AGENT_STATE_HOME AGENT_FEED_LOG` at the `pipe_stage` boundary in
`scripts/lib/pipeline.sh`, then delete the four duplicated per-suite unsets and
assert in `tests/manifest` that no suite re-exports them. **Four copies of a rule
collapse to one**, and it retires a class with three prior instances (A-09,
BUG-014, BUG-030) — the same conclusion this repo already reached for BUG-014 and
the no-chain guard.

### 4. The dispatcher trio — cross-provider review is silently wrong

**BUG-024 + BUG-025 + BUG-026**, merged: same two files, same trigger, same
failure shape — the declared differentiator returns a wrong answer with **no
signal**. A ten-day-old message read as a reviewer's verdict (`codex-last-message.md`
never truncated before a run, and the wrapper vouches for it unconditionally); a
hardcoded `Holder=Claude Code` inside every dispatch prompt
(`start-codex-signal-watch.sh:145`, and `start-gemini-signal-watch.sh` carries
the same literal — fix belongs in `scripts/lib/roster.sh`, not per-caller); and
`signal-set.sh:83` accepting any State string, so a typo just never dispatches.

### 5. Records that state something untrue — sweep

Not cosmetic. Each is a control or a protocol document asserting a fact that is
false, and one of them ships to every derived project.

| Where | Says | Actually |
|---|---|---|
| `CLAUDE.md:476` **(ships)** | SLO warns past 120 s / 45 s | `pipeline.sh:287-288` uses **180 s / 95 s** |
| `tests/SUITES.md` | `signal-dispatch` is "the slowest stage" | `bootstrap-gate` 177.9 s vs 32.0 s — and `bootstrap-gate`'s row **also** claims it |
| `tests/SUITES.md` | `signal-dispatch` 125.4 → 75.0 s | CLAUDE.md and TASK-013 say 37.5 s, measured 32.0 s |
| `docs/config/README.md` **(ships)** | points at `docs/config/findings.md` | **the file does not exist** — 12 files reference it, none as a link, so `doc-links` never sees it |
| `docs/doing/HANDOVER.md` | TASK-014 "promoted, biggest item"; push "not yet rowed" | TASK-014 is accepted in `done/`; it is BUG-032 |
| `docs/done/TASK-014-…md` | the `.claude/` grant "never appears in a git diff" | `.claude/settings.json` is **tracked** — allowlist changes are reviewable |

`tests/manifest` #6 cannot catch these: it rejects rationales arguing from cost,
which is the right scope, but a stale factual claim passes cleanly.

**`findings.md` not existing is structural, not clerical.** `docs/DoD.md`
references it in six places including a handoff checkbox, and
`docs/backlog/README.md` names it as the destination for every cancelled item.
The lifecycle's "delete the row, leave a pointer" path terminates nowhere — which
is precisely why A-40's lesson had to be parked as a fake work item.

### 6. Amend three rows that state a wrong mechanism

- **BUG-032** — the row says "Mechanism — CONFIRMED by experiment". **Overstated,
  and Eto wrote it.** Philipp's 14-second reproducer confirms the *ordering*
  (git opens **two** connections ~40–90 ms before the hook and holds them across
  it) and that an idle hangup yields exactly this signature (141, **empty**
  stdout, no ref). It does **not** confirm causation: in the captured data gate
  duration and keepalive are **perfectly confounded**, and the two failures were
  also the two longest runs in a 25-run sample. **Cheap falsification test: push
  over HTTPS**, which is stateless-rpc and opens a fresh connection after the
  hook. Also: **the mitigation is not persisted anywhere** — `~/.ssh/config` has
  no `ServerAliveInterval` and `core.sshCommand` is unset. The repo is as exposed
  today as it was yesterday.
- **BUG-033** — **both stated hypotheses are wrong.** 0 failures in 80 full-suite
  runs at load up to 257 on 32 cores, plus 60 isolated stress rounds at 8×
  concurrency over 9,225 journal lines. The payload is ~130 bytes and cannot
  outgrow one `write()`; the detector runs *after* `wait` and cannot race, and is
  provably sensitive (5/5 catches against a reverted fix). The mechanism that
  fits is a **short/failed append** — which `session-resume.sh:204` already
  anticipates, its error text naming a **full** filesystem. Likely trigger: the
  TASK-014 trial's 2.4 GB install against a 32 GB tmpfs `/tmp`. **The actionable
  defect is that #13 discards `--mark`'s exit code**, so it cannot tell a failed
  append from a non-atomic one. One-line fix.
- **TASK-015** — its "likely shape of the answer" would entrench the bug. See
  conflict 1.

### 7. Then, and only then

- **TASK-004 widened** — the rule as written says "every lib **sourced** by a
  managed script". Live counter-example: `session-resume.sh` is **not** in
  `MANAGED_FILES`, but its suite is tier `both` inside the managed `tests/`
  directory and is wired into the managed `pre-push-project`. **A derived project
  pulls the test and the gate wiring forward while the script under them stays
  frozen at bootstrap** — BUG-029 inverted. Widen to "sources **or invokes**".
  Klaus notes the fix may be one word: replace 17 hand-listed `scripts/lib/`
  entries with the directory, as BUG-029 already did for `tests/`.
- **BUG-032's reproducer, then the armed keepalive.** Sequencing matters more
  than the choice: land the reproducer **before** TASK-013, because at ~253 s the
  failure stops occurring naturally and nobody can then tell a fix from a lucky
  run. If persisted as `core.sshCommand` it is repo-local config a fresh clone
  lacks — the identical shape as BUG-004/A-22 — so it must be armed from
  `arm_gate` and reported, not remembered.
- **TASK-013** — numbers hold (25 runs, 348.6–361.4 s, `bootstrap-gate` 50.6%,
  stable to ±2%), but **the payoff estimate does not**: ~29%, not "roughly
  halve", because `bootstrap-gate` #3 already enforces a 25-stage non-vacuity
  floor. That floor bounds the blast radius — but it is a **count, not a
  membership set**, so a profile converts "nobody would delete 19 `pipe_stage`
  blocks" into "one config list". The manifest assertion must name **which**
  suites. **And a design problem nobody had raised:** those stages sit in the
  blueprint-managed region, so `AGENT_GATE_PROFILE` **ships to every derived
  project**, where `AGENT_GATE_PROFILE=bootstrap git push` is `--no-verify` by
  another name — which is denied by policy here. It cannot be a wall (an env var
  never is); it must be **loud**: skip via `pipe_skip` with a reason, never
  omission, and name the active profile in both the banner and the summary.
- **The hygiene sweep** — A-04, A-13, A-16, A-17, A-25. Five verified-live
  one-line fixes, each parked behind "when X is next touched", and X is never
  touched. One PR. **Severity corrections:** A-25 up from S4 (agent-invoked
  unpinned `npx @latest` — RCE as the founder, who holds ssh keys, a `gh` admin
  token and `SONAR_TOKEN`; and `@latest` is unpinnable, so it structurally
  defeats the "scan pinned deps" capability, while the deny list blocks the same
  primitive as `curl | sh`). A-16 **down** to hygiene — injectable, confirmed by
  execution, but it needs an attacker who can already execute; its live defect is
  that tokens containing `$` or backticks are silently mangled.
- **FEATURE-007** — after the above. Split the find-rate guardrail out as
  independent work.

## What the backlog is missing entirely

1. **BUG-027's three unfixed findings have no row anywhere.** `BP_ROSTER_LOOKUP_TIMEOUT=0`
   hangs indefinitely (GNU `timeout 0` means *no* timeout), a killed lookup's
   partial stdout is accepted and persisted as a persona name, and
   `agent-activity.sh` sources `roster.sh` into the supervisor's own shell
   unguarded. They exist only as prose in `HANDOVER.md` — a file explicitly
   rewritten every wake. Three live defects one rewrite from vanishing, against
   the repo's own intake rule 1.
2. **Not one of the 20 rows is about a user of the blueprint.** Every row is
   about its own machinery. No onboarding row, no second-engineer adoption row,
   no derived-project first-week row. The only item that ever pointed outward
   (TASK-012/014) is answered and closed. For a product whose entire proposition
   is that other projects inherit it, **that is the gap.**
3. **Two follow-ups both accepted decision records call "worth doing regardless"
   have no row** — §7G leaving the core gate, and `drift`/`pull` learning a
   profile. They exist only inside prose in `done/`.

## The declaration, if it is built

Christian's design, recorded because three separate items keep re-deriving it:
one `profile = core` key in `.blueprint-source` (already parsed as key=value,
already project-owned, never in `MANAGED_FILES`), with the file **set** staying
in the blueprint beside `MANAGED_FILES`, filtered at the single insertion point
`scripts/blueprint:594`. Fail-closed by construction: without
`.blueprint-source`, `read_blueprint_source` dies and both `drift` and `pull`
refuse to run.

**TASK-013's `AGENT_GATE_PROFILE` is the same mechanism under a second name.**
Collapse them — two profile vocabularies is the second-record defect this repo
has already fixed three times.
