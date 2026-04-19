#!/bin/bash

#############################################
# Atomic-UI Quick Installation Script
# One-command installation for Ubuntu/Debian VPS
#
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh)
#
# Or download and run:
#   curl -fsSL https://raw.githubusercontent.com/sankahchan/atomic-ui/main/install.sh -o install.sh
#   sudo bash install.sh
#############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Config
INSTALL_DIR="/opt/atomic-ui"
GITHUB_REPO="sankahchan/atomic-ui"
DEFAULT_PORT=2053  # Fixed port like 3x-ui
CLEANUP_ON_FAILURE=true
INSTALL_HTTPS_MODE="${INSTALL_HTTPS:-auto}"
ACME_CONTACT_EMAIL="${ACME_EMAIL:-}"
PANEL_DOMAIN_INPUT="${PANEL_DOMAIN:-}"
PUBLIC_SHARE_DOMAIN_INPUT="${PUBLIC_SHARE_DOMAIN:-}"
ALLOW_IP_FALLBACK_INPUT="${ALLOW_IP_FALLBACK:-true}"
DEFAULT_ADMIN_USERNAME_INPUT="${DEFAULT_ADMIN_USERNAME:-admin}"
DEFAULT_ADMIN_PASSWORD_INPUT="${DEFAULT_ADMIN_PASSWORD:-admin123}"
TELEGRAM_BOT_TOKEN_INPUT="${TELEGRAM_BOT_TOKEN:-}"

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

set_env_var() {
    local key="$1"
    local value="$2"

    if grep -q "^${key}=" .env; then
        sed -i "s|^${key}=.*|${key}=\"${value}\"|g" .env
    else
        echo "${key}=\"${value}\"" >> .env
    fi
}

# Cleanup function for installation failure
cleanup_installation() {
    if [ "$CLEANUP_ON_FAILURE" = true ]; then
        echo -e "${YELLOW}[!]${NC} Cleaning up failed installation..."
        systemctl stop atomic-ui 2>/dev/null || true
        systemctl disable atomic-ui 2>/dev/null || true
        rm -f /etc/systemd/system/atomic-ui.service
        rm -f /usr/local/bin/atomic-ui
        rm -rf "$INSTALL_DIR"
        systemctl daemon-reload 2>/dev/null || true
        echo -e "${YELLOW}[!]${NC} Cleanup complete"
    fi
}

# Error handler
handle_error() {
    local exit_code=$?
    local line_number=$1
    echo -e "${RED}[✗]${NC} Installation failed at line $line_number (exit code: $exit_code)"
    cleanup_installation
    exit $exit_code
}

# Set up error trap
trap 'handle_error $LINENO' ERR

# Generate random path for security (like 3x-ui)
generate_random_path() {
    # Generate a random 8-character alphanumeric string
    openssl rand -hex 4
}

echo -e "${CYAN}"
echo "============================================================="
echo "                                                             "
echo "              ATOMIC-UI INSTALLER                            "
echo "         Outline VPN Management Panel                        "
echo "                                                             "
echo "============================================================="
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[✗] Please run as root (use sudo)${NC}"
    exit 1
fi

PANEL_DOMAIN="$(normalize_host "${PANEL_DOMAIN_INPUT}")"
PUBLIC_SHARE_DOMAIN="$(normalize_host "${PUBLIC_SHARE_DOMAIN_INPUT}")"
ALLOW_IP_FALLBACK="$(normalize_bool "${ALLOW_IP_FALLBACK_INPUT}")"

if [ -n "${PANEL_DOMAIN}" ] && [ "${PUBLIC_SHARE_DOMAIN}" = "${PANEL_DOMAIN}" ]; then
    echo -e "${RED}[✗]${NC} PUBLIC_SHARE_DOMAIN must be different from PANEL_DOMAIN"
    exit 1
fi

