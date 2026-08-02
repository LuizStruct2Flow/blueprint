# FEATURE-001 — back-propagation becomes a request, not a write

**Pushed to `main` 2026-07-30. Awaiting founder acceptance.**

## What changed, in one line

`blueprint a2bp` used to `cp` a project's file straight into the blueprint's
working tree. It now pushes a branch and opens a pull request, and itself lands
nothing.

> **Corrected 2026-08-02.** This line read "and cannot write into the blueprint
> at all". That overclaims, and the distinction matters: filing a request
> requires push access to the blueprint remote, and in the same-owner setup
> every agent authenticates as the owner with `enforce_admins: false`, so an
> agent running plain `git push` instead of `a2bp` reaches `main` directly. What
> `a2bp` removed is the *unreviewed automatic* write, which is a real and
> substantial gain. What it did not create is a boundary. Founder decision the
> same day: accept the model and state it accurately rather than harden it.
> Folded into **BUG-011**; see `project_config_paths.md` §"Back-propagation
> trust boundary".

## Why it mattered

Every derived project was a writer to the generic blueprint. That is not a
theoretical exposure — it is the mechanism by which **BUG-002** (a project's own
state dir hardcoded into the generic feed) and **A-09** (every checkout colliding
on one shared state dir) reached the blueprint and fanned out to every project on
their next pull. The A-07 contamination guard was bolted onto that door
afterwards; this removes the door.

## Acceptance needs a derived project, and that is a real constraint

**Founder, 2026-07-30: "I can only accept FEATURE-001 when I do a `blueprint
drift`, I won't have this time today."** Correct, and worth stating as a property
of the change rather than a scheduling note.

Every meaningful test below runs *from a derived project* — `a2bp` refuses to run
anywhere else, and `drift`'s new staleness warning only means something when
there is a local checkout that can fall behind. The blueprint cannot accept this
feature by looking at itself. So acceptance is gated on the next session in a real
derived project (`storm2flow`, `linkedin-watcher-agent`,
`greenwashing-detection-agent`), not on reading this document.

Two consequences:

- **It stays in `waiting-acceptance/` until then.** No part of it is promoted on
  inspection.
- **It pairs naturally with the derived-repo sweep** (HANDOVER §4), which is
  unstarted and needs a derived project anyway. Those two want the same session.

## What to test

The founder question is behavioural, not mechanical: **does filing a request
feel like asking, and does implementing one feel like a decision?**

Concretely:

| Try | Expect |
|---|---|
| `blueprint a2bp <managed-file>` from a project | A branch + PR on the blueprint remote. Exit status **3**, not 0 — filed is not landed. |
| `blueprint a2bp --dry-run <file>` | The diff, nothing pushed. |
| `blueprint prs` | What is currently asked of you, including pushed branches with no PR. |
| Run it twice unchanged | The second run adopts its own branch; the tip does not move. |
| `blueprint a2bp` on an unchanged file | "Nothing to request" (status 6), no empty PR. |
| `blueprint a2bp --force ...` | Refused, naming `a2bp-allow` instead. |
| `blueprint drift` in a project whose blueprint checkout is behind | A staleness warning, and a fast-forward offer only at a terminal. |
| `blueprint drift` at agent wake (no TTY) | Warning, no prompt, no hang, unchanged exit status. |
| A fresh `new-project.sh` project | `config_version = 2` with `blueprint_remote = FILL-ME-IN`; a2bp refuses until it is filled in. |

## Known costs, accepted deliberately

- **A project named after a common word blocks on its own generic prose.** Every
  staged line is scanned with no baseline exemption (A-07 R4-F2), because the
  exemption was the one path by which a misattributed line could wave
  contamination through. Mark such lines with `a2bp-allow: <why>`.
- **A project whose directory basename cannot be a git ref component**
  (`foo\bar`, `x*y`) can file no request. The name is never slugged, because a
  slug that differs from the real name destroys the provenance the branch carries.
- **`tests/a2bp-contamination/` moved to CI-only** — a real reduction in what
  blocks a push, filed as **BUG-005**. It went 2.3s → 6.0s driving real transport
  and the gate had no 6s to give. The gate keeps `tests/a2bp-e2e/`, which covers
  the leak-critical wiring. Reverses when BUG-005 is fixed.
- **Network and `gh` auth are now required.** `a2bp` was local.

## Not a security boundary

Branch-push is sound while every derived project belongs to the same owner. The
branch name carries a directory basename, and a basename is a claim, not a
credential; the guard also runs on the *requester's* machine. Recorded in
`project_config_paths.md` §"Back-propagation trust boundary" so the first
externally-owned project trips over it rather than discovering it. Receiver-side
enforcement is designed and deliberately unbuilt.

## Files

- `PLAN-A2BP-PR.md` — the approved specification.
- `PLAN-A2BP-PR-REVIEW.md` — 17 rounds of four-eyes review. Reads as archaeology
  on purpose: several rounds caught defects that would have shipped, including a
  tree build that would have proposed deleting the entire blueprint.
- `PLAN-A2BP-INBOX.md` / `-REVIEW.md` — the abandoned predecessor (a backlog
  inbox), kept because the reason it was abandoned is the reason this design is
  shaped the way it is.

## What the tests caught that review did not

Recorded because the ratio matters when judging how much to trust the next plan:

1. A missing `read-tree` would have made every request propose **deleting the
   whole blueprint** except its own files. (Caught in plan review, round 10.)
2. The scratch-cleanup trap read a `local` that was out of scope by the time
   EXIT fired — a bare clone leaked per run.
3. The request commit was dated from the **wall clock**, not the base, so retry
   adoption silently degraded to "always refuse". Invisible to any test whose two
   builds finished within the same second; the pre-push gate caught it.
4. `blueprint drift` would have exited 1 on **every wake in every project** —
   `set -e` plus a `grep` for a legitimately absent key.
5. Contamination case #7 had been passing **vacuously** for its whole life: the
   project and the stand-in blueprint were the same directory, so a2bp exited
   early as "same" and never ran the guard.
6. A test asserted a hang was bounded against a hang that never happened — a bare
   `sleep 60` as `GIT_SSH_COMMAND` receives the host as its interval and errors in
   100ms.
