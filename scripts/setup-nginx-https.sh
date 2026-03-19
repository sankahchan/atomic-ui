#!/usr/bin/env bash

set -euo pipefail

APP_PORT="${1:-${APP_PORT:-2053}}"
ACME_EMAIL="${2:-${ACME_EMAIL:-}}"
SITE_NAME="${SITE_NAME:-atomic-ui}"
SITE_FILE="/etc/nginx/sites-available/${SITE_NAME}"
SITE_LINK="/etc/nginx/sites-enabled/${SITE_NAME}"
LEGACY_SITE_FILE="/etc/nginx/sites-available/${SITE_NAME}.conf"
LEGACY_SITE_LINK="/etc/nginx/sites-enabled/${SITE_NAME}.conf"
LEGO_VERSION="${LEGO_VERSION:-v4.32.0}"
LEGO_BIN="${LEGO_BIN:-/usr/local/bin/lego-latest}"
LEGO_PATH="${LEGO_PATH:-/root/.lego-ip-prod}"
LETSENCRYPT_WEBROOT="${LETSENCRYPT_WEBROOT:-/var/www/letsencrypt}"
PUBLIC_IP="${PUBLIC_IP:-$(curl -4 -fsSL https://ifconfig.me || true)}"
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

emit_acme_location() {
  cat <<EOF
    location ^~ /.well-known/acme-challenge/ {
        root ${LETSENCRYPT_WEBROOT};
        default_type text/plain;
        try_files \$uri =404;
    }
EOF
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
EOF
}

emit_https_security_headers() {
  cat <<'EOF'
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
EOF
}

emit_proxy_location() {
  cat <<EOF
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
        proxy_request_buffering off;
    }
EOF
}

emit_http_proxy_server() {
  local listen_args="$1"
  local server_name="$2"

  cat <<EOF
server {
    listen 80 ${listen_args};
    listen [::]:80 ${listen_args};
    server_name ${server_name};

    client_max_body_size 32m;

$(emit_acme_location)

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

emit_http_redirect_server() {
  local listen_args="$1"
  local server_name="$2"
  local target_url="$3"

  cat <<EOF
server {
    listen 80 ${listen_args};
    listen [::]:80 ${listen_args};
    server_name ${server_name};

    client_max_body_size 32m;

$(emit_acme_location)

    location / {
        return 301 ${target_url}\$request_uri;
    }
}
EOF
}

emit_https_proxy_server() {
  local listen_args="$1"
  local server_name="$2"
  local cert_path="$3"
  local key_path="$4"

  cat <<EOF
server {
    listen 443 ssl http2 ${listen_args};
    listen [::]:443 ssl http2 ${listen_args};
    server_name ${server_name};

    client_max_body_size 32m;
    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};

$(emit_https_security_headers)

$(emit_rate_limited_locations)

$(emit_proxy_location)
}
EOF
}

emit_https_redirect_server() {
  local listen_args="$1"
  local server_name="$2"
  local cert_path="$3"
  local key_path="$4"
  local target_host="$5"

  cat <<EOF
server {
    listen 443 ssl http2 ${listen_args};
    listen [::]:443 ssl http2 ${listen_args};
    server_name ${server_name};

    client_max_body_size 32m;
    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};

$(emit_https_security_headers)

    location / {
        return 301 https://${target_host}\$request_uri;
    }
}
EOF
}

install_lego() {
  if [[ -x "${LEGO_BIN}" ]]; then
    return
  fi

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "${tmpdir}"' EXIT
  curl -fsSL -o "${tmpdir}/lego.tgz" "https://github.com/go-acme/lego/releases/download/${LEGO_VERSION}/lego_${LEGO_VERSION}_linux_amd64.tar.gz"
  tar -xzf "${tmpdir}/lego.tgz" -C "${tmpdir}" lego
  install -m 0755 "${tmpdir}/lego" "${LEGO_BIN}"
}

issue_ip_certificate() {
  install_lego

  "${LEGO_BIN}" \
    --accept-tos \
    --email "${ACME_EMAIL}" \
    --disable-cn \
    --http \
    --http.webroot "${LETSENCRYPT_WEBROOT}" \
    --path "${LEGO_PATH}" \
    -d "${PUBLIC_IP}" \
    run --profile shortlived
}

issue_domain_certificate() {
  apt-get install -y -qq certbot >/dev/null
  certbot certonly \
    --webroot \
    -w "${LETSENCRYPT_WEBROOT}" \
    -d "${PANEL_DOMAIN}" \
    --email "${ACME_EMAIL}" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring
}