# Check system
echo -e "${BLUE}[*]${NC} Checking system requirements..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo -e "${GREEN}[✓]${NC} Detected: $PRETTY_NAME"
else
    echo -e "${YELLOW}[!]${NC} Could not detect OS"
fi

# Use fixed port 2053
PANEL_PORT=${DEFAULT_PORT}
echo -e "${GREEN}[✓]${NC} Panel port: ${CYAN}${PANEL_PORT}${NC} (fixed)"

# Generate random path for security
echo -e "${BLUE}[*]${NC} Generating secure random path..."
PANEL_PATH=$(generate_random_path)
echo -e "${GREEN}[✓]${NC} Panel path: ${CYAN}/${PANEL_PATH}/${NC}"

# Check for port conflicts
echo -e "${BLUE}[*]${NC} Checking for port conflicts..."
if command -v lsof &> /dev/null && lsof -i :${PANEL_PORT} > /dev/null 2>&1; then
    echo -e "${RED}[✗]${NC} Port ${PANEL_PORT} is already in use!"
    echo -e "${YELLOW}[!]${NC} Please stop the service using port ${PANEL_PORT} and try again."
    exit 1
fi

# Install dependencies
echo -e "${BLUE}[*]${NC} Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq git curl wget unzip openssl lsof postgresql-client > /dev/null

# Ensure swap exists for low-memory VPS (1GB RAM)
echo -e "${BLUE}[*]${NC} Checking memory and swap..."
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
echo -e "${GREEN}[✓]${NC} RAM: ${TOTAL_RAM_MB}MB, Swap: ${SWAP_MB}MB"

if [ "$SWAP_MB" -lt 512 ] && [ "$TOTAL_RAM_MB" -lt 2048 ]; then
    echo -e "${YELLOW}[!]${NC} Low memory detected. Creating 2GB swap for build..."
    if [ ! -f /swapfile ]; then
        fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
        chmod 600 /swapfile
        mkswap /swapfile > /dev/null
        swapon /swapfile
        # Persist across reboots
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
        echo -e "${GREEN}[✓]${NC} 2GB swap created and activated"
    else
        # Swap file exists but not active
        if ! swapon --show | grep -q '/swapfile'; then
            swapon /swapfile 2>/dev/null || true
        fi
        echo -e "${GREEN}[✓]${NC} Existing swap activated"
    fi
fi

# Install Node.js if needed
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]; then
    echo -e "${BLUE}[*]${NC} Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null
fi
echo -e "${GREEN}[✓]${NC} Node.js $(node -v) ready"

# Clone repository
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}[!]${NC} Removing existing installation..."
    rm -rf "$INSTALL_DIR"
fi

echo -e "${BLUE}[*]${NC} Downloading Atomic-UI..."
if ! git clone --depth 1 "https://github.com/${GITHUB_REPO}.git" "$INSTALL_DIR" 2>&1; then
    echo -e "${RED}[✗]${NC} Failed to clone repository from GitHub"
    echo -e "${YELLOW}[!]${NC} Please check your internet connection and try again"
    exit 1
fi

if [ ! -d "$INSTALL_DIR" ] || [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${RED}[✗]${NC} Repository clone failed - package.json not found"
    exit 1
fi
echo -e "${GREEN}[✓]${NC} Downloaded to $INSTALL_DIR"

cd "$INSTALL_DIR"

# Clean install npm dependencies (memory-limited for low-RAM VPS)
echo -e "${BLUE}[*]${NC} Installing npm dependencies..."
rm -rf node_modules .next package-lock.json 2>/dev/null || true
export NODE_OPTIONS="--max-old-space-size=1024"
if ! npm install --production=false --silent 2>&1; then
    echo -e "${YELLOW}[!]${NC} npm install failed, trying with --legacy-peer-deps..."
    if ! npm install --production=false --legacy-peer-deps --silent 2>&1; then
        echo -e "${RED}[✗]${NC} npm install failed"
        echo -e "${YELLOW}[!]${NC} Please check your Node.js version and try again"
        exit 1
    fi
fi
unset NODE_OPTIONS

if [ ! -d "$INSTALL_DIR/node_modules" ]; then
    echo -e "${RED}[✗]${NC} node_modules directory not found after npm install"
    exit 1
fi
echo -e "${GREEN}[✓]${NC} Dependencies installed"

# Setup environment with random port
echo -e "${BLUE}[*]${NC} Configuring environment..."

# Check .env.example exists before copy
if [ ! -f .env.example ]; then
    echo -e "${RED}[✗]${NC} .env.example file not found"
    exit 1
fi
cp .env.example .env

# Generate secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)
sed -i "s|your-super-secret-jwt-key-change-this-in-production|${JWT_SECRET}|g" .env
TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 24)

