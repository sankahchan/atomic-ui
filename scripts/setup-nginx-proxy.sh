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
PUBLIC_SHARE_DOMAIN="${PUBLIC_SHARE_DOMAIN:-}"
ENABLE_FAIL2BAN="${ENABLE_FAIL2BAN:-true}"
ALLOW_IP_FALLBACK="${ALLOW_IP_FALLBACK:-true}"
LOGIN_LIMIT_RATE="${LOGIN_LIMIT_RATE:-20r/m}"
AUTH_LIMIT_RATE="${AUTH_LIMIT_RATE:-30r/m}"
LOGIN_LIMIT_BURST="${LOGIN_LIMIT_BURST:-12}"
AUTH_LIMIT_BURST="${AUTH_LIMIT_BURST:-15}"
HARDEN_CONF="/etc/nginx/conf.d/${SITE_NAME}-hardening.conf"
FAIL2BAN_FILTER="/etc/fail2ban/filter.d/${SITE_NAME}-login-abuse.conf"
FAIL2BAN_AUTH_FILTER="/etc/fail2ban/filter.d/${SITE_NAME}-auth-login.conf"
FAIL2BAN_JAIL="/etc/fail2ban/jail.d/${SITE_NAME}.local"
ADMIN_LOGIN_FAIL2BAN_LOG="${ADMIN_LOGIN_FAIL2BAN_LOG:-/tmp/atomic-ui-admin-login.log}"
ADMIN_LOGIN_FAIL2BAN_JAIL="${ADMIN_LOGIN_FAIL2BAN_JAIL:-${SITE_NAME}-auth-login}"
SHARE_STATIC_DIR="/var/www/atomic-ui/share"
SHARE_BLOCKED_FILE="${SHARE_STATIC_DIR}/blocked.html"

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

