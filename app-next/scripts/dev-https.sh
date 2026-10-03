#!/usr/bin/env bash
# Serves the app over HTTPS from a locally trusted certificate, so you can test it from
# another machine on your network with a real secure context.
#
# Why this exists: the camera and the service worker both refuse to run outside a secure
# context, and http on a LAN address is not one. Over plain http you get the app with a dead
# scanner and no install prompt, which looks like the app is broken rather than like the
# browser is doing its job.
#
# Why not a tunnel: ngrok or cloudflared would give you a trusted certificate in one command
# and publish the app to the open internet in the same breath. For this repo that is the
# wrong thing for a development build. Keep it on the LAN.
set -euo pipefail
cd "$(dirname "$0")/.."

MKCERT="${MKCERT:-$HOME/.local/bin/mkcert}"
[ -x "$MKCERT" ] || MKCERT="$(command -v mkcert || true)"
if [ -z "${MKCERT:-}" ] || [ ! -x "$MKCERT" ]; then
  echo "mkcert not found. Expected ~/.local/bin/mkcert" >&2
  exit 1
fi

LAN=$(ip -4 addr show scope global 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | grep -v '^172\.' | head -1)
LAN="${LAN:-127.0.0.1}"

mkdir -p .certs
if [ ! -f .certs/dev.pem ]; then
  echo "minting a certificate for localhost and $LAN..."
  (cd .certs && "$MKCERT" -cert-file dev.pem -key-file dev-key.pem localhost 127.0.0.1 ::1 "$LAN")
fi

CAROOT="$("$MKCERT" -CAROOT)"
cat <<MSG

  Serving on:  https://$LAN:3000

  On the machine you are browsing FROM, install this once so the certificate is
  genuinely trusted and there is no warning to click past:

      $CAROOT/rootCA.pem

    Windows:  double click it, Install Certificate, Local Machine,
              "Trusted Root Certification Authorities"
    macOS:    double click, add to System keychain, set to Always Trust
    Linux:    copy to /usr/local/share/ca-certificates/oira-dev.crt, then
              sudo update-ca-certificates

  Chrome needs a restart after installing the CA.

MSG

exec npm run dev
