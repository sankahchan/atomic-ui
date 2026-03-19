#!/usr/bin/env bash

set -euo pipefail

APP_PORT="${1:-${APP_PORT:-2053}}"
SITE_NAME="${SITE_NAME:-atomic-ui}"
SITE_FILE="/etc/nginx/sites-available/${SITE_NAME}"
SITE_LINK="/etc/nginx/sites-enabled/${SITE_NAME}"
LEGACY_SITE_FILE="/etc/nginx/sites-available/${SITE_NAME}.conf"
LEGACY_SITE_LINK="/etc/nginx/sites-enabled/${SITE_NAME}.conf"
PANEL_PATH="${PANEL_PATH:-}"
PANEL_DOMAIN="${PANEL_DOMAIN:-}"
ENABLE_FAIL2BAN="${ENABLE_FAIL2BAN:-true}"
ALLOW_IP_FALLBACK="${ALLOW_IP_FALLBACK:-true}"
LOGIN_LIMIT_RATE="${LOGIN_LIMIT_RATE:-20r/m}"
AUTH_LIMIT_RATE="${AUTH_LIMIT_RATE:-30r/m}"
LOGIN_LIMIT_BURST="${LOGIN_LIMIT_BURST:-12}"
AUTH_LIMIT_BURST="${AUTH_LIMIT_BURST:-15}"
HARDEN_CONF="/etc/nginx/conf.d/${SITE_NAME}-hardening.conf"
FAIL2BAN_FILTER="/etc/fail2ban/filter.d/${SITE_NAME}-login-abuse.conf"
FAIL2BAN_JAIL="/etc/fail2ban/jail.d/${SITE_NAME}.local"

normalize_bool() {
  case "${1,,}" in
    1|true|yes|on) echo "true" ;;
    *) echo "false" ;;
  esac
}

normalize_host() {
  local value="${1#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  echo "${value,,}"
}

emit_rate_limited_locations() {
  if [[ -z "${PANEL_PATH}" ]]; then
    return
  fi

  cat <<EOF
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
EOF
}

emit_proxy_server() {
  local listen_args="$1"
  local server_name="$2"

  cat <<EOF
server {
    listen 80 ${listen_args};
    listen [::]:80 ${listen_args};
    server_name ${server_name};

    client_max_body_size 32m;

$(emit_rate_limited_locations)

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
}

emit_redirect_server() {
  local target_host="$1"

  cat <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        return 301 http://${target_host}\$request_uri;
    }
}
EOF
}

PANEL_DOMAIN="$(normalize_host "${PANEL_DOMAIN}")"
ALLOW_IP_FALLBACK="$(normalize_bool "${ALLOW_IP_FALLBACK}")"
ENABLE_FAIL2BAN="$(normalize_bool "${ENABLE_FAIL2BAN}")"

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

{
  if [[ -n "${PANEL_DOMAIN}" && "${ALLOW_IP_FALLBACK}" != "true" ]]; then
    emit_redirect_server "${PANEL_DOMAIN}"
  else
    emit_proxy_server "default_server" "_"
  fi

  if [[ -n "${PANEL_DOMAIN}" ]]; then
    emit_proxy_server "" "${PANEL_DOMAIN}"
  fi
} >"${SITE_FILE}"

rm -f /etc/nginx/sites-enabled/default
rm -f "${LEGACY_SITE_LINK}" "${LEGACY_SITE_FILE}"
ln -sf "${SITE_FILE}" "${SITE_LINK}"

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

if [[ -n "${PANEL_DOMAIN}" ]]; then
  if [[ "${ALLOW_IP_FALLBACK}" == "true" ]]; then
    echo "nginx proxy configured on port 80 for ${PANEL_DOMAIN} with IP fallback -> 127.0.0.1:${APP_PORT}"
  else
    echo "nginx proxy configured on port 80 for ${PANEL_DOMAIN}; IP access redirects to the domain"
  fi
else
  echo "nginx proxy configured on port 80 -> 127.0.0.1:${APP_PORT}"
fi
