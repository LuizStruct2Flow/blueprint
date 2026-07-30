# A2BP Playbook — implementing a back-propagation request in one session

## Who this addresses

**The implementer — whoever makes the change in the blueprint.** Not the
requester.

`blueprint a2bp` files a **request**: a branch and a pull request against the
blueprint's remote. It writes into no working tree and cannot land anything.
Everything in this playbook happens on the other side of that request, when
someone decides to implement it.

That split is the point. The requester's job ends at "this improvement proved
itself downstream, here it is". Deciding which deck slides, recipe docs, README
rows and pitch-surface entries travel with the change requires the blueprint's
whole tree in front of you — so it belongs to the session that has it. A
requester cannot do it, and the implementer cannot skip it.

**Do every step here in one session.** Four self-violations of the §6.4 rule in
a single week all came from deferring the ripples to "a later session in the
blueprint". Later is where doc-sync goes to die.

---

## When to use this playbook

When you pick up an a2bp request. `blueprint prs` lists what is waiting.

The full loop, across two people or two sessions:

1. *(requester)* `blueprint drift` — confirm a clean delta to start from.
2. *(requester)* Edit the file in the originating project. The change lands
   there first — the "derived, not designed" rule (CLAUDE.md §"The blueprint is
   derived, not designed").
3. *(requester)* `blueprint a2bp <file...>` — file the request. Their job is
   now done.
4. *(implementer)* Read the request. Decide: merge as-is, adapt, or rewrite.
   **Merging as-is is legitimate *because you judged it trivial*** — that
   judgement is the step that must not be skipped, and nothing mechanical
   enforces it.
5. *(implementer)* **This playbook** — implement, close the doc-sync ripples,
   commit, push, verify.

There is no tool verb that performs step 4 or 5. No auto-merge, no bot. If the
same person is on both ends — which is normal — filing and integrating are still
two acts, separated by reading the diff in the blueprint's context. Landing a
request seconds after raising it is exactly what this rule exists to stop.

---

## Step A0 — What the requester's guard already did

The contamination guard runs on the **project** side, at `a2bp` time, before the
request is filed (A-07 — `scripts/lib/contamination.sh`). It does two things:

1. **Placeholder restoration, by positional alignment.** `a2bp`
   forward-substitutes the blueprint's own copy — reproducing exactly what
   `pull` handed you — and diffs it against your file. A line goes back to
   `{{PROJECT_NAME}}` / `{{PROJECT_NAME_UPPER}}` **only where the diff proves
   it unchanged**. Lines you actually edited pass through untouched.

   There is no general textual inverse of the substitution, and no
   content-based shortcut either. `pull` replaces an unambiguous token, but
   reversing would replace a bare word that also occurs in prose — for a
   project directory legitimately named `blueprint`, every occurrence of the
   word. Matching on line *content* fails the same way one level up: if the
   blueprint holds both a `{{PROJECT_NAME}}` line and a literal line that
   render alike, content matching rewrites both. Only position carries the
   provenance that substitution destroyed.

   Files that *implement* the substitution (`scripts/blueprint`,
   `scripts/new-project.sh`) are exempt — they carry the tokens as code.
2. **Contamination scan.** Host home paths, literal per-project state dirs,
   and any project name that survived step 1 **stop the request** and exit
   non-zero. A personal email is reported as a `NOTICE` and does not block.
   **Every staged line is scanned — there is no exemption**, not even for
   lines that were already upstream. An exemption list is the one place a
   wrong alignment could wave real contamination through, so it does not
   exist. The cost is that an upstream line which would itself trip a check
   blocks even when you did not touch it; use `a2bp-allow` on it. In practice
   this is rare — the host-path pattern scores zero hits across the whole
   managed tree.

**What the guard does and does not promise — read this before trusting the
diff.** It is not "contamination is impossible": the scan is heuristic,
`a2bp-allow` suppresses its own line, and emails are advisory only. What holds is
narrower and checkable — on the **default path** a recognized BLOCK class cannot
be filed, every suppression is **loud and auditable**, and staging **never
changes meaning under substitution** (asserted, not waivable).

**So it is a strong default, not a proof, and you are the one who decides.**
That is now literally true rather than a caution: the guard is advisory *with
respect to the blueprint*, because a person reads the request before anything
lands. There is no `--force` — it existed to waive the guard and copy anyway,
which only made sense when `a2bp` landed bytes directly. You are the override.
Review the diff on its merits.

This all exists because `a2bp` is how **BUG-002** (a project's own state dir
hardcoded into the generic feed) and **A-09** (every checkout colliding on one
shared state dir) got into the blueprint in the first place. The playbook used to
open at Step A and assume the bytes were fine — and back then, a2bp wrote
straight into the working tree, so nobody was going to catch it later.

### If the requester's a2bp was rejected

They fix the named lines — usually by writing `{{PROJECT_NAME}}` themselves on a
line they edited, since the guard refuses to guess which occurrences were meant
to be generic. If a hit is genuinely benign — a comment quoting a historical bad
path *as the incident record* — they mark that line:

```sh
# (BUG-002: this used to hardcode ~/.old-project)  a2bp-allow: incident record, not a live path
```

The justification text after `a2bp-allow:` is required; a bare marker does not
suppress. **When you see an `a2bp-allow` in a request, read it as a claim to
check, not a decision already made** — it is the only thing that can carry a
finding past the guard, so it is the line to look at first.

Note also that every staged line is scanned, including lines that were already
upstream. A project named after a common word therefore has to mark its own
generic prose. Those markers are the benign case, and the reason to read the
justification rather than count the markers.

The requester's own file is never modified — `a2bp` stages a transformed copy and
reads the original.

---

## Step A — Classify the change

Before doing the ripples, classify the change. Pick the row(s) that match the
files the request touches — the PR body lists them, and `blueprint prs` shows
which request is which:

| Class | What it is | Where to look for ripples |
|---|---|---|
| **A. Principle change** | New / changed `## X is a main concern` in CLAUDE.md | Deck intro slide concern count + that concern's slides; recipe doc; README hero concern table; CLAUDE.md §"docs/way-of-working.md is the canonical pitch surface" mirror list |
| **B. Recipe change** | Edit to `docs/OBSERVABILITY.md` / `SECURITY.md` / `INFRASTRUCTURE.md` / `DOCUMENTATION.md` | Deck recipes slide for that concern; possibly `project_config_overview.md` §"X stack" table if a new mechanism row was implied |
| **C. Gate change** | Edit to `docs/DoD.md` (§4, §6.x, §7.D) | Deck Quality slides if §3 or §4 changed; `project_config_dod.md` if a new table row was implied; cross-references in other DoD subsections |
| **D. Pre-push change** | Edit to `.githooks/pre-push` or `Brewfile` | DoD §4; CLAUDE.md §"Before Every Push"; README "What's in the blueprint" tree; `project_config_dod.md` §"Pre-push gate — project commands" table |
| **E. Sync layer change** | Edit to `scripts/blueprint`, `scripts/new-project.sh`, the `MANAGED_FILES` array | README §"The sync model"; CLAUDE.md §"Blueprint sync"; this playbook (if the calling pattern changed) |
| **F. Agent layer change** | Edit to `AGENTS.md`, `AGENT_ROSTER.example.md`, `scripts/agent-activity.sh`, `scripts/start-codex-signal-watch.sh`, `scripts/start-gemini-signal-watch.sh`, `scripts/team-kickoff.sh` | Deck "persona team — radio-over" slide; CLAUDE.md pitch-surface item #9; README hero paragraph if the framing changed |
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

## Step D — Land it, with the ripples, in one commit

You are working in the blueprint, so how the request's content gets in is your
call: merge the PR, cherry-pick it, or retype the change. **What must not happen
is the request landing and the ripples following later** — that is the §6.4
failure mode, and it is why this is one commit rather than two.

If you merge the PR, the ripples still need a commit of their own on top, in the
same session. If you implement by hand, one commit covers everything.

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
- **Cite the originating request** — the project it came from and the PR number
  ("requested by acme-flow in #42; derived from a real incident in its <X>
  path"). The request is the provenance; a commit that drops it makes the
  blueprint look designed rather than derived.
- **Say what you decided.** Merged as-is, adapted, or rewritten — and why. "Took
  the rule verbatim; the deck wording needed rework because the slide already
  said something narrower" is the sentence a future reader needs.
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
