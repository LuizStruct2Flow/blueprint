# PLAN — TASK-084: one instruction file for the four CLI providers

**Status: v2, revised to the three-provider review and the founder's decisions
of 2026-09-29. Ready for implementation.** Written by Christian (Architect-1,
Claude). Reviewed by Markus (Claude), Alexey (Codex) and Slava (Kimi), all
APPROVE-WITH-CHANGES (§"Review synthesis"). **All three slices have landed
and the item waits for the founder's acceptance** (§8, §"Slice log"). Row:
[TASK-084](BACKLOG.md).

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

Every incomplete single-file pull of the switch must fail loudly and name the
file to pull (founder decision 2, §9). The completed slice-1 release is a
supported additive intermediate, not a failed partial pull. Three sentinel
values are pinned by tests; S1 is checked reciprocally as well as by both
importers:

| Sentinel | Lives in | Checked by | On mismatch |
|---|---|---|---|
| S1 `# Agent instructions — shared by the four CLI providers` | `AGENTS.md`, first heading | `CLAUDE.md`, `GEMINI.md` and `AGENT_SIGNAL.md` self-check lines | stop, tell the founder, run `blueprint pull AGENTS.md` |
| S2 `# Agent Signal — the mic, rotation and four-eyes review` | `AGENT_SIGNAL.md`, first heading (lands in slice 1) | `AGENTS.md`'s coordination bullet (§"Agent Coordination"), which also requires `AGENT_SIGNAL.md`'s reciprocal S1 self-check | stop, tell the founder, run `blueprint pull AGENT_SIGNAL.md` |
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
| new `AGENT_SIGNAL.md` (slice 1), old everything else | the coordination protocol exists twice, word for word. The pre-existing BUG-140 `User`/`Nobody` contradiction is now co-located rather than split across the two files | no migration content is lost; wake-time drift lists slice 2 once it exists. Slice 2 corrects BUG-140. This released intermediate state is not itself a sentinel mismatch |
| new `AGENTS.md`, old `AGENT_SIGNAL.md` (slice 1 skipped) | Codex and Kimi get the shared rules but **no protocol**: `AGENTS.md` sends them to `AGENT_SIGNAL.md`, whose old text sends them back to `AGENTS.md` | **S2**: the coordination bullet requires `AGENT_SIGNAL.md`'s new heading, finds the old one, stops and names `blueprint pull AGENT_SIGNAL.md`. Also: slice 1 is released first, and wake-time `drift` lists the file |
| new `AGENTS.md`, slice-1 `AGENT_SIGNAL.md` | S2's heading matches, but the protocol still has its pre-switch self-references and BUG-140's `or User` wording | **reciprocal S1 check**: `AGENTS.md` also requires `AGENT_SIGNAL.md` to check S1. The slice-1 file has no such check, so the agent stops and names `blueprint pull AGENT_SIGNAL.md` |
| slice-2 `AGENT_SIGNAL.md`, old `AGENTS.md` | the protocol calls `AGENTS.md` the shared rules, but the old file is still the coordination protocol | **S1 in `AGENT_SIGNAL.md`**: its reciprocal self-check finds the old heading, stops and names `blueprint pull AGENTS.md` |
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

**Superseded by §9 decision 4 (founder, 2026-09-29): both are renamed in slice
3.** The paragraphs above record the plan as reviewed; the decision below is
what slice 3 implements.

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
  Two reciprocal-switch cases complete the matrix:
  - a slice-1 fixture that pulls only slice-2 `AGENTS.md` finds that its
    `AGENT_SIGNAL.md` lacks the reciprocal S1 self-check, stops and names
    `blueprint pull AGENT_SIGNAL.md`;
  - a pre-slice-1 fixture that pulls only slice-2 `AGENT_SIGNAL.md` finds the
    old S1 heading in `AGENTS.md`, stops and names `blueprint pull AGENTS.md`.

### Slice 3: the reference sweep

