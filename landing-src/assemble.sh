#!/usr/bin/env bash
# Builds the new landing page and lays it out with the files the live site still serves.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
live="$here/../landing"
out="$here/deploy"
cd "$here"
npx vite build
rm -rf "$out"
cp -r dist "$out"
cp -r "$live/brand" "$out/"
# The APK comes from one place only: the release copy on the landing branch, which every release
# updates. Taking it from ../landing silently shipped an old version once.
apk="${OIRA_APK:-$HOME/Oira-landing-luminous/landing/downloads/oira-seeker.apk}"
[ -f "$apk" ] || { echo "no APK at $apk" >&2; exit 1; }
mkdir -p "$out/downloads" && cp "$apk" "$out/downloads/oira-seeker.apk"
cp "$live/for-brands.html" "$live/brands-thanks.html" "$live/netlify.toml" "$out/"
echo "ready: $out"
