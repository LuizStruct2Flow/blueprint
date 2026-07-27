# Bugs — pushed to main, awaiting founder acceptance

Fixed and pushed; awaiting the founder's explicit acceptance signal before they
move to `docs/done/BUGS.md`. Claude does NOT auto-promote to `done/`. If a
regression is found, the row moves back to `docs/doing/BUGS.md`.

See [README.md](README.md) for the lifecycle.

See [INDEX.md](INDEX.md) for everything sitting here, bugs and findings alike,
one row per work item.

| # | Bug | Severity | Status | Detail |
|---|---|---|---|---|
| BUG-002 | Blueprint contamination — a project-specific state dir (`~/.linkedin-watcher-agent`) hardcoded in a generic file, so a derived project's feed read another project's dispatcher logs | HIGH | Pushed. Rejected once on 2026-07-24 (the **Gemini** half still wrote a literal `$HOME/.{{PROJECT_NAME}}/`); root cause was A-09, now fixed and pushed. **Awaiting founder acceptance — accept together with A-09.** | [A-09-state-dir/](A-09-state-dir/) |

_BUG-001 and BUG-003 were accepted on 2026-07-24 and live in
[`../done/BUGS.md`](../done/BUGS.md); their review trail stays here under
[BUG-001-fork-bomb/](BUG-001-fork-bomb/) until the whole batch is closed.
Evidence: [ACCEPTANCE-JESKO-2026-07-24.md](ACCEPTANCE-JESKO-2026-07-24.md)._
