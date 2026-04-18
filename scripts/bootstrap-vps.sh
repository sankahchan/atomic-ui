#!/usr/bin/env bash

set -euo pipefail

BOOTSTRAP_USER="${BOOTSTRAP_USER:-root}"
BOOTSTRAP_HOST="${BOOTSTRAP_HOST:-}"
BOOTSTRAP_PASSWORD="${BOOTSTRAP_PASSWORD:-}"
BOOTSTRAP_REPO="${BOOTSTRAP_REPO:-sankahchan/atomic-ui}"
BOOTSTRAP_INSTALL_REF="${BOOTSTRAP_INSTALL_REF:-main}"
BOOTSTRAP_INSTALL_HTTPS="${BOOTSTRAP_INSTALL_HTTPS:-auto}"
BOOTSTRAP_ACME_EMAIL="${BOOTSTRAP_ACME_EMAIL:-}"
BOOTSTRAP_PANEL_DOMAIN="${BOOTSTRAP_PANEL_DOMAIN:-}"
BOOTSTRAP_PUBLIC_SHARE_DOMAIN="${BOOTSTRAP_PUBLIC_SHARE_DOMAIN:-}"
BOOTSTRAP_ALLOW_IP_FALLBACK="${BOOTSTRAP_ALLOW_IP_FALLBACK:-true}"
BOOTSTRAP_DEFAULT_ADMIN_USERNAME="${BOOTSTRAP_DEFAULT_ADMIN_USERNAME:-admin}"
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD="${BOOTSTRAP_DEFAULT_ADMIN_PASSWORD:-admin123}"
BOOTSTRAP_TELEGRAM_BOT_TOKEN="${BOOTSTRAP_TELEGRAM_BOT_TOKEN:-}"

usage() {
  cat <<'EOF'
Usage:
  BOOTSTRAP_HOST=152.42.255.135 BOOTSTRAP_PASSWORD=secret bash scripts/bootstrap-vps.sh

Optional environment variables:
  BOOTSTRAP_USER=root
  BOOTSTRAP_REPO=sankahchan/atomic-ui
  BOOTSTRAP_INSTALL_REF=main
  BOOTSTRAP_INSTALL_HTTPS=auto
  BOOTSTRAP_ACME_EMAIL=you@example.com
  BOOTSTRAP_PANEL_DOMAIN=admin.example.com
  BOOTSTRAP_PUBLIC_SHARE_DOMAIN=share.example.com
  BOOTSTRAP_ALLOW_IP_FALLBACK=true
  BOOTSTRAP_DEFAULT_ADMIN_USERNAME=admin
  BOOTSTRAP_DEFAULT_ADMIN_PASSWORD=change-me
  BOOTSTRAP_TELEGRAM_BOT_TOKEN=123456:ABC

Notes:
  - If BOOTSTRAP_PASSWORD is set, sshpass must be installed locally.
  - BOOTSTRAP_INSTALL_REF must exist on GitHub (branch, tag, or commit SHA).
EOF
}

if [[ -z "${BOOTSTRAP_HOST}" ]]; then
  usage
  exit 1
fi

