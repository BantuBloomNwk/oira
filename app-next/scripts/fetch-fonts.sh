#!/usr/bin/env bash
# Regenerates public/fonts and src/fonts.css from Google Fonts.
#
# Run this only when the families or weights change. The output is committed, so a normal
# build and a normal clone never touch Google. That is the point: nothing about a woman
# opening Oira should reach a third party, and a webfont request is a third party request
# whatever else it looks like.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/fetch-fonts.py
