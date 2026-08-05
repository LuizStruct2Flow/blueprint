#!/bin/sh
# scripts/lib/commit-subject.sh — THE definition of "a subject names its item".
#
# Sourced, not executed. Used by `.githooks/commit-msg` (one commit, locally)
# and by `scripts/check-commit-subjects.sh` (many subjects, in CI).
#
# WHY IT IS A LIBRARY
#
# The rule used to live inside the hook, which meant any second checker had to
# copy the regex — and two copies of a rule are two rules. They pass their own
# tests and disagree about a real commit, silently, which is the same shape as
# the INDEX.md/BUGS.md duplication TASK-005 removed: one record cannot disagree
# with itself.
#
# THE FORMAT
#
#   <TYPE>#<number>: <subject>
#
#   BUG#20: a refused pull exits non-zero
#   FEATURE#3: the gate renders as a pipeline
#   TASK#1: move the lcm checklist into the DoD
#
# TYPE is BUG, FEATURE or TASK — the three lifecycle ID namespaces.

# commit_subject_ok SUBJECT → 0 if it satisfies the rule (or is exempt), else 1.
#
# EXEMPT, and why none is a loophole:
#
#   merge   — git generates the message; there is no single item.
#   revert  — git generates `Revert "<original>"`, and the original named its item.
#   fixup!/squash!/amend!
#           — rebase instructions, not final messages. The commit they fold into
#             was checked when it was written.
commit_subject_ok() {
  case "${1:-}" in
    "Merge "*|"Revert "*|"fixup!"*|"squash!"*|"amend!"*) return 0 ;;
  esac
  printf '%s' "${1:-}" | grep -qE '^(BUG|FEATURE|TASK)#[0-9]+: .+'
}

# commit_subject_help → the rejection text, on stdout. Shared so the hook and CI
# tell the reader the same thing; a rule explained two ways is a rule learned
# twice.
commit_subject_help() {
  cat <<'EOF'
  expected: <TYPE>#<number>: <subject>

              BUG#20: a refused pull exits non-zero
              FEATURE#3: the gate renders as a pipeline
              TASK#1: move the lcm checklist into the DoD

  TYPE is BUG, FEATURE or TASK.

Every change refers to a backlog item (docs/DoD.md §1b rule 1). If this work has
no item yet, it is not ready to land: add a row under docs/backlog/, promote it
to docs/doing/, then commit.

Merge, revert and fixup!/squash! subjects are exempt.
EOF
}
