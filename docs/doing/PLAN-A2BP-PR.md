# PLAN — `a2bp` files a feature request

**Status:** APPROVED for implementation. Four-eyes consensus reached
2026-07-29.

**Read this document alone.** It is the whole plan. It carries no version
history and refers to no earlier draft — the design rationale, the sixteen
superseded drafts and the sixteen review rounds live in
[`PLAN-A2BP-PR-REVIEW.md`](PLAN-A2BP-PR-REVIEW.md),
[`PLAN-A2BP-INBOX.md`](PLAN-A2BP-INBOX.md) and
[`PLAN-A2BP-INBOX-REVIEW.md`](PLAN-A2BP-INBOX-REVIEW.md), and in git history.
Go there for *why*; stay here for *what*.

---

## 1. The problem

`blueprint a2bp` copies a derived project's version of a managed file directly
into the blueprint's working tree. It is the only write path from a project into
the blueprint, and it is how BUG-002 and A-09 got in.

A-07 made that write *guarded* — placeholders restored, every staged line
scanned, staging round-trip verified. It did not make it *gated*: the write
still happens without anyone deciding it should, and review depends on the
operator noticing a dirty working tree and reading `git diff` before committing.

## 2. The change

A back-propagation becomes a **feature request**: a pull request against the
blueprint that says "this improvement proved itself downstream". The blueprint
owner reads it and **implements it upstream** — merging as-is when it is
trivially right, adapting it, or rewriting it.

```
derived project ──a2bp──▶ PR against the blueprint = a REQUEST
                                    │
                   blueprint owner reads it, and IMPLEMENTS upstream
                        (merge if trivially right, adapt, or rewrite)
```

`a2bp` writes into **no working tree** — not the blueprint's, not its own.

This is the rule the repo already applies elsewhere: a spike's code is
"*re-implemented* (or carefully copied) … never `mv`'d wholesale", and
§"The blueprint is derived, not designed" describes promotion as deliberate
upstream work. `a2bp` has been the one exception.

### 2.1 The operating boundary

The design rests on "a person decides upstream", which is a property of
behaviour, not of the tool. Stated as a rule, and recorded in `CLAUDE.md`
§Back-propagating so it travels to derived projects:

- **No automatic merge.** No auto-merge setting, no bot, no tool verb that
  lands a request.
- **No self-integration without a distinct decision step.** The same person is
  usually on both ends; filing and integrating are still two acts, separated by
  reading the diff in the blueprint's context.
- **Merging as-is is legitimate because someone judged it trivial.** That
  judgement is the step that must not be skipped.

### 2.2 The guard is advisory

The contamination guard runs locally at `a2bp` time and **still stops the
request** when it finds something. What it no longer does is decide what reaches
the blueprint — that is a person's decision now. Advisory with respect to the
blueprint, not toothless with respect to the requester.

A finding has exactly two responses: **fix it**, or **mark the line** with a
justified `a2bp-allow: <why it is safe>`. There is no `--force`; if the guard is
wrong, that is a bug in `contamination.sh` and gets fixed as one.

`contamination.sh` and `placeholders.sh` are **unchanged**.

### 2.3 Ripples belong to the implementer

`A2BP_PLAYBOOK.md` addresses whoever makes the change *in the blueprint*. Its
"same session, no context switch" rule applies to the implementation session.

## 3. CLI

| Command | Behaviour |
|---|---|
| `blueprint a2bp FILE...` | Guard, build the request, push, open PR, print URL. |
| `blueprint a2bp --dry-run FILE...` | Guard, resolve the base, show the diff. Reads the remote; writes nothing. There is no offline mode. |
| `blueprint prs` | Open a2bp requests: number, project, files, age — plus pushed branches with no PR. |

No `push` alias: the command files a request.

`prs` reports drafts and closed-but-branch-present distinctly, and on a `gh` API
failure says the list is **incomplete** rather than printing an empty one that
reads as "nothing pending".

