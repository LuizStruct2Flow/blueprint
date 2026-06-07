# A2BP Playbook — completing the back-propagation in one session

`blueprint a2bp` copies a file into the blueprint working tree. It does **not**
complete the back-propagation. Most of the work — updating the deck, the
README table, the recipe doc, the pitch-surface list, rebuilding the PDF,
committing, pushing, verifying — happens *after* `a2bp`.

**Do every step here from the originating project's session.** You already
read `$BLUEPRINT_ROOT` from `.blueprint-source`; you can `cat`, `edit`, and
run `git -C $BLUEPRINT_ROOT ...` from where you are. There is no reason to
open a second prompt in the blueprint repo, and four self-violations in
one week of the §6.4 rule show that the second-prompt habit is exactly
how doc-sync slips.

---

## When to use this playbook

After every `blueprint a2bp <file...>` invocation. The playbook is the
fourth step in the sync loop:

1. `blueprint drift` — confirm you're starting from a clean delta.
2. Edit the file in the originating project. The change lands here first
   (the "derived, not designed" rule — see CLAUDE.md §"The blueprint is
   derived, not designed").
3. `blueprint a2bp <file...>` — stage the change in the blueprint working tree.
4. **This playbook** — close the doc-sync ripples, commit, push, verify.

The agent calling `a2bp` is the agent who walks this playbook. Same session,
same prompt, same head full of context. No handoff to a "blueprint repo
session" — that habit is the failure mode.

---

## Step A — Classify the change

Before doing the ripples, classify the change. Pick the row(s) that match
what you just `a2bp`'d:

| Class | What it is | Where to look for ripples |
|---|---|---|
| **A. Principle change** | New / changed `## X is a main concern` in CLAUDE.md | Deck intro slide concern count + that concern's slides; recipe doc; README hero concern table; CLAUDE.md §"docs/way-of-working.md is the canonical pitch surface" mirror list |
| **B. Recipe change** | Edit to `docs/OBSERVABILITY.md` / `SECURITY.md` / `INFRASTRUCTURE.md` / `DOCUMENTATION.md` | Deck recipes slide for that concern; possibly `project_config_overview.md` §"X stack" table if a new mechanism row was implied |
| **C. Gate change** | Edit to `docs/DoD.md` (§4, §6.x, §7.D) | Deck Quality slides if §3 or §4 changed; `project_config_dod.md` if a new table row was implied; cross-references in other DoD subsections |
| **D. Pre-push change** | Edit to `.githooks/pre-push` or `Brewfile` | DoD §4; CLAUDE.md §"Before Every Push"; README "What's in the blueprint" tree; `project_config_dod.md` §"Pre-push gate — project commands" table |
| **E. Sync layer change** | Edit to `scripts/blueprint`, `scripts/new-project.sh`, the `MANAGED_FILES` array | README §"The sync model"; CLAUDE.md §"Blueprint sync"; this playbook (if the calling pattern changed) |
| **F. Agent layer change** | Edit to `AGENTS.md`, `AGENT_ROSTER.md`, `scripts/agent-activity.sh`, `scripts/start-codex-signal-watch.sh`, `scripts/start-gemini-signal-watch.sh`, `scripts/team-kickoff.sh` | Deck "persona team — radio-over" slide; CLAUDE.md pitch-surface item #9; README hero paragraph if the framing changed |
| **G. Stack / architecture default** | Edit to `STACK_DEFAULTS.md` | Deck Architecture slide; CLAUDE.md `## Architecture Principles`; any `project_config_overview.md §"Tech stack"` defaults that mirror it |
| **H. Cosmetic / typo / doc-only** | Single-character fix, link repair, prose clarification | None usually; commit straight |
| **I. New (or removed) concern** | Adding the Nth concern (Cost was; Documentation was). Removing one is the same shape inverted. | **Everything in A**, plus: intro slide concern count (search `\bsix\b`, `\bseven\b`, `\beight\b`, `\bnine\b`); "Where to read more" slide; README tree; possibly new `docs/<CONCERN>.md` recipe file; possibly new `project_config_<concern>.md` template; possibly new `project_config_overview.md` §"<X> stack" section. This class is heavy on purpose — it's the slowest path *and* the one most likely to slip §6.4. |

Most a2bp's are class A, B, or H.

---

## Step B — Walk the per-class ripples

For each matching class, edit each file the table names, **before**
staging the commit. Open them in this order:

1. **Concept-level docs first** — CLAUDE.md, DoD.md, recipe docs. These
   establish what the change means.
2. **Templates next** — `project_config_*.md`. These reflect the change
   in per-project config.
3. **Surface docs last** — README hero + concern table, the deck.
4. **Generated artefacts dead last** — the PDF.

If you find yourself wanting to skip one because "it's a small change",
that's the failure mode — skip none. The grep-based drift hints
(`grep -niE "\b(six|seven|eight)\b"`, `git ls-files | xargs grep -l <old-name>`)
are your friend for catching every callsite.

---

## Step C — The deck dance (if any class touched the deck)

Always the same five steps, in this order:

1. **Edit the slide(s)** in `$BLUEPRINT_ROOT/docs/way-of-working.md`.
2. **Sweep prose mentions** of any count, name, or framing that changed.
   ```sh
   grep -niE "\bsix\b|\bseven\b|\beight\b" $BLUEPRINT_ROOT/docs/way-of-working.md $BLUEPRINT_ROOT/README.md
   ```
3. **Rebuild the PDF.**
   ```sh
   cd $BLUEPRINT_ROOT && scripts/build-deck.sh
   ```
4. **Visual check** the changed slides by rendering PNGs and reading
   them — overflow is real and not caught by the build.
   ```sh
   rm -rf /tmp/deck-check && mkdir /tmp/deck-check
   npx -y @marp-team/marp-cli@latest --allow-local-files --images png \
     $BLUEPRINT_ROOT/docs/way-of-working.md -o /tmp/deck-check/p.png
   # Read the slide(s) you changed.
   ```
5. **Stage the slide source + PDF** for the commit.

---

## Step D — Commit + push from `$BLUEPRINT_ROOT`

Single commit covering the `a2bp`'d file + every ripple touched + PDF.
From the originating project's session:

```sh
cd $BLUEPRINT_ROOT
git checkout .claude/settings.json  # revert any auto-allowlist pollution from the session
git status                           # confirm exactly the files you expected
git diff --stat                      # sanity check size
git add <every-file-touched>
git commit -m "$(cat <<'EOF'
<conventional commit subject>

<one-paragraph: what changed in the principle / recipe / gate>

<bulleted list of every ripple touched, citing what each one is>

Co-Authored-By: <agent-name> <noreply@anthropic.com>
EOF
)"
git push origin main
```

Commit message conventions:
- **Conventional Commits prefix**: `feat(<scope>):`, `fix(<scope>):`,
  `docs(<scope>):`, `chore(<scope>):`.
- **Scope**: the concern or layer touched (`security`, `docs`, `iac`, `agents`, `sync`).
- **Cite the originating project** if the change came from one ("derived from a real incident in storm2flow's <X> path; back-propagated here").
- **List every ripple** — the bulleted list of files-touched is what proves
  §6.4 was respected. Reviewers (you, later) read this list to verify.

---

## Step E — Verify drift closed

Back in the originating project's session:

```sh
cd <originating-project>
blueprint drift
```

Expected: `✓ All blueprint-managed files match the blueprint HEAD.`

If `blueprint drift` shows new files in the blueprint but not the
originating project (because the ripples we wrote in the blueprint are
now newer than the originating project's copies of them), run:

```sh
blueprint pull --yes
```

…then commit the pulled changes in the originating project as a
follow-up. This is the loop closing properly.

---

## What you don't ship

- An `a2bp` followed by a "next session will do the docs" plan. There is
  no next session for this — the doc-sync slip is now permanent until
  someone notices.
- A commit in the blueprint that contains only the `a2bp`'d file. Class A,
  B, C, D, E, F, G, and I all imply at least one ripple. Class H is the
  only one that legitimately ships alone.
- A PDF that wasn't rebuilt. The `.md` and `.pdf` must move together.
- A push to the blueprint without verifying drift in the originating
  project afterward. If the loop didn't close, the rule didn't hold.

---

## The recursive joke (running tally)

The §6.4 rule self-violated **four times** the week it was added; each
violation was a missing deck or recipe-doc update after a
back-propagation:

1. Cost concern added to CLAUDE.md; deck not updated for two days.
2. Six → seven count change; deck intro slide updated, four prose mentions missed.
3. Documentation concern itself added — including the slide that lists
   the first two violations.
4. Persona-team framing landed in `5655186`; deck slide 4 still said
   "two AIs (Codex + Claude Code)" until next wake.

This playbook exists to drop that number to zero. Every successful
`a2bp` that walks this playbook end-to-end is the rule working.