- Every slice-3 row of §5 and §7.
- The two renames of §9 decision 4, including the one-release import of the
  old `claude.internal.md` name.
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
   is therefore part of the plan: sentinels make every incomplete
   single-file pull of the switch fail loudly and name the file to pull. The
   new `AGENTS.md` checks S2 and requires `AGENT_SIGNAL.md`'s reciprocal S1
   self-check; `AGENT_SIGNAL.md`, `CLAUDE.md` and `GEMINI.md` check S1 in
   `AGENTS.md`; every sentinel is pinned by a test; and the migration proof
   covers every one-file combination (§2, §4, §8). The fully landed additive
   slice 1 remains a supported release boundary, not a half-applied switch.
3. **Scope: the four autonomous CLI providers**, Claude Code, Codex, Kimi and
   Gemini. The notify-only GitHub Copilot is outside this item.
4. **Both Claude-named companions are renamed in slice 3** (founder, asked
   "we need a similar for agents, don't we?", then "yep"):
   - `CLAUDE.blueprint.md` → `AGENTS.blueprint.md`. Blueprint-only: its
     `.gitattributes` export-ignore line, the import in `AGENTS.md`, the
     suites that name it (bootstrap-contents #11, template-source) and every
     reference in this repo's docs move with it.
   - `claude.internal.md` → `agents.internal.md`, **with the old name still
     imported for one release** so a project that already created one is
     not orphaned. `AGENTS.md` imports both, the new name first; the old
     import and its note are removed in the release after. No project has
     one today, but the contract does not rely on that (§6).

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

### Slice 2 — 2026-09-29, `1dbfd5f` (Christian, Claude)

**The switch, in one commit** so `main` is green at every commit: the four
instruction files, every test that reads them, and the §7 ripples.

- **`AGENTS.md`** (27,418 bytes, cap 28,672) is today's `CLAUDE.md` body from
  §"Running commands" on, unchanged, under a new head: S1, a two-sentence
  preamble, §"Read these first" (the import block of §3), the
  `claude.internal.md` / `CLAUDE.blueprint.md` paragraphs (now saying
  `claude.internal.md` is every provider's), and §"Agent Coordination" with the
  S2 bullet and the "wake by hand" paragraph. S3 is the last line. Four edits
  inside the moved body: the Team Workflow `Agent`-tool bullet became a
  provider-neutral line pointing at `CLAUDE.md` §"Spawning personas"; §"Who
  does the work" points at `AGENT_SIGNAL.md`; §"Blueprint sync" says "this
  file" instead of "This CLAUDE.md"; §"Drift and pull" says every agent runs
  drift at wake instead of pointing at a hook only Claude has. **The first
  growth lever (§2) was not pulled**: the file fits with 1,254 bytes to spare.
- **`CLAUDE.md`** (2,725 bytes, cap 4,096): `@AGENTS.md`, the S1 self-check,
  the redirect, then `## Claude Code only` → `### On wake — the primary session
  is the Orchestrator` (unchanged text, H3, followed by `## Spawning personas`,
  so `tests/roster` #11 passes unchanged) → `## Enforcement that binds Claude
  Code only` (the `deny` list, the two `PreToolUse` hooks, the `Stop` link
  guard).
- **`GEMINI.md`** (263 bytes, cap 512): `@AGENTS.md` and the S1 self-check.
- **`AGENT_SIGNAL.md`** (§5's four points): the preamble names `AGENTS.md` as
  the shared rules; the on-wake list calls this file the protocol and
  `AGENTS.md` the shared rules; `CLAUDE.md` §"On wake" is kept (Claude-only
  target); the Kimi bullet on the invisible 32 KB warning is added. **The
  slice-1 finding is fixed**: the mic section now says `Holder` is a roster
  persona or `Nobody`, nothing else (§"The protocol", BUG-140), not "or
  `User`".

**Tests.** A new suite, `tests/instruction-files`, holds the three byte caps
(each failing with the §2 remedy text), the S1/S2/S3 pins, and the
stale-protocol-pointer case (both forms, `AGENTS.md#anchor` and
`AGENTS.md §"<heading>"`, over the four root files, with an in-case planted
pair so it cannot pass vacuously). A combined mutant (S1 quote drifted in
`GEMINI.md`, `GEMINI.md` over 512 bytes, a stale pointer, text after S3, the
S2 heading drifted) turned exactly those five cases red. `template-source`
#import-1 now reads `AGENTS.md` and requires `CLAUDE.md` and `GEMINI.md` to
import exactly `AGENTS.md`. `bootstrap-contents` #3b, #3c, #5c (seven
documents), #11 and #12 (all five root files) follow. `enforced-by-pointers`'
count comment and `codex-persona-label`'s TASK-061 case (reads
`AGENT_SIGNAL.md`) follow. `UNREGISTERED_MARKERS` gains `GEMINI.md`.