**Exit statuses are distinct:**

| Status | Meaning |
|---|---|
| `0` | Request filed clean. |
| decision-pending | Filed, awaiting a decision. Deliberately non-zero so a script cannot mistake it for "landed". |
| blocked | The guard found something; nothing was filed. |
| operational failure | The CLI could not do its job. |

## 4. Request identity

The branch id is a digest over a **length-framed** key. No delimiters: every
component is preceded by a decimal byte count and a single space, because a
remote URL, branch name or project identity can itself contain newlines.

```
<len> "v3"                            # key schema version
<len> <destination remote URL, verbatim>
<len> <target branch name>
<len> <base commit SHA, 40 hex, lowercase>
<len> <canonical project identity>
```

…then one record per target path, **sorted byte-wise ascending**:

```
<len> <path>  <len> <mode, 6 octal digits>  <len> <content bytes>
```

Framing both path and content is what stops `ab`+`c` colliding with `a`+`bc`.

**Digest:** SHA-256, lowercase hex, **full 64 characters** in the ref. A
truncated id is a birthday problem against a namespace that persists.

**Ref:** `refs/heads/a2bp/<project>/<digest64>`, with the **complete candidate**
validated by `git check-ref-format --branch`. A project name legal as a path
component can still be an invalid ref, and can be legal alone yet invalid once
composed. Failure **refuses with the reason** — never slugs the name into
something valid, because a slug that differs from the real project name breaks
the provenance the ref carries.

**On collisions:** a full SHA-256 digest is collision-*resistant*, not
collision-proof. The safety is the **exact-tip comparison** on adoption, which
refuses rather than overwrites even in the improbable case.

## 5. Input validation

All inputs validated **before any remote contact**, so a bad argument cannot
leave a branch pushed and the run aborted.

### 5.1 The project side

| Case | Rule |
|---|---|
| Path not in `MANAGED_FILES` | Refuse, naming it. |
| Canonical form | Resolve `.`/`..`, normalise separators — **before** the `MANAGED_FILES` check and before sorting, so the key is stable across spellings. |
| Duplicate paths | Deduplicate **after** canonicalisation. |
| Path escaping the project root | Refuse. Argument-supplied path components are never trusted. |
| Symlink at the target | Refuse. Following it would file bytes from somewhere the operator did not name. |
| Not a regular file | Refuse, naming the type. |
| Mode | Only `100644` and `100755`. The mode travels in the key, so a mode-only change is a real request. |
| Unreadable | Refuse. |
| No-op — content and mode identical to base for **every** input | Refuse with a distinct "nothing to request" status. An empty PR wastes reviewer attention, which is the scarce resource this design protects. |
| Partial no-op | Unchanged files are dropped **and reported as dropped**; the rest proceed. |

### 5.2 The fetched base

The base is a separate tree with its own shape. Every refusal names the path and
what was found.

| Base holds… | Rule |
|---|---|
| A directory at the target path | Refuse. Replacing a tree with a blob is a restructure, not an edit. |
| A symlink (`120000`) | Refuse. Overwriting changes what every consumer resolves. |
| A gitlink (`160000`) | Refuse. |
| A regular file with an unrepresentable mode | Refuse, naming the mode. |
| An existing parent component that is not a `040000` tree | Refuse — blob, symlink, gitlink or malformed mode/type pair. |
| Nothing at the path, parents clean | Creation; called out as such in the PR body. |

## 6. Build

A derived project's repository has history **unrelated** to the blueprint's, so
there is no common ancestor to commit against locally. The request is built
against the fetched blueprint base, in a scratch clone, using **git plumbing
only** — no working tree ever holds the content.

### 6.1 Two environments, interleaved

| Phase | Environment |
|---|---|
| **Transport** — `fetch`, `ls-remote`, `push`, `gh` | Credential inputs preserved (`GIT_SSH_COMMAND`, askpass, agent state, helpers, proxies). Still **rejects** `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*`. |
| **Object construction and inspection** | Fully scrubbed (§6.2). No network, no credentials needed. |

