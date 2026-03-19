#!/usr/bin/env bash

set -euo pipefail

APP_PORT="${1:-${APP_PORT:-2053}}"
SITE_NAME="${SITE_NAME:-atomic-ui}"
PANEL_PATH="${PANEL_PATH:-}"
ENABLE_FAIL2BAN="${ENABLE_FAIL2BAN:-true}"
LOGIN_LIMIT_RATE="${LOGIN_LIMIT_RATE:-20r/m}"
AUTH_LIMIT_RATE="${AUTH_LIMIT_RATE:-30r/m}"
LOGIN_LIMIT_BURST="${LOGIN_LIMIT_BURST:-12}"
AUTH_LIMIT_BURST="${AUTH_LIMIT_BURST:-15}"
HARDEN_CONF="/etc/nginx/conf.d/${SITE_NAME}-hardening.conf"
FAIL2BAN_FILTER="/etc/fail2ban/filter.d/${SITE_NAME}-login-abuse.conf"
FAIL2BAN_JAIL="/etc/fail2ban/jail.d/${SITE_NAME}.local"

if [[ -n "${PANEL_PATH}" ]]; then
  if [[ "${PANEL_PATH}" != /* ]]; then
    PANEL_PATH="/${PANEL_PATH}"
  fi
  PANEL_PATH="${PANEL_PATH%/}"
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq nginx >/dev/null
fi

if [[ -n "${PANEL_PATH}" ]]; then
  cat >"${HARDEN_CONF}" <<EOF
limit_req_zone \$binary_remote_addr zone=atomic_ui_login:10m rate=${LOGIN_LIMIT_RATE};
limit_req_zone \$binary_remote_addr zone=atomic_ui_auth:10m rate=${AUTH_LIMIT_RATE};
EOF
else
  rm -f "${HARDEN_CONF}"
fi

cat >/etc/nginx/sites-available/${SITE_NAME}.conf <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 32m;

$(if [[ -n "${PANEL_PATH}" ]]; then cat <<LOCATIONS
    location = ${PANEL_PATH}/login {
        limit_req zone=atomic_ui_login burst=${LOGIN_LIMIT_BURST} nodelay;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }

    location = ${PANEL_PATH}/api/trpc/auth.login {
        limit_req zone=atomic_ui_auth burst=${AUTH_LIMIT_BURST} nodelay;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
LOCATIONS
fi)

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/${SITE_NAME}.conf /etc/nginx/sites-enabled/${SITE_NAME}.conf

nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx
systemctl is-active nginx >/dev/null

if [[ "${ENABLE_FAIL2BAN}" == "true" && -n "${PANEL_PATH}" ]]; then
  apt-get install -y -qq fail2ban >/dev/null
  mkdir -p /etc/fail2ban/filter.d /etc/fail2ban/jail.d
  cat >"${FAIL2BAN_FILTER}" <<EOF
[Definition]
failregex = ^<HOST> - - \[[^\]]+\] "(?:GET|POST) ${PANEL_PATH}/login\?(?:[^"]*)(?:%%7Bphp%%7D|system\(|/proc/1/environ|%%2Fproc%%2F1%%2Fenviron|%%252Fproc%%252F1%%252Fenviron)(?:[^"]*) HTTP/.*" 200 .*$
ignoreregex =
EOF
  cat >"${FAIL2BAN_JAIL}" <<EOF
[${SITE_NAME}-login-abuse]
enabled = true
filter = ${SITE_NAME}-login-abuse
port = http,https
logpath = /var/log/nginx/access.log
findtime = 10m
maxretry = 4
bantime = 12h
backend = auto
EOF
  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban
fi

echo "nginx proxy configured on port 80 -> 127.0.0.1:${APP_PORT}"