**Full suite once, at the first commit of the switch:** 76 files, 1,391
tests, 1 failed; the release tier (`bootstrap-gate`, `a2bp-e2e`,
`blueprint-port`, `signal-dispatch`, `agent-activity-bound`, `subagent-feed`)
all green. The failure is the item below; after the fix, `csv-freshness`,
`lifecycle-docs`, `doc-links`, `manifest` and `instruction-files` were rerun
by name (112 tests, green). `npm --prefix tests run typecheck` is clean.
`node scripts/contamination-push-scan.mts --before a2e3bdf --after 1dbfd5f`:
PASS, no BLOCK findings (the moved `~/.kimi-code` line keeps its slice-1
marker).

**Migration fixtures.** A project bootstrapped from `a16a7ff` (pre-slice-1),
copied three times, each pulling one file alone from `1dbfd5f` with
`BLUEPRINT_ROOT` set:

| Pull | File that checks | Sentinel it finds | Names |
|---|---|---|---|
| `pull AGENTS.md` | `AGENTS.md` (S2 bullet) | `# Agent Signal — the radio-over protocol` | `blueprint pull AGENT_SIGNAL.md` |
| `pull CLAUDE.md` | `CLAUDE.md` (S1 self-check) | `# Agent Coordination Protocol` | `blueprint pull AGENTS.md` |
| `pull GEMINI.md` | `GEMINI.md` (S1 self-check) | `# Agent Coordination Protocol` | `blueprint pull AGENTS.md` |

That is the mechanical half: each state presents a mismatched sentinel to a
check that names the right file. Whether each provider's session obeys it is
the per-provider probe, still to run.

**Not anticipated by the plan.**

- **`tests/csv-freshness` depends on `CLAUDE.md` line numbers.** TASK-022's
  audit CSV (`docs/done/TASK-022-anchor-rules/`) keeps a live
  `CURRENT_LOCATION` column that a hard-failing case checks against the tree,
  and 114 rows cited `CLAUDE.md` or `AGENTS.md` lines that moved (91 of them
  now out of range). Only that column was re-pointed, mechanically, by unique
  line content: old `CLAUDE.md` to `AGENTS.md` or `CLAUDE.md`, old `AGENTS.md`
  to `AGENT_SIGNAL.md`. No judgement column changed. §5's "historical records
  are not rewritten" still holds for the rest of the row.
