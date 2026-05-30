# Codex Wake-Up Rules

At the start of every Codex session or after any user "wake" prompt in this
repository, read the current Markdown instructions before doing substantive
work.

Minimum wake-up read:

- `AGENT_SIGNAL.md` to confirm the current holder, state, and handoff task.
- `CLAUDE.md` for the shared project rules and delivery process.
- `docs/config/*.md` for stable product, acceptance, and findings context.
- `docs/doing/*.md` for active bugs, backlog items, and plans.
- `docs/waiting-acceptance/*.md` for pushed work awaiting founder acceptance.

After reading `AGENT_SIGNAL.md`, follow its mic protocol exactly. If the signal
is available to Codex, claim it before substantive edits. If another actor is
active, stop and report the holder unless the founder explicitly interrupts.

## Codex Handoff Watcher

When running a long-lived local Codex session for this repository, start the
signal watcher so `OVER_TO_CODEX` handoffs wake Codex without the founder
bridging manually:

```bash
CODEX_WAKE_COMMAND='codex --cwd {{REPO_PATH}} wake' \
  scripts/codex-signal-watch.sh
```

Equivalent convenience wrapper:

```bash
scripts/start-codex-signal-watch.sh
```
