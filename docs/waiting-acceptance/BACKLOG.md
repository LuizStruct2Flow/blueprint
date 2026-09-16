# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-050** | **The seeded `sonar-project.properties` still recognises tests as `*.test.ts`, so SonarQube in a new project counts its specs as source.** TASK-047 made every test `*.spec.ts` / `*.spec.tsx` but missed this template: `sonar.test.inclusions` and `sonar.exclusions` still name `*.test.ts`, `*.snap.test.ts` and `*.integration.test.ts`. Found 2026-09-16 while adding the blueprint itself to the local SonarQube. **Do:** name `**/*.spec.ts` and `**/*.spec.tsx` in both keys. Existing projects own their copy (template file, not pulled) and edit it themselves. | S3 | Tooling | **Pushed 2026-09-16** (`ed46dd3`, CI green on `3940d57`). Raised 2026-09-16 by Eto. **Re-open if** a seeded Sonar config names a test pattern the runner does not run. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.


*(Empty.)*
