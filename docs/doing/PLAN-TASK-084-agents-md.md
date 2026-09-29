# PLAN — TASK-084: one instruction file for every provider

**Status: v1, draft for the three-provider review** (Claude, Codex, Kimi, per
[`AGENTS.md`](../../AGENTS.md) §"Who does the work"). Written by Christian
(Architect-1, Claude). Nothing has moved yet. Row: [TASK-084](BACKLOG.md).

The row asks for one thing: every provider works from the same rules. Today
they do not. §1 measures what each tool actually loads, because the row's own
facts were checked from documentation and two of them turned out to need
qualifying. §2 onward is the design.

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
| **Claude Code**, the fleet's install | 2.1.215 (`~/.local/bin/claude`) | **No**, in fixtures a and b alike | Yes | **Yes, nested**: c loaded ECHO, FOXTROT and GOLF | Probe |
| **Claude Code**, current upstream | 2.1.284 via `npx`; npm `stable` = 2.1.277 | **Only when no `CLAUDE.md` exists in the ancestor walk** (default mode); a stayed unloaded because the blueprint's `CLAUDE.md` is an ancestor | Yes | Yes, nested, loaded once each (c) | Probe plus the binary's own option text, below |
| **Codex** | codex-cli 0.154.0 | Yes (fixture a) | No | **No.** It saw the literal text `@imported.md`, and BRAVO was absent | Probe |
| **Kimi** | 2.0.2 | Yes (a, b) | **No**, and says so for b | **No.** Same as Codex | Probe |
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
  is **32768**. The value was read from the binary; that it truncates rather
  than refuses is from Codex's documentation. The limit covers all
  `AGENTS.md` files from the git root to the cwd, plus `~/.codex/AGENTS.md`.
- **Kimi** warns, without truncating, when its `AGENTS.md` total exceeds
  32768 bytes. Its binary text reads *"AGENTS.md total … exceeds the
  recommended 32 KB"*. Kimi also loads `.kimi-code/AGENTS.md` and
  `~/.agents/AGENTS.md`.
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
| `AGENTS.md` | **The shared rules**: today's `CLAUDE.md` minus the Claude-only parts, with its headings unchanged, plus the "read these first" import block (§3) | via `@AGENTS.md` in `CLAUDE.md` | via `@AGENTS.md` in `GEMINI.md` | native |
| `CLAUDE.md` | `@AGENTS.md`, a self-check line (§4), a redirect line, and the Claude-only parts | native | — | — |
| `GEMINI.md` (new) | `@AGENTS.md` and one line saying why | — | native | — |
| `AGENT_SIGNAL.md` | **The coordination protocol**: today's `AGENTS.md` merged into its current 69 lines, headings kept | on demand | on demand | on demand, and every dispatch preamble already sends them here |

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
  for the import block, the sentinel and the redirect.
- The coordination protocol goes to a file agents read when they coordinate.

**Why `AGENT_SIGNAL.md` and not a new file:**

- It already calls itself "the radio-over protocol".
- Its last paragraph says "The full protocol is in AGENTS.md". The merge
  removes that hop.
- All three dispatch preambles already tell the dispatched agent to read it.
- It is one file fewer rather than one more.

The cost is that the name says "signal" while the content also covers
rotation and four-eyes. See §9 Q1.

**Why `GEMINI.md` and not `.gemini/settings.json`:** a managed
`.gemini/settings.json` would overwrite a project's own Gemini settings on
every pull. That is exactly the problem TASK-042 needed a merge layer to solve
for `.claude/settings.json`. A three-line importer needs no merge, and it
mirrors `CLAUDE.md`. None of the four derived projects has a `GEMINI.md`, so
the name is free.

**The byte budget is enforced, not hoped for.** A new test asserts
`AGENTS.md` ≤ 28,672 bytes (28 KiB). That leaves 4 KiB of Codex's 32 KiB for
a user's `~/.codex/AGENTS.md` and a project's nested ones.

If slice 2's measured size exceeds it, the lever is already named: the
"Enforcement is a committed inventory …" paragraph of §"Shell to TypeScript"
(about 1.5 KB) moves to `CLAUDE.blueprint.md`. Its own text says it applies
"in this blueprint only", and an imported file does not count against
Codex's budget. No other trimming is part of this item.