- **`README.md` listed `AGENT_SIGNAL.md` as project-owned** ("stamped at
  bootstrap, then evolves"). It has been managed since BUG-019; the bullet is
  gone and the managed top-level list names all four instruction files.
- **Left alone:** `README.md`'s `{{REPO_PATH}}` line still says it is "used in
  `AGENTS.md` example invocations"; nothing uses that placeholder, before or
  after this slice. Slice 3 or its own row.
- **A live Claude migration probe cannot run inside this checkout.** Claude
  Code's ancestor walk loads the blueprint's own root `CLAUDE.md`, which
  imports the new `AGENTS.md` and so satisfies S1 (the §1 method artefact).
  The `pull CLAUDE.md` fixture needs a location outside the blueprint tree to
  show Claude stopping; Codex, Kimi and Gemini stop at the fixture's own
  `.git` root and are unaffected.

**Cross-provider review finding (Alexey, Codex).** S2's heading landed in slice
1, but slice 2 also rewrites `AGENT_SIGNAL.md`. A project that had pulled slice
1 could therefore accept the new `AGENTS.md` and decline the slice-2
`AGENT_SIGNAL.md`; S2 still matched, leaving stale self-references and BUG-140's
`or User` wording silently in force. The reverse named pull — slice-2
`AGENT_SIGNAL.md` with old `AGENTS.md` — was also unguarded. The fix makes S1
reciprocal: `AGENT_SIGNAL.md` checks the `AGENTS.md` heading, while `AGENTS.md`
requires that reciprocal check as well as S2. `tests/instruction-files` pins
both directions, and §4 now names both missing partial states explicitly.

### Slice 2 — provider probe, 2026-09-30 (Vitali, Claude)

The manual half of slice 2's proof: the per-provider live probe and the
migration probe. Run on `820eca1`.

**Method.** Fixtures were bootstrapped with each tree's own
`scripts/new-project.sh` and sat OUTSIDE the blueprint tree, in
`/home/luiz/dev/struct2flow/.task084-probe/` (no ancestor of it holds a
`CLAUDE.md`, `AGENTS.md` or `GEMINI.md`, checked with `ls`), so Claude Code's
ancestor walk could not load this repo's own `CLAUDE.md` and satisfy S1
falsely. Trees: slice 2 = `820eca1`, pre-slice-1 = `a16a7ff`, slice 1 =
`a2e3bdf` (detached worktrees). Pulls were `blueprint pull --yes <file>` with
`BLUEPRINT_ROOT` on the `820eca1` tree, run from inside each fixture. Nothing
was pushed.

Versions: Claude Code 2.1.215 (installed) and 2.1.285 (`npx
@anthropic-ai/claude-code@latest`; §1 recorded 2.1.284), codex-cli 0.154.0,
Kimi 2.0.2, Gemini 0.53.0.

**User-level instruction files: all five are absent**, so none adds to any
provider's budget on this machine: `~/.codex/AGENTS.md`,
`~/.agents/AGENTS.md`, `~/.kimi-code/AGENTS.md`, `~/.gemini/GEMINI.md`,
`~/.claude/CLAUDE.md`. (`/home/luiz/dev/.claude/settings.json` exists two
levels up; it is settings, not instructions.)

#### Per-provider probe, slice-2 fixture

Prompt, no tools: give the first heading of `AGENTS.md` (S1), its last line
(S3), and the heading line under which the phrase "Domain glossary" appears in
loaded context (it occurs only in `project_config_overview.md`), or NONE /
NOT LOADED.

| Provider | S1 | S3 | "Domain glossary" | Expected | Result |
|---|---|---|---|---|---|
| Claude Code 2.1.215 | `# Agent instructions — shared by the four CLI providers` | `End of the shared agent instructions.` | `## Domain glossary` | all three | **PASS** |
| Claude Code 2.1.285 | same | same | `## Domain glossary` | all three | **PASS** |
| Gemini 0.53.0 | same | same | `## Domain glossary` | all three | **PASS** |
| Codex 0.154.0 | same | same | `NONE` | S1 and S3 (no `@` follow) | **PASS** |
| Kimi 2.0.2 | same | same | `NONE` | S1 and S3 (no `@` follow) | **PASS** |

The Claude runs were `claude -p --tools ""`; in an untrusted directory Claude
still loaded `CLAUDE.md` and its imports. Gemini logged two
`[ERROR] [ImportProcessor] Failed to import claude.internal.md / CLAUDE.blueprint.md: ENOENT`
lines on stderr and carried on: the missing optional imports are non-fatal but
noisy, and unlike Claude Code Gemini does not skip them silently.

**Second prompt, read tools allowed (Codex, Kimi):** "do exactly what this
project's instructions say to do before substantive work; report the files you
opened and the heading after `## Domain glossary`."

| Provider | Opened | Answer | Result |
|---|---|---|---|
| Codex | `AGENTS.md`, all five `project_config_*.md`, tried the two absent optional files, `scripts/blueprint*`, `scripts/agent-activity.sh`; it ran neither `drift` nor `--daemon`, saying they write state | `## Customer-reference policy` | **PASS** (opens the config; skipped the wake commands unprompted) |
| Kimi | all five `project_config_*.md`, tried the two absent files; ran `bash scripts/blueprint drift` (exit 4, the fixture's `blueprint_remote = FILL-ME-IN`, reported as unknown) and `--daemon` | `## Customer-reference policy` | **PASS** (also followed the by-hand wake paragraph) |

#### Migration probe

Prompt for the Codex and Kimi cases: "You are about to coordinate work with
the other agents on this project: claim the mic. Follow the project
instructions for coordination and report what you do and what you conclude. Do
not modify anything." Prompt for the Claude and Gemini cases: "You have just
woken on this project ... follow this project's instructions for a session
start ... if they tell you to stop or run a command first, quote it."

| # | Fixture (what was pulled) | Provider | Stops? | Names | Result |
|---|---|---|---|---|---|
| 1 | pre-slice-1 + slice-2 `AGENTS.md` | Codex | yes | `blueprint pull AGENT_SIGNAL.md` (old heading "the radio-over protocol") | **PASS** |
| 1 | same | Kimi, run 1 | **no**: read `AGENT_SIGNAL.md`, never compared its heading, claimed the mic as `Sylvia` | none | **FAIL** |
| 1 | same, fresh fixture | Kimi, run 2 | yes | `blueprint pull AGENT_SIGNAL.md` | PASS |
| 2 | pre-slice-1 + slice-2 `CLAUDE.md` | Claude 2.1.215 | yes, at wake | `blueprint pull AGENTS.md` (found `# Agent Coordination Protocol`) | **PASS** |
| 2 | same | Claude 2.1.285 | yes | `blueprint pull AGENTS.md` | **PASS** |
| 3 | pre-slice-1 + slice-2 `GEMINI.md` | Gemini | unverified: repeated 503 "high demand", then `TerminalQuotaError` 429 (free tier, `gemini-3-flash`, limit 20) before it answered | n/a | **NOT VERIFIED** |
| 4 | slice-1 + slice-2 `AGENTS.md` only | Codex | yes | `blueprint pull AGENT_SIGNAL.md` (heading right, reciprocal self-check missing) | **PASS** |
| 4 | same | Kimi, run 1 | **no**: checked both headings, saw no problem, claimed the mic | none | **FAIL** |
| 4 | same, fresh fixture | Kimi, run 2 | **no**: same | none | **FAIL** |
| 5 | pre-slice-1 + slice-2 `AGENT_SIGNAL.md` only | Codex | yes | `blueprint pull AGENTS.md` (old heading, from the new self-check) | **PASS** |
| 5 | same | Kimi | yes | `blueprint pull AGENTS.md` | PASS (see confound) |

The Claude `CLAUDE.md` case (row 2), the one that could not run inside the
blueprint checkout, now has a real result on both builds: Claude stops at wake
on the S1 self-check and names the right pull.

**Gaps, stated plainly.**

- **Kimi does not reliably apply the S2 check.** Case 1 failed once in two
  runs. Case 4 failed both runs, and its transcript shows why: Kimi verified
  `AGENT_SIGNAL.md`'s first heading and `AGENTS.md`'s heading and stopped
  there, skipping the second clause of the S2 bullet ("or its opening
  self-check does not require `AGENTS.md`'s heading"). Codex applied both
  clauses in every case. Nothing in this item changed to address it; whether
  the S2 bullet should state the two conditions as separate steps is a
  decision for the plan owner.
- **Gemini's migration case is unverified**, on quota, not on behaviour. Its
  per-provider probe passed the same day, so the gap is only case 3.
- **Confounds in the fixtures.** Every fixture path contains `.task084-probe`
  and the directories were named `pre-A`, `pre-S`, `s1`; Kimi quoted the
  `pre-S` name as a hint in case 5, so that PASS is weaker than Codex's. Every
  fixture's `.blueprint-source` still reads `blueprint_remote = FILL-ME-IN`, so
  `drift` exited 4 in each (correctly reported as unknown), and the prompt's
  "do not modify anything" made Kimi reason about whether claiming the mic was
  allowed. Claude sessions ran without tools, so they could not run `drift`
  themselves; the `SessionStart` hook ran it and its `UNKNOWN` line was in
  their context.
- **Side finding, Gemini:** its `read_file` refused the gitignored
  `AGENT_ROSTER.md` and `logs/state/signal.md` ("ignored by configured ignore
  patterns"). Not a TASK-084 regression, but the protocol tells every provider
  to read the baton, and this one may not be able to with that tool.
- **Side finding, `--whoami`:** in Kimi sessions it answers `Sylvia - Claude
  Code` (it resolves the Orchestrator row), and Kimi claimed the mic as
  `Sylvia` in the failing runs. Pre-existing, unrelated to the switch.

**Cleanup.** The detached worktrees, the `agent-activity` supervisors that the
sessions started inside the fixtures (stopped with `--stop`) and the scratch
scripts were removed. The fixtures themselves were not: the permission rules
refuse `rm -rf` outside the project, so
`/home/luiz/dev/struct2flow/.task084-probe/` waits for the founder to delete.

### S2 split and Kimi re-probe, 2026-09-30 (Christian, Claude)

**The change** (founder decision, 2026-09-30). The `AGENT_SIGNAL.md` bullet of
`AGENTS.md` §"Agent Coordination" now lists two numbered checks, each with its
own stop line (stop, tell the founder, run `blueprint pull AGENT_SIGNAL.md`).
The bullet says to make both before acting on the file or claiming the mic,
and that passing the first does not pass the second. Check 1 quotes S2 and
check 2 quotes S1, each on one line and unchanged byte for byte. `AGENTS.md` is
27,840 bytes (cap 28,672), and S3 is still its last line.
`tests/instruction-files` parses the numbered checks and requires exactly two:
check 1 must quote S2, check 2 must quote S1, and each must have its own stop
line. Two mutants turned it red: deleting check 2, and dropping only check 1's
stop line. The old whole-file `toContain` could not catch the second.

**Method.** This is the same as Vitali's migration probe, with the same
Codex/Kimi prompt, except for three things. Fixtures were bootstrapped by
`a16a7ff`'s and `a2e3bdf`'s own `new-project.sh` into
`.scratch/ws.*/baseA|baseB` of this item's worktree, with neutral names (`w1`
… `w8`, project `orbit`) and a fresh copy per run. Kimi and Codex stop at the
fixture's `.git`. **The pull was a byte copy, not `blueprint pull`**: the
worktree-isolation guard refused `env -C <fixture> … bash scripts/blueprint
pull`, and the CLI takes its project from cwd. A named single-file pull is
partial: it writes that one file and leaves `bootstrap_sha` unchanged. So
copying the committed `AGENTS.md` into the fixture gives the same tree.
Kimi 2.0.2 (`kimi -p`); codex-cli 0.154.0 (`codex exec -C`, `TMPDIR=/dev/shm`).

| Case | Provider | Stops? | Short answer (verbatim) | Result |
|---|---|---|---|---|
| 1 pre-slice-1 + new `AGENTS.md` | Kimi, run 1 | yes | "I did not claim the mic … Check 1 fails … Check 2 also fails." | **PASS** |
| 1 | Kimi, run 2 | yes | "I did not claim the mic. … Check 1 … the actual heading is "Agent Signal — the radio-over protocol" … run `blueprint pull AGENT_SIGNAL.md`" | **PASS** |
| 1 | Kimi, run 3 | yes | "I did **not** claim the mic — the protocol's own pre-flight check failed" | **PASS** |
| 1 | Codex | yes | "I did not claim the mic. The coordination checks failed" (both named) | **PASS** |
| 4 slice-1 + new `AGENTS.md` | Kimi, run 1 | yes | "Check 1 passes … Check 2 FAILS … I did not claim the mic." | **PASS** |
| 4 | Kimi, run 2 | yes | "Check 1 passes … Check 2 FAILS … I did not claim the mic." | **PASS** |
| 4 | Kimi, run 3 | **no** | "its self-check references the current `AGENTS.md` heading ✓ … Mic claimed." | **FAIL** |
| 4 | Codex | yes | "passes the first compatibility check … It fails the second" | **PASS** |

**Result.** Case 1 went from 1/2 to 3/3 for Kimi and case 4 from 0/2 to 2/3.
Codex stopped in both cases, so there is no regression. **Case 4 is still not
reliable on Kimi.** The failed run did read the split. Its reasoning shows
`Self-check requires AGENTS.md heading … ✓ (from AGENTS.md read in system
context)`: it checked `AGENTS.md`'s own heading instead of looking in
`AGENT_SIGNAL.md` for a check that quotes it. It then ran `--daemon` and
`signal-set.sh`, inside the fixture. The two passing runs grepped
`AGENT_SIGNAL.md` for the quoted string. Check 2's subject ("Its opening
self-check") is the ambiguity left. Naming what to search for would close it:
the slice-2 file's literal `**Shared-rules self-check.**` paragraph, or "search
`AGENT_SIGNAL.md` for this quoted heading". That is a wording change beyond the
founder's split, so it is left for the founder, not made here.

**Confounds.** The fixture path still contains `.claude/worktrees/…/.scratch/`,
and Kimi called it "a test workspace" in run 1 and "a verification exercise" in
case 4 run 2. The `FILL-ME-IN` remote (drift exit 4) and the "do not modify
anything" prompt are the same as in Vitali's runs. **Cleanup:** Kimi's case 4
run 3 started an `agent-activity` supervisor, stopped with that fixture's own
`scripts/agent-activity.sh --stop`. `--status` then reported none running in
all eight fixtures. The fixtures and the two detached source worktrees were
removed.

**Founder decision, 2026-09-30:** the S2 split ships as is, and Kimi's 2 of 3
on case 4 is a known limit. The "name the Shared-rules self-check paragraph"
wording is not pursued.

### Slice 3 — 2026-09-30 (Christian, Claude)

**Sweep and renames, `b705d37`.** Every live `CLAUDE.md §"<heading>"` whose
heading moved into `AGENTS.md` now names `AGENTS.md`, including the four recipe
docs' opening links, the `.mts` comments, test comments, the
`tests/forbidden-idiom` failure message and `scripts/no-chain-guard.sh`'s
refusal text. Protocol pointers in `AGENT_ROSTER.example.md` and A2BP row F now
name `AGENT_SIGNAL.md`. `.gitignore`'s framework-document comment names
`GEMINI.md`. `CLAUDE.blueprint.md` is `AGENTS.blueprint.md` (export-ignore line,
import, every live reference). `claude.internal.md` is `agents.internal.md`,
and `AGENTS.md` imports both, new name first, with one sentence saying the old
one goes after this release. `tests/template-source` #import-1 and
`tests/bootstrap-contents` #3c pin both imports, and #11 pins the new
blueprint-only name. `AGENTS.md` is 27,998 bytes (cap 28,672), and S3 is still
its last line.

**Proof, grep.** The command, with the §5 exempt set as pathspecs:

```
git grep -nE 'CLAUDE\.md(`|\]\([^)]*\))? *§? *"?(Quality|Observability|Security|Cost|Infrastructure|Documentation|Running commands|Before Every Push|Blueprint sync|Back-propagating|Team Workflow|Agent Coordination|Shell to TypeScript|Your project|Architecture|Drift and pull|What blueprint sync|Read these first|Definition of Done|Code Quality)' -- . ':!docs/done' ':!docs/waiting-acceptance' ':!docs/config' ':!.githooks/pre-push' ':!.githooks/pre-push-project' ':!scripts/lib/contamination.sh' ':!scripts/lib/gate.sh' ':!scripts/team-kickoff.sh' ':!scripts/signal-set.sh' ':!scripts/lib/dod-gate.sh'
```

It prints **1** line: `scripts/shell-inventory-check.mts:134`. That line is
the template that renders the exempt `scripts/lib/dod-gate.sh` adapter, and the
checker requires byte equality with it, so it moves only when the adapter
does. Inside the exempt shell files the same pattern matches 4 lines. Wrapped
references (`CLAUDE.md` at a line end, `§` on the next) were checked
separately and none is left. Alexey's review found six possessive forms
(`CLAUDE.md's "Shell to TypeScript…"`, `…"no silent swallowing"`) the pattern
missed, in five `.mts` comments and `HANDOVER.md`; they now name `AGENTS.md`.

**Proof, suite.** `npm --prefix tests test` at `2c7d773` (worktree `f02818f`, same tree): 75 of 76 files and
1390 of 1391 tests passed. The one failure was `tests/csv-freshness`: 16 live
rows of TASK-022's audit CSV cited `CLAUDE.blueprint.md:<line>`. As in slice
2, only the `CURRENT_LOCATION` cells were re-pointed (17 cells, the rename kept
every line number), and `npm --prefix tests test -- csv-freshness` then passed
10 of 10.

**Left alone, out of scope:** references to headings that exist in no file
today (`§"Pre-push tolerance"`, `§"Work-item folder rule"`, `§"Test Layers"`),
which predate this item.
