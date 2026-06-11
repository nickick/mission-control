#!/bin/bash
# Rebrand the dev-mode Electron bundle so the macOS system menu shows
# "AI Mission Control" instead of "Electron". The menu title comes from the
# running bundle's Info.plist, which app.setName() cannot change.
#
# Re-run after any Electron reinstall/upgrade (dist/ is re-extracted then):
#   ./scripts/brand-electron.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_APP="$REPO/apps/electron/node_modules/electron/dist/Electron.app"
PLIST="$ELECTRON_APP/Contents/Info.plist"

if [ ! -f "$PLIST" ]; then
  echo "Electron bundle not found at $ELECTRON_APP" >&2
  exit 1
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleName AI Mission Control" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName AI Mission Control" "$PLIST" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string AI Mission Control" "$PLIST"

# Modifying the plist breaks the ad-hoc seal; re-sign so macOS will launch it.
codesign --force --deep --sign - "$ELECTRON_APP"
codesign --verify "$ELECTRON_APP" && echo "Electron bundle rebranded and re-signed."