install_share_blocked_page() {
  mkdir -p "${SHARE_STATIC_DIR}"
  cat >"${SHARE_BLOCKED_FILE}" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Public Share Site</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111f;
        --bg-glow: rgba(17, 198, 255, 0.16);
        --panel: rgba(11, 22, 42, 0.92);
        --border: rgba(77, 211, 255, 0.24);
        --text: #eef4ff;
        --muted: #9eb2cf;
        --accent: #33d6ff;
        --accent-strong: #1dd9ff;
        --button-text: #04111f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(26, 199, 255, 0.18), transparent 34%),
          radial-gradient(circle at bottom right, rgba(111, 76, 255, 0.18), transparent 30%),
          linear-gradient(180deg, #07111f 0%, #0a1425 100%);
        color: var(--text);
      }
      .card {
        width: min(100%, 640px);
        padding: 32px;
        border-radius: 28px;
        background: var(--panel);
        border: 1px solid var(--border);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.04);
        position: relative;
        overflow: hidden;
      }
      .card::before {
        content: "";
        position: absolute;
        inset: -120px auto auto -80px;
        width: 240px;
        height: 240px;
        background: var(--bg-glow);
        filter: blur(48px);
        pointer-events: none;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 14px;
        border-radius: 999px;
        background: rgba(51, 214, 255, 0.12);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      h1 {
        margin: 20px 0 12px;
        font-size: clamp(28px, 5vw, 42px);
        line-height: 1.05;
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.65;
      }
      .copy { display: grid; gap: 16px; }
      .copy p + p { font-size: 15px; }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 28px;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 14px 20px;
        font: inherit;
        cursor: pointer;
        transition: transform 0.18s ease;
      }
      button:hover { transform: translateY(-1px); }
      .primary {
        background: linear-gradient(135deg, var(--accent-strong), #8b5dff);
        color: var(--button-text);
        font-weight: 700;
      }
      .ghost {
        background: rgba(255, 255, 255, 0.04);
        color: var(--text);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .helper {
        margin-top: 24px;
        color: var(--muted);
        font-size: 13px;
      }
      @media (max-width: 640px) {
        .card { padding: 24px 20px; border-radius: 22px; }
        .actions { flex-direction: column; }
        button { width: 100%; }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="badge">Public Share Site</span>
      <h1>Timed out</h1>
      <div class="copy">
        <p>This link is not available on the public share site.</p>
        <p>အများသုံး share site မှာ ဒီလင့်ကို မဖွင့်နိုင်ပါ။</p>
      </div>
      <div class="actions">
        <button class="primary" type="button" onclick="window.history.length > 1 ? history.back() : window.location.href='/'">Go Back</button>
        <button class="ghost" type="button" onclick="window.history.length > 1 ? history.back() : window.location.href='/'">ရှေ့စာမျက်နှာသို့ ပြန်သွားရန်</button>
      </div>
      <p class="helper">Public links work only for subscription, invite, share, and client import routes.<br />အများသုံးလင့်များသည် subscription, invite, share နှင့် client import route များအတွက်သာ အသုံးပြုနိုင်ပါသည်။</p>
    </main>
  </body>
</html>
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

emit_share_proxy_location() {
  local location_prefix="$1"

  cat <<EOF
    location ^~ ${location_prefix} {
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

emit_share_exact_proxy_location() {
  local location_path="$1"

  cat <<EOF
    location = ${location_path} {
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

emit_public_share_locations() {
  cat <<EOF
    error_page 403 = /__atomic_share_blocked.html;

    location = /__atomic_share_blocked.html {
        internal;
        default_type text/html;
        alias ${SHARE_BLOCKED_FILE};
        add_header Cache-Control "no-store";
    }
EOF

  emit_share_proxy_location "/_next/"
  emit_share_exact_proxy_location "/favicon.ico"
  emit_share_proxy_location "/uploads/"

  if [[ -n "${PANEL_PATH}" ]]; then
    emit_share_proxy_location "${PANEL_PATH}/_next/"
    emit_share_exact_proxy_location "${PANEL_PATH}/favicon.ico"
    emit_share_proxy_location "${PANEL_PATH}/uploads/"
    emit_share_proxy_location "${PANEL_PATH}/sub/"
    emit_share_proxy_location "${PANEL_PATH}/s/"
    emit_share_proxy_location "${PANEL_PATH}/c/"
    emit_share_proxy_location "${PANEL_PATH}/share/"
    emit_share_proxy_location "${PANEL_PATH}/api/subscription/"
    emit_share_proxy_location "${PANEL_PATH}/api/sub/"
  else
    emit_share_proxy_location "/sub/"
    emit_share_proxy_location "/s/"
    emit_share_proxy_location "/c/"
    emit_share_proxy_location "/share/"
    emit_share_proxy_location "/api/subscription/"
    emit_share_proxy_location "/api/sub/"
  fi

  cat <<'EOF'
    location / {
        return 403;
    }
EOF
}

emit_share_proxy_server() {
  local listen_args="$1"
  local server_name="$2"

  cat <<EOF
server {
    listen 80 ${listen_args};
    listen [::]:80 ${listen_args};
    server_name ${server_name};

    client_max_body_size 32m;

$(emit_public_share_locations)
}
EOF
}

PANEL_DOMAIN="$(normalize_host "${PANEL_DOMAIN}")"
PUBLIC_SHARE_DOMAIN="$(normalize_host "${PUBLIC_SHARE_DOMAIN}")"
ALLOW_IP_FALLBACK="$(normalize_bool "${ALLOW_IP_FALLBACK}")"
ENABLE_FAIL2BAN="$(normalize_bool "${ENABLE_FAIL2BAN}")"

if [[ -n "${PANEL_DOMAIN}" && "${PUBLIC_SHARE_DOMAIN}" == "${PANEL_DOMAIN}" ]]; then
  echo "PUBLIC_SHARE_DOMAIN must be different from PANEL_DOMAIN" >&2
  exit 1
fi

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

install_share_blocked_page

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

  if [[ -n "${PUBLIC_SHARE_DOMAIN}" ]]; then
    emit_share_proxy_server "" "${PUBLIC_SHARE_DOMAIN}"
  fi
} >"${SITE_FILE}"

rm -f /etc/nginx/sites-enabled/default
rm -f "${LEGACY_SITE_LINK}" "${LEGACY_SITE_FILE}"
ln -sf "${SITE_FILE}" "${SITE_LINK}"

nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx
systemctl is-active nginx >/dev/null

if [[ "${ENABLE_FAIL2BAN}" == "true" ]]; then
  apt-get install -y -qq fail2ban >/dev/null
  mkdir -p /etc/fail2ban/filter.d /etc/fail2ban/jail.d
  if [[ -n "${PANEL_PATH}" ]]; then
    cat >"${FAIL2BAN_FILTER}" <<EOF
[Definition]
failregex = ^<HOST> - - \[[^\]]+\] "(?:GET|POST) ${PANEL_PATH}/login\?(?:[^"]*)(?:%%7Bphp%%7D|system\(|/proc/1/environ|%%2Fproc%%2F1%%2Fenviron|%%252Fproc%%252F1%%252Fenviron)(?:[^"]*) HTTP/.*" 200 .*$
ignoreregex =
EOF
  fi
  cat >"${FAIL2BAN_AUTH_FILTER}" <<EOF
[Definition]
failregex = ^\S+\s+ip=<HOST>\s+event=AUTH_LOGIN_FAILED\s+email=.*$
ignoreregex =
EOF
  touch "${ADMIN_LOGIN_FAIL2BAN_LOG}"
  chmod 0644 "${ADMIN_LOGIN_FAIL2BAN_LOG}"
  {
    if [[ -n "${PANEL_PATH}" ]]; then
      cat <<EOF
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
    fi
    cat <<EOF
[${ADMIN_LOGIN_FAIL2BAN_JAIL}]
enabled = true
filter = ${SITE_NAME}-auth-login
port = http,https
logpath = ${ADMIN_LOGIN_FAIL2BAN_LOG}
findtime = 10m
maxretry = 8
bantime = 12h
backend = auto
EOF
  } >"${FAIL2BAN_JAIL}"
fi
  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban
fi

if [[ -n "${PANEL_DOMAIN}" ]]; then
  if [[ "${ALLOW_IP_FALLBACK}" == "true" ]]; then
    if [[ -n "${PUBLIC_SHARE_DOMAIN}" ]]; then
      echo "nginx proxy configured on port 80 for ${PANEL_DOMAIN} with public share host ${PUBLIC_SHARE_DOMAIN} and IP fallback -> 127.0.0.1:${APP_PORT}"
    else
      echo "nginx proxy configured on port 80 for ${PANEL_DOMAIN} with IP fallback -> 127.0.0.1:${APP_PORT}"
    fi
  else
    if [[ -n "${PUBLIC_SHARE_DOMAIN}" ]]; then
      echo "nginx proxy configured on port 80 for ${PANEL_DOMAIN} with public share host ${PUBLIC_SHARE_DOMAIN}; IP access redirects to the domain"
    else
      echo "nginx proxy configured on port 80 for ${PANEL_DOMAIN}; IP access redirects to the domain"
    fi
  fi
elif [[ -n "${PUBLIC_SHARE_DOMAIN}" ]]; then
  echo "nginx proxy configured on port 80 for IP admin access with public share host ${PUBLIC_SHARE_DOMAIN}"
else
  echo "nginx proxy configured on port 80 -> 127.0.0.1:${APP_PORT}"
fi
