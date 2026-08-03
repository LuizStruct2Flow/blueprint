# `templates/` — the seed source for a new project

Everything here is copied into a project by `scripts/new-project.sh` at
bootstrap, then placeholder-substituted. **Nothing here is this repo's own
configuration.**

## Why this directory exists (BUG-009)

`project_config_*.md` at the repo root used to be both things at once: the
template every new project was seeded with, *and* this repo's live config.
Bootstrap ships `git archive HEAD`, so whatever the blueprint wrote about
itself went out to every new project.

That is not hypothetical. A wake-time `Monitor` row — including a rationale
describing an incident that happened in *this* stream — was seeded verbatim into
`linkedin-watcher-agent`. The mitigation at the time was to empty the table and
add a warning; the *structure* was left in place, so the next concrete thing
written there would have done it again. It is the same defect as BUG-002
(a hardcoded state dir), BUG-006 (one project's env namespace) and BUG-010 (a
fleet's persona names): **a specific thing baked into a file that travels.**

## The rule

- **Files here are TEMPLATES.** Placeholders, structure, guidance. No paths, no
  hostnames, no incident records, no monitor rows — nothing true of exactly one
  project.
- **The root `project_config_*.md` are THIS REPO'S OWN.** They are
  `export-ignore`d, so bootstrap cannot ship them, and they are free to contain
  blueprint-specific detail.
- Editing one does **not** edit the other. If a change belongs to every project,
  make it here; if it is about this repo, make it at the root. Ask which, every
  time — that question is the whole point of the split.

`tests/template-source/` enforces both halves.
