#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-${1:-/opt/atomic-ui}}"
PANEL_DOMAIN="${PANEL_DOMAIN:-}"
PUBLIC_SHARE_DOMAIN="${PUBLIC_SHARE_DOMAIN:-}"
LETSENCRYPT_WEBROOT="${LETSENCRYPT_WEBROOT:-/var/www/letsencrypt}"
DOMAIN_RENEW_SERVICE="/etc/systemd/system/atomic-ui-domain-cert-renew.service"
DOMAIN_RENEW_TIMER="/etc/systemd/system/atomic-ui-domain-cert-renew.timer"
CERTBOT_DEPLOY_HOOK="/etc/letsencrypt/renewal-hooks/deploy/atomic-ui-reload-nginx.sh"

normalize_host() {
  local value="${1#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  echo "${value,,}"
}

read_host_file() {
  local path="$1"
  if [[ -f "${path}" ]]; then
    tr -d '[:space:]' <"${path}"
  fi
}

sync_renewal_webroot() {
  local domain_name="$1"
  local renewal_conf="/etc/letsencrypt/renewal/${domain_name}.conf"

  if [[ -z "${domain_name}" || ! -f "${renewal_conf}" ]]; then
    return
  fi

  if ! grep -q '^authenticator = webroot$' "${renewal_conf}"; then
    return
  fi

  if grep -q "^webroot_path = ${LETSENCRYPT_WEBROOT},$" "${renewal_conf}"; then
    return
  fi

  sed -i "s#^webroot_path = .*#webroot_path = ${LETSENCRYPT_WEBROOT},#" "${renewal_conf}"
  echo "Updated legacy certbot webroot for ${domain_name} -> ${LETSENCRYPT_WEBROOT}"
}

configure_domain_renewal() {
  if ! command -v certbot >/dev/null 2>&1; then
    apt-get update -qq >/dev/null
    apt-get install -y -qq certbot >/dev/null
  fi

  mkdir -p "${LETSENCRYPT_WEBROOT}/.well-known/acme-challenge"
  mkdir -p "$(dirname "${CERTBOT_DEPLOY_HOOK}")"
  cat >"${CERTBOT_DEPLOY_HOOK}" <<'EOF'
#!/bin/sh
set -eu
systemctl reload nginx
EOF
  chmod 0755 "${CERTBOT_DEPLOY_HOOK}"

  cat >"${DOMAIN_RENEW_SERVICE}" <<'EOF'
[Unit]
Description=Renew Atomic-UI domain HTTPS certificates
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/sh -lc 'certbot renew --quiet'
EOF

  cat >"${DOMAIN_RENEW_TIMER}" <<'EOF'
[Unit]
Description=Run Atomic-UI domain certificate renewal twice daily

[Timer]
OnBootSec=15m
OnUnitActiveSec=12h
Persistent=true
RandomizedDelaySec=30m

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now atomic-ui-domain-cert-renew.timer >/dev/null 2>&1
}

disable_domain_renewal() {
  systemctl disable --now atomic-ui-domain-cert-renew.timer >/dev/null 2>&1 || true
  rm -f "${DOMAIN_RENEW_SERVICE}" "${DOMAIN_RENEW_TIMER}" "${CERTBOT_DEPLOY_HOOK}"
  systemctl daemon-reload
  systemctl reset-failed atomic-ui-domain-cert-renew.service >/dev/null 2>&1 || true
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

if [[ -z "${PANEL_DOMAIN}" ]]; then
  PANEL_DOMAIN="$(read_host_file "${APP_DIR}/.panel_domain")"
fi
if [[ -z "${PUBLIC_SHARE_DOMAIN}" ]]; then
  PUBLIC_SHARE_DOMAIN="$(read_host_file "${APP_DIR}/.public_share_domain")"
fi

PANEL_DOMAIN="$(normalize_host "${PANEL_DOMAIN}")"
PUBLIC_SHARE_DOMAIN="$(normalize_host "${PUBLIC_SHARE_DOMAIN}")"

if [[ -z "${PANEL_DOMAIN}" && -z "${PUBLIC_SHARE_DOMAIN}" ]]; then
  disable_domain_renewal
  echo "No domain HTTPS hosts configured; Atomic-UI domain certificate renewal disabled."
  exit 0
fi

sync_renewal_webroot "${PANEL_DOMAIN}"
sync_renewal_webroot "${PUBLIC_SHARE_DOMAIN}"
configure_domain_renewal
echo "Atomic-UI domain certificate renewal is active for panel=${PANEL_DOMAIN:-none} share=${PUBLIC_SHARE_DOMAIN:-none}."