if grep -q "^TOTP_ENCRYPTION_KEY=" .env; then
    sed -i "s|^TOTP_ENCRYPTION_KEY=.*|TOTP_ENCRYPTION_KEY=${TOTP_ENCRYPTION_KEY}|g" .env
else
    echo "TOTP_ENCRYPTION_KEY=${TOTP_ENCRYPTION_KEY}" >> .env
fi

if grep -q "^CRON_SECRET=" .env; then
    sed -i "s|^CRON_SECRET=.*|CRON_SECRET=${CRON_SECRET}|g" .env
else
    echo "CRON_SECRET=${CRON_SECRET}" >> .env
fi

if grep -q "^LOG_LEVEL=" .env; then
    sed -i "s|^LOG_LEVEL=.*|LOG_LEVEL=info|g" .env
else
    echo "LOG_LEVEL=info" >> .env
fi

set_env_var "DEFAULT_ADMIN_USERNAME" "${DEFAULT_ADMIN_USERNAME_INPUT}"
set_env_var "DEFAULT_ADMIN_PASSWORD" "${DEFAULT_ADMIN_PASSWORD_INPUT}"
if [ -n "${TELEGRAM_BOT_TOKEN_INPUT}" ]; then
    set_env_var "TELEGRAM_BOT_TOKEN" "${TELEGRAM_BOT_TOKEN_INPUT}"
fi

# Get server IP
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")
PUBLIC_HOST="${SERVER_IP}"
if [ -n "${PANEL_DOMAIN}" ]; then
    PUBLIC_HOST="${PANEL_DOMAIN}"
fi
PUBLIC_ORIGIN="http://${PUBLIC_HOST}"
PUBLIC_PANEL_URL="${PUBLIC_ORIGIN}/${PANEL_PATH}/"
PUBLIC_SHARE_ORIGIN=""
PUBLIC_SHARE_URL=""
HTTPS_ENABLED=false
HTTPS_NOTE="HTTP reverse proxy enabled on port 80."
IP_FALLBACK_URL=""

if [ -n "${PANEL_DOMAIN}" ] && [ "${ALLOW_IP_FALLBACK}" = "true" ]; then
    IP_FALLBACK_URL="http://${SERVER_IP}/${PANEL_PATH}/"
fi

if [ -n "${PUBLIC_SHARE_DOMAIN}" ]; then
    PUBLIC_SHARE_ORIGIN="http://${PUBLIC_SHARE_DOMAIN}"
    PUBLIC_SHARE_URL="${PUBLIC_SHARE_ORIGIN}/${PANEL_PATH}/"
fi

# Set public application URL in .env
set_env_var "APP_URL" "${PUBLIC_ORIGIN}"
set_env_var "NEXT_PUBLIC_APP_URL" "${PUBLIC_ORIGIN}"
set_env_var "PUBLIC_SHARE_URL" "${PUBLIC_SHARE_ORIGIN}"
set_env_var "NEXT_PUBLIC_PUBLIC_SHARE_URL" "${PUBLIC_SHARE_ORIGIN}"

# Add PORT to .env if not exists
if ! grep -q "^PORT=" .env; then
    echo "PORT=${PANEL_PORT}" >> .env
