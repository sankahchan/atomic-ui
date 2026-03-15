#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NODE_HEAP_MB="${NODE_HEAP_MB:-640}"
PUBLISH_STANDALONE="${PUBLISH_STANDALONE:-false}"

echo "[build-low-memory] root=${ROOT_DIR}"
echo "[build-low-memory] heap=${NODE_HEAP_MB}MB"

export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"

npx prisma generate >/dev/null
npx next build

if [[ "${PUBLISH_STANDALONE}" == "true" ]]; then
  echo "[build-low-memory] publishing standalone server bundle"
  mkdir -p .next/standalone/.next
  rm -rf .next/standalone/.next/static .next/standalone/public
  cp -r .next/static .next/standalone/.next/
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
