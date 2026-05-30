# PUBLISHING — runbook for first public push

> **This file is gitignored** (under `docs/`). It exists only on the
> founder's machine. Step-by-step process for taking a struct2flow
> project from local development to a public GitHub repository without
> leaking AI configurations or project-specific personal data.
>
> Read this end-to-end before the first public push. Re-read sections
> 4 and 6 before every subsequent push.

## 0. What's at stake

Three categories of leak we are preventing:

1. **Project-specific personal data**: any project-specific personal
   content (positioning files, watchlists, user data, real fixtures,
   captured production logs, etc. — replace with whatever your project
   has).
2. **AI configurations**: the founder's Claude Code permission
   allowlist, the struct2flow methodology files, the multi-AI review
   chain (`AGENT_SIGNAL.md`, `docs/doing/SLICE-*/CODEX_REVIEW.md`).
3. **Operational state**: ongoing plan decisions, handover docs, codex
   run logs.

`.gitignore` excludes all of the above by default (blueprint privacy
block). This runbook is the **process** that keeps it true over time.

## 1. Pre-flight check — what does the worktree state look like?

From the project root:

```bash
# 1a. Working tree + index state
git status --ignored
```

`Ignored files:` should include `CLAUDE.md`, `AGENTS.md`,
`AGENT_SIGNAL.md`, the four private docs files only —
`docs/DoD.md`, `docs/PUBLISHING.md`, `docs/doing/HANDOVER.md`, and
`docs/doing/*/CODEX_REVIEW.md` — plus `project_config_*.md`,
`scripts/codex-signal-watch.sh`, `scripts/start-codex-signal-watch.sh`,
`scripts/new-project.sh`, `.claude/`, `.blueprint-source`, plus any
project-specific privacy paths you've added in the project's
`.gitignore` extension block. The rest of `docs/` (lifecycle
artifacts) is PUBLIC and should NOT appear under `Ignored files`.

```bash
# 1b. Index state — what would actually publish if you `git push`?
# .gitignore does NOT untrack already-tracked files. This is the
# critical check: a tracked file ignores nothing.
git ls-files | grep -E '^(CLAUDE\.md|AGENTS\.md|AGENT_SIGNAL\.md|docs/(DoD\.md|PUBLISHING\.md|doing/HANDOVER\.md|.+/CODEX_REVIEW\.md)|project_config_.*\.md|scripts/(codex-signal-watch|start-codex-signal-watch|new-project)\.sh|\.claude/.*|\.blueprint-source)$' && echo "PRIVATE FILES STILL TRACKED — DO NOT PUSH" || echo "index clean"
```

Expected output: `index clean`.

If output is `PRIVATE FILES STILL TRACKED`, go to §3 and pick a path
(fresh repo with allowlist, or in-place untrack). Either resolves it.

**When you add a new kind of private file, extend this grep pattern
AND §3b's untrack command in the same commit.** Drift between the two
is a recurring failure mode. Extend the project's PUBLISHING.md
accordingly — this blueprint template covers only the framework
files; add your project-specific private paths (real-data fixtures,
secrets, watchlists, etc.) on top.

## 2. Confirm nothing personal lives in tracked content

```bash
# Search every tracked file for personal markers — REPLACE the alternation
# below with names/companies/emails that identify the founder or the
# project's customers.
git ls-files | xargs grep -l -E '<FoundedName>|<Employer1>|<Employer2>|<personal@example.com>' 2>/dev/null || echo "clean"
```

Expected output: `clean` — or a path that needs fixing.

(The `LICENSE` copyright line is the one allowed exception. Adjust the
grep if needed.)

## 3. Decide how to actually publish

The current local repo's git history includes the struct2flow bootstrap
commit (`chore(bootstrap)`). That commit **tracks** the methodology
files (`CLAUDE.md`, `AGENTS.md`, `AGENT_SIGNAL.md`, `docs/DoD.md`,
`project_config_*.md`, `scripts/codex-signal-watch.sh`,
`scripts/start-codex-signal-watch.sh`, `scripts/new-project.sh`,
`.claude/settings.json`). `.gitignore` does NOT untrack them — it only
prevents NEW additions. They will publish on a normal `git push` unless
we explicitly close the gap.