**Sketch** (wording is slice 2's, not final):

```markdown
<!-- CLAUDE.md -->
@AGENTS.md

**Self-check.** The text imported above must begin with the heading
"Agent instructions — shared by every provider". If it does not, this
project's AGENTS.md predates TASK-084: tell the founder and run
`blueprint pull AGENTS.md` before any other work.

Sections this file used to hold (the main concerns, "Running commands",
"Team Workflow", "Blueprint sync" and the rest) now live in AGENTS.md under
the same headings. A reference to "CLAUDE.md §X" means that heading there.

# Claude Code only
## On wake — the primary session is the Orchestrator   ← unchanged
## Spawning personas                                    ← Agent tool bullet
## Enforcement that binds Claude Code only              ← settings.json, Stop hook
```

```markdown
<!-- GEMINI.md -->
@AGENTS.md

Gemini reads GEMINI.md by default. The rules every provider shares are in
AGENTS.md, imported above.
```

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
  TASK-081's closure and hold-back cover `scripts/lib/*` only.
- **Extending that closure to `@` edges is rejected as disproportionate.** It
  took three review rounds for code dependencies, and this layout needs one
  guard for one pair.

### The four derived projects

Measured on 2026-09-29:

- **storm2flow, linkedin-watcher-agent and lyricscreator** differ from the
  blueprint's `CLAUDE.md` by one line, and have identical `AGENTS.md` copies.
- **struct2flow-www** is simply behind. It was adopted 2026-07-30, and its
  copies still carry sections the blueprint since moved into `DoD.md`. It has
  no project-owned content in either file (diff read), so a full pull is
  safe for it.
- **None of the four has a `GEMINI.md` or a `claude.internal.md`.**

### Every partial state, and what guards it

| State after a partial pull | Effect | Guard |
|---|---|---|
| new `AGENT_SIGNAL.md` (slice 1), old everything else | the coordination protocol exists twice, word for word | harmless: nothing contradicts. The blueprint freezes both copies until slice 2 |
| new `AGENTS.md`, old `AGENT_SIGNAL.md` (slice 1 skipped) | `AGENTS.md` sends coordination to `AGENT_SIGNAL.md`, which still says "the full protocol is in AGENTS.md" | **slice 1 is released on its own first**, so a project pulling at each wake has it. Only a project that skipped a release AND declined `AGENT_SIGNAL.md` lands here, and the pointer loop is visible to the agent |
| new `CLAUDE.md`, old `AGENTS.md` | **the dangerous one**: Claude imports the old coordination file and loses the shared rules | (1) the bytewise order lands `AGENTS.md` first in any uninterrupted pull; (2) **the self-check line**: Claude sees the imported text lacks the sentinel heading, stops and says so. A test pins the sentinel string equal in both files; (3) `blueprint drift`, run by the `SessionStart` hook, already lists `AGENTS.md` as drifted |
| new `AGENTS.md`, old `CLAUDE.md` | Claude still reads its old full copy. Codex, Kimi and (with `GEMINI.md`) Gemini get the new rules | none needed: the text is the same, and Claude's copy is merely stale |
| `GEMINI.md` alone, old `AGENTS.md` | Gemini gets the coordination protocol | none needed: that is more than it reads today |

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
existing pointer therefore still resolves by one hop**, including ones this
item cannot or should not edit:

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

**What IS updated, by slice:**

| Where | Change | Slice |
|---|---|---|
| `tests/template-source` #import-1 | the exact-set import check moves to `AGENTS.md`; `CLAUDE.md` and `GEMINI.md` must each import exactly `AGENTS.md` | 2 |
| `tests/bootstrap-contents` #3b | `GEMINI.md` ships | 2 |
| `tests/bootstrap-contents` #3c, #11 | `@claude.internal.md` and `@CLAUDE.blueprint.md` are asserted in the derived `AGENTS.md` | 2 |
| `tests/bootstrap-contents` #12 | root links are checked in `AGENTS.md`, `AGENT_SIGNAL.md` and `GEMINI.md` too, not only `CLAUDE.md` and `README.md` | 1 (`AGENT_SIGNAL.md`), 2 (the rest) |
| `tests/roster` #11 | unchanged: §"On wake" stays in `CLAUDE.md`. Keep a `## ` heading after it, or the case's regex finds nothing | 2 (verify) |
| `tests/enforced-by-pointers` REAL TREE | scans `AGENT_SIGNAL.md` as well | 1 |
| `tests/codex-persona-label` (the TASK-061 case) | reads the hand-back text from `AGENT_SIGNAL.md` | 2, when `AGENTS.md` loses it |
| `tests/forbidden-idiom` failure message | `CLAUDE.md §"Observability …"` becomes `AGENTS.md §…` | 3 |
| new cases | `AGENTS.md` ≤ 28 KiB; the sentinel string in `CLAUDE.md`'s self-check equals `AGENTS.md`'s first heading | 2 |
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
from `CLAUDE.md` to `AGENTS.md`, so every provider gets them:

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
  - lines 335 and 453.
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
  mic paragraph deduplicated, headings kept), and loses "the full protocol is
  in AGENTS.md".
