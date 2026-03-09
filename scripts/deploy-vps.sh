#!/usr/bin/env bash

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PASSWORD="${DEPLOY_PASSWORD:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/atomic-ui}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-atomic-ui.service}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
NODE_HEAP_MB="${NODE_HEAP_MB:-640}"
DEPLOY_PORT_FALLBACK="${DEPLOY_PORT_FALLBACK:-2053}"
DEPLOY_PANEL_PATH_FALLBACK="${DEPLOY_PANEL_PATH_FALLBACK:-}"

usage() {
  cat <<'EOF'
Usage:
  DEPLOY_HOST=143.198.197.158 DEPLOY_PASSWORD=secret bash scripts/deploy-vps.sh

Optional environment variables:
  DEPLOY_USER=root
  DEPLOY_PATH=/opt/atomic-ui
  DEPLOY_SERVICE=atomic-ui.service
  DEPLOY_BRANCH=main
  NODE_HEAP_MB=640
  DEPLOY_PORT_FALLBACK=2053
  DEPLOY_PANEL_PATH_FALLBACK=/7061c5df
EOF
}

if [[ -z "${DEPLOY_HOST}" ]]; then
  usage
  exit 1
fi

SSH_BASE=(ssh -o StrictHostKeyChecking=no "${DEPLOY_USER}@${DEPLOY_HOST}")
if [[ -n "${DEPLOY_PASSWORD}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass is required when DEPLOY_PASSWORD is set" >&2
    exit 1
  fi
  SSH_BASE=(sshpass -p "${DEPLOY_PASSWORD}" ssh -o StrictHostKeyChecking=no "${DEPLOY_USER}@${DEPLOY_HOST}")
fi

"${SSH_BASE[@]}" \
  "APP_DIR='${DEPLOY_PATH}' SERVICE_NAME='${DEPLOY_SERVICE}' BRANCH='${DEPLOY_BRANCH}' NODE_HEAP_MB='${NODE_HEAP_MB}' PORT_FALLBACK='${DEPLOY_PORT_FALLBACK}' PANEL_PATH_FALLBACK='${DEPLOY_PANEL_PATH_FALLBACK}' bash -s" <<'REMOTE'
set -euo pipefail

cd "${APP_DIR}"
git pull --ff-only origin "${BRANCH}"

restart_service() {
  systemctl start "${SERVICE_NAME}" >/dev/null 2>&1 || true
}

trap restart_service ERR

systemctl stop "${SERVICE_NAME}"
NODE_HEAP_MB="${NODE_HEAP_MB}" PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh
trap - ERR

systemctl start "${SERVICE_NAME}"
systemctl is-active "${SERVICE_NAME}"
systemctl show -p ActiveEnterTimestamp "${SERVICE_NAME}"

PANEL_PORT="$(cat .panel_port 2>/dev/null || echo "${PORT_FALLBACK}")"
PANEL_PATH="$(cat .panel_path 2>/dev/null || echo "${PANEL_PATH_FALLBACK}")"

journalctl -u "${SERVICE_NAME}" -n 20 --no-pager
curl -I -s "http://127.0.0.1:${PANEL_PORT}${PANEL_PATH}/dashboard" | head -n 5
REMOTE