ssh_base=(ssh -o StrictHostKeyChecking=no "${BOOTSTRAP_USER}@${BOOTSTRAP_HOST}")
if [[ -n "${BOOTSTRAP_PASSWORD}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass is required when BOOTSTRAP_PASSWORD is set" >&2
    exit 1
  fi
  ssh_base=(sshpass -p "${BOOTSTRAP_PASSWORD}" ssh -o StrictHostKeyChecking=no "${BOOTSTRAP_USER}@${BOOTSTRAP_HOST}")
fi

quote_remote() {
  printf "%q" "$1"
}

"${ssh_base[@]}" \
  "BOOTSTRAP_REPO=$(quote_remote "${BOOTSTRAP_REPO}") \
BOOTSTRAP_INSTALL_REF=$(quote_remote "${BOOTSTRAP_INSTALL_REF}") \
BOOTSTRAP_INSTALL_HTTPS=$(quote_remote "${BOOTSTRAP_INSTALL_HTTPS}") \
BOOTSTRAP_ACME_EMAIL=$(quote_remote "${BOOTSTRAP_ACME_EMAIL}") \
BOOTSTRAP_PANEL_DOMAIN=$(quote_remote "${BOOTSTRAP_PANEL_DOMAIN}") \
BOOTSTRAP_PUBLIC_SHARE_DOMAIN=$(quote_remote "${BOOTSTRAP_PUBLIC_SHARE_DOMAIN}") \
BOOTSTRAP_ALLOW_IP_FALLBACK=$(quote_remote "${BOOTSTRAP_ALLOW_IP_FALLBACK}") \
BOOTSTRAP_DEFAULT_ADMIN_USERNAME=$(quote_remote "${BOOTSTRAP_DEFAULT_ADMIN_USERNAME}") \
BOOTSTRAP_DEFAULT_ADMIN_PASSWORD=$(quote_remote "${BOOTSTRAP_DEFAULT_ADMIN_PASSWORD}") \
BOOTSTRAP_TELEGRAM_BOT_TOKEN=$(quote_remote "${BOOTSTRAP_TELEGRAM_BOT_TOKEN}") \
bash -s" <<'REMOTE'
set -euo pipefail

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required when not connecting as root" >&2
    exit 1
  fi
  SUDO="sudo"
fi

${SUDO} apt-get update -qq
${SUDO} apt-get install -y -qq curl wget git ca-certificates postgresql-client >/dev/null

INSTALLER_PATH="/tmp/atomic-ui-install.sh"
curl -fsSL "https://raw.githubusercontent.com/${BOOTSTRAP_REPO}/${BOOTSTRAP_INSTALL_REF}/install.sh" -o "${INSTALLER_PATH}"
chmod +x "${INSTALLER_PATH}"

${SUDO} env \
  INSTALL_HTTPS="${BOOTSTRAP_INSTALL_HTTPS}" \
  ACME_EMAIL="${BOOTSTRAP_ACME_EMAIL}" \
  PANEL_DOMAIN="${BOOTSTRAP_PANEL_DOMAIN}" \
  PUBLIC_SHARE_DOMAIN="${BOOTSTRAP_PUBLIC_SHARE_DOMAIN}" \
  ALLOW_IP_FALLBACK="${BOOTSTRAP_ALLOW_IP_FALLBACK}" \
  DEFAULT_ADMIN_USERNAME="${BOOTSTRAP_DEFAULT_ADMIN_USERNAME}" \
  DEFAULT_ADMIN_PASSWORD="${BOOTSTRAP_DEFAULT_ADMIN_PASSWORD}" \
  TELEGRAM_BOT_TOKEN="${BOOTSTRAP_TELEGRAM_BOT_TOKEN}" \
  bash "${INSTALLER_PATH}"

APP_DIR="/opt/atomic-ui"
SERVICE_NAME="atomic-ui.service"

${SUDO} systemctl is-active "${SERVICE_NAME}" >/dev/null
${SUDO} systemctl show -p ActiveEnterTimestamp "${SERVICE_NAME}"

PANEL_PORT="$(${SUDO} cat "${APP_DIR}/.panel_port" 2>/dev/null || echo 2053)"
PANEL_PATH="$(${SUDO} cat "${APP_DIR}/.panel_path" 2>/dev/null || true)"
PUBLIC_ORIGIN="$(${SUDO} cat "${APP_DIR}/.public_origin" 2>/dev/null || true)"
PUBLIC_SHARE_ORIGIN="$(${SUDO} cat "${APP_DIR}/.public_share_origin" 2>/dev/null || true)"
LOCAL_PROBE_URL="http://127.0.0.1:${PANEL_PORT}${PANEL_PATH}/login"

PROBE_OK=0
for ATTEMPT in $(seq 1 15); do
  if PROBE_OUTPUT="$(curl -I -s --max-time 5 "${LOCAL_PROBE_URL}")"; then
    printf '%s\n' "${PROBE_OUTPUT}" | head -n 5
    PROBE_OK=1
    break
  fi

  echo "Waiting for panel to answer (${ATTEMPT}/15)..."
  sleep 2
done

if [[ "${PROBE_OK}" -ne 1 ]]; then
  echo "Final health probe failed after retries: ${LOCAL_PROBE_URL}" >&2
  exit 1
fi

echo ""
echo "Fresh VPS bootstrap complete"
echo "Panel URL: ${PUBLIC_ORIGIN}${PANEL_PATH}/"
if [[ -n "${PUBLIC_SHARE_ORIGIN}" ]]; then
  echo "Public share URL: ${PUBLIC_SHARE_ORIGIN}${PANEL_PATH}/"
fi
echo "Admin username: ${BOOTSTRAP_DEFAULT_ADMIN_USERNAME}"
echo "Admin password: ${BOOTSTRAP_DEFAULT_ADMIN_PASSWORD}"
REMOTE
