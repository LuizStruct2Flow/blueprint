# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-086** | **a2bp request [PR #83](https://github.com/LuizStruct2Flow/blueprint/pull/83) (linkedin-watcher-agent, its BUG-039): a derived project may own a test runner at the `tests/` root.** DoD §2 counts a derived project's regression test only at the top level of `tests/`, but `tests/manifest` #1 refuses any runner there, so a downstream fix could satisfy §2 or #1, never both. The request narrows #1 to the blueprint (`.blueprint-root`) and passes downstream with a message naming the file. Implemented against current `main`, not merged as-is (base `23b8ffc` is old). | S3 | KEEP | Founder pointed at the open a2bp PRs 2026-10-01. **Done when** the request's case is on `main`, red before the change and green after, and PR #83 is closed with a pointer to the commit. |
| **TASK-087** | **a2bp request [PR #84](https://github.com/LuizStruct2Flow/blueprint/pull/84) (linkedin-watcher-agent, its BUG-040): the suites and gate break on macOS.** Four Mac failures: `run-ts-suites.sh` unset `TMPDIR` where `/dev/shm` is absent (so `"$TMPDIR/x"` became `/x`) and set it in the caller's shell; a bare `case` pattern inside `$( … )` is a syntax error under macOS bash 3.2; the BUG-146 process dump passed Linux-only `ps` keywords; `touch -d @0` is GNU-only. Implemented against current `main`, not merged as-is (base `b54aa32` is old, and `run-ts-suites.sh` has changed since). | S2 | KEEP | Founder pointed at the open a2bp PRs 2026-10-01. **Done when** each of the four fixes is on `main` with its test, the Linux behaviour is unchanged, and PR #84 is closed with a pointer to the commits. **Known limit (Andreas's review, 2026-10-01):** where `/dev/shm` is missing AND the cache-home fallback is refused (marker above `$HOME`, unwritable cache home), the child still runs with `TMPDIR` unset, so a `"$TMPDIR/x"` path can again resolve to `/x`; the run prints a notice. No host has hit it. **Re-open if** one does — the fix is to fail closed there instead of unsetting. |
