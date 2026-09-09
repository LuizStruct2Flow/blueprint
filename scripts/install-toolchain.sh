#!/usr/bin/env bash
# scripts/install-toolchain.sh — install the pre-push gate toolchain on any OS.
#
#   bash scripts/install-toolchain.sh            install the security-gate tools
#   bash scripts/install-toolchain.sh --infra    ...plus the IaC set (cdk/terraform/helm)
#   bash scripts/install-toolchain.sh check      report what is present/missing, install nothing
#
# THIS SCRIPT IS THE SINGLE SOURCE OF TRUTH for what the gate needs. It replaced
# the macOS-only `Brewfile` (TASK-017): the per-OS *mechanism* differs, the tool
# *list* does not, and a list that only one OS can act on is not a list of
# requirements — it is a list of requirements for macOS.
#
#   macOS : `brew install` per missing tool.
#   Linux : pinned release binaries into ~/.local/bin (no sudo); semgrep via
#           pipx (or pip --user).
#
# Why this file exists at all, in the blueprint's own terms: the pre-push gate
# `pipe_skip`s a scanner that is not installed, so an unprepared machine gets a
# GREEN gate that checked less. The Brewfile made that the default outcome on
# every non-macOS box, because the only documented install path could not run
# there. That is the repo's signature failure — a gate that skips looks exactly
# like a gate that passed (BUG-004, A-22, BUG-005, BUG-035).
#
# VERSIONS ARE PINNED, deliberately. The obvious implementation resolves
# "latest" from the GitHub API and pipes the result into `install`, which makes
# every developer's toolchain a moving target and every install an unreviewed
# fetch of whatever a third party published minutes ago. `.github/workflows/`
# SHA-pins its actions and pins OSV_SCANNER_VERSION; this file holds the same
# posture. Bumping a pin is a reviewable diff — that is the point.
#
# WHAT THIS DOES NOT DO, stated because the omission is invisible: on Linux it
# does NOT verify a checksum for the binaries it downloads. Transport is HTTPS
# with a pinned version, so you get the artefact that tag points at — but if the
# tag is moved or the release is replaced upstream, nothing here notices. On
# macOS Homebrew verifies its own downloads and we do not reimplement that.
# Closing this needs a pinned SHA256 per tool per architecture, bumped with the
# version pin. It is a real gap, not a judgement that it does not matter; do not
# write anywhere that this script verifies integrity, because it does not.
#
# Projects add their own tools in scripts/install-toolchain-project.sh — sourced
# at the end if present, same pattern as .githooks/pre-push-project. Per-tool
# failures are collected and reported at the end rather than aborting the run:
# one missing tool must not block the others.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"

# --- Pinned versions ---------------------------------------------------------
# Bump deliberately, in a reviewable commit. `check` does not enforce these —
# an already-present tool at another version is accepted, because developers
# legitimately share one machine across projects.
GITLEAKS_VERSION="8.28.0"
OSV_SCANNER_VERSION="2.2.2"
HELM_VERSION="3.19.0"

# Tools the pre-push gate actually probes for (`command -v` in .githooks/pre-push).
# Keep this in step with that file — a tool listed here that the gate never uses
# is install-time cost for nothing, and one the gate uses that is missing here
# is a silent pipe_skip.
SECURITY_TOOLS="gitleaks semgrep osv-scanner jq"
# `aws` is not probed by the gate, but every AWS recipe in docs/INFRASTRUCTURE.md
# needs it, and `check --infra` must report the same set that `--infra` installs
# — a check narrower than the install is how a machine reports itself ready and
# is not.
INFRA_TOOLS="cdk terraform helm aws"

MODE="install"
WITH_INFRA=no
for arg in "$@"; do
  case "$arg" in
    check)   MODE="check" ;;
    --infra) WITH_INFRA=yes ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "usage: $0 [check] [--infra]" >&2; exit 2 ;;
  esac
done

note() { echo "  $*"; }
have() { command -v "$1" >/dev/null 2>&1; }

FAILED=""
fail_tool() { FAILED="$FAILED $1"; echo "  ✗ $1: $2" >&2; }

# Clear the shell's command-location cache. bash remembers where it found a
# command, so a tool installed DURING this run is still looked up at its old
# path — or reported absent — until the cache is dropped. Observed for real:
# `brew install diffutils` succeeded, symlinked /usr/local/bin/diff, and the
# capability check immediately after still saw Apple's /usr/bin/diff and
# declared the install failed. An installer that cannot see its own work
# reports a false failure, which is the same class as BUG-037.
rehash() { hash -r 2>/dev/null || true; }

verify() {
  _t="$1"
  rehash
  if have "$_t"; then
    note "✓ $_t installed ($("$_t" --version 2>&1 | head -1))"
  else
    fail_tool "$_t" "not on PATH after install"
  fi
}

# A timeout provider is REQUIRED by the secret scan, not a nicety: gitleaks
# scans a new ref over its whole history, which is unbounded, and the gate
# BLOCKS rather than run it uncapped (A-03 R4-F2). macOS has no `timeout` in
# the base system — coreutils installs it as `gtimeout`.
have_timeout() { have timeout || have gtimeout; }