else
    sed -i "s|^PORT=.*|PORT=${PANEL_PORT}|g" .env
fi

# Add PANEL_PATH and NEXT_PUBLIC_PANEL_PATH to .env
if ! grep -q "^PANEL_PATH=" .env; then
    echo "PANEL_PATH=/${PANEL_PATH}" >> .env
    echo "NEXT_PUBLIC_PANEL_PATH=/${PANEL_PATH}" >> .env
else
    sed -i "s|^PANEL_PATH=.*|PANEL_PATH=/${PANEL_PATH}|g" .env
    # Update NEXT_PUBLIC var too if exists, or append
    if grep -q "^NEXT_PUBLIC_PANEL_PATH=" .env; then
        sed -i "s|^NEXT_PUBLIC_PANEL_PATH=.*|NEXT_PUBLIC_PANEL_PATH=/${PANEL_PATH}|g" .env
    else
        echo "NEXT_PUBLIC_PANEL_PATH=/${PANEL_PATH}" >> .env
    fi
fi

echo -e "${GREEN}[✓]${NC} Environment configured"

if [ -n "${PANEL_DOMAIN}" ]; then
    echo -e "${GREEN}[✓]${NC} Domain mode: ${CYAN}${PANEL_DOMAIN}${NC}"
    if [ "${ALLOW_IP_FALLBACK}" = "true" ]; then
        echo -e "${GREEN}[✓]${NC} IP fallback: ${CYAN}enabled${NC}"
    else
        echo -e "${GREEN}[✓]${NC} IP fallback: ${CYAN}redirect to domain${NC}"
    fi
else
    echo -e "${GREEN}[✓]${NC} Domain mode: ${CYAN}disabled (IP mode)${NC}"
fi

if [ -n "${PUBLIC_SHARE_DOMAIN}" ]; then
    echo -e "${GREEN}[✓]${NC} Public share host: ${CYAN}${PUBLIC_SHARE_DOMAIN}${NC}"
else
    echo -e "${GREEN}[✓]${NC} Public share host: ${CYAN}disabled (shares use app origin)${NC}"
fi