Three options, in decreasing safety:

### 3a. Fresh public repo via explicit allowlist (RECOMMENDED)

Create a brand-new repo populated by an **explicit PUBLIC_PATHS list**.
Never inherits the bootstrap commit; pulls only the files you name.

```bash
# Explicit allowlist of paths that ARE public.
# This is the contract — edit this list to match your project's actual
# public-tracked tree.
PUBLIC_PATHS=(
  README.md
  LICENSE
  .gitignore
  .env.example
  # — common project root files (adapt to your stack) —
  # package.json
  # package-lock.json
  # tsconfig.json
  # vitest.config.ts
  # eslint.config.js
  # — code + tests —
  # src/
  # tests/
  # — templates for any private configs your project uses —
  # config/<name>.example.{md,json}
  # — committed synthetic fixtures (NEVER commit real personal data) —
  # data/fixtures/<name>.example.jsonl
  # data/fixtures/README.md
  # — pre-push gate —
  # .githooks/pre-push
  # — docs/ — lifecycle artifacts are public (BACKLOG.md, BUGS.md,
  # FEATURES.md, ACCEPTANCE_TESTS.md, SLICE-*/PLAN.md,
  # waiting-acceptance/*, done/*, requirements/*, mocks/* if you keep them).
  # The post-copy scrub below removes the four private files inside docs/.
  docs/
)

SRC="$(git rev-parse --show-toplevel)"
DEST=~/sources/<your-project-name>-public

mkdir -p "$DEST"
cd "$DEST"
git init -b main

# Copy ONLY the allowlisted paths from the source working tree.
for p in "${PUBLIC_PATHS[@]}"; do
  if [ -e "$SRC/$p" ]; then
    mkdir -p "$(dirname "$p")"
    cp -R "$SRC/$p" "$p"
  fi
done

# Scrub private files that the docs/ copy brought along.
rm -f docs/DoD.md docs/PUBLISHING.md docs/doing/HANDOVER.md
find docs -name 'CODEX_REVIEW.md' -delete 2>/dev/null

# Verify nothing private slipped in. This is the §1b check, repeated
# on the filesystem rather than the git index.
find . -type f \( -name 'CLAUDE.md' -o -name 'AGENTS.md' -o -name 'AGENT_SIGNAL.md' \
  -o -name 'DoD.md' -o -name 'PUBLISHING.md' -o -name 'HANDOVER.md' -o -name 'CODEX_REVIEW.md' \
  -o -name 'project_config_*.md' \
  -o -name 'codex-signal-watch.sh' -o -name 'start-codex-signal-watch.sh' \
  -o -name 'new-project.sh' -o -path './.claude/*' \
  -o -name '.blueprint-source' \) | head -20

# That find should return NOTHING. If it lists anything — stop, the
# allowlist let something private through, debug before continuing.

# Manually inspect the tree:
ls -A
git status

# First commit:
git add -A
git commit -m "Initial public release"

# Push to a NEW public GitHub repo (create the empty repo on GitHub
# first, then add it as the remote here):
git remote add origin git@github.com:<your-github-username>/<your-project>.git
git push -u origin main
```

The private dev repo at `$SRC` stays untouched and remains the
daily-development home. After the initial public push, ongoing public
updates are done by repeating the allowlist copy + commit + push in
`$DEST`.

### 3b. In-place untrack with `git rm --cached`

Drop private files from the index of the existing repo, keep them on
disk for local agent use. The bootstrap commit history still shows the
files **existed at bootstrap as templates**, but going forward they are
not in the index and not in subsequent commits.

The command list MUST match the §1b preflight pattern exactly,
otherwise the verification will print `index clean` while still leaking
something. If you add a new private file kind, update both lists in
the same commit.