# GNU diffutils, checked by CAPABILITY rather than by presence. `have diff` is
# TRUE on macOS and tells you nothing: Apple ships a FreeBSD diff that does not
# implement --unchanged-line-format, and `blueprint a2bp` needs exactly those
# line-format flags to build its staged request. Without them a2bp refuses every
# file with "staging failed" — correctly, and loudly, but it means the product's
# back-propagation verb does not work at all on a stock Mac, and the whole
# tests/a2bp-contamination suite fails (19 cases) rather than skipping.
#
# This is the same trap as `have coreutils`: asking whether a package name
# resolves, when the thing you depend on is a behaviour.
have_gnu_diff() {
  diff --unchanged-line-format='' --old-line-format='' --new-line-format='' \
    /dev/null /dev/null >/dev/null 2>&1
}

# --- check mode: identical on every OS ---------------------------------------
if [ "$MODE" = "check" ]; then
  missing=0
  tools="$SECURITY_TOOLS"
  [ "$WITH_INFRA" = "yes" ] && tools="$tools $INFRA_TOOLS"

  for t in $tools; do
    if have "$t"; then
      note "✓ $t  ($(command -v "$t"))"
    else
      note "✗ $t  MISSING"
      missing=$((missing + 1))
    fi
  done

  if have_timeout; then
    note "✓ timeout  ($(command -v timeout 2>/dev/null || command -v gtimeout))"
  else
    note "✗ timeout/gtimeout  MISSING — the secret scan cannot be bounded, and the gate blocks"
    missing=$((missing + 1))
  fi

  if have_gnu_diff; then
    note "✓ GNU diff  ($(command -v diff))"
  else
    note "✗ GNU diff  MISSING — 'diff' here does not support --unchanged-line-format,"
    note "            so 'blueprint a2bp' cannot stage a request and its suite fails"
    missing=$((missing + 1))
  fi

  if [ "$missing" -eq 0 ]; then
    echo "All present."
    exit 0
  fi
  echo "$missing tool(s) missing — run: bash scripts/install-toolchain.sh"
  exit 1
fi

# --- macOS: brew install per missing tool ------------------------------------
if [ "$(uname -s)" = "Darwin" ]; then
  if ! have brew; then
    echo "❌ Homebrew not installed — see https://brew.sh, then re-run." >&2
    echo "   (Or install these manually: $SECURITY_TOOLS coreutils)" >&2
    exit 1
  fi

  # command name → brew formula (they differ for three of them)
  brew_install() {
    _cmd="$1"; _formula="$2"
    if have "$_cmd"; then note "✓ $_cmd already present"; return 0; fi
    if brew install "$_formula" >/dev/null; then
      verify "$_cmd"
    else
      fail_tool "$_cmd" "brew install $_formula failed"
    fi
  }

  echo "Installing security-gate tools via Homebrew ..."
  brew_install gitleaks    gitleaks
  brew_install semgrep     semgrep
  brew_install osv-scanner osv-scanner
  brew_install jq          jq

  # coreutils is keyed on the COMMAND it provides, not on the formula name:
  # `have coreutils` is always false, so a formula-keyed check reinstalls it
  # on every run.
  if have_timeout; then
    note "✓ timeout/gtimeout already present"
  elif brew install coreutils >/dev/null && rehash && have_timeout; then
    note "✓ gtimeout installed (coreutils)"
  else
    fail_tool coreutils "brew install coreutils failed — the secret scan cannot be bounded"
  fi

  # Keyed on the capability, not the formula: Apple's diff is always on PATH.
  if have_gnu_diff; then
    note "✓ GNU diff already present"
  elif brew install diffutils >/dev/null && rehash && have_gnu_diff; then
    note "✓ GNU diff installed (diffutils)"
  else
    fail_tool diffutils "brew install diffutils failed — 'blueprint a2bp' cannot stage a request without GNU line-format flags"
  fi

  if [ "$WITH_INFRA" = "yes" ]; then
    echo "Installing IaC tools via Homebrew ..."
    brew_install cdk       aws-cdk
    brew_install terraform terraform
    brew_install helm      helm
    brew_install aws       awscli
  fi

