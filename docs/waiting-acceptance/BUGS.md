# Bugs — pushed to main, awaiting founder acceptance

Fixed and pushed; awaiting the founder's explicit acceptance signal before they
move to `docs/done/BUGS.md`. Claude does NOT auto-promote to `done/`. If a
regression is found, the row moves back to `docs/doing/BUGS.md`.

See [README.md](README.md) for the lifecycle.

**"What to test" is a column here, not a separate index.** There used to be an
`INDEX.md` holding the same membership plus per-item test instructions. It
drifted — 5 rows listed against 14 real ones, so nine fixes were invisible to
the only person who can accept them — and the first repair was a test to hold
the two files in step. That is the wrong repair: two records of one fact drift
by construction, and a guard only tells you afterwards. One record cannot
disagree with itself.

**Put the acceptance command in the CHAT, not only in this column.** BUG-022
shipped with `scripts/accept-bug-022.sh` and a pointer in its row, and the
founder still had no idea how to accept it — because this column lives in a file
he would have to open first. Klaus and Alexis both said acceptance instructions
belong where the decision happens.

| # | Bug | Severity | Status | What to test | Detail |
|---|---|---|---|---|---|
| **BUG-121** | **Any Codex sandbox on the machine can turn the whole push gate red, because scenario workspaces default to `/tmp`, and since TASK-028 the harness refuses every scenario while a `/tmp/.git` exists.** Observed 2026-09-15 on a docs-only push (`b2e3b49`, 52 of 55 suites red, each failing in ~0 ms) and reproduced by re-running the gate's own vitest batch: `/tmp/.git` was absent at the start, appeared mid-run (commit-msg-gate refused 12 cases with "Project marker above every scenario workspace: /tmp/.git"), and was gone again at the end. **No Codex ran in this checkout.** Running elsewhere on the same machine: storm2flow's `scripts/codex-signal-watch.sh`, which dispatches Codex runs on its own baton flips, and VS Code Codex app-server sessions. BUG-110 attributed the empty `/tmp/.git` to Codex's workspace-write sandbox, so the practical rule "do not push while a Codex review is running" cannot be kept from this checkout: the source is any project on the machine. **The blast radius grew with TASK-028:** before its preflight a stray marker turned `state-root` #A6 red; now it refuses every scenario, which is the correct refusal inside a design that still puts fixtures under a shared `/tmp`. **Workaround:** run the gate with `TMPDIR` pointed at a private directory with no marker above it (`/home/luiz/.cache/bp-harness-tmp`), which is what the refusal message itself says and what every manual run on 2026-09-15 used. | S2 | **FIXED — landed `a528fb8`, `87407c1` and `dbed972`, pushed 2026-09-15** | While a Codex run is active in ANY project on this machine (it leaves an empty `/tmp/.git`), run `git push` or `env -u GIT_EDITOR -u GIT_PAGER -u AGENT_PERSONA tests/node_modules/.bin/vitest run --root "$PWD/tests" harness state-root` WITHOUT setting TMPDIR — scenarios must not be refused; they now live under `~/.cache/bp-harness-tmp`, and `stat -c %a ~/.cache/bp-harness-tmp` must print `700` afterwards even if you `chmod 775` it first. Setting `TMPDIR` to a directory under a stray `.git` must still be refused with the marker named. With TMPDIR unset, pointing `XDG_CACHE_HOME` at a directory whose parent is `chmod 777` (no sticky bit) must be refused, naming that parent. | Found 2026-09-15 by Eto (Orchestrator). **Promoted 2026-09-15**; Philipp (Infrastructure-1) is fixing it, reproducer first. The shape agreed at promotion: the gate and CI should not depend on what other processes do to the shared `/tmp`, e.g. scenario workspaces default to a private base (under `XDG_CACHE_HOME` or `~/.cache`) unless `TMPDIR` is set deliberately, with the preflight kept as the guard for a marker above THAT base. **Review fix (Jesko, S2):** `mkdir` with mode 0700 sets nothing on a base that already exists, and the real default base here was 0775, so "private" held only for a base the harness created. The default base is now checked with `lstat`: an existing one with a looser mode is set to 0700, and a symlink, a non-directory or a base owned by another user is refused with a message naming the path. An explicit `TMPDIR` is never changed, and the BUG-110 preflight stays the guard there. **Re-check fix (Jesko, S2):** `chmod`, `realpath` and `mkdtemp` look the path up again after `lstat`, so anyone who could replace entries in a directory above the base could swap it for a symlink in between. Before the base is trusted, every directory from the realpath of its parent up to `/` must be owned by the current user or root, and must not be writable by group or others unless it has the sticky bit; otherwise the harness refuses, naming that directory. Every later step uses that resolved path. **Gate fix:** that check blocked the push, because bootstrap-gate runs a fresh project's harness with TMPDIR set to a scenario's `tmp`, and the harness created that directory with the umask, 0775 under 0002. Every directory a scenario's workspace creates is now 0700 whatever the umask. |


The 2026-07-29 QA pass dispositioned the earlier bugs: BUG-001, BUG-002 and
BUG-003 are all ACCEPTED and live in [`../done/BUGS.md`](../done/BUGS.md) with
their review trails. The full disposition, including the one rejection (A-22, reopened as
**BUG-004** and since accepted), is in
[`../done/ACCEPTANCE-JESKO-2026-07-29.md`](../done/ACCEPTANCE-JESKO-2026-07-29.md).
