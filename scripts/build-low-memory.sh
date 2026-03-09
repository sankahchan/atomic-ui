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
  cp -r .next/standalone/* ./
fi

echo "[build-low-memory] complete"