# Prefer HTTPS by default so fresh installs come up on the public origin.
if [ "${INSTALL_HTTPS_MODE}" != "false" ]; then
    if [ -n "${PANEL_DOMAIN}" ]; then
        echo -e "${BLUE}[*]${NC} Attempting HTTPS setup for domain ${CYAN}${PANEL_DOMAIN}${NC}..."
    else
        echo -e "${BLUE}[*]${NC} Attempting HTTPS setup on public IP..."
    fi
    chmod +x "$INSTALL_DIR/scripts/setup-nginx-https.sh"

    if APP_PORT="${PANEL_PORT}" PANEL_PATH="/${PANEL_PATH}" PANEL_DOMAIN="${PANEL_DOMAIN}" PUBLIC_SHARE_DOMAIN="${PUBLIC_SHARE_DOMAIN}" ALLOW_IP_FALLBACK="${ALLOW_IP_FALLBACK}" ENABLE_FAIL2BAN=true ACME_EMAIL="${ACME_CONTACT_EMAIL}" bash "$INSTALL_DIR/scripts/setup-nginx-https.sh" "${PANEL_PORT}" "${ACME_CONTACT_EMAIL}"; then
        HTTPS_ENABLED=true
        if [ -n "${PANEL_DOMAIN}" ]; then
            PUBLIC_ORIGIN="https://${PANEL_DOMAIN}"
            if [ "${ALLOW_IP_FALLBACK}" = "true" ]; then
                IP_FALLBACK_URL="https://${SERVER_IP}/${PANEL_PATH}/"
                HTTPS_NOTE="HTTPS enabled for ${PANEL_DOMAIN}. The original IP remains available over HTTPS as a fallback."
            else
                IP_FALLBACK_URL=""
                HTTPS_NOTE="HTTPS enabled for ${PANEL_DOMAIN}. Raw IP traffic redirects to the domain."
            fi
        else
            PUBLIC_ORIGIN="https://${SERVER_IP}"
            HTTPS_NOTE="HTTPS enabled with a short-lived Let's Encrypt IP certificate. Renewal timer is installed automatically."
        fi
        PUBLIC_PANEL_URL="${PUBLIC_ORIGIN}/${PANEL_PATH}/"
        if [ -n "${PUBLIC_SHARE_DOMAIN}" ]; then
            PUBLIC_SHARE_ORIGIN="https://${PUBLIC_SHARE_DOMAIN}"
            PUBLIC_SHARE_URL="${PUBLIC_SHARE_ORIGIN}/${PANEL_PATH}/"
        fi
        set_env_var "APP_URL" "${PUBLIC_ORIGIN}"
        set_env_var "NEXT_PUBLIC_APP_URL" "${PUBLIC_ORIGIN}"
        set_env_var "PUBLIC_SHARE_URL" "${PUBLIC_SHARE_ORIGIN}"
        set_env_var "NEXT_PUBLIC_PUBLIC_SHARE_URL" "${PUBLIC_SHARE_ORIGIN}"
        echo -e "${GREEN}[✓]${NC} HTTPS enabled at ${CYAN}${PUBLIC_ORIGIN}${NC}"
    else
        if [ "${INSTALL_HTTPS_MODE}" = "require" ]; then
            echo -e "${RED}[✗]${NC} HTTPS setup failed and INSTALL_HTTPS=require"
            exit 1
        fi

        echo -e "${YELLOW}[!]${NC} HTTPS setup failed. Falling back to HTTP reverse proxy."
        if [ -n "${PANEL_DOMAIN}" ]; then
            HTTPS_NOTE="HTTPS setup failed during install; the panel is exposed on HTTP for ${PUBLIC_HOST}. Re-run scripts/setup-nginx-https.sh after DNS or ACME issues are fixed."
        else
            HTTPS_NOTE="HTTPS setup failed during install; panel is exposed on HTTP via nginx. Re-run scripts/setup-nginx-https.sh later."
        fi
    fi
fi

# Setup database
echo -e "${BLUE}[*]${NC} Setting up database..."
mkdir -p prisma/data
DB_PATH="${INSTALL_DIR}/prisma/data/atomic-ui.db"
set_env_var "DATABASE_URL" "file:${DB_PATH}"

echo -e "${BLUE}[*]${NC} Generating Prisma client..."
if ! sh scripts/prisma-command.sh generate 2>&1; then
    echo -e "${RED}[✗]${NC} Prisma generate failed"
    exit 1
fi

echo -e "${BLUE}[*]${NC} Pushing database schema..."
if ! node scripts/prisma-safe-db-push.js 2>&1; then
    echo -e "${RED}[✗]${NC} Prisma db push failed"
    exit 1
fi

echo -e "${BLUE}[*]${NC} Running initial setup..."
if ! npm run setup 2>&1; then
    echo -e "${YELLOW}[!]${NC} npm run setup failed (may be okay for fresh installs)"
fi
echo -e "${GREEN}[✓]${NC} Database ready"

# Validate generated production env before build
echo -e "${BLUE}[*]${NC} Validating production environment..."
if ! npm run env:check -- --env-file=.env 2>&1; then
    echo -e "${RED}[✗]${NC} Environment validation failed"
    exit 1
fi

# Build
echo -e "${BLUE}[*]${NC} Building application..."
if ! NODE_HEAP_MB=640 PUBLISH_STANDALONE=true bash scripts/build-low-memory.sh 2>&1; then
    echo -e "${RED}[✗]${NC} Build failed"
    echo -e "${YELLOW}[!]${NC} Please check the build output above for errors"
    exit 1
fi

