# Codex four-eyes review — A-09 SonarQube half

Date: 2026-07-26  
Range reviewed: `origin/main..e293429` (`6806538`, `17e993c`, `e293429`)  
Verdict: **CLEAN — authorized to push**

## Findings

No blocking or non-blocking findings.

1. **Reproducer is genuinely red/green.** I independently archived each
   historical commit into a fresh repository and ran
   `tests/bootstrap-contents/test.sh`. At `6806538` it inspected the derived
   tree's `sonar-project.properties`, reported the retained literal
   `{{PROJECT_NAME}}`, and exited 1. At `17e993c` and `e293429` the same test
   reported the substituted SonarQube key and exited 0.
2. **No other live shipping placeholder was missed.** I bootstrapped an actual
   derived project from current HEAD and grepped that derived tree. Residual
   occurrences are limited to documentation/examples, comments, the sync CLI's
   substitution implementation, and regression-test strings. No executable
   path, state location, project key, or other live configuration retains the
   placeholder. In particular, both `sonar.projectKey` and
   `sonar.projectName` are substituted.
3. **Template/no-pull reasoning is sound.** `sonar-project.properties` is in
   `TEMPLATE_FILES` and absent from `MANAGED_FILES`. `cmd_pull` iterates the
   managed set only, so pull neither heals nor overwrites this project-owned
   file. Adding it to bootstrap `TARGETS` is the complete path change.
4. **Quality gates.** `bash -n scripts/new-project.sh
   tests/bootstrap-contents/test.sh`, the current bootstrap-content regression,
   and `tests/state-dir/test.sh` all pass locally. The operator reports the full
   pre-push gate exited 0; that operator result is accepted for the remote
   Semgrep pack that this sandbox cannot complete.

The documentation correction in `e293429` accurately reflects the implemented
sync semantics, and `git diff --check origin/main..HEAD` is clean.
