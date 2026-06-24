#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
APP_PATH="src-tauri/target/release/bundle/macos/mdbar.app"
DMG_PATH="src-tauri/target/release/bundle/dmg/mdbar_${VERSION}_aarch64.dmg"
RELEASE_DMG="mdbar-${VERSION}-aarch64.dmg"
RELEASE_NOTES="release-notes/${TAG}.md"

if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "Missing a Developer ID Application certificate in the login keychain."
  exit 1
fi

if [[ -z "${APPLE_API_KEY:-}" || -z "${APPLE_API_ISSUER:-}" ]] &&
   [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "Missing Apple notarization credentials."
  echo "Set APPLE_API_KEY and APPLE_API_ISSUER, or APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID."
  exit 1
fi

if [[ ! -f "$RELEASE_NOTES" ]]; then
  echo "Missing release notes: $RELEASE_NOTES"
  exit 1
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "GitHub release $TAG already exists."
  exit 1
fi

npm ci
npm run build
npm run tauri build -- --bundles dmg

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=2 "$APP_PATH"
xcrun stapler validate "$APP_PATH"

cp "$DMG_PATH" "$RELEASE_DMG"
shasum -a 256 "$RELEASE_DMG"

gh release create "$TAG" "$RELEASE_DMG" \
  --target main \
  --title "mdbar ${VERSION}" \
  --notes-file "$RELEASE_NOTES" \
  --latest

echo "Published https://github.com/rishabhsai/mdbar/releases/tag/${TAG}"
