#!/usr/bin/env bash
#
# build-deck.sh — render docs/way-of-working.md to PDF.
#
# Uses marp-cli via npx (no global install). Needs node on PATH.
# Output: docs/way-of-working.pdf (gitignored — refresh on demand).
#
# Brand assets at docs/assets/brand/struct2flow-mark.svg are referenced
# by the deck's Marp CSS. If you're in a project (not the blueprint
# itself) and the brand assets aren't present, the deck still renders
# but the corner logo will be missing — either provide your own at the
# same path or strip the logo block from the deck's <style>.

set -euo pipefail

cd "$(dirname "$0")/.."

DECK_SRC="docs/way-of-working.md"
DECK_PDF="docs/way-of-working.pdf"

if [ ! -f "$DECK_SRC" ]; then
  echo "❌ $DECK_SRC not found." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "❌ npx not found. Install Node (or 'brew bundle' in projects that pin it)." >&2
  exit 1
fi

echo "→ Rendering $DECK_SRC → $DECK_PDF"
npx -y @marp-team/marp-cli@latest \
  --allow-local-files \
  --pdf \
  "$DECK_SRC" \
  -o "$DECK_PDF"

if [ -f "$DECK_PDF" ]; then
  size=$(ls -lh "$DECK_PDF" | awk '{print $5}')
  echo "✓ Built $DECK_PDF ($size)"
else
  echo "❌ Build failed: $DECK_PDF not produced." >&2
  exit 1
fi
