# Landed rows awaiting founder acceptance

Rows whose work is **on `main`** and which are waiting for the founder to accept
("done") or reject ("reopen"). See [README.md](README.md) for the triggers.

**This file appears when the first promoted row lands** — its absence means none
have, not that it is missing.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-067** | **Shell to TypeScript, organically.** Founder, 2026-09-21: new code is TypeScript, and a shell file that must change is migrated first, whole file. The plan was reviewed by all three providers, and the founder settled the two splits: Node's built-in type stripping, and whole-file granularity. [Plan](PLAN-TASK-067-shell-to-typescript.md). **Landed:** `scripts/tsconfig.json` (`.mts`, `node:` imports only), `typecheck` covers `scripts/`, `engines.node >=22.18.0` (measured: 22.17.1 fails, 22.18.0 strips), a type-stripping probe in `install-toolchain.sh`, and `scripts/shell-inventory.json` + `shell-inventory-check.mts`, judged against a BASE the push cannot edit, in the gate and CI. The rule is in `CLAUDE.md`, with a deck slide. Authored by Philipp (Claude, after Kimi ran out of quota), BLOCKED and then PASSED by Elias (Codex). **LANDED**, CI green on `42d978c` (2026-09-21). **Not done, by design:** local semgrep still lacks `p/typescript`/`p/javascript`, because that command lives in `.githooks/pre-push`, a legacy file. CI already runs both, so it arrives when `pre-push` is first migrated. | S2 | **What to test:** (1) add a new `scripts/x.sh` and commit it: the push stops at `shell-inventory · TASK-067`. (2) Change one byte of any legacy script and update its sha in `shell-inventory.json` in the same commit: still refused. (3) `node scripts/shell-inventory-check.mts` runs with no flag. (4) `bash scripts/install-toolchain.sh check` reports type stripping as a capability. | **Re-open if** new shell code lands, a changed shell file ships unmigrated outside the exception list, or the inventory can be widened by the push it judges. |
| **TASK-066** | **A Codex dispatch can commit its own work.** `scripts/start-codex-signal-watch.sh` passes `codex exec --add-dir <git common dir>`, so `.git` is writable while the sandbox stays `workspace-write`; a linked worktree grants its common dir, not its `.git` pointer file. Authored by Elias (Codex), reviewed APPROVE by Thomas (Kimi). **LANDED**, CI green on `6196bdd` (2026-09-21). | S3 | **What to test:** dispatch any Codex persona on a small item and check `git log`: the commit is its own, not the Orchestrator's. **Proven live 2026-09-21:** Elias (Codex) committed `8a863bd` himself, through `commit-msg`, from a dispatch. That commit was later rejected on quality (BUG-144) and never pushed, but the capability it proves is independent of what it contained. | **Re-open if** a Codex dispatch cannot commit, or the sandbox is widened beyond the git dir. |

**Each row's "what to test" travels WITH it** — into `done/` on acceptance, back
into `doing/` on a rejection. It is not dropped at the boundary: a rejected item
needs its test instructions more than a waiting one does, and an accepted item's
instructions are the record of what "accepted" actually meant. An empty table
here is the good state, not a missing section.