if [ ! -d "$INSTALL_DIR/.next" ]; then
    echo -e "${RED}[✗]${NC} Build output not found (.next directory missing)"
    exit 1
fi
echo -e "${GREEN}[✓]${NC} Build complete"

# Create service with random port (using standalone for low memory)
echo -e "${BLUE}[*]${NC} Creating systemd service..."
APP_DIR="${INSTALL_DIR}" \
SERVICE_NAME="atomic-ui.service" \
PORT_FALLBACK="${PANEL_PORT}" \
NODE_OPTIONS_VALUE="--max-old-space-size=384" \
EXEC_START="/usr/bin/node ${INSTALL_DIR}/.next/standalone/server.js" \
    bash "${INSTALL_DIR}/scripts/sync-systemd-service.sh"

systemctl start atomic-ui

# Service startup verification with retry
echo -e "${BLUE}[*]${NC} Verifying service startup..."
MAX_RETRIES=5
RETRY_DELAY=3
SERVICE_STARTED=false

for i in $(seq 1 $MAX_RETRIES); do
    sleep $RETRY_DELAY
    if systemctl is-active --quiet atomic-ui; then
        SERVICE_STARTED=true
        break
    fi
    echo -e "${YELLOW}[!]${NC} Waiting for service to start (attempt $i/$MAX_RETRIES)..."
done

if [ "$SERVICE_STARTED" = false ]; then
    echo -e "${RED}[✗]${NC} Service failed to start after $MAX_RETRIES attempts"
    echo -e "${YELLOW}[!]${NC} Check logs with: journalctl -u atomic-ui -n 50"
    systemctl status atomic-ui --no-pager || true
    exit 1
fi

echo -e "${GREEN}[✓]${NC} Service started on port ${PANEL_PORT}"

if [ "$HTTPS_ENABLED" = false ]; then
    echo -e "${BLUE}[*]${NC} Configuring nginx reverse proxy..."
    chmod +x "$INSTALL_DIR/scripts/setup-nginx-proxy.sh"
    PANEL_PATH="/${PANEL_PATH}" PANEL_DOMAIN="${PANEL_DOMAIN}" PUBLIC_SHARE_DOMAIN="${PUBLIC_SHARE_DOMAIN}" ALLOW_IP_FALLBACK="${ALLOW_IP_FALLBACK}" ENABLE_FAIL2BAN=true bash "$INSTALL_DIR/scripts/setup-nginx-proxy.sh" "${PANEL_PORT}"
    echo -e "${GREEN}[✓]${NC} nginx proxy is serving ${CYAN}${PUBLIC_ORIGIN}${NC}"
fi

# Disable cleanup after successful installation
CLEANUP_ON_FAILURE=false

# Install management script
chmod +x "$INSTALL_DIR/atomic-ui.sh"
cp "$INSTALL_DIR/atomic-ui.sh" /usr/local/bin/atomic-ui
echo -e "${GREEN}[✓]${NC} Management script installed"

# Firewall - Configure for access
echo -e "${BLUE}[*]${NC} Configuring firewall..."

# 1. Try UFW
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 22/tcp > /dev/null 2>&1 # Ensure SSH is safe
    if [ "$HTTPS_ENABLED" = true ]; then
        ufw allow 443/tcp > /dev/null 2>&1
    fi
    ufw reload > /dev/null 2>&1
    echo -e "${GREEN}[✓]${NC} UFW configured for public access ports"
fi

# 2. Try iptables (common fallback)
if command -v iptables &> /dev/null; then
    if ! iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null; then
        iptables -I INPUT -p tcp --dport 80 -j ACCEPT
    fi
    if [ "$HTTPS_ENABLED" = true ] && ! iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; then
        iptables -I INPUT -p tcp --dport 443 -j ACCEPT
    fi

    if command -v netfilter-persistent &> /dev/null; then
        netfilter-persistent save > /dev/null 2>&1
    elif [ -d /etc/iptables ]; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
fi