```bash
cd "$(git rev-parse --show-toplevel)"

# Untrack ONLY the private files (keeps them on disk).
# docs/ lifecycle artifacts stay tracked and public.
git rm --cached \
  CLAUDE.md AGENTS.md AGENT_SIGNAL.md \
  docs/DoD.md docs/PUBLISHING.md docs/doing/HANDOVER.md \
  $(git ls-files 'docs/**/CODEX_REVIEW.md') \
  project_config_overview.md project_config_paths.md project_config_dod.md \
  scripts/codex-signal-watch.sh scripts/start-codex-signal-watch.sh scripts/new-project.sh \
  $(git ls-files '.claude/**' 2>/dev/null) \
  .blueprint-source

# Confirm index is now clean — same pattern as §1b:
git ls-files | grep -E '^(CLAUDE\.md|AGENTS\.md|AGENT_SIGNAL\.md|docs/(DoD\.md|PUBLISHING\.md|doing/HANDOVER\.md|.+/CODEX_REVIEW\.md)|project_config_.*\.md|scripts/(codex-signal-watch|start-codex-signal-watch|new-project)\.sh|\.claude/.*|\.blueprint-source)$' && echo "STILL TRACKED" || echo "index clean"

# Commit "private: untrack methodology" then push.
```

Caveat: prior history still has the bootstrap commit. Anyone fetching
your public repo can `git log --all` and see those file paths. Safer
to scrub history with `git filter-repo` (see §7) if that matters, or
just use §3a from the start.

### 3c. Continue with current history (NOT RECOMMENDED)

Push the current repo to the public remote with full history. Leaks the
bootstrap commit's methodology file list. Only consider this if you
have personally read every commit in `git log -p` and confirmed all
historical content is acceptable. For a fresh-bootstrap project with
template-only methodology content, this might be acceptable — but the
stated requirement is "without leaking AI configurations", which the
path names themselves are.

For the stated requirement, **option 3a is the right call**.

## 4. Before every push to the public remote

```bash
git status --ignored
git diff --cached
git diff
git log origin/main..HEAD
```

Look at every changed file in `git diff`. If any line mentions:

- Personal names (yours, customers, employers)
- Customer URLs, customer-data slugs, real-fixture content
- API keys, tokens, cookies (`.env` is gitignored — this is defense in
  depth)
- Struct2flow methodology hints (`OVER_TO_CODEX`, `radio over`,
  `CODEX_REVIEW`, `HANDOVER.md`)

**stop and remove it** before pushing.

## 5. Periodic audit (monthly or after major changes)

```bash
# 1. Scan tracked content for personal markers (same as step 2).
# 2. Re-read .gitignore — does it still cover everything personal?
# 3. Check the public remote in a browser; clone it fresh; verify the
#    fresh clone has no personal content.
git clone <public-remote-url> /tmp/pubclone-check
ls -la /tmp/pubclone-check
# Should NOT see: CLAUDE.md, AGENT_SIGNAL.md, docs/doing/HANDOVER.md,
# docs/DoD.md, project_config_*.md, .claude/, .blueprint-source.
# SHOULD see: src/, tests/, README.md, package.json (or your stack's
# equivalent), config/<name>.example.* files.
```

## 6. Adding new private content

When you add a new kind of personal file (a new config, a new fixture
type, a new methodology doc), update `.gitignore` **in the same commit**
that adds the file. Never let a private file exist tracked even for one
commit — git history is forever.

The structured way:

1. Add the file path to `.gitignore` first.
2. `git status --ignored` to confirm the file is recognized as ignored.
3. Create / edit the file.
4. `git status` — should show no changes to that file.

## 7. If you accidentally commit personal content

```bash
# If only in working tree — easy:
git rm --cached <path>
echo '<path>' >> .gitignore
git commit -m "private: gitignore <path>"

# If already pushed to the public remote — hard:
# Use git-filter-repo to scrub history. NOT git filter-branch.
git filter-repo --path <path> --invert-paths
git push --force-with-lease public main
# Force-push is destructive. Coordinate with anyone else who has cloned
# the public repo. Consider just deleting the public repo and re-pushing
# from a fresh option-3a tree if the leak is bad enough.
```

## 8. Final sanity check before declaring publish-ready

```bash
# From the project root:
ls -A     # should NOT show: CLAUDE.md, AGENTS.md, AGENT_SIGNAL.md, project_config_*.md, .blueprint-source
cat README.md | grep -i 'struct2flow\|codex\|radio over'  # should return nothing
```

If all checks pass, the repo is publish-ready.
