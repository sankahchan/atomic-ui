#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

for arg in "$@"; do
  case "$arg" in
    --schema|--schema=*)
    exec npx prisma "$@"
      ;;
  esac
done

SCHEMA_PATH="$(node scripts/prisma-schema-path.js)"
exec npx prisma "$@" --schema "$SCHEMA_PATH"
