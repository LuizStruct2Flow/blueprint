# struct2flow blueprint — developer tool bundle.
#
# One command to install everything the pre-push gate expects:
#   brew bundle              (from this directory)
#
# To check what's missing without installing:
#   brew bundle check
#
# Projects forked from the blueprint should ADD their own brews/casks
# below the "Project-specific extensions" marker — never strip the
# blueprint section. The blueprint sync brings new entries forward.

# --- Security gate (docs/SECURITY.md cross-recipe rules) ---
brew "gitleaks"      # secret scan, pre-push (.githooks/pre-push)
brew "semgrep"       # SAST, pre-push + CI
brew "osv-scanner"   # SCA / dependency CVE scan, pre-push + CI

# --- IaC gate (docs/INFRASTRUCTURE.md cross-recipe rules) ---
# These cover all three recipes; install only what your project's recipe needs.
# The pre-push hook auto-detects the layout (infra/cdk.json, infra/**/*.tf,
# infra/charts/*/Chart.yaml) and skips with a hint if a tool is missing.
brew "awscli"        # AWS CLI — used by every recipe touching AWS
brew "aws-cdk"       # Recipe A — CDK TypeScript (struct2flow default)
brew "terraform"     # Recipe B — multi-cloud / portable
brew "helm"          # Recipe C — Kubernetes / GitOps

# --- Project-specific extensions (add your own below this line) ---
# Examples (uncomment + adapt):
# brew "node"
# brew "kubectl"
# brew "argocd"
# cask "docker"
