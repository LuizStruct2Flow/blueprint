# Codex four-eyes re-review — A-22 round 5

**Range reviewed:** `37759a7..e805278` plus an independent repository-wide
semantic sweep and `origin/main..HEAD` scope check  
**Reviewer:** Slava (Codex)  
**Date:** 2026-07-24  
**Verdict:** **CHANGES REQUIRED — do not push**

## Blocking findings

### R9 — the retracted categorical wording still stands in `HANDOVER.md`

The round-5 corrections in the audit register are accurate. The section heading,
A-22 update, §4c decision table, finding statement, severity split, and closing
paragraph now consistently say:

- another local hook cannot close the fresh-clone/bypass gap;
- server-side enforcement is technically available at the workflow and policy
  costs §4c describes;
- that enforcement is not configured today; and
- the configured detection defect is no shared/team alert or transition-edge
  failure route, not an absence of every individual notification.

However, the active canonical resume document still says:

> Not closable client-side — a pre-push hook is advisory by construction.

That wording is broader than the precise local-hook claim adopted in R7 and is
the same categorical conclusion the mechanical sweep was meant to eliminate.
It is especially easy to misread because the same paragraph later says that
server-side required-check enforcement is available. Replace it with the
settled formulation: **not closable by another local hook; local tooling is
advisory and enforcement is server-side**.

Historical review records may retain rejected wording as an audit trail; this
finding concerns current guidance in the canonical `HANDOVER.md`.

### R10 — the requested push scope is fourteen commits, not twelve

`git rev-list --count origin/main..HEAD` returns **14**. The earlier scope
correction to twelve was true before the two round-5 commits were added:

1. `ed58162`
2. `0527cc1`
3. `248253a`
4. `af691f9`
5. `abfd112`
6. `6c3db7f`
7. `1eaf6d9`
8. `10d98bd`
9. `ad516e5`
10. `7b3b51f`
11. `61f8a96`
12. `37759a7`
13. `02337b4`
14. `e805278`

The three earlier permissions/lifecycle commits are present and remain part of
the intended range. The two new documentation commits also plainly have to ship
for R7/R8 to ship. Therefore “push all twelve” is no longer an exact or safe
instruction; the clean-review handoff must explicitly authorize all **fourteen**
commits.

## Requested verification

- **Independent semantic sweep:** the active audit's R7 and R8 corrections are
  clean. The remaining live categorical wording is the `HANDOVER.md` instance
  above. Matches inside prior Codex review records correctly document rejected
  claims and should remain.
- **R8 severity split:** accurate. Under enforcement options 1 and 2, the
  required check synchronously rejects the attempted merge/direct push.
  Alerting primarily covers failures outside that guarded attempt. The nightly
  scheduled SCA run is the principal designed case because it discovers CVEs
  published after dependencies were pinned and runs without an attempted
  change. Post-push/manual reruns are additional cases. Under advisory option 3,
  alerting is the only configured automated route intended to surface a bad
  landed commit.
- **Scope:** the three earlier commits named in the handoff are present and
  intended, but the full current range is fourteen commits for the reason above.
- `.github/workflows/security.yml` has push, pull-request, nightly schedule, and
  manual triggers, but no shared/team failure-routing step or transition-edge
  alert.

Because this review found current-document and scope corrections, Codex does not
authorize or perform the push. Under the four-eyes rule, the writer should make
the documentation correction, correct the count to fourteen, commit, and hand
the resulting commit back for clean cross-provider review.
