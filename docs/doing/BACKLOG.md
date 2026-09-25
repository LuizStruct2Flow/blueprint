# Backlog rows promoted into active work

Rows pulled from [`../backlog/BACKLOG.md`](../backlog/BACKLOG.md) and being
implemented now. They travel on to `waiting-acceptance/` when the work lands,
and their artefacts (plans, reviews) travel with them.

**This file did not exist until the first promotion** — see
[README.md](README.md). Its absence means nothing has been promoted; it is not
a missing file.

| # | Item | Sev | Category | Re-open trigger / next-step gate |
|---|---|---|---|---|
| **TASK-081** | **Port `scripts/blueprint`, the sync CLI, whole to TypeScript, so BUG-152 can land.** Founder decision 2026-09-24, asked directly with the cost stated: *"Port scripts/blueprint now."* BUG-152's fix changes `scripts/lib/gate.sh`, which TASK-067 makes a whole-file port to `scripts/lib/gate.mts` behind a sourced adapter. `scripts/blueprint` sources `gate.sh`, and its `_bp_cli_libs` bundles a single-file `pull scripts/blueprint` with the libs it names by `NAME.sh` only. After the gate.sh port that pull would bring the adapter without `gate.mts`, and a derived project's `drift` would die (`tests/managed-references` #3). Teaching the CLI the new dependency is a change to `scripts/blueprint`, so the whole file (2,257 lines) is ported first, exactly the case CLAUDE.md §"Shell to TypeScript" names. **Method:** the TASK-067 port method ([`../done/PLAN-TASK-067-shell-to-typescript.md`](../done/PLAN-TASK-067-shell-to-typescript.md) §"The port method"): a behaviour-identical port behind the exact two-line exec shim, proven by the existing suites, a byte-for-byte differential against the old shell and mutants the suites catch; then the `_bp_cli_libs` change. **Four-eyes:** a Codex review before push; this is the one script every derived project runs. **Design:** [PLAN-TASK-081-blueprint-port.md](PLAN-TASK-081-blueprint-port.md). | S2 | KEEP | **Done when** `scripts/blueprint` is the two-line shim, the differential is identical apart from the plan's named normalisations, a single-file `pull scripts/blueprint` run by the PORTED CLI brings every lib and `.mts` it needs, and the pre-port CLI's single-file pull is announced as unsupported. Founder decision 2026-09-24, *"Accept, announce it."*: a pre-port CLI that pulls `scripts/blueprint` alone gets the shim without `blueprint.mts` and fails loudly until a full pull; the port commit body, the release announcement and the ported `drift` say to update with a full `blueprint pull` (plan §7; the drift line is plan §9 E). **Re-open if** a derived project's `blueprint pull` or `drift` behaves differently from before the port, other than that announced case. |

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

| **TASK-083** | **Every provider keeps temporary files in `.scratch/`, by its own enforcement, not by reading a rule.** Founder, 2026-09-25: *"how can we translate these rules like /tmp for the other providers?"* TASK-064 put agent workspaces in `.scratch/`, and on 2026-09-24/25 most agents broke it anyway; `/tmp` filled with their working copies. `318e9ae` made Claude Code refuse it (`.claude/settings.json` deny rules), which binds Claude only. **Measured per provider on 2026-09-25:** Codex 0.154 has OS-level sandbox options `sandbox_workspace_write.exclude_slash_tmp` and `exclude_tmpdir_env_var` (found in its binary, unused by our launcher); Gemini CLI has a policy engine (`--policy`) and `--sandbox`; Kimi 2.0 shows no path-deny or sandbox option in `--help`. **Also ours:** `scripts/start-codex-signal-watch.sh:213` itself writes `bp-codex-raw.*` into `/tmp`. **What it builds:** (1) every launcher, and `scripts/junior-dispatch.mts`, sets `TMPDIR` to `<repo>/.scratch/tmp` for the agent it runs, so `mktemp`, `os.tmpdir()` and most tools land in `.scratch/` for every provider, Kimi included; (2) Codex runs with both exclude options; (3) Gemini gets a policy file that denies its file-write tools on any `file_path` not starting with the workspace root, and its shell tool on a command naming `/tmp` or `$TMPDIR` — a **partial** mitigation: Gemini's policy engine has no path condition, so the rule is a regex on the tool argument, not a resolved-path boundary (a symlink or `..` path can pass it); (4) the Codex launcher stops writing to `/tmp`. **Measured 2026-09-25 under the new launchers:** Codex — `TMPDIR` and `os.tmpdir()` under `.scratch/tmp`, `touch /tmp/…` refused (read-only file system); Kimi — `TMPDIR` and `os.tmpdir()` under `.scratch/tmp`, a direct `/tmp` write still succeeds (Kimi has no deny option: its limit, stated not solved); Gemini — out of daily quota, but its CLI wrote its error report into `.scratch/tmp`, so `TMPDIR` reaches it; the policy's refusal is proven by `tests/scratch-tmpdir-dispatch` only. The first Codex review saw `TMPDIR` unset because the watcher had been started before the port — a watcher runs the launcher it started with, so restart the watchers after changing one. The launchers are legacy shell, so each one touched is ported whole first (CLAUDE.md §"Shell to TypeScript"). **Landed 2026-09-25, released at 88840f9 (CI green).** **Reopened 2026-09-25:** the `TMPDIR` the launchers now give every dispatched agent (`<repo>/.scratch/tmp`) makes the test suites refuse to run. The harness refuses a `TMPDIR` with a `.git` above it (BUG-110), so a dispatched agent's plain `npm --prefix tests test` fails every scenario ("Project marker above every scenario workspace"). Seen in Jesko's BUG-154 review and measured by a probe on Codex: as-is FAIL 17/17 on `signal-set`; `TMPDIR` unset FAIL before collection (vite's `os.tmpdir()` is the read-only `/tmp`, and the harness's private base under `~/.cache` is read-only in the sandbox); `TMPDIR=/dev/shm` PASS 17/17. A dispatched agent that must know a workaround is not the fix. **Fixed 2026-09-25 by Philipp (Claude), reviewed by Elias (Codex) over two rounds:** `scripts/run-ts-suites.sh`'s `ts_scrubbed`, the one entry point `npm test` and CI share, runs the suites with `TMPDIR` pointed at a fresh `/dev/shm` dir when `TMPDIR` sits inside a git tree (unset instead where `/dev/shm` is absent or unwritable, e.g. macOS), prints one stderr line saying so, and removes the dir on every exit including a signal; the trap work runs in its own subshell so the caller's traps are untouched (`0a2df77`, `3d81490`, `93027bb`, `a8c4918`; `tests/ts-bridge` #13-#13d). BUG-110 is not loosened: an explicit `TMPDIR` is still refused by the harness itself. **Known limit, not this item's:** inside the Codex sandbox `tests/ts-bridge` #5 cannot start a binary copied into `/dev/shm` (it passes on the host under the same redirect); Codex was already running suites with `TMPDIR=/dev/shm` by hand before this item. | S2 | KEEP | **What to test:** Dispatch a probe to each provider: TMPDIR and os.tmpdir() land under .scratch/tmp, and on Codex a write to /tmp is refused (read-only file system). Kimi can still write /tmp directly (it has no deny option, stated as its limit). Gemini's policy is a partial regex mitigation. tests/scratch-tmpdir-dispatch covers all three with stub CLIs. **Done when** a dispatch on each provider that runs `mktemp` and `node -e "os.tmpdir()"` lands under `.scratch/tmp`, Codex refuses a write to `/tmp`, and no launcher writes `/tmp` itself; each proven by a test with a stub CLI plus one real dispatch per provider. **Re-open if** an agent leaves a file in `/tmp`. |