configure_ip_renewal() {
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
}

disable_ip_renewal() {
  systemctl disable --now atomic-ui-cert-renew.timer >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/atomic-ui-cert-renew.service /etc/systemd/system/atomic-ui-cert-renew.timer
  systemctl daemon-reload
  systemctl reset-failed atomic-ui-cert-renew.service >/dev/null 2>&1 || true
}

configure_fail2ban() {
  if [[ "${ENABLE_FAIL2BAN}" != "true" || -z "${PANEL_PATH}" ]]; then
    return
  fi

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

if [[ -z "${PUBLIC_IP}" ]]; then
  echo "Unable to determine public IP" >&2
  exit 1
fi

if [[ -z "${ACME_EMAIL}" ]]; then
  if [[ -n "${PANEL_DOMAIN}" ]]; then
    ACME_EMAIL="admin@${PANEL_DOMAIN}"
  else
    ACME_EMAIL="admin@${PUBLIC_IP//./-}.sslip.io"
  fi
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

{
  if [[ -n "${PANEL_DOMAIN}" ]]; then
    if [[ "${ALLOW_IP_FALLBACK}" == "true" ]]; then
      emit_http_proxy_server "default_server" "_"
    else
      emit_http_redirect_server "default_server" "_" "http://${PANEL_DOMAIN}"
    fi
    emit_http_proxy_server "" "${PANEL_DOMAIN}"
  else
    emit_http_proxy_server "default_server" "_"
  fi
} >"${SITE_FILE}"

rm -f /etc/nginx/sites-enabled/default
rm -f "${LEGACY_SITE_LINK}" "${LEGACY_SITE_FILE}"
ln -sf "${SITE_FILE}" "${SITE_LINK}"
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

issue_domain_cert="false"
issue_ip_cert="true"

if [[ -n "${PANEL_DOMAIN}" ]]; then
  issue_domain_cert="true"
  if [[ "${ALLOW_IP_FALLBACK}" == "true" ]]; then
    issue_ip_cert="true"
  else
    issue_ip_cert="false"
  fi
fi

if [[ "${issue_domain_cert}" == "true" ]]; then
  issue_domain_certificate
  systemctl enable --now certbot.timer >/dev/null 2>&1 || true
fi

if [[ "${issue_ip_cert}" == "true" ]]; then
  issue_ip_certificate
  configure_ip_renewal
else
  disable_ip_renewal
fi

ip_cert_path="${LEGO_PATH}/certificates/${PUBLIC_IP}.crt"
ip_key_path="${LEGO_PATH}/certificates/${PUBLIC_IP}.key"
domain_cert_path="/etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem"
domain_key_path="/etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem"

{
  if [[ -n "${PANEL_DOMAIN}" ]]; then
    if [[ "${ALLOW_IP_FALLBACK}" == "true" ]]; then
      emit_http_redirect_server "default_server" "_" "https://${PUBLIC_IP}"
      emit_http_redirect_server "" "${PANEL_DOMAIN}" "https://${PANEL_DOMAIN}"
      emit_https_proxy_server "default_server" "_" "${ip_cert_path}" "${ip_key_path}"
      emit_https_proxy_server "" "${PANEL_DOMAIN}" "${domain_cert_path}" "${domain_key_path}"
    else
      emit_http_redirect_server "default_server" "_" "https://${PANEL_DOMAIN}"
      emit_http_redirect_server "" "${PANEL_DOMAIN}" "https://${PANEL_DOMAIN}"
      emit_https_redirect_server "default_server" "_" "${domain_cert_path}" "${domain_key_path}" "${PANEL_DOMAIN}"
      emit_https_proxy_server "" "${PANEL_DOMAIN}" "${domain_cert_path}" "${domain_key_path}"
    fi
  else
    emit_http_redirect_server "default_server" "_" "https://\$host"
    emit_https_proxy_server "default_server" "_" "${ip_cert_path}" "${ip_key_path}"
  fi
} >"${SITE_FILE}"

nginx -t
systemctl restart nginx

configure_fail2ban

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

if [[ -n "${PANEL_DOMAIN}" ]]; then
  if [[ "${ALLOW_IP_FALLBACK}" == "true" ]]; then
    echo "HTTPS enabled for https://${PANEL_DOMAIN}/ with HTTPS IP fallback at https://${PUBLIC_IP}/"
  else
    echo "HTTPS enabled for https://${PANEL_DOMAIN}/"
  fi
else
  echo "HTTPS enabled for https://${PUBLIC_IP}/"
fi
