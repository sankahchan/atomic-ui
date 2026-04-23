#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-${1:-/opt/atomic-ui}}"
SERVICE_NAME="${SERVICE_NAME:-${2:-atomic-ui.service}}"
PORT_FALLBACK="${PORT_FALLBACK:-2053}"
NODE_OPTIONS_VALUE="${NODE_OPTIONS_VALUE:---max-old-space-size=384}"
EXEC_START="${EXEC_START:-/usr/bin/node ${APP_DIR}/.next/standalone/server.js}"
WORKING_DIR="${WORKING_DIR:-${APP_DIR}}"

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "${value}"
}

read_env_value() {
  local key="$1"
  local env_file="${APP_DIR}/.env"
  if [[ ! -f "${env_file}" ]]; then
    return 1
  fi

  local raw
  raw="$(grep -E "^${key}=" "${env_file}" | tail -n 1 | cut -d '=' -f2- || true)"
  if [[ -z "${raw}" ]]; then
    return 1
  fi

  trim_quotes "${raw}"
}

PANEL_PORT="$(cat "${APP_DIR}/.panel_port" 2>/dev/null || true)"
if [[ -z "${PANEL_PORT}" ]]; then
  PANEL_PORT="$(read_env_value PORT || true)"
fi
if [[ -z "${PANEL_PORT}" ]]; then
  PANEL_PORT="${PORT_FALLBACK}"
fi

PANEL_PATH="$(cat "${APP_DIR}/.panel_path" 2>/dev/null || true)"
if [[ -z "${PANEL_PATH}" ]]; then
  PANEL_PATH="$(read_env_value PANEL_PATH || true)"
fi
if [[ -z "${PANEL_PATH}" ]]; then
  PANEL_PATH="/"
fi

if [[ "${EXEC_START}" == *"${APP_DIR}/.next/standalone/server.js"* ]]; then
  if [[ ! -f "${APP_DIR}/.next/standalone/server.js" ]]; then
    echo "[sync-systemd-service] missing standalone server: ${APP_DIR}/.next/standalone/server.js" >&2
    echo "[sync-systemd-service] run: NODE_HEAP_MB=1024 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh" >&2
    exit 1
  fi

  if [[ ! -d "${APP_DIR}/.next/standalone/.next/static" ]]; then
    echo "[sync-systemd-service] missing standalone static assets: ${APP_DIR}/.next/standalone/.next/static" >&2
    echo "[sync-systemd-service] run: NODE_HEAP_MB=1024 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh" >&2
    exit 1
  fi
fi

SYSLOG_IDENTIFIER="${SERVICE_NAME%.service}"

cat > "/etc/systemd/system/${SERVICE_NAME}" <<EOF
[Unit]
Description=Atomic-UI - Outline VPN Management Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${WORKING_DIR}
ExecStart=${EXEC_START}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SYSLOG_IDENTIFIER}
Environment=NODE_ENV=production
Environment=PORT=${PANEL_PORT}
Environment=PANEL_PATH=${PANEL_PATH}
Environment=HOSTNAME=0.0.0.0
Environment=NODE_OPTIONS=${NODE_OPTIONS_VALUE}
EnvironmentFile=-${APP_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1