The determinism scrub removes the config where credentials live, so the phases
cannot share an environment. They interleave — fetch, construct, re-check, push
— so **the scrubbed environment is re-entered after every transport step**.

### 6.2 The construction scrub

| Ambient input | Scrub |
|---|---|
| Object format | `--object-format=sha1` explicitly — a SHA-256 repo produces different hashes for identical content. |
| `GIT_*` environment | Unset all except the author/committer vars set deliberately. |
| System + global config | `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`. |
| Locale | `LC_ALL=C`. |
| Dates | Raw format (`<epoch> <±hhmm>`), unambiguous to git. |
| Hooks, signing, autocrlf, encoding | `core.hooksPath=/dev/null`, `commit.gpgsign=false`, `core.autocrlf=false`, `i18n.commitEncoding=UTF-8` on the command. |

**Minimum git: 2.32**, refused below with a message naming found and required
versions. Set by `GIT_CONFIG_GLOBAL` (2.32); `init --object-format` needs 2.29
and the `update-index --cacheinfo` comma form needs 2.0.

### 6.3 The commit

Every field fixed. Nothing from the environment.

| Field | Value |
|---|---|
| tree | from the staged content |
| parent | the captured base SHA |
| author + committer | `a2bp <a2bp@blueprint.invalid>`, identical for both |
| dates | the base commit's committer date, verbatim including offset, identical for both |
| message | `a2bp: <n> file(s) from <project>` then a blank line then one sorted target path per line, LF-terminated |

### 6.4 Steps

1. `mktemp -d` under the system temp dir — never inside either repository.
2. `git init --bare --object-format=sha1`; add the remote from
   `blueprint_remote`. Bare: no working tree to filter through, no hooks.
3. `git fetch --depth 1 <remote> <branch>`; capture the resolved SHA as **the**
   base for the key.
4. Read the base tree with `git ls-tree`. Never a checkout.
5. Write each blob with `git hash-object -w --no-filters --stdin` —
   `--no-filters` bypasses `.gitattributes` and clean filters.
6. **`git read-tree <base>` into the isolated index FIRST**, then
   `git update-index --cacheinfo <mode>,<blob>,<path>` per target, then
   `git write-tree`. Without the `read-tree`, the tree would contain *only* the
   target paths and the request would propose deleting the rest of the
   blueprint.
7. `git commit-tree <tree> -p <base>` with §6.3.
8. **Assert:** parent equals the captured base; the diff against that base
   touches **exactly** the target paths with the expected modes; each target
   blob's bytes equal the staged bytes. Refuse on any mismatch.
9. `git update-ref` the branch.
10. **Re-check the base** — `ls-remote` the target branch, confirm the captured
    SHA. If it moved: discard, rebuild once against the new base, re-check; on a
    second move, refuse rather than loop.
11. Push.
12. Remove the scratch directory on **every** exit path; if removal fails, print
    the path and say it needs manual cleanup.

**What the base re-check guarantees:** checking one ref and pushing another are
not atomic. The claim is narrow — the base was current between build and push,
which closes the wide window and leaves one of round-trip size. The residual is
surfaced by recording the base SHA in the PR body, so a reviewer can see whether
the base has since moved.

## 7. Recovery

| State | Behaviour |
|---|---|
| Branch exists remotely | Adopt **only if its tip equals the commit just built**. Otherwise refuse and print both SHAs. Never force-push. |
| Push succeeded, PR call returned nothing | Query for an existing PR on that branch — **open or closed** — before creating one. Re-filing a request the owner already closed is worse than failing. |
| Push rejected non-fast-forward | Tips differ: refuse and print both. Never retry with force. |
| Identical key pushed concurrently | Same project, content and base — the same request filed twice. Adopt on exact tip. |

## 8. Configuration

`.blueprint-source` gains:

