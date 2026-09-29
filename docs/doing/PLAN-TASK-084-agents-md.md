# PLAN — TASK-084: one instruction file for the four CLI providers

**Status: v2, revised to the three-provider review and the founder's decisions
of 2026-09-29. Ready for implementation.** Written by Christian (Architect-1,
Claude). Reviewed by Markus (Claude), Alexey (Codex) and Slava (Kimi), all
APPROVE-WITH-CHANGES (§"Review synthesis"). **Slice 1 is committed** (§8,
§"Slice log"); slices 2 and 3 have not started. Row: [TASK-084](BACKLOG.md).

The row asks for one thing: the providers work from the same rules. Today
they do not. **Scope: the four autonomous CLI providers — Claude Code, Codex,
Kimi and Gemini** (founder, 2026-09-29). GitHub Copilot is notify-only and
human-driven in the IDE, and is outside this item (§8). §1 measures what each
tool actually loads, because the row's own facts were checked from
documentation and two of them turned out to need qualifying. §2 onward is the
design.

---

## 1. What each provider reads today (measured, not assumed)

### Method

The probe fixtures lived in `.scratch/agentsmd-probe.*` (since removed). Each
fixture was its own `git init` root, so Codex, Kimi and Gemini could not walk
up into the blueprint's own files. Each file carried a unique `CODEWORD:` line,
and each CLI was asked, with tools forbidden, to quote what its loaded
instructions contained.

| Fixture | Files |
|---|---|
| a | `AGENTS.md` (ALPHA) containing `@imported.md` → `imported.md` (BRAVO) |
| b | `CLAUDE.md` (CHARLIE) beside `AGENTS.md` (DELTA) |
| c | `CLAUDE.md` = `@AGENTS.md` + ECHO; `AGENTS.md` (FOXTROT) containing `@imported.md` → GOLF |
| g | `AGENTS.md` (HOTEL) with `@imported.md` → INDIA, plus `.gemini/settings.json` `{"context":{"fileName":["AGENTS.md"]}}` |

Two artefacts of the method, stated so nobody reads them as findings:

- The fixtures sit inside the blueprint checkout, so Claude Code also loaded
  the blueprint's root `CLAUDE.md` through its ancestor walk. It did not load
  that file's `@project_config_*.md` imports, because those resolve outside
  the fixture's project root. In a real session the imports load. This
  session's own context shows all seven.
- A "list the codewords" prompt once answered `NONE` for fixture b while a
  "quote every loaded file" prompt showed CHARLIE loaded. The quoting form is
  the one relied on below.

### Results

| Provider | Version | Reads `AGENTS.md` | Reads `CLAUDE.md` | Follows `@path` | How verified |
|---|---|---|---|---|---|
| **Claude Code**, the fleet's install | 2.1.215 (`~/.local/bin/claude`) | **No**, in fixtures a and b alike | Yes | **Yes, nested**: c loaded ECHO, FOXTROT and GOLF | Probe; re-probed by Markus in review, who also saw a list item `- @file` followed and a missing import skipped silently |
| **Claude Code**, current upstream | 2.1.284 via `npx`; npm `stable` = 2.1.277 | **Only when no `CLAUDE.md` exists in the ancestor walk** (default mode); a stayed unloaded because the blueprint's `CLAUDE.md` is an ancestor | Yes | Yes, nested, loaded once each (c) | Probe plus the binary's own option text, below |
| **Codex** | codex-cli 0.154.0 | Yes (fixture a) | No | **No.** It saw the literal text `@imported.md`, and BRAVO was absent | Probe; confirmed live by Alexey's own session |
| **Kimi** | 2.0.2 | Yes (a, b) | **No**, and says so for b | **No.** Same as Codex | Probe; confirmed live by Slava's own session and a fresh probe |
| **Gemini** | 0.53.0 | **Only if `context.fileName` names it.** The default is `GEMINI.md` | No | **Yes**, recursive to depth 5, bounded by the `.git` root | **Source only.** Both live probes failed on quota: 503 "high demand", then 429 "exhausted your daily quota" |

**Claude Code's native `AGENTS.md` support is a built-in plugin with an
`instructionFiles` option.** Its own description, read from the 2.1.284 binary:
*"`claude-md-or-agents-md` (default): a project with no CLAUDE.md of its own
gets its AGENTS.md files instead … `claude-md-and-agents-md`: AGENTS.md files
are loaded beside CLAUDE.md (a file CLAUDE.md already imports or links to is
not loaded twice)."* This confirms the row's claim that `CLAUDE.md` takes
precedence, and qualifies it twice:

1. The fleet here runs 2.1.215, which predates the feature entirely.
2. Every struct2flow project has a `CLAUDE.md`, so under the default mode the
   native path never fires.

`@AGENTS.md` in `CLAUDE.md` is therefore the mechanism. It works on both
versions, and on the new one it cannot double-load.

**Gemini, from `bundle/chunk-F3VE7C53.js` and `bundle/gemini-7M47OEXS.js`:**

- `DEFAULT_CONTEXT_FILENAME = "GEMINI.md"`.
- `settings.context.fileName` is passed to `setGeminiMdFilename`, which
  unions the new names with the current ones.
- Every context file goes through `processImports`. It matches `@path` when
  preceded by whitespace (a Markdown list item `- @file.md` qualifies), skips
  code regions, and stops at `maxDepth: 5`.
