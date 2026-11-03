#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js is required to serve this local game.' >&2
  exit 1
fi
if [ ! -f port/build/unicorn-arm.js ]; then
  echo 'Build the original ARM browser engine with: python3 tools/build_emulator.py' >&2
  exit 1
fi
exec node tools/serve.mjs
