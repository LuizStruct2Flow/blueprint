# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-017** | **The blueprint's only documented toolchain install path was a macOS-only `Brewfile`, which made a reduced pre-push gate the default outcome on every other OS.** Founder directive, 2026-09-09, citing the redcare blueprint where the same removal already happened (its `install-toolchain.sh` header records it as BUG-016). **Why this is a gate defect and not packaging taste:** the hook `pipe_skip`s a scanner it cannot find, so a machine that could not run `brew bundle` got a gate that printed PASSED having checked less — the repo's signature failure (BUG-004 a hook that never ran, A-22 a gate never armed, BUG-005 a suite covering nothing, BUG-035 a scanner aimed at absent languages). CI is `ubuntu-latest` throughout and never used the Brewfile, so the asymmetry was invisible from CI. The requirement is also already on the record: `scripts/wait-mic.sh:31` cites *"the founder then required the system be OS-agnostic or Linux-based"* as the reason an inotify watcher was rejected. **Delivered:** `Brewfile` deleted; `scripts/install-toolchain.sh` added and added to `MANAGED_FILES` — one tool list, per-OS mechanism (Homebrew on macOS, pinned release binaries into `~/.local/bin` with no sudo on Linux, `semgrep` via pipx), plus `check` and `--infra` modes and a `scripts/install-toolchain-project.sh` extension hook mirroring `.githooks/pre-push-project`. **Versions are pinned, unlike the redcare reference**, which resolves `latest` from the GitHub API at install time — `.github/workflows/security.yml` SHA-pins its actions and pins `OSV_SCANNER_VERSION`, and the installer holds that same posture so a bump is a reviewable diff. **Stated gap, deliberately not papered over:** the Linux path does NOT verify checksums, and the script's header says so rather than implying integrity it does not provide. Closing it needs a pinned SHA256 per tool per architecture. **Two records corrected as a consequence:** BUG-035's stated fix said "shellcheck in the `Brewfile`" and now names the installer, and `doing/HANDOVER.md` told a fresh checkout to run `brew bundle` (and named `trivy`, which neither the hook nor CI has ever invoked). | S2 | KEEP | Founder-directed 2026-09-09. Re-open if a third OS is targeted, or when the checksum gap is closed. |


## TASK-012 — how to run it, and why not a fork

**The method is a `MANAGED_FILES` profile, not a second repo.** The founder's
instinct was a thin blueprint with orchestration stripped out, as the spike's
vehicle. The separation is right and the fork is not: two blueprints is one fact
recorded twice, and it drifts — the same defect as `INDEX.md` (TASK-005), the
lifecycle triggers when the PR rule landed, and the forwarding notes removed on
2026-08-18. At repo scale it would be the worst instance yet, because nothing
would fail when they diverged.

`MANAGED_FILES` and `new-project.sh` already decide what reaches a derived
project, so "thin" is a profile in the one blueprint.

**THE DELIVERABLE IS FALSIFIABLE: bootstrap a project with orchestration OFF and
see whether the lifecycle, the gates and the sync still hold together alone.**
That is worth doing whatever ruflo turns out to be, because it answers the
question underneath this one — **is the differentiator separable at all?**

- If a no-orchestration bootstrap is coherent, the blueprint is a product with a
  plug-in orchestration socket, and ruflo is a candidate to fill it.
- If it is not, **the orchestration IS the product**, and adopting ruflo means
  adopting a different product rather than a component.

**Do this BEFORE evaluating ruflo.** It needs no third party, it cannot be
invalidated by what ruflo turns out to do, and stripping first would risk
deleting the half of the feed that works — the Codex half — on the strength of a
capability nobody has verified yet.

### The measurement, taken 2026-08-18

| | files | lines |
|---|---|---|
| orchestration — baton, watchers, feed, roster | 18 | 3,150 |
| core — DoD, gates, sync CLI, concern recipes | 18 | 5,892 |

Plus **9 of 37 test suites** are orchestration (3,463 lines), measured on a branch
missing `wait-mic` and `subagent-feed` — so the real figure is higher. Roughly
**40% of the repo**, and effectively all of 2026-08-18.

That number is the argument for asking the question, not for any particular
answer to it.

