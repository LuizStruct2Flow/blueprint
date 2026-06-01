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

# --- Project-specific extensions (add your own below this line) ---
# Examples (uncomment + adapt):
# brew "awscli"
# brew "aws-cdk"
# brew "node"
# cask "docker"