- **`AGENTS.md` is not touched.**
- **Tests:** `enforced-by-pointers` scans `AGENT_SIGNAL.md`, and
  `bootstrap-contents` #12 checks its links.
- **Proof:**
  - the full suite and the release tier (`bootstrap-gate`, `a2bp-e2e`);
  - `diff` shows every moved section byte-identical to its `AGENTS.md`
    original, except the deduplicated mic paragraph;
  - no provider probe is needed, because no tool loads anything differently.
- **Then:** push, and let CI advance `released` before slice 2 is pushed
  (§9 Q2).

### Slice 2: the switch

- `AGENTS.md` = the shared rules and the import block.
- `CLAUDE.md` = the thin importer, the self-check and the Claude-only part.
- `GEMINI.md` is added.
- Every slice-2 row of §5 and §7 lands with it.
- **Proof, mechanical (CI):**
  - the updated suites and the two new cases (byte budget, sentinel pin);
  - the full suite and the release tier;
  - `doc-links`.
- **Proof, per provider (manual, recorded in this plan's slice log):**
  1. Bootstrap a project into `.scratch/` from the slice-2 tree
     (`BLUEPRINT_ROOT` override).
  2. Ask each CLI, with no tools allowed, for `AGENTS.md`'s first heading and
     a phrase that appears only in `project_config_overview.md`.
  3. Expected:
     - **Claude**, on both 2.1.215 and a current build: both answers from
       loaded context.
     - **Gemini**: both. If its quota is out again, the source reading in §1
       stands, and the gap is recorded rather than papered over.
     - **Codex and Kimi**: the heading from loaded context. Then, with read
       tools allowed, a second prompt checks that they open the config when
       the instruction says to.
- **Proof, migration:** in a fixture project at the pre-slice-2 state, run
  `blueprint pull CLAUDE.md` alone and start a Claude session. The self-check
  must fire.

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
- Trimming `AGENTS.md` beyond the one named lever.
- GitHub Copilot, which is human-driven in the IDE. Whether VS Code's
  Copilot reads `AGENTS.md` was not verified here.

---

## 9. Open questions for the founder

1. **The coordination protocol's home.** Merge it into `AGENT_SIGNAL.md`, or
   create a new file (say `AGENT_PROTOCOL.md`) beside it?
   **Recommendation: merge.** The dispatch preambles already send every
   agent there, the file already calls itself the protocol, and it is one
   file fewer. The cost is a name that undersells rotation and four-eyes.
2. **The gap between slice 1 and slice 2.** Push slice 2 as soon as
   `released` carries slice 1, or first let the four derived projects pull
   slice 1?
   **Recommendation: no hard gate.** Push slice 2 once `released` has slice
   1. The wake-time `drift` in each project pulls it at the next session, and
   the §4 guards cover a project that skips it.

Everything else in this plan is a recommendation the reviewers may overturn,
not a decision waiting on the founder.

### Assumptions not verified

- **Gemini's behaviour live**: quota exhausted on both attempts. Source-read
  only.
- **Claude Code 2.1.277 itself**: 2.1.215 and 2.1.284 were probed, and the
  option text was read from 2.1.284.
- **Codex truncating rather than refusing** past 32768 bytes: the default
  value was read from the binary, the behaviour is from its documentation.
- **That an agent follows prose**: the self-check line, and Codex and Kimi
  opening the listed files. Both are instructions, not mechanisms.