# Save port and path to config files for the management script
echo "${PANEL_PORT}" > "$INSTALL_DIR/.panel_port"
echo "/${PANEL_PATH}" > "$INSTALL_DIR/.panel_path"
echo "${PUBLIC_ORIGIN}" > "$INSTALL_DIR/.public_origin"
if [ -n "${PUBLIC_SHARE_ORIGIN}" ]; then
    echo "${PUBLIC_SHARE_ORIGIN}" > "$INSTALL_DIR/.public_share_origin"
else
    rm -f "$INSTALL_DIR/.public_share_origin"
fi
if [ -n "${PANEL_DOMAIN}" ]; then
    echo "${PANEL_DOMAIN}" > "$INSTALL_DIR/.panel_domain"
else
    rm -f "$INSTALL_DIR/.panel_domain"
fi
if [ -n "${PUBLIC_SHARE_DOMAIN}" ]; then
    echo "${PUBLIC_SHARE_DOMAIN}" > "$INSTALL_DIR/.public_share_domain"
else
    rm -f "$INSTALL_DIR/.public_share_domain"
fi
echo "${ALLOW_IP_FALLBACK}" > "$INSTALL_DIR/.allow_ip_fallback"

# Done!
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              INSTALLATION COMPLETE!                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Access your panel:${NC}"
echo -e "${CYAN}│${NC}  URL: ${GREEN}${PUBLIC_PANEL_URL}${NC}"
if [ -n "${IP_FALLBACK_URL}" ]; then
echo -e "${CYAN}│${NC}  ${YELLOW}IP fallback:${NC} ${GREEN}${IP_FALLBACK_URL}${NC}"
fi
if [ -n "${PUBLIC_SHARE_URL}" ]; then
echo -e "${CYAN}│${NC}  ${YELLOW}Public share URL:${NC} ${GREEN}${PUBLIC_SHARE_URL}${NC}"
fi
echo -e "${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Public origin:${NC} ${GREEN}${PUBLIC_ORIGIN}${NC}"
if [ -n "${PANEL_DOMAIN}" ]; then
echo -e "${CYAN}│${NC}  ${YELLOW}Domain:${NC} ${GREEN}${PANEL_DOMAIN}${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Allow IP fallback:${NC} ${GREEN}${ALLOW_IP_FALLBACK}${NC}"
fi
if [ -n "${PUBLIC_SHARE_DOMAIN}" ]; then
echo -e "${CYAN}│${NC}  ${YELLOW}Share host:${NC} ${GREEN}${PUBLIC_SHARE_DOMAIN}${NC}"
fi
echo -e "${CYAN}│${NC}  ${YELLOW}Internal app port:${NC} ${GREEN}${PANEL_PORT}${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Your panel path:${NC} ${GREEN}/${PANEL_PATH}/${NC}"
echo -e "${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}Initial login credentials:${NC}"
echo -e "${CYAN}│${NC}  Username: ${GREEN}${DEFAULT_ADMIN_USERNAME_INPUT}${NC}"
echo -e "${CYAN}│${NC}  Password: ${GREEN}${DEFAULT_ADMIN_PASSWORD_INPUT}${NC}"
echo -e "${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  ${RED}⚠ IMPORTANT: Change the password after first login!${NC}"
echo -e "${CYAN}│${NC}  ${RED}⚠ SAVE YOUR PANEL PATH - You need it to access the panel!${NC}"
echo -e "${CYAN}│${NC}  ${YELLOW}HTTPS:${NC} ${GREEN}${HTTPS_ENABLED}${NC}"
echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "${YELLOW}  HTTPS note:${NC} ${HTTPS_NOTE}"
echo ""
echo -e "${YELLOW}  Management:${NC}"
echo -e "  Run ${BLUE}atomic-ui${NC} to access the management menu"
echo -e "  Run ${BLUE}atomic-ui info${NC} to view panel URL and path"
echo ""
