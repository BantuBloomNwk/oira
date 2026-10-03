#!/usr/bin/env bash
# Put the app on your phone, over USB, in a secure context.
#
# Why USB and not just the LAN address: getUserMedia only runs in a secure context, and
# http://192.168.x.x is not one. Chrome treats http://localhost as secure, so `adb reverse`
# maps the phone's own localhost:3000 back to this machine's port 3000 and the camera
# works with no certificate, no warning screen and no cert to trust.
#
# On the phone, once this is running: open Chrome and go to http://localhost:3000
set -euo pipefail
cd "$(dirname "$0")/.."

ADB="${ADB:-$HOME/.local/android/platform-tools/adb}"
[ -x "$ADB" ] || ADB="$(command -v adb || true)"
if [ -z "${ADB:-}" ] || [ ! -x "$ADB" ]; then
  echo "adb not found. Expected it at ~/.local/android/platform-tools/adb" >&2
  exit 1
fi

echo "waiting for a phone. plug it in, unlock it, and accept the debugging prompt..."
"$ADB" wait-for-device
"$ADB" devices -l | sed 1d

# The models and the WASM runtime are gitignored, so a fresh clone has to fetch them once.
if [ ! -f public/models/face_landmarker.task ]; then
  echo "fetching the on-device models (about 16MB, one time)..."
  ./scripts/fetch-models.sh
fi

"$ADB" reverse --remove-all >/dev/null 2>&1 || true
"$ADB" reverse tcp:3000 tcp:3000
echo
echo "  phone is wired up. on the phone, open Chrome:  http://localhost:3000"
echo "  scan in daylight, near a window, facing it."
echo
exec npm run dev