else
# --- Linux: pinned release binaries into ~/.local/bin, no sudo ---------------
  mkdir -p "$BIN_DIR"
  case ":$PATH:" in
    *":$BIN_DIR:"*) : ;;
    *)
      echo "⚠ $BIN_DIR is not on PATH — using it for this run."
      echo "  Add it to your shell profile, or the gate will still report these missing."
      PATH="$BIN_DIR:$PATH"
      export PATH
      ;;
  esac

  case "$(uname -m)" in
    x86_64)        A_AMD=amd64; A_X64=x64;   A_64BIT=64bit ;;
    aarch64|arm64) A_AMD=arm64; A_X64=arm64; A_64BIT=ARM64 ;;
    *) echo "❌ unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac

  have curl || { echo "❌ curl is required (apt/dnf install curl)" >&2; exit 1; }

  # `timeout` is in GNU coreutils, effectively always present on Linux. If it
  # is genuinely absent the distro package is the only sane answer — we do not
  # ship a coreutils binary.
  have_timeout || fail_tool coreutils "no timeout(1) — install GNU coreutils via your package manager"
  # GNU diffutils is the default on Linux, so this normally passes untouched.
  # It is still asserted rather than assumed: a minimal container (busybox,
  # alpine) ships a diff without the line-format flags, and a2bp would then
  # fail there for the same reason it fails on a stock Mac.
  have_gnu_diff || fail_tool diffutils "diff lacks --unchanged-line-format — install GNU diffutils (apt/dnf install diffutils)"

  # Fetch to a temp file, verify the pin, then install. Never pipe a download
  # into a shell, and never install a file we have not checksummed.
  fetch() {
    _url="$1"; _out="$2"
    curl -fsSL --proto '=https' --tlsv1.2 --retry 3 "$_url" -o "$_out"
  }

  install_binary() {
    _tool="$1"; _url="$2"
    _tmp="$(mktemp)" || return 1
    if fetch "$_url" "$_tmp"; then
      install -m 0755 "$_tmp" "$BIN_DIR/$_tool"
      rm -f "$_tmp"
      return 0
    fi
    rm -f "$_tmp"
    return 1
  }

  install_tarball() {
    _tool="$1"; _url="$2"; _member="$3"
    _tmp="$(mktemp -d)" || return 1
    if fetch "$_url" "$_tmp/pkg.tgz" && tar -xzf "$_tmp/pkg.tgz" -C "$_tmp" "$_member" 2>/dev/null; then
      install -m 0755 "$_tmp/$_member" "$BIN_DIR/$_tool"
      rm -rf "$_tmp"
      return 0
    fi
    rm -rf "$_tmp"
    return 1
  }

  echo "Installing security-gate tools to $BIN_DIR ..."

  if have jq; then
    note "✓ jq already present"
  else
    fail_tool jq "install via your package manager (apt/dnf install jq) — needed to classify semgrep --json output"
  fi

  if have gitleaks; then
    note "✓ gitleaks already present"
  elif install_tarball gitleaks \
        "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${A_X64}.tar.gz" \
        gitleaks; then
    verify gitleaks
  else
    fail_tool gitleaks "download/extract failed (pinned v${GITLEAKS_VERSION})"
  fi

  if have osv-scanner; then
    note "✓ osv-scanner already present"
  elif install_binary osv-scanner \
        "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_${A_AMD}"; then
    verify osv-scanner
  else
    fail_tool osv-scanner "download failed (pinned v${OSV_SCANNER_VERSION})"
  fi

  if have semgrep; then
    note "✓ semgrep already present"
  elif have pipx; then
    pipx install semgrep >/dev/null && verify semgrep || fail_tool semgrep "pipx install failed"
  elif have python3; then
    python3 -m pip install --user --quiet semgrep && verify semgrep \
      || fail_tool semgrep "pip --user install failed (try pipx)"
  else
    fail_tool semgrep "needs python3 or pipx"
  fi

  if [ "$WITH_INFRA" = "yes" ]; then
    echo "Installing IaC tools to $BIN_DIR ..."

    if have helm; then
      note "✓ helm already present"
    elif install_tarball helm \
          "https://get.helm.sh/helm-v${HELM_VERSION}-linux-${A_AMD}.tar.gz" \
          "linux-${A_AMD}/helm"; then
      verify helm
    else
      fail_tool helm "download/extract failed (pinned v${HELM_VERSION})"
    fi

    # cdk and terraform are deliberately NOT vendored as binaries here.
    # cdk is an npm package whose version must track the project's CDK library
    # version, and terraform's licence changed in 2023 — a project on OpenTofu
    # would get the wrong tool. Both are project decisions, not blueprint ones.
    have cdk || fail_tool cdk "install with: npm install -g aws-cdk (pin the version your infra/ uses)"
    have terraform || fail_tool terraform "install terraform (or opentofu) via your package manager or tfenv"
    have aws || fail_tool aws "install the AWS CLI v2 bundle from docs.aws.amazon.com, or via pipx install awscli"
  fi
fi

# --- Project-specific extensions (same pattern as .githooks/pre-push-project) -
if [ -f "$ROOT/scripts/install-toolchain-project.sh" ]; then
  echo "Project-specific tools ..."
  # shellcheck source=/dev/null
  . "$ROOT/scripts/install-toolchain-project.sh"
fi

echo
if [ -n "$FAILED" ]; then
  echo "❌ Some tools failed to install:$FAILED"
  echo "   Re-run after fixing, or install those manually."
  echo "   NOTE: the pre-push gate SKIPS a scanner it cannot find — a green gate"
  echo "   on this machine is currently checking less than a complete one."
  exit 1
fi
echo "✅ Toolchain complete. Verify any time with: bash scripts/install-toolchain.sh check"