- A missing import becomes an inline `<!-- Import failed: … -->` comment plus
  a `logger.error` line. It does not throw.
- `~/.gemini/settings.json` here sets no `context` key, and the repo has no
  `.gemini/` and no `GEMINI.md`.

**Size limits:**

- **Codex** truncates project docs at `project_doc_max_bytes`, whose default
  is **32768**. Both the value and the truncation path ("project doc exceeds
  remaining budget; truncating") are in the 0.154.0 binary. **It is one
  combined budget, not a per-file allowance:** every `AGENTS.md` from the git
  root to the cwd plus `~/.codex/AGENTS.md` share it, and the truncation is
  silent to the agent.
- **Kimi** warns, without truncating, when its `AGENTS.md` total exceeds
  32768 bytes. Its binary text reads *"AGENTS.md total … exceeds the
  recommended 32 KB"*. It also loads `.kimi-code/AGENTS.md`,
  `~/.agents/AGENTS.md` and `~/.kimi-code/AGENTS.md`, summed the same way.
  **The warning never reaches a headless agent** (Slava, 2026-09-29: a
  53,268-byte fixture loaded whole under `kimi -p`, and the model saw no
  warning). It goes to a session-warnings channel a dispatch does not show.
- **So the byte-cap test in §2 is the only guard that fires** for a
  dispatched Codex or Kimi agent.
- **Today's files:** `CLAUDE.md` is 27,735 bytes and `AGENTS.md` 29,363.

### What that means today

- **Gemini loads no project instructions at all.** No `GEMINI.md` exists and
  no `context.fileName` is set.
- **Codex and Kimi load only the coordination protocol.** They never
  auto-load the shared rules or any `project_config_*.md`. They reach them
  only if they act on `AGENTS.md`'s "On wake — minimum read" list, which names
  `CLAUDE.md` in passing.
- **The dispatch preambles do not close the gap.** The Codex, Gemini and Kimi
  preambles (`scripts/start-*-signal-watch.mts`) name only `AGENT_SIGNAL.md`.
- **Only Claude sees the project config.**

That is the row's "providers work from different instructions", confirmed.

---

## 2. Target layout

| File | Holds | Claude Code | Gemini | Codex, Kimi |
|---|---|---|---|---|
| `AGENTS.md` | **The shared rules**: today's `CLAUDE.md` minus the Claude-only parts, with its headings unchanged, plus the "read these first" import block (§3) and a tail sentinel line | via `@AGENTS.md` in `CLAUDE.md` | via `@AGENTS.md` in `GEMINI.md` | native |
| `CLAUDE.md` | `@AGENTS.md`, a self-check line, a redirect line, and the Claude-only parts | native | — | — |
| `GEMINI.md` (new) | `@AGENTS.md`, the same self-check line, and one line saying why | — | native | — |
| `AGENT_SIGNAL.md` | **The coordination protocol**: today's `AGENTS.md` merged into its current 69 lines, headings kept, under a new first heading that is its sentinel | on demand | on demand | on demand, and every dispatch preamble already sends them here |

**Claude-only content left in `CLAUDE.md`:**

- §"On wake — the primary session is the Orchestrator": the `SessionStart`
  hook and the `Monitor` arming. The one paragraph "Agents without Claude
  hooks … wake by hand" moves to `AGENTS.md`.
- The Team Workflow bullet about spawning agents with the `Agent` tool and
  `subagent_type`.
- A short note on the enforcement that binds only Claude: the
  `.claude/settings.json` deny rules and the link-guard `Stop` hook. The
  RULES those enforce stay in `AGENTS.md`, which already says they bind
  Claude only.

Everything else moves.

**Why the coordination protocol does not merge into `AGENTS.md`:** Codex's
32 KiB cap. The two files together come to about 57 KB, and Codex would
silently cut the second half. Kept apart:

- The shared rules come to about 27 KB. That is today's `CLAUDE.md`
  (27,735 bytes), less about 1.2 KB of Claude-only text, plus about 0.6 KB
  for the import block, the sentinels and the redirect.
- The coordination protocol goes to a file agents read when they coordinate.

**Why `AGENT_SIGNAL.md` and not a new file — decided** (founder, 2026-09-29;
all three reviewers agreed):

- It already calls itself "the radio-over protocol".
- Its last paragraph says "The full protocol is in AGENTS.md". The merge
  removes that hop.
- All three dispatch preambles already tell the dispatched agent to read it.
- It is one file fewer rather than one more.

The name says "signal" while the content also covers rotation and four-eyes.
The new first heading says so without a rename (Markus): `# Agent Signal —
the mic, rotation and four-eyes review`.

**Why `GEMINI.md` and not `.gemini/settings.json`:** a managed
`.gemini/settings.json` would overwrite a project's own Gemini settings on
every pull. That is exactly the problem TASK-042 needed a merge layer to solve
for `.claude/settings.json`. A short importer needs no merge, and it mirrors
`CLAUDE.md`. None of the four derived projects has a `GEMINI.md`, so the name
is free.

### The byte budget is enforced, not hoped for

Three cases, in slice 2:

| File | Cap | Why |
|---|---|---|
| `AGENTS.md` | ≤ 28,672 bytes (28 KiB) | reserves 4 KiB under Codex's default **combined** budget for a user's `~/.codex/AGENTS.md` and any parent or nested `AGENTS.md`. A larger user file still truncates the tail on that machine; the tail sentinel is how a probe notices. |
| `CLAUDE.md` | ≤ 4,096 bytes | the Claude-only part is about 1.3 KB and the importer about 0.6 KB. Without a cap, shared rules drift back into the one file only Claude reads, and the 28 KiB cap has an escape hatch straight back to today (Markus). |
| `GEMINI.md` | ≤ 512 bytes | an importer and its self-check, nothing else |

**Each failure message names the remedy:** *move rationale or history into a
linked doc under `docs/` (`docs/DoD.md` or a recipe doc); never raise the
cap.* A large share of today's `CLAUDE.md` is history ("this used to say the
opposite …", "founder, 2026-09-25, after …"), which moves without changing a
rule.

**The growth rule is durable, not a single trim** (Alexey). After the move,
`AGENTS.md` sits about 1.5 KB under its cap. The first lever is named: the
"Enforcement is a committed inventory …" paragraph of §"Shell to TypeScript"
(about 1.5 KB) moves to `CLAUDE.blueprint.md`. Its own text says it applies
"in this blueprint only", and an imported file does not count against Codex's
budget. After that, the 28 KiB gate stays fixed and long rationale or runbook
text moves to a linked doc. Neither the cap nor `project_doc_max_bytes` is
ever raised. No other trimming is part of this item.

### The sentinels

Every half-pulled state must fail loudly and name the file to pull (founder
decision 2, §9). Four strings, each pinned by a test:

| Sentinel | Lives in | Checked by | On mismatch |
|---|---|---|---|
| S1 `# Agent instructions — shared by the four CLI providers` | `AGENTS.md`, first heading | `CLAUDE.md` and `GEMINI.md` self-check lines | stop, tell the founder, run `blueprint pull AGENTS.md` |
| S2 `# Agent Signal — the mic, rotation and four-eyes review` | `AGENT_SIGNAL.md`, first heading (lands in slice 1) | `AGENTS.md`'s coordination bullet (§"Agent Coordination") | stop, tell the founder, run `blueprint pull AGENT_SIGNAL.md` |
| S3 a plain last line, `End of the shared agent instructions.` | `AGENTS.md`, last line | the slice-2 probe | a provider that cannot quote it has a truncated file |

S3 is plain text, not an HTML comment, so no loader drops it.

**Sketch** (wording is slice 2's, not final):

```markdown
<!-- CLAUDE.md -->
@AGENTS.md

**Self-check.** The text imported above must begin with the heading
"Agent instructions — shared by the four CLI providers". If it does not,
this project's AGENTS.md predates TASK-084: tell the founder and run
`blueprint pull AGENTS.md` before any other work.

Sections this file used to hold (the main concerns, "Running commands",
"Team Workflow", "Blueprint sync" and the rest) now live in AGENTS.md under
the same headings. A reference to "CLAUDE.md §X" means that heading there.

## Claude Code only
### On wake — the primary session is the Orchestrator   ← unchanged, H3
## Spawning personas                                    ← Agent tool bullet
## Enforcement that binds Claude Code only              ← settings.json, Stop hook
```

`### On wake` stays at **H3 and is followed by an `## ` heading**, because
`tests/roster` #11 finds it with `/^### On wake[\s\S]*?(?=^## )/m`. That case
already refuses an empty match, so the wrong level would fail it loudly
rather than pass it vacuously; the sketch keeps it green unchanged.

```markdown
<!-- GEMINI.md -->
@AGENTS.md

Self-check: the text above must begin with the heading "Agent instructions —
shared by the four CLI providers". If not, stop, tell the founder and run
`blueprint pull AGENTS.md`. Gemini reads GEMINI.md by default; the shared
rules are in AGENTS.md.
```

```markdown
<!-- AGENTS.md, §"Agent Coordination", replacing today's AGENTS.md bullet -->
- **[AGENT_SIGNAL.md](AGENT_SIGNAL.md)** — the coordination protocol. Its
  first heading must read "Agent Signal — the mic, rotation and four-eyes
  review". If it does not, this project's AGENT_SIGNAL.md predates TASK-084:
  stop, tell the founder and run `blueprint pull AGENT_SIGNAL.md`.
```

That last bullet is also Slava's point: today's §"Agent Coordination" says
`**[AGENTS.md](AGENTS.md)** — the coordination protocol` (`CLAUDE.md:58-61`).
Moved as-is it would point at itself. The redirect lines cover only external
references, so slice 2 re-points it as part of the move, not slice 3.

---

## 3. The imports: every provider sees the project config

**One list, in `AGENTS.md`, written so that it works both as imports and as
an instruction:**

```markdown
## Read these first — this project's own configuration

Claude Code and Gemini load the files below automatically, because they
follow `@` imports. Codex, Kimi and every other agent: open each one that
exists before substantive work. A missing file is normal, because
claude.internal.md is optional and CLAUDE.blueprint.md exists only in the
blueprint.

- @project_config_overview.md
- @project_config_paths.md
- @project_config_dod.md
- @project_config_security.md
- @project_config_infra.md
- @claude.internal.md
- @CLAUDE.blueprint.md
```

**What each tool does with it:**

- **Claude Code:** `CLAUDE.md` → `AGENTS.md` → each file. That is depth 2,
  and fixture c proved nested imports load, once each.
- **Gemini:** `GEMINI.md` → `AGENTS.md` → each file. That is depth 2 of 5.
  Each missing file costs one inline comment and one stderr line in
  `gemini-runs.log`. That is cosmetic, and cheaper than a list per tool.
- **Codex and Kimi:** they see the literal lines, as the probe showed, and act
  on the paragraph above them. The imported files do not count against their
  32 KiB. **This half is prose.** An agent can ignore it. Mechanical
  enforcement is TASK-083's scope, not this item's.

**Rejected:**

- Inlining the config into `AGENTS.md`: a managed file cannot carry
  project-owned content, and the budget forbids it.
- A preamble injection in the watchers: it covers dispatched runs only, not a
  founder driving Codex by hand.
- Codex's `project_doc_fallback_filenames`: it names alternatives to
  `AGENTS.md`, not additions, and lives in user config the blueprint does not
  manage.

---

## 4. Migration safety for derived projects

### How a pull can split the change

- The managed set is the `git archive` listing. `cmdPull` walks it in git's
  bytewise tree order, so `AGENTS.md` comes before `AGENT_SIGNAL.md`, then
  `CLAUDE.md`, then `GEMINI.md`.
- A full `pull --yes` lands all four. An interactive `pull` (y/n/quit) or a
  named `pull <file>` can land any subset.
- Nothing in pull knows that one Markdown file depends on another.
  TASK-081's closure and hold-back cover `scripts/lib/*` only. The suites
  depend on the Markdown too (`tests/roster` #11 reads `CLAUDE.md`,
  `tests/codex-persona-label` will read `AGENT_SIGNAL.md`): a project that
  pulls `tests/` and declines the Markdown gets a failing gate whose message
  names the missing text. That is self-explaining, and accepted.
- **Extending that closure to `@` edges is rejected as disproportionate.** It
  took three review rounds for code dependencies. The sentinels (§2) cover
  every split with one check per edge.

### The four derived projects

Measured on 2026-09-29:

- **storm2flow, linkedin-watcher-agent and lyricscreator** differ from the
  blueprint's `CLAUDE.md` by one line, and have identical `AGENTS.md` copies.
- **struct2flow-www** is simply behind. It was adopted 2026-07-30, and its
  copies still carry sections the blueprint since moved into `DoD.md`. It has
  no project-owned content in either file (diff read), so a full pull is
  safe for it.
- **None of the four has a `GEMINI.md` or a `claude.internal.md`.**

**A project bootstrapped before 2026-09-16** may still list `/AGENTS.md` and
`/AGENT_SIGNAL.md` in its `.gitignore`. Pull writes the working tree
regardless, so its agents read the right files; only git tracking is off, and
TASK-048's adoption steps (`CLAUDE.md` §"Your project's `.gitignore` is
yours") apply. An untracked `AGENTS.md` there is not a pull failure.

### Every partial state, and what guards it

| State after a partial pull | Effect | Guard |
|---|---|---|
| new `AGENT_SIGNAL.md` (slice 1), old everything else | the coordination protocol exists twice, word for word | harmless: nothing contradicts. The blueprint freezes both copies until slice 2 |
| new `AGENTS.md`, old `AGENT_SIGNAL.md` (slice 1 skipped) | Codex and Kimi get the shared rules but **no protocol**: `AGENTS.md` sends them to `AGENT_SIGNAL.md`, whose old text sends them back to `AGENTS.md` | **S2**: the coordination bullet requires `AGENT_SIGNAL.md`'s new heading, finds the old one, stops and names `blueprint pull AGENT_SIGNAL.md`. Also: slice 1 is released first, and wake-time `drift` lists the file |
| new `CLAUDE.md`, old `AGENTS.md` | **the dangerous one**: Claude imports the old coordination file and loses the shared rules | (1) the bytewise order lands `AGENTS.md` first in any uninterrupted pull; (2) **S1**: Claude sees the imported text lacks the heading, stops and names `blueprint pull AGENTS.md`; (3) `blueprint drift`, run by the `SessionStart` hook, lists `AGENTS.md` as drifted |
| new `AGENTS.md`, old `CLAUDE.md` | Claude still reads its old full copy. Codex, Kimi and (with `GEMINI.md`) Gemini get the new rules | none needed: the text is the same, and Claude's copy is merely stale |
| new `GEMINI.md`, old `AGENTS.md` | Gemini gets the coordination protocol, not the shared rules its entry point promises | **S1**: `GEMINI.md`'s self-check stops and names `blueprint pull AGENTS.md` |

**Duplication in state 1 is chosen deliberately.** Some state must hold the
content in both places or in neither. Twice is the safe side, because the
alternative is a pointer to nothing. The window is one release.

**A locally edited copy.** A pull shows the diff and overwrites on "y". The
standing rule already says project rules belong in `project_config_*.md` or
`claude.internal.md`, never in a managed file. Slice 2's commit body repeats
that. None of the four projects has such edits today.

---

## 5. References to `CLAUDE.md` / `AGENTS.md` sections

The redirect lines are what make this cheap. `CLAUDE.md` says its old
sections live in `AGENTS.md` under the same headings, and `AGENTS.md` says
the coordination sections live in `AGENT_SIGNAL.md` under theirs. **Every
existing external pointer therefore still resolves by one hop**, including
ones this item cannot or should not edit:

- **Legacy shell comments.** TASK-067 makes the first edit to a legacy shell
  file a whole-file port, which is far too much for a comment. These stay
  untouched and are covered by the redirect:
  - `.githooks/pre-push:112`
  - `.githooks/pre-push-project:186`
  - `scripts/lib/contamination.sh:95`
  - `scripts/lib/gate.sh:104`
  - `scripts/team-kickoff.sh:14`
  - `scripts/signal-set.sh:11`
  - the generated adapter `scripts/lib/dod-gate.sh:13`
- **Derived projects' own seeded `project_config_*.md`.** They are
  project-owned, so a `templates/` change reaches new projects only.
- **Historical records.** `docs/done/`, `docs/waiting-acceptance/`,
  `docs/config/BLUEPRINT-AUDIT-*`, `findings.md` and incident text are
  records of what was true, and they are not rewritten.

**The moved text's own self-references are not external, and are rewritten in
slice 2** (Alexey, Slava). Slice 1 copies the protocol byte-identical, which is
true while the old `AGENTS.md` still holds it. Once slice 2 replaces that file,
the copy's on-wake list (which calls `CLAUDE.md` the shared rules and says to
read `AGENTS.md`) and its links naming protocol sections in `AGENTS.md` are
false or loop. In slice 2's commit, `AGENT_SIGNAL.md`:

1. points references meaning "the protocol / this section" at
   `AGENT_SIGNAL.md` or "this file";
2. names `AGENTS.md`, not `CLAUDE.md`, as the shared rules in its on-wake
   list;
3. keeps a `CLAUDE.md` reference only where the target is Claude-only (the
   Orchestrator hook behaviour);
4. gains one line in "What is Kimi-specific": the >32 KiB warning does not
   reach a headless agent, so the byte cap is the guard (Slava).

The same holds for `CLAUDE.md`'s §"Agent Coordination" bullet as it moves into
`AGENTS.md` (§2).

**What IS updated, by slice:**

| Where | Change | Slice |
|---|---|---|
| `tests/template-source` #import-1 | the exact-set import check moves to `AGENTS.md`; `CLAUDE.md` and `GEMINI.md` must each import exactly `AGENTS.md` | 2 |
| `tests/bootstrap-contents` #3b | `GEMINI.md` ships | 2 |
| `tests/bootstrap-contents` #3c, #11 | `@claude.internal.md` and `@CLAUDE.blueprint.md` are asserted in the derived `AGENTS.md` | 2 |
| `tests/bootstrap-contents` #5c | a fresh project tracks `GEMINI.md` too; "the six framework documents" becomes seven | 2 |
| `tests/bootstrap-contents` #12 | root links are checked in `AGENTS.md`, `AGENT_SIGNAL.md` and `GEMINI.md` too, not only `CLAUDE.md` and `README.md` | 1 (`AGENT_SIGNAL.md`), 2 (the rest) |
| `tests/roster` #11 | unchanged: `### On wake` stays in `CLAUDE.md` at H3, followed by an `## ` heading (§2) | 2 (verify) |
| `tests/enforced-by-pointers` REAL TREE | scans `AGENT_SIGNAL.md` as well | 1 |
| `tests/enforced-by-pointers` count comment (spec lines 141–142) | the per-file counts are refreshed: the two `CLAUDE.md` pointers now sit in `AGENTS.md` | 2 |
| `tests/codex-persona-label` (the TASK-061 case) | reads the hand-back text from `AGENT_SIGNAL.md` | 2, when `AGENTS.md` loses it |
| `tests/forbidden-idiom` failure message | `CLAUDE.md §"Observability …"` becomes `AGENTS.md §…` | 3 |
| new cases: byte caps | `AGENTS.md` ≤ 28,672, `CLAUDE.md` ≤ 4,096, `GEMINI.md` ≤ 512, each failing with the §2 remedy text | 2 |
| new cases: sentinels | S1 in `CLAUDE.md`'s and `GEMINI.md`'s self-checks equals `AGENTS.md`'s first heading; S2 in `AGENTS.md`'s coordination bullet equals `AGENT_SIGNAL.md`'s first heading; S3 is `AGENTS.md`'s last line | 2 |
| new case: stale protocol pointers | refuses an `AGENTS.md#<anchor>` or `AGENTS.md §"<heading>"` in the four root instruction files whose heading now lives in `AGENT_SIGNAL.md` | 2 |
| `scripts/blueprint.mts` `UNREGISTERED_MARKERS` | gains `GEMINI.md`, beside `CLAUDE.md` and `AGENTS.md` (the threshold is ≥ 3, so this only widens detection) | 2 |
| `scripts/no-chain-guard.sh` refusal text (line 119) and its header | point at `AGENTS.md` (the file is on the exempt list, so editable) | 3 |
| `.mts` comments naming moved sections (`link-guard`, `start-*-signal-watch`, `signal-watch`, `scratch-tmpdir`, …) | swept | 3 |
| `scripts/session-start.sh:54` (`CLAUDE.md §"On wake"`) | stays true, untouched | — |

The fixture-only mentions, where `CLAUDE.md` is a sample managed file in
`blueprint-port`, `pull-behaviour`, `suite-sync`, `staleness`,
`managed-references`, `sync-by-address` and `install-toolchain`, name no
content and do not change.

---

## 6. Where `CLAUDE.blueprint.md` and `claude.internal.md` live

**Both stay where they are, with the same names.** Their `@` imports move
from `CLAUDE.md` to `AGENTS.md`, so all four providers get them:

- Claude and Gemini load them automatically.
- Codex and Kimi open them on instruction.

**`claude.internal.md` cannot be renamed.** It is project-owned, the
blueprint never writes it, and a rename would orphan any project's existing
copy. None exists today, but the contract says the blueprint does not rely
on that. `AGENTS.md` states that it is every provider's.

**`CLAUDE.blueprint.md` could be renamed at blueprint-only cost.** It would
touch `.gitattributes`, two suites, `README.md` and this repo's docs. The
only gain would be a name that no longer says "Claude". Not worth a slice.

**Its export-ignore line and both halves of its contract are unchanged**
(bootstrap-contents #11: the import arrives, the file does not).

---

## 7. Ripples (`CLAUDE.blueprint.md`'s deck rule)

Concerns #9 (persona team) and #10 (blueprint sync) change in slice 2, so
these land **in slice 2's commit**, not later:

- **`docs/way-of-working.md`:**
  - the persona-team notes (line 251: "coordinated via `AGENTS.md`" becomes
    "the shared rules in `AGENTS.md`, the protocol in `AGENT_SIGNAL.md`");
  - the managed-files notes (lines 469–477: "`CLAUDE.md` `@`-imports all
    five … agents on other providers read them by instruction" becomes the
    §3 split);
  - "Where to read more" (line 962).
- **`CLAUDE.blueprint.md`** concern #9's parenthesis ("`AGENTS.md` protocol")
  and its §"Where a rule goes" line ("a rule a project follows goes in
  `CLAUDE.md`" becomes `AGENTS.md`).
- **`README.md`:**
  - line 27;
  - the Cost row's link at line 47;
  - setup step 4 (lines 83–85);
  - the tree (lines 109–112, where "`AGENTS.md` ← Codex wake-up rules" is
    already wrong; `GEMINI.md` is added);
  - lines 335 and 453;
  - line 376: drop "stamped at bootstrap, then evolves session-by-session".
    The live baton moved to `logs/state/signal.md`, and the tracked file is a
    managed protocol;
  - lines 396–397: `{{YYYY-MM-DD}}` is not used in `AGENT_SIGNAL.md`; drop
    that claim.
- **`docs/PUBLISHING.md`:** `GEMINI.md` joins `PUBLIC_PATHS`, the §5 absence
  check, and the prose lists at lines 30, 60, 114, 243 and 338. It lists
  every root framework document, and a fresh public clone without
  `GEMINI.md` would be the finding its §5 describes.

Slice 3 (internal; correct meanwhile through the redirect):

- `docs/A2BP_PLAYBOOK.md` rows A, D, E, F, G and its step 1;
- `docs/DoD.md` lines 256–257;
- `STACK_DEFAULTS.md:70`;
- `AGENT_ROSTER.example.md` (`AGENTS.md` §Dispatching becomes
  `AGENT_SIGNAL.md`);
- `templates/project_config_overview.md` and `templates/project_config_paths.md`;
- `templates/HANDOVER.md:16`;
- `.gitattributes` comments at lines 89 and 106;
- `.gitignore:77-80`, the "all six" framework-document comment, gains
  `GEMINI.md`. `.gitignore` is a seed (`TEMPLATE_FILES`), so this reaches new
  projects only, like the `templates/` rows;
- `project_config_overview.md` and `project_config_paths.md` (this repo's
  own copies).

No recipe doc (`OBSERVABILITY`, `SECURITY`, `INFRASTRUCTURE`,
`DOCUMENTATION`) changes beyond a pointer, and no concern is added, removed
or renamed. The README concern table's rows therefore change only their link
targets.

---

## 8. Slices

Each slice is one `TASK#84:` commit (or a small group) on `main`, green
through the full pre-push gate. No toggle is needed: slice 1 is purely
additive, and slices 2 and 3 are content moves whose intermediate states §4
covers.

### Slice 1: the coordination protocol moves into `AGENT_SIGNAL.md`, additively

- `AGENT_SIGNAL.md` = its current text, merged with today's `AGENTS.md` (the
  mic paragraph deduplicated, headings kept), under the new first heading S2,
  and loses "the full protocol is in AGENTS.md".
- **`AGENTS.md` is not touched.**
- **Tests:** `enforced-by-pointers` scans `AGENT_SIGNAL.md`, and
  `bootstrap-contents` #12 checks its links.
- **Proof:**
  - the full suite and the release tier (`bootstrap-gate`, `a2bp-e2e`);
  - `diff` shows every moved section byte-identical to its `AGENTS.md`
    original, except the deduplicated mic paragraph and the new first
    heading;
  - no provider probe is needed, because no tool loads anything differently.
- **Then:** push, and push slice 2 once CI has advanced `released` to carry
  slice 1. There is **no wait for the derived projects** to pull it (§9,
  decision 2).

### Slice 2: the switch

- `AGENTS.md` = the shared rules, the import block, the re-pointed
  coordination bullet (S2 check), and the tail sentinel S3.
- `CLAUDE.md` = the thin importer, the S1 self-check and the Claude-only part.
- `GEMINI.md` is added, with the S1 self-check.
- `AGENT_SIGNAL.md`'s self-references are rewritten (§5).
- Every slice-2 row of §5 and §7 lands with it.
- **Proof, mechanical (CI):**
  - the updated suites and the new cases (three byte caps, the sentinel
    pins, stale protocol pointers);
  - the full suite and the release tier;
  - `doc-links`.
- **Proof, per provider (manual, recorded in this plan's slice log):**
  1. Bootstrap a project into `.scratch/` from the slice-2 tree
     (`BLUEPRINT_ROOT` override).
  2. Record the sizes of the user-level instruction files each CLI adds to
     the budget (`~/.codex/AGENTS.md`, `~/.agents/AGENTS.md`,
     `~/.kimi-code/AGENTS.md`, or their absence).
  3. Ask each CLI, with no tools allowed, for `AGENTS.md`'s first heading
     (S1), its last line (S3), and a phrase that appears only in
     `project_config_overview.md`.
  4. Expected:
     - **Claude**, on both 2.1.215 and a current build: all three from
       loaded context.
     - **Gemini**: all three. If its quota is out again, the source reading
       in §1 stands, and the gap is recorded rather than papered over.
     - **Codex and Kimi**: S1 and S3 from loaded context, which proves the
       file arrived whole. Then, with read tools allowed, a second prompt
       checks that they open the config when the instruction says to.
- **Proof, migration (manual, recorded in the slice log):** a fixture project
  bootstrapped from the **pre-slice-1** tree, the worst case (it skipped slice
  1). Three copies, each pulling one file alone from the slice-2 tree:
  - `blueprint pull AGENTS.md`: a Codex or Kimi session told to coordinate
    opens `AGENT_SIGNAL.md`, finds the old heading, stops and names
    `blueprint pull AGENT_SIGNAL.md`;
  - `blueprint pull CLAUDE.md`: a Claude session stops at wake and names
    `blueprint pull AGENTS.md`;
  - `blueprint pull GEMINI.md`: a Gemini session stops and names
    `blueprint pull AGENTS.md` (quota permitting; otherwise recorded as
    unverified).

### Slice 3: the reference sweep

- Every slice-3 row of §5 and §7.
- **Proof:**
  - the full suite;
  - `git grep` finds no `CLAUDE.md §"<heading that moved>"` outside the
    exempt set in §5 (legacy shell comments, historical records, fixtures).

**Then** the row moves to `waiting-acceptance/` once CI is green. Acceptance
is the founder's.

**Out of scope, on purpose:**

- Enforcing that Codex and Kimi actually open the config (TASK-083).
- Trimming `AGENTS.md` beyond the one named lever and the growth rule (§2).
- **GitHub Copilot** (founder decision 3). It is notify-only in the protocol
  and human-driven in the IDE, and the repo operates no Copilot instruction
  path. Whether VS Code's Copilot reads `AGENTS.md` was not verified.

---

## 9. Founder decisions (2026-09-29)

1. **The coordination protocol merges into `AGENT_SIGNAL.md`.** No
   `AGENT_PROTOCOL.md`. All three reviewers recommended the same.
2. **No hard gate between slice 1 and slice 2**, on Codex's condition, which
   is therefore part of the plan: sentinels make every half-pulled state fail
   loudly and name the file to pull. The new `AGENTS.md` checks S2 in
   `AGENT_SIGNAL.md`; `CLAUDE.md` and `GEMINI.md` check S1 in the imported
   `AGENTS.md`; every sentinel is pinned by a test; and the migration proof
   covers `pull AGENTS.md`, `pull CLAUDE.md` and `pull GEMINI.md` alone (§2,
   §4, §8).
3. **Scope: the four autonomous CLI providers**, Claude Code, Codex, Kimi and
   Gemini. The notify-only GitHub Copilot is outside this item.

### Assumptions not verified

- **Gemini's behaviour live**: quota exhausted on both attempts. Source-read
  only. Slice 2 retries.
- **Claude Code 2.1.277 itself**: 2.1.215 and 2.1.284 were probed, and the
  option text was read from 2.1.284.
- **That an agent follows prose**: the self-checks, and Codex and Kimi opening
  the listed files. These are instructions, not mechanisms. The sentinel
  strings are pinned; obeying them is not.

Resolved in review: Codex's truncation path is now read from the 0.154.0
binary (Alexey), and Kimi's warning is measured invisible to a headless agent
(Slava), both in §1.

---

## Review synthesis

Three providers reviewed v1 on 2026-09-29. All three verdicts were
APPROVE-WITH-CHANGES, and their requests did not conflict. Each claim below
was checked against the tree before it was adopted.

| Reviewer | Provider | Verdict |
|---|---|---|
| Markus (Security-1) | Claude | APPROVE-WITH-CHANGES |
| Alexey | Codex | APPROVE-WITH-CHANGES |
| Slava (Architect) | Kimi | APPROVE-WITH-CHANGES |

**Adopted:**

- **`### On wake` stays at H3** (Markus). Chosen over changing the regex: it
  leaves `tests/roster` #11 untouched. Checked: the case already refuses an
  empty match (`roster.spec.ts:299`), so the risk was a red case, not a
  vacuous one. §2.
- **Caps on `CLAUDE.md` ≤ 4 KiB and `GEMINI.md` ≤ 512 B** (Markus), so the
  split cannot silently reverse. §2, §5.
- **The byte-test failure text names the remedy**: move rationale to a
  linked doc under `docs/`, never raise the cap (Markus). §2.
- **Pre-TASK-048 `.gitignore` projects** get one sentence (Markus). §4.
- **The suites depend on the Markdown too** (Markus, noted as acceptable): the
  "nothing in pull knows" line now says so. §4.
- **The `enforced-by-pointers` count comment** is refreshed in slice 2
  (Markus). §5.
- **Slice 2 rewrites the moved protocol's self-references**, with a test
  against stale protocol pointers (Alexey). §5, §8.
- **Symmetric sentinels** (Alexey), made a condition by founder decision 2:
  S2 for `AGENT_SIGNAL.md`, S1 checked by `GEMINI.md` too, all pinned, and
  migration proofs for each single-file pull. The two understated states in
  §4 are rewritten ("no protocol", not "a visible pointer loop").
- **32 KiB is a combined budget** (Alexey): "leaves 4 KiB" is now "reserves
  4 KiB under the default combined budget". §1, §2.
- **A tail sentinel** (S3), so the Codex/Kimi probe detects tail truncation,
  and the probe records the user-level instruction-file sizes (Alexey). §8.
- **The durable growth rule** (Alexey): the 28 KiB gate stays fixed after the
  first lever; rationale moves to a linked doc. §2.
- **The `GEMINI.md` ripples** (Alexey): bootstrap-contents #5c,
  `UNREGISTERED_MARKERS` (checked: the threshold is ≥ 3 markers, so adding one
  only widens detection), `README.md:376` and `:396-397` (§5, §7); the
  `.gitignore` comment (Alexey and Slava, §7).
- **"Every provider" reworded** to the four autonomous CLI providers, per
  Alexey's recommended option and founder decision 3. Title, intro, §6, §8.
- **Kimi's warning never reaches a headless agent** (Slava): §1, §"Assumptions",
  and one line in the merged `AGENT_SIGNAL.md` (§5).
- **The §"Agent Coordination" self-reference** is re-pointed in slice 2, with
  the S2 check folded into the same bullet (Slava). §2.

**Where two requests overlapped:** the `.gitignore` comment is slice 3
(Slava's placement; Alexey allowed slice 2 or 3), because it is a seed that
reaches new projects only and nothing reads it. The Kimi-specific line lands in
slice 2 rather than slice 1, which Slava left open, because slice 1's proof is
byte-identity with the old `AGENTS.md`.

**Not adopted:**

- **Retiring the self-check once all four projects carry the new
  `AGENTS.md`** (Markus, optional). It costs four lines and he said keeping it
  is fine; kept.
- Markus also advised against a pull-time `@`-edge closure and a mechanical
  self-check in `scripts/session-start.sh` (legacy shell, so a whole-file
  port). Neither was in the plan, and neither is added.

---

## Slice log

### Slice 1 — 2026-09-29, `977ad7b` (Christian, Claude)

**Layout of the merged `AGENT_SIGNAL.md`.** The S2 heading replaces both old
first headings. `AGENTS.md`'s preamble follows it. `AGENT_SIGNAL.md`'s own
sections keep their order, and every `AGENTS.md` section from "On wake" to
the end sits, in its order, between §"The protocol" and §"History".

**The deduplication**, the only text removed. §"The protocol" keeps what
`AGENTS.md` does not say: `Holder` is a roster persona or `Nobody`, and
BUG-140 refuses anything else. Three things went:

- its `State` and ACTIVE-on-claim sentence, which `AGENTS.md`'s mic section
  and §"Rules" already say;
- "The full protocol is in AGENTS.md";
- its "Before flipping the mic to `OVER_TO_USER`" paragraph, which is the
  §"Rules" bullet of the same name, nearly word for word.

**Byte identity.** `diff AGENTS.md AGENT_SIGNAL.md` shows exactly three
hunks: `1c1` (the heading), `15a16,65` (added `AGENT_SIGNAL.md` text) and
`505a556,567` (added §"History"). No `AGENTS.md` line is changed or
removed.

**Tests.** `enforced-by-pointers` REAL TREE scans `AGENT_SIGNAL.md`; a planted
broken pointer there turned it red. `bootstrap-contents` #12 checks its links
in a real bootstrap. The #12 fixture archives `HEAD`, so it judges the
committed file, not the working tree.

**Full suite at `977ad7b`:** 75 files, 1,384 tests, all green. That run
included the whole release tier: `bootstrap-gate`, `a2bp-e2e`,
`blueprint-port`, `signal-dispatch`, `agent-activity-bound` and
`subagent-feed`.

**Not anticipated by the plan.** The copied mic section says `Holder` may be
`User`. §"The protocol" beside it, `scripts/signal-set.sh` and the gate
(BUG-140) allow only a roster persona or `Nobody`. `--holder User` is refused
unless the roster has a persona named `User`. The two files disagreed before
this slice; the merge only puts both statements in one file. Byte identity
kept it out of slice 1. Slice 2 should drop "or `User`" when it rewrites the
self-references.
