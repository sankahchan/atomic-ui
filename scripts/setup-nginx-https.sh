#!/usr/bin/env bash

set -euo pipefail

APP_PORT="${1:-${APP_PORT:-2053}}"
ACME_EMAIL="${2:-${ACME_EMAIL:-}}"
SITE_NAME="${SITE_NAME:-atomic-ui}"
LEGO_VERSION="${LEGO_VERSION:-v4.32.0}"
LEGO_BIN="${LEGO_BIN:-/usr/local/bin/lego-latest}"
LEGO_PATH="${LEGO_PATH:-/root/.lego-ip-prod}"
LETSENCRYPT_WEBROOT="${LETSENCRYPT_WEBROOT:-/var/www/letsencrypt}"
PUBLIC_IP="${PUBLIC_IP:-$(curl -4 -fsSL https://ifconfig.me || true)}"
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

if [[ -z "${PUBLIC_IP}" ]]; then
  echo "Unable to determine public IP" >&2
  exit 1
fi

if [[ -z "${ACME_EMAIL}" ]]; then
  ACME_EMAIL="admin@${PUBLIC_IP//./-}.sslip.io"
  echo "Using placeholder ACME contact email: ${ACME_EMAIL}" >&2
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq >/dev/null
apt-get install -y -qq nginx curl >/dev/null

mkdir -p "${LETSENCRYPT_WEBROOT}/.well-known/acme-challenge"

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

    location ^~ /.well-known/acme-challenge/ {
        root ${LETSENCRYPT_WEBROOT};
        default_type text/plain;
        try_files \$uri =404;
    }

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

if [[ ! -x "${LEGO_BIN}" ]]; then
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "${tmpdir}"' EXIT
  curl -fsSL -o "${tmpdir}/lego.tgz" "https://github.com/go-acme/lego/releases/download/${LEGO_VERSION}/lego_${LEGO_VERSION}_linux_amd64.tar.gz"
  tar -xzf "${tmpdir}/lego.tgz" -C "${tmpdir}" lego
  install -m 0755 "${tmpdir}/lego" "${LEGO_BIN}"
fi

"${LEGO_BIN}" \
  --accept-tos \
  --email "${ACME_EMAIL}" \
  --disable-cn \
  --http \
  --http.webroot "${LETSENCRYPT_WEBROOT}" \
  --path "${LEGO_PATH}" \
  -d "${PUBLIC_IP}" \
  run --profile shortlived

cat >/etc/nginx/sites-available/${SITE_NAME}.conf <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 32m;

    location ^~ /.well-known/acme-challenge/ {
        root ${LETSENCRYPT_WEBROOT};
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name _;

    client_max_body_size 32m;

    ssl_certificate ${LEGO_PATH}/certificates/${PUBLIC_IP}.crt;
    ssl_certificate_key ${LEGO_PATH}/certificates/${PUBLIC_IP}.key;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

$(if [[ -n "${PANEL_PATH}" ]]; then cat <<LOCATIONS
    location = ${PANEL_PATH}/login {
        limit_req zone=atomic_ui_login burst=${LOGIN_LIMIT_BURST} nodelay;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
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
        proxy_set_header X-Forwarded-Proto https;
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
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
EOF

nginx -t
systemctl restart nginx

cat >/etc/systemd/system/atomic-ui-cert-renew.service <<EOF
[Unit]
Description=Renew Atomic-UI HTTPS certificate
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/sh -lc '${LEGO_BIN} --accept-tos --email ${ACME_EMAIL} --disable-cn --http --http.webroot ${LETSENCRYPT_WEBROOT} --path ${LEGO_PATH} -d ${PUBLIC_IP} renew --dynamic --profile shortlived --renew-hook "systemctl reload nginx"'
EOF

cat >/etc/systemd/system/atomic-ui-cert-renew.timer <<'EOF'
[Unit]
Description=Run Atomic-UI certificate renewal twice daily

[Timer]
OnBootSec=10m
OnUnitActiveSec=12h
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now atomic-ui-cert-renew.timer >/dev/null 2>&1

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

if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw reload >/dev/null 2>&1 || true
fi

if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save >/dev/null 2>&1 || true
  fi
fi

echo "HTTPS enabled for https://${PUBLIC_IP}/"