```
config_version   = 2
blueprint_remote = git@github.com:Owner/blueprint.git
blueprint_branch = main
```

Validation order, before any remote contact: file exists → `config_version`
present and understood (**unknown version refuses**, naming both) →
`blueprint_remote` non-empty → `blueprint_branch`, defaulting to `main` only if
absent under version 2.

**Absent `config_version` means version 1** — the local-path-only file — and
`a2bp` refuses with the exact lines to add. It does **not** infer the remote
from the local blueprint checkout's `origin`: guessing a push destination is not
a recoverable mistake.

`project_config_paths.md` records the **trusted-owner boundary** (§11).

## 9. Repository changes

### 9.1 Removed

| What | Why |
|---|---|
| `cp "$staged" "$bp"` | The direct write. |
| `--force` on the project side | §2.2. |
| `a2bp\|push` alias | It files a request. |
| Step A–E ripple checklist in `cmd_a2bp` | Belongs to the implementer. |
| `BLUEPRINT_ROOT` as a **write** target | Still read, for the diff and the local guard. |

Multi-file **batch** accounting stays; only *partial-write* accounting is dead.
One invocation opens one PR, atomically over its inputs.

### 9.2 Documentation

All managed, all currently describing a direct copy: `CLAUDE.md`
§Back-propagating, `README.md` §2 and its command tree,
`docs/way-of-working.md` sync slide and CLI block, `docs/A2BP_PLAYBOOK.md`
(reframed to "you are implementing a request"), `docs/DOCUMENTATION.md`
§Back-propagation, the CLI header / `usage()` / comments / stale-drift message,
`.githooks/pre-push-project`'s A-07 gate text. Plus this repo's
`BLUEPRINT-AUDIT-2026-07-23.md` and `HANDOVER.md`, whose A-07 rows describe a
guard gating a copy.

`contamination.sh` is **not** in this list; it is unchanged.

### 9.3 Tests

`tests/a2bp-contamination/` emits **38** assertions. **27 run through the CLI**
and need harness migration — success becomes "a PR exists and no managed file
changed". The other 11 are `placeholders.sh` primitives and are unaffected;
cases **#13/#14** stay as written.

New regressions:

- an unrelated base entry **survives** into the request tree;
- source/base topology refusals (§5.1, §5.2);
- hostile config **and** redirection environment — `autocrlf`, a clean filter,
  forced signing, non-C locale, `sha256` default, `insteadOf`,
  `GIT_CONFIG_COUNT` — produce a byte-identical SHA while transport still
  resolves the intended remote;
- git version boundary: refuse below 2.32, pass at 2.32;
- ref validation boundaries: leading `.`, `.lock` suffix, `@{`, `..`, trailing
  `.`, control characters, legal-alone-but-invalid-composed;
- retry and race: exact-tip adoption, non-fast-forward refusal, PR-response
  loss;
- **no path writes a managed file** — snapshot the tree, assert byte-identity.

## 10. Rollback

Single `git revert` of the implementation commit. Open requests remain valid as
requests.

## 11. Boundaries

**Trusted-owner:** branch-push is sound while every derived project belongs to
the same owner. Beyond that, forks — and *trusted source-project identity*,
which nothing here establishes, becomes a real problem. Recorded in
`project_config_paths.md` so the first externally-owned project trips over it.

**Network and `gh` auth become required.** `a2bp` is local today.

**Contamination reaching the blueprint is a human-review property**, as it is
for every other change to this repo. Weaker than a machine gate; stronger than
today's unreviewed `cp`.

## 12. Explicitly out of scope

Receiver-enforced guarding (required checks, base-branch trust, marker
byte-binding, ripple evidence), `contamination.sh` semantic changes, changes to
cases #13/#14, fork mode, automatic merge, offline persistence, arbitrary
hosting, general development branches, and direct writes to either working tree.

The receiver-enforced guard has its own design record in the review documents —
build it when a derived project is owned by someone whose review would not be
taken on trust.
