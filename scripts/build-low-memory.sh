#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NODE_HEAP_MB="${NODE_HEAP_MB:-640}"
PUBLISH_STANDALONE="${PUBLISH_STANDALONE:-false}"
NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-$(git rev-parse --short=12 HEAD 2>/dev/null || date +%s)}"

echo "[build-low-memory] root=${ROOT_DIR}"
echo "[build-low-memory] heap=${NODE_HEAP_MB}MB"

export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
export NEXT_PUBLIC_APP_VERSION

sh scripts/prisma-command.sh generate >/dev/null
rm -rf .next/standalone
# Next occasionally prints a benign compiler worker SIGTERM notice near the end
# of successful low-memory builds. Filter only that noise and keep all real
# build output and failures intact.
npx next build 2>&1 | awk '
  $0 == "Compiler server unexpectedly exited with code: null and signal: SIGTERM" { next }
  $0 == "Compiler client unexpectedly exited with code: null and signal: SIGTERM" { next }
  { print }
'

if [[ "${PUBLISH_STANDALONE}" == "true" ]]; then
  echo "[build-low-memory] publishing standalone server bundle"
  mkdir -p .next/standalone/.next
  rm -rf .next/standalone/.next/static .next/standalone/public
  rm -rf .next/standalone/node_modules/@prisma .next/standalone/node_modules/.prisma
  rm -rf .next/standalone/node_modules/geoip-lite/data .next/standalone/.next/server/data
  cp -r .next/static .next/standalone/.next/
  if [[ -d node_modules/@prisma ]]; then
    mkdir -p .next/standalone/node_modules
    cp -r node_modules/@prisma .next/standalone/node_modules/
  fi
  if [[ -d node_modules/.prisma ]]; then
    mkdir -p .next/standalone/node_modules
    cp -r node_modules/.prisma .next/standalone/node_modules/
  fi
  if [[ -d node_modules/geoip-lite/data ]]; then
    mkdir -p .next/standalone/node_modules/geoip-lite .next/standalone/.next/server
    cp -r node_modules/geoip-lite/data .next/standalone/node_modules/geoip-lite/
    cp -r node_modules/geoip-lite/data .next/standalone/.next/server/
  fi
  if [[ -d public ]]; then
    cp -r public .next/standalone/
  fi
  if [[ -f .env ]]; then
    cp .env .next/standalone/
  fi
  if [[ -d prisma ]]; then
    cp -r prisma .next/standalone/
    # Keep Prisma schema/runtime assets, but never publish a copied live SQLite DB.
    rm -rf .next/standalone/prisma/data .next/standalone/prisma/data.backup
    find .next/standalone/prisma -maxdepth 1 -type f \( -name '*.db' -o -name '*.db-shm' -o -name '*.db-wal' \) -delete
  fi
  if [[ ! -d .next/standalone/.next/static ]]; then
    echo "[build-low-memory] standalone static assets missing after publish" >&2
    exit 1
  fi
fi

echo "[build-low-memory] complete"
